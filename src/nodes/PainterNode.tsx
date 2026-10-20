import { isPainterNode } from './types';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Brush, ChevronDown, Circle, Download, Ellipsis, Eraser, Frame, LockKeyhole, Paintbrush, Square, Star, Triangle, UnlockKeyhole } from 'lucide-react';
import type { AppNode, PainterNode as Painter, FileAsset } from './types';
import { isNodeLocked } from './types';
import { type PainterTool, type PainterShape, type PaintStroke, type PaintPoint, painterRevision } from './painter';
import { renderPainter, painterBlob } from './painterRender';
import { imageOutput } from './sunburstRun';
import { assetResources } from './assetResources';
import { downloadAsset } from './fileMedia';
import { TextNodeMenu } from './TextNodeMenu';
import { PainterColorPicker } from './PainterColorPicker';
import { painterLivePreviews } from './painterLivePreview';

const shapes = { rectangle: Square, ellipse: Circle, triangle: Triangle, star: Star };
const shapeNames = { rectangle: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', star: 'Star' };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function Slider({ label, value, max = 100, onChange, percent = false }: { label: string; value: number; max?: number; onChange: (value: number) => void; percent?: boolean }) {
  return <label className="painter-field"><span>{label}</span><input aria-label={`${label} slider`} type="range" min={label === 'Size' ? 1 : 0} max={max} value={value} onChange={e => onChange(Number(e.target.value))} /><input aria-label={label} type="number" min={label === 'Size' ? 1 : 0} max={max} value={value} onChange={e => onChange(clamp(Number(e.target.value), label === 'Size' ? 1 : 0, max))} /><span className="painter-unit">{percent ? '%' : ''}</span></label>;
}
function ColorField({ label, color, opacity, onColor, onOpacity }: { label: string; color: string; opacity: number; onColor: (value: string) => void; onOpacity: (value: number) => void }) {
  const [draft, setDraft] = useState(color.slice(1));
  useEffect(() => setDraft(color.slice(1)), [color]);
  return <div className="painter-field painter-color"><span>{label}</span><div className="painter-color-value"><PainterColorPicker label={label} color={color} opacity={opacity} onColor={onColor} onOpacity={onOpacity} /><input aria-label={label} value={draft.toUpperCase()} maxLength={6} onChange={e => { const next = e.target.value.replace(/[^0-9a-f]/gi, ''); setDraft(next); if (next.length === 6) onColor(`#${next}`); }} onBlur={() => setDraft(color.slice(1))} /></div><input aria-label={`${label} opacity`} type="number" min="0" max="100" value={Math.round(opacity * 100)} onChange={e => onOpacity(clamp(Number(e.target.value), 0, 100) / 100)} /><span className="painter-unit">%</span></div>;
}

