import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from '@xyflow/react';
import { colorFromHex, colorToHex, normalizeHexColor } from './colorPicker';

// A gesture previews locally and commits once, keeping canvas undo useful.
export function ColorPalettePicker({ color, disabled, onChange, inline = false }: {
  color: string; disabled?: boolean; onChange: (hex: string) => void; inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(color);
  const [hex, setHex] = useState(color.slice(1));
  const [hsv, setHsv] = useState(() => colorFromHex(color));
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const gesture = useRef(false);
  const latest = useRef(color);
  const { x, y, zoom } = useViewport();
  useEffect(() => {
    setDraft(color); setHex(color.slice(1)); latest.current = color;
    setHsv(previous => { const next = colorFromHex(color); return { ...next, h: next.s ? next.h : previous.h }; });
  }, [color]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect(), box = panel.current.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8)),
        top: Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - box.height - 8)) });
    };
    place(); window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, x, y, zoom]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  const change = (next: typeof hsv) => {
    const value = colorToHex(next.h, next.s, next.v).toUpperCase();
    setHsv(next); setDraft(value); setHex(value.slice(1)); latest.current = value;
  };
  const commit = () => { gesture.current = false; if (!disabled && latest.current !== color) onChange(latest.current); };
  const cancel = () => { gesture.current = false; latest.current = color; setDraft(color); setHex(color.slice(1)); setHsv(colorFromHex(color)); };
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    change({ ...hsv, s: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), v: 1 - Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) });
  };
  return <>
    <button ref={trigger} type="button" className={inline ? 'palette-edit-color' : 'palette-swatch'} disabled={disabled}
      style={inline ? undefined : { backgroundColor: color }} aria-label={`Edit color ${color}`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { cancel(); setOpen(value => !value); }} />
    {open && !disabled && createPortal(<div ref={panel} role="dialog" aria-label="Color palette picker" tabIndex={-1}
      className="painter-color-popover palette-picker nodrag nopan nowheel" style={position}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); cancel(); setOpen(false); trigger.current?.focus(); } }}>
      <div className="painter-color-area" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); gesture.current = true; event.currentTarget.setPointerCapture(event.pointerId); pick(event); }}
        onPointerMove={event => { if (gesture.current && event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); }}
        onPointerUp={event => { if (gesture.current) { pick(event); commit(); } }} onPointerCancel={cancel}>
        <span className="painter-color-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: draft }} />
      </div>
      <div className="painter-color-sliders">
        <input className="painter-hue" type="range" aria-label="Hue" min="0" max="360" step="1" value={hsv.h}
          onChange={event => change({ ...hsv, h: Number(event.target.value) })} onPointerUp={commit} onKeyUp={commit} onPointerCancel={cancel} />
      </div>
      <div className="painter-color-numbers"><span>HEX</span><input aria-label="Hex color" value={hex} maxLength={7} spellCheck={false}
        onChange={event => setHex(event.target.value)} onBlur={() => {
          const value = normalizeHexColor(hex); if (value) { latest.current = value.toUpperCase(); commit(); } else setHex(color.slice(1));
        }} onKeyDown={event => { if (event.key === 'Enter') { event.currentTarget.blur(); panel.current?.focus(); } }} /></div>
      <div className="painter-color-accessible">
        <label>Saturation<input type="range" min="0" max="100" value={hsv.s * 100} onChange={event => change({ ...hsv, s: Number(event.target.value) / 100 })} onKeyUp={commit} /></label>
        <label>Brightness<input type="range" min="0" max="100" value={hsv.v * 100} onChange={event => change({ ...hsv, v: Number(event.target.value) / 100 })} onKeyUp={commit} /></label>
      </div>
    </div>, document.body)}
  </>;
}
