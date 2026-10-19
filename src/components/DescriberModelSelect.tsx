import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { describerModels } from '../nodes/describer';
import { DescriberIcon } from './DescriberIcon';

export function DescriberModelSelect({ value, disabled, onChange, choices = describerModels, node = false, compact = false, label = 'Model', labels }: {
  value: string; choices?: string[]; node?: boolean; compact?: boolean; label?: string; labels?: string[]; disabled?: boolean; onChange: (model: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; height: number; width: number } | null>(null);
  const [active, setActive] = useState(0);
  const options = useMemo(() => choices.includes(value) ? choices : [value, ...choices], [value, choices]);
  const close = () => { setPlacement(null); trigger.current?.focus(); };
  const open = () => {
    if (disabled) return;
    const rect = trigger.current!.getBoundingClientRect();
    const index = Math.max(0, options.indexOf(value));
    const height = Math.min(node || compact ? options.length * 24 + 16 : 410, window.innerHeight - 24, rect.top - 12 + (options.length - index) * 24 + 8);
    const top = Math.max(12, Math.min(rect.top - index * 24 - 8, window.innerHeight - height - 12));
    setActive(index);
    if (compact) {
      setPlacement({ width: rect.width + 16, left: Math.max(8, Math.min(rect.left - 8, window.innerWidth - rect.width - 24)), top, height });
      return;
    }
    setPlacement({ width: node ? Math.max(220, rect.width + 16) : 220, left: Math.max(12, Math.min(rect.left - (node ? 8 : 37), window.innerWidth - (node ? Math.max(220, rect.width + 16) : 220) - 12)), top, height });
  };
  useLayoutEffect(() => {
    if (!placement || !list.current || !trigger.current) return;
    list.current.scrollTop = Math.max(0, options.indexOf(value) * 24 - (trigger.current.getBoundingClientRect().top - placement.top - 8));
    list.current.focus();
  }, [placement, value, options]);
  useEffect(() => {
    if (!placement) return;
    const dismiss = (event: PointerEvent) => {
      if (!list.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPlacement(null);
    };
    const resize = () => setPlacement(null);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', resize); };
  }, [placement]);
  return <>
    <button id={node || compact ? id + "-trigger" : "describer-model"} ref={trigger} role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={Boolean(placement)} aria-controls={placement ? id : undefined} disabled={disabled} className="describer-model-trigger nodrag nopan" onClick={() => placement ? close() : open()} onKeyDown={(e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
    }}><span>{labels?.[choices.indexOf(value)] ?? (value || 'Select an option')}</span><DescriberIcon name="chevron" /></button>
    {placement && !disabled && createPortal(<div ref={list} id={id} role="listbox" aria-label={compact || label !== 'Model' ? label : "Models"} aria-activedescendant={`${id}-${active}`} tabIndex={-1} className="describer-model-menu nodrag nopan nowheel" style={placement} onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); close(); return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(options[active]); close(); return; }
      let next = active;
      if (e.key === 'ArrowDown') next = Math.min(options.length - 1, active + 1);
      else if (e.key === 'ArrowUp') next = Math.max(0, active - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = options.length - 1;
      else return;
      e.preventDefault(); setActive(next);
      list.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    }}>{options.map((model, index) => <div id={`${id}-${index}`} role="option" aria-selected={model === value} key={model} className={index === active ? 'is-active' : ''} onPointerMove={() => setActive(index)} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(model); close(); }}><span className="describer-model-check">{model === value && <DescriberIcon name="check" />}</span>{labels?.[choices.indexOf(model)] ?? model}</div>)}</div>, document.body)}
  </>;
}
