import type { CSSProperties, PointerEvent } from 'react';
import type { ResolvedLayer } from '../compositor';
import { resizeCursor, resizeHandles, type ResizeHandle } from './canvasGeometry';

export function CanvasSelection({ layer, zoom, disabled, onResize, onRotate }: {
  layer: ResolvedLayer; zoom: number; disabled: boolean;
  onResize: (event: PointerEvent, handle: ResizeHandle) => void; onRotate: (event: PointerEvent) => void;
}) {
  const t = layer.transform;
  return <div className={`comp-selection${disabled ? ' is-locked' : ''}`} style={{ left: t.x, top: t.y, width: t.width, height: t.height,
    transform: `rotate(${t.rotation}deg)`, '--comp-inverse-zoom': 1 / zoom } as CSSProperties}>
    <span className="comp-selection-label">{layer.name}</span>
    {!disabled && <>
      {resizeHandles.map(handle => <button key={handle} tabIndex={-1} className={`comp-resize comp-resize-${handle}`} aria-label={`Resize ${handle}`}
        style={{ cursor: resizeCursor(handle, t.rotation) }} onPointerDown={event => onResize(event, handle)} />)}
      <button tabIndex={-1} className="comp-rotate" aria-label="Rotate layer" onPointerDown={onRotate} />
    </>}
  </div>;
}