export function PainterNode({ id, data, isConnectable }: NodeProps<Painter>) {
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges(), internals = useUpdateNodeInternals();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? (inputEdge ? 'pending' : '');
  const [tool, setTool] = useState<PainterTool>('brush');
  const [shape, setShape] = useState<PainterShape>('rectangle');
  const [shapeMenu, setShapeMenu] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [opacity, setOpacity] = useState(1), [size, setSize] = useState(30), [hardness, setHardness] = useState(100);
  const [eraser, setEraser] = useState({ opacity: 1, size: 30, hardness: 100 });
  const [aspectLocked, setAspectLocked] = useState(true);
  const [dimensions, setDimensions] = useState({ width: data.width, height: data.height });
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [cursor, setCursor] = useState<PaintPoint | null>(null);
  const surface = useRef<HTMLCanvasElement>(null), loadedImage = useRef<HTMLImageElement>();
  const draft = useRef<PaintStroke>(), frame = useRef<number>();
  const menu = useRef<HTMLDivElement>(null);
  const current = useRef({ data, inputId }); current.current = { data, inputId };
  const revision = painterRevision(data, inputId);
  const patch = (value: Partial<Painter['data']>) => {
    if (!isNodeLocked(getNode(id))) updateNodeData(id, value);
  };
  const show = (rendered: ReturnType<typeof renderPainter>) => {
    const element = surface.current; if (!element) return;
    element.width = rendered.width; element.height = rendered.height;
    element.getContext('2d')?.drawImage(rendered.result, 0, 0);
    painterLivePreviews.publish(id, {
      result: rendered.result, mask: rendered.mask, drawing: Boolean(draft.current),
      width: loadedImage.current?.naturalWidth || current.current.data.width,
      height: loadedImage.current?.naturalHeight || current.current.data.height,
    });
  };
  useEffect(() => {
    let cancelled = false;
    draft.current = undefined;
    if (frame.current) cancelAnimationFrame(frame.current);
    const previousImage = loadedImage.current;
    setReady(false); setError(''); loadedImage.current = undefined;
    if (inputEdge && !input) { painterLivePreviews.clear(id); setError('连接的 Image 尚无图片。'); surface.current?.getContext('2d')?.clearRect(0, 0, surface.current.width, surface.current.height); return; }
    async function render() {
      try {
        let image: HTMLImageElement | undefined;
        if (input) {
          if (previousImage?.src === input.url && previousImage.complete && previousImage.naturalWidth) image = previousImage;
          else {
            image = new Image(); image.crossOrigin = 'anonymous'; image.src = input.url;
            await image.decode();
          }
        }
        if (cancelled) return;
        loadedImage.current = image;
        show(renderPainter(current.current.data, image, undefined, 1024));
        setDimensions({ width: image?.naturalWidth || current.current.data.width, height: image?.naturalHeight || current.current.data.height }); setReady(true);
        const node = getNode(id);
        if (!isPainterNode(node) || node.data.locked || node.data.outputRevision === revision) return;
        const rendered = renderPainter(current.current.data, image);
        const blobs = await Promise.all([rendered.result, rendered.mask, rendered.alphaMask].map(painterBlob));
        if (cancelled) return;
        const latest = getNode(id);
        const graph = getNodes(), connections = getEdges();
        const edge = connections.find(e => e.target === id && e.targetHandle === 'image');
        const source = edge ? imageOutput(graph.find(n => n.id === edge.source), edge.sourceHandle, graph, connections)[0] : (isPainterNode(latest) ? latest.data.baseImage : undefined);
        if (!isPainterNode(latest) || latest.data.locked || painterRevision(latest.data, source?.id ?? (edge ? 'pending' : '')) !== revision) return;
        const assets = blobs.map((blob, index): FileAsset => ({ id: crypto.randomUUID(), kind: 'image', name: `Painter-${['Result', 'Mask', 'Alpha'][index]}.png`, url: assetResources.create(blob), size: blob.size, width: rendered.width, height: rendered.height }));
        updateNodeData(id, { result: assets[0], mask: assets[1], alphaMask: assets[2], outputRevision: revision });
      } catch { if (!cancelled) { painterLivePreviews.clear(id); setReady(false); setError('无法读取或导出图片，请检查图片是否允许跨域访问。'); } }
    }
    void render();
    return () => { cancelled = true; if (frame.current) cancelAnimationFrame(frame.current); painterLivePreviews.clear(id); };
  // Derived output assets are intentionally excluded: exporting must not trigger itself.
  }, [id, revision, input?.url, Boolean(inputEdge), data.locked, getNode, getNodes, getEdges, updateNodeData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => internals(id), [id, tool, dimensions, internals]);
  useEffect(() => {
    if (!shapeMenu) return;
    const close = (event: globalThis.PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setShapeMenu(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [shapeMenu]);
  const point = (event: PointerEvent<HTMLCanvasElement>): PaintPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  };
  const preview = () => { if (frame.current) cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(() => show(renderPainter(data, loadedImage.current, draft.current, 1024))); };
  const cancelStroke = () => { draft.current = undefined; if (frame.current) cancelAnimationFrame(frame.current); if (ready) show(renderPainter(data, loadedImage.current, undefined, 1024)); };
  const shapeIcon = shapes[shape];
  const ShapeIcon = shapeIcon;
  const controls = tool === 'eraser' ? eraser : { opacity, size, hardness };
  const setDimension = (key: 'width' | 'height', value: number) => {
    const next = clamp(Math.round(value), 1, 8192);
    const other = key === 'width' ? 'height' : 'width';
    patch({ [key]: next, ...(aspectLocked ? { [other]: clamp(Math.round(data[other] * next / data[key]), 1, 8192) } : {}) });
  };
  return <>
    <header className="text-node-header"><div className="text-node-title"><Paintbrush size={18} strokeWidth={1.3} />{renaming ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={e => setName(e.target.value)} onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span>{data.label || 'Painter'}</span>}</div><TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || 'Painter'); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu></header>
    <div data-tool={tool} className={`painter-preview nodrag nopan nowheel${tool === 'canvas' || data.locked ? ' is-passive' : ''}`} style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}>
      <canvas ref={surface} aria-label="Painter drawing canvas" tabIndex={0}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancelStroke(); } }}
        onPointerDown={event => {
          if (event.button !== 0 || !ready || tool === 'canvas' || isNodeLocked(getNode(id))) return;
          event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
          draft.current = { tool: tool === 'shape' ? shape : tool, color, opacity: controls.opacity, size: controls.size / dimensions.width, hardness: controls.hardness / 100, points: [point(event)] };
          preview();
        }}
        onPointerMove={event => {
          const next = point(event); setCursor(next);
          if (!draft.current) return;
          if (['brush', 'eraser'].includes(draft.current.tool)) draft.current.points.push(next); else draft.current.points = [draft.current.points[0], next];
          preview();
        }}
        onPointerUp={event => {
          const stroke = draft.current; if (!stroke) return;
          draft.current = undefined; if (frame.current) cancelAnimationFrame(frame.current);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (isNodeLocked(getNode(id))) { cancelStroke(); return; }
          const latest = getNode(id); if (isPainterNode(latest)) patch({ strokes: [...latest.data.strokes, stroke] });
        }} onPointerCancel={cancelStroke} onLostPointerCapture={() => { if (draft.current) cancelStroke(); }} onPointerLeave={() => setCursor(null)} />
      {cursor && (tool === 'brush' || tool === 'eraser') && !data.locked && <span className="painter-cursor" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%`, width: `${controls.size / dimensions.width * 100}%`, aspectRatio: '1' }} />}
      <div className="painter-preview-info"><span>{dimensions.width}×{dimensions.height}</span><button type="button" aria-label="Download result" title="Download result" disabled={!data.result || data.outputRevision !== revision} onClick={() => { if (data.result) void downloadAsset(data.result).catch(() => setError('下载失败，请重试。')); }}><Download size={15} /></button></div>
    </div>
    <fieldset className="painter-controls nodrag nopan nowheel" disabled={Boolean(data.locked)}>
      <div className="painter-toolbar"><div role="toolbar" aria-label="Painter tools">
        <button type="button" title="Canvas" aria-label="Canvas" aria-pressed={tool === 'canvas'} onClick={() => setTool('canvas')}><Frame size={17} /></button>
        <button type="button" title="Brush" aria-label="Brush" aria-pressed={tool === 'brush'} onClick={() => setTool('brush')}><Brush size={18} /></button>
        <div className="painter-shapes" ref={menu} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setShapeMenu(false); } }}><button type="button" title="Shape" aria-label="Shape" aria-pressed={tool === 'shape'} onClick={() => setTool('shape')}><ShapeIcon size={16} /></button><button type="button" className="painter-shapes-trigger" aria-label="Shapes menu" aria-haspopup="menu" aria-expanded={shapeMenu} onClick={() => setShapeMenu(value => !value)}><ChevronDown size={12} /></button>
          {shapeMenu && <div className="painter-shapes-menu" role="menu">{(Object.keys(shapes) as PainterShape[]).map(value => { const Icon = shapes[value]; return <button type="button" role="menuitemradio" aria-checked={shape === value} key={value} onClick={() => { setShape(value); setTool('shape'); setShapeMenu(false); }}><Icon size={16} /><span>{shapeNames[value]}</span></button>; })}</div>}
        </div><button type="button" title="Eraser" aria-label="Eraser" aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}><Eraser size={17} /></button>
      </div><button className="painter-reset" type="button" onClick={() => patch({ strokes: [] })} disabled={!data.strokes.length}>Reset</button></div>
      <div className="painter-fields">{tool === 'canvas' ? <>
        <ColorField label="Background color" color={data.background} opacity={data.backgroundOpacity} onColor={value => patch({ background: value })} onOpacity={value => patch({ backgroundOpacity: value })} />
        <div className="painter-dimensions"><span>Dimensions</span><label>W<input aria-label="Width" type="number" min="1" max="8192" disabled={Boolean(inputEdge || input)} value={inputEdge || input ? dimensions.width : data.width} onChange={e => setDimension('width', Number(e.target.value))} /></label><label>H<input aria-label="Height" type="number" min="1" max="8192" disabled={Boolean(inputEdge || input)} value={inputEdge || input ? dimensions.height : data.height} onChange={e => setDimension('height', Number(e.target.value))} /></label><button type="button" aria-label="Lock aspect ratio" title="Lock aspect ratio" aria-pressed={aspectLocked} disabled={Boolean(inputEdge || input)} onClick={() => setAspectLocked(value => !value)}>{aspectLocked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}</button></div>
      </> : <>
        {tool === 'eraser' ? <Slider label="Opacity" value={Math.round(eraser.opacity * 100)} percent onChange={value => setEraser(current => ({ ...current, opacity: value / 100 }))} /> : <ColorField label="Color" color={color} opacity={opacity} onColor={setColor} onOpacity={setOpacity} />}
        {tool !== 'shape' && <><Slider label="Size" value={controls.size} max={500} onChange={value => tool === 'eraser' ? setEraser(current => ({ ...current, size: value })) : setSize(value)} /><Slider label="Hardness" value={controls.hardness} percent onChange={value => tool === 'eraser' ? setEraser(current => ({ ...current, hardness: value })) : setHardness(value)} /></>}
      </>}</div>
    </fieldset>
    {error && <div className="painter-error" role="alert">{error}</div>}
    {[{ handle: 'image', label: 'Image', output: false, y: 89 }, { handle: 'result', label: 'Result', output: true, y: 89 }, { handle: 'mask', label: 'Mask', output: true, y: 149 }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}><span className={`describer-port-label${port.output ? ' output-label' : ''} sunburst-label-${port.handle === 'mask' ? 'mask' : 'image'}`} style={{ top: port.y - 28 }}>{port.label}</span><Handle id={port.handle} type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} aria-label={`${port.label} ${port.output ? 'output' : 'input'}`} className={`describer-port sunburst-port-${port.handle === 'mask' ? 'mask' : 'image'}${connected ? ' is-connected' : ''}`} style={{ top: port.y }} isConnectable={isConnectable && !data.locked && (port.output || !connected)} /></div>;
    })}
  </>;
}
