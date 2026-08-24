/**
 * 种子例题 2:足球(实物图模型,paper-strict)。
 * 词汇全用上:分行(隔离干扰项)、划掉(=减)、连箭头、添画、圈起来。
 */

import type { ChalkScene, ChalkSkeleton, ChalkStep } from '../src/player';

const INK = '#1e1e1e';
const MARK = '#e03131';
const CROSS = '#e8590c';

/** 小人:头 + 身 + 两腿 + 名字,5 个元素 */
function person(prefix: string, x: number, name: string): ChalkSkeleton[] {
  return [
    { type: 'ellipse', id: `${prefix}-head`, animateDuration: 350, x, y: 64, width: 26, height: 26, strokeColor: INK },
    { type: 'line', id: `${prefix}-body`, animateDuration: 250, x: x + 13, y: 90, points: [[0, 0], [0, 32]], strokeColor: INK },
    { type: 'line', id: `${prefix}-legl`, animateDuration: 200, x: x + 13, y: 122, points: [[0, 0], [-10, 18]], strokeColor: INK },
    { type: 'line', id: `${prefix}-legr`, animateDuration: 200, x: x + 13, y: 122, points: [[0, 0], [10, 18]], strokeColor: INK },
    { type: 'text', id: `${prefix}-name`, animateDuration: 450, x: x - 6, y: 146, text: name, fontSize: 18, strokeColor: INK },
  ];
}

function balls(prefix: string, from: number, count: number, x0: number, gap: number, y: number, size: number): ChalkSkeleton[] {
  return Array.from({ length: count }, (_, k) => ({
    type: 'ellipse',
    id: `${prefix}-${from + k}`,
    animateDuration: 240,
    x: x0 + (from + k - 1) * gap,
    y,
    width: size,
    height: size,
    strokeColor: INK,
  }));
}

const ids = (els: ChalkSkeleton[]) => els.map((e) => e.id);

// 步 1:小明 + 足球一行 9 个
const s1 = [
  ...person('xm', 74, '小明'),
  { type: 'text', id: 'rowfb', animateDuration: 450, x: 160, y: 82, text: '足球', fontSize: 18, strokeColor: INK } as ChalkSkeleton,
  ...balls('fb', 1, 9, 160, 48, 112, 34),
];
// 步 2:篮球另起一行 8 个(分行 = 隔离干扰项)
const s2 = [
  { type: 'text', id: 'rowbb', animateDuration: 450, x: 160, y: 194, text: '篮球', fontSize: 18, strokeColor: INK } as ChalkSkeleton,
  ...balls('bb', 1, 8, 160, 40, 224, 30),
];
// 步 3:小红 + 划掉 5 个足球 + 箭头指向小红
const s3 = [
  ...person('xh', 652, '小红'),
  ...Array.from({ length: 5 }, (_, k): ChalkSkeleton => ({
    type: 'line',
    id: `cross-${k + 1}`,
    animateDuration: 220,
    x: 349 + k * 48,
    y: 109,
    points: [[0, 0], [40, 40]],
    strokeColor: CROSS,
  })),
  { type: 'arrow', id: 'give', animateDuration: 600, x: 582, y: 120, points: [[0, 0], [62, -20]], strokeColor: CROSS } as ChalkSkeleton,
];
// 步 4:小红回送 6 个篮球,添画进篮球行
const s4 = [
  ...balls('bb', 9, 6, 160, 40, 224, 30),
  { type: 'arrow', id: 'back', animateDuration: 600, x: 674, y: 152, points: [[0, 0], [26, 62]], strokeColor: INK } as ChalkSkeleton,
];
// 步 5:圈出没划掉的足球,数出 4 个
const s5: ChalkSkeleton[] = [
  { type: 'ellipse', id: 'ringleft', animateDuration: 900, x: 148, y: 100, width: 200, height: 58, strokeColor: MARK },
  { type: 'text', id: 'ans4', animateDuration: 800, x: 200, y: 282, text: '小明还有 4 个足球', fontSize: 24, strokeColor: MARK },
];

const steps: ChalkStep[] = [
  { step: 1, elementIds: ids(s1), line: '小明买了 9 个足球。画小明,再画 9 个球,一边画一边数:1、2……9。', pauseAfter: true },
  { step: 2, elementIds: ids(s2), line: '他还买了 8 个篮球。篮球是另一样东西,画在另外一行,不跟足球挤在一起。', pauseAfter: true },
  { step: 3, elementIds: ids(s3), line: '小明送给小红 5 个足球。送出去的就不是他的了——划掉 5 个,箭头指向小红。', pauseAfter: true },
  { step: 4, elementIds: ids(s4), line: '小红回送 6 个篮球。篮球进篮球那一行——足球这行一个也没多。', pauseAfter: true },
  { step: 5, elementIds: ids(s5), line: '题目问:小明有几个足球?数没划掉的:1、2、3、4。小明还有 4 个足球。', pauseAfter: true },
];

export const zuqiu: ChalkScene = {
  id: 'zuqiu',
  title: '足球',
  problem: '小明买了 9 个足球、8 个篮球,送给小红 5 个足球,小红送给他 6 个篮球。小明现在有几个足球?',
  model: '实物图',
  template: 'paper-strict',
  subject: '数学',
  skeletons: [...s1, ...s2, ...s3, ...s4, ...s5],
  steps,
};
