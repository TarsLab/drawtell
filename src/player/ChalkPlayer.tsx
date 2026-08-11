/**
 * 接力画图播放器:软件画一步,气口停,点一下继续(拾贝"接力朗读"的图形孪生)。
 *
 * 驱动方式:整条 SMIL 时间轴连续编排,步边界处 pauseAnimations();
 * 边界取自 timeline.ts 的确定性计算,气口(pauseAfter)等待点击后 unpause。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAnimatedSvg } from './excalidraw-io';
import { DEFAULT_POINTER_IMG } from './pointer';
import { computeStepWindows, START_MS, type StepWindow } from './timeline';
import type { ChalkPhase, ChalkScene } from './types';

export interface ChalkPlayerProps {
  scene: ChalkScene;
  /** 画完一步是否允许点击跳过正在画的笔(打磨台用;孩子端默认关) */
  allowSkip?: boolean;
  /** 装载后直接定格在第 n 步画完处(1 起;0 = 空板),snap 截图用 */
  seekStep?: number;
  pointerImg?: string;
  onPhaseChange?: (phase: ChalkPhase, stepIndex: number) => void;
}

export function ChalkPlayer({ scene, allowSkip, seekStep, pointerImg, onPhaseChange }: ChalkPlayerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const windowsRef = useRef<StepWindow[]>([]);
  const rafRef = useRef(0);
  const [phase, setPhase] = useState<ChalkPhase>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  const phaseRef = useRef(phase);
  const stepRef = useRef(stepIndex);

  const transition = useCallback(
    (next: ChalkPhase, step: number) => {
      phaseRef.current = next;
      stepRef.current = step;
      setPhase(next);
      setStepIndex(step);
      onPhaseChange?.(next, step);
    },
    [onPhaseChange],
  );

  // 场景装载:skeleton → 动画 SVG,暂停在 0
  useEffect(() => {
    let cancelled = false;
    cancelAnimationFrame(rafRef.current);
    transition('loading', 0);
    buildAnimatedSvg(scene.skeletons, {
      pointerImg: pointerImg ?? DEFAULT_POINTER_IMG,
      pointerWidth: '30',
    }).then(({ svg }) => {
      if (cancelled || !stageRef.current) return;
      windowsRef.current = computeStepWindows(scene.skeletons, scene.steps);
      svg.removeAttribute('height');
      svg.removeAttribute('width');
      svg.style.width = '100%';
      svg.style.height = 'auto';
      stageRef.current.replaceChildren(svg);
      svgRef.current = svg;
      if (seekStep != null && seekStep > 0) {
        // 定格:SMIL 暂停态下 setCurrentTime 同步渲染到该时刻
        const idx = Math.min(seekStep, scene.steps.length) - 1;
        svg.setCurrentTime(windowsRef.current[idx].endMs / 1000);
        transition(idx >= scene.steps.length - 1 ? 'done' : 'gap', idx);
      } else {
        transition('ready', 0);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [scene, pointerImg, seekStep, transition]);

  // 画一步:unpause,rAF 盯到步尾即精确停在边界
  const drawStep = useCallback(
    (step: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const win = windowsRef.current[step];
      transition('drawing', step);
      svg.unpauseAnimations();
      const tick = () => {
        if (phaseRef.current !== 'drawing' || svgRef.current !== svg) return;
        if (svg.getCurrentTime() * 1000 >= win.endMs) {
          svg.pauseAnimations();
          svg.setCurrentTime(win.endMs / 1000);
          const isLast = step >= scene.steps.length - 1;
          if (isLast) transition('done', step);
          else if (scene.steps[step].pauseAfter) transition('gap', step);
          else drawStep(step + 1);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [scene, transition],
  );

  const restart = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    cancelAnimationFrame(rafRef.current);
    svg.pauseAnimations();
    // 跳过 SMIL 前导留白,直接从第一笔前起画
    svg.setCurrentTime((START_MS - 200) / 1000);
    drawStep(0);
  }, [drawStep]);

  const handleTap = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    switch (phaseRef.current) {
      case 'ready':
        restart();
        break;
      case 'gap':
        drawStep(stepRef.current + 1);
        break;
      case 'drawing':
        if (allowSkip) svg.setCurrentTime(windowsRef.current[stepRef.current].endMs / 1000);
        break;
    }
  }, [allowSkip, drawStep, restart]);

  const line = phase === 'ready' || phase === 'loading' ? scene.problem : scene.steps[stepIndex].line;

  return (
    <div className="chalk-player" onPointerDown={handleTap}>
      <div className="chalk-stage" ref={stageRef} />
      {phase === 'ready' && seekStep == null && (
        <button className="chalk-start" type="button">
          ▶ 开始画
        </button>
      )}
      <div className={`chalk-caption chalk-caption-${phase}`}>
        {phase === 'gap' && <span className="chalk-tap-hint" aria-hidden />}
        <span>{line}</span>
        {phase === 'done' && <span className="chalk-done-mark">✓</span>}
      </div>
    </div>
  );
}
