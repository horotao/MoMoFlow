import { useEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis } from 'lucide-react';
import { isResizeNode, isNodeLocked, type AppNode, type ResizeNode as Resize } from './types';
import { changeResizeDimension, resizeRevision, resizeSize, toggleResizeAspectRatio, validResizeSize } from './resize';
import { imageOutput } from './sunburstRun';
import { assetResources } from './assetResources';
import { downloadAsset } from './fileMedia';
import { FileIcon } from './FileIcon';
import { ResizeIcon, AspectRatioIcon } from './ResizeIcon';
import { ResizeDimension } from './ResizeDimension';
import { TextNodeMenu } from './TextNodeMenu';

export function ResizeNode({ id, data, isConnectable }: NodeProps<Resize>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const updateInternals = useUpdateNodeInternals();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? '', inputUrl = input?.url;
  const revision = resizeRevision(data, inputId);
  const output = imageOutput(nodes.find(node => node.id === id), 'result', nodes, edges)[0];
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement }>();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = loaded?.url === inputUrl ? loaded?.image : undefined;
  const sourceWidth = image?.naturalWidth ?? input?.width, sourceHeight = image?.naturalHeight ?? input?.height;
  const size = sourceWidth && sourceHeight ? resizeSize(data.settings, { width: sourceWidth, height: sourceHeight }) : undefined;
  const width = size?.width, height = size?.height;
  const patch = (value: Partial<Resize['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  const change = (axis: 'width' | 'height', value: number) => {
    const node = getNode(id);
    if (!isResizeNode(node) || node.data.locked || !sourceWidth || !sourceHeight) return;
    const settings = changeResizeDimension(node.data.settings, resizeSize(node.data.settings, { width: sourceWidth, height: sourceHeight }), axis, value);
    if (!settings) { setError('请输入有效尺寸：每边 1–16384 像素，总像素不超过 64 MP。'); return; }
    setError(''); updateNodeData(id, { settings });
  };

  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined); setError('');
    if (!inputUrl) return;
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = inputUrl;
    void img.decode().then(() => { if (!cancelled) setLoaded({ url: inputUrl, image: img }); })
      .catch(() => { if (!cancelled) setError('无法读取图片，请检查图片是否允许跨域访问。'); });
    return () => { cancelled = true; };
  }, [inputUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!image || !canvas.current) return;
    setError('');
    const currentNode = () => {
      const node = getNode(id), graph = getNodes(), connections = getEdges();
      if (cancelled || !isResizeNode(node) || node.data.locked) return;
      const edge = connections.find(item => item.target === id && item.targetHandle === 'image');
      const source = edge ? imageOutput(graph.find(item => item.id === edge.source), edge.sourceHandle, graph, connections)[0] : node.data.baseImage;
      return source && source.url === inputUrl && resizeRevision(node.data, source.id) === revision ? node : undefined;
    };
    void (async () => {
      const transform = resizeSize(data.settings, { width: image.naturalWidth, height: image.naturalHeight });
      if (!validResizeSize(transform)) throw new Error('Image too large');
      const native = document.createElement('canvas');
      native.width = transform.width; native.height = transform.height;
      const context = native.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, native.width, native.height);
      // Preview and PNG use the same native pixels; scaling never affects export.
      const preview = canvas.current!;
      const scale = Math.min(1, 1024 / Math.max(native.width, native.height));
      preview.width = Math.max(1, Math.round(native.width * scale));
      preview.height = Math.max(1, Math.round(native.height * scale));
      preview.getContext('2d')?.drawImage(native, 0, 0, preview.width, preview.height);
      const node = currentNode();
      if (!node || (node.data.result && node.data.outputRevision === revision)) return;
      const blob = await new Promise<Blob>((resolve, reject) => native.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed')), 'image/png'));
      if (!currentNode()) return;
      updateNodeData(id, { result: { id: crypto.randomUUID(), name: 'Resize.png', kind: 'image',
        url: assetResources.create(blob), size: blob.size, width: native.width, height: native.height }, outputRevision: revision });
    })().catch(() => { if (!cancelled) setError('无法调整图片尺寸，请使用每边不超过 16384 像素、总像素不超过 64 MP 的尺寸。'); });
    return () => { cancelled = true; };
  }, [id, image, inputUrl, revision, data.settings, data.locked, getNode, getNodes, getEdges, updateNodeData]);

  useEffect(() => updateInternals(id), [id, width, height, updateInternals]);

  return <>
    <header className="text-node-header">
      <div className="text-node-title"><ResizeIcon />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || '调整尺寸'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || '调整尺寸'); setRenaming(true); }}><Ellipsis size={24} /></TextNodeMenu>
    </header>
    <div className="preview-image nodrag nopan" aria-busy={Boolean(input && !output && !error && !data.locked)} style={{ aspectRatio: width && height ? `${width} / ${height}` : '1' }}>
      {image && <canvas ref={canvas} aria-label="Resize preview" />}
      {input && <div className="file-media-overlay">
        <div className="file-media-top resize-media-top">
          <button className="file-icon-button" type="button" aria-label="Download resized image" title="Download image" disabled={!output}
            onClick={() => { if (output) { setError(''); void downloadAsset(output).catch(() => setError('下载失败，请重试。')); } }}><FileIcon name="download" /></button>
        </div>
        {width && height && <span className="file-media-resolution">{width} × {height}</span>}
      </div>}
    </div>
    <div className="resize-controls nodrag nopan" onKeyDown={event => {
      if (!((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z')) event.stopPropagation();
    }}>
      <ResizeDimension key={`width-${inputId}`} axis="width" value={width} disabled={data.locked || !image} onCommit={value => change('width', value)} />
      <ResizeDimension key={`height-${inputId}`} axis="height" value={height} disabled={data.locked || !image} onCommit={value => change('height', value)} />
      <button type="button" role="checkbox" aria-label="Lock aspect ratio" aria-checked={data.settings.lockAspectRatio}
        title={data.settings.lockAspectRatio ? '锁定比例：宽高等比例调整' : '自由调整：分别设置宽高'} disabled={data.locked}
        onClick={() => patch({ settings: toggleResizeAspectRatio(data.settings) })}>
        <AspectRatioIcon locked={data.settings.lockAspectRatio} />
      </button>
      <button type="button" className="resize-reset" title="恢复原图尺寸" disabled={data.locked || !image}
        onClick={() => { setError(''); patch({ settings: { lockAspectRatio: data.settings.lockAspectRatio } }); }}>Reset</button>
    </div>
    {[{ handle: 'image', label: 'Input', output: false }, { handle: 'result', label: 'Output', output: true }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}>
        <span className={`describer-port-label sunburst-label-image${port.output ? ' output-label' : ''}`} style={{ top: 61 }}>{port.label}{!port.output && '*'}</span>
        <Handle id={port.handle} type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} style={{ top: 89 }}
          aria-label={`Resize ${port.label}`} className={`describer-port sunburst-port-image${connected ? ' is-connected' : ''}`}
          isConnectable={isConnectable && !data.locked} />
      </div>;
    })}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </>;
}
