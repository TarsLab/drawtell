/**
 * drawtell/player —— manifest 播放器:excalidraw-animate SVG 逐笔播放。
 *
 * 机制:skeleton → SVG → SMIL 逐笔 + 笔尖跟随;步边界暂停 = 气口,点一下继续。
 * 接力点(已揭示元素并入 live 画布让孩子画)不在此包当前范围。
 */
export { ChalkPlayer } from './ChalkPlayer.tsx';
export type { ChalkPlayerProps, ChalkPlayerHandle } from './ChalkPlayer.tsx';
export type { ChalkScene, ChalkSkeleton, ChalkStep, ChalkPhase, ChalkLayer, ChalkBlock, ChalkSubscene } from './types.ts';
export { blockBounds, allBlockBounds } from './blocks.ts';
export type { BlockBounds } from './blocks.ts';
export { computeStepWindows, durationOf, freezeTimeSec, FREEZE_EPS_MS, START_MS, stretchToAudio } from './timeline.ts';
export type { StretchInfo } from './timeline.ts';
export { buildAnimatedSvg, seedFromId } from './excalidraw-io.ts';
export { DEFAULT_POINTER_IMG } from './pointer.ts';
