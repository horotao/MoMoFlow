import { useEffect, useId, useLayoutEffect, useRef, type PointerEvent } from 'react';
import { constrainCrop, dragCrop, type CropHandle } from '../../nodes/imageCrop';
import type { FileAsset, ImageCropRect } from '../../nodes/types';
import './image-crop.css';

const handles: { id: CropHandle; label: string; x: number; y: number }[] = [
  { id: 'nw', label: '左上', x: 0, y: 0 }, { id: 'n', label: '上', x: .5, y: 0 },
  { id: 'ne', label: '右上', x: 1, y: 0 }, { id: 'e', label: '右', x: 1, y: .5 },
  { id: 'se', label: '右下', x: 1, y: 1 }, { id: 's', label: '下', x: .5, y: 1 },
  { id: 'sw', label: '左下', x: 0, y: 1 }, { id: 'w', label: '左', x: 0, y: .5 },
];

export function ImageCropEditor({ source, initial, saving, onApply, onCancel, onError }: {
  source: FileAsset; initial?: ImageCropRect; saving: boolean;
  onApply: (rect: ImageCropRect) => void; onCancel: () => void; onError: () => void;
}) {
  const width = source.width!, height = source.height!;
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const mask = useRef<SVGPathElement>(null);
  const rect = useRef(initial ?? { x: 0, y: 0, width, height });
  const spaceHeld = useRef(false);
  const gesture = useRef<{ pointer: number; handle: CropHandle; x: number; y: number; rect: ImageCropRect; scaleX: number; scaleY: number }>();
  const actions = useRef({ onApply, onCancel, saving });
  actions.current = { onApply, onCancel, saving };
  const help = useId();

  function paint(value: ImageCropRect) {
    rect.current = value;
    const { x, y, width: w, height: h } = value;
    if (frame.current) {
      Object.assign(frame.current.style, { left: `${x / width * 100}%`, top: `${y / height * 100}%`, width: `${w / width * 100}%`, height: `${h / height * 100}%` });
      frame.current.setAttribute('aria-label', `裁剪区域：${Math.round(w)} × ${Math.round(h)} 像素`);
    }
    mask.current?.setAttribute('d', `M0 0H${width}V${height}H0Z M${x} ${y}v${h}h${w}V${y}Z`);
  }
  useLayoutEffect(() => {
    paint(rect.current);
    root.current?.focus({ preventScroll: true });
  // A session's source dimensions are fixed. Pointer updates write only the overlay.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (document.querySelector('[role="menu"], dialog[open]')) return;
      if (event.target instanceof Element && event.target.closest('.image-node-tools-label')) return;
      if (event.code === 'Space') {
        // Let React Flow's existing Space shortcut activate panning, including
        // when a crop handle has focus. Prevent the button's default click.
        spaceHeld.current = true;
        root.current?.setAttribute('data-panning', 'true');
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === 'Escape') actions.current.onCancel();
        else if (!actions.current.saving) actions.current.onApply(constrainCrop(rect.current, width, height));
      } else if (!['Tab', 'Shift'].includes(event.key) && !(event.target instanceof Element && event.target.closest('.image-crop-editor, .image-node-toolbar'))) {
        // Canvas shortcuts must not run while the image is being edited.
        event.stopImmediatePropagation();
      }
    }
    function outside(event: globalThis.PointerEvent) {
      if (event.button !== 0 || spaceHeld.current || gesture.current || actions.current.saving || !(event.target instanceof Element)
        || event.target.closest('.image-node-tools-menu, .image-node-tools-label') || root.current?.contains(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      actions.current.onApply(constrainCrop(rect.current, width, height));
    }
    function releaseSpace(event: KeyboardEvent) { if (event.code === 'Space') resetPan(); }
    function resetPan() { spaceHeld.current = false; root.current?.removeAttribute('data-panning'); }
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', releaseSpace, true);
    window.addEventListener('blur', resetPan);
    window.addEventListener('pointerdown', outside, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', releaseSpace, true);
      window.removeEventListener('blur', resetPan);
      window.removeEventListener('pointerdown', outside, true);
    };
  }, [width, height]);

  function start(event: PointerEvent, handle: CropHandle) {
    if (event.button === 1 || spaceHeld.current) return;
    event.preventDefault(); event.stopPropagation();
    if (saving || event.button !== 0 || !root.current) return;
    const bounds = root.current.getBoundingClientRect();
    root.current.setPointerCapture(event.pointerId);
    gesture.current = { pointer: event.pointerId, handle, x: event.clientX, y: event.clientY, rect: { ...rect.current }, scaleX: width / bounds.width, scaleY: height / bounds.height };
    root.current.dataset.dragging = 'true';
  }
  function finish(event: PointerEvent, cancel = false) {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (cancel) paint(drag.rect);
    gesture.current = undefined;
    root.current?.removeAttribute('data-dragging');
    if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
  }
  return <div ref={root} className="image-crop-editor image-edit-mode nodrag nowheel" role="group" aria-label="裁剪图片"
    aria-describedby={help} aria-busy={saving} tabIndex={-1}
    onPointerDown={event => { if (event.button !== 1 && !spaceHeld.current) { event.preventDefault(); event.stopPropagation(); } }}
    onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); }}
    onWheel={event => event.stopPropagation()}
    onKeyDown={event => { if (event.code !== 'Space') event.stopPropagation(); }}
    onPointerMove={event => {
      const drag = gesture.current;
      if (!drag || drag.pointer !== event.pointerId) return;
      paint(dragCrop(drag.rect, drag.handle, (event.clientX - drag.x) * drag.scaleX, (event.clientY - drag.y) * drag.scaleY, width, height, Math.min(width, height, 10 * drag.scaleX)));
    }} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}>
    <p id={help} className="image-crop-sr-only">拖动边角调整范围，拖动框内移动。中键或按住空格拖动可平移画布并保留裁剪。Enter 应用，Escape 取消。聚焦手柄后用方向键调整，Shift 加速。</p>
    <img src={source.url} alt={source.name} draggable={false} onError={onError} />
    <svg className="image-crop-mask" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path ref={mask} fillRule="evenodd" /></svg>
    <div ref={frame} className="image-crop-frame" role="group" onPointerDown={event => start(event, 'move')}>
      <div className="image-crop-grid" aria-hidden="true" />
      {handles.map(handle => <button key={handle.id} type="button" className="image-crop-handle" data-handle={handle.id}
        style={{ left: `${handle.x * 100}%`, top: `${handle.y * 100}%` }} aria-label={`裁剪${handle.label}手柄`} disabled={saving}
        onPointerDown={event => start(event, handle.id)} onKeyDown={event => {
          const amount = event.shiftKey ? 10 : 1;
          const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
          const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
          if (dx || dy) { event.preventDefault(); event.stopPropagation(); paint(dragCrop(rect.current, handle.id, dx, dy, width, height)); }
        }} />)}
    </div>
  </div>;
}
