import type { ReactNode } from 'react';
import { isActiveTask } from '../nodes/taskQueue';
import { DescriberIcon } from './DescriberIcon';
import { useModelTasks, useModelTaskStore } from './useModelTasks';
import './ModelRunButton.css';

export function ModelRunSpinner() {
  return <svg className="model-run-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M15.333 7.011a6 6 0 0 0-2.834-.99A.534.534 0 0 1 12 5.5c0-.276.224-.502.5-.482A7 7 0 1 1 5.018 12.5.473.473 0 0 1 5.5 12c.276 0 .498.224.52.5a6 6 0 1 0 9.313-5.489" /></svg>;
}

type Props = { nodeId: string; disabled?: boolean; className: string; onRun: () => void; children: ReactNode };
export function ModelRunButton({ nodeId, disabled, className, onRun, children }: Props) {
  const tasks = useModelTasks();
  const store = useModelTaskStore();
  const active = tasks.find(task => task.nodeId === nodeId && task.state === 'Running')
    ?? tasks.find(task => task.nodeId === nodeId && task.state === 'Queued');
  if (!active) return <button type="button" disabled={disabled} className={className} onClick={onRun}>{children}</button>;
  const starting = active.state === 'Queued' || active.progress === 0;
  const label = active.notice || (starting ? 'Starting' : `${active.progress}%`);
  return <div className="model-run-progress nodrag nopan" aria-busy="true">
    <span className="model-run-progress-value" role="progressbar" aria-label="模型运行预估进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={starting ? undefined : active.progress} aria-valuetext={active.notice || (starting ? '正在启动' : `预估 ${active.progress}%`)} title="预估进度，实际完成以模型返回结果为准">
      <ModelRunSpinner /><span>{label}</span>
    </span>
    <button type="button" className="model-run-cancel" aria-label="取消运行" title="取消此节点的运行和排队任务" onClick={() => store.update(all => all.map(task => task.nodeId === nodeId && isActiveTask(task) ? { ...task, state: 'Cancelled' } : task))}><DescriberIcon name="close" /></button>
  </div>;
}
