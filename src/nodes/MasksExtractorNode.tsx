import { useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis, Download, RotateCcw } from 'lucide-react';
import { isMasksExtractorNode, isNodeLocked, type AppNode, type MasksExtractorNode as MasksNode, type FileAsset } from './types';
import { imageOutput } from './sunburstRun';
import { combineMasks, decodeMask, encodeMask, maskOperation, maskPoint, masksRevision, type MaskBitmap, type MaskOperation, type MaskPoint } from './masksExtractor';
import { MaskInferenceContext, type MaskProgress } from './masksInference';
import { cacheMaskCandidate } from './masksCandidate';
import { maskCanvas, renderMasks } from './masksRender';
import { assetResources } from './assetResources';
import { downloadAsset } from './fileMedia';
import { MasksExtractorIcon } from './MasksExtractorIcon';
import { TextNodeMenu } from './TextNodeMenu';
import './MasksExtractorNode.css';

export function MasksExtractorNode({ id, data, isConnectable }: NodeProps<MasksNode>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const updateInternals = useUpdateNodeInternals();
  const predictor = useContext(MaskInferenceContext);
  const predict = useMemo(() => cacheMaskCandidate(predictor), [predictor]);
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? '', inputUrl = input?.url;
  const selection = data.selection?.inputId === inputId ? data.selection : undefined;
  const revision = masksRevision(data, inputId);
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement }>();
  const [display, setDisplay] = useState<'image' | 'mask'>('image');
  const [mode, setMode] = useState<MaskOperation>('replace');
  const [hover, setHover] = useState<MaskBitmap>();
  const [progress, setProgress] = useState<MaskProgress>();
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const job = useRef<{ controller: AbortController; preview: boolean }>();
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastPoint = useRef<MaskPoint>();
  const lastOperation = useRef<MaskOperation>('replace');
  const hoverEpoch = useRef(0);
  const current = useRef({ inputId, inputUrl, selectionId: selection?.id, locked: data.locked });
  current.current = { inputId, inputUrl, selectionId: selection?.id, locked: data.locked };
  const sourceImage = loaded && loaded.url === inputUrl ? loaded.image : undefined;
  const width = sourceImage?.naturalWidth ?? input?.width, height = sourceImage?.naturalHeight ?? input?.height;
  const result = imageOutput(nodes.find(node => node.id === id), display === 'mask' ? 'mask' : 'result', nodes, edges)[0];
  const patch = (value: Partial<MasksNode['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };

  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined); setError(''); setReady(false); lastPoint.current = undefined;
    if (!inputUrl) return;
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = inputUrl;
    void image.decode().then(() => { if (!cancelled) setLoaded({ url: inputUrl, image }); })
      .catch(() => { if (!cancelled) setError('图片无法读取，请检查图片链接或跨域权限。'); });
    return () => { cancelled = true; };
  }, [inputId, inputUrl]);

  useEffect(() => {
    job.current?.controller.abort(); job.current = undefined; clearTimeout(hoverTimer.current);
    hoverEpoch.current++; setHover(undefined); setBusy(false); setProgress(undefined);
    lastPoint.current = selection?.point; lastOperation.current = selection?.operation ?? 'replace';
    return () => { job.current?.controller.abort(); clearTimeout(hoverTimer.current); };
  }, [inputId, inputUrl, selection, data.locked]);

  useEffect(() => {
    let cancelled = false;
    if (!sourceImage || !selection || !revision || (data.outputRevision === revision && data.result && data.mask)) return;
    void renderMasks(sourceImage, selection).then(({ maskBlob, resultBlob, width, height }) => {
      const node = getNode(id);
      if (cancelled || !isMasksExtractorNode(node) || masksRevision(node.data, current.current.inputId) !== revision) return;
      const asset = (blob: Blob, name: string): FileAsset => ({ id: crypto.randomUUID(), kind: 'image', url: assetResources.create(blob), name, size: blob.size, width, height });
      updateNodeData(id, { result: asset(resultBlob, 'Masks Extractor.png'), mask: asset(maskBlob, 'Mask.png'), outputRevision: revision });
    }).catch(() => { if (!cancelled) setError('蒙版导出失败，请重试或使用较小的图片。'); });
    return () => { cancelled = true; };
  }, [sourceImage, selection, revision, data.outputRevision, data.result, data.mask, id, getNode, updateNodeData]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d')!;
    const scale = Math.min(1, 1024 / Math.max(width ?? 1, height ?? 1));
    element.width = Math.max(1, Math.round((width ?? 424) * scale));
    element.height = Math.max(1, Math.round((height ?? 424) * scale));
    if (!sourceImage) return;
    if (display === 'image') context.drawImage(sourceImage, 0, 0, element.width, element.height);
    else { context.fillStyle = '#000'; context.fillRect(0, 0, element.width, element.height); }
    if (selection) context.drawImage(maskCanvas(decodeMask(selection), display === 'image' ? [159, 212, 65] : undefined), 0, 0, element.width, element.height);
    if (hover && display === 'image') context.drawImage(maskCanvas(hover, mode === 'subtract' ? [255, 90, 90] : [195, 235, 100]), 0, 0, element.width, element.height);
  }, [width, height, sourceImage, selection, hover, display, mode]);
  useEffect(() => updateInternals(id), [id, width, height, updateInternals]);

  const run = async (point: MaskPoint, operation: MaskOperation, preview: boolean, recalculate = false) => {
    if (!input || !sourceImage || isNodeLocked(getNode(id)) || (preview && job.current?.preview === false)) return;
    job.current?.controller.abort(); clearTimeout(hoverTimer.current);
    const controller = new AbortController(); job.current = { controller, preview };
    const source = input, before = selection?.id, epoch = hoverEpoch.current;
    const valid = () => {
      const node = getNode(id), graph = getNodes(), connections = getEdges();
      if (controller.signal.aborted || !isMasksExtractorNode(node) || node.data.locked) return false;
      const edge = connections.find(item => item.target === id && item.targetHandle === 'image');
      const actual = edge ? imageOutput(graph.find(item => item.id === edge.source), edge.sourceHandle, graph, connections)[0] : node.data.baseImage;
      const actualSelection = node.data.selection?.inputId === actual?.id ? node.data.selection?.id : undefined;
      return actual?.id === source.id && actual?.url === source.url && actualSelection === before;
    };
    if (!preview) { setBusy(true); setProgress({ stage: 'loading' }); setError(''); setHover(undefined); lastPoint.current = point; lastOperation.current = operation; }
    try {
      const candidate = await predict(source, point, { signal: controller.signal, recalculate,
        onProgress: value => { if (valid() && !preview) setProgress(value); } });
      if (!valid()) return;
      setReady(true);
      if (preview) { if (epoch === hoverEpoch.current) setHover(candidate); }
      else {
        const previous = selection ? decodeMask(selection) : undefined;
        const bitmap = combineMasks(previous, candidate, operation);
        patch({ selection: { ...encodeMask(bitmap, source.id, crypto.randomUUID()), point, operation }, result: undefined, mask: undefined, outputRevision: undefined });
      }
    } catch (failure) {
      if (valid() && !preview) setError(failure instanceof Error ? failure.message : '无法生成蒙版，请重试。');
    } finally {
      if (job.current?.controller === controller) { job.current = undefined; setBusy(false); setProgress(undefined); }
    }
  };

  const pointFrom = (event: PointerEvent<HTMLCanvasElement>) => maskPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  const cancel = () => { job.current?.controller.abort(); job.current = undefined; hoverEpoch.current++; setBusy(false); setProgress(undefined); setHover(undefined); clearTimeout(hoverTimer.current); };
  const cancelOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing && (job.current || event.target === canvas.current)) {
      event.stopPropagation(); cancel();
    }
  };
  const status = progress?.stage === 'download' ? `正在加载模型 ${progress.progress ?? 0}%`
    : progress?.stage === 'loading' ? '正在加载分割模型…'
      : progress?.stage === 'encoding' ? '正在分析图片…' : '正在生成蒙版…';

  return <>
    <header className="text-node-header">
      <div className="text-node-title"><MasksExtractorIcon size={24} />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || '蒙版提取'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || '蒙版提取'); setRenaming(true); }}><Ellipsis size={24} /></TextNodeMenu>
    </header>
    <div className="masks-preview nodrag nopan" style={{ aspectRatio: width && height ? `${width} / ${height}` : '1' }} aria-busy={busy} onKeyDown={cancelOnEscape}>
      <canvas ref={canvas} aria-label="点击图片选择物体" aria-disabled={!sourceImage || Boolean(data.locked)} tabIndex={input ? 0 : -1}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.stopPropagation(); event.currentTarget.focus();
          const point = pointFrom(event), operation = event.shiftKey ? maskOperation(event) : mode;
          if (point) void run(point, operation, false);
        }}
        onPointerMove={event => {
          if (!ready || job.current?.preview === false || data.locked) return;
          const point = pointFrom(event); clearTimeout(hoverTimer.current);
          // Invalidate A immediately, including while B is still being debounced.
          hoverEpoch.current++; setHover(undefined);
          if (point) hoverTimer.current = setTimeout(() => void run(point, mode, true), 120);
        }}
        onPointerLeave={() => {
          clearTimeout(hoverTimer.current); hoverEpoch.current++; setHover(undefined);
          if (job.current?.preview) job.current.controller.abort();
        }} />
      {!input && <span className="masks-empty">连接图片后，点击选择物体</span>}
      {input && <>
        <div className="masks-display" role="group" aria-label="Mask display">
          <button type="button" aria-pressed={display === 'image'} onClick={() => setDisplay('image')}>Image</button>
          <button type="button" aria-pressed={display === 'mask'} onClick={() => setDisplay('mask')}>Mask</button>
        </div>
        <button className="masks-download" type="button" aria-label={display === 'mask' ? '下载蒙版' : '下载透明抠图'} disabled={!result}
          onClick={() => { if (result) void downloadAsset(result).catch(() => setError('下载失败，请重试。')); }}><Download size={16} /></button>
      </>}
      {busy && <div className="masks-progress" role="status"><span>{status}</span><button type="button" onClick={cancel}>取消</button></div>}
    </div>
    <div className="masks-controls nodrag nopan" onKeyDown={cancelOnEscape}>
      <div className="masks-modes" role="group" aria-label="选区模式">
        {(['replace', 'add', 'subtract'] as const).map((value, index) => <button key={value} type="button" disabled={Boolean(data.locked)} aria-pressed={mode === value}
          title={['点击替换选区', 'Shift + 点击添加选区', 'Alt + Shift + 点击减去选区'][index]} onClick={() => setMode(value)}>{['选择', '添加', '减去'][index]}</button>)}
      </div>
      <div className="masks-actions">
        <button type="button" aria-label="清空选区" title="清空选区" disabled={!selection || Boolean(data.locked)} onClick={() => { cancel(); patch({ selection: undefined, mask: undefined, result: undefined, outputRevision: undefined }); }}><RotateCcw size={14} /></button>
        <button className="masks-recalculate" type="button" disabled={!input || !(lastPoint.current || selection?.point) || busy || Boolean(data.locked)} title="重新分析上次点击的区域，保留选区加减方式"
          onClick={() => { if (lastPoint.current) { canvas.current?.focus(); void run(lastPoint.current, lastOperation.current, false, true); } }}>重新计算蒙版</button>
      </div>
    </div>
    {input && !selection && !busy && !error && <div className="masks-hint">点击选择 · Shift 添加 · Alt+Shift 减去</div>}
    {error && <div role="alert" className="preview-error masks-error">{error}</div>}
    {[{ handle: 'image', label: 'Image', output: false, top: 89 }, { handle: 'result', label: 'Image With Alpha', output: true, top: 89 }, { handle: 'mask', label: 'Mask', output: true, top: 149 }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}>
        <span className={`describer-port-label sunburst-label-${port.handle === 'mask' ? 'mask' : 'image'}${port.output ? ' output-label' : ''}`} style={{ top: port.top - 28 }}>{port.label}</span>
        <Handle id={port.handle} type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} style={{ top: port.top }}
          aria-label={`Masks Extractor ${port.label}`} className={`describer-port sunburst-port-${port.handle === 'mask' ? 'mask' : 'image'}${connected ? ' is-connected' : ''}`}
          isConnectable={isConnectable && !data.locked && (port.output || !connected)} />
      </div>;
    })}
  </>;
}
