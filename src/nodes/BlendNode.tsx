import { useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Droplet, Ellipsis } from 'lucide-react';
import { isBlendNode, isNodeLocked, type AppNode, type BlendNode as Blend } from './types';
import { blendRevision, type BlendSettings } from './blend';
import { BlendRenderer } from './blendRender';
import { BlendControls } from './BlendControls';
import { blendInputs, imageOutput } from './sunburstRun';
import { assetResources } from './assetResources';
import { TextNodeMenu } from './TextNodeMenu';

export function BlendNode({ id, data, isConnectable }: NodeProps<Blend>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const updateInternals = useUpdateNodeInternals();
  const inputs = blendInputs({ id, data }, nodes, edges);
  const back = inputs.back, front = inputs.front;
  const sourceKey = JSON.stringify([back?.url, front?.url, inputs.pending]);
  const [loaded, setLoaded] = useState<{ key: string; renderer: BlendRenderer; width: number; height: number }>();
  const [draft, setDraft] = useState<BlendSettings>();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState('');
  const [painted, setPainted] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const settings = draft ?? data.settings;
  const revision = blendRevision(data.settings, back, front);
  const current = loaded?.key === sourceKey ? loaded : undefined;
  const output = imageOutput(nodes.find(node => node.id === id), 'result', nodes, edges)[0];
  const cancel = useCallback(() => setDraft(undefined), []);
  const patch = (value: Partial<Blend['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  const commit = (value: BlendSettings) => { cancel(); if (JSON.stringify(value) !== JSON.stringify(data.settings)) patch({ settings: value }); };
  useEffect(cancel, [cancel, data.settings, data.locked, sourceKey]);

  useEffect(() => {
    let cancelled = false, renderer: BlendRenderer | undefined;
    const bitmaps: ImageBitmap[] = [];
    const release = assetResources.retain([back?.url, front?.url].filter((url): url is string => Boolean(url)));
    setLoaded(undefined); setError(''); setPainted('');
    if (inputs.pending || (!back?.url && !front?.url)) { release(); return; }
    const load = async (url?: string) => {
      if (!url) return;
      const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url;
      await image.decode();
      const bitmap = await createImageBitmap(image, { premultiplyAlpha: 'none' });
      if (cancelled) { bitmap.close(); return; }
      bitmaps.push(bitmap); return bitmap;
    };
    void Promise.allSettled([load(back?.url), load(front?.url)]).then(results => {
      if (cancelled) return;
      if (results.some(result => result.status === 'rejected')) throw new Error('Decode failed');
      const sources = results.map(result => result.status === 'fulfilled' ? result.value : undefined);
      const reference = sources[0] ?? sources[1];
      if (!reference) return;
      const width = reference.width, height = reference.height;
      renderer = new BlendRenderer({ back: sources[0], front: sources[1] });
      setLoaded({ key: sourceKey, renderer, width, height });
    }).catch(() => { if (!cancelled) setError('无法读取图片，请检查图片是否允许跨域访问。'); })
      .finally(() => { release(); if (!renderer) bitmaps.forEach(bitmap => bitmap.close()); });
    return () => { cancelled = true; renderer?.dispose(); bitmaps.forEach(bitmap => bitmap.close()); release(); };
  }, [sourceKey, back?.url, front?.url, inputs.pending]);

  useEffect(() => {
    let cancelled = false;
    if (!current || !canvas.current) return;
    setError('');
    const valid = () => {
      const node = getNode(id);
      if (cancelled || !isBlendNode(node)) return;
      const input = blendInputs(node, getNodes(), getEdges());
      if (input.pending || blendRevision(node.data.settings, input.back, input.front) !== revision || input.back?.url !== back?.url || input.front?.url !== front?.url) return;
      return node;
    };
    void current.renderer.render(settings, !draft && !data.locked && !output, Boolean(draft)).then(frame => {
      if (!frame) return;
      try {
        if (!valid()) return;
        if (frame.bitmap && canvas.current) {
          canvas.current.width = frame.bitmap.width; canvas.current.height = frame.bitmap.height;
          canvas.current.getContext('2d')?.drawImage(frame.bitmap, 0, 0);
          setPainted(sourceKey);
        }
        const node = valid();
        if (frame.blob && node && !node.data.locked && !draft && node.data.outputRevision !== revision) {
          updateNodeData(id, { result: { id: crypto.randomUUID(), name: 'Blend.png', kind: 'image', url: assetResources.create(frame.blob), size: frame.blob.size, width: frame.width, height: frame.height }, outputRevision: revision });
        }
      } finally { frame.bitmap?.close(); }
    }).catch(() => { if (!cancelled) setError('无法合成图片，请更换可读取的图片后重试。'); });
    return () => { cancelled = true; };
  }, [id, current, settings, draft, revision, sourceKey, data.locked, output, back?.url, front?.url, getNode, getNodes, getEdges, updateNodeData]);
  useEffect(() => updateInternals(id), [id, current?.width, current?.height, updateInternals]);

  return <>
    <header className="text-node-header">
      <div className="text-node-title"><Droplet size={24} strokeWidth={1} />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || 'Blend'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || 'Blend'); setRenaming(true); }}><Ellipsis size={24} /></TextNodeMenu>
    </header>
    <div className="preview-image nodrag nopan" aria-busy={Boolean((back || front) && !output && !error && !data.locked)} style={{ aspectRatio: current ? `${current.width} / ${current.height}` : '1' }}>
      <canvas ref={canvas} aria-label="Blend preview" style={{ visibility: painted === sourceKey && current ? 'visible' : 'hidden' }} />
    </div>
    <BlendControls settings={settings} disabled={Boolean(data.locked)} onDraft={setDraft} onCommit={commit} onCancel={cancel} />
    {[{ handle: 'back', label: 'Back', top: 89 }, { handle: 'front', label: 'Front', top: 149 }, { handle: 'result', label: 'Result', top: 89 }].map(port => {
      const output = port.handle === 'result';
      const connected = edges.some(edge => output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}>
        <span className={`describer-port-label sunburst-label-image${output ? ' output-label' : ''}`} style={{ top: port.top - 28 }}>{port.label}</span>
        <Handle id={port.handle} type={output ? 'source' : 'target'} position={output ? Position.Right : Position.Left} style={{ top: port.top }} aria-label={`Blend ${port.label}`}
          className={`describer-port sunburst-port-image${connected ? ' is-connected' : ''}`} isConnectable={isConnectable && !data.locked && (output || !connected)} />
      </div>;
    })}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </>;
}
