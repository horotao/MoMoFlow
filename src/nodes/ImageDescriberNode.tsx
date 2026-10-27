import { ideogramFieldLabels } from './ideogram';
import { nanoBananaFieldLabels } from './nanoBanana';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Plus, ArrowRight, Maximize2, Ellipsis } from 'lucide-react';
import type { AppNode, ImageDescriberNode as Describer, ModelInputNode as ModelInput } from './types';
import { sunburstFieldLabels } from './sunburst';
import { DescriberModelSelect } from '../components/DescriberModelSelect';
import { isNodeLocked } from './types';
import { TextNodeMenu } from './TextNodeMenu';
import { NodeIcon } from './NodeIcon';
import { DescriberPreview } from '../components/DescriberPreview';
import { ModelRunButton } from '../components/ModelRunButton';

const parameterTitles = { editQuality: '编辑质量', editPrecision: '编辑精度', editSize: '编辑尺寸', resolution: '分辨率', enablePromptExpansion: '提示词扩展', aspectRatio: '宽高比', imageSize: '分辨率', quality: '画质', background: '背景', size: '宽高比', outputFormat: '输出格式' };

function NodeHeading({ id, label, fallback, locked, model = false }: { id: string; label?: string; fallback: string; locked?: boolean; model?: boolean }) {
  const { updateNodeData: rawUpdateNodeData, getNode } = useReactFlow<AppNode>();
  const updateNodeData: typeof rawUpdateNodeData = (nodeId, patch, options) => {
    if (isNodeLocked(getNode(nodeId))) return;
    rawUpdateNodeData(nodeId, patch, options);
  };
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  return <header className="text-node-header"><div className="text-node-title"><NodeIcon nodeType={model ? 'model-input' : 'image-describer'} />{renaming ? <input autoFocus className="text-node-rename nodrag nopan" aria-label="节点名称" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) updateNodeData(id, { label: draft.trim() }); setRenaming(false); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span>{label || fallback}</span>}</div><TextNodeMenu id={id} locked={Boolean(locked)} onRename={() => { setDraft(label || fallback); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu></header>;
}

export function ModelInputNode({ id, data, isConnectable }: NodeProps<ModelInput>) {
  const { updateNodeData: rawUpdateNodeData, getNode } = useReactFlow<AppNode>();
  const updateNodeData: typeof rawUpdateNodeData = (nodeId, patch, options) => {
    if (isNodeLocked(getNode(nodeId))) return;
    rawUpdateNodeData(nodeId, patch, options);
  };
  const defaultTitle = data.parameter ? parameterTitles[data.parameter] : '模型名称';
  const label = data.parameter && data.label === ({ ...sunburstFieldLabels, ...nanoBananaFieldLabels, ...ideogramFieldLabels })[data.parameter] ? defaultTitle : data.label;
  return <><NodeHeading id={id} label={label} locked={data.locked} fallback={defaultTitle} model />
    <DescriberModelSelect node label={data.parameter ? ({ ...sunburstFieldLabels, ...nanoBananaFieldLabels, ...ideogramFieldLabels })[data.parameter] : 'Model'} disabled={data.locked} value={data.model} choices={data.options} onChange={(model) => updateNodeData(id, { model })} />
    <span className="describer-port-label model-options-label">Options</span><Handle id="options" type="target" position={Position.Left} className="describer-port model-options-port" style={{ top: 30 }} aria-label="Options input" title="Options · List input (not available yet)" isConnectable={false} />
    <span className="describer-port-label output-label model-text-label">Text</span><Handle type="source" position={Position.Right} className="describer-port" style={{ top: 30 }} aria-label="Text output" isConnectable={isConnectable} />
  </>;
}

export function ImageDescriberNode({ id, data, isConnectable }: NodeProps<Describer>) {
  const { updateNodeData: rawUpdateNodeData, getNode } = useReactFlow<AppNode>();
  const updateNodeData: typeof rawUpdateNodeData = (nodeId, patch, options) => {
    if (isNodeLocked(getNode(nodeId))) return;
    rawUpdateNodeData(nodeId, patch, options);
  };
  const edges = useEdges();
  const internals = useUpdateNodeInternals();
  const [fullscreen, setFullscreen] = useState(false);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const [outputHeight, setOutputHeight] = useState(287);
  useLayoutEffect(() => {
    const element = outputRef.current;
    if (!element) return;
    const resize = () => {
      element.style.height = '0px';
      const height = Math.min(518, Math.max(287, element.scrollHeight));
      element.style.height = `${height}px`;
      setOutputHeight(height);
    };
    resize();
    // Only observe width changes; height is set by the content measurement above.
    let width = element.clientWidth;
    const widthObserver = new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; resize(); }
    });
    widthObserver.observe(element);
    return () => widthObserver.disconnect();
  }, [data.text]);
  const exposed = data.exposed ?? [];
  const count = data.imageInputs + exposed.length;
  useEffect(() => internals(id), [id, count, internals]);
  const run = () => !isNodeLocked(getNode(id)) && window.dispatchEvent(new CustomEvent('describer-run', { detail: id }));
  return <>
    <NodeHeading id={id} label={data.label} locked={data.locked} fallback="图像描述" />
    <div className="text-node-content describer-output" style={{ height: outputHeight, flex: 'none' }}><textarea ref={outputRef} className="nodrag nowheel" readOnly={data.locked} aria-label="Generated text" placeholder="Generated text will appear here" value={data.text} onChange={(e) => updateNodeData(id, { text: e.target.value })} /><button className="describer-expand nodrag" title="Full screen" aria-label="Full screen" onClick={() => setFullscreen(true)}><Maximize2 size={14} /></button></div>
    <footer className="text-node-footer"><button disabled={data.locked} className="text-node-button nodrag" onClick={() => updateNodeData(id, { imageInputs: data.imageInputs + 1 })}><Plus size={16} />Add another image input</button><ModelRunButton nodeId={id} disabled={data.locked} className="describer-run nodrag nopan" onRun={run}><ArrowRight size={13} />Run Model</ModelRunButton></footer>
    {[...Array.from({ length: data.imageInputs }, (_, i) => ({ id: `image-${i}`, label: i ? `Image ${i + 1}` : 'Image *', image: true })), ...exposed.map((field) => ({ id: field, label: field === 'model' ? 'Model' : 'System Instructions', image: false }))].map((port, i) => <div key={port.id} className="describer-port-wrapper"><span className="describer-port-label" style={{ top: 61 + i * 50, color: port.image ? 'var(--media-port-image)' : undefined }}>{port.label}</span><Handle id={port.id} type="target" position={Position.Left} className={`describer-port ${port.image ? 'image-port' : ''}${edges.some((e) => e.target === id && e.targetHandle === port.id) ? ' is-connected' : ''}`} style={{ top: 89 + i * 50 }} aria-label={port.label} isConnectable={isConnectable} /></div>)}
    <span className="describer-port-label output-label">Text</span><Handle type="source" position={Position.Right} className={`describer-port${edges.some((e) => e.source === id) ? ' is-connected' : ''}`} style={{ top: 89 }} isConnectable={isConnectable} aria-label="Text output" />
    {fullscreen && <DescriberPreview locked={data.locked} text={data.text} model={data.model} instructions={data.instructions} onClose={() => setFullscreen(false)} onClear={() => { updateNodeData(id, { text: '' }); setFullscreen(false); }} />}
  </>;
}
