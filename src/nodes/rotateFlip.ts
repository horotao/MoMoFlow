import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export type RotateFlipSettings = { rotation: 0 | 90 | 180 | 270; flipHorizontal: boolean; flipVertical: boolean };
export type RotateFlipData = { label?: string; locked?: boolean; settings: RotateFlipSettings; baseImage?: FileAsset; result?: FileAsset; outputRevision?: string };
export const defaultRotateFlipSettings: RotateFlipSettings = { rotation: 0, flipHorizontal: false, flipVertical: false };
export type RotateFlipAction = 'rotate' | 'horizontal' | 'vertical' | 'reset';

export function changeRotateFlip(settings: RotateFlipSettings, action: RotateFlipAction): RotateFlipSettings {
  if (action === 'reset') return { ...defaultRotateFlipSettings };
  if (action === 'rotate') return { ...settings, rotation: ((settings.rotation + 90) % 360) as RotateFlipSettings['rotation'] };
  if (action === 'horizontal') return { ...settings, flipHorizontal: !settings.flipHorizontal };
  return { ...settings, flipVertical: !settings.flipVertical };
}

export function rotateFlipDocument(data: RotateFlipData) {
  return { label: data.label, locked: data.locked, settings: data.settings, baseImage: data.baseImage };
}

export function rotateFlipRevision(data: Pick<RotateFlipData, 'settings'>, inputId: string) {
  return JSON.stringify([inputId, 'rotate-flip-v1', data.settings.rotation, data.settings.flipHorizontal, data.settings.flipVertical]);
}

export function restoreRotateFlipData(value: unknown): RotateFlipData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as RotateFlipData;
  if (!data.settings || ![0, 90, 180, 270].includes(data.settings.rotation)
    || typeof data.settings.flipHorizontal !== 'boolean' || typeof data.settings.flipVertical !== 'boolean'
    || (data.baseImage && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image'))) return;
  return { settings: { rotation: data.settings.rotation, flipHorizontal: data.settings.flipHorizontal, flipVertical: data.settings.flipVertical },
    baseImage: data.baseImage, label: typeof data.label === 'string' ? data.label : undefined, locked: false };
}

// Integer transforms preserve pixel boundaries. Weavy applies mirrors in the
// output axes after rotation, independent of the order the controls were clicked.
export function rotateFlipTransform(width: number, height: number, settings: RotateFlipSettings) {
  const swapped = settings.rotation === 90 || settings.rotation === 270;
  const outputWidth = swapped ? height : width, outputHeight = swapped ? width : height;
  const rotations: Record<RotateFlipSettings['rotation'], [number, number, number, number, number, number]> = {
    0: [1, 0, 0, 1, 0, 0],
    90: [0, 1, -1, 0, height, 0],
    180: [-1, 0, 0, -1, width, height],
    270: [0, -1, 1, 0, 0, width],
  };
  const [a, b, c, d, e, f] = rotations[settings.rotation];
  const x = settings.flipHorizontal ? -1 : 1, y = settings.flipVertical ? -1 : 1;
  const matrix: [number, number, number, number, number, number] = [a * x, b * y, c * x, d * y,
    e * x + (settings.flipHorizontal ? outputWidth : 0), f * y + (settings.flipVertical ? outputHeight : 0)];
  return { width: outputWidth, height: outputHeight, matrix };
}
