import type { Connection, XYPosition } from '@xyflow/react';
import type { AppNode } from './types';
import { isVideoFrameHandle, videoInputHandles } from './videoComposer.ts';
import { isCanvasVideo, isVideoComposerNode, isCanvasImageNode, isCanvasTextNode, isImportedCanvasImage, isNodeLocked } from './types.ts';
import { isImageInputHandle } from './connectionRules.ts';
import { selectedImageResult } from './annotationGraph.ts';
import { canvasImageBaseSize, canvasImageSize, hasImageDimensions } from './canvasImageGeometry.ts';

export type PendingConnection = {
  nodeId: string;
  handleId: string | null;
  direction: 'source' | 'target';
  screen: XYPosition;
  position: XYPosition;
};
export type ConnectionChoice = {
  id: string;
  itemId: 'text' | 'image' | 'video' | 'audio';
  handleId: string | null;
  portX: number;
  portY: number;
  detail?: string;
};

export function choiceConnection(pending: PendingConnection, choice: ConnectionChoice, newId: string): Connection {
  return pending.direction === 'source'
    ? { source: pending.nodeId, sourceHandle: pending.handleId, target: newId, targetHandle: choice.handleId }
    : { source: newId, sourceHandle: choice.handleId, target: pending.nodeId, targetHandle: pending.handleId };
}

export function connectionChoices(pending: PendingConnection, nodes: AppNode[]): ConnectionChoice[] {
  const node = nodes.find(item => item.id === pending.nodeId);
  if (!node || (!isCanvasImageNode(node) && !isCanvasTextNode(node) && !isCanvasVideo(node) && node.type !== 'audio') || isNodeLocked(node)) return [];
  if (pending.direction === 'target' && (isCanvasImageNode(node) && node.data.inpaint || isCanvasVideo(node) && !isVideoComposerNode(node))) return [];
  // The new node is anchored by its top center, like Image, with three inputs spaced 40 units apart.
  const videoWidth = canvasImageSize('16:9').width;
  const videoTarget = (handleId: string, offsetY: number): ConnectionChoice => {
    const source = isCanvasImageNode(node) ? selectedImageResult(node) : isCanvasVideo(node) ? node.data.asset : undefined;
    const { width, height } = canvasImageSize('16:9', source && hasImageDimensions(source) ? source : undefined);
    return { id: `video:${handleId}`, itemId: 'video', handleId,
      portX: -24 + (videoWidth - width) / 2, portY: height / 2 + offsetY };
  };
  if (isCanvasVideo(node) && pending.direction === 'source' && pending.handleId === 'video') return [videoTarget('video-0', 40)];
  if (isVideoComposerNode(node) && pending.direction === 'target' && videoInputHandles.includes(pending.handleId ?? '')) {
    return [{ id: 'video:output', itemId: 'video', handleId: 'video', portX: videoWidth + 28, portY: 192 }];
  }
  if (isCanvasTextNode(node) && pending.direction === 'source' && pending.handleId === 'text') {
    return [{ id: 'image:prompt', itemId: 'image', handleId: 'prompt', portX: -24, portY: 192 },
      { id: 'text:text', itemId: 'text', handleId: 'text', portX: -24, portY: 192 }, videoTarget('prompt', -40),
      { id: 'audio:prompt', itemId: 'audio', handleId: 'prompt', portX: -24, portY: 192 }];
  }
  if (pending.direction === 'target' && (isCanvasTextNode(node) && pending.handleId === 'text'
    || (node.type === 'audio' || isVideoComposerNode(node) || isCanvasImageNode(node) && !isImportedCanvasImage(node)) && pending.handleId === 'prompt')) {
    return [{ id: 'text:text-output', itemId: 'text', handleId: 'text', portX: 412, portY: 192 }];
  }
  if (isCanvasImageNode(node) && pending.direction === 'source' && pending.handleId === 'result') {
    const { width, height } = canvasImageSize('auto', undefined, selectedImageResult(node));
    return [{ id: 'image:image-0', itemId: 'image', handleId: 'image-0',
      portX: -24 - (width - canvasImageBaseSize) / 2, portY: height / 2 + 32 },
      { id: 'text:image-0', itemId: 'text', handleId: 'image-0', portX: -24, portY: 224 }, videoTarget('image-0', 0)];
  }
  if (pending.direction === 'target' && !isImportedCanvasImage(node) && (isImageInputHandle(pending.handleId) || isVideoFrameHandle(pending.handleId))) {
    return [{ id: 'image:result', itemId: 'image', handleId: 'result', portX: 412, portY: 192 }];
  }
  return [];
}
