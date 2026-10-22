import { useEffect, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Contrast, Ellipsis, Eye, EyeOff } from 'lucide-react';
import { isInvertNode, isNodeLocked, type AppNode, type InvertNode as Invert } from './types';
import { imageOutput } from './sunburstRun';
import { invertPixels, invertRevision } from './invert';
import { assetResources } from './assetResources';
import { downloadAsset } from './fileMedia';
import { FileIcon } from './FileIcon';
import { TextNodeMenu } from './TextNodeMenu';

export function InvertNode({ id, data, isConnectable }: NodeProps<Invert>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const updateInternals = useUpdateNodeInternals();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? '', inputUrl = input?.url;
  const revision = invertRevision(inputId);
  const output = imageOutput(nodes.find(node => node.id === id), 'result', nodes, edges)[0];
  const [loaded, setLoaded] = useState<{ url: string; width: number; height: number }>();
  const [original, setOriginal] = useState(false);
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState('');
  const size = loaded?.url === inputUrl ? loaded : input;
  const width = size?.width, height = size?.height;
  const patch = (value: Partial<Invert['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };

  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined); setOriginal(false); setError('');
    if (!inputUrl) return;
    const sourceImage = new Image();
    sourceImage.crossOrigin = 'anonymous';
    sourceImage.src = inputUrl;
    const currentSource = () => {
      const node = getNode(id), graph = getNodes(), connections = getEdges();
      if (cancelled || !isInvertNode(node) || node.data.locked) return;
      const edge = connections.find(item => item.target === id && item.targetHandle === 'image');
      const source = edge ? imageOutput(graph.find(item => item.id === edge.source), edge.sourceHandle, graph, connections)[0] : node.data.baseImage;
      return source?.url === inputUrl && source.id === inputId ? node : undefined;
    };
    void sourceImage.decode().then(async () => {
      if (cancelled) return;
      const width = sourceImage.naturalWidth, height = sourceImage.naturalHeight;
      setLoaded({ url: inputUrl, width, height });
      const node = currentSource();
      if (!node || (node.data.result && node.data.outputRevision === revision)) return;
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(sourceImage, 0, 0);
      const pixels = context.getImageData(0, 0, width, height);
      pixels.data.set(invertPixels(pixels.data));
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed')), 'image/png'));
      if (!currentSource()) return;
      updateNodeData(id, { result: { id: crypto.randomUUID(), name: 'Invert.png', kind: 'image',
        url: assetResources.create(blob), size: blob.size, width, height }, outputRevision: revision });
    }).catch(() => { if (!cancelled) setError('无法反选图片，请检查图片是否可读取并允许跨域访问。'); });
    return () => { cancelled = true; };
  }, [id, inputId, inputUrl, revision, data.locked, getNode, getNodes, getEdges, updateNodeData]);

  useEffect(() => updateInternals(id), [id, width, height, updateInternals]);

  return <>
    <header className="text-node-header">
      <div className="text-node-title"><Contrast size={24} strokeWidth={1.3} />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || 'Invert'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || 'Invert'); setRenaming(true); }}><Ellipsis size={24} /></TextNodeMenu>
    </header>
    <div className="preview-image nodrag nopan" aria-busy={Boolean(input && !output && !error && !data.locked)} style={{ aspectRatio: width && height ? `${width} / ${height}` : '1' }}>
      {input && <>
        {(original || output) && <img src={original ? input.url : output?.url} alt={original ? 'Original image' : 'Inverted image'} draggable={false} />}
        <div className="file-media-overlay">
          <div className="file-media-top">
            <button className="file-icon-button" type="button" aria-label="Show original" title={original ? '显示反选效果' : '隐藏效果，查看原图'} aria-pressed={original}
              onClick={() => setOriginal(value => !value)} onKeyDown={event => event.stopPropagation()}>
              {original ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button className="file-icon-button" type="button" aria-label="Download inverted image" title="Download image" disabled={!output}
              onClick={() => { if (output) { setError(''); void downloadAsset(output).catch(() => setError('下载失败，请重试。')); } }}><FileIcon name="download" /></button>
          </div>
          {width && height && <span className="file-media-resolution">{width} × {height}</span>}
        </div>
      </>}
    </div>
    {[{ handle: 'image', label: 'Input', output: false }, { handle: 'result', label: 'Output', output: true }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}>
        <span className={`describer-port-label sunburst-label-image${port.output ? ' output-label' : ''}`} style={{ top: 61 }}>{port.label}{!port.output && '*'}</span>
        <Handle id={port.handle} type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} style={{ top: 89 }}
          aria-label={`Invert ${port.label}`} className={`describer-port sunburst-port-image${connected ? ' is-connected' : ''}`}
          isConnectable={isConnectable && !data.locked && (port.output || !connected)} />
      </div>;
    })}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </>;
}
