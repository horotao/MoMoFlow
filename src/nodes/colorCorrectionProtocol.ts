import type { ColorSettings } from './colorCorrection';

export type ColorRequest = { type: 'source'; source: ImageBitmap }
  | { type: 'render'; settings: ColorSettings; exportPng: boolean; draft: boolean };
export type ColorReply = { bitmap?: ImageBitmap; blob?: Blob; width?: number; height?: number; error?: string };
