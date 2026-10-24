#!/usr/bin/env python3
"""Local, deterministic Obsidian task reminders through an existing Feishu CLI profile."""
import argparse, collections, datetime as dt, fcntl, hashlib, json, os, re, signal, subprocess, sys
from pathlib import Path
from urllib.parse import urlencode
from zoneinfo import ZoneInfo
TZ = ZoneInfo('Asia/Shanghai')
DAILY = 'projects/个人工作台/日记/'
DATE = re.compile(r'(?:📅|⏳)\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?')

def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()

def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = path.with_suffix('.tmp')
    with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.flush(); os.fsync(f.fileno())
    os.replace(temp, path)

def read_tasks(vault, unavailable=None):
    tasks = []
    candidates = []
    for root in ('projects', 'wiki'):
        for folder, dirs, files in os.walk(vault / root):
            dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in {'node_modules', 'plugin', '__pycache__', 'venv', '设计预览'})
            candidates.extend(Path(folder) / n for n in files if n.endswith('.md'))
    for file in sorted(candidates):
            path = file.relative_to(vault).as_posix()
            if not file.resolve().is_relative_to(vault.resolve()) or '/设计预览/' in path or path.endswith('/设计说明.md') or '/plugin/' in path:
                continue
            previous = signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError()))
            try:
                signal.alarm(2)
                text = file.read_text(encoding='utf-8-sig')
            except (TimeoutError, OSError):
                if unavailable is not None: unavailable.append(path)
                continue
            finally:
                signal.alarm(0); signal.signal(signal.SIGALRM, previous)
            fence = None; front = False; occurrences = collections.Counter()
            for line, raw in enumerate(text.splitlines()):
                if line == 0 and raw == '---': front = True; continue
                if front:
                    if raw == '---': front = False
                    continue
                marker = re.match(r'^\s*(`{3,}|~{3,})', raw)
                if marker:
                    token = marker[1]
                    if fence is None: fence = token
                    elif token[0] == fence[0] and len(token) >= len(fence): fence = None
                    continue
                if fence: continue
                match = re.match(r'^\s*[-*+] \[([ xX])\]\s+(.*)', raw)
                if not match or match[1].lower() == 'x': continue
                body = match[2]; due = DATE.search(body); deadline = None
                if due:
                    try:
                        date = dt.date.fromisoformat(due[1])
                        if due[2]: deadline = dt.datetime.combine(date, dt.time.fromisoformat(due[2]), TZ)
                    except ValueError: continue
                identity = digest(path + '\n' + body)
                occurrences[identity] += 1
                tasks.append(dict(id=identity + '-' + str(occurrences[identity]), path=path, line=line,
                    text=body, due=due[1] if due else '', deadline=deadline,
                    today=bool(re.search(r'(?:^|\s)#(?:today|今日)(?:\s|$)', body))))
    return tasks

def plans(tasks, now, state, force=False):
    day = now.date().isoformat(); out = []
    today = [t for t in tasks if (t['due'] and t['due'] <= day) or t['today'] or t['path'] == DAILY + day + '.md']
    for kind, hour in [('morning', 9), ('evening', 18)]:
        # Catch a missed morning after wake, but never send both summaries after 18:00.
        if not force and ((kind == 'morning' and not 9 <= now.hour < 18) or (kind == 'evening' and now.hour < hour)):
            continue
        selected = today if kind == 'morning' else [t for t in tasks if t['due'] and t['due'] <= day]
        key = ('setup' if force else kind) + ':' + day
        if selected and key not in state['sent']:
            out.append((key, '任务提醒已启用 · 当前重点' if force else '今日重点' if kind == 'morning' else '到期未完成汇总', selected))
        if force: break
    for task in tasks:
        deadline = task['deadline']; key = 'deadline:' + task['id']
        if not force and deadline and dt.timedelta() < deadline - now <= dt.timedelta(hours=1) and key not in state['sent']:
            out.append((key, '一小时内到期', [task]))
    return out

def message(title, tasks, vault, now):
    lines = [title + ' · ' + now.strftime('%m-%d %H:%M'), '']
    for t in tasks[:30]:
        tag = '逾期' if t['due'] and t['due'] < now.date().isoformat() else '今天到期' if t['due'] == now.date().isoformat() else '今日重点'
        url = 'obsidian://open?' + urlencode({'vault': vault.name, 'file': t['path']})
        lines.extend(['• [' + tag + '] ' + t['text'][:500], '  ' + t['path'] + ':' + str(t['line'] + 1), '  ' + url])
    if len(tasks) > 30: lines.append('另有 %s 项，请在工作台查看。' % (len(tasks) - 30))
    lines.append('\n在 Obsidian 勾选完成后，后续检查会自动停止提醒。')
    return '\n'.join(lines)

