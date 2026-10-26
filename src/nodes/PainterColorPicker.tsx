import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from '@xyflow/react';
import { colorFromHex as fromHex, colorToHex as toHex } from './colorPicker';

export function PainterColorPicker({ label, color, opacity, onColor, onOpacity }: {
  label: string; color: string; opacity: number;
  onColor: (value: string) => void; onOpacity: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => fromHex(color));
  const [hex, setHex] = useState(color.slice(1));
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const emitted = useRef(color);
  const dialogId = useId();
  const viewport = useViewport();

  useEffect(() => {
    setHex(color.slice(1));
    if (color !== emitted.current) {
      const next = fromHex(color);
      setHsv(previous => ({ ...next, h: next.s ? next.h : previous.h }));
    }
    emitted.current = color;
  }, [color]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const box = panel.current.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - 8)),
        top: Math.max(8, Math.min(anchor.top >= box.height + 16 ? anchor.top - box.height - 8 : anchor.bottom + 8, window.innerHeight - box.height - 8)),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, viewport.x, viewport.y, viewport.zoom]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const dismiss = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  const change = (next: typeof hsv) => {
    setHsv(next);
    const value = toHex(next.h, next.s, next.v);
    emitted.current = value;
    setHex(value.slice(1));
    onColor(value);
  };
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    change({ ...hsv, s: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), v: 1 - Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) });
  };
  const close = () => { setOpen(false); trigger.current?.focus(); };

  return <>
    <button ref={trigger} type="button" className="painter-color-swatch" aria-label={`${label}选择器`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}
      onClick={() => setOpen(value => !value)}>
      <span style={{ background: color, opacity }} />
    </button>
    {open && createPortal(<div ref={panel} id={dialogId} role="dialog" aria-label={`${label}选择器`} tabIndex={-1}
      className="painter-color-popover nodrag nopan nowheel" style={position}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(); } }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) setOpen(false); }}>
      <div className="painter-color-area" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pick(event); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
        <span className="painter-color-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }} />
      </div>
      <div className="painter-color-sliders">
        <input className="painter-hue" type="range" aria-label="色相" min="0" max="360" step="1" value={hsv.h} onChange={event => change({ ...hsv, h: Number(event.target.value) })} />
        <div className="painter-alpha-track">
          <input className="painter-alpha" type="range" aria-label="不透明度" min="0" max="100" value={Math.round(opacity * 100)}
            style={{ background: `linear-gradient(to right, transparent, ${color})` }} onChange={event => onOpacity(Number(event.target.value) / 100)} />
        </div>
      </div>
      <div className="painter-color-numbers">
        <span>HEX</span>
        <input aria-label="十六进制颜色" value={hex.toUpperCase()} maxLength={6} spellCheck={false}
          onChange={event => {
            const value = event.target.value.replace(/[^0-9a-f]/gi, '');
            setHex(value);
            if (value.length === 6) { const next = fromHex(`#${value}`); change({ ...next, h: next.s ? next.h : hsv.h }); }
          }} onBlur={() => setHex(color.slice(1))} />
        <label><input aria-label="颜色选择器不透明度" type="number" min="0" max="100" value={Math.round(opacity * 100)}
          onChange={event => onOpacity(Math.max(0, Math.min(100, Number(event.target.value))) / 100)} /><span>%</span></label>
      </div>
      <div className="painter-color-accessible">
        <label>饱和度<input type="range" min="0" max="100" value={hsv.s * 100} onChange={event => change({ ...hsv, s: Number(event.target.value) / 100 })} /></label>
        <label>明度<input type="range" min="0" max="100" value={hsv.v * 100} onChange={event => change({ ...hsv, v: Number(event.target.value) / 100 })} /></label>
      </div>
    </div>, document.body)}
  </>;
}
