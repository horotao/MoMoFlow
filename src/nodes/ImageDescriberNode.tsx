import { IterationSummary } from '../components/IterationSummary';
import { sourceSignature } from './executionGraph';
import { ideogramFieldLabels } from './ideogram';
import { nanoBananaFieldLabels } from './nanoBanana';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Position, useEdges, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { LockKeyhole, Maximize2 } from 'lucide-react';
import type { AppNode, ImageDescriberNode as Describer, ModelInputNode as ModelInput } from './types';
import { sunburstFieldLabels } from './sunburst';
import { DescriberModelSelect } from '../components/DescriberModelSelect';
import { isNodeLocked } from './types';
import { TextNodeMenu } from './TextNodeMenu';
import { DescriberPreview } from '../components/DescriberPreview';
import { ModelRunButton } from '../components/ModelRunButton';
import { NodeFrame, NodeHeader } from './shared/NodeFrame';
import { NodePort } from './shared/NodePort';
import { HelperNodeFrame } from './shared/HelperNodeFrame';
import './TextNode.css';
import './shared/mediaNodeStyle.css';
import './ImageDescriberNode.css';

const parameterTitles = { provider: '渠道商', variant: '模型版本', editQuality: '编辑质量', editPrecision: '编辑精度', editSize: '编辑尺寸', resolution: '分辨率', enablePromptExpansion: '提示词扩展', aspectRatio: '宽高比', imageSize: '分辨率', quality: '画质', background: '背景', size: '宽高比', outputFormat: '输出格式' };

export function ModelInputNode({ id, data, isConnectable }: NodeProps<ModelInput>) {
  const edges = useEdges();
  const { updateNodeData: rawUpdateNodeData, getNode } = useReactFlow<AppNode>();
  const updateNodeData: typeof rawUpdateNodeData = (nodeId, patch, options) => {
    if (isNodeLocked(getNode(nodeId))) return;
    rawUpdateNodeData(nodeId, patch, options);
  };
  const defaultTitle = data.parameter ? parameterTitles[data.parameter] : '模型名称';
  const label = data.parameter && data.label === ({ ...sunburstFieldLabels, ...nanoBananaFieldLabels, ...ideogramFieldLabels })[data.parameter] ? defaultTitle : data.label;
  return <HelperNodeFrame id={id} nodeType="model-input" label={label || defaultTitle} locked={data.locked}>
    <DescriberModelSelect node fluidHover label={data.parameter ? ({ ...sunburstFieldLabels, ...nanoBananaFieldLabels, ...ideogramFieldLabels })[data.parameter] : 'Model'} disabled={data.locked} value={data.model} choices={data.options} onChange={(model) => updateNodeData(id, { model })} />
    <NodePort id="options" label="Options" type="target" position={Position.Left} top={28} title="Options · List input (not available yet)" isConnectable={false}>
      <img src="/image-node/port-file.svg" alt="" />
    </NodePort>
    <NodePort label="Text" type="source" position={Position.Right} top={28} isConnectable={isConnectable}>
      <img src={`/node-style/port-text${edges.some(edge => edge.source === id) ? '-connected' : ''}.svg`} alt="" />
    </NodePort>
  </HelperNodeFrame>;
}

