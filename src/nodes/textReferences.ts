import type { Edge } from '@xyflow/react';
import type { ImagePromptReference } from '../components/image-prompt-node/ImagePromptReferences';
import type { SunburstNode, CanvasText } from './types.ts';
import { selectedImageResult } from './annotationGraph.ts';
import { imageInputHandles, isImageInputHandle } from './connectionRules.ts';

/** Text stays first; image previews follow the same occupied-port order as the request. */
export function textReferenceEdges(id: string, edges: Edge[]) {
  const slot = (edge: Edge) => edge.targetHandle === 'text' ? -1 : imageInputHandles.indexOf(edge.targetHandle!);
  return edges.filter(edge => edge.target === id && (edge.targetHandle === 'text' || isImageInputHandle(edge.targetHandle)))
    .sort((a, b) => slot(a) - slot(b));
}

export function textInputReferences(edges: Edge[], sources: readonly Pick<SunburstNode | CanvasText, 'id' | 'type' | 'data'>[]): ImagePromptReference[] {
  return edges.map(edge => {
    const source = sources.find(node => node.id === edge.source);
    if (edge.targetHandle === 'text') return { id: edge.id, kind: 'text', name: source?.data.label || '上游 Text' };
    const asset = source?.type === 'sunburst' ? selectedImageResult({ data: source.data as SunburstNode['data'] }) : undefined;
    return { id: edge.id, kind: 'image', name: asset?.name || source?.data.label || '上游 Image', url: asset?.url };
  });
}
