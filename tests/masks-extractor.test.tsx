import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, type Edge } from '@xyflow/react';
import { MasksExtractorNode } from '../src/nodes/MasksExtractorNode';
import { PreviewNode } from '../src/nodes/PreviewNode';
import { FileNode } from '../src/nodes/FileNode';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { MaskInferenceContext, predictMask, type MaskPredictor } from '../src/nodes/masksInference';
import { decodeMask, encodeMask } from '../src/nodes/masksExtractor';
import { renderMasks } from '../src/nodes/masksRender';
import { imageOutput } from '../src/nodes/sunburstRun';
import { canConnect } from '../src/nodes/connectionRules';
import { assetResources } from '../src/nodes/assetResources';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import type { AppNode, FileAsset, MasksExtractorNode as MaskNode } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';

const root = createRoot(document.getElementById('root')!);
const nodeTypes = { 'masks-extractor': MasksExtractorNode, preview: PreviewNode, file: FileNode };
const initialEdges: Edge[] = [
  { id: 'input', source: 'file', sourceHandle: 'file', target: 'masks', targetHandle: 'image' },
  { id: 'cutout', source: 'masks', sourceHandle: 'result', target: 'cutout', targetHandle: 'file' },
  { id: 'mask', source: 'masks', sourceHandle: 'mask', target: 'mask', targetHandle: 'file' },
];
let nodesNow: AppNode[] = [], edgesNow: Edge[] = [];
let replaceNodes: (nodes: AppNode[]) => void, replaceEdges: (edges: Edge[]) => void;
let calls = 0, delay = 10, fail = false;
let escapeEvents = 0;
let holdPredictions = false;
const heldPredictions: { signal: AbortSignal; resolve: () => void }[] = [];
let realCalls = 0, settledRealCalls = 0;
const timedReal: MaskPredictor = async (...args) => {
  realCalls++;
  try { return await predictMask(...args); }
  finally { settledRealCalls++; }
};
const mock: MaskPredictor = async (_source, point, options) => {
  calls++; options.onProgress({ stage: 'download', progress: 52 });
  // Deliberately return even after cancellation to exercise obsolete-result guards.
  if (holdPredictions) await new Promise<void>(resolve => { heldPredictions.push({ signal: options.signal, resolve }); });
  else await new Promise(resolve => setTimeout(resolve, delay));
  if (fail) throw new Error('模拟加载失败，请重试。');
  const width = 64, height = 32, pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = Number(point.x < .5 ? x < 32 : x >= 32);
  return { width, height, pixels };
};
async function sample(width = 640, height = 320): Promise<FileAsset> {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#dc8d52'; ctx.fillRect(0, 0, width / 2, height);
  ctx.fillStyle = '#6aa4cf'; ctx.fillRect(width / 2, 0, width / 2, height);
  ctx.clearRect(0, 0, width / 10, height / 10);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
  return { id: crypto.randomUUID(), name: 'Mask test.png', kind: 'image', url: assetResources.create(blob), width, height };
}
function Harness({ source, real = false }: { source: FileAsset; real?: boolean }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([
    { id: 'file', type: 'file', position: { x: 0, y: 60 }, data: { assets: [source] } },
    { id: 'masks', type: 'masks-extractor', selected: true, position: { x: 540, y: 60 }, data: {} },
    { id: 'cutout', type: 'preview', position: { x: 1080, y: 0 }, data: { label: '透明抠图' } },
    { id: 'mask', type: 'preview', position: { x: 1080, y: 570 }, data: { label: '黑白蒙版' } },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  nodesNow = nodes; edgesNow = edges; replaceNodes = setNodes; replaceEdges = setEdges;
  const restore = useCallback((value: { nodes: AppNode[]; edges: Edge[] }) => { setNodes(value.nodes); setEdges(value.edges); }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  return <MaskInferenceContext.Provider value={real ? timedReal : mock}><CanvasHistoryContext.Provider value={history}>
    <div className="qa-toolbar"><button data-test="undo" disabled={!history.canUndo} onClick={history.undo}>Undo</button><button data-test="redo" disabled={!history.canRedo} onClick={history.redo}>Redo</button><button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); document.documentElement.classList.toggle('dark'); }}>Theme</button></div>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      colorMode={theme} defaultViewport={{ x: 35, y: 10, zoom: .7 }} minZoom={.2}
      onConnect={connection => setEdges(current => addEdge(connection, current))} isValidConnection={connection => canConnect(connection, nodes, edges)}
      onKeyDown={event => {
        if ((event.target as HTMLElement).closest('input, textarea') || event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') escapeEvents++;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo(); }
      }}><Background /><Controls /><MiniMap pannable zoomable /></ReactFlow>
    <output id="state">{JSON.stringify({ real, calls, selection: node()?.data.selection?.id, output: output()?.width, nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges: edges.map(edge => edge.id) })}</output>
  </CanvasHistoryContext.Provider></MaskInferenceContext.Provider>;
}
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 30));
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function find<T extends HTMLElement = HTMLElement>(selector: string) { const value = document.querySelector<T>(selector); assert(value, `Missing ${selector}`); return value; }
async function until(check: () => boolean, message: string) { const start = Date.now(); while (!check()) { if (Date.now() - start > 15000) throw new Error(message); await settle(); } }
const node = () => nodesNow.find(item => item.id === 'masks') as MaskNode;
const output = (handle = 'result') => imageOutput(node(), handle, nodesNow, edgesNow)[0];
const selected = () => { const selection = node().data.selection; return selection ? decodeMask(selection).pixels.reduce((sum, pixel) => sum + pixel, 0) : 0; };
function pointer(x: number, shiftKey = false, altKey = false) {
  const canvas = find<HTMLCanvasElement>('.react-flow__node-masks-extractor canvas'), rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * .5, button: 0, shiftKey, altKey }));
}
function hoverAt(x: number) {
  const canvas = find<HTMLCanvasElement>('canvas[aria-label="点击图片选择物体"]'), rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * .5 }));
}
function previewPixel(x: number) {
  const canvas = find<HTMLCanvasElement>('canvas[aria-label="点击图片选择物体"]');
  return [...canvas.getContext('2d')!.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * .5), 1, 1).data].join();
}
async function choose(x: number, shift = false, alt = false) {
  const previous = node().data.selection?.id;
  pointer(x, shift, alt);
  await until(() => node().data.selection?.id !== previous && Boolean(output()), 'Selection and exported outputs');
}
async function click(selector: string) { find(selector).click(); await settle(); }
async function pixels(handle: string) {
  const asset = output(handle); assert(asset, 'Output exists');
  const image = new Image(); image.src = asset.url; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
  return { width: image.naturalWidth, height: image.naturalHeight, sample: (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data] };
}
const reports: string[] = [], results = document.getElementById('results')!;
function pass(message: string) { reports.push(`PASS ${message}`); results.textContent = reports.join('\n'); }
async function run() {
  const source = await sample();
  root.render(<StrictMode><ReactFlowProvider><Harness source={source} /></ReactFlowProvider></StrictMode>);
  await until(() => Boolean(document.querySelector('.masks-preview canvas[aria-disabled="false"]')), 'Node image decoded'); await settle();
  assert(calls === 0, 'Empty/unselected nodes must not download the model');
  await choose(.25);
  assert(selected() === 1024, 'Left region selected');
  const cutout = await pixels('result'), bw = await pixels('mask');
  assert(cutout.width === 640 && cutout.height === 320, 'Original output dimensions');
  assert(cutout.sample(100, 100)[3] === 255 && cutout.sample(500, 100)[3] === 0 && cutout.sample(1, 1)[3] === 0, 'Cutout preserves input alpha and removes unselected area');
  assert(bw.sample(100, 100).join() === '255,255,255,255' && bw.sample(500, 100).join() === '0,0,0,255', 'Mask is opaque black/white');
  pass('Lazy inference, point selection at 70% zoom, actual PNG dimensions, source alpha and black/white mask');
  delay = 150;
  const beforeHover = calls, hoverCanvas = find('canvas[aria-label="点击图片选择物体"]'), hoverRect = hoverCanvas.getBoundingClientRect();
  hoverCanvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: hoverRect.left + hoverRect.width * .75, clientY: hoverRect.top + hoverRect.height * .5 }));
  await until(() => calls > beforeHover, 'Hover inference started');
  await choose(.75, true);
  assert(calls === beforeHover + 1 && selected() === 2048, 'Click adopts in-flight hover and unions the result exactly once');
  delay = 10; await choose(.25);
  pass('Click adopts in-flight hover without repeating inference or losing the selection');
  holdPredictions = true;
  const beforeMoving = calls, committedSelection = node().data.selection?.id, committedOutput = output()?.id;
  const leftPixel = previewPixel(.25), rightPixel = previewPixel(.75);
  hoverAt(.3); await until(() => heldPredictions.length === 1, 'A hover started');
  hoverAt(.75);
  await new Promise(resolve => setTimeout(resolve, 220));
  assert(heldPredictions.length === 2, 'Latest B hover starts even while A is pending');
  heldPredictions[1].resolve();
  await until(() => previewPixel(.75) !== rightPixel, 'B preview becomes visible without another pointer move');
  assert(previewPixel(.25) === leftPixel, 'A is not shown under the B pointer');
  heldPredictions[0].resolve(); await settle();
  assert(previewPixel(.25) === leftPixel && previewPixel(.75) !== rightPixel, 'Late A cannot overwrite B');
  assert(node().data.selection?.id === committedSelection && output()?.id === committedOutput, 'Hover does not change committed selection or output');
  await choose(.75, true);
  assert(calls === beforeMoving + 2 && selected() === 2048, 'Click selects the visible B preview without repeated inference');
  holdPredictions = false; await choose(.25);
  pass('A-to-B hover keeps the latest position, rejects late A and reuses B on click');
  holdPredictions = true;
  hoverAt(.35); await until(() => heldPredictions.length === 3, 'Debounce test A started');
  hoverAt(.8); heldPredictions[2].resolve(); await settle();
  assert(previewPixel(.25) === leftPixel && previewPixel(.75) === rightPixel, 'A result is hidden as soon as the pointer moves, before B starts');
  await until(() => heldPredictions.length === 4, 'Debounced B starts');
  heldPredictions[3].resolve();
  await until(() => previewPixel(.75) !== rightPixel, 'Debounced B preview shown');
  hoverAt(.9); await settle();
  assert(previewPixel(.75) === rightPixel, 'Moving clears an already visible old preview immediately');
  const hoverTarget = find('canvas[aria-label="点击图片选择物体"]');
  hoverTarget.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
  await settle();
  pass('Pointer movement invalidates results during debounce and clears the previous overlay');
  hoverAt(.7); await until(() => heldPredictions.length === 5, 'Leave test hover started');
  hoverTarget.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
  heldPredictions[4].resolve(); await settle();
  assert(previewPixel(.25) === leftPixel && previewPixel(.75) === rightPixel, 'Leaving the image suppresses late previews');
  const selectionBeforeClick = node().data.selection?.id;
  pointer(.65, true); await until(() => heldPredictions.length === 6, 'Selection request started');
  hoverAt(.2);
  hoverTarget.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
  assert(!heldPredictions[5].signal.aborted, 'Pointer movement and leave do not cancel an explicit selection');
  heldPredictions[5].resolve();
  await until(() => node().data.selection?.id !== selectionBeforeClick && Boolean(output()), 'Selection completes after pointer leaves');
  holdPredictions = false; await choose(.25);
  pass('Leaving cancels preview updates while explicit selections still finish');
  await choose(.75, true); assert(selected() === 2048, 'Shift unions independent objects');
  await choose(.25, true, true); assert(selected() === 1024, 'Alt+Shift subtracts region');
  await click('[data-test="undo"]'); assert(selected() === 2048, 'One undo restores union');
  await click('[data-test="undo"]'); assert(selected() === 1024, 'One undo per click, no derived-output history');
  await click('[data-test="redo"]'); assert(selected() === 2048, 'Redo restores selection');
  await click('.masks-display button:last-child');
  const toggle = find('.masks-display button:last-child');
  toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await settle();
  assert(selected() === 1024, 'Undo propagates from node controls');
  pass('Add/subtract independent objects, Image/Mask switch, undo/redo from controls');
  const beforeSave = calls, databaseName = `masks-test-${crypto.randomUUID()}`, storage = new WorkflowStorage(databaseName);
  try {
    await until(() => Boolean(output('mask')), 'Output before save');
    await storage.save({ nodes: nodesNow, edges: edgesNow, viewport: { x: 35, y: 10, zoom: .7 }, colorMode: 'dark' });
    const saved = await storage.load(); assert(saved, 'Stored workflow');
    replaceNodes(saved.nodes); replaceEdges(saved.edges); await settle();
    assert(output('mask') && selected() === 1024 && calls === beforeSave, 'Restoration does not call model');
  } finally { storage.dispose(); indexedDB.deleteDatabase(databaseName); }
  pass('IndexedDB restores selection and both PNGs without another inference');
  replaceNodes(nodesNow.map(item => item.id === 'masks' ? { ...node(), data: { ...node().data, locked: true } } : item)); await settle();
  const beforeLock = calls; pointer(.75); await settle(); assert(calls === beforeLock, 'Locked node cannot infer');
  assert(find<HTMLButtonElement>('[aria-label="清空选区"]').disabled, 'Locked reset disabled');
  replaceNodes(nodesNow.map(item => item.id === 'masks' ? { ...node(), data: { ...node().data, locked: false } } : item)); await settle();
  replaceEdges(edgesNow.filter(edge => edge.id !== 'input')); await settle();
  assert(!output() && !output('mask'), 'Disconnected outputs hidden');
  replaceEdges(initialEdges); await settle();
  pass('Lock prevents changes; disconnect invalidates both outputs; reconnection restores selection');
  delay = 300; pointer(.75); await settle();
  const replacement = await sample(3840, 2160);
  replaceNodes(nodesNow.map(item => item.id === 'file' ? { ...item, data: { assets: [replacement] } } as AppNode : item));
  await new Promise(resolve => setTimeout(resolve, 450));
  assert(!output() && node().data.selection?.inputId !== replacement.id, 'Late response cannot select the replacement image');
  delay = 10; await choose(.25); const large = await pixels('result');
  assert(large.width === 3840 && large.height === 2160, 'Full-resolution 4K PNG');
  pass('Input replacement rejects obsolete inference; 4K export keeps original dimensions');
  delay = 250; pointer(.75); await settle(); await click('.masks-progress button');
  const cancelledSelection = node().data.selection?.id;
  await new Promise(resolve => setTimeout(resolve, 300));
  assert(node().data.selection?.id === cancelledSelection, 'Cancelled result must not commit');
  delay = 10; fail = true; pointer(.75);
  await until(() => Boolean(document.querySelector('.masks-error')), 'Failed download shown');
  fail = false; await choose(.75);
  assert(!document.querySelector('.masks-error'), 'Retry clears error');
  pass('Cancel, error and retry preserve the committed selection');
  await click('[aria-label="清空选区"]'); assert(!node().data.selection && !output(), 'Clear invalidates selection and outputs');
  await click('[data-test="undo"]'); await until(() => Boolean(output()), 'Undo clear restores output');
  await choose(.25, true);
  holdPredictions = true;
  for (const focusTarget of ['canvas', '.masks-modes button', '.masks-display button']) {
    const beforeEscape = { selection: node().data.selection?.id, result: output()?.id, mask: output('mask')?.id };
    const pendingIndex = heldPredictions.length;
    const recalculate = find<HTMLButtonElement>('.masks-recalculate');
    recalculate.focus(); recalculate.click();
    await until(() => heldPredictions.length > pendingIndex && Boolean(document.querySelector('.masks-progress')), 'Recalculation pending');
    assert(document.activeElement === find('.masks-preview canvas'), 'Recalculate moves focus to the canvas before disabling its button');
    const target = find<HTMLElement>(`.react-flow__node[data-id="masks"] ${focusTarget}`);
    target.focus();
    const escapedBefore = escapeEvents;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    assert(heldPredictions[pendingIndex].signal.aborted, `Escape from ${focusTarget} aborts recalculation`);
    assert(escapeEvents === escapedBefore && !document.querySelector('.masks-progress') && !recalculate.disabled, 'Escape stops at the node, clears progress and enables retry');
    heldPredictions[pendingIndex].resolve(); await settle();
    assert(node().data.selection?.id === beforeEscape.selection && output()?.id === beforeEscape.result && output('mask')?.id === beforeEscape.mask, 'Late recalculation cannot change the committed selection or outputs');
  }
  holdPredictions = false;
  pass('Escape cancels recalculation from the canvas or controls, preserves outputs and suppresses late results');
  const beforeRecalculate = node().data.selection?.id;
  await click('.masks-recalculate');
  await until(() => node().data.selection?.id !== beforeRecalculate && Boolean(output()), 'Recalculated selection');
  assert(selected() === 2048 && node().data.selection?.operation === 'add', 'Recalculation preserves the union and last operation');
  pass('Recalculate retains both selected objects and the previous add operation');
  await click('.react-flow__node-masks-extractor [aria-label="更多选项"]');
  const duplicate = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.includes('创建副本'))!;
  duplicate.click(); await settle();
  const copy = nodesNow.find(item => item.type === 'masks-extractor' && item.id !== 'masks') as MaskNode;
  assert(copy?.data.baseImage?.id === replacement.id && imageOutput(copy, 'mask', nodesNow, edgesNow).length, 'Standalone copy retains input and selection');
  pass('Clear/undo and standalone duplicate preserve image and mask data');
  for (const [width, height] of [[896, 1200], [1200, 896], [512, 512], [100, 1000], [1000, 100]]) {
    const asset = await sample(width, height);
    replaceNodes(nodesNow.map(item => item.id === 'file' ? { ...item, data: { assets: [asset] } } as AppNode : item));
    await settle();
    await until(() => find('.react-flow__node[data-id="masks"] canvas').getAttribute('aria-disabled') === 'false', 'Replacement image decoded');
    const preview = find('.react-flow__node[data-id="masks"] .masks-preview').getBoundingClientRect();
    const canvas = find('.react-flow__node[data-id="masks"] canvas').getBoundingClientRect();
    assert(Math.abs(preview.height - preview.width * height / width) < .75, `${width}x${height} preview keeps the source aspect ratio`);
    assert(Math.abs(canvas.height - preview.height) < .75 && Math.abs(canvas.width - preview.width) < .75, 'Click surface fills the undistorted preview');
    await choose(.25);
    assert(selected() === 1024 && output()?.width === width && output()?.height === height, 'Point selection and export keep original image coordinates and dimensions');
  }
  pass('Portrait, landscape, square and thin images retain their preview ratios, point coordinates and export dimensions');
  results.dataset.result = 'passed'; results.textContent = `PASS (${reports.length})\n${reports.join('\n')}\n真实模型验证需点击下方按钮；本轮检查未下载模型。`;
  find<HTMLButtonElement>('#real').disabled = false;
}
document.getElementById('real')!.addEventListener('click', () => {
  const source: FileAsset = { id: 'corgi-demo-v1', name: 'Corgi.jpg', kind: 'image', width: 614, height: 410,
    url: 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/corgi.jpg' };
  root.render(<StrictMode><ReactFlowProvider key="real"><Harness source={source} real /></ReactFlowProvider></StrictMode>);
  results.textContent = '真实 SlimSAM / WebGPU 验证：点击狗的身体生成蒙版。此页使用独立画布，不读取用户工作流。';
  find<HTMLButtonElement>('#benchmark').disabled = false;
});
document.getElementById('benchmark')!.addEventListener('click', () => {
  const button = find<HTMLButtonElement>('#benchmark'), status = find('#benchmark-result');
  button.disabled = true;
  void (async () => {
    status.textContent = '正在预热模型…';
    await until(() => find('.masks-preview canvas').getAttribute('aria-disabled') === 'false', 'Source decoded');
    await choose(.55);
    const samples: { clickMs: number; modelCalls: number; maskHash: string }[] = [];
    for (const x of [.6, .65, .7]) {
      status.textContent = `测量 ${samples.length + 1}/3…`;
      const before = realCalls, canvas = find('canvas[aria-label="点击图片选择物体"]'), rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * .5 }));
      await until(() => realCalls > before && settledRealCalls === realCalls, 'Hover completed');
      await settle();
      const started = performance.now();
      await choose(x, true);
      const clickMs = Math.round(performance.now() - started);
      const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(decodeMask(node().data.selection!).pixels));
      samples.push({ clickMs, modelCalls: realCalls - before, maskHash: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) });
    }
    const large = await sample(3840, 2160), image = new Image(); image.src = large.url; await image.decode();
    const mask = encodeMask({ width: 1024, height: 576, pixels: Uint8Array.from({ length: 1024 * 576 }, (_, i) => Number(i % 1024 < 512)) }, large.id, 'performance');
    let lastFrame = performance.now(), maxFrameMs = 0, frame = 0;
    const tick = (now: number) => { maxFrameMs = Math.max(maxFrameMs, now - lastFrame); lastFrame = now; frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    await new Promise(requestAnimationFrame);
    const started = performance.now(); await renderMasks(image, mask);
    const exportMs = Math.round(performance.now() - started);
    await new Promise(requestAnimationFrame); cancelAnimationFrame(frame);
    status.textContent = JSON.stringify({ samples, export4k: { exportMs, maxFrameMs: Math.round(maxFrameMs) } });
  })().catch(error => { status.textContent = String(error); }).finally(() => { button.disabled = false; });
});
document.getElementById('cache')!.addEventListener('click', () => {
  void (async () => {
    const status = document.getElementById('cache-result')!;
    if (!(await caches.keys()).includes('transformers-cache')) { status.textContent = '尚未下载模型'; return; }
    const cache = await caches.open('transformers-cache');
    const files = (await cache.keys()).filter(request => request.url.includes('/Xenova/slimsam-77-uniform/'));
    const weights = files.filter(request => request.url.endsWith('.onnx'));
    let bytes = 0;
    for (const request of weights) bytes += (await (await cache.match(request))!.arrayBuffer()).byteLength;
    status.textContent = `${location.origin} / transformers-cache：${weights.length} 个权重文件，${(bytes / 1_000_000).toFixed(2)} MB；${files.length - weights.length} 个配置文件`;
  })().catch(error => { document.getElementById('cache-result')!.textContent = String(error); });
});
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${error instanceof Error ? error.stack : error}`; });
