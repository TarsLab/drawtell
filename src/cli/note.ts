/**
 * note:课包 → 档案段。把「这个课包讲了什么」整理成家长能读的一段 markdown
 * (标题 + 题面 + 终帧 wikilink + 每步讲稿),打到 stdout;终帧截图拷进工作区
 * paths.attachments 角色目录(固定名 <id>-final.png,重生成覆盖——wikilink 永不断)。
 * 落进 Obsidian 日记由调用方(skill / 网页中间件)负责:日记只追加,drawtell 不依赖 obsidian CLI。
 */

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChalkScene } from '../player/types.ts';
import { readBundle } from './build.ts';
import { LoadError, NotFoundError, loadScene } from './load-scene.ts';

export interface NoteOptions {
  /** <scene.ts|bundle-id>:.ts 只取 id(不 build,课包以已 build 的为准),其余当课包 id */
  file: string;
  bundlesDir: string;
  snapsDir: string;
  attachmentsDir: string;
}

export interface NoteResult {
  scene: string;
  /** <attachments>/<id>-final.png */
  image: string;
  steps: number;
  /** 档案段:调用方 append 进日记 */
  markdown: string;
}

function archiveMarkdown(scene: ChalkScene): string {
  const lines = scene.steps.map((s) => `${s.step}. ${s.line}`);
  return [`### ${scene.title}(${scene.id})`, '', scene.problem, '', `![[${scene.id}-final.png]]`, '', ...lines].join('\n');
}

export async function noteBundle(o: NoteOptions): Promise<NoteResult> {
  // 输入分发:.ts 只取 id 定位课包;档案内容以已 build 的课包为准(与 ls 的世界观一致)
  let id: string;
  if (o.file.endsWith('.ts')) {
    const { raw } = await loadScene(o.file);
    const sceneId = (raw as { id?: unknown }).id;
    if (typeof sceneId !== 'string' || !sceneId) {
      throw new LoadError(`场景模块没有 id 字段(string),无法定位课包:${o.file}`);
    }
    id = sceneId;
  } else {
    id = o.file;
  }
  const scene = await readBundle(o.bundlesDir, id);

  const n = scene.steps.length;
  const snapFile = join(o.snapsDir, scene.id, `step-${n}.png`);
  try {
    await stat(snapFile);
  } catch {
    throw new NotFoundError(
      `终帧截图不存在:${snapFile}(终帧 = step-<步数>.png)。先 drawtell snap ${scene.id} --no-cursor,再重跑 drawtell note`,
    );
  }

  // 终帧 → 固定名,重生成覆盖:![[<id>-final.png]] 这条 wikilink 永不断
  await mkdir(o.attachmentsDir, { recursive: true });
  const image = join(o.attachmentsDir, `${scene.id}-final.png`);
  await copyFile(snapFile, image);

  return { scene: scene.id, image, steps: n, markdown: archiveMarkdown(scene) };
}
