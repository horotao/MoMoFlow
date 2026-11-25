import type { AppNode } from './types';
import { isInteractiveEditNode, isCanvasTextNode } from './types.ts';
import { fileOutputKind } from './fileCollection.ts';

export type OutputKind = 'text' | 'image' | 'mask' | 'video' | 'audio' | '3d' | 'file';

export function resolveOutputSource(node: AppNode | undefined, handle: string | null | undefined) {
  return node ? { node, handle } : undefined;
}

export function outputKind(node: AppNode | undefined, handle?: string | null): OutputKind | undefined {
  if (!node) return undefined;
  if (isInteractiveEditNode(node)) return node.data.history?.frames[node.data.history.index]?.some(mark => mark.id === handle) ? 'text' : undefined;

  if (node.type === 'audio' || node.type === 'video') return handle === node.type ? node.type : undefined;
  if (node.type === 'file') return handle === 'file' ? fileOutputKind(node.data) : undefined;

  if (['seedream', 'nano-banana', 'sunburst'].includes(node.type ?? '')) return handle === 'result' ? 'image' : undefined;
  if (isCanvasTextNode(node)) return handle === 'text' ? 'text' : undefined;
  if (node.type === 'text') return !handle ? 'text' : undefined;
  return undefined;
}
