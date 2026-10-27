import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import type { AppNode, IdeogramNode } from '../src/nodes/types';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { imageOutput } from '../src/nodes/sunburstRun';
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
  for (let index = 0; index < 300; index++) { if (check()) return; await settle(); }
  throw new Error(message);
}
const find = <T extends HTMLElement = HTMLButtonElement>(selector: string) => {
  const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element;
};
const checks: string[] = [];
function check(value: unknown, message: string): void { if (!value) throw new Error(message); checks.push(message); }
const read = () => api.getNode('ideogram') as IdeogramNode;

async function run() {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#7c62c4'; context.fillRect(0, 0, 640, 360);
  context.fillStyle = '#fff'; context.font = '32px sans-serif'; context.fillText('Ideogram 4.5 · Mock result', 60, 180);
  context.clearRect(0, 0, 16, 16);
  const image = canvas.toDataURL('image/png');
  const originalFetch = window.fetch.bind(window);
  const blob = await (await originalFetch(image)).blob();

  const requests: Record<string, unknown>[] = [];
  let mode: 'success' | 'cancel' | 'failure' = 'success';
  let cancelled = false;
  // This test page never forwards any model API request or uses real credentials.
  window.fetch = async (url, init) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path === '/api/ideogram') {
      requests.push(JSON.parse(String(init?.body)));
      if (mode === 'cancel') return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => { cancelled = true; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
      });
      if (mode === 'failure') return Response.json({ error: 'Mock provider failure · Request ID: ideogram-qa' }, { status: 502 });
      return Response.json({ taskId: 'pred_qa', outputs: ['https://cdn.example/qa.png', 'https://cdn.example/qa.png'] });
    }
    if (path === 'https://cdn.example/qa.png') return new Response(blob);
    if (path.startsWith('/api/') || /^https?:/.test(path)) throw new Error('Unexpected network request in isolated QA');
    return originalFetch(url, init);
  };
  const node = createLibraryNode('ideogram', { x: 650, y: 80 }) as IdeogramNode;
  const workflow: Workflow = {
    nodes: [
      { id: 'prompt', type: 'text', position: { x: 70, y: 80 }, data: { text: 'Create a violet landscape' } },
      { ...node, id: 'ideogram', selected: true },
      { id: 'preview', type: 'preview', position: { x: 1230, y: 80 }, data: {} },
    ],
    edges: [{ id: 'prompt', source: 'prompt', target: 'ideogram', targetHandle: 'prompt' }, { id: 'output', source: 'ideogram', sourceHandle: 'result', target: 'preview', targetHandle: 'file' }],
    colorMode: 'dark', viewport: { x: 0, y: 210, zoom: .6 },
  };
  const db = `momoflow-ideogram-qa-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(db); await storage.load();
  const root = createRoot(document.getElementById('root')!);
  root.render(<ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('[aria-label="Ideogram 4.5 设置"]')), 'Node and settings mount');
  check(find('[data-id="ideogram"] .text-node-title').textContent?.includes('Ideogram 4.5'), 'Dedicated model title and settings');
  check(document.querySelectorAll('[data-id="ideogram"] [data-handleid="mask"], [data-id="ideogram"] [data-handleid="image-0"]').length === 2, 'Optional original image and mask ports are available');
  check(find('.sunburst-provider').textContent?.includes('WaveSpeed'), 'Correct provider label');
  find('[aria-label="分辨率"]').click(); await settle();
  const select = (text: string) => {
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === text);
    if (!option) throw new Error(`Missing option ${text}`); option.click();
  };
  select('2K'); await settle();
  find('[aria-label="宽高比"]').click(); await settle(); select('16:9'); await settle();
  check(read().data.resolution === '2k' && read().data.aspectRatio === '16:9', 'Resolution and aspect ratio controls update the node');
  check(getComputedStyle(find('[data-id="ideogram"] .sunburst-preview')).aspectRatio === '16 / 9', 'Requested ratio updates preview layout');
  find('[aria-label="将分辨率设为输入"]').click(); await settle();
  check(read().data.exposed?.includes('resolution') && api.getEdges().some(edge => edge.targetHandle === 'resolution'), 'Expose creates a typed parameter node and connection');
  find('[aria-label="分辨率使用本地值"]').click(); await settle();
  check(!read().data.exposed?.length && read().data.resolution === '2k', 'Returning to local settings preserves effective value');
  const runButton = () => find('[data-id="ideogram"] .sunburst-run');
  runButton().click();
  await until(() => read().data.results?.length === 2, 'Mock generation completes');
  check(requests.length === 1 && !('images' in requests[0]), 'Text-only generation submits exactly once');
  check(requests[0].resolution === '2k' && requests[0].aspectRatio === '16:9', 'Selected parameters reach the API');
  check(document.querySelector('.task-name')?.textContent?.includes('Ideogram 4.5'), 'Task manager shows the correct model');
  check(read().data.results?.every(asset => asset.width === 640 && asset.height === 360), 'All returned images are decoded at actual dimensions');
  const originalPng = await (await originalFetch(read().data.results![0].url)).blob();
  const originalBytes = new Uint8Array(await blob.arrayBuffer()), pngBytes = new Uint8Array(await originalPng.arrayBuffer());
  check(originalPng.type === 'image/png' && pngBytes.length === originalBytes.length && pngBytes.every((value, index) => value === originalBytes[index]), 'PNG output preserves provider bytes exactly');
  find('[aria-label="关闭任务面板"]').click(); await settle();
  find('[aria-label="质量"]').click(); await settle(); select('高'); await settle();
  find('[aria-label="提示词扩展"]').click(); await settle(); select('关闭'); await settle();
  find('[aria-label="将提示词扩展设为输入"]').click(); await settle();
  check(read().data.exposed?.includes('enablePromptExpansion'), 'Boolean parameter can be exposed');
  find('[aria-label="提示词扩展使用本地值"]').click(); await settle();
  check(read().data.enablePromptExpansion === false, 'Returning to local settings preserves boolean false');
  runButton().click(); await until(() => read().data.results?.length === 4, 'Second generation completes');
  check(requests[1].quality === 'high' && requests[1].enablePromptExpansion === false, 'Quality and expansion selection reach the API');
  await until(() => Boolean(document.querySelector<HTMLImageElement>('.preview-image img')?.naturalWidth), 'Downstream preview resolves');
  find('[aria-label="关闭任务面板"]').click(); await settle();
  find('[data-id="ideogram"] [aria-label="Previous result"]').click(); await settle();
  check(imageOutput(read(), 'result')[0]?.id === read().data.activeResultId, 'Selected result is the downstream output');
  find('[data-id="ideogram"] [aria-label="Single"]').click(); await settle();
  check(document.querySelectorAll('[data-id="ideogram"] .file-node-tile').length === 4, 'Gallery retains all generated results');
  find('[data-id="ideogram"] [aria-label="All"]').click(); await settle();
  const before = api.getNodes().length;
  find('[data-id="ideogram"] [aria-label="更多选项"]').click(); await settle();
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('创建副本'))!.click(); await settle();
  check(api.getNodes().length === before + 1 && api.getNodes().at(-1)?.type === 'ideogram', 'Duplicate preserves node type and results');
  find('[aria-label="撤销"]').click(); await settle(); check(api.getNodes().length === before, 'Undo removes the duplicate');
  find('[aria-label="重做"]').click(); await settle(); check(api.getNodes().length === before + 1, 'Redo restores the duplicate');
  find('[aria-label="撤销"]').click(); await settle();
  api.setNodes(current => current.map(node => ({ ...node, selected: node.id === 'ideogram' }))); await settle();
  mode = 'cancel'; runButton().click(); await until(() => requests.length === 3, 'Cancellable request starts');
  find('[aria-label="取消任务"]').click(); await until(() => cancelled, 'Cancellation reaches fetch signal');
  check(read().data.results?.length === 4, 'Cancelled task keeps previous results');
  mode = 'failure';
  find('[aria-label="关闭任务面板"]').click(); await settle(); runButton().click();
  await until(() => Boolean(document.querySelector('.task-error')?.textContent?.includes('ideogram-qa')), 'Provider error appears');
  check(requests.length === 4 && read().data.results?.length === 4, 'Failure does not retry or erase previous images');
  find('[aria-label="关闭任务面板"]').click(); await settle();
  const saved = new WorkflowStorage(`${db}-roundtrip`); await saved.load();
  await saved.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const reload = new WorkflowStorage(`${db}-roundtrip`), restored = await reload.load();
  const restoredNode = restored?.nodes.find(node => node.id === 'ideogram') as IdeogramNode;
  check(restoredNode.data.resolution === '2k' && restoredNode.data.quality === 'high' && restoredNode.data.enablePromptExpansion === false && restoredNode.data.results?.length === 4 && restoredNode.data.activeResultId === read().data.activeResultId, 'IndexedDB restores parameters, all results and active selection');
  const bitmap = await createImageBitmap(await (await originalFetch(restoredNode.data.results![0].url)).blob());
  check(bitmap.width === 640 && bitmap.height === 360, 'Restored image bytes remain readable'); bitmap.close();
  reload.dispose(); saved.dispose();
  mode = 'success';
  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} checks · mock only\n${checks.join('\n')}`;
}

void run().catch(error => {
  const status = find('#results'); status.dataset.result = 'failed'; status.textContent = `${checks.join('\n')}\nFAIL: ${error instanceof Error ? error.message : error}`;
});
