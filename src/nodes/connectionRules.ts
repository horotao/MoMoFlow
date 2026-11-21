import type { Connection, Edge } from '@xyflow/react';
import { isCanvasImageNode, isNodeLocked, type AppNode } from './types.ts';

export function withoutReplacedInput(connection: Pick<Edge, 'target' | 'targetHandle'>, _nodes: AppNode[], edges: Edge[]) {
  return edges.filter(edge => edge.target !== connection.target || edge.targetHandle !== connection.targetHandle);
}

export function canConnect(connection: Connection | Edge, nodes: AppNode[], currentEdges: Edge[]): boolean {
  const source = nodes.find(node => node.id === connection.source), target = nodes.find(node => node.id === connection.target);
  if (!source || !target || !isCanvasImageNode(source) || !isCanvasImageNode(target)
    || isNodeLocked(source) || isNodeLocked(target) || source.id === target.id
    || connection.sourceHandle !== 'result' || !/^image-([0-9]|1[0-5])$/.test(connection.targetHandle ?? '')) return false;
  if (currentEdges.some(edge => edge.source === source.id && edge.target === target.id)) return false;
  const remaining = withoutReplacedInput(connection, nodes, currentEdges);
  const pending = [connection.target];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === connection.source) return false;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...remaining.filter((edge) => edge.source === id).map((edge) => edge.target));
  }
  return true;
}
