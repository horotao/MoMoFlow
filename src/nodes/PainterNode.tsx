import { NodePort } from './NodePort';
import { ToolNodeFrame, ToolbarIcon } from './ToolNodeFrame';
import { ToolbarPopover } from './ToolbarPopover';
import { CanvasHistoryContext } from '../components/useCanvasHistory';
import { isPainterNode } from './types';
import { useContext, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Circle, Download, Frame, LockKeyhole, Square, Star, Triangle, UnlockKeyhole } from 'lucide-react';
import type { AppNode, PainterNode as Painter, FileAsset } from './types';
import { isNodeLocked } from './types';
import { type PainterTool, type PainterShape, type PaintStroke, type PaintPoint, painterRevision } from './painter';
import { renderPainter, painterBlob } from './painterRender';
import { imageOutput } from './sunburstRun';
import { assetResources } from './assetResources';
import { downloadAsset } from './fileMedia';
import { PainterColorPicker } from './PainterColorPicker';
import { painterLivePreviews } from './painterLivePreview';

const shapes = { rectangle: Square, ellipse: Circle, triangle: Triangle, star: Star };
const shapeNames = { rectangle: '矩形', ellipse: '椭圆', triangle: '三角形', star: '星形' };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function Slider({ label, value, min = 0, max = 100, onChange, percent = false }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void; percent?: boolean }) {
  return <label className="painter-field"><span>{label}</span><input aria-label={`${label}滑块`} type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} /><input aria-label={label} type="number" min={min} max={max} value={value} onChange={e => onChange(clamp(Number(e.target.value), min, max))} /><span className="painter-unit">{percent ? '%' : ''}</span></label>;
}
function ColorField({ label, color, opacity, onColor, onOpacity }: { label: string; color: string; opacity: number; onColor: (value: string) => void; onOpacity: (value: number) => void }) {
  const [draft, setDraft] = useState(color.slice(1));
  useEffect(() => setDraft(color.slice(1)), [color]);
  return <div className="painter-field painter-color"><span>{label}</span><div className="painter-color-value"><PainterColorPicker label={label} color={color} opacity={opacity} onColor={onColor} onOpacity={onOpacity} /><input aria-label={label} value={draft.toUpperCase()} maxLength={6} onChange={e => { const next = e.target.value.replace(/[^0-9a-f]/gi, ''); setDraft(next); if (next.length === 6) onColor(`#${next}`); }} onBlur={() => setDraft(color.slice(1))} /></div><input aria-label={`${label}不透明度`} type="number" min="0" max="100" value={Math.round(opacity * 100)} onChange={e => onOpacity(clamp(Number(e.target.value), 0, 100) / 100)} /><span className="painter-unit">%</span></div>;
}

