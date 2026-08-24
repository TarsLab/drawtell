/**
 * serve 播放页 + 打磨台。
 *
 * 无参:课包清单页(drawtell serve 下读 /api/bundles,iPad 入口;标题来自 /api/config = 工作区 drawtell.json 的 title)。
 *       拿不到清单(pnpm dev 没有 /api/bundles)或 &bench=1 → 内置种子场景打磨台(大人自用)。
 * ?scene=<id>:从 /bundles/<id>/ 加载课包(drawtell serve;dev 有等价中间件)。&cursor=0 不画笔尖。
 * &step=<n>:定格在第 n 步画完处(0 = 空板),snap 截图用;
 *            渲染就绪后置 body[data-drawtell-ready="1"] 供 playwright 等待。
 * &bare=1:隐藏台架工具条与提示,只留画面和讲稿。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChalkPlayer } from '../player';
import type { ChalkPhase, ChalkScene } from '../player';
import { bimoduo } from '../../scenes/bimoduo';
import { dengche } from '../../scenes/dengche';
import { zuqiu } from '../../scenes/zuqiu';
import { loadBundle } from './load-bundle';

const BUILTIN: ChalkScene[] = [dengche, zuqiu, bimoduo];

interface Query {
  sceneId: string | null;
  step: number | null;
  bare: boolean;
  /** &cursor=0 不画笔尖(snap --no-cursor) */
  cursor: boolean;
  /** &bench=1 强制进打磨台(无参时缺省是课包清单页) */
  bench: boolean;
}

function readQuery(): Query {
  const p = new URLSearchParams(window.location.search);
  const step = p.get('step');
  return { sceneId: p.get('scene'), step: step === null ? null : Number(step), bare: p.get('bare') === '1', cursor: p.get('cursor') !== '0', bench: p.get('bench') === '1' };
}

/** /api/bundles 的一行(serve.ts listBundles) */
interface BundleRow {
  id: string;
  title: string;
  model?: string;
  steps?: number;
}

/** 课包清单页:纯机制——列出派生根里有什么;"今晚讲哪几题"是应用层的事,不在这里 */
function Shelf({ rows, title }: { rows: BundleRow[]; title: string }) {
  return (
    <div className="shelf">
      <h1 className="shelf-title">{title}</h1>
      {rows.length === 0 && <p className="shelf-empty">还没有课包:先 drawtell build &lt;scene.ts&gt;</p>}
      <div className="shelf-grid">
        {rows.map((r) => (
          <a key={r.id} className="shelf-card" href={`?scene=${encodeURIComponent(r.id)}`}>
            <span className="shelf-card-title">{r.title}</span>
            <span className="shelf-card-sub">{[r.model, r.steps != null ? `${r.steps} 步` : null].filter(Boolean).join(' · ')}</span>
          </a>
        ))}
      </div>
      <p className="shelf-foot">
        <a href="?bench=1">打磨台(内置种子场景)</a>
      </p>
    </div>
  );
}

export function App() {
  const q = useMemo(readQuery, []);
  const [scene, setScene] = useState<ChalkScene | null>(q.sceneId ? null : BUILTIN[0]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<ChalkPhase>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  // 换 key 强制重建播放器 = 重播
  const [runId, setRunId] = useState(0);
  // 无参:先试课包清单;拿不到(dev 下 /api/bundles 不存在)就退回打磨台
  const [shelf, setShelf] = useState<'loading' | 'bench' | BundleRow[]>(q.sceneId || q.bench ? 'bench' : 'loading');
  const [title, setTitle] = useState('drawtell');

  useEffect(() => {
    if (shelf !== 'loading') return;
    let alive = true;
    (async () => {
      try {
        const [list, cfg] = await Promise.all([
          fetch('/api/bundles').then((r) => r.json() as Promise<unknown>),
          fetch('/api/config').then((r) => r.json() as Promise<{ title?: string }>).catch(() => ({}) as { title?: string }),
        ]);
        if (!Array.isArray(list)) throw new Error('not a list');
        if (!alive) return;
        if (cfg.title) {
          setTitle(cfg.title);
          document.title = cfg.title;
        }
        setShelf(list as BundleRow[]);
      } catch {
        if (alive) setShelf('bench');
      }
    })();
    return () => {
      alive = false;
    };
  }, [shelf]);

  useEffect(() => {
    if (!q.sceneId) return;
    loadBundle(q.sceneId)
      .then(setScene)
      .catch((e: unknown) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, [q.sceneId]);

  const onPhaseChange = useCallback((p: ChalkPhase, s: number) => {
    setPhase(p);
    setStepIndex(s);
    if (p !== 'loading') document.body.dataset.drawtellReady = '1';
  }, []);

  if (shelf === 'loading') {
    return (
      <div className="bench">
        <p className="bench-problem">课包清单加载中…</p>
      </div>
    );
  }
  if (shelf !== 'bench') return <Shelf rows={shelf} title={title} />;

  if (loadErr) {
    return (
      <div className="bench">
        <p className="bench-problem">⚠ {loadErr}</p>
      </div>
    );
  }
  if (!scene) {
    return (
      <div className="bench">
        <p className="bench-problem">课包加载中…</p>
      </div>
    );
  }

  return (
    <div className="bench">
      {!q.bare && (
        <header className="bench-bar">
          <strong>drawtell 打磨台</strong>
          {q.sceneId ? (
            <span className="bench-meta">
              课包 {scene.id}:{scene.title}·{scene.model}
            </span>
          ) : (
            BUILTIN.map((s) => (
              <button
                key={s.id}
                className={s.id === scene.id ? 'on' : ''}
                onClick={() => {
                  setScene(s);
                  setRunId((n) => n + 1);
                }}
              >
                {s.title}·{s.model}
              </button>
            ))
          )}
          <button onClick={() => setRunId((n) => n + 1)}>↻ 重播</button>
          <span className="bench-meta">
            {scene.template} · 步 {Math.min(stepIndex + 1, scene.steps.length)}/{scene.steps.length} · {phase}
          </span>
        </header>
      )}
      {!q.bare && <p className="bench-problem">{scene.problem}</p>}
      <ChalkPlayer
        key={`${scene.id}-${runId}`}
        scene={scene}
        allowSkip
        seekStep={q.step ?? undefined}
        pointer={q.cursor}
        audioBaseUrl={q.sceneId ? `/bundles/${encodeURIComponent(q.sceneId)}/` : undefined}
        controls={!q.bare}
        onPhaseChange={onPhaseChange}
      />
      {!q.bare && <p className="bench-hint">点画面:开始 / 气口继续 / 画到一半点一下 = 快进本步(打磨台专属);⏮ ⏯ ⏭ 像放音乐一样倒段、暂停、跳段</p>}
    </div>
  );
}
