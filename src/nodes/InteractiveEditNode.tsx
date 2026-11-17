import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Location01Icon, MinusSignIcon, Redo02Icon, RotateCcwIcon, Undo02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { annotationImage } from './annotationGraph';
import { annotationCoordinate, annotationHistory, annotationLabel, annotationLimit, annotationMarkup, annotationPortTop, commitAnnotations, type AnnotationMark as Mark, type AnnotationPoint as Point } from './interactiveEdit';
import { isInteractiveEditNode, type AppNode, type InteractiveEditNode as InteractiveEditNodeType } from './types';
import { NodeIcon } from './NodeIcon';
import { TextNodeMenu } from './TextNodeMenu';
import { AnnotationPort } from './shared/AnnotationPort';
import { NodeFrame, NodeHeader } from './shared/NodeFrame';
import { NodePort } from './shared/NodePort';
import './shared/mediaNodeStyle.css';
import './InteractiveEditNode.css';

const annotationLimitMessage = `已达 ${annotationLimit} 个标注上限`;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
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

function boxCorners() {
  return <><i /><i /><i /><i /></>;
}

function ImageAnnotations({ url, marks, enabled, surface, onMark, onMove, onRemove, onReady }: {
  url: string;
  marks: Mark[];
  enabled: boolean;
  surface: RefObject<HTMLDivElement>;
  onMark: (start: Point, end?: Point) => void;
  onMove?: (id: string, point: Point) => void;
  onRemove?: (id: string) => void;
  onReady: (ready: boolean) => void;
}) {
  const draft = useRef<HTMLDivElement>(null);
  const commit = useRef({ onMark, onMove });
  commit.current = { onMark, onMove };
  const gesture = useRef<() => void>();
  const [keyboardPoint, setKeyboardPoint] = useState<Point>();
  const [failed, setFailed] = useState(false);
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

  const startGesture = (event: ReactPointerEvent<HTMLElement>, mark?: Mark) => {
    const image = surface.current;
    if (!image || event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    image.focus({ preventScroll: true });
    setKeyboardPoint(undefined);

    const { pointerId, clientX, clientY, currentTarget: target } = event;
    const initial = pointFrom(image, event);
    const start = mark?.start ?? { x: clamp(initial.x), y: clamp(initial.y) };
    const listeners = new AbortController();
    const listenerOptions = { capture: true, signal: listeners.signal };
    gesture.current = () => {
      listeners.abort();
      if (mark) {
        target.style.removeProperty('translate');
        delete target.dataset.dragging;
      } else if (draft.current) draft.current.hidden = true;
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    };

    let dragged = false;
    const track = (pointer: PointerEvent) => {
      // Use a screen-pixel threshold, then retain the grab offset in image coordinates.
      dragged ||= Math.hypot(pointer.clientX - clientX, pointer.clientY - clientY) >= 5;
      const current = pointFrom(image, pointer);
      return { x: clamp(current.x + start.x - initial.x), y: clamp(current.y + start.y - initial.y) };
    };
    const cancelPointer = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) cancel(); };

    window.addEventListener('pointermove', pointer => {
      if (pointer.pointerId !== pointerId) return;
      const end = track(pointer);
      if (!dragged) return;
      if (mark) {
        target.dataset.dragging = 'true';
        target.style.translate = `${(end.x - start.x) * image.clientWidth}px ${(end.y - start.y) * image.clientHeight}px`;
      } else if (draft.current) {
        Object.assign(draft.current.style, boxStyle(start, end));
        draft.current.hidden = false;
      }
    }, listenerOptions);
    window.addEventListener('pointerup', pointer => {
      if (pointer.pointerId !== pointerId) return;
      const end = track(pointer);
      cancel();
      const changedX = annotationCoordinate(start.x) !== annotationCoordinate(end.x);
      const changedY = annotationCoordinate(start.y) !== annotationCoordinate(end.y);
      if (mark) {
        if (dragged && (changedX || changedY)) commit.current.onMove?.(mark.id, end);
      } else if (!dragged) commit.current.onMark(start);
      else if (changedX && changedY) commit.current.onMark(start, end);
    }, listenerOptions);
    if (mark) window.addEventListener('keydown', key => {
      if (key.key !== 'Escape') return;
      key.preventDefault();
      key.stopPropagation();
      cancel();
    }, listenerOptions);
    window.addEventListener('pointercancel', cancelPointer, listenerOptions);
    target.addEventListener('lostpointercapture', cancelPointer, listenerOptions);
    window.addEventListener('blur', cancel, listenerOptions);
    target.setPointerCapture(pointerId);
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

  return <div ref={surface} className={`edit-image${failed ? ' is-failed' : ''}${enabled ? ' is-annotating nodrag nopan' : ''}`}
    data-at-limit={atLimit} role={enabled ? 'group' : undefined}
    aria-label={enabled ? atLimit ? annotationLimitMessage : '图片标注，单击标点，拖动框选，方向键移动，回车标点' : undefined}
    tabIndex={enabled ? 0 : canMove ? -1 : undefined} onKeyDown={onKeyDown} onBlur={() => setKeyboardPoint(undefined)}
    onPointerDown={event => {
      if (enabled && !atLimit) startGesture(event);
    }}>
    <img className="edit-source-image" src={url} alt="待标注图片" draggable={false}
      onLoad={() => { setFailed(false); onReady(true); }} onError={() => { setFailed(true); onReady(false); }} />
    {failed && <div className="edit-empty" role="status">图片加载失败</div>}
    <div className="edit-overlay">
      {marks.map((mark, index) => {
        const { id, start, end } = mark;
        const movable = canMove && !end;
        const pin = <span key={id} className={`edit-pin${movable ? ' edit-pin-movable nodrag nopan' : ''}`}
          style={end ? undefined : positionStyle(start)} onPointerDown={movable ? event => startGesture(event, mark) : undefined}>
          <span aria-hidden="true">{index + 1}</span>
          {onRemove && <button type="button" className="edit-pin-remove nodrag nopan" aria-label={`移除标注 ${index + 1}`}
            onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onRemove(id); }}>
            <span className="edit-pin-remove-icon" aria-hidden="true"><HugeiconsIcon icon={MinusSignIcon} size={8} /></span>
          </button>}
        </span>;
        return end ? <div key={id} className="edit-box" style={boxStyle(start, end)}>{boxCorners()}{pin}</div> : pin;
      })}
      <div className="edit-box edit-draft" ref={draft} hidden>{boxCorners()}</div>
      {enabled && !atLimit && keyboardPoint && <span className="edit-pin edit-keyboard-pin" style={positionStyle(keyboardPoint)} />}
    </div>
  </div>;
}

