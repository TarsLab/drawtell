/**
 * 种子例题 1:等车(时间数轴模型,paper-strict)。
 * 正式内容管线在 5-product/fenbi/(M4),这里是打磨台样例。
 * 词汇:画轴、标点、添画、圈起来。
 */

import type { ChalkScene } from '../src/player';

const INK = '#1e1e1e';
const MARK = '#e03131';

export const dengche: ChalkScene = {
  id: 'dengche',
  title: '等车',
  problem: '汽车每 15 分钟一班,哥哥想乘 9:10 的班车,到车站时已经 9:20,他要等几分钟?',
  model: '时间数轴',
  template: 'paper-strict',
  skeletons: [
    // 步 1:时间轴 + 9:10
    { type: 'arrow', id: 'axis-animateDuration:1400', x: 60, y: 240, points: [[0, 0], [640, 0]], strokeColor: INK },
    { type: 'line', id: 'tick910-animateDuration:250', x: 150, y: 232, points: [[0, 0], [0, 16]], strokeColor: INK },
    { type: 'text', id: 'label910-animateDuration:450', x: 128, y: 256, text: '9:10', fontSize: 20, strokeColor: INK },
    // 步 2:9:20 到站 + 哥哥
    { type: 'line', id: 'tick920-animateDuration:250', x: 390, y: 232, points: [[0, 0], [0, 16]], strokeColor: INK },
    { type: 'text', id: 'label920-animateDuration:450', x: 368, y: 256, text: '9:20', fontSize: 20, strokeColor: INK },
    { type: 'ellipse', id: 'gg-head-animateDuration:350', x: 378, y: 158, width: 24, height: 24, strokeColor: INK },
    { type: 'line', id: 'gg-body-animateDuration:250', x: 390, y: 182, points: [[0, 0], [0, 28]], strokeColor: INK },
    { type: 'line', id: 'gg-legl-animateDuration:200', x: 390, y: 210, points: [[0, 0], [-10, 16]], strokeColor: INK },
    { type: 'line', id: 'gg-legr-animateDuration:200', x: 390, y: 210, points: [[0, 0], [10, 16]], strokeColor: INK },
    // 步 3:下一班 9:25 添画
    { type: 'line', id: 'tick925-animateDuration:250', x: 510, y: 232, points: [[0, 0], [0, 16]], strokeColor: INK },
    { type: 'text', id: 'label925-animateDuration:450', x: 488, y: 256, text: '9:25', fontSize: 20, strokeColor: INK },
    { type: 'rectangle', id: 'bus-body-animateDuration:600', x: 484, y: 168, width: 52, height: 30, strokeColor: INK },
    { type: 'ellipse', id: 'bus-wheell-animateDuration:250', x: 490, y: 196, width: 12, height: 12, strokeColor: INK },
    { type: 'ellipse', id: 'bus-wheelr-animateDuration:250', x: 518, y: 196, width: 12, height: 12, strokeColor: INK },
    // 步 4:圈出 9:20→9:25,数出 5 分钟
    { type: 'ellipse', id: 'ring2025-animateDuration:900', x: 362, y: 222, width: 176, height: 64, strokeColor: MARK },
    { type: 'text', id: 'ans5min-animateDuration:700', x: 398, y: 296, text: '等 5 分钟', fontSize: 22, strokeColor: MARK },
  ],
  steps: [
    {
      step: 1,
      elementIds: ['axis-animateDuration:1400', 'tick910-animateDuration:250', 'label910-animateDuration:450'],
      line: '哥哥想坐 9:10 的班车。先画一条时间轴,把 9:10 标上去。',
      pauseAfter: true,
    },
    {
      step: 2,
      elementIds: [
        'tick920-animateDuration:250',
        'label920-animateDuration:450',
        'gg-head-animateDuration:350',
        'gg-body-animateDuration:250',
        'gg-legl-animateDuration:200',
        'gg-legr-animateDuration:200',
      ],
      line: '哥哥 9:20 才到车站——把 9:20 也画到轴上。9:10 的车早就开走了。',
      pauseAfter: true,
    },
    {
      step: 3,
      elementIds: [
        'tick925-animateDuration:250',
        'label925-animateDuration:450',
        'bus-body-animateDuration:600',
        'bus-wheell-animateDuration:250',
        'bus-wheelr-animateDuration:250',
      ],
      line: '汽车每 15 分钟一班,9:10 过 15 分钟是 9:25。下一班添画在这里。',
      pauseAfter: true,
    },
    {
      step: 4,
      elementIds: ['ring2025-animateDuration:900', 'ans5min-animateDuration:700'],
      line: '哥哥 9:20 到,等 9:25 那班。圈出这一段,从 20 数到 25——要等 5 分钟。',
      pauseAfter: true,
    },
  ],
};
