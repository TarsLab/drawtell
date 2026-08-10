/**
 * 打磨台:切场景、看步序、验动画。大人自用,过"可以给孩子看"再进 M5 课包流程。
 */

import { useCallback, useState } from 'react';
import { ChalkPlayer } from '../player';
import type { ChalkPhase, ChalkScene } from '../player';
import { dengche } from '../../scenes/dengche';
import { zuqiu } from '../../scenes/zuqiu';

const SCENES: ChalkScene[] = [dengche, zuqiu];

export function App() {
  const [scene, setScene] = useState(SCENES[0]);
  const [phase, setPhase] = useState<ChalkPhase>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  // 换 key 强制重建播放器 = 重播
  const [runId, setRunId] = useState(0);

  const onPhaseChange = useCallback((p: ChalkPhase, s: number) => {
    setPhase(p);
    setStepIndex(s);
  }, []);

  return (
    <div className="bench">
      <header className="bench-bar">
        <strong>drawtell 打磨台</strong>
        {SCENES.map((s) => (
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
        ))}
        <button onClick={() => setRunId((n) => n + 1)}>↻ 重播</button>
        <span className="bench-meta">
          {scene.template} · 步 {Math.min(stepIndex + 1, scene.steps.length)}/{scene.steps.length} · {phase}
        </span>
      </header>
      <p className="bench-problem">{scene.problem}</p>
      <ChalkPlayer key={`${scene.id}-${runId}`} scene={scene} allowSkip onPhaseChange={onPhaseChange} />
      <p className="bench-hint">点画面:开始 / 气口继续 / 画到一半点一下 = 快进本步(打磨台专属)</p>
    </div>
  );
}
