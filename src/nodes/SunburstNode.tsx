import { useEffect, useState } from 'react';
import { Handle, Position, useEdges, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ArrowRight, ChevronLeft, ChevronRight, Download, Ellipsis, Maximize2, Plus } from 'lucide-react';
import type { AppNode, SunburstNode as Sunburst } from './types';
import { isNodeLocked } from './types';
import { sunburstName, sunburstFieldLabels } from './sunburst';
import { OpenAIIcon } from '../components/OpenAIIcon';
import { TextNodeMenu } from './TextNodeMenu';
import { FileGallery } from './FileGallery';
import { downloadAsset } from './fileMedia';

export function SunburstNode({ id, data, isConnectable }: NodeProps<Sunburst>) {
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const edges = useEdges(); const internals = useUpdateNodeInternals();
  const [renaming, setRenaming] = useState(false); const [draft, setDraft] = useState('');
  const [fullscreen, setFullscreen] = useState(false); const [error, setError] = useState('');
  const results = data.results ?? [];
  const active = results.find(asset => asset.id === data.activeResultId) ?? results[results.length - 1];
  const [viewId, setViewId] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const size = active ? dimensions[active.url] ?? active : undefined;
  const aspectRatio = size?.width && size.height ? `${size.width} / ${size.height}` : undefined;
  const portSpace = 110 + (data.imageInputs + (data.exposed?.length ?? 0)) * 60;
  const index = Math.max(0, results.findIndex(asset => asset.id === active?.id));
  const patch = (value: Partial<Sunburst['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  useEffect(() => internals(id), [id, data.imageInputs, data.exposed, aspectRatio, internals]);
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
    <div className={`sunburst-preview${active ? ' has-result' : ''}`} style={active ? { aspectRatio } : { minHeight: Math.max(420, portSpace) }}>
      {active && <><img src={active.url} alt={active.name} draggable={false} onLoad={event => {
        const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
        if (width && height && (size?.width !== width || size.height !== height)) setDimensions(current => ({ ...current, [active.url]: { width, height } }));
      }} /><div className="sunburst-preview-tools nodrag nopan">
        {results.length > 1 && <div><button disabled={data.locked} aria-label="Previous result" onClick={() => patch({ activeResultId: results[(index + results.length - 1) % results.length].id })}><ChevronLeft size={18} /></button><span>{index + 1} / {results.length}</span><button disabled={data.locked} aria-label="Next result" onClick={() => patch({ activeResultId: results[(index + 1) % results.length].id })}><ChevronRight size={18} /></button></div>}
        <div><button aria-label="Download result" title="Download" onClick={() => void downloadAsset(active).catch(() => setError('下载失败，请重试。'))}><Download size={18} /></button><button aria-label="Full screen result" title="Full screen" onClick={() => { setViewId(active.id); setFullscreen(true); }}><Maximize2 size={18} /></button></div>
      </div><span className="sunburst-resolution">{size?.width} × {size?.height}</span></>}
    </div>
    </div>
    <div className="sunburst-actions"><button className="text-node-button nodrag nopan" disabled={data.locked || data.imageInputs >= 16} onClick={() => patch({ imageInputs: data.imageInputs + 1 })}><Plus size={16} strokeWidth={1} />Add another image input</button><button className="sunburst-run nodrag nopan" disabled={data.locked} onClick={() => { if (!isNodeLocked(getNode(id))) window.dispatchEvent(new CustomEvent('sunburst-run', { detail: id })); }}><ArrowRight size={16} strokeWidth={1} />Run Model</button></div>
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
