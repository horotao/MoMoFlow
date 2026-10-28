import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, type Edge } from '@xyflow/react';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { useModelTasks, useModelTaskStore } from '../src/components/useModelTasks';
import { DescriberPanel } from '../src/components/DescriberPanel';
import { SunburstNode } from '../src/nodes/SunburstNode';
import { ImageDescriberNode } from '../src/nodes/ImageDescriberNode';
import { TextNode } from '../src/nodes/TextNode';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import { isActiveTask } from '../src/nodes/taskQueue';
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
const nodeTypes = { text: TextNode, sunburst: SunburstNode, 'image-describer': ImageDescriberNode };
const initialNodes: AppNode[] = [
  { id: 'prompt', type: 'text', position: { x: 0, y: 40 }, data: { text: 'A quiet mountain landscape in soft morning light.' } },
  { id: 'image', type: 'sunburst', position: { x: 540, y: 40 }, data: { ...defaultSunburstSettings, imageInputs: 1, results: [asset], activeResultId: asset.id } },
  { id: 'source', type: 'file', position: { x: 540, y: 600 }, data: { assets: [asset] } },
  { id: 'description', type: 'image-describer', position: { x: 1080, y: 40 }, data: { text: '', imageInputs: 1, model: 'deepseek-flash', instructions: '' } },
];
const initialEdges: Edge[] = [
  { id: 'prompt-image', source: 'prompt', target: 'image', targetHandle: 'prompt' },
  { id: 'image-description', source: 'source', sourceHandle: 'file', target: 'description', targetHandle: 'image-0' },
];

type Request = { path: string; signal?: AbortSignal | null; resolve: (response: Response) => void; settled: boolean };
const requests: Request[] = [];
const originalFetch = window.fetch.bind(window);
// Never send model requests from this fixture. Deliberately allow late mock
// responses after abort so the production write-back guards are exercised.
window.fetch = (input, init) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (path === '/api/sunburst' || path === '/api/describer') return new Promise(resolve => requests.push({ path, signal: init?.signal, resolve, settled: false }));
  if (/^(data:|blob:)/.test(path)) return originalFetch(input, init);
  return Promise.reject(new Error(`Unexpected request blocked by fixture: ${path}`));
};
function respond(request: Request, failed = false) {
  request.settled = true;
  request.resolve(Response.json(failed ? { error: 'Mock provider failure' } : request.path === '/api/sunburst' ? { image, format: 'png' } : { text: 'Mock description result' }, { status: failed ? 500 : 200 }));
}

