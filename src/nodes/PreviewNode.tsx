import { cropLivePreviews } from './cropLivePreview';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis, Eye } from 'lucide-react';
import type { AppNode, PreviewNode as Preview } from './types';
import { isNodeLocked } from './types';
import { previewImages } from './preview';
import { TextNodeMenu } from './TextNodeMenu';
import { FileIcon } from './FileIcon';
import { FileGallery } from './FileGallery';
import { downloadAsset } from './fileMedia';
import { painterLivePreviews } from './painterLivePreview';

export function PreviewNode({ id, data, isConnectable }: NodeProps<Preview>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const internals = useUpdateNodeInternals();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [fullscreen, setFullscreen] = useState(false), [viewId, setViewId] = useState('');
  const [failedUrl, setFailedUrl] = useState(''), [error, setError] = useState('');
  const [measured, setMeasured] = useState<{ url: string; width: number; height: number }>();
  const inputEdge = edges.find(edge => edge.target === id && edge.targetHandle === 'file');
  const source = nodes.find(node => node.id === inputEdge?.source);
  const painterId = source?.type === 'painter' && ['result', 'mask'].includes(inputEdge?.sourceHandle ?? '') ? source.id : undefined;
  const live = useSyncExternalStore(
    useCallback(listener => painterLivePreviews.subscribe(painterId, listener), [painterId]),
    useCallback(() => painterLivePreviews.get(painterId), [painterId]),
  );
  const cropId = source?.type === 'crop' ? source.id : undefined;
  const cropLive = useSyncExternalStore(
    useCallback(listener => cropLivePreviews.subscribe(cropId, listener), [cropId]),
    useCallback(() => cropLivePreviews.get(cropId), [cropId]),
  );
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const assets = previewImages(id, nodes, edges);
  const active = assets.find(asset => asset.id === data.activeAssetId) ?? assets[0];
  const activeUrl = active?.url;
  const index = Math.max(0, assets.findIndex(asset => asset.id === active?.id));
  const connected = edges.some(edge => edge.target === id && edge.targetHandle === 'file');
  const size = cropLive ?? live ?? (measured?.url === active?.url ? measured : active);
  const aspectRatio = size?.width && size.height ? `${size.width} / ${size.height}` : '1';
  const patch = (value: Partial<Preview['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  const show = () => { if (active && !live?.drawing && !cropLive && active.url !== failedUrl) { setViewId(active.id); setFullscreen(true); } };
  useLayoutEffect(() => {
    const target = liveCanvas.current;
    if (!target || (!live && !cropLive)) return;
    const image = cropLive?.canvas ?? (inputEdge?.sourceHandle === 'mask' ? live!.mask : live!.result);
    target.width = image.width; target.height = image.height;
    target.getContext('2d')?.drawImage(image, 0, 0);
  }, [live, cropLive, inputEdge?.sourceHandle]);
  useEffect(() => internals(id), [id, aspectRatio, internals]);
  useEffect(() => { if (!activeUrl) setFullscreen(false); setError(''); }, [activeUrl]);

  return <>
    <header className="text-node-header">
      <div className="text-node-title"><Eye size={18} strokeWidth={1.3} />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name}
          onChange={event => setName(event.target.value)} onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || 'Preview'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || 'Preview'); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu>
    </header>
    <div className={`preview-image${active || live || cropLive ? ' has-image' : ''}`} style={{ aspectRatio }}>
      {live || cropLive || (active && active.url !== failedUrl) ? <>
        {live || cropLive ? <canvas ref={liveCanvas} aria-label={cropLive ? 'Live Crop preview' : `Live Painter ${inputEdge?.sourceHandle === 'mask' ? 'Mask' : 'Result'} preview`} data-drawing={Boolean(cropLive) || live?.drawing}
          onDoubleClick={event => { event.stopPropagation(); show(); }} /> : active && <img key={active.url} src={active.url} alt={active.name} draggable={false} onDoubleClick={event => { event.stopPropagation(); show(); }}
          onLoad={event => setMeasured({ url: active.url, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => setFailedUrl(active.url)} />}
        <div className="file-media-overlay nodrag nopan">
          <div className="file-media-top"><div className="file-media-navigation">{assets.length > 1 && <>
            <button className="file-icon-button" aria-label="Previous image" disabled={data.locked} onClick={() => patch({ activeAssetId: assets[(index + assets.length - 1) % assets.length].id })}><FileIcon name="previous" /></button>
            <span>{index + 1} / {assets.length}</span>
            <button className="file-icon-button" aria-label="Next image" disabled={data.locked} onClick={() => patch({ activeAssetId: assets[(index + 1) % assets.length].id })}><FileIcon name="next" /></button>
          </>}</div><div className="file-media-tools">
            <button className="file-icon-button" aria-label="Download preview" title="Download" disabled={!active || live?.drawing || Boolean(cropLive)} onClick={() => { if (!active) return; setError(''); void downloadAsset(active).catch(() => setError('下载失败，请重试。')); }}><FileIcon name="download" /></button>
            <button className="file-icon-button" aria-label="Full screen preview" title="Full screen" disabled={!active || live?.drawing || Boolean(cropLive)} onClick={show}><FileIcon name="fullscreen" /></button>
          </div></div>
          {size?.width && size.height && <span className="file-media-resolution">{size.width} × {size.height}</span>}
        </div>
      </> : active && <div className="preview-empty" role="status"><span>Image unavailable</span></div>}
    </div>
    <span className="describer-port-label preview-port-label" style={{ top: 61 }}>File</span>
    <Handle id="file" type="target" position={Position.Left} className={`describer-port preview-port${connected ? ' is-connected' : ''}`}
      style={{ top: 89 }} aria-label="Preview image input" isConnectable={isConnectable && !connected} />
    {fullscreen && active && <FileGallery assets={assets.map(asset => measured?.url === asset.url ? { ...asset, width: measured.width, height: measured.height } : asset)} activeId={viewId} onSelect={setViewId} onClose={() => setFullscreen(false)} />}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </>;
}
