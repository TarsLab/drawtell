/**
 * drawtell doctor:环境 + 工作区逐项体检。它要填的缺口:除 --workspace 一处外,
 * 解析链与各读取点遇到"目录不在 / 配置坏了"全是静默走缺省,症状(空列表)离真因隔着几层——
 * doctor 把每一环摆到明面上,失败项附修复命令(错误信息即修复指南,老规矩)。
 * 分工:内容层校验归 check(单场景)与 ls(五态盘点),doctor 只管环境与工作区结构,不读场景。
 * exit 约定与 voxtell doctor 一致:必需项全过 exit 0,否则 1;--json 带 ok 字段与整份 checks。
 */

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { CORE_DIRS, FAMILY_DIRS } from './skeleton.ts';
import {
  ConfigError,
  ROLE_DEFAULTS,
  USER_CONFIG,
  type Workspace,
  expandPath,
  readWorkspaceConfig,
  redactHome,
  resolveRoot,
} from './workspace.ts';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  /** 必需项不过 → 整体不过(exit 1);非必需项只是提醒(某条命令用到才要) */
  required: boolean;
  detail: string;
  fix?: string;
}

export interface DoctorReport {
  ok: boolean;
  root: string;
  source: Workspace['source'];
  checks: DoctorCheck[];
}

const execFileP = promisify(execFile);

async function statOrNull(p: string): Promise<import('node:fs').Stats | null> {
  return stat(p).catch(() => null);
}

/** iCloud 目录里被「优化储存」驱逐的文件是 *.icloud 占位——读它就踩空。只扫一层,够发现问题。 */
async function evictedCount(dir: string): Promise<number> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.icloud')).length;
  } catch {
    return 0;
  }
}

