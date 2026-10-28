import type { IdeogramRequest } from './ideogram';
import type { NanoBananaRequest } from './nanoBanana';
import type { SunburstRequest } from './sunburst';
export type TaskState = 'Queued' | 'Running' | 'Done' | 'Cancelled' | 'Failed';
export type PreviewTask = {
  id: string; batchId: string; nodeId: string; model: string; createdAt: number;
  instructions?: string; images?: string[]; imageRequest?: SunburstRequest; nanoBananaRequest?: NanoBananaRequest; ideogramRequest?: IdeogramRequest;
  progress: number; state: TaskState; started: number; error?: string; notice?: string; label?: string;
};
export const isActiveTask = (task: PreviewTask) => task.state === 'Queued' || task.state === 'Running';

// The synchronous model APIs do not report progress. Ease toward 95%, and only
// let the actual response mark a task Done. Never advance cancelled/failed tasks.
export function advanceEstimatedProgress(tasks: PreviewTask[], now: number): PreviewTask[] {
  let changed = false;
  const next = tasks.map(task => {
    if (task.state !== 'Running') return task;
    const duration = (task.imageRequest || task.nanoBananaRequest || task.ideogramRequest) ? 90000 : 30000;
    const elapsed = Math.max(0, now - task.started);
    const estimate = Math.min(95, Math.floor(96 * (1 - Math.exp(-elapsed / (duration / 2)))));
    const progress = Math.max(task.progress, estimate);
    if (progress === task.progress) return task;
    changed = true;
    return { ...task, progress };
  });
  return changed ? next : tasks;
}

// The preview queue has one worker. Terminal tasks never resume or change later.
export function advanceTasks(tasks: PreviewTask[], now: number, validate: (task: PreviewTask) => string | undefined): PreviewTask[] {
  const active = tasks.find(isActiveTask);
  if (!active) return tasks;
  const error = validate(active);
  let next: PreviewTask;
  if (error) next = { ...active, state: 'Failed', error };
  else if (active.state === 'Queued') next = { ...active, state: 'Running', started: now };
  else {
    const progress = Math.min(100, Math.max(active.progress, Math.floor((now - active.started) / 100)));
    next = { ...active, progress, state: progress === 100 ? 'Done' : 'Running' };
  }
  return tasks.map((task) => task.id === active.id ? next : task);
}

export function taskGroups(tasks: PreviewTask[]) {
  const groups = new Map<string, PreviewTask[]>();
  for (const task of tasks) groups.set(task.batchId, [...(groups.get(task.batchId) ?? []), task]);
  return [...groups.values()].reverse();
}
export function groupState(tasks: PreviewTask[]): TaskState {
  if (tasks.some((task) => task.state === 'Running')) return 'Running';
  if (tasks.some((task) => task.state === 'Queued')) return 'Queued';
  if (tasks.some((task) => task.state === 'Failed')) return 'Failed';
  if (tasks.some((task) => task.state === 'Cancelled')) return 'Cancelled';
  return 'Done';
}

export function clearFinishedTasks(tasks: PreviewTask[]) {
  const activeBatches = new Set(tasks.filter(isActiveTask).map((task) => task.batchId));
  return tasks.filter((task) => activeBatches.has(task.batchId));
}

// Different nodes run concurrently; repeated runs of one node retain queue order.
export function readyDescriberTasks(tasks: PreviewTask[], activeNodeIds: string[]): PreviewTask[] {
  const busy = new Set([...activeNodeIds, ...tasks.filter((task) => task.state === 'Running').map((task) => task.nodeId)]);
  return tasks.filter((task) => {
    if (task.state !== 'Queued' || busy.has(task.nodeId)) return false;
    busy.add(task.nodeId);
    return true;
  });
}
