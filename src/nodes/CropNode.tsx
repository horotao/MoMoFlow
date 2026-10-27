import { NodeIcon } from './NodeIcon';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis, LockKeyhole, UnlockKeyhole } from 'lucide-react';
import { DescriberModelSelect } from '../components/DescriberModelSelect';
import type { AppNode, CropNode as CropNodeType, FileAsset } from './types';
import { isCropNode, isNodeLocked } from './types';
import { cropPixels, cropRatioLabel, cropRatios, cropRevision, dragCrop, fitCropRatio, fullCrop, resizeCropDimension, type CropHandle, type CropRect } from './crop';
import { imageOutput } from './sunburstRun';
import { assetResources } from './assetResources';
import { cropLivePreviews } from './cropLivePreview';
import { TextNodeMenu } from './TextNodeMenu';

function renderCrop(image: HTMLImageElement, rect: CropRect, maxEdge = Infinity) {
  const pixels = cropPixels(rect, image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, maxEdge / Math.max(pixels.width, pixels.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pixels.width * scale)); canvas.height = Math.max(1, Math.round(pixels.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建裁剪画布。');
  ctx.drawImage(image, pixels.x, pixels.y, pixels.width, pixels.height, 0, 0, canvas.width, canvas.height);
  return { canvas, width: pixels.width, height: pixels.height };
}
function Dimension({ axis, value, max, disabled, onCommit }: { axis: 'width' | 'height'; value: number; max: number; disabled: boolean; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  return <label className="crop-dimension"><span>{axis === 'width' ? '宽' : '高'}</span><input type="number" aria-label={axis === 'width' ? '裁剪宽度' : '裁剪高度'} min={1} max={max} step={1}
    disabled={disabled} value={draft} onChange={event => setDraft(event.target.value)}
    onBlur={() => { if (cancelled.current) { cancelled.current = false; setDraft(String(value)); return; } setDraft(String(value)); if (draft.trim() && Number.isFinite(Number(draft)) && Number(draft) >= 1) onCommit(Number(draft)); }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelled.current = true; setDraft(String(value)); event.currentTarget.blur(); } }} /></label>;
}
export function CropNode({ id, data, isConnectable }: NodeProps<CropNodeType>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const internals = useUpdateNodeInternals();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? '';
  const revision = cropRevision(data, inputId);
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement }>();
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<CropRect>();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; width: number; height: number; rect: CropRect; next: CropRect; handle: CropHandle }>();
  const frame = useRef<number>();
  const image = loaded?.url === input?.url ? loaded?.image : undefined;
  const width = image?.naturalWidth ?? input?.width ?? 1024, height = image?.naturalHeight ?? input?.height ?? 1024;
  const rect = draft ?? data.rect, pixels = cropPixels(rect, width, height);
  const enabled = Boolean(image) && !data.locked;
  const patch = (value: Partial<CropNodeType['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  const clearGesture = () => { gesture.current = undefined; setDraft(undefined); if (frame.current) cancelAnimationFrame(frame.current); cropLivePreviews.clear(id); };

  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined); setError('');
    if (!input?.url) return;
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = input.url;
    void img.decode().then(() => { if (!cancelled) setLoaded({ url: input.url, image: img }); })
      .catch(() => { if (!cancelled) setError('无法读取图片，请检查图片是否允许跨域访问。'); });
    return () => { cancelled = true; };
  }, [input?.url]);

  useEffect(() => {
    let cancelled = false;
    clearGesture();
    if (!image || !inputId) return;
    async function exportImage() {
      try {
        setError('');
        const latest = getNode(id);
        if (!isCropNode(latest) || latest.data.locked || latest.data.outputRevision === revision) return;
        const output = renderCrop(image!, data.rect);
        const blob = await new Promise<Blob>((resolve, reject) => output.canvas.toBlob(value => value ? resolve(value) : reject(new Error('导出失败')), 'image/png'));
        if (cancelled) return;
        const node = getNode(id), graph = getNodes(), connections = getEdges();
        if (!isCropNode(node)) return;
        const edge = connections.find(e => e.target === id && e.targetHandle === 'image');
        const source = edge ? imageOutput(graph.find(n => n.id === edge.source), edge.sourceHandle, graph, connections)[0] : node.data.baseImage;
        if (node.data.locked || !source || cropRevision(node.data, source.id) !== revision) return;
        const result: FileAsset = { id: crypto.randomUUID(), name: 'Crop.png', kind: 'image', url: assetResources.create(blob), size: blob.size, width: output.width, height: output.height };
        updateNodeData(id, { result, outputRevision: revision });
      } catch { if (!cancelled) setError('无法导出裁剪图片，请检查图片是否允许跨域访问。'); }
    }
    void exportImage();
    return () => { cancelled = true; if (frame.current) cancelAnimationFrame(frame.current); cropLivePreviews.clear(id); };
  // Exported assets are derived from the revision and must not trigger another export.
  }, [id, revision, image, data.locked, getNode, getNodes, getEdges, updateNodeData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => internals(id), [id, width, height, internals]);

  const start = (event: PointerEvent<HTMLElement>, handle: CropHandle) => {
    if (!enabled || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = surface.current!.getBoundingClientRect();
    gesture.current = { x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height, rect: data.rect, next: data.rect, handle };
    surface.current!.focus(); surface.current!.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !enabled) return;
    g.next = dragCrop(g.rect, g.handle, (event.clientX - g.x) / g.width, (event.clientY - g.y) / g.height, data.aspectLocked, width, height);
    setDraft(g.next);
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { if (gesture.current && image) cropLivePreviews.publish(id, renderCrop(image, gesture.current.next, 1024)); });
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current; if (!g) return;
    patch({ rect: g.next }); clearGesture();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const label = cropRatioLabel(rect, width, height, data.aspectLocked);
  return <>
    <header className="text-node-header">
      <div className="text-node-title"><NodeIcon nodeType="crop" size={18} />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || '裁剪'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || '裁剪'); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu>
    </header>
    <div className={`crop-surface nodrag nopan nowheel${enabled ? '' : ' is-passive'}`} ref={surface} style={{ aspectRatio: input ? `${width} / ${height}` : '1' }}
      tabIndex={0} aria-label="图片裁剪区域" onPointerMove={move} onPointerUp={finish} onPointerCancel={clearGesture} onLostPointerCapture={() => { if (gesture.current) clearGesture(); }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); clearGesture(); } }}>
      {image && <><img src={input!.url} alt="裁剪原图" draggable={false} />
        <svg className="crop-shade" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <path fillRule="evenodd" d={`M0 0H1V1H0Z M${rect.x} ${rect.y}h${rect.width}v${rect.height}h${-rect.width}Z`} />
        </svg>
        <div className="crop-selection" aria-label="移动裁剪选区" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} onPointerDown={event => start(event, 'move')}>
          <div className="crop-grid"><i /><i /><i /><i /></div>
          {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map(handle => <div key={handle} className={`crop-handle crop-handle-${handle}`} aria-label={`调整裁剪选区${{ nw: '左上角', n: '上边', ne: '右上角', e: '右边', se: '右下角', s: '下边', sw: '左下角', w: '左边' }[handle]}`} onPointerDown={event => start(event, handle)} />)}
        </div></>}
    </div>
    <div className="crop-settings nodrag nopan nowheel" onKeyDown={event => event.stopPropagation()}>
      <div className="crop-setting-row"><span>宽高比</span><div className="crop-ratio">
        <DescriberModelSelect compact label="宽高比" menuLabel="预设宽高比" value={label} choices={cropRatios} includeCurrentValue={false} disabled={!enabled}
          onChange={ratio => { const [w, h] = ratio.split(':').map(Number); patch({ rect: fitCropRatio(fullCrop, w / h, width, height), aspectLocked: true }); }} />
      </div><button className="crop-reset" type="button" disabled={!enabled} onClick={() => patch({ rect: { ...fullCrop }, aspectLocked: false })}>重置</button></div>
      <div className="crop-setting-row"><span>尺寸</span><div className="crop-dimensions">
        <Dimension axis="width" value={pixels.width} max={width} disabled={!enabled} onCommit={value => patch({ rect: resizeCropDimension(data.rect, 'width', value, width, height, data.aspectLocked) })} />
        <Dimension axis="height" value={pixels.height} max={height} disabled={!enabled} onCommit={value => patch({ rect: resizeCropDimension(data.rect, 'height', value, width, height, data.aspectLocked) })} />
        <button type="button" role="checkbox" aria-checked={data.aspectLocked} aria-label="锁定宽高比" title="锁定宽高比" disabled={!enabled} onClick={() => patch({ aspectLocked: !data.aspectLocked })}>
          {data.aspectLocked ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}</button>
      </div></div>
    </div>
    {[{ handle: 'image', label: '输入', output: false }, { handle: 'result', label: '输出', output: true }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}><span className={`describer-port-label sunburst-label-image${port.output ? ' output-label' : ''}`} style={{ top: 61 }}>{port.label}{!port.output && <span className="crop-required">*</span>}</span>
        <Handle id={port.handle} type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} style={{ top: 89 }} aria-label={`裁剪${port.label}`}
          className={`describer-port sunburst-port-image${connected ? ' is-connected' : ''}`} isConnectable={isConnectable && !data.locked} /></div>;
    })}
    {error && <div role="alert" className="crop-error">{error}</div>}
  </>;
}
