/**
 * 工作区解析回归:优先级链(--workspace override > cwd 的 drawtell.json > 用户配置回落 > cwd 兜底)、
 * override 的展开(绝对 / ~ / 相对按 cwd)与目录不存在 → UsageError、inbox 角色缺省与覆盖、
 * workspaceReport 的 workspaceSource / inboxDir 与 $HOME 脱敏。
 * 用户配置路径 ~/.config/drawtell/config.json 是模块级常量(按 homedir() 定死),而 POSIX 的
 * homedir() 读 $HOME——所以先把 HOME 指到临时目录、再动态 import workspace.ts,该分支就可注入。
 */
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

// realpath:macOS 的 tmpdir 是符号链接,process.cwd() 回物理路径,先解掉才好比对
const home = realpathSync(mkdtempSync(join(tmpdir(), 'drawtell-ws-home-')));
const originalCwd = process.cwd();
process.env.HOME = home;

// USER_CONFIG 在模块加载时按 homedir() 定死,必须先设 HOME 再 import
const { UsageError, loadWorkspace, workspaceReport } = await import('../src/cli/workspace.ts');

try {
  // 布景:全放在假 HOME 下,脱敏断言才有 $HOME 可看
  const wsA = join(home, 'wsA'); // cwd 命中:自定义 paths(相对 + ~ + inbox 覆盖)
  mkdirSync(wsA);
  writeFileSync(
    join(wsA, 'drawtell.json'),
    JSON.stringify({
      title: 'A',
      paths: { bundles: 'out/bundles', snaps: '~/cache/snaps', inbox: '收件箱' },
      dub: { voice: 'v1' },
    }),
  );
  const wsB = join(home, 'wsB'); // 用户配置回落目标
  mkdirSync(wsB);
  writeFileSync(join(wsB, 'drawtell.json'), JSON.stringify({ title: 'B' }));
  const wsC = join(home, 'wsC'); // 存在但没有 drawtell.json
  mkdirSync(wsC);
  const empty = join(home, 'empty');
  mkdirSync(empty);

  // ---- cwd 命中 drawtell.json ----
  process.chdir(wsA);
  const a = await loadWorkspace();
  check('cwd 命中 → source cwd', a.source === 'cwd', a.source);
  check('cwd 命中 → root = cwd', a.root === wsA, a.root);
  check('相对 paths 按工作区根解析', a.paths.bundles === join(wsA, 'out/bundles'), a.paths.bundles);
  check('~ paths 展开到 HOME', a.paths.snaps === join(home, 'cache/snaps'), a.paths.snaps);
  check('inbox 角色可覆盖', a.paths.inbox === join(wsA, '收件箱'), a.paths.inbox);
  check('dub 政策读到', a.dub.voice === 'v1', JSON.stringify(a.dub));

  // ---- 什么都没有 → cwd 兜底(此时还没写用户配置)----
  process.chdir(empty);
  const d = await loadWorkspace();
  check('无配置 → source default', d.source === 'default', d.source);
  check('default → root = cwd', d.root === empty, d.root);
  check('inbox 角色缺省 inbox/', d.paths.inbox === join(empty, 'inbox'), d.paths.inbox);

  // ---- 用户配置回落 ----
  mkdirSync(join(home, '.config', 'drawtell'), { recursive: true });
  writeFileSync(join(home, '.config', 'drawtell', 'config.json'), JSON.stringify({ workspace: '~/wsB' }));
  const u = await loadWorkspace();
  check('用户配置回落 → source user-config', u.source === 'user-config', u.source);
  check('用户配置 workspace 的 ~ 展开', u.root === wsB, u.root);
  check('回落工作区的 title 读到', u.title === 'B', u.title);

  // ---- override:绝对路径,优先于(跳过)用户配置回落 ----
  const oa = await loadWorkspace(wsA);
  check('override → source flag', oa.source === 'flag', oa.source);
  check('override 优先于用户配置(root = wsA 而非 wsB)', oa.root === wsA, oa.root);
  check('override 的 paths 展开正确', oa.paths.bundles === join(wsA, 'out/bundles'), oa.paths.bundles);

  // ---- override:~ 展开;目录存在但没有 drawtell.json → 缺省 paths,不报错 ----
  const oc = await loadWorkspace('~/wsC');
  check('override 的 ~ 展开', oc.root === wsC, oc.root);
  check('override 无 drawtell.json → source 仍 flag', oc.source === 'flag', oc.source);
  check('override 无 drawtell.json → 缺省 inbox', oc.paths.inbox === join(wsC, 'inbox'), oc.paths.inbox);

  // ---- override:相对路径按 cwd 解析 ----
  process.chdir(home);
  const orel = await loadWorkspace('wsC');
  check('override 相对路径按 cwd 解析', orel.root === wsC, orel.root);

  // ---- override 指向不存在目录 → UsageError,信息即修复指南(路径脱敏)----
  try {
    await loadWorkspace(join(home, 'nope'));
    check('override 目录不存在 → 抛 UsageError', false, '没有抛错');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check('override 目录不存在 → 抛 UsageError', err instanceof UsageError, `${(err as Error).constructor?.name}: ${msg}`);
    check('错误信息带脱敏路径与指引', msg.includes('$HOME/nope') && msg.includes('mkdir'), msg);
  }

  // ---- workspaceReport:workspaceSource + inboxDir + $HOME 脱敏 ----
  const r = workspaceReport(oa);
  check('report 带 workspaceSource', r.workspaceSource === 'flag', r.workspaceSource);
  check('report 带 inboxDir(脱敏)', r.inboxDir === '$HOME/wsA/收件箱', r.inboxDir);
  check('report 路径经 $HOME 脱敏', r.workspace === '$HOME/wsA' && r.bundlesDir.startsWith('$HOME/'), `${r.workspace} ${r.bundlesDir}`);
} finally {
  process.chdir(originalCwd);
  rmSync(home, { recursive: true, force: true });
}

console.log(`${passed} 通过, ${failed} 失败`);
if (failed) process.exit(1);
