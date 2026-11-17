import { chooseGptSetting, gptSettingOptions } from './gptSidebarControls';
import { canvasHistoryShortcut } from './canvasShortcuts';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import type { AppNode, NanoBananaNode } from '../src/nodes/types';
import { apiSettingsStorageKey, saveApiSettings } from '../src/components/apiSettings';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { imageOutput } from '../src/nodes/sunburstRun';
import { assetResources } from '../src/nodes/assetResources';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes: nodes.map(node => ({ id: node.id, type: node.type, position: node.position })), edges: edges.map(edge => `${edge.source}>${edge.target}`) })}</output>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(check: () => boolean, message: string) {
  const deadline = performance.now() + 12000;
  while (performance.now() < deadline) { if (check()) return; await settle(); }
  throw new Error(message);
}
const find = <T extends HTMLElement = HTMLButtonElement>(selector: string) => {
  const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element;
};
const checks: string[] = [];
function check(value: unknown, message: string): void { if (!value) throw new Error(message); checks.push(message); }
const read = () => api.getNode('banana') as NanoBananaNode;

async function run() {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#7c62c4'; context.fillRect(0, 0, 640, 360);
  context.fillStyle = '#fff'; context.font = '32px sans-serif'; context.fillText('Nano Banana · Mock result', 60, 180);
  context.clearRect(0, 0, 16, 16);
  const image = canvas.toDataURL('image/png');
  const originalFetch = window.fetch.bind(window);
  const blob = await (await originalFetch(image)).blob();
  const sourceUrl = assetResources.create(blob);
  const requests: Record<string, unknown>[] = [];
  let mode: 'success' | 'cancel' | 'failure' = 'success';
  let cancelled = false;
  let uploads = 0, polls = 0, downloads = 0;
  const gateway = 'https://banana-gateway.example/v1';
  const referenceUrl = 'https://cdn.example/uploaded.png';
  const resultUrl = 'https://cdn.example/banana-result.png';
  saveApiSettings({ provider: 'apimart', credentials: { apimart: { baseUrl: gateway, apiKey: 'test-credential' } } });
  // This test page never forwards any model API request or uses real credentials.
  window.fetch = async (url, init) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const headers = new Headers(init?.headers);
    if (path === `${gateway}/uploads/images?retention_days=3`) {
      if (headers.get('Authorization') !== 'Bearer test-credential' || !(init?.body instanceof FormData)) throw new Error('Invalid upload request');
      const file = init.body.get('file');
      if (!(file instanceof File) || file.size !== blob.size || file.type !== 'image/png') throw new Error('Invalid attached file');
      uploads++;
      return Response.json({ url: referenceUrl });
    }
    if (path === '/api/nano-banana') {
      if (headers.get('X-MoMoFlow-Provider') !== 'apimart' || headers.get('X-MoMoFlow-Api-Key') !== 'test-credential') throw new Error('APIMart credentials not used');
      requests.push(JSON.parse(String(init?.body)));
      if (mode === 'cancel') return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => { cancelled = true; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
      });
      if (mode === 'failure') return Response.json({ error: 'Mock provider failure · Request ID: banana-qa' }, { status: 502 });
      return Response.json({ taskId: `task_banana_${requests.length}` });
    }
    if (path === '/api/apimart/task') {
      if (headers.get('X-MoMoFlow-Api-Key') !== 'test-credential' || JSON.parse(String(init?.body)).taskId !== `task_banana_${requests.length}`) throw new Error('Invalid task lookup');
      polls++;
      return polls === 1 ? Response.json({ status: 'processing' }) : Response.json({ status: 'completed', imageUrl: resultUrl });
    }
    if (path === resultUrl) {
      if (headers.has('Authorization') || headers.has('X-MoMoFlow-Api-Key') || init?.credentials !== 'omit') throw new Error('CDN request carried credentials');
      downloads++;
      return new Response(blob);
    }
    if (path.startsWith('/api/') || /^https?:/.test(path)) throw new Error('Unexpected network request in isolated QA');
    return originalFetch(url, init);
  };
  const node = createLibraryNode('nano-banana', { x: 650, y: 80 }) as NanoBananaNode;
  const workflow: Workflow = {
    nodes: [
      { id: 'prompt', type: 'text', position: { x: 70, y: 80 }, data: { text: 'Create a violet landscape' } },
      { id: 'reference', type: 'file', position: { x: 70, y: 620 }, data: { assets: [{ id: 'source', kind: 'image', name: 'reference.png', url: sourceUrl, width: 640, height: 360 }] } },
      { ...node, id: 'banana', selected: true },
      { id: 'preview', type: 'preview', position: { x: 1230, y: 80 }, data: {} },
    ],
    edges: [{ id: 'prompt', source: 'prompt', target: 'banana', targetHandle: 'prompt' }],
    colorMode: 'dark', viewport: { x: 0, y: 210, zoom: .6 },
  };
  const db = `momoflow-nano-banana-qa-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(db); await storage.load();
  const root = createRoot(document.getElementById('root')!);
  root.render(<ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('[aria-label="Nano Banana 设置"]')), 'Node and settings mount');
  check(find('[data-id="banana"] .node-title-label').textContent?.includes('Nano Banana'), 'Dedicated model title and settings');
  check(!find('.image-model-settings .node-settings-fields').textContent?.includes('APIMart'), 'Fixed provider is not shown as a settings row');
  check(!document.querySelector('[data-id="banana"] [data-handleid="mask"]'), 'Only Gemini input ports, without OpenAI mask');
  check((await gptSettingOptions('分辨率', settle)).join(',') === '1K,2K,4K', 'Resolution has three explicit tiers');
  await chooseGptSetting('分辨率', '2K', settle);
  await chooseGptSetting('宽高比', '16:9', settle);
  check(read().data.imageSize === '2K' && read().data.aspectRatio === '16:9', 'Resolution and aspect ratio controls update the node');
  check(getComputedStyle(find('[data-id="banana"] .sunburst-preview')).aspectRatio === '16 / 9', 'Requested ratio updates preview layout');
  check(!document.querySelector('.image-model-settings .describer-expose'), 'Parameters are edited locally');
  const runButton = () => find('[data-id="banana"] .sunburst-run');
  runButton().click();
  await until(() => read().data.results?.length === 1, 'Mock generation completes');
  check(requests.length === 1 && (requests[0].images as string[]).length === 0 && uploads === 0 && polls === 2 && downloads === 1, 'Text-only generation submits once, polls the same task and downloads the result URL');
  check(requests[0].imageSize === '2K' && requests[0].aspectRatio === '16:9', 'Selected parameters reach the API');
  check(document.querySelector('.model-queue-name')?.textContent?.includes('Nano Banana'), 'Task manager shows the correct model');
  check(read().data.results?.every(asset => asset.width === 640 && asset.height === 360), 'All returned images are decoded at actual dimensions');
  const originalPng = await (await originalFetch(read().data.results![0].url)).blob();
  const originalBytes = new Uint8Array(await blob.arrayBuffer()), pngBytes = new Uint8Array(await originalPng.arrayBuffer());
  check(originalPng.type === 'image/png' && pngBytes.length === originalBytes.length && pngBytes.every((value, index) => value === originalBytes[index]), 'PNG output preserves provider bytes exactly');
  find('.model-queue-toggle[aria-expanded="true"]').click(); await settle();
  await chooseGptSetting('输出格式', 'JPEG', settle);
  api.setEdges(current => [...current,
    { id: 'reference', source: 'reference', sourceHandle: 'file', target: 'banana', targetHandle: 'image-0' },
    { id: 'output', source: 'banana', sourceHandle: 'result', target: 'preview', targetHandle: 'file' },
  ]); await settle();
  runButton().click(); await until(() => read().data.results?.length === 2, 'Reference edit completes');
  check(uploads === 1 && JSON.stringify(requests[1].images) === JSON.stringify([referenceUrl]), 'Reference bytes are uploaded before generation and only the returned URL is submitted');
  check(requests[1].outputFormat === 'jpeg', 'JPEG selection is included in the task snapshot');
  const jpegAsset = read().data.results![1], jpeg = await (await originalFetch(jpegAsset.url)).blob();
  const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
  const jpegBitmap = await createImageBitmap(jpeg);
  check(jpeg.type === 'image/jpeg' && jpegBytes[0] === 255 && jpegBytes[1] === 216 && jpegAsset.name.endsWith('.jpeg') && jpegBitmap.width === 640 && jpegBitmap.height === 360, 'Local JPEG output has real JPEG bytes, extension and unchanged dimensions');
  context.clearRect(0, 0, 640, 360); context.drawImage(jpegBitmap, 0, 0); jpegBitmap.close();
  check([...context.getImageData(2, 2, 1, 1).data].every(value => value >= 250), 'JPEG conversion fills transparent pixels with white');
  await until(() => Boolean(document.querySelector<HTMLImageElement>('.preview-image img')?.naturalWidth), 'Downstream preview resolves');
  find('.model-queue-toggle[aria-expanded="true"]').click(); await settle();
  find('[data-id="banana"] [aria-label="上一张"]').click(); await settle();
  check(imageOutput(read(), 'result')[0]?.id === read().data.activeResultId, 'Selected result is the downstream output');
  find('[data-id="banana"] [aria-label="图片画廊"]').click(); await settle();
  check(document.querySelectorAll('[data-id="banana"] .node-image-tile').length === 2, 'Gallery retains all generated results');
  find('[data-id="banana"] [aria-label="返回单张展示"]').click(); await settle();
  const before = api.getNodes().length;
  find('[data-id="banana"] [aria-label="更多选项"]').click(); await settle();
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('创建副本'))!.click(); await settle();
  check(api.getNodes().length === before + 1 && api.getNodes().at(-1)?.type === 'nano-banana', 'Duplicate preserves node type and results');
  canvasHistoryShortcut('undo'); await settle(); check(api.getNodes().length === before, 'Undo removes the duplicate');
  canvasHistoryShortcut('redo'); await settle(); check(api.getNodes().length === before + 1, 'Redo restores the duplicate');
  canvasHistoryShortcut('undo'); await settle();
  api.setNodes(current => current.map(node => ({ ...node, selected: node.id === 'banana' }))); await settle();
  mode = 'cancel'; runButton().click(); await until(() => requests.length === 3, 'Cancellable request starts');
  find('.model-queue-row [aria-label^="取消 "]').click(); await until(() => cancelled, 'Cancellation reaches fetch signal');
  check(read().data.results?.length === 2, 'Cancelled task keeps previous results');
  mode = 'failure';
  find('.model-queue-toggle[aria-expanded="true"]').click(); await settle(); runButton().click();
  await until(() => Boolean(document.querySelector('.task-error')?.textContent?.includes('banana-qa')), 'Provider error appears');
  check(requests.length === 4 && read().data.results?.length === 2, 'Failure does not retry or erase previous images');
  find('.model-queue-toggle[aria-expanded="true"]').click(); await settle();
  const saved = new WorkflowStorage(`${db}-roundtrip`); await saved.load();
  await saved.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const reload = new WorkflowStorage(`${db}-roundtrip`), restored = await reload.load();
  const restoredNode = restored?.nodes.find(node => node.id === 'banana') as NanoBananaNode;
  check(restoredNode.data.imageSize === '2K' && restoredNode.data.outputFormat === 'jpeg' && restoredNode.data.results?.length === 2 && restoredNode.data.activeResultId === read().data.activeResultId, 'IndexedDB restores parameters, all results and active selection');
  const bitmap = await createImageBitmap(await (await originalFetch(restoredNode.data.results![0].url)).blob());
  check(bitmap.width === 640 && bitmap.height === 360, 'Restored image bytes remain readable'); bitmap.close();
  const restoredJpeg = await (await originalFetch(restoredNode.data.results![1].url)).blob();
  check(restoredJpeg.type === 'image/jpeg' && restoredJpeg.size === jpeg.size, 'IndexedDB restores locally converted JPEG bytes');
  reload.dispose(); saved.dispose();
  mode = 'success';
  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} checks · mock only\n${checks.join('\n')}`;
}

const previousSettings = localStorage.getItem(apiSettingsStorageKey);
void run().catch(error => {
  const status = find('#results'); status.dataset.result = 'failed'; status.textContent = `${checks.join('\n')}\nFAIL: ${error instanceof Error ? error.message : error}`;
}).finally(() => {
  if (previousSettings === null) localStorage.removeItem(apiSettingsStorageKey);
  else localStorage.setItem(apiSettingsStorageKey, previousSettings);
});
