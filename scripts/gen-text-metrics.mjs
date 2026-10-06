/**
 * 生成 src/core/text-metrics.ts:excalidraw 的手写字体(Excalifont + Xiaolai)里每个字有多宽(按字号 1 算)。
 * 为什么:浏览器外(build、check、应用的服务端)也要知道一行字占多大——圈住了哪几个字、布局查重叠、缩略图对位。
 * 怎么量:用真播放器量(和孩子看到的同一个渲染器):一个字一个 text 元素(同一个字连写 10 遍,字号 100),
 * 临时 build 成课包,起 serve,playwright 打开播放页定格在最后,读每个元素的 <g transform="… rotate(0 W/2 H/2)"> 得宽。
 * excalidraw 升级、换字体后重跑:node scripts/gen-text-metrics.mjs(要先 pnpm build 出播放页;要 playwright)。
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle } from '../src/cli/build.ts';
import { startServer } from '../src/cli/serve.ts';

const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const SYMBOLS = [...'−×÷±→←↑↓·°²³√≈≠≤≥…—–○●□■△▲☆★✓✗①②③④⑤⑥⑦⑧⑨⑩'];
const CJK_PUNCT = [...',。、:;?!「」『』()《》“”‘’…—~'];
const CJK_SAMPLE = [...'的一是不了人我在有他这中大来上个国到说们为子和你地出道也时年小么心多天十三两长分根捆拆散剩加减等于'];
const SIZE = 100;
const REPEAT = 10;

const chars = [...new Set([...ASCII, ...SYMBOLS, ...CJK_PUNCT, ...CJK_SAMPLE])];
// 空格单测量不出(行尾空白不算宽):两头夹 x,减去「xx」
const probes = chars.map((ch, i) => ({ ch, id: `c${i}`, text: ch === ' ' ? `x${' '.repeat(REPEAT)}x` : ch.repeat(REPEAT) }));
const xx = { ch: 'xx', id: 'xx', text: 'xx' };
const all = [...probes, xx];
const skeletons = all.map((p, i) => ({ type: 'text', id: p.id, x: (i % 4) * 1800, y: Math.floor(i / 4) * 160, text: p.text, fontSize: SIZE, strokeColor: '#1e1e1e', animateDuration: 1 }));
const scene = { id: 'text-metrics', title: '字宽', problem: '量字宽', model: 'metrics', template: 'paper-strict', skeletons, steps: [{ step: 1, elementIds: skeletons.map((e) => e.id), line: '量', pauseAfter: false }] };

const tmp = await mkdtemp(join(tmpdir(), 'drawtell-metrics-'));
const { chromium } = await import('playwright');
const server = await startServer({ port: 0, bundlesDir: tmp });
const browser = await chromium.launch();
try {
  await buildBundle(scene, join(tmp, scene.id));
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.port}/?scene=${scene.id}&step=1&bare=1&cursor=0`);
  await page.waitForFunction(`document.body.dataset.drawtellReady === '1'`, null, { timeout: 120_000 });
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.chalk-stage svg > g')].map((g) => {
    const m = /rotate\(0 ([\d.]+) ([\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
    return m ? [Number(m[1]) * 2, Number(m[2]) * 2] : null;
  }));
  if (sizes.length !== all.length || sizes.some((s) => !s)) throw new Error(`量到 ${sizes.length} 个,要 ${all.length} 个`);
  const xxW = sizes[all.length - 1][0];
  const lineHeight = sizes[0][1] / SIZE;
  const width = {};
  probes.forEach((p, i) => { width[p.ch] = Math.round(((p.ch === ' ' ? sizes[i][0] - xxW : sizes[i][0]) / REPEAT / SIZE) * 1000) / 1000; });
  const cjk = CJK_SAMPLE.map((ch) => width[ch]);
  const cjkEm = Math.round((cjk.reduce((a, b) => a + b, 0) / cjk.length) * 1000) / 1000;
  const spread = Math.max(...cjk) - Math.min(...cjk);
  for (const ch of CJK_SAMPLE) delete width[ch];
  const out = `/**
 * 机器生成(scripts/gen-text-metrics.mjs),别手改:excalidraw 手写字体里每个字的宽(字号 1),用真播放器量的。
 * 表里没有的:CJK 统一表意文字按 CJK_EM(量了 ${cjk.length} 个常用字取平均,最宽最窄差 ${spread.toFixed(3)}),其余按 FALLBACK_EM。
 */
export const LINE_HEIGHT = ${Math.round(lineHeight * 1000) / 1000};
export const CJK_EM = ${cjkEm};
export const FALLBACK_EM = 0.55;
export const CHAR_EM: Readonly<Record<string, number>> = ${JSON.stringify(width, null, 2)};
`;
  await writeFile(fileURLToPath(new URL('../src/core/text-metrics.ts', import.meta.url)), out);
  console.log(`text-metrics: ${Object.keys(width).length} 个字,行高 ${lineHeight},汉字 ${cjkEm}(差 ${spread.toFixed(3)})`);
} finally {
  await browser.close();
  await server.close();
  await rm(tmp, { recursive: true, force: true });
}
