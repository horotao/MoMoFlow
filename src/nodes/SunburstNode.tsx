import { NodeIcon } from './NodeIcon';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Position, useEdges, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ArrowRight, Plus } from 'lucide-react';
import type { AppNode, ImageGeneratorNode as Generator, SunburstNode as Sunburst } from './types';
import { isNodeLocked } from './types';
import { migrateSunburstProvider, sunburstName, sunburstPreviewAspectRatio, validateSunburstSize } from './sunburst';
import { nanoBananaAspectRatios } from './nanoBanana';
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
import { ResultEditButton } from './shared/ResultEditButton';
import { FileImageAnnotations } from './FileImageAnnotations';
import { useImageAnnotations } from './useImageAnnotations';
import { canAnnotateResult } from './annotationGraph';
import { EnsureResultAnnotationWorkflow } from './promptAnnotationEdits';
import './shared/mediaNodeStyle.css';

export function SunburstNode(props: NodeProps<Sunburst>) {
  const { size: ratio, ...settings } = props.data;
  const { provider, channelModel, outputFormat } = { ...settings, ...migrateSunburstProvider(settings.provider) };
  const apimart = provider === 'apimart';
  return <ImageGenerationNode {...props} name={sunburstName} icon={<NodeIcon nodeType="sunburst" />} maxImages={16} mask={!apimart || channelModel === 'gpt-image-2.6' && !['gif', 'svg'].includes(outputFormat)}
    previewAspectRatio={sunburstPreviewAspectRatio(provider, ratio)} />;
}

