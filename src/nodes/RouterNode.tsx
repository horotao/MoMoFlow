import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, type NodeProps } from '@xyflow/react';
import { AudioLines, Box, Ellipsis, File, Image, LockKeyhole, Route, Type, Video } from 'lucide-react';
import type { AppNode, RouterNode as Router } from './types';
import { isNodeLocked } from './types';
import { outputColor, outputKind } from './router';
import { TextNodeMenu } from './TextNodeMenu';
import './RouterNode.css';

export function RouterNode({ id, data, isConnectable }: NodeProps<Router>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null), cancelled = useRef(false);
  const kind = outputKind(nodes.find(node => node.id === id), 'output', nodes, edges);
  const Icon = kind === 'text' ? Type : kind === 'image' || kind === 'mask' ? Image : kind === 'video' ? Video : kind === 'audio' ? AudioLines : kind === '3d' ? Box : kind === 'file' ? File : Route;
  const color = { '--router-port': outputColor(kind) } as CSSProperties;
  useEffect(() => { if (renaming) { input.current?.focus(); input.current?.select(); } }, [renaming]);
  return <>
    <header className="text-node-header">
      <div className="text-node-title"><Icon size={24} strokeWidth={1.2} aria-hidden="true" />
        {renaming ? <input ref={input} className="text-node-rename nodrag nopan" aria-label="节点名称" value={name} maxLength={100}
          onChange={event => setName(event.target.value)}
          onBlur={() => { if (!cancelled.current && name.trim() && !isNodeLocked(getNode(id))) updateNodeData(id, { label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); } }} /> : <span>{data.label || 'Router'}</span>}
        {data.locked && <LockKeyhole size={12} aria-label="已锁定" />}
      </div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { cancelled.current = false; setName(data.label || 'Router'); setRenaming(true); }}><Ellipsis size={24} strokeWidth={1.2} /></TextNodeMenu>
    </header>
    <Handle id="input" type="target" position={Position.Left} aria-label="Router input" style={color}
      className={`router-port${edges.some(edge => edge.target === id && edge.targetHandle === 'input') ? ' is-connected' : ''}`} isConnectable={isConnectable}>
      <span className="router-port-label">Input</span>
    </Handle>
    <Handle id="output" type="source" position={Position.Right} aria-label="Router output" style={color}
      className={`router-port${edges.some(edge => edge.source === id && edge.sourceHandle === 'output') ? ' is-connected' : ''}`} isConnectable={isConnectable}>
      <span className="router-port-label">Output</span>
    </Handle>
  </>;
}
