import { apiSettingsStorageKey } from '../src/components/apiSettings';
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
  await until(() => [...document.querySelectorAll<HTMLElement>('[role="option"]')].some(item => item.textContent === label), `Missing ${field} option ${label}`);
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === label);
  if (!option) throw new Error(`Missing ${field} option ${label}`);
  option.click(); await settle();
}
async function options(field: string) {
  find(`[aria-label="${field}"]`).click(); await settle();
  await until(() => Boolean(document.querySelector('[role="option"]')), `Missing ${field} options`);
  const values = [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(item => item.textContent);
  document.querySelector('[role="listbox"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  return values;
}
async function closeTasks() { document.querySelector<HTMLButtonElement>('.model-queue-toggle[aria-expanded="true"]')?.click(); await settle(); }
async function fillNumber(label: string, value: string) {
  const input = find<HTMLInputElement>(`[aria-label="${label}"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true })); await settle();
}

async function run() {
  // Keep BYOK credentials isolated from the user's saved API settings.
  const nativeGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key: string) {
    if (key === apiSettingsStorageKey) return JSON.stringify({ provider: 'apimart', credentials: { apimart: { apiKey: 'isolated-upload-test-key', baseUrl: 'https://api.apimart.ai/v1' } } });
    return nativeGetItem.call(this, key);
  };
  const nativeFetch = window.fetch.bind(window);
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
  canvas.getContext('2d')!.fillStyle = '#a497c6'; canvas.getContext('2d')!.fillRect(0, 0, 160, 90);
  const png = canvas.toDataURL('image/png');
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><path fill="#a497c6" d="M0 0h160v90H0z"/></svg>';
  const requests: Record<string, unknown>[] = [];
  let polls = 0;
  let remoteCancelled = false;
  window.fetch = async (url, init) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path === 'https://api.apimart.ai/v1/uploads/images?retention_days=3') {
      check(init?.body instanceof FormData && (init.body.get('file') as File)?.type === 'image/png', 'Browser uploads original PNG as multipart');
      check(new Headers(init?.headers).get('Authorization') === 'Bearer isolated-upload-test-key', 'Upload uses isolated BYOK credentials');
      return Response.json({ url: 'https://cdn.example/uploaded-reference.png' });
    }
    if (path === '/api/apimart/images') {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ taskId: `task_mock_${requests.length}` });
    }
    if (path === '/api/apimart/task') {
      polls++;
      const body = JSON.parse(String(init?.body));
      if (remoteCancelled) return Response.json({ status: 'cancelled', taskId: body.taskId });
      if (polls === 1) return Response.json({ code: 'MODEL_TIMEOUT', error: 'mock query timeout', taskId: body.taskId }, { status: 502 });
      const request = requests[Number(String(body.taskId).split('_').at(-1)) - 1];
      const format = request.outputFormat;
      return Response.json({ status: 'completed', imageUrl: `https://cdn.example/result.${format}`, format });
    }
    if (path.startsWith('https://cdn.example/result.')) {
      const format = path.split('.').at(-1);
      return nativeFetch(format === 'svg' ? `data:image/svg+xml;base64,${btoa(svg)}` : format === 'gif' ? gif : png);
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
    { ...node, id: 'image', selected: true, data: { ...node.data, provider: 'openai', size: '3840x2160', quality: 'max' } } as SunburstNode,
  ], edges: [{ id: 'prompt-image', source: 'prompt', target: 'image', targetHandle: 'prompt' }], colorMode: 'dark', viewport: { x: 0, y: 120, zoom: .7 } };
  createRoot(find('#root')).render(<MotionConfig reducedMotion="user"><ModelTasksProvider><ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider></ModelTasksProvider></MotionConfig>);
  await until(() => Boolean(document.querySelector('[aria-label="渠道商"]')), 'Settings did not mount');
  await choose('渠道商', 'APIMart');
  check(read().data.provider === 'apimart' && read().data.size === '16:9' && read().data.resolution === '4K', 'Channel switch converts the existing 4K preset into APIMart ratio and resolution');
  check((await options('渠道模型')).join(',') === 'GPT Image 2.6 EXT,GPT Image 2.6', 'APIMart offers both channel models with EXT as the legacy default');
  check(!document.querySelector('[aria-label="背景"]') && !document.querySelector('[data-id="image"] [data-handleid="mask"]'), 'APIMart hides background and Mask');
  const ratios = await options('宽高比');
  check(ratios.length === 11 && !ratios.includes('自定义') && !ratios.includes('2:1'), 'Only auto and the 10 supported ratios are offered');
  check((await options('分辨率')).join(',') === '1K,2K,4K', 'Resolution has exactly 1K, 2K, 4K');
  check((await options('画质')).length === 6, 'APIMart retains all six qualities');
  check((await options('输出格式')).join(',') === 'PNG,JPEG,WebP,GIF', 'APIMart offers raster formats and GIF, with SVG excluded');
  check(!document.querySelector('[aria-label="复杂度"]') && !document.querySelector('[aria-label="内容审核"]'), 'EXT hides fixed complexity and moderation controls');
  await choose('模型版本', 'Flare'); await choose('分辨率', '2K');
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
  check(requests[0].provider === 'apimart' && requests[0].variant === 'Flare' && requests[0].resolution === '4K' && requests[0].complexity === 'auto' && requests[0].moderation === 'low', 'Actual run snapshots APIMart version, resolution and complexity');
  check(read().data.results![0].width === 160 && read().data.results![0].height === 90, 'Downloaded result keeps actual image dimensions');
  await closeTasks();
  api.addEdges({ id: 'ref-image', source: 'reference', target: 'image', sourceHandle: 'file', targetHandle: 'image-0' }); await settle();
  find('.sunburst-run').click();
  await until(() => read().data.results?.length === 2, 'Reference edit did not finish');
  check(Array.isArray(requests[1].images) && requests[1].images.length === 1 && requests[1].images[0] === 'https://cdn.example/uploaded-reference.png', 'Only the uploaded reference URL reaches the application API');
  await closeTasks();
  const roundtrip = new WorkflowStorage(`${db}-roundtrip`); await roundtrip.load();
  await roundtrip.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const reload = new WorkflowStorage(`${db}-roundtrip`); const restored = await reload.load();
  const saved = restored!.nodes.find(item => item.id === 'image') as SunburstNode;
  check(saved.data.provider === 'apimart' && saved.data.variant === 'Flare' && saved.data.resolution === '4K' && saved.data.complexity === 'auto' && saved.data.moderation === 'low', 'IndexedDB restores APIMart settings');
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
  check(find<HTMLButtonElement>('[aria-label="渠道商"]').disabled && find<HTMLButtonElement>('[aria-label="分辨率"]').disabled, 'Locked APIMart settings cannot be edited');
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
  remoteCancelled = false;
  await closeTasks();
  await choose('渠道模型', 'GPT Image 2.6');
  check(Boolean(document.querySelector('[aria-label="背景"]')) && Boolean(document.querySelector('[data-id="image"] [data-handleid="mask"]')), 'Standard channel model enables background and Mask');
  check((await options('宽高比')).includes('9:21') && (await options('宽高比')).includes('自定义'), 'Standard offers all 15 ratios and custom pixel size');
  await choose('宽高比', '自定义'); await fillNumber('图像宽度', '1600'); await fillNumber('图像高度', '1200');
  check(read().data.size === '1600x1200', 'Custom pixel inputs save 1600x1200');
  check(!document.querySelector('[aria-label="复杂度"]') && !document.querySelector('[aria-label="内容审核"]'), 'Standard hides fixed complexity and moderation controls');
  await choose('背景', '透明');
  canvas.getContext('2d')!.clearRect(0, 0, 80, 90);
  const mask = canvas.toDataURL('image/png');
  api.addNodes({ id: 'mask-file', type: 'file', position: { x: 60, y: 800 }, data: { assets: [{ id: 'mask-asset', name: 'mask.png', kind: 'image', url: mask, width: 160, height: 90 }] } });
  api.addEdges({ id: 'standard-mask', source: 'mask-file', sourceHandle: 'file', target: 'image', targetHandle: 'mask' }); await settle();
  find('.sunburst-run').click(); await until(() => read().data.results?.length === 3, 'Standard masked generation did not finish');
  check(requests[4].channelModel === 'gpt-image-2.6' && requests[4].size === '1600x1200' && requests[4].background === 'transparent' && requests[4].moderation === 'low' && requests[4].complexity === 'auto' && requests[4].mask === 'https://cdn.example/uploaded-reference.png', 'Standard run snapshots channel model, custom size, background, moderation and uploaded PNG mask URL');
  await closeTasks();
  api.setEdges(edges => edges.filter(edge => edge.id !== 'standard-mask')); await settle();
  await choose('输出格式', 'GIF');
  check(read().data.size === 'auto' && read().data.background === 'opaque' && !document.querySelector('[aria-label="分辨率"]'), 'Standard GIF resets size and transparent background and hides resolution');
  const frames = await options('帧数');
  check(frames.length === 15 && frames[0] === '2' && frames.at(-1) === '16', 'GIF frame choices cover exactly 2–16');
  await choose('帧数', '16'); await choose('宽高比', '自定义'); await fillNumber('图像宽度', '768'); await fillNumber('图像高度', '768');
  check(Boolean(document.querySelector('.sunburst-size-note[role="alert"]')) && Boolean(prepareSunburstRun(api.getNodes(), api.getEdges(), ['image'], 1).error), 'GIF custom sheet dimensions are validated before submission');
  await choose('帧数', '12');
  check(!document.querySelector('.sunburst-size-note[role="alert"]'), 'Reducing frames permits 768x768 at 12 frames');
  await fillNumber('图像宽度', '512'); await fillNumber('图像高度', '512'); await choose('帧数', '16');
  find('[aria-label="将宽高比设为输入"]').click(); await settle();
  const gifSizeSource = api.getEdges().find(edge => edge.target === 'image' && edge.targetHandle === 'size')!.source;
  api.updateNodeData(gifSizeSource, { model: '512x384' }); await settle();
  find('[aria-label="宽高比使用本地值"]').click(); await settle();
  check(read().data.size === '512x384', 'Returning to local GIF size preserves a valid frame size below static image limits');
  await fillNumber('图像高度', '512');
  find('.sunburst-run').click(); await until(() => read().data.results?.length === 4, 'Standard reference GIF did not finish');
  check(requests[5].frameCount === 16 && (requests[5].images as string[]).length === 1 && requests[5].size === '512x512', 'GIF run sends 16 frames with a reference and single-frame pixel size');
  check((await nativeFetch(read().data.results!.at(-1)!.url)).headers.get('content-type') === 'image/gif', 'GIF result retains animated file bytes');
  await closeTasks(); await choose('输出格式', 'SVG');
  check(read().data.size === 'auto' && !document.querySelector('[aria-label="帧数"]'), 'Switching GIF to SVG removes frame control and resets undersized pixels');
  check((await options('SVG 模型')).join(',') === 'gpt-6-luna,gpt-6.1-sol', 'SVG has the two requested author models');
  check((await options('Effort')).includes('none'), 'Luna supports none effort');
  await choose('Effort', 'none'); await choose('SVG 模型', 'gpt-6.1-sol');
  const efforts = await options('Effort');
  check(read().data.svgEffort === 'auto' && !efforts.includes('none') && !efforts.includes('minimal') && efforts.includes('max'), 'Sol removes unsupported efforts and resets the previous none selection');
  await choose('Effort', 'max');
  find('[aria-label="将Effort设为输入"]').click(); await settle();
  check(find<HTMLButtonElement>('[aria-label="Effort"]').disabled, 'Exposed SVG effort disables its local selector');
  const effortSource = api.getEdges().find(edge => edge.target === 'image' && edge.targetHandle === 'svgEffort')!.source;
  api.updateNodeData(effortSource, { model: 'high' }); await settle();
  find('[aria-label="Effort使用本地值"]').click(); await settle();
  check(read().data.svgEffort === 'high', 'Returning to local SVG effort keeps the connected valid value');
  find('.sunburst-run').click(); await until(() => read().data.results?.length === 5, 'Standard reference SVG did not finish');
  check(requests[6].svgModel === 'gpt-6.1-sol' && requests[6].svgEffort === 'high' && (requests[6].images as string[]).length === 1, 'SVG request includes author model, effort and reference image');
  check(await (await nativeFetch(read().data.results!.at(-1)!.url)).text() === svg, 'SVG result preserves original vector paths');
  await closeTasks();
  const standardStorage = new WorkflowStorage(`${db}-standard`); await standardStorage.load();
  await standardStorage.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const standardReload = new WorkflowStorage(`${db}-standard`); const standardRestored = await standardReload.load();
  const standardSaved = standardRestored!.nodes.find(item => item.id === 'image') as SunburstNode;
  check(standardSaved.data.channelModel === 'gpt-image-2.6' && standardSaved.data.svgModel === 'gpt-6.1-sol' && standardSaved.data.svgEffort === 'high' && standardSaved.data.frameCount === 16, 'IndexedDB restores standard channel, SVG settings and GIF frame preference');
  check(await (await nativeFetch(standardSaved.data.results!.at(-1)!.url)).text() === svg, 'IndexedDB retains original SVG bytes');
  standardReload.dispose(); standardStorage.dispose();
  await choose('渠道模型', 'GPT Image 2.6 EXT');
  check(read().data.outputFormat === 'png' && !document.querySelector('[aria-label="SVG 模型"]') && !document.querySelector('[aria-label="背景"]'), 'Returning to EXT resets unsupported SVG and hides standard-only settings');
  canvasHistoryShortcut('undo'); await settle();
  check(read().data.channelModel === 'gpt-image-2.6' && read().data.outputFormat === 'svg' && read().data.svgEffort === 'high', 'Undo restores the standard channel and SVG parameters together');
  await choose('渠道商', 'OpenAI 官方');
  check(!document.querySelector('[aria-label="渠道模型"]') && !document.querySelector('[aria-label="SVG 模型"]'), 'APIMart-only selectors disappear on OpenAI');
  await choose('渠道商', 'APIMart');
  api.updateNodeData('image', { locked: true }); await settle();
  check(find<HTMLButtonElement>('[aria-label="渠道模型"]').disabled && find<HTMLButtonElement>('[aria-label="SVG 模型"]').disabled && find<HTMLButtonElement>('[aria-label="Effort"]').disabled, 'Locked standard channel and SVG controls cannot change');
  api.updateNodeData('image', { locked: false }); await settle();
  Object.assign(window, { apimartQA: { api, requests, polls, checks } });
  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} checks · mock only\n${checks.join('\n')}`;
}
void run().catch(error => { find('#results').dataset.result = 'failed'; find('#results').textContent = `${checks.join('\n')}\nFAIL: ${error instanceof Error ? error.message : error}`; });
