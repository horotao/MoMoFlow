import { NodeIcon } from './NodeIcon';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { assetResources } from './assetResources';
import { Box, Music2 } from 'lucide-react';
import { Handle, Position, useEdges, useReactFlow, type NodeProps } from '@xyflow/react';
import { assetFromFile, assetFromLink, fileAccept, isFileNode } from './fileAsset';
import { activeFileAsset, fileAssets, fileNodeTitle, fileOutputKind, filePortColors, orderedAssets } from './fileCollection';
import { downloadAsset, downloadAssets, measureAsset } from './fileMedia';
import { FileGallery, type FileGalleryTrigger } from './FileGallery';
import { TextNodeMenu } from './TextNodeMenu';
import { NodePort } from './shared/NodePort';
import { NodeFrame } from './shared/NodeFrame';
import { NodeImagePreview } from './shared/NodeImagePreview';
import { InteractiveEditButton } from './shared/InteractiveEditButton';
import { FileImageAnnotations } from './FileImageAnnotations';
import { annotationLimit, annotationLimitMessage } from './interactiveEdit';
import { useImageAnnotations } from './useImageAnnotations';
import './shared/mediaNodeStyle.css';
import type { AppNode, FileAsset, FileNode as FileNodeType } from './types';

export function FileNode({ id, data, isConnectable }: NodeProps<FileNodeType>) {
  const { updateNodeData, setNodes } = useReactFlow<AppNode>();
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
  const [gallery, setGallery] = useState<{ assetId: string; transition?: FileGalleryTrigger }>();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const dragDepth = useRef(0);
  const importPending = useRef(false);
  const importVersion = useRef(0);
  const connected = useEdges().some((edge) => edge.source === id);
  const assets = orderedAssets(data).map((asset) => ({ ...asset, ...dimensions[asset.id] }));
  const asset = activeFileAsset(data, assets);
  const multiple = assets.length > 1;
  const locked = Boolean(data.locked);
  const canAnnotate = asset?.kind === 'image';
  const canEdit = canAnnotate && isConnectable && !locked && !failedAssets.includes(asset.id);
  const annotations = useImageAnnotations(id, asset, 'annotations' in data ? data.annotations : undefined, canEdit);
  const { editing, toggle: toggleAnnotations, onKeyDown: annotationKeyDown, button: annotationToggle } = annotations;
  const { marks } = annotations.editor;
  const grid = !editing && multiple && (data.viewMode === 'all');
  const draggableImage = !grid && !editing && asset?.kind === 'image' && !locked;
  const nodeTitle = fileNodeTitle(data);
  const kind = fileOutputKind(data);
  const select = (assetId: string) => { updateNodeData(id, { activeAssetId: assetId }); };
  const canViewImage = (item: FileAsset) => item.kind === 'image' && !failedAssets.includes(item.id);
  const showGallery = (item: FileAsset, trigger: HTMLElement, keyboard: boolean) => {
    setGallery({ assetId: item.id, transition: canViewImage(item) ? { trigger, keyboard } : undefined });
  };
  const append = (imported: FileAsset[], version: number) => {
    if (!mounted.current || version !== importVersion.current) {
      assetResources.discard(imported.map(asset => asset.url));
      return;
    }
    // Read the latest node after asynchronous image decoding, so parallel edits are preserved.
    setNodes((nodes) => {
      const current = nodes.find(node => node.id === id);
      if (!isFileNode(current) || current.data.locked || version !== importVersion.current) {
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
    const version = ++importVersion.current;
    importPending.current = true; setBusy(true);
    const imported: FileAsset[] = [];
    const errors: string[] = [];
    const importOwner = Symbol('importing files');
    try {
      for (const file of Array.from(files)) {
        try {

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

      const measured = await measureAsset(linked);

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
  const titleField = renaming ? <input autoFocus className="file-node-rename nodrag nopan" aria-label="File node name"
        value={title} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setTitle(event.target.value)}
        onBlur={() => { if (title.trim()) updateNodeData(id, { label: title.trim() }); setRenaming(false); }}
        onKeyDown={(event) => { event.stopPropagation(); if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setRenaming(false);
        }} /> : <span className="file-node-title" title={nodeTitle}>{nodeTitle}</span>;
  const nodeMenu = <TextNodeMenu appearance="shared" id={id} locked={locked} onRename={() => { setTitle(nodeTitle); setRenaming(true); }}>
        <img src="/node-style/more.svg" width={18} height={18} alt="" className="node-monochrome" />
      </TextNodeMenu>;
  const content = <>
    {<header className="file-node-header"><NodeIcon nodeType="file" />{titleField}{nodeMenu}</header>}
    <div ref={media} className={`file-node-media${draggableImage ? '' : ' nodrag'} nopan nowheel${asset ? ' has-assets' : ''}${grid ? ' is-grid' : ''}${dragging ? ' is-dragging' : ''}`}
      style={!grid && asset?.width && asset.height ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}
      onKeyDown={annotationKeyDown}
      onDragEnter={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); if (!locked) { dragDepth.current++; setDragging(true); } }}
      onDragOver={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = locked ? 'none' : 'copy'; }}
      onDragLeave={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
      onDrop={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); void importFiles(event.dataTransfer.files); }}>
      {!asset ? <button type="button" className="file-node-upload" disabled={locked || busy} onClick={() => input.current?.click()}>
        <img src="/image-node/upload.svg" width={24} height={24} alt="" /><span>{busy ? '正在读取文件…' : '拖放文件或点击上传'}</span>{<small>图片 · 视频 · 音频 · 3D</small>}
      </button> : editing ? <FileImageAnnotations key={`${asset.id}:${asset.url}`} name={asset.name} url={asset.url}
        {...annotations.editor} /> : <NodeImagePreview nodeId={id} assets={assets} active={asset} grid={grid} orderBy={data.orderBy} locked={locked}
        onSelect={select} onGridChange={() => updateNodeData(id, { viewMode: grid ? 'single' : 'all' })}
        onOrderChange={orderBy => updateNodeData(id, { orderBy })} onFullscreen={(assetId, trigger, keyboard) => {
          const item = assets.find(value => value.id === assetId);
          // Start on the requested image before React Flow applies the output selection.
          if (item) showGallery(item, trigger, keyboard);
          select(assetId);
        }} onDownload={runDownload} renderMedia={preview} opensOnKeyboard={canViewImage} />}
      {dragging && <div className="file-node-drop-hint">Drop to import</div>}
    </div>
    {asset ? <div className="file-node-footer" onKeyDown={annotationKeyDown}>
      <button type="button" className="file-node-add nodrag nopan" disabled={locked || busy} onClick={() => input.current?.click()}>{busy ? '正在读取文件…' : `+ 添加更多${kind === 'image' ? '图片' : '文件'}`}</button>
      {editing && <span className="edit-limit-status" role="status">{marks.length >= annotationLimit ? annotationLimitMessage : null}</span>}
      {canAnnotate && <InteractiveEditButton active={editing} disabled={!canEdit} buttonRef={annotationToggle} onToggle={toggleAnnotations} />}
    </div> : <form className="file-node-link nodrag nopan" onSubmit={(event) => { event.preventDefault(); void importLink(); }}>
      <input aria-label={'粘贴文件链接'} placeholder={'粘贴文件链接'} value={link} disabled={locked || busy}
        onChange={(event) => { setLink(event.target.value); setError(''); }} onKeyDown={(event) => event.stopPropagation()} />
    </form>}
    {error && <div className="file-node-error nodrag" role="alert">{error}</div>}
    <input ref={input} type="file" className="file-node-input" accept={fileAccept} multiple tabIndex={-1} aria-label={'Choose files'} disabled={locked || busy}
      onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} />
    {(kind === 'image' || kind === 'file') ? <div className={`media-port-${kind}`}><NodePort id="file" label={kind === 'image' ? 'Image' : 'File'} type="source" position={Position.Right} isConnectable={isConnectable && !locked}>
      <img src={`/image-node/port-${kind}.svg`} width={32} height={32} alt="" />{connected && <span className="media-port-dot" />}
    </NodePort></div> : <Handle id="file" type="source" position={Position.Right} isConnectable={isConnectable && !locked} aria-label="File output"
      style={{ '--file-port': filePortColors[kind] } as CSSProperties} className={`file-node-port${connected ? ' is-connected' : ''}`}>
      <span className="file-node-port-label">File</span>
    </Handle>}
    {gallery && asset && <FileGallery assets={assets} activeId={gallery.assetId} onSelect={assetId => {

      setGallery({ ...gallery, assetId }); select(assetId);
    }} imageTransition={gallery.transition} onClose={() => setGallery(undefined)} />}
  </>;
  return <NodeFrame className="media-node-frame file-node-frame">{content}</NodeFrame>;
}
