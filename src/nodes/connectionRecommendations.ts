import { defaultIdeogramEditSettings, ideogramParameterData } from './ideogram.ts';
import { nanoBananaParameterData } from './nanoBanana.ts';
import { canConnect } from './connectionRules.ts';
import { outputKind, resolveOutputSource } from './router.ts';
import type { Connection, Edge, XYPosition } from '@xyflow/react';
import type { AppNode } from './types';
import { isCompositorNode, isNodeLocked, isImageGeneratorNode, isDescriberNode } from './types.ts';
import { fileOutputKind } from './fileCollection.ts';
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
  if (!target || !isImageGeneratorNode(target)) return node;
  if (target.type === 'ideogram') {
    const field = target.data.exposed?.find(item => item === pending.handleId);
    return field ? { ...node, data: ideogramParameterData(field, String(({ ...defaultIdeogramEditSettings, ...target.data })[field])) } : node;
  }
  if (target.type === 'nano-banana') {
    const field = target.data.exposed?.find(item => item === pending.handleId);
    return field ? { ...node, data: nanoBananaParameterData(field, target.data[field]) } : node;
  }
  const field = target.data.exposed?.find(item => item === pending.handleId);
  return field ? { ...node, data: sunburstParameterData(field, target.data[field]) } : node;
}

function directConnectionChoices(pending: PendingConnection, nodes: AppNode[]): ConnectionChoice[] {
  const node = nodes.find(item => item.id === pending.nodeId);
  if (!node || isNodeLocked(node)) return [];
  const choice = (itemId: string, handleId: string | null, portY = 91, detail?: string): ConnectionChoice => ({
    id: `${itemId}:${handleId ?? 'output'}`, itemId, handleId, portY, detail,
  });
  if (pending.direction === 'source') {
    const kind = node.type === 'color-palette' ? (pending.handleId === 'image' ? 'image' : pending.handleId === 'text' ? 'text' : undefined) : ['blend', 'compare', 'compositor', 'sunburst', 'nano-banana', 'ideogram', 'masks-extractor', 'painter', 'resize', 'rotate-flip', 'invert', 'levels', 'matte-grow-shrink', 'blur', 'crop', 'color-correction'].includes(node.type ?? '') ? 'image' : node.type === 'file' ? fileOutputKind(node.data)
      : ['text', 'image-describer', 'model-input', 'position-logger'].includes(node.type ?? '') ? 'text' : undefined;
    if (kind === 'image') return [choice('blend', 'back', 89, 'Back'), choice('blend', 'front', 149, 'Front'), choice('compare', 'input-1', 89, 'Input 1'), choice('compositor', 'background', 89, 'Background'), choice('compositor', 'layer-1', 149, 'Layer 1'), choice('preview', 'file', 89, 'File'), choice('image-describer', 'image-0'), choice('sunburst', 'image-0', 151, 'Image'), choice('nano-banana', 'image-0', 149, 'Image'), choice('ideogram', 'image-0', 149, 'Image'), choice('masks-extractor', 'image', 89, 'Image'), choice('painter', 'image', 89, 'Image'), choice('resize', 'image', 89, 'Input'), choice('rotate-flip', 'image', 89, 'Input'), choice('invert', 'image', 89, 'Input'), choice('levels', 'image', 89, 'Input'), choice('matte-grow-shrink', 'image', 89, 'Input'), choice('blur', 'image', 89, 'Input'), choice('crop', 'image', 89, 'Input'), choice('color-correction', 'file', 89, 'File'), ...(((node.type === 'painter' || node.type === 'masks-extractor') && pending.handleId === 'mask') || node.type === 'matte-grow-shrink' ? [choice('sunburst', 'mask', 209, 'Mask'), choice('ideogram', 'mask', 209, 'Mask')] : [])];
    if (kind !== 'text') return [];
    const choices = [choice('text', 'variable-1')];
    if (node.type !== 'position-logger') choices.push(
      choice('sunburst', 'prompt', 91, 'Prompt'), choice('nano-banana', 'prompt', 89, 'Prompt'), choice('ideogram', 'prompt', 89, 'Prompt'),
      { ...choice('image-describer', 'instructions', 141, 'System Instructions'), exposed: 'instructions' },
    );
    return choices;
  }
  const imageInput = (node.type === 'blend' && ['back', 'front'].includes(pending.handleId ?? '')) || (node.type === 'compare' && ['input-1', 'input-2'].includes(pending.handleId ?? '')) || (isCompositorNode(node) && node.data.document.inputs.some(input => input.id === pending.handleId)) || (['preview', 'color-correction'].includes(node.type ?? '') && pending.handleId === 'file') || (['masks-extractor', 'painter', 'resize', 'rotate-flip', 'invert', 'levels', 'matte-grow-shrink', 'blur', 'crop'].includes(node.type ?? '') && pending.handleId === 'image') || ['sunburst', 'nano-banana', 'ideogram', 'image-describer'].includes(node.type ?? '')
    && (pending.handleId?.startsWith('image-') || pending.handleId === 'mask');
  if (imageInput) return [choice('file', 'file'), choice('masks-extractor', 'result', 89, 'Image With Alpha'), choice('masks-extractor', 'mask', 149, 'Mask'), choice('blend', 'result', 89, 'Result'), choice('compare', 'output-1', 89, 'Output 1'), choice('color-palette', 'image', 89, 'Image'), choice('compositor', 'result', 89, 'Output'), choice('sunburst', 'result'), choice('nano-banana', 'result', 89, 'Result'), choice('ideogram', 'result', 89, 'Result'), choice('painter', pending.handleId === 'mask' ? 'mask' : 'result', pending.handleId === 'mask' ? 149 : 89), choice('resize', 'result', 89, 'Output'), choice('rotate-flip', 'result', 89, 'Result'), choice('invert', 'result', 89, 'Output'), choice('levels', 'result', 89, 'Output'), choice('matte-grow-shrink', 'result', 89, 'Output'), choice('blur', 'result', 89, 'Output'), choice('crop', 'result', 89, 'Output'), choice('color-correction', 'result', 89, 'Result'), ...(['preview', 'invert', 'matte-grow-shrink'].includes(node.type ?? '') ? [choice('painter', 'mask', 149, 'Mask')] : [])];
  const textInput = node.type === 'text' || node.type === 'position-logger'
    || (isImageGeneratorNode(node) && (pending.handleId === 'prompt' || (node.data.exposed ?? []).some(field => field === pending.handleId)))
    || (isDescriberNode(node) && (node.data.exposed ?? []).some(field => field === pending.handleId));
  return textInput ? [choice('text', null), choice('model-input', null, 32), choice('image-describer', null), choice('color-palette', 'text', 149, 'Text')] : [];
}

