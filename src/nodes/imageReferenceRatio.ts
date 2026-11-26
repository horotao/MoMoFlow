import type { Edge } from '@xyflow/react';
import type { AppNode, SunburstNode } from './types';
import { isCanvasImageNode } from './types.ts';
import { selectedImageResult } from './annotationGraph.ts';
import { imageInputHandles, isImageInputHandle } from './connectionRules.ts';
import { hasImageDimensions } from './canvasImageGeometry.ts';
import { changeComposerSettings, composerAspectRatio, composerAspectRatios } from './imageComposerSettings.ts';

type Dimensions = { width?: number; height?: number };

export function referenceRatioSettings(data: SunburstNode['data'], image?: Dimensions): Partial<SunburstNode['data']> | undefined {
  if (!data.composer || data.imageSource === 'imported' || data.locked
    || (!data.composer.followReferenceRatio && composerAspectRatio(data) !== 'auto') || !image || !hasImageDimensions(image)) return;
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

function firstReference(inputs: Edge[], nodes: Map<string, AppNode>) {
  for (const edge of inputs) {
    const source = nodes.get(edge.source);
    const asset = source && isCanvasImageNode(source) ? selectedImageResult(source) : undefined;
    if (asset) return asset;
  }
}

/** Start reference following when a new first input is connected, in the same canvas edit. */
export function connectImageReferenceRatio(nodes: AppNode[], previous: Edge[], edges: Edge[], target: string): AppNode[] {
  const inputs = references(edges, target);
  if (!inputs.length || inputs[0].id === references(previous, target)[0]?.id) return nodes;
  return nodes.map(node => {
    if (node.id !== target || !isCanvasImageNode(node) || node.data.imageSource === 'imported' || node.data.locked) return node;
    const data = { ...node.data, composer: { ...node.data.composer, followReferenceRatio: true } };
    const image = firstReference(inputs, new Map(nodes.map(item => [item.id, item])));
    return { ...node, data: { ...data, ...referenceRatioSettings(data, image) } };
  });
}

/** Apply a changed source and its followers' ratios in the same undo step. */
export function syncImageReferenceRatios(nodes: AppNode[], edges: Edge[], sourceId: string, busy: ReadonlySet<string>): AppNode[] {
  const targets = new Set(edges.filter(edge => edge.source === sourceId && isImageInputHandle(edge.targetHandle)).map(edge => edge.target));
  if (!targets.size) return nodes;
  const byId = new Map(nodes.map(node => [node.id, node]));
  return nodes.map(node => {
    if (!targets.has(node.id) || busy.has(node.id) || !isCanvasImageNode(node) || node.data.inpaint) return node;
    const patch = referenceRatioSettings(node.data, firstReference(references(edges, node.id), byId));
    return patch ? { ...node, data: { ...node.data, ...patch } } : node;
  });
}
