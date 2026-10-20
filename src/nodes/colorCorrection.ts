import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export const colorControls = [
  { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: .01 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1 },
  { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1 },
] as const;
export type ColorSettings = Record<typeof colorControls[number]['key'], number>;
export type ColorCorrectionData = {
  label?: string; locked?: boolean; settings: ColorSettings;
  baseImage?: FileAsset; result?: FileAsset; outputRevision?: string;
};
export const defaultColorSettings: ColorSettings = {
  exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0,
};
export function colorDocument(data: ColorCorrectionData) {
  return { label: data.label, locked: data.locked, settings: data.settings, baseImage: data.baseImage };
}
export function colorRevision(data: ColorCorrectionData, inputId: string) {
  return JSON.stringify([inputId, ...colorControls.map(({ key }) => data.settings[key])]);
}
export function restoreColorData(value: unknown): ColorCorrectionData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as ColorCorrectionData;
  if (!data.settings || !colorControls.every(({ key, min, max }) =>
    Number.isFinite(data.settings[key]) && data.settings[key] >= min && data.settings[key] <= max)
    || (data.baseImage && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image'))) return;
  return { settings: Object.fromEntries(colorControls.map(({ key }) => [key, data.settings[key]])) as ColorSettings,
    baseImage: data.baseImage, label: typeof data.label === 'string' ? data.label : undefined, locked: false };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const linear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const srgb = (value: number) => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
const linearBytes = Float64Array.from({ length: 256 }, (_, i) => linear(i / 255));

// One pixel pipeline for the interaction preview and native-resolution export.
// Exposure works in linear light; tone masks protect the opposite tonal range.
export function correctPixels(pixels: Uint8ClampedArray, settings: ColorSettings) {
  if (colorControls.every(({ key }) => settings[key] === 0)) return;
  const exposure = 2 ** settings.exposure;
  const contrast = 2 ** (settings.contrast / 100 * 2);
  const saturation = 1 + settings.saturation / 100;
  const temperature = settings.temperature / 100, tint = settings.tint / 100;
  const red = 2 ** (temperature * .5 + tint * .15);
  const green = 2 ** (-tint * .3);
  const blue = 2 ** (-temperature * .5 + tint * .15);
  const reds = linearBytes.map(value => srgb(value * exposure * red));
  const greens = linearBytes.map(value => srgb(value * exposure * green));
  const blues = linearBytes.map(value => srgb(value * exposure * blue));
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    let r = reds[pixels[i]];
    let g = greens[pixels[i + 1]];
    let b = blues[pixels[i + 2]];
    const luminance = clamp(.2126 * r + .7152 * g + .0722 * b);
    const tone = settings.shadows / 100 * (1 - luminance) ** 3 * .6
      + settings.highlights / 100 * luminance ** 3 * .6;
    r = (r + tone - .5) * contrast + .5;
    g = (g + tone - .5) * contrast + .5;
    b = (b + tone - .5) * contrast + .5;
    const gray = .2126 * r + .7152 * g + .0722 * b;
    pixels[i] = clamp(gray + (r - gray) * saturation) * 255;
    pixels[i + 1] = clamp(gray + (g - gray) * saturation) * 255;
    pixels[i + 2] = clamp(gray + (b - gray) * saturation) * 255;
  }
}
