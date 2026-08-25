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

import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/** 用法错误:main 捕获后 exit 2,错误信息即修复指南。 */
export class UsageError extends Error {}

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

const ROLE_DEFAULTS: Record<keyof WorkspacePaths, string> = {
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

interface RawConfig {
  title?: string;
  paths?: Partial<Record<keyof WorkspacePaths, string>>;
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

const USER_CONFIG = join(homedir(), '.config', 'drawtell', 'config.json');

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

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * 解析工作区。优先级:`--workspace <dir>`(override,跳过一切回落)→ cwd 有 drawtell.json → 用它;
 * 否则看用户配置的 workspace;都没有就把 cwd 当工作区(现有行为,不破坏任何已有工作区)。
 * override 的目录必须存在(否则 UsageError,信息即修复指南);目录里没有 drawtell.json
 * 就用缺省 paths——与 cwd 分支同一行为。
 */
export async function loadWorkspace(override?: string): Promise<Workspace> {
  let root = resolve(process.cwd());
  let source: Workspace['source'] = 'default';
  let raw: RawConfig | null;

  if (override !== undefined) {
    root = expandPath(override, root);
    const st = await stat(root).catch(() => null);
    if (!st?.isDirectory()) {
      throw new UsageError(
        `--workspace 指向的目录不存在:${redactHome(root)}(由 '${redactHome(override)}' 解析)。` +
          '先 mkdir -p 创建它,或改指向已有的内容工作区根;目录里有没有 drawtell.json 都行,没有就用缺省 paths。',
      );
    }
    raw = await readJson<RawConfig>(join(root, 'drawtell.json'));
    source = 'flag';
    return assemble(root, source, raw);
  }

  raw = await readJson<RawConfig>(join(root, 'drawtell.json'));
  if (raw) {
    source = 'cwd';
  } else {
    const user = await readJson<{ workspace?: string }>(USER_CONFIG);
    if (user?.workspace) {
      root = expandPath(user.workspace, root);
      raw = await readJson<RawConfig>(join(root, 'drawtell.json'));
      source = 'user-config';
    }
  }
  return assemble(root, source, raw);
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
