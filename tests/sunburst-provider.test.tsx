import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import type { AppNode, SunburstNode } from '../src/nodes/types';
import { isSunburstNode } from '../src/nodes/types';
import { prepareSunburstRun } from '../src/nodes/sunburstRun';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges: edges.map(edge => `${edge.source}>${edge.target}`) })}</output>;
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
const read = () => api.getNode('image') as SunburstNode;
async function chooseSetting(field: string, label: string) {
  find(`[aria-label="${field}"]`).click(); await settle();
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === label);
  if (!option) throw new Error(`Missing ${field} option ${label}`);
  option.click(); await settle();
}
const chooseProvider = (label: string) => chooseSetting('渠道商', label);
async function qualityOptions() {
  find('[aria-label="画质"]').click(); await settle();
  const values = [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(item => item.textContent);
  document.querySelector('[role="listbox"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  return values;
}
const closeTasks = async () => { document.querySelector<HTMLButtonElement>('[aria-label="关闭任务面板"]')?.click(); await settle(); };

async function run() {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 320;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#7760b7'; context.fillRect(0, 0, 320, 320); context.clearRect(0, 0, 32, 32);
  const image = canvas.toDataURL('image/png');
  const originalFetch = window.fetch.bind(window);
  const requests: Record<string, unknown>[] = [];
  let fail = false;
  // Every model request stays in this isolated page; no credentials or paid calls.
  window.fetch = async (url, init) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path === '/api/sunburst') {
      const request = JSON.parse(String(init?.body)); requests.push(request);
      if (fail) return Response.json({ error: 'OpenAI mock failure · sunburst-provider-qa' }, { status: 502 });
      const output = document.createElement('canvas');
      const [width, height] = request.size === 'auto' ? [320, 320] : request.size.split('x').map(Number);
      output.width = width; output.height = height;
      output.getContext('2d')!.fillStyle = '#7760b7'; output.getContext('2d')!.fillRect(0, 0, width, height);
      return Response.json({ image: output.toDataURL('image/png'), format: 'png' });
    }
    if (path.startsWith('/api/') || /^https?:/.test(path)) throw new Error('Unexpected network request in isolated QA');
    return originalFetch(url, init);
  };
  const node = createLibraryNode('sunburst', { x: 650, y: 80 }) as SunburstNode;
  const workflow: Workflow = {
    nodes: [
      { id: 'prompt', type: 'text', position: { x: 70, y: 80 }, data: { text: 'A violet circle' } },
      { id: 'reference', type: 'file', position: { x: 70, y: 620 }, data: { assets: [{ id: 'source', kind: 'image', name: 'reference.png', url: image, width: 320, height: 320 }] } },
      { ...node, id: 'image', selected: true },
      { id: 'preview', type: 'preview', position: { x: 1230, y: 80 }, data: {} },
    ],
    edges: [{ id: 'prompt', source: 'prompt', target: 'image', targetHandle: 'prompt' }],
    colorMode: 'dark', viewport: { x: 0, y: 210, zoom: .6 },
  };
  const db = `momoflow-sunburst-provider-qa-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(db); await storage.load();
  createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('[aria-label="渠道商"]')), 'Settings did not mount');
  check(find('[aria-label="渠道商"]').textContent?.includes('ZenMux'), 'Legacy/default nodes keep ZenMux');
  check((await qualityOptions()).join(',') === '自动,低,中,高', 'ZenMux retains its four quality options');
  await chooseProvider('OpenAI 官方');
  check(read().data.provider === 'openai' && read().type === 'sunburst', 'Official channel uses the same Sunburst node');
  check(find('.sunburst-provider').textContent?.includes('OpenAI 官方') && find('.describer-primary').title.includes('OpenAI 官方'), 'Provider badge and run tooltip match the selected channel');
  find('[aria-label="撤销"]').click(); await settle();
  check((read().data.provider ?? 'zenmux') === 'zenmux', 'Undo restores previous channel');
  find('[aria-label="重做"]').click(); await settle();
  check(read().data.provider === 'openai', 'Redo restores OpenAI');
  check((await qualityOptions()).join(',') === '自动,低,中,高,超高,最高', 'OpenAI offers all six official quality options');
  await chooseSetting('画质', '最高');
  find('[aria-label="将画质设为输入"]').click(); await settle();
  const parameter = api.getNodes().find(node => node.type === 'model-input' && 'parameter' in node.data && node.data.parameter === 'quality');
  check(parameter && 'options' in parameter.data && JSON.stringify(parameter.data.options) === JSON.stringify(['auto', 'low', 'medium', 'high', 'xhigh', 'max']), 'Exposed OpenAI quality parameter includes xhigh and max');
  find('[aria-label="画质使用本地值"]').click(); await settle();
  check(read().data.quality === 'max', 'Returning quality to local preserves max');
  await chooseSetting('分辨率', '2K');
  check(read().data.size === '2048x2048' && find('[aria-label="宽高比"]').textContent?.includes('1:1'), '2K from auto selects an explicit 2048 square');
  await chooseSetting('宽高比', '16:9');
  check(read().data.size === '2048x1152' && find('[aria-label="分辨率"]').textContent === '2K', 'Changing aspect ratio retains the selected resolution');
  await chooseSetting('宽高比', '1:1');
  api.updateNodeData('image', { locked: true }); await settle();
  check(find<HTMLButtonElement>('[aria-label="渠道商"]').disabled, 'Locked node cannot switch provider');
  check(find<HTMLButtonElement>('[aria-label="分辨率"]').disabled, 'Locked node cannot switch resolution');
  api.updateNodeData('image', { locked: false }); await settle();
  const runButton = () => find('[data-id="image"] .sunburst-run');
  runButton().click(); await until(() => read().data.results?.length === 1, 'Official mock generation did not finish');
  check(requests[0].provider === 'openai' && (requests[0].images as string[]).length === 0, 'Text generation snapshots OpenAI');
  check(requests[0].quality === 'max', 'Maximum quality reaches the generation request');
  check(requests[0].size === '2048x2048', '2K dimensions reach the generation request');
  await closeTasks();
  await chooseProvider('ZenMux');
  check(read().data.quality === 'high', 'Switching to ZenMux changes unsupported local quality to high');
  find('[aria-label="撤销"]').click(); await settle();
  check(read().data.provider === 'openai' && read().data.quality === 'max', 'One undo restores channel and max quality together');
  find('[aria-label="重做"]').click(); await settle();
  runButton().click(); await until(() => read().data.results?.length === 2, 'ZenMux mock generation did not finish');
  check(requests[1].provider === 'zenmux', 'Switching back routes the next request to ZenMux');
  await closeTasks(); await chooseProvider('OpenAI 官方');
  await chooseSetting('画质', '超高');
  await chooseSetting('分辨率', '4K');
  check(read().data.size === '2880x2880', '4K square respects the pixel cap');
  // Canvas history groups data edits within 750 ms. Start a separate user edit.
  await new Promise(resolve => setTimeout(resolve, 800));
  await chooseSetting('宽高比', '9:16');
  check(read().data.size === '2160x3840', '4K portrait resolves to 2160 by 3840');
  find('[aria-label="撤销"]').click(); await settle();
  check(read().data.size === '2880x2880' && find('[aria-label="分辨率"]').textContent === '4K', 'Undo restores dimensions and derived resolution together');
  find('[aria-label="重做"]').click(); await settle();
  check(read().data.size === '2160x3840', 'Redo restores 4K portrait');
  await chooseSetting('宽高比', '16:9');
  find('[aria-label="将宽高比设为输入"]').click(); await settle();
  check(find<HTMLButtonElement>('[aria-label="分辨率"]').disabled, 'Connected size controls the entire resolution');
  const sizeParameter = api.getNodes().find(node => node.type === 'model-input' && 'parameter' in node.data && node.data.parameter === 'size');
  check(sizeParameter && 'options' in sizeParameter.data && (sizeParameter.data.options as string[]).includes('3840x2160'), 'Exposed size options include 4K');
  find('[aria-label="宽高比使用本地值"]').click(); await settle();
  check(read().data.size === '3840x2160', 'Returning size to local retains 4K');
  api.setEdges(current => [...current,
    { id: 'reference', source: 'reference', sourceHandle: 'file', target: 'image', targetHandle: 'image-0' },
    { id: 'mask', source: 'reference', sourceHandle: 'file', target: 'image', targetHandle: 'mask' },
    { id: 'output', source: 'image', sourceHandle: 'result', target: 'preview', targetHandle: 'file' },
  ]); await settle();
  runButton().click(); await until(() => read().data.results?.length === 3, 'Official mock edit did not finish');
  check(requests[2].provider === 'openai' && (requests[2].images as string[])[0] === image && requests[2].mask === image, 'Official edits preserve ordered image and transparent mask bytes');
  check(requests[2].quality === 'xhigh', 'Extra-high quality reaches the masked edit request');
  check(requests[2].size === '3840x2160', '4K dimensions reach the masked edit request');
  await until(() => Boolean(document.querySelector<HTMLImageElement>('.preview-image img')?.naturalWidth), 'Downstream preview did not render');
  check(read().data.results?.[0].width === 2048 && read().data.results?.[0].height === 2048 && read().data.results?.[2].width === 3840 && read().data.results?.[2].height === 2160, '2K and 4K returned pixels decode without downscaling and feed Preview');
  await closeTasks(); fail = true;
  runButton().click(); await until(() => Boolean(document.querySelector('.task-error')?.textContent?.includes('sunburst-provider-qa')), 'Official error did not appear');
  check(requests.length === 4 && read().data.results?.length === 3, 'Failures keep prior results and never retry or switch provider');
  await closeTasks(); fail = false;
  find('[data-id="image"] [aria-label="更多选项"]').click(); await settle();
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('创建副本'))!.click(); await settle();
  check(api.getNodes().filter(isSunburstNode).every(node => node.data.provider === 'openai'), 'Duplicate retains selected channel');
  find('[aria-label="撤销"]').click(); await settle();
  api.setNodes(current => current.map(node => ({ ...node, selected: node.id === 'image' }))); await settle();
  // A different invalid field must not discard a valid connected size on detach.
  for (const quality of ['超高', '最高']) for (const [size, tier] of [['2048x1152', '2K'], ['3840x2160', '4K']]) {
    await chooseProvider('OpenAI 官方'); await chooseSetting('画质', quality); await chooseSetting('分辨率', '1K');
    const localSize = read().data.size;
    find('[aria-label="将画质设为输入"]').click(); await settle();
    find('[aria-label="将宽高比设为输入"]').click(); await settle();
    const sizeSource = api.getEdges().find(edge => edge.target === 'image' && edge.targetHandle === 'size')!.source;
    const qualitySource = api.getEdges().find(edge => edge.target === 'image' && edge.targetHandle === 'quality')!.source;
    api.updateNodeData(sizeSource, { model: size }); await settle();
    await chooseProvider('ZenMux');
    check(Boolean(prepareSunburstRun(api.getNodes(), api.getEdges(), ['image'], 1).error), `${quality} still blocks ZenMux before detaching ${tier}`);
    find('[aria-label="宽高比使用本地值"]').click(); await settle();
    check(read().data.size === size && find('[aria-label="分辨率"]').textContent === tier, `Returning ${tier} to local preserves size despite unsupported ${quality}`);
    const preservedSource = api.getNode(sizeSource);
    check(preservedSource?.type === 'model-input' && 'model' in preservedSource.data && preservedSource.data.model === size && api.getEdges().some(edge => edge.source === qualitySource && edge.target === 'image'), 'Detaching size leaves upstream values and quality connection unchanged');
    find('[aria-label="撤销"]').click(); await settle();
    check(read().data.size === localSize && api.getEdges().some(edge => edge.source === sizeSource && edge.target === 'image'), `Undo restores the connected ${tier} and prior local size`);
    find('[aria-label="重做"]').click(); await settle();
    check(read().data.size === size && !api.getEdges().some(edge => edge.target === 'image' && edge.targetHandle === 'size'), `Redo retains ${tier} locally`);
    find('[aria-label="画质使用本地值"]').click(); await settle();
    const prepared = prepareSunburstRun(api.getNodes(), api.getEdges(), ['image'], 1);
    check(!prepared.error && prepared.tasks[0].imageRequest?.size === size, `${tier} reaches the next task after correcting unsupported quality`);
  }
  await chooseProvider('OpenAI 官方'); await chooseSetting('画质', '超高');
  find('[aria-label="将宽高比设为输入"]').click(); await settle();
  const invalidSizeSource = api.getEdges().find(edge => edge.target === 'image' && edge.targetHandle === 'size')!.source;
  api.updateNodeData(invalidSizeSource, { model: '4096x4096' }); await settle();
  find('[aria-label="宽高比使用本地值"]').click(); await settle();
  check(read().data.size === '3840x2160', 'Invalid external size retains the previous valid local size');
  const saved = new WorkflowStorage(`${db}-roundtrip`); await saved.load();
  await saved.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const reload = new WorkflowStorage(`${db}-roundtrip`), restored = await reload.load();
  const restoredNode = restored?.nodes.find(node => node.id === 'image') as SunburstNode;
  check(restoredNode.data.provider === 'openai' && restoredNode.data.results?.length === 3, 'IndexedDB restores provider and generated results');
  check(restoredNode.data.quality === 'xhigh', 'IndexedDB retains advanced quality');
  check(restoredNode.data.size === '3840x2160', 'IndexedDB retains 4K size');
  const bitmap = await createImageBitmap(await (await originalFetch(restoredNode.data.results![0].url)).blob());
  check(bitmap.width === 2048 && bitmap.height === 2048, 'Restored 2K result bytes retain full resolution'); bitmap.close();
  const restored4K = await createImageBitmap(await (await originalFetch(restoredNode.data.results![2].url)).blob());
  check(restored4K.width === 3840 && restored4K.height === 2160, 'Restored 4K result bytes retain full resolution'); restored4K.close();
  reload.dispose(); saved.dispose();
  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} checks · mock only\n${checks.join('\n')}`;
}

void run().catch(error => {
  const status = find('#results'); status.dataset.result = 'failed'; status.textContent = `${checks.join('\n')}\nFAIL: ${error instanceof Error ? error.message : error}`;
});
