import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Position, useEdges, useNodes, useReactFlow, type NodeProps } from '@xyflow/react';
import { LockKeyhole } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { nodeIcons, routerIcons } from './nodeIcons';
import type { AppNode, RouterNode as Router } from './types';
import { isNodeLocked } from './types';
import { outputColor, outputKind } from './router';
import { TextNodeMenu } from './TextNodeMenu';
import { NodeFrame, NodeHeader } from './shared/NodeFrame';
import { NodePort } from './shared/NodePort';
import './RouterNode.css';

export function RouterNode({ id, data, isConnectable }: NodeProps<Router>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null), cancelled = useRef(false);
  const kind = outputKind(nodes.find(node => node.id === id), 'output', nodes, edges);
  const color = { '--node-port-color': outputColor(kind) } as CSSProperties;
  useEffect(() => { if (renaming) { input.current?.focus(); input.current?.select(); } }, [renaming]);
  return <NodeFrame className="router-node-frame" style={color}>
    <NodeHeader icon={<HugeiconsIcon icon={kind ? routerIcons[kind] : nodeIcons.router} size={16} aria-hidden="true" />}
      title={renaming ? <input ref={input} className="text-node-rename nodrag nopan" aria-label="节点名称" value={name} maxLength={100}
          onChange={event => setName(event.target.value)}
          onBlur={() => { if (!cancelled.current && name.trim() && !isNodeLocked(getNode(id))) updateNodeData(id, { label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); } }} /> : <span>{data.label || '路由'}</span>}
      status={data.locked && <LockKeyhole size={12} aria-label="已锁定" />}
      actions={<TextNodeMenu id={id} appearance="shared" locked={Boolean(data.locked)} onRename={() => { cancelled.current = false; setName(data.label || '路由'); setRenaming(true); }}><img src="/node-style/more.svg" alt="" className="node-monochrome" /></TextNodeMenu>} />
    <NodePort id="input" label="Input" type="target" position={Position.Left} top={28} isConnectable={isConnectable}>
      <span className={`router-port-ring${edges.some(edge => edge.target === id && edge.targetHandle === 'input') ? ' is-connected' : ''}`} />
    </NodePort>
    <NodePort id="output" label="Output" type="source" position={Position.Right} top={28} isConnectable={isConnectable}>
      <span className={`router-port-ring${edges.some(edge => edge.source === id && edge.sourceHandle === 'output') ? ' is-connected' : ''}`} />
    </NodePort>
  </NodeFrame>;
}
