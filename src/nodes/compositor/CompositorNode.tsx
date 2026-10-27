import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis, Layers, Pencil, Plus } from 'lucide-react';
import { isCompositorNode, type AppNode, type CompositorNode as Compositor } from '../types';
import { addCompositorInput, compositorLayout, compositorPending, compositorRenderDocument, compositorRevision, MAX_COMPOSITOR_LAYERS, type CompositorDocument, type CompositorInputs, type CompositorLayout } from '../compositor';
import { compositorInputs, imageOutput } from '../sunburstRun';
import { assetResources } from '../assetResources';
import { downloadAsset } from '../fileMedia';
import { FileIcon } from '../FileIcon';
import { TextNodeMenu } from '../TextNodeMenu';
import { CompositorRenderer } from './renderer';
import { CompositorEditor } from './CompositorEditor';
import { CompositorPreviewSession } from './interaction';

export type CompositorView = { canvas: HTMLCanvasElement; layout: CompositorLayout; revision: string };
export function CompositorCanvas({ view, label, canvasRef }: { view?: CompositorView; label: string; canvasRef?: MutableRefObject<HTMLCanvasElement | null> }) {
  const local = useRef<HTMLCanvasElement>(null), ref = canvasRef ?? local;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = view?.canvas.width ?? 1; canvas.height = view?.canvas.height ?? 1;
    if (view) canvas.getContext('2d')?.drawImage(view.canvas, 0, 0);
  }, [view, ref]);
  return <canvas ref={ref} aria-label={label} />;
}
export function CompositorNode({ id, data, isConnectable }: NodeProps<Compositor>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData, setEdges } = useReactFlow<AppNode>();
  const internals = useUpdateNodeInternals();
  const [open, setOpen] = useState(false), [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [draft, setDraft] = useState<CompositorDocument>();
  const [view, setView] = useState<CompositorView>();
  const [error, setError] = useState('');
  const renderers = useRef<{ native: CompositorRenderer; draft: CompositorRenderer }>();
  const inputs = compositorInputs(id, nodes, edges), document = draft ?? data.document;
  const revision = compositorRevision(document, inputs), pending = compositorPending(document, inputs);
  const output = imageOutput(nodes.find(node => node.id === id), 'result', nodes, edges)[0];
  const serialized = JSON.stringify({ document: compositorRenderDocument(document), inputs, draft: Boolean(draft) });
  const latest = useRef(revision); latest.current = revision;
  const previewSession = useRef(new CompositorPreviewSession());
  const generation = previewSession.current.update(Boolean(draft), `${Boolean(data.locked)}:${compositorRevision(data.document, inputs)}`);
  const patch = useCallback((document: CompositorDocument) => {
    const node = getNode(id);
    if (!isCompositorNode(node) || node.data.locked) return;
    setDraft(undefined);
    updateNodeData(id, { document });
    const valid = new Set(document.inputs.map(input => input.id));
    setEdges(current => current.filter(edge => edge.target !== id || valid.has(edge.targetHandle ?? '')));
  }, [getNode, id, updateNodeData, setEdges]);
  useEffect(() => { setDraft(undefined); }, [data.document, data.locked]);
  useEffect(() => {
    const native = new CompositorRenderer(false), draft = new CompositorRenderer(true);
    renderers.current = { native, draft };
    return () => { native.dispose(); draft.dispose(); renderers.current = undefined; };
  }, []);
  useEffect(() => {
    if (pending) { setView(undefined); setError(''); return; }
    const payload = JSON.parse(serialized) as { document: CompositorDocument; inputs: CompositorInputs; draft: boolean };
    const engines = renderers.current;
    if (!engines) return;
    let cancelled = false, nativeReady = false;
    const urls = payload.document.layers.flatMap(layer => layer.source.kind === 'asset' ? [layer.source.asset.url] : layer.source.kind === 'input' && layer.source.fallback ? [layer.source.fallback.url] : []);
    urls.push(...Object.values(payload.inputs).flatMap(input => input.asset ? [input.asset.url] : []));
    const release = assetResources.retain(urls);
    setError('');
    // Discrete edits (visibility, order, undo, typed values) need the same fast
    // feedback as a drag. Only the native job can publish workflow output.
    const render = (preview: boolean) => {
      const renderer = preview ? engines.draft : engines.native;
      return renderer.render(payload.document, payload.inputs).then(frame => {
        if (!frame) return;
        const currentRenderer = preview ? renderers.current?.draft : renderers.current?.native;
        if (currentRenderer !== renderer || !previewSession.current.accepts(generation)
          || (!payload.draft && (cancelled || latest.current !== revision))
          || (preview && nativeReady)) { frame.bitmap.close(); return; }
        if (!preview) nativeReady = true;
        const canvas = window.document.createElement('canvas'), scale = Math.min(1, 1536 / Math.max(frame.bitmap.width, frame.bitmap.height));
        canvas.width = Math.max(1, Math.round(frame.bitmap.width * scale)); canvas.height = Math.max(1, Math.round(frame.bitmap.height * scale));
        canvas.getContext('2d')?.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height); frame.bitmap.close();
        setView({ canvas, layout: frame.layout, revision });
        if (!frame.blob || preview) return;
        const node = getNode(id);
        if (!isCompositorNode(node) || node.data.locked || compositorRevision(node.data.document, compositorInputs(id, getNodes(), getEdges())) !== revision) return;
        if (node.data.result && node.data.outputRevision === revision) return;
        updateNodeData(id, { result: { id: crypto.randomUUID(), name: `${node.data.label || 'Compositor'}.png`, kind: 'image',
          url: assetResources.create(frame.blob), size: frame.blob.size, width: frame.layout.width, height: frame.layout.height }, outputRevision: revision });
      }).catch(error => {
        // A failed optional preview must not hide a successful native result.
        if (!cancelled && (!preview || payload.draft)) {
          nativeReady = true;
          setError(error instanceof Error ? error.message : '合成失败。'); setView(undefined);
        }
      });
    };
    void Promise.all(payload.draft ? [render(true)] : [render(true), render(false)]).finally(release);
    return () => { cancelled = true; };
  }, [id, serialized, revision, generation, pending, data.locked, getNode, getNodes, getEdges, updateNodeData]);
  const layout = view?.layout ?? compositorLayout(document, inputs);
  useEffect(() => internals(id), [id, data.document.inputs.length, layout.width, layout.height, internals]);
  const visibleView = pending || error ? undefined : view;
  return <>
    <header className="text-node-header"><div className="text-node-title"><Layers size={18} />{renaming
      ? <input autoFocus className="text-node-rename nodrag nopan" aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
        onBlur={() => { if (name.trim() && !data.locked) updateNodeData(id, { label: name.trim() }); setRenaming(false); }}
        onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
      : <span>{data.label || '合成器'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || '合成器'); setRenaming(true); }}><Ellipsis size={20} /></TextNodeMenu>
    </header>
    <div className="compositor-node-body" style={{ minHeight: data.document.inputs.length * 60 }}>
      <div className="compositor-node-preview nodrag nopan" role="group" aria-label="Composition preview controls" style={{ aspectRatio: `${layout.width} / ${layout.height}` }} aria-busy={!output && !error}>
        <CompositorCanvas view={visibleView} label="Compositor preview" />
        <div className="file-media-overlay compositor-node-overlay">
          <span className="compositor-node-size">{layout.width}x{layout.height}</span>
          <button className="file-icon-button compositor-download" aria-label="Download composition" title="Download image" disabled={!output || Boolean(draft)} onClick={() => { if (output) void downloadAsset(output).catch(() => setError('下载失败，请重试。')); }}><FileIcon name="download" /></button>
        </div>
      </div>
    </div>
    <footer className="compositor-node-footer nodrag nopan">
      <button className="compositor-add" disabled={data.locked || data.document.layers.length >= MAX_COMPOSITOR_LAYERS} onClick={() => patch(addCompositorInput(data.document))}><Plus size={20} strokeWidth={1.25} aria-hidden="true" /><span>Add layer</span></button>
      <button className="compositor-edit" onClick={() => setOpen(true)}><Pencil size={16} strokeWidth={1.5} aria-hidden="true" /><span>Edit</span></button>
    </footer>
    {data.document.inputs.map((input, index) => <div className="describer-port-wrapper" key={input.id}>
      <span className="describer-port-label sunburst-label-image" style={{ top: 61 + index * 60 }}>{input.name}</span>
      <Handle id={input.id} type="target" position={Position.Left} aria-label={`Compositor ${input.name}`} style={{ top: 89 + index * 60 }} className={`describer-port sunburst-port-image${inputs[input.id]?.connected ? ' is-connected' : ''}`} isConnectable={isConnectable && !data.locked} />
    </div>)}
    <span className="describer-port-label sunburst-label-image output-label" style={{ top: 61 }}>Output</span>
    <Handle id="result" type="source" position={Position.Right} aria-label="Compositor Output" style={{ top: 89 }} className="describer-port sunburst-port-image" isConnectable={isConnectable && !data.locked} />
    {(error || pending) && <div className="preview-error" role={error ? 'alert' : 'status'}>{error || '等待上游图片…'}</div>}
    {open && createPortal(<CompositorEditor id={id} name={data.label || '合成器'} document={document} inputs={inputs} view={visibleView}
      locked={Boolean(data.locked)} error={error} pending={pending || view?.revision !== revision || (!output && !draft)} previewing={Boolean(draft)} onDraft={setDraft} onChange={patch}
      onClose={() => { setDraft(undefined); setOpen(false); }} />, window.document.body)}
  </>;
}
