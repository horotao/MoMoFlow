import { normalizeHexColor } from './colorPicker.ts';
import type { FileAsset } from './types';

export const paletteLimit = 10;
export const paletteSize = 1024;
export type PaletteColor = { id: string; hex: string };
export type ColorPaletteData = { label?: string; locked?: boolean; colors: PaletteColor[]; result?: FileAsset; outputRevision?: string };

export function paletteDocument(data: ColorPaletteData) {
  return { label: data.label, locked: data.locked, colors: data.colors };
}
export function paletteText(colors: PaletteColor[]) {
  return colors.map(color => color.hex.toUpperCase()).join('*');
}
export function paletteRevision(colors: PaletteColor[]) {
  return `palette-v1:${paletteText(colors)}`;
}
export function insertPaletteColor(colors: PaletteColor[], index = colors.length): PaletteColor[] {
  if (colors.length >= paletteLimit) return colors;
  const next = [...colors];
  next.splice(Math.max(0, Math.min(index, colors.length)), 0, { id: crypto.randomUUID(), hex: '#FFFFFF' });
  return next;
}
export function movePaletteColor(colors: PaletteColor[], id: string, index: number): PaletteColor[] {
  const from = colors.findIndex(color => color.id === id);
  if (from < 0) return colors;
  const next = [...colors];
  const [color] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, color);
  return next;
}
export function paletteInk(hex: string) {
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return r * .299 + g * .587 + b * .114 > 150 ? '#0e0e13' : '#ffffff';
}
export function paletteBands(colors: PaletteColor[], size = paletteSize) {
  return colors.map((color, index) => {
    const y = Math.round(index * size / colors.length);
    return { hex: color.hex, y, height: Math.round((index + 1) * size / colors.length) - y };
  });
}
export function restorePaletteData(value: unknown): ColorPaletteData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as ColorPaletteData;
  if (!Array.isArray(data.colors) || data.colors.length > paletteLimit) return;
  const colors: PaletteColor[] = [];
  for (const color of data.colors) {
    if (!color || typeof color.hex !== 'string') return;
    const hex = normalizeHexColor(color.hex);
    if (!hex) return;
    colors.push({ id: crypto.randomUUID(), hex: hex.toUpperCase() });
  }
  return { label: typeof data.label === 'string' ? data.label : undefined, locked: false, colors };
}
