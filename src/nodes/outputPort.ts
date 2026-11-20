import type { AppNode } from './types';
import { isInteractiveEditNode } from './types.ts';
import { fileOutputKind, filePortColors } from './fileCollection.ts';

export type OutputKind = 'text' | 'image' | 'mask' | 'video' | 'audio' | '3d' | 'file';

export function resolveOutputSource(node: AppNode | undefined, handle: string | null | undefined) {
  return node ? { node, handle } : undefined;
}

export function outputKind(node: AppNode | undefined, handle?: string | null): OutputKind | undefined {
  if (!node) return undefined;
  if (isInteractiveEditNode(node)) return node.data.history?.frames[node.data.history.index]?.some(mark => mark.id === handle) ? 'text' : undefined;

  if (node.type === 'file') return handle === 'file' ? fileOutputKind(node.data) : undefined;

  if (['seedream', 'nano-banana', 'sunburst'].includes(node.type ?? '')) return handle === 'result' ? 'image' : undefined;
  if (node.type === 'text') return !handle ? 'text' : undefined;
  return undefined;
}

export function outputColor(kind?: OutputKind) {
  return kind === 'text' ? '#e28cf8' : kind === 'mask' ? 'var(--sunburst-mask-port, #f3ffe3)'
    : kind ? filePortColors[kind] : 'var(--node-port-color)';
}
