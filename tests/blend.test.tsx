import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, type Edge } from '@xyflow/react';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { BlendNode } from '../src/nodes/BlendNode';
import { PreviewNode } from '../src/nodes/PreviewNode';
import { FileNode } from '../src/nodes/FileNode';
import { canConnect } from '../src/nodes/connectionRules';
import { imageOutput } from '../src/nodes/sunburstRun';
import { assetResources } from '../src/nodes/assetResources';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import { isNodeLocked } from '../src/nodes/types';
import type { AppNode, BlendNode as Blend, FileAsset } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/BlendNode.css';
import { blendModes, blendPixels, defaultBlendSettings } from '../src/nodes/blend';
import { BlendRenderer } from '../src/nodes/blendRender';
const nodeTypes = { blend: BlendNode, preview: PreviewNode, file: FileNode };
const initialEdges: Edge[] = [
  { id: 'input1', source: 'file1', sourceHandle: 'file', target: 'blend', targetHandle: 'back' },
  { id: 'input2', source: 'file2', sourceHandle: 'file', target: 'blend', targetHandle: 'front' },
  { id: 'output1', source: 'blend', sourceHandle: 'result', target: 'preview1', targetHandle: 'file' },
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
  return { id: crypto.randomUUID(), name: 'Blend test image.png', kind: 'image', url: assetResources.create(blob), width, height, size: blob.size };
}

