import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useEdges, useNodes, useReactFlow, type ReactFlowInstance, type Edge } from '@xyflow/react';
import { Flow } from '../src/App';
import type { AppNode, FileAsset } from '../src/nodes/types';
import { resolveTextValue } from '../src/nodes/textVariables';
import { imageOutput } from '../src/nodes/sunburstRun';
import { replaceRouterInput } from '../src/nodes/router';
import { assetResources } from '../src/nodes/assetResources';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { painterLivePreviews } from '../src/nodes/painterLivePreview';
import { defaultPainterData } from '../src/nodes/painter';
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
  for (let index = 0; index < 240; index++) { if (check()) return; await settle(); }
  throw new Error(message);
}
const find = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element;
};
const checks: string[] = [];
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks.push(message); }
async function sample(): Promise<FileAsset> {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 432;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 768, 432); gradient.addColorStop(0, '#51bfa6'); gradient.addColorStop(1, '#303a88');
  context.fillStyle = gradient; context.fillRect(0, 0, 768, 432); context.fillStyle = '#fff'; context.font = '48px sans-serif'; context.fillText('Router · Original image', 110, 230);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
  return { id: 'sample', name: 'router-sample.png', url: assetResources.create(blob), kind: 'image', width: 768, height: 432 };
}
async function run() {
  const source = await sample();
  const nodes: AppNode[] = [
    { id: 'prompt', type: 'text', position: { x: 120, y: 100 }, data: { text: 'A red balloon above the mountains' } },
    { id: 'alternate', type: 'text', position: { x: 120, y: 620 }, data: { text: 'A blue balloon above the sea' } },
    { id: 'router', type: 'router', position: { x: 720, y: 158 }, data: {} },
    { id: 'consumer', type: 'text', position: { x: 1120, y: 100 }, data: { text: '', variableCount: 1 } },
    { id: 'consumer-2', type: 'text', position: { x: 1120, y: 620 }, data: { text: '', variableCount: 1 } },
    { id: 'file', type: 'file', position: { x: 120, y: 1200 }, data: { assets: [source] } },
    { id: 'image-router', type: 'router', position: { x: 720, y: 1258 }, data: {} },
    { id: 'preview', type: 'preview', position: { x: 1120, y: 1200 }, data: {} },
  ];
  const edges: Edge[] = [
    { id: 'in', source: 'prompt', target: 'router', targetHandle: 'input' },
    ...['consumer', 'consumer-2'].map(target => ({ id: target, source: 'router', sourceHandle: 'output', target, targetHandle: 'variable-1' })),
    { id: 'image-in', source: 'file', sourceHandle: 'file', target: 'image-router', targetHandle: 'input' },
    { id: 'image-out', source: 'image-router', sourceHandle: 'output', target: 'preview', targetHandle: 'file' },
  ];
  const workflow: Workflow = { nodes, edges, colorMode: 'dark', viewport: { x: 10, y: 40, zoom: .5 } };
  const db = `momoflow-router-qa-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(db); await storage.load();
  const root = createRoot(document.getElementById('root')!);
  root.render(<ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('.react-flow__node-router')) && Boolean(document.querySelector<HTMLImageElement>('.preview-image img')?.naturalWidth), 'Router and image preview mount');
  const read = (id: string) => resolveTextValue(id, api.getNodes(), api.getEdges()).trim();
  check(read('consumer') === 'A red balloon above the mountains' && read('consumer-2') === read('consumer'), 'Text fans out to both consumers');
  const style = getComputedStyle(find('[data-id="router"]'));
  check(style.width === '250px' && style.height === '62px' && style.borderRadius === '16px', 'Compact dimensions: 250 × 62 / shared node radius 16');
  const handle = find('[data-id="router"] .react-flow__handle-left').getBoundingClientRect(), bounds = find('[data-id="router"]').getBoundingClientRect();
  check(Math.abs(handle.left + handle.width / 2 - bounds.left) <= 1, 'Input port is centered on the node border');
  check(imageOutput(api.getNode('image-router'), 'output', api.getNodes(), api.getEdges())[0]?.id === source.id, 'Original image identity and dimensions are retained');
  const replace: Edge = { ...edges[0], source: 'alternate' };
  api.setEdges(current => [...replaceRouterInput(replace, api.getNodes(), current), replace]); await settle();
  check(read('consumer').includes('blue balloon') && read('consumer-2').includes('blue balloon'), 'Replacing one input updates every branch');
  find<HTMLButtonElement>('[aria-label="撤销"]').click(); await settle(); check(read('consumer').includes('red balloon'), 'One undo restores prior source');
  find<HTMLButtonElement>('[aria-label="重做"]').click(); await settle(); check(read('consumer').includes('blue balloon'), 'One redo restores replacement');
  api.setEdges(current => current.filter(edge => edge.target !== 'router')); await settle(); check(read('consumer') === '' && read('consumer-2') === '', 'Disconnect clears both consumers');
  find<HTMLButtonElement>('[aria-label="撤销"]').click(); await settle();
  const before = api.getNodes().length;
  find('[data-id="alternate"] .react-flow__handle.source').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await settle();
  check(api.getNodes().length === before + 1 && api.getNodes().at(-1)?.type === 'router', 'Double-click output creates and connects Router');
  find<HTMLButtonElement>('[aria-label="撤销"]').click(); await settle(); check(api.getNodes().length === before && api.getEdges().length === edges.length, 'Quick creation undoes node and edge together');
  find<HTMLButtonElement>('[data-id="router"] [aria-label="更多选项"]').click(); await settle();
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent?.includes('创建副本'))!.click(); await settle();
  check(api.getNodes().length === before + 1 && imageOutput(api.getNodes().at(-1), 'output', api.getNodes(), api.getEdges()).length === 0, 'Duplicate is an independent empty Router');
  find<HTMLButtonElement>('[aria-label="撤销"]').click(); await settle();
  api.updateNodeData('router', { label: 'Shared prompt', locked: true }); await settle();
  check(!api.getNode('router')?.draggable && !api.getNode('router')?.connectable && !api.getNode('router')?.deletable, 'Lock disables dragging, connecting and deletion');
  api.updateNodeData('router', { locked: false }); await settle();
  find<HTMLButtonElement>('[aria-label="切换至浅色模式"]').click(); await settle();
  check(getComputedStyle(find('[data-id="router"]')).backgroundColor === 'rgb(255, 255, 255)', 'Light theme uses the shared white surface');
  check(getComputedStyle(find('.react-flow__edge[data-id="consumer"] .react-flow__edge-path')).stroke === 'rgb(179, 75, 209)', 'Routed text edges follow the light theme');
  find<HTMLButtonElement>('[aria-label="切换至深色模式"]').click(); await settle();
  const saved = { ...workflow, nodes: api.getNodes(), edges: api.getEdges() };
  await storage.save(saved);
  const reader = new WorkflowStorage(db), restored = await reader.load();
  check(restored?.nodes.find(node => node.id === 'router')?.data.label === 'Shared prompt', 'IndexedDB restores name and graph');
  check(imageOutput(restored!.nodes.find(node => node.id === 'image-router'), 'output', restored!.nodes, restored!.edges)[0]?.url.startsWith('blob:'), 'IndexedDB restores original image through Router');
  // Exercise Preview's ephemeral canvas subscription through a Router, without models.
  api.addNodes({ id: 'paint', type: 'painter', position: { x: 2000, y: 0 }, data: { ...defaultPainterData } });
  api.setEdges(current => current.map(edge => edge.id === 'image-in' ? { ...edge, source: 'paint', sourceHandle: 'mask' } : edge)); await settle();
  const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 10;
  painterLivePreviews.publish('paint', { result: canvas, mask: canvas, width: 20, height: 10, drawing: true }); await settle();
  check(Boolean(document.querySelector('[aria-label="Live Painter Mask preview"]')), 'Live Painter Mask preview passes through Router');
  painterLivePreviews.clear('paint');
  api.setNodes(saved.nodes); api.setEdges(saved.edges); await settle();
  reader.dispose();
  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} checks\n${checks.join('\n')}`;
}
void run().catch(error => { find('#results').dataset.result = 'failed'; find('#results').textContent = `FAIL\n${checks.join('\n')}\n${error instanceof Error ? error.stack : error}`; });
