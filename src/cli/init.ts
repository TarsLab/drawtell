/**
 * drawtell init:初始化/修补工作区骨架。语义是**幂等补缺**——已有的文件与目录一律不动,
 * 缺什么补什么;所以 init 同时就是修复命令,不需要单独的 repair。
 * 三条边界:
 *  1. 政策文件(drawtell.json)只在缺失时写模板,永不覆盖(见 skeleton.ts CONFIG_TEMPLATE 注)。
 *  2. 用户配置 ~/.config/drawtell/config.json 只在还没指定 workspace 时补上,已指向别处不改
 *     (改默认工作区是用户的决定,init 只报告现状)。
 *  3. 不动 git:是否建仓是家庭的政策,init 只在收尾建议里提一句(doctor 也会体检)。
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { CONFIG_TEMPLATE, CORE_DIRS, FAMILY_DIRS, GITIGNORE, NO_GITKEEP } from './skeleton.ts';
import { USER_CONFIG, expandPath } from './workspace.ts';

export interface InitStep {
  /** 相对工作区根的条目名(目录带尾斜杠),或 user-config */
  item: string;
  action: 'created' | 'exists' | 'kept';
  /** kept 的原因,或 exists/created 的补充说明 */
  note?: string;
}

export interface InitResult {
  root: string;
  steps: InitStep[];
  /** 收尾建议(不是错误):git init、doctor、家长政策 */
  suggestions: string[];
}

async function exists(p: string): Promise<boolean> {
  return (await stat(p).catch(() => null)) !== null;
}

export async function initWorkspace(dirArg: string): Promise<InitResult> {
  const root = expandPath(dirArg, resolve(process.cwd()));
  const steps: InitStep[] = [];

  const rootExisted = await exists(root);
  if (!rootExisted) await mkdir(root, { recursive: true });
  steps.push({ item: '.', action: rootExisted ? 'exists' : 'created' });

  for (const dir of [...CORE_DIRS, ...FAMILY_DIRS]) {
    const p = join(root, dir);
    if (await exists(p)) {
      steps.push({ item: `${dir}/`, action: 'exists' });
      continue;
    }
    await mkdir(p, { recursive: true });
    if (!NO_GITKEEP.has(dir)) await writeFile(join(p, '.gitkeep'), '');
    steps.push({ item: `${dir}/`, action: 'created' });
  }

  const configFile = join(root, 'drawtell.json');
  if (await exists(configFile)) {
    steps.push({ item: 'drawtell.json', action: 'kept', note: '政策文件不覆盖(家长的决定)' });
  } else {
    await writeFile(configFile, CONFIG_TEMPLATE);
    steps.push({ item: 'drawtell.json', action: 'created', note: '模板;音色等政策留家长确认' });
  }

  const gitignore = join(root, '.gitignore');
  if (await exists(gitignore)) {
    steps.push({ item: '.gitignore', action: 'kept' });
  } else {
    await writeFile(gitignore, GITIGNORE);
    steps.push({ item: '.gitignore', action: 'created' });
  }

  // 用户配置:补缺不改向。解析不了也不动(init 不该在别的文件坏掉时半路死掉,doctor 去体检)
  let user: Record<string, unknown> | null = null;
  let userBroken = false;
  try {
    user = JSON.parse(await readFile(USER_CONFIG, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    userBroken = (err as NodeJS.ErrnoException).code !== 'ENOENT';
  }
  const configured = user && typeof user.workspace === 'string' && user.workspace ? user.workspace : null;
  if (userBroken) {
    steps.push({ item: 'user-config', action: 'kept', note: '解析失败,未动(drawtell doctor 可体检)' });
  } else if (configured) {
    const current = expandPath(configured, root);
    if (current === root) {
      steps.push({ item: 'user-config', action: 'exists', note: '已指向本工作区' });
    } else {
      steps.push({
        item: 'user-config',
        action: 'kept',
        note: `已指向别的工作区,未改;要切换默认就手改该文件,或用 --workspace / DRAWTELL_WORKSPACE 显式指定`,
      });
    }
  } else {
    await mkdir(dirname(USER_CONFIG), { recursive: true });
    await writeFile(USER_CONFIG, JSON.stringify({ ...(user ?? {}), workspace: root }, null, 2) + '\n');
    steps.push({ item: 'user-config', action: 'created', note: 'workspace 指向本工作区' });
  }

  const suggestions: string[] = [];
  if (!(await exists(join(root, '.git')))) {
    suggestions.push('git init(建议:工作区含不可再生状态——scenes/、reviews.json、drawtell.json 政策,git 是破坏后的兜底)');
  }
  suggestions.push('drawtell doctor 逐项体检');
  suggestions.push('家长政策(音色、vault 目录映射)改 drawtell.json');
  return { root, steps, suggestions };
}
