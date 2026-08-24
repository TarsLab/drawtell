/**
 * 种子例题 3:铅笔比多少(实物图模型 · 比多少变体,paper-strict)。
 * 来自架构干跑(2026-08-11):验证虚线动画与外部工作区流程。
 * 骨架:分行对齐 → 虚线一一对应 → 圈出没对上的数一遍。
 * 词汇:分行、虚线(一一对应)、圈起来。
 */

import type { ChalkScene, ChalkSkeleton } from '../src/player';

const INK = '#1e1e1e';
const MARK = '#e03131';

/** 一行铅笔:竖长矩形,x0 起步、等距摆 */
function pencils(prefix: string, count: number, x0: number, y: number): ChalkSkeleton[] {
  return Array.from({ length: count }, (_, k) => ({
    type: 'rectangle',
    id: `${prefix}-${k + 1}`,
    animateDuration: 240,
    x: x0 + k * 56,
    y,
    width: 14,
    height: 48,
    strokeColor: INK,
  }));
}

const X0 = 160;

// 步 1:小华的 7 支
const s1: ChalkSkeleton[] = [
  { type: 'text', id: 'hua-label', animateDuration: 450, x: 64, y: 64, text: '小华', fontSize: 20, strokeColor: INK },
  ...pencils('hua', 7, X0, 52),
];
// 步 2:小丽的 4 支,另起一行、和上行对齐(比多少要对齐了才好比)
const s2: ChalkSkeleton[] = [
  { type: 'text', id: 'li-label', animateDuration: 450, x: 64, y: 176, text: '小丽', fontSize: 20, strokeColor: INK },
  ...pencils('li', 4, X0, 164),
];
// 步 3:虚线一一对应,小丽的 4 支对上小华的前 4 支
const s3: ChalkSkeleton[] = Array.from({ length: 4 }, (_, k) => ({
  type: 'line',
  id: `pair-${k + 1}`,
  animateDuration: 300,
  x: X0 + 7 + k * 56,
  y: 104,
  points: [[0, 0], [0, 56]] as [number, number][],
  strokeColor: INK,
  strokeStyle: 'dashed',
}));
// 步 4:圈出没对上的 3 支,写答案
const s4: ChalkSkeleton[] = [
  // 圈要留足边:椭圆两端垂直空间收窄,尺寸按边缘铅笔的完整包含来算(干跑第一版穿帮返工点)
  { type: 'ellipse', id: 'ring-extra', animateDuration: 900, x: 363, y: 29, width: 170, height: 94, strokeColor: MARK },
  { type: 'text', id: 'ans', animateDuration: 800, x: 340, y: 248, text: '小华比小丽多 3 支', fontSize: 22, strokeColor: MARK },
];

const ids = (els: ChalkSkeleton[]) => els.map((e) => e.id);

export const bimoduo: ChalkScene = {
  id: 'bimoduo',
  title: '铅笔比多少',
  problem: '小华有 7 支铅笔,小丽有 4 支铅笔,小华比小丽多几支?',
  model: '实物图',
  template: 'paper-strict',
  subject: '数学',
  skeletons: [...s1, ...s2, ...s3, ...s4],
  steps: [
    { step: 1, elementIds: ids(s1), line: '小华有 7 支铅笔。画出来,一边画一边数:1、2……7。', pauseAfter: true },
    { step: 2, elementIds: ids(s2), line: '小丽有 4 支。画在下面一行,和小华的对齐——比多少,对齐了才好比。', pauseAfter: true },
    { step: 3, elementIds: ids(s3), line: '一支对一支,用虚线连起来。小丽的 4 支,刚好对上小华的前 4 支。', pauseAfter: true },
    { step: 4, elementIds: ids(s4), line: '没对上的就是多出来的——圈起来,数一数:1、2、3。小华比小丽多 3 支。', pauseAfter: true },
  ],
};