export function PainterNode({ id, data, isConnectable }: NodeProps<Painter>) {
  const history = useContext(CanvasHistoryContext);
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges(), internals = useUpdateNodeInternals();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? (inputEdge ? 'pending' : '');
  const [tool, setTool] = useState<PainterTool>('brush');
  const [shape, setShape] = useState<PainterShape>('rectangle');
  const [color, setColor] = useState('#ffffff');
  const [opacity, setOpacity] = useState(1), [size, setSize] = useState(30), [hardness, setHardness] = useState(100);
  const [eraser, setEraser] = useState({ opacity: 1, size: 30, hardness: 100 });
  const [aspectLocked, setAspectLocked] = useState(true);
  const [dimensions, setDimensions] = useState({ width: data.width, height: data.height });
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [cursor, setCursor] = useState<PaintPoint | null>(null);
  const surface = useRef<HTMLCanvasElement>(null), loadedImage = useRef<HTMLImageElement>();
  const draft = useRef<PaintStroke>(), frame = useRef<number>();
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
    if (inputEdge && !input) { painterLivePreviews.clear(id); setError('连接的图像输入尚无图片。'); surface.current?.getContext('2d')?.clearRect(0, 0, surface.current.width, surface.current.height); return; }
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
  const toolbar = <fieldset className="painter-controls node-painter-toolbar" disabled={Boolean(data.locked)}>
    <div className="node-toolbar-tool-group">
      <button type="button" title="画笔" aria-label="画笔" aria-pressed={tool === 'brush'} onClick={() => setTool('brush')}><ToolbarIcon name="brush" /></button>
      <button type="button" title="形状" aria-label="形状" aria-pressed={tool === 'shape'} onClick={() => setTool('shape')}>{shape === 'rectangle' ? <ToolbarIcon name="rectangle" /> : <ShapeIcon size={16} />}</button>
      <ToolbarPopover label="形状菜单" className="node-toolbar-chevron-button" disabled={Boolean(data.locked)} trigger={<ToolbarIcon name="chevron" />}>
        <div className="node-toolbar-shapes" role="group" aria-label="形状">{(Object.keys(shapes) as PainterShape[]).map(value => { const Icon = shapes[value]; return <button key={value} type="button" aria-pressed={shape === value} onClick={() => { setShape(value); setTool('shape'); }}><Icon size={16} />{shapeNames[value]}</button>; })}</div>
      </ToolbarPopover>
      <button type="button" title="橡皮擦" aria-label="橡皮擦" aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}><ToolbarIcon name="eraser" /></button>
    </div>
    <button type="button" disabled title="文字工具尚未提供" aria-label="文字工具尚未提供"><ToolbarIcon name="text" /></button>
    <span className="node-toolbar-separator" />
    <PainterColorPicker label="颜色" color={color} opacity={opacity} disabled={Boolean(data.locked) || tool === 'eraser'} onColor={setColor} onOpacity={setOpacity} />
    <ToolbarPopover label="画笔设置" disabled={Boolean(data.locked)} trigger={<>大小<ToolbarIcon name="chevron" /></>}>
      <div className="painter-fields">
        <Slider label="不透明度" value={Math.round(controls.opacity * 100)} percent onChange={value => tool === 'eraser' ? setEraser(current => ({ ...current, opacity: value / 100 })) : setOpacity(value / 100)} />
        {tool !== 'shape' && <><Slider label="大小" min={1} value={controls.size} max={500} onChange={value => tool === 'eraser' ? setEraser(current => ({ ...current, size: value })) : setSize(value)} /><Slider label="硬度" value={controls.hardness} percent onChange={value => tool === 'eraser' ? setEraser(current => ({ ...current, hardness: value })) : setHardness(value)} /></>}
      </div>
    </ToolbarPopover>
    <input className="painter-quick-size" aria-label="大小滑块" type="range" min={1} max={500} value={controls.size} disabled={Boolean(data.locked) || tool === 'shape' || tool === 'canvas'} onChange={event => tool === 'eraser' ? setEraser(current => ({ ...current, size: Number(event.target.value) })) : setSize(Number(event.target.value))} />
    <span className="node-toolbar-separator" />
    <button type="button" aria-label="撤销" title="撤销画布操作" disabled={Boolean(data.locked) || !history.canUndo} onClick={history.undo}><ToolbarIcon name="undo" /></button>
    <button type="button" aria-label="重做" title="重做画布操作" disabled={Boolean(data.locked) || !history.canRedo} onClick={history.redo}><ToolbarIcon name="redo" /></button>
    <ToolbarPopover label="画布" disabled={Boolean(data.locked)} trigger={<Frame size={16} />} onOpen={() => setTool('canvas')}>
      <div className="painter-fields">
        <ColorField label="背景色" color={data.background} opacity={data.backgroundOpacity} onColor={value => patch({ background: value })} onOpacity={value => patch({ backgroundOpacity: value })} />
        <div className="painter-dimensions"><span>尺寸</span><label>宽<input aria-label="宽度" type="number" min="1" max="8192" disabled={Boolean(inputEdge || input)} value={inputEdge || input ? dimensions.width : data.width} onChange={e => setDimension('width', Number(e.target.value))} /></label><label>高<input aria-label="高度" type="number" min="1" max="8192" disabled={Boolean(inputEdge || input)} value={inputEdge || input ? dimensions.height : data.height} onChange={e => setDimension('height', Number(e.target.value))} /></label><button type="button" aria-label="锁定宽高比" title="锁定宽高比" aria-pressed={aspectLocked} disabled={Boolean(inputEdge || input)} onClick={() => setAspectLocked(value => !value)}>{aspectLocked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}</button></div>
        <button className="painter-reset" type="button" onClick={() => patch({ strokes: [] })} disabled={!data.strokes.length || Boolean(data.locked)}>重置</button>
      </div>
    </ToolbarPopover>
  </fieldset>;
  return <ToolNodeFrame id={id} label={data.label} defaultLabel="绘图" type="PAINTER" locked={data.locked} toolbar={toolbar}>
    <div data-tool={tool} className={`painter-preview nodrag nopan nowheel${tool === 'canvas' || data.locked ? ' is-passive' : ''}`} style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}>
      <canvas ref={surface} aria-label="绘图画布" tabIndex={0}
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
      <div className="painter-preview-info"><span>{dimensions.width}×{dimensions.height}</span><button type="button" aria-label="下载结果" title="下载结果" disabled={!data.result || data.outputRevision !== revision} onClick={() => { if (data.result) void downloadAsset(data.result).catch(() => setError('下载失败，请重试。')); }}><Download size={15} /></button></div>
    </div>
    {error && <div className="painter-error" role="alert">{error}</div>}
    {[{ handle: 'image', label: '图像', output: false }, { handle: 'result', label: '结果', output: true }, { handle: 'mask', label: '遮罩', output: true }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <NodePort key={port.handle} id={port.handle} direction={port.output ? 'source' : 'target'}
        label={`${port.label}${port.output ? '输出' : '输入'}`} connected={connected} isConnectable={isConnectable && !data.locked} />;
    })}
  </ToolNodeFrame>;
}
