import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export type CropRect = { x: number; y: number; width: number; height: number };
export type CropData = {
  label?: string; locked?: boolean;
  rect: CropRect; aspectLocked: boolean;
  baseImage?: FileAsset; result?: FileAsset; outputRevision?: string;
};
export const cropRatios = ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'] as const;
export const fullCrop: CropRect = { x: 0, y: 0, width: 1, height: 1 };
export const defaultCropData: CropData = { rect: fullCrop, aspectLocked: false };
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function cropDocument(data: CropData) {
  return { label: data.label, locked: data.locked, rect: data.rect, aspectLocked: data.aspectLocked, baseImage: data.baseImage };
}
export function cropRevision(data: CropData, inputId: string) {
  return JSON.stringify([inputId, data.rect]);
}
export function restoreCropData(value: unknown): CropData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as CropData, r = data.rect;
  if (!r || ![r.x, r.y, r.width, r.height].every(Number.isFinite)
    || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x + r.width > 1.000001 || r.y + r.height > 1.000001
    || typeof data.aspectLocked !== 'boolean'
    || (data.baseImage && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image'))) return;
  return { ...cropDocument(data), locked: false, label: typeof data.label === 'string' ? data.label : undefined };
}
export function cropPixels(rect: CropRect, width: number, height: number): CropRect {
  const x = clamp(Math.round(rect.x * width), 0, width - 1);
  const y = clamp(Math.round(rect.y * height), 0, height - 1);
  return { x, y, width: clamp(Math.round(rect.width * width), 1, width - x), height: clamp(Math.round(rect.height * height), 1, height - y) };
}
export function cropRatioLabel(rect: CropRect, width: number, height: number, locked: boolean) {
  if (!locked) return 'Custom';
  const ratio = rect.width * width / (rect.height * height);
  return cropRatios.find(value => { const [w, h] = value.split(':').map(Number); return Math.abs(ratio - w / h) < .005; }) ?? 'Custom';
}
export function fitCropRatio(rect: CropRect, ratio: number, width: number, height: number): CropRect {
  const normalized = ratio * height / width;
  const w = Math.min(rect.width, rect.height * normalized), h = w / normalized;
  return { x: rect.x + (rect.width - w) / 2, y: rect.y + (rect.height - h) / 2, width: w, height: h };
}
export function resizeCropDimension(rect: CropRect, axis: 'width' | 'height', value: number, width: number, height: number, locked: boolean): CropRect {
  if (!Number.isFinite(value) || value < 1) return rect;
  const next = { ...rect, [axis]: Math.round(value) / (axis === 'width' ? width : height) };
  if (locked) {
    if (axis === 'width') next.height = next.width * rect.height / rect.width;
    else next.width = next.height * rect.width / rect.height;
    const scale = Math.min(1, (1 - rect.x) / next.width, (1 - rect.y) / next.height);
    next.width *= scale; next.height *= scale;
  } else {
    next.width = Math.min(next.width, 1 - rect.x);
    next.height = Math.min(next.height, 1 - rect.y);
  }
  return next;
}
export type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export function dragCrop(rect: CropRect, handle: CropHandle, dx: number, dy: number, locked: boolean, width: number, height: number): CropRect {
  if (handle === 'move') return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.width), y: clamp(rect.y + dy, 0, 1 - rect.height) };
  const west = handle.includes('w'), east = handle.includes('e'), north = handle.includes('n'), south = handle.includes('s');
  const anchorX = west ? rect.x + rect.width : east ? rect.x : rect.x + rect.width / 2;
  const anchorY = north ? rect.y + rect.height : south ? rect.y : rect.y + rect.height / 2;
  let w = clamp(rect.width + (west ? -dx : east ? dx : 0), 1 / width, west ? anchorX : east ? 1 - anchorX : 2 * Math.min(anchorX, 1 - anchorX));
  let h = clamp(rect.height + (north ? -dy : south ? dy : 0), 1 / height, north ? anchorY : south ? 1 - anchorY : 2 * Math.min(anchorY, 1 - anchorY));
  if (locked) {
    const ratio = rect.width / rect.height;
    if (!(west || east) || ((north || south) && Math.abs(dy / rect.height) > Math.abs(dx / rect.width))) w = h * ratio;
    else h = w / ratio;
    const maxW = west ? anchorX : east ? 1 - anchorX : 2 * Math.min(anchorX, 1 - anchorX);
    const maxH = north ? anchorY : south ? 1 - anchorY : 2 * Math.min(anchorY, 1 - anchorY);
    const scale = Math.min(1, maxW / w, maxH / h);
    w *= scale; h *= scale;
  }
  return { x: west ? anchorX - w : east ? anchorX : anchorX - w / 2, y: north ? anchorY - h : south ? anchorY : anchorY - h / 2, width: w, height: h };
}
