import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis, Eye, EyeOff, Blend } from 'lucide-react';
import type { AppNode, BlurNode as Blur } from './types';
import { isBlurNode, isNodeLocked } from './types';
import { blurControls, blurRevision, type BlurSettings } from './blur';
import { BlurRenderer } from './blurRender';
import { blurLivePreviews } from './blurLivePreview';
import { imageOutput } from './sunburstRun';
import { assetResources } from './assetResources';
import { downloadAsset } from './fileMedia';
import { FileIcon } from './FileIcon';
import { DescriberModelSelect } from '../components/DescriberModelSelect';
import { TextNodeMenu } from './TextNodeMenu';

function BlurNumber({ value, control, disabled, onCommit }: {
  value: number; control: typeof blurControls[number]; disabled: boolean; onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const cancelled = useRef(false);
  useEffect(() => setText(String(value)), [value]);
  return <input type="number" aria-label={control.label} min={control.min} max={control.max} step={control.step}
    value={text} disabled={disabled} onChange={event => setText(event.target.value)}
    onBlur={() => {
      if (!cancelled.current && text.trim() && Number.isFinite(Number(text))) {
        const next = Math.min(control.max, Math.max(control.min, Number(text)));
        onCommit(Number((Math.round(next / control.step) * control.step).toFixed(2)));
      }
      cancelled.current = false; setText(String(value));
    }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); }
      if (event.key === 'Enter') event.currentTarget.blur();
    }} />;
}

