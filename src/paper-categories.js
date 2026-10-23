'use strict';
const CATEGORIES=['Ego 手部重建','Ego 人类数据','数据处理与治理','数据采集','VLA','世界模型','机器人工程','Agent','其他'];
function classify(title){const s=String(title).toLowerCase();if(/hand.*(recon|motion|forecast)|dyn-hamr|hawor/.test(s))return CATEGORIES[0];if(/governance|curation|data quality|data processing/.test(s))return CATEGORIES[2];if(/umi|collection|egokit|forceband/.test(s))return CATEGORIES[3];if(/ego|human.*(data|video)|everyday human/.test(s))return CATEGORIES[1];if(/world.model/.test(s))return '世界模型';if(/vla|foundation model|robotmanip|robomanip|foundation to application/.test(s))return 'VLA';return '其他';}
module.exports={CATEGORIES,classify};
