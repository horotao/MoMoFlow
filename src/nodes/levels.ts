import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export const levelsChannels = ['RGB', 'R', 'G', 'B'] as const;
export type LevelsChannel = typeof levelsChannels[number];
export type ChannelLevels = { inputMin: number; gamma: number; inputMax: number; outputMin: number; outputMax: number };
export type LevelsSettings = Record<LevelsChannel, ChannelLevels>;
export type LevelsData = { label?: string; locked?: boolean; channel: LevelsChannel; settings: LevelsSettings; baseImage?: FileAsset; result?: FileAsset; outputRevision?: string };
export const defaultChannelLevels: ChannelLevels = { inputMin: 0, gamma: 1, inputMax: 255, outputMin: 0, outputMax: 255 };
export const defaultLevelsSettings: LevelsSettings = { RGB: { ...defaultChannelLevels }, R: { ...defaultChannelLevels }, G: { ...defaultChannelLevels }, B: { ...defaultChannelLevels } };
export type LevelsHistogram = Record<LevelsChannel, number[]>;
export type LevelsHistograms = { source: LevelsHistogram; adjusted: LevelsHistogram };
export const levelsControls = [
  { key: 'inputMin', label: 'Input min', min: 0, max: 255, step: 1 },
  { key: 'gamma', label: 'Gamma', min: .1, max: 10, step: .01 },
  { key: 'inputMax', label: 'Input max', min: 0, max: 255, step: 1 },
  { key: 'outputMin', label: 'Output min', min: 0, max: 255, step: 1 },
  { key: 'outputMax', label: 'Output max', min: 0, max: 255, step: 1 },
] as const;
export function updateChannelLevels(settings: LevelsSettings, channel: LevelsChannel, key: keyof ChannelLevels, value: number): LevelsSettings {
  if (!Number.isFinite(value)) return settings;
  const control = levelsControls.find(item => item.key === key)!;
  let next = Math.min(control.max, Math.max(control.min, value));
  if (key !== 'gamma') next = Math.round(next);
  if (key === 'inputMin') next = Math.min(next, settings[channel].inputMax);
  if (key === 'inputMax') next = Math.max(next, settings[channel].inputMin);
  return { ...settings, [channel]: { ...settings[channel], [key]: next } };
}
export function levelsDocument(data: LevelsData) {
  return { label: data.label, locked: data.locked, channel: data.channel, settings: data.settings, baseImage: data.baseImage };
}
export function levelsRevision(data: Pick<LevelsData, 'settings'>, inputId: string) {
  return JSON.stringify([inputId, 'levels-v2-linear', ...levelsChannels.map(channel => levelsControls.map(control => data.settings[channel][control.key]))]);
}
export function restoreLevelsData(value: unknown): LevelsData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as LevelsData;
  if (!levelsChannels.includes(data.channel) || !data.settings
    || levelsChannels.some(channel => {
      const item = data.settings[channel];
      return !item || levelsControls.some(control => !Number.isFinite(item[control.key]) || item[control.key] < control.min || item[control.key] > control.max
        || (control.key !== 'gamma' && !Number.isInteger(item[control.key]))) || item.inputMin > item.inputMax;
    }) || (data.baseImage && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image'))) return;
  return { label: typeof data.label === 'string' ? data.label : undefined, channel: data.channel,
    settings: Object.fromEntries(levelsChannels.map(channel => [channel, { ...data.settings[channel] }])) as LevelsSettings,
    baseImage: data.baseImage };
}
// Weavy's middle handle is logarithmic: left = 0.1, center = 1, right = 10.
export function levelsGammaPosition(settings: ChannelLevels, rounded = true) {
  const position = settings.inputMin + (settings.inputMax - settings.inputMin) * (1 + Math.log10(settings.gamma)) / 2;
  return rounded ? Math.round(position) : position;
}
export function levelsGammaAt(position: number, settings: ChannelLevels) {
  const span = settings.inputMax - settings.inputMin;
  if (!span) return settings.gamma;
  const fraction = Math.min(1, Math.max(0, (Math.round(position) - settings.inputMin) / span));
  return 10 ** (fraction * 2 - 1);
}
function toLinear(value: number) {
  const encoded = value / 255;
  return encoded <= .04045 ? encoded / 12.92 : ((encoded + .055) / 1.055) ** 2.4;
}
function toSrgb(value: number) {
  return 255 * (value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055);
}
function level(value: number, settings: ChannelLevels) {
  // A collapsed input interval becomes a hard threshold, including at 0 / 255.
  const normalized = Math.min(1, Math.max(0, (value - settings.inputMin / 255) / Math.max(.000001, (settings.inputMax - settings.inputMin) / 255)));
  return (settings.outputMin + (settings.outputMax - settings.outputMin) * normalized ** (1 / settings.gamma)) / 255;
}
// Decode once, apply the individual channel then RGB, and encode/quantize once.
export function levelsPixels(pixels: Uint8ClampedArray, settings: LevelsSettings) {
  const tables = (['R', 'G', 'B'] as const).map(channel => Uint8ClampedArray.from({ length: 256 }, (_, value) => toSrgb(level(level(toLinear(value), settings[channel]), settings.RGB))));
  const result = pixels.slice();
  for (let i = 0; i < result.length; i += 4) for (let c = 0; c < 3; c++) result[i + c] = tables[c][pixels[i + c]];
  return result;
}
export function levelsHistogram(pixels: Uint8ClampedArray): LevelsHistogram {
  const bins: LevelsHistogram = { RGB: Array(256).fill(0), R: Array(256).fill(0), G: Array(256).fill(0), B: Array(256).fill(0) };
  for (let i = 0; i < pixels.length; i += 4) {
    const weight = pixels[i + 3] / 255;
    if (!weight) continue;
    bins.R[pixels[i]] += weight; bins.G[pixels[i + 1]] += weight; bins.B[pixels[i + 2]] += weight;
    bins.RGB[Math.round(.299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2])] += weight;
  }
  return bins;
}
