import type { BlendSettings } from './blend';
export type BlendRequest = { type: 'source'; back?: ImageBitmap; front?: ImageBitmap } | { type: 'render'; settings: BlendSettings; draft: boolean; exportPng: boolean };
export type BlendReply = { bitmap?: ImageBitmap; blob?: Blob; width?: number; height?: number; error?: string };
