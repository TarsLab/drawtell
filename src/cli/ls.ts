/**
 * ls:agent 无记忆,进来先问世界现状。一行一个场景,五态一眼看全:
 *   源 → 课包(是否比源旧)→ 音频(几步有)→ 截图(是否过期)→ 验收(有效/失效/未验)
 *
 * 还回答 rm 验收暴露的那个问题:**这个课包的源在哪**。工作区 scenes/ 里没有对应源的课包
 * 标 `orphan`——多半是工具仓种子(homework-run 的 `seed:<id>` 路径 build 进来的),
 * 全量重建时不扫工作区就会漏掉它。
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Workspace } from './workspace.ts';

export type Freshness = 'none' | 'fresh' | 'stale';

export interface SceneRow {
  id: string;
  /** workspace = 工作区 scenes/ 有源;orphan = 只有课包没有源(多半是工具仓种子) */
  source: 'workspace' | 'orphan';
  sceneMtime: string | null;
  bundle: Freshness;
  /** 有音频的步 / 总步数 */
  audio: string;
  snaps: Freshness;
  /** none = 未验收;valid = 验收仍对应当前课包;stale = 课包已改,需重验 */
  review: 'none' | 'valid' | 'stale';
}

async function mtime(p: string): Promise<number | null> {
  try {
    return (await stat(p)).mtimeMs;
  } catch {
    return null;
  }
}

async function listDir(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch {
    return [];
  }
}

/** 比较新鲜度:目标不存在 = none;比源旧 = stale。 */
function freshness(target: number | null, source: number | null): Freshness {
  if (target == null) return 'none';
  if (source != null && target < source) return 'stale';
  return 'fresh';
}

/** 课包内容 hash:build 幂等(同输入同字节),所以 manifest 的字节 hash 就是内容指纹。 */
async function manifestHash(bundleDir: string): Promise<string | null> {
  try {
    return createHash('sha1').update(await readFile(join(bundleDir, 'manifest.json'))).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

/** 极简 frontmatter 取值:只读 `key: value` 单行,够验收记录用。 */
function frontmatterValue(text: string, key: string): string | null {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 3);
  const block = end === -1 ? text : text.slice(0, end);
  const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

async function reviewState(ws: Workspace, id: string, hash: string | null): Promise<SceneRow['review']> {
  let text: string;
  try {
    text = await readFile(join(ws.paths.reviews, `${id}.md`), 'utf8');
  } catch {
    return 'none';
  }
  const recorded = frontmatterValue(text, 'manifestHash');
  // 验收绑内容不绑目录:hash 对不上 = 课包改过,验收自动失效
  return recorded && hash && recorded === hash ? 'valid' : 'stale';
}

async function audioCount(bundleDir: string): Promise<string> {
  try {
    const manifest = JSON.parse(await readFile(join(bundleDir, 'manifest.json'), 'utf8')) as {
      steps?: Array<{ audioSrc?: string }>;
    };
    const steps = manifest.steps ?? [];
    return `${steps.filter((s) => s.audioSrc).length}/${steps.length}`;
  } catch {
    return '—';
  }
}

export async function listWorkspace(ws: Workspace): Promise<SceneRow[]> {
  const sceneIds = (await listDir(join(ws.root, 'scenes')))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => basename(f, '.ts'));
  const bundleIds = await listDir(ws.paths.bundles);
  const ids = [...new Set([...sceneIds, ...bundleIds])].sort();

  const rows: SceneRow[] = [];
  for (const id of ids) {
    const sceneFile = join(ws.root, 'scenes', `${id}.ts`);
    const sm = sceneIds.includes(id) ? await mtime(sceneFile) : null;
    const bundleDir = join(ws.paths.bundles, id);
    const bm = await mtime(join(bundleDir, 'manifest.json'));
    const hash = await manifestHash(bundleDir);
    rows.push({
      id,
      source: sceneIds.includes(id) ? 'workspace' : 'orphan',
      sceneMtime: sm == null ? null : new Date(sm).toISOString().slice(0, 10),
      bundle: freshness(bm, sm),
      audio: bm == null ? '—' : await audioCount(bundleDir),
      snaps: freshness(await mtime(join(ws.paths.snaps, id, 'index.json')), bm),
      review: await reviewState(ws, id, hash),
    });
  }
  return rows;
}

const MARK: Record<string, string> = {
  none: '·', fresh: '✓', stale: '!', workspace: '✓', orphan: '?', valid: '✓',
};

export function formatRows(rows: SceneRow[]): string {
  if (!rows.length) return '(工作区里没有场景,也没有课包)';
  const w = Math.max(4, ...rows.map((r) => r.id.length));
  const head = `${'场景'.padEnd(w)}  源  课包  音频   截图  验收`;
  const body = rows.map(
    (r) =>
      `${r.id.padEnd(w)}  ${MARK[r.source]}   ${MARK[r.bundle]}    ${r.audio.padEnd(5)}  ${MARK[r.snaps]}    ${MARK[r.review]}`,
  );
  const orphans = rows.filter((r) => r.source === 'orphan').map((r) => r.id);
  const notes = [
    '图例:✓ 有且新鲜 · ! 比上游旧,需重跑 · · 没有 · ? 课包在但工作区没有源',
    ...(orphans.length
      ? [`⚠ orphan(${orphans.join(' ')}):源不在工作区 scenes/,多半是工具仓种子。` +
         '全量重建时别只扫 scenes/,否则会漏掉它们。']
      : []),
  ];
  return [head, ...body, '', ...notes].join('\n');
}
