/**
 * 接力画图播放器:软件画一步,气口停,点一下继续(朗读子产品"接力朗读"的图形孪生)。
 *
 * 驱动方式:整条 SMIL 时间轴连续编排,步边界处 pauseAnimations();
 * 边界取自 timeline.ts 的确定性计算,气口(pauseAfter)等待点击后 unpause。
 * 配音:步有 audioSrc(相对课包目录)时,该步开始即播讲稿音频,与画同时进行;
 * 一步结束 = 画完 且 音频放完(哪个晚等哪个),再进气口/下一步。音频取不到或放不出不拦流程。
 * 拉伸:有 audioDurationMs 的步(dub 写进 manifest;缺了就在装载时探测一次 metadata),
 * 建 SVG 前把该步笔画等比放大到 ≈ 音频时长(只拉不缩,封顶 maxStretch)——画跟着讲走。
 * iOS 自动播放限制:全程复用同一个 <audio>,第一次 play() 发生在孩子点击的调用链里,之后就不再受限。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAnimatedSvg } from './excalidraw-io.ts';
import { DEFAULT_POINTER_IMG } from './pointer.ts';
import { computeStepWindows, FREEZE_EPS_MS, freezeTimeSec, START_MS, stretchToAudio, type StepWindow } from './timeline.ts';
import type { ChalkPhase, ChalkScene } from './types.ts';

/**
 * 兜底:manifest 没写 audioDurationMs 但有 audioSrc 的步(手工放的音频),装载时读一次 metadata 拿时长。
 * 有 audioDurationMs 的步跳过(返回 undefined 让 stretchToAudio 用 manifest 值);失败/超时也是 undefined(不拉伸)。
 */
function probeAudioDurations(scene: ChalkScene, base: string): Promise<Array<number | undefined>> {
  return Promise.all(
    scene.steps.map((s) => {
      if (!s.audioSrc || s.audioDurationMs) return Promise.resolve(undefined);
      return new Promise<number | undefined>((resolve) => {
        const a = new Audio();
        const done = (v: number | undefined) => {
          a.onloadedmetadata = null;
          a.onerror = null;
          resolve(v);
        };
        const t = setTimeout(() => done(undefined), 3000);
        a.preload = 'metadata';
        a.onloadedmetadata = () => {
          clearTimeout(t);
          done(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : undefined);
        };
        a.onerror = () => {
          clearTimeout(t);
          done(undefined);
        };
        a.src = `${base}${s.audioSrc}`;
      });
    }),
  );
}

function stopAudio(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  audio.pause();
}

export interface ChalkPlayerProps {
  scene: ChalkScene;
  /** 画完一步是否允许点击跳过正在画的笔(打磨台用;孩子端默认关) */
  allowSkip?: boolean;
  /** 装载后直接定格在第 n 步画完处(1 起;0 = 空板),snap 截图用 */
  seekStep?: number;
  pointerImg?: string;
  /** 是否画笔尖(默认画);snap --no-cursor 关掉,keyframe 只剩笔迹 */
  pointer?: boolean;
  /** 课包目录 URL(如 /bundles/<id>/),步的 audioSrc 相对它;不给则不放音 */
  audioBaseUrl?: string;
  /** 按讲稿音频时长拉伸该步笔画(默认开;只拉不缩) */
  stretchToAudio?: boolean;
  /** 拉伸封顶倍数(默认 5) */
  maxStretch?: number;
  onPhaseChange?: (phase: ChalkPhase, stepIndex: number) => void;
}

