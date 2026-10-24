import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function EditorPopover({ anchor, point, side = 'bottom', label, children, onClose, width = 208, menu = true }: {
  anchor: HTMLElement; point?: { x: number; y: number }; side?: 'bottom' | 'top' | 'right'; label: string;
  children: ReactNode; onClose: () => void; width?: number; menu?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  useLayoutEffect(() => {
    const popup = ref.current;
    if (!popup) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect(), height = popup.getBoundingClientRect().height;
      const x = point?.x ?? (side === 'right' ? (anchor.closest('.comp-sidebar')?.getBoundingClientRect().right ?? rect.right) + 8 : side === 'top' ? rect.right - width : rect.left);
      const y = point?.y ?? (side === 'top' ? rect.top - height - 8 : side === 'right' ? rect.top : rect.bottom + 6);
      setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - height - 8)), ready: true });
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(popup);
    const dismiss = (event: PointerEvent) => { if (!popup.contains(event.target as Node) && !anchor.contains(event.target as Node)) close.current(); };
    const resize = () => close.current();
    document.addEventListener('pointerdown', dismiss, true); window.addEventListener('resize', resize);
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('resize', resize); };
  }, [anchor, point?.x, point?.y, side, width]);
  useLayoutEffect(() => { if (position.ready) ref.current?.focus(); }, [position.ready]);
  const host = anchor.closest('[data-compositor-editor]');
  if (!host) return null;
  const dismiss = () => { onClose(); anchor.focus(); };
  return createPortal(<div ref={ref} className={`comp-editor-popover${menu ? ' comp-editor-menu' : ''}`} role={menu ? 'menu' : 'dialog'} aria-label={label} tabIndex={-1}
    style={{ left: position.left, top: position.top, width, visibility: position.ready ? 'visible' : 'hidden' }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
      if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) { onClose(); return; }
      if (!menu) return;
      if (event.key === 'Tab') { dismiss(); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>{children}</div>, host);
}
