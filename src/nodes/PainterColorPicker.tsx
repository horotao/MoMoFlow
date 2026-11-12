import { NodeRangeInput } from './shared/NodeRangeInput';
import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from '@xyflow/react';
import { colorFromHex as fromHex, colorToHex as toHex } from './colorPicker';
import './PainterColorPicker.css';

const presets = ['#ffffff', '#222222', '#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#c084fc'];

export function PainterColorPicker({ label, color, opacity, disabled, onColor, onOpacity }: {
  label: string; color: string; opacity: number; disabled?: boolean;
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
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

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
    <button ref={trigger} type="button" disabled={disabled} className="painter-color-swatch" aria-label={`${label}选择器`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}
      onClick={() => setOpen(value => !value)}>
      <span style={{ background: color, opacity }} />
    </button>
    {open && !disabled && createPortal(<div ref={panel} id={dialogId} role="dialog" aria-label={`${label}选择器`} tabIndex={-1}
      className="painter-color-popover painter-design-picker nodrag nopan nowheel" style={position}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(); } }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) setOpen(false); }}>
      <header className="painter-picker-header"><span>{label}</span>
        <button type="button" aria-label="关闭颜色面板" onClick={close}><img src="/painter-node/close.svg" width={16} height={16} alt="" /></button>
      </header>
      <div className="painter-color-area" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pick(event); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
        <span className="painter-color-thumb" style={{ left: `clamp(9px, ${hsv.s * 100}%, calc(100% - 9px))`, top: `clamp(9px, ${(1 - hsv.v) * 100}%, calc(100% - 9px))` }} />
      </div>
      <div className="painter-color-sliders">
        <NodeRangeInput className="painter-hue" aria-label="色相" min={0} max={360} step={1} value={hsv.h} onValueChange={h => change({ ...hsv, h })} />
        <div className="painter-alpha-track">
          <NodeRangeInput className="painter-alpha" aria-label="不透明度" min={0} max={100} value={Math.round(opacity * 100)}
            style={{ '--elastic-background': `linear-gradient(to right, transparent, ${color})` } as CSSProperties} onValueChange={value => onOpacity(value / 100)} />
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
      <div className="painter-picker-presets" aria-label="预设颜色">
        {presets.map(value => <button key={value} type="button" aria-label={`使用颜色 ${value.toUpperCase()}`} aria-pressed={color.toLowerCase() === value}
          style={{ backgroundColor: value }} onClick={() => { const next = fromHex(value); change({ ...next, h: next.s ? next.h : hsv.h }); }} />)}
      </div>
      <div className="painter-color-accessible">
        <label>饱和度<NodeRangeInput aria-label="饱和度" min={0} max={100} value={hsv.s * 100} onValueChange={value => change({ ...hsv, s: value / 100 })} /></label>
        <label>明度<NodeRangeInput aria-label="明度" min={0} max={100} value={hsv.v * 100} onValueChange={value => change({ ...hsv, v: value / 100 })} /></label>
      </div>
    </div>, document.body)}
  </>;
}
