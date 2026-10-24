import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { useEdges, useNodes } from '@xyflow/react';
import { Check, ChevronLeft, Images, List } from 'lucide-react';
import { CanvasHistoryContext } from '../../components/useCanvasHistory';
import { compositorLayout, createLayer, layerAsset, MAX_COMPOSITOR_LAYERS, removeCompositorLayer, resizeLayer, type CompositorDocument, type CompositorInputs, type CompositorLayer, type LayerTransform } from '../compositor';
import { imageOutput } from '../sunburstRun';
import type { AppNode, FileAsset } from '../types';
import { CompositorCanvas, type CompositorView } from './CompositorNode';
import { CompositorProperties } from './Properties';
import { COMPOSITOR_ASSET_DRAG, EditorSidebar } from './EditorSidebar';
import { EditorToolbar } from './EditorToolbar';
import { isGraphicSource, pathCommands, type EditorTool } from '../compositorGraphics';
import { useGraphicTools } from './useGraphicTools';
import { TextLayerEditor } from './TextLayerEditor';
import { PathEditor } from './PathEditor';
import { CanvasSelection } from './CanvasSelection';
import { angleDelta, sameTransform, snapMove, snapRotation, snapTargets, type SnapGuide, type SnapTargets } from './canvasGeometry';

type Feedback = { x: number; y: number; text: string };
type Gesture = { kind: 'move' | 'resize' | 'rotate' | 'pan'; x: number; y: number; pan: { x: number; y: number }; document: CompositorDocument; layerId?: string; transform?: LayerTransform; corner?: string; center?: { x: number; y: number }; angle?: number; rotation?: number; targets?: SnapTargets; moved?: boolean; next?: CompositorDocument; guides?: SnapGuide[]; feedback?: Feedback };
export function CompositorEditor({ id, name, document, inputs, view, locked, error, pending, previewing, onChange, onDraft, onClose }: {
  id: string; name: string; document: CompositorDocument; inputs: CompositorInputs; view?: CompositorView; locked: boolean; error: string; pending: boolean;
  previewing: boolean; onChange: (document: CompositorDocument) => void; onDraft: (document?: CompositorDocument) => void; onClose: () => void;
}) {
  const nodes = useNodes<AppNode>(), edges = useEdges(), history = useContext(CanvasHistoryContext);
  const [tab, setTab] = useState<'layers' | 'assets'>('layers'), [selected, setSelected] = useState<string>();
  const [zoom, setZoom] = useState(.5), [pan, setPan] = useState({ x: 0, y: 0 }), [tool, setTool] = useState<EditorTool>('select');
  const [textEditing, setTextEditing] = useState<string>(), [pathEditing, setPathEditing] = useState<string>();
  const textBaseline = useRef<CompositorDocument>();
  const [space, setSpace] = useState(false), [panning, setPanning] = useState(false), [assetDrop, setAssetDrop] = useState(false);
  const [guides, setGuides] = useState<SnapGuide[]>([]), [feedback, setFeedback] = useState<Feedback>();
  const [workspaceSize, setWorkspaceSize] = useState({ width: 600, height: 600 });
  const root = useRef<HTMLDivElement>(null), workspace = useRef<HTMLDivElement>(null), board = useRef<HTMLDivElement>(null);
  const detailDragging = useRef(false);
  const gesture = useRef<Gesture>(), draftFrame = useRef<number>(), fitted = useRef(false);
  const sizes = useMemo(() => Object.fromEntries((view?.layout.layers ?? []).flatMap(layer => layer.asset?.width && layer.asset.height ? [[layer.asset.url, { width: layer.asset.width, height: layer.asset.height }]] : [])), [view]);
  const layout = compositorLayout(document, inputs, sizes), layer = layout.layers.find(layer => layer.id === selected);
  const textLayer = layout.layers.find(item => item.id === textEditing);
  const beginText = (layerId: string) => { textBaseline.current = undefined; setTextEditing(layerId); setPathEditing(undefined); };
  const changeText = (text?: string) => {
    if (!textEditing || locked) return;
    if (text === undefined) { onDraft(undefined); setTextEditing(undefined); textBaseline.current = undefined; root.current?.focus(); return; }
    if (!textBaseline.current) textBaseline.current = document;
    return { ...textBaseline.current, layers: textBaseline.current.layers.map(item => item.id === textEditing && item.source.kind === 'text' ? { ...item, source: { ...item.source, text } } : item) };
  };
  const graphics = useGraphicTools({ tool, zoom, board, document, locked, onDraft, onChange, onSelect: setSelected, onTool: setTool, onText: beginText });
  const graphicsDragging = graphics.isDragging;
  const changeTool = (next: EditorTool) => { graphics.finish(); setPathEditing(undefined); setTool(next); root.current?.focus(); };
  const editContent = () => { if (layer && !locked && !layer.locked) { if (layer.source.kind === 'text') beginText(layer.id); if (layer.source.kind === 'path') { setPathEditing(layer.id); root.current?.focus(); } } };
  const fit = useCallback(() => { setZoom(Math.max(.02, Math.min(2, (workspaceSize.width - 120) / layout.width, (workspaceSize.height - 140) / layout.height))); setPan({ x: 0, y: 0 }); }, [layout.width, layout.height, workspaceSize]);
  const zoomAt = useCallback((next: number, x = workspaceSize.width / 2, y = workspaceSize.height / 2) => {
    const value = Math.min(8, Math.max(.02, next));
    setPan(pan => ({ x: x - workspaceSize.width / 2 - (x - workspaceSize.width / 2 - pan.x) * value / zoom,
      y: y - workspaceSize.height / 2 - (y - workspaceSize.height / 2 - pan.y) * value / zoom }));
    setZoom(value);
  }, [workspaceSize, zoom]);
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => { previous?.focus(); };
  }, []);
  // Removing a renamed row or disabling Undo can send focus to <body>. Keep
  // subsequent editing shortcuts inside this modal rather than the workflow.
  useLayoutEffect(() => { if (window.document.activeElement === window.document.body) root.current?.focus(); });
  useLayoutEffect(() => {
    if (!workspace.current) return;
    const observer = new ResizeObserver(([entry]) => setWorkspaceSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(workspace.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (view && !fitted.current && workspace.current) {
      const rect = workspace.current.getBoundingClientRect();
      fitted.current = true; setZoom(Math.max(.02, Math.min(2, (rect.width - 120) / layout.width, (rect.height - 140) / layout.height))); setPan({ x: 0, y: 0 });
    }
  }, [view, layout.width, layout.height]);
  useEffect(() => {
    const target = workspace.current;
    if (!target) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (gesture.current || detailDragging.current || graphicsDragging()) return;
      const rect = target.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) zoomAt(zoom * Math.exp(-event.deltaY * .008), event.clientX - rect.left, event.clientY - rect.top);
      else setPan(pan => ({ x: pan.x - event.deltaX, y: pan.y - event.deltaY }));
    };
    target.addEventListener('wheel', wheel, { passive: false });
    return () => target.removeEventListener('wheel', wheel);
  }, [zoom, zoomAt, graphicsDragging]);
  useEffect(() => { if (locked) { gesture.current = undefined; setGuides([]); setFeedback(undefined); setPanning(false); setTextEditing(undefined); setPathEditing(undefined); onDraft(undefined); } }, [locked, onDraft]);
  useEffect(() => () => { if (draftFrame.current !== undefined) cancelAnimationFrame(draftFrame.current); }, []);
  const updateLayer = (patch: Partial<CompositorLayer>) => {
    if (!selected || locked || layer?.locked) return;
    onChange({ ...document, layers: document.layers.map(item => item.id === selected ? { ...item, ...patch } : item) });
  };
  const remove = () => { if (!locked && selected) { const next = removeCompositorLayer(document, selected); if (next !== document) { onChange(next); setSelected(undefined); } } };
  const duplicate = () => {
    if (!layer || locked || layer.locked || (!layer.asset && !isGraphicSource(layer.source)) || document.layers.length >= MAX_COMPOSITOR_LAYERS) return;
    const { asset, ...original } = layer;
    const copy = { ...original, id: crypto.randomUUID(), name: `${layer.name} copy`, source: asset ? { kind: 'asset' as const, asset } : original.source, transform: { ...layer.transform, x: layer.transform.x + 20, y: layer.transform.y + 20 } };
    onChange({ ...document, layers: [...document.layers, copy] }); setSelected(copy.id);
  };
  const start = (event: PointerEvent, kind: Gesture['kind'], layerId?: string, corner?: string) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (tool === 'hand' || space || event.button === 1) kind = 'pan';
    if (kind !== 'pan' && tool !== 'select') return;
    if (kind !== 'pan') setPathEditing(undefined);
    if (kind !== 'pan' && (locked || document.layers.find(layer => layer.id === layerId)?.locked)) return;
    event.preventDefault(); event.stopPropagation(); root.current?.focus();
    if (kind !== 'pan') setSelected(layerId); else setPanning(true);
    const target = layout.layers.find(layer => layer.id === layerId), rect = board.current?.getBoundingClientRect();
    const center = target && rect ? { x: rect.left + (target.transform.x + target.transform.width / 2) * zoom, y: rect.top + (target.transform.y + target.transform.height / 2) * zoom } : undefined;
    gesture.current = { kind, x: event.clientX, y: event.clientY, pan, document, layerId, corner, transform: target?.transform, center,
      targets: layerId ? snapTargets(layout, layerId) : undefined, rotation: target?.transform.rotation,
      angle: center ? Math.atan2(event.clientY - center.y, event.clientX - center.x) * 180 / Math.PI : undefined };
    if (kind === 'move') event.currentTarget.setPointerCapture(event.pointerId); else workspace.current?.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    const active = gesture.current;
    if (!active) return;
    const dx = (event.clientX - active.x) / zoom, dy = (event.clientY - active.y) / zoom;
    if (active.kind === 'pan') { setPan({ x: active.pan.x + dx * zoom, y: active.pan.y + dy * zoom }); return; }
    const t = active.transform;
    if (!t || !active.layerId) return;
    if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 3) return;
    active.moved = true;
    let transform: LayerTransform = t;
    let nextGuides: SnapGuide[] = [];
    if (active.kind === 'move') {
      const axis = event.shiftKey ? Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y' : undefined;
      transform = { ...t, x: axis === 'y' ? t.x : Math.round(t.x + dx), y: axis === 'x' ? t.y : Math.round(t.y + dy) };
      if (!event.ctrlKey && !event.metaKey && active.targets) {
        const snapped = snapMove(transform, active.targets, zoom, axis); transform = snapped.transform; nextGuides = snapped.guides;
      }
    }
    if (active.kind === 'resize') transform = resizeLayer(t, dx, dy, active.corner!, Boolean(active.document.layers.find(layer => layer.id === active.layerId)?.aspectLocked) !== event.shiftKey, event.altKey);
    if (active.kind === 'rotate' && active.center) {
      const angle = Math.atan2(event.clientY - active.center.y, event.clientX - active.center.x) * 180 / Math.PI;
      active.rotation = active.rotation! + angleDelta(active.angle!, angle); active.angle = angle;
      transform = { ...t, rotation: snapRotation(active.rotation, event.shiftKey, event.ctrlKey || event.metaKey) };
    }
    active.guides = nextGuides;
    const rect = workspace.current!.getBoundingClientRect();
    const text = active.kind === 'resize' ? `${Math.round(transform.width)} × ${Math.round(transform.height)}` : active.kind === 'rotate'
      ? `${Math.round(((transform.rotation % 360 + 360) % 360) * 10) / 10}°` : `${Math.round(transform.x)}, ${Math.round(transform.y)}`;
    active.feedback = { x: Math.max(8, Math.min(rect.width - 120, event.clientX - rect.left + 16)), y: Math.max(40, Math.min(rect.height - 80, event.clientY - rect.top + 20)), text };
    active.next = { ...active.document, layers: active.document.layers.map(layer => layer.id === active.layerId ? { ...layer, transform } : layer) };
    if (draftFrame.current === undefined) draftFrame.current = requestAnimationFrame(() => {
      draftFrame.current = undefined;
      if (gesture.current?.next) { onDraft(gesture.current.next); setGuides(gesture.current.guides ?? []); setFeedback(gesture.current.feedback); }
    });
  };
  const finish = (cancel = false) => {
    const active = gesture.current; gesture.current = undefined; setPanning(false); setGuides([]); setFeedback(undefined);
    if (draftFrame.current !== undefined) { cancelAnimationFrame(draftFrame.current); draftFrame.current = undefined; }
    if (active?.kind === 'pan' && graphics.active) return;
    const nextTransform = active?.next?.layers.find(item => item.id === active.layerId)?.transform;
    if (cancel || !active?.next || (nextTransform && active.transform && sameTransform(nextTransform, active.transform))) onDraft(undefined); else onChange(active.next);
  };
  const addAsset = (asset: FileAsset, point?: { x: number; y: number }) => {
    if (locked || document.layers.length >= MAX_COMPOSITOR_LAYERS) return;
    const next = createLayer(crypto.randomUUID(), asset.name, { kind: 'asset', asset });
    if (point) {
      const resolved = compositorLayout({ ...document, layers: [next] }, inputs, sizes).layers[0].transform;
      next.transform = { ...resolved, x: Math.round(point.x - resolved.width / 2), y: Math.round(point.y - resolved.height / 2) };
    }
    onChange({ ...document, layers: [...document.layers, next] }); setSelected(next.id);
  };
  const assets = useMemo(() => {
    const sources = nodes.filter(node => node.id !== id).flatMap(node => imageOutput(node, node.type === 'file' ? 'file' : 'result', nodes, edges));
    sources.push(...document.layers.flatMap(layer => { const asset = layerAsset(layer, inputs); return asset ? [asset] : []; }));
    return [...new Map(sources.map(asset => [asset.id, asset])).values()];
  }, [nodes, edges, id, document.layers, inputs]);
  return <div ref={root} role="dialog" aria-modal="true" aria-label="Compositor editor" data-compositor-editor className="compositor-editor nodrag nopan nowheel" tabIndex={-1}
    onPointerDownCapture={event => { if (graphics.active && !workspace.current?.contains(event.target as Node)) graphics.finish(); }}
    onKeyDownCapture={event => {
      const target = event.target as HTMLElement;
      if (event.nativeEvent.isComposing || !graphics.active || target === event.currentTarget || workspace.current?.contains(target)) return;
      if (event.key === 'Enter' || (event.key === ' ' && target.closest('button, input[type="checkbox"], [role="menuitem"]'))) {
        // Keyboard activation skips pointerdown. Commit before the control's
        // handler reads its document, keeping both history steps and its focus.
        flushSync(() => graphics.finish(false));
      }
    }}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onPaste={event => event.stopPropagation()}
    onKeyUp={event => { event.stopPropagation(); if (event.code === 'Space') setSpace(false); if (event.key === 'Shift' || event.key === 'Alt') graphics.modifiers(event.shiftKey, event.altKey); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setSpace(false); if (gesture.current) finish(true); if (graphics.isDragging()) graphics.cancel(); } }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      // Enter belongs to focused controls (including portaled menus). Canvas
      // shortcuts must not cancel native activation or finish a pen behind them.
      const target = event.target as HTMLElement;
      if (event.key === 'Enter' && target !== event.currentTarget && (
        !workspace.current?.contains(target)
        || target.closest('button, input, select, textarea, a[href], [role="button"], [role="menu"], [role="dialog"], [contenteditable="true"]')
      )) return;
      if (event.key === 'Tab') {
        const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter(item => item.offsetParent !== null);
        const current = controls.indexOf(window.document.activeElement as HTMLElement);
        if ((event.shiftKey && current <= 0) || (!event.shiftKey && (current === controls.length - 1 || current < 0))) { event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus(); }
        return;
      }
      const key = event.key.toLowerCase(), command = event.metaKey || event.ctrlKey;
      const editingText = (event.target as HTMLElement).closest('input[type="text"], input:not([type]), textarea');
      if (!editingText && (event.key === 'Shift' || event.key === 'Alt')) graphics.modifiers(event.shiftKey, event.altKey);
      if (!editingText && graphics.key(event.key)) { event.preventDefault(); return; }
      if (command && (key === 'z' || key === 'y') && !editingText) { event.preventDefault(); if (!locked) { if (graphics.active) { if (key === 'z' && !event.shiftKey && graphics.points.length) graphics.key('Backspace'); else graphics.cancel(); return; } finish(true); graphics.cancel(); setPathEditing(undefined); if (event.shiftKey || key === 'y') history.redo(); else history.undo(); } return; }
      if ((event.target as HTMLElement).closest('input, select, textarea')) return;
      if (command && key === 'd') { event.preventDefault(); duplicate(); return; }
      if (event.key === 'Escape') { event.preventDefault(); if (gesture.current) finish(true); else if (pathEditing) setPathEditing(undefined); else if (tool !== 'select') changeTool('select'); else if (selected) setSelected(undefined); else onClose(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); return; }
      if (!command && !event.altKey) {
        const shortcuts: Record<string, EditorTool> = { v: 'select', h: 'hand', t: 'text', p: 'pen', r: 'rectangle', o: 'ellipse' };
        if (shortcuts[key]) { event.preventDefault(); changeTool(shortcuts[key]); }
      }
      if (event.key === 'Enter') { event.preventDefault(); editContent(); }
      if (event.code === 'Space') { if ((event.target as HTMLElement).closest('button')) return; event.preventDefault(); setSpace(true); }
      if (command && key === '0') { event.preventDefault(); zoomAt(1); }
      else if (key === '0' || (event.shiftKey && (key === '1' || event.code === 'Digit1'))) { event.preventDefault(); fit(); }
      if (key === '+' || key === '=') { event.preventDefault(); zoomAt(zoom * 1.25); }
      if (key === '-') { event.preventDefault(); zoomAt(zoom / 1.25); }
      if (key.startsWith('arrow') && layer) { event.preventDefault(); const step = event.shiftKey ? 10 : 1; updateLayer({ transform: { ...layer.transform, x: layer.transform.x + (key === 'arrowright' ? step : key === 'arrowleft' ? -step : 0), y: layer.transform.y + (key === 'arrowdown' ? step : key === 'arrowup' ? -step : 0) } }); }
    }}>
    <nav className="comp-rail" aria-label="Editor navigation"><button aria-label="Close compositor" title="Back to workflow" onClick={() => { graphics.finish(); onClose(); }}><ChevronLeft size={16} /></button><div className="comp-rail-tabs">
      <button aria-label="Layers" aria-pressed={tab === 'layers'} onClick={() => setTab('layers')}><span className="comp-rail-icon"><List size={18} /></span><span>Layers</span></button>
      <button aria-label="Assets" aria-pressed={tab === 'assets'} onClick={() => setTab('assets')}><span className="comp-rail-icon"><Images size={16} /></span><span>Assets</span></button>
    </div></nav>
    <EditorSidebar key={tab} name={name} tab={tab} document={document} inputs={inputs} selected={selected} assets={assets} locked={locked} onSelect={value => { graphics.finish(); setPathEditing(undefined); setSelected(value); }}
      onChange={onChange} onDuplicate={duplicate} onRemove={remove} onAddAsset={addAsset} />
    <main ref={workspace} className={`comp-workspace${tool === 'hand' || space ? ' is-panning' : ''}${panning ? ' is-grabbing' : ''}${tool !== 'select' && tool !== 'hand' && !space ? ' is-drawing' : ''}${assetDrop ? ' is-asset-drop' : ''}`} aria-label="Composition workspace"
      onPointerDown={event => { if (event.target === event.currentTarget) { if (tool === 'hand' || space || event.button === 1) start(event, 'pan'); else if (tool !== 'select') { root.current?.focus(); graphics.down(event); } else { setSelected(undefined); setPathEditing(undefined); root.current?.focus(); } } }}
      onDoubleClick={event => { if (tool === 'pen') { event.preventDefault(); graphics.finishPen(); } }}
      onDragOver={event => { if (!locked && event.dataTransfer.types.includes(COMPOSITOR_ASSET_DRAG)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setAssetDrop(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setAssetDrop(false); }}
      onDrop={event => {
        setAssetDrop(false);
        const asset = assets.find(item => item.id === event.dataTransfer.getData(COMPOSITOR_ASSET_DRAG)), rect = board.current?.getBoundingClientRect();
        if (asset && rect) { event.preventDefault(); addAsset(asset, { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }); }
      }}
      onPointerMove={event => { if (gesture.current || !graphics.move(event)) move(event); }} onPointerUp={() => { if (gesture.current || !graphics.up()) finish(); }} onPointerCancel={() => { graphics.cancel(); finish(true); }} onLostPointerCapture={() => { if (gesture.current) finish(true); if (graphics.isDragging()) graphics.cancel(); }}>
      <div className="comp-workspace-status" aria-live="polite">{error ? <span className="comp-error">{error}</span> : previewing ? 'Editing…' : pending ? 'Rendering…' : <><Check size={12} />{view ? 'All changes applied' : 'Ready'}</>}</div>
      {/* Each repeating tile contains two squares: keep 32 square columns at every canvas size. */}
      <div ref={board} className="comp-artboard" style={{ width: layout.width, height: layout.height, backgroundSize: `${layout.width / 16}px ${layout.width / 16}px`, left: `calc(50% + ${pan.x}px)`, top: `calc(50% + ${pan.y}px)`, transform: `translate(-50%, -50%) scale(${zoom})` }}
        onPointerDownCapture={event => {
          if ((space || tool === 'hand' || event.button === 1) && !(event.target as HTMLElement).closest('.comp-text-editor')) { start(event, 'pan'); return; }
          if (!(event.target as HTMLElement).closest('.comp-text-editor, .comp-path-editor') && event.button === 0 && tool !== 'select') {
            const targetId = (event.target as HTMLElement).closest('[data-layer-id]')?.getAttribute('data-layer-id');
            const target = layout.layers.find(item => item.id === targetId);
            if (tool === 'text' && target?.source.kind === 'text' && !locked && !target.locked) { event.preventDefault(); event.stopPropagation(); setSelected(target.id); setTool('select'); beginText(target.id); return; }
            root.current?.focus(); graphics.down(event);
          }
        }}
        onDoubleClick={event => { if (tool === 'pen') { event.preventDefault(); graphics.finishPen(); } }}
        onPointerDown={event => { if (event.target === event.currentTarget || (event.target as HTMLElement).tagName === 'CANVAS') { if (tool === 'hand' || space || event.button === 1) start(event, 'pan'); else if (tool !== 'select') { root.current?.focus(); graphics.down(event); } else { setSelected(undefined); setPathEditing(undefined); root.current?.focus(); } } }}>
        <CompositorCanvas view={view} label="Composition canvas" />
        {layout.layers.filter(layer => layer.visible && (layer.asset || isGraphicSource(layer.source))).map(item => <div key={item.id} className={`comp-layer-hit${selected === item.id ? ' is-selected' : ''}${item.locked ? ' is-locked' : ''}`} role="button" data-layer-id={item.id} aria-label={`Canvas layer ${item.name}`} tabIndex={-1}
          style={{ left: item.transform.x, top: item.transform.y, width: item.transform.width, height: item.transform.height, transform: `rotate(${item.transform.rotation}deg)`, '--comp-hit-width': `${1 / zoom}px` } as CSSProperties}
          onPointerDown={event => start(event, 'move', item.id)} onDoubleClick={event => { event.stopPropagation(); if (tool === 'pen') graphics.finishPen(); if (!locked && !item.locked && tool === 'select') { if (item.source.kind === 'text') beginText(item.id); else if (item.source.kind === 'path') setPathEditing(item.id); } }} />)}
        {layer?.visible && (layer.asset || isGraphicSource(layer.source)) && !textEditing && !pathEditing && !graphics.active && <CanvasSelection layer={layer} zoom={zoom} disabled={locked || layer.locked}
          onResize={(event, handle) => start(event, 'resize', layer.id, handle)} onRotate={event => start(event, 'rotate', layer.id)} />}
        {graphics.bounds && <div className="comp-creation-outline" style={{ left: graphics.bounds.x, top: graphics.bounds.y, width: graphics.bounds.width, height: graphics.bounds.height, outlineWidth: 1 / zoom }}><span className="comp-creation-size" style={{ transform: `translateX(-50%) scale(${1 / zoom})`, marginTop: 8 / zoom }}>{Math.round(graphics.bounds.width)} × {Math.round(graphics.bounds.height)}</span></div>}
        {graphics.points.length > 0 && <svg className="comp-pen-preview" width={layout.width} height={layout.height}>
          <path d={pathCommands(graphics.points, false)} fill="none" stroke="var(--comp-selection-color)" strokeWidth={1 / zoom} />
          {graphics.pointer && <line x1={graphics.points[graphics.points.length - 1].x} y1={graphics.points[graphics.points.length - 1].y} x2={graphics.pointer.x} y2={graphics.pointer.y} stroke="var(--comp-selection-color)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} />}
          {graphics.points.map((point, index) => <g key={index}>{(['in', 'out'] as const).map(handle => point[handle] && <g key={handle}><line x1={point.x} y1={point.y} x2={point[handle].x} y2={point[handle].y} stroke="var(--comp-selection-color)" strokeWidth={1 / zoom} /><circle cx={point[handle].x} cy={point[handle].y} r={3 / zoom} fill="#fff" stroke="var(--comp-selection-color)" strokeWidth={1 / zoom} /></g>)}<rect x={point.x - 3 / zoom} y={point.y - 3 / zoom} width={6 / zoom} height={6 / zoom} fill="#fff" stroke="var(--comp-selection-color)" strokeWidth={1 / zoom} /></g>)}
        </svg>}
        {textLayer?.source.kind === 'text' && !locked && <TextLayerEditor key={textLayer.id} layer={textLayer} zoom={zoom} onDraft={text => { const next = changeText(text); if (next) onDraft(next); }} onFinish={text => {
          const next = changeText(text); if (next) onChange(next); setTextEditing(undefined); textBaseline.current = undefined; root.current?.focus();
        }} />}
        {pathEditing === layer?.id && layer?.source.kind === 'path' && !locked && !layer.locked && <PathEditor layer={layer} zoom={zoom} onDragging={value => { detailDragging.current = value; }} onDraft={patch => onDraft({ ...document, layers: document.layers.map(item => item.id === layer.id ? { ...item, ...patch } : item) })} onChange={updateLayer} onCancel={() => onDraft(undefined)} onDone={() => { setPathEditing(undefined); root.current?.focus(); }} />}
      </div>
      {guides.length > 0 && <svg className="comp-snap-guides" aria-label="Alignment guides" width={workspaceSize.width} height={workspaceSize.height}>
        {guides.map(guide => {
          const value = (guide.axis === 'x' ? workspaceSize.width / 2 + pan.x - layout.width * zoom / 2 : workspaceSize.height / 2 + pan.y - layout.height * zoom / 2) + guide.value * zoom;
          return <line key={guide.axis} data-axis={guide.axis} data-position={guide.value} x1={guide.axis === 'x' ? value : 0} y1={guide.axis === 'y' ? value : 0} x2={guide.axis === 'x' ? value : workspaceSize.width} y2={guide.axis === 'y' ? value : workspaceSize.height} />;
        })}
      </svg>}
      {feedback && <div className="comp-transform-feedback" style={{ left: feedback.x, top: feedback.y }}>{feedback.text}</div>}
      <EditorToolbar tool={tool} space={space} zoom={zoom} canUndo={(history.canUndo || graphics.active) && !locked} canRedo={history.canRedo && !locked && !graphics.active} disabled={locked || document.layers.length >= MAX_COMPOSITOR_LAYERS} onTool={changeTool}
        onUndo={() => { if (graphics.active) { if (graphics.points.length) graphics.key('Backspace'); else graphics.cancel(); return; } setPathEditing(undefined); finish(true); history.undo(); }} onRedo={() => { graphics.cancel(); setPathEditing(undefined); finish(true); history.redo(); }} onZoom={zoomAt} onFit={fit} />
      <div className="comp-workspace-hint">{feedback ? gesture.current?.kind === 'move' ? 'Shift constrain · Ctrl / ⌘ bypass snap' : gesture.current?.kind === 'resize' ? 'Shift ratio · Alt from center' : 'Shift 15° · Ctrl / ⌘ bypass snap' : tool === 'pen' ? 'Click to add points · Drag for curves · Enter finish · Esc cancel' : tool === 'text' ? 'Click or drag to add text' : tool !== 'select' && tool !== 'hand' ? 'Drag to draw · Shift constrain · Alt from center' : pathEditing ? 'Alt break handles · Shift constrain · Double-click curve to add point · Esc done' : `${layout.width} × ${layout.height}`}</div>
    </main>
    <CompositorProperties key={layer?.id ?? 'canvas'} document={document} size={layout} layer={layer} disabled={locked} onChange={onChange} onLayer={updateLayer} onEditContent={editContent}
      onCanvasDraft={fill => { if (!locked) onDraft({ ...document, canvas: { ...document.canvas, fill } }); }}
      onCancelDraft={() => onDraft(undefined)} onLayerDraft={patch => {
        if (!selected || locked || layer?.locked) return;
        onDraft({ ...document, layers: document.layers.map(item => item.id === selected ? { ...item, ...patch } : item) });
      }} />
  </div>;
}
