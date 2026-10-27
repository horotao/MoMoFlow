import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export type MatteGrowShrinkSettings = { size: number };
export type MatteGrowShrinkData = {
  label?: string; locked?: boolean; settings: MatteGrowShrinkSettings;
  baseImage?: FileAsset; result?: FileAsset; outputRevision?: string;
};
export const defaultMatteGrowShrinkSettings: MatteGrowShrinkSettings = { size: 0 };
export const matteGrowShrinkControls = [{ key: 'size', label: '尺寸', min: -100, max: 100, step: 1 }] as const;
export function matteGrowShrinkDocument(data: MatteGrowShrinkData) {
  return { label: data.label, locked: data.locked, settings: data.settings, baseImage: data.baseImage };
}
export function matteGrowShrinkRevision(data: Pick<MatteGrowShrinkData, 'settings'>, inputId: string) {
  return JSON.stringify([inputId, data.settings.size, 'matte-square-v1']);
}
export function restoreMatteGrowShrinkData(value: unknown): MatteGrowShrinkData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as MatteGrowShrinkData;
  if (!data.settings || !Number.isInteger(data.settings.size) || Math.abs(data.settings.size) > 100
    || (data.baseImage !== undefined && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image'))) return;
  return { settings: { size: data.settings.size }, baseImage: data.baseImage,
    label: typeof data.label === 'string' ? data.label : undefined, locked: false };
}

// Monotonic sliding windows: two separable extrema passes implement a square
// structuring element in O(width * height), independent of the selected radius.
// Clamp borders to the nearest source pixel, keeping flat masks unchanged.
function extremaPass(source: Uint8ClampedArray, target: Uint8ClampedArray,
  width: number, height: number, radius: number, grow: boolean, horizontal: boolean) {
  const length = horizontal ? width : height, lines = horizontal ? height : width;
  const stride = horizontal ? 1 : width, lineStride = horizontal ? width : 1;
  const queue = new Int32Array(length);
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride;
    let head = 0, tail = 0, next = 0;
    for (let x = 0; x < length; x++) {
      const right = Math.min(length - 1, x + radius);
      while (next <= right) {
        const value = source[base + next * stride];
        while (tail > head && (grow ? source[base + queue[tail - 1] * stride] <= value
          : source[base + queue[tail - 1] * stride] >= value)) tail--;
        queue[tail++] = next++;
      }
      while (head < tail && queue[head] < x - radius) head++;
      target[base + x * stride] = source[base + queue[head] * stride];
    }
  }
}

// White is selected, black is unselected; preserve intermediate matte coverage.
// Composite transparent input over black before converting RGB to luminance.
export function matteGrowShrinkPixels(pixels: Uint8ClampedArray, width: number, height: number,
  settings: MatteGrowShrinkSettings, scale = 1) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || pixels.length !== width * height * 4 || !Number.isFinite(settings.size)
    || Math.abs(settings.size) > 100 || !Number.isFinite(scale) || scale <= 0) throw new Error('Invalid matte settings or dimensions');
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    mask[i] = (pixels[p] * .2126 + pixels[p + 1] * .7152 + pixels[p + 2] * .0722) * pixels[p + 3] / 255;
  }
  const radius = Math.round(Math.abs(settings.size) * scale);
  if (radius) {
    const scratch = new Uint8ClampedArray(mask.length);
    extremaPass(mask, scratch, width, height, radius, settings.size > 0, true);
    extremaPass(scratch, mask, width, height, radius, settings.size > 0, false);
  }
  const output = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    output[p] = output[p + 1] = output[p + 2] = mask[i];
    output[p + 3] = 255;
  }
  return output;
}
