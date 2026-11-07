import { NodeIcon } from './NodeIcon';
import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Handle, Position, useEdges, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ArrowRight, Ellipsis, Plus } from 'lucide-react';
import type { AppNode, ImageGeneratorNode as Generator, SunburstNode as Sunburst } from './types';
import { isNodeLocked } from './types';
import { sunburstName, sunburstFieldLabels, validateSunburstSize } from './sunburst';
import { nanoBananaAspectRatios } from './nanoBanana';
import { resolveTextValue } from './textVariables';
import { ModelRunButton } from '../components/ModelRunButton';
import { IterationSummary } from '../components/IterationSummary';
import { TextNodeMenu } from './TextNodeMenu';
import { FileGallery } from './FileGallery';
import { FileIcon } from './FileIcon';
import { FileActionMenu } from './FileActionMenu';
import { extractFileAsset, orderedAssets } from './fileCollection';
import { downloadAsset, downloadAssets } from './fileMedia';
import { useImagePreviewHeight } from './useImagePreviewHeight';
import { NodeFrame, NodeHeader } from './shared/NodeFrame';
import { NodePort } from './shared/NodePort';
import { NodeImagePreview } from './shared/NodeImagePreview';
import './shared/mediaNodeStyle.css';

export function SunburstNode(props: NodeProps<Sunburst>) {
  return <ImageGenerationNode {...props} name={sunburstName} icon={<NodeIcon nodeType="sunburst" />} fieldLabels={sunburstFieldLabels} maxImages={16} mask />;
}

