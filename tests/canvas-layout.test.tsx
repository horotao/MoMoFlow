import { canvasImage } from './fixtures/canvasImage';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { useModelTaskStore } from '../src/components/useModelTasks';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { groupSelectedNodes } from '../src/nodes/canvasGroups';
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
  const connectedBottom = Math.max(...['a', 'b', 'c', 'd'].map(id => {
    const node = api.getInternalNode(id)!;
    return node.internals.positionAbsolute.y + node.measured.height!;
  }));
  const isolated = api.getInternalNode('isolated')!.internals.positionAbsolute;
  check(isolated.x === -500.3 && isolated.y === connectedBottom + 64, 'Selected isolated node moves below connected workflows with a 64-unit gap');
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
  for (const [id, selector, side, distance] of [
    ['a', '.image-node-output-visual', 'right', 0],
    ['b', '[data-connection-port="image"] .image-node-port', 'left', wire.getTotalLength()],
  ] as const) {
    const node = document.querySelector(`[data-id="${id}"] .image-node[aria-busy="true"]`)!;
    const card = node.querySelector('.image-node-card')!.getBoundingClientRect();
    const port = node.querySelector(selector)!.getBoundingClientRect();
    const end = wire.getPointAtLength(distance).matrixTransform(wire.getScreenCTM()!);
    check(port.width > 0 && Math.hypot(end.x - card[side], end.y - port.y - port.height / 2) < 1,
      `Selected generating Image ${id} anchors its wire at the ${side} card edge on the port row`);
  }
  for (const id of ['a', 'b']) {
    const running = document.querySelector(`[data-id="${id}"] .image-node[aria-busy="true"]`)!;
    const surface = running.querySelector('.image-node-surface')!;
    check(running.classList.contains('is-selected') && running.querySelector<HTMLElement>('[role="textbox"]')!.isContentEditable
      && getComputedStyle(surface).visibility === 'visible' && surface.getBoundingClientRect().height > 0
      && !running.querySelector('.image-node-toolbar'), `Multi-selected generating Image ${id} hides its toolbar and keeps its prompt editable`);
  }
  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === 'a' })));
  await settle();
  const toolbar = document.querySelector('[data-id="a"] .image-node-toolbar-bridge')!;
  check(getComputedStyle(toolbar).visibility === 'visible' && toolbar.getBoundingClientRect().height > 0,
    'Returning to a single generating Image shows its toolbar again');
  const wideRing = document.querySelector<HTMLElement>('[data-id="a"] .image-node-generation-ring')!;
  const sweep = wideRing.querySelector<HTMLElement>('.image-node-generation-light')!;
  check(wideRing.offsetWidth === 896 && wideRing.offsetHeight === 384 && sweep.offsetWidth === sweep.offsetHeight
    && sweep.offsetWidth >= Math.hypot(wideRing.offsetWidth, wideRing.offsetHeight),
  'The rotating sweep covers all corners of a 21:9 Image');
  tasks.update(() => []);
  api.setNodes(nodes => [...nodes, ...Array.from({ length: 3 }, (_, i) => canvasImage(`mention-${i}`, 3200 + i * 500, 1600))]);
  await settle();
  document.querySelector<HTMLButtonElement>('[data-id="a"] [aria-label="Mention node"]')!.click();
  await settle();
  const picker = document.querySelector<HTMLElement>('.image-mention-menu')!;
  check(picker && picker.getBoundingClientRect().width === 256 && picker.getBoundingClientRect().height <= 278,
    'Image @ uses Flora’s 256px picker with a bounded scroll viewport');
  const scroller = picker.querySelector<HTMLElement>('.image-mention-scroll')!;
  const shellBounds = picker.getBoundingClientRect(), scrollBounds = scroller.getBoundingClientRect();
  check(scrollBounds.right <= shellBounds.right - 3 && scrollBounds.top >= shellBounds.top + 3
    && getComputedStyle(picker).overflow === 'hidden' && getComputedStyle(scroller.parentElement!).overflow === 'hidden',
    'The scrollbar stays inset inside both rounded clipping layers');
  const thumbStyle = getComputedStyle(scroller, '::-webkit-scrollbar-thumb');
  check(getComputedStyle(scroller, '::-webkit-scrollbar').width === '15px' && thumbStyle.borderLeftWidth === '6px'
    && thumbStyle.backgroundClip === 'padding-box' && scroller.clientWidth === 235
    && picker.querySelector<HTMLElement>('[role=option]')!.getBoundingClientRect().width === 227,
    'Flora Image reserves a 15px scrollbar gutter with a 3px visible thumb and 227px options');
  const flowViewport = document.querySelector<HTMLElement>('.react-flow__viewport')!;
  const transform = flowViewport.style.transform;
  flowViewport.style.transform = transform;
  scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  scroller.scrollTop = 90;
  await settle();
  check(document.querySelector('.image-mention-menu') === picker && scroller.scrollTop > 0,
    'Scrolling an ungenerated Image picker and rewriting the same viewport transform keep the picker open');
  // The result log sits above the canvas; let its newly appended line settle
  // before measuring whether keyboard navigation scrolls the page.
  await settle();
  const pageTop = document.documentElement.scrollTop;
  const prompt = document.querySelector<HTMLElement>('[data-id="a"] [role="textbox"]')!;
  prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
  await settle();
  const last = picker.querySelector<HTMLElement>('[aria-selected="true"]')!.getBoundingClientRect();
  check(last.bottom <= picker.getBoundingClientRect().bottom && document.documentElement.scrollTop === pageTop && flowViewport.style.transform === transform,
    'Keyboard scrolling keeps the selected row visible without scrolling or zooming the canvas');
  prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await settle();
  check(!document.querySelector('.image-mention-menu'), 'Escape still dismisses the Image picker');

  const groupId = 'auto-arrange-group';
  const groupMembers = [
    canvasImage('group-a', 420, 220), canvasImage('group-b', 420, 740), canvasImage('group-target', 1000, 360),
  ].map(node => ({ ...node, selected: true }));
  api.setNodes(groupSelectedNodes(groupMembers, groupId).map(node => ({ ...node, selected: node.id === groupId })));
  api.setEdges(groupMembers.slice(0, 2).map((node, index) => ({
    id: `${node.id}-target`, source: node.id, sourceHandle: 'result', target: 'group-target', targetHandle: `image-${index}`,
  })));
  await settle();
  const alignment = document.querySelector<HTMLButtonElement>('.canvas-group-toolbar [aria-label="对齐与分布"]')!;
  alignment.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await settle();
  const automatic = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find(item => item.textContent?.trim() === '自动整理')!;
  automatic.click();
  await settle();
  const [first, second, target] = groupMembers.map(node => api.getInternalNode(node.id)!);
  const firstPosition = first.internals.positionAbsolute;
  const secondPosition = second.internals.positionAbsolute;
  check(firstPosition.x === secondPosition.x && secondPosition.y - firstPosition.y === first.measured.height! + 64
    && target.internals.positionAbsolute.x - firstPosition.x === Math.max(first.measured.width!, second.measured.width!) + 64,
    'Group Auto stacks two upstream nodes without overlap and puts their shared target to the right');
  result.dataset.result = 'passed';
}
void run().catch(error => { result.dataset.result = 'failed'; result.textContent += `\nFAIL ${String(error)}`; });
