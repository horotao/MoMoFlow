import { NodeFrame, NodeTitle } from './NodeFrame';
import { NodePort, NodePortAdd } from './NodePort';
import { nodePortY } from './nodeLayout';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ArrowRight, Ellipsis } from 'lucide-react';
import type { AppNode, ImageGeneratorNode as Generator, SunburstNode as Sunburst } from './types';
import { isNodeLocked } from './types';
import { sunburstName, sunburstFieldLabels, validateSunburstSize } from './sunburst';
import { nanoBananaAspectRatios } from './nanoBanana';
import { resolveTextValue } from './textVariables';
import { NodeRunFeedback } from '../components/NodeRunFeedback';
import { ModelRunButton } from '../components/ModelRunButton';
import { IterationSummary } from '../components/IterationSummary';
import { TextNodeMenu } from './TextNodeMenu';
import { FileGallery } from './FileGallery';
import { FileIcon } from './FileIcon';
import { FileActionMenu } from './FileActionMenu';
import { extractFileAsset, orderedAssets } from './fileCollection';
import { downloadAsset, downloadAssets } from './fileMedia';
import { useImagePreviewHeight } from './useImagePreviewHeight';

export function SunburstNode(props: NodeProps<Sunburst>) {
  return <ImageGenerationNode {...props} name={sunburstName} fieldLabels={sunburstFieldLabels} maxImages={16} mask />;
}

type GenerationProps = NodeProps<Generator> & { name: string; fieldLabels: Record<string, string>; maxImages: number; mask?: boolean; imageLabels?: string[]; addImageLabel?: string; previewAspectRatio?: string | null };
export function ImageGenerationNode({ id, data, isConnectable, name, fieldLabels, maxImages, mask = false, imageLabels, addImageLabel = '添加图片输入', previewAspectRatio }: GenerationProps) {
  const { getNode, updateNodeData, setNodes, screenToFlowPosition } = useReactFlow<AppNode>();
  const internals = useUpdateNodeInternals();
  const requestedSize = useStore(state => {
    const field = 'size' in data ? 'size' : 'aspectRatio';
    const edge = state.edges.find(item => item.target === id && item.targetHandle === field);
    return edge ? resolveTextValue(edge.source, state.nodes as AppNode[], state.edges).trim() : 'size' in data ? data.size : data.aspectRatio;
  });
  const [renaming, setRenaming] = useState(false); const [draft, setDraft] = useState('');
  const [fullscreen, setFullscreen] = useState(false); const [error, setError] = useState('');
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const results = orderedAssets({ assets: data.results ?? [], orderBy: data.orderBy });
  const grid = showAll && results.length > 1;
  const active = results.find(asset => asset.id === data.activeResultId) ?? data.results?.[data.results.length - 1];
  const [viewId, setViewId] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const size = active ? dimensions[active.url] ?? active : undefined;
  let aspectRatio = size?.width && size.height ? `${size.width} / ${size.height}` : '1';
  try {
    if (previewAspectRatio !== undefined) aspectRatio = previewAspectRatio || aspectRatio;
    else if (!('size' in data) && requestedSize !== 'auto' && nanoBananaAspectRatios.some(ratio => ratio === requestedSize)) aspectRatio = requestedSize.replace(':', ' / ');
    else if ('size' in data && validateSunburstSize(requestedSize) !== 'auto') aspectRatio = requestedSize.replace('x', ' / ');
  } catch { /* Incomplete or invalid custom sizes use the result ratio or a square. */ }
  const preview = useImagePreviewHeight(aspectRatio, grid);
  const index = Math.max(0, results.findIndex(asset => asset.id === active?.id));
  const patch = (value: Partial<Generator['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  useEffect(() => internals(id), [id, data.imageInputs, data.exposed, aspectRatio, grid, internals]);
  const ports = [
    { id: 'prompt', label: 'Prompt', kind: 'prompt', row: 0 },
    ...Array.from({ length: data.imageInputs }, (_, i) => ({ id: `image-${i}`, label: imageLabels?.[i] ?? (data.imageInputs === 1 ? 'Image' : `Image ${i + 1}`), kind: 'image', row: i + 1 })),
    ...(mask ? [{ id: 'mask', label: 'Mask', kind: 'mask', row: data.imageInputs + 1 }] : []),
    ...(data.exposed ?? []).map((field, index) => ({ id: field, label: fieldLabels[field], kind: 'parameter', row: (mask ? 2 : 1) + data.imageInputs + index })),
  ];
  const displayName = !data.label || data.label === name ? '图像生成' : data.label;
  const title = renaming ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={draft}
    onChange={event => setDraft(event.target.value)} onBlur={() => { if (draft.trim()) patch({ label: draft.trim() }); setRenaming(false); }}
    onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return;
      if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false);
    }} /> : <span>{displayName}</span>;
  return <NodeFrame minHeight={nodePortY(ports.length) + 30}>
    <header className="text-node-header"><NodeTitle type={name.toUpperCase()}>{title}</NodeTitle>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setDraft(displayName); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu>
    </header>
    <div className="sunburst-preview-area" style={{ minHeight: nodePortY(ports.length) - 28 + 24 }}>
    <motion.div ref={preview.ref} className={`sunburst-preview${active ? ' has-result' : ''}${grid ? ' is-grid nodrag nopan nowheel' : ''}`} style={{ aspectRatio: grid ? undefined : aspectRatio, height: preview.height }}>
      {!active && <div className="node-media-empty"><span>图像预览</span><small>运行后，生成结果将显示在这里</small></div>}
      {active && <>{grid ? <div className="file-node-grid" aria-label="Results">
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
      </div> : <img src={active.url} alt={active.name} draggable={false} onError={() => setFailedUrls(current => current.includes(active.url) ? current : [...current, active.url])} onLoad={event => {
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
      </div>{!grid && failedUrls.includes(active.url) && <div className="node-media-empty node-media-failed" role="status"><span>无法显示预览</span><small>原始结果仍保留，可下载或切换其他结果</small></div>}</>}
    </motion.div>
    </div>
    <div className="sunburst-actions node-run-footer"><NodeRunFeedback nodeId={id} outputLabel={results.length ? `${results.length} 张结果` : undefined} /><ModelRunButton nodeId={id} className="sunburst-run nodrag nopan" disabled={data.locked} onRun={() => { if (!isNodeLocked(getNode(id))) window.dispatchEvent(new CustomEvent('describer-run', { detail: id })); }}><ArrowRight size={16} strokeWidth={1} />运行模型</ModelRunButton></div>
    <IterationSummary nodeId={id} />
    {maxImages > 0 && <NodePortAdd index={ports.length} label={addImageLabel} disabled={data.locked || data.imageInputs >= maxImages}
      onClick={() => patch({ imageInputs: data.imageInputs + 1 })} />}
    {ports.map(port => <NodePort key={port.id} id={port.id} direction="target" label={`${port.label} input`}
      index={port.row} isConnectable={isConnectable && !data.locked} />)}
    <NodePort id="result" direction="source" label="Result output" isConnectable={isConnectable && !data.locked} />
    {fullscreen && active && <FileGallery assets={results} activeId={viewId} onSelect={setViewId} onClose={() => setFullscreen(false)} />}
    {error && <div role="alert">{error}</div>}
  </NodeFrame>;
}
