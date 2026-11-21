import { canvasImage } from './fixtures/canvasImage';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { useModelTaskStore } from '../src/components/useModelTasks';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import type { AppNode } from '../src/nodes/types';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
let api: ReactFlowInstance<AppNode>;
let tasks: ReturnType<typeof useModelTaskStore>;
function Probe() {
  api = useReactFlow<AppNode>();
  tasks = useModelTaskStore();
  return null;
}
const storage = new WorkflowStorage(`momoflow-layout-qa-${crypto.randomUUID()}`);
const saved: Workflow = { nodes: [
  { ...canvasImage('a', 500, 50, { composer: { prompt: '', quantity: 1, ratio: '21:9' } }), selected: true },
  { ...canvasImage('b', 50, 400), selected: true },
  { ...canvasImage('c', 2000, 1000), selected: true },
  { ...canvasImage('d', 2500, 1250), selected: true },
  { ...canvasImage('isolated', -500.3, -600.7), selected: true },
  { ...canvasImage('fixed', 1100, 700), selected: false },
], edges: [{ id: 'ab', source: 'a', target: 'b', sourceHandle: 'result', targetHandle: 'image-0' }, { id: 'cd', source: 'c', target: 'd', sourceHandle: 'result', targetHandle: 'image-0' }], viewport: { x: 0, y: 0, zoom: 0.63 }, colorMode: 'dark' };
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
  check(api.getInternalNode('c')!.internals.positionAbsolute.x === 2000 && api.getNode('c')!.position.y === 1000, 'Second workflow preserves its original area and vertical separation');
  check(api.getInternalNode('isolated')!.internals.positionAbsolute.x === -500.3 && api.getNode('isolated')!.position.y === -600.7, 'Selected isolated node stays exactly in place');
  check(arranged !== before && api.getNode('a')!.position.x < api.getNode('b')!.position.x, 'Shift+L arranges dependency left to right at 63% zoom');
  check(api.getInternalNode('fixed')!.internals.positionAbsolute.x === 1100 && JSON.stringify(api.getEdges()) === edges && JSON.stringify(api.getViewport()) === viewport, 'Unselected node, edges and viewport unchanged');
  press(); await settle(); check(positions() === arranged, 'Repeated arrange is idempotent');
  canvasHistoryShortcut('undo'); await settle(); check(positions() === before, 'One undo restores whole selection');
  canvasHistoryShortcut('redo'); await settle(); check(positions() === arranged, 'Redo restores layout');
  canvasHistoryShortcut('undo'); await settle();
  for (const options of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }, { shiftKey: false }]) { press(options); await settle(); check(positions() === before, 'Guarded key does not arrange'); }
  const input = document.createElement('input'); canvas.append(input); input.focus(); press({}, input); await settle(); check(positions() === before, 'Typing is protected'); input.remove();
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog); canvas.focus(); press(); await settle(); check(positions() === before, 'Open dialog blocks shortcut'); dialog.remove();
  api.setNodes(nodes => nodes.map(n => ({ ...n, selected: false }))); await settle(); press(); await settle(); check(positions() === before, 'Empty selection does not rearrange whole canvas');
  api.updateNodeData('b', { results: [{ id: 'prior', kind: 'image', name: 'prior.png',
    url: new URL('./snapshots/image-prompt-node-2026-11-20-v1/tests/generation-preview.png', import.meta.url).href }] });
  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === 'a' || node.id === 'b' })));
  await settle();
  tasks.update(() => ['a', 'b'].map(nodeId => ({
    id: nodeId, batchId: 'layout', nodeId, model: 'image', createdAt: Date.now(),
    started: Date.now(), progress: 10, state: 'Running',
  })));
  await settle();
  const wire = document.querySelector<SVGPathElement>('.react-flow__edge[data-id="ab"] .workflow-wire')!;
  for (const [id, selector, distance] of [
    ['a', '.image-node-output-visual', 0],
    ['b', '[data-connection-port="image"] .image-node-port', wire.getTotalLength()],
  ] as const) {
    const port = document.querySelector(`[data-id="${id}"] [aria-busy="true"] ${selector}`)!.getBoundingClientRect();
    const end = wire.getPointAtLength(distance).matrixTransform(wire.getScreenCTM()!);
    check(port.width > 0 && Math.hypot(end.x - port.x - port.width / 2, end.y - port.y - port.height / 2) < 1,
      `Generating Image keeps its wire attached to ${id}`);
  }
  for (const id of ['a', 'b']) {
    const running = document.querySelector(`[data-id="${id}"] .image-node[aria-busy="true"]`)!;
    check(running.classList.contains('is-selected') && !running.querySelector('textarea')!.readOnly
      && ['.image-node-toolbar-bridge', '.image-node-surface'].every(selector => {
        const element = running.querySelector(selector)!;
        return getComputedStyle(element).visibility === 'visible' && element.getBoundingClientRect().height > 0;
      }), `Generating selected Image ${id} keeps its toolbar visible and its prompt editable`);
  }
  const wideRing = document.querySelector<HTMLElement>('[data-id="a"] .image-node-generation-ring')!;
  const sweep = wideRing.querySelector<HTMLElement>('.image-node-generation-light')!;
  check(wideRing.offsetWidth === 896 && wideRing.offsetHeight === 384 && sweep.offsetWidth === sweep.offsetHeight
    && sweep.offsetWidth >= Math.hypot(wideRing.offsetWidth, wideRing.offsetHeight),
  'The rotating sweep covers all corners of a 21:9 Image');
  tasks.update(() => []);
  result.dataset.result = 'passed';
}
void run().catch(error => { result.dataset.result = 'failed'; result.textContent += `\nFAIL ${String(error)}`; });
