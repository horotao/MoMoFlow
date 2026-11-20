import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { MinusSignIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { annotationCoordinate, annotationLimit, annotationLimitMessage, type AnnotationMark as Mark, type AnnotationPoint as Point } from './interactiveEdit';
import './shared/annotationStyle.css';
import './FileImageAnnotations.css';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const positionStyle = ({ x, y }: Point) => ({ left: `${x * 100}%`, top: `${y * 100}%` });
const boxStyle = (start: Point, end: Point) => ({
  ...positionStyle({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) }),
  width: `${Math.abs(start.x - end.x) * 100}%`,
  height: `${Math.abs(start.y - end.y) * 100}%`,
});

function pointFrom(image: HTMLElement, event: { clientX: number; clientY: number }): Point {
  const bounds = image.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
}

const corners = ['nw', 'ne', 'sw', 'se'] as const;
type BoxCorner = (typeof corners)[number];

function resizeAxis(start: number, end: number, farEdge: boolean) {
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  // Keep the corners distinct after conversion to the 0–999 output coordinates.
  const minimumSize = Math.min(high - low, .002);
  return farEdge
    ? { start: high, anchor: low, min: low + minimumSize, max: 1 }
    : { start: low, anchor: high, min: 0, max: high - minimumSize };
}

function boxCorners(onResize?: (event: ReactPointerEvent<HTMLElement>, corner: BoxCorner) => void) {
  return corners.map(corner => <i key={corner} data-corner={corner}
    onPointerDown={onResize ? event => onResize(event, corner) : undefined} />);
}

