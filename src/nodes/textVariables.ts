import type { Edge } from '@xyflow/react';
import type { AppNode, TextNode } from './types';
import { defaultTextNodeText } from './defaults';

export const isTextNode = (node: AppNode): node is TextNode => node.type === 'text' && 'text' in node.data;

export const variableHandleId = (index: number) => `variable-${index + 1}`;
export const variableIndex = (handle?: string | null) => {
  const match = /^variable-([1-9]\d*)$/.exec(handle ?? '');
  return match ? Number(match[1]) - 1 : 0;
};

export function textVariableCount(node: AppNode, edges: Edge[]) {
  if (!isTextNode(node)) return 0;
  return Math.max(node.data.variableCount ?? 0, ...edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => variableIndex(edge.targetHandle) + 2));
}

// Resolve from graph data, without copying values into downstream node data.
// The visited set also safely handles older graphs that contain a cycle.
export function resolveTextValue(id: string, nodes: AppNode[], edges: Edge[], visited = new Set<string>()): string {
  if (visited.has(id)) return '';
  const node = nodes.find((item) => item.id === id);
  if (!node) return '';
  if (!isTextNode(node)) return 'label' in node.data && typeof node.data.label === 'string' ? node.data.label : '';
  const nextVisited = new Set(visited).add(id);
  const inputs = edges.filter((edge) => edge.target === id)
    .sort((a, b) => variableIndex(a.targetHandle) - variableIndex(b.targetHandle));
  const text = inputs.length && node.data.text === defaultTextNodeText ? '' : node.data.text;
  return [...inputs.map((edge) => resolveTextValue(edge.source, nodes, edges, nextVisited)), text]
    .filter(Boolean).join(' ');
}