export function connectionChoices(pending: PendingConnection, nodes: AppNode[], edges: Edge[]): ConnectionChoice[] {
  const node = nodes.find(item => item.id === pending.nodeId);
  if (!node || isNodeLocked(node)) return [];
  const router: ConnectionChoice = { id: `router:${pending.direction === 'source' ? 'input' : 'output'}`, itemId: 'router', handleId: pending.direction === 'source' ? 'input' : 'output', portY: 31 };
  if (node.type !== 'router') {
    const choices = directConnectionChoices(pending, nodes);
    return pending.direction === 'source' ? (outputKind(node, pending.handleId) ? [...choices, router] : choices) : choices.length ? [...choices, router] : [];
  }
  if (pending.handleId !== (pending.direction === 'source' ? 'output' : 'input')) return [];
  const origin = pending.direction === 'source' ? resolveOutputSource(node, 'output', nodes, edges) : undefined;
  if (origin) {
    const virtualNodes = nodes.map(item => item.id === node.id ? { ...origin.node, id: node.id, data: { ...origin.node.data, locked: false } } as AppNode : item);
    return [...directConnectionChoices({ ...pending, handleId: origin.handle ?? null }, virtualNodes), router];
  }
  const placeholders: AppNode[] = [
    { id: node.id, type: 'text', position: node.position, data: { text: '' } },
    { id: node.id, type: 'preview', position: node.position, data: {} },
  ];
  const choices = placeholders.flatMap(placeholder => directConnectionChoices(
    { ...pending, handleId: pending.direction === 'target' ? placeholder.type === 'text' ? 'variable-1' : 'file' : placeholder.type === 'text' ? null : 'image' },
    nodes.map(item => item.id === node.id ? pending.direction === 'source' && placeholder.type === 'preview' ? { ...placeholder, type: 'color-palette', data: { colors: [] } } as AppNode : placeholder : item),
  ));
  const unique = [...new Map([...choices, router].map(choice => [choice.id, choice])).values()];
  if (pending.direction === 'source') return unique;
  return unique.filter(choice => {
    // Only type/port metadata is read during connection validation.
    const candidate = { id: '__router-choice__', type: choice.itemId, position: node.position, data: {} } as AppNode;
    return canConnect(choiceConnection(pending, choice, candidate.id), [...nodes, candidate], edges, candidate.type === 'file' ? candidate.id : undefined);
  });
}
