import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis, Eye, EyeOff, ChartNoAxesCombined } from 'lucide-react';
import type { AppNode, LevelsNode as Levels } from './types';
import { isLevelsNode, isNodeLocked } from './types';
import { levelsRevision, type LevelsSettings, type LevelsHistograms } from './levels';
import { LevelsRenderer } from './levelsRender';
import { levelsLivePreviews } from './levelsLivePreview';
import { imageOutput } from './sunburstRun';
import { assetResources } from './assetResources';
import { downloadAsset } from './fileMedia';
import { FileIcon } from './FileIcon';
import { LevelsControls } from './LevelsControls';
import { TextNodeMenu } from './TextNodeMenu';

export function LevelsNode({ id, data, isConnectable }: NodeProps<Levels>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const internals = useUpdateNodeInternals();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? '';
  const revision = levelsRevision(data, inputId);
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement }>();
  const [draft, setDraft] = useState<LevelsSettings>();
  const draftRef = useRef<LevelsSettings>();
  const dragging = useRef(false);
  const cancelledGesture = useRef(false);
  const gesture = useRef(0);
  const [displayed, setDisplayed] = useState<{ image: HTMLImageElement; revision: string; draft: boolean }>();
  const [engine, setEngine] = useState<{ image: HTMLImageElement; renderer: LevelsRenderer; draftRenderer: LevelsRenderer }>();
  const [histogram, setHistogram] = useState<{ image: HTMLImageElement; bins: LevelsHistograms }>();
  const [original, setOriginal] = useState(false);
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = loaded?.url === input?.url ? loaded?.image : undefined;
  const width = image?.naturalWidth ?? input?.width, height = image?.naturalHeight ?? input?.height;
  const settings = draft ?? data.settings;
  const ready = Boolean(image);
  const output = imageOutput(getNode(id), 'result', nodes, edges)[0];
  const patch = (value: Partial<Levels['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  const cancelDraft = useCallback(() => { if (draftRef.current) gesture.current++; if (dragging.current) cancelledGesture.current = true; dragging.current = false; draftRef.current = undefined; setDraft(undefined); levelsLivePreviews.clear(id); }, [id]);
  const commitDraft = () => {
    const next = draftRef.current;
    cancelDraft();
    cancelledGesture.current = false;
    if (next) patch({ settings: next });
  };

  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined); setError(''); setOriginal(false);
    if (!input?.url) return;
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = input.url;
    void img.decode().then(() => { if (!cancelled) setLoaded({ url: input.url, image: img }); })
      .catch(() => { if (!cancelled) setError('无法读取图片，请检查图片是否允许跨域访问。'); });
    return () => { cancelled = true; };
  }, [input?.url]);
  useEffect(() => { cancelDraft(); }, [revision, image, data.locked, cancelDraft]);
  useEffect(() => internals(id), [id, width, height, internals]);

  const current = useRef({ image, revision, locked: data.locked });
  useLayoutEffect(() => { current.current = { image, revision, locked: data.locked }; }, [image, revision, data.locked]);

  useEffect(() => {
    let disposed = false;
    let renderer: LevelsRenderer | undefined, draftRenderer: LevelsRenderer | undefined;
    if (image) void createImageBitmap(image).then(async bitmap => {
      let draftBitmap: ImageBitmap | undefined;
      try {
        const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        draftBitmap = await createImageBitmap(bitmap, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
        if (disposed) return;
        renderer = new LevelsRenderer(bitmap);
        draftRenderer = new LevelsRenderer(draftBitmap);
        setEngine({ image, renderer, draftRenderer });
      } catch (error) {
        renderer?.dispose(); draftRenderer?.dispose();
        throw error;
      } finally {
        // close() is safe after ownership has been transferred to a worker.
        bitmap.close(); draftBitmap?.close();
      }
    }).catch(() => { if (!disposed) setError('无法创建色阶线程。'); });
    return () => { disposed = true; renderer?.dispose(); draftRenderer?.dispose(); levelsLivePreviews.clear(id); };
  }, [id, image]);

  useEffect(() => {
    if (!image || engine?.image !== image || !inputId) return;
    const epoch = gesture.current;
    const isCurrent = () => current.current.image === image && current.current.revision === revision
      && current.current.locked === data.locked && gesture.current === epoch;
    setError('');
    const renderer = draft ? engine.draftRenderer : engine.renderer;
    void renderer.render(settings, !draft && !data.locked, Boolean(draft)).then(frame => {
      if (!frame) return;
      try {
        // Completed frames within the same drag remain useful while the latest
        // settings are queued. A commit, cancel or source change invalidates them.
        if (!isCurrent() || Boolean(draft) !== Boolean(draftRef.current) || !canvas.current || !frame.bitmap) return;
        if (frame.histogram) setHistogram({ image, bins: frame.histogram });
        const target = canvas.current;
        target.width = frame.bitmap.width; target.height = frame.bitmap.height;
        target.getContext('2d')?.drawImage(frame.bitmap, 0, 0);
        setDisplayed({ image, revision: levelsRevision({ settings }, inputId), draft: Boolean(draft) });
        if (draft) {
          levelsLivePreviews.publish(id, { canvas: target, width: image.naturalWidth, height: image.naturalHeight });
          return;
        }
        levelsLivePreviews.clear(id);
        const node = getNode(id), graph = getNodes(), connections = getEdges();
        if (!isLevelsNode(node) || node.data.locked || !frame.blob) return;
        const edge = connections.find(item => item.target === id && item.targetHandle === 'image');
        const source = edge ? imageOutput(graph.find(item => item.id === edge.source), edge.sourceHandle, graph, connections)[0] : node.data.baseImage;
        if (!source || source.url !== input?.url || levelsRevision(node.data, source.id) !== revision) return;
        if (node.data.outputRevision !== revision) {
          updateNodeData(id, { result: { id: crypto.randomUUID(), name: 'Levels.png', kind: 'image',
            url: assetResources.create(frame.blob), size: frame.blob.size, width: image.naturalWidth, height: image.naturalHeight }, outputRevision: revision });
        }
      } finally { frame.bitmap?.close(); }
    }).catch(() => { if (isCurrent()) setError('无法处理色阶图片，请重试或更换可读取的图片。'); });
  }, [id, engine, image, settings, draft, revision, inputId, input?.url, data.locked, getNode, getNodes, getEdges, updateNodeData]);

  return <>
    <header className="text-node-header">
      <div className="text-node-title"><ChartNoAxesCombined size={18} strokeWidth={1.3} />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || 'Levels'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || 'Levels'); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu>
    </header>
    <div className="preview-image color-image nodrag nopan" style={{ aspectRatio: width && height ? `${width} / ${height}` : '1' }}>
      {ready && <>
        <canvas ref={canvas} aria-label="Levels preview" style={{ visibility: original ? 'hidden' : undefined }} />
        {original && <img src={input!.url} alt="Original image" draggable={false} />}
        <div className="file-media-overlay">
          <div className="file-media-top">
            <button className="file-icon-button" type="button" aria-label="Show original" title="按住查看原图" aria-pressed={original}
              onPointerDown={event => { if (event.button === 0) { event.currentTarget.setPointerCapture(event.pointerId); setOriginal(true); } }}
              onPointerUp={() => setOriginal(false)} onPointerCancel={() => setOriginal(false)} onLostPointerCapture={() => setOriginal(false)}
              onBlur={() => setOriginal(false)}
              onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); setOriginal(true); } }}
              onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setOriginal(false); } }}>
              {original ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button className="file-icon-button" type="button" aria-label="Download levels image" title="Download image" disabled={!output || Boolean(draft) || displayed?.draft || displayed?.image !== image || displayed?.revision !== revision}
              onClick={() => { if (output) { setError(''); void downloadAsset(output).catch(() => setError('下载失败，请重试。')); } }}><FileIcon name="download" /></button>
          </div>
          {width && height && <span className="file-media-resolution">{width} × {height}</span>}
        </div>
      </>}
    </div>
    <LevelsControls channel={data.channel} settings={settings} histogram={histogram?.image === image ? histogram?.bins : undefined} disabled={Boolean(data.locked)}
      onChannel={channel => { cancelDraft(); patch({ channel }); }}
      onStart={() => { cancelledGesture.current = false; dragging.current = true; }}
      onDraft={next => {
        if (cancelledGesture.current) return;
        if (dragging.current) { if (!draftRef.current) gesture.current++; draftRef.current = next; setDraft(next); }
        else patch({ settings: next });
      }}
      onCommit={commitDraft} onCancel={cancelDraft}
      onSettings={next => { cancelDraft(); patch({ settings: next }); }} />
    {[{ handle: 'image', label: 'Input', output: false }, { handle: 'result', label: 'Output', output: true }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}>
        <span className={`describer-port-label sunburst-label-image${port.output ? ' output-label' : ''}`} style={{ top: 61 }}>{port.label}{!port.output && '*'}</span>
        <Handle id={port.handle} type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} style={{ top: 89 }}
          aria-label={`Levels ${port.label}`} className={`describer-port sunburst-port-image${connected ? ' is-connected' : ''}`}
          isConnectable={isConnectable && !data.locked && (port.output || !connected)} />
      </div>;
    })}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </>;
}
