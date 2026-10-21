import type { LevelsSettings, LevelsHistograms } from './levels';

export type LevelsRequest = { type: 'source'; source: ImageBitmap }
  | { type: 'render'; settings: LevelsSettings; exportPng: boolean; draft: boolean };
export type LevelsReply = { histogram?: LevelsHistograms; bitmap?: ImageBitmap; blob?: Blob; width?: number; height?: number; error?: string };
