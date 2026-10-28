import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

type Item = { label: string; checked?: boolean; disabled?: boolean; action: () => void };
export function FileActionMenu({ label, children, heading, items, disabled, contextTarget, onContextOpen }: { label: string; children?: ReactNode; heading?: string; items: Item[]; disabled?: boolean; contextTarget?: RefObject<HTMLElement>; onContextOpen?: (target: EventTarget | null) => void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number }>();
  const contextOpen = useRef(onContextOpen);
  contextOpen.current = onContextOpen;
  useEffect(() => {
    const element = contextTarget?.current;
    if (!element || disabled) return;
    const open = (event: MouseEvent) => {
      event.preventDefault(); event.stopPropagation();
      contextOpen.current?.(event.target);
      setAnchor({ left: Math.max(8, Math.min(event.clientX, window.innerWidth - 158)), top: Math.max(8, Math.min(event.clientY, window.innerHeight - items.length * 28 - 16)) });
    };
    element.addEventListener('contextmenu', open);
    return () => element.removeEventListener('contextmenu', open);
  }, [contextTarget, disabled, items.length]);
  useEffect(() => {
    if (!anchor) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setAnchor(undefined);
    };
    const close = () => setAnchor(undefined);
    document.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('resize', close); };
  }, [anchor]);
  return <>
    {!contextTarget && <button ref={trigger} type="button" disabled={disabled} className="file-icon-button" title={label} aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={() => {
      const rect = trigger.current!.getBoundingClientRect();
      setAnchor(anchor ? undefined : { left: Math.max(8, Math.min(rect.right - 150, window.innerWidth - 158)), top: Math.min(rect.bottom + 4, window.innerHeight - items.length * 28 - (heading ? 36 : 8) - 8) });
    }}>{children}</button>}
    {anchor && createPortal(<div ref={menu} role="menu" aria-label={heading || label} className="file-popup nodrag nopan nowheel" style={anchor}
      onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); setAnchor(undefined); (trigger.current ?? contextTarget?.current)?.focus({ preventScroll: true }); }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) {
          event.preventDefault();
          const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' || event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }}>
      {heading && <div className="file-popup-heading">{heading}</div>}
      {items.map((item) => <button key={item.label} type="button" role="menuitem" disabled={item.disabled} onClick={() => { setAnchor(undefined); (trigger.current ?? contextTarget?.current)?.focus({ preventScroll: true }); item.action(); }}>
        {item.label}<span>{item.checked && <Check size={16} />}</span>
      </button>)}
    </div>, document.body)}
  </>;
}
