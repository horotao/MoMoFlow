import { useRef, useState, type ReactNode } from 'react';
import { useReactFlow } from '@xyflow/react';
import { LockKeyhole } from 'lucide-react';
import { NodeIcon } from '../NodeIcon';
import { TextNodeMenu } from '../TextNodeMenu';
import { isNodeLocked, type AppNode } from '../types';
import { NodeFrame, NodeHeader } from './NodeFrame';
import './helperNodeStyle.css';

/** Compact utility nodes share the same header, rename behavior and frame. */
export function HelperNodeFrame({ id, nodeType, label, locked, children }: {
  id: string;
  nodeType: 'model-input' | 'position-logger';
  label: string;
  locked?: boolean;
  children: ReactNode;
}) {
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelled = useRef(false);
  return <NodeFrame className={`helper-node-frame ${nodeType}-frame`}>
    <NodeHeader icon={<NodeIcon nodeType={nodeType} size={16} />} title={renaming
      ? <input autoFocus className="text-node-rename nodrag nopan" aria-label="节点名称" maxLength={100}
        value={draft} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          if (!cancelled.current && draft.trim() && !isNodeLocked(getNode(id))) updateNodeData(id, { label: draft.trim() });
          setRenaming(false);
        }} onKeyDown={event => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); }
        }} /> : <span>{label}</span>}
      status={locked && <LockKeyhole size={12} aria-label="已锁定" />}
      actions={<TextNodeMenu id={id} appearance="shared" locked={Boolean(locked)} onRename={() => {
        cancelled.current = false; setDraft(label); setRenaming(true);
      }}><img src="/node-style/more.svg" width={18} height={18} alt="" className="node-monochrome" /></TextNodeMenu>} />
    {children}
  </NodeFrame>;
}