export function ChalkPlayer({ scene, allowSkip, seekStep, pointerImg, pointer = true, audioBaseUrl, stretchToAudio: stretch = true, maxStretch = 5, onPhaseChange }: ChalkPlayerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const windowsRef = useRef<StepWindow[]>([]);
  const rafRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 一步的两个完成条件:画完、音频放完
  const drawDoneRef = useRef(false);
  const audioDoneRef = useRef(true);
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

  // 场景装载:(可选)探测音频时长 → 按音频拉伸笔画 → skeleton → 动画 SVG,暂停在 0
  useEffect(() => {
    let cancelled = false;
    cancelAnimationFrame(rafRef.current);
    transition('loading', 0);
    (async () => {
      let skeletons = scene.skeletons;
      if (stretch) {
        const probed = audioBaseUrl ? await probeAudioDurations(scene, audioBaseUrl) : undefined;
        if (cancelled) return;
        skeletons = stretchToAudio(scene.skeletons, scene.steps, { maxStretch, durations: probed }).skeletons;
      }
      const { svg } = await buildAnimatedSvg(skeletons, {
        pointerImg: pointer ? (pointerImg ?? DEFAULT_POINTER_IMG) : undefined,
        pointerWidth: '30',
      });
      if (cancelled || !stageRef.current) return;
      windowsRef.current = computeStepWindows(skeletons, scene.steps);
      svg.removeAttribute('height');
      svg.removeAttribute('width');
      svg.style.width = '100%';
      svg.style.height = 'auto';
      stageRef.current.replaceChildren(svg);
      svgRef.current = svg;
      if (seekStep != null && seekStep > 0) {
        // 定格:SMIL 暂停态下 setCurrentTime 同步渲染到该时刻
        const idx = Math.min(seekStep, scene.steps.length) - 1;
        svg.setCurrentTime(freezeTimeSec(windowsRef.current[idx]));
        transition(idx >= scene.steps.length - 1 ? 'done' : 'gap', idx);
      } else {
        transition('ready', 0);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stopAudio(audioRef.current);
    };
  }, [scene, pointerImg, pointer, seekStep, audioBaseUrl, stretch, maxStretch, transition]);

  // 一步收尾:画完且音频放完才算;之后按 pauseAfter 进气口或直接下一步
  const finishStep = useCallback(
    (step: number) => {
      if (!drawDoneRef.current || !audioDoneRef.current) return;
      if (phaseRef.current !== 'drawing' || stepRef.current !== step) return;
      const isLast = step >= scene.steps.length - 1;
      if (isLast) transition('done', step);
      else if (scene.steps[step].pauseAfter) transition('gap', step);
      else drawStepRef.current?.(step + 1);
    },
    [scene, transition],
  );
  const drawStepRef = useRef<((step: number) => void) | null>(null);

  // 起本步音频:没有 audioSrc / 没有 base / 加载失败 都视作"音频已完成",不拦画
  const startAudio = useCallback(
    (step: number) => {
      const src = scene.steps[step].audioSrc;
      if (!src || !audioBaseUrl) {
        audioDoneRef.current = true;
        return;
      }
      const audio = audioRef.current ?? (audioRef.current = new Audio());
      audioDoneRef.current = false;
      const done = () => {
        if (audioDoneRef.current) return;
        audioDoneRef.current = true;
        finishStep(step);
      };
      audio.onended = done;
      audio.onerror = done;
      audio.src = `${audioBaseUrl}${src}`;
      audio.currentTime = 0;
      audio.play().catch(done);
    },
    [scene, audioBaseUrl, finishStep],
  );

  // 画一步:unpause,rAF 盯到步尾即精确停在边界;同时起音频
  const drawStep = useCallback(
    (step: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const win = windowsRef.current[step];
      transition('drawing', step);
      drawDoneRef.current = false;
      startAudio(step);
      svg.unpauseAnimations();
      const tick = () => {
        if (phaseRef.current !== 'drawing' || svgRef.current !== svg) return;
        if (svg.getCurrentTime() * 1000 >= win.endMs - FREEZE_EPS_MS) {
          svg.pauseAnimations();
          svg.setCurrentTime(freezeTimeSec(win));
          drawDoneRef.current = true;
          finishStep(step);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [scene, transition, startAudio, finishStep],
  );
  drawStepRef.current = drawStep;

  const restart = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    cancelAnimationFrame(rafRef.current);
    stopAudio(audioRef.current);
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
        if (allowSkip) {
          // 打磨台快进:画与音都跳到步尾
          stopAudio(audioRef.current);
          audioDoneRef.current = true;
          svg.setCurrentTime(freezeTimeSec(windowsRef.current[stepRef.current]));
        }
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
