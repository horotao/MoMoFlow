import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { colorFromHex, colorToHex, normalizeHexColor } from '../colorPicker';
import { EditorPopover } from './EditorPopover';

function HexInput({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const formatted = value.slice(1).toUpperCase(), [text, setText] = useState(formatted), cancelled = useRef(false);
  useEffect(() => setText(formatted), [formatted]);
  return <input aria-label={label} value={text} maxLength={7} spellCheck={false} autoComplete="off"
    onChange={event => setText(event.target.value)} onBlur={() => {
      const color = normalizeHexColor(text);
      if (!cancelled.current && color && color !== value.toLowerCase()) onChange(color);
      cancelled.current = false; setText(formatted);
    }} onKeyDown={event => {
      if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase()) && text !== formatted) event.stopPropagation();
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled.current = true; event.currentTarget.blur(); }
    }} />;
}

export function ColorField({ label, value, disabled, onChange, onDraft, onCancel }: {
  label: string; value: string; disabled: boolean; onChange: (color: string) => void; onDraft: (color: string) => void; onCancel: () => void;
}) {
  const [open, setOpen] = useState(false), [hsv, setHsv] = useState(() => colorFromHex(value));
  const trigger = useRef<HTMLButtonElement>(null), picker = useRef<HTMLDivElement>(null), emitted = useRef(value);
  const drag = useRef<{ hsv: typeof hsv; color: string; next: string }>();
  const callbacks = useRef({ onChange, onDraft, onCancel }); callbacks.current = { onChange, onDraft, onCancel };
  useEffect(() => {
    if (value !== emitted.current) {
      const next = colorFromHex(value);
      setHsv(previous => ({ ...next, h: next.s ? next.h : previous.h }));
    }
    emitted.current = value;
  }, [value]);
  useEffect(() => {
    if (disabled) { if (drag.current) callbacks.current.onCancel(); drag.current = undefined; setOpen(false); }
  }, [disabled]);
  useEffect(() => () => { if (drag.current) callbacks.current.onCancel(); }, []);
  const change = (next: typeof hsv) => {
    setHsv(next);
    const color = colorToHex(next.h, next.s, next.v); emitted.current = color;
    if (drag.current) { drag.current.next = color; onDraft(color); }
    else if (color !== value.toLowerCase()) onChange(color);
  };
  const finish = (cancel = false) => {
    const active = drag.current;
    if (!active) return;
    drag.current = undefined;
    if (cancel || active.next === active.color.toLowerCase()) {
      emitted.current = active.color; setHsv(active.hsv); onCancel();
    } else onChange(active.next);
  };
  const begin = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return false;
    drag.current = { hsv, color: value, next: value }; event.currentTarget.setPointerCapture(event.pointerId); return true;
  };
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    change({ ...hsv, s: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), v: 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) });
  };
  const close = () => {
    // Outside pointerdown dismisses the popover before the browser's normal blur.
    // Commit a typed hex value while the input is still mounted.
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && picker.current?.contains(focused)) focused.blur();
    finish(true); setOpen(false);
  };
  return <>
    <div className={`comp-color-field${open ? ' is-open' : ''}`}>
      <button ref={trigger} type="button" className="comp-color-swatch" aria-label={`${label} picker`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled}
        onClick={() => open ? close() : setOpen(true)}><span style={{ background: value }} /></button>
      <HexInput label={`${label} hex`} value={value} onChange={onChange} />
    </div>
    {open && !disabled && trigger.current && <EditorPopover anchor={trigger.current} label={`${label} picker`} menu={false} width={240} onClose={close}>
      <div ref={picker} className="comp-color-picker" onKeyDown={event => {
        if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); finish(true); }
        if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase()) && drag.current) { event.preventDefault(); event.stopPropagation(); finish(true); }
      }}>
        <div className="comp-color-area" role="slider" tabIndex={0} aria-label="Color area" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.s * 100)}
          aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`} style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
          onPointerDown={event => { if (begin(event)) { event.preventDefault(); event.currentTarget.focus(); pick(event); } }}
          onPointerMove={event => { if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); }}
          onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? .1 : .01;
            change({ ...hsv, s: Math.max(0, Math.min(1, hsv.s + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0))),
              v: Math.max(0, Math.min(1, hsv.v + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0))) });
          }}>
          <span className="comp-color-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }} />
        </div>
        <input className="comp-color-hue" type="range" aria-label="Hue" min={0} max={360} step={1} value={hsv.h}
          onPointerDown={begin} onChange={event => change({ ...hsv, h: Number(event.target.value) })}
          onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} />
        <label className="comp-color-hex"><span>HEX</span><HexInput label="Picker hex color" value={value} onChange={onChange} /></label>
      </div>
    </EditorPopover>}
  </>;
}
