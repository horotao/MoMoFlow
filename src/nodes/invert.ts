import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export type InvertData = { label?: string; locked?: boolean; baseImage?: FileAsset; result?: FileAsset; outputRevision?: string };

export function invertDocument(data: InvertData) {
  return { label: data.label, locked: data.locked, baseImage: data.baseImage };
}

export function invertRevision(inputId: string) {
  return JSON.stringify([inputId, 'invert-rgb-v1']);
}

export function restoreInvertData(value: unknown): InvertData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as InvertData;
  if (data.baseImage && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image')) return;
  return { baseImage: data.baseImage, label: typeof data.label === 'string' ? data.label : undefined, locked: false };
}

// Invert RGB without thresholding soft mask edges or changing alpha.
export function invertPixels(pixels: Uint8ClampedArray): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels);
  for (let i = 0; i < result.length; i += 4) {
    result[i] = 255 - result[i];
    result[i + 1] = 255 - result[i + 1];
    result[i + 2] = 255 - result[i + 2];
  }
  return result;
}
