/**
 * 工作区解析:工作区在哪、派生物往哪写。
 *
 * 两个根不变(docs/文件系统.md):工具 = 检出/安装目录,工作区 = 内容与状态。
 * 这里只多做三件事:
 *  1. `paths` 段——bundles / snaps 是「派生」,可以指到 vault 外的缓存目录,
 *     这样工作区本身只留「源」与「人的决定」(四类表上半),整个可以当 Obsidian vault 用。
 *     同一段还定义家长面目录的**角色**(attachments / photos / notes / kids / inbox):契约里只写角色名,
 *     缺省同名英文目录,家长可映射成任何名字(如中文)。CLI 只写 attachments(note 拷终帧),其余解析出来给 skills / 应用层。
 *     `title` 是孩子端界面标题(缺省 drawtell):孩子端没有品牌,名字是家长的配置。
 *  2. 全局 `--workspace <dir>` 显式指定工作区(main 剥离后传进来),优先级最高;
 *     其次 cwd 有 drawtell.json,再回落到 ~/.config/drawtell/config.json 的 workspace,
 *     都没有就把 cwd 当工作区。默认值有了,但不丢"无隐藏状态"——每个 --json 都回报
 *     解析到了哪个工作区、从哪来的(workspaceSource:flag / cwd / user-config / default)。
 *  3. $HOME 脱敏:--json 的输出会被 agent 带进上下文,不该带出用户名。
 */

import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/** 用法错误:main 捕获后 exit 2,错误信息即修复指南。 */
export class UsageError extends Error {}

/**
 * 配置文件损坏:文件在,但不是合法 JSON。早先静默回落缺省——那会把破坏藏起来
 * (paths 落点悄悄变错、政策悄悄丢失,症状是"列表空了"而不是"配置坏了"),必须响。
 */
export class ConfigError extends UsageError {
  readonly file: string;
  constructor(file: string, cause: string) {
    super(
      `配置文件解析失败:${redactHome(file)}(${cause})。` +
        '修复 JSON 语法;文件在 git 里就 git diff 看改动、git checkout 回退。drawtell doctor 可逐项体检。',
    );
    this.file = file;
  }
}

export interface WorkspacePaths {
  /** 课包目录(派生,build 可重来) */
  bundles: string;
  /** keyframe 截图目录(廉派生,snap 可重来) */
  snaps: string;
  /** 附件目录(通常指向 vault 的图片附件夹):note 把终帧拷进来,固定名 <id>-final.png */
  attachments: string;
  /** 以下是家长面目录角色:CLI 不读不写,只解析给 skills / 应用层(契约里一律写角色名) */
  photos: string;
  notes: string;
  kids: string;
  /** 收件箱(作业照片进件,homework skills 读) */
  inbox: string;
}

export const ROLE_DEFAULTS: Record<keyof WorkspacePaths, string> = {
  bundles: 'bundles',
  snaps: 'snaps',
  attachments: 'attachments',
  photos: 'photos',
  notes: 'notes',
  kids: 'kids',
  inbox: 'inbox',
};

export interface DubPolicy {
  voice?: string;
  instruction?: string;
  model?: string;
}

/** paths 是开放表:CLI 只认识 ROLE_DEFAULTS 里的角色,应用层角色(如 timetable)原样保留给消费方。 */
interface RawConfig {
  title?: string;
  paths?: Record<string, string>;
  dub?: DubPolicy;
}

export interface Workspace {
  /** 工作区根(绝对路径) */
  root: string;
  /** 怎么定下来的——--workspace 显式指定 / cwd 有 drawtell.json / 用户配置回落 / 什么都没有就是 cwd */
  source: 'flag' | 'cwd' | 'user-config' | 'default';
  paths: WorkspacePaths;
  dub: DubPolicy;
  /** 孩子端界面标题(书架 / 播放页),缺省 drawtell */
  title: string;
}

/** 用户级配置(XDG):{"workspace": "<路径>"}。doctor 与 init 都要指名道姓,所以导出。 */
export const USER_CONFIG = join(homedir(), '.config', 'drawtell', 'config.json');

/** `~/x` → `<home>/x`;其余原样。相对路径按工作区根解析。 */
export function expandPath(p: string, root: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : resolve(root, p);
}

/** --json 输出里把家目录换成 $HOME:agent 会把输出带进上下文,不该带出用户名。 */
export function redactHome(value: string): string {
  const home = homedir();
  return home && value.startsWith(home) ? '$HOME' + value.slice(home.length) : value;
}

/** 递归脱敏:--json 的整个对象过一遍,嵌套字段里的绝对路径(shots[].file、jobsFile、logFile…)也不漏。 */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactHome(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v)])) as T;
  }
  return value;
}

/** 读 JSON 配置:不存在 → null(缺省合法);存在但坏 → ConfigError(损坏必须响,见类注释)。 */
async function readConfig<T>(file: string): Promise<T | null> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new ConfigError(file, err instanceof Error ? err.message : String(err));
  }
}

function readConfigSync<T>(file: string): T | null {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new ConfigError(file, err instanceof Error ? err.message : String(err));
  }
}

