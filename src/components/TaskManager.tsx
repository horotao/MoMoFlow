import { ideogramName } from '../nodes/ideogram';
import { nanoBananaName } from '../nodes/nanoBanana';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { DescriberIcon } from './DescriberIcon';
import { ModelRunSpinner } from './ModelRunButton';
import { clearFinishedTasks, groupState, isActiveTask, taskGroups, type PreviewTask, type TaskState } from '../nodes/taskQueue';

const taskStateLabels: Record<TaskState, string> = { Queued: '排队中', Running: '运行中…', Done: '已完成', Cancelled: '已取消', Failed: '失败' };

function TaskStatusIcon({ state }: { state: TaskState }) {
  if (state === 'Done') return <DescriberIcon name="done" />;
  if (state === 'Running') return <ModelRunSpinner />;
  return <svg className={`task-status-icon state-${state.toLowerCase()}`} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="6.5" />{state === 'Queued' ? <path d="M12 8v4l2.5 1.5" /> : state === 'Failed' ? <path d="M12 8.5v4M12 15h.01" /> : <path d="m9.5 9.5 5 5m0-5-5 5" />}
  </svg>;
}
function TaskProgress({ progress, label }: { progress: number; label: string }) {
  return <span className="task-progress" role="progressbar" aria-label={label} title="预估进度，实际完成以模型返回结果为准" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`预估 ${progress}%`}><span className="task-progress-label">{progress}%</span><span className="task-progress-track"><span style={{ width: `${progress}%` }} /></span></span>;
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
    const detail = `${task.model}${task.error ? ` · ${task.error}` : ''}`;
    return <div className={`task-row state-${task.state.toLowerCase()}`} key={task.id}>
      <button className="task-main" title={detail} onClick={() => onFocus(task.nodeId)}>
        <span className="task-name"><TaskStatusIcon state={task.state} /><span>{task.ideogramRequest ? `${ideogramName}${task.ideogramRequest.image ? ' Edit' : ''}` : task.nanoBananaRequest ? nanoBananaName : task.imageRequest ? 'GPT Image 2.5 Sunburst' : '图像描述'}</span></span>
        <span className="task-status">{task.state === 'Running' ? <TaskProgress progress={task.progress} label="任务预估进度" /> : taskStateLabels[task.state]}</span>
      </button>
      <div className="task-actions">
        {(task.state === 'Failed' || task.state === 'Cancelled') && <button title="重新调用（可能再次计费）" aria-label="重试任务" onClick={() => onRetry(task)}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 10a6 6 0 1 1 0 4M6 6v4h4" /></svg></button>}
        <button title={active ? '取消' : '清除'} aria-label={active ? '取消任务' : '清除任务'} onClick={() => onChange((all) => active ? all.map((t) => t.id === task.id ? { ...t, state: 'Cancelled' } : t) : all.filter((t) => t.id !== task.id))}><DescriberIcon name="close" /></button>
      </div>
      {task.error && <div className="task-error" role="alert">{task.error}</div>}
    </div>;
  };
  return <section ref={root} id="task-manager" className={`describer-tasks task-manager nodrag nopan nowheel ${sidebarOpen ? 'with-sidebar' : ''}`} aria-label="任务管理" onKeyDown={(e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { onClose(); trigger.current?.focus(); }
  }}>
    <header><span title="模型任务">任务管理</span><button title="清除已结束的任务，保留排队和运行中的任务" disabled={clearFinishedTasks(tasks).length === tasks.length} onClick={() => onChange(clearFinishedTasks)}>清除已结束任务</button><button aria-label="关闭任务面板" onClick={() => { onClose(); trigger.current?.focus(); }}><DescriberIcon name="close" /></button></header>
    <div className="task-list">
      {!tasks.length && <div className="task-empty">暂无任务</div>}
      {taskGroups(tasks).map((group) => {
        if (group.length === 1) return row(group[0]);
        const id = group[0].batchId;
        const state = groupState(group);
        const done = group.filter((t) => t.state === 'Done').length;
        const active = group.some(isActiveTask);
        const open = expanded.includes(id);
        const progress = Math.floor(group.reduce((sum, t) => sum + t.progress, 0) / group.length);
        const date = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(group[0].createdAt);
        return <div key={id} className="task-batch"><div className="task-row">
          <button className="task-main" aria-expanded={open} aria-controls={`batch-${id}`} onClick={() => setExpanded((all) => open ? all.filter((key) => key !== id) : [...all, id])}>
            <span className="task-name"><TaskStatusIcon state={state} /><span>{date}</span></span>
            <span className="task-status">{state === 'Running' ? <TaskProgress progress={progress} label="批次进度" /> : state === 'Done' ? `${done} / ${group.length} 已完成` : `${done} / ${group.length} ${taskStateLabels[state]}`}</span>
          </button><div className="task-actions"><button title={active ? '取消整批任务' : '清除整批任务'} aria-label={active ? '取消整批任务' : '清除整批任务'} onClick={() => onChange((all) => active ? all.map((t) => t.batchId === id && isActiveTask(t) ? { ...t, state: 'Cancelled' } : t) : all.filter((t) => t.batchId !== id))}><DescriberIcon name="close" /></button></div>
        </div>{open && <div className="task-batch-items" id={`batch-${id}`}>{group.map(row)}</div>}</div>;
      })}
    </div>
    <span className="sr-only">取消会停止等待，已提交的请求仍可能计费。</span>
  </section>;
}
