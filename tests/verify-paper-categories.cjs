'use strict';
const assert=require('node:assert/strict'),{classify,normalizeCategory,CATEGORIES}=require('../src/paper-categories');
for(const title of ['V-JEPA Hand: Simple, Accurate and Fast 3D Hand and Camera Trajectory Recovery from Egocentric Videos','DewHand: Direct Metric World-Space Hand Motion Reconstruction from Egocentric Videos','Uni-Hand: Universal Hand Motion Forecasting in Egocentric Views','HaWoR: World-Space Hand Motion Reconstruction'])assert.equal(classify(title),'手部感知与运动恢复');
for(const title of ['Ego4D: Around the World in 3,000 Hours of Egocentric Video','ACE-Ego-0: Unifying Egocentric Human and Robotic Data for VLA Pretraining'])assert.equal(classify(title),'人类数据与机器人学习');
assert.equal(normalizeCategory('Ego 手部重建'),CATEGORIES[0]);assert.equal(normalizeCategory('Ego 人类数据'),CATEGORIES[1]);assert.equal(normalizeCategory('我的自定义分类'),'我的自定义分类');assert.equal(normalizeCategory(null),'');
console.log('PASS: 10 paper category boundaries, recovery synonyms and legacy alias checks');
