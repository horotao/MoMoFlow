import { useEffect, useRef, useState, type RefObject } from 'react';
import { DescriberIcon } from './DescriberIcon';
import { clearFinishedTasks, groupState, isActiveTask, taskGroups, type PreviewTask, type TaskState } from '../nodes/taskQueue';

function TaskStatusIcon({ state }: { state: TaskState }) {
  if (state === 'Done') return <DescriberIcon name="done" />;
  return <svg className={`task-status-icon state-${state.toLowerCase()}`} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true">
    {state === 'Running' ? <><circle cx="12" cy="12" r="6.5" opacity=".25" /><path className="task-spinner" d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5" /></> : <><circle cx="12" cy="12" r="6.5" />{state === 'Queued' ? <path d="M12 8v4l2.5 1.5" /> : state === 'Failed' ? <path d="M12 8.5v4M12 15h.01" /> : <path d="m9.5 9.5 5 5m0-5-5 5" />}</>}
  </svg>;
}
function TaskProgress({ progress, label }: { progress: number; label: string }) {
  return <span className="task-progress" role="progressbar" aria-label={label} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${progress}% (preview)`}><span className="task-progress-label">{progress}%</span><span className="task-progress-track"><span style={{ width: `${progress}%` }} /></span></span>;
}

type Props = {
  tasks: PreviewTask[]; trigger: RefObject<HTMLButtonElement>; sidebarOpen: boolean;
  onClose: () => void; onFocus: (id: string) => void;
  onChange: (update: (tasks: PreviewTask[]) => PreviewTask[]) => void;
  onRetry: (task: PreviewTask) => void;
};
export function TaskManager({ tasks, trigger, sidebarOpen, onClose, onFocus, onChange, onRetry }: Props) {
  const root = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose, trigger]);
  const row = (task: PreviewTask) => {
    const active = isActiveTask(task);
    const detail = `Frontend preview · ${task.model}${task.error ? ` · ${task.error}` : ''}`;
    return <div className={`task-row state-${task.state.toLowerCase()}`} key={task.id}>
      <button className="task-main" title={detail} onClick={() => onFocus(task.nodeId)}>
        <span className="task-name"><TaskStatusIcon state={task.state} /><span>Image Describer</span></span>
        <span className="task-status">{task.state === 'Running' ? <TaskProgress progress={task.progress} label="Image Describer progress" /> : task.state}</span>
      </button>
      <div className="task-actions">
        {(task.state === 'Failed' || task.state === 'Cancelled') && <button title="Retry preview" aria-label="Retry task" onClick={() => onRetry(task)}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 10a6 6 0 1 1 0 4M6 6v4h4" /></svg></button>}
        <button title={active ? 'Cancel' : 'Clear'} aria-label={active ? 'Cancel task' : 'Clear task'} onClick={() => onChange((all) => active ? all.map((t) => t.id === task.id ? { ...t, state: 'Cancelled' } : t) : all.filter((t) => t.id !== task.id))}><DescriberIcon name="close" /></button>
      </div>
    </div>;
  };
  return <section ref={root} id="task-manager" className={`describer-tasks task-manager nodrag nopan nowheel ${sidebarOpen ? 'with-sidebar' : ''}`} aria-label="Task manager" onKeyDown={(e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { onClose(); trigger.current?.focus(); }
  }}>
    <header><span title="Frontend preview · Simulated progress">Task manager</span><button title="Clear finished tasks; queued and running tasks are kept" disabled={clearFinishedTasks(tasks).length === tasks.length} onClick={() => onChange(clearFinishedTasks)}>Clear all</button><button aria-label="Close tasks" onClick={() => { onClose(); trigger.current?.focus(); }}><DescriberIcon name="close" /></button></header>
    <div className="task-list">
      {!tasks.length && <div className="task-empty">No tasks yet</div>}
      {taskGroups(tasks).map((group) => {
        if (group.length === 1) return row(group[0]);
        const id = group[0].batchId;
        const state = groupState(group);
        const done = group.filter((t) => t.state === 'Done').length;
        const active = group.some(isActiveTask);
        const open = expanded.includes(id);
        const progress = Math.floor(group.reduce((sum, t) => sum + t.progress, 0) / group.length);
        const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(group[0].createdAt);
        return <div key={id} className="task-batch"><div className="task-row">
          <button className="task-main" aria-expanded={open} aria-controls={`batch-${id}`} onClick={() => setExpanded((all) => open ? all.filter((key) => key !== id) : [...all, id])}>
            <span className="task-name"><TaskStatusIcon state={state} /><span>{date}</span></span>
            <span className="task-status">{state === 'Running' ? <TaskProgress progress={progress} label="Batch progress" /> : state === 'Done' ? `${done} / ${group.length} Completed` : `${done} / ${group.length} ${state}`}</span>
          </button><div className="task-actions"><button title={active ? 'Cancel batch' : 'Clear batch'} aria-label={active ? 'Cancel batch' : 'Clear batch'} onClick={() => onChange((all) => active ? all.map((t) => t.batchId === id && isActiveTask(t) ? { ...t, state: 'Cancelled' } : t) : all.filter((t) => t.batchId !== id))}><DescriberIcon name="close" /></button></div>
        </div>{open && <div className="task-batch-items" id={`batch-${id}`}>{group.map(row)}</div>}</div>;
      })}
    </div>
    <span className="sr-only">Frontend preview. All task progress is simulated; no model requests are sent.</span>
  </section>;
}
