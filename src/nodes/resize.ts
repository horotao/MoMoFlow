import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export type ResizeSettings = { width?: number; height?: number; lockAspectRatio: boolean; aspectRatio?: number };
export type ResizeData = { label?: string; locked?: boolean; settings: ResizeSettings; baseImage?: FileAsset; result?: FileAsset; outputRevision?: string };
export type ImageSize = { width: number; height: number };
export const defaultResizeSettings: ResizeSettings = { lockAspectRatio: true };
export const maxResizeDimension = 16384;
const maxResizePixels = 64 * 1024 * 1024;

export function validResizeSize(size: ImageSize) {
  return [size.width, size.height].every(value => Number.isInteger(value) && value >= 1 && value <= maxResizeDimension)
    && size.width * size.height <= maxResizePixels;
}

export function resizeSize(settings: ResizeSettings, source: ImageSize): ImageSize {
  return { width: settings.width ?? source.width, height: settings.height ?? source.height };
}

export function toggleResizeAspectRatio(settings: ResizeSettings): ResizeSettings {
  return { ...settings, lockAspectRatio: !settings.lockAspectRatio, aspectRatio: undefined };
}

// Capture the current ratio on the first locked edit, then keep it through
// rounding. Legacy documents without a ratio adopt their current dimensions.
// Clearing it on unlock/reset lets the next edit adopt the new custom/source ratio.
export function changeResizeDimension(settings: ResizeSettings, current: ImageSize, axis: 'width' | 'height', value: number): ResizeSettings | undefined {
  if (!Number.isFinite(value) || value < 1) return;
  const size = { ...current, [axis]: Math.round(value) };
  const aspectRatio = settings.lockAspectRatio ? settings.aspectRatio ?? current.width / current.height : undefined;
  if (aspectRatio !== undefined) {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
    const other = axis === 'width' ? 'height' : 'width';
    size[other] = Math.max(1, Math.round(axis === 'width' ? size.width / aspectRatio : size.height * aspectRatio));
  }
  return validResizeSize(size) ? { ...settings, ...size, aspectRatio } : undefined;
}

export function resizeDocument(data: ResizeData) {
  return { label: data.label, locked: data.locked, settings: data.settings, baseImage: data.baseImage };
}

export function resizeRevision(data: Pick<ResizeData, 'settings'>, inputId: string) {
  return JSON.stringify([inputId, 'resize-v1', data.settings.width ?? null, data.settings.height ?? null]);
}

export function restoreResizeData(value: unknown): ResizeData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as ResizeData;
  const settings = data.settings;
  if (!settings || typeof settings.lockAspectRatio !== 'boolean'
    || (settings.aspectRatio !== undefined && (!Number.isFinite(settings.aspectRatio) || settings.aspectRatio <= 0))
    || ((settings.width !== undefined || settings.height !== undefined) && !validResizeSize({ width: settings.width!, height: settings.height! }))
    || (data.baseImage && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image'))) return;
  return { settings: { width: settings.width, height: settings.height, lockAspectRatio: settings.lockAspectRatio,
    ...(settings.aspectRatio !== undefined ? { aspectRatio: settings.aspectRatio } : {}) },
    baseImage: data.baseImage, label: typeof data.label === 'string' ? data.label : undefined, locked: false };
}
