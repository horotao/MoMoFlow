import { NodeFrame, NodeTitle } from './NodeFrame';
import { nodePortY } from './nodeLayout';
import { NodeRunFeedback } from '../components/NodeRunFeedback';
import { NodePort, NodePortAdd } from './NodePort';
import { IterationSummary } from '../components/IterationSummary';
import { sourceSignature } from './executionGraph';
import { ideogramFieldLabels } from './ideogram';
import { nanoBananaFieldLabels } from './nanoBanana';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ArrowRight, Maximize2, Ellipsis } from 'lucide-react';
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
  const title = renaming ? <input autoFocus className="text-node-rename nodrag nopan" aria-label="节点名称" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) updateNodeData(id, { label: draft.trim() }); setRenaming(false); }} onKeyDown={(e) => { e.stopPropagation(); if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span>{label || fallback}</span>;
  return <header className="text-node-header">{model ? <div className="text-node-title"><NodeIcon nodeType="model-input" />{title}</div> : <NodeTitle type="IMAGE DESCRIBER">{title}</NodeTitle>}<TextNodeMenu id={id} locked={Boolean(locked)} onRename={() => { setDraft(label || fallback); setRenaming(true); }}><Ellipsis size={18} /></TextNodeMenu></header>;
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
    <NodePort id="options" direction="target" label="Options input" title="Options · List input (not available yet)" isConnectable={false} />
    <NodePort direction="source" label="Text output" isConnectable={isConnectable && !data.locked} />
  </>;
}

export function ImageDescriberNode({ id, data, isConnectable }: NodeProps<Describer>) {
  const { updateNodeData: rawUpdateNodeData, getNode, getNodes, getEdges } = useReactFlow<AppNode>();
  const updateNodeData: typeof rawUpdateNodeData = (nodeId, patch, options) => {
    if (isNodeLocked(getNode(nodeId))) return;
    rawUpdateNodeData(nodeId, patch, options);
  };
  const internals = useUpdateNodeInternals();
  const [fullscreen, setFullscreen] = useState(false);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const [outputHeight, setOutputHeight] = useState(272);
  useLayoutEffect(() => {
    const element = outputRef.current;
    if (!element) return;
    const resize = () => {
      element.style.height = '0px';
      const height = Math.min(518, Math.max(272, element.scrollHeight));
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
  return <NodeFrame kind="text" minHeight={nodePortY(count) + 30}>
    <NodeHeading id={id} label={data.label} locked={data.locked} fallback="图像描述" />
    <div className="node-frame-card node-describer-card" style={{ minHeight: outputHeight + 64 }}><div className="text-node-content describer-output" style={{ height: outputHeight, flex: 'none' }}><textarea ref={outputRef} className="nodrag nowheel" readOnly={data.locked} aria-label="Generated text" placeholder="Generated text will appear here" value={data.text} onChange={(e) => { const node = getNode(id); if (node) { let marker: string | undefined; try { marker = sourceSignature({ nodes: getNodes(), edges: getEdges() }, node); } catch { /* Missing sources remain visibly unverified. */ } updateNodeData(id, { text: e.target.value, outputMode: 'manual', sourceSignature: marker }); } }} /><button className="describer-expand nodrag" title="Full screen" aria-label="Full screen" onClick={() => setFullscreen(true)}><Maximize2 size={14} /></button></div></div>
    <NodePortAdd index={count} label="Add another image input" disabled={data.locked} onClick={() => updateNodeData(id, { imageInputs: data.imageInputs + 1 })} />
    <footer className="text-node-footer node-run-footer"><NodeRunFeedback nodeId={id} outputLabel={data.text.trim() ? '已有文本' : undefined} /><ModelRunButton nodeId={id} disabled={data.locked} className="describer-run nodrag nopan" onRun={run}><ArrowRight size={13} />Run Model</ModelRunButton></footer>
    <IterationSummary nodeId={id} />
    {[...Array.from({ length: data.imageInputs }, (_, i) => ({ id: `image-${i}`, label: i ? `Image ${i + 1}` : 'Image *' })), ...exposed.map(field => ({ id: field, label: field === 'model' ? 'Model' : 'System Instructions' }))].map(port =>
      <NodePort key={port.id} id={port.id} direction="target" label={port.label} isConnectable={isConnectable && !data.locked} />)}
    <NodePort direction="source" label="Text output" isConnectable={isConnectable && !data.locked} />
    {fullscreen && <DescriberPreview locked={data.locked} text={data.text} model={data.model} instructions={data.instructions} onClose={() => setFullscreen(false)} onClear={() => { updateNodeData(id, { text: '' }); setFullscreen(false); }} />}
  </NodeFrame>;
}
