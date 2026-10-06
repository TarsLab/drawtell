import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bakeSkeletons } from '../player/bake';
import { loadBundle } from './load-bundle';
import '../player/chalk-player.css';
import './bench.css';

// ?bake=<课包 id>:drawtell bake 用 playwright 打开这一页,在浏览器里把画面烤好放到 window.__drawtellBake(不画界面)
const bake = new URLSearchParams(location.search).get('bake');
if (bake) {
  const w = window as unknown as { __drawtellBake?: unknown; __drawtellBakeError?: string };
  loadBundle(bake)
    .then((scene) => bakeSkeletons(scene.skeletons, { background: scene.background }))
    .then((r) => { w.__drawtellBake = r; }, (e: unknown) => { w.__drawtellBakeError = e instanceof Error ? e.message : String(e); })
    .finally(() => { document.body.dataset.drawtellBaked = '1'; });
} else {
  createRoot(document.getElementById('root')!).render(<App />);
}
