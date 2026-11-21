import type { Edge } from '@xyflow/react';
import type { AppNode, SunburstNode } from './types';
import { isCanvasImageNode } from './types.ts';
import { selectedImageResult } from './annotationGraph.ts';
import { imageInputHandles, isImageInputHandle } from './connectionRules.ts';
import { hasImageDimensions } from './canvasImageGeometry.ts';
import { changeComposerSettings, composerAspectRatios } from './imageComposerSettings.ts';

type Dimensions = { width?: number; height?: number };

export function referenceRatioSettings(data: SunburstNode['data'], image?: Dimensions): Partial<SunburstNode['data']> | undefined {
  if (!data.composer || data.imageSource === 'imported' || data.locked
    || (!data.composer.followReferenceRatio && data.composer.ratio !== 'auto') || !image || !hasImageDimensions(image)) return;
  // Ratio-only channels need a supported preset, including for nonstandard images.
  // Log distance treats landscape and portrait deviations symmetrically.
  const requested = image.width / image.height;
  let ratio = '1:1', distance = Infinity;
  for (const choice of composerAspectRatios(data)) {
    if (choice === 'auto') continue;
    const [width, height] = choice.split(':').map(Number);
    const next = Math.abs(Math.log(width / height / requested));
    if (next < distance) { ratio = choice; distance = next; }
  }
  const patch = changeComposerSettings(data, { ratio });
  const composer = { ...patch.composer, followReferenceRatio: true };
  if (data.composer.ratio === ratio && data.composer.followReferenceRatio
    && (!('size' in patch) || data.size === patch.size)) return;
  return { ...patch, composer };
}

function references(edges: Edge[], target: string) {
  return edges.filter(edge => edge.target === target && isImageInputHandle(edge.targetHandle))
    .sort((a, b) => imageInputHandles.indexOf(a.targetHandle!) - imageInputHandles.indexOf(b.targetHandle!));
}

/** Start reference following when a new first input is connected, in the same canvas edit. */
export function connectImageReferenceRatio(nodes: AppNode[], previous: Edge[], edges: Edge[], target: string): AppNode[] {
  const inputs = references(edges, target);
  if (!inputs.length || inputs[0].id === references(previous, target)[0]?.id) return nodes;
  return nodes.map(node => {
    if (node.id !== target || !isCanvasImageNode(node) || node.data.imageSource === 'imported' || node.data.locked) return node;
    const data = { ...node.data, composer: { ...node.data.composer, followReferenceRatio: true } };
    const image = inputs.flatMap(edge => {
      const source = nodes.find(item => item.id === edge.source);
      return source && isCanvasImageNode(source) ? [selectedImageResult(source)] : [];
    }).find(Boolean);
    return { ...node, data: { ...data, ...referenceRatioSettings(data, image) } };
  });
}
