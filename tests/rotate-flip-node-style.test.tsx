import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { isRotateFlipNode, type AppNode } from '../src/nodes/types';
import { defaultRotateFlipSettings, rotateFlipRevision } from '../src/nodes/rotateFlip';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import '../src/index.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/RotateFlipNode.css';

let api: ReactFlowInstance<AppNode>;
const storage = new WorkflowStorage(`momoflow-rotate-flip-style-qa-${crypto.randomUUID()}`);
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes, edges, viewport: api.getViewport() })}</output>;
}
const rotate = createLibraryNode('rotate-flip', { x: 200, y: 30 })!;
rotate.id = 'rotate'; rotate.selected = false;
const saved: Workflow = { nodes: [rotate, { id: 'preview', type: 'preview', position: { x: 850, y: 30 }, data: {} }],
  edges: [], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' };
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><ReactFlowProvider><ModelTasksProvider>
  <Flow storage={storage} saved={saved} /><Probe />
</ModelTasksProvider></ReactFlowProvider></MotionConfig>);
const results = document.getElementById('results')!;
const checks: string[] = [];
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function pass(message: string) { checks.push(message); results.textContent = checks.map(item => `PASS ${item}`).join('\n'); }
function within<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(`[data-id="rotate"] ${selector}`); check(element, `Missing ${selector}`); return element;
}
function node() { const value = api.getNode('rotate'); check(value && isRotateFlipNode(value), 'Rotate node exists'); return value; }
async function until(test: () => boolean, message: string) { for (let i = 0; i < 240; i++) { if (test()) return; await settle(); } throw new Error(message); }
function key(element: HTMLElement, key: string, modifiers: KeyboardEventInit = {}) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }));
}
async function menu(action: string) { within<HTMLButtonElement>('.node-options-trigger').click(); await settle(); within<HTMLButtonElement>(`[data-action="${action}"]`).click(); await settle(); }
async function exported() { await until(() => Boolean(node().data.result) && node().data.outputRevision === rotateFlipRevision(node().data, node().data.baseImage?.id ?? ''), 'Current PNG export'); }
async function run() {
  await until(() => Boolean(document.querySelector('.rotate-flip-node-frame')), 'Rotate node mounts'); await document.fonts.ready;
  const frame = within('.node-frame'), preview = within('.rotate-flip-preview');
  check(frame.offsetWidth === 456 && frame.offsetHeight === 540, `456×540 frame, got ${frame.offsetWidth}×${frame.offsetHeight}`);
  check(preview.clientWidth === 424 && preview.clientHeight === 424, '424×424 empty preview');
  check(getComputedStyle(frame).backgroundColor === 'rgb(34, 34, 34)' && getComputedStyle(frame).borderRadius === '28px', 'Figma frame surface and corners');
  check(within('.rotate-flip-controls').offsetHeight === 28, '28px action row');
  const controls = Array.from(frame.querySelectorAll<HTMLButtonElement>('.rotate-flip-controls > button'));
  check(controls.map(button => button.offsetWidth).join() === '32,32,32,74', '32px action buttons and 74px reset');
  for (const image of frame.querySelectorAll('img')) {
    await until(() => image.complete && image.naturalWidth > 0, `Local SVG loads: ${image.src}`);
    check(image.getBoundingClientRect().width === Number(image.getAttribute('width')), 'Assets retain geometry');
  }
  const checker = new Image(); checker.src = '/rotate-flip-node/checkerboard.svg'; await checker.decode();
  check(checker.naturalWidth === 424 && checker.naturalHeight === 424, 'Figma checkerboard SVG dimensions');
  if (!frame.matches(':hover')) check(getComputedStyle(within('.node-port-label')).visibility === 'hidden', 'Idle port labels hidden');
  pass('Figma 尺寸、棋盘格、Hugeicons 与共享框架、端口');

  within<HTMLButtonElement>('.node-options-trigger').click(); await settle();
  const popup = within('[role="menu"]'), trigger = within('.node-options-trigger');
  const bounds = popup.getBoundingClientRect(), button = trigger.getBoundingClientRect();
  check(popup.offsetWidth === 150 && popup.offsetHeight === 177, '150×177 menu');
  check(Math.abs(bounds.right - button.right) < .1 && Math.abs(bounds.top - button.bottom - 6) < .1, 'Right aligned menu with 6px gap');
  check(within<HTMLButtonElement>('[data-action="save"]').disabled, 'Save remains disabled');
  const overlap = document.elementFromPoint(bounds.left + 20, bounds.top + 50);
  check(overlap && popup.contains(overlap), 'Menu stays above preview');
  key(popup, 'Escape'); await settle();
  check(!frame.querySelector('[role="menu"]') && document.activeElement === trigger, 'Escape closes and restores focus');
  await menu('lock'); check(controls.every(button => button.disabled), 'Lock disables all transforms');
  await menu('lock'); check(controls.every(button => !button.disabled), 'Unlock restores transforms');
  pass('右对齐菜单、预览上方层级、Escape、禁用保存与锁定');

  // Asymmetric native pixels catch swapped axes, clipping and accidental resampling.
  const source = document.createElement('canvas'); source.width = 3; source.height = 2;
  const context = source.getContext('2d')!;
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
  colors.forEach((color, index) => { context.fillStyle = color; context.fillRect(index % 3, Math.floor(index / 3), 1, 1); });
  api.updateNodeData('rotate', { baseImage: { id: 'orientation', name: 'orientation.png', kind: 'image', url: source.toDataURL(), width: 3, height: 2 } }); await exported();
  controls[0].click(); await until(() => node().data.settings.rotation === 90, 'Clockwise rotation commits'); await exported();
  check(node().data.result?.width === 2 && node().data.result?.height === 3, 'Rotation swaps full-size dimensions');
  const image = new Image(); image.src = node().data.result!.url; await image.decode();
  const output = document.createElement('canvas'); output.width = 2; output.height = 3;
  const target = output.getContext('2d')!; target.drawImage(image, 0, 0);
  const actual = target.getImageData(0, 0, 2, 3).data;
  const expected = [255,255,0,255, 255,0,0,255, 255,0,255,255, 0,255,0,255, 0,255,255,255, 0,0,255,255];
  check(actual.every((value, index) => value === expected[index]), 'PNG clockwise orientation and pixels');
  for (const button of controls) {
    button.focus(); key(button, 'z', { ctrlKey: true }); await until(() => node().data.settings.rotation === 0, 'Focused control passes undo');
    key(button, 'z', { ctrlKey: true, shiftKey: true }); await until(() => node().data.settings.rotation === 90, 'Focused control passes redo');
  }
  controls[1].click(); await until(() => node().data.settings.flipHorizontal, 'Horizontal flip');
  controls[2].click(); await until(() => node().data.settings.flipVertical, 'Vertical flip'); await exported();
  check(controls[1].getAttribute('aria-pressed') === 'true' && controls[2].getAttribute('aria-pressed') === 'true', 'Flip pressed state');
  controls[3].click(); await until(() => JSON.stringify(node().data.settings) === JSON.stringify(defaultRotateFlipSettings), 'Reset transforms'); await exported();
  check(!within<HTMLButtonElement>('[aria-label="Download rotated image"]').disabled, 'Native PNG can be downloaded');
  pass('实际 PNG 像素、旋转、双轴翻转、重置及四个按钮焦点下撤销/重做');
  api.updateNodeData('rotate', { baseImage: undefined }); await settle();
  results.dataset.result = 'passed';
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${String(error)}`; console.error(error); });
