import { assetResources } from './assetResources.ts';
import type { FileAsset, ImageCropRect } from './types';

export type CropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'move';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function constrainCrop(rect: ImageCropRect, width: number, height: number): ImageCropRect {
  const x = clamp(Math.round(rect.x), 0, width - 1);
  const y = clamp(Math.round(rect.y), 0, height - 1);
  return { x, y, width: clamp(Math.round(rect.width), 1, width - x), height: clamp(Math.round(rect.height), 1, height - y) };
}

export function dragCrop(rect: ImageCropRect, handle: CropHandle, dx: number, dy: number,
  width: number, height: number, minimum = 1): ImageCropRect {
  if (handle === 'move') return { ...rect, x: clamp(rect.x + dx, 0, width - rect.width), y: clamp(rect.y + dy, 0, height - rect.height) };
  let left = rect.x, top = rect.y, right = left + rect.width, bottom = top + rect.height;
  const minWidth = Math.min(minimum, rect.width), minHeight = Math.min(minimum, rect.height);
  if (handle.includes('w')) left = clamp(left + dx, 0, right - minWidth);
  if (handle.includes('e')) right = clamp(right + dx, left + minWidth, width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - minHeight);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + minHeight, height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function sameCrop(a: ImageCropRect, b: ImageCropRect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export async function cropImageAsset(asset: FileAsset, rect: ImageCropRect): Promise<FileAsset> {
  const source = asset.crop?.source ?? asset;
  const release = assetResources.retain([source.url]);
  try {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error('无法读取原图，请重试。');
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const original = { ...source, width: bitmap.width, height: bitmap.height };
      const crop = constrainCrop(rect, bitmap.width, bitmap.height);
      if (sameCrop(crop, { x: 0, y: 0, width: bitmap.width, height: bitmap.height })) return original;
      const canvas = document.createElement('canvas');
      canvas.width = crop.width; canvas.height = crop.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法裁剪图片，请重试。');
      context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('无法保存裁剪图片。')), 'image/png'));
      const contentHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
      return { ...source, id: asset.id, name: `${source.name.replace(/\.[^.]+$/, '')}.png`, url: assetResources.create(blob),
        mimeType: 'image/png', size: blob.size, width: crop.width, height: crop.height, contentHash,
        crop: { source: original, rect: crop } };
    } finally { bitmap.close(); }
  } finally { release(); }
}
