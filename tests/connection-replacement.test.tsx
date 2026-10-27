import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import type { AppNode, FileAsset } from '../src/nodes/types';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { resolveTextValue } from '../src/nodes/textVariables';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges: edges.map(edge => `${edge.source}>${edge.target}:${edge.targetHandle}`) })}</output>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(check: () => boolean, message: string) {
  for (let index = 0; index < 180; index++) { if (check()) return; await settle(); }
  throw new Error(message);
}
const find = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element;
};
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const results = find('#results');
function pass(message: string) { results.textContent += `\nPASS ${message}`; }
const handle = (id: string, direction: 'source' | 'target', port?: string) => find(`[data-id="${id}"] .react-flow__handle.${direction}${port ? `[data-handleid="${port}"]` : ''}`);
const center = (element: Element) => { const box = element.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
async function drag(from: HTMLElement, to: HTMLElement | { x: number; y: number }) {
  const start = center(from), end = to instanceof HTMLElement ? center(to) : to;
  const event = (type: string, point: { x: number; y: number }, buttons: number) => new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons, clientX: point.x, clientY: point.y });
  from.dispatchEvent(event('mousedown', start, 1));
  for (let step = 1; step <= 8; step++) {
    document.dispatchEvent(event('mousemove', { x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8 }, 1));
    await settle();
  }
  (document.elementFromPoint(end.x, end.y) ?? document).dispatchEvent(event('mouseup', end, 0));
  await settle();
}
const sourceOf = (id: string, port: string) => api.getEdges().find(edge => edge.target === id && edge.targetHandle === port)?.source;
function asset(id: string, color: string): FileAsset {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 80;
  const context = canvas.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, 128, 80);
  return { id, kind: 'image', name: `${id}.png`, url: canvas.toDataURL(), width: 128, height: 80 };
}
const workflow: Workflow = {
  nodes: [
    { id: 'old-image', type: 'file', position: { x: 20, y: 40 }, data: { label: '原图片 · 红色', assets: [asset('red', '#de6557')] } },
    { id: 'new-image', type: 'file', position: { x: 600, y: 40 }, data: { label: '新图片 · 蓝色', assets: [asset('blue', '#599cde')] } },
    { id: 'preview', type: 'preview', position: { x: 1200, y: 40 }, data: { label: '替换后的预览' } },
    { id: 'branch', type: 'router', position: { x: 1800, y: 40 }, data: { label: '保留原图分支' } },
    { id: 'old-text', type: 'text', position: { x: 20, y: 700 }, data: { label: '原文本', text: 'Old value' } },
    { id: 'new-text', type: 'text', position: { x: 600, y: 700 }, data: { label: '新文本', text: 'New value' } },
    { id: 'consumer', type: 'text', position: { x: 1200, y: 700 }, data: { label: '变量接收端', text: '', variableCount: 2 } },
  ],
  edges: [
    { id: 'old-preview', source: 'old-image', sourceHandle: 'file', target: 'preview', targetHandle: 'file' },
    { id: 'keep-branch', source: 'old-image', sourceHandle: 'file', target: 'branch', targetHandle: 'input' },
    { id: 'old-variable', source: 'old-text', target: 'consumer', targetHandle: 'variable-1' },
  ],
  colorMode: 'dark', viewport: { x: 80, y: 155, zoom: .45 },
};
const storage = new WorkflowStorage(`momoflow-connection-qa-${crypto.randomUUID()}`);
await storage.load();
const root = createRoot(find('#root'));
let version = 0;
function render(saved: Workflow) {
  root.render(<ReactFlowProvider key={++version}><Flow storage={storage} saved={saved} /><Probe /></ReactFlowProvider>);
}
render(workflow);
await until(() => !!document.querySelector('[data-id="preview"] .react-flow__handle.target'), 'Canvas mount');
results.textContent = 'Ready · independent test workflow';
find('#restore').onclick = () => {
  void storage.load().then(saved => { check(saved, 'Saved workflow exists'); render(saved); }).catch(error => { results.textContent = String(error); });
};
find<HTMLButtonElement>('#run').onclick = async () => {
  find<HTMLButtonElement>('#run').disabled = true;
  results.textContent = 'Running';
  try {
    check(handle('preview', 'target').classList.contains('connectableend'), 'Occupied image input accepts a new connection');
    await drag(handle('new-image', 'source'), handle('preview', 'target'));
    check(sourceOf('preview', 'file') === 'new-image' && api.getEdges().length === 3, 'New image replaces old edge');
    check(sourceOf('branch', 'input') === 'old-image', 'Other branches survive');
    await until(() => find<HTMLImageElement>('[data-id="preview"] img').alt === 'blue.png', 'Preview displays new image');
    pass('Occupied image input replaced; preview updates; other branch preserved');
    find('[aria-label="撤销"]').click(); await settle(); check(sourceOf('preview', 'file') === 'old-image', 'One-step undo restores original edge');
    find('[aria-label="重做"]').click(); await settle(); check(sourceOf('preview', 'file') === 'new-image', 'Redo restores replacement');
    pass('One-step undo and redo');
    await drag(handle('new-text', 'source'), handle('preview', 'target'));
    check(sourceOf('preview', 'file') === 'new-image', 'Invalid media connection preserves existing edge');
    await drag(handle('preview', 'target'), handle('old-image', 'source'));
    check(sourceOf('preview', 'file') === 'old-image', 'Reverse drag replaces occupied input');
    pass('Invalid drop preserves original; reverse drag replaces correctly');
    await drag(handle('new-text', 'source'), handle('consumer', 'target', 'variable-1'));
    check(sourceOf('consumer', 'variable-1') === 'new-text' && api.getEdges().length === 3, 'Text variable input replaced');
    check(resolveTextValue('consumer', api.getNodes(), api.getEdges()).includes('New value'), 'Variable resolves to the new source');
    find('[aria-label="撤销"]').click(); await settle(); check(sourceOf('consumer', 'variable-1') === 'old-text', 'Text replacement undo');
    find('[aria-label="重做"]').click(); await settle(); check(sourceOf('consumer', 'variable-1') === 'new-text', 'Text replacement redo');
    pass('Text variable value updates with undo/redo');
    const before = JSON.stringify(api.getEdges());
    const previewBounds = find('[data-id="preview"]').getBoundingClientRect();
    const blank = { x: previewBounds.x + 100, y: previewBounds.bottom + 45 };
    check(document.elementFromPoint(blank.x, blank.y)?.classList.contains('react-flow__pane'), 'Creation drop point is blank canvas');
    await drag(handle('preview', 'target'), blank);
    await until(() => !!document.querySelector('[role="dialog"]'), 'Reverse creation menu');
    find('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
    check(JSON.stringify(api.getEdges()) === before, 'Cancelling reverse creation preserves edges');
    await drag(handle('preview', 'target'), blank);
    await until(() => !!document.querySelector('[role="dialog"]'), 'Reverse creation menu again');
    const choice = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.textContent === '导入');
    check(choice, 'Import remains available for an occupied port'); choice.click(); await settle();
    const imported = sourceOf('preview', 'file');
    check(imported !== 'old-image' && api.getNode(imported!)?.type === 'file' && api.getEdges().length === 3, 'Created Import replaces old edge');
    find('[aria-label="撤销"]').click(); await settle();
    check(sourceOf('preview', 'file') === 'old-image' && !api.getNode(imported!), 'Undo restores edge and removes created node together');
    pass('Reverse creation, cancel and atomic undo');
    await drag(handle('new-image', 'source'), handle('preview', 'target'));
    const current: Workflow = { nodes: api.getNodes(), edges: api.getEdges(), colorMode: 'dark', viewport: api.getViewport() };
    await storage.save(current); const saved = await storage.load(); check(saved, 'Saved graph exists');
    check(saved.edges.filter(edge => edge.target === 'preview').length === 1 && saved.edges.find(edge => edge.target === 'preview')?.source === 'new-image', 'Persistence keeps only replacement');
    render(saved); await settle();
    check(sourceOf('preview', 'file') === 'new-image' && sourceOf('consumer', 'variable-1') === 'new-text', 'Remount restores replaced connections');
    pass('IndexedDB save/load and remount preserve replacements');
    results.dataset.result = 'passed';
  } catch (error) { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${error instanceof Error ? error.stack : String(error)}`; }
};
