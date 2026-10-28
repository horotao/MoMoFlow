import { NodeIcon } from './NodeIcon';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { assetResources } from './assetResources';
import { Upload, Box, Music2 } from 'lucide-react';
import { Handle, Position, useEdges, useReactFlow, type NodeProps } from '@xyflow/react';
import { assetFromFile, assetFromLink, fileAccept, fileKind, isFileNode } from './fileAsset';
import { imageIteratorAccept, imageIteratorLimit } from './imageIterator';
import { isImageIteratorNode } from './types';
import { extractFileAsset, fileAssets, fileNodeTitle, fileOutputKind, filePortColors, orderedAssets } from './fileCollection';
import { copyAssetImage, downloadAsset, downloadAssets, measureAsset } from './fileMedia';
import { FileIcon } from './FileIcon';
import { FileActionMenu } from './FileActionMenu';
import { FileGallery } from './FileGallery';
import { TextNodeMenu } from './TextNodeMenu';
import type { AppNode, FileAsset, ImageIteratorNode as ImageIteratorNodeType, FileNode as FileNodeType } from './types';

const isCollection = (node: AppNode | undefined): node is FileNodeType | ImageIteratorNodeType => Boolean(node && (isFileNode(node) || isImageIteratorNode(node)));

export function FileNode({ id, data, type, isConnectable }: NodeProps<FileNodeType | ImageIteratorNodeType>) {
  const iterator = type === 'image-iterator';
  const { updateNodeData, getNode, setNodes, screenToFlowPosition } = useReactFlow<AppNode>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failedAssets, setFailedAssets] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [contextAssetId, setContextAssetId] = useState<string>();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const dragDepth = useRef(0);
  const importPending = useRef(false);
  const importVersion = useRef(0);
  const connected = useEdges().some((edge) => edge.source === id);
  const assets = orderedAssets(data).map((asset) => ({ ...asset, ...dimensions[asset.id] }));
  const activeIndex = Math.max(0, assets.findIndex((asset) => asset.id === data.activeAssetId));
  const asset = assets[activeIndex];
  const contextAsset = assets.find(item => item.id === contextAssetId) ?? asset;
  const multiple = assets.length > 1;
  const grid = multiple && (iterator ? data.viewMode !== 'single' : data.viewMode === 'all');
  const locked = Boolean(data.locked);
  const nodeTitle = iterator ? data.label || '图片迭代' : fileNodeTitle(data);
  const kind = iterator ? 'image' : fileOutputKind(data);
  const select = (assetId: string) => { if (!iterator || !locked) updateNodeData(id, { activeAssetId: assetId }); };
  const append = (imported: FileAsset[], version: number) => {
    if (!mounted.current || version !== importVersion.current) {
      assetResources.discard(imported.map(asset => asset.url));
      return;
    }
    // Read the latest node after asynchronous image decoding, so parallel edits are preserved.
    setNodes((nodes) => {
      const current = nodes.find(node => node.id === id);
      if (!isCollection(current) || current.data.locked || version !== importVersion.current) {
        assetResources.discard(imported.map(asset => asset.url));
        return nodes;
      }
      if (iterator && fileAssets(current.data).length + imported.length > imageIteratorLimit) {
        assetResources.discard(imported.map(asset => asset.url));
        setError(`最多支持 ${imageIteratorLimit} 张图片，请减少本次添加的数量。`);
        return nodes;
      }
      return nodes.map(node => node.id === id && isCollection(node) ? {
        ...node, data: { ...node.data, asset: undefined, assets: [...fileAssets(node.data), ...imported], activeAssetId: imported[0].id },
      } : node);
    });
  };
  const importFiles = async (files: FileList | File[]) => {
    if (locked || importPending.current) return;
    const version = ++importVersion.current;
    importPending.current = true; setBusy(true);
    const imported: FileAsset[] = [];
    const errors: string[] = [];
    const importOwner = Symbol('importing files');
    try {
      for (const file of Array.from(files)) {
        try {
          if (iterator && fileKind(file.name, file.type) !== 'image') throw new Error(`${file.name}：请选择图片文件。`);
          imported.push(assetFromFile(file));
        }
        catch (error) { errors.push(error instanceof Error ? error.message : 'Could not read file.'); }
      }
      assetResources.setReferences(importOwner, imported.map(asset => asset.url));
      const measured = await Promise.all(imported.map(measureAsset));
      if (mounted.current && version === importVersion.current) setError(errors.join(' '));
      if (measured.length) append(measured, version);
    } catch (error) {
      assetResources.discard(imported.map(asset => asset.url));
      if (mounted.current && version === importVersion.current) setError(error instanceof Error ? error.message : 'Could not read files.');
    } finally {
      assetResources.release(importOwner);
      if (version === importVersion.current) { importPending.current = false; if (mounted.current) setBusy(false); }
    }
  };
  const importLink = async () => {
    if (locked || importPending.current || !link.trim()) return;
    const version = ++importVersion.current;
    importPending.current = true; setBusy(true); setError('');
    try {
      const linked = assetFromLink(link);
      if (iterator && linked.kind !== 'image') throw new Error('图片迭代只支持图片链接。');
      const measured = await measureAsset(linked);
      if (iterator && (!measured.width || !measured.height)) throw new Error('无法读取图片，请检查链接后重试。');
      append([measured], version);
      if (mounted.current && version === importVersion.current) setLink('');
    } catch (error) {
      if (mounted.current && version === importVersion.current) setError(error instanceof Error ? error.message : '无法导入链接。');
    } finally {
      if (version === importVersion.current) { importPending.current = false; if (mounted.current) setBusy(false); }
    }
  };
  const runDownload = () => {
    setError('');
    void (grid ? downloadAssets(assets) : downloadAsset(asset)).catch((error: unknown) => setError(error instanceof Error ? error.message : 'Could not download file.'));
  };
  const preview = (item: FileAsset) => <>
    {item.kind === 'image' && !failedAssets.includes(item.id) && <img src={item.url} alt={item.name} draggable={false}
      onLoad={(event) => {
        const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
        if (item.width !== width || item.height !== height) setDimensions((current) => ({ ...current, [item.id]: { width, height } }));
      }} onError={() => setFailedAssets((current) => [...current, item.id])} />}
    {item.kind === 'video' && <video src={item.url} controls preload="metadata" onLoadedMetadata={(event) => {
      const { videoWidth: width, videoHeight: height } = event.currentTarget;
      if (width && height) setDimensions((current) => ({ ...current, [item.id]: { width, height } }));
    }} />}
    {item.kind === 'audio' && <div className="file-node-file"><Music2 size={40} strokeWidth={1} /><span>{item.name}</span><audio src={item.url} controls /></div>}
    {item.kind === '3d' && <div className="file-node-file"><Box size={48} strokeWidth={1} /><span>{item.name}</span><small>3D file · Preview unavailable</small></div>}
    {failedAssets.includes(item.id) && <div className="file-node-preview-error" role="status">Preview unavailable. Check the file format or link.</div>}
  </>;
  return <>
    <header className="file-node-header">
      <NodeIcon nodeType={iterator ? 'image-iterator' : 'file'} />
      {renaming ? <input autoFocus className="file-node-rename nodrag nopan" aria-label="File node name"
        value={title} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setTitle(event.target.value)}
        onBlur={() => { if (title.trim()) updateNodeData(id, { label: title.trim() }); setRenaming(false); }}
        onKeyDown={(event) => { event.stopPropagation(); if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setRenaming(false);
        }} /> : <span className="file-node-title" title={nodeTitle}>{nodeTitle}</span>}
      <TextNodeMenu id={id} locked={locked} onRename={() => { setTitle(nodeTitle); setRenaming(true); }} onClear={iterator ? () => {
        const current = getNode(id);
        if (!isImageIteratorNode(current) || current.data.locked) return;
        importVersion.current++; importPending.current = false; setBusy(false); setError('');
        updateNodeData(id, { asset: undefined, assets: [], activeAssetId: undefined });
      } : undefined}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
      </TextNodeMenu>
    </header>
    <div ref={media} tabIndex={iterator ? 0 : undefined} className={`file-node-media nodrag nopan nowheel${asset ? ' has-assets' : ''}${grid ? ' is-grid' : ''}${dragging ? ' is-dragging' : ''}`}
      style={!grid && asset?.width && asset.height ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}
      onDragEnter={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); if (!locked) { dragDepth.current++; setDragging(true); } }}
      onDragOver={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = locked ? 'none' : 'copy'; }}
      onDragLeave={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
      onDrop={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); void importFiles(event.dataTransfer.files); }}>
      {!asset ? <button type="button" className="file-node-upload" disabled={locked || busy} onClick={() => input.current?.click()}>
        <Upload size={24} strokeWidth={1.4} /><span>{iterator ? busy ? '正在读取图片…' : '拖放图片或点击上传' : busy ? 'Loading files…' : 'Drag & drop or click to upload'}</span>
      </button> : <>
        {grid ? <div className="file-node-grid" aria-label="Images">
          {[0, 1].map((column) => <div className="file-node-grid-column" key={column}>{assets.filter((_, index) => index % 2 === column).map((item) => <div key={item.id}
            className={`file-node-tile${item.id === asset.id ? ' is-active' : ''}`} data-asset-id={item.id} role="button" tabIndex={0} aria-label={`Select ${item.name}`} aria-pressed={item.id === asset.id}
            draggable={!locked} onClick={() => select(item.id)} onDoubleClick={() => { select(item.id); setGallery(true); }}
            onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(item.id); } }}
            onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-momoflow-asset', item.id); }}
            onDragEnd={(event) => {
              event.stopPropagation();
              // Escape cancellation reports no completed drop; a pane drop is the only extraction target.
              if (event.dataTransfer.dropEffect !== 'move') return;
              const target = document.elementFromPoint(event.clientX, event.clientY);
              if (!target?.classList.contains('react-flow__pane') || !getNode(id)) return;
              const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              setNodes((nodes) => extractFileAsset(nodes, id, item.id, position, `file-${crypto.randomUUID()}`));
            }}>
            {preview(item)}
          </div>)}</div>)}
        </div> : <div className="file-node-single" onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('video,audio')) setGallery(true); }}>{preview(asset)}</div>}
        <div className="file-media-overlay">
          <div className="file-media-top">
            <div className="file-media-navigation">{multiple && <>
              <button className="file-icon-button" aria-label={grid ? 'All' : 'Single'} title={grid ? 'All' : 'Single'} onClick={() => updateNodeData(id, { viewMode: grid ? 'single' : 'all' })}>{grid ? <FileIcon name="grid" /> : <FileIcon name="single" />}</button>
              {grid ? <span>{assets.length} images</span> : <>
                <button className="file-icon-button" aria-label="Previous item" title="Previous item" onClick={() => select(assets[(activeIndex - 1 + assets.length) % assets.length].id)}><FileIcon name="previous" /></button>
                <span>{activeIndex + 1} / {assets.length}</span>
                <button className="file-icon-button" aria-label="Next item" title="Next item" onClick={() => select(assets[(activeIndex + 1) % assets.length].id)}><FileIcon name="next" /></button>
              </>}
            </>}</div>
            <div className="file-media-tools">
              <FileActionMenu label="排序方式" heading="排序方式" items={[
                { label: '添加时间', checked: data.orderBy !== 'name', action: () => updateNodeData(id, { orderBy: 'date' }) },
                { label: '名称', checked: data.orderBy === 'name', action: () => updateNodeData(id, { orderBy: 'name' }) },
              ]} disabled={iterator && locked}><FileIcon name="order" /></FileActionMenu>
              {!iterator && <><button className="file-icon-button" aria-label={grid ? 'Download all' : 'Download current'} title={grid ? 'Download all' : 'Download current'} onClick={runDownload}><FileIcon name="download" /></button>
              <button className="file-icon-button" aria-label="Full screen" title="Full screen" onClick={() => setGallery(true)}><FileIcon name="fullscreen" /></button></>}
            </div>
          </div>
          {!grid && asset.width && asset.height && <span className="file-media-resolution">{asset.width}x{asset.height}</span>}
        </div>
      </>}
      {dragging && <div className="file-node-drop-hint">Drop to import</div>}
    </div>
    {iterator && asset && <FileActionMenu label="图片操作" contextTarget={media} onContextOpen={target => {
      setContextAssetId(target instanceof Element ? target.closest<HTMLElement>('[data-asset-id]')?.dataset.assetId ?? asset.id : asset.id);
    }} items={[
      { label: '下载图片', action: () => { void downloadAsset(contextAsset).catch(error => setError(error instanceof Error ? error.message : '下载失败。')); } },
      { label: '下载全部', action: () => { void downloadAssets(assets).catch(error => setError(error instanceof Error ? error.message : '下载失败。')); } },
      { label: '设为封面', disabled: locked, action: () => select(contextAsset.id) },
      { label: '复制图片', action: () => { void copyAssetImage(contextAsset).catch(error => setError(error instanceof Error ? error.message : '复制图片失败。')); } },
    ]} />}
    {asset ? <button type="button" className="file-node-add nodrag nopan" disabled={locked || busy || (iterator && assets.length >= imageIteratorLimit)} onClick={() => input.current?.click()}>{iterator ? busy ? '正在读取图片…' : '+ 添加更多图片' : busy ? 'Loading files…' : `+ Add more ${kind === 'image' ? 'images' : 'files'}`}</button> : <form className="file-node-link nodrag nopan" onSubmit={(event) => { event.preventDefault(); void importLink(); }}>
      <input aria-label={iterator ? '粘贴图片链接' : 'Paste a file link'} placeholder={iterator ? '粘贴图片链接' : 'Paste a file link'} value={link} disabled={locked || busy}
        onChange={(event) => { setLink(event.target.value); setError(''); }} onKeyDown={(event) => event.stopPropagation()} />
    </form>}
    {error && <div className="file-node-error nodrag" role="alert">{error}</div>}
    <input ref={input} type="file" className="file-node-input" accept={iterator ? imageIteratorAccept : fileAccept} multiple tabIndex={-1} aria-label={iterator ? '选择图片' : 'Choose files'} disabled={locked || busy}
      onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} />
    <Handle id="file" type="source" position={Position.Right} isConnectable={isConnectable && !locked} aria-label={`${kind === 'image' ? 'Image' : 'File'} output`}
      style={{ '--file-port': filePortColors[kind] } as CSSProperties} className={`file-node-port${connected ? ' is-connected' : ''}`}>
      <span className="file-node-port-label">File</span>
    </Handle>
    {gallery && asset && <FileGallery assets={assets} activeId={asset.id} onSelect={select} onClose={() => setGallery(false)} />}
  </>;
}
