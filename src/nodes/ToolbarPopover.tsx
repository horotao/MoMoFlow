import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from '@xyflow/react';

export function ToolbarPopover({ label, trigger, children, disabled, className = '', onOpen }: {
  label: string; trigger: ReactNode; children: ReactNode; disabled?: boolean; className?: string; onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const viewport = useViewport();
  const id = useId();
  const close = () => { setOpen(false); button.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!button.current || !panel.current) return;
      const anchor = button.current.getBoundingClientRect(), box = panel.current.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8)), top: Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - box.height - 8)) });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [open, viewport.x, viewport.y, viewport.zoom]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!panel.current?.contains(target) && !button.current?.contains(target) && !target.closest('.painter-color-popover,.describer-model-menu')) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <>
    <button ref={button} type="button" className={className} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open && !disabled} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => { if (!open) onOpen?.(); setOpen(value => !value); }}>{trigger}</button>
    {open && !disabled && createPortal(<div ref={panel} id={id} tabIndex={-1} role="dialog" aria-label={label} className="node-toolbar-popover nodrag nopan nowheel" style={position}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); close(); } }}>
      {children}
    </div>, document.body)}
  </>;
}
