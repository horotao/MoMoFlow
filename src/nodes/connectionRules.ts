import type { Connection, Edge } from '@xyflow/react';
import { isCanvasImageNode, isNodeLocked, type AppNode } from './types.ts';

export const imageInputHandles = Array.from({ length: 16 }, (_, index) => `image-${index}`);
export const isImageInputHandle = (handle?: string | null) => !!handle && imageInputHandles.includes(handle);

export function isImageWire(connection: Pick<Edge, 'sourceHandle' | 'targetHandle'>) {
  return connection.sourceHandle === 'result' && isImageInputHandle(connection.targetHandle);
}

export function withoutReplacedInput(connection: Pick<Edge, 'target' | 'targetHandle'>, edges: Edge[]) {
  return edges.filter(edge => edge.target !== connection.target || edge.targetHandle !== connection.targetHandle);
}

export function createsImageCycle(connection: Pick<Edge, 'source' | 'target'>, edges: Edge[]) {
  const pending = [connection.target];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === connection.source) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of edges) if (edge.source === id) pending.push(edge.target);
  }
  return false;
}

export function canConnect(connection: Connection | Edge, nodes: AppNode[], edges: Edge[]): boolean {
  const source = nodes.find(node => node.id === connection.source);
  const target = nodes.find(node => node.id === connection.target);
  if (!source || !target || !isCanvasImageNode(source) || !isCanvasImageNode(target)
    || isNodeLocked(source) || isNodeLocked(target) || !isImageWire(connection)) return false;
  if (edges.some(edge => edge.source === source.id && edge.target === target.id)) return false;
  return !createsImageCycle(connection, withoutReplacedInput(connection, edges));
}
