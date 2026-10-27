import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import type { AppNode, CompareNode, FileAsset, IdeogramNode, PainterNode } from '../src/nodes/types';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { prepareIdeogramEditImages } from '../src/nodes/ideogramEditClient';
import { defaultIdeogramEditSettings } from '../src/nodes/ideogram';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { defaultPainterData, painterRevision } from '../src/nodes/painter';
import { painterBlob, renderPainter } from '../src/nodes/painterRender';
import { defaultCompareData, restoreCompareData } from '../src/nodes/compare';
import { imageOutput } from '../src/nodes/sunburstRun';
import { prepareIdeogramRun } from '../src/nodes/ideogramRun';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes: nodes.map(node => ({ id: node.id, type: node.type, position: node.position })), edges: edges.map(edge => `${edge.source}:${edge.sourceHandle}>${edge.target}:${edge.targetHandle}`), zoom: api.getZoom() })}</output>;
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
const select = async (label: string, text: string) => {
  find(`[aria-label="${label}"]`).click(); await settle();
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === text);
  if (!option) throw new Error(`Missing option ${text}`); option.click(); await settle();
};

async function run() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#70a5cf'; context.fillRect(0, 0, 512, 512);
  context.fillStyle = '#f8c983'; context.fillRect(140, 140, 232, 232);
  const original = canvas.toDataURL('image/png');
  context.fillStyle = '#fff'; context.fillRect(0, 0, 512, 512);
  context.fillStyle = '#000'; context.fillRect(0, 0, 256, 512);
  const mask = canvas.toDataURL('image/png');
  context.clearRect(0, 0, 256, 512);
  const alpha = canvas.toDataURL('image/png');
  context.fillStyle = '#fff'; context.fillRect(0, 0, 512, 512);
  const uniform = canvas.toDataURL('image/png');
  canvas.width = canvas.height = 32;
  const small = canvas.toDataURL('image/png');
  const originalFetch = window.fetch.bind(window);
  const blob = await (await originalFetch(original)).blob();
  const requests: Record<string, unknown>[] = [];
  let mode: 'success' | 'cancel' | 'failure' = 'success', cancelled = false;
  window.fetch = async (url, init) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path === '/api/ideogram/edit') {
      requests.push(JSON.parse(String(init?.body)));
      if (mode === 'cancel') return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => { cancelled = true; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
      });
      if (mode === 'failure') return Response.json({ error: 'Edit QA failure' }, { status: 502 });
      return Response.json({ taskId: 'edit_qa', outputs: ['https://cdn.example/edit.png'] });
    }
    if (path === 'https://cdn.example/edit.png') return new Response(blob);
    if (path.startsWith('/api/') || /^https?:/.test(path)) throw new Error('Unexpected network request in isolated edit QA');
    return originalFetch(url, init);
  };
  const asset = (id: string, url: string): FileAsset => ({ id, name: `${id}.png`, url, kind: 'image', width: 512, height: 512 });
  const node = createLibraryNode('ideogram', { x: 650, y: 60 }) as IdeogramNode;
  const workflow: Workflow = {
    nodes: [
      { id: 'prompt', type: 'text', position: { x: 60, y: 60 }, data: { text: 'Replace the object with a red sphere' } },
      { id: 'source', type: 'file', position: { x: 60, y: 260 }, data: { assets: [asset('source', original)] } },
      { id: 'mask', type: 'file', position: { x: 60, y: 710 }, data: { assets: [asset('mask', mask)] } },
      { id: 'reference', type: 'file', position: { x: 650, y: 710 }, data: { assets: [asset('reference', original)] } },
      { ...node, id: 'ideogram', selected: true },
      { id: 'preview', type: 'preview', position: { x: 1220, y: 60 }, data: {} },
    ],
    edges: [{ id: 'prompt', source: 'prompt', target: 'ideogram', targetHandle: 'prompt' }, { id: 'output', source: 'ideogram', sourceHandle: 'result', target: 'preview', targetHandle: 'file' }],
    colorMode: 'dark', viewport: { x: 10, y: 190, zoom: .48 },
  };
  const db = `momoflow-ideogram-edit-qa-${crypto.randomUUID()}`, storage = new WorkflowStorage(db); await storage.load();
  createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('[aria-label="Ideogram 4.5 设置"]')), 'Node and settings mount');
  check(Boolean(document.querySelector('[aria-label="分辨率"]')), 'Unconnected original keeps text-to-image settings');
  api.addEdges([{ id: 'source', source: 'source', sourceHandle: 'file', target: 'ideogram', targetHandle: 'image-0' }]); await settle();
  check(Boolean(document.querySelector('[aria-label="编辑质量"]')) && !document.querySelector('[aria-label="分辨率"]'), 'Connecting Image switches to edit settings');
  await select('编辑质量', '极低'); await select('编辑尺寸', '1536 × 1024');
  check(read().data.editQuality === 'very_low' && read().data.editSize === '1536*1024', 'Edit quality and size update independently');
  check(getComputedStyle(find('[data-id="ideogram"] .sunburst-preview')).aspectRatio === '1536 / 1024', 'Custom edit size updates preview ratio');
  find('[aria-label="将编辑精度设为输入"]').click(); await settle();
  check(api.getEdges().some(edge => edge.targetHandle === 'editPrecision'), 'Edit precision supports parameter connections');
  find('[aria-label="编辑精度使用本地值"]').click(); await settle();
  const add = [...document.querySelectorAll<HTMLButtonElement>('[data-id="ideogram"] button')].find(button => button.textContent?.includes('添加参考图输入'))!;
  add.click(); await settle();
  check(read().data.imageInputs === 2 && document.querySelector('[data-handleid="image-1"]'), 'Add reference input creates a separate port');
  api.addEdges([{ id: 'ref', source: 'reference', sourceHandle: 'file', target: 'ideogram', targetHandle: 'image-1' }]); await settle();
  const runButton = () => find('[data-id="ideogram"] .sunburst-run');
  runButton().click(); await until(() => read().data.results?.length === 1, 'Edit result appears');
  check(requests.length === 1 && requests[0].image === original && (requests[0].referenceImages as string[])[0] === original, 'Edit submits original and references once to the edit route');
  check(requests[0].editSize === '1536*1024' && !('resolution' in requests[0]) && !('enablePromptExpansion' in requests[0]), 'Edit omits generation-only parameters');
  check(document.querySelector('.task-name')?.textContent?.includes('Edit'), 'Task manager identifies editing');
  find('[aria-label="关闭任务面板"]').click(); await settle();
  api.addEdges([{ id: 'mask', source: 'mask', sourceHandle: 'file', target: 'ideogram', targetHandle: 'mask' }]); await settle();
  check(find<HTMLButtonElement>('[aria-label="编辑尺寸"]').disabled && read().data.editSize === '1536*1024', 'Mask locks source dimensions and retains saved custom size');
  await select('编辑精度', '高');
  runButton().click(); await until(() => read().data.results?.length === 2, 'Masked edit completes');
  check(requests[1].editSize === 'auto' && requests[1].editPrecision === 'high' && typeof requests[1].mask === 'string' && !('maskMode' in requests[1]), 'Mask edit uses source dimensions and strips local conversion metadata');
  const pixels = async (url: string) => {
    const bitmap = await createImageBitmap(await (await originalFetch(url)).blob());
    canvas.width = bitmap.width; canvas.height = bitmap.height; context.drawImage(bitmap, 0, 0); bitmap.close();
    return [context.getImageData(20, 20, 1, 1).data[0], context.getImageData(400, 20, 1, 1).data[0], context.getImageData(20, 20, 1, 1).data[3]];
  };
  check(JSON.stringify(await pixels(String(requests[1].mask))) === '[0,255,255]', 'Imported mask keeps black editable and white preserved as opaque PNG');
  const input = { ...defaultIdeogramEditSettings, prompt: 'test', image: original, referenceImages: [] };
  const signal = new AbortController().signal;
  const luma = await prepareIdeogramEditImages({ ...input, mask, maskMode: 'luminance' }, signal);
  check(JSON.stringify(await pixels(luma.mask!)) === '[255,0,255]', 'App luminance mask is inverted for WaveSpeed');
  const transparent = await prepareIdeogramEditImages({ ...input, mask: alpha }, signal);
  check(JSON.stringify(await pixels(transparent.mask!)) === '[0,255,255]', 'Painter-style alpha mask becomes opaque black/white');
  for (const [invalidMask, expected] of [[small, '尺寸'], [uniform, '同时包含']] as const) {
    let error = ''; try { await prepareIdeogramEditImages({ ...input, mask: invalidMask }, signal); } catch (cause) { error = (cause as Error).message; }
    check(error.includes(expected), `Invalid mask blocks submission: ${expected}`);
  }
  check(requests.length === 2, 'Mask preprocessing failures never submit generation');
  find('[aria-label="关闭任务面板"]').click(); await settle();
  api.setEdges(current => current.filter(edge => edge.id !== 'mask')); await settle();
  check(find<HTMLButtonElement>('[aria-label="编辑尺寸"]').disabled, 'High precision continues to force source dimensions without Mask');
  await select('编辑精度', '标准');
  check(!find<HTMLButtonElement>('[aria-label="编辑尺寸"]').disabled && find('[aria-label="编辑尺寸"]').textContent?.includes('1536'), 'Regular edit restores saved custom size');
  await select('编辑尺寸', '自定义');
  check(find<HTMLInputElement>('[aria-label="编辑图像宽度"]').value === '1536', 'Custom size editor retains current dimensions');
  api.setEdges(current => current.filter(edge => !['source', 'ref'].includes(edge.id))); await settle();
  check(Boolean(document.querySelector('[aria-label="分辨率"]')) && read().data.resolution === '1k', 'Disconnecting originals restores generation settings');
  api.addEdges([{ id: 'source', source: 'source', sourceHandle: 'file', target: 'ideogram', targetHandle: 'image-0' }, { id: 'mask', source: 'mask', sourceHandle: 'file', target: 'ideogram', targetHandle: 'mask' }]); await settle();
  mode = 'cancel'; runButton().click(); await until(() => requests.length === 3, 'Cancelable edit starts');
  find('[aria-label="取消任务"]').click(); await until(() => cancelled, 'Cancel aborts edit fetch');
  check(read().data.results?.length === 2, 'Cancellation preserves previous edit results');
  find('[aria-label="关闭任务面板"]').click(); await settle();
  mode = 'failure'; runButton().click(); await until(() => Boolean(document.querySelector('.task-error')?.textContent?.includes('Edit QA failure')), 'Edit failure appears');
  check(requests.length === 4 && read().data.results?.length === 2, 'Failed edit does not retry or erase output');
  find('[aria-label="关闭任务面板"]').click(); await settle();
  const saved = new WorkflowStorage(`${db}-roundtrip`); await saved.load();
  await saved.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const reload = new WorkflowStorage(`${db}-roundtrip`), restored = await reload.load();
  const restoredNode = restored?.nodes.find(node => node.id === 'ideogram') as IdeogramNode;
  check(restoredNode.data.editSize === '1536*1024' && restoredNode.data.editQuality === 'very_low' && restoredNode.data.imageInputs === 2 && restoredNode.data.results?.length === 2 && restored?.edges.some(edge => edge.targetHandle === 'mask'), 'IndexedDB restores edit settings, images and mask connections');
  reload.dispose(); saved.dispose(); mode = 'success';
  await until(() => Boolean(document.querySelector<HTMLImageElement>('.preview-image img')?.naturalWidth), 'Downstream preview loads edit output');
  check(true, 'Edited result reaches downstream Preview');

  // Use actual Painter rasterization, then inspect every pixel sent by the
  // normal run button. Responses stay mocked; no provider request is forwarded.
  const painterData: PainterNode['data'] = { ...defaultPainterData, width: 512, height: 512, locked: true, strokes: [
    { tool: 'rectangle', points: [{ x: .25, y: .25 }, { x: .75, y: .75 }], color: '#fff', opacity: 1, size: .1, hardness: 1 },
  ] };
  const rendered = renderPainter(painterData);
  const [paintResult, paintMask, paintAlpha] = await Promise.all([rendered.result, rendered.mask, rendered.alphaMask].map(async (canvas, i) => asset(`paint-${i}`, URL.createObjectURL(await painterBlob(canvas)))));
  const painter: PainterNode = { id: 'painter-regression', type: 'painter', position: { x: 60, y: 1190 }, data: {
    ...painterData, outputRevision: painterRevision(painterData),
    result: paintResult, mask: paintMask, alphaMask: paintAlpha,
  } };
  const compare: CompareNode = { id: 'compare-regression', type: 'compare', position: { x: 650, y: 1190 }, data: { ...defaultCompareData } };
  api.addNodes([painter, compare]); await settle();
  api.setEdges(current => [...current.filter(edge => edge.id !== 'mask'), { id: 'mask', source: painter.id, sourceHandle: 'mask', target: 'ideogram', targetHandle: 'mask' }]); await settle();
  const maskBytes = async (url: string) => {
    const bitmap = await createImageBitmap(await (await originalFetch(url)).blob());
    canvas.width = bitmap.width; canvas.height = bitmap.height; context.drawImage(bitmap, 0, 0); bitmap.close();
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const submitMask = async () => {
    const count = read().data.results!.length;
    runButton().click(); await until(() => read().data.results?.length === count + 1, 'Painter mask edit completes');
    const pixels = await maskBytes(String(requests.at(-1)!.mask));
    find('[aria-label="关闭任务面板"]').click(); await settle();
    return pixels;
  };
  const direct = await submitMask();
  check(direct[0] === 255 && direct[(256 * 512 + 256) * 4] === 0, 'Direct Painter Mask edits the painted center and protects the background');
  for (const port of [1, 2]) {
    api.setEdges(current => [...current.filter(edge => !['mask', 'paint-compare'].includes(edge.id)),
      { id: 'paint-compare', source: painter.id, sourceHandle: 'mask', target: compare.id, targetHandle: `input-${port}` },
      { id: 'mask', source: compare.id, sourceHandle: `output-${port}`, target: 'ideogram', targetHandle: 'mask' },
    ]); await settle();
    const compared = await submitMask();
    check(compared.length === direct.length && compared.every((value, i) => value === direct[i]), `Painter → Compare Output ${port} submits exactly the same Mask pixels as direct input`);
  }
  const cached = imageOutput(api.getNode(compare.id), 'output-2', api.getNodes(), api.getEdges())[0];
  const copyData = restoreCompareData({ ...compare.data, input2: cached });
  if (!copyData) throw new Error('Compare mask snapshot could not be restored');
  const copied: CompareNode = { ...compare, data: copyData };
  const copyStorage = new WorkflowStorage(`${db}-compare-mask`); await copyStorage.load();
  const copyWorkflow = { ...workflow, nodes: [copied], edges: [] };
  await copyStorage.save(copyWorkflow);
  const copyReload = new WorkflowStorage(`${db}-compare-mask`), restoredCopy = await copyReload.load();
  const standalone = restoredCopy!.nodes[0];
  const graph = [...api.getNodes().filter(node => node.id !== compare.id && node.id !== painter.id), standalone];
  const connections = api.getEdges().filter(edge => edge.id !== 'paint-compare');
  const prepared = prepareIdeogramRun(graph, connections, ['ideogram'], 1);
  const request = prepared.tasks[0]?.ideogramRequest;
  if (prepared.error || !request?.image) throw new Error(prepared.error ?? 'Missing restored mask request');
  const converted = await prepareIdeogramEditImages(request, signal);
  const restoredPixels = await maskBytes(converted.mask!);
  check(restoredPixels.length === direct.length && restoredPixels.every((value, i) => value === direct[i]), 'Standalone Compare snapshot retains Mask pixels after IndexedDB save and reload');
  copyReload.dispose(); copyStorage.dispose();
  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} checks · mock only\n${checks.join('\n')}`;
}
void run().catch(error => {
  const status = find('#results'); status.dataset.result = 'failed'; status.textContent = `${checks.join('\n')}\nFAIL: ${error instanceof Error ? error.message : error}`;
});