export function FileImageAnnotations({ url, name, marks, surface, onMark, onMove, onRemove }: {
  url: string;
  marks: Mark[];
  name: string;
  surface: RefObject<HTMLDivElement>;
  onMark: (start: Point, end?: Point) => void;
  onMove?: (mark: Mark) => void;
  onRemove?: (id: string) => void;
}) {
  const draft = useRef<HTMLDivElement>(null);
  const commit = useRef({ onMark, onMove });
  commit.current = { onMark, onMove };
  const currentMarks = useRef(marks);
  currentMarks.current = marks;
  const gesture = useRef<() => void>();
  const [keyboardPoint, setKeyboardPoint] = useState<Point>();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const enabled = state === 'ready';
  const atLimit = marks.length >= annotationLimit;
  const canMove = Boolean(onMove);

  const cancel = useCallback(() => {
    const current = gesture.current;
    gesture.current = undefined;
    current?.();
  }, []);

  useLayoutEffect(() => {
    if (enabled && !atLimit) surface.current?.focus({ preventScroll: true });
  }, [atLimit, enabled, surface]);

  useLayoutEffect(() => cancel, [cancel, canMove, enabled, marks]);

  const startGesture = (event: ReactPointerEvent<HTMLElement>, mark?: Mark, corner?: BoxCorner) => {
    const image = surface.current;
    const { pointerId, clientX, clientY, currentTarget: handle } = event;
    const target = corner ? handle.parentElement : handle;
    if (!enabled || !image || !target || event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    image.focus({ preventScroll: true });
    setKeyboardPoint(undefined);

    const initial = pointFrom(image, event);
    const resize = corner && mark?.end ? {
      x: resizeAxis(mark.start.x, mark.end.x, corner.endsWith('e')),
      y: resizeAxis(mark.start.y, mark.end.y, corner.startsWith('s')),
    } : undefined;
    const fixedCorner = resize && { x: resize.x.anchor, y: resize.y.anchor };
    const start = resize ? { x: resize.x.start, y: resize.y.start } : mark?.start ?? { x: clamp(initial.x), y: clamp(initial.y) };
    const offsetX = mark?.end && !resize ? mark.end.x - start.x : 0;
    const offsetY = mark?.end && !resize ? mark.end.y - start.y : 0;
    const boundsX = resize?.x ?? { min: Math.max(0, -offsetX), max: Math.min(1, 1 - offsetX) };
    const boundsY = resize?.y ?? { min: Math.max(0, -offsetY), max: Math.min(1, 1 - offsetY) };
    const listeners = new AbortController();
    const listenerOptions = { capture: true, signal: listeners.signal };
    gesture.current = () => {
      listeners.abort();
      if (mark) {
        if (resize) {
          const saved = currentMarks.current.find(item => item.id === mark.id);
          if (saved?.end) Object.assign(target.style, boxStyle(saved.start, saved.end));
        } else target.style.removeProperty('translate');
        delete target.dataset.dragging;
      } else if (draft.current) draft.current.hidden = true;
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    };

    let dragged = false;
    const track = (pointer: PointerEvent) => {
      // Use a screen-pixel threshold, then retain the grab offset in image coordinates.
      dragged ||= Math.hypot(pointer.clientX - clientX, pointer.clientY - clientY) >= 5;
      const current = pointFrom(image, pointer);
      return {
        x: clamp(start.x + (current.x - initial.x), boundsX.min, boundsX.max),
        y: clamp(start.y + (current.y - initial.y), boundsY.min, boundsY.max),
      };
    };
    const cancelPointer = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) cancel(); };

    window.addEventListener('pointermove', pointer => {
      if (pointer.pointerId !== pointerId) return;
      const end = track(pointer);
      if (!dragged) return;
      if (mark) {
        target.dataset.dragging = 'true';
        if (fixedCorner) Object.assign(target.style, boxStyle(fixedCorner, end));
        else target.style.translate = `${(end.x - start.x) * image.clientWidth}px ${(end.y - start.y) * image.clientHeight}px`;
      } else if (draft.current) {
        Object.assign(draft.current.style, boxStyle(start, end));
        draft.current.hidden = false;
      }
    }, listenerOptions);
    window.addEventListener('pointerup', pointer => {
      if (pointer.pointerId !== pointerId) return;
      const position = track(pointer);
      cancel();
      const changedX = annotationCoordinate(start.x) !== annotationCoordinate(position.x);
      const changedY = annotationCoordinate(start.y) !== annotationCoordinate(position.y);
      if (mark) {
        if (dragged && (changedX || changedY)) commit.current.onMove?.({
          ...mark,
          start: position,
          end: fixedCorner ?? (mark.end && { x: clamp(position.x + offsetX), y: clamp(position.y + offsetY) }),
        });
      } else if (!dragged) commit.current.onMark(start);
      else if (changedX && changedY) commit.current.onMark(start, position);
    }, listenerOptions);
    window.addEventListener('keydown', key => {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopPropagation();
      cancel();
    }, listenerOptions);
    window.addEventListener('pointercancel', cancelPointer, listenerOptions);
    handle.addEventListener('lostpointercapture', cancelPointer, listenerOptions);
    window.addEventListener('blur', cancel, listenerOptions);
    handle.setPointerCapture(pointerId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !enabled || atLimit || event.ctrlKey || event.metaKey || event.altKey) return;
    const point = keyboardPoint ?? { x: .5, y: .5 };
    const step = event.shiftKey ? .05 : .01;
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (direction) {
      event.stopPropagation();
      event.preventDefault();
      setKeyboardPoint({ x: clamp(point.x + step * direction[0]), y: clamp(point.y + step * direction[1]) });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      onMark(point);
      setKeyboardPoint(point);
    }
  };

  return <div ref={surface} className={`edit-image${state === 'failed' ? ' is-failed' : ''} is-annotating nodrag nopan`}
    data-at-limit={atLimit} role={enabled ? 'group' : undefined}
    aria-label={enabled ? atLimit ? annotationLimitMessage : '图片标注，单击标点，拖动框选，方向键移动，回车标点' : undefined}
    tabIndex={enabled ? 0 : canMove ? -1 : undefined} onKeyDown={onKeyDown} onBlur={() => setKeyboardPoint(undefined)}
    onPointerDown={event => {
      if (enabled && !atLimit) startGesture(event);
    }}>
    <img className="edit-source-image" src={url} alt={name} draggable={false}
      onLoad={() => setState('ready')} onError={() => setState('failed')} />
    {state === 'failed' && <div className="edit-empty" role="status">图片加载失败</div>}
    <div className="edit-overlay">
      {enabled && marks.map((mark, index) => {
        const { id, start, end } = mark;
        const moveClass = canMove ? ' edit-mark-movable nodrag nopan' : '';
        const move = canMove ? (event: ReactPointerEvent<HTMLElement>) => startGesture(event, mark) : undefined;
        const pin = <span key={id} className={`edit-pin${end ? '' : moveClass}`}
          style={end ? undefined : positionStyle(start)} onPointerDown={end ? undefined : move}>
          <span aria-hidden="true">{index + 1}</span>
          {onRemove && <button type="button" className="edit-pin-remove nodrag nopan" aria-label={`移除标注 ${index + 1}`}
            onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onRemove(id); }}>
            <span className="edit-pin-remove-icon" aria-hidden="true"><HugeiconsIcon icon={MinusSignIcon} size={8} /></span>
          </button>}
        </span>;
        return end ? <div key={id} className={`edit-box${moveClass}`} style={boxStyle(start, end)} onPointerDown={move}>
          {boxCorners(canMove ? (event, corner) => startGesture(event, mark, corner) : undefined)}{pin}
        </div> : pin;
      })}
      <div className="edit-box edit-draft" ref={draft} hidden>{boxCorners()}</div>
      {enabled && !atLimit && keyboardPoint && <span className="edit-pin edit-keyboard-pin" style={positionStyle(keyboardPoint)} />}
    </div>
  </div>;
}
