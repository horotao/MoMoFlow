import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useViewport } from '@xyflow/react';
import type { PainterShape } from './painter';
import { NodeMenu } from './shared/NodeMenu';

const shapes: { value: PainterShape; label: string }[] = [
  { value: 'rectangle', label: '矩形' },
  { value: 'ellipse', label: '圆形' },
  { value: 'triangle', label: '三角形' },
  { value: 'star', label: '星形' },
];

export function PainterShapeSelect({ shape, active, disabled, onActivate, onChange }: {
  shape: PainterShape;
  active: boolean;
  disabled?: boolean;
  onActivate: () => void;
  onChange: (shape: PainterShape) => void;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { x, y, zoom } = useViewport();
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const height = root.current?.querySelector('[role="menu"]')?.getBoundingClientRect().height;
      if (anchor && height) setAbove(anchor.bottom + height + 8 > window.innerHeight && anchor.top > height + 8);
    };
    place(); window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, x, y, zoom]);
  return <div ref={root} className="painter-shapes" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button type="button" title="形状" aria-label="形状" aria-pressed={active} disabled={disabled} onClick={onActivate}>
      <img src={`/painter-node/${shape}${active ? '-active' : ''}.svg`} width={18} height={18} alt="" />
    </button>
    <button ref={trigger} type="button" className="painter-shapes-trigger" aria-label="形状菜单" aria-haspopup="menu"
      aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled}
      onClick={() => setOpen(value => !value)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}><img src="/painter-node/chevron.svg" width={18} height={18} alt="" /></button>
    {open && <NodeMenu id={menuId} label="绘图形状" kind="radio" selectedAction={shape}
      selectedIndicator={<img src="/painter-node/check.svg" width={18} height={18} alt="" />}
      className={`painter-shapes-menu${above ? ' is-above' : ''}`}
      options={shapes.map(item => ({ action: item.value, label: item.label,
        icon: <img src={`/painter-node/${item.value}${item.value === shape ? '-active' : ''}.svg`} width={18} height={18} alt="" /> }))}
      onChoose={value => { onChange(value as PainterShape); setOpen(false); trigger.current?.focus(); }} />}
  </div>;
}
