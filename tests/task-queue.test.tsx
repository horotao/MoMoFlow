import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TaskQueue, type QueueTask } from '../src/components/TaskQueue';
import '../src/index.css';
import './task-queue.css';

type Outcome = 'done' | 'failed' | 'timeout';
type Run = {
  id: string;
  label: string;
  start: number;
  duration: number;
  outcome: Outcome;
  cancelled?: QueueTask;
};

const scenarios = {
  success: { label: '正常完成', description: '两条任务并行运行，先后完成。' },
  failure: { label: '任务失败', description: '模型返回错误，任务进入失败状态。' },
  timeout: { label: '请求超时', description: '请求超过等待上限，任务进入超时状态。' },
  mixed: { label: '混合队列', description: '完成、失败和超时同时留在队列，另有一条任务从排队转为运行。' },
} as const;
type Scenario = keyof typeof scenarios;

const prototypeTasks: QueueTask[] = [
  { id: 'prototype-image', label: 'GPT image 2.5', state: 'running', progress: 65, remainingSeconds: 12 },
  { id: 'prototype-banana', label: 'Nano banana', state: 'running', progress: 45, remainingSeconds: 38 },
];

function taskAt(run: Run, now: number): QueueTask {
  if (run.cancelled) return run.cancelled;
  const { id, label, start, duration, outcome } = run;
  const elapsed = now - start;
  if (elapsed < 0) return { id, label, state: 'queued', progress: 0 };
  const progress = Math.min(95, Math.round(elapsed / duration * 95));
  if (elapsed < duration) return { id, label, state: 'running', progress, remainingSeconds: Math.ceil((duration - elapsed) / 1000) };
  if (outcome === 'done') return { id, label, state: 'done', progress: 100 };
  return { id, label, state: outcome, progress, detail: outcome === 'failed' ? '模拟：模型未返回有效结果。' : '模拟：请求超过等待上限。' };
}

function Preview() {
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<Scenario | 'prototype' | 'empty'>('prototype');
  const [runs, setRuns] = useState<Run[]>([]);
  const [now, setNow] = useState(Date.now);
  const tasks = mode === 'prototype' ? prototypeTasks : runs.map(run => taskAt(run, now));
  const playing = mode !== 'prototype' && tasks.some(task => task.state === 'queued' || task.state === 'running');

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [playing]);

  const runScenario = (scenario: Scenario) => {
    const start = Date.now();
    const makeRun = (label: string, duration: number, outcome: Outcome, delay = 0): Run =>
      ({ id: crypto.randomUUID(), label, start: start + delay, duration, outcome });
    const image = makeRun('GPT image 2.5', 3600, 'done');
    const banana = makeRun('Nano banana', 6200, 'done');
    const failed = makeRun('Nano banana', 4800, 'failed');
    const timeout = makeRun('GPT image 2.5', 6800, 'timeout');
    const cases = {
      success: [image, banana],
      failure: [failed],
      timeout: [timeout],
      mixed: [image, failed, timeout, makeRun('图像描述', 3500, 'done', 3400)],
    };
    setMode(scenario);
    setRuns(cases[scenario]);
    setNow(start);
  };

  return <main className="queue-preview">
    <h1>任务队列 · 隔离预览</h1>
    <p>点击场景重放任务，点击队列标题可收起或展开。所有任务均为本地模拟。</p>
    <nav className="queue-preview-controls" aria-label="队列演示场景">
      <button type="button" aria-pressed={mode === 'prototype'} onClick={() => setMode('prototype')}>Figma 原型</button>
      {Object.entries(scenarios).map(([key, scenario]) => <button key={key} type="button"
        aria-pressed={mode === key} onClick={() => runScenario(key as Scenario)}>{scenario.label}</button>)}
      <button type="button" aria-pressed={mode === 'empty'} onClick={() => { setRuns([]); setMode('empty'); }}>空闲</button>
    </nav>
    <p className="queue-preview-description" role="status">
      {mode === 'prototype' ? 'Figma 的两秒循环，用于对照进度填充和转圈动画。'
        : mode === 'empty' ? '队列没有任务。' : scenarios[mode].description}
    </p>
    <div className="queue-preview-stage" data-prototype={mode === 'prototype'}>
      <TaskQueue tasks={tasks} expanded={expanded} onExpandedChange={setExpanded}
        onClear={() => setRuns(current => current.filter(run => {
          const { state } = taskAt(run, Date.now());
          return state === 'queued' || state === 'running';
        }))}
        onCancel={mode === 'prototype' ? undefined : (id) => {
          const at = Date.now();
          setRuns(current => current.map(run => {
            if (run.id !== id) return run;
            const task = taskAt(run, at);
            if (task.state !== 'queued' && task.state !== 'running') return run;
            return { ...run, cancelled: { ...task, state: 'cancelled' } };
          }));
        }}
        onRetry={id => {
          const start = Date.now();
          setRuns(current => current.map(run => run.id === id
            ? { ...run, start, duration: 3600, outcome: 'done', cancelled: undefined }
            : run));
          setNow(start);
        }} />
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
