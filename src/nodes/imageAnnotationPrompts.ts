import type { Edge } from '@xyflow/react';
import { annotationAssets, annotationOutput, isAnnotationSource, selectedImageResult, type AnnotationSource } from './annotationGraph.ts';
import { annotationLimit, commitAnnotations, fileAnnotationHistory, fileAnnotationInputPrefix, isAnnotationInput, resultAnnotationDraftHandle, type AnnotationHistory } from './interactiveEdit.ts';
import { resolveOutputSource } from './outputPort.ts';
import { documentText, hasVariable, restoreVariables, textToDocument, variablePositions, withoutVariables, type VariablePosition } from './textDocument.ts';
import { isTextNode } from './textVariables.ts';
import { isFileNode, isImageGeneratorNode, type AppNode } from './types.ts';

export const isInlineAnnotationLink = (edge: Edge) => edge.targetHandle !== resultAnnotationDraftHandle && Boolean(edge.targetHandle?.startsWith(fileAnnotationInputPrefix));

export function editImageAnnotationsFromPrompt(nodes: AppNode[], removed: Edge[], restored: Edge[]) {
  const annotationsByNode = new Map<string, AnnotationHistory[]>();
  const synced = new Set<string>();
  for (const node of nodes) {
    if (!isAnnotationSource(node) || node.data.locked || !node.data.annotations?.length) continue;
    const deletions = removed.filter(edge => edge.source === node.id);
    const restoreIds = new Set(restored.filter(edge => edge.source === node.id).map(edge => edge.sourceHandle));
    if (!deletions.length && !restoreIds.size) continue;
    const images = new Set(annotationAssets(node).filter(asset => asset.kind === 'image').map(asset => asset.id));
    const histories = node.data.annotations.map(history => {
      if (!history.imageId || !images.has(history.imageId)) return history;
      const deleteIds = new Set(deletions.filter(edge => {
        if (!history.frames.some(frame => frame.some(mark => mark.id === edge.sourceHandle))) return false;
        synced.add(edge.id);
        return true;
      }).map(edge => edge.sourceHandle));
      const current = history.frames[history.index];
      const next = current.filter(mark => !deleteIds.has(mark.id));
      // Restore a grouped text undo in reverse order of deletion. Keep marks
      // edited since then instead of rewinding the whole image's history.
      const missing = new Set(restoreIds);
      for (const mark of next) missing.delete(mark.id);
      for (let index = history.index; index >= 0 && missing.size && next.length < annotationLimit; index--) {
        for (const [position, mark] of history.frames[index].entries()) {
          if (next.length === annotationLimit) break;
          if (missing.delete(mark.id)) next.splice(position, 0, mark);
        }
      }
      return next.length === current.length && next.every((mark, index) => mark === current[index])
        ? history : commitAnnotations(history, history.imageId, next);
    });
    if (histories.some((history, index) => history !== node.data.annotations?.[index])) annotationsByNode.set(node.id, histories);
  }
  return { annotationsByNode, synced };
}

function promptImages(nodes: AppNode[], edges: Edge[]) {
  const inputs = new Map<string, Edge[]>();
  const lookup = new Map(nodes.map(node => [node.id, node]));
  for (const edge of edges) {
    if (edge.targetHandle !== 'prompt' && !/^image-\d+$/.test(edge.targetHandle ?? '')) continue;
    const target = lookup.get(edge.target);
    if (!target || !isImageGeneratorNode(target)) continue;
    const list = inputs.get(edge.target) ?? [];
    list.push(edge);
    inputs.set(edge.target, list);
  }
  const pairs = new Map<string, Map<string, { node: AnnotationSource; imageId?: string }>>();
  for (const modelInputs of inputs.values()) {
    const origin = (edge: Edge) => resolveOutputSource(lookup.get(edge.source), edge.sourceHandle);
    const promptEdge = modelInputs.find(edge => edge.targetHandle === 'prompt');
    const prompt = promptEdge && origin(promptEdge)?.node;
    if (!prompt || !isTextNode(prompt)) continue;
    const files = pairs.get(prompt.id) ?? new Map<string, { node: AnnotationSource; imageId?: string }>();
    for (const edge of modelInputs) {
      if (edge === promptEdge) continue;
      const source = origin(edge);
      if (source?.handle === 'file' && isFileNode(source.node) && source.node.data.annotations?.length) files.set(source.node.id, { node: source.node });
      if (source?.handle === 'result' && isImageGeneratorNode(source.node) && source.node.data.annotations?.length) {
        const image = selectedImageResult(source.node);
        if (image) files.set(source.node.id, { node: source.node, imageId: image.id });
      }
    }
    if (files.size) pairs.set(prompt.id, files);
  }
  const invalidDrafts = new Set<string>();
  for (const edge of edges) {
    if (edge.targetHandle !== resultAnnotationDraftHandle) continue;
    const source = lookup.get(edge.source), prompt = lookup.get(edge.target);
    const imageId = edge.data?.assetId;
    if (!isImageGeneratorNode(source) || typeof imageId !== 'string' || !prompt || !isTextNode(prompt)) {
      invalidDrafts.add(edge.id);
      continue;
    }
    const files = pairs.get(prompt.id) ?? new Map();
    files.set(source.id, { node: source, imageId });
    pairs.set(prompt.id, files);
  }
  return { pairs, invalidDrafts };
}

const markKey = (source: string, handle?: string | null) => JSON.stringify([source, handle]);

