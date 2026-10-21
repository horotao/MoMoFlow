import type { BlurSettings } from './blur';

export type BlurRequest = { type: 'source'; source: ImageBitmap }
  | { type: 'render'; settings: BlurSettings; exportPng: boolean; draft: boolean };
export type BlurReply = { bitmap?: ImageBitmap; blob?: Blob; width?: number; height?: number; error?: string };
