import type { MatteGrowShrinkSettings } from './matteGrowShrink';

export type MatteGrowShrinkRequest = { type: 'source'; source: ImageBitmap }
  | { type: 'render'; settings: MatteGrowShrinkSettings; exportPng: boolean; draft: boolean };
export type MatteGrowShrinkReply = { bitmap?: ImageBitmap; blob?: Blob; width?: number; height?: number; error?: string };
