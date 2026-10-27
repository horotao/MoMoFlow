import { sunburstFieldLabels } from './sunburst.ts';
import { nanoBananaFieldLabels } from './nanoBanana.ts';
import type { Connection, Edge } from '@xyflow/react';
import type { AppNode } from './types';
import { isCompositorNode, isNodeLocked, isImageGeneratorNode } from './types.ts';
import { fileAssets, fileOutputKind } from './fileCollection.ts';
import { variableIndex } from './textVariables.ts';
import { outputKind, replaceRouterInput, resolveOutputSource } from './router.ts';

// Validate Router edits against their actual consumers before replacing the input.
export function canConnect(connection: Connection | Edge, nodes: AppNode[], currentEdges: Edge[], pendingImportId?: string): boolean {
  const source = nodes.find(node => node.id === connection.source), target = nodes.find(node => node.id === connection.target);
  if (!source || !target || isNodeLocked(source) || isNodeLocked(target) || source.id === target.id) return false;
  if (source.type !== 'router' && target.type !== 'router') return canConnectDirect(connection, nodes, currentEdges, pendingImportId);
  if ((source.type === 'router' && connection.sourceHandle !== 'output') || (target.type === 'router' && connection.targetHandle !== 'input')) return false;
  if (source.type !== 'router' && !outputKind(source, connection.sourceHandle)) return false;
  const remaining = replaceRouterInput(connection, nodes, currentEdges);
  const graph = [...remaining, { ...connection, id: 'router-candidate' }];
  const visited = new Set<string>(), queue = [target.id];
  while (queue.length) {
    const id = queue.pop()!;
    if (id === source.id) return false;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...remaining.filter(edge => edge.source === id).map(edge => edge.target));
  }
  const checkConsumer = (edge: Connection | Edge) => {
    const output = resolveOutputSource(nodes.find(node => node.id === edge.source), edge.sourceHandle, nodes, graph);
    const consumer = nodes.find(node => node.id === edge.target);
    if (!consumer) return false;
    const kind = output && outputKind(output.node, output.handle);
    if (consumer.type === 'text' && output && kind !== 'text') return false;
    // An empty Router can be wired first; its future input must satisfy all branches.
    const candidates: { node: AppNode; handle: string | null | undefined }[] = output ? [output] : [
      { node: { id: edge.source, type: 'text', position: { x: 0, y: 0 }, data: { text: '' } }, handle: null },
      { node: { id: edge.source, type: 'file', position: { x: 0, y: 0 }, data: {} }, handle: 'file' },
    ];
    return candidates.some(candidate => {
      const virtualSource = { ...candidate.node, id: edge.source, data: { ...candidate.node.data, locked: false } } as AppNode;
      const virtualNodes = nodes.map(node => node.id === edge.source ? virtualSource : node.id === edge.target ? { ...node, data: { ...node.data, locked: false } } as AppNode : node);
      return canConnectDirect({ ...edge, sourceHandle: candidate.handle ?? null }, virtualNodes,
        graph.filter(item => !(item.source === edge.source && item.target === edge.target && item.targetHandle === edge.targetHandle)),
        !output || candidate.node.id === pendingImportId ? edge.source : undefined);
    });
  };
  if (target.type !== 'router') return checkConsumer(connection);
  const routed = [target.id], checked = new Set<string>();
  while (routed.length) {
    const id = routed.pop()!;
    if (checked.has(id)) continue;
    checked.add(id);
    for (const edge of graph.filter(item => item.source === id)) {
      if (nodes.find(node => node.id === edge.target)?.type === 'router') routed.push(edge.target);
      else if (!checkConsumer(edge)) return false;
    }
  }
  return true;
}

