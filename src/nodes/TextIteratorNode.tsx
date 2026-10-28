import { useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, DragDropVerticalIcon, MoreHorizontalIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { isNodeLocked, isTextIteratorNode, type AppNode, type TextIteratorNode as IteratorNode } from './types';
import { newTextIteratorItem, textIteratorLimit, textIteratorTextLimit, type TextIteratorItem } from './textIterator';
import { IteratorWarning } from '../components/IteratorWarning';
import { iteratorItems } from './textVariables';
import { NodeIcon } from './NodeIcon';
import { TextNodeMenu } from './TextNodeMenu';
import './TextIteratorNode.css';

export function TextIteratorNode({ id, data, isConnectable }: NodeProps<IteratorNode>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const internals = useUpdateNodeInternals();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const fields = useRef(new Map<string, HTMLTextAreaElement>());
  const focus = useRef<string>();
  const dragged = useRef<string>();
  const [dropId, setDropId] = useState<string>();
  const connected = edges.some(edge => edge.target === id && edge.targetHandle === 'input');
  let items = data.items, error = '';
  const current = nodes.find(node => node.id === id);
  if (isTextIteratorNode(current)) {
    try { items = iteratorItems(current, nodes, edges); } catch (reason) { items = []; error = reason instanceof Error ? reason.message : '无法读取输入。'; }
  }
  const readOnly = Boolean(data.locked || connected);
  const patch = (items: TextIteratorItem[]) => {
    const node = getNode(id);
    if (isTextIteratorNode(node) && !node.data.locked && !connected) updateNodeData(id, { items });
  };
  const move = (itemId: string, to: number) => {
    const from = items.findIndex(item => item.id === itemId);
    if (from < 0 || from === to || to < 0 || to >= items.length) return;
    const next = [...items]; next.splice(to, 0, ...next.splice(from, 1)); patch(next);
  };
  const itemSignature = JSON.stringify(items);
  useLayoutEffect(() => {
    for (const field of fields.current.values()) { field.style.height = '0px'; field.style.height = `${Math.max(32, field.scrollHeight + 2)}px`; }
    if (focus.current) { fields.current.get(focus.current)?.focus(); focus.current = undefined; }
    internals(id);
  }, [id, itemSignature, error, internals]);
  return <>
    <header className="text-node-header">
      <div className="text-node-title"><NodeIcon nodeType="text-iterator" size={20} />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim() && !isNodeLocked(getNode(id))) updateNodeData(id, { label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || '文本迭代'}</span>}</div>
      <div className="iterator-heading-actions"><span className="iterator-count" aria-label={`${items.length} / ${textIteratorLimit} 条文本`}>{items.length}/{textIteratorLimit}</span>
        <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || '文本迭代'); setRenaming(true); }}><HugeiconsIcon icon={MoreHorizontalIcon} size={20} /></TextNodeMenu>
      </div>
    </header>
    <div className="iterator-items nodrag nopan nowheel" aria-label="迭代文本列表">
      {items.map((item, index) => <div key={item.id} className={`iterator-item${dropId === item.id ? ' is-drop-target' : ''}`}
        onDragOver={event => { if (!readOnly && dragged.current) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropId(item.id); } }}
        onDrop={event => { if (!readOnly && dragged.current) { event.preventDefault(); event.stopPropagation(); move(dragged.current, index); } dragged.current = undefined; setDropId(undefined); }}>
        {!readOnly && <button className="iterator-grip" type="button" draggable aria-label={`移动第 ${index + 1} 条文本`} title="拖动排序，或使用上下方向键"
          onDragStart={event => { event.stopPropagation(); dragged.current = item.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-momoflow-text-iterator', item.id); }}
          onDragEnd={() => { dragged.current = undefined; setDropId(undefined); }}
          onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); move(item.id, event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1)); } }}><HugeiconsIcon icon={DragDropVerticalIcon} size={14} /></button>}
        <textarea ref={element => { if (element) fields.current.set(item.id, element); else fields.current.delete(item.id); }} rows={1} value={item.text}
          readOnly={readOnly} maxLength={textIteratorTextLimit} aria-label={`第 ${index + 1} 条文本`} placeholder={`条目 ${index + 1}`}
          onChange={event => patch(items.map(value => value.id === item.id ? { ...value, text: event.target.value } : value))}
          onKeyDown={event => event.stopPropagation()} />
        {!readOnly && <button className="iterator-remove" type="button" aria-label={`删除第 ${index + 1} 条文本`} onClick={() => patch(items.filter(value => value.id !== item.id))}><HugeiconsIcon icon={Cancel01Icon} size={14} /></button>}
      </div>)}
      {!connected && <button className="text-node-button iterator-add" type="button" disabled={data.locked || items.length >= textIteratorLimit} onClick={() => { const item = newTextIteratorItem(); focus.current = item.id; patch([...items, item]); }}><HugeiconsIcon icon={PlusSignIcon} size={18} />添加条目</button>}
    </div>
    {connected && !error && <div className="iterator-input-note">由上游输入提供文本</div>}
    {error && <IteratorWarning message={error} />}
    <span className="describer-port-label iterator-input-label">文本 / 数组</span>
    <Handle type="target" position={Position.Left} id="input" aria-label="文本或数组输入" className={`describer-port iterator-input-port${connected ? ' is-connected' : ''}`} style={{ top: 30 }} isConnectable={isConnectable && !data.locked} />
    <span className="describer-port-label output-label iterator-output-label">文本</span>
    <Handle type="source" position={Position.Right} id="text" aria-label="迭代文本输出" className={`describer-port${edges.some(edge => edge.source === id) ? ' is-connected' : ''}`} style={{ top: 30 }} isConnectable={isConnectable && !data.locked} />
  </>;
}
