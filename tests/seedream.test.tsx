import { chooseGptSetting, gptSettingOptions, gptSettingDisabled } from './gptSidebarControls';
import { apiSettingsStorageKey } from '../src/components/apiSettings';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import type { AppNode, SeedreamNode } from '../src/nodes/types';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { nodeMenuGroups, searchableNodeMenuEntries } from '../src/components/nodeMenuCatalog';
import { imageOutput } from '../src/nodes/sunburstRun';
import { assetResources } from '../src/nodes/assetResources';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import { seedreamAspectRatios } from '../src/nodes/seedream';
import { commitAnnotations, emptyAnnotationHistory } from '../src/nodes/interactiveEdit';
import { initialTextDocument } from '../src/nodes/textDocument';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() {
  api = useReactFlow<AppNode>();
  Object.assign(window, { seedreamQA: { api } });
  return null;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, message: string) {
  const start = Date.now();
  while (Date.now() - start < 15000) { if (predicate()) return; await settle(); }
  throw new Error(message);
}
const find = <T extends HTMLElement = HTMLButtonElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
const checks: string[] = [];
function check(value: unknown, message: string) { if (!value) throw new Error(message); checks.push(message); }
const read = () => api.getNode('seedream') as SeedreamNode;
const options = (label: string) => gptSettingOptions(label, settle);
const choose = (label: string, text: string) => chooseGptSetting(label, text, settle);
async function dimension(label: string, value: string) {
  const input = find<HTMLInputElement>(`[aria-label="图像${label}"]`);
  input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true })); await settle();
}
async function finishDimensions(enter = false) {
  const input = document.activeElement;
  if (input instanceof HTMLInputElement) {
    if (enter) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    else input.blur();
  }
  await settle();
}

