import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { assetResources } from './assetResources';
import { Upload, Box, Music2 } from 'lucide-react';
import { Handle, Position, useEdges, useReactFlow, type NodeProps } from '@xyflow/react';
import { assetFromFile, assetFromLink, fileAccept, isFileNode } from './fileAsset';
import { extractFileAsset, fileAssets, fileNodeTitle, fileOutputKind, filePortColors, orderedAssets } from './fileCollection';
import { downloadAsset, downloadAssets, measureAsset } from './fileMedia';
import { FileIcon } from './FileIcon';
import { FileActionMenu } from './FileActionMenu';
import { FileGallery } from './FileGallery';
import { TextNodeMenu } from './TextNodeMenu';
import type { AppNode, FileAsset, FileNode as FileNodeType } from './types';

export function FileNode({ id, data, isConnectable }: NodeProps<FileNodeType>) {
  const { updateNodeData, getNode, setNodes, screenToFlowPosition } = useReactFlow<AppNode>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failedAssets, setFailedAssets] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const dragDepth = useRef(0);
  const importPending = useRef(false);
  const connected = useEdges().some((edge) => edge.source === id);
  const assets = orderedAssets(data).map((asset) => ({ ...asset, ...dimensions[asset.id] }));
  const activeIndex = Math.max(0, assets.findIndex((asset) => asset.id === data.activeAssetId));
  const asset = assets[activeIndex];
  const multiple = assets.length > 1;
  const grid = multiple && data.viewMode === 'all';
  const locked = Boolean(data.locked);
  const nodeTitle = fileNodeTitle(data);
  const kind = fileOutputKind(data);
  const select = (assetId: string) => updateNodeData(id, { activeAssetId: assetId });
  const append = (imported: FileAsset[]) => {
    if (!mounted.current) {
      assetResources.discard(imported.map(asset => asset.url));
      return;
    }
    // Read the latest node after asynchronous image decoding, so parallel edits are preserved.
    setNodes((nodes) => {
      if (!nodes.some(node => node.id === id && isFileNode(node) && !node.data.locked)) {
        assetResources.discard(imported.map(asset => asset.url));
        return nodes;
      }
      return nodes.map(node => node.id === id && isFileNode(node) ? {
        ...node, data: { ...node.data, asset: undefined, assets: [...fileAssets(node.data), ...imported], activeAssetId: imported[0].id },
      } : node);
    });
  };
  const importFiles = async (files: FileList | File[]) => {
    if (locked || importPending.current) return;
    importPending.current = true; setBusy(true);
    const imported: FileAsset[] = [];
    const errors: string[] = [];
    const importOwner = Symbol('importing files');
    try {
      for (const file of Array.from(files)) {
        try { imported.push(assetFromFile(file)); }
        catch (error) { errors.push(error instanceof Error ? error.message : 'Could not read file.'); }
      }
      assetResources.setReferences(importOwner, imported.map(asset => asset.url));
      const measured = await Promise.all(imported.map(measureAsset));
      if (measured.length) append(measured);
      setError(errors.join(' '));
    } catch (error) {
      assetResources.discard(imported.map(asset => asset.url));
      setError(error instanceof Error ? error.message : 'Could not read files.');
    } finally { assetResources.release(importOwner); importPending.current = false; setBusy(false); }
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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5V8.5M19.5 4.5H19a7 7 0 0 0-7 7V15m-3.5-3.5L12 15l3.5-3.5" /></svg>
      {renaming ? <input autoFocus className="file-node-rename nodrag nopan" aria-label="File node name"
        value={title} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setTitle(event.target.value)}
        onBlur={() => { if (title.trim()) updateNodeData(id, { label: title.trim() }); setRenaming(false); }}
        onKeyDown={(event) => { event.stopPropagation(); if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setRenaming(false);
        }} /> : <span className="file-node-title" title={nodeTitle}>{nodeTitle}</span>}
      <TextNodeMenu id={id} locked={locked} onRename={() => { setTitle(nodeTitle); setRenaming(true); }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
      </TextNodeMenu>
    </header>
    <div className={`file-node-media nodrag nopan nowheel${asset ? ' has-assets' : ''}${grid ? ' is-grid' : ''}${dragging ? ' is-dragging' : ''}`}
      style={!grid && asset?.width && asset.height ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}
      onDragEnter={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); if (!locked) { dragDepth.current++; setDragging(true); } }}
      onDragOver={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = locked ? 'none' : 'copy'; }}
      onDragLeave={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
      onDrop={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); void importFiles(event.dataTransfer.files); }}>
      {!asset ? <button type="button" className="file-node-upload" disabled={locked || busy} onClick={() => input.current?.click()}>
        <Upload size={24} strokeWidth={1.4} /><span>{busy ? 'Loading files…' : 'Drag & drop or click to upload'}</span>
      </button> : <>
        {grid ? <div className="file-node-grid" aria-label="Images">
          {[0, 1].map((column) => <div className="file-node-grid-column" key={column}>{assets.filter((_, index) => index % 2 === column).map((item) => <div key={item.id}
            className={`file-node-tile${item.id === asset.id ? ' is-active' : ''}`} role="button" tabIndex={0} aria-label={`Select ${item.name}`} aria-pressed={item.id === asset.id}
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
              <FileActionMenu label="Order by" heading="Order by" items={[
                { label: 'Date added', checked: data.orderBy !== 'name', action: () => updateNodeData(id, { orderBy: 'date' }) },
                { label: 'Name', checked: data.orderBy === 'name', action: () => updateNodeData(id, { orderBy: 'name' }) },
              ]}><FileIcon name="order" /></FileActionMenu>
              <button className="file-icon-button" aria-label={grid ? 'Download all' : 'Download current'} title={grid ? 'Download all' : 'Download current'} onClick={runDownload}><FileIcon name="download" /></button>
              <button className="file-icon-button" aria-label="Full screen" title="Full screen" onClick={() => setGallery(true)}><FileIcon name="fullscreen" /></button>
            </div>
          </div>
          {!grid && asset.width && asset.height && <span className="file-media-resolution">{asset.width}x{asset.height}</span>}
        </div>
      </>}
      {dragging && <div className="file-node-drop-hint">Drop to import</div>}
    </div>
    {asset ? <button type="button" className="file-node-add nodrag nopan" disabled={locked || busy} onClick={() => input.current?.click()}>{busy ? 'Loading files…' : `+ Add more ${kind === 'image' ? 'images' : 'files'}`}</button> : <form className="file-node-link nodrag nopan" onSubmit={(event) => {
      event.preventDefault(); if (locked || busy || !link.trim()) return;
      try {
        const linked = assetFromLink(link); setBusy(true);
        void measureAsset(linked).then((asset) => { append([asset]); setLink(''); setError(''); }).finally(() => setBusy(false));
      } catch (error) { setError(error instanceof Error ? error.message : 'Invalid file link.'); }
    }}>
      <input aria-label="Paste a file link" placeholder="Paste a file link" value={link} disabled={locked || busy}
        onChange={(event) => { setLink(event.target.value); setError(''); }} onKeyDown={(event) => event.stopPropagation()} />
    </form>}
    {error && <div className="file-node-error nodrag" role="alert">{error}</div>}
    <input ref={input} type="file" className="file-node-input" accept={fileAccept} multiple tabIndex={-1} aria-label="Choose files" disabled={locked || busy}
      onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} />
    <Handle id="file" type="source" position={Position.Right} isConnectable={isConnectable && !locked} aria-label={`${kind === 'image' ? 'Image' : 'File'} output`}
      style={{ '--file-port': filePortColors[kind] } as CSSProperties} className={`file-node-port${connected ? ' is-connected' : ''}`}>
      <span className="file-node-port-label">File</span>
    </Handle>
    {gallery && asset && <FileGallery assets={assets} activeId={asset.id} onSelect={select} onClose={() => setGallery(false)} />}
  </>;
}
