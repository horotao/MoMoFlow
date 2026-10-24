import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { createLayer, MAX_COMPOSITOR_LAYERS, type CompositorDocument, type CompositorLayer } from '../compositor';
import { creationBounds, defaultText, MAX_VECTOR_POINTS, normalizePath, shapeKinds, type EditorTool, type Point, type VectorPoint } from '../compositorGraphics';

import { useFrameDraft } from './useFrameDraft';

type Drawing = { base: CompositorDocument; layer: CompositorLayer; start: Point; last: Point; moved?: boolean };
type Pen = { base: CompositorDocument; id: string; points: VectorPoint[]; dragging: boolean };
export function useGraphicTools({ tool, zoom, board, document, locked, onDraft, onChange, onSelect, onTool, onText }: {
  tool: EditorTool; zoom: number; board: RefObject<HTMLDivElement>; document: CompositorDocument; locked: boolean;
  onDraft: (document?: CompositorDocument) => void; onChange: (document: CompositorDocument) => void; onSelect: (id?: string) => void; onTool: (tool: EditorTool) => void; onText: (id: string) => void;
}) {
  const drawing = useRef<Drawing>(), pen = useRef<Pen>();
  const [points, setPoints] = useState<VectorPoint[]>([]), [pointer, setPointer] = useState<Point>();
  const [bounds, setBounds] = useState<CompositorLayer['transform']>();
  const frame = useFrameDraft<{ document?: CompositorDocument; points?: VectorPoint[]; pointer?: Point; bounds?: CompositorLayer['transform'] }>(next => {
    onDraft(next.document); if (next.points) setPoints(next.points); setPointer(next.pointer); setBounds(next.bounds);
  });
  const clearFrame = frame.clear;
  useEffect(() => { if (locked) { clearFrame(); setBounds(undefined); drawing.current = undefined; pen.current = undefined; setPoints([]); setPointer(undefined); onDraft(undefined); } }, [locked, onDraft, clearFrame]);
  const pointAt = (event: PointerEvent): Point => { const rect = board.current!.getBoundingClientRect(); return { x: Math.max(-1e6, Math.min(1e6, (event.clientX - rect.left) / zoom)), y: Math.max(-1e6, Math.min(1e6, (event.clientY - rect.top) / zoom)) }; };
  const penLayer = (active: Pen, closed = false) => {
    const geometry = normalizePath(active.points, closed);
    return { ...createLayer(active.id, 'Vector', geometry.source), transform: geometry.transform, aspectLocked: false, stroke: { enabled: true, color: '#000000', width: 1 } };
  };
  const previewPen = () => {
    const active = pen.current;
    if (!active) return;
    frame.schedule({ points: [...active.points], document: active.points.length >= 2 ? { ...active.base, layers: [...active.base.layers, penLayer(active)] } : undefined });
  };
  const finishPen = (cancel = false, closed = false, select = true) => {
    frame.clear(); const active = pen.current; pen.current = undefined; setPoints([]); setPointer(undefined);
    if (active && !cancel && active.points.length >= 2) {
      const next = penLayer(active, closed);
      if (Math.max(next.transform.width, next.transform.height) > 16384) { onDraft(undefined); onTool('select'); return; }
      onChange({ ...active.base, layers: [...active.base.layers, next] }); if (select) onSelect(next.id);
    } else onDraft(undefined);
    onTool('select');
  };
  const down = (event: PointerEvent) => {
    if (locked || event.button !== 0 || !board.current || (!pen.current && document.layers.length >= MAX_COMPOSITOR_LAYERS)) return false;
    if (tool === 'select' || tool === 'hand') return false;
    event.preventDefault(); event.stopPropagation();
    const point = pointAt(event);
    board.current.parentElement?.setPointerCapture(event.pointerId);
    if (tool === 'pen') {
      let active = pen.current;
      if (!active) active = pen.current = { base: document, id: crypto.randomUUID(), points: [], dragging: false };
      if (active.points.length > 2 && Math.hypot(point.x - active.points[0].x, point.y - active.points[0].y) * zoom < 8) { finishPen(false, true); return true; }
      const last = active.points[active.points.length - 1];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) * zoom < 2) return true;
      if (active.points.length >= MAX_VECTOR_POINTS) return true;
      if (event.shiftKey && last) {
        const angle = Math.round(Math.atan2(point.y - last.y, point.x - last.x) / (Math.PI / 4)) * Math.PI / 4, length = Math.hypot(point.x - last.x, point.y - last.y);
        point.x = last.x + Math.cos(angle) * length; point.y = last.y + Math.sin(angle) * length;
      }
      active.points.push(point); active.dragging = true; onSelect(undefined); previewPen(); return true;
    }
    const source = tool === 'text' ? defaultText() : { kind: 'shape' as const, shape: shapeKinds.find(shape => shape === tool)!, fill: '#ffffff' };
    const next = createLayer(crypto.randomUUID(), tool === 'text' ? 'Text' : tool[0].toUpperCase() + tool.slice(1), source);
    next.aspectLocked = false; next.transform = { ...point, width: tool === 'text' ? 384 : 200, height: 200, rotation: 0 };
    drawing.current = { base: document, layer: next, start: point, last: point };
    onSelect(next.id); return true;
  };
  const move = (event: PointerEvent) => {
    if (!board.current) return false;
    const point = pointAt(event), active = drawing.current, path = pen.current;
    if (path) {
      frame.schedule({ points: [...path.points], pointer: point, document: path.points.length >= 2 ? { ...path.base, layers: [...path.base.layers, penLayer(path)] } : undefined });
      if (path.dragging) {
        const anchor = path.points[path.points.length - 1];
        if (anchor.out || Math.hypot(point.x - anchor.x, point.y - anchor.y) * zoom > 3) {
          if (event.shiftKey) { const a = Math.round(Math.atan2(point.y - anchor.y, point.x - anchor.x) / (Math.PI / 4)) * Math.PI / 4, length = Math.hypot(point.x - anchor.x, point.y - anchor.y); point.x = anchor.x + Math.cos(a) * length; point.y = anchor.y + Math.sin(a) * length; }
          path.points[path.points.length - 1] = { ...anchor, out: point, in: { x: 2 * anchor.x - point.x, y: 2 * anchor.y - point.y } };
          previewPen();
        }
      }
      return true;
    }
    if (!active) return false;
    active.last = point;
    if (!active.moved && Math.hypot(point.x - active.start.x, point.y - active.start.y) * zoom < 3) return true;
    active.moved = true;
    active.layer = { ...active.layer, transform: creationBounds(active.start, point, event.shiftKey, event.altKey) };
    frame.schedule({ document: { ...active.base, layers: [...active.base.layers, active.layer] }, bounds: active.layer.transform }); return true;
  };
  const up = (cancel = false) => {
    if (pen.current) { if (cancel) finishPen(true); else pen.current.dragging = false; return true; }
    const active = drawing.current;
    if (!active) return false;
    frame.clear(); setBounds(undefined); drawing.current = undefined;
    if (cancel) onDraft(undefined);
    else {
      onChange({ ...active.base, layers: [...active.base.layers, active.layer] }); onSelect(active.layer.id);
      if (active.layer.source.kind === 'text') onText(active.layer.id);
    }
    onTool('select'); return true;
  };
  const cancel = () => { if (drawing.current) up(true); if (pen.current) finishPen(true); };
  const modifiers = (shift: boolean, alt: boolean) => {
    const active = drawing.current;
    if (!active?.moved) return;
    active.layer = { ...active.layer, transform: creationBounds(active.start, active.last, shift, alt) };
    frame.schedule({ document: { ...active.base, layers: [...active.base.layers, active.layer] }, bounds: active.layer.transform });
  };
  const key = (key: string) => {
    if (key === 'Escape' && (drawing.current || pen.current)) { cancel(); return true; }
    if (pen.current && key === 'Enter') { finishPen(); return true; }
    if (pen.current && (key === 'Backspace' || key === 'Delete')) {
      pen.current.points.pop();
      if (!pen.current.points.length) finishPen(true); else { if (pen.current.points.length < 2) onDraft(undefined); previewPen(); }
      return true;
    }
    return false;
  };
  const isDragging = useCallback(() => Boolean(drawing.current || pen.current?.dragging), []);
  return { down, move, up, cancel, key, modifiers, bounds, isDragging, points, pointer, get active() { return Boolean(drawing.current || pen.current); }, finishPen, finish: (select = true) => { if (pen.current) finishPen(false, false, select); if (drawing.current) up(); } };
}
