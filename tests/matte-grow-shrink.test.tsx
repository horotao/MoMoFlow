import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, type Edge } from '@xyflow/react';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { MatteGrowShrinkNode } from '../src/nodes/MatteGrowShrinkNode';
import { PreviewNode } from '../src/nodes/PreviewNode';
import { FileNode } from '../src/nodes/FileNode';
import { canConnect, withoutReplacedInput } from '../src/nodes/connectionRules';
import { imageOutput, prepareSunburstRun } from '../src/nodes/sunburstRun';
import { requestSunburst } from '../src/nodes/sunburstClient';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import { assetResources } from '../src/nodes/assetResources';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import { outputColor, outputKind } from '../src/nodes/router';
import type { AppNode, MatteGrowShrinkNode as Matte, FileAsset } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/ColorCorrectionNode.css';
import '../src/nodes/MatteGrowShrinkNode.css';

// Isolated graph and database: never reads or writes the user's workflow.
const nodeTypes = { 'matte-grow-shrink': MatteGrowShrinkNode, preview: PreviewNode, file: FileNode };
const initialEdges: Edge[] = [
  { id: 'input', source: 'file', sourceHandle: 'file', target: 'matte', targetHandle: 'image' },
  { id: 'output', source: 'matte', sourceHandle: 'result', target: 'preview', targetHandle: 'file' },
];
let nodesNow: AppNode[] = [], edgesNow: Edge[] = [];
let replaceNodes: (nodes: AppNode[]) => void, replaceEdges: (edges: Edge[]) => void;
async function sample(width: number, height: number): Promise<FileAsset> {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#000'; context.fillRect(0, 0, width, height);
  context.fillStyle = '#fff'; context.fillRect(width / 4, height / 4, width / 2, height / 2);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
  return { id: crypto.randomUUID(), name: 'Mask.png', kind: 'image', url: assetResources.create(blob), width, height, size: blob.size };
}
function Harness({ source }: { source: FileAsset }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([
    { id: 'file', type: 'file', position: { x: 10, y: 20 }, data: { assets: [source] } },
    { id: 'matte', type: 'matte-grow-shrink', selected: true, position: { x: 565, y: 20 }, data: { settings: { size: 0 } } },
    { id: 'preview', type: 'preview', position: { x: 1120, y: 20 }, data: {} },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [colorMode, setColorMode] = useState<'dark' | 'light'>('dark');
  nodesNow = nodes; edgesNow = edges; replaceNodes = setNodes; replaceEdges = setEdges;
  const restore = useCallback((value: { nodes: AppNode[]; edges: Edge[] }) => { setNodes(value.nodes); setEdges(value.edges); }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  const output = imageOutput(nodes.find(node => node.id === 'matte'), 'result', nodes, edges)[0];
  return <CanvasHistoryContext.Provider value={history}>
    <div className="qa-toolbar"><button data-test="undo" disabled={!history.canUndo} onClick={history.undo}>Undo</button><button data-test="redo" disabled={!history.canRedo} onClick={history.redo}>Redo</button><button onClick={() => { setColorMode(colorMode === 'dark' ? 'light' : 'dark'); document.documentElement.classList.toggle('dark'); }}>Theme</button><button onClick={() => setEdges(current => current.filter(edge => edge.id !== 'output'))}>Disconnect preview</button></div>
    <ReactFlow nodes={nodes} edges={edges.map(edge => ({ ...edge, style: { stroke: edge.target === 'matte' ? 'var(--sunburst-mask-port)' : outputColor(outputKind(nodes.find(node => node.id === edge.source), edge.sourceHandle)) } }))} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} colorMode={colorMode}
      defaultViewport={{ x: 20, y: 15, zoom: .55 }} minZoom={.2} onConnect={connection => setEdges(current => addEdge(connection, withoutReplacedInput(connection, nodes, current)))}
      isValidConnection={connection => canConnect(connection, nodes, edges)}
      onKeyDown={event => {
        if ((event.target as HTMLElement).closest('input, textarea') || event.nativeEvent.isComposing) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo(); }
      }}><Background /><Controls /><MiniMap pannable zoomable /></ReactFlow>
    <output id="state">{JSON.stringify({ output: output && [output.width, output.height], size: (nodes.find(node => node.id === 'matte') as Matte | undefined)?.data.settings, nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges: edges.length })}</output>
  </CanvasHistoryContext.Provider>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const find = <T extends HTMLElement = HTMLElement>(selector: string) => { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element; };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const node = () => nodesNow.find(node => node.id === 'matte') as Matte;
const output = () => imageOutput(node(), 'result', nodesNow, edgesNow)[0];
const field = () => find<HTMLInputElement>('.react-flow__node-matte-grow-shrink input[type="number"]');
const slider = () => find<HTMLInputElement>('.react-flow__node-matte-grow-shrink input[type="range"]');
async function until(check: () => boolean, message: string) { const start = performance.now(); while (performance.now() - start < 20000) { if (check()) return; await settle(); } throw new Error(message); }
async function verify(size: number, width = 640, height = 480) {
  await until(() => !!output() && node().data.settings.size === size && output().width === width, `Output size ${size}, ${width} px`);
  const img = new Image(); img.src = output().url; await img.decode();
  assert(img.naturalWidth === width && img.naturalHeight === height, 'Native PNG dimensions');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!; context.drawImage(img, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] === 255) count++; assert(pixels[i + 3] === 255, 'Opaque mask'); }
  assert(count === (width / 2 + 2 * size) * (height / 2 + 2 * size), `Correct white area: ${count}`);
  await until(() => document.querySelector<HTMLImageElement>('.react-flow__node-preview img')?.src === output().url, 'Preview uses final PNG');
}
function key(element: HTMLElement, value: string, options: KeyboardEventInit = {}) { element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options })); }
async function edit(text: string, end: string | null = 'Enter') {
  const input = field(); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true })); await settle(); if (end) key(input, end); await settle();
}
async function startDrag() {
  const input = slider();
  // Synthetic pointer events cannot capture a native pointer. Only stub capture;
  // the node's focus, blur, input, cancellation and history handlers run normally.
  input.setPointerCapture = () => {};
  try { input.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true })); }
  finally { Reflect.deleteProperty(input, 'setPointerCapture'); }
  await settle();
}
async function moveSlider(value: number) {
  const input = slider(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true })); await settle();
}
async function endDrag() { slider().dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })); await settle(); }
async function verifyCompareMask() {
  const compare: AppNode = { id: 'compare', type: 'compare', position: { x: 0, y: 0 }, data: { mode: 'slider', split: .5 } };
  const generator: AppNode = { id: 'generator', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const prompt: AppNode = { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: 'Offline mask check' } };
  const graph = [...nodesNow, compare, generator, prompt];
  const originalFetch = window.fetch;
  let requests = 0;
  window.fetch = async (url, options) => {
    if (url !== '/api/sunburst') return originalFetch(url, options);
    requests++;
    const payload = JSON.parse(String(options?.body)) as { mask: string; maskMode?: string };
    assert(payload.maskMode === undefined, 'Mask metadata stays local');
    const blob = await (await originalFetch(payload.mask)).blob();
    const bitmap = await createImageBitmap(blob);
    try {
      assert(bitmap.width === 640 && bitmap.height === 480, 'Converted mask keeps native dimensions');
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let editable = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) editable++;
      const size = node().data.settings.size;
      assert(editable === (320 + 2 * size) * (240 + 2 * size), 'Compare mask has the exact editable area');
    } finally { bitmap.close(); }
    return Response.json({ error: 'Offline mask verified' }, { status: 400 });
  };
  try {
    for (const port of [1, 2]) {
      const edges = [...edgesNow,
        { id: 'compare-in', source: 'matte', sourceHandle: 'result', target: 'compare', targetHandle: `input-${port}` },
        { id: 'mask', source: 'compare', sourceHandle: `output-${port}`, target: 'generator', targetHandle: 'mask' },
        { id: 'image', source: 'file', sourceHandle: 'file', target: 'generator', targetHandle: 'image-0' },
        { id: 'prompt', source: 'prompt', target: 'generator', targetHandle: 'prompt' },
      ];
      const run = prepareSunburstRun(graph, edges, ['generator'], 1);
      assert(!run.error && run.tasks[0].imageRequest?.maskMode === 'luminance', 'Compare preserves matte semantics');
      let error: unknown;
      try { await requestSunburst(run.tasks[0].imageRequest!, new AbortController().signal); } catch (caught) { error = caught; }
      assert(error instanceof Error && error.message === 'Offline mask verified', 'Converted mask reaches mocked API boundary');
    }
    assert(requests === 2, 'Both Compare output branches verified without model calls');
  } finally { window.fetch = originalFetch; }
}
async function click(selector: string) { find(selector).click(); await settle(); }
const results = document.getElementById('results')!, reports: string[] = [];
function pass(message: string) { reports.push(`PASS ${message}`); results.textContent = reports.join('\n'); }
async function run() {
  const source = await sample(640, 480);
  createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Harness source={source} /></ReactFlowProvider>);
  await verify(0); await edit('20'); await verify(20); await edit('-20'); await verify(-20);
  await click('[data-test="undo"]'); await verify(20); await click('[data-test="redo"]'); await verify(-20);
  pass('Growth / shrink / zero, exact PNG area, Preview and one-step undo / redo');
  await edit('80', 'Escape'); assert(field().value === '-20', 'Escape cancels draft');
  await edit(''); assert(field().value === '-20', 'Empty draft resets');
  await edit('999'); await verify(100); await edit('-999'); await verify(-100);
  await edit('12.5'); await verify(13);
  pass('Numeric cancellation, bounds and integer rounding');
  await edit('25', null); await startDrag();
  assert(node().data.settings.size === 25, 'Number blur commits before the drag');
  await moveSlider(-35);
  assert(node().data.settings.size === 25 && field().value === '-35', 'First drag remains live without committing intermediate values');
  await until(() => !!document.querySelector('[aria-label="Live Matte Grow / Shrink preview"]'), 'Live downstream draft');
  await endDrag(); await verify(-35);
  for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
    slider().focus(); key(slider(), 'z', modifier); await settle(); await verify(25);
    key(slider(), 'z', { ...modifier, shiftKey: true }); await settle(); await verify(-35);
  }
  key(slider(), 'z', { metaKey: true }); await settle(); await verify(25);
  key(slider(), 'z', { metaKey: true }); await settle(); await verify(13);
  pass('Number-to-slider handoff, live draft, one-step Cmd/Ctrl undo and redo');
  await startDrag(); await moveSlider(50); key(slider(), 'Escape'); await endDrag(); await verify(13);
  await startDrag(); await moveSlider(-50); window.dispatchEvent(new Event('blur')); await endDrag(); await verify(13);
  await startDrag(); await moveSlider(60);
  replaceNodes(nodesNow.map(item => item.id === 'matte' ? { ...node(), data: { ...node().data, locked: true } } : item)); await settle();
  await endDrag();
  assert(node().data.settings.size === 13 && slider().disabled, 'Lock cancels a pending drag');
  replaceNodes(nodesNow.map(item => item.id === 'matte' ? { ...node(), data: { ...node().data, locked: false } } : item)); await settle(); await verify(13);
  pass('Escape, window blur and locking cancel pending drags');
  await click('.react-flow__node-matte-grow-shrink [aria-label="更多选项"]');
  const duplicate = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.includes('创建副本'))!;
  duplicate.click(); await settle();
  const copy = nodesNow.find(item => item.id !== 'matte' && item.type === 'matte-grow-shrink') as Matte;
  assert(copy?.data.baseImage?.id === source.id, 'Independent copy retains original mask');
  await until(() => !!imageOutput(copy, 'result', nodesNow, edgesNow)[0], 'Copy produces output');
  replaceNodes(nodesNow.filter(item => item.id !== copy.id)); await settle();
  replaceNodes(nodesNow.map(item => item.id === 'matte' ? { ...node(), data: { ...node().data, locked: true } } : item)); await settle();
  assert(field().disabled && find<HTMLInputElement>('.react-flow__node-matte-grow-shrink input[type="range"]').disabled, 'Locked controls');
  replaceNodes(nodesNow.map(item => item.id === 'matte' ? { ...node(), data: { ...node().data, locked: false } } : item)); await settle();
  pass('Independent duplicate and locked controls');
  const databaseName = `momoflow-matte-test-${crypto.randomUUID()}`, storage = new WorkflowStorage(databaseName);
  try {
    await storage.save({ nodes: nodesNow, edges: edgesNow, colorMode: 'dark', viewport: { x: 0, y: 0, zoom: .55 } });
    const saved = await storage.load(); assert(saved, 'Saved workflow'); replaceNodes(saved.nodes); replaceEdges(saved.edges); await settle(); await verify(13);
  } finally { storage.dispose(); indexedDB.deleteDatabase(databaseName); }
  pass('IndexedDB round trip restores settings, graph and PNG assets');
  replaceEdges(edgesNow.filter(edge => edge.id !== 'input')); await settle();
  assert(!output(), 'Disconnected output invalidates');
  assert(!document.querySelector('.react-flow__node-matte-grow-shrink canvas'), 'Disconnected preview clears');
  replaceEdges(initialEdges); await settle(); await verify(13);
  const large = await sample(3840, 2160);
  replaceNodes(nodesNow.map(item => item.id === 'file' ? { ...item, data: { assets: [large] } } as AppNode : item)); await settle();
  await verify(13, 3840, 2160); await edit('100'); await edit('-100'); await verify(-100, 3840, 2160);
  await edit('0'); await verify(0, 3840, 2160);
  pass('Disconnect / reconnect, input replacement, 4K output and rapid opposite edits');
  replaceNodes(nodesNow.map(item => item.id === 'file' ? { ...item, data: { assets: [source] } } as AppNode : item)); await settle(); await edit('20'); await verify(20);
  await verifyCompareMask(); pass('Both Compare branches deliver correct alpha masks to the mocked Sunburst boundary');
  results.dataset.result = 'passed';
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent = [...reports, `FAIL ${error instanceof Error ? error.stack : error}`].join('\n'); });
