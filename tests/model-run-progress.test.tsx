import { useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, type Edge } from '@xyflow/react';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { useModelTasks, useModelTaskStore } from '../src/components/useModelTasks';
import { DescriberPanel } from '../src/components/DescriberPanel';
import { SunburstNode } from '../src/nodes/SunburstNode';
import { TextNode } from '../src/nodes/TextNode';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import { isActiveTask, type PreviewTask } from '../src/nodes/taskQueue';
import type { AppNode, FileAsset } from '../src/nodes/types';
import { isSunburstNode } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
const context = canvas.getContext('2d')!;
const gradient = context.createLinearGradient(0, 0, 320, 240);
gradient.addColorStop(0, '#1c3d65'); gradient.addColorStop(1, '#b2ddc4');
context.fillStyle = gradient; context.fillRect(0, 0, 320, 240);
const image = canvas.toDataURL('image/png');
const asset: FileAsset = { id: 'sample', kind: 'image', name: 'Local sample.png', url: image, width: 320, height: 240 };
const nodeTypes = { text: TextNode, sunburst: SunburstNode };
const initialNodes: AppNode[] = [
  { id: 'prompt', type: 'text', position: { x: 0, y: 40 }, data: { text: 'A quiet mountain landscape in soft morning light.' } },
  { id: 'image', type: 'sunburst', position: { x: 540, y: 40 }, data: { ...defaultSunburstSettings, imageInputs: 1, results: [asset], activeResultId: asset.id } },
  { id: 'source', type: 'file', position: { x: 540, y: 600 }, data: { assets: [asset] } },
  { id: 'second', type: 'sunburst', position: { x: 1080, y: 40 }, data: { ...defaultSunburstSettings, imageInputs: 1 } },
];
const initialEdges: Edge[] = [
  { id: 'prompt-image', source: 'prompt', target: 'image', targetHandle: 'prompt' },
  { id: 'second-prompt', source: 'prompt', target: 'second', targetHandle: 'prompt' },
];

type Request = { path: string; signal?: AbortSignal | null; resolve: (response: Response) => void; settled: boolean };
const requests: Request[] = [];
const originalFetch = window.fetch.bind(window);
// Never send model requests from this fixture. Deliberately allow late mock
// responses after abort so the production write-back guards are exercised.
window.fetch = (input, init) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (path === '/api/sunburst') return new Promise(resolve => requests.push({ path, signal: init?.signal, resolve, settled: false }));
  if (/^(data:|blob:)/.test(path)) return originalFetch(input, init);
  return Promise.reject(new Error(`Unexpected request blocked by fixture: ${path}`));
};
function respond(request: Request, outcome: 'success' | 'failure' | 'timeout' = 'success') {
  request.settled = true;
  const body = outcome === 'timeout' ? { error: 'Mock request timed out', code: 'MODEL_TIMEOUT' }
    : outcome === 'failure' ? { error: 'Mock provider failure' }
      : { image, format: 'png' };
  request.resolve(Response.json(body, { status: outcome === 'success' ? 200 : 502 }));
}

let nodesNow: AppNode[] = [];
let store: ReturnType<typeof useModelTaskStore>;
let canUndo = false;
let replaceNodes: (change: (nodes: AppNode[]) => AppNode[]) => void;
function start() { window.dispatchEvent(new CustomEvent('describer-run', { detail: ['image', 'second'] })); }
function advance() { store.update(all => all.map(task => task.state === 'Running' ? { ...task, started: Date.now() - 30000 } : task)); }
function Harness() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const restore = useCallback((snapshot: { nodes: AppNode[]; edges: Edge[] }) => { setNodes(snapshot.nodes); setEdges(snapshot.edges); }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  const tasks = useModelTasks();
  store = useModelTaskStore(); nodesNow = nodes; canUndo = history.canUndo; replaceNodes = setNodes;
  return <CanvasHistoryContext.Provider value={history}>
    <div className="qa-toolbar"><button onClick={start}>演示运行</button><button onClick={advance}>推进预估进度</button><button onClick={() => requests.filter(request => !request.settled).forEach(request => respond(request))}>模拟完成</button><span>本地模拟 · {tasks.filter(isActiveTask).length} 个活动任务</span></div>
    <div className="qa-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connection => setEdges(all => addEdge(connection, all))} fitView fitViewOptions={{ padding: .15 }} colorMode="dark">
      <Background /><Controls /><MiniMap /><DescriberPanel />
    </ReactFlow></div>
  </CanvasHistoryContext.Provider>;
}

