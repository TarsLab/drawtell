/**
 * 工作区解析回归:优先级链(--workspace override > cwd 的 drawtell.json > 用户配置回落 > cwd 兜底)、
 * override 的展开(绝对 / ~ / 相对按 cwd)与目录不存在 → UsageError、inbox 角色缺省与覆盖、
 * workspaceReport 的 workspaceSource / inboxDir 与 $HOME 脱敏;
 * 配置损坏必须响(坏 JSON → ConfigError,不再静默回落缺省)与应用侧解析链
 * (resolveAppWorkspaceRoot:env 显式 > 用户配置 > ~/drawtell-workspace)。
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
const { ConfigError, UsageError, loadWorkspace, resolveAppWorkspaceRoot, workspaceReport } = await import('../src/cli/workspace.ts');

try {
  // 布景:全放在假 HOME 下,脱敏断言才有 $HOME 可看
  const wsA = join(home, 'wsA'); // cwd 命中:自定义 paths(相对 + ~ + inbox 覆盖)
  mkdirSync(wsA);
  writeFileSync(
    join(wsA, 'drawtell.json'),
    JSON.stringify({
      title: 'A',
      paths: { bundles: 'out/bundles', snaps: '~/cache/snaps', inbox: '收件箱', attachments: '附件' },
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
  check('attachments 角色可覆盖', a.paths.attachments === join(wsA, '附件'), a.paths.attachments);
  check('dub 政策读到', a.dub.voice === 'v1', JSON.stringify(a.dub));

  // ---- 什么都没有 → cwd 兜底(此时还没写用户配置)----
  process.chdir(empty);
  const d = await loadWorkspace();
  check('无配置 → source default', d.source === 'default', d.source);
  check('default → root = cwd', d.root === empty, d.root);
  check('inbox 角色缺省 inbox/', d.paths.inbox === join(empty, 'inbox'), d.paths.inbox);
  check('attachments 角色缺省 attachments/', d.paths.attachments === join(empty, 'attachments'), d.paths.attachments);

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
  check('report 带 attachmentsDir(脱敏)', r.attachmentsDir === '$HOME/wsA/附件', r.attachmentsDir);
  check('report 不再有 reviews/ledger 角色', !('reviewsDir' in r) && !('ledgerDir' in r), JSON.stringify(Object.keys(r)));
  check('report 路径经 $HOME 脱敏', r.workspace === '$HOME/wsA' && r.bundlesDir.startsWith('$HOME/'), `${r.workspace} ${r.bundlesDir}`);

  // ---- 配置损坏必须响:cwd 的 drawtell.json 坏 → ConfigError(早先静默回落缺省,破坏被藏住)----
  const wsBad = join(home, 'wsBad');
  mkdirSync(wsBad);
  writeFileSync(join(wsBad, 'drawtell.json'), '{ 这不是 json');
  process.chdir(wsBad);
  try {
    await loadWorkspace();
    check('cwd 的 drawtell.json 损坏 → ConfigError', false, '没有抛错');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check('cwd 的 drawtell.json 损坏 → ConfigError', err instanceof ConfigError, `${(err as Error).constructor?.name}: ${msg}`);
    check('损坏错误带脱敏路径与 git 指引', msg.includes('$HOME/wsBad') && msg.includes('git'), msg);
  }

  // ---- 应用侧解析链:env 显式 > 用户配置 > ~/drawtell-workspace ----
  process.chdir(home);
  const ae = resolveAppWorkspaceRoot('~/wsC');
  check('app 链显式 → source env,~ 展开', ae.source === 'env' && ae.root === wsC, JSON.stringify(ae));
  const au = resolveAppWorkspaceRoot(); // 上文用户配置仍指向 wsB
  check('app 链回落用户配置', au.source === 'user-config' && au.root === wsB, JSON.stringify(au));
  rmSync(join(home, '.config'), { recursive: true, force: true });
  const ad = resolveAppWorkspaceRoot();
  check('app 链缺省 ~/drawtell-workspace', ad.source === 'default' && ad.root === join(home, 'drawtell-workspace'), JSON.stringify(ad));

  // ---- 用户配置损坏:两条链都要响 ----
  mkdirSync(join(home, '.config', 'drawtell'), { recursive: true });
  writeFileSync(join(home, '.config', 'drawtell', 'config.json'), '不是 json');
  try {
    resolveAppWorkspaceRoot();
    check('app 链用户配置损坏 → ConfigError', false, '没有抛错');
  } catch (err) {
    check('app 链用户配置损坏 → ConfigError', err instanceof ConfigError, String(err));
  }
  try {
    await loadWorkspace(); // cwd(home)无 drawtell.json → 走到用户配置
    check('CLI 链用户配置损坏 → ConfigError', false, '没有抛错');
  } catch (err) {
    check('CLI 链用户配置损坏 → ConfigError', err instanceof ConfigError, String(err));
  }
} finally {
  process.chdir(originalCwd);
  rmSync(home, { recursive: true, force: true });
}

console.log(`${passed} 通过, ${failed} 失败`);
if (failed) process.exit(1);
