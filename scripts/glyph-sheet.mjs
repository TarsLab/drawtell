/**
 * 字形包目验:生成「26 个字母 + 四线三格」的字母表场景并截图。
 * 字形数值是手写的,几何断言(tests/letters.test.ts)挡得住越界与断笔,
 * 挡不住"不好看";改完字形跑一下这个,拿 snaps/glyphs/step-1.png 对眼睛。
 *
 *   node --experimental-strip-types scripts/glyph-sheet.mjs [词|caps]
 *
 * 不给参数 = 小写字母表;caps = 大写字母表;给词(如 ram / Apple)= 该词的逐笔演示。
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { GLYPHS, GUIDES, wordSkeletons, wordAdvance } from '../src/glyphs/index.ts';

const arg = process.argv[2];
const CAPS_MODE = arg === 'caps';
const word = CAPS_MODE ? null : arg;
const XH = word ? 120 : 60;
const TMP = 'scenes/.glyph-sheet.ts';
const els = [];
const gridOf = (baseline, x, w, tag) =>
  Object.entries(GUIDES).map(([name, u]) => ({
    type: 'line', id: `grid-${tag}-${name}`, animateDuration: 100,
    x, y: baseline + u * XH, points: [[0, 0], [w, 0]],
    strokeColor: name === 'base' ? '#b0a89a' : '#ded7c9', strokeWidth: 1,
  }));

let steps;
if (word) {
  const w = wordAdvance(word, { xHeight: XH });
  const grid = gridOf(300, 40, w + 80, 'w');
  const letters = wordSkeletons(word, { xHeight: XH, x: 80, y: 300, msPerUnit: 260 });
  els.push(...grid, ...letters);
  steps = [
    { step: 1, elementIds: grid.map((e) => e.id), line: '先把四线三格摆好。', pauseAfter: false },
    { step: 2, elementIds: letters.map((e) => e.id), line: `${[...word].join('、')},一笔一笔写。`, pauseAfter: false },
  ];
} else {
  const PER_ROW = CAPS_MODE ? 6 : 7, GAP = 0.55;
  const rows = [];
  const all = [...(CAPS_MODE ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : 'abcdefghijklmnopqrstuvwxyz')];
  for (let i = 0; i < all.length; i += PER_ROW) rows.push(all.slice(i, i + PER_ROW));
  rows.forEach((row, r) => {
    const baseline = 160 + r * 300;
    const rowW = row.reduce((w, ch, i) => w + GLYPHS.get(ch).advance * XH + (i ? GAP * XH : 0), 0) + 40;
    els.push(...gridOf(baseline, 40, rowW, `r${r}`));
    let cursor = 60;
    for (const ch of row) {
      els.push(...wordSkeletons(ch, { xHeight: XH, x: cursor, y: baseline, idPrefix: `L${r}` }));
      cursor += (GLYPHS.get(ch).advance + GAP) * XH;
    }
  });
  steps = [{ step: 1, elementIds: els.map((e) => e.id),
    line: CAPS_MODE ? '26 个大写字母,按笔顺各写一遍。' : '26 个小写字母,按笔顺各写一遍。', pauseAfter: false }];
}

const scene = {
  id: word ? `glyph-${word}` : CAPS_MODE ? 'glyph-caps' : 'glyph-sheet',
  title: word ? `${word} 的笔顺` : CAPS_MODE ? '大写字母笔顺总览' : '小写字母笔顺总览',
  problem: word ? `看清楚 ${word} 每个字母怎么写`
    : `26 个${CAPS_MODE ? '大' : '小'}写字母的笔顺与四线三格对位`,
  model: '实物图-增减',
  template: 'paper-strict',
  skeletons: els,
  steps,
};

await writeFile(TMP,
  `/** 自动生成(scripts/glyph-sheet.mjs),勿手改。 */\nimport type { ChalkScene } from '../src/player';\n\nexport const scene: ChalkScene = ${JSON.stringify(scene, null, 2)} as unknown as ChalkScene;\n`);

const { main } = await import('../src/cli/main.ts');
const out = `snaps/glyphs${word ? `-${word}` : CAPS_MODE ? '-caps' : ''}`;
await mkdir(out, { recursive: true });
try {
  await main(['snap', TMP, '--out', out, '--no-cursor']);
} finally {
  await rm(TMP, { force: true });
}
console.log(`字形目验图 → ${out}/`);
