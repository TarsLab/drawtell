/**
 * drawtell/player —— 接力式播放器(ChalkPlayer):画面是烤好的(bake.json,drawtell/render 现画),时钟自己管;
 * 步边界停 = 气口,点一下继续。这里不静态 import excalidraw:没烤过的课包,ChalkPlayer 才按需装 drawtell/bake 现烤。
 * 接力点(已揭示元素并入 live 画布让孩子画)不在此包当前范围。
 */
export { ChalkPlayer } from './ChalkPlayer.tsx';
export type { ChalkPlayerProps, ChalkPlayerHandle } from './ChalkPlayer.tsx';
export type { ChalkScene, ChalkSkeleton, ChalkErase, ChalkBoard, ChalkStep, ChalkPhase, ChalkLayer, ChalkBlock, ChalkSubscene, ChalkBackground } from './types.ts';
export { blockBounds, allBlockBounds } from './blocks.ts';
export type { BlockBounds } from './blocks.ts';
export { computeStepWindows, durationOf, freezeTimeSec, FREEZE_EPS_MS, START_MS, stretchToAudio } from './timeline.ts';
export type { StretchInfo } from './timeline.ts';
export { seedFromId } from './seed.ts';
export { DEFAULT_POINTER_IMG } from './pointer.ts';
