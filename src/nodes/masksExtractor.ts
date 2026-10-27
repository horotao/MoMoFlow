import { isFileAsset } from './fileCollection.ts';
import type { FileAsset } from './types';

export type MaskPoint = { x: number; y: number };
export type MaskOperation = 'replace' | 'add' | 'subtract';
export type MaskBitmap = { width: number; height: number; pixels: Uint8Array };
export type MaskSelection = { id: string; inputId: string; width: number; height: number; runs: number[]; point?: MaskPoint; operation?: MaskOperation };
export type MasksExtractorData = {
  label?: string; locked?: boolean; baseImage?: FileAsset;
  selection?: MaskSelection;
  result?: FileAsset; mask?: FileAsset; outputRevision?: string;
};

export function masksDocument(data: MasksExtractorData) {
  return { label: data.label, locked: data.locked, baseImage: data.baseImage, selection: data.selection };
}

export function masksRevision(data: MasksExtractorData, inputId: string) {
  return data.selection?.inputId === inputId ? JSON.stringify([inputId, data.selection.id, 'masks-v1']) : '';
}

// Alternating zero/one run lengths keep the editable selection small and independent
// of model downloads. Saved selections can be displayed/exported offline.
export function encodeMask(bitmap: MaskBitmap, inputId: string, id: string): MaskSelection {
  if (!validSize(bitmap.width, bitmap.height) || bitmap.pixels.length !== bitmap.width * bitmap.height) throw new Error('Invalid mask dimensions');
  const runs: number[] = [];
  let value = 0, length = 0;
  for (const pixel of bitmap.pixels) {
    const next = pixel ? 1 : 0;
    if (next !== value) { runs.push(length); length = 0; value = next; }
    length++;
  }
  runs.push(length);
  return { id, inputId, width: bitmap.width, height: bitmap.height, runs };
}

export function decodeMask(selection: MaskSelection): MaskBitmap {
  const pixels = new Uint8Array(selection.width * selection.height);
  let offset = 0;
  selection.runs.forEach((length, i) => { if (i % 2) pixels.fill(1, offset, offset + length); offset += length; });
  return { width: selection.width, height: selection.height, pixels };
}

export function combineMasks(previous: MaskBitmap | undefined, candidate: MaskBitmap, operation: MaskOperation): MaskBitmap {
  if (previous && (previous.width !== candidate.width || previous.height !== candidate.height)) throw new Error('Mask dimensions changed');
  const pixels = new Uint8Array(candidate.pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = operation === 'replace' ? Number(Boolean(candidate.pixels[i]))
      : operation === 'add' ? Number(Boolean(previous?.pixels[i] || candidate.pixels[i]))
        : Number(Boolean(previous?.pixels[i] && !candidate.pixels[i]));
  }
  return { width: candidate.width, height: candidate.height, pixels };
}

export function maskOperation(modifiers: { shiftKey: boolean; altKey: boolean }): MaskOperation {
  return modifiers.shiftKey ? modifiers.altKey ? 'subtract' : 'add' : 'replace';
}

export function maskPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): MaskPoint | undefined {
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : undefined;
}

function validSize(width: number, height: number) {
  return [width, height].every(n => Number.isInteger(n) && n > 0 && n <= 1024);
}

export function restoreMasksData(value: unknown): MasksExtractorData | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as MasksExtractorData;
  if (data.baseImage && (!isFileAsset(data.baseImage) || data.baseImage.kind !== 'image')) return;
  const selection = data.selection;
  if (selection?.point && (!Number.isFinite(selection.point.x) || !Number.isFinite(selection.point.y)
    || selection.point.x < 0 || selection.point.x > 1 || selection.point.y < 0 || selection.point.y > 1)) return;
  if (selection?.operation && !['replace', 'add', 'subtract'].includes(selection.operation)) return;
  if (selection && (typeof selection.id !== 'string' || !selection.id || typeof selection.inputId !== 'string' || !selection.inputId
    || !validSize(selection.width, selection.height) || !Array.isArray(selection.runs)
    || !selection.runs.length || selection.runs.length > selection.width * selection.height + 1
    || selection.runs.some((n, i) => !Number.isInteger(n) || n < (i ? 1 : 0) || n > selection.width * selection.height)
    || selection.runs.reduce((sum, n) => sum + n, 0) !== selection.width * selection.height)) return;
  return { label: typeof data.label === 'string' ? data.label : undefined, locked: false, baseImage: data.baseImage,
    selection: selection ? { ...selection, runs: [...selection.runs] } : undefined };
}
