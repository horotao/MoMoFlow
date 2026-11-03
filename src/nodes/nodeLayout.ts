import type { AppNode } from './types';
import { isCompositorNode, isDescriberNode, isImageGeneratorNode } from './types.ts';
import { ideogramImageInputCount } from './ideogram.ts';

// Figma canvas dimensions × 2. Screen-space parameter toolbars are separate.
export const nodeLayout = {
  imageWidth: 400,
  textWidth: 452,
  portInset: 38,
  portDiameter: 30,
  firstPortY: 95,
  portGap: 42,
};

export const nodePortY = (index = 0) => nodeLayout.firstPortY + index * nodeLayout.portGap;
export const nodeFrameWidth = (type: string | undefined) => ['text', 'text-iterator', 'image-describer'].includes(type ?? '') ? nodeLayout.textWidth + nodeLayout.portInset * 2
  : ['file', 'image-iterator', 'sunburst', 'ideogram', 'nano-banana', 'painter', 'blur', 'resize', 'crop', 'blend', 'matte-grow-shrink', 'masks-extractor', 'compare', 'color-correction', 'levels'].includes(type ?? '') ? nodeLayout.imageWidth + nodeLayout.portInset * 2 : undefined;

export function nodePortRow(node: AppNode, handle: string | null | undefined, direction: 'source' | 'target') {
  if (direction === 'source') return handle === 'mask' || handle === 'output-2' || (node.type === 'color-palette' && handle === 'text') ? 1 : 0;
  if (node.type === 'text') return Math.max(0, Number(handle?.match(/^variable-(\d+)$/)?.[1] ?? 1) - 1);
  if (isCompositorNode(node)) return Math.max(0, node.data.document.inputs.findIndex(input => input.id === handle));
  if (isImageGeneratorNode(node)) {
    const count = node.type === 'ideogram' ? ideogramImageInputCount(node.data.imageInputs) : node.data.imageInputs;
    if (handle === 'prompt') return 0;
    if (handle?.startsWith('image-')) return Number(handle.slice(6)) + 1;
    if (handle === 'mask') return count + 1;
    return count + (node.type === 'nano-banana' ? 1 : 2) + Math.max(0, (node.data.exposed ?? []).findIndex(field => field === handle));
  }
  if (isDescriberNode(node)) return handle?.startsWith('image-') ? Number(handle.slice(6))
    : node.data.imageInputs + Math.max(0, (node.data.exposed ?? []).findIndex(field => field === handle));
  return handle === 'front' || handle === 'input-2' ? 1 : 0;
}

export function nodePortCenterY(node: AppNode, handle: string | null | undefined, direction: 'source' | 'target', index?: number) {
  if (node.type === 'router') return 31;
  if (node.type === 'model-input') return 32;
  return nodePortY(index ?? nodePortRow(node, handle, direction));
}

// Coordinates of the visible connection edge, relative to the node's origin.
// Legacy shells keep their bodies; their ports sit 8px outside the card.
export function nodeConnectionOffset(node: AppNode, handle: string | null | undefined, direction: 'source' | 'target') {
  const frameWidth = nodeFrameWidth(node.type);
  const width = frameWidth ?? (node.type === 'router' || node.type === 'model-input' ? 250 : 460);
  const outside = frameWidth ? 0 : nodeLayout.portInset;
  return { x: direction === 'source' ? width + outside : frameWidth ? 0 : -outside, y: nodePortCenterY(node, handle, direction) };
}