let nodesNow: AppNode[] = [];
let store: ReturnType<typeof useModelTaskStore>;
let canUndo = false;
let replaceNodes: (change: (nodes: AppNode[]) => AppNode[]) => void;
function start() { window.dispatchEvent(new CustomEvent('describer-run', { detail: ['image', 'description'] })); }
function advance() { store.update(all => all.map(task => task.state === 'Running' ? { ...task, started: Date.now() - 30000 } : task)); }
function Harness() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [dark, setDark] = useState(true);
  const restore = useCallback((snapshot: { nodes: AppNode[]; edges: Edge[] }) => { setNodes(snapshot.nodes); setEdges(snapshot.edges); }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  const tasks = useModelTasks();
  store = useModelTaskStore(); nodesNow = nodes; canUndo = history.canUndo; replaceNodes = setNodes;
  return <CanvasHistoryContext.Provider value={history}>
    <div className="qa-toolbar"><button onClick={start}>演示运行</button><button onClick={advance}>推进预估进度</button><button onClick={() => requests.filter(request => !request.settled).forEach(request => respond(request))}>模拟完成</button><button onClick={() => { document.documentElement.classList.toggle('dark', !dark); setDark(!dark); }}>切换主题</button><span>本地模拟 · {tasks.filter(isActiveTask).length} 个活动任务</span></div>
    <div className="qa-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connection => setEdges(all => addEdge(connection, all))} fitView fitViewOptions={{ padding: .15 }} colorMode={dark ? 'dark' : 'light'}>
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
  find('.sunburst-run').click();
  await until(() => Boolean(document.querySelector(`${nodeSelector('image')} [aria-busy="true"]`)), 'Starting state missing');
  check(Boolean(find(`${nodeSelector('image')} .model-run-progress`).textContent?.match(/Starting|等待上游/)), 'Starting replaces Run Model');
  await until(() => requests.length === 1, 'Image request not scheduled');
  find('.describer-run').click();
  await until(() => requests.length === 2, 'Description did not start concurrently');
  window.dispatchEvent(new CustomEvent('sunburst-run', { detail: 'image' }));
  advance();
  await until(() => Number(nodeTask('image')?.progress) > 0 && Number(nodeTask('description')?.progress) > 0, 'Progress did not advance');
  check(requests.length === 2, 'Running nodes cannot submit duplicate requests');
  const spinner = find(`${nodeSelector('image')} .model-run-spinner`);
  const style = getComputedStyle(spinner);
  check(style.animationDuration === (matchMedia('(prefers-reduced-motion: reduce)').matches ? '4s' : '1s'), 'Spinner uses the reference animation duration');
  check(style.animationTimingFunction === (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'steps(4)' : 'linear'), 'Spinner respects reduced motion');
  const progress = find(`${nodeSelector('image')} .model-run-progress`);
  check(getComputedStyle(progress).height === '32px' && getComputedStyle(progress).minWidth === '120px' && getComputedStyle(progress).borderRadius === '8px', 'Progress frame matches 120 × 32 and 8px corners');
  check(Number(find(`${nodeSelector('image')} [role="progressbar"]`).getAttribute('aria-valuenow')) === nodeTask('image')?.progress, 'Node percentage matches shared task progress');
  check(document.querySelectorAll('.task-progress').length === 2, 'Task list shows both percentages and progress tracks');
  check(!canUndo, 'Progress does not create canvas undo entries');
  check(!JSON.stringify(nodesNow).includes('progress'), 'Progress stays out of saved node data');
  find<HTMLButtonElement>(`${nodeSelector('image')} .model-run-cancel`).click();
  await until(() => nodeTask('image')?.state === 'Cancelled', 'Cancellation not shared');
  check(requests[0].signal?.aborted && !requests[1].signal?.aborted, 'Cancelling one node aborts only its request');
  respond(requests[0]);
  respond(requests[1]);
  await until(() => nodeTask('description')?.state === 'Done' && find<HTMLTextAreaElement>(`${nodeSelector('description')} textarea`).value === 'Mock description result', 'Sibling did not finish');
  const imageNode = nodesNow.find(node => node.id === 'image');
  check(imageNode && isSunburstNode(imageNode) && imageNode.data.results?.length === 1 && nodeTask('image')?.state === 'Cancelled', 'Late cancelled response cannot write back or resume');
  check(find<HTMLTextAreaElement>(`${nodeSelector('description')} textarea`).value === 'Mock description result' && nodeTask('description')?.progress === 100, 'Successful response writes output and marks 100 percent');
  check(!document.querySelector('.model-run-progress') && Boolean(document.querySelector('.sunburst-run')) && Boolean(document.querySelector('.describer-run')), 'Completed and cancelled nodes restore Run Model');
  find('.sunburst-run').click();
  await until(() => requests.length === 3, 'Second image run missing');
  respond(requests[2], true);
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
  find<HTMLButtonElement>('[aria-label="增加运行次数"]').click();
  await until(() => document.querySelector('.describer-runs > div > span')?.textContent === '2', 'Batch count not updated');
  find('.sunburst-run').click();
  await until(() => requests.length === 5 && store.getSnapshot().some(task => task.nodeId === 'image' && task.state === 'Queued'), 'Ordered batch did not start');
  find(`${nodeSelector('image')} .model-run-cancel`).click();
  await until(() => !store.getSnapshot().some(task => task.nodeId === 'image' && isActiveTask(task)), 'Batch cancellation left queued work');
  check(requests[4].signal?.aborted && store.getSnapshot().slice(-2).every(task => task.state === 'Cancelled'), 'Node cancellation stops both running and queued runs');
  respond(requests[4]);
  find<HTMLButtonElement>('[aria-label="减少运行次数"]').click();
  await until(() => document.querySelector('.describer-runs > div > span')?.textContent === '1', 'Batch count not reset');
  // Keep a fresh mock run available for visual/mouse/zoom acceptance.
  start();
  await until(() => requests.length === 7, 'Visual demo did not start');
  advance();
  await until(() => Number(nodeTask('image')?.progress) > 0, 'Visual demo progress missing');
  document.getElementById('results')!.textContent = `PASS (${checks.length}) · No real model calls\n${checks.join('\n')}`;
  document.getElementById('results')!.dataset.result = 'passed';
}
void run().catch(error => {
  document.getElementById('results')!.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
  document.getElementById('results')!.dataset.result = 'failed';
});
