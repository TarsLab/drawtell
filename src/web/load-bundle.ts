/**
 * 课包 → 场景:播放页从 /bundles/<id>/ 取回 build 产物,拼回 ChalkScene。
 * 拼法与 zod 校验在 core 的 parseBundle(应用也用它)。
 */

import type { ChalkScene } from '../player';
import { parseBundle } from '../core/bundle';
import { bakeMatches, type BakedLesson } from '../core/bake';

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} → HTTP ${res.status};课包缺失或未构建,先跑 drawtell build <scene.ts>`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function loadBundle(id: string): Promise<ChalkScene> {
  const [sceneJson, manifest] = await Promise.all([
    fetchJson(`/bundles/${id}/scene.json`),
    fetchJson(`/bundles/${id}/manifest.json`),
  ]);
  try {
    return parseBundle(sceneJson, manifest).scene;
  } catch (e) {
    throw new Error(`课包 ${id} ${(e as Error).message}`);
  }
}

/** 课包烤好的画面:bake.json 在、和 scene.json 的画面对得上才给;没有就 null(播放器现烤) */
export async function loadBaked(id: string): Promise<BakedLesson | null> {
  try {
    const [b, s] = await Promise.all([fetch(`/bundles/${id}/bake.json`), fetch(`/bundles/${id}/scene.json`)]);
    if (!b.ok || !s.ok) return null;
    const baked: unknown = await b.json();
    return bakeMatches(baked, (await s.json()) as { skeletons?: unknown; background?: unknown }) ? baked : null;
  } catch {
    return null;
  }
}
