import { useId, useRef } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Clock01Icon, ClockAlertIcon, ExclamationMarkIcon, RefreshIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { spring } from '../lib/springs';
import './TaskQueue.css';

type QueueState = 'queued' | 'running' | 'done' | 'failed' | 'timeout' | 'cancelled';

export type QueueTask = {
  id: string;
  label: string;
  state: QueueState;
  progress: number;
  remainingSeconds?: number;
  notice?: string;
  detail?: string;
  error?: string;
};

const stateLabels: Record<QueueState, string> = {
  queued: '排队中',
  running: '运行中',
  done: '已完成',
  failed: '任务失败',
  timeout: '任务超时',
  cancelled: '已取消',
};

const outcomeIcons = { done: Tick02Icon, failed: ExclamationMarkIcon, timeout: ClockAlertIcon };

const isActive = (task: QueueTask) => task.state === 'running' || task.state === 'queued';
const asset = (name: string) => `${import.meta.env.BASE_URL}task-queue/${name}.svg`;

function QueueProgress({ progress, label, className, hidden }: {
  progress: number; label: string; className: string; hidden?: boolean;
}) {
  return <span className={`model-queue-progress ${className}`} role="progressbar" aria-label={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}
    aria-valuetext={`预估 ${Math.round(progress)}%`} aria-hidden={hidden} style={{ width: `${progress}%` }} />;
}

function QueueRunIcon({ progress, state }: { progress: number; state: 'running' | keyof typeof outcomeIcons }) {
  const outcome = state === 'running' ? undefined : state;
  const timeout = outcome === 'timeout';
  return <span className="model-queue-ring" data-outcome={outcome}>
    <svg className="model-queue-spinner" width="20" height="20" viewBox="0 0 20 20">
      <circle className="model-queue-arc" cx="10" cy="10" r="7.5" pathLength="100"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        transform="rotate(-90 10 10)" strokeDasharray={`${outcome ? 100 : Math.max(8, progress)} 100`} />
    </svg>
    <span className="model-queue-symbol">
      {outcome && <HugeiconsIcon icon={outcomeIcons[outcome]} size={timeout ? 18 : 11} strokeWidth={timeout ? undefined : 2.5} />}
    </span>
  </span>;
}

function QueueRow({ task, onCancel, onRetry, onFocus, onRemove }: {
  task: QueueTask;
} & Pick<Props, 'onCancel' | 'onRetry' | 'onFocus' | 'onRemove'>) {
  const reducedMotion = useReducedMotion();
  const { state } = task;
  const running = state === 'running';
  const standalone = state === 'queued' || state === 'cancelled';
  const active = isActive(task);
  const action = active ? onCancel : state !== 'done' ? onRetry : undefined;
  const actionLabel = active ? '取消' : '重试';
  const status = task.notice ?? (running && task.remainingSeconds && task.remainingSeconds > 0
    ? `大约需要${task.remainingSeconds}秒等待`
    : running ? `运行中 · ${Math.round(task.progress)}%` : stateLabels[state]);
  const copy = <>
    <span className="model-queue-name">{task.label}</span>
    <span className="model-queue-status">{status}</span>
  </>;
  return <li className="model-queue-item">
    <div className="model-queue-row" data-state={state}>
      <QueueProgress progress={task.progress} label={`${task.label}预估进度`} hidden={!running}
        className={running ? 'is-running' : state === 'done' ? 'is-done' : 'is-inactive'} />
      <span className="model-queue-preview" aria-hidden="true">
        <motion.span key={standalone ? state : 'progress'} className="model-queue-status-icon"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }} transition={spring.moderate}>
          {standalone ? <HugeiconsIcon icon={state === 'queued' ? Clock01Icon : Cancel01Icon} size={18} />
            : <QueueRunIcon progress={task.progress} state={state} />}
        </motion.span>
      </span>
      {onFocus ? <button type="button" className="model-queue-copy" title={task.detail ?? task.label}
        onClick={() => onFocus(task.id)}>{copy}</button> : <div className="model-queue-copy" title={task.detail ?? task.label}>{copy}</div>}
      {action && <button type="button" className="model-queue-row-action"
        title={active ? '取消等待，已提交的请求仍可能计费' : '重新调用，可能再次计费'} aria-label={`${actionLabel} ${task.label}`} onClick={() => action(task.id)}>
        <HugeiconsIcon icon={active ? Cancel01Icon : RefreshIcon} size={14} aria-hidden="true" />
      </button>}
      {!active && onRemove && <button type="button" className="model-queue-row-action"
        title="清除此任务" aria-label={`清除 ${task.label}`} onClick={() => onRemove(task.id)}>
        <HugeiconsIcon icon={Cancel01Icon} size={14} aria-hidden="true" />
      </button>}
    </div>
    {task.error && <p className="task-error" role="alert">{task.error}</p>}
  </li>;
}

function QueueBody({ id, tasks, ...actions }: Pick<Props, 'tasks' | 'onCancel' | 'onRetry' | 'onFocus' | 'onRemove'> & { id: string }) {
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  return <motion.div id={id} className="model-queue-body"
    {...(!isPresent ? { inert: '', 'aria-hidden': true } : {})}
    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
    transition={reducedMotion ? { duration: 0 } : spring.moderate}>
    {tasks.length ? <ul className="model-queue-list" aria-label="任务">
      {tasks.map(task => <QueueRow key={task.id} task={task} {...actions} />)}
    </ul> : <p className="model-queue-empty">无活动任务</p>}
  </motion.div>;
}

type Props = {
  tasks: QueueTask[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  canClear?: boolean;
  onClear: () => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onFocus?: (id: string) => void;
  onRemove?: (id: string) => void;
};

export function TaskQueue({ tasks, expanded, onExpandedChange, canClear, onClear, ...actions }: Props) {
  const bodyId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const active = tasks.filter(isActive);
  const progress = active.length ? active.reduce((total, task) => total + task.progress, 0) / active.length : 0;

  return <section className="model-queue" aria-label="任务队列" data-expanded={expanded} onKeyDown={event => {
    if (event.key !== 'Escape' || !expanded) return;
    event.stopPropagation();
    onExpandedChange(false);
    toggle.current?.focus();
  }}>
    <header className="model-queue-header">
      {!expanded && !!active.length && <QueueProgress progress={progress} label="活动任务平均预估进度" className="model-queue-summary-progress" />}
      <button ref={toggle} className="model-queue-toggle" type="button" aria-expanded={expanded}
        aria-controls={expanded ? bodyId : undefined} onClick={() => onExpandedChange(!expanded)}>
        <span className="model-queue-title">队列 <span>{active.length} 活动</span></span>
        <img src={asset(expanded ? 'chevron' : 'chevron-right')} alt="" />
      </button>
      {expanded && tasks.length > 0 && <button className="model-queue-clear" type="button"
        title="清除已结束的任务" disabled={!(canClear ?? active.length < tasks.length)} onClick={onClear}>清除</button>}
    </header>
    <AnimatePresence initial={false}>
      {expanded && <QueueBody key="body" id={bodyId} tasks={tasks} {...actions} />}
    </AnimatePresence>
  </section>;
}
