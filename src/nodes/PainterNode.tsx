import { isPainterNode } from './types';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Download, LockKeyhole } from 'lucide-react';
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
import { NodeFrame, NodeHeader } from './shared/NodeFrame';
import { NodePort } from './shared/NodePort';
import { NodeRangeInput } from './shared/NodeRangeInput';
import { PainterShapeSelect } from './PainterShapeSelect';
import './shared/mediaNodeStyle.css';
import './PainterNode.css';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function Slider({ label, value, min = 0, max = 100, onChange, percent = false }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void; percent?: boolean }) {
  return <label className="painter-field"><span>{label}</span><NodeRangeInput aria-label={`${label}滑块`} min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} /><input aria-label={label} type="number" min={min} max={max} value={value} onChange={e => onChange(clamp(Number(e.target.value), min, max))} /><span className="painter-unit">{percent ? '%' : ''}</span></label>;
}
function ColorField({ label, color, opacity, disabled, onColor, onOpacity }: { label: string; color: string; opacity: number; disabled?: boolean; onColor: (value: string) => void; onOpacity: (value: number) => void }) {
  const [draft, setDraft] = useState(color.slice(1));
  useEffect(() => setDraft(color.slice(1)), [color]);
  return <div className="painter-field painter-color"><span>{label}</span><div className="painter-color-value"><PainterColorPicker label={label} color={color} opacity={opacity} disabled={disabled} onColor={onColor} onOpacity={onOpacity} /><input aria-label={label} value={draft.toUpperCase()} maxLength={6} onChange={e => { const next = e.target.value.replace(/[^0-9a-f]/gi, ''); setDraft(next); if (next.length === 6) onColor(`#${next}`); }} onBlur={() => setDraft(color.slice(1))} /></div><input aria-label={`${label}不透明度`} type="number" min="0" max="100" value={Math.round(opacity * 100)} onChange={e => onOpacity(clamp(Number(e.target.value), 0, 100) / 100)} /><span className="painter-unit">%</span></div>;
}

export function PainterNode({ id, data, isConnectable }: NodeProps<Painter>) {
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
  const [dimensions, setDimensions] = useState({ width: data.width, height: data.height });
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [cursor, setCursor] = useState<PaintPoint | null>(null);
  const surface = useRef<HTMLCanvasElement>(null), loadedImage = useRef<HTMLImageElement>();
  const draft = useRef<PaintStroke>(), frame = useRef<number>();
  const cancelRename = useRef(false);
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
  const controls = tool === 'eraser' ? eraser : { opacity, size, hardness };
  return <NodeFrame className="media-node-frame painter-node-frame">
    <NodeHeader icon={<img src="/painter-node/brush.svg" width={18} height={18} alt="" />} title={
      renaming ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" maxLength={100}
        value={name} onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)}
        onBlur={() => { if (!cancelRename.current && name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
        onKeyDown={event => {
          event.stopPropagation(); if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { cancelRename.current = true; event.currentTarget.blur(); }
        }} /> : <span>{data.label || '绘图'}</span>}
      status={data.locked && <LockKeyhole size={12} aria-label="已锁定" />}
      actions={<TextNodeMenu id={id} appearance="shared" locked={Boolean(data.locked)} onRename={() => {
        cancelRename.current = false; setName(data.label || '绘图'); setRenaming(true);
      }}><img src="/node-style/more.svg" width={18} height={18} alt="" className="node-monochrome" /></TextNodeMenu>} />
    <div data-tool={tool} className={`painter-preview nodrag nopan nowheel${data.locked ? ' is-passive' : ''}`} style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}>
      <canvas ref={surface} aria-label="绘图画布" tabIndex={0}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancelStroke(); } }}
        onPointerDown={event => {
          if (event.button !== 0 || !ready || isNodeLocked(getNode(id))) return;
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
    <fieldset className="painter-controls nodrag nopan nowheel" disabled={Boolean(data.locked)}>
      <div className="painter-toolbar"><div role="toolbar" aria-label="绘图工具">
        <button type="button" title="画笔" aria-label="画笔" aria-pressed={tool === 'brush'} onClick={() => setTool('brush')}>
          <img src={`/painter-node/brush${tool === 'brush' ? '-active' : ''}.svg`} width={18} height={18} alt="" />
        </button>
        <PainterShapeSelect shape={shape} active={tool === 'shape'} disabled={data.locked} onActivate={() => setTool('shape')}
          onChange={value => { setShape(value); setTool('shape'); }} />
        <button type="button" title="橡皮擦" aria-label="橡皮擦" aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}>
          <img src={`/painter-node/eraser${tool === 'eraser' ? '-active' : ''}.svg`} width={18} height={18} alt="" />
        </button>
      </div><button className="painter-reset" type="button" onClick={() => patch({ strokes: [] })} disabled={data.locked || !data.strokes.length}>重置</button></div>
      <div className="painter-fields">
        {tool === 'eraser' ? <Slider label="不透明度" value={Math.round(eraser.opacity * 100)} percent onChange={value => setEraser(current => ({ ...current, opacity: value / 100 }))} /> : <ColorField label="颜色" disabled={data.locked} color={color} opacity={opacity} onColor={setColor} onOpacity={setOpacity} />}
        {tool !== 'shape' && <>
          <Slider label="大小" min={1} value={controls.size} max={500} onChange={value => tool === 'eraser' ? setEraser(current => ({ ...current, size: value })) : setSize(value)} />
          <Slider label="硬度" value={controls.hardness} onChange={value => tool === 'eraser' ? setEraser(current => ({ ...current, hardness: value })) : setHardness(value)} />
        </>}
      </div>
    </fieldset>
    {error && <div className="painter-error" role="alert">{error}</div>}
    {[{ handle: 'image', label: '图像', output: false, y: 89 }, { handle: 'result', label: '结果', output: true, y: 89 }, { handle: 'mask', label: '遮罩', output: true, y: 149 }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className={`media-port-${port.handle === 'mask' ? 'mask' : 'image'}`} key={port.handle}>
        <NodePort label={port.handle === 'image' ? 'Image' : port.handle === 'result' ? 'Result' : 'Mask'} id={port.handle}
          type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} top={port.y}
          isConnectable={isConnectable && !data.locked}>
          <img src={`/image-node/port-${port.handle === 'mask' ? 'mask' : 'image'}.svg`} width={32} height={32} alt="" />
          {connected && <span className="media-port-dot" />}
        </NodePort>
      </div>;
    })}
  </NodeFrame>;
}