async function run() {
  // Keep BYOK credentials isolated from the user's saved API settings.
  const nativeGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key: string) {
    if (key === apiSettingsStorageKey) return JSON.stringify({ provider: 'apimart', credentials: { apimart: { apiKey: 'isolated-upload-test-key', baseUrl: 'https://api.apimart.ai/v1' } } });
    return nativeGetItem.call(this, key);
  };
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#8d72c6'; context.fillRect(0, 0, 640, 360);
  context.clearRect(0, 0, 24, 24);
  context.fillStyle = '#fff'; context.font = '30px sans-serif'; context.fillText('Seedream 5.5 · Mock', 60, 180);
  const png = canvas.toDataURL('image/png'), jpeg = canvas.toDataURL('image/jpeg');
  const originalFetch = window.fetch.bind(window);
  const reference = await (await originalFetch(png)).blob();
  const requests: Record<string, unknown>[] = [];
  const submitted = new Map<string, { format: string; mode: string }>();
  let mode: 'success' | 'cancel' | 'failure' = 'success';
  let cancelled = false;
  let uploads = 0;
  let distinguishUploads = false;
  // Every model request stays in this page. Never forward API or external calls.
  window.fetch = async (url, init) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path === 'https://api.apimart.ai/v1/uploads/images?retention_days=3') {
      uploads++;
      check(init?.body instanceof FormData && (init.body.get('file') as File)?.type === 'image/png', 'Browser uploads original PNG as multipart');
      check(new Headers(init?.headers).get('Authorization') === 'Bearer isolated-upload-test-key', 'Upload uses isolated BYOK credentials');
      return Response.json({ url: distinguishUploads ? `https://cdn.example/uploaded-${uploads}.png` : 'https://cdn.example/uploaded-reference.png' });
    }
    if (path === '/api/apimart/seedream') {
      const input = JSON.parse(String(init?.body)); requests.push(input);
      if (mode === 'cancel') return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => { cancelled = true; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
      });
      const taskId = `task_seedream_${requests.length}`;
      submitted.set(taskId, { format: input.outputFormat, mode });
      return Response.json({ taskId });
    }
    if (path === '/api/apimart/task') {
      const taskId = JSON.parse(String(init?.body)).taskId;
      const task = submitted.get(taskId)!;
      if (task.mode === 'failure') return Response.json({ error: 'Mock provider failure', taskId }, { status: 502 });
      return Response.json({ status: 'completed', imageUrl: `https://cdn.example/result.${task.format}`, format: task.format });
    }
    if (path.startsWith('https://cdn.example/result.')) return originalFetch(path.endsWith('.png') ? png : jpeg);
    if (path.startsWith('/api/') || /^https?:/.test(path)) throw new Error('Real network requests disabled in isolated Seedream QA');
    return originalFetch(url, init);
  };
  const node = createLibraryNode('seedream', { x: 650, y: 80 }) as SeedreamNode;
  const workflow: Workflow = {
    nodes: [
      { id: 'prompt', type: 'text', position: { x: 70, y: 80 }, data: { text: 'Create a violet landscape' } },
      { id: 'reference', type: 'file', position: { x: 70, y: 620 }, data: { assets: [{ id: 'reference-image', kind: 'image', name: 'reference.png', url: assetResources.create(reference), width: 640, height: 360 }] } },
      { ...node, id: 'seedream', selected: true },
      { id: 'preview', type: 'preview', position: { x: 1230, y: 80 }, data: {} },
    ], edges: [{ id: 'prompt', source: 'prompt', target: 'seedream', targetHandle: 'prompt' }],
    colorMode: 'dark', viewport: { x: 0, y: 180, zoom: .6 },
  };
  const db = `momoflow-seedream-qa-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(db); await storage.load();
  createRoot(find('#root')).render(<ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('[aria-label="Seedream 5.5 设置"]')), 'Seedream node and settings mount');
  check(find('[data-id="seedream"] .node-title-label').textContent?.includes('Seedream 5.5'), 'Node title and settings use Seedream 5.5');
  check(nodeMenuGroups.some(group => group.entries.some(entry => entry.nodeId === 'seedream' && entry.asset === 'jimeng')) && !nodeMenuGroups.some(group => group.entries.some(entry => entry.id === 'seedance')), 'Menu replaces Seedance with functional Seedream and preserves Jimeng icon');
  check(searchableNodeMenuEntries.some(entry => entry.nodeId === 'seedream'), 'Search includes the implemented Seedream node');
  check(read().data.resolution === '1.5K' && read().data.outputFormat === 'png' && !read().data.nsfwCheck && !read().data.watermark, 'Defaults are 1.5K, PNG, moderation off and watermark off');
  const sizes = await options('分辨率');
  check(sizes.join(',') === '1.5K,2K', 'Resolution provides exactly 1.5K and 2K');
  await choose('分辨率', '2K');
  check(!document.querySelector('[data-id="seedream"] [data-handleid="mask"]'), 'Seedream keeps Mask unavailable');
  check(!document.querySelector('.image-model-settings .describer-expose')
    && !find('.image-model-settings .node-settings-fields').textContent?.includes('APIMart'), 'Parameters are edited locally and the provider row is omitted');
  const ratios = await options('宽高比');
  check(ratios.join(',') === ['自动', ...seedreamAspectRatios, '精确像素'].join(','), 'Ratio menu offers exactly the ten requested ratios, auto and exact pixels');
  await choose('宽高比', '16:9');
  check(read().data.size === '16:9' && getComputedStyle(find('[data-id="seedream"] .sunburst-preview')).aspectRatio === '16 / 9', 'Empty preview follows the selected aspect ratio');
  await choose('宽高比', '精确像素');
  check(read().data.size === '2048x2048' && !document.querySelector('[aria-label="分辨率"]'), 'Exact mode starts at the retained 2K size and hides resolution');
  await dimension('宽度', '1537'); await dimension('高度', '1001');
  check(read().data.size === '2048x2048', 'Moving between width and height keeps the full pair as a local draft');
  await finishDimensions();
  check(read().data.size === '1537x1001' && !document.querySelector('.sunburst-size-note') && find<HTMLInputElement>('[aria-label="图像宽度"]').step === '1', 'Exact pixels accept positive integers without 16px alignment');
  check(getComputedStyle(find('[data-id="seedream"] .sunburst-preview')).aspectRatio === '1537 / 1001', 'Exact dimensions drive the empty preview ratio');
  await dimension('宽度', '512'); await dimension('高度', '512');
  check(read().data.size === '1537x1001' && !document.querySelector('.sunburst-size-note[role="alert"]'), 'Incomplete pixel edits do not replace the valid canvas size or show transient errors');
  await until(() => read().data.size === '960x960', 'Idle input automatically corrects without Enter or blur');
  check(find<HTMLInputElement>('[aria-label="图像宽度"]').value === '960' && find<HTMLInputElement>('[aria-label="图像高度"]').value === '960'
    && document.activeElement === find('[aria-label="图像高度"]'), 'Stopping typing corrects both dimensions while retaining input focus');
  canvasHistoryShortcut('undo'); await settle();
  check(read().data.size === '1537x1001', 'One undo restores the size before normalization');
  canvasHistoryShortcut('redo'); await settle();
  check(read().data.size === '960x960', 'Redo restores the corrected size');
  for (const value of ['1', '10', '1000']) {
    await dimension('宽度', value); await pause(80);
    check(read().data.size === '960x960' && find<HTMLInputElement>('[aria-label="图像宽度"]').value === value, `Continuous typing retains the unfinished ${value} width`);
  }
  await dimension('高度', '1000');
  await until(() => read().data.size === '1000x1000', 'Complete continuous input settles');
  check(read().data.size === '1000x1000', 'A typing pause commits the latest complete pair');
  const composingWidth = find<HTMLInputElement>('[aria-label="图像宽度"]');
  composingWidth.focus(); composingWidth.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  await dimension('宽度', '1600'); await pause(350);
  check(read().data.size === '1000x1000', 'Input composition pauses automatic correction');
  composingWidth.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '1600' }));
  await until(() => read().data.size === '1600x1000', 'Composition completion resumes correction');
  check(read().data.size === '1600x1000', 'Composition completion automatically commits the final number');
  await dimension('宽度', '8192'); await dimension('高度', '8192'); await finishDimensions();
  check(read().data.size === '2150x2150', 'Leaving the pixel inputs scales an oversized square down to the maximum area');
  await dimension('宽度', '10000'); await dimension('高度', '100'); await finishDimensions();
  check(read().data.size === '4000x250', 'An extreme ratio is fitted to the supported 16:1 limit');
  await dimension('宽度', ''); await pause(350);
  check(read().data.size === '4000x250' && find<HTMLInputElement>('[aria-label="图像宽度"]').value === '', 'Clearing a field leaves room for the next number during an input pause');
  await dimension('高度', '0'); await finishDimensions();
  check(read().data.size === '4000x250' && find<HTMLInputElement>('[aria-label="图像宽度"]').value === '4000' && find<HTMLInputElement>('[aria-label="图像高度"]').value === '250', 'Empty and non-positive input restores the last committed dimensions');
  await dimension('宽度', '1000.4'); await dimension('高度', '1000.7'); await finishDimensions(true);
  check(read().data.size === '1000x1001', 'Enter still immediately rounds fractional dimensions without 16px alignment');
  canvasHistoryShortcut('undo'); await settle(); await pause(350);
  check(read().data.size === '4000x250', 'Enter cancels pending correction so it cannot overwrite an undo');
  canvasHistoryShortcut('redo'); await settle();
  await dimension('宽度', '512');
  api.updateNodeData('seedream', { size: '1600x1000' }); await settle(); await pause(350);
  check(read().data.size === '1600x1000' && find<HTMLInputElement>('[aria-label="图像宽度"]').value === '1600', 'External size changes cancel stale correction timers');
  api.updateNodeData('seedream', { size: '1000x1001' }); await settle();
  await dimension('宽度', '512');
  api.updateNodeData('seedream', { locked: true }); await settle(); await pause(350);
  check(read().data.size === '1000x1001' && find<HTMLInputElement>('[aria-label="图像宽度"]').value === '1000', 'Locking cancels an unfinished local pixel draft');
  api.updateNodeData('seedream', { locked: false }); await settle();
  check(requests.length === 0, 'Automatic correction never starts a model request');
  await dimension('宽度', '512'); await choose('宽高比', '16:9'); await pause(350);
  check(read().data.size === '16:9', 'Switching modes cancels an unfinished correction');
  check(read().data.resolution === '2K' && !gptSettingDisabled('分辨率') && !document.querySelector('[aria-label="图像宽度"]'), 'Switching back to a ratio restores the retained resolution');
  await choose('输出格式', 'JPEG'); await choose('背景', '透明');
  check(read().data.background === 'transparent' && read().data.outputFormat === 'png', 'Transparent background switches local output to PNG');
  check(requests.length === 0, 'Editing settings does not generate images');
  const runButton = () => find('[data-id="seedream"] .sunburst-run');
  runButton().click();
  await until(() => read().data.results?.length === 1, 'Text-to-image mock task completes');
  check(requests.length === 1 && (requests[0].images as string[]).length === 0 && requests[0].background === 'transparent', 'Text-only transparent generation submits once');
  check(requests[0].size === '16:9' && requests[0].resolution === '2K', 'Ratio and resolution are frozen into the generation snapshot');
  check(document.querySelector('.model-queue-name')?.textContent?.includes('Seedream 5.5'), 'Task manager identifies Seedream 5.5');
  check(read().data.results?.[0].width === 640 && read().data.results?.[0].height === 360, 'Returned image uses actual provider dimensions');
  const output = await (await originalFetch(read().data.results![0].url)).blob();
  check(output.size === reference.size && await output.text() === await reference.text(), 'PNG result preserves the original bytes');
  find('.model-queue-toggle[aria-expanded="true"]').click(); await settle();
  await choose('背景', '不透明'); await choose('输出格式', 'JPEG');
  await choose('宽高比', '精确像素'); await dimension('宽度', '1537'); await dimension('高度', '1001'); await finishDimensions();
  api.setEdges(all => [...all,
    { id: 'reference', source: 'reference', sourceHandle: 'file', target: 'seedream', targetHandle: 'image-0' },
    { id: 'output', source: 'seedream', sourceHandle: 'result', target: 'preview', targetHandle: 'file' },
  ]); await settle();
  runButton().click(); await until(() => read().data.results?.length === 2, 'Reference-image mock task completes');
  check((requests[1].images as string[])[0] === 'https://cdn.example/uploaded-reference.png' && requests[1].outputFormat === 'jpeg', 'Uploaded reference URL and JPEG format reach the task snapshot');
  check(requests[1].size === '1537x1001' && read().data.results?.[1].width === 640 && read().data.results?.[1].height === 360, 'Exact pixel requests retain their size and display provider results at actual dimensions');
  await until(() => Boolean(document.querySelector<HTMLImageElement>('.preview-image img')?.naturalWidth), 'Downstream preview resolves');
  check(imageOutput(read(), 'result')[0].id === read().data.results?.[1].id, 'Active result is the downstream output');
  find('.model-queue-toggle[aria-expanded="true"]').click(); await settle();
  const count = api.getNodes().length;
  find('[data-id="seedream"] [aria-label="更多选项"]').click(); await settle();
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('创建副本'))!.click(); await settle();
  check(api.getNodes().length === count + 1 && api.getNodes().at(-1)?.type === 'seedream', 'Duplicate retains the model type and results');
  canvasHistoryShortcut('undo'); await settle(); check(api.getNodes().length === count, 'Undo removes duplicate');
  canvasHistoryShortcut('redo'); await settle(); check(api.getNodes().length === count + 1, 'Redo restores duplicate');
  canvasHistoryShortcut('undo'); await settle();
  api.setNodes(all => all.map(item => ({ ...item, selected: item.id === 'seedream' }))); await settle();
  mode = 'cancel'; runButton().click(); await until(() => requests.length === 3, 'Cancellable request starts');
  find('.model-queue-row [aria-label^="取消 "]').click(); await until(() => cancelled, 'Cancel reaches the request signal');
  check(read().data.results?.length === 2, 'Cancellation preserves previous outputs');
  find('.model-queue-toggle[aria-expanded="true"]').click(); await settle();
  mode = 'failure'; runButton().click();
  await until(() => Boolean(document.querySelector('.task-error')?.textContent?.includes('task_seedream_4')), 'Failed task retains its task ID');
  check(requests.length === 4 && read().data.results?.length === 2, 'Provider failure never resubmits or removes results');
  find('.model-queue-toggle[aria-expanded="true"]').click(); await settle();
  api.updateNodeData('seedream', { locked: true }); await settle();
  check(runButton().hasAttribute('disabled') && find('[aria-label="宽高比"]').hasAttribute('disabled') && find('[aria-label="图像宽度"]').hasAttribute('disabled'), 'Locked node disables running, ratio and exact pixel editing');
  api.updateNodeData('seedream', { locked: false }); await settle();
  for (const zoom of [.35, .6, 1.2]) {
    await api.setViewport({ x: -300 * zoom, y: 140, zoom }); await settle();
    check(Math.abs(find('[data-id="seedream"] .node-frame').getBoundingClientRect().width / zoom - 456) < 2, `Shared node width remains 456px at ${zoom * 100}% zoom`);
  }
  const roundtrip = new WorkflowStorage(`${db}-roundtrip`); await roundtrip.load();
  await roundtrip.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const reload = new WorkflowStorage(`${db}-roundtrip`), restored = await reload.load();
  const restoredNode = restored?.nodes.find(item => item.id === 'seedream') as SeedreamNode;
  check(restoredNode.data.results?.length === 2 && restoredNode.data.size === '1537x1001' && restoredNode.data.resolution === '2K' && restoredNode.data.outputFormat === 'jpeg', 'IndexedDB preserves exact pixels, retained resolution and all results');
  const restoredBlob = await (await originalFetch(restoredNode.data.results![0].url)).blob();
  check(restoredBlob.size === reference.size, 'Restored provider bytes remain readable');
  reload.dispose(); roundtrip.dispose();
  await api.setViewport({ x: 0, y: 180, zoom: .6 });
  mode = 'success';
  const annotation = { id: 'mark', start: { x: .25, y: .5 } };
  api.setNodes(nodes => [...nodes, {
    id: 'edit', type: 'interactive-edit', position: { x: 650, y: 620 }, data: {
      history: commitAnnotations(emptyAnnotationHistory, 'reference-image', [annotation]),
    },
  }]);
  api.updateNodeData('prompt', { content: initialTextDocument('改为橙色', ['annotation-1'], 'prompt'), text: '改为橙色' });
  api.setEdges(edges => [...edges.filter(edge => edge.id !== 'reference'),
    { id: 'annotation-image', source: 'reference', sourceHandle: 'file', target: 'edit', targetHandle: 'image' },
    { id: 'annotation-text', source: 'edit', sourceHandle: annotation.id, target: 'prompt', targetHandle: 'annotation-1' },
  ]);
  await until(() => Boolean(document.querySelector('.annotation-chip-thumbnail')), 'Annotation connects to the prompt');
  const baselineUploads = uploads;
  runButton().click(); await until(() => read().data.results?.length === 3, 'Annotation-only reference completes');
  check(requests[4].prompt === '<point>250 500</point> 改为橙色'
    && JSON.stringify(requests[4].images) === JSON.stringify(['https://cdn.example/uploaded-reference.png'])
    && uploads === baselineUploads + 1, 'Seedream uploads the annotation original without a manual image connection');
  api.setEdges(edges => [...edges, { id: 'reference', source: 'reference', sourceHandle: 'file', target: 'seedream', targetHandle: 'image-0' }]);
  await settle();
  runButton().click(); await until(() => read().data.results?.length === 4, 'Same annotation and manual reference complete');
  check(requests[5].prompt === requests[4].prompt && JSON.stringify(requests[5].images) === JSON.stringify(requests[4].images)
    && uploads === baselineUploads + 2, 'The manually connected annotation original is uploaded only once per run');
  const box = { id: 'box', start: { x: .1, y: .2 }, end: { x: .4, y: .5 } };
  context.fillRect(0, 0, 20, 20);
  const secondImage = await (await originalFetch(canvas.toDataURL('image/png'))).blob();
  api.setNodes(nodes => [...nodes, {
    id: 'second-edit', type: 'interactive-edit', position: { x: 1120, y: 620 }, data: {
      baseImage: { id: 'second-image', kind: 'image', name: 'second.png', url: assetResources.create(secondImage) },
      history: commitAnnotations(emptyAnnotationHistory, 'second-image', [box]),
    },
  }]);
  const splitPrompt = initialTextDocument('改为篮球。', ['annotation-1', 'annotation-2'], 'prompt');
  splitPrompt.content![0].content![1].text = ' 改为足球，把 ';
  api.updateNodeData('prompt', { content: splitPrompt });
  api.setEdges(edges => [...edges, {
    id: 'second-annotation', source: 'second-edit', sourceHandle: box.id, target: 'prompt', targetHandle: 'annotation-2',
  }]);
  await until(() => document.querySelectorAll('.annotation-chip-thumbnail').length === 2, 'Second source contributes a box annotation');
  distinguishUploads = true;
  const nextUpload = uploads + 1;
  runButton().click();
  await until(() => read().data.results?.length === 6, 'One click adds both annotated edits to the Seedream gallery');
  check(requests.length === 8 && uploads === nextUpload + 1
    && requests[6].prompt === '<point>250 500</point> 改为足球'
    && requests[7].prompt === '把 <bbox>100 200 400 500</bbox> 改为篮球。'
    && JSON.stringify(requests[6].images) === JSON.stringify([`https://cdn.example/uploaded-${nextUpload}.png`])
    && JSON.stringify(requests[7].images) === JSON.stringify([`https://cdn.example/uploaded-${nextUpload + 1}.png`]),
  'Distinct annotations submit separate instructions and exactly one original per request');
  find('#results').dataset.result = 'passed';
  find('#results').textContent = `PASS · ${checks.length} checks · mock only\n${checks.join('\n')}`;
}

void run().catch(error => {
  find('#results').dataset.result = 'failed';
  find('#results').textContent = `${checks.join('\n')}\nFAIL: ${error instanceof Error ? error.message : error}`;
});
