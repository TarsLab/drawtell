/**
 * 打磨台 + serve 播放页。大人自用,过"可以给孩子看"再进课包流程。
 *
 * 无参:内置种子场景打磨台(pnpm dev)。
 * ?scene=<id>:从 /bundles/<id>/ 加载课包(drawtell serve;dev 有等价中间件)。
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
}

function readQuery(): Query {
  const p = new URLSearchParams(window.location.search);
  const step = p.get('step');
  return { sceneId: p.get('scene'), step: step === null ? null : Number(step), bare: p.get('bare') === '1' };
}

export function App() {
  const q = useMemo(readQuery, []);
  const [scene, setScene] = useState<ChalkScene | null>(q.sceneId ? null : BUILTIN[0]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<ChalkPhase>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  // 换 key 强制重建播放器 = 重播
  const [runId, setRunId] = useState(0);

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
        onPhaseChange={onPhaseChange}
      />
      {!q.bare && <p className="bench-hint">点画面:开始 / 气口继续 / 画到一半点一下 = 快进本步(打磨台专属)</p>}
    </div>
  );
}
