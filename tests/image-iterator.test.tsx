import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { useModelTaskStore } from '../src/components/useModelTasks';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { isImageGeneratorNode, isImageIteratorNode, type AppNode } from '../src/nodes/types';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { isActiveTask } from '../src/nodes/taskQueue';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

let api: ReactFlowInstance<AppNode>;
let store: ReturnType<typeof useModelTaskStore>;
function Probe() {
  api = useReactFlow<AppNode>(); store = useModelTaskStore();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges })}</output>;
}
const originalFetch = window.fetch.bind(window);
let clipboard = '';
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { clipboard = value; } } });
const requests: { images: string[]; prompt: string }[] = [];
let failOnce = true;
let blue = '';
window.fetch = (input, init) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (path === '/api/sunburst') {
    const body = JSON.parse(String(init?.body)) as { images: string[]; prompt: string };
    requests.push(body);
    if (body.images[0] === blue && failOnce) { failOnce = false; return Promise.resolve(Response.json({ error: '模拟单张失败' }, { status: 500 })); }
    return Promise.resolve(Response.json({ image: body.images[0], format: 'png' }));
  }
  if (/^(blob:|data:)/.test(path)) return originalFetch(input, init);
  return Promise.reject(new Error(`Unexpected request blocked: ${path}`));
};
async function sample(name: string, color: string, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = height;
  const context = canvas.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, 320, height);
  context.fillStyle = '#fff'; context.font = '20px sans-serif'; context.fillText(name, 24, height / 2);
  const url = canvas.toDataURL('image/png');
  return { file: new File([await (await originalFetch(url)).blob()], name, { type: 'image/png' }), url };
}
const workflow: Workflow = {
  nodes: [
    { ...createLibraryNode('image-iterator', { x: 480, y: 120 })!, id: 'iterator', selected: false },
    { id: 'prompt', type: 'text', position: { x: -100, y: 500 }, data: { text: '为每张图片统一调色' } },
    { id: 'model', type: 'sunburst', position: { x: 1100, y: 120 }, data: { ...defaultSunburstSettings, imageInputs: 1 } },
  ],
  edges: [
    { id: 'iterator-model', source: 'iterator', sourceHandle: 'file', target: 'model', targetHandle: 'image-0' },
    { id: 'prompt-model', source: 'prompt', target: 'model', targetHandle: 'prompt' },
  ], colorMode: 'dark', viewport: { x: 0, y: 100, zoom: .75 },
};
const storage = new WorkflowStorage(`momoflow-image-iterator-qa-${crypto.randomUUID()}`);
const root = createRoot(document.getElementById('root')!);
let version = 0;
function render(saved: Workflow) {
  root.render(<ReactFlowProvider key={++version}><ModelTasksProvider><Flow storage={storage} saved={saved} /><Probe /></ModelTasksProvider></ReactFlowProvider>);
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(check: () => boolean, message: string) { for (let index = 0; index < 220; index++) { if (check()) return; await settle(); } throw new Error(message); }
function find<T extends HTMLElement = HTMLElement>(selector: string): T { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element; }
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const selector = '[data-id="iterator"]';
function iterator() { const node = api.getNode('iterator'); if (!isImageIteratorNode(node)) throw new Error('Iterator missing'); return node; }
const results = document.getElementById('results')!;
const checks: string[] = [];
function pass(message: string) { checks.push(message); results.textContent = checks.map(item => `PASS ${item}`).join('\n'); }
async function menu(action: string) {
  const trigger = find(`${selector} [aria-label="更多选项"]`);
  if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click(); await settle();
  const button = [...document.querySelectorAll<HTMLButtonElement>(`${selector} [role="menuitem"]`)].find(item => item.textContent?.startsWith(action));
  check(button, `Menu ${action}`); button.click(); await settle();
}
async function upload(files: File[], drop = false) {
  const transfer = new DataTransfer(); files.forEach(file => transfer.items.add(file));
  if (drop) find(`${selector} .file-node-media`).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  else {
    const input = find<HTMLInputElement>(`${selector} input[type="file"]`);
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await until(() => !find<HTMLInputElement>(`${selector} input[type="file"]`).disabled, 'Import finishes'); await settle();
}
async function run() {
  const red = await sample('z-red.png', '#ba756e', 240);
  const blueSample = await sample('a-blue.png', '#7389b3', 360); blue = blueSample.url;
  const green = await sample('m-green.png', '#76a087', 200);
  await storage.load(); render(workflow);
  await until(() => !!document.querySelector(`${selector} .file-node-upload`), 'Nodes mount'); await settle();
  check(getComputedStyle(find(selector)).width === '460px', 'Node width');
  check(find(`${selector} .file-node-title`).textContent === '图片迭代', 'Chinese title');
  check(find<HTMLInputElement>(`${selector} input[type="file"]`).multiple, 'Multi-image picker');
  check(find<HTMLInputElement>(`${selector} input[type="file"]`).accept.includes('.png') && !find<HTMLInputElement>(`${selector} input[type="file"]`).accept.includes('.mp4'), 'Image-only picker');
  check(find('[data-id="model"] .iterator-warning').textContent?.includes('至少添加一张图片'), 'Empty warning');
  check(document.querySelectorAll(`${selector} .react-flow__handle.target`).length === 0 && document.querySelectorAll(`${selector} .react-flow__handle.source`).length === 1, 'Source-only contract');
  pass('空节点：棋盘格、多选上传、图片链接、图片输出及下游空状态提示');

  await upload([red.file, blueSample.file]);
  await until(() => iterator().data.assets?.length === 2, 'Two imported images');
  check(document.querySelectorAll(`${selector} .file-node-tile`).length === 2, 'Default two-column grid');
  check(iterator().data.assets?.every(asset => asset.width && asset.height && asset.url.startsWith('blob:')), 'Decoded sizes and owned blobs');
  find(`${selector} [aria-label="All"]`).click(); await settle();
  check(!!document.querySelector(`${selector} .file-node-single`), 'Single mode');
  find(`${selector} [aria-label="Next item"]`).click(); await settle();
  check(iterator().data.activeAssetId === iterator().data.assets?.[1].id, 'Next image');
  check(find('[data-id="model"] .text-iteration-summary').textContent?.includes('2 个任务'), 'Browsing retains full batch');
  find(`${selector} [aria-label="Single"]`).click(); await settle();
  pass('双列缩略图、单图切换、前后浏览；当前预览不改变整批数量');

  await upload([green.file], true); await until(() => iterator().data.assets?.length === 3, 'Drop appends image');
  await upload([new File(['invalid'], 'video.mp4', { type: 'video/mp4' })]);
  check(iterator().data.assets?.length === 3 && find(`${selector} [role="alert"]`).textContent?.includes('图片文件'), 'Non-image rejected without losing existing images');
  find(`${selector} [aria-label="排序方式"]`).click(); await settle();
  [...document.querySelectorAll<HTMLButtonElement>('.file-popup button')].find(button => button.textContent?.includes('名称'))!.click(); await settle();
  check(iterator().data.orderBy === 'name', 'Name sorting');
  check(find<HTMLImageElement>(`${selector} .file-node-tile img`).alt === 'a-blue.png', 'Name order visible');
  const tile = find(`${selector} .file-node-tile`); const rect = tile.getBoundingClientRect();
  tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.x + 20, clientY: rect.y + 20 })); await settle();
  check([...document.querySelectorAll('.file-popup button')].map(button => button.textContent).join('|').includes('下载图片|下载全部|设为封面|复制图片'), 'Reference image context menu');
  [...document.querySelectorAll<HTMLButtonElement>('.file-popup button')].find(button => button.textContent?.includes('设为封面'))!.click(); await settle();
  check(iterator().data.activeAssetId === iterator().data.assets?.find(asset => asset.name === 'a-blue.png')?.id, 'Context action uses right-clicked image, not previous cover');
  pass('拖入追加、非图片拒绝、按名称排序、右键图片菜单');

  await menu('清空'); check(iterator().data.assets?.length === 0, 'Clear collection');
  find('[aria-label="撤销"]').click(); await settle(); check(iterator().data.assets?.length === 3, 'Clear is one undo step');
  find('[aria-label="重做"]').click(); await settle(); check(iterator().data.assets?.length === 0, 'Redo clear');
  find('[aria-label="撤销"]').click(); await settle();
  await menu('锁定'); check(iterator().data.locked, 'Locked');
  check(find<HTMLButtonElement>(`${selector} .file-node-add`).disabled && !find(`${selector} .react-flow__handle.source`).classList.contains('connectable'), 'Locked import and output');
  await menu('解锁'); await menu('创建副本');
  const copy = api.getNodes().find(node => isImageIteratorNode(node) && node.id !== 'iterator'); check(copy && isImageIteratorNode(copy) && copy.data.assets?.length === 3, 'Independent image iterator duplicate');
  await menu('清空'); check(copy.data.assets?.length === 3, 'Clear does not clear copy');
  find('[aria-label="撤销"]').click(); await settle(); await api.deleteElements({ nodes: [copy] }); await settle();
  pass('清空的单步撤销重做、锁定与解锁、独立副本及素材保留');

  await menu('创建副本');
  const cutCopy = api.getNodes().find(node => isImageIteratorNode(node) && node.id !== 'iterator'); check(cutCopy, 'Cut copy');
  find(`[data-id="${cutCopy.id}"] [aria-label="更多选项"]`).click(); await settle();
  [...document.querySelectorAll<HTMLButtonElement>(`[data-id="${cutCopy.id}"] [role="menuitem"]`)].find(button => button.textContent?.startsWith('剪切'))!.click();
  await until(() => !api.getNode(cutCopy.id), 'Cut removes copy');
  check(JSON.parse(clipboard).format === 'momoflow-image-iterator-node', 'Clipboard format');
  const transfer = new DataTransfer(); transfer.setData('text/plain', clipboard);
  document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })); await settle();
  const pasted = api.getNodes().find(node => isImageIteratorNode(node) && node.id !== 'iterator');
  check(pasted && isImageIteratorNode(pasted) && pasted.data.assets?.length === 3 && !pasted.data.locked, 'Paste restores independent collection');
  for (const asset of pasted.data.assets!) check((await originalFetch(asset.url)).ok, 'Clipboard blobs retained');
  await api.deleteElements({ nodes: [pasted] }); await settle();
  pass('剪切粘贴恢复图片集合及素材引用（页面内模拟剪贴板）');

  const original = iterator().data.assets!;
  api.updateNodeData('iterator', { assets: Array.from({ length: 50 }, (_, index) => ({ ...original[0], id: `limit-${index}` })) }); await settle();
  check(find<HTMLButtonElement>(`${selector} .file-node-add`).disabled, '50 image limit');
  api.updateNodeData('iterator', { assets: original }); await settle();
  pass('50 张图片上限');

  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === 'model' }))); await settle();
  find('[data-id="model"] .sunburst-run').click();
  await until(() => requests.length === 3 && !store.getSnapshot().some(isActiveTask), 'Independent image requests');
  check(requests.every(request => request.images.length === 1), 'Exactly one image per request');
  check(requests.map(request => request.images[0]).sort().join('|') === [red.url, blue, green.url].sort().join('|'), 'All three distinct images transmitted');
  check(store.getSnapshot().filter(task => task.state === 'Failed').length === 1 && store.getSnapshot().filter(task => task.state === 'Done').length === 2, 'Failure isolated');
  await settle(); find('.task-batch .task-main').click(); await settle();
  find('[aria-label="重试任务"]').click();
  await until(() => requests.length === 4 && !store.getSnapshot().some(isActiveTask), 'Retry one image');
  check(requests[3].images[0] === blue, 'Retry only failed image');
  pass('逐图独立请求、一张失败不影响其他、单张重试（模拟）');

  find('[aria-label="增加运行次数"]').click(); await settle();
  for (const summary of document.querySelectorAll('.text-iteration-summary')) check(summary.textContent?.includes('6 个任务（每张 2 次）'), 'Six-task count shared');
  find('[data-id="model"] .sunburst-run').click();
  await until(() => requests.length === 10 && !store.getSnapshot().some(isActiveTask), 'Six image requests');
  check(requests.slice(4).map(request => request.images[0]).sort().join('|') === [red.url, blue, green.url].flatMap(url => [url, url]).sort().join('|'), 'Two requests per image');
  find('[aria-label="减少运行次数"]').click(); await settle();
  const model = api.getNode('model'); check(model && isImageGeneratorNode(model) && model.data.results?.length === 9, 'All successful images accumulated');
  pass('3 张 × 2 次 = 6 个目标任务、结果追加且保留图片来源');

  await until(() => document.body.textContent?.includes('已保存到此浏览器') === true, 'Autosave');
  const saved = await storage.load(); check(saved, 'Saved workflow');
  render(saved); await until(() => !!document.querySelector(`${selector} .file-node-tile`), 'Restored'); await settle();
  check(iterator().data.assets?.length === 3 && iterator().data.orderBy === 'name', 'Restored collection and sorting');
  check(api.getEdges().some(edge => edge.source === 'iterator' && edge.sourceHandle === 'file'), 'Restored connection');
  for (const asset of iterator().data.assets!) check((await originalFetch(asset.url)).ok, 'Restored blobs readable');
  pass('独立 IndexedDB 刷新恢复图片二进制、排序、连接和运行结果');
  results.dataset.result = 'passed'; results.textContent = `PASS (${checks.length}) · 本地模拟，无真实模型调用\n${checks.join('\n')}`;
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${error instanceof Error ? error.stack : String(error)}`; });