function Harness({ sources }: { sources: FileAsset[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([
    { id: 'file1', type: 'file', position: { x: 0, y: 40 }, data: { assets: [sources[0]] } },
    { id: 'file2', type: 'file', position: { x: 0, y: 600 }, data: { assets: [sources[1]] } },
    { id: 'blend', type: 'blend', selected: true, position: { x: 650, y: 40 }, data: { settings: { ...defaultBlendSettings } } },
    { id: 'preview1', type: 'preview', position: { x: 1300, y: 40 }, data: {} },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [colorMode, setColorMode] = useState<'dark' | 'light'>('dark');
  nodesNow = nodes; edgesNow = edges; replaceNodes = setNodes; replaceEdges = setEdges;
  const restore = useCallback((value: { nodes: AppNode[]; edges: Edge[] }) => { setNodes(value.nodes); setEdges(value.edges); }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  return <CanvasHistoryContext.Provider value={history}>
    <div className="qa-toolbar"><button data-test="undo" disabled={!history.canUndo} onClick={history.undo}>Undo</button><button data-test="redo" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
      <button onClick={() => { setColorMode(colorMode === 'dark' ? 'light' : 'dark'); document.documentElement.classList.toggle('dark'); }}>Theme</button>
      <button onClick={() => setEdges(current => current.some(edge => edge.id === 'input2') ? current.filter(edge => edge.id !== 'input2') : [...current, initialEdges[1]])}>Connect / disconnect Front</button>
    </div>
    <ReactFlow nodes={nodes.map(node => ({ ...node, draggable: !isNodeLocked(node), connectable: !isNodeLocked(node) }))} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} colorMode={colorMode}
      defaultViewport={{ x: 80, y: 10, zoom: .7 }} minZoom={.15} onConnect={connection => setEdges(current => addEdge(connection, current))}
      isValidConnection={connection => canConnect(connection, nodes, edges)} onKeyDown={event => {
        if ((event.target as HTMLElement).closest('input, textarea') || event.nativeEvent.isComposing) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo(); }
      }}><Background /><Controls /><MiniMap pannable zoomable /></ReactFlow>
    <output id="state">{JSON.stringify({ settings: (nodes.find(node => node.id === 'blend') as Blend).data.settings, nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges: edges.length })}</output>
  </CanvasHistoryContext.Provider>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const find = <T extends HTMLElement = HTMLElement>(selector: string) => { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element; };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const node = () => nodesNow.find(node => node.id === 'blend') as Blend;
const patch = async (data: Partial<Blend['data']>) => { replaceNodes(nodesNow.map(item => item.id === 'blend' ? { ...node(), data: { ...node().data, ...data } } : item)); await settle(); };
async function until(check: () => boolean, message: string) { for (let i = 0; i < 180; i++) { if (check()) return; await settle(); } throw new Error(message); }

async function run() {
  const first = await sample(768, 1024), second = await sample(384, 216);
  createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Harness sources={[first, second]} /></ReactFlowProvider>);
  const checks: string[] = [];
  const check = (value: unknown, message: string) => { assert(value, message); checks.push(message); };
  const ready = () => until(() => Boolean(imageOutput(node(), 'result', nodesNow, edgesNow)[0]), 'Blend output must settle');
  await ready();
  check(node().data.result?.width === 768 && node().data.result?.height === 1024, 'Mismatched images use Back native dimensions');
  const resultBlob = await fetch(node().data.result!.url).then(response => response.blob());
  const png = await createImageBitmap(resultBlob);
  check(png.width === 768 && png.height === 1024 && resultBlob.type === 'image/png', 'Result is a real native-size PNG'); png.close();
  find<HTMLButtonElement>('.blend-controls [role="combobox"]').click(); await settle();
  check(document.querySelectorAll('[role="option"]').length === 18 && document.querySelectorAll('.has-separator').length === 5, '18 options in six separated groups');
  Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(option => option.textContent?.includes('Multiply'))!.click(); await settle(); await ready();
  check(node().data.settings.mode === 'Multiply', 'Menu selection recomputes output');
  find<HTMLButtonElement>('[data-test="undo"]').click(); await settle(); await ready();
  check(node().data.settings.mode === 'Normal', 'One undo skips derived PNG updates');
  find<HTMLButtonElement>('[data-test="redo"]').click(); await settle(); await ready();
  check(node().data.settings.mode === 'Multiply', 'Redo restores mode');
  find<HTMLInputElement>('[role="spinbutton"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await settle(); await ready();
  check(node().data.settings.opacity === .99, 'Opacity keyboard adjustment');
  await patch({ settings: { mode: 'Screen', opacity: .37 } }); await ready();
  const databaseName = `momoflow-blend-test-${crypto.randomUUID()}`, storage = new WorkflowStorage(databaseName);
  try {
    await storage.save({ nodes: nodesNow, edges: edgesNow, viewport: { x: 0, y: 0, zoom: .7 }, colorMode: 'dark' });
    const loaded = await storage.load(); assert(loaded, 'Saved workflow');
    const restored = loaded.nodes.find(item => item.id === 'blend') as Blend;
    check(restored.data.settings.opacity === .37 && restored.data.settings.mode === 'Screen' && Boolean(imageOutput(restored, 'result', loaded.nodes, loaded.edges)[0]), 'IndexedDB restores settings, sources and valid PNG');
    const decoded = await createImageBitmap(await fetch(restored.data.result!.url).then(response => response.blob()));
    check(decoded.width === 768, 'Restored PNG bytes remain readable'); decoded.close();
  } finally { await storage.dispose(); indexedDB.deleteDatabase(databaseName); }
  replaceEdges(edgesNow.filter(edge => edge.id !== 'input2')); await settle(); await ready();
  check(node().data.outputRevision?.includes('Screen'), 'Disconnect produces a fresh one-layer result');
  replaceEdges([...edgesNow.filter(edge => edge.id !== 'input1'), { ...initialEdges[0], source: 'missing' }]); await settle();
  check(imageOutput(node(), 'result', nodesNow, edgesNow).length === 0, 'Pending upstream suppresses stale result');
  replaceEdges(initialEdges); await settle(); await ready();
  await patch({ locked: true });
  check(find<HTMLButtonElement>('.blend-controls button').disabled && find<HTMLInputElement>('[role="spinbutton"]').disabled, 'Lock disables controls');
  await patch({ locked: false }); await ready();
  // Smoke-test the Worker pipeline. Independent Weavy reference coverage is in blend-modes.html.
  const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = 4; a.height = b.height = 2;
  const ca = a.getContext('2d')!, cb = b.getContext('2d')!;
  ca.fillStyle = 'rgb(80 140 200)'; ca.fillRect(0, 0, 4, 2);
  cb.fillStyle = 'rgba(200,60,100,0.5)'; cb.fillRect(0, 0, 4, 2);
  const renderer = new BlendRenderer({ back: await createImageBitmap(a), front: await createImageBitmap(b) });
  try {
    for (const mode of blendModes) {
      const frame = await renderer.render({ mode, opacity: .63 }, true);
      assert(frame?.blob && frame.bitmap, `${mode} worker output`);
      const bitmap = await createImageBitmap(frame.blob);
      const out = document.createElement('canvas'); out.width = 4; out.height = 2;
      const ctx = out.getContext('2d')!; ctx.drawImage(bitmap, 0, 0);
      const actual = ctx.getImageData(0, 0, 1, 1).data;
      const expected = blendPixels(ca.getImageData(0, 0, 1, 1).data, cb.getImageData(0, 0, 1, 1).data, { mode, opacity: .63 });
      check(actual.every((v, index) => Math.abs(v - expected[index]) <= 1), `${mode} Worker uses the linear-light calculation`);
      bitmap.close(); frame.bitmap.close();
    }
    const drafts = Array.from({ length: 12 }, (_, i) => renderer.render({ mode: 'Normal', opacity: i / 12 }, false, true));
    const final = renderer.render({ mode: 'Multiply', opacity: .23 }, true);
    const frames = await Promise.all([...drafts, final]);
    check(Boolean(frames.at(-1)?.blob) && frames.filter(Boolean).length <= 3, 'Rapid changes retain only active and newest queued frames');
    frames.forEach(frame => frame?.bitmap?.close());
  } finally { renderer.dispose(); }
  const large = await sample(3840, 2160);
  replaceNodes(nodesNow.map(item => item.id === 'file1' ? { ...item, data: { assets: [large] } } as AppNode : item)); await settle(); await ready();
  check(node().data.result?.width === 3840 && node().data.result?.height === 2160, '4K Back generates native 3840 x 2160 output');
  const largePng = await createImageBitmap(await fetch(node().data.result!.url).then(response => response.blob()));
  check(largePng.width === 3840 && largePng.height === 2160, '4K PNG decodes at exact dimensions'); largePng.close();
  replaceNodes(nodesNow.map(item => item.id === 'file1' ? { ...item, data: { assets: [first] } } as AppNode : item)); await settle();
  await patch({ settings: { ...defaultBlendSettings } }); await ready();
  find('#results').dataset.result = 'passed'; find('#results').textContent = `${checks.length} checks passed — native Worker / PNG, 18 modes, history, storage, queue, connections and locks.`;
}
void run().catch(error => { find('#results').dataset.result = 'failed'; find('#results').textContent = String(error); console.error(error); });
