import type { AppNode } from './types';
import { isCompositorNode, isDescriberNode, isImageGeneratorNode } from './types.ts';
import { ideogramImageInputCount } from './ideogram.ts';

// Figma canvas dimensions × 2. Screen-space parameter toolbars are separate.
export const nodeLayout = {
  imageWidth: 400,
  textWidth: 452,
  compactWidth: 344,
  portInset: 38,
  portDiameter: 30,
  firstPortY: 95,
  portGap: 42,
};

export const nodePortY = (index = 0) => nodeLayout.firstPortY + index * nodeLayout.portGap;
export const nodeFrameWidth = (type: string | undefined) => ['text', 'text-iterator', 'image-describer'].includes(type ?? '') ? nodeLayout.textWidth + nodeLayout.portInset * 2
  : ['router', 'model-input', 'position-logger'].includes(type ?? '') ? nodeLayout.compactWidth + nodeLayout.portInset * 2
  : ['file', 'image-iterator', 'sunburst', 'ideogram', 'nano-banana', 'painter', 'blur', 'resize', 'crop', 'blend', 'matte-grow-shrink', 'masks-extractor', 'compare', 'color-correction', 'levels', 'preview', 'invert', 'rotate-flip', 'color-palette', 'compositor'].includes(type ?? '') ? nodeLayout.imageWidth + nodeLayout.portInset * 2 : undefined;

export function modelParameterPosition(parent: AppNode, nodes: AppNode[], index: number) {
  const width = nodeFrameWidth('model-input')!, height = 200, gap = 40;
  const position = { x: parent.position.x - width - 90, y: parent.position.y + index * height };
  // Re-exposing a field leaves its old input intact. Find space without moving it
  // or covering neighboring nodes after the larger node frames are applied.
  const occupied = nodes.map(node => ({ ...node.position,
    width: nodeFrameWidth(node.type) ?? node.measured?.width ?? node.width ?? width,
    height: node.measured?.height ?? node.height ?? 400,
  }));
  for (;;) {
    const collision = occupied.find(box => position.x < box.x + box.width + gap && position.x + width + gap > box.x
      && position.y < box.y + box.height + gap && position.y + height + gap > box.y);
    if (!collision) return position;
    position.y = collision.y + collision.height + gap;
  }
}

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
  if (node.type === 'router') return 45;
  return nodePortY(index ?? nodePortRow(node, handle, direction));
}

// Coordinates of the visible connection edge, relative to the node's origin.
// Every registered node uses the shared frame; fallback is for unknown types.
export function nodeConnectionOffset(node: AppNode, handle: string | null | undefined, direction: 'source' | 'target') {
  const frameWidth = nodeFrameWidth(node.type);
  const width = frameWidth ?? 460;
  const outside = frameWidth ? 0 : nodeLayout.portInset;
  return { x: direction === 'source' ? width + outside : frameWidth ? 0 : -outside, y: nodePortCenterY(node, handle, direction) };
}
