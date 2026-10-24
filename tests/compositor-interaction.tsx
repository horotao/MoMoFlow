import { useCallback, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, type Edge } from '@xyflow/react';
import { nodeTypes } from '../src/nodes';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { assetResources } from '../src/nodes/assetResources';
import { createLayer, defaultCompositorDocument, newEffect } from '../src/nodes/compositor';
import { defaultText, normalizePath } from '../src/nodes/compositorGraphics';
import type { AppNode, CompositorNode } from '../src/nodes/types';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import { compositorChain } from './fixtures/compositorChain';
import { imageOutput } from '../src/nodes/sunburstRun';
import '../src/index.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/compositor/Compositor.css';

// Deliberately separate from the user's workflow database. Only this test page
// imports the fixture. Its editable nodes, history, renderer and storage are real.
const chainDepth = new URLSearchParams(location.search).has('chain') ? 16 : 0;
const storage = new WorkflowStorage(`momoflow-compositor-interaction-qa${chainDepth ? '-chain' : ''}`);
async function chainFixture() {
  const canvas = new OffscreenCanvas(640, 360), ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 640, 360); gradient.addColorStop(0, '#263b70'); gradient.addColorStop(1, '#eb9371');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 640, 360);
  const image = { id: crypto.randomUUID(), kind: 'image' as const, name: 'Chain source.png', width: 640, height: 360, url: assetResources.create(await canvas.convertToBlob()) };
  const scene = compositorChain(chainDepth, image), last = scene.compositors[chainDepth - 1];
  last.data.document.layers[1].transform = { x: 160, y: 90, width: 320, height: 180, rotation: 0 };
  last.data.document.layers[1].effects = [newEffect('blur'), newEffect('color'), newEffect('levels')];
  scene.nodes.push({ id: 'qa-preview', type: 'preview', position: { x: 480 * (chainDepth + 1), y: 0 }, data: {} });
  scene.edges.push({ id: 'output', source: last.id, sourceHandle: 'result', target: 'qa-preview', targetHandle: 'file' });
  return scene;
}
async function fixture() {
  const canvas = new OffscreenCanvas(3840, 2160), ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 3840, 2160); gradient.addColorStop(0, '#263b70'); gradient.addColorStop(1, '#eb9371'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 3840, 2160);
  ctx.fillStyle = '#ffffff22'; for (let x = 0; x < 3840; x += 160) ctx.fillRect(x, 0, 40, 2160);
  const image = { id: crypto.randomUUID(), kind: 'image' as const, name: '4K QA source.png', width: 3840, height: 2160, url: assetResources.create(await canvas.convertToBlob()) };
  const document = defaultCompositorDocument();
  const effects = (size: number) => {
    const blur = newEffect('blur'), color = newEffect('color'), levels = newEffect('levels');
    if (blur.type === 'blur') blur.settings.size = size;
    if (color.type === 'color') { color.settings.exposure = .2; color.settings.saturation = .3; }
    if (levels.type === 'levels') { levels.settings.RGB.gamma = 1.15; levels.settings.RGB.inputMin = 12; }
    return [blur, color, levels];
  };
  document.layers[0].effects = effects(5);
  document.layers[1].transform = { x: 2800, y: 150, width: 650, height: 400, rotation: 5 };
  document.layers.push({ ...createLayer('qa-text', 'QA Text', { ...defaultText(), text: 'MoMoFlow\n文本与矢量', fontSize: 100, fill: '#ffffff', verticalAlign: 'center' }), transform: { x: 300, y: 200, width: 1300, height: 420, rotation: 0 }, effects: effects(3) });
  const path = normalizePath([{ x: 400, y: 1100 }, { x: 900, y: 1000, in: { x: 600, y: 1250 }, out: { x: 1200, y: 750 } }, { x: 1500, y: 1300 }], false);
  document.layers.push({ ...createLayer('qa-path', 'QA Vector', path.source), transform: path.transform, stroke: { enabled: true, color: '#ffffff', width: 24 }, effects: effects(10) });
  document.layers.push({ ...createLayer('qa-shape', 'QA Shape', { kind: 'shape', shape: 'star', fill: '#8ce5cf' }), transform: { x: 2200, y: 900, width: 850, height: 800, rotation: 0 }, effects: effects(20) });
  const nodes: AppNode[] = [
    { id: 'qa-file', type: 'file', position: { x: 0, y: 0 }, data: { assets: [image] } },
    { id: 'qa-comp', type: 'compositor', position: { x: 500, y: 0 }, data: { document, label: 'Interaction QA' } },
    { id: 'qa-preview', type: 'preview', position: { x: 1000, y: 0 }, data: {} },
  ];
  const edges: Edge[] = ['background', 'layer-1'].map(handle => ({ id: handle, source: 'qa-file', sourceHandle: 'file', target: 'qa-comp', targetHandle: handle }));
  edges.push({ id: 'output', source: 'qa-comp', sourceHandle: 'result', target: 'qa-preview', targetHandle: 'file' });
  return { nodes, edges };
}
export function Scene({ initial }: { initial: { nodes: AppNode[]; edges: Edge[] } }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes), [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges), [status, setStatus] = useState('Ready');
  const restore = useCallback((value: { nodes: AppNode[]; edges: Edge[] }) => { setNodes(value.nodes); setEdges(value.edges); }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  const compositor = nodes.find(node => node.id === (chainDepth ? `chain-${chainDepth - 1}` : 'qa-comp')) as CompositorNode;
  const doc = compositor.data.document;
  const [timing, setTiming] = useState('');
  const measure = () => {
    const samples: number[] = [];
    for (let index = 0; index < 100; index++) { const start = performance.now(); imageOutput(compositor, 'result', nodes, edges); samples.push(performance.now() - start); }
    samples.sort((a, b) => a - b);
    setTiming(JSON.stringify({ samples: 100, medianMs: samples[50], p95Ms: samples[95], maxMs: samples[99], readyOutputs: nodes.filter(node => node.type === 'compositor' && imageOutput(node, 'result', nodes, edges).length).length }));
  };
  return <CanvasHistoryContext.Provider value={history}>
    <div style={{ width: '100vw', height: '100vh' }}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView /></div>
    <aside style={{ position: 'fixed', top: 8, left: 8, padding: 12, background: '#222', color: '#fff', zIndex: 100 }}><strong>{chainDepth ? 'Isolated 16-level Compositor chain' : 'Isolated 4K interaction QA'}</strong><p>{doc.layers.length} layers · Blur / Color / Levels · real Output → Preview</p><button onClick={() => { void storage.save({ nodes, edges, colorMode: 'dark', viewport: { x: 0, y: 0, zoom: 1 } }).then(() => setStatus('Saved QA fixture')); }}>Save QA fixture</button><span role="status">{status}</span><button onClick={measure}>Measure graph reads</button><output id="qa-timing">{timing}</output><details><summary>Document evidence</summary><pre id="qa-document" style={{ maxHeight: 240, overflow: 'auto', maxWidth: 600 }}>{JSON.stringify(doc)}</pre></details></aside>
  </CanvasHistoryContext.Provider>;
}
export function App() {
  const [initial, setInitial] = useState<{ nodes: AppNode[]; edges: Edge[] }>();
  useEffect(() => { void storage.load().then(saved => saved ?? (chainDepth ? chainFixture() : fixture())).then(setInitial); }, []);
  return initial ? <ReactFlowProvider><Scene initial={initial} /></ReactFlowProvider> : <p>Loading isolated QA scene…</p>;
}
const root: Root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App />);
