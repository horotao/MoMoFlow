import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export type BlurSettings = { type: 'box' | 'gaussian'; size: number };
export type BlurData = { label?: string; locked?: boolean; settings: BlurSettings; baseImage?: FileAsset; result?: FileAsset; outputRevision?: string };
export const defaultBlurSettings: BlurSettings = { type: 'gaussian', size: 50 };
export const blurControls = [{ key: 'size', label: 'Size', min: 1, max: 100, step: 1 }] as const;
export function blurDocument(data: BlurData) {
  return { label: data.label, locked: data.locked, settings: data.settings, baseImage: data.baseImage };
}
export function blurRevision(data: Pick<BlurData, 'settings'>, inputId: string) {
  return JSON.stringify([inputId, data.settings.type, data.settings.size,
    ...(data.settings.type === 'gaussian' ? ['gaussian-kernel-v1'] : []),
  ]);
}
export function restoreBlurData(value: unknown): BlurData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as BlurData;
  if (!data.settings || !['box', 'gaussian'].includes(data.settings.type)
    || !Number.isInteger(data.settings.size) || data.settings.size < 1 || data.settings.size > 100
    || (data.baseImage && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image'))) return;
  return { settings: { type: data.settings.type, size: data.settings.size }, baseImage: data.baseImage,
    label: typeof data.label === 'string' ? data.label : undefined, locked: false };
}

// Sliding separable box filter with clamped borders: cost is independent of radius.
function boxPass(source: Float32Array, target: Float32Array, width: number, height: number, radius: number, horizontal: boolean) {
  const length = horizontal ? width : height, lines = horizontal ? height : width;
  const stride = horizontal ? 4 : width * 4, lineStride = horizontal ? width * 4 : 4;
  const divisor = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride;
    for (let channel = 0; channel < 4; channel++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += source[base + Math.min(length - 1, Math.max(0, k)) * stride + channel];
      for (let x = 0; x < length; x++) {
        target[base + x * stride + channel] = sum / divisor;
        sum += source[base + Math.min(length - 1, x + radius + 1) * stride + channel]
          - source[base + Math.max(0, x - radius) * stride + channel];
      }
    }
  }
}

// Sample the Gaussian at pixel centers, truncate at 4 sigma and normalize.
// Horizontal + vertical convolution is mathematically the same separable kernel
// as a two-dimensional Gaussian; neither pass rounds intermediate color values.
function gaussianPass(source: Float32Array, target: Float32Array, width: number, height: number, sigma: number, horizontal: boolean) {
  const radius = Math.ceil(4 * sigma);
  const weights = new Float64Array(radius + 1);
  let total = 0;
  for (let k = 0; k <= radius; k++) {
    weights[k] = Math.exp(-.5 * (k / sigma) ** 2);
    total += weights[k] * (k === 0 ? 1 : 2);
  }
  for (let k = 0; k <= radius; k++) weights[k] /= total;
  const length = horizontal ? width : height, lines = horizontal ? height : width;
  const stride = horizontal ? 4 : width * 4, lineStride = horizontal ? width * 4 : 4;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride;
    for (let x = 0; x < length; x++) {
      const index = base + x * stride;
      let r = source[index] * weights[0], g = source[index + 1] * weights[0];
      let b = source[index + 2] * weights[0], a = source[index + 3] * weights[0];
      const interior = x >= radius && x + radius < length;
      for (let k = 1; k <= radius; k++) {
        const left = interior ? index - k * stride : base + Math.max(0, x - k) * stride;
        const right = interior ? index + k * stride : base + Math.min(length - 1, x + k) * stride;
        const weight = weights[k];
        r += (source[left] + source[right]) * weight;
        g += (source[left + 1] + source[right + 1]) * weight;
        b += (source[left + 2] + source[right + 2]) * weight;
        a += (source[left + 3] + source[right + 3]) * weight;
      }
      target[index] = r; target[index + 1] = g; target[index + 2] = b; target[index + 3] = a;
    }
  }
}

// Filter premultiplied RGBA so invisible colors cannot create halos.
export function blurPixels(pixels: Uint8ClampedArray, width: number, height: number, settings: BlurSettings, scale = 1) {
  if (width < 1 || height < 1 || pixels.length !== width * height * 4) throw new Error('Invalid image dimensions');
  const amount = Math.max(0, settings.size - 1) * scale;
  if (amount === 0) return new Uint8ClampedArray(pixels);
  const source = new Float32Array(pixels.length), scratch = new Float32Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    source[i] = pixels[i] * alpha; source[i + 1] = pixels[i + 1] * alpha; source[i + 2] = pixels[i + 2] * alpha; source[i + 3] = pixels[i + 3];
  }
  if (settings.type === 'gaussian') {
    gaussianPass(source, scratch, width, height, amount / 3, true);
    gaussianPass(scratch, source, width, height, amount / 3, false);
  } else {
    const radius = Math.round(amount / 2);
    boxPass(source, scratch, width, height, radius, true);
    boxPass(scratch, source, width, height, radius, false);
  }
  const result = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = source[i + 3];
    result[i + 3] = alpha;
    if (alpha > 0) {
      result[i] = source[i] * 255 / alpha; result[i + 1] = source[i + 1] * 255 / alpha; result[i + 2] = source[i + 2] * 255 / alpha;
    }
  }
  return result;
}
