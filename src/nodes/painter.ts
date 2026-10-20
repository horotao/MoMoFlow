import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export type PainterTool = 'canvas' | 'brush' | 'shape' | 'eraser';
export type PainterShape = 'rectangle' | 'ellipse' | 'triangle' | 'star';
export type PaintPoint = { x: number; y: number };
export type PaintStroke = {
  tool: 'brush' | 'eraser' | PainterShape;
  points: PaintPoint[];
  color: string;
  opacity: number;
  size: number;
  hardness: number;
};
export type PainterData = {
  label?: string; locked?: boolean;
  width: number; height: number; background: string; backgroundOpacity: number;
  strokes: PaintStroke[];
  baseImage?: FileAsset; result?: FileAsset; mask?: FileAsset; alphaMask?: FileAsset;
  outputRevision?: string;
};
export const defaultPainterData: PainterData = {
  width: 1024, height: 1024, background: '#000000', backgroundOpacity: 1, strokes: [],
};
export function painterRevision(data: PainterData, inputId = ''): string {
  return JSON.stringify([inputId, data.width, data.height, data.background, data.backgroundOpacity, data.strokes]);
}
export function painterDocument(data: PainterData) {
  return { label: data.label, locked: data.locked, width: data.width, height: data.height, background: data.background, backgroundOpacity: data.backgroundOpacity, strokes: data.strokes, baseImage: data.baseImage };
}
export function restorePainterData(value: unknown): PainterData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as PainterData;
  if (data.baseImage && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image')) return;
  if (![data.width, data.height].every(n => Number.isInteger(n) && n >= 1 && n <= 8192)
    || !/^#[0-9a-f]{6}$/i.test(data.background) || !unit(data.backgroundOpacity)
    || !Array.isArray(data.strokes) || data.strokes.some(stroke => !stroke
      || !['brush', 'eraser', 'rectangle', 'ellipse', 'triangle', 'star'].includes(stroke.tool)
      || !/^#[0-9a-f]{6}$/i.test(stroke.color) || !unit(stroke.opacity) || !unit(stroke.hardness)
      || !Number.isFinite(stroke.size) || stroke.size <= 0 || stroke.size > 500
      || !Array.isArray(stroke.points) || !stroke.points.length
      || stroke.points.some(point => !point || !unit(point.x) || !unit(point.y)))) return;
  return { ...defaultPainterData, ...painterDocument(data), locked: false, label: typeof data.label === 'string' ? data.label : undefined };
}
function unit(n: number) { return Number.isFinite(n) && n >= 0 && n <= 1; }
