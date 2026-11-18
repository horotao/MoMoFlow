import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import type { AppNode } from '../src/nodes/types';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
let api: ReactFlowInstance<AppNode>;
function Probe() { api = useReactFlow<AppNode>(); return null; }
const storage = new WorkflowStorage(`momoflow-layout-qa-${crypto.randomUUID()}`);
const saved: Workflow = { nodes: [
  { id: 'a', type: 'text', position: { x: 500, y: 50 }, selected: true, data: { text: 'Source' } },
  { id: 'b', type: 'text', position: { x: 50, y: 400 }, selected: true, data: { text: 'Target' } },
  { id: 'c', type: 'text', position: { x: 2000, y: 1000 }, selected: true, data: { text: 'Second source' } },
  { id: 'd', type: 'text', position: { x: 2500, y: 1250 }, selected: true, data: { text: 'Second target' } },
  { id: 'isolated', type: 'text', position: { x: -500.3, y: -600.7 }, selected: true, data: { text: 'Isolated' } },
  { id: 'fixed', type: 'text', position: { x: 1100, y: 700 }, data: { text: 'Unselected' } },
], edges: [{ id: 'ab', source: 'a', target: 'b', sourceHandle: 'text', targetHandle: 'input-0' }, { id: 'cd', source: 'c', target: 'd', sourceHandle: 'text', targetHandle: 'input-0' }], viewport: { x: 0, y: 0, zoom: 0.63 }, colorMode: 'dark' };
createRoot(document.getElementById('root')!).render(<ReactFlowProvider><ModelTasksProvider><Flow storage={storage} saved={saved} /><Probe /></ModelTasksProvider></ReactFlowProvider>);
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const result = document.getElementById('results')!;
function check(value: unknown, message: string) { if (!value) throw new Error(message); result.textContent += `\nPASS ${message}`; }
const positions = () => JSON.stringify(api.getNodes().map(n => n.position));
async function run() {
  for (let i = 0; i < 240; i++) { await settle(); if (api?.getNodes().every(n => n.measured?.width)) break; }
  const canvas = document.querySelector<HTMLElement>('.react-flow')!;
  const press = (options: KeyboardEventInit = {}, target = canvas) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', code: 'KeyL', shiftKey: true, bubbles: true, cancelable: true, ...options }));
  const before = positions(); const viewport = JSON.stringify(api.getViewport()); const edges = JSON.stringify(api.getEdges());
  canvas.focus(); press(); await settle();
  const arranged = positions();
  check(api.getNode('c')!.position.x === 2000 && api.getNode('c')!.position.y === 1000, 'Second workflow preserves its original area and vertical separation');
  check(api.getNode('isolated')!.position.x === -500.3 && api.getNode('isolated')!.position.y === -600.7, 'Selected isolated node stays exactly in place');
  check(arranged !== before && api.getNode('a')!.position.x < api.getNode('b')!.position.x, 'Shift+L arranges dependency left to right at 63% zoom');
  check(api.getNode('fixed')!.position.x === 1100 && JSON.stringify(api.getEdges()) === edges && JSON.stringify(api.getViewport()) === viewport, 'Unselected node, edges and viewport unchanged');
  press(); await settle(); check(positions() === arranged, 'Repeated arrange is idempotent');
  canvasHistoryShortcut('undo'); await settle(); check(positions() === before, 'One undo restores whole selection');
  canvasHistoryShortcut('redo'); await settle(); check(positions() === arranged, 'Redo restores layout');
  canvasHistoryShortcut('undo'); await settle();
  for (const options of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }, { shiftKey: false }]) { press(options); await settle(); check(positions() === before, 'Guarded key does not arrange'); }
  const input = document.createElement('input'); canvas.append(input); input.focus(); press({}, input); await settle(); check(positions() === before, 'Typing is protected'); input.remove();
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog); canvas.focus(); press(); await settle(); check(positions() === before, 'Open dialog blocks shortcut'); dialog.remove();
  api.setNodes(nodes => nodes.map(n => ({ ...n, selected: false }))); await settle(); press(); await settle(); check(positions() === before, 'Empty selection does not rearrange whole canvas');
  result.dataset.result = 'passed';
}
void run().catch(error => { result.dataset.result = 'failed'; result.textContent += `\nFAIL ${String(error)}`; });
