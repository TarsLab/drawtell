/**
 * 课包 → 场景:播放页从 /bundles/<id>/ 取回 build 产物,拼回 ChalkScene。
 * 进播放器前过一遍 zod——课包可能是旧版本或被手改过,错误要能说清楚。
 */

import type { ChalkScene } from '../player';
import { sceneSchema } from '../schema/scene';

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
  const raw = {
    id: sceneJson.id,
    title: sceneJson.title,
    problem: sceneJson.problem,
    model: sceneJson.model,
    template: sceneJson.template,
    skeletons: sceneJson.skeletons,
    steps: manifest.steps,
  };
  const parsed = sceneSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.')}:${i.message}`)
      .join(';');
    throw new Error(`课包 ${id} 不符合场景契约:${first}`);
  }
  return parsed.data;
}
