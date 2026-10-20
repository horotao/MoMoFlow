import type { Connection, Edge, XYPosition } from '@xyflow/react';
import type { AppNode } from './types';
import { isNodeLocked, isSunburstNode, isDescriberNode } from './types.ts';
import { fileOutputKind } from './fileCollection.ts';
import { variableIndex } from './textVariables.ts';
import { sunburstParameterData } from './sunburst.ts';

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
  exposed?: 'instructions';
};

export function choiceConnection(pending: PendingConnection, choice: ConnectionChoice, newId: string): Connection {
  return pending.direction === 'source'
    ? { source: pending.nodeId, sourceHandle: pending.handleId, target: newId, targetHandle: choice.handleId }
    : { source: newId, sourceHandle: choice.handleId, target: pending.nodeId, targetHandle: pending.handleId };
}

export function initializeConnectionParameter(node: AppNode, pending: PendingConnection, nodes: AppNode[]): AppNode {
  if (node.type !== 'model-input' || pending.direction !== 'target') return node;
  const target = nodes.find(item => item.id === pending.nodeId);
  if (!target || !isSunburstNode(target)) return node;
  const field = target.data.exposed?.find(item => item === pending.handleId);
  return field ? { ...node, data: sunburstParameterData(field, target.data[field]) } : node;
}

export function connectionChoices(pending: PendingConnection, nodes: AppNode[], edges: Edge[]): ConnectionChoice[] {
  const node = nodes.find(item => item.id === pending.nodeId);
  if (!node || isNodeLocked(node)) return [];
  const choice = (itemId: string, handleId: string | null, portY = 91, detail?: string): ConnectionChoice => ({
    id: `${itemId}:${handleId ?? 'output'}`, itemId, handleId, portY, detail,
  });
  if (pending.direction === 'source') {
    const kind = ['sunburst', 'painter'].includes(node.type ?? '') ? 'image' : node.type === 'file' ? fileOutputKind(node.data)
      : ['text', 'image-describer', 'model-input', 'position-logger'].includes(node.type ?? '') ? 'text' : undefined;
    if (kind === 'image') return [choice('preview', 'file', 89, 'File'), choice('image-describer', 'image-0'), choice('sunburst', 'image-0', 151, 'Image'), choice('painter', 'image', 89, 'Image'), ...(node.type === 'painter' && pending.handleId === 'mask' ? [choice('sunburst', 'mask', 209, 'Mask')] : [])];
    if (kind !== 'text') return [];
    const choices = [choice('text', 'variable-1')];
    if (node.type !== 'position-logger') choices.push(
      choice('sunburst', 'prompt', 91, 'Prompt'),
      { ...choice('image-describer', 'instructions', 141, 'System Instructions'), exposed: 'instructions' },
    );
    return choices;
  }
  if (edges.some(edge => edge.target === node.id && (node.type === 'text'
    ? variableIndex(edge.targetHandle) === variableIndex(pending.handleId)
    : edge.targetHandle === pending.handleId))) return [];
  const imageInput = (node.type === 'preview' && pending.handleId === 'file') || (node.type === 'painter' && pending.handleId === 'image') || ['sunburst', 'image-describer'].includes(node.type ?? '')
    && (pending.handleId?.startsWith('image-') || pending.handleId === 'mask');
  if (imageInput) return [choice('file', 'file'), choice('sunburst', 'result'), choice('painter', pending.handleId === 'mask' ? 'mask' : 'result', pending.handleId === 'mask' ? 149 : 89), ...(node.type === 'preview' ? [choice('painter', 'mask', 149, 'Mask')] : [])];
  const textInput = node.type === 'text' || node.type === 'position-logger'
    || (isSunburstNode(node) && (pending.handleId === 'prompt' || (node.data.exposed ?? []).some(field => field === pending.handleId)))
    || (isDescriberNode(node) && (node.data.exposed ?? []).some(field => field === pending.handleId));
  return textInput ? [choice('text', null), choice('model-input', null, 32), choice('image-describer', null)] : [];
}
