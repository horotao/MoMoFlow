import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NodeToolbar, useReactFlow, useStore, useViewport } from '@xyflow/react';
import { Ellipsis } from 'lucide-react';
import { NodeFrame, NodeTitle } from './NodeFrame';
import { TextNodeMenu } from './TextNodeMenu';
import { CanvasHistoryContext } from '../components/useCanvasHistory';
import { isNodeLocked, type AppNode } from './types';
import './ToolNodeFrame.css';

export function ToolbarIcon({ name }: { name: 'close' | 'brush' | 'rectangle' | 'eraser' | 'text' | 'undo' | 'redo' | 'aspect' | 'lock' | 'chevron' | 'menu-chevron' }) {
  return <span className={`node-toolbar-icon node-toolbar-icon--${name}`} aria-hidden="true"><img src={`/node-toolbar/${name}.svg`} alt="" draggable={false} /></span>;
}

function ToolbarSurface({ id, children, label, onClose }: { id: string; children: ReactNode; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewport = useViewport();
  const history = useContext(CanvasHistoryContext);
  const x = useStore(state => state.nodeLookup.get(id)?.internals.positionAbsolute.x);
  const y = useStore(state => state.nodeLookup.get(id)?.internals.positionAbsolute.y);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const parent = ref.current?.parentElement;
      if (!parent) return;
      const box = parent.getBoundingClientRect();
      setShift({ x: Math.max(8 - box.left, Math.min(0, window.innerWidth - 8 - box.right)), y: Math.max(0, 8 - box.top) });
    };
    place();
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [viewport.x, viewport.y, viewport.zoom, x, y]);
  return <div ref={ref} className="node-parameter-toolbar nodrag nopan nowheel" role="toolbar" aria-label={`${label}参数`} style={{ left: shift.x, top: shift.y }}
    onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    onKeyDown={event => {
      // Portaled controls must never delete or move the canvas selection.
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLInputElement && event.target.type !== 'range')) {
        event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo();
      }
    }}>
    <button type="button" className="node-toolbar-close" aria-label="关闭参数工具栏" title="关闭参数工具栏" onClick={onClose}><ToolbarIcon name="close" /></button>
    <span className="node-toolbar-separator" />
    <div className="node-toolbar-content">{children}</div>
  </div>;
}

export function ToolNodeFrame({ id, label, defaultLabel, type, locked, toolbar, onToolbarClose, children }: {
  id: string; label?: string; defaultLabel: string; type: string; locked?: boolean;
  toolbar: ReactNode; onToolbarClose?: () => void; children: ReactNode;
}) {
  const { getNode, setNodes, updateNodeData } = useReactFlow<AppNode>();
  const single = useStore(state => Boolean(state.nodeLookup.get(id)?.selected) && state.nodes.filter(node => node.selected).length === 1);
  const zoom = useStore(state => state.transform[2]);
  const [dismissed, setDismissed] = useState(false);
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const visible = single && !dismissed && !renaming;
  const closeRef = useRef(onToolbarClose);
  closeRef.current = onToolbarClose;
  useEffect(() => { if (!single) setDismissed(false); }, [single]);
  useEffect(() => { if (!visible) closeRef.current?.(); }, [visible]);
  const rename = () => { setName(label || defaultLabel); setRenaming(true); };
  return <NodeFrame className="tool-node-frame" data-toolbar-open={visible} onPointerDownCapture={event => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || !event.currentTarget.contains(event.target as Node)) return;
    const target = event.target as HTMLElement;
    if (target.closest('button,input,textarea,.react-flow__handle')) return;
    setDismissed(false);
    // Image editing surfaces stop propagation; selecting them still opens the toolbar.
    if (!single) setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === id })));
  }} onClickCapture={event => {
    if (single && !renaming && event.currentTarget.contains(event.target as Node) && !(event.target as HTMLElement).closest('button,input,.react-flow__handle')) setDismissed(false);
  }}>
    <header className="text-node-header" aria-hidden={visible} style={{ visibility: visible ? 'hidden' : undefined }}>
      <NodeTitle type={type}>{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim() && !isNodeLocked(getNode(id))) updateNodeData(id, { label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span onDoubleClick={() => { if (!locked) rename(); }}>{label || defaultLabel}</span>}</NodeTitle>
    </header>
    <div className="tool-node-menu"><TextNodeMenu id={id} locked={Boolean(locked)} onRename={rename}><Ellipsis size={18} /></TextNodeMenu></div>
    <NodeToolbar nodeId={id} isVisible={visible} offset={8 - 28 * zoom}>
      <ToolbarSurface id={id} label={defaultLabel} onClose={() => setDismissed(true)}>{toolbar}</ToolbarSurface>
    </NodeToolbar>
    {children}
  </NodeFrame>;
}
