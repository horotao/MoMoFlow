import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';

export function NumberField({ label, prefix, suffix, value, min = -1e6, max = 1e6, step = 1, onChange }: {
  label: string; prefix?: ReactNode; suffix?: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void;
}) {
  const formatted = String(Number(value.toFixed(2))), [text, setText] = useState(formatted), cancelled = useRef(false);
  useEffect(() => setText(formatted), [formatted]);
  return <label className="comp-number" title={label}>
    {prefix && <span className="comp-number-prefix" aria-hidden="true">{prefix}</span>}
    <input aria-label={label} type="number" min={min} max={max} step={step} value={text}
      onChange={event => setText(event.target.value)} onBlur={() => {
        if (!cancelled.current && text.trim() && Number.isFinite(Number(text)) && Number(text) !== value) onChange(Math.min(max, Math.max(min, Number(text))));
        cancelled.current = false; setText(formatted);
      }} onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase()) && text !== formatted) event.stopPropagation();
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') { event.stopPropagation(); cancelled.current = true; event.currentTarget.blur(); }
      }} />
    {suffix && <span className="comp-number-suffix" aria-hidden="true">{suffix}</span>}
  </label>;
}

export function Section({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <section className={`comp-section${children ? '' : ' is-empty'}`}><div className="comp-section-heading"><span>{title}</span>{action}</div>{children}</section>;
}

// Keep floating controls inside the editor's focus/shortcut boundary, while
// escaping the scrolling inspector. Position from the actual trigger in pixels.
export function InspectorPopup({ anchor, title, icon, children, onClose, menu = false, width = 260 }: {
  anchor: HTMLElement; title?: string; icon?: ReactNode; children: ReactNode; onClose: () => void; menu?: boolean; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  useLayoutEffect(() => {
    const popup = ref.current;
    if (!popup) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect(), height = popup.getBoundingClientRect().height;
      const inspector = anchor.closest('.comp-properties')?.getBoundingClientRect();
      setPosition({ left: Math.max(8, (inspector?.left ?? rect.left) - width - 8), top: Math.max(8, Math.min(rect.top + rect.height / 2 - height / 2, window.innerHeight - height - 8)), ready: true });
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(popup);
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!popup.contains(target) && !anchor.contains(target) && !target.closest('.comp-select-menu')) close.current();
    };
    const resize = () => close.current();
    document.addEventListener('pointerdown', dismiss, true); window.addEventListener('resize', resize);
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('resize', resize); };
  }, [anchor, width]);
  useLayoutEffect(() => { if (position.ready) ref.current?.focus(); }, [position.ready]);
  const host = anchor.closest('[data-compositor-editor]');
  if (!host) return null;
  return createPortal(<div ref={ref} role={menu ? 'menu' : 'dialog'} aria-label={title ?? 'Add effect'} tabIndex={-1}
    className={`comp-inspector-popup${menu ? ' is-menu' : ''}`} style={{ left: position.left, top: position.top, width, visibility: position.ready ? 'visible' : 'hidden' }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); anchor.focus(); }
      if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }}>
    {!menu && <header>{icon}<span>{title}</span><button aria-label="Close effect properties" title="Close" onClick={() => { onClose(); anchor.focus(); }}><X /></button></header>}
    {children}
  </div>, host);
}

export function InspectorSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [position, setPosition] = useState({ left: 0, top: 0, width: 144, maxHeight: 360 });
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const show = () => {
    const rect = trigger.current!.getBoundingClientRect(), width = Math.max(144, rect.width), maxHeight = Math.min(360, window.innerHeight - 24);
    const height = Math.min(maxHeight, options.length * 24 + 12);
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8)), width, maxHeight });
    setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true);
  };
  useLayoutEffect(() => { if (open) { list.current?.focus(); list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!list.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss, true); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('resize', resize); };
  }, [open]);
  const host = trigger.current?.closest('[data-compositor-editor]');
  return <>
    <button ref={trigger} className="comp-select-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="listbox"
      onClick={() => open ? close() : show()} onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); show(); } }}>
      <span>{options.find(option => option.value === value)?.label ?? value}</span><ChevronDown />
    </button>
    {open && host && createPortal(<div ref={list} id={id} className="comp-select-menu" role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={`${id}-${active}`} style={position}
      onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) { setOpen(false); return; }
        event.stopPropagation();
        if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); close(); return; }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onChange(options[active].value); close(); return; }
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowDown' ? Math.min(options.length - 1, active + 1) : event.key === 'ArrowUp' ? Math.max(0, active - 1) : active;
        if (next !== active) { event.preventDefault(); setActive(next); list.current?.children[next]?.scrollIntoView({ block: 'nearest' }); }
      }}>
      {options.map((option, index) => <div id={`${id}-${index}`} role="option" aria-selected={option.value === value} key={option.value} className={index === active ? 'is-active' : ''}
        onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(option.value); close(); }}><span>{value === option.value && <Check />}</span>{option.label}</div>)}
    </div>, host)}
  </>;
}

export function SliderField({ label, value, min, max, step, onDraft, onCommit, onCancel }: {
  label: string; value: number; min: number; max: number; step: number; onDraft: (value: number) => void; onCommit: (value: number) => void; onCancel: () => void;
}) {
  const dragging = useRef(false), latest = useRef(value); latest.current = value;
  return <div className="comp-slider-row"><span>{label}</span><input type="range" aria-label={`${label} slider`} min={min} max={max} step={step} value={value}
    onPointerDown={event => { if (event.button === 0) { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); } }}
    onChange={event => { latest.current = Number(event.target.value); if (dragging.current) onDraft(latest.current); else onCommit(latest.current); }}
    onPointerUp={() => { if (dragging.current) { dragging.current = false; onCommit(latest.current); } }}
    onPointerCancel={() => { dragging.current = false; onCancel(); }} onLostPointerCapture={() => { if (dragging.current) { dragging.current = false; onCancel(); } }}
    onKeyDown={event => { if (event.key === 'Escape' && dragging.current) { event.preventDefault(); event.stopPropagation(); dragging.current = false; onCancel(); } }} />
    <NumberField label={label} value={value} min={min} max={max} step={step} onChange={onCommit} />
  </div>;
}

