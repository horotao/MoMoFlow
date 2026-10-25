import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, type Edge } from '@xyflow/react';
import { CanvasHistoryContext, useCanvasHistory } from '../src/components/useCanvasHistory';
import { CompareNode } from '../src/nodes/CompareNode';
import { PreviewNode } from '../src/nodes/PreviewNode';
import { FileNode } from '../src/nodes/FileNode';
import { canConnect } from '../src/nodes/connectionRules';
import { imageOutput } from '../src/nodes/sunburstRun';
import { assetResources } from '../src/nodes/assetResources';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import { isNodeLocked } from '../src/nodes/types';
import type { AppNode, CompareNode as Compare, FileAsset } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/CompareNode.css';
const nodeTypes = { compare: CompareNode, preview: PreviewNode, file: FileNode };
const initialEdges: Edge[] = [
  { id: 'input1', source: 'file1', sourceHandle: 'file', target: 'compare', targetHandle: 'input-1' },
  { id: 'input2', source: 'file2', sourceHandle: 'file', target: 'compare', targetHandle: 'input-2' },
  { id: 'output1', source: 'compare', sourceHandle: 'output-1', target: 'preview1', targetHandle: 'file' },
  { id: 'output2', source: 'compare', sourceHandle: 'output-2', target: 'preview2', targetHandle: 'file' },
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
  return { id: crypto.randomUUID(), name: 'Compare test image.png', kind: 'image', url: assetResources.create(blob), width, height, size: blob.size };
}

