import type { Edge } from '@xyflow/react';
import type { AppNode } from './types';
import { outputKind } from './router.ts';
import { nodePortColor, type NodePortKind } from './nodePortAppearance.ts';
import { isImageGeneratorNode } from './types.ts';

// Display metadata only. Identical colors do not make masks into images.
export function nodePortKind(node: AppNode | undefined, handle: string | null | undefined, direction: 'source' | 'target', nodes: AppNode[] = [], edges: Edge[] = []): NodePortKind {
  if (!node) return 'unknown';
  if (node.type === 'router') return outputKind(node, 'output', nodes, edges) ?? 'unknown';
  if (direction === 'source') return outputKind(node, handle, nodes, edges) ?? 'unknown';
  if (['text', 'text-iterator', 'model-input', 'position-logger'].includes(node.type ?? '')) return 'text';
  if (isImageGeneratorNode(node)) return handle === 'mask' ? 'mask' : handle?.startsWith('image-') ? 'image' : 'text';
  if (node.type === 'image-describer') return handle?.startsWith('image-') ? 'image' : 'text';
  if (node.type === 'preview') return 'file';
  if (node.type === 'matte-grow-shrink') return 'mask';
  return 'image';
}

export function nodeConnectionColor(node: AppNode | undefined, handle: string | null | undefined, direction: 'source' | 'target', nodes: AppNode[], edges: Edge[]) {
  return nodePortColor(nodePortKind(node, handle, direction, nodes, edges));
}

export function nodeEdgeStyle(edge: Edge, nodes: AppNode[], edges: Edge[]) {
  const source = nodes.find(node => node.id === edge.source);
  return { ...edge.style, stroke: nodeConnectionColor(source, edge.sourceHandle, 'source', nodes, edges), strokeWidth: 3 };
}