export async function doctorWorkspace(override?: string, opts: { probeEnv?: boolean } = {}): Promise<DoctorReport> {
  const probeEnv = opts.probeEnv ?? true;
  const checks: DoctorCheck[] = [];

  // ---- 环境:node ----
  const [maj, min] = process.versions.node.split('.').map(Number);
  const nodeOk = maj > 22 || (maj === 22 && min >= 18);
  checks.push({
    name: 'node',
    ok: nodeOk,
    required: true,
    detail: `node ${process.versions.node}`,
    fix: nodeOk ? undefined : '需要 Node ≥ 22.18(原生 type stripping)',
  });

  // ---- 工作区:定根(用户配置坏了也要能报出"根在哪",所以自己接住 ConfigError)----
  let root: string;
  let source: Workspace['source'];
  try {
    ({ root, source } = await resolveRoot(override));
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    checks.push({
      name: 'user-config',
      ok: false,
      required: true,
      detail: err.message,
      fix: `修复 ${redactHome(err.file)} 的 JSON 语法(或删掉它,回到 cwd 兜底)`,
    });
    root = process.cwd();
    source = 'default';
  }
  const rootSt = await statOrNull(root);
  checks.push({
    name: 'workspace',
    ok: rootSt?.isDirectory() ?? false,
    required: true,
    detail: `${redactHome(root)}(来源:${source}${source === 'default' ? ',没有任何配置,cwd 兜底' : ''})`,
    fix: rootSt?.isDirectory()
      ? undefined
      : `工作区根不存在:drawtell init ${redactHome(root)}(或 mkdir -p;用户配置指错就改 ${redactHome(USER_CONFIG)})`,
  });

  // ---- 工作区:drawtell.json 可解析 + 形状 ----
  let cfg: Awaited<ReturnType<typeof readWorkspaceConfig>> = null;
  try {
    cfg = await readWorkspaceConfig(root);
    if (cfg === null) {
      checks.push({ name: 'drawtell.json', ok: true, required: true, detail: '没有(全部缺省);drawtell init 可生成模板' });
    } else {
      const bad: string[] = [];
      if (cfg.title !== undefined && typeof cfg.title !== 'string') bad.push('title 应为字符串');
      if (cfg.paths !== undefined) {
        if (typeof cfg.paths !== 'object' || cfg.paths === null || Array.isArray(cfg.paths)) bad.push('paths 应为对象');
        else for (const [k, v] of Object.entries(cfg.paths)) if (typeof v !== 'string') bad.push(`paths.${k} 应为字符串`);
      }
      for (const k of ['voice', 'instruction', 'model'] as const) {
        const v = (cfg.dub as Record<string, unknown> | undefined)?.[k];
        if (v !== undefined && typeof v !== 'string') bad.push(`dub.${k} 应为字符串`);
      }
      checks.push({
        name: 'drawtell.json',
        ok: bad.length === 0,
        required: true,
        detail: bad.length
          ? bad.join(';')
          : `title "${cfg.title ?? 'drawtell'}"、paths ${Object.keys(cfg.paths ?? {}).length} 项、dub.voice ${(cfg.dub as { voice?: string } | undefined)?.voice ? '已设' : '未设(dub 前要设)'}`,
        fix: bad.length ? '修正 drawtell.json 里上述字段;政策文件机器不重建,改坏了靠 git 回退' : undefined,
      });
    }
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    checks.push({
      name: 'drawtell.json',
      ok: false,
      required: true,
      detail: err.message,
      fix: '修复 JSON 语法;工作区在 git 里就 git diff / git checkout 回退。政策文件机器永不自动重建',
    });
  }

  // ---- 工作区:骨架目录(清单同 init,skeleton.ts 单一真相)----
  const missingCore: string[] = [];
  for (const d of CORE_DIRS) if (!(await statOrNull(join(root, d)))?.isDirectory()) missingCore.push(`${d}/`);
  checks.push({
    name: 'skeleton',
    ok: missingCore.length === 0,
    required: true,
    detail: missingCore.length ? `缺 ${missingCore.join(' ')}` : [...CORE_DIRS].map((d) => `${d}/`).join(' '),
    fix: missingCore.length ? `drawtell init ${redactHome(root)}(幂等补缺,不动已有文件)` : undefined,
  });
  const missingFamily: string[] = [];
  for (const d of FAMILY_DIRS) if (!(await statOrNull(join(root, d)))?.isDirectory()) missingFamily.push(`${d}/`);
  checks.push({
    name: 'skeleton-family',
    ok: missingFamily.length === 0,
    required: false,
    detail: missingFamily.length
      ? `缺 ${missingFamily.join(' ')}${missingFamily.includes('books/') ? '(books/ 是 reading 线必需,缺了 /reading/* 全部落空)' : ''}`
      : '子产品目录齐全',
    fix: missingFamily.length ? `drawtell init ${redactHome(root)}` : undefined,
  });

  // ---- 工作区:paths 角色指向。派生角色(bundles/snaps)缺了会自建,只报落点;
  //      显式配置的其余角色(含 timetable 等应用层角色)指向必须存在——配了就该在,踩空即静默故障 ----
  const paths = (cfg?.paths ?? {}) as Record<string, string>;
  const derived = new Set(['bundles', 'snaps']);
  for (const role of ['bundles', 'snaps']) {
    const target = expandPath(paths[role] ?? ROLE_DEFAULTS[role as keyof typeof ROLE_DEFAULTS], root);
    const there = (await statOrNull(target)) !== null;
    checks.push({
      name: `paths.${role}`,
      ok: true,
      required: false,
      detail: `${redactHome(target)}${there ? '' : '(未建,首次 build/snap 自建)'}`,
    });
  }
  for (const [role, value] of Object.entries(paths)) {
    if (derived.has(role)) continue;
    const known = role in ROLE_DEFAULTS;
    const target = expandPath(value, root);
    const st = await statOrNull(target);
    const suffix = known ? '' : '(应用层角色,CLI 只解析不读写)';
    if (!st) {
      checks.push({
        name: `paths.${role}`,
        ok: false,
        required: true,
        detail: `指向不存在:${redactHome(target)}${suffix}`,
        fix: `mkdir -p 该目录,或修正 drawtell.json 的 paths.${role};指向 Obsidian vault 时确认 vault 已建、iCloud 已完成同步`,
      });
      continue;
    }
    const evicted = target.includes('Mobile Documents') && st.isDirectory() ? await evictedCount(target) : 0;
    checks.push({
      name: `paths.${role}`,
      ok: evicted === 0,
      required: false,
      detail: `${redactHome(target)}${suffix}${evicted ? `——有 ${evicted} 个 .icloud 占位(文件被 iCloud 驱逐,读取会踩空)` : ''}`,
      fix: evicted ? '关掉 Mac 的 iCloud「优化 Mac 储存空间」,或在访达里把该目录下载到本地' : undefined,
    });
  }

  // ---- 工作区:reviews.json(不可再生的人的决定,坏了必须响,但没有是正常的)----
  try {
    const text = await readFile(join(root, 'reviews.json'), 'utf8');
    try {
      const n = Object.keys(JSON.parse(text) as Record<string, unknown>).length;
      checks.push({ name: 'reviews.json', ok: true, required: true, detail: `${n} 条验收记录` });
    } catch (err) {
      checks.push({
        name: 'reviews.json',
        ok: false,
        required: true,
        detail: `解析失败:${err instanceof Error ? err.message : String(err)}`,
        fix: '验收账本不可再生:修 JSON 或 git checkout 回退,不要删了重来',
      });
    }
  } catch {
    checks.push({ name: 'reviews.json', ok: true, required: true, detail: '没有(还没有验收记录)' });
  }

  // ---- 用户配置(可选;解析链没用到它时这里单独探一眼,坏了也该知道)----
  if (!checks.some((c) => c.name === 'user-config')) {
    try {
      const text = await readFile(USER_CONFIG, 'utf8');
      try {
        const u = JSON.parse(text) as { workspace?: string };
        checks.push({
          name: 'user-config',
          ok: true,
          required: false,
          detail: u.workspace ? `workspace → ${redactHome(expandPath(u.workspace, root))}` : '有,但未设 workspace',
        });
      } catch {
        checks.push({
          name: 'user-config',
          ok: false,
          required: false,
          detail: `${redactHome(USER_CONFIG)} 解析失败`,
          fix: '修复 JSON 语法或删掉它(删了就回到 cwd 兜底)',
        });
      }
    } catch {
      checks.push({
        name: 'user-config',
        ok: true,
        required: false,
        detail: `未配置(可选):写 {"workspace": "…"} 进 ${redactHome(USER_CONFIG)},任何目录都能 drawtell;drawtell init 会代劳`,
      });
    }
  }

  // ---- git(建议,不是必需:是否建仓是家庭的政策)----
  const gitThere = (await statOrNull(join(root, '.git'))) !== null;
  checks.push({
    name: 'git',
    ok: gitThere,
    required: false,
    detail: gitThere ? '工作区是 git 仓' : '工作区不在 git 里',
    fix: gitThere ? undefined : '建议 git init:工作区含不可再生状态(scenes/、reviews.json、drawtell.json 政策),git 是破坏后的兜底',
  });

  // ---- 环境:serve/snap/dub 的外部依赖(用到才要,全部非必需)----
  if (probeEnv) {
    try {
      const { WEB_ROOT } = await import('./serve.ts');
      const built = (await statOrNull(join(WEB_ROOT, 'index.html'))) !== null;
      checks.push({
        name: 'web-build',
        ok: built,
        required: false,
        detail: built ? '播放页构建产物在' : '播放页未构建(serve/snap 需要)',
        fix: built ? undefined : '仓库根 pnpm build;npm 安装的包不含播放页,serve/snap 在仓库检出里跑',
      });
    } catch (err) {
      checks.push({ name: 'web-build', ok: false, required: false, detail: String(err instanceof Error ? err.message : err) });
    }
    try {
      createRequire(import.meta.url).resolve('playwright');
      checks.push({ name: 'playwright', ok: true, required: false, detail: '已安装(snap 需要)' });
    } catch {
      checks.push({ name: 'playwright', ok: false, required: false, detail: '未安装(snap 需要)', fix: '仓库根 pnpm i(playwright 是 devDependency)' });
    }
    try {
      const { stdout } = await execFileP('voxtell', ['--version'], { timeout: 5000 });
      checks.push({ name: 'voxtell', ok: true, required: false, detail: `voxtell ${stdout.trim()}(dub 需要)` });
    } catch {
      checks.push({
        name: 'voxtell',
        ok: false,
        required: false,
        detail: 'PATH 里没有 voxtell(dub 需要)',
        fix: 'npm i -g voxtell(或 dub 用 --voxtell <bin> 指定);装好后 voxtell doctor 单独体检语音侧',
      });
    }
  }

  return { ok: checks.filter((c) => c.required).every((c) => c.ok), root, source, checks };
}