type GenerationProps = NodeProps<Generator> & { name: string; icon: ReactNode; fieldLabels: Record<string, string>; maxImages: number; mask?: boolean; imageLabels?: string[]; addImageLabel?: string; previewAspectRatio?: string | null };
export function ImageGenerationNode({ id, type, data, isConnectable, name, icon, fieldLabels, maxImages, mask = false, imageLabels, addImageLabel = '添加图片输入', previewAspectRatio }: GenerationProps) {
  const modern = type === 'sunburst';
  const { getNode, updateNodeData, setNodes, screenToFlowPosition } = useReactFlow<AppNode>();
  const edges = useEdges(); const internals = useUpdateNodeInternals();
  const requestedSize = useStore(state => {
    const field = 'size' in data ? 'size' : 'aspectRatio';
    const edge = state.edges.find(item => item.target === id && item.targetHandle === field);
    return edge ? resolveTextValue(edge.source, state.nodes as AppNode[], state.edges).trim() : 'size' in data ? data.size : data.aspectRatio;
  });
  const [renaming, setRenaming] = useState(false); const [draft, setDraft] = useState('');
  const [fullscreen, setFullscreen] = useState(false); const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const results = orderedAssets({ assets: data.results ?? [], orderBy: data.orderBy });
  const grid = showAll && results.length > 1;
  const active = results.find(asset => asset.id === data.activeResultId) ?? data.results?.[data.results.length - 1];
  const [viewId, setViewId] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const size = active ? dimensions[active.url] ?? active : undefined;
  let aspectRatio = size?.width && size.height ? `${size.width} / ${size.height}` : '1';
  try {
    // Once generated, GPT previews the returned image at its actual ratio.
    if (modern && size?.width && size.height) aspectRatio = `${size.width} / ${size.height}`;
    else if (previewAspectRatio !== undefined) aspectRatio = previewAspectRatio || aspectRatio;
    else if (!('size' in data) && requestedSize !== 'auto' && nanoBananaAspectRatios.some(ratio => ratio === requestedSize)) aspectRatio = requestedSize.replace(':', ' / ');
    else if ('size' in data && validateSunburstSize(requestedSize) !== 'auto') aspectRatio = requestedSize.replace('x', ' / ');
  } catch { /* Incomplete or invalid custom sizes use the result ratio or a square. */ }
  const preview = useImagePreviewHeight(aspectRatio, grid);
  const portSpace = (mask ? 110 : 50) + (data.imageInputs + (data.exposed?.length ?? 0)) * 60;
  const index = Math.max(0, results.findIndex(asset => asset.id === active?.id));
  const patch = (value: Partial<Generator['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  useEffect(() => internals(id), [id, data.imageInputs, data.exposed, aspectRatio, grid, internals]);
  const ports = [
    { id: 'prompt', label: 'Prompt', kind: 'prompt', top: 89 },
    ...Array.from({ length: data.imageInputs }, (_, i) => ({ id: `image-${i}`, label: imageLabels?.[i] ?? (data.imageInputs === 1 ? 'Image' : `Image ${i + 1}`), kind: 'image', top: 149 + i * 60 })),
    ...(mask ? [{ id: 'mask', label: 'Mask', kind: 'mask', top: 149 + data.imageInputs * 60 }] : []),
    ...(data.exposed ?? []).map((field, index) => ({ id: field, label: fieldLabels[field], kind: 'parameter', top: (mask ? 209 : 149) + (data.imageInputs + index) * 60 })),
  ];
  const renameTitle = renaming ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) patch({ label: draft.trim() }); setRenaming(false); }} onKeyDown={e => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span>{data.label || name}</span>;
  const content = <>
    {modern ? <NodeHeader icon={<img src="/image-node/brand.svg" width={16} height={16} alt="" className="node-monochrome" />} title={renameTitle}
      actions={<TextNodeMenu appearance="shared" id={id} locked={Boolean(data.locked)} onRename={() => { setDraft(data.label || name); setRenaming(true); }}><img src="/node-style/more.svg" width={18} height={18} alt="" className="node-monochrome" /></TextNodeMenu>} /> : <header className="text-node-header"><div className="text-node-title">{icon}{renaming ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) patch({ label: draft.trim() }); setRenaming(false); }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span>{data.label || name}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setDraft(data.label || name); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu>
    </header>}
    <div className="sunburst-preview-area" style={{ minHeight: portSpace }}>
    <motion.div ref={preview.ref} className={`sunburst-preview${active ? ' has-result' : ''}${grid ? ' is-grid nodrag nopan nowheel' : ''}`} style={{ aspectRatio: grid ? undefined : aspectRatio, height: preview.height }}>
      {modern && active ? <NodeImagePreview nodeId={id} assets={results} active={{ ...active, ...size }} grid={grid} orderBy={data.orderBy} locked={Boolean(data.locked)}
        onSelect={activeResultId => patch({ activeResultId })} onGridChange={() => setShowAll(value => !value)} onOrderChange={orderBy => patch({ orderBy })}
        onFullscreen={assetId => { setViewId(assetId); setFullscreen(true); }}
        onDownload={() => { setError(''); void (grid ? downloadAssets(results) : downloadAsset(active)).catch(() => setError('下载失败，请重试。')); }}
        renderMedia={item => <img src={item.url} alt={item.name} draggable={false} onLoad={event => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
          if (width && height && (dimensions[item.url]?.width !== width || dimensions[item.url]?.height !== height)) setDimensions(current => ({ ...current, [item.url]: { width, height } }));
        }} />} /> : active && <>{grid ? <div className="file-node-grid" aria-label="Results">
        {[0, 1].map(column => <div className="file-node-grid-column" key={column}>{results.filter((_, i) => i % 2 === column).map(item => <div key={item.id}
          className={`file-node-tile${item.id === active.id ? ' is-active' : ''}`} role="button" tabIndex={0} aria-label={`Select ${item.name}`} aria-pressed={item.id === active.id} aria-disabled={Boolean(data.locked)}
          draggable={!data.locked}
          onDragStart={event => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-momoflow-asset', item.id); }}
          onDragEnd={event => {
            event.stopPropagation();
            if (event.dataTransfer.dropEffect !== 'move') return;
            const target = document.elementFromPoint(event.clientX, event.clientY);
            if (!target?.classList.contains('react-flow__pane') || !getNode(id)) return;
            const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
            setNodes(nodes => extractFileAsset(nodes, id, item.id, position, `file-${crypto.randomUUID()}`));
          }}
          onClick={() => patch({ activeResultId: item.id })} onDoubleClick={() => { patch({ activeResultId: item.id }); setViewId(item.id); setFullscreen(true); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); patch({ activeResultId: item.id }); } }}>
          <img src={item.url} alt={item.name} draggable={false} />
        </div>)}</div>)}
      </div> : <img src={active.url} alt={active.name} draggable={false} onLoad={event => {
        const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
        if (width && height && (size?.width !== width || size.height !== height)) setDimensions(current => ({ ...current, [active.url]: { width, height } }));
      }} />}<div className="file-media-overlay nodrag nopan">
        <div className="file-media-top">
          <div className="file-media-navigation">{results.length > 1 && <>
            <button className="file-icon-button" aria-label={grid ? 'All' : 'Single'} title={grid ? 'All' : 'Single'} onClick={() => setShowAll(value => !value)}><FileIcon name={grid ? 'grid' : 'single'} /></button>
            {grid ? <span>{results.length} images</span> : <><button className="file-icon-button" disabled={data.locked} aria-label="Previous result" title="Previous result" onClick={() => patch({ activeResultId: results[(index + results.length - 1) % results.length].id })}><FileIcon name="previous" /></button><span>{index + 1} / {results.length}</span><button className="file-icon-button" disabled={data.locked} aria-label="Next result" title="Next result" onClick={() => patch({ activeResultId: results[(index + 1) % results.length].id })}><FileIcon name="next" /></button></>}</>}</div>
          <div className="file-media-tools">
            <FileActionMenu label="排序方式" heading="排序方式" items={[
              { label: '添加时间', checked: data.orderBy !== 'name', action: () => patch({ orderBy: 'date' }) },
              { label: '名称', checked: data.orderBy === 'name', action: () => patch({ orderBy: 'name' }) },
            ]}><FileIcon name="order" /></FileActionMenu>
            <button className="file-icon-button" aria-label={grid ? 'Download all' : 'Download current'} title={grid ? 'Download all' : 'Download current'} onClick={() => { setError(''); void (grid ? downloadAssets(results) : downloadAsset(active)).catch(() => setError('下载失败，请重试。')); }}><FileIcon name="download" /></button><button className="file-icon-button" aria-label="Full screen result" title="Full screen" onClick={() => { setViewId(active.id); setFullscreen(true); }}><FileIcon name="fullscreen" /></button></div>
        </div>
        {!grid && <span className="file-media-resolution">{size?.width} × {size?.height}</span>}
      </div></>}
    </motion.div>
    </div>
    <div className="sunburst-actions">{maxImages > 0 && <button className="text-node-button nodrag nopan" disabled={data.locked || data.imageInputs >= maxImages} onClick={() => patch({ imageInputs: data.imageInputs + 1 })}><Plus size={16} strokeWidth={1} />{addImageLabel}</button>}<ModelRunButton appearance={modern ? 'image-node' : 'default'} nodeId={id} className="sunburst-run nodrag nopan" disabled={data.locked} onRun={() => { if (!isNodeLocked(getNode(id))) window.dispatchEvent(new CustomEvent('describer-run', { detail: id })); }}><ArrowRight size={16} strokeWidth={1} />运行模型</ModelRunButton></div>
    <IterationSummary nodeId={id} />
    {modern ? <>{ports.map(port => <div className={`media-port-${port.kind}`} key={port.id}>
      <NodePort label={port.label} id={port.id} type="target" position={Position.Left} top={port.top} isConnectable={isConnectable && !data.locked}>
        <img width={32} height={32} alt="" src={port.kind === 'image' ? '/image-node/port-image.svg' : port.kind === 'mask' ? '/image-node/port-mask.svg' : `/node-style/port-text${edges.some(edge => edge.target === id && edge.targetHandle === port.id) ? '-connected' : ''}.svg`} />
        {(port.kind === 'image' || port.kind === 'mask') && edges.some(edge => edge.target === id && edge.targetHandle === port.id) && <span className="media-port-dot" />}
      </NodePort>
    </div>)}<div className="media-port-image"><NodePort label="Result" id="result" type="source" position={Position.Right} isConnectable={isConnectable && !data.locked}>
      <img src="/image-node/port-image.svg" width={32} height={32} alt="" />{edges.some(edge => edge.source === id) && <span className="media-port-dot" />}
    </NodePort></div></> : <>{ports.map(port => <div className="describer-port-wrapper" key={port.id}>
      <span className={`describer-port-label sunburst-label-${port.kind}`} style={{ top: port.top - 28 }}>{port.label}{port.kind === 'prompt' && <sup>*</sup>}</span>
      <Handle id={port.id} type="target" position={Position.Left} className={`describer-port sunburst-port-${port.kind}${edges.some(edge => edge.target === id && edge.targetHandle === port.id) ? ' is-connected' : ''}`} style={{ top: port.top }} aria-label={`${port.label} input`} isConnectable={isConnectable}>
        {port.kind === 'prompt' && <svg className="sunburst-prompt-asterisk" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2V10M9.464 4L2.536 8M9.464 8L2.536 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </Handle>
    </div>)}
    <span className="describer-port-label output-label sunburst-label-image">Result</span><Handle id="result" type="source" position={Position.Right} className={`describer-port sunburst-port-image${edges.some(edge => edge.source === id) ? ' is-connected' : ''}`} style={{ top: 89 }} aria-label="Result output" isConnectable={isConnectable} />
    </>}
    {fullscreen && active && <FileGallery assets={results} activeId={viewId} onSelect={setViewId} onClose={() => setFullscreen(false)} />}
    {error && <div role="alert">{error}</div>}
  </>;
  return modern ? <NodeFrame className="media-node-frame image-generation-frame">{content}</NodeFrame> : content;
}
