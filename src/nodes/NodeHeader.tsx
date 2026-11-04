import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Ellipsis } from 'lucide-react';
import { NodeTitle } from './NodeFrame';
import { TextNodeMenu } from './TextNodeMenu';
import { isNodeLocked, type AppNode } from './types';

/** Shared title and rename behavior for nodes without a parameter toolbar. */
export function NodeHeader({ id, label, fallback, type, locked, icon }: {
  id: string; label?: string; fallback: string; type: string; locked?: boolean; icon?: ReactNode;
}) {
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null), cancelled = useRef(false);
  useEffect(() => { if (renaming) { input.current?.focus(); input.current?.select(); } }, [renaming]);
  return <header className="text-node-header">
    {icon}
    <NodeTitle type={type}>{renaming
      ? <input ref={input} className="text-node-rename nodrag nopan" aria-label="节点名称" value={name} maxLength={100}
        onChange={event => setName(event.target.value)}
        onBlur={() => { if (!cancelled.current && name.trim() && !isNodeLocked(getNode(id))) updateNodeData(id, { label: name.trim() }); setRenaming(false); }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); }
        }} />
      : <span>{label || fallback}</span>}
    </NodeTitle>
    <TextNodeMenu id={id} locked={Boolean(locked)} onRename={() => { cancelled.current = false; setName(label || fallback); setRenaming(true); }}><Ellipsis size={20} /></TextNodeMenu>
  </header>;
}
