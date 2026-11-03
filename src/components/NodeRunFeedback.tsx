import { useModelTasks } from './useModelTasks';

// Read the same runtime store as the run/cancel button; never persist UI status.
export function NodeRunFeedback({ nodeId, outputLabel }: { nodeId: string; outputLabel?: string }) {
  const tasks = useModelTasks().filter(task => task.nodeId === nodeId);
  const running = tasks.find(task => task.state === 'Running');
  const queued = tasks.filter(task => task.state === 'Queued').length;
  const latest = tasks.reduce<(typeof tasks)[number] | undefined>((last, task) => !last || task.createdAt >= last.createdAt ? task : last, undefined);
  const active = running ?? tasks.find(task => task.state === 'Queued');
  const failed = tasks.find(task => task.batchId === latest?.batchId && task.state === 'Failed');
  const state = active?.state ?? failed?.state ?? latest?.state ?? 'Idle';
  const label = active ? `${running ? '运行中' : '排队中'}${queued ? ` · ${queued} 个排队任务` : ''}`
    : state === 'Failed' ? '运行失败' : state === 'Cancelled' ? '已取消' : outputLabel || (state === 'Done' ? '已完成' : '未运行');
  return <div className="node-run-feedback nodrag nopan" data-state={state}>
    <span role="status">{label}</span>
    {state === 'Failed' && failed?.error && <span className="node-run-error" role="alert">{failed.error}</span>}
  </div>;
}
