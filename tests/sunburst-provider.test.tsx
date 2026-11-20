import { chooseGptSetting, gptSegmentValue, gptSettingDisabled, gptSettingOptions } from './gptSidebarControls';
import { canvasHistoryShortcut } from './canvasShortcuts';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import type { AppNode, SunburstNode } from '../src/nodes/types';
import { isSunburstNode } from '../src/nodes/types';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

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
const chooseSetting = (field: string, label: string) => chooseGptSetting(field, label, settle);
const chooseProvider = (label: string) => chooseSetting('渠道商', label);
const qualityOptions = () => gptSettingOptions('画质', settle);
const closeTasks = async () => { document.querySelector<HTMLButtonElement>('.model-queue-toggle[aria-expanded="true"]')?.click(); await settle(); };

async function run() {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 320;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#7760b7'; context.fillRect(0, 0, 320, 320); context.clearRect(0, 0, 32, 32);
  const image = canvas.toDataURL('image/png');
  const originalFetch = window.fetch.bind(window);
  const requests: Record<string, unknown>[] = [];
  let fail = false;
  let invalidSvg = false;
  const svgXml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><rect width="640" height="480" fill="#7760b7"/><path d="M80 240L320 80L560 240L320 400Z" fill="#fff"/><text x="250" y="250" fill="#222">矢量 SVG</text></svg>';
  const svgBase64 = btoa(String.fromCharCode(...new TextEncoder().encode(svgXml)));
  // Every model request stays in this isolated page; no credentials or paid calls.
  window.fetch = async (url, init) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path === '/api/apimart/images') {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ taskId: 'migrated-task' });
    }
    if (path === '/api/apimart/task') return Response.json({ status: 'completed', format: 'png', imageUrl: 'https://cdn.example/migrated.png' });
    if (path === 'https://cdn.example/migrated.png') return originalFetch(image);
    if (path === '/api/sunburst') {
      const request = JSON.parse(String(init?.body)); requests.push(request);
      if (fail) return Response.json({ error: 'OpenAI mock failure · sunburst-provider-qa' }, { status: 502 });
      if (request.outputFormat === 'svg') return Response.json({ image: `data:image/svg+xml;base64,${invalidSvg ? btoa('PNG bytes') : svgBase64}`, format: 'svg' });
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
  check(node.data.provider === 'apimart' && node.data.channelModel === 'gpt-image-2.6-ext'
    && node.data.variant === 'Sunburst' && node.data.quality === 'medium', 'New nodes still use the default APIMart EXT settings');
  const workflow: Workflow = {
    nodes: [
      { id: 'prompt', type: 'text', position: { x: 70, y: 80 }, data: { text: 'A violet circle' } },
      { id: 'reference', type: 'file', position: { x: 70, y: 620 }, data: { assets: [{ id: 'source', kind: 'image', name: 'reference.png', url: image, width: 320, height: 320 }] } },
      { ...node, id: 'image', selected: true },
    ],
    edges: [{ id: 'prompt', source: 'prompt', target: 'image', targetHandle: 'prompt' }],
    colorMode: 'dark', viewport: { x: 0, y: 210, zoom: .6 },
  };
  const db = `momoflow-sunburst-provider-qa-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(db); await storage.load();
  // Seed a pre-migration document by bypassing the current snapshot writer.
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(db);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const transaction = open.result.transaction('workflows', 'readwrite');
      transaction.oncomplete = () => { open.result.close(); resolve(); };
      transaction.onabort = () => { open.result.close(); reject(transaction.error); };
      const nodes = workflow.nodes.map(item => item.id === 'image'
        ? { ...item, data: { ...item.data, provider: 'zenmux', size: '2048x1152', exposed: ['quality'] } } : item);
      nodes.push({ id: 'legacy-quality', type: 'text', position: { x: 300, y: 450 }, data: { text: 'high' } });
      const edges = [...workflow.edges, { id: 'legacy-quality-edge', source: 'legacy-quality', target: 'image', targetHandle: 'quality' }];
      transaction.objectStore('workflows').put({ ...workflow, version: 1, nodes, edges }, 'current');
    };
  });
  const migrated = await storage.load();
  createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Flow storage={storage} saved={migrated} /><Probe /></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('[aria-label="渠道商"]')), 'Settings did not mount');
  check(find('[aria-label="渠道商"]').textContent?.includes('APIMart')
    && find('[aria-label="渠道模型"]').textContent === 'GPT Image 2.6'
    && gptSegmentValue('模型版本') === 'Sunburst'
    && find('[aria-label="画质"]').textContent === '高'
    && read().data.provider === 'apimart' && read().data.size === '2048x1152', 'Opening the saved legacy node migrates it to APIMart and keeps its pixel size and quality');
  check(!read().data.exposed && !api.getEdges().some(edge => edge.id === 'legacy-quality-edge')
    && Boolean(api.getNode('legacy-quality')) && !document.querySelector('.image-model-settings .describer-expose')
    && !document.querySelector('[data-id="image"] [data-handleid="quality"]'), 'Old parameter input is removed and its value remains local');
  const providerSelect = find('[aria-label="渠道商"]');
  providerSelect.click(); await settle();
  const providerMenu = find('[role="listbox"][aria-label="渠道商"]');
  check([...providerMenu.querySelectorAll('[role="option"]')].map(item => item.textContent).join(',') === 'OpenAI 官方,APIMart', 'The sidebar omits ZenMux even when it was saved on the node');
  providerMenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  await new Promise(resolve => setTimeout(resolve, 800)); // Separate edits across the history coalescing window.
  await chooseProvider('OpenAI 官方');
  check(read().data.provider === 'openai' && read().type === 'sunburst', 'Official channel uses the same Sunburst node');
  check(find('[aria-label="渠道商"]').textContent?.includes('OpenAI 官方') && find('.sunburst-settings h2').textContent === 'GPT Image 2.6', 'Provider selector updates within the redesigned GPT sidebar');
  canvasHistoryShortcut('undo'); await settle();
  check(read().data.provider === 'apimart', 'Undo restores the migrated APIMart channel');
  canvasHistoryShortcut('redo'); await settle();
  check(read().data.provider === 'openai', 'Redo restores OpenAI');
  check((await qualityOptions()).join(',') === '自动,低,中,高,超高,最高', 'OpenAI offers all six official quality options');
  await new Promise(resolve => setTimeout(resolve, 800));
  await chooseSetting('模型版本', 'Flare');
  check(read().data.variant === 'Flare', 'Model selector saves Flare');
  canvasHistoryShortcut('undo'); await settle();
  check((read().data.variant ?? 'Sunburst') === 'Sunburst', 'Undo restores Sunburst');
  canvasHistoryShortcut('redo'); await settle();
  check(read().data.variant === 'Flare', 'Redo restores Flare');
  await chooseSetting('画质', '最高');
  check(read().data.quality === 'max', 'Local quality saves max');
  await chooseSetting('宽高比', '自动');
  check(read().data.size === 'auto' && gptSegmentValue('分辨率') === undefined, 'Automatic size is controlled by the aspect ratio, with no selected tier');
  check((await gptSettingOptions('分辨率', settle)).join(',') === '1K,2K,4K', 'OpenAI resolution only offers explicit tiers');
  await chooseSetting('分辨率', '2K');
  check(read().data.size === '2048x2048' && find('[aria-label="宽高比"]').textContent?.includes('1:1'), '2K from auto selects an explicit 2048 square');
  await chooseSetting('宽高比', '16:9');
  check(read().data.size === '2048x1152' && gptSegmentValue('分辨率') === '2K', 'Changing aspect ratio retains the selected resolution');
  await chooseSetting('宽高比', '1:1');
  api.updateNodeData('image', { locked: true }); await settle();
  check(find<HTMLButtonElement>('[aria-label="渠道商"]').disabled, 'Locked node cannot switch provider');
  check(gptSettingDisabled('分辨率'), 'Locked node cannot switch resolution');
  api.updateNodeData('image', { locked: false }); await settle();
  const runButton = () => find('[data-id="image"] .sunburst-run');
  runButton().click(); await until(() => read().data.results?.length === 1, 'Official mock generation did not finish');
  check(requests[0].provider === 'openai' && (requests[0].images as string[]).length === 0, 'Text generation snapshots OpenAI');
  check(requests[0].variant === 'Flare', 'Flare reaches the client request');
  check(requests[0].quality === 'max', 'Maximum quality reaches the generation request');
  check(requests[0].size === '2048x2048', '2K dimensions reach the generation request');
  await closeTasks();
  await chooseProvider('APIMart');
  runButton().click(); await until(() => read().data.results?.length === 2, 'APIMart mock generation did not finish');
  check(requests[1].provider === 'apimart' && requests[1].channelModel === 'gpt-image-2.6', 'The migrated channel model submits to APIMart and receives a result');
  await closeTasks(); await chooseProvider('OpenAI 官方');
  await chooseSetting('画质', '超高');
  await chooseSetting('分辨率', '4K');
  check(read().data.size === '2880x2880', '4K square respects the pixel cap');
  // Canvas history groups data edits within 750 ms. Start a separate user edit.
  await new Promise(resolve => setTimeout(resolve, 800));
  await chooseSetting('宽高比', '9:16');
  check(read().data.size === '2160x3840', '4K portrait resolves to 2160 by 3840');
  canvasHistoryShortcut('undo'); await settle();
  check(read().data.size === '2880x2880' && gptSegmentValue('分辨率') === '4K', 'Undo restores dimensions and derived resolution together');
  canvasHistoryShortcut('redo'); await settle();
  check(read().data.size === '2160x3840', 'Redo restores 4K portrait');
  await chooseSetting('宽高比', '16:9');
  check(read().data.size === '3840x2160', 'Local ratio keeps the 4K tier');
  api.setEdges(current => [...current,
    { id: 'reference', source: 'reference', sourceHandle: 'file', target: 'image', targetHandle: 'image-0' },
    { id: 'mask', source: 'reference', sourceHandle: 'file', target: 'image', targetHandle: 'mask' },
  ]); await settle();
  runButton().click(); await until(() => read().data.results?.length === 3, 'Official mock edit did not finish');
  check(requests[2].provider === 'openai' && (requests[2].images as string[])[0] === image && requests[2].mask === image, 'Official edits preserve ordered image and transparent mask bytes');
  check(requests[2].quality === 'xhigh', 'Extra-high quality reaches the masked edit request');
  check(requests[2].size === '3840x2160', '4K dimensions reach the masked edit request');
  check(read().data.results?.[0].width === 2048 && read().data.results?.[0].height === 2048 && read().data.results?.[2].width === 3840 && read().data.results?.[2].height === 2160, '2K and 4K returned pixels decode without downscaling and feed Preview');
  await closeTasks(); fail = true;
  runButton().click(); await until(() => Boolean(document.querySelector('.task-error')?.textContent?.includes('sunburst-provider-qa')), 'Official error did not appear');
  check(requests.length === 4 && read().data.results?.length === 3, 'Failures keep prior results and never retry or switch provider');
  await closeTasks(); fail = false;
  find('[data-id="image"] [aria-label="更多选项"]').click(); await settle();
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('创建副本'))!.click(); await settle();
  check(api.getNodes().filter(isSunburstNode).every(node => node.data.provider === 'openai'), 'Duplicate retains selected channel');
  canvasHistoryShortcut('undo'); await settle();
  api.setNodes(current => current.map(node => ({ ...node, selected: node.id === 'image' }))); await settle();
  await chooseProvider('OpenAI 官方'); await chooseSetting('画质', '超高');
  const saved = new WorkflowStorage(`${db}-roundtrip`); await saved.load();
  await saved.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const reload = new WorkflowStorage(`${db}-roundtrip`), restored = await reload.load();
  const restoredNode = restored?.nodes.find(node => node.id === 'image') as SunburstNode;
  check(restoredNode.data.provider === 'openai' && restoredNode.data.results?.length === 3, 'IndexedDB restores provider and generated results');
  check(restoredNode.data.variant === 'Flare', 'IndexedDB retains Flare');
  check(restoredNode.data.quality === 'xhigh', 'IndexedDB retains advanced quality');
  check(restoredNode.data.size === '3840x2160', 'IndexedDB retains 4K size');
  const bitmap = await createImageBitmap(await (await originalFetch(restoredNode.data.results![0].url)).blob());
  check(bitmap.width === 2048 && bitmap.height === 2048, 'Restored 2K result bytes retain full resolution'); bitmap.close();
  const restored4K = await createImageBitmap(await (await originalFetch(restoredNode.data.results![2].url)).blob());
  check(restored4K.width === 3840 && restored4K.height === 2160, 'Restored 4K result bytes retain full resolution'); restored4K.close();
  reload.dispose(); saved.dispose();
  await closeTasks();
  api.setEdges(all => all.filter(edge => !(edge.target === 'image' && (edge.targetHandle?.startsWith('image-') || edge.targetHandle === 'mask'))));
  await settle();
  await chooseSetting('输出格式', 'SVG');
  check(read().data.outputFormat === 'svg', 'SVG format is selectable');
  for (const variant of ['Sunburst', 'Flare']) {
    await chooseSetting('模型版本', variant);
    const count = read().data.results!.length;
    runButton().click();
    await until(() => read().data.results?.length === count + 1, `${variant} SVG did not finish`);
    const asset = read().data.results!.at(-1)!;
    const blob = await (await originalFetch(asset.url)).blob();
    check(blob.type === 'image/svg+xml' && await blob.text() === svgXml, `${variant} keeps exact UTF-8 vector XML`);
    check(asset.name.endsWith('.svg') && asset.width === 640 && asset.height === 480, `${variant} preserves SVG filename and viewBox dimensions`);
    await until(() => [...document.querySelectorAll<HTMLImageElement>('[data-id="image"] img')].some(image => image.src === asset.url && image.complete && image.naturalWidth > 0), 'SVG preview did not load');
    check(true, `${variant} renders vector preview`);
    await closeTasks();
  }
  const vector = read().data.results!.at(-1)!;
  let downloaded: { href: string; name: string } | undefined;
  const captureDownload = (event: MouseEvent) => {
    const anchor = event.target;
    if (anchor instanceof HTMLAnchorElement && anchor.download) { event.preventDefault(); downloaded = { href: anchor.href, name: anchor.download }; }
  };
  document.addEventListener('click', captureDownload, true);
  try {
    find('[data-id="image"] [aria-label="下载当前图片"]').click();
    await until(() => Boolean(downloaded), 'SVG download did not start');
    check(downloaded!.name.endsWith('.svg') && await (await originalFetch(downloaded!.href)).text() === svgXml, 'Download keeps actual SVG bytes without PNG conversion');
  } finally { document.removeEventListener('click', captureDownload, true); }
  const svgStorage = new WorkflowStorage(`${db}-svg`); await svgStorage.load();
  await svgStorage.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const svgReload = new WorkflowStorage(`${db}-svg`), svgRestored = await svgReload.load();
  const savedVector = (svgRestored!.nodes.find(node => node.id === 'image') as SunburstNode).data.results!.find(asset => asset.id === vector.id)!;
  const savedBlob = await (await originalFetch(savedVector.url)).blob();
  check(savedBlob.type === 'image/svg+xml' && await savedBlob.text() === svgXml, 'IndexedDB retains SVG MIME and exact vector XML');
  svgReload.dispose(); svgStorage.dispose();
  invalidSvg = true;
  runButton().click();
  await until(() => Boolean(document.querySelector('[data-id="image"] .sunburst-error, [data-id="image"] [role="alert"]')) || document.body.textContent!.includes('纯矢量 SVG'), 'Invalid SVG error did not appear');
  check(read().data.results!.at(-1)!.id === vector.id, 'Invalid SVG retains the previous vector result');

  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} checks · mock only\n${checks.join('\n')}`;
}

void run().catch(error => {
  const status = find('#results'); status.dataset.result = 'failed'; status.textContent = `${checks.join('\n')}\nFAIL: ${error instanceof Error ? error.message : error}`;
});
