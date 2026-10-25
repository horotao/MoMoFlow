import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, type Edge } from '@xyflow/react';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { ResizeNode } from '../src/nodes/ResizeNode';
import { PreviewNode } from '../src/nodes/PreviewNode';
import { FileNode } from '../src/nodes/FileNode';
import { canConnect } from '../src/nodes/connectionRules';
import { imageOutput } from '../src/nodes/sunburstRun';
import { assetResources } from '../src/nodes/assetResources';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import type { AppNode, ResizeNode as Resize, FileAsset } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/ResizeNode.css';

// An isolated graph and database: this page never opens the user's workflow.
const nodeTypes = { resize: ResizeNode, preview: PreviewNode, file: FileNode };
const initialEdges: Edge[] = [
  { id: 'input', source: 'file', sourceHandle: 'file', target: 'resize', targetHandle: 'image' },
  { id: 'output', source: 'resize', sourceHandle: 'result', target: 'preview', targetHandle: 'file' },
];
let nodesNow: AppNode[] = [], edgesNow: Edge[] = [];
let replaceNodes: (nodes: AppNode[]) => void, replaceEdges: (edges: Edge[]) => void;
async function sample(width: number, height: number): Promise<FileAsset> {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const sky = context.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, '#1883c2'); sky.addColorStop(1, '#9dd7e7');
  context.fillStyle = sky; context.fillRect(0, 0, width, height);
  context.fillStyle = '#faf1dc'; context.beginPath(); context.ellipse(width * .5, height * .4, width * .24, height * .18, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#d53c47'; context.beginPath(); context.ellipse(width * .5, height * .4, width * .09, height * .18, 0, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#333'; context.lineWidth = width / 200;
  context.beginPath(); context.moveTo(width * .4, height * .56); context.lineTo(width * .45, height * .64); context.lineTo(width * .55, height * .64); context.lineTo(width * .6, height * .56); context.stroke();
  context.fillStyle = '#8e543c'; context.fillRect(width * .44, height * .63, width * .12, height * .05);
  context.clearRect(0, 0, width * .08, height * .08);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
  return { id: crypto.randomUUID(), name: 'Resize test image.png', kind: 'image', url: assetResources.create(blob), width, height, size: blob.size };
}
function Harness({ source }: { source: FileAsset }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([
    { id: 'file', type: 'file', position: { x: 20, y: 40 }, data: { assets: [source] } },
    { id: 'resize', type: 'resize', selected: true, position: { x: 600, y: 40 }, data: { settings: { lockAspectRatio: true } } },
    { id: 'preview', type: 'preview', position: { x: 1180, y: 40 }, data: {} },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [colorMode, setColorMode] = useState<'dark' | 'light'>('dark');
  nodesNow = nodes; edgesNow = edges; replaceNodes = setNodes; replaceEdges = setEdges;
  const restore = useCallback((value: { nodes: AppNode[]; edges: Edge[] }) => { setNodes(value.nodes); setEdges(value.edges); }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  const output = imageOutput(nodes.find(node => node.id === 'resize'), 'result', nodes, edges)[0];
  return <CanvasHistoryContext.Provider value={history}>
    <div className="qa-toolbar"><button data-test="undo" disabled={!history.canUndo} onClick={history.undo}>Undo</button><button data-test="redo" disabled={!history.canRedo} onClick={history.redo}>Redo</button><button onClick={() => { setColorMode(colorMode === 'dark' ? 'light' : 'dark'); document.documentElement.classList.toggle('dark'); }}>Theme</button></div>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} colorMode={colorMode}
      defaultViewport={{ x: 25, y: 10, zoom: .58 }} minZoom={.2} onConnect={connection => setEdges(current => addEdge(connection, current))}
      isValidConnection={connection => canConnect(connection, nodes, edges)}
      onKeyDown={event => {
        if ((event.target as HTMLElement).closest('input, textarea') || event.nativeEvent.isComposing) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo(); }
      }}><Background /><Controls /><MiniMap pannable zoomable /></ReactFlow>
    <output id="state">{JSON.stringify({ output: output && [output.width, output.height], nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges: edges.length })}</output>
  </CanvasHistoryContext.Provider>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const find = <T extends HTMLElement = HTMLElement>(selector: string) => { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element; };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const node = () => nodesNow.find(node => node.id === 'resize') as Resize;
const output = () => imageOutput(node(), 'result', nodesNow, edgesNow)[0];
const field = (axis: string) => find<HTMLInputElement>(`.react-flow__node-resize input[aria-label="${axis}"]`);
async function until(check: () => boolean, message: string) { for (let i = 0; i < 180; i++) { if (check()) return; await settle(); } throw new Error(message); }
async function size(width: number, height: number, checkTransparency = true) {
  await until(() => output()?.width === width && output()?.height === height, `Expected output ${width} × ${height}`);
  const img = new Image(); img.src = output().url; await img.decode();
  assert(img.naturalWidth === width && img.naturalHeight === height, 'PNG dimensions must match output');
  await until(() => { const preview = document.querySelector<HTMLImageElement>('.react-flow__node-preview img'); return !!preview?.complete && preview.naturalWidth === width && preview.naturalHeight === height; }, 'Downstream Preview must display the same PNG');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d')!; context.drawImage(img, 0, 0);
  if (checkTransparency) assert(context.getImageData(0, 0, 1, 1).data[3] === 0, 'Transparent corner must survive resizing');
}
function fullPreview(width: number, height: number) {
  const preview = find<HTMLCanvasElement>('.react-flow__node-resize canvas');
  const box = getComputedStyle(preview.parentElement!);
  const boxWidth = parseFloat(box.width), boxHeight = parseFloat(box.height);
  assert(Math.abs(boxHeight - boxWidth * height / width) < .1, 'Preview container must preserve the output ratio without a height cap');
  const style = getComputedStyle(preview);
  const canvasWidth = parseFloat(style.width), canvasHeight = parseFloat(style.height);
  let paintedWidth = canvasWidth, paintedHeight = canvasHeight;
  if (style.objectFit !== 'fill') {
    const fit = style.objectFit === 'cover' ? Math.max : Math.min;
    const scale = style.objectFit === 'none' ? 1 : fit(canvasWidth / preview.width, canvasHeight / preview.height);
    paintedWidth = preview.width * scale; paintedHeight = preview.height * scale;
  }
  assert(Math.abs(paintedWidth - boxWidth) < .1 && Math.abs(paintedHeight - boxHeight) < .1,
    `Preview must fill the container without gaps or clipping: painted ${paintedWidth} × ${paintedHeight}, box ${boxWidth} × ${boxHeight}`);
}
async function roundTrip() {
  const databaseName = `momoflow-resize-test-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(databaseName);
  try {
    await storage.save({ nodes: nodesNow, edges: edgesNow, colorMode: 'dark', viewport: { x: 0, y: 0, zoom: .58 } });
    const saved = await storage.load(); assert(saved, 'Saved workflow');
    replaceNodes(saved.nodes); replaceEdges(saved.edges); await settle();
  } finally { storage.dispose(); indexedDB.deleteDatabase(databaseName); }
}
function key(element: HTMLElement, value: string, options: KeyboardEventInit = {}) { element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options })); }
async function edit(axis: string, text: string, end = 'Enter') {
  // Restored result PNGs may be available before the input image finishes decoding.
  await until(() => !field(axis).disabled, `${axis} input must be ready before editing`);
  const input = field(axis); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); await settle(); key(input, end); await settle();
}
async function click(selector: string) { find(selector).click(); await settle(); }
const lock = '.react-flow__node-resize [role="checkbox"]';
const reset = '.resize-reset';
const results = document.getElementById('results')!;
const reports: string[] = [];
function pass(message: string) { reports.push(`PASS ${message}`); results.textContent = reports.join('\n'); }
async function run() {
  const source = await sample(768, 1376);
  createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Harness source={source} /></ReactFlowProvider>);
  await until(() => !!output(), 'Initial PNG'); await size(768, 1376);
  await edit('Width', '384'); await size(384, 688);
  await edit('Height', '1032'); await size(576, 1032);
  await click('[data-test="undo"]'); await size(384, 688);
  await click('[data-test="redo"]'); await size(576, 1032);
  pass('Locked width/height, actual PNG dimensions, transparency, downstream Preview, one-step undo/redo');
  await click(reset); await size(768, 1376);
  await click(lock); await edit('Width', '500'); await size(500, 1376);
  await edit('Height', '688'); await size(500, 688);
  await click(lock); await edit('Width', '250'); await size(250, 344);
  await click(reset); await size(768, 1376);
  key(find(reset), 'z', { ctrlKey: true }); await settle(); await size(250, 344);
  key(find(reset), 'z', { ctrlKey: true, shiftKey: true }); await settle(); await size(768, 1376);
  pass('Custom dimensions, relocking current ratio, Reset and keyboard undo/redo from controls');
  await edit('Width', '999', 'Escape'); await size(768, 1376);
  assert(field('Width').value === '768', 'Escape restores field');
  for (const invalid of ['0', '-2', 'abc', '99999']) { await edit('Width', invalid); assert(field('Width').value === '768', 'Invalid draft restored'); await size(768, 1376); }
  await edit('Width', ''); assert(field('Width').value === '768', 'Empty draft restored');
  await edit('Width', '384'); await size(384, 688);
  replaceNodes(nodesNow.map(item => item.id === 'resize' ? { ...node(), data: { ...node().data, locked: true } } : item)); await settle();
  assert(field('Width').disabled && find<HTMLButtonElement>(reset).disabled && find<HTMLButtonElement>(lock).disabled, 'Locked controls disabled');
  replaceNodes(nodesNow.map(item => item.id === 'resize' ? { ...node(), data: { ...node().data, locked: false } } : item)); await settle();
  pass('Escape, empty/invalid dimensions and locked-node controls');
  await roundTrip(); await size(384, 688);
  pass('IndexedDB round trip restores dimensions, lock, graph and PNG assets');
  replaceEdges(edgesNow.filter(edge => edge.id !== 'input')); await settle();
  assert(!output(), 'Disconnect invalidates output');
  assert(!document.querySelector<HTMLButtonElement>('[aria-label="Download resized image"]:not(:disabled)'), 'Stale output unavailable');
  replaceEdges(initialEdges); await settle(); await size(384, 688);
  const large = await sample(3840, 2160);
  replaceNodes(nodesNow.map(item => item.id === 'file' ? { ...item, data: { assets: [large] } } as AppNode : item)); await settle();
  await until(() => !field('Width').disabled, 'New image loaded'); await click(reset); await size(3840, 2160);
  await edit('Width', '1920'); await size(1920, 1080);
  await click(lock); await edit('Height', '720'); await size(1920, 720);
  await click(reset); await size(3840, 2160);
  assert(find(lock).getAttribute('aria-checked') === 'false', 'Reset preserves unlocked mode');
  pass('Input replacement, disconnect/reconnect, 4K PNG, custom stretching and Reset to current original');
  await click(lock); await edit('Width', '10'); await size(10, 6, false);
  await roundTrip(); await size(10, 6, false);
  await edit('Width', '3840'); await size(3840, 2160);
  await click('[data-test="undo"]'); await size(10, 6, false);
  await click('[data-test="redo"]'); await size(3840, 2160);
  await edit('Height', '10'); await size(18, 10, false);
  await edit('Height', '2160'); await size(3840, 2160);
  pass('3840 × 2160 survives tiny rounded sizes on both axes, IndexedDB restoration and undo/redo');
  await edit('Width', '10'); await size(10, 6, false);
  await click(lock); await click(lock); await edit('Width', '3840'); await size(3840, 2304);
  await click(reset); await size(3840, 2160);
  await edit('Width', '10'); await size(10, 6, false);
  await edit('Width', '3840'); await size(3840, 2160);
  await click(lock);
  pass('Relock adopts the current custom ratio; Reset clears it and restores the original ratio');
  // Both orientations exercise integer rounding in the <= 1024px preview.
  for (const [width, height] of [[10, 2000], [2000, 10], [100, 300]]) {
    await edit('Width', String(width)); await edit('Height', String(height));
    await size(width, height, false); fullPreview(width, height);
  }
  pass('Tall/wide previews fill the target ratio despite rounded canvas dimensions; 100 × 300 has no height cap');
  await click(reset); await size(3840, 2160);
  results.dataset.result = 'passed';
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent = [...reports, `FAIL ${error instanceof Error ? error.stack : error}`].join('\n'); });
