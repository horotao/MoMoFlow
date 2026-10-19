import { ModelOptionsSettings } from './ModelOptionsSettings';
import { SunburstSettings } from './SunburstSettings';
import { prepareSunburstRun } from '../nodes/sunburstRun';
import { requestSunburst } from '../nodes/sunburstClient';
import { useEffect, useRef, useState } from 'react';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { X } from 'lucide-react';
import { TaskManager } from './TaskManager';
import { readyDescriberTasks, isActiveTask, type PreviewTask } from '../nodes/taskQueue';
import { isDescriberNode, isNodeLocked, isSunburstNode } from '../nodes/types';
import type { AppNode, ImageDescriberNode, ModelInputNode } from '../nodes/types';
import { DescriberIcon } from './DescriberIcon';
import { DescriberModelSelect } from './DescriberModelSelect';
import { resolveTextValue } from '../nodes/textVariables';
import { prepareDescriberRun } from '../nodes/describerRun';
import { requestDescription } from '../nodes/describerClient';

export function DescriberPanel() {
  const nodes = useNodes<AppNode>();
  const edges = useEdges();
  const { setNodes, setEdges, updateNodeData: rawUpdateNodeData, getNodes, getEdges, setCenter } = useReactFlow<AppNode>();
  const updateNodeData: typeof rawUpdateNodeData = (id, data, options) => {
    const node = getNodes().find((item) => item.id === id);
    if (!node || isNodeLocked(node)) return;
    rawUpdateNodeData(id, data, options);
  };
  const runnable = nodes.filter((node) => (isDescriberNode(node) || isSunburstNode(node)) && node.selected && !node.data.locked);
  const selectedImage = nodes.find((node) => isSunburstNode(node) && node.selected);
  const selected = nodes.find((n): n is ImageDescriberNode => n.type === 'image-describer' && Boolean(n.selected));
  const selectedModel = nodes.find((n): n is ModelInputNode => n.type === 'model-input' && Boolean(n.selected));
  const panelOpen = Boolean(selected || selectedModel || selectedImage);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasks, setTasks] = useState<PreviewTask[]>([]);
  const [runs, setRuns] = useState(1);
  const [error, setError] = useState('');
  const pending = useRef<PreviewTask[]>([]);
  const workers = useRef(new Map<string, { nodeId: string; controller: AbortController }>());
  const tasksTrigger = useRef<HTMLButtonElement>(null);
  const changeTasks = (update: (tasks: PreviewTask[]) => PreviewTask[]) => {
    pending.current = update(pending.current);
    for (const [id, worker] of workers.current) {
      if (!pending.current.some((task) => task.id === id && isActiveTask(task))) worker.controller.abort();
    }
    setTasks(pending.current);
  };
  const effective = (node: ImageDescriberNode, field: 'model' | 'instructions') => {
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === field);
    return edge ? resolveTextValue(edge.source, nodes, edges) : node.data[field];
  };
  useEffect(() => {
    const run = (event: Event) => {
      const detail = (event as CustomEvent<string | string[]>).detail;
      const ids = Array.isArray(detail) ? detail : [detail];
      if (pending.current.some(task => ids.includes(task.nodeId) && isActiveTask(task))) { setError('选中节点已有运行中的任务，请等待完成后再运行。'); return; }
      const description = prepareDescriberRun(getNodes(), getEdges(), ids, runs);
      const generation = prepareSunburstRun(getNodes(), getEdges(), ids, runs);
      const result = { tasks: [...description.tasks, ...generation.tasks], error: description.error || generation.error };
      if (result.error) { setError(result.error); return; }
      if (!result.tasks.length) return;
      if (result.tasks.some((task) => !task.imageRequest && task.model !== 'deepseek-flash')) { setError('请选择 deepseek-flash；其他模型尚未接入。'); return; }
      setError(''); setTasksOpen(true);
      pending.current = [...pending.current, ...result.tasks]; setTasks([...pending.current]);
    };
    window.addEventListener('describer-run', run);
    window.addEventListener('sunburst-run', run);
    return () => { window.removeEventListener('describer-run', run); window.removeEventListener('sunburst-run', run); };
  }, [getNodes, getEdges, runs]);
  useEffect(() => {
    let disposed = false;
    const activeWorkers = workers.current;
    const timer = window.setInterval(() => {
      const ready = readyDescriberTasks(pending.current, [...activeWorkers.values()].map((worker) => worker.nodeId));
      for (const task of ready) {
        const controller = new AbortController();
        activeWorkers.set(task.id, { nodeId: task.nodeId, controller });
        const update = (state: PreviewTask['state'], error?: string) => {
          if (disposed) return;
          pending.current = pending.current.map((item) => item.id === task.id && isActiveTask(item) ? { ...item, state, error, started: item.started || Date.now(), progress: state === 'Done' ? 100 : 0 } : item);
          if (!disposed) setTasks([...pending.current]);
        };
        update('Running');
        const timeout = window.setTimeout(() => controller.abort(), task.imageRequest ? 310000 : 130000);
        void (async () => {
          try {
            const node = getNodes().find((item) => item.id === task.nodeId);
            if (!node || isNodeLocked(node)) throw new Error('节点已删除或锁定。');
            const result = task.imageRequest ? await requestSunburst(task.imageRequest, controller.signal) : await requestDescription(task, controller.signal);
            if (disposed || !pending.current.some((item) => item.id === task.id && item.state === 'Running')) return;
            const current = getNodes().find((item) => item.id === task.nodeId);
            if (!current || isNodeLocked(current)) throw new Error('节点已删除或锁定，未写入结果。');
            if (typeof result === 'string') rawUpdateNodeData(task.nodeId, { text: result });
            else if (isSunburstNode(current)) rawUpdateNodeData(task.nodeId, { results: [...(current.data.results ?? []), result], activeResultId: result.id });
            update('Done');
          } catch (error) {
            update('Failed', controller.signal.aborted ? '请求已取消或超时；已提交请求仍可能计费，不会自动重试。' : error instanceof Error ? error.message : '请求失败。');
          } finally { window.clearTimeout(timeout); activeWorkers.delete(task.id); }
        })();
      }
    }, 200);
    return () => { disposed = true; window.clearInterval(timer); for (const worker of activeWorkers.values()) worker.controller.abort(); };
  }, [getNodes, rawUpdateNodeData]);
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
    <aside className={`describer-panel nodrag nopan nowheel ${panelOpen ? 'is-open' : ''}`} aria-label={selectedImage ? "GPT Image 2.5 Sunburst settings" : selectedModel ? `${selectedModel.data.label || "Model Name"} settings` : "Image Describer settings"} onKeyDown={(e) => e.stopPropagation()}>
      {selectedImage && <div className="sunburst-provider"><span>ZenMux</span><span>按用量计费</span></div>}
      <div className="describer-panel-top">
        <button ref={tasksTrigger} className={tasksOpen ? 'active' : ''} aria-controls={tasksOpen ? 'task-manager' : undefined} aria-expanded={tasksOpen} onClick={() => setTasksOpen(!tasksOpen)}>
          Tasks<DescriberIcon name="chevron" />{tasks.filter(isActiveTask).length || ''}
        </button>
      </div>
      {selectedModel && !selectedImage && <ModelOptionsSettings key={selectedModel.id} node={selectedModel} onChange={data => updateNodeData(selectedModel.id, data)} />}
      {selectedImage && isSunburstNode(selectedImage) && <SunburstSettings key={selectedImage.id} node={selectedImage} />}
      {selected && !selectedImage && <>
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
      </>}
      {(selected || selectedImage) && <>
        <div className="describer-panel-bottom">
          <h3>Run selected nodes</h3>
          <div className="describer-runs"><span>Runs</span><div>
            <button aria-label="Decrement runs" disabled={!runnable.length || runs === 1} onClick={() => setRuns(runs - 1)}><DescriberIcon name="minus" /></button>
            <span>{runs}</span>
            <button aria-label="Increment runs" disabled={!runnable.length || runs === 10} onClick={() => setRuns(runs + 1)}><DescriberIcon name="plus" /></button>
          </div></div>
          {selectedImage && <div className="sunburst-cost"><span>Total cost</span><span>按实际用量计费</span></div>}
          <button disabled={!runnable.length || runnable.some(node => tasks.some(task => task.nodeId === node.id && isActiveTask(task)))} className="describer-primary" title={selectedImage ? "通过 ZenMux 运行 Sunburst" : "调用 DeepSeek 生成提示词"} onClick={() => window.dispatchEvent(new CustomEvent('describer-run', { detail: getNodes().filter((node) => (isDescriberNode(node) || isSunburstNode(node)) && node.selected && !node.data.locked).map((node) => node.id) }))}><DescriberIcon name="run" />Run selected</button>
        </div>
      </>}
    </aside>
    {tasksOpen && <TaskManager tasks={tasks} trigger={tasksTrigger} sidebarOpen={panelOpen}
      onClose={() => setTasksOpen(false)} onChange={changeTasks}
      onRetry={(task) => {
        const node = getNodes().find((item) => item.id === task.nodeId);
        if (!node || (!isDescriberNode(node) && !isSunburstNode(node)) || node.data.locked) return;
        window.dispatchEvent(new CustomEvent('describer-run', { detail: [task.nodeId] }));
      }}
      onFocus={(id) => {
        const node = getNodes().find((n) => n.id === id);
        if (!node) return;
        setNodes((all) => all.map((n) => ({ ...n, selected: n.id === id })));
        void setCenter(node.position.x + 230, node.position.y + 200, { zoom: 0.8, duration: 300 });
      }} />}
    {error && <div className="describer-error" role="alert">{error}<button aria-label="Dismiss" onClick={() => setError('')}><X size={14} /></button></div>}
  </>;
}
