import { NodeIcon } from './NodeIcon';
import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Position, useEdges, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ArrowRight, Plus } from 'lucide-react';
import type { AppNode, ImageGeneratorNode as Generator, SunburstNode as Sunburst } from './types';
import { isNodeLocked } from './types';
import { sunburstName, sunburstFieldLabels, validateSunburstSize } from './sunburst';
import { nanoBananaAspectRatios } from './nanoBanana';
import { resolveTextValue } from './textVariables';
import { ModelRunButton } from '../components/ModelRunButton';
import { IterationSummary } from '../components/IterationSummary';
import { TextNodeMenu } from './TextNodeMenu';
import { FileGallery, type FileGalleryTrigger } from './FileGallery';
import { orderedAssets } from './fileCollection';
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
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const edges = useEdges(); const internals = useUpdateNodeInternals();
  const requestedSize = useStore(state => {
    const field = 'size' in data ? 'size' : 'aspectRatio';
    const edge = state.edges.find(item => item.target === id && item.targetHandle === field);
    return edge ? resolveTextValue(edge.source, state.nodes as AppNode[], state.edges).trim() : 'size' in data ? data.size : data.aspectRatio;
  });
  const [renaming, setRenaming] = useState(false); const [draft, setDraft] = useState('');
  const [gallery, setGallery] = useState<FileGalleryTrigger & { assetId: string }>();
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const results = orderedAssets({ assets: data.results ?? [], orderBy: data.orderBy });
  const grid = showAll && results.length > 1;
  const active = results.find(asset => asset.id === data.activeResultId) ?? data.results?.[data.results.length - 1];
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const size = active ? dimensions[active.url] ?? active : undefined;
  let aspectRatio = size?.width && size.height ? `${size.width} / ${size.height}` : '1';
  try {
    // Once generated, each model previews the returned image at its actual ratio.
    if (size?.width && size.height) aspectRatio = `${size.width} / ${size.height}`;
    else if (previewAspectRatio !== undefined) aspectRatio = previewAspectRatio || aspectRatio;
    else if (!('size' in data) && requestedSize !== 'auto' && nanoBananaAspectRatios.some(ratio => ratio === requestedSize)) aspectRatio = requestedSize.replace(':', ' / ');
    else if ('size' in data && validateSunburstSize(requestedSize) !== 'auto') aspectRatio = requestedSize.replace('x', ' / ');
  } catch { /* Incomplete or invalid custom sizes use the result ratio or a square. */ }
  const preview = useImagePreviewHeight(aspectRatio, grid);
  const patch = (value: Partial<Generator['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  useEffect(() => internals(id), [id, data.imageInputs, data.exposed, aspectRatio, grid, internals]);
  const ports = [
    { id: 'prompt', label: 'Prompt', kind: 'prompt', top: 89 },
    ...Array.from({ length: data.imageInputs }, (_, i) => ({ id: `image-${i}`, label: imageLabels?.[i] ?? (data.imageInputs === 1 ? 'Image' : `Image ${i + 1}`), kind: 'image', top: 149 + i * 60 })),
    ...(mask ? [{ id: 'mask', label: 'Mask', kind: 'mask', top: 149 + data.imageInputs * 60 }] : []),
    ...(data.exposed ?? []).map((field, index) => ({ id: field, label: fieldLabels[field], kind: 'parameter', top: (mask ? 209 : 149) + (data.imageInputs + index) * 60 })),
  ];
  // Fit the lowest handle, including its 16px radius, 15px padding and 1px border.
  const minHeight = ports[ports.length - 1].top + 32;
  const renameTitle = renaming ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) patch({ label: draft.trim() }); setRenaming(false); }} onKeyDown={e => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span>{data.label || name}</span>;
  return <NodeFrame className="media-node-frame image-generation-frame" style={{ minHeight }}>
    <NodeHeader icon={type === 'sunburst' ? <img src="/image-node/brand.svg" width={16} height={16} alt="" className="node-monochrome" /> : icon} title={renameTitle}
      actions={<TextNodeMenu appearance="shared" id={id} locked={Boolean(data.locked)} onRename={() => { setDraft(data.label || name); setRenaming(true); }}><img src="/node-style/more.svg" width={18} height={18} alt="" className="node-monochrome" /></TextNodeMenu>} />
    <div className="sunburst-preview-area">
    <motion.div ref={preview.ref} className={`sunburst-preview${active ? ' has-result' : ''}${grid ? ' is-grid nodrag nopan nowheel' : ''}`} style={{ aspectRatio: grid ? undefined : aspectRatio, height: preview.height }}>
      {active && <NodeImagePreview nodeId={id} assets={results} active={{ ...active, ...size }} grid={grid} orderBy={data.orderBy} locked={Boolean(data.locked)}
        onSelect={activeResultId => patch({ activeResultId })} onGridChange={() => setShowAll(value => !value)} onOrderChange={orderBy => patch({ orderBy })}
        onFullscreen={(assetId, trigger, keyboard) => setGallery({ assetId, trigger, keyboard })}
        onDownload={() => { setError(''); void (grid ? downloadAssets(results) : downloadAsset(active)).catch(() => setError('下载失败，请重试。')); }}
        renderMedia={item => <img src={item.url} alt={item.name} draggable={false} onLoad={event => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
          if (width && height && (dimensions[item.url]?.width !== width || dimensions[item.url]?.height !== height)) setDimensions(current => ({ ...current, [item.url]: { width, height } }));
        }} />} />}
    </motion.div>
    </div>
    <div className="sunburst-actions">{maxImages > 0 && <button className="text-node-button nodrag nopan" disabled={data.locked || data.imageInputs >= maxImages} onClick={() => patch({ imageInputs: data.imageInputs + 1 })}><Plus size={16} strokeWidth={1} />{addImageLabel}</button>}<ModelRunButton appearance="image-node" nodeId={id} className="sunburst-run nodrag nopan" disabled={data.locked} onRun={() => { if (!isNodeLocked(getNode(id))) window.dispatchEvent(new CustomEvent('describer-run', { detail: id })); }}><ArrowRight size={16} strokeWidth={1} />运行模型</ModelRunButton></div>
    <IterationSummary nodeId={id} />
    {ports.map(port => <div className={`media-port-${port.kind}`} key={port.id}>
      <NodePort label={port.label} id={port.id} type="target" position={Position.Left} top={port.top} isConnectable={isConnectable && !data.locked}>
        <img width={32} height={32} alt="" src={port.kind === 'image' ? '/image-node/port-image.svg' : port.kind === 'mask' ? '/image-node/port-mask.svg' : `/node-style/port-text${edges.some(edge => edge.target === id && edge.targetHandle === port.id) ? '-connected' : ''}.svg`} />
        {(port.kind === 'image' || port.kind === 'mask') && edges.some(edge => edge.target === id && edge.targetHandle === port.id) && <span className="media-port-dot" />}
      </NodePort>
    </div>)}<div className="media-port-image"><NodePort label="Result" id="result" type="source" position={Position.Right} isConnectable={isConnectable && !data.locked}>
      <img src="/image-node/port-image.svg" width={32} height={32} alt="" />{edges.some(edge => edge.source === id) && <span className="media-port-dot" />}
    </NodePort></div>
    {gallery && active && <FileGallery assets={results.map(asset => ({ ...asset, ...dimensions[asset.url] }))}
      activeId={gallery.assetId} imageTransition={gallery} onSelect={assetId => setGallery({ ...gallery, assetId })} onClose={() => setGallery(undefined)} />}
    {error && <div role="alert">{error}</div>}
  </NodeFrame>;
}
