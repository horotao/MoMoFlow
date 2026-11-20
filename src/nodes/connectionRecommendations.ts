import { annotationInputs, isAnnotationInput } from './interactiveEdit.ts';
import { annotationOutput } from './annotationGraph.ts';
import type { Connection, Edge, XYPosition } from '@xyflow/react';
import type { AppNode } from './types';
import { isNodeLocked, isImageGeneratorNode } from './types.ts';
import { fileOutputKind } from './fileCollection.ts';

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
  portY: number;
  detail?: string;
};

export function choiceConnection(pending: PendingConnection, choice: ConnectionChoice, newId: string): Connection {
  return pending.direction === 'source'
    ? { source: pending.nodeId, sourceHandle: pending.handleId, target: newId, targetHandle: choice.handleId }
    : { source: newId, sourceHandle: choice.handleId, target: pending.nodeId, targetHandle: pending.handleId };
}

function directConnectionChoices(pending: PendingConnection, nodes: AppNode[]): ConnectionChoice[] {
  const node = nodes.find(item => item.id === pending.nodeId);
  if (!node || isNodeLocked(node)) return [];
  const choice = (itemId: string, handleId: string | null, portY = 91, detail?: string): ConnectionChoice => ({
    id: `${itemId}:${handleId ?? 'output'}`, itemId, handleId, portY, detail,
  });
  if (pending.direction === 'source') {
    const kind = isImageGeneratorNode(node) ? 'image' : node.type === 'file' ? fileOutputKind(node.data)
      : node.type === 'text' ? 'text' : undefined;
    if (kind === 'image') return [choice('sunburst', 'image-0', 151, 'Image'), choice('nano-banana', 'image-0', 149, 'Image'), choice('seedream', 'image-0', 149, 'Image')];
    if (kind !== 'text') return [];
    return [choice('text', 'variable-1'),
      choice('sunburst', 'prompt', 91, 'Prompt'), choice('nano-banana', 'prompt', 89, 'Prompt'), choice('seedream', 'prompt', 89, 'Prompt'),
    ];
  }
  const imageInput = isImageGeneratorNode(node)
    && (pending.handleId?.startsWith('image-') || pending.handleId === 'mask');
  if (imageInput) return [choice('file', 'file'), choice('sunburst', 'result'), choice('nano-banana', 'result', 89, 'Result'), choice('seedream', 'result', 89, 'Result')];
  const textInput = node.type === 'text'
    || (isImageGeneratorNode(node) && pending.handleId === 'prompt');
  return textInput ? [choice('text', null)] : [];
}

export function connectionChoices(pending: PendingConnection, nodes: AppNode[], edges: Edge[]): ConnectionChoice[] {
  const node = nodes.find(item => item.id === pending.nodeId);
  if (!node || isNodeLocked(node)) return [];
  if (node.type === 'interactive-edit' && pending.direction === 'source') {
    const handleId = annotationInputs[0];
    return annotationOutput(node, pending.handleId, nodes, edges)
      ? [{ id: `text:${handleId}`, itemId: 'text', handleId, portY: 149, detail: '标注 1' }] : [];
  }
  if (node.type === 'text' && pending.direction === 'target' && isAnnotationInput(pending.handleId)) return [];
  return directConnectionChoices(pending, nodes);
}
