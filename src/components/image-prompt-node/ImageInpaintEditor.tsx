import { useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { defaultInpaintBrushSize, hasInpaintSelection, type InpaintBrushMode, type InpaintStroke } from '../../nodes/imageInpaint';
import type { FileAsset } from '../../nodes/types';
import { ImageInpaintOptions } from './ImageInpaintOptions';
import { ImageInspectorElement } from './ImageInspectorContext';
import { ImagePromptGenerateControl } from './ImagePromptGenerateControl';
import './image-inpaint.css';

const suggestion = '将选中的物体替换成一个红苹果';
const dot = (x: number, y: number) => `M${x} ${y}h.01`;
type Point = { x: number; y: number };
const strokeColor = { paint: 'white', erase: 'black' };

export function ImageInpaintEditor({ source, size, saving, error, onSubmit, onCancel, onError }: {
  source: FileAsset;
  size: { width: number; height: number };
  saving: boolean;
  error: string;
  onSubmit: (prompt: string, strokes: readonly InpaintStroke[], quantity: number) => void;
  onCancel: (restoreFocus?: boolean) => void;
  onError: () => void;
}) {
  const { width, height } = size;
  const root = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const currentLine = useRef<SVGPathElement>(null);
  const gesture = useRef<{ pointer: number; bounds: DOMRect; stroke: InpaintStroke }>();
  const inspector = useContext(ImageInspectorElement);
  const keyboardPoint = useRef<Point>({ x: width / 2, y: height / 2 });
  const [edits, setEdits] = useState<(InpaintStroke | 'clear')[]>([]);
  const [diameter, setDiameter] = useState(defaultInpaintBrushSize);
  const [mode, setMode] = useState<InpaintBrushMode>('paint');
  const strokes = useMemo(() => edits.slice(edits.lastIndexOf('clear') + 1).filter(edit => edit !== 'clear'), [edits]);
  const hasSelection = useMemo(() => hasInpaintSelection(strokes, { width, height }), [strokes, width, height]);
  const [prompt, setPrompt] = useState('');
  const [quantity, setQuantity] = useState(1);
  const actions = useRef({ saving, onCancel });
  actions.current = { saving, onCancel };
  const id = useId();
  const ready = Boolean(hasSelection && prompt.trim() && !saving);

  useEffect(() => {
    surface.current?.focus({ preventScroll: true });
    function key(event: globalThis.KeyboardEvent) {
      const target = event.target;
      if (document.querySelector('[role="menu"]:not([data-state="closed"]), dialog[open]')) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        actions.current.onCancel();
      }
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) return;
      if (event.code === 'Space') {
        if (target instanceof Element && target.closest('button')) return;
        root.current?.setAttribute('data-panning', 'true');
        event.preventDefault();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.shiftKey && !actions.current.saving && !gesture.current) setEdits(previous => previous.slice(0, -1));
      }
    }
    function resetPan() { root.current?.removeAttribute('data-panning'); }
    function keyUp(event: globalThis.KeyboardEvent) { if (event.code === 'Space') resetPan(); }
    function outside(event: globalThis.PointerEvent) {
      if (event.button !== 0 || root.current?.hasAttribute('data-panning') || actions.current.saving) return;
      if (!(event.target instanceof Element) || root.current?.contains(event.target)) return;
      if (event.target.closest('.image-node-tools-menu, .image-inspector, .canvas-navigation')) return;
      if (event.target.closest('.image-node-toolbar') && root.current?.closest('.react-flow__node')?.contains(event.target)) return;
      actions.current.onCancel(false);
    }
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', keyUp, true);
    window.addEventListener('blur', resetPan);
    window.addEventListener('pointerdown', outside, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('blur', resetPan);
      window.removeEventListener('pointerdown', outside, true);
    };
  }, []);

  function point(clientX: number, clientY: number, bounds: DOMRect): Point {
    return {
      x: Math.round((clientX - bounds.x) / bounds.width * width * 100) / 100,
      y: Math.round((clientY - bounds.y) / bounds.height * height * 100) / 100,
    };
  }
  function showCursor({ x, y }: Point) {
    if (!cursor.current) return;
    cursor.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    cursor.current.hidden = x < 0 || x > width || y < 0 || y > height;
  }
  function hideCursor() { if (cursor.current) cursor.current.hidden = true; }
  function commitStroke(stroke: InpaintStroke) {
    if (hasSelection || stroke.mode === 'paint') setEdits(previous => [...previous, stroke]);
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button === 1 || root.current?.hasAttribute('data-panning')) return;
    event.stopPropagation();
    if (event.button !== 0 || saving || gesture.current) return;
    event.preventDefault();
    event.currentTarget.dataset.pointer = 'true';
    event.currentTarget.focus({ preventScroll: true });
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = point(event.clientX, event.clientY, bounds);
    const path = dot(position.x, position.y);
    gesture.current = { pointer: event.pointerId, bounds, stroke: { path, diameter, mode } };
    event.currentTarget.setPointerCapture(event.pointerId);
    currentLine.current?.setAttribute('stroke', strokeColor[mode]);
    currentLine.current?.setAttribute('stroke-width', String(diameter));
    currentLine.current?.setAttribute('d', path);
    if (event.pointerType !== 'touch') showCursor(position);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const drawing = gesture.current;
    const position = point(event.clientX, event.clientY, drawing?.bounds ?? event.currentTarget.getBoundingClientRect());
    if (event.pointerType !== 'touch') showCursor(position);
    if (drawing?.pointer !== event.pointerId) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const positions = samples.length ? samples.map(sample => point(sample.clientX, sample.clientY, drawing.bounds)) : [position];
    drawing.stroke.path += positions.map(({ x, y }) => `L${x} ${y}`).join('');
    currentLine.current?.setAttribute('d', drawing.stroke.path);
  }
  function end(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const drawing = gesture.current;
    if (drawing?.pointer !== event.pointerId) return;
    gesture.current = undefined;
    if (!cancelled) commitStroke(drawing.stroke);
    currentLine.current?.removeAttribute('d');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.pointerType === 'touch' || cancelled) hideCursor();
  }
  function keyboardPaint(event: KeyboardEvent<HTMLDivElement>) {
    if (event.code === 'Space') return;
    event.stopPropagation();
    if (saving) return;
    const step = 12;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy && event.key !== 'Enter') return;
    event.preventDefault();
    delete event.currentTarget.dataset.pointer;
    const previous = keyboardPoint.current;
    const x = Math.min(width, Math.max(0, previous.x + dx));
    const y = Math.min(height, Math.max(0, previous.y + dy));
    keyboardPoint.current = { x, y };
    showCursor({ x, y });
    if (event.key === 'Enter' || event.shiftKey) {
      commitStroke({ path: `${dot(previous.x, previous.y)}L${x} ${y}`, diameter, mode });
    }
  }
  return <div className="image-inpaint-editor image-edit-mode" ref={root} role="group" aria-label="局部重绘" aria-busy={saving}>
    <div ref={surface} className="image-inpaint-surface nodrag" role="group" tabIndex={0}
      aria-label="涂抹重绘区域" aria-describedby={`${id}-help`}
      onPointerDown={start} onPointerMove={move} onPointerLeave={hideCursor}
      onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)}
      onLostPointerCapture={event => end(event, true)} onKeyDown={keyboardPaint}
      onBlur={event => { delete event.currentTarget.dataset.pointer; hideCursor(); }}
      onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); }}>
      <p id={`${id}-help`} className="image-crop-sr-only">拖动添加或擦除选区。方向键移动笔刷，Enter 点涂，Shift 加方向键连续画，Ctrl 或 Command 加 Z 撤销上一笔，Escape 退出。</p>
      <img src={source.url} alt={source.name} draggable={false} onError={onError} />
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id={`${id}-pattern`} width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M6 8h4M8 6v4M-2 0h4M0 -2v4M14 0h4M16 -2v4M-2 16h4M0 14v4M14 16h4M16 14v4" fill="none" stroke="#c1f5d3" strokeOpacity=".8" strokeWidth=".65" />
          </pattern>
          <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              {strokes.map(({ path, diameter, mode }, index) => <path key={index} d={path} strokeWidth={diameter} stroke={strokeColor[mode]} />)}
              <path ref={currentLine} />
            </g>
          </mask>
        </defs>
        <g mask={`url(#${id}-mask)`}>
          <rect width={width} height={height} fill="#6cb37c" fillOpacity=".85" />
          <rect width={width} height={height} fill={`url(#${id}-pattern)`} />
        </g>
      </svg>
      <span className="image-inpaint-cursor" data-mode={mode} style={{ width: diameter, height: diameter }} ref={cursor} aria-hidden="true" hidden />
    </div>
    <form className="image-inpaint-prompt image-node-actions nodrag nopan nowheel"
      onSubmit={event => { event.preventDefault(); if (ready) onSubmit(prompt.trim(), strokes, quantity); }}
      onWheel={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <div className="image-inpaint-text">
        <textarea rows={1} aria-label="重绘提示词" value={prompt} maxLength={32000} disabled={saving}
          onChange={event => setPrompt(event.target.value)} onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Tab' && !event.shiftKey && !prompt) {
              event.preventDefault();
              setPrompt(suggestion);
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault(); event.currentTarget.form?.requestSubmit();
            }
          }} />
        {!prompt && <span className="image-node-suggestion" aria-hidden="true"><span className="image-node-suggestion-label">试试「{suggestion}」</span><kbd>tab</kbd></span>}
      </div>
      <ImagePromptGenerateControl quantity={quantity} onQuantityChange={setQuantity} canChangeQuantity={ready}
        canSend={ready} sendType="submit" sendLabel="生成局部重绘" />
      {error && <p className="image-inpaint-error" role="alert">{error}</p>}
    </form>
    {inspector && createPortal(<ImageInpaintOptions diameter={diameter} mode={mode} disabled={saving}
      onDiameterChange={setDiameter} onModeChange={setMode}
      onClear={() => { if (hasSelection) setEdits(previous => [...previous, 'clear']); }} />, inspector)}
  </div>;
}
