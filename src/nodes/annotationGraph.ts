import type { Edge } from '@xyflow/react';
import { annotationHistory, fileAnnotationHistory, resultAnnotationDraftHandle, type AnnotationHistory } from './interactiveEdit.ts';
import { activeFileAsset, fileAssets } from './fileCollection.ts';
import { resolveOutputSource } from './outputPort.ts';
import { imageOutput } from './sunburstRun.ts';
import { isFileNode, isImageGeneratorNode, isInteractiveEditNode, type AppNode, type FileAsset, type FileNode, type ImageGeneratorNode, type InteractiveEditNode } from './types.ts';

export type AnnotationSource = FileNode | ImageGeneratorNode;
export const isAnnotationSource = (node: AppNode | undefined): node is AnnotationSource => isFileNode(node) || isImageGeneratorNode(node);
export const annotationAssets = (node: AnnotationSource) => isFileNode(node) ? fileAssets(node.data) : node.data.results ?? [];
export function selectedImageResult(node: Pick<ImageGeneratorNode, 'data'>) {
  const results = node.data.results ?? [];
  return results.find(asset => asset.id === node.data.activeResultId) ?? results[results.length - 1];
}

export function withImageAnnotationHistories<T extends AnnotationSource>(node: T, annotations: AnnotationHistory[]): T {
  return { ...node, data: { ...node.data, annotations } };
}

export const canAnnotateResult = (asset: FileAsset | undefined): asset is FileAsset =>
  Boolean(asset?.kind === 'image' && !/\.(?:svg|gif)$/i.test(asset.name));

export function resultAnnotationDraft(source: string, assetId: string, edges: Edge[]) {
  return edges.find(edge => edge.source === source && edge.targetHandle === resultAnnotationDraftHandle && edge.data?.assetId === assetId);
}

const resultAssetPrefix = 'annotation-result:';
export const isPinnedResultHandle = (handle?: string | null): handle is `${typeof resultAssetPrefix}${string}` =>
  Boolean(handle?.startsWith(resultAssetPrefix));

export function pinnedResultInput(edge: Edge, promptId: string | undefined, nodes: AppNode[], edges: Edge[]) {
  if (!promptId) return;
  const origin = resolveOutputSource(nodes.find(node => node.id === edge.source), edge.sourceHandle);
  const promptNode = nodes.find(node => node.id === promptId);
  const prompt = resolveOutputSource(promptNode, null);
  if (origin?.handle !== 'result' || !isImageGeneratorNode(origin.node) || !prompt) return;
  const draft = edges.find(item => item.source === origin.node.id && item.target === prompt.node.id && item.targetHandle === resultAnnotationDraftHandle);
  if (!draft || typeof draft.data?.assetId !== 'string') return;
  return { ...edge, source: origin.node.id, sourceHandle: resultAssetPrefix + draft.data.assetId };
}

export function pinnedResultAsset(node: AppNode | undefined, handle: string | null | undefined) {
  if (!isPinnedResultHandle(handle) || !isImageGeneratorNode(node)) return;
  return node.data.results?.find(asset => asset.id === handle.slice(resultAssetPrefix.length));
}

export function storedAnnotationResult(node: AppNode, handle: string | null | undefined, nodes: AppNode[], edges: Edge[]) {
  if (!isImageGeneratorNode(node)) return;
  const pinned = pinnedResultAsset(node, handle);
  return pinned ? { image: pinned } : annotationOutput(node, handle, nodes, edges);
}

export function sameAnnotationImage(first: FileAsset, second: FileAsset) {
  return first.id === second.id || first.url === second.url
    || Boolean(first.contentHash && first.contentHash === second.contentHash);
}

export function annotationImage(node: InteractiveEditNode, nodes: AppNode[], edges: Edge[]) {
  const input = edges.find(edge => edge.target === node.id && edge.targetHandle === 'image');
  if (!input) return node.data.baseImage;
  const source = resolveOutputSource(nodes.find(item => item.id === input.source), input.sourceHandle);
  if (source?.node.type === 'file' && source.handle === 'file') {
    const image = activeFileAsset(source.node.data);
    return image?.kind === 'image' ? image : undefined;
  }
  return source ? imageOutput(source.node, source.handle)[0] : undefined;
}

export function annotationOutput(node: AppNode | undefined, handle: string | null | undefined, nodes: AppNode[], edges: Edge[]) {
  if (!handle || handle === 'file' || handle === 'result' || handle.startsWith(resultAssetPrefix)) return;
  if (isAnnotationSource(node)) {
    if (!node.data.annotations?.length) return;
    for (const image of annotationAssets(node)) {
      if (image.kind !== 'image') continue;
      const history = fileAnnotationHistory(node.data.annotations, image.id);
      const marks = history.frames[history.index];
      const index = marks.findIndex(mark => mark.id === handle);
      if (index >= 0) return { mark: marks[index], index, image };
    }
    return;
  }
  if (!isInteractiveEditNode(node)) return;
  const image = annotationImage(node, nodes, edges);
  if (!image) return;
  const history = annotationHistory(node.data, image.id);
  const marks = history.frames[history.index];
  const index = marks.findIndex(mark => mark.id === handle);
  if (index >= 0) return { mark: marks[index], index, image };
}