export function ImageDescriberNode({ id, data, isConnectable }: NodeProps<Describer>) {
  const { updateNodeData: rawUpdateNodeData, getNode, getNodes, getEdges } = useReactFlow<AppNode>();
  const updateNodeData: typeof rawUpdateNodeData = (nodeId, patch, options) => {
    if (isNodeLocked(getNode(nodeId))) return;
    rawUpdateNodeData(nodeId, patch, options);
  };
  const edges = useEdges();
  const internals = useUpdateNodeInternals();
  const [fullscreen, setFullscreen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelRename = useRef(false);
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
  const inputs = [
    ...Array.from({ length: data.imageInputs }, (_, index) => ({ id: `image-${index}`, label: index ? `Image ${index + 1}` : 'Image *', image: true })),
    ...exposed.map(field => ({ id: field, label: field === 'model' ? 'Model' : 'System Instructions', image: false })),
  ];
  return <NodeFrame className="text-node-frame media-node-frame image-describer-frame" style={{ minHeight: Math.max(403, 121 + (count - 1) * 60) }}>
    <NodeHeader icon={<img src="/node-style/describer.svg" width={16} height={16} alt="" className="node-monochrome" />} title={
      renaming ? <input autoFocus className="text-node-rename nodrag nopan" aria-label="节点名称" maxLength={100}
        value={draft} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value)}
        onBlur={() => { if (!cancelRename.current && draft.trim()) updateNodeData(id, { label: draft.trim() }); setRenaming(false); }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { cancelRename.current = true; event.currentTarget.blur(); }
        }} /> : <span>{data.label || '图像描述'}</span>}
      status={data.locked && <LockKeyhole size={12} aria-label="已锁定" />}
      actions={<TextNodeMenu id={id} appearance="shared" locked={Boolean(data.locked)} onRename={() => {
        cancelRename.current = false; setDraft(data.label || '图像描述'); setRenaming(true);
      }}><img src="/node-style/more.svg" width={18} height={18} alt="" className="node-monochrome" /></TextNodeMenu>} />
    <div className="text-node-content describer-output" style={{ height: outputHeight, flex: 'none' }}>
      <textarea ref={outputRef} className="nodrag nopan nowheel" readOnly={data.locked} aria-label="Generated text"
        placeholder="生成的图像描述将显示在这里" value={data.text} onChange={event => {
          const node = getNode(id);
          if (node) {
            let marker: string | undefined;
            try { marker = sourceSignature({ nodes: getNodes(), edges: getEdges() }, node); } catch { /* Missing sources remain visibly unverified. */ }
            updateNodeData(id, { text: event.target.value, outputMode: 'manual', sourceSignature: marker });
          }
        }} />
      <button type="button" className="describer-expand nodrag nopan" title="Full screen" aria-label="Full screen" onClick={() => setFullscreen(true)}><Maximize2 size={14} /></button>
    </div>
    <footer className="text-node-footer">
      <button type="button" disabled={data.locked} className="text-node-button describer-add nodrag nopan" onClick={() => updateNodeData(id, { imageInputs: data.imageInputs + 1 })}>
        <img src="/node-style/add-image.svg" width={16} height={16} alt="" className="node-monochrome" />添加图片输入
      </button>
      <ModelRunButton appearance="image-node" nodeId={id} disabled={data.locked} className="describer-run nodrag nopan" onRun={run}>
        <img src="/node-style/run.svg" width={16} height={16} alt="" />运行模型
      </ModelRunButton>
    </footer>
    <IterationSummary nodeId={id} />
    {inputs.map((port, index) => {
      const connected = edges.some(edge => edge.target === id && edge.targetHandle === port.id);
      return <div key={port.id} className={port.image ? 'media-port-image' : 'media-port-parameter'}>
        <NodePort label={port.label} id={port.id} type="target" position={Position.Left} top={89 + index * 60} isConnectable={isConnectable}>
          <img width={32} height={32} alt="" src={port.image ? '/image-node/port-image.svg' : `/node-style/port-text${connected ? '-connected' : ''}.svg`} />
          {port.image && connected && <span className="media-port-dot" />}
        </NodePort>
      </div>;
    })}
    <NodePort label="Text" type="source" position={Position.Right} isConnectable={isConnectable}>
      <img width={32} height={32} alt="" src={`/node-style/port-text${edges.some(edge => edge.source === id) ? '-connected' : ''}.svg`} />
    </NodePort>
    {fullscreen && <DescriberPreview locked={data.locked} text={data.text} model={data.model} instructions={data.instructions} onClose={() => setFullscreen(false)} onClear={() => { updateNodeData(id, { text: '' }); setFullscreen(false); }} />}
  </NodeFrame>;
}
