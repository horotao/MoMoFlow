import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NodeMenu, type NodeMenuOption } from './NodeMenu';

export function NodeOptionsMenu({ options, onChoose, children, error }: {
  options: NodeMenuOption[];
  onChoose: (action: string) => Promise<boolean>;
  children: ReactNode;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ above: false, left: false });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const choose = (action: string) => {
    void onChoose(action).then(success => {
      if (!success) return;
      setOpen(false);
      if (action !== 'rename') trigger.current?.focus();
    });
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = trigger.current?.getBoundingClientRect();
      const menu = root.current?.querySelector('[role="menu"]')?.getBoundingClientRect();
      if (!button || !menu) return;
      const gap = button.width / 6;
      setPlacement({ above: button.bottom + gap + menu.height > window.innerHeight - 8 && button.top >= menu.height + gap,
        left: button.left + menu.width > window.innerWidth - 8 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);
  return <div ref={root} className="node-options nodrag nopan nowheel"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        const option = options.find(option => option.shortcutKey === event.key.toLowerCase() && !option.disabled);
        if (option) { event.preventDefault(); choose(option.action); }
      }
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    }}>
    <button ref={trigger} type="button" className="node-options-trigger" aria-label="更多选项"
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}>{children}</button>
    {open && <NodeMenu id={menuId} label="节点选项" options={options}
      className={`node-options-menu${placement.above ? ' is-above' : ''}${placement.left ? ' is-left' : ''}`}
      onChoose={choose} />}
    {error && <div role="alert" className="node-options-error">{error}</div>}
  </div>;
}
