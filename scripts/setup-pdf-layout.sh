#!/bin/sh
# User-local, reproducible PDF2zh runtime. No system Python changes.
set -eu
runtime="$HOME/.local/share/zhixing-pdf2zh/venv"
if [ ! -x "$runtime/bin/python" ]; then uv venv --python 3.12 "$runtime"; fi
uv pip install --python "$runtime/bin/python" 'pdf2zh-next==2.9.0' 'babeldoc==0.6.2' 'bitstring==4.4.0'
"$runtime/bin/python" -c 'from babeldoc.assets.assets import warmup; warmup()'
