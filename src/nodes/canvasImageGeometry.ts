import type { Node, NodeOrigin } from '@xyflow/react';
import type { PreviewTask } from './taskQueue';

export const canvasImageBaseSize = 384;
const imageOrigin: NodeOrigin = [0.5, 0];

export function anchorCanvasImage<T extends Node>(node: T): T {
  if (node.origin?.[0] === imageOrigin[0] && node.origin[1] === imageOrigin[1]) return node;
  return {
    ...node,
    origin: imageOrigin,
    position: { x: node.position.x + canvasImageBaseSize / 2, y: node.position.y },
  };
}

type ImageDimensions = { width?: number; height?: number };

export function hasImageDimensions(image: ImageDimensions): image is Required<ImageDimensions> {
  const { width, height } = image;
  return typeof width === 'number' && Number.isFinite(width) && width > 0
    && typeof height === 'number' && Number.isFinite(height) && height > 0;
}

export function canvasImageSize(ratio: string, result?: ImageDimensions, reference?: ImageDimensions,
  generation?: Pick<PreviewTask, 'imageRequest' | 'nanoBananaRequest' | 'seedreamRequest'>) {
  // A pending preview uses the submitted request, even if the next-run controls
  // change. Historical previews keep using their own image dimensions.
  const requestedRatio = generation
    ? generation.imageRequest?.size ?? generation.nanoBananaRequest?.aspectRatio ?? generation.seedreamRequest?.size ?? ratio
    : ratio;
  const [width, height] = requestedRatio.split(/[:x]/).map(Number);
  const dimensions = (generation ? undefined : result) ?? (requestedRatio === 'auto' ? reference : undefined) ?? { width, height };
  if (!hasImageDimensions(dimensions)) return { width: canvasImageBaseSize, height: canvasImageBaseSize };
  const scale = canvasImageBaseSize / Math.min(dimensions.width, dimensions.height);
  return { width: Math.round(dimensions.width * scale), height: Math.round(dimensions.height * scale) };
}
