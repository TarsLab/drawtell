/**
 * tidy:清理工作区里**没人引用**的旧文件(主要是作业照片)。
 *
 * 这是全套命令里唯一会删东西的,而删的是「源、不可再生」,所以纪律比功能重要:
 *  1. **先算可达性,再谈年龄。** 被任何笔记 `![[…]]` / `[](…)` 引用的永不进清单——
 *     引用 = 人主动保留的信号,比任何时间规则都权威。
 *  2. **默认只列不删。** 要真删必须显式 --delete。
 *  3. **删除清单落盘。** 它自己是「人的决定」,要能回答"那张图哪去了"。
 *  4. 宁可漏删不可错删:引用按**文件名**也算命中(Obsidian 的 `![[d7.jpeg]]` 就是按文件名解析的)。
 */

import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import type { Workspace } from './workspace.ts';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.drawtell', 'dist']);

export interface TidyCandidate {
  path: string;
  ageDays: number;
  bytes: number;
}

export interface TidyResult {
  dir: string;
  scanned: number;
  referenced: number;
  candidates: TidyCandidate[];
  deleted: string[];
  logFile: string | null;
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) await walk(join(dir, e.name), out);
    } else {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

const WIKILINK = /!?\[\[([^\]|#]+)/g;
const MDLINK = /!?\[[^\]]*\]\(([^)\s]+)/g;

/**
 * 扫全工作区的 markdown,收集被引用的目标。
 * 同时收 **文件名** 与 **相对路径** 两种形式——宁可多认,错认成"被引用"只是留着文件,反过来会误删。
 */
export async function collectReferences(root: string): Promise<Set<string>> {
  const refs = new Set<string>();
  for (const file of await walk(root)) {
    if (!file.endsWith('.md') && !file.endsWith('.base')) continue;
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const re of [WIKILINK, MDLINK]) {
      for (const [, target] of text.matchAll(re)) {
        const clean = decodeURIComponent(target.trim());
        if (!clean || /^(https?:|mailto:)/.test(clean)) continue;
        refs.add(clean);
        refs.add(basename(clean));
      }
    }
  }
  return refs;
}

export async function tidy(
  ws: Workspace,
  dirArg: string,
  opts: { olderThanDays: number; del: boolean },
): Promise<TidyResult> {
  const dir = resolve(ws.root, dirArg);
  const refs = await collectReferences(ws.root);
  const files = await walk(dir);
  const now = Date.now();

  let referenced = 0;
  const candidates: TidyCandidate[] = [];
  for (const f of files) {
    const rel = relative(ws.root, f);
    if (refs.has(rel) || refs.has(basename(f)) || refs.has(relative(dir, f))) {
      referenced++;
      continue;
    }
    const s = await stat(f);
    const ageDays = Math.floor((now - s.mtimeMs) / 86_400_000);
    if (ageDays < opts.olderThanDays) continue;
    candidates.push({ path: rel, ageDays, bytes: s.size });
  }
  candidates.sort((a, b) => b.ageDays - a.ageDays);

  const deleted: string[] = [];
  let logFile: string | null = null;
  if (opts.del && candidates.length) {
    for (const c of candidates) {
      await unlink(join(ws.root, c.path));
      deleted.push(c.path);
    }
    // 删除清单是「人的决定」:落在工作区侧(不是缓存),追加不覆盖
    logFile = join(ws.root, 'tidy-log.md');
    let prev = '';
    try {
      prev = await readFile(logFile, 'utf8');
    } catch {
      prev = '# 清理记录\n\n`drawtell tidy --delete` 每次删除都追加一节。删掉的都是**当时没有任何笔记引用**的文件。\n';
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const section = [
      `\n## ${stamp} · ${dirArg} · 删除 ${deleted.length} 个`,
      `\n条件:无引用,且超过 ${opts.olderThanDays} 天未改动。\n`,
      ...deleted.map((d) => `- ${d}`),
      '',
    ].join('\n');
    await writeFile(logFile, prev + section);
  }

  return { dir: relative(ws.root, dir) || '.', scanned: files.length, referenced, candidates, deleted, logFile };
}
