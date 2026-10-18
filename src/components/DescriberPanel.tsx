import { useEffect, useRef, useState } from 'react';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { X } from 'lucide-react';
import { TaskManager } from './TaskManager';
import { advanceTasks, isActiveTask, type PreviewTask } from '../nodes/taskQueue';
import { isDescriberNode, isNodeLocked } from '../nodes/types';
import type { AppNode, ImageDescriberNode, ModelInputNode } from '../nodes/types';
import { DescriberIcon } from './DescriberIcon';
import { DescriberModelSelect } from './DescriberModelSelect';
import { resolveTextValue } from '../nodes/textVariables';
import { describerModels } from '../nodes/describer';
import { prepareDescriberRun } from '../nodes/describerRun';
import { fileAssets } from '../nodes/fileCollection';

export function DescriberPanel() {
  const nodes = useNodes<AppNode>();
  const edges = useEdges();
  const { setNodes, setEdges, updateNodeData: rawUpdateNodeData, getNodes, getEdges, setCenter } = useReactFlow<AppNode>();
  const updateNodeData: typeof rawUpdateNodeData = (id, data, options) => {
    const node = getNodes().find((item) => item.id === id);
    if (!node || isNodeLocked(node)) return;
    rawUpdateNodeData(id, data, options);
  };
  const runnable = nodes.filter((node) => isDescriberNode(node) && node.selected && !node.data.locked);
  const selected = nodes.find((n): n is ImageDescriberNode => n.type === 'image-describer' && Boolean(n.selected));
  const selectedModel = nodes.find((n): n is ModelInputNode => n.type === 'model-input' && Boolean(n.selected));
  const panelOpen = Boolean(selected || selectedModel);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasks, setTasks] = useState<PreviewTask[]>([]);
  const [runs, setRuns] = useState(1);
  const [error, setError] = useState('');
  const pending = useRef<PreviewTask[]>([]);
  const tasksTrigger = useRef<HTMLButtonElement>(null);
  const changeTasks = (update: (tasks: PreviewTask[]) => PreviewTask[]) => {
    pending.current = update(pending.current);
    setTasks(pending.current);
  };
  const effective = (node: ImageDescriberNode, field: 'model' | 'instructions') => {
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === field);
    return edge ? resolveTextValue(edge.source, nodes, edges) : node.data[field];
  };
  useEffect(() => {
    const run = (event: Event) => {
      const detail = (event as CustomEvent<string | string[]>).detail;
      const result = prepareDescriberRun(getNodes(), getEdges(), Array.isArray(detail) ? detail : [detail], runs);
      if (result.error) { setError(result.error); return; }
      if (!result.tasks.length) return;
      setError(''); setTasksOpen(true);
      pending.current = [...pending.current, ...result.tasks]; setTasks([...pending.current]);
    };
    window.addEventListener('describer-run', run);
    return () => window.removeEventListener('describer-run', run);
  }, [getNodes, getEdges, runs]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = advanceTasks(pending.current, Date.now(), (task) => {
        const current = getNodes();
        if (!current.some((n) => n.id === task.nodeId)) return 'The node was removed.';
        const connected = getEdges().filter((edge) => edge.target === task.nodeId && edge.targetHandle?.startsWith('image-'));
        if (!connected.some((edge) => {
          const source = current.find((n) => n.id === edge.source);
          return source?.type === 'file' && fileAssets(source.data).some((asset) => asset.kind === 'image');
        })) return 'The image input is no longer available.';
        return undefined;
      });
      if (next !== pending.current) { pending.current = next; setTasks(next); }
    }, 200);
    return () => window.clearInterval(timer);
  }, [getNodes, getEdges]);
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
    <aside className={`describer-panel nodrag nopan nowheel ${panelOpen ? 'is-open' : ''}`} aria-label={selectedModel ? "Model Name settings" : "Image Describer settings"} onKeyDown={(e) => e.stopPropagation()}>
      <div className="describer-panel-top">
        <button ref={tasksTrigger} className={tasksOpen ? 'active' : ''} aria-controls={tasksOpen ? 'task-manager' : undefined} aria-expanded={tasksOpen} onClick={() => setTasksOpen(!tasksOpen)}>
          Tasks<DescriberIcon name="chevron" />{tasks.filter(isActiveTask).length || ''}
        </button>
      </div>
      {selectedModel && <div className="describer-settings model-options-settings" key={selectedModel.id}>
        <h2>Model Name</h2><div className="describer-field">Options</div>
        <div role="radiogroup" aria-label="Model options">{(selectedModel.data.options ?? describerModels).map((model, index) => <div className="model-option-row" key={index}>
          <input disabled={selectedModel.data.locked} type="radio" name={`model-${selectedModel.id}`} aria-label={model || `Option ${index + 1}`} checked={selectedModel.data.model === model} onChange={() => updateNodeData(selectedModel.id, { model })} />
          <input disabled={selectedModel.data.locked} aria-label={`Model option ${index + 1}`} value={model} onChange={(event) => { const options = [...(selectedModel.data.options ?? describerModels)]; options[index] = event.target.value; updateNodeData(selectedModel.id, { options, ...(selectedModel.data.model === model ? { model: event.target.value } : {}) }); }} />
        </div>)}</div>
        <button disabled={selectedModel.data.locked} className="model-add-option" onClick={() => updateNodeData(selectedModel.id, { options: [...(selectedModel.data.options ?? describerModels), 'New option'] })}>+ Add another item</button>
      </div>}
      {selected && <>
        <div className="describer-settings" key={selected.id}>
          <h2>Image Describer</h2>
          <div className="describer-field">
            <label htmlFor="describer-model">Model</label>
            <div className="describer-field-row">
              <DescriberModelSelect value={effective(selected, 'model')} disabled={selected.data.locked || selected.data.exposed?.includes('model')} onChange={(model) => updateNodeData(selected.id, { model })} />
              <button disabled={selected.data.locked} className="describer-expose" data-exposed={Boolean(selected.data.exposed?.includes('model'))} title={selected.data.exposed?.includes('model') ? 'Use local value' : 'Set as input'} aria-label="Set model as input" aria-pressed={Boolean(selected.data.exposed?.includes('model'))} onClick={() => expose('model')}><DescriberIcon name="expose" /></button>
            </div>
          </div>
          <div className="describer-field">
            <label htmlFor="describer-instructions">System Instructions</label>
            <div className="describer-field-row">
              <textarea id="describer-instructions" value={effective(selected, 'instructions')} readOnly={selected.data.locked || selected.data.exposed?.includes('instructions')} onChange={(e) => updateNodeData(selected.id, { instructions: e.target.value })} />
              <button disabled={selected.data.locked} className="describer-expose" data-exposed={Boolean(selected.data.exposed?.includes('instructions'))} title={selected.data.exposed?.includes('instructions') ? 'Use local value' : 'Set as input'} aria-label="Set system instructions as input" aria-pressed={Boolean(selected.data.exposed?.includes('instructions'))} onClick={() => expose('instructions')}><DescriberIcon name="expose" /></button>
            </div>
          </div>
        </div>
        <div className="describer-panel-bottom">
          <h3>Run selected nodes</h3>
          <div className="describer-runs"><span>Runs</span><div>
            <button aria-label="Decrement runs" disabled={!runnable.length || runs === 1} onClick={() => setRuns(runs - 1)}><DescriberIcon name="minus" /></button>
            <span>{runs}</span>
            <button aria-label="Increment runs" disabled={!runnable.length || runs === 10} onClick={() => setRuns(runs + 1)}><DescriberIcon name="plus" /></button>
          </div></div>
          <button disabled={!runnable.length} className="describer-primary" title="Preview run · No model requests" onClick={() => window.dispatchEvent(new CustomEvent('describer-run', { detail: getNodes().filter((node) => isDescriberNode(node) && node.selected && !node.data.locked).map((node) => node.id) }))}><DescriberIcon name="run" />Run selected</button>
        </div>
      </>}
    </aside>
    {tasksOpen && <TaskManager tasks={tasks} trigger={tasksTrigger} sidebarOpen={panelOpen}
      onClose={() => setTasksOpen(false)} onChange={changeTasks}
      onRetry={(task) => {
        const node = getNodes().find((item) => item.id === task.nodeId);
        if (!node || !isDescriberNode(node) || node.data.locked) return;
        changeTasks((all) => [...all, {
        ...task, id: crypto.randomUUID(), batchId: crypto.randomUUID(), createdAt: Date.now(),
        state: 'Queued', progress: 0, started: 0, error: undefined,
      }]); }}
      onFocus={(id) => {
        const node = getNodes().find((n) => n.id === id);
        if (!node) return;
        setNodes((all) => all.map((n) => ({ ...n, selected: n.id === id })));
        void setCenter(node.position.x + 230, node.position.y + 200, { zoom: 0.8, duration: 300 });
      }} />}
    {error && <div className="describer-error" role="alert">{error}<button aria-label="Dismiss" onClick={() => setError('')}><X size={14} /></button></div>}
  </>;
}
