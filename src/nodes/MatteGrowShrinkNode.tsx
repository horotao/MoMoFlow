import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis, Eye, EyeOff } from 'lucide-react';
import type { AppNode, MatteGrowShrinkNode as MatteGrowShrink } from './types';
import { isMatteGrowShrinkNode, isNodeLocked } from './types';
import { matteGrowShrinkControls, matteGrowShrinkRevision, type MatteGrowShrinkSettings } from './matteGrowShrink';
import { MatteGrowShrinkRenderer } from './matteGrowShrinkRender';
import { matteGrowShrinkLivePreviews } from './matteGrowShrinkLivePreview';
import { imageOutput } from './sunburstRun';
import { assetResources } from './assetResources';
import { downloadAsset } from './fileMedia';
import { FileIcon } from './FileIcon';
import { MatteGrowShrinkIcon } from './MatteGrowShrinkIcon';
import { TextNodeMenu } from './TextNodeMenu';
import { CanvasHistoryContext } from '../components/useCanvasHistory';

function MatteGrowShrinkNumber({ value, control, disabled, onCommit }: {
  value: number; control: typeof matteGrowShrinkControls[number]; disabled: boolean; onCommit: (value: number) => void;
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') return;
      event.stopPropagation();
      if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur(); }
      if (event.key === 'Enter') event.currentTarget.blur();
    }} />;
}