type GenerationProps = NodeProps<Generator> & { name: string; icon: ReactNode; fieldLabels?: Record<string, string>; maxImages: number; mask?: boolean; imageLabels?: string[]; addImageLabel?: string; previewAspectRatio?: string | null; hiddenParameters?: string[] };
export function ImageGenerationNode({ id, type, data, isConnectable, name, icon, fieldLabels, maxImages, mask = false, imageLabels, addImageLabel = '添加图片输入', previewAspectRatio }: GenerationProps) {
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const edges = useEdges(); const internals = useUpdateNodeInternals();
  // Keep unsupported connected ports visible so their old edges can be removed.
  const showMask = mask || (type === 'sunburst' && edges.some(edge => edge.target === id && edge.targetHandle === 'mask'));
  const requestedSize = 'size' in data ? data.size : 'aspectRatio' in data ? data.aspectRatio : 'auto';
  const [renaming, setRenaming] = useState(false); const [draft, setDraft] = useState('');
  const [gallery, setGallery] = useState<FileGalleryTrigger & { assetId: string }>();
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const results = orderedAssets({ assets: data.results ?? [], orderBy: data.orderBy });
  const grid = showAll && results.length > 1;
  const active = results.find(asset => asset.id === data.activeResultId) ?? data.results?.[data.results.length - 1];
  const ensureAnnotationWorkflow = useContext(EnsureResultAnnotationWorkflow);
  const canAnnotate = canAnnotateResult(active);
  const canEdit = canAnnotate && !grid && !data.locked && isConnectable;
  const annotations = useImageAnnotations(id, active, data.annotations, canEdit);
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
  const exposed = fieldLabels ? data.exposed : undefined;
  useEffect(() => internals(id), [id, data.imageInputs, exposed, showMask, mask, aspectRatio, grid, internals]);
  const ports = [
    { id: 'prompt', label: 'Prompt', kind: 'prompt', top: 89 },
    ...Array.from({ length: data.imageInputs }, (_, i) => ({ id: `image-${i}`, label: imageLabels?.[i] ?? (data.imageInputs === 1 ? 'Image' : `Image ${i + 1}`), kind: 'image', top: 149 + i * 60 })),
    ...(showMask ? [{ id: 'mask', label: 'Mask', kind: 'mask', top: 149 + data.imageInputs * 60 }] : []),
    ...(exposed ?? []).map((field, index) => ({ id: field, label: fieldLabels?.[field] ?? field, kind: 'parameter', top: 149 + (data.imageInputs + index) * 60 })),
  ];
  // Fit the lowest handle, including its 16px radius, 15px padding and 1px border.
  const minHeight = ports[ports.length - 1].top + 32;
  const renameTitle = renaming ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) patch({ label: draft.trim() }); setRenaming(false); }} onKeyDown={e => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span>{data.label || name}</span>;
  return <NodeFrame className="media-node-frame image-generation-frame" style={{ minHeight }}>
    <NodeHeader icon={type === 'sunburst' ? <img src="/image-node/brand.svg" width={16} height={16} alt="" className="node-monochrome" /> : icon} title={renameTitle}
      actions={<TextNodeMenu appearance="shared" id={id} locked={Boolean(data.locked)} onRename={() => { setDraft(data.label || name); setRenaming(true); }}><img src="/node-style/more.svg" width={18} height={18} alt="" className="node-monochrome" /></TextNodeMenu>} />
    <div className="sunburst-preview-area">
    <motion.div ref={preview.ref} className={`sunburst-preview${active ? ' has-result' : ''}${grid ? ' is-grid nodrag nopan nowheel' : ''}${annotations.editing ? ' is-editing nodrag nopan' : ''}`}
      style={{ aspectRatio: grid ? undefined : aspectRatio, height: preview.height }} onKeyDown={annotations.onKeyDown}>
      {active && <NodeImagePreview nodeId={id} assets={results} active={{ ...active, ...size }} grid={grid} orderBy={data.orderBy} locked={Boolean(data.locked)}
        editing={annotations.editing} resultAction={canAnnotate && <ResultEditButton active={annotations.editing} disabled={!canEdit}
          buttonRef={annotations.button} onToggle={pointer => {
            if (!annotations.editing) ensureAnnotationWorkflow?.(id, active.id, pointer);
            annotations.toggle();
          }} />}
        onSelect={activeResultId => patch({ activeResultId })} onGridChange={() => setShowAll(value => !value)} onOrderChange={orderBy => patch({ orderBy })}
        onFullscreen={(assetId, trigger, keyboard) => setGallery({ assetId, trigger, keyboard })}
        onDownload={() => { setError(''); void (grid ? downloadAssets(results) : downloadAsset(active)).catch(() => setError('下载失败，请重试。')); }}
        renderMedia={item => annotations.editing ? <FileImageAnnotations key={`${item.id}:${item.url}`} url={item.url} name={item.name}
          {...annotations.editor} /> : <img src={item.url} alt={item.name} draggable={false} onLoad={event => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
          if (width && height && (dimensions[item.url]?.width !== width || dimensions[item.url]?.height !== height)) setDimensions(current => ({ ...current, [item.url]: { width, height } }));
        }} />} />}
    </motion.div>
    </div>
    {type === 'ideogram' ? <div className="sunburst-actions">模型已下线</div> : <div className="sunburst-actions">{maxImages > 0 && <button className="text-node-button nodrag nopan" disabled={data.locked || data.imageInputs >= maxImages} onClick={() => patch({ imageInputs: data.imageInputs + 1 })}><Plus size={16} strokeWidth={1} />{addImageLabel}</button>}<ModelRunButton appearance="image-node" nodeId={id} className="sunburst-run nodrag nopan" disabled={data.locked} onRun={() => { if (!isNodeLocked(getNode(id))) window.dispatchEvent(new CustomEvent('describer-run', { detail: id })); }}><ArrowRight size={16} strokeWidth={1} />运行模型</ModelRunButton></div>}
    {type !== 'ideogram' && <IterationSummary nodeId={id} />}
    {ports.map(port => <div className={`media-port-${port.kind}`} key={port.id}>
      <NodePort label={port.label} id={port.id} type="target" position={Position.Left} top={port.top}
        title={(port.id === 'mask' && !mask) ? `${port.label} · 当前渠道不支持，可断开或切换渠道` : undefined}
        isConnectable={type !== 'ideogram' && isConnectable && !data.locked && !(port.id === 'mask' && !mask)}>
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
