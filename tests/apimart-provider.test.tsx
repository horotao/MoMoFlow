import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { MotionConfig } from 'motion/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { useModelTaskStore } from '../src/components/useModelTasks';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import type { AppNode, SunburstNode } from '../src/nodes/types';
import { prepareSunburstRun } from '../src/nodes/sunburstRun';
import { requestSunburst } from '../src/nodes/sunburstClient';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

let api: ReactFlowInstance<AppNode>;
let taskStore: ReturnType<typeof useModelTaskStore>;
function Probe() { taskStore = useModelTaskStore(); api = useReactFlow<AppNode>(); Object.assign(window, { apimartQA: { api } }); return null; }
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(predicate: () => boolean, message: string) {
  for (let index = 0; index < 900; index++) { if (predicate()) return; await settle(); }
  throw new Error(message);
}
function find<T extends HTMLElement = HTMLButtonElement>(selector: string) {
  const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element;
}
const read = () => api.getNode('image') as SunburstNode;
const checks: string[] = [];
function check(value: unknown, message: string) { if (!value) throw new Error(message); checks.push(message); }
async function choose(field: string, label: string) {
  find(`[aria-label="${field}"]`).click(); await settle();
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === label);
  if (!option) throw new Error(`Missing ${field} option ${label}`);
  option.click(); await settle();
}
async function options(field: string) {
  find(`[aria-label="${field}"]`).click(); await settle();
  const values = [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(item => item.textContent);
  document.querySelector('[role="listbox"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  return values;
}
async function closeTasks() { document.querySelector<HTMLButtonElement>('.model-queue-toggle[aria-expanded="true"]')?.click(); await settle(); }

async function run() {
  const nativeFetch = window.fetch.bind(window);
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
  canvas.getContext('2d')!.fillStyle = '#a497c6'; canvas.getContext('2d')!.fillRect(0, 0, 160, 90);
  const png = canvas.toDataURL('image/png');
  const requests: Record<string, unknown>[] = [];
  let polls = 0;
  let remoteCancelled = false;
  window.fetch = async (url, init) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path === '/api/apimart/images') {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ taskId: `task_mock_${requests.length}` });
    }
    if (path === '/api/apimart/task') {
      polls++;
      const body = JSON.parse(String(init?.body));
      if (remoteCancelled) return Response.json({ status: 'cancelled', taskId: body.taskId });
      if (polls === 1) return Response.json({ code: 'MODEL_TIMEOUT', error: 'mock query timeout', taskId: body.taskId }, { status: 502 });
      return Response.json({ image: png, format: 'png' });
    }
    if (path.startsWith('/api/') || /^https?:/.test(path)) throw new Error('Real model/network requests are disabled in isolated APIMart QA');
    return nativeFetch(url, init);
  };
  const db = `momoflow-apimart-qa-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(db); await storage.load();
  const node = createLibraryNode('sunburst', { x: 650, y: 80 }) as SunburstNode;
  const workflow: Workflow = { nodes: [
    { id: 'prompt', type: 'text', position: { x: 70, y: 80 }, data: { text: 'A product on a table' } },
    { id: 'reference', type: 'file', position: { x: 70, y: 500 }, data: { assets: [{ id: 'ref', name: 'ref.png', kind: 'image', url: png, width: 160, height: 90 }] } },
    { ...node, id: 'image', selected: true, data: { ...node.data, size: '3840x2160', quality: 'max' } } as SunburstNode,
  ], edges: [{ id: 'prompt-image', source: 'prompt', target: 'image', targetHandle: 'prompt' }], colorMode: 'dark', viewport: { x: 0, y: 120, zoom: .7 } };
  createRoot(find('#root')).render(<MotionConfig reducedMotion="user"><ModelTasksProvider><ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider></ModelTasksProvider></MotionConfig>);
  await until(() => Boolean(document.querySelector('[aria-label="渠道商"]')), 'Settings did not mount');
  await choose('渠道商', 'APIMart');
  check(read().data.provider === 'apimart' && read().data.size === '16:9' && read().data.resolution === '4K', 'Channel switch converts the existing 4K preset into APIMart ratio and resolution');
  check(!document.querySelector('[aria-label="背景"]') && !document.querySelector('[data-id="image"] [data-handleid="mask"]'), 'APIMart hides background and Mask');
  const ratios = await options('宽高比');
  check(ratios.length === 11 && !ratios.includes('自定义') && !ratios.includes('2:1'), 'Only auto and the 10 supported ratios are offered');
  check((await options('分辨率')).join(',') === '1K,2K,4K', 'Resolution has exactly 1K, 2K, 4K');
  check((await options('画质')).length === 6, 'APIMart retains all six qualities');
  check((await options('输出格式')).join(',') === 'PNG,JPEG,WebP,GIF', 'APIMart offers raster formats and GIF, with SVG excluded');
  await choose('模型版本', 'Flare'); await choose('分辨率', '2K'); await choose('复杂度', '高');
  find('[aria-label="将分辨率设为输入"]').click(); await settle();
  check(find<HTMLButtonElement>('[aria-label="分辨率"]').disabled, 'Exposed resolution disables the local selector');
  const resolutionSource = api.getEdges().find(edge => edge.target === 'image' && edge.targetHandle === 'resolution')!.source;
  api.updateNodeData(resolutionSource, { model: '4K' }); await settle();
  find('[aria-label="分辨率使用本地值"]').click(); await settle();
  check(read().data.resolution === '4K', 'Returning to local resolution retains the resolved 4K value');
  await choose('输出格式', 'GIF');
  check(read().data.size === 'auto' && find<HTMLButtonElement>('[aria-label="宽高比"]').disabled, 'GIF switches to auto ratio and disables ratio changes');
  await choose('输出格式', 'PNG'); await choose('宽高比', '16:9');
  find('.sunburst-run').click();
  await until(() => Boolean(read().data.results?.length), 'Async generation did not finish');
  check(requests.length === 1 && polls === 2, 'A timed out status query polls the existing task without another generation');
  check(requests[0].provider === 'apimart' && requests[0].variant === 'Flare' && requests[0].resolution === '4K' && requests[0].complexity === 'high', 'Actual run snapshots APIMart version, resolution and complexity');
  check(read().data.results![0].width === 160 && read().data.results![0].height === 90, 'Downloaded result keeps actual image dimensions');
  await closeTasks();
  api.addEdges({ id: 'ref-image', source: 'reference', target: 'image', sourceHandle: 'file', targetHandle: 'image-0' }); await settle();
  find('.sunburst-run').click();
  await until(() => read().data.results?.length === 2, 'Reference edit did not finish');
  check(Array.isArray(requests[1].images) && requests[1].images.length === 1 && String(requests[1].images[0]).startsWith('data:image/png;base64,'), 'Local reference bytes reach the APIMart upload boundary');
  await closeTasks();
  const roundtrip = new WorkflowStorage(`${db}-roundtrip`); await roundtrip.load();
  await roundtrip.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const reload = new WorkflowStorage(`${db}-roundtrip`); const restored = await reload.load();
  const saved = restored!.nodes.find(item => item.id === 'image') as SunburstNode;
  check(saved.data.provider === 'apimart' && saved.data.variant === 'Flare' && saved.data.resolution === '4K' && saved.data.complexity === 'high', 'IndexedDB restores APIMart settings');
  check(saved.data.results?.length === 2 && (await nativeFetch(saved.data.results[1].url)).ok, 'IndexedDB restores generated image bytes');
  reload.dispose(); roundtrip.dispose();
  api.addEdges({ id: 'invalid-mask', source: 'reference', target: 'image', sourceHandle: 'file', targetHandle: 'mask' }); await settle();
  check(/不支持 Mask/.test(prepareSunburstRun(api.getNodes(), api.getEdges(), ['image'], 1).error ?? ''), 'Existing Mask connections block APIMart before any submission');
  await choose('渠道商', 'OpenAI 官方');
  check(read().data.size === '3840x2160' && Boolean(document.querySelector('[data-id="image"] [data-handleid="mask"]')), 'Switching back restores pixel size and Mask port');
  canvasHistoryShortcut('undo'); await settle();
  check(read().data.provider === 'apimart' && read().data.size === '16:9', 'Undo restores APIMart provider and dimensions together');
  canvasHistoryShortcut('redo'); await settle();
  check(read().data.provider === 'openai' && read().data.size === '3840x2160', 'Redo restores OpenAI provider and dimensions together');
  await choose('渠道商', 'APIMart');
  api.setEdges(edges => edges.filter(edge => edge.id !== 'invalid-mask')); api.updateNodeData('image', { locked: true }); await settle();
  check(find<HTMLButtonElement>('[aria-label="渠道商"]').disabled && find<HTMLButtonElement>('[aria-label="复杂度"]').disabled, 'Locked APIMart settings cannot be edited');
  api.updateNodeData('image', { locked: false }); await settle();
  const controller = new AbortController();
  const cancelled = requestSunburst({ ...read().data, provider: 'apimart', prompt: 'cancel', images: [] }, controller.signal);
  await until(() => requests.length === 3, 'Cancellation fixture did not submit');
  controller.abort();
  await cancelled.catch(error => check(error instanceof DOMException && error.name === 'AbortError', 'Cancellation stops pending polling'));
  remoteCancelled = true;
  const lastResult = read().data.results!.at(-1)!.id;
  find('.sunburst-run').click();
  await until(() => taskStore.getSnapshot().some(task => task.state === 'Cancelled' && task.error?.includes('task_mock_4')), 'Remote cancellation did not reach the task manager');
  check(document.querySelector('.canvas-task-queue')?.textContent?.includes('已取消'), 'Task manager displays remote APIMart cancellation');
  check(read().data.results!.at(-1)!.id === lastResult && requests.length === 4, 'Remote cancellation preserves prior images and never resubmits generation');
  Object.assign(window, { apimartQA: { api, requests, polls, checks } });
  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} checks · mock only\n${checks.join('\n')}`;
}
void run().catch(error => { find('#results').dataset.result = 'failed'; find('#results').textContent = `${checks.join('\n')}\nFAIL: ${error instanceof Error ? error.message : error}`; });
