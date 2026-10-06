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
 *
 * transport(类似音乐播放器):暂停 / 继续 / 上一段 / 下一段(段 = step)。
 * 语义按「当前段」定:drawing/paused 在段 i,gap 停在刚画完的段 i,done 停在末段。
 * prev:gap/done 重看刚画完的这段;drawing 退上一段(连按 = 一路往回)。
 * next:跳到下一段开头;末段 next = 快进到 done。跳转都从段起点整段重画,不做段内 scrub。
 * 宿主两种接法:ref 拿 ChalkPlayerHandle 自绘 UI,或 controls 开内置控制条。
 * 静态场景(steps 空,template 'static'):装载即整幅定格,transport 全部无事发生。
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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

/** 背景图先解码好再亮板:否则 snap 会截到图还没出来的一帧;失败不拦流程(退成白板) */
function preloadImage(href: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = href;
  });
}

function stopAudio(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  audio.pause();
}

/** 运行时控制句柄(ref 拿到):seekTo 从段起点整段重画,越界自动夹到 0..steps-1 */
export interface ChalkPlayerHandle {
  pause(): void;
  resume(): void;
  /** ready/done → 从头播;drawing → 暂停/继续互切;gap → 继续下一段 */
  toggle(): void;
  next(): void;
  prev(): void;
  seekTo(step: number): void;
  isPaused(): boolean;
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
  /** 课包目录 URL(如 /bundles/<id>/),步的 audioSrc 与场景的 background.src 相对它;不给则不放音 */
  audioBaseUrl?: string;
  /** 按讲稿音频时长拉伸该步笔画(默认开;只拉不缩) */
  stretchToAudio?: boolean;
  /** 拉伸封顶倍数(默认 5) */
  maxStretch?: number;
  /** 内置控制条(⏮ ⏯ ⏭ + 段位);默认关,不改变既有布局。静态场景无论开关都不出现 */
  controls?: boolean;
  onPhaseChange?: (phase: ChalkPhase, stepIndex: number) => void;
}