export interface ResolvedRoot {
  root: string;
  source: Workspace['source'];
}

/**
 * 只定根,不读工作区配置(doctor 要在配置损坏时仍能报出"根在哪",所以拆开)。
 * 优先级:`--workspace <dir>`(override,跳过一切回落)→ cwd 有 drawtell.json →
 * 用户配置的 workspace → cwd 兜底。override 的目录必须存在(UsageError,信息即修复指南)。
 * cwd 分支按"文件存在"判定,不按"能解析"——坏掉的 drawtell.json 该响,不该静默换一个工作区。
 */
export async function resolveRoot(override?: string): Promise<ResolvedRoot> {
  const cwd = resolve(process.cwd());
  if (override !== undefined) {
    const root = expandPath(override, cwd);
    const st = await stat(root).catch(() => null);
    if (!st?.isDirectory()) {
      throw new UsageError(
        `--workspace 指向的目录不存在:${redactHome(root)}(由 '${redactHome(override)}' 解析)。` +
          '先 drawtell init 该目录(或 mkdir -p),或改指向已有的内容工作区根;目录里有没有 drawtell.json 都行,没有就用缺省 paths。',
      );
    }
    return { root, source: 'flag' };
  }
  const cwdConfig = await stat(join(cwd, 'drawtell.json')).catch(() => null);
  if (cwdConfig?.isFile()) return { root: cwd, source: 'cwd' };
  const user = await readConfig<{ workspace?: string }>(USER_CONFIG);
  if (user?.workspace) return { root: expandPath(user.workspace, cwd), source: 'user-config' };
  return { root: cwd, source: 'default' };
}

/** 读工作区 drawtell.json:不存在 → null;损坏 → ConfigError。应用层字段(timetable、gen…)原样在返回对象里。 */
export async function readWorkspaceConfig(root: string): Promise<(RawConfig & Record<string, unknown>) | null> {
  return readConfig(join(root, 'drawtell.json'));
}

/** readWorkspaceConfig 的同步版,给应用侧(vite 配置、工具脚本)用。 */
export function readWorkspaceConfigSync(root: string): (RawConfig & Record<string, unknown>) | null {
  return readConfigSync(join(root, 'drawtell.json'));
}

/**
 * 解析工作区(定根 + 读配置 + 展开角色)。目录里没有 drawtell.json 就用缺省 paths;
 * 有但解析不了 → ConfigError(exit 2,错误信息即修复指南)。
 */
export async function loadWorkspace(override?: string): Promise<Workspace> {
  const { root, source } = await resolveRoot(override);
  const raw = await readConfig<RawConfig>(join(root, 'drawtell.json'));
  return assemble(root, source, raw);
}

export interface AppWorkspaceRoot {
  root: string;
  source: 'env' | 'user-config' | 'default';
}

/**
 * 应用侧解析链(dev server / 工具脚本,从代码仓启动,没有"cwd 即工作区"的语义):
 * 显式指定(约定用 DRAWTELL_WORKSPACE 环境变量传进来)→ 用户配置 → <home>/drawtell-workspace。
 * 与 CLI 链共用同一份用户配置与 ~ 展开;消费方 apps/web 与 lab/reading-gen(growth-apps),
 * 早先它们各自逐字复制这条链,任何分歧只会表现成"静默的空列表"——所以收进权威模块,一处定义。
 * 同步实现:消费场景都是启动期,且 vite 配置文件不方便顶层 await。
 */
export function resolveAppWorkspaceRoot(explicit?: string): AppWorkspaceRoot {
  const cwd = resolve(process.cwd());
  if (explicit) return { root: expandPath(explicit, cwd), source: 'env' };
  const user = readConfigSync<{ workspace?: string }>(USER_CONFIG);
  if (user?.workspace) return { root: expandPath(user.workspace, cwd), source: 'user-config' };
  return { root: join(homedir(), 'drawtell-workspace'), source: 'default' };
}

function assemble(root: string, source: Workspace['source'], raw: RawConfig | null): Workspace {
  return {
    root,
    source,
    paths: Object.fromEntries(
      (Object.keys(ROLE_DEFAULTS) as (keyof WorkspacePaths)[]).map((k) => [k, expandPath(raw?.paths?.[k] ?? ROLE_DEFAULTS[k], root)]),
    ) as unknown as WorkspacePaths,
    dub: raw?.dub ?? {},
    title: raw?.title ?? 'drawtell',
  };
}

/** --json 里回报工作区(脱敏后),让 agent 一眼知道刚才写到哪去了。 */
export function workspaceReport(ws: Workspace): Record<string, string> {
  return {
    workspace: redactHome(ws.root),
    workspaceSource: ws.source,
    bundlesDir: redactHome(ws.paths.bundles),
    snapsDir: redactHome(ws.paths.snaps),
    attachmentsDir: redactHome(ws.paths.attachments),
    photosDir: redactHome(ws.paths.photos),
    notesDir: redactHome(ws.paths.notes),
    kidsDir: redactHome(ws.paths.kids),
    inboxDir: redactHome(ws.paths.inbox),
  };
}
