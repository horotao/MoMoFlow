import type { Connection, XYPosition } from '@xyflow/react';
import type { AppNode } from './types';
import { isCanvasImageNode, isImportedCanvasImage, isNodeLocked } from './types.ts';
import { isImageInputHandle } from './connectionRules.ts';
import { selectedImageResult } from './annotationGraph.ts';
import { canvasImageBaseSize, canvasImageSize } from './canvasImageGeometry.ts';

export type PendingConnection = {
  nodeId: string;
  handleId: string | null;
  direction: 'source' | 'target';
  screen: XYPosition;
  position: XYPosition;
};
export type ConnectionChoice = {
  id: string;
  itemId: string;
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
  if (!node || !isCanvasImageNode(node) || isNodeLocked(node)) return [];
  if (pending.direction === 'source' && pending.handleId === 'result') {
    const { width, height } = canvasImageSize('auto', undefined, selectedImageResult(node));
    return [{ id: 'image:image-0', itemId: 'image', handleId: 'image-0',
      portX: -24 - (width - canvasImageBaseSize) / 2, portY: height / 2 + 20 }];
  }
  if (pending.direction === 'target' && !isImportedCanvasImage(node) && isImageInputHandle(pending.handleId)) {
    return [{ id: 'image:result', itemId: 'image', handleId: 'result', portX: 412, portY: 192 }];
  }
  return [];
}
