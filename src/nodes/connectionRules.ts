import { isImageGenerationInput } from './sunburst.ts';
import type { Connection, Edge } from '@xyflow/react';
import type { AppNode } from './types';
import { isCanvasImageNode, isNodeLocked, isImageGeneratorNode } from './types.ts';
import { fileAssets, fileOutputKind } from './fileCollection.ts';
import { isTextNode, textAnnotationCount, textInputHandle } from './textVariables.ts';
import { annotationInputIndex, isAnnotationInput } from './interactiveEdit.ts';
import { annotationOutput } from './annotationGraph.ts';
import { outputKind } from './outputPort.ts';

const singleInputTypes = new Set(['text', 'sunburst', 'nano-banana', 'seedream', 'interactive-edit']);
const inputKey = (node: AppNode, handle: string | null | undefined) => node.type === 'text'
  ? textInputHandle(handle) : handle ?? null;

// Validate first, then replace only this input in the same update that adds the new edge.
export function withoutReplacedInput(connection: Pick<Edge, 'target' | 'targetHandle'>, nodes: AppNode[], edges: Edge[]) {
  const target = nodes.find(node => node.id === connection.target);
  if (!target || !singleInputTypes.has(target.type ?? '')) return edges;
  return edges.filter(edge => edge.target !== target.id
    || inputKey(target, edge.targetHandle) !== inputKey(target, connection.targetHandle));
}

export function canConnect(connection: Connection | Edge, nodes: AppNode[], currentEdges: Edge[], pendingImportId?: string): boolean {
  const source = nodes.find(node => node.id === connection.source), target = nodes.find(node => node.id === connection.target);
  if (!source || !target || isNodeLocked(source) || isNodeLocked(target) || source.id === target.id) return false;
  const composerSource = isCanvasImageNode(source), composerTarget = isCanvasImageNode(target);
  if (composerSource && connection.sourceHandle !== 'result') return false;
  if (composerTarget && connection.targetHandle !== 'prompt'
    && !/^image-([0-9]|1[0-5])$/.test(connection.targetHandle ?? '')) return false;
  if (composerSource && composerTarget && currentEdges.some(edge => edge.source === source.id && edge.target === target.id)) return false;
  if (isTextNode(target) && isAnnotationInput(connection.targetHandle) && annotationInputIndex(connection.targetHandle) >= textAnnotationCount(target, currentEdges)) return false;
  if (currentEdges.some(edge => edge.source === source.id && edge.target === target.id
    && (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null)
    && inputKey(target, edge.targetHandle) === inputKey(target, connection.targetHandle))) return false;
  const remaining = withoutReplacedInput(connection, nodes, currentEdges);
  if (source.type === 'interactive-edit') {
    const index = annotationInputIndex(connection.targetHandle);
    if (!isTextNode(target) || index < 0
      || !annotationOutput(source, connection.sourceHandle, nodes, currentEdges)) return false;
  } else if (target.type === 'text' && isAnnotationInput(connection.targetHandle)) return false;
  if (target.type === 'interactive-edit') {
    const kind = outputKind(source, connection.sourceHandle);
    const pendingFile = source.type === 'file' && source.id === pendingImportId && fileAssets(source.data).length === 0;
    if (connection.targetHandle !== 'image' || (kind !== 'image' && kind !== 'mask' && !pendingFile)) return false;
  }

  if ((source.type === 'nano-banana' || source.type === 'seedream') && connection.sourceHandle !== 'result') return false;

  if (isImageGeneratorNode(target)) {
    if (!isImageGenerationInput(connection.targetHandle, target.type === 'sunburst')) return false;
    if (target.type === 'sunburst') {
      const { provider, channelModel, outputFormat } = target.data;
      if (connection.targetHandle === 'mask' && provider === 'apimart' && (channelModel !== 'gpt-image-2.6' || ['gif', 'svg'].includes(outputFormat ?? ''))) return false;
    }
    if (remaining.some(edge => edge.target === target.id && edge.targetHandle === connection.targetHandle)) return false;
    if (connection.targetHandle === 'prompt') {
      if (source.type !== 'text') return false;
    } else if ((target.type === 'sunburst' && connection.targetHandle === 'mask') || (/^image-\d+$/.test(connection.targetHandle ?? '') && (target.type === 'sunburst' || Number(connection.targetHandle?.slice(6)) < target.data.imageInputs))) {
      if (!(isImageGeneratorNode(source) || (source.type === 'file' && (fileOutputKind(source.data) === 'image' || (source.id === pendingImportId && fileAssets(source.data).length === 0))))) return false;
    } else return false;
  }
  if (isImageGeneratorNode(source) && target.type !== 'interactive-edit' && !isImageGeneratorNode(target)) return false;

  if (target.type === 'text' && remaining.some((edge) => edge.target === connection.target
    && textInputHandle(edge.targetHandle) === textInputHandle(connection.targetHandle))) return false;
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
