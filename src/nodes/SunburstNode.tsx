import { useEffect, useState } from 'react';
import { Handle, Position, useEdges, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ArrowRight, Ellipsis, Plus } from 'lucide-react';
import type { AppNode, SunburstNode as Sunburst } from './types';
import { isNodeLocked } from './types';
import { sunburstName, sunburstFieldLabels, validateSunburstSize } from './sunburst';
import { resolveTextValue } from './textVariables';
import { OpenAIIcon } from '../components/OpenAIIcon';
import { ModelRunButton } from '../components/ModelRunButton';
import { TextNodeMenu } from './TextNodeMenu';
import { FileGallery } from './FileGallery';
import { FileIcon } from './FileIcon';
import { FileActionMenu } from './FileActionMenu';
import { extractFileAsset, orderedAssets } from './fileCollection';
import { downloadAsset, downloadAssets } from './fileMedia';

export function SunburstNode({ id, data, isConnectable }: NodeProps<Sunburst>) {
  const { getNode, updateNodeData, setNodes, screenToFlowPosition } = useReactFlow<AppNode>();
  const edges = useEdges(); const internals = useUpdateNodeInternals();
  const requestedSize = useStore(state => {
    const edge = state.edges.find(item => item.target === id && item.targetHandle === 'size');
    return edge ? resolveTextValue(edge.source, state.nodes as AppNode[], state.edges).trim() : data.size;
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
    if (validateSunburstSize(requestedSize) !== 'auto') aspectRatio = requestedSize.replace('x', ' / ');
  } catch { /* Incomplete or invalid custom sizes use the result ratio or a square. */ }
  const portSpace = 110 + (data.imageInputs + (data.exposed?.length ?? 0)) * 60;
  const index = Math.max(0, results.findIndex(asset => asset.id === active?.id));
  const patch = (value: Partial<Sunburst['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  useEffect(() => internals(id), [id, data.imageInputs, data.exposed, aspectRatio, grid, internals]);
  const ports = [
    { id: 'prompt', label: 'Prompt', kind: 'prompt', top: 89 },
    ...Array.from({ length: data.imageInputs }, (_, i) => ({ id: `image-${i}`, label: data.imageInputs === 1 ? 'Image' : `Image ${i + 1}`, kind: 'image', top: 149 + i * 60 })),
    { id: 'mask', label: 'Mask', kind: 'mask', top: 149 + data.imageInputs * 60 },
    ...(data.exposed ?? []).map((field, index) => ({ id: field, label: sunburstFieldLabels[field], kind: 'parameter', top: 209 + (data.imageInputs + index) * 60 })),
  ];
  return <>
    <header className="text-node-header"><div className="text-node-title"><OpenAIIcon />{renaming ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) patch({ label: draft.trim() }); setRenaming(false); }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span>{data.label || sunburstName}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setDraft(data.label || sunburstName); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu>
    </header>
    <div className="sunburst-preview-area" style={{ minHeight: portSpace }}>
    <div className={`sunburst-preview${active ? ' has-result' : ''}${grid ? ' is-grid nodrag nopan nowheel' : ''}`} style={{ aspectRatio: grid ? undefined : aspectRatio }}>
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
    </div>
    </div>
    <div className="sunburst-actions"><button className="text-node-button nodrag nopan" disabled={data.locked || data.imageInputs >= 16} onClick={() => patch({ imageInputs: data.imageInputs + 1 })}><Plus size={16} strokeWidth={1} />添加图片输入</button><ModelRunButton nodeId={id} className="sunburst-run nodrag nopan" disabled={data.locked} onRun={() => { if (!isNodeLocked(getNode(id))) window.dispatchEvent(new CustomEvent('sunburst-run', { detail: id })); }}><ArrowRight size={16} strokeWidth={1} />运行模型</ModelRunButton></div>
    {ports.map(port => <div className="describer-port-wrapper" key={port.id}>
      <span className={`describer-port-label sunburst-label-${port.kind}`} style={{ top: port.top - 28 }}>{port.label}{port.kind === 'prompt' && <sup>*</sup>}</span>
      <Handle id={port.id} type="target" position={Position.Left} className={`describer-port sunburst-port-${port.kind}${edges.some(edge => edge.target === id && edge.targetHandle === port.id) ? ' is-connected' : ''}`} style={{ top: port.top }} aria-label={`${port.label} input`} isConnectable={isConnectable && !edges.some(edge => edge.target === id && edge.targetHandle === port.id)}>
        {port.kind === 'prompt' && <svg className="sunburst-prompt-asterisk" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2V10M9.464 4L2.536 8M9.464 8L2.536 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </Handle>
    </div>)}
    <span className="describer-port-label output-label sunburst-label-image">Result</span><Handle id="result" type="source" position={Position.Right} className={`describer-port sunburst-port-image${edges.some(edge => edge.source === id) ? ' is-connected' : ''}`} style={{ top: 89 }} aria-label="Result output" isConnectable={isConnectable} />
    {fullscreen && active && <FileGallery assets={results} activeId={viewId} onSelect={setViewId} onClose={() => setFullscreen(false)} />}
    {error && <div role="alert">{error}</div>}
  </>;
}