function Harness({ sources }: { sources: FileAsset[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([
    { id: 'file1', type: 'file', position: { x: 0, y: 40 }, data: { assets: [sources[0]] } },
    { id: 'file2', type: 'file', position: { x: 0, y: 1050 }, data: { assets: [sources[1]] } },
    { id: 'compare', type: 'compare', selected: true, position: { x: 650, y: 40 }, data: { mode: 'slider', split: .5 } },
    { id: 'preview1', type: 'preview', position: { x: 1300, y: 40 }, data: {} },
    { id: 'preview2', type: 'preview', position: { x: 1300, y: 1050 }, data: {} },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [colorMode, setColorMode] = useState<'dark' | 'light'>('dark');
  nodesNow = nodes; edgesNow = edges; replaceNodes = setNodes; replaceEdges = setEdges;
  const restore = useCallback((value: { nodes: AppNode[]; edges: Edge[] }) => { setNodes(value.nodes); setEdges(value.edges); }, [setNodes, setEdges]);
  const history = useCanvasHistory(nodes, edges, restore);
  return <CanvasHistoryContext.Provider value={history}>
    <div className="qa-toolbar"><button data-test="undo" disabled={!history.canUndo} onClick={history.undo}>Undo</button><button data-test="redo" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
      <button onClick={() => { setColorMode(colorMode === 'dark' ? 'light' : 'dark'); document.documentElement.classList.toggle('dark'); }}>Theme</button>
      <button onClick={() => setEdges(current => current.some(edge => edge.id === 'input2') ? current.filter(edge => edge.id !== 'input2') : [...current, initialEdges[1]])}>Connect / disconnect Input 2</button>
    </div>
    <ReactFlow nodes={nodes.map(node => ({ ...node, draggable: !isNodeLocked(node), connectable: !isNodeLocked(node) }))} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} colorMode={colorMode}
      defaultViewport={{ x: 80, y: 10, zoom: .65 }} minZoom={.15} onConnect={connection => setEdges(current => addEdge(connection, current))}
      isValidConnection={connection => canConnect(connection, nodes, edges)} onKeyDown={event => {
        if ((event.target as HTMLElement).closest('input, textarea') || event.nativeEvent.isComposing) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo(); }
      }}><Background /><Controls /><MiniMap pannable zoomable /></ReactFlow>
    <output id="state">{JSON.stringify({ mode: (nodes.find(node => node.id === 'compare') as Compare).data, nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges: edges.length })}</output>
  </CanvasHistoryContext.Provider>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const find = <T extends HTMLElement = HTMLElement>(selector: string) => { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element; };
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const node = () => nodesNow.find(node => node.id === 'compare') as Compare;
const patch = async (data: Partial<Compare['data']>) => { replaceNodes(nodesNow.map(item => item.id === 'compare' ? { ...node(), data: { ...node().data, ...data } } : item)); await settle(); };
async function until(check: () => boolean, message: string) { for (let i = 0; i < 180; i++) { if (check()) return; await settle(); } throw new Error(message); }
async function run() {
  const first = await sample(768, 1376);
  const second = await sample(768, 1376);
  const img = new Image(); img.src = second.url; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 1376;
  const context = canvas.getContext('2d')!; context.filter = 'brightness(1.55)'; context.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
  second.url = assetResources.create(blob);
  createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Harness sources={[first, second]} /></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('.compare-slider')) && Array.from(document.querySelectorAll<HTMLImageElement>('.compare-image img')).every(img => img.complete && img.naturalWidth), 'Images must load');
  const checks: string[] = [];
  const check = (value: unknown, message: string) => { assert(value, message); checks.push(message); };
  check(imageOutput(node(), 'output-1', nodesNow, edgesNow)[0] === first && imageOutput(node(), 'output-2', nodesNow, edgesNow)[0] === second, 'Two native images pass through independently');
  check(find('.compare-image').getBoundingClientRect().height / find('.compare-image').getBoundingClientRect().width > 1.79, 'Portrait ratio follows Input 1');
  find('.compare-slider').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await settle();
  check(node().data.split === .51, 'Keyboard divider adjustment');
  find<HTMLButtonElement>('[data-test="undo"]').click(); await settle(); check(node().data.split === .5, 'Undo divider');
  find<HTMLButtonElement>('[data-test="redo"]').click(); await settle(); check(node().data.split === .51, 'Redo divider');
  find<HTMLButtonElement>('.compare-reset').click(); await settle(); check(node().data.split === .5 && find<HTMLButtonElement>('.compare-reset').disabled, 'Reset centers and disables');
  find<HTMLButtonElement>('.compare-controls [role="combobox"]').click(); await settle();
  Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(option => option.textContent?.includes('Toggle'))!.click(); await settle();
  check(node().data.mode === 'toggle' && !document.querySelector('.compare-reset'), 'Toggle has no Reset');
  const eye = find<HTMLButtonElement>('.compare-toggle button');
  eye.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); await settle(); check(eye.getAttribute('aria-pressed') === 'true' && find('.compare-toggle').textContent === 'Image 1', 'Hold reveals Image 1');
  eye.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); await settle(); check(eye.getAttribute('aria-pressed') === 'false' && find('.compare-toggle').textContent === 'Image 2', 'Release restores Image 2');
  await patch({ mode: 'slider', split: .27 });
  const databaseName = `momoflow-compare-test-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(databaseName);
  try {
    await storage.save({ nodes: nodesNow, edges: edgesNow, viewport: { x: 0, y: 0, zoom: .65 }, colorMode: 'dark' });
    const loaded = await storage.load(); assert(loaded, 'Saved workflow');
    const restored = loaded.nodes.find(item => item.id === 'compare') as Compare;
    check(restored.data.split === .27 && imageOutput(restored, 'output-2', loaded.nodes, loaded.edges)[0]?.id === second.id, 'IndexedDB restores split and both image connections');
  } finally { await storage.dispose(); indexedDB.deleteDatabase(databaseName); }
  replaceEdges(edgesNow.filter(edge => edge.id !== 'input2')); await settle();
  check(!document.querySelector('.compare-slider') && imageOutput(node(), 'output-2', nodesNow, edgesNow).length === 0, 'Disconnected input clears only its output');
  replaceEdges(initialEdges); await settle();
  check(Boolean(document.querySelector('.compare-slider')), 'Reconnect restores comparison');
  await patch({ locked: true });
  check(find<HTMLButtonElement>('.compare-controls button').disabled && find('.compare-slider').getAttribute('aria-disabled') === 'true', 'Locked node disables editing');
  await patch({ locked: false, split: .5 });
  const wide = await sample(3840, 2160);
  replaceNodes(nodesNow.map(item => item.id === 'file1' ? { ...item, data: { assets: [wide] } } as AppNode : item)); await settle();
  await until(() => Array.from(document.querySelectorAll<HTMLImageElement>('.compare-image img')).some(img => img.naturalWidth === 3840), '4K replacement loads');
  check(imageOutput(node(), 'output-1', nodesNow, edgesNow)[0]?.width === 3840 && imageOutput(node(), 'output-2', nodesNow, edgesNow)[0]?.height === 1376, 'Mismatched ratios preserve independent native outputs');
  replaceNodes(nodesNow.map(item => item.id === 'file1' ? { ...item, data: { assets: [first] } } as AppNode : item)); await settle();
  check(getComputedStyle(find('.compare-layer')).backgroundImage.includes('conic'), 'Transparent previews preserve checkerboard');
  find('#results').dataset.result = 'passed'; find('#results').textContent = `${checks.length} checks passed — Slider / Toggle, history, storage, 4K, connections, locks and transparency.`;
}
void run().catch(error => { find('#results').dataset.result = 'failed'; find('#results').textContent = String(error); console.error(error); });