export function InteractiveEditNode({ id, data, isConnectable }: NodeProps<InteractiveEditNodeType>) {
  const nodes = useNodes<AppNode>();
  const edges = useEdges();
  const node = nodes.find(item => item.id === id);
  const image = isInteractiveEditNode(node) ? annotationImage(node, nodes, edges) : undefined;
  const history = annotationHistory(data, image?.id);
  const marks = history.frames[history.index];
  const atLimit = marks.length >= annotationLimit;
  const [mode, setMode] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const toolbarToggle = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const updateInternals = useUpdateNodeInternals();
  const ready = Boolean(image && loadedUrl === image.url);
  const enabled = ready && mode && isConnectable && !data.locked;
  const [name, setName] = useState<string>();

  const measuredMarks = useRef(marks);
  useLayoutEffect(() => {
    if (measuredMarks.current === marks) return;
    measuredMarks.current = marks;
    updateInternals(id);
  }, [id, marks, updateInternals]);

  const go = (offset: number) => {
    const index = history.index + offset;
    if (data.locked || index < 0 || index >= history.frames.length) return;
    updateNodeData(id, { history: { ...history, index } });
  };
  const commit = (updateMarks: (marks: Mark[]) => Mark[]) => {
    const current = getNode(id);
    if (!isInteractiveEditNode(current) || current.data.locked || !image) return;
    const actual = annotationImage(current, getNodes(), getEdges());
    if (actual?.id !== image.id || actual.url !== image.url) return;
    const state = annotationHistory(current.data, actual.id);
    const marks = state.frames[state.index];
    const updatedMarks = updateMarks(marks);
    if (updatedMarks === marks) return;
    const next = commitAnnotations(state, actual.id, updatedMarks);
    updateNodeData(id, { history: next });
  };
  const focusAfterHistoryAction = () => {
    const next = enabled ? surface.current : toolbarToggle.current;
    next?.focus({ preventScroll: true });
  };
  const cancel = () => {
    const element = surface.current;
    // Leaving the focused annotation surface also dismisses its keyboard cursor.
    if (document.activeElement === element) toolbarToggle.current?.focus();
    setMode(false);
  };

  return <NodeFrame className="media-node-frame interactive-edit-frame" style={{ minHeight: annotationPortTop(Math.max(0, marks.length - 1)) + 32 }}>
    <NodeHeader icon={<NodeIcon nodeType="interactive-edit" size={16} />} title={
      name === undefined ? <span>{data.label || '交互编辑'}</span>
        : <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name}
          onChange={event => setName(event.target.value)} onBlur={() => {
            if (name.trim()) updateNodeData(id, { label: name.trim() });
            setName(undefined);
          }} onKeyDown={event => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') setName(undefined);
            if (event.key === 'Enter') event.currentTarget.blur();
          }} />}
      actions={<TextNodeMenu id={id} locked={Boolean(data.locked)} appearance="shared"
        onRename={() => setName(data.label || '交互编辑')}>
        <img src="/node-style/more.svg" width={18} height={18} alt="" />
      </TextNodeMenu>} />
    <div className="edit-body" onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' && enabled) {
        event.stopPropagation();
        cancel();
      } else if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.stopPropagation();
        go(event.shiftKey ? 1 : -1);
      }
    }}>
      {image
        ? <ImageAnnotations key={`${image.id}:${image.url}`} url={image.url} marks={marks} enabled={enabled} surface={surface}
          onMark={(start, end) => commit(currentMarks => currentMarks.length >= annotationLimit
            ? currentMarks : [...currentMarks, { id: crypto.randomUUID(), start, end }])}
          onMove={ready && isConnectable && !data.locked ? (markId, start) => commit(currentMarks =>
            currentMarks.map(mark => mark.id === markId ? { ...mark, start } : mark)) : undefined}
          onRemove={isConnectable && !data.locked ? markId => {
            commit(currentMarks => currentMarks.filter(mark => mark.id !== markId));
            focusAfterHistoryAction();
          } : undefined}
          onReady={value => setLoadedUrl(value ? image.url : undefined)} />
        : <div className="edit-image edit-image-empty"><span className="edit-empty">连接图片后开始标注</span></div>}
      <div className="edit-controls nodrag nopan" role="group" aria-label="标注工具">
        <button type="button" ref={toolbarToggle} aria-pressed={enabled} disabled={!ready || !isConnectable || data.locked || (atLimit && !mode)}
          title={atLimit ? annotationLimitMessage : '单击标点，拖动框选'} onClick={() => setMode(!mode)}><HugeiconsIcon icon={Location01Icon} size={15} aria-hidden="true" />标注</button>
        <button type="button" aria-label="撤销" title="撤销" disabled={!history.index || data.locked} onClick={() => { go(-1); if (history.index === 1) focusAfterHistoryAction(); }}><HugeiconsIcon icon={Undo02Icon} size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="重做" title="重做" disabled={history.index === history.frames.length - 1 || data.locked} onClick={() => { go(1); if (history.index === history.frames.length - 2) focusAfterHistoryAction(); }}><HugeiconsIcon icon={Redo02Icon} size={16} aria-hidden="true" /></button>
        <span className="edit-limit-status" role="status">{atLimit ? annotationLimitMessage : null}</span>
        <button type="button" className="edit-reset" disabled={!marks.length || data.locked} onClick={() => { commit(() => []); focusAfterHistoryAction(); }}>
          <HugeiconsIcon icon={RotateCcwIcon} size={14} aria-hidden="true" />重置</button>
      </div>
    </div>
    <div className="media-port-image">
      <NodePort id="image" label="图片" top={annotationPortTop(0)} type="target" position={Position.Left} isConnectable={isConnectable && !data.locked}>
        <img src="/image-node/port-image.svg" width={32} height={32} alt="" />
        {image && <span className="media-port-dot" />}
      </NodePort>
    </div>
    {marks.map((mark, index) => <AnnotationPort key={mark.id} id={mark.id} label={annotationLabel(index)} title={annotationMarkup(mark)} top={annotationPortTop(index)}
      type="source" position={Position.Right} isConnectable={isConnectable}
      connected={edges.some(edge => edge.source === id && edge.sourceHandle === mark.id)} />)}
  </NodeFrame>;
}
