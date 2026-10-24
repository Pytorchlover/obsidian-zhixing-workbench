'use strict';
const CATEGORIES=['手部感知与运动恢复','人类数据与机器人学习','数据处理与治理','数据采集','VLA','世界模型','机器人工程','Agent','其他'];
function classify(title){const s=String(title).toLowerCase();if(/hand.*(recon|motion|forecast|recover|trajector|pose|tracking)|dyn-hamr|hawor/.test(s))return CATEGORIES[0];if(/governance|curation|data quality|data processing/.test(s))return CATEGORIES[2];if(/umi|collection|egokit|forceband/.test(s))return CATEGORIES[3];if(/ego|human.*(data|video)|everyday human/.test(s))return CATEGORIES[1];if(/world.model/.test(s))return '世界模型';if(/vla|foundation model|robotmanip|robomanip|foundation to application/.test(s))return 'VLA';return '其他';}
const ALIASES={'Ego 手部重建':CATEGORIES[0],'Ego 人类数据':CATEGORIES[1]};
const normalizeCategory=value=>ALIASES[value]||value||'';
module.exports={CATEGORIES,classify,normalizeCategory};
