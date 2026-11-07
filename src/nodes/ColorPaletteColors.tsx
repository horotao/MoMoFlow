import { useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { DragDropVerticalIcon } from '@hugeicons/core-free-icons';
import { useReactFlow } from '@xyflow/react';
import { isColorPaletteNode, type AppNode, type ColorPaletteNode } from './types';
import { insertPaletteColor, movePaletteColor, paletteLimit, type PaletteColor } from './colorPalette';
import { normalizeHexColor } from './colorPicker';
import { ColorPalettePicker } from './ColorPalettePicker';

function PaletteReorderIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M5.5 4.5h5M5.5 8h5M5.5 11.5h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>;
}

function PaletteRemoveIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m7.5 7.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>;
}

function HexField({ hex, disabled, onChange, index }: { hex: string; disabled: boolean; onChange: (hex: string) => void; index: number }) {
  const [draft, setDraft] = useState<string>();
  return <input aria-label={`Color ${index + 1} hex`} spellCheck={false} maxLength={7} disabled={disabled} value={draft ?? hex.slice(1)}
    onChange={event => setDraft(event.target.value)} onBlur={() => {
      const value = normalizeHexColor(draft ?? hex); if (value) onChange(value.toUpperCase()); setDraft(undefined);
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(undefined); event.stopPropagation(); } }} />;
}

