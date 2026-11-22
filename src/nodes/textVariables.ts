import type { Edge } from '@xyflow/react';
import type { AppNode, TextNode } from './types';
import { isCanvasTextNode } from './types.ts';
import { textOutputValue } from './textGeneration.ts';
import { documentText } from './textDocument.ts';
import { annotationInputs, annotationInputIndex, annotationMarkup, isAnnotationInput, resultAnnotationDraftHandle } from './interactiveEdit.ts';
import { annotationOutput } from './annotationGraph.ts';
import { hasVariable } from './textDocument.ts';

type AnnotationFormatter = (annotation: NonNullable<ReturnType<typeof annotationOutput>>) => string;

export const isTextNode = (node: AppNode): node is TextNode => node.type === 'text' && 'text' in node.data;

export const variableHandleId = (index: number) => `variable-${index + 1}`;
export const variableIndex = (handle?: string | null) => {
  const match = /^variable-([1-9]\d*)$/.exec(handle ?? '');
  return match ? Number(match[1]) - 1 : 0;
};

export const textInputHandle = (handle?: string | null) => handle && isAnnotationInput(handle) ? handle : variableHandleId(variableIndex(handle));

function textInputs(id: string, edges: Edge[]) {
  return edges.filter(edge => edge.target === id && edge.targetHandle !== resultAnnotationDraftHandle).sort((a, b) => {
    const first = annotationInputIndex(a.targetHandle), second = annotationInputIndex(b.targetHandle);
    return first < 0 && second < 0 ? variableIndex(a.targetHandle) - variableIndex(b.targetHandle) : first - second;
  });
}

export const textInputHandles = (id: string, edges: Edge[]) => textInputs(id, edges).map(edge => textInputHandle(edge.targetHandle));

export function textVariableCount(node: AppNode, edges: Edge[]) {
  if (!isTextNode(node)) return 0;
  return Math.max(node.data.variableCount ?? 0, ...edges
    .filter((edge) => edge.target === node.id && !isAnnotationInput(edge.targetHandle))
    .map((edge) => variableIndex(edge.targetHandle) + 2));
}

export function textAnnotationCount(node: TextNode, edges: Edge[]) {
  const connected = edges.filter(edge => edge.target === node.id && isAnnotationInput(edge.targetHandle))
    .map(edge => annotationInputIndex(edge.targetHandle) + 2);
  const used = node.data.content ? annotationInputs.map((handle, index) => hasVariable(node.data.content!, handle) ? index + 1 : 0) : [];
  return Math.min(annotationInputs.length, Math.max(1, ...connected, ...used));
}

export function resolveTextInput(edge: Edge, nodes: AppNode[], edges: Edge[], visited?: Set<string>, formatAnnotation?: AnnotationFormatter): string {
  if (!isAnnotationInput(edge.targetHandle)) return resolveTextValue(edge.source, nodes, edges, visited, formatAnnotation);
  const annotation = annotationOutput(nodes.find(item => item.id === edge.source), edge.sourceHandle, nodes, edges);
  return annotation ? formatAnnotation?.(annotation) ?? annotationMarkup(annotation.mark) : '';
}

// Resolve from graph data, without copying values into downstream node data.
// The visited set also safely handles older graphs that contain a cycle.
export function resolveTextValue(id: string, nodes: AppNode[], edges: Edge[], visited = new Set<string>(), formatAnnotation?: AnnotationFormatter): string {
  if (visited.has(id)) return '';
  const node = nodes.find((item) => item.id === id);
  if (!node || node.type === 'file') return '';
  if (isCanvasTextNode(node)) return textOutputValue(node.data);
  if (!isTextNode(node)) return 'label' in node.data && typeof node.data.label === 'string' ? node.data.label : '';
  const nextVisited = new Set(visited).add(id);
  const inputs = textInputs(id, edges);
  if (node.data.content) {
    return documentText(node.data.content, (handleId) => {
      const input = inputs.find((edge) => textInputHandle(edge.targetHandle) === textInputHandle(handleId));
      return input ? resolveTextInput(input, nodes, edges, nextVisited, formatAnnotation) : '';
    });
  }
  return [...inputs.map((edge) => resolveTextInput(edge, nodes, edges, nextVisited, formatAnnotation)), node.data.text]
    .filter(Boolean).join(' ');
}
