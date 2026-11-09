import { useLayoutEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { clearFinishedTasks, isActiveTask, taskGroups, type PreviewTask, type TaskState } from '../nodes/taskQueue';
import { ideogramName } from '../nodes/ideogram';
import { nanoBananaName } from '../nodes/nanoBanana';
import { sunburstName } from '../nodes/sunburst';
import { spring } from '../lib/springs';
import { TaskQueue, type QueueTask } from './TaskQueue';
import { useModelTaskStore, useModelTasks } from './useModelTasks';

const queueStates: Record<TaskState, QueueTask['state']> = {
  Queued: 'queued', Running: 'running', Done: 'done',
  Failed: 'failed', TimedOut: 'timeout', Cancelled: 'cancelled',
};

function queueTask(task: PreviewTask): QueueTask {
  const label = task.label || (task.ideogramRequest ? `${ideogramName}${task.ideogramRequest.image ? ' Edit' : ''}`
    : task.nanoBananaRequest ? nanoBananaName : task.imageRequest ? sunburstName : '图像描述');
  const iteration = task.iteration;
  const detail = iteration
    ? `${task.model} · 第 ${iteration.index + 1} ${iteration.kind === 'image' ? `张：${iteration.name}` : `条：${iteration.text}`}`
    : task.model;
  return { id: task.id, label, detail, progress: task.progress, state: queueStates[task.state], notice: task.notice, error: task.error };
}

type Props = {
  sidebarOpen: boolean;
  onFocus: (id: string) => void;
  onRetry: (task: PreviewTask) => void;
};

export function TaskManager({ sidebarOpen, onFocus, onRetry }: Props) {
  const tasks = useModelTasks();
  const store = useModelTaskStore();
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  useLayoutEffect(() => {
    let previous = new Set<string>();
    const openOnStart = () => {
      const active = store.getSnapshot().filter(isActiveTask).map(task => `${task.id}:${task.state}`);
      if (active.some(key => !previous.has(key))) setExpanded(true);
      previous = new Set(active);
    };
    openOnStart();
    return store.subscribe(openOnStart);
  }, [store]);

  return <motion.div className="canvas-task-queue nodrag nopan nowheel" data-sidebar-open={sidebarOpen}
    layout={reduceMotion ? false : 'position'} layoutDependency={sidebarOpen}
    transition={{ layout: sidebarOpen ? spring.slow : spring.slow.exit }}
    onKeyDown={event => event.stopPropagation()}>
    <TaskQueue tasks={taskGroups(tasks).flat().map(queueTask)} expanded={expanded} onExpandedChange={setExpanded}
      canClear={clearFinishedTasks(tasks).length < tasks.length}
      onClear={() => store.update(clearFinishedTasks)}
      onCancel={id => store.update(all => all.map(task => task.id === id && isActiveTask(task) ? { ...task, state: 'Cancelled', notice: undefined } : task))}
      onRemove={id => store.update(all => all.filter(task => task.id !== id || isActiveTask(task)))}
      onFocus={id => { const task = tasks.find(item => item.id === id); if (task) onFocus(task.nodeId); }}
      onRetry={id => { const task = tasks.find(item => item.id === id); if (task && !isActiveTask(task)) onRetry(task); }} />
  </motion.div>;
}