export function MatteGrowShrinkNode({ id, data, isConnectable }: NodeProps<MatteGrowShrink>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const history = useContext(CanvasHistoryContext);
  const internals = useUpdateNodeInternals();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? '';
  const revision = matteGrowShrinkRevision(data, inputId);
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement }>();
  const [draft, setDraft] = useState<MatteGrowShrinkSettings>();
  const draftRef = useRef<MatteGrowShrinkSettings>();
  const dragging = useRef(false);
  const cancelledGesture = useRef(false);
  const gesture = useRef(0);
  const [displayed, setDisplayed] = useState<{ image: HTMLImageElement; revision: string; draft: boolean }>();
  const [engine, setEngine] = useState<{ image: HTMLImageElement; renderer: MatteGrowShrinkRenderer; draftRenderer: MatteGrowShrinkRenderer; draftScale: number }>();
  const [original, setOriginal] = useState(false);
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = loaded?.url === input?.url ? loaded?.image : undefined;
  const width = image?.naturalWidth ?? input?.width, height = image?.naturalHeight ?? input?.height;
  const settings = draft ?? data.settings;
  const progress = (settings.size - matteGrowShrinkControls[0].min)
    / (matteGrowShrinkControls[0].max - matteGrowShrinkControls[0].min);
  const ready = Boolean(image);
  const output = imageOutput(getNode(id), 'result', nodes, edges)[0];
  const patch = (value: Partial<MatteGrowShrink['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  const cancelDraft = useCallback(() => { if (draftRef.current) gesture.current++; if (dragging.current) cancelledGesture.current = true; dragging.current = false; draftRef.current = undefined; setDraft(undefined); matteGrowShrinkLivePreviews.clear(id); }, [id]);
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
  useEffect(() => { window.addEventListener('blur', cancelDraft); return () => window.removeEventListener('blur', cancelDraft); }, [cancelDraft]);
  useEffect(() => { cancelDraft(); }, [revision, image, data.locked, cancelDraft]);
  useEffect(() => internals(id), [id, width, height, internals]);

  const current = useRef({ image, revision, locked: data.locked });
  useLayoutEffect(() => { current.current = { image, revision, locked: data.locked }; }, [image, revision, data.locked]);

  useEffect(() => {
    let disposed = false;
    let renderer: MatteGrowShrinkRenderer | undefined, draftRenderer: MatteGrowShrinkRenderer | undefined;
    if (image) void createImageBitmap(image).then(async bitmap => {
      let draftBitmap: ImageBitmap | undefined;
      try {
        const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        draftBitmap = await createImageBitmap(bitmap, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
        if (disposed) return;
        renderer = new MatteGrowShrinkRenderer(bitmap);
        draftRenderer = new MatteGrowShrinkRenderer(draftBitmap);
        setEngine({ image, renderer, draftRenderer, draftScale: scale });
      } catch (error) {
        renderer?.dispose(); draftRenderer?.dispose();
        throw error;
      } finally {
        // close() is safe after ownership has been transferred to a worker.
        bitmap.close(); draftBitmap?.close();
      }
    }).catch(() => { if (!disposed) setError('无法创建蒙版扩张 / 收缩线程。'); });
    return () => { disposed = true; renderer?.dispose(); draftRenderer?.dispose(); matteGrowShrinkLivePreviews.clear(id); };
  }, [id, image]);

  useEffect(() => {
    if (!image || engine?.image !== image || !inputId) return;
    const epoch = gesture.current;
    const isCurrent = () => current.current.image === image && current.current.revision === revision
      && current.current.locked === data.locked && gesture.current === epoch;
    setError('');
    // A separate small-image worker keeps a new drag responsive even while a
    // previous native-resolution processing/PNG export is still finishing.
    const isDraft = Boolean(draft);
    const renderer = isDraft ? engine.draftRenderer : engine.renderer;
    const renderSettings = isDraft ? { ...settings, size: settings.size * engine.draftScale } : settings;
    void renderer.render(renderSettings, !draft && !data.locked, Boolean(draft)).then(frame => {
      if (!frame) return;
      try {
        // Completed frames within the same drag remain useful while the latest
        // settings are queued. A commit, cancel or source change invalidates them.
        if (!isCurrent() || Boolean(draft) !== Boolean(draftRef.current) || !canvas.current || !frame.bitmap) return;
        const target = canvas.current;
        target.width = frame.bitmap.width; target.height = frame.bitmap.height;
        target.getContext('2d')?.drawImage(frame.bitmap, 0, 0);
        setDisplayed({ image, revision: matteGrowShrinkRevision({ settings }, inputId), draft: Boolean(draft) });
        if (draft) {
          matteGrowShrinkLivePreviews.publish(id, { canvas: target, width: image.naturalWidth, height: image.naturalHeight });
          return;
        }
        matteGrowShrinkLivePreviews.clear(id);
        const node = getNode(id), graph = getNodes(), connections = getEdges();
        if (!isMatteGrowShrinkNode(node) || node.data.locked || !frame.blob) return;
        const edge = connections.find(item => item.target === id && item.targetHandle === 'image');
        const source = edge ? imageOutput(graph.find(item => item.id === edge.source), edge.sourceHandle, graph, connections)[0] : node.data.baseImage;
        if (!source || source.url !== input?.url || matteGrowShrinkRevision(node.data, source.id) !== revision) return;
        if (node.data.outputRevision !== revision) {
          updateNodeData(id, { result: { id: crypto.randomUUID(), name: 'MatteGrowShrink.png', kind: 'image', maskMode: 'luminance',
            url: assetResources.create(frame.blob), size: frame.blob.size, width: image.naturalWidth, height: image.naturalHeight }, outputRevision: revision });
        }
      } finally { frame.bitmap?.close(); }
    }).catch(() => { if (isCurrent()) setError('无法处理蒙版扩张 / 收缩图片，请重试或更换可读取的图片。'); });
  }, [id, engine, image, settings, draft, revision, inputId, input?.url, data.locked, getNode, getNodes, getEdges, updateNodeData]);

  return <>
    <header className="text-node-header">
      <div className="text-node-title"><MatteGrowShrinkIcon size={18} />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || '蒙版扩张 / 收缩'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || '蒙版扩张 / 收缩'); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu>
    </header>
    <div className="preview-image color-image nodrag nopan" style={{ aspectRatio: width && height ? `${width} / ${height}` : '1' }}>
      {ready && <>
        <canvas ref={canvas} aria-label="Matte Grow / Shrink preview" style={{ visibility: original ? 'hidden' : undefined }} />
        {original && <img src={input!.url} alt="Original mask" draggable={false} />}
        <div className="file-media-overlay">
          <div className="file-media-top">
            <button className="file-icon-button" type="button" aria-label="Show original" title="按住查看原始蒙版" aria-pressed={original}
              onPointerDown={event => { if (event.button === 0) { event.currentTarget.setPointerCapture(event.pointerId); setOriginal(true); } }}
              onPointerUp={() => setOriginal(false)} onPointerCancel={() => setOriginal(false)} onLostPointerCapture={() => setOriginal(false)}
              onBlur={() => setOriginal(false)}
              onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); setOriginal(true); } }}
              onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setOriginal(false); } }}>
              {original ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button className="file-icon-button" type="button" aria-label="Download mask" title="Download image" disabled={!output || Boolean(draft) || displayed?.draft || displayed?.image !== image || displayed?.revision !== revision}
              onClick={() => { if (output) { setError(''); void downloadAsset(output).catch(() => setError('下载失败，请重试。')); } }}><FileIcon name="download" /></button>
          </div>
          {width && height && <span className="file-media-resolution">{width} × {height}</span>}
        </div>
      </>}
    </div>
    <div className="color-settings matte-grow-shrink-settings nodrag nopan nowheel" onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') return; event.stopPropagation(); if (event.key === 'Escape') cancelDraft(); }}>
      {matteGrowShrinkControls.map(control => <div className="color-setting" key={control.key}>
        <label htmlFor={`${id}-${control.key}`}>{control.label}</label>
        <input id={`${id}-${control.key}`} type="range" aria-label={control.label} min={control.min} max={control.max} step={control.step}
          value={settings[control.key]} disabled={data.locked}
          style={{ '--matte-fill': `calc(${progress * 100}% + ${6 - progress * 12}px)` } as CSSProperties}
          onPointerDown={event => {
            if (event.button !== 0) return;
            // Finish a focused number field's blur commit before starting this drag.
            // Its revision effect must not cancel the new pointer gesture.
            const slider = event.currentTarget;
            if (document.activeElement !== slider) flushSync(() => slider.focus());
            cancelledGesture.current = false; dragging.current = true; slider.setPointerCapture(event.pointerId);
          }}
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.nativeEvent.isComposing) {
              event.preventDefault(); event.stopPropagation(); cancelDraft();
              if (event.shiftKey) history.redo(); else history.undo();
            }
          }}
          onChange={event => {
            if (cancelledGesture.current) return;
            const next = { ...settings, [control.key]: Number(event.target.value) };
            if (dragging.current) { if (!draftRef.current) gesture.current++; draftRef.current = next; setDraft(next); }
            else patch({ settings: next });
          }}
          onPointerUp={commitDraft} onPointerCancel={() => { cancelDraft(); cancelledGesture.current = false; }}
          onLostPointerCapture={() => { if (dragging.current) cancelDraft(); cancelledGesture.current = false; }} />
        <MatteGrowShrinkNumber control={control} value={settings[control.key]} disabled={Boolean(data.locked)}
          onCommit={value => patch({ settings: { ...data.settings, [control.key]: value } })} />
      </div>)}
    </div>
    {[{ handle: 'image', label: 'Input', output: false }, { handle: 'result', label: 'Output', output: true }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}>
        <span className={`describer-port-label sunburst-label-mask${port.output ? ' output-label' : ''}`} style={{ top: 61 }}>{port.label}{!port.output && '*'}</span>
        <Handle id={port.handle} type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} style={{ top: 89 }}
          aria-label={`Matte Grow / Shrink ${port.label}`} className={`describer-port sunburst-port-mask${connected ? ' is-connected' : ''}`}
          isConnectable={isConnectable && !data.locked} />
      </div>;
    })}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </>;
}
