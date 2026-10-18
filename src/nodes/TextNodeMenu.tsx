import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { isFileNode } from './fileAsset';
import { cloneTextNode } from './cloneTextNode';
import { isTextNode } from './textVariables';
import type { AppNode } from './types';

export function TextNodeMenu({ id, locked, onRename, children }: {
  id: string; locked: boolean; onRename: () => void; children: ReactNode;
}) {
  const { getNode, getNodes, setNodes, updateNodeData, deleteElements } = useReactFlow<AppNode>();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ above: false, left: false });
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const { zoom } = useViewport();
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

  const act = async (action: string) => {
    const node = getNode(id);
    if (!node || (!isTextNode(node) && !isFileNode(node) && node.type !== 'image-describer' && node.type !== 'model-input')) return;
    setError('');
    try {
      if (action === 'duplicate') {
        const copy: AppNode = isTextNode(node) ? cloneTextNode(node) : {
          ...node, id: `${node.type}-${crypto.randomUUID()}`, selected: true,
          position: { x: node.position.x + 40, y: node.position.y + 40 },
          data: { ...node.data, locked: false, ...(node.type === 'image-describer' ? { exposed: [] } : {}) },
        } as AppNode;
        setNodes((nodes) => [...nodes.map((item) => ({ ...item, selected: false })), copy]);
      } else if (action === 'cut' && !locked) {
        await navigator.clipboard.writeText(JSON.stringify({ format: `momoflow-${node.type}-node`, node }));
        await deleteElements({ nodes: [{ id }] });
      } else if (action === 'delete' && !locked) {
        await deleteElements({ nodes: [{ id }] });
      } else if (action === 'rename') onRename();
      else if (action === 'lock') updateNodeData(id, { locked: !locked });
      setOpen(false);
      if (action !== 'rename') trigger.current?.focus();
    } catch {
      setError('无法写入剪贴板，节点已保留。请允许剪贴板访问后重试。');
    }
  };
  const actionRef = useRef(act);
  actionRef.current = act;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !(event.metaKey || event.ctrlKey)
        || event.shiftKey || event.altKey || (event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      const selected = getNodes().filter((node) => node.selected);
      if (selected.length !== 1 || selected[0].id !== id) return;
      const key = event.key.toLowerCase();
      if (key === 'd' || (key === 'x' && !locked)) {
        event.preventDefault();
        void actionRef.current(key === 'd' ? 'duplicate' : 'cut');
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [id, locked, getNodes]);
  useEffect(() => {
    if (!open) return;
    items.current.find((item) => item && !item.disabled)?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  const options = [
    { action: 'save', label: '保存节点', disabled: true },
    { action: 'duplicate', label: '创建副本', shortcut: `${modifier}d` },
    { action: 'cut', label: '剪切', shortcut: `${modifier}x`, disabled: locked },
    { action: 'rename', label: '重命名', disabled: locked },
    { action: 'lock', label: locked ? '解锁' : '锁定' },
    { action: 'delete', label: '删除', disabled: locked },
  ];
  const show = () => {
    const rect = trigger.current!.getBoundingClientRect();
    setPlacement({ above: rect.bottom + 180 * zoom > window.innerHeight, left: rect.left + 150 * zoom > window.innerWidth });
    setOpen(true);
  };
  return <div ref={root} className="text-node-menu-root nodrag nopan nowheel"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    }}>
    <button ref={trigger} type="button" className="text-node-button text-node-menu-trigger" aria-label="更多选项"
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => open ? setOpen(false) : show()}
      onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}>
      {children}
    </button>
    {open && <div id={menuId} role="menu" aria-label="节点选项"
      className={`text-node-menu${placement.above ? ' is-above' : ''}${placement.left ? ' is-left' : ''}`}>
      {options.map((option, index) => <button key={option.action} type="button" role="menuitem" tabIndex={-1}
        ref={(element) => { items.current[index] = element; }} disabled={option.disabled}
        className={`text-node-menu-item${option.action === 'delete' ? ' text-node-menu-delete' : ''}`}
        onClick={() => void act(option.action)}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const enabled = options.map((item, i) => item.disabled ? -1 : i).filter((i) => i >= 0);
          const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled[enabled.length - 1]
            : enabled[(enabled.indexOf(index) + (event.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length];
          items.current[next]?.focus();
        }}>
        <span>{option.label}</span>{option.shortcut && <span className="text-node-menu-shortcut">{option.shortcut}</span>}
      </button>)}
    </div>}
    {error && <div role="alert" className="text-node-menu-error">{error}</div>}
  </div>;
}
