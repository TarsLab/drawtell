/**
 * chalk-player —— manifest 播放器,引擎 a:excalidraw-animate SVG 逐笔播放(M5)。
 *
 * 机制:skeleton → SVG → SMIL 逐笔 + 笔尖跟随;步边界暂停 = 气口,点一下继续。
 * 接力点(已揭示元素并入 live 画布让孩子画)是 M6,不在此包当前范围。
 */
export { ChalkPlayer } from './ChalkPlayer';
export type { ChalkPlayerProps } from './ChalkPlayer';
export type { ChalkScene, ChalkSkeleton, ChalkStep, ChalkPhase } from './types';
export { computeStepWindows, durationOf, START_MS } from './timeline';
export { buildAnimatedSvg } from './excalidraw-io';
export { DEFAULT_POINTER_IMG } from './pointer';
