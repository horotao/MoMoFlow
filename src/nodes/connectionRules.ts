import type { Connection, Edge } from '@xyflow/react';
import { canvasOutputHandle, expectedSourceHandle, relayHandles, routerTypes } from './router.ts';
import { videoOptions } from './apimartVideo.ts';
import { acceptsVideoAudio, videoAudioHandles, defaultVideoComposer, isVideoFrameHandle, videoImageHandles, videoInputHandles } from './videoComposer.ts';
import { isCanvasVideo, isVideoComposerNode, isCanvasImageNode, isCanvasTextNode, isImportedCanvasImage, isNodeLocked, type AppNode } from './types.ts';

export const imageInputHandles = Array.from({ length: 16 }, (_, index) => `image-${index}`);
export const isImageInputHandle = (handle?: string | null) => !!handle && imageInputHandles.includes(handle);

export function isImageWire(connection: Pick<Edge, 'sourceHandle' | 'targetHandle'>) {
  return connection.sourceHandle === 'result' && isImageInputHandle(connection.targetHandle);
}
export function isCanvasWire(connection: Pick<Edge, 'sourceHandle' | 'targetHandle'>) {
  if (connection.targetHandle === 'in') return connection.sourceHandle === 'out' || relayHandles.some(handle => handle === connection.sourceHandle);
  if (connection.sourceHandle === 'out') return Boolean(expectedSourceHandle(connection.targetHandle));
  return connection.sourceHandle === 'audio' && videoAudioHandles.includes(connection.targetHandle ?? '')
    || connection.sourceHandle === 'video' && videoInputHandles.includes(connection.targetHandle ?? '') || connection.sourceHandle === 'result' && isVideoFrameHandle(connection.targetHandle) || isImageWire(connection) || connection.sourceHandle === 'text' && (connection.targetHandle === 'text' || connection.targetHandle === 'prompt');
}

export function withoutReplacedInput(connection: Pick<Edge, 'target' | 'targetHandle'>, edges: Edge[]) {
  return edges.filter(edge => edge.target !== connection.target || edge.targetHandle !== connection.targetHandle);
}

export function createsImageCycle(connection: Pick<Edge, 'source' | 'target'>, edges: Edge[]) {
  const pending = [connection.target];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === connection.source) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of edges) if (edge.source === id) pending.push(edge.target);
  }
  return false;
}

export function isAudioInputWire(connection: Pick<Edge, 'sourceHandle' | 'targetHandle'>, source: AppNode, target: AppNode) {
  return target.type === 'audio' && isCanvasTextNode(source) && connection.sourceHandle === 'text' && connection.targetHandle === 'prompt';
}

export function isVideoInputWire(connection: Pick<Edge, 'sourceHandle' | 'targetHandle'>, source: AppNode, target: AppNode) {
  if (!isVideoComposerNode(target)) return false;
  return source.type === 'audio' && connection.sourceHandle === 'audio' && acceptsVideoAudio(target.data.videoComposer) && videoAudioHandles.includes(connection.targetHandle ?? '')
    || isCanvasTextNode(source) && connection.sourceHandle === 'text' && connection.targetHandle === 'prompt'
    || isCanvasImageNode(source) && connection.sourceHandle === 'result' && (videoImageHandles.includes(connection.targetHandle ?? '') || isVideoFrameHandle(connection.targetHandle))
    || isCanvasVideo(source) && connection.sourceHandle === 'video' && videoInputHandles.includes(connection.targetHandle ?? '');
}

export function canConnect(connection: Connection | Edge, nodes: AppNode[], edges: Edge[]): boolean {
  const source = nodes.find(node => node.id === connection.source);
  const target = nodes.find(node => node.id === connection.target);
  if (!source || !target || isImportedCanvasImage(target) || isNodeLocked(source) || isNodeLocked(target)) return false;
  if (isCanvasImageNode(target) && target.data.inpaint) return false;
  const handle = canvasOutputHandle(source);
  if (source.type === 'router' ? connection.sourceHandle !== 'out' : !handle || connection.sourceHandle !== handle) return false;
  const input = connection.targetHandle;
  if (target.type === 'router') {
    if (input !== 'in') return false;
  } else if (!acceptsInput(target, input)) return false;

  if (source.type === 'router' || target.type === 'router') {
    const remaining = withoutReplacedInput(connection, edges);
    const types = source.type === 'router' ? routerTypes(source.id, remaining) : new Set<string>([handle!]);
    if (target.type === 'router') routerTypes(target.id, remaining).forEach(type => types.add(type));
    else types.add(expectedSourceHandle(input)!);
    if (types.size > 1) return false;
  } else if (handle !== expectedSourceHandle(input)) return false;

  if (isVideoComposerNode(target) && expectedSourceHandle(input) === 'result') {
    const frameMode = videoOptions(target.data.videoComposer ?? defaultVideoComposer).imageMode === 'first-last';
    if (isVideoFrameHandle(input) && !frameMode) return false;
    if (!frameMode && edges.filter(edge => edge.target === target.id && expectedSourceHandle(edge.targetHandle) === 'result'
      && edge.targetHandle !== input).length >= videoImageHandles.length) return false;
  }
  if (edges.some(edge => edge.source === source.id && edge.target === target.id)) return false;
  return !createsImageCycle(connection, withoutReplacedInput(connection, edges));
}

function acceptsInput(target: AppNode, input?: string | null) {
  if (isCanvasTextNode(target)) return input === 'text' || isImageInputHandle(input);
  if (isCanvasImageNode(target)) return input === 'prompt' || isImageInputHandle(input);
  if (target.type === 'audio') return input === 'prompt';
  return isVideoComposerNode(target) && (input === 'prompt' || isVideoFrameHandle(input)
    || videoImageHandles.includes(input ?? '') || videoInputHandles.includes(input ?? '')
    || acceptsVideoAudio(target.data.videoComposer) && videoAudioHandles.includes(input ?? ''));
}
