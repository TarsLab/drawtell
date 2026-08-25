/**
 * note 回归:课包 → 档案段(markdown 到 stdout,由调用方 append 进日记)+ 终帧拷进
 * paths.attachments 角色目录(固定名覆盖)。
 * 覆盖:首跑(段落形状 + 图拷贝);重跑覆盖同名图;缺终帧 → NotFoundError(指向 snap);
 * 缺课包 → NotFoundError(指向 build);.ts 输入只取 id 定位课包;ls 验收列改读工作区根 reviews.json。
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkspace } from '../src/cli/workspace.ts';
import { NotFoundError } from '../src/cli/load-scene.ts';
import { noteBundle } from '../src/cli/note.ts';
import { listWorkspace } from '../src/cli/ls.ts';

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL ${name}: ${detail}`);
  }
}

const root = mkdtempSync(join(tmpdir(), 'drawtell-note-'));
try {
  // ---- 假工作区:drawtell.json 把 attachments 指到「vault」里的中文目录(角色映射即契约)----
  const ws = join(root, 'ws');
  mkdirSync(ws);
  writeFileSync(join(ws, 'drawtell.json'), JSON.stringify({ paths: { attachments: 'vault/附件' } }));

  // 假课包:scene.json + manifest.json(过 readBundle 的 schema 校验)
  const bundleDir = join(ws, 'bundles', 'demo');
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(
    join(bundleDir, 'scene.json'),
    JSON.stringify({
      schema: 'chalk-scene',
      version: 1,
      id: 'demo',
      title: '三加四',
      problem: '3 + 4 = ?',
      model: 'count-all',
      template: 'camera-free',
      subject: '数学',
      skeletons: [{ type: 'text', id: 't1', x: 0, y: 0, text: '3 + 4', fontSize: 28 }],
    }),
  );
  writeFileSync(
    join(bundleDir, 'manifest.json'),
    JSON.stringify({
      schema: 'lesson-manifest',
      version: 2,
      steps: [
        { step: 1, elementIds: ['t1'], line: '先写下 3 加 4', pauseAfter: false },
        { step: 2, elementIds: ['t1'], line: '数一数,一共 7 个', pauseAfter: true },
      ],
    }),
  );
  // 假终帧:2 步 → step-2.png
  mkdirSync(join(ws, 'snaps', 'demo'), { recursive: true });
  writeFileSync(join(ws, 'snaps', 'demo', 'step-2.png'), 'PNG-FINAL-V1');

  const wsr = await loadWorkspace(ws);
  const dirs = { bundlesDir: wsr.paths.bundles, snapsDir: wsr.paths.snaps, attachmentsDir: wsr.paths.attachments };
  check('paths.attachments 角色映射生效', wsr.paths.attachments === join(ws, 'vault/附件'), wsr.paths.attachments);

  // ---- 首跑:档案段 + 图拷贝 ----
  const r1 = await noteBundle({ file: 'demo', ...dirs });
  check('返回终帧路径(attachments 固定名)', r1.image === join(ws, 'vault/附件', 'demo-final.png'), r1.image);
  check('返回步数', r1.steps === 2, String(r1.steps));
  check('终帧已拷贝(mkdir -p)', readFileSync(r1.image, 'utf8') === 'PNG-FINAL-V1');
  const expected = ['### 三加四(demo)', '', '3 + 4 = ?', '', '![[demo-final.png]]', '', '1. 先写下 3 加 4', '2. 数一数,一共 7 个'].join('\n');
  check('档案段形状:标题+题面+wikilink+每步讲稿', r1.markdown === expected, JSON.stringify(r1.markdown));

  // ---- 重跑:固定名覆盖同名图,wikilink 不断 ----
  writeFileSync(join(ws, 'snaps', 'demo', 'step-2.png'), 'PNG-FINAL-V2');
  const r2 = await noteBundle({ file: 'demo', ...dirs });
  check('重跑覆盖同名图', readFileSync(r2.image, 'utf8') === 'PNG-FINAL-V2');
  check('重跑段落一致(幂等)', r2.markdown === expected);

  // ---- 缺终帧 → NotFoundError,指向 snap ----
  const bundle2 = join(ws, 'bundles', 'nosnap');
  mkdirSync(bundle2, { recursive: true });
  writeFileSync(join(bundle2, 'scene.json'), JSON.stringify({ schema: 'chalk-scene', version: 1, id: 'nosnap', title: 'x', problem: 'x', model: 'm', template: 'camera-free', skeletons: [{ type: 'text', id: 't1', x: 0, y: 0, text: 'x', fontSize: 28 }] }));
  writeFileSync(join(bundle2, 'manifest.json'), JSON.stringify({ schema: 'lesson-manifest', version: 2, steps: [{ step: 1, elementIds: ['t1'], line: 'x', pauseAfter: false }] }));
  try {
    await noteBundle({ file: 'nosnap', ...dirs });
    check('缺终帧 → 抛 NotFoundError', false, '没有抛错');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check('缺终帧 → 抛 NotFoundError', err instanceof NotFoundError, `${(err as Error).constructor?.name}: ${msg}`);
    check('缺终帧错误指向 snap --no-cursor', msg.includes('drawtell snap nosnap --no-cursor'), msg);
  }

  // ---- 缺课包 → NotFoundError,指向 build ----
  try {
    await noteBundle({ file: 'nope', ...dirs });
    check('缺课包 → 抛 NotFoundError', false, '没有抛错');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check('缺课包 → 抛 NotFoundError', err instanceof NotFoundError, `${(err as Error).constructor?.name}: ${msg}`);
    check('缺课包错误指向 build', msg.includes('drawtell build'), msg);
  }

  // ---- .ts 输入:只取 id 定位课包 ----
  const tsFile = join(root, 'demo-src.ts');
  writeFileSync(tsFile, "export default { id: 'demo', skeletons: [], steps: [] };\n");
  const r4 = await noteBundle({ file: tsFile, ...dirs });
  check('.ts 输入解析到课包 id', r4.scene === 'demo' && r4.steps === 2, `${r4.scene} ${r4.steps}`);

  // ---- ls 的验收列:工作区根 reviews.json(机器 JSON)----
  const rowsNone = await listWorkspace(wsr);
  check('无 reviews.json → 全部未验收', rowsNone.every((r) => r.review === 'none'), JSON.stringify(rowsNone.map((r) => [r.id, r.review])));
  const manifestBytes = readFileSync(join(bundleDir, 'manifest.json'));
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(manifestBytes).digest('hex').slice(0, 16);
  writeFileSync(
    join(ws, 'reviews.json'),
    JSON.stringify({ demo: { verdict: '通过', manifestHash: hash, date: '2026-08-25' }, nosnap: { verdict: '通过', manifestHash: 'deadbeefdeadbeef', date: '2026-08-25' } }),
  );
  const rows = await listWorkspace(wsr);
  const demo = rows.find((r) => r.id === 'demo');
  const nosnap = rows.find((r) => r.id === 'nosnap');
  check('hash 匹配 → 验收 valid', demo?.review === 'valid', String(demo?.review));
  check('hash 不匹配 → 验收 stale(课包改过自动失效)', nosnap?.review === 'stale', String(nosnap?.review));
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`${passed} 通过, ${failed} 失败`);
if (failed) process.exit(1);
