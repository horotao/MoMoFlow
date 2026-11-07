import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { isBlendNode, type AppNode } from '../src/nodes/types';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import '../src/index.css';

let api: ReactFlowInstance<AppNode>;
const storage = new WorkflowStorage(`momoflow-blend-style-qa-${crypto.randomUUID()}`);
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes, edges, viewport: api.getViewport() })}</output>;
}
const blend = createLibraryNode('blend', { x: 180, y: 30 })!;
blend.id = 'blend'; blend.selected = false;
const saved: Workflow = { nodes: [blend, { id: 'preview', type: 'preview', position: { x: 800, y: 30 }, data: {} }],
  edges: [], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' };
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><ReactFlowProvider><ModelTasksProvider>
  <Flow storage={storage} saved={saved} /><Probe />
</ModelTasksProvider></ReactFlowProvider></MotionConfig>);
const results = document.getElementById('results')!;
const checks: string[] = [];
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function pass(message: string) { checks.push(message); results.textContent = checks.map(item => `PASS ${item}`).join('\n'); }
function find<T extends HTMLElement = HTMLElement>(selector: string): T { const element = document.querySelector<T>(selector); check(element, `Missing ${selector}`); return element; }
const within = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`[data-id="blend"] ${selector}`);
function node() { const value = api.getNode('blend'); check(value && isBlendNode(value), 'Blend node missing'); return value; }
async function until(test: () => boolean, message: string) { for (let i = 0; i < 180; i++) { if (test()) return; await settle(); } throw new Error(message); }
function key(element: HTMLElement, key: string) { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }
async function number(value: string, cancel = false) {
  const input = within<HTMLInputElement>('[aria-label="Opacity"]'); input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  if (cancel) key(input, 'Escape'); else input.blur();
  await settle();
}
async function run() {
  await until(() => Boolean(document.querySelector('[data-id="blend"] .node-frame')), 'Blend must mount');
  await document.fonts.ready;
  const frame = within('.node-frame'), preview = within('.blend-preview');
  check(frame.offsetWidth === 456 && frame.offsetHeight === 540, '456×540 empty frame');
  check(preview.clientWidth === 424 && preview.clientHeight === 424, '424×424 empty preview');
  check(within('.blend-controls').offsetHeight === 28 && within('[role="combobox"]').offsetWidth === 134, 'Compact horizontal parameter row');
  check(within<HTMLInputElement>('input[type="range"]').offsetWidth === 110 && within<HTMLInputElement>('[aria-label="Opacity"]').offsetWidth === 56, 'Compact shared slider and value');
  check(getComputedStyle(frame).backgroundColor === 'rgb(34, 34, 34)' && getComputedStyle(frame).borderRadius === '28px', 'Shared dark frame and corners');
  for (const image of frame.querySelectorAll('img')) await until(() => image.complete && image.naturalWidth > 0, `Local SVG loads: ${image.src}`);
  check(frame.querySelectorAll('.node-port img').length === 3, 'Three shared image ports');
  pass('Figma 外框、棋盘格、横排控件尺寸与共享端口');

  within<HTMLButtonElement>('[role="combobox"]').click(); await settle();
  let menu = find('.blend-mode-menu');
  check(menu.querySelectorAll('[role="option"]').length === 18 && menu.querySelectorAll('.has-separator').length === 5, '18 modes in six groups');
  check(menu.clientHeight <= 320 && menu.scrollHeight > menu.clientHeight && menu.offsetWidth === 176, 'Bounded scrollable menu');
  check(getComputedStyle(menu).backgroundColor === 'rgb(40, 40, 40)', 'Figma menu surface survives global theme CSS');
  key(menu, 'End'); await settle(); key(menu, 'Enter'); await settle();
  check(node().data.settings.mode === 'Luminosity', 'Keyboard selects last offscreen mode');
  within<HTMLButtonElement>('[role="combobox"]').click(); await settle(); menu = find('.blend-mode-menu');
  const selected = find('.blend-mode-menu [aria-selected="true"]').getBoundingClientRect(), bounds = menu.getBoundingClientRect();
  check(selected.top >= bounds.top && selected.bottom <= bounds.bottom, 'Reopen scrolls selected mode into view');
  check(bounds.top >= 12 && bounds.bottom <= window.innerHeight - 12, 'Popup remains inside viewport');
  key(menu, 'Escape'); await settle();
  check(document.activeElement === within('[role="combobox"]'), 'Escape returns focus to trigger');
  pass('18 种模式、菜单滚动、末项键盘选择与焦点恢复');

  await number('37 %'); check(node().data.settings.opacity === .37, 'Percent text commits');
  await number('84', true); check(node().data.settings.opacity === .37, 'Escape cancels value edit');
  await number('120'); check(node().data.settings.opacity === 1, 'Opacity clamps to 100 percent');
  key(within('[aria-label="Opacity slider"]'), 'ArrowLeft');
  within<HTMLButtonElement>('.node-options-trigger').click(); await settle();
  check(within<HTMLButtonElement>('[data-action="save"]').disabled, 'Save remains display-only');
  within<HTMLButtonElement>('[data-action="lock"]').click(); await settle();
  check(within<HTMLInputElement>('input[type="range"]').disabled && within<HTMLButtonElement>('[role="combobox"]').disabled, 'Lock disables parameters');
  within<HTMLButtonElement>('.node-options-trigger').click(); await settle();
  within<HTMLButtonElement>('[data-action="lock"]').click(); await settle();
  check(!within<HTMLInputElement>('input[type="range"]').disabled, 'Unlock restores shared slider');
  pass('百分比输入、取消、范围限制与共享更多菜单锁定');
  api.updateNodeData('blend', { settings: { mode: 'Normal', opacity: 1 } });
  await settle(); results.dataset.result = 'passed';
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${String(error)}`; console.error(error); });
