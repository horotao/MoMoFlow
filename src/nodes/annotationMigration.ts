import type { Edge } from '@xyflow/react';
import { annotationImage } from './annotationGraph.ts';
import { fileAssets } from './fileCollection.ts';
import { isAnnotationInput, withFileAnnotationHistory } from './interactiveEdit.ts';
import { resolveOutputSource } from './router.ts';
import { isFileNode, isImageGeneratorNode, isInteractiveEditNode, type AppNode, type FileNode } from './types.ts';

/** Retire the editor node while keeping old inline prompt references addressable. */
export function migrateFileAnnotations(nodes: AppNode[], edges: Edge[]) {
  if (!nodes.some(isInteractiveEditNode)) return { nodes, edges };
  const files = new Map<string, FileNode>();
  const replacements = new Map<string, string | undefined>();
  for (const node of nodes) {
    if (!isInteractiveEditNode(node)) continue;
    const input = edges.find(edge => edge.target === node.id && edge.targetHandle === 'image');
    const source = input && resolveOutputSource(nodes.find(item => item.id === input.source), input.sourceHandle, nodes, edges);
    const file = source?.handle === 'file' && isFileNode(source.node) ? files.get(source.node.id) ?? source.node : undefined;
    const history = node.data.history;
    const original = (file ? fileAssets(file.data) : source && isImageGeneratorNode(source.node) ? source.node.data.results ?? [] : [])
      .find(asset => asset.kind === 'image' && asset.id === history?.imageId);
    const fallback = node.data.baseImage?.id === history?.imageId ? node.data.baseImage : undefined;
    const image = original ?? fallback ?? annotationImage(node, nodes, edges);
    const saved = image?.id === history?.imageId && history?.frames.some(frame => frame.length) ? history : undefined;
    if (file && image && fileAssets(file.data).some(asset => asset.id === image.id) && !file.data.annotations?.some(item => item.imageId === image.id)) {
      if (saved) files.set(file.id, { ...file, data: { ...file.data, annotations: withFileAnnotationHistory(file.data.annotations, saved) } });
      replacements.set(node.id, saved ? file.id : undefined);
    } else if (image && (saved || node.data.baseImage)) {
      // An editor fed by a model/tool, or a second editor on the same image,
      // needs its own File snapshot to preserve that image and its mark history.
      files.set(node.id, { id: node.id, type: 'file', position: node.position, selected: node.selected,
        data: { label: node.data.label, locked: node.data.locked, assets: [image], annotations: saved ? [saved] : undefined } });
      replacements.set(node.id, saved ? node.id : undefined);
    } else replacements.set(node.id, undefined);
  }
  return {
    nodes: nodes.flatMap(node => {
      const file = files.get(node.id);
      return file ? [file] : isInteractiveEditNode(node) ? [] : [node];
    }),
    edges: edges.flatMap(edge => {
      if (replacements.has(edge.target)) return [];
      if (!replacements.has(edge.source)) return [edge];
      const source = replacements.get(edge.source);
      return source && isAnnotationInput(edge.targetHandle) ? [{ ...edge, source }] : [];
    }),
  };
}
