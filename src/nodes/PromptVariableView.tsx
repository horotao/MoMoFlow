import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEdges, useNodes } from '@xyflow/react';
import { isTextNode, resolveTextValue, variableIndex } from './textVariables';
import type { AppNode } from './types';

export function PromptVariableView({ node, selected }: NodeViewProps) {
  const nodes = useNodes<AppNode>();
  const edges = useEdges();
  const owner = nodes.find((item) => item.id === node.attrs.ownerId);
  const mode = owner && isTextNode(owner) ? owner.data.displayMode ?? 'source-value' : 'source-value';
  const index = variableIndex(node.attrs.handleId);
  const input = edges.find((edge) => edge.target === node.attrs.ownerId && variableIndex(edge.targetHandle) === index);
  const value = input ? resolveTextValue(input.source, nodes, edges) : '';

  return (
    <NodeViewWrapper as="span" className={`text-node-variable${selected ? ' text-node-variable-selected' : ''}`}
      contentEditable={false} data-handle-id={node.attrs.handleId} style={{ whiteSpace: 'pre-wrap' }}>
      {mode !== 'value' && <span className="text-node-variable-name">Variable {index + 1}{mode === 'source-value' ? ': ' : ''}</span>}
      {mode !== 'source' && <span>{value || 'None'}</span>}
    </NodeViewWrapper>
  );
}