def run(config, state_path, now, dry_run=False, force=False):
    vault = Path(config['vault']).expanduser().resolve()
    if not (vault / 'wiki/index.md').is_file(): raise RuntimeError('vault_unavailable')
    state = json.loads(state_path.read_text()) if state_path.exists() else {'sent': {}, 'pending': {}}
    state.setdefault('pending', {})
    tasks = None; unavailable = []
    if config.get('obsidian'):
        code = "(async()=>{if(app.vault.adapter.getBasePath()!==" + json.dumps(str(vault)) + ")throw Error('wrong vault');return JSON.stringify(await app.plugins.plugins['zhixing-research-desk'].getTasks());})()"
        try:
            running = subprocess.run(['/usr/bin/pgrep', '-x', 'Obsidian'], capture_output=True).returncode == 0
            if running:
                response = subprocess.run([config['obsidian'], 'vault='+vault.name, 'eval', 'code='+code], capture_output=True, text=True, timeout=15)
                rows = json.loads(response.stdout.split('=> ', 1)[-1])
                tasks = []
                counts = collections.Counter()
                for row in rows:
                    if row['done']: continue
                    body = row['raw']; identity = digest(row['path']+'\n'+body); counts[identity] += 1
                    due = DATE.search(body); deadline = None
                    if due and due[2]: deadline = dt.datetime.fromisoformat(due[1]+'T'+due[2]).replace(tzinfo=TZ)
                    tasks.append(dict(id=identity+'-'+str(counts[identity]), path=row['path'], line=row['line'], text=row['text'], due=row['due'], deadline=deadline, today=bool(re.search(r'(?:^|\s)#(?:today|今日)(?:\s|$)',body))))
        except (ValueError, KeyError, OSError, subprocess.TimeoutExpired):
            tasks = None
    if tasks is None: tasks = read_tasks(vault, unavailable)
    outgoing = plans(tasks, now, state, force)
    result = {'open_tasks': len(tasks), 'planned': len(outgoing), 'sent': 0, 'identity': 'bot', 'unavailable_files': len(unavailable)}
    if dry_run: return result
    for key, title, selected in outgoing:
        uuid = digest(str(vault) + ':' + key)[:40]
        pending = state['pending'].get(key)
        # CLI idempotency lasts one hour. Preserve uncertain old sends rather than duplicate.
        if pending and now.timestamp() - pending['started'] > 3500:
            raise RuntimeError('uncertain_delivery_requires_review')
        state['pending'][key] = pending or {'started': now.timestamp()}
        atomic(state_path, state)
        cmd = [config['cli'], '--profile', config['profile'], 'im', '+messages-send', '--as', 'bot',
            '--user-id', config['recipient'], '--text', message(title, selected, vault, now) + ('\n注意：有 %s 个本地文件暂不可读，本次未覆盖。' % len(unavailable) if unavailable else ''), '--idempotency-key', uuid]
        env = dict(os.environ, PATH=config['path'], LARKSUITE_CLI_NO_UPDATE_NOTIFIER='1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER='1')
        try: response = subprocess.run(cmd, capture_output=True, text=True, timeout=45, env=env)
        except subprocess.TimeoutExpired: raise RuntimeError('delivery_timeout')
        try: data = json.loads(response.stdout if response.returncode == 0 else response.stderr)
        except (ValueError, TypeError): raise RuntimeError('cli_invalid_response')
        if response.returncode or data.get('ok') is not True:
            # Do not log payloads, tokens, authorization links, or task text.
            state['pending'].pop(key, None); atomic(state_path, state)
            raise RuntimeError('feishu_delivery_failed:' + str(data.get('error', {}).get('code', response.returncode)))
        state['sent'][key] = {'at': now.isoformat(), 'message_id': data.get('data', {}).get('message_id')}
        state['pending'].pop(key, None); atomic(state_path, state); result['sent'] += 1
    state['last_check'] = now.isoformat(); state['last_result'] = result; state.pop('last_error', None)
    atomic(state_path, state)
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True); parser.add_argument('--dry-run', action='store_true'); parser.add_argument('--send-current', action='store_true')
    args = parser.parse_args(); config_path = Path(args.config).expanduser()
    config = json.loads(config_path.read_text()); state_path = config_path.with_name('state.json')
    lock_path = config_path.with_name('run.lock')
    with os.fdopen(os.open(lock_path, os.O_WRONLY | os.O_CREAT, 0o600), 'w') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: return
        now = dt.datetime.now(TZ)
        try: print(json.dumps(run(config, state_path, now, args.dry_run, args.send_current)))
        except Exception as error:
            state = json.loads(state_path.read_text()) if state_path.exists() else {'sent': {}, 'pending': {}}
            state['last_error'] = {'at': now.isoformat(), 'reason': str(error) if isinstance(error, RuntimeError) else type(error).__name__}
            atomic(state_path, state)
            print(json.dumps({'ok': False, 'error': state['last_error']['reason']})); sys.exit(1)
if __name__ == '__main__': main()
