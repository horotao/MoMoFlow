import type { Edge } from '@xyflow/react';
import { annotationHistory } from './interactiveEdit.ts';
import { orderedAssets } from './fileCollection.ts';
import { resolveOutputSource } from './router.ts';
import { imageOutput } from './sunburstRun.ts';
import { isInteractiveEditNode, type AppNode, type FileAsset, type InteractiveEditNode } from './types.ts';

export function sameAnnotationImage(first: FileAsset, second: FileAsset) {
  return first.id === second.id || first.url === second.url
    || Boolean(first.contentHash && first.contentHash === second.contentHash);
}

export function annotationImage(node: InteractiveEditNode, nodes: AppNode[], edges: Edge[]) {
  const input = edges.find(edge => edge.target === node.id && edge.targetHandle === 'image');
  if (!input) return node.data.baseImage;
  const source = resolveOutputSource(nodes.find(item => item.id === input.source), input.sourceHandle, nodes, edges);
  if (source?.node.type === 'file' && source.handle === 'file') {
    const data = source.node.data;
    const assets = orderedAssets(data);
    const active = 'activeAssetId' in data ? data.activeAssetId : undefined;
    const image = assets.find(asset => asset.id === active) ?? assets[0];
    return image?.kind === 'image' ? image : undefined;
  }
  return source ? imageOutput(source.node, source.handle, nodes, edges)[0] : undefined;
}

export function annotationOutput(node: AppNode | undefined, handle: string | null | undefined, nodes: AppNode[], edges: Edge[]) {
  if (!isInteractiveEditNode(node) || !handle) return;
  const image = annotationImage(node, nodes, edges);
  if (!image) return;
  const history = annotationHistory(node.data, image.id);
  const marks = history.frames[history.index];
  const index = marks.findIndex(mark => mark.id === handle);
  if (index >= 0) return { mark: marks[index], index, image };
}
