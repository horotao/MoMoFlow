import type { Connection, Edge } from '@xyflow/react';
import type { AppNode } from './types';
import { isNodeLocked, isSunburstNode } from './types.ts';
import { fileAssets, fileOutputKind } from './fileCollection.ts';
import { variableIndex } from './textVariables.ts';
import { sunburstFieldLabels } from './sunburst.ts';

// A newly added Import may be wired before the user supplies its first image.
export function canConnect(connection: Connection | Edge, nodes: AppNode[], currentEdges: Edge[], pendingImportId?: string): boolean {
  if (connection.source === connection.target) return false;
  const target = nodes.find((node) => node.id === connection.target);
  const source = nodes.find(node => node.id === connection.source);
  if (isNodeLocked(source) || isNodeLocked(target)) return false;
  if (!source || !target) return false;
  if ((source.type === 'color-correction' || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert') && connection.sourceHandle !== 'result') return false;
  if (source.type === 'preview') return false;
  if (source.type === 'painter' && !['result', 'mask'].includes(connection.sourceHandle ?? '')) return false;
  if (target.type === 'painter' || target.type === 'color-correction' || target.type === 'crop' || target.type === 'blur' || target.type === 'levels' || target.type === 'invert' || target.type === 'preview') {
    const input = (target.type === 'preview' || target.type === 'color-correction') ? 'file' : 'image';
    if (connection.targetHandle !== input || currentEdges.some(edge => edge.target === target.id && edge.targetHandle === input)) return false;
    if (!(source.type === 'painter' || source.type === 'color-correction' || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || isSunburstNode(source) || (source.type === 'file' && (fileOutputKind(source.data) === 'image' || (source.id === pendingImportId && fileAssets(source.data).length === 0))))) return false;
  }
  if (target?.type === 'model-input') return false;
  if (target && isSunburstNode(target)) {
    if (currentEdges.some(edge => edge.target === target.id && edge.targetHandle === connection.targetHandle)) return false;
    if (connection.targetHandle === 'prompt' || (target.data.exposed ?? []).some(field => field in sunburstFieldLabels && field === connection.targetHandle)) {
      if (!source || !['text', 'image-describer', 'model-input'].includes(source.type ?? '')) return false;
    } else if (connection.targetHandle === 'mask' || /^image-\d+$/.test(connection.targetHandle ?? '')) {
      if (!source || !(isSunburstNode(source) || source.type === 'painter' || source.type === 'color-correction' || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || (source.type === 'file' && (fileOutputKind(source.data) === 'image' || (source.id === pendingImportId && fileAssets(source.data).length === 0))))) return false;
    } else return false;
  }
  if (source && (isSunburstNode(source) || source.type === 'painter' || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || source.type === 'color-correction') && target?.type !== 'color-correction' && target?.type !== 'crop' && target?.type !== 'blur' && target?.type !== 'levels' && target?.type !== 'invert' && target?.type !== 'preview' && target?.type !== 'painter' && target?.type !== 'sunburst' && !(target?.type === 'image-describer' && connection.targetHandle?.startsWith('image-'))) return false;
  if (target?.type === 'image-describer') {
    if (currentEdges.some((e) => e.target === target.id && e.targetHandle === connection.targetHandle)) return false;
    const source = nodes.find((n) => n.id === connection.source);
    if (connection.targetHandle?.startsWith('image-')) {
      if (!source || !(isSunburstNode(source) || source.type === 'painter' || source.type === 'color-correction' || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || (source.type === 'file' && (fileOutputKind(source.data) === 'image' || (source.id === pendingImportId && fileAssets(source.data).length === 0))))) return false;
    } else if (!source || !['text', 'model-input', 'image-describer'].includes(source.type ?? '')) return false;
  }
  if (target?.type === 'text' && currentEdges.some((edge) => edge.target === connection.target
    && variableIndex(edge.targetHandle) === variableIndex(connection.targetHandle))) return false;
  const pending = [connection.target];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === connection.source) return false;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...currentEdges.filter((edge) => edge.source === id).map((edge) => edge.target));
  }
  return true;
}
