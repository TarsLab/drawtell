/**
 * init / doctor 回归。init 的铁律:幂等补缺,已有文件一律不动(政策文件尤其不覆盖);
 * doctor 的职责:静默失败摆到明面——配置损坏、角色指向踩空、骨架缺失都要报,且附修复指引。
 * HOME 注入手法同 workspace.test.ts(先设 HOME 再动态 import)。
 */
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL ${name}: ${detail}`);
  }
}

const home = realpathSync(mkdtempSync(join(tmpdir(), 'drawtell-initdoc-home-')));
const originalCwd = process.cwd();
process.env.HOME = home;

const { initWorkspace } = await import('../src/cli/init.ts');
const { doctorWorkspace } = await import('../src/cli/doctor.ts');

try {
  // ---- init:从零建骨架 ----
  const ws = join(home, 'ws');
  const r1 = await initWorkspace(ws);
  check('init 建根', existsSync(ws));
  check(
    '骨架目录齐(core + family)',
    ['scenes', 'problems', 'captures', 'homework', 'tools', 'books'].every((d) => existsSync(join(ws, d))),
  );
  check('.gitkeep 占位,books/ 除外(整目录不入库)', existsSync(join(ws, 'scenes', '.gitkeep')) && !existsSync(join(ws, 'books', '.gitkeep')));
  check('drawtell.json 模板可解析', (JSON.parse(readFileSync(join(ws, 'drawtell.json'), 'utf8')) as { title?: string }).title === 'drawtell');
  check('.gitignore 兜底派生物', readFileSync(join(ws, '.gitignore'), 'utf8').includes('bundles/'));
  const userCfg = join(home, '.config', 'drawtell', 'config.json');
  check('用户配置指过来', (JSON.parse(readFileSync(userCfg, 'utf8')) as { workspace?: string }).workspace === ws);
  check('首跑全部 created', r1.steps.every((s) => s.action === 'created'), JSON.stringify(r1.steps));
  check('建议里有 git init', r1.suggestions.some((s) => s.includes('git init')), JSON.stringify(r1.suggestions));

  // ---- init:幂等,政策文件不覆盖 ----
  writeFileSync(join(ws, 'drawtell.json'), '{"title":"我家"}');
  const r2 = await initWorkspace(ws);
  check('重跑没有任何 created', r2.steps.every((s) => s.action !== 'created'), JSON.stringify(r2.steps));
  check('政策文件未被覆盖', readFileSync(join(ws, 'drawtell.json'), 'utf8') === '{"title":"我家"}');
  check('用户配置已指向本工作区 → exists', r2.steps.find((s) => s.item === 'user-config')?.action === 'exists');

  // ---- init:第二工作区不改用户配置的指向 ----
  const ws2 = join(home, 'ws2');
  const r3 = await initWorkspace(ws2);
  check('用户配置已指向别处 → kept', r3.steps.find((s) => s.item === 'user-config')?.action === 'kept');
  check('用户配置没被改向', (JSON.parse(readFileSync(userCfg, 'utf8')) as { workspace?: string }).workspace === ws);

  // ---- doctor:健康工作区通过(必需项;env 探测跳过,不依赖本机装了什么)----
  const d1 = await doctorWorkspace(ws, { probeEnv: false });
  check('健康工作区体检通过', d1.ok, JSON.stringify(d1.checks.filter((c) => c.required && !c.ok)));
  check('doctor 报来源 flag', d1.source === 'flag', d1.source);
  check('git 建议是非必需项', d1.checks.some((c) => c.name === 'git' && !c.ok && !c.required));

  // ---- doctor:drawtell.json 损坏 → 必需失败,附修复(而不是命令半路死掉)----
  writeFileSync(join(ws, 'drawtell.json'), '{ 坏了');
  const d2 = await doctorWorkspace(ws, { probeEnv: false });
  check('配置损坏 → 整体不过', !d2.ok);
  check(
    '失败项 drawtell.json 且附修复',
    d2.checks.some((c) => c.name === 'drawtell.json' && !c.ok && c.required && !!c.fix),
    JSON.stringify(d2.checks.find((c) => c.name === 'drawtell.json')),
  );

  // ---- doctor:显式配置的角色指向不存在 → 必需失败;应用层角色(timetable)同样体检 ----
  writeFileSync(
    join(ws, 'drawtell.json'),
    JSON.stringify({ paths: { photos: join(home, 'nope-vault'), timetable: join(home, 'nope.md') } }),
  );
  const d3 = await doctorWorkspace(ws, { probeEnv: false });
  check(
    '角色指向踩空 → 必需失败',
    d3.checks.some((c) => c.name === 'paths.photos' && !c.ok && c.required),
    JSON.stringify(d3.checks.filter((c) => c.name.startsWith('paths.'))),
  );
  check(
    '应用层角色也体检(CLI 只解析不读写)',
    d3.checks.some((c) => c.name === 'paths.timetable' && !c.ok && c.detail.includes('应用层')),
  );
  check('整体不过', !d3.ok);

  // ---- doctor:骨架缺失与验收账本损坏 ----
  rmSync(join(ws2, 'scenes'), { recursive: true });
  writeFileSync(join(ws2, 'reviews.json'), '坏');
  const d4 = await doctorWorkspace(ws2, { probeEnv: false });
  check('scenes/ 缺 → skeleton 必需失败,修复是 init', d4.checks.some((c) => c.name === 'skeleton' && !c.ok && c.fix?.includes('init')));
  check('验收账本损坏 → 必需失败(不可再生,别删)', d4.checks.some((c) => c.name === 'reviews.json' && !c.ok && c.required));

  // ---- doctor:用户配置损坏 → 报 user-config,不死;init 同样不动它 ----
  writeFileSync(userCfg, '也坏了');
  process.chdir(home); // cwd 无 drawtell.json → 链走到用户配置
  const d5 = await doctorWorkspace(undefined, { probeEnv: false });
  check('用户配置损坏 → doctor 报出而不是死掉', d5.checks.some((c) => c.name === 'user-config' && !c.ok && c.required) && !d5.ok);
  const r4 = await initWorkspace(join(home, 'ws3'));
  check('用户配置损坏 → init 保留不动', r4.steps.find((s) => s.item === 'user-config')?.action === 'kept');
} finally {
  process.chdir(originalCwd);
  rmSync(home, { recursive: true, force: true });
}

console.log(`${passed} 通过, ${failed} 失败`);
if (failed) process.exit(1);