export function ColorPaletteColors({ node, inline = false }: { node: Pick<ColorPaletteNode, 'id' | 'data'>; inline?: boolean }) {
  const { getNode, updateNodeData, setNodes } = useReactFlow<AppNode>();
  const list = useRef<HTMLDivElement>(null);
  const [dragPreview] = useState(() => {
    // A detached, loaded <img> uses its intrinsic bitmap in Chromium. A
    // detached canvas has no layout and falls back to the oversized row image.
    const image = new Image();
    image.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
    return image;
  });
  const [drag, setDrag] = useState<{ id: string; before: PaletteColor[]; slot: number | null; line: number; left?: number; width?: number }>();
  const dragging = useRef<typeof drag>();
  const colors = node.data.colors;
  const activeDrag = drag?.before === colors && !node.data.locked ? drag : undefined;
  const locked = Boolean(node.data.locked);
  const select = () => setNodes(nodes => nodes.map(item => item.selected === (item.id === node.id) ? item : { ...item, selected: item.id === node.id }));
  const patch = (next: PaletteColor[]) => {
    const current = getNode(node.id);
    if (isColorPaletteNode(current) && !current.data.locked && JSON.stringify(next) !== JSON.stringify(current.data.colors)) updateNodeData(node.id, { colors: next });
  };
  const edit = (id: string, hex: string) => {
    const current = getNode(node.id);
    if (isColorPaletteNode(current)) patch(current.data.colors.map(color => color.id === id ? { ...color, hex } : color));
  };
  const add = (index: number) => { select(); patch(insertPaletteColor(node.data.colors, index)); };
  const cancel = () => { dragging.current = undefined; setDrag(undefined); };
  const start = (id: string) => {
    const value = { id, before: colors, slot: null, line: 0 };
    dragging.current = value; setDrag(value);
  };
  const move = (x: number, y: number) => {
    const value = dragging.current, element = list.current;
    if (!value || !element) return;
    const box = element.getBoundingClientRect();
    const rows = [...element.querySelectorAll<HTMLElement>('.palette-color-row')];
    const inside = x >= box.left - (inline ? 0 : 16) && x <= box.right + (inline ? 0 : 16)
      && y >= box.top - 8 && y <= box.bottom + 8;
    if (inline) {
      // Pick a grid cell using both axes; its upper/lower half selects the
      // insertion edge. Offsets stay in flow coordinates at every canvas zoom.
      const row = rows.reduce<HTMLElement | undefined>((nearest, candidate) => {
        const distance = (item: HTMLElement) => {
          const rect = item.getBoundingClientRect();
          return (x - rect.left - rect.width / 2) ** 2 + (y - rect.top - rect.height / 2) ** 2;
        };
        return !nearest || distance(candidate) < distance(nearest) ? candidate : nearest;
      }, undefined);
      if (!row) return;
      const rect = row.getBoundingClientRect();
      const after = y >= rect.top + rect.height / 2 || x > rect.right;
      const slot = inside ? rows.indexOf(row) + (after ? 1 : 0) : null;
      const next = { ...value, slot, line: row.offsetTop + (after ? row.offsetHeight + 3 : -3), left: row.offsetLeft, width: row.offsetWidth };
      dragging.current = next; setDrag(next);
      return;
    }
    const nextRow = rows.findIndex(row => y < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
    const slot = inside ? (nextRow === -1 ? rows.length : nextRow) : null;
    const row = rows[slot ?? 0];
    const line = row ? row.offsetTop - (slot ? (inline ? 0 : 3) : 0) : element.offsetHeight;
    const next = { ...value, slot, line };
    dragging.current = next; setDrag(next);
  };
  const finish = () => {
    const value = dragging.current, current = getNode(node.id);
    if (value && value.slot !== null && isColorPaletteNode(current) && current.data.colors === value.before) {
      const from = value.before.findIndex(color => color.id === value.id);
      patch(movePaletteColor(value.before, value.id, value.slot > from ? value.slot - 1 : value.slot));
    }
    cancel();
  };
  return <div className={`${inline ? 'palette-canvas nodrag nopan' : 'palette-settings-colors'}${activeDrag ? ' is-sorting' : ''}`} onClick={inline ? select : undefined}
    onKeyDown={event => { if (event.key === 'Escape' && dragging.current) { event.stopPropagation(); cancel(); } }}>
    <div ref={list} className="palette-color-list"
      onDragOver={event => {
        if (!dragging.current) return;
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
        move(event.clientX, event.clientY);
      }} onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && dragging.current) {
          const next = { ...dragging.current, slot: null }; dragging.current = next; setDrag(next);
        }
      }} onDrop={event => {
        if (!dragging.current) return;
        event.preventDefault(); event.stopPropagation(); move(event.clientX, event.clientY); finish();
      }}>
      {colors.map((color, index) => <div key={color.id} className={`palette-color-row${activeDrag?.id === color.id ? ' is-dragging' : ''}`}
        draggable={!locked && colors.length > 1}
        onDragStart={event => {
          if (locked || (event.target as HTMLElement).closest('input, .palette-remove')) { event.preventDefault(); return; }
          if (inline && (!dragPreview.complete || !dragPreview.naturalWidth)) { event.preventDefault(); return; }
          event.stopPropagation(); event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('application/x-momoflow-palette-color', color.id);
          if (inline) {
            // Chromium's default drag snapshot ignores the React Flow zoom.
            // The highlighted source row and insertion line are our preview;
            // suppress the extra, unscaled bitmap without canceling native DnD.
            event.dataTransfer.setDragImage(dragPreview, 0, 0);
          }
          start(color.id);
        }} onDragEnd={event => { event.stopPropagation(); cancel(); }}>
        {inline && <span className="palette-color-fill" style={{ backgroundColor: color.hex }} aria-hidden="true" />}
        <button type="button" className="palette-grip" aria-label={`Move color ${index + 1}`} title="Drag to reorder · ↑ / ↓" disabled={locked}
          onPointerDown={event => {
            if (event.pointerType === 'mouse' || event.button !== 0 || locked || colors.length < 2) return;
            event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); start(color.id);
          }} onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event.clientX, event.clientY);
          }} onPointerUp={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) { move(event.clientX, event.clientY); finish(); }
          }} onPointerCancel={event => { if (event.pointerType !== 'mouse') cancel(); }} onLostPointerCapture={event => { if (event.pointerType !== 'mouse') cancel(); }}
          onKeyDown={event => {
            if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            patch(movePaletteColor(colors, color.id, event.key === 'Home' ? 0 : event.key === 'End' ? colors.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1)));
          }}>{inline ? <HugeiconsIcon icon={DragDropVerticalIcon} size={14} /> : <PaletteReorderIcon />}</button>
        <ColorPalettePicker inline={inline} color={color.hex} disabled={locked} onChange={hex => edit(color.id, hex)} />
        {inline ? <span className="palette-hex-label">{color.hex}</span>
          : <HexField index={index} hex={color.hex} disabled={locked} onChange={hex => edit(color.id, hex)} />}
        <button type="button" className="palette-remove" disabled={locked} aria-label={`Remove color ${color.hex}`}
          onClick={() => patch(colors.filter(item => item.id !== color.id))}>{inline ? <img src="/painter-node/close.svg" width={16} height={16} alt="" /> : <PaletteRemoveIcon />}</button>
      </div>)}
      {inline && colors.length < paletteLimit && <button type="button" className="palette-grid-add" disabled={locked} aria-label="Add color"
        onClick={() => add(colors.length)}><span><img src="/palette-node/add.svg" width={24} height={24} alt="" /></span></button>}
      {activeDrag && activeDrag.slot !== null && <div className="palette-drop-line" style={{ top: activeDrag.line, left: activeDrag.left, width: activeDrag.width }} />}
    </div>
    {!inline && <button type="button" className="palette-add" disabled={locked || colors.length >= paletteLimit} onClick={() => add(colors.length)}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5v11M6.5 12h11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>Add color</button>}
  </div>;
}