function find<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(check: () => boolean, message: string) {
  for (let frame = 0; frame < 300; frame++) {
    if (check()) return;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  throw new Error(message);
}
const nodeTask = (id: string) => [...store.getSnapshot()].reverse().find(task => task.nodeId === id);
const nodeSelector = (id: string) => `.react-flow__node[data-id="${id}"]`;
async function run() {
  createRoot(document.getElementById('root')!).render(<ReactFlowProvider><ModelTasksProvider><Harness /></ModelTasksProvider></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('.sunburst-run')) && nodesNow.length === 4, 'Nodes did not mount');
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const checks: string[] = [];
  const check = (value: unknown, message: string) => { assert(value, message); checks.push(message); };
  const queueToggle = find<HTMLButtonElement>('.model-queue-toggle');
  check(queueToggle.getAttribute('aria-expanded') === 'false', 'Canvas queue starts collapsed');
  const imageRun = find<HTMLButtonElement>('.sunburst-run');
  check(getComputedStyle(imageRun).font === getComputedStyle(find('[data-id=second] .sunburst-run')).font, 'Idle Run Model buttons share the same UI font');
  imageRun.click();
  await until(() => Boolean(document.querySelector(`${nodeSelector('image')} [aria-busy="true"]`)), 'Starting state missing');
  check(Boolean(find(`${nodeSelector('image')} .model-run-progress`).textContent?.match(/\d+%|等待上游/))
    && !document.querySelector(`${nodeSelector('image')} .sunburst-run`), 'Starting displays fixed-width progress in place of Run Model');
  await until(() => requests.length === 1, 'Image request not scheduled');
  find('[data-id=second] .sunburst-run').click();
  await until(() => requests.length === 2, 'Second model did not start concurrently');
  window.dispatchEvent(new CustomEvent('sunburst-run', { detail: 'image' }));
  advance();
  await until(() => Number(nodeTask('image')?.progress) > 0 && Number(nodeTask('second')?.progress) > 0, 'Progress did not advance');
  check(requests.length === 2, 'Running nodes cannot submit duplicate requests');
  const spinner = find(`${nodeSelector('image')} .model-run-spinner`);
  const style = getComputedStyle(spinner);
  check(style.animationDuration === (matchMedia('(prefers-reduced-motion: reduce)').matches ? '4s' : '0.84s'), 'GPT spinner uses the Figma animation duration');
  check(style.animationTimingFunction === (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'steps(4)' : 'linear'), 'Spinner respects reduced motion');
  const progress = find(`${nodeSelector('image')} .model-run-progress`);
  check(getComputedStyle(progress).height === '32px' && getComputedStyle(progress).minWidth === '98px' && getComputedStyle(progress).borderRadius === '13px', 'GPT progress frame matches 98 × 32 and 13px corners');
  const progressNumber = find(`${nodeSelector('image')} .image-node-run-number`);
  check(/^["']?DM Mono["']?,/.test(getComputedStyle(progressNumber).fontFamily), 'Image model progress digits keep DM Mono');
  const secondProgress = find(`${nodeSelector('second')} .model-run-progress`);
  check(getComputedStyle(secondProgress).minWidth === '98px' && getComputedStyle(secondProgress).height === '32px' && getComputedStyle(secondProgress).borderRadius === '13px', 'Second model reuses the image model progress frame');
  check(Number(find(`${nodeSelector('image')} [role="progressbar"]`).getAttribute('aria-valuenow')) === nodeTask('image')?.progress, 'Node percentage matches shared task progress');
  check(queueToggle.getAttribute('aria-expanded') === 'true' && document.querySelectorAll('.model-queue-row[data-state=running] .model-queue-progress').length === 2, 'Active tasks open the queue and show both estimated progresses');
  queueToggle.click();
  await until(() => Boolean(document.querySelector('.model-queue-summary-progress')), 'Collapsed progress is missing');
  check(Number(find('.model-queue-summary-progress').getAttribute('aria-valuenow')) > 0, 'Manually collapsed queue shows average estimated progress');
  queueToggle.click();
  check(!canUndo, 'Progress does not create canvas undo entries');
  check(!JSON.stringify(nodesNow).includes('progress'), 'Progress stays out of saved node data');
  find<HTMLButtonElement>(`${nodeSelector('image')} .model-run-cancel`).click();
  await until(() => nodeTask('image')?.state === 'Cancelled', 'Cancellation not shared');
  check(requests[0].signal?.aborted && !requests[1].signal?.aborted, 'Cancelling one node aborts only its request');
  respond(requests[0]);
  respond(requests[1]);
  await until(() => nodeTask('second')?.state === 'Done' && nodesNow.some(node => node.id === 'second' && isSunburstNode(node) && node.data.results?.length === 1), 'Sibling did not finish');
  const imageNode = nodesNow.find(node => node.id === 'image');
  check(imageNode && isSunburstNode(imageNode) && imageNode.data.results?.length === 1 && nodeTask('image')?.state === 'Cancelled', 'Late cancelled response cannot write back or resume');
  check(nodesNow.some(node => node.id === 'second' && isSunburstNode(node) && node.data.results?.length === 1) && nodeTask('second')?.progress === 100, 'Successful response writes output and marks 100 percent');
  check(!document.querySelector('.model-run-progress') && Boolean(document.querySelector('.sunburst-run')) && Boolean(document.querySelector('[data-id=second] .sunburst-run')), 'Completed and cancelled nodes restore Run Model');
  find('.sunburst-run').click();
  await until(() => requests.length === 3, 'Second image run missing');
  respond(requests[2], 'failure');
  await until(() => nodeTask('image')?.state === 'Failed' && Boolean(document.querySelector('.task-error')), 'Failure not reported');
  check(Boolean(document.querySelector('.sunburst-run')) && find('.task-error').textContent?.includes('Mock provider failure'), 'Failure restores button and retains error details');
  replaceNodes(all => all.map(node => node.id === 'image' && isSunburstNode(node) ? { ...node, data: { ...node.data, locked: true } } : node));
  await until(() => find<HTMLButtonElement>('.sunburst-run').disabled, 'Lock did not disable run');
  check(find<HTMLButtonElement>('.sunburst-run').disabled, 'Locked idle node remains disabled');
  replaceNodes(all => all.map(node => node.id === 'image' && isSunburstNode(node) ? { ...node, data: { ...node.data, locked: false } } : node));
  await until(() => !find<HTMLButtonElement>('.sunburst-run').disabled, 'Unlock did not restore run');
  find('.sunburst-run').click();
  await until(() => requests.length === 4, 'Successful image run missing');
  respond(requests[3]);
  await until(() => nodeTask('image')?.state === 'Done' && Boolean(document.querySelector('.sunburst-run')), 'Image did not finish');
  const completed = nodesNow.find(node => node.id === 'image');
  check(completed && isSunburstNode(completed) && completed.data.results?.length === 2, 'Image success appends one result and stops animation');
  replaceNodes(all => all.map(node => ({ ...node, selected: node.id === 'image' })));
  await until(() => Boolean(document.querySelector('.gpt-run-field')), 'Settings sidebar did not open');
  find('.gpt-run-count [role="slider"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await until(() => document.querySelector('.gpt-run-count-value')?.textContent === '2', 'Batch count not updated');
  find('.sunburst-run').click();
  await until(() => requests.length === 5 && store.getSnapshot().some(task => task.nodeId === 'image' && task.state === 'Queued'), 'Ordered batch did not start');
  find(`${nodeSelector('image')} .model-run-cancel`).click();
  await until(() => !store.getSnapshot().some(task => task.nodeId === 'image' && isActiveTask(task)), 'Batch cancellation left queued work');
  check(requests[4].signal?.aborted && store.getSnapshot().slice(-2).every(task => task.state === 'Cancelled'), 'Node cancellation stops both running and queued runs');
  respond(requests[4]);
  find('.gpt-run-count [role="slider"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await until(() => document.querySelector('.gpt-run-count-value')?.textContent === '1', 'Batch count not reset');
  find('.sunburst-run').click();
  await until(() => requests.length === 6, 'Timeout request did not start');
  respond(requests[5], 'timeout');
  await until(() => nodeTask('image')?.state === 'TimedOut' && Boolean(document.querySelector('[data-outcome="timeout"]')), 'Request timeout did not reach the canvas queue');
  check(find('[data-state="timeout"] .model-queue-status').textContent === '任务超时', 'Timeout has a distinct terminal status and icon');
  find('[data-state="timeout"] [aria-label^="重试 "]').click();
  await until(() => requests.length === 7 && Boolean(document.querySelector('.model-queue-row[data-state="running"]')), 'Retry did not start a new request');
  find('.model-queue-row[data-state="running"] [aria-label^="取消 "]').click();
  await until(() => nodeTask('image')?.state === 'Cancelled', 'Queue cancellation did not reach the execution store');
  check(requests[6].signal?.aborted, 'Retry starts one request and cancellation aborts it');
  respond(requests[6]);
  find('.model-queue-clear').click();
  await until(() => store.getSnapshot().length === 0 && Boolean(document.querySelector('.model-queue-empty')), 'Clear did not remove terminal tasks');

  // Seed terminal tasks directly: exercise the real manager's ordering and
  // replacement without scheduling any model calls or touching saved canvases.
  const createdAt = Date.now();
  const queueTask = (index: number, offset: number): PreviewTask => ({
    id: `queue-window-${index}`, batchId: 'queue-window', nodeId: 'image', model: 'sunburst',
    createdAt: createdAt + offset, label: `窗口任务 ${index}`, state: 'Done', progress: 100, started: 0,
  });
  const visibleIds = () => [...document.querySelectorAll<HTMLElement>('.model-queue-item:not([aria-hidden="true"])')]
    .map(row => row.dataset.taskId).join(',');
  store.update(() => [queueTask(1, 10), queueTask(2, 30), queueTask(3, 20), queueTask(4, 30), queueTask(5, 15)]);
  await until(() => visibleIds() === 'queue-window-4,queue-window-2,queue-window-3', 'Latest three tasks not ordered by creation time');
  check(store.getSnapshot().length === 5, 'Three-row display retains older tasks in the store');
  check(visibleIds() === 'queue-window-4,queue-window-2,queue-window-3', 'Creation time and insertion order determine the latest three, including timestamp ties');
  store.update(all => all.map(task => task.id === 'queue-window-4' ? { ...task, state: 'Failed' } : task));
  await until(() => Boolean(document.querySelector('[data-task-id="queue-window-4"] [data-state="failed"]')), 'Status did not update');
  check(visibleIds() === 'queue-window-4,queue-window-2,queue-window-3', 'Task status updates do not reorder the visible window');
  find<HTMLButtonElement>('[data-task-id="queue-window-3"] [aria-label^="清除 "]').focus();
  store.update(all => [...all, queueTask(6, 40)]);
  await until(() => visibleIds() === 'queue-window-6,queue-window-4,queue-window-2', 'New task did not replace the oldest visible task');
  await until(() => document.activeElement === queueToggle, 'Removed task did not restore keyboard focus');
  check(document.activeElement === queueToggle, 'Replacing a focused row restores focus to the queue toggle');
  const exiting = document.querySelector<HTMLElement>('[data-task-id="queue-window-3"]');
  check(!exiting || (exiting.hasAttribute('inert') && exiting.getAttribute('aria-hidden') === 'true'
    && getComputedStyle(exiting).pointerEvents === 'none'), 'Exiting rows cannot receive input or appear in the accessible task list');
  for (let index = 7; index <= 12; index++) {
    store.update(all => [...all, queueTask(index, index * 10)]);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  await until(() => visibleIds() === 'queue-window-12,queue-window-11,queue-window-10'
    && document.querySelectorAll('.model-queue-item').length === 3, 'Rapid replacements left stale rows');
  check(visibleIds() === 'queue-window-12,queue-window-11,queue-window-10', 'Rapid replacements settle on the newest three without stale rows');
  find('[data-task-id="queue-window-12"] [aria-label^="清除 "]').click();
  await until(() => visibleIds() === 'queue-window-11,queue-window-10,queue-window-9', 'Removing a task did not fill the visible window');
  check(store.getSnapshot().length === 11, 'Removing a visible task only removes that task and reveals the next newest');
  find('.model-queue-clear').click();
  await until(() => store.getSnapshot().length === 0 && Boolean(document.querySelector('.model-queue-empty')), 'Clear did not remove hidden finished tasks');
  check(store.getSnapshot().length === 0, 'Clear removes both visible and hidden finished tasks');

  // Keep a fresh mock run available for visual/mouse/zoom acceptance.
  start();
  await until(() => requests.length === 9, 'Visual demo did not start');
  advance();
  await until(() => Number(nodeTask('image')?.progress) > 0, 'Visual demo progress missing');
  document.getElementById('results')!.textContent = `PASS (${checks.length}) · No real model calls\n${checks.join('\n')}`;
  document.getElementById('results')!.dataset.result = 'passed';
}
void run().catch(error => {
  document.getElementById('results')!.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
  document.getElementById('results')!.dataset.result = 'failed';
});
