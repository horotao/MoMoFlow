import type { Connection, Edge, XYPosition } from '@xyflow/react';
import type { AppNode } from './types';
import { acceptsVideoAudio, videoAudioHandles, isVideoFrameHandle, videoInputHandles } from './videoComposer.ts';
import { isCanvasVideo, isVideoComposerNode, isCanvasImageNode, isCanvasTextNode, isImportedCanvasImage, isNodeLocked } from './types.ts';
import { canvasOutputHandle, relayHandles, routedEdges, routerSize, routerTypes } from './router.ts';
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
  itemId: 'text' | 'image' | 'video' | 'audio' | 'router';
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

export function connectionChoices(pending: PendingConnection, nodes: AppNode[], edges: Edge[] = []): ConnectionChoice[] {
  return portChoices(pending, nodes.find(item => item.id === pending.nodeId), edges, nodes);
}

export function portChoices(pending: Pick<PendingConnection, 'direction' | 'handleId'>, node: AppNode | undefined, edges: Edge[] = [], nodes: AppNode[] = []): ConnectionChoice[] {
  if (!node || isNodeLocked(node)) return [];
  const forward = pending.direction === 'source';
  const router: ConnectionChoice = { id: forward ? 'router:in' : 'router:out', itemId: 'router',
    handleId: forward ? 'in' : 'out', portX: forward ? -24 : routerSize.width + 28, portY: routerSize.height / 2 };
  if (node.type !== 'router') {
    const choices = directChoices(pending, node);
    return choices.length ? [...choices, router] : [];
  }
  if (pending.handleId !== (forward ? 'out' : 'in')) return [];
  const relevant = forward ? edges : edges.filter(edge => edge.target !== node.id);
  const required = routerTypes(node.id, relevant);
  const handles = relayHandles.filter(handle => !required.size || required.has(handle));
  const originId = routedEdges(edges).find(edge => edge.target === node.id && edge.targetHandle === 'in')?.source;
  const origin = nodes.find(item => item.id === originId);
  const choices = handles.flatMap(handle => forward ? downstreamChoices(handle, origin) : [outputChoice(handle)]);
  return [...choices, router];
}

function outputChoice(handle: typeof relayHandles[number]): ConnectionChoice {
  const itemId = handle === 'result' ? 'image' : handle;
  const width = itemId === 'video' ? canvasImageSize('16:9').width : canvasImageBaseSize;
  return { id: itemId + ':output', itemId, handleId: handle, portX: width + 28, portY: 192 };
}

function directChoices(pending: Pick<PendingConnection, 'direction' | 'handleId'>, node: AppNode): ConnectionChoice[] {
  const output = canvasOutputHandle(node);
  if (pending.direction === 'source') return output && output === pending.handleId ? downstreamChoices(output, node) : [];
  if (isCanvasImageNode(node) && (node.data.inpaint || isImportedCanvasImage(node))) return [];
  if (isVideoComposerNode(node)) {
    if (videoInputHandles.includes(pending.handleId ?? '')) return [outputChoice('video')];
    if (acceptsVideoAudio(node.data.videoComposer) && videoAudioHandles.includes(pending.handleId ?? '')) return [outputChoice('audio')];
  }
  if ((isCanvasImageNode(node) || isVideoComposerNode(node) || node.type === 'audio') && pending.handleId === 'prompt'
    || isCanvasTextNode(node) && pending.handleId === 'text') return [outputChoice('text')];
  if ((isCanvasImageNode(node) || isCanvasTextNode(node) || isVideoComposerNode(node)) && isImageInputHandle(pending.handleId)
    || isVideoComposerNode(node) && isVideoFrameHandle(pending.handleId)) return [outputChoice('result')];
  return [];
}

function downstreamChoices(handle: typeof relayHandles[number], node?: AppNode): ConnectionChoice[] {
  const videoWidth = canvasImageSize('16:9').width;
  const videoTarget = (handleId: string, offsetY: number): ConnectionChoice => {
    const source = node && isCanvasImageNode(node) ? selectedImageResult(node) : isCanvasVideo(node) ? node.data.asset : undefined;
    const { width, height } = canvasImageSize('16:9', source && hasImageDimensions(source) ? source : undefined);
    return { id: `video:${handleId}`, itemId: 'video', handleId,
      portX: -24 + (videoWidth - width) / 2, portY: height / 2 + offsetY };
  };
  if (handle === 'audio') return [videoTarget('audio-0', 60)];
  if (handle === 'video') return [videoTarget('video-0', 20)];
  if (handle === 'text') {
    return [{ id: 'image:prompt', itemId: 'image', handleId: 'prompt', portX: -24, portY: 192 },
      { id: 'text:text', itemId: 'text', handleId: 'text', portX: -24, portY: 192 }, videoTarget('prompt', -60),
      { id: 'audio:prompt', itemId: 'audio', handleId: 'prompt', portX: -24, portY: 192 }];
  }
  const { width, height } = canvasImageSize('auto', undefined, node && isCanvasImageNode(node) ? selectedImageResult(node) : undefined);
  return [{ id: 'image:image-0', itemId: 'image', handleId: 'image-0',
    portX: -24 - (width - canvasImageBaseSize) / 2, portY: height / 2 + 32 },
    { id: 'text:image-0', itemId: 'text', handleId: 'image-0', portX: -24, portY: 224 }, videoTarget('image-0', -20)];
}
