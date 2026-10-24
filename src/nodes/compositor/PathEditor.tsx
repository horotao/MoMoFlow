import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { ResolvedLayer } from '../compositor';
import { MAX_VECTOR_POINTS, pathCommands } from '../compositorGraphics';
import { editPathPoint, localDragDelta, nearestSegmentParameter, PATH_HIT_SIZE, splitPathSegment, togglePathCorner, type PathPatch, type PathSource } from './pathEditing';
import { useFrameDraft } from './useFrameDraft';

type Drag = { source: PathSource; transform: ResolvedLayer['transform']; index: number; handle?: 'in' | 'out'; x: number; y: number; delta?: { x: number; y: number }; next?: PathPatch };
export function PathEditor({ layer, zoom, onDraft, onChange, onCancel, onDone, onDragging }: {
  layer: ResolvedLayer; zoom: number; onDraft: (patch: PathPatch) => void; onChange: (patch: PathPatch) => void; onCancel: () => void; onDone: () => void; onDragging: (value: boolean) => void;
}) {
  const ref = useRef<SVGSVGElement>(null), active = useRef<Drag>();
  const [selected, setSelected] = useState<number>();
  const draggingCallback = useRef(onDragging); draggingCallback.current = onDragging;
  useEffect(() => () => draggingCallback.current(false), []);
  const draft = useFrameDraft(onDraft), source = layer.source, t = layer.transform;
  if (source.kind !== 'path') return null;
  const finish = (cancel = false) => { draft.clear(); const item = active.current; active.current = undefined; onDragging(false); if (!cancel && item?.next) onChange(item.next); else onCancel(); };
  const start = (event: PointerEvent, index: number, handle?: 'in' | 'out') => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); ref.current?.focus();
    setSelected(index); onDragging(true); active.current = { source, transform: t, index, handle, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId);
  };
  const updateDrag = (shift: boolean, alt: boolean) => {
    const item = active.current; if (!item?.delta) return;
    if (!item.next && Math.hypot(item.delta.x, item.delta.y) < 2) return;
    const next = editPathPoint(item.source, item.transform, item.index, localDragDelta(item.delta.x, item.delta.y, zoom, item.transform.rotation), item.handle, shift, alt);
    if (next) { item.next = next; draft.schedule(next); }
  };
  const commit = (patch?: PathPatch) => { if (patch) { draft.clear(); onChange(patch); } };
  const keyPoint = (event: React.KeyboardEvent, index: number, handle?: 'in' | 'out') => {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault(); event.stopPropagation(); const amount = event.shiftKey ? 10 : 1;
    commit(editPathPoint(source, t, index, { x: event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0, y: event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0 }, handle, false, event.altKey));
  };
  return <svg ref={ref} className="comp-path-editor" aria-label="Edit vector anchors" tabIndex={0} style={{ left: t.x, top: t.y, width: t.width, height: t.height, transform: `rotate(${t.rotation}deg)` }}
    onPointerMove={event => {
      const item = active.current; if (!item) return; event.stopPropagation();
      item.delta = { x: event.clientX - item.x, y: event.clientY - item.y }; updateDrag(event.shiftKey, event.altKey);
    }} onPointerUp={event => { if (active.current) { event.stopPropagation(); finish(); } }} onPointerCancel={() => finish(true)} onLostPointerCapture={() => { if (active.current) finish(true); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && active.current) finish(true); }}
    onKeyUp={event => { if (active.current && (event.key === 'Shift' || event.key === 'Alt')) { event.stopPropagation(); updateDrag(event.shiftKey, event.altKey); } }}
    onKeyDown={event => {
      if (active.current && (event.key === 'Shift' || event.key === 'Alt')) { event.stopPropagation(); updateDrag(event.shiftKey, event.altKey); }
      if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (active.current) finish(true); else onDone(); }
      if (selected !== undefined) keyPoint(event, selected);
      if ((event.key === 'Backspace' || event.key === 'Delete') && selected !== undefined) {
        event.preventDefault(); event.stopPropagation();
        if (source.points.length > (source.closed ? 3 : 2)) { commit({ source: { ...source, points: source.points.filter((_, index) => index !== selected) }, transform: t }); setSelected(undefined); }
      }
    }}>
    <path d={pathCommands(source.points, source.closed, t.width, t.height)} fill="none" stroke="var(--comp-selection-color)" strokeWidth={1 / zoom} pointerEvents="none" />
    {source.points.slice(0, source.closed ? undefined : -1).map((p, index) => <path key={`segment-${index}`} className="comp-path-segment" aria-label={`Add anchor to segment ${index + 1}`} d={pathCommands([p, source.points[(index + 1) % source.points.length]], false, t.width, t.height)} fill="none" stroke="transparent" strokeWidth={12 / zoom}
      onPointerDown={event => { event.stopPropagation(); }} onDoubleClick={event => {
        event.preventDefault(); event.stopPropagation(); const matrix = ref.current?.getScreenCTM();
        if (source.points.length < MAX_VECTOR_POINTS && matrix) {
          const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
          const parameter = nearestSegmentParameter(p, source.points[(index + 1) % source.points.length], { x: local.x / t.width, y: local.y / t.height }, t.width, t.height);
          commit({ source: splitPathSegment(source, index, parameter), transform: t }); setSelected(index + 1); ref.current?.focus();
        }
      }} />)}
    {source.points.map((point, index) => <g key={index}>
      {(['in', 'out'] as const).map(handle => point[handle] && <g key={handle}><line x1={point.x * t.width} y1={point.y * t.height} x2={point[handle].x * t.width} y2={point[handle].y * t.height} stroke="var(--comp-selection-color)" strokeWidth={1 / zoom} pointerEvents="none" />
        <g className="comp-path-control" role="button" aria-label={`Anchor ${index + 1} ${handle} handle`} tabIndex={0} onPointerDown={event => start(event, index, handle)} onKeyDown={event => keyPoint(event, index, handle)}>
          <circle className="comp-path-hit" cx={point[handle].x * t.width} cy={point[handle].y * t.height} r={PATH_HIT_SIZE / 2 / zoom} /><circle className="comp-path-marker" cx={point[handle].x * t.width} cy={point[handle].y * t.height} r={3 / zoom} fill="#fff" stroke="var(--comp-selection-color)" strokeWidth={1 / zoom} />
        </g></g>)}
      <g className="comp-path-control" role="button" aria-label={`Anchor ${index + 1}`} tabIndex={0} onFocus={() => setSelected(index)} onPointerDown={event => start(event, index)} onDoubleClick={event => { event.stopPropagation(); commit(togglePathCorner(source, t, index)); }}>
        <circle className="comp-path-hit" cx={point.x * t.width} cy={point.y * t.height} r={PATH_HIT_SIZE / 2 / zoom} />
        <rect className="comp-path-marker" x={point.x * t.width - 4 / zoom} y={point.y * t.height - 4 / zoom} width={8 / zoom} height={8 / zoom} fill={selected === index ? 'var(--comp-selection-color)' : '#fff'} stroke="var(--comp-selection-color)" strokeWidth={1 / zoom} />
      </g>
    </g>)}
  </svg>;
}
