import { useWorkflowExecution } from './useWorkflowExecution';
import { IterationSummary } from './IterationSummary';
import { ExecutionProblem } from '../nodes/executionGraph';
import { IdeogramSettings } from './IdeogramSettings';
import { ideogramName } from '../nodes/ideogram';
import { isIdeogramNode } from '../nodes/types';
import { NanoBananaSettings } from './NanoBananaSettings';
import { nanoBananaName } from '../nodes/nanoBanana';
import { ModelOptionsSettings } from './ModelOptionsSettings';
import { SunburstSettings } from './SunburstSettings';
import { sunburstName, sunburstProviderLabels } from '../nodes/sunburst';
import { useEffect, useState, type KeyboardEventHandler, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { X } from 'lucide-react';
import { TaskManager } from './TaskManager';
import { isActiveTask } from '../nodes/taskQueue';
import { useModelRuns, useModelTasks, useModelTaskStore } from './useModelTasks';
import { isDescriberNode, isNodeLocked, isImageGeneratorNode, isSunburstNode, isNanoBananaNode } from '../nodes/types';
import type { AppNode, ImageDescriberNode, ModelInputNode } from '../nodes/types';
import { DescriberIcon } from './DescriberIcon';
import { DescriberModelSelect } from './DescriberModelSelect';
import { resolveTextValue } from '../nodes/textVariables';
import { nodeSettingsSpring } from '../lib/springs';
import { NodeIcon } from '../nodes/NodeIcon';
import { NodeSettingsSection } from './NodeSettingsSection';
import { ParameterField } from './ParameterField';
import { ParameterExposeButton } from './ParameterExposeButton';
import './NodeSettingsSidebar.css';

function NodeSettingsSidebar({ children, label, onKeyDown, sunburst = false }: {
  children: ReactNode; label: string; onKeyDown: KeyboardEventHandler<HTMLElement>; sunburst?: boolean;
}) {
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();
  const closed = reduceMotion ? { opacity: 0 } : { x: '100%' };
  return <motion.aside
    className={`describer-panel node-settings-panel is-open nodrag nopan nowheel${sunburst ? ' gpt-image-settings' : ''}`}
    aria-label={label}
    initial={closed}
    animate={reduceMotion ? { opacity: 1 } : { x: '0%' }}
    exit={closed}
    transition={reduceMotion ? { duration: 0.2, ease: [0.16, 1, 0.3, 1] } : nodeSettingsSpring}
    {...(!isPresent ? { inert: '' } : {})}
    onKeyDown={onKeyDown}
  >{children}</motion.aside>;
}

export function DescriberPanel() {
  const nodes = useNodes<AppNode>();
  const edges = useEdges();
  const { setNodes, setEdges, updateNodeData: rawUpdateNodeData, getNodes, setCenter } = useReactFlow<AppNode>();
  const updateNodeData: typeof rawUpdateNodeData = (id, data, options) => {
    const node = getNodes().find((item) => item.id === id);
    if (!node || isNodeLocked(node)) return;
    rawUpdateNodeData(id, data, options);
  };
  const runnable = nodes.filter((node) => (isDescriberNode(node) || isImageGeneratorNode(node)) && node.selected && !node.data.locked);
  const selectedImage = nodes.find((node) => isImageGeneratorNode(node) && node.selected);
  const providerName = selectedImage && isIdeogramNode(selectedImage) ? 'WaveSpeed' : selectedImage && isSunburstNode(selectedImage) ? sunburstProviderLabels[selectedImage.data.provider ?? 'zenmux'] : 'ZenMux';
  const selected = nodes.find((n): n is ImageDescriberNode => n.type === 'image-describer' && Boolean(n.selected));
  const selectedModel = nodes.find((n): n is ModelInputNode => n.type === 'model-input' && Boolean(n.selected));
  const panelOpen = Boolean(selected || selectedModel || selectedImage);
  const sunburstPanel = Boolean(selectedImage && isSunburstNode(selectedImage));
  const tasks = useModelTasks();
  const taskStore = useModelTaskStore();
  const execution = useWorkflowExecution();
  const [runs, setRuns] = useModelRuns();
  const [error, setError] = useState('');
  const effective = (node: ImageDescriberNode, field: 'model' | 'instructions') => {
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === field);
    return edge ? resolveTextValue(edge.source, nodes, edges) : node.data[field];
  };
  useEffect(() => {
    const run = (event: Event) => {
      const detail = (event as CustomEvent<string | string[]>).detail;
      const ids = Array.isArray(detail) ? detail : [detail];
      try {
        void execution.current?.run(ids, taskStore.getRuns());
        setError('');
      } catch (error) {
        setError(error instanceof Error ? error.message : '无法开始运行。');
        if (error instanceof ExecutionProblem) {
          const node = getNodes().find(item => item.id === error.nodeId);
          if (node) { setNodes(all => all.map(item => ({ ...item, selected: item.id === node.id }))); void setCenter(node.position.x + 230, node.position.y + 200, { zoom: .8, duration: 300 }); }
        }
      }
    };
    window.addEventListener('describer-run', run);
    window.addEventListener('sunburst-run', run);
    return () => { window.removeEventListener('describer-run', run); window.removeEventListener('sunburst-run', run); };
  }, [getNodes, taskStore, execution, setNodes, setCenter]);
  const expose = (field: 'model' | 'instructions') => {
    if (!selected || isNodeLocked(getNodes().find((node) => node.id === selected.id))) return;
    const exposed = selected.data.exposed ?? [];
    if (exposed.includes(field)) {
      const value = effective(selected, field);
      updateNodeData(selected.id, { [field]: value, exposed: exposed.filter((f) => f !== field) });
      setEdges((all) => all.filter((e) => !(e.target === selected.id && e.targetHandle === field)));
      return;
    }
    const id = `${field}-${crypto.randomUUID()}`;
    const position = { x: selected.position.x - 540, y: selected.position.y + (field === 'model' ? -200 : 160) };
    const input: AppNode = field === 'model' ? { id, type: 'model-input', position, data: { model: selected.data.model } } : { id, type: 'text', position, data: { label: 'System Instructions', text: selected.data.instructions } };
    setNodes((all) => [...all.map((n) => n.id === selected.id && isDescriberNode(n) ? { ...n, data: { ...n.data, exposed: [...exposed, field] } } : n), input]);
    setEdges((all) => [...all, { id: crypto.randomUUID(), source: id, target: selected.id, targetHandle: field }]);
  };
  return <>
    {/* Presence retains the last settings and full-height shell until the exit finishes. */}
    <AnimatePresence initial={false}>
      {panelOpen && <NodeSettingsSidebar key="node-settings" sunburst={sunburstPanel} label={selectedImage ? `${selectedImage.type === 'ideogram' ? ideogramName : selectedImage.type === 'nano-banana' ? nanoBananaName : sunburstName} 设置` : selectedModel ? `${selectedModel.data.label || "Model Name"} settings` : "Image Describer settings"} onKeyDown={(e) => e.stopPropagation()}>
        {selectedModel && !selectedImage && <ModelOptionsSettings key={selectedModel.id} node={selectedModel} onChange={data => updateNodeData(selectedModel.id, data)} />}
        {selectedImage && isSunburstNode(selectedImage) && <SunburstSettings key={selectedImage.id} node={selectedImage} />}
        {selectedImage && isIdeogramNode(selectedImage) && <IdeogramSettings key={selectedImage.id} node={selectedImage} />}
        {selectedImage && isNanoBananaNode(selectedImage) && <NanoBananaSettings key={selectedImage.id} node={selectedImage} />}
        {selected && !selectedImage && <>
          <NodeSettingsSection title="Image Describer" icon={<NodeIcon nodeType="image-describer" size={20} />} key={selected.id}>
            <ParameterField label="Model" exposeButton={<ParameterExposeButton label="Model" exposed={Boolean(selected.data.exposed?.includes('model'))} disabled={selected.data.locked}
              ariaLabel="Set model as input" title={selected.data.exposed?.includes('model') ? 'Use local value' : 'Set as input'} onClick={() => expose('model')} />}>
              <DescriberModelSelect appearance="settings" compact fluidHover label="Model" value={effective(selected, 'model')} disabled={selected.data.locked || selected.data.exposed?.includes('model')} onChange={(model) => updateNodeData(selected.id, { model })} />
            </ParameterField>
            <ParameterField label="System Instructions" controlId="describer-instructions" exposeButton={<ParameterExposeButton label="System Instructions" exposed={Boolean(selected.data.exposed?.includes('instructions'))} disabled={selected.data.locked}
              ariaLabel="Set system instructions as input" title={selected.data.exposed?.includes('instructions') ? 'Use local value' : 'Set as input'} onClick={() => expose('instructions')} />}>
              <textarea id="describer-instructions" value={effective(selected, 'instructions')} readOnly={selected.data.locked || selected.data.exposed?.includes('instructions')} onChange={(e) => updateNodeData(selected.id, { instructions: e.target.value })} />
            </ParameterField>
          </NodeSettingsSection>
        </>}
        {(selected || selectedImage) && <>
          <div className="describer-panel-bottom">
            <h3>运行选中节点</h3>
            <div className="describer-runs"><span>运行次数</span><div>
              <button aria-label="减少运行次数" disabled={!runnable.length || runs === 1} onClick={() => setRuns(runs - 1)}><DescriberIcon name="minus" /></button>
              <span>{runs}</span>
              <button aria-label="增加运行次数" disabled={!runnable.length || runs === 10} onClick={() => setRuns(runs + 1)}><DescriberIcon name="plus" /></button>
            </div></div>
            {(selectedImage || selected) && <IterationSummary nodeId={(selectedImage || selected)!.id} />}
            {selectedImage && <div className="sunburst-cost"><span>总费用</span><span>按实际用量计费</span></div>}
            <button disabled={!runnable.length || runnable.some(node => tasks.some(task => task.nodeId === node.id && isActiveTask(task)))} className="describer-primary" title={selectedImage ? `通过 ${providerName} 运行图片模型` : "调用 DeepSeek 生成提示词"} onClick={() => window.dispatchEvent(new CustomEvent('describer-run', { detail: getNodes().filter((node) => (isDescriberNode(node) || isImageGeneratorNode(node)) && node.selected && !node.data.locked).map((node) => node.id) }))}><DescriberIcon name="run" />运行选中节点</button>
          </div>
        </>}
      </NodeSettingsSidebar>}
    </AnimatePresence>
    <TaskManager sidebarOpen={panelOpen}
      onRetry={(task) => {
        const node = getNodes().find((item) => item.id === task.nodeId);
        if (!node || (!isDescriberNode(node) && !isImageGeneratorNode(node)) || node.data.locked) return;
        try {
          void execution.current?.run([task.nodeId], 1, task.iteration);
          setError('');
        } catch (error) { setError(error instanceof Error ? error.message : '无法重试任务。'); }
      }}
      onFocus={(id) => {
        const node = getNodes().find((n) => n.id === id);
        if (!node) return;
        setNodes((all) => all.map((n) => ({ ...n, selected: n.id === id })));
        void setCenter(node.position.x + 230, node.position.y + 200, { zoom: 0.8, duration: 300 });
      }} />
    {error && <div className="describer-error" role="alert">{error}<button aria-label="关闭提示" onClick={() => setError('')}><X size={14} /></button></div>}
  </>;
}