// A newly added Import may be wired before the user supplies its first image.
function canConnectDirect(connection: Connection | Edge, nodes: AppNode[], currentEdges: Edge[], pendingImportId?: string): boolean {
  if (connection.source === connection.target) return false;
  const target = nodes.find((node) => node.id === connection.target);
  const source = nodes.find(node => node.id === connection.source);
  if (isNodeLocked(source) || isNodeLocked(target)) return false;
  if (!source || !target) return false;
  if (target.type === 'color-palette') return false;
  const paletteImage = source.type === 'color-palette' && connection.sourceHandle === 'image';
  const paletteText = source.type === 'color-palette' && connection.sourceHandle === 'text';
  if (source.type === 'color-palette' && !paletteImage && !paletteText) return false;
  if (paletteText && !(target.type === 'text' || isImageGeneratorNode(target) || target.type === 'image-describer')) return false;
  if ((source.type === 'color-correction' || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || source.type === 'blend' || source.type === 'rotate-flip' || source.type === 'resize' || source.type === 'compositor') && connection.sourceHandle !== 'result') return false;
  if (source.type === 'compare' && !['output-1', 'output-2'].includes(connection.sourceHandle ?? '')) return false;
  if (source.type === 'preview') return false;
  if (source.type === 'nano-banana' && connection.sourceHandle !== 'result') return false;
  if ((source.type === 'painter' || source.type === 'masks-extractor') && !['result', 'mask'].includes(connection.sourceHandle ?? '')) return false;
  if (target.type === 'blend' || target.type === 'compare' || (target.type === 'painter' || target.type === 'masks-extractor') || target.type === 'color-correction' || target.type === 'crop' || target.type === 'blur' || target.type === 'levels' || target.type === 'invert' || target.type === 'rotate-flip' || target.type === 'resize' || target.type === 'preview' || target.type === 'compositor') {
    const input = target.type === 'blend' ? (['back', 'front'].includes(connection.targetHandle ?? '') ? connection.targetHandle : undefined) : target.type === 'compare' ? (['input-1', 'input-2'].includes(connection.targetHandle ?? '') ? connection.targetHandle : undefined) : isCompositorNode(target) ? target.data.document.inputs.find(input => input.id === connection.targetHandle)?.id : (target.type === 'preview' || target.type === 'color-correction') ? 'file' : 'image';
    if (!input || connection.targetHandle !== input || currentEdges.some(edge => edge.target === target.id && edge.targetHandle === input)) return false;
    if (!(paletteImage || source.type === 'compare' || (source.type === 'painter' || source.type === 'masks-extractor') || source.type === 'color-correction' || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || source.type === 'blend' || source.type === 'rotate-flip' || source.type === 'resize' || source.type === 'compositor' || isImageGeneratorNode(source) || (source.type === 'file' && (fileOutputKind(source.data) === 'image' || (source.id === pendingImportId && fileAssets(source.data).length === 0))))) return false;
  }
  if (target?.type === 'model-input') return false;
  if (target && isImageGeneratorNode(target)) {
    if (currentEdges.some(edge => edge.target === target.id && edge.targetHandle === connection.targetHandle)) return false;
    if (connection.targetHandle === 'prompt' || (target.data.exposed ?? []).some(field => field in (target.type === 'sunburst' ? sunburstFieldLabels : nanoBananaFieldLabels) && field === connection.targetHandle)) {
      if (!source || !(paletteText || ['text', 'image-describer', 'model-input'].includes(source.type ?? ''))) return false;
    } else if ((target.type === 'sunburst' && connection.targetHandle === 'mask') || (/^image-\d+$/.test(connection.targetHandle ?? '') && (target.type === 'sunburst' || Number(connection.targetHandle?.slice(6)) < target.data.imageInputs))) {
      if (!source || !(paletteImage || source.type === 'compare' || isImageGeneratorNode(source) || (source.type === 'painter' || source.type === 'masks-extractor') || source.type === 'color-correction' || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || source.type === 'blend' || source.type === 'rotate-flip' || source.type === 'resize' || source.type === 'compositor' || (source.type === 'file' && (fileOutputKind(source.data) === 'image' || (source.id === pendingImportId && fileAssets(source.data).length === 0))))) return false;
    } else return false;
  }
  if (source && (paletteImage || source.type === 'compare' || isImageGeneratorNode(source) || (source.type === 'painter' || source.type === 'masks-extractor') || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || source.type === 'blend' || source.type === 'rotate-flip' || source.type === 'resize' || source.type === 'compositor' || source.type === 'color-correction') && target?.type !== 'blend' && target?.type !== 'compare' && target?.type !== 'color-correction' && target?.type !== 'crop' && target?.type !== 'blur' && target?.type !== 'levels' && target?.type !== 'invert' && target?.type !== 'rotate-flip' && target?.type !== 'resize' && target?.type !== 'compositor' && target?.type !== 'preview' && target?.type !== 'painter' && target?.type !== 'masks-extractor' && !isImageGeneratorNode(target) && !(target?.type === 'image-describer' && connection.targetHandle?.startsWith('image-'))) return false;
  if (target?.type === 'image-describer') {
    if (currentEdges.some((e) => e.target === target.id && e.targetHandle === connection.targetHandle)) return false;
    const source = nodes.find((n) => n.id === connection.source);
    if (connection.targetHandle?.startsWith('image-')) {
      if (!source || !(paletteImage || source.type === 'compare' || isImageGeneratorNode(source) || (source.type === 'painter' || source.type === 'masks-extractor') || source.type === 'color-correction' || source.type === 'crop' || source.type === 'blur' || source.type === 'levels' || source.type === 'invert' || source.type === 'blend' || source.type === 'rotate-flip' || source.type === 'resize' || source.type === 'compositor' || (source.type === 'file' && (fileOutputKind(source.data) === 'image' || (source.id === pendingImportId && fileAssets(source.data).length === 0))))) return false;
    } else if (!source || !(paletteText || ['text', 'model-input', 'image-describer'].includes(source.type ?? ''))) return false;
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