export function BlurNode({ id, data, isConnectable }: NodeProps<Blur>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const internals = useUpdateNodeInternals();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? '';
  const revision = blurRevision(data, inputId);
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement }>();
  const [draft, setDraft] = useState<BlurSettings>();
  const draftRef = useRef<BlurSettings>();
  const dragging = useRef(false);
  const cancelledGesture = useRef(false);
  const gesture = useRef(0);
  const [displayed, setDisplayed] = useState<{ image: HTMLImageElement; revision: string; draft: boolean }>();
  const [engine, setEngine] = useState<{ image: HTMLImageElement; renderer: BlurRenderer; draftRenderer: BlurRenderer; draftScale: number }>();
  const [original, setOriginal] = useState(false);
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = loaded?.url === input?.url ? loaded?.image : undefined;
  const width = image?.naturalWidth ?? input?.width, height = image?.naturalHeight ?? input?.height;
  const settings = draft ?? data.settings;
  const ready = Boolean(image);
  const output = imageOutput(getNode(id), 'result', nodes, edges)[0];
  const patch = (value: Partial<Blur['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  const cancelDraft = useCallback(() => { if (draftRef.current) gesture.current++; if (dragging.current) cancelledGesture.current = true; dragging.current = false; draftRef.current = undefined; setDraft(undefined); blurLivePreviews.clear(id); }, [id]);
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
    let renderer: BlurRenderer | undefined, draftRenderer: BlurRenderer | undefined;
    if (image) void createImageBitmap(image).then(async bitmap => {
      let draftBitmap: ImageBitmap | undefined;
      try {
        const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        draftBitmap = await createImageBitmap(bitmap, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
        if (disposed) return;
        renderer = new BlurRenderer(bitmap);
        draftRenderer = new BlurRenderer(draftBitmap);
        setEngine({ image, renderer, draftRenderer, draftScale: scale });
      } catch (error) {
        renderer?.dispose(); draftRenderer?.dispose();
        throw error;
      } finally {
        // close() is safe after ownership has been transferred to a worker.
        bitmap.close(); draftBitmap?.close();
      }
    }).catch(() => { if (!disposed) setError('无法创建模糊线程。'); });
    return () => { disposed = true; renderer?.dispose(); draftRenderer?.dispose(); blurLivePreviews.clear(id); };
  }, [id, image]);

  useEffect(() => {
    if (!image || engine?.image !== image || !inputId) return;
    const epoch = gesture.current;
    const isCurrent = () => current.current.image === image && current.current.revision === revision
      && current.current.locked === data.locked && gesture.current === epoch;
    setError('');
    // A separate small-image worker keeps a new drag responsive even while a
    // previous native-resolution convolution/PNG export is still finishing.
    const gaussianDraft = Boolean(draft) && settings.type === 'gaussian';
    const renderer = gaussianDraft ? engine.draftRenderer : engine.renderer;
    const renderSettings = gaussianDraft ? { ...settings, size: 1 + (settings.size - 1) * engine.draftScale } : settings;
    void renderer.render(renderSettings, !draft && !data.locked, Boolean(draft)).then(frame => {
      if (!frame) return;
      try {
        // Completed frames within the same drag remain useful while the latest
        // settings are queued. A commit, cancel or source change invalidates them.
        if (!isCurrent() || Boolean(draft) !== Boolean(draftRef.current) || !canvas.current || !frame.bitmap) return;
        const target = canvas.current;
        target.width = frame.bitmap.width; target.height = frame.bitmap.height;
        target.getContext('2d')?.drawImage(frame.bitmap, 0, 0);
        setDisplayed({ image, revision: blurRevision({ settings }, inputId), draft: Boolean(draft) });
        if (draft) {
          blurLivePreviews.publish(id, { canvas: target, width: image.naturalWidth, height: image.naturalHeight });
          return;
        }
        blurLivePreviews.clear(id);
        const node = getNode(id), graph = getNodes(), connections = getEdges();
        if (!isBlurNode(node) || node.data.locked || !frame.blob) return;
        const edge = connections.find(item => item.target === id && item.targetHandle === 'image');
        const source = edge ? imageOutput(graph.find(item => item.id === edge.source), edge.sourceHandle, graph, connections)[0] : node.data.baseImage;
        if (!source || source.url !== input?.url || blurRevision(node.data, source.id) !== revision) return;
        if (node.data.outputRevision !== revision) {
          updateNodeData(id, { result: { id: crypto.randomUUID(), name: 'Blur.png', kind: 'image',
            url: assetResources.create(frame.blob), size: frame.blob.size, width: image.naturalWidth, height: image.naturalHeight }, outputRevision: revision });
        }
      } finally { frame.bitmap?.close(); }
    }).catch(() => { if (isCurrent()) setError('无法处理模糊图片，请重试或更换可读取的图片。'); });
  }, [id, engine, image, settings, draft, revision, inputId, input?.url, data.locked, getNode, getNodes, getEdges, updateNodeData]);

  return <>
    <header className="text-node-header">
      <div className="text-node-title"><Blend size={18} strokeWidth={1.3} />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || 'Blur'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || 'Blur'); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu>
    </header>
    <div className="preview-image color-image nodrag nopan" style={{ aspectRatio: width && height ? `${width} / ${height}` : '1' }}>
      {ready && <>
        <canvas ref={canvas} aria-label="Blur preview" style={{ visibility: original ? 'hidden' : undefined }} />
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
            <button className="file-icon-button" type="button" aria-label="Download blurred image" title="Download image" disabled={!output || Boolean(draft) || displayed?.draft || displayed?.image !== image || displayed?.revision !== revision}
              onClick={() => { if (output) { setError(''); void downloadAsset(output).catch(() => setError('下载失败，请重试。')); } }}><FileIcon name="download" /></button>
          </div>
          {width && height && <span className="file-media-resolution">{width} × {height}</span>}
        </div>
      </>}
    </div>
    <div className="color-settings blur-settings nodrag nopan nowheel" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') cancelDraft(); }}>
      <div className="blur-type"><span>Type</span><DescriberModelSelect compact label="Type" menuLabel="Blur type" value={settings.type === 'box' ? 'Box' : 'Gaussian'} choices={['Box', 'Gaussian']} disabled={Boolean(data.locked)}
        onChange={value => { cancelDraft(); patch({ settings: { ...data.settings, type: value === 'Box' ? 'box' : 'gaussian' } }); }} /></div>
      {blurControls.map(control => <div className="color-setting" key={control.key}>
        <label htmlFor={`${id}-${control.key}`}>{control.label}</label>
        <input id={`${id}-${control.key}`} type="range" aria-label={control.label} min={control.min} max={control.max} step={control.step}
          value={settings[control.key]} disabled={data.locked}
          onPointerDown={event => { cancelledGesture.current = false; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
          onChange={event => {
            if (cancelledGesture.current) return;
            const next = { ...settings, [control.key]: Number(event.target.value) };
            if (dragging.current) { if (!draftRef.current) gesture.current++; draftRef.current = next; setDraft(next); }
            else patch({ settings: next });
          }}
          onPointerUp={commitDraft} onPointerCancel={() => { cancelDraft(); cancelledGesture.current = false; }}
          onLostPointerCapture={() => { if (dragging.current) cancelDraft(); cancelledGesture.current = false; }} />
        <BlurNumber control={control} value={settings[control.key]} disabled={Boolean(data.locked)}
          onCommit={value => patch({ settings: { ...data.settings, [control.key]: value } })} />
      </div>)}
    </div>
    {[{ handle: 'image', label: 'Input', output: false }, { handle: 'result', label: 'Output', output: true }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}>
        <span className={`describer-port-label sunburst-label-image${port.output ? ' output-label' : ''}`} style={{ top: 61 }}>{port.label}{!port.output && '*'}</span>
        <Handle id={port.handle} type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} style={{ top: 89 }}
          aria-label={`Blur ${port.label}`} className={`describer-port sunburst-port-image${connected ? ' is-connected' : ''}`}
          isConnectable={isConnectable && !data.locked && (port.output || !connected)} />
      </div>;
    })}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </>;
}
