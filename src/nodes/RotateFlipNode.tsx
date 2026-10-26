import { useEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis } from 'lucide-react';
import { isRotateFlipNode, isNodeLocked, type AppNode, type RotateFlipNode as RotateFlip } from './types';
import { changeRotateFlip, rotateFlipRevision, rotateFlipTransform, type RotateFlipAction } from './rotateFlip';
import { imageOutput } from './sunburstRun';
import { assetResources } from './assetResources';
import { downloadAsset } from './fileMedia';
import { FileIcon } from './FileIcon';
import { FlipIcon, RotateFlipIcon } from './RotateFlipIcon';
import { TextNodeMenu } from './TextNodeMenu';

export function RotateFlipNode({ id, data, isConnectable }: NodeProps<RotateFlip>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow<AppNode>();
  const updateInternals = useUpdateNodeInternals();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'image');
  const input = inputEdge ? imageOutput(nodes.find(node => node.id === inputEdge.source), inputEdge.sourceHandle, nodes, edges)[0] : data.baseImage;
  const inputId = input?.id ?? '', inputUrl = input?.url;
  const revision = rotateFlipRevision(data, inputId);
  const output = imageOutput(nodes.find(node => node.id === id), 'result', nodes, edges)[0];
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement }>();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = loaded?.url === inputUrl ? loaded?.image : undefined;
  const sourceWidth = image?.naturalWidth ?? input?.width, sourceHeight = image?.naturalHeight ?? input?.height;
  const size = sourceWidth && sourceHeight ? rotateFlipTransform(sourceWidth, sourceHeight, data.settings) : undefined;
  const width = size?.width, height = size?.height;
  const patch = (value: Partial<RotateFlip['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  const change = (action: RotateFlipAction) => {
    const node = getNode(id);
    if (isRotateFlipNode(node) && !node.data.locked) updateNodeData(id, { settings: changeRotateFlip(node.data.settings, action) });
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
      if (cancelled || !isRotateFlipNode(node) || node.data.locked) return;
      const edge = connections.find(item => item.target === id && item.targetHandle === 'image');
      const source = edge ? imageOutput(graph.find(item => item.id === edge.source), edge.sourceHandle, graph, connections)[0] : node.data.baseImage;
      return source && source.url === inputUrl && rotateFlipRevision(node.data, source.id) === revision ? node : undefined;
    };
    void (async () => {
      const transform = rotateFlipTransform(image.naturalWidth, image.naturalHeight, data.settings);
      const native = document.createElement('canvas');
      native.width = transform.width; native.height = transform.height;
      const context = native.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.setTransform(...transform.matrix);
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0);
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
      updateNodeData(id, { result: { id: crypto.randomUUID(), name: 'Rotate and flip.png', kind: 'image',
        url: assetResources.create(blob), size: blob.size, width: native.width, height: native.height }, outputRevision: revision });
    })().catch(() => { if (!cancelled) setError('无法旋转或翻转图片，请重试或更换可读取的图片。'); });
    return () => { cancelled = true; };
  }, [id, image, inputUrl, revision, data.settings, data.locked, getNode, getNodes, getEdges, updateNodeData]);

  useEffect(() => updateInternals(id), [id, width, height, updateInternals]);

  return <>
    <header className="text-node-header">
      <div className="text-node-title"><RotateFlipIcon />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || '旋转与翻转'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || '旋转与翻转'); setRenaming(true); }}><Ellipsis size={24} /></TextNodeMenu>
    </header>
    <div className="preview-image nodrag nopan" aria-busy={Boolean(input && !output && !error && !data.locked)} style={{ aspectRatio: width && height ? `${width} / ${height}` : '1' }}>
      {image && <canvas ref={canvas} aria-label="Rotate and flip preview" />}
      {input && <div className="file-media-overlay">
        <div className="file-media-top rotate-flip-media-top">
          <button className="file-icon-button" type="button" aria-label="Download rotated image" title="Download image" disabled={!output}
            onClick={() => { if (output) { setError(''); void downloadAsset(output).catch(() => setError('下载失败，请重试。')); } }}><FileIcon name="download" /></button>
        </div>
        {width && height && <span className="file-media-resolution">{width} × {height}</span>}
      </div>}
    </div>
    <div className="rotate-flip-controls nodrag nopan" onKeyDown={event => {
      if (!((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z')) event.stopPropagation();
    }}>
      <button type="button" aria-label="Rotate 90° clockwise" title="顺时针旋转 90°" disabled={data.locked} onClick={() => change('rotate')}><RotateFlipIcon /></button>
      <button type="button" aria-label="Flip horizontal" title="水平镜像翻转" aria-pressed={data.settings.flipHorizontal} disabled={data.locked} onClick={() => change('horizontal')}><FlipIcon /></button>
      <button type="button" aria-label="Flip vertical" title="垂直镜像翻转" aria-pressed={data.settings.flipVertical} disabled={data.locked} onClick={() => change('vertical')}><FlipIcon vertical /></button>
      <button type="button" className="rotate-flip-reset" title="重置旋转与翻转" disabled={data.locked} onClick={() => change('reset')}>Reset</button>
    </div>
    {[{ handle: 'image', label: 'Input', output: false }, { handle: 'result', label: 'Result', output: true }].map(port => {
      const connected = edges.some(edge => port.output ? edge.source === id && edge.sourceHandle === port.handle : edge.target === id && edge.targetHandle === port.handle);
      return <div className="describer-port-wrapper" key={port.handle}>
        <span className={`describer-port-label sunburst-label-image${port.output ? ' output-label' : ''}`} style={{ top: 61 }}>{port.label}{!port.output && '*'}</span>
        <Handle id={port.handle} type={port.output ? 'source' : 'target'} position={port.output ? Position.Right : Position.Left} style={{ top: 89 }}
          aria-label={`Rotate and flip ${port.label}`} className={`describer-port sunburst-port-image${connected ? ' is-connected' : ''}`}
          isConnectable={isConnectable && !data.locked && (port.output || !connected)} />
      </div>;
    })}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </>;
}
