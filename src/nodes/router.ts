import type { Edge, XYPosition } from '@xyflow/react';
import type { AppNode, RouterNode } from './types';
import { isNodeLocked } from './types.ts';
import { fileOutputKind, filePortColors } from './fileCollection.ts';

export type OutputKind = 'text' | 'image' | 'mask' | 'video' | 'audio' | '3d' | 'file';

// Keep the originating handle: Painter Mask and multi-output nodes carry semantics.
export function resolveOutputSource(node: AppNode | undefined, handle: string | null | undefined, nodes: AppNode[], edges: Edge[]) {
  const visited = new Set<string>();
  while (node?.type === 'router') {
    if (handle !== 'output' || visited.has(node.id)) return undefined;
    visited.add(node.id);
    const input = edges.find(edge => edge.target === node!.id && edge.targetHandle === 'input');
    if (!input) return undefined;
    handle = input.sourceHandle;
    node = nodes.find(item => item.id === input.source);
  }
  return node ? { node, handle } : undefined;
}

export function outputKind(node: AppNode | undefined, handle?: string | null, nodes: AppNode[] = [], edges: Edge[] = []): OutputKind | undefined {
  const source = resolveOutputSource(node, handle, nodes, edges);
  if (!source) return undefined;
  node = source.node; handle = source.handle;
  if (node.type === 'file') return handle === 'file' ? fileOutputKind(node.data) : undefined;
  if (node.type === 'color-palette') return handle === 'text' || handle === 'image' ? handle : undefined;
  if (node.type === 'painter' || node.type === 'masks-extractor') return handle === 'mask' ? 'mask' : handle === 'result' ? 'image' : undefined;
  if (node.type === 'matte-grow-shrink') return handle === 'result' ? 'mask' : undefined;
  if (node.type === 'compare') return ['output-1', 'output-2'].includes(handle ?? '') ? 'image' : undefined;
  if (['nano-banana', 'sunburst', 'blend', 'compositor', 'resize', 'rotate-flip', 'invert', 'levels', 'blur', 'crop', 'color-correction'].includes(node.type ?? '')) return handle === 'result' ? 'image' : undefined;
  if (['text', 'image-describer', 'model-input', 'position-logger'].includes(node.type ?? '')) return !handle ? 'text' : undefined;
  return undefined;
}

export function outputColor(kind?: OutputKind) {
  return kind === 'text' ? 'var(--router-text-port, #e28cf8)' : kind === 'mask' ? 'var(--sunburst-mask-port, #f3ffe3)'
    : kind ? filePortColors[kind] : 'var(--router-empty-port)';
}

export function routerFromOutput(sourceId: string, sourceHandle: string | null, position: XYPosition, nodes: AppNode[], edges: Edge[], id: string) {
  const source = nodes.find(node => node.id === sourceId);
  if (!source || isNodeLocked(source) || (!outputKind(source, sourceHandle, nodes, edges) && !(source.type === 'router' && sourceHandle === 'output'))) return undefined;
  const router: RouterNode = { id, type: 'router', position, data: {}, selected: true };
  return {
    nodes: [...nodes.map(node => ({ ...node, selected: false })), router],
    edges: [...edges, { id: `${id}-input`, source: sourceId, sourceHandle, target: id, targetHandle: 'input' }],
  };
}
