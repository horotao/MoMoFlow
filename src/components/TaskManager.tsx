import { useState } from 'react';
import { clearFinishedTasks, isActiveTask, modelTaskLabel, type PreviewTask, type TaskState } from '../nodes/taskQueue';
import { TaskQueue, type QueueTask } from './TaskQueue';
import { useModelTaskStore, useModelTasks } from './useModelTasks';

const queueStates: Record<TaskState, QueueTask['state']> = {
  Queued: 'queued', Running: 'running', Done: 'done',
  Failed: 'failed', TimedOut: 'timeout', Cancelled: 'cancelled',
};

function queueTask(task: PreviewTask): QueueTask {
  const label = modelTaskLabel(task);
  const detail = task.model;
  return { id: task.id, label, detail, progress: task.progress, state: queueStates[task.state], notice: task.notice, error: task.error };
}

type Props = {
  onFocus: (id: string) => void;
  onRetry: (task: PreviewTask) => void;
};

export function TaskManager({ onFocus, onRetry }: Props) {
  const tasks = useModelTasks();
  const store = useModelTaskStore();
  const [expanded, setExpanded] = useState(false);
  // The store appends tasks. Reverse first so equally timed batch items also
  // show the newest additions first, independently of their execution state.
  const newestTasks = [...tasks].reverse().sort((a, b) => b.createdAt - a.createdAt);
  return <div className="canvas-task-queue nodrag nopan nowheel"
    onKeyDown={event => event.stopPropagation()}>
    <TaskQueue tasks={newestTasks.map(queueTask)} expanded={expanded} onExpandedChange={setExpanded}
      canClear={clearFinishedTasks(tasks).length < tasks.length}
      onClear={() => store.update(clearFinishedTasks)}
      onCancel={id => store.update(all => all.map(task => task.id === id && isActiveTask(task) ? { ...task, state: 'Cancelled', notice: undefined } : task))}
      onRemove={id => store.update(all => all.filter(task => task.id !== id || isActiveTask(task)))}
      onFocus={id => { const task = tasks.find(item => item.id === id); if (task) onFocus(task.nodeId); }}
      onRetry={id => { const task = tasks.find(item => item.id === id); if (task && !isActiveTask(task)) onRetry(task); }} />
  </div>;
}