function savedPositions(edge: Edge): VariablePosition[] {
  const positions = edge.data?.annotationPromptPositions;
  return Array.isArray(positions) ? positions.filter(position => position && [position.paragraph, position.offset, position.slot]
    .every(value => Number.isSafeInteger(value) && value >= 0)) : [];
}

export function syncImageAnnotationPrompts(nodes: AppNode[], edges: Edge[]) {
  if (!nodes.some(node => isAnnotationSource(node) && node.data.annotations?.length)
    && !edges.some(edge => isInlineAnnotationLink(edge) || edge.targetHandle === resultAnnotationDraftHandle)) return { nodes, edges };
  const { pairs, invalidDrafts } = promptImages(nodes, edges);
  const sources = new Map(nodes.map(node => [node.id, node]));
  const annotationEdges = edges.filter(edge => edge.targetHandle !== resultAnnotationDraftHandle && isAnnotationInput(edge.targetHandle));
  const removed = new Set(invalidDrafts);
  const added: Edge[] = [];
  const updated = new Map<string, Edge>();
  const nextNodes = nodes.map<AppNode>(node => {
    if (!isTextNode(node)) return node;
    const existing = annotationEdges.filter(edge => edge.target === node.id);
    const files = pairs.get(node.id);
    if (!files && !existing.length) return node;
    const retained = new Set<string>();
    const live = new Map<string, { sourceId: string; markId: string }>();
    for (const { node: file, imageId } of files?.values() ?? []) for (const asset of annotationAssets(file)) {
      if (asset.kind !== 'image') continue;
      const history = fileAnnotationHistory(file.data.annotations, asset.id);
      for (const frame of history.frames) for (const mark of frame) retained.add(markKey(file.id, mark.id));
      if (!imageId || imageId === asset.id) {
        for (const mark of history.frames[history.index]) live.set(markKey(file.id, mark.id), { sourceId: file.id, markId: mark.id });
      }
    }
    const removedHandles = new Set<string>();
    const restoredHandles: string[] = [];
    const toRemember = new Map<string, Edge>();
    const toRestore = new Map<string, VariablePosition[]>();
    for (const edge of existing) {
      const key = markKey(edge.source, edge.sourceHandle);
      const handle = edge.targetHandle;
      if (isInlineAnnotationLink(edge) && !retained.has(key)) {
        removed.add(edge.id);
        if (handle) removedHandles.add(handle);
        continue;
      }
      const active = live.delete(key);
      const source = sources.get(edge.source);
      if (!handle || edge.data?.annotationDismissed || !isAnnotationSource(source)) continue;
      const present = node.data.content && hasVariable(node.data.content, handle);
      if (isInlineAnnotationLink(edge) ? !active : !annotationOutput(source, edge.sourceHandle, nodes, edges)) {
        if (present) {
          removedHandles.add(handle);
          toRemember.set(handle, edge);
        }
        continue;
      }
      const positions = savedPositions(edge);
      if (!present && positions.length) toRestore.set(handle, positions);
      else if (!present && edge.data?.annotationDeletedFromPrompt) restoredHandles.push(handle);
      if (edge.data?.annotationPromptPositions || edge.data?.annotationDeletedFromPrompt) {
        const data = { ...edge.data };
        delete data.annotationPromptPositions;
        delete data.annotationDeletedFromPrompt;
        updated.set(edge.id, { ...edge, data: Object.keys(data).length ? data : undefined });
      }
    }
    if (!removedHandles.size && !toRestore.size && !restoredHandles.length && (!live.size || node.data.locked)) return node;
    const original = node.data.content ?? textToDocument(node.data.text);
    for (const [handle, positions] of variablePositions(original, new Set(toRemember.keys()))) {
      const edge = toRemember.get(handle)!;
      updated.set(edge.id, { ...edge, data: { ...edge.data, annotationPromptPositions: positions } });
    }
    let content = removedHandles.size ? withoutVariables(original, removedHandles) : original;
    content = restoreVariables(content, node.id, toRestore);
    if (restoredHandles.length || (live.size && !node.data.locked)) {
      const newHandles = node.data.locked ? [] : [...live].map(([key, { sourceId, markId }]) => {
        const targetHandle = fileAnnotationInputPrefix + key;
        added.push({ id: JSON.stringify([node.id, targetHandle]), source: sourceId, sourceHandle: markId, target: node.id, targetHandle });
        return targetHandle;
      });
      const atoms = [...restoredHandles, ...newHandles].flatMap(handleId => [
        { type: 'text', text: ' ' }, { type: 'promptVariable', attrs: { ownerId: node.id, handleId } },
      ]);
      const paragraphs = content.content?.length ? content.content : [{ type: 'paragraph' }];
      const last = paragraphs[paragraphs.length - 1];
      const children = last.content ?? [];
      content = { ...content, content: [...paragraphs.slice(0, -1), { ...last, content: [...children, ...(children.length ? atoms : atoms.slice(1))] }] };
    }
    return content === original ? node : { ...node, data: { ...node.data, content, text: documentText(content) } };
  });
  return {
    nodes: nextNodes.some((node, index) => node !== nodes[index]) ? nextNodes : nodes,
    edges: added.length || removed.size || updated.size
      ? [...edges.filter(edge => !removed.has(edge.id)).map(edge => updated.get(edge.id) ?? edge), ...added] : edges,
  };
}