export const ChalkPlayer = forwardRef<ChalkPlayerHandle, ChalkPlayerProps>(function ChalkPlayer(
  { scene, allowSkip, seekStep, pointerImg, pointer = true, audioBaseUrl, stretchToAudio: stretch = true, maxStretch = 5, controls, onPhaseChange }: ChalkPlayerProps,
  ref,
) {
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
  const [paused, setPaused] = useState(false);
  const phaseRef = useRef(phase);
  const stepRef = useRef(stepIndex);
  const pausedRef = useRef(false);

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

  const setPausedBoth = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPaused(v);
  }, []);

  // 场景装载:(可选)探测音频时长 → 按音频拉伸笔画 → skeleton → 动画 SVG,暂停在 0
  useEffect(() => {
    let cancelled = false;
    cancelAnimationFrame(rafRef.current);
    setPausedBoth(false);
    transition('loading', 0);
    (async () => {
      let skeletons = scene.skeletons;
      if (stretch) {
        const probed = audioBaseUrl ? await probeAudioDurations(scene, audioBaseUrl) : undefined;
        if (cancelled) return;
        skeletons = stretchToAudio(scene.skeletons, scene.steps, { maxStretch, durations: probed }).skeletons;
      }
      const bg = scene.background && { href: `${audioBaseUrl ?? ''}${scene.background.src}`, width: scene.background.width, height: scene.background.height };
      if (bg) await preloadImage(bg.href);
      if (cancelled) return;
      const { svg, finishedMs } = await buildAnimatedSvg(skeletons, {
        pointerImg: pointer ? (pointerImg ?? DEFAULT_POINTER_IMG) : undefined,
        pointerWidth: '30',
        background: bg,
      });
      if (cancelled || !stageRef.current) return;
      windowsRef.current = computeStepWindows(skeletons, scene.steps);
      svg.removeAttribute('height');
      svg.removeAttribute('width');
      svg.style.width = '100%';
      svg.style.height = 'auto';
      stageRef.current.replaceChildren(svg);
      svgRef.current = svg;
      if (!scene.steps.length) {
        // 静态场景(template 'static'):没有时间轴,装载即整幅定格;块交互由上层画布接管
        svg.setCurrentTime(finishedMs / 1000);
        transition('done', 0);
      } else if (seekStep != null && seekStep > 0) {
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
  }, [scene, pointerImg, pointer, seekStep, audioBaseUrl, stretch, maxStretch, transition, setPausedBoth]);

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

  // rAF 盯到步尾即精确停在边界;pause 会取消它,resume 重进
  const tickUntilEnd = useCallback(
    (step: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const win = windowsRef.current[step];
      const tick = () => {
        if (phaseRef.current !== 'drawing' || pausedRef.current || svgRef.current !== svg) return;
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
    [finishStep],
  );

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

  // 画一步:unpause 让 SMIL 走,同时起音频
  const drawStep = useCallback(
    (step: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      setPausedBoth(false);
      transition('drawing', step);
      drawDoneRef.current = false;
      startAudio(step);
      svg.unpauseAnimations();
      tickUntilEnd(step);
    },
    [transition, startAudio, tickUntilEnd, setPausedBoth],
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

  // ---- transport ----

  /** 跳到第 step 段的起点整段重画(0 起;越界夹到 0..steps-1) */
  const seekTo = useCallback(
    (step: number) => {
      const svg = svgRef.current;
      if (!svg || !scene.steps.length) return;
      const idx = Math.max(0, Math.min(step, scene.steps.length - 1));
      cancelAnimationFrame(rafRef.current);
      stopAudio(audioRef.current);
      svg.pauseAnimations();
      // 段起点 = 上一段末笔画完处;首段从前导留白后起画
      svg.setCurrentTime(idx === 0 ? (START_MS - 200) / 1000 : windowsRef.current[idx].startMs / 1000);
      drawStep(idx);
    },
    [scene, drawStep],
  );

  /** 快进到全部画完(末段 next 用):画与音都收掉,定格终局 */
  const finishToDone = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !scene.steps.length) return;
    cancelAnimationFrame(rafRef.current);
    stopAudio(audioRef.current);
    setPausedBoth(false);
    drawDoneRef.current = true;
    audioDoneRef.current = true;
    svg.pauseAnimations();
    const last = windowsRef.current.length - 1;
    svg.setCurrentTime(freezeTimeSec(windowsRef.current[last]));
    transition('done', last);
  }, [scene, transition, setPausedBoth]);

  const pause = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || phaseRef.current !== 'drawing' || pausedRef.current) return;
    setPausedBoth(true);
    cancelAnimationFrame(rafRef.current);
    svg.pauseAnimations();
    audioRef.current?.pause();
  }, [setPausedBoth]);

  const resume = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || phaseRef.current !== 'drawing' || !pausedRef.current) return;
    setPausedBoth(false);
    // 画未完才放行 SMIL——画已定格、只剩音频时 unpause 会闯进下一段的笔
    if (!drawDoneRef.current) {
      svg.unpauseAnimations();
      tickUntilEnd(stepRef.current);
    }
    if (!audioDoneRef.current) {
      audioRef.current?.play().catch(() => {
        audioDoneRef.current = true;
        finishStep(stepRef.current);
      });
    }
  }, [setPausedBoth, tickUntilEnd, finishStep]);

  const next = useCallback(() => {
    if (!scene.steps.length) return;
    const last = scene.steps.length - 1;
    switch (phaseRef.current) {
      case 'ready':
        restart();
        break;
      case 'gap':
        seekTo(stepRef.current + 1);
        break;
      case 'drawing':
        if (stepRef.current < last) seekTo(stepRef.current + 1);
        else finishToDone();
        break;
    }
  }, [scene, restart, seekTo, finishToDone]);

  const prev = useCallback(() => {
    if (!scene.steps.length) return;
    switch (phaseRef.current) {
      case 'gap':
        seekTo(stepRef.current); // 重看刚画完的这段
        break;
      case 'done':
        seekTo(scene.steps.length - 1);
        break;
      case 'drawing':
        seekTo(stepRef.current - 1); // seekTo 会夹到 0
        break;
    }
  }, [scene, seekTo]);

  const toggle = useCallback(() => {
    if (!scene.steps.length) return;
    switch (phaseRef.current) {
      case 'ready':
      case 'done':
        restart();
        break;
      case 'gap':
        drawStep(stepRef.current + 1);
        break;
      case 'drawing':
        if (pausedRef.current) resume();
        else pause();
        break;
    }
  }, [scene, restart, drawStep, resume, pause]);

  useImperativeHandle(ref, () => ({ pause, resume, toggle, next, prev, seekTo, isPaused: () => pausedRef.current }), [pause, resume, toggle, next, prev, seekTo]);

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
        if (pausedRef.current) {
          resume();
        } else if (allowSkip) {
          // 打磨台快进:画与音都跳到步尾
          stopAudio(audioRef.current);
          audioDoneRef.current = true;
          svg.setCurrentTime(freezeTimeSec(windowsRef.current[stepRef.current]));
        }
        break;
    }
  }, [allowSkip, drawStep, restart, resume]);

  const stepCount = scene.steps.length;
  const line = phase === 'ready' || phase === 'loading' || !stepCount ? scene.problem : scene.steps[stepIndex].line;
  const playing = phase === 'drawing' && !paused;

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
        {phase === 'done' && stepCount > 0 && <span className="chalk-done-mark">✓</span>}
      </div>
      {controls && stepCount > 0 && phase !== 'loading' && (
        <div className="chalk-transport" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-label="上一段" disabled={phase === 'ready'} onClick={prev}>
            ⏮
          </button>
          <button type="button" aria-label={playing ? '暂停' : '播放'} onClick={toggle}>
            {playing ? '⏸' : '▶'}
          </button>
          <button type="button" aria-label="下一段" disabled={phase === 'done'} onClick={next}>
            ⏭
          </button>
          <span className="chalk-transport-pos">
            {Math.min(stepIndex + 1, stepCount)}/{stepCount}
          </span>
        </div>
      )}
    </div>
  );
});
