import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { nodeTypes } from '../src/nodes';
import type { AppNode } from '../src/nodes/types';
import { nodeMenuCategories, searchableNodeMenuEntries } from '../src/components/nodeMenuCatalog';
import { NodeAddMenu } from '../src/components/NodeAddMenu';
import { isInMenuTriangle } from '../src/components/useCascadeMenu';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';

let api: ReactFlowInstance<AppNode>;
function Probe() { api = useReactFlow<AppNode>(); return null; }
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const wait = async (ms: number, commit = true) => {
  await new Promise<void>(resolve => setTimeout(resolve, ms));
  // Timer callbacks schedule React updates; their DOM commit can happen after
  // another due timer's promise resumes, especially while a build is running.
  if (commit) await settle();
};
const find = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
const checks: string[] = [];
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  checks.push(message);
}
const main = () => find<HTMLDivElement>('.node-add-menu:not(.node-add-menu-submenu)');
const sub = () => document.querySelector<HTMLDivElement>('.node-add-menu-submenu');
const category = (id: string) => find<HTMLButtonElement>(`[data-main-row="${id}"]`);
const key = (element: HTMLElement, key: string, isComposing = false) => element.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing, bubbles: true, cancelable: true }));
const point = (element: HTMLElement, x?: number, y?: number) => {
  const bounds = element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x ?? bounds.left + bounds.width / 2, clientY: y ?? bounds.top + bounds.height / 2 }));
};
const input = async (value: string) => {
  const field = find<HTMLInputElement>('.node-add-menu input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
};
const open = async () => { find<HTMLButtonElement>('.canvas-sidebar-add').click(); await settle(); };
const expanded = (id: string) => category(id).getAttribute('aria-expanded') === 'true';
async function checkEntrance(id: string, label: string) {
  const frame = find(`[data-id="${id}"] .node-frame`);
  const box = frame.getBoundingClientRect();
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const samples: { scale: number; drift: number }[] = [];
  const started = performance.now();
  while (performance.now() - started < 400) {
    const current = frame.getBoundingClientRect();
    if (Number(getComputedStyle(frame).opacity) > 0.03) samples.push({
      scale: new DOMMatrixReadOnly(getComputedStyle(frame).transform).a,
      drift: Math.hypot(current.x + current.width / 2 - center.x, current.y + current.height / 2 - center.y),
    });
    await settle();
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  check(samples.length > 0 && (reduced ? samples.every(item => item.scale === 1) : samples.some(item => item.scale < 0.999))
    && samples.every(item => item.drift < 0.4), `${label} enters about its center with scale or reduced-motion fade`);
  check(!frame.hasAttribute('data-node-entrance') && Number(getComputedStyle(frame).opacity) === 1
    && api.getEdges().length === 0 && !document.querySelector('.port-ripple, .port-absorption'), `${label} settles without creating edges or port feedback`);
}

async function run() {
  const database = `momoflow-node-menu-qa-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(database);
  await storage.load();
  createRoot(find('#root')).render(<StrictMode><ReactFlowProvider><Flow storage={storage} saved={{ nodes: [], edges: [], colorMode: 'dark', viewport: { x: 0, y: 0, zoom: .75 } }} /><Probe /></ReactFlowProvider></StrictMode>);
  await settle();
  check(!document.querySelector('.canvas-dock-panel, .canvas-dock, [aria-label="画布比例"]'), 'Bottom Dock and its zoom controls are removed');
  const selectTool = find<HTMLButtonElement>('.canvas-sidebar [aria-label="选择工具"]');
  const handTool = find<HTMLButtonElement>('.canvas-sidebar [aria-label="抓手工具"]');
  handTool.click(); await settle();
  check(handTool.getAttribute('aria-pressed') === 'true' && selectTool.getAttribute('aria-pressed') === 'false' && find('.react-flow').classList.contains('canvas-tool-hand'), 'Dock hand selection updates the shared canvas tool');
  check(getComputedStyle(handTool).borderRadius === '16px' && getComputedStyle(handTool).backgroundColor === 'rgb(47, 47, 47)', 'The active dock tool has a 16px radius and a lighter background');
  selectTool.click(); await settle();
  check(selectTool.getAttribute('aria-pressed') === 'true' && find('.react-flow').classList.contains('canvas-tool-select'), 'Dock selection tool restores normal node interaction');
  await open();
  check(document.activeElement === main().querySelector('input'), 'Opening focuses search in StrictMode');
  const bounds = main().getBoundingClientRect();
  check(bounds.width === 216 && bounds.height === Math.min(456, innerHeight - 16), 'Compact menu dimensions: 216 × 456 with viewport clamping');
  check(getComputedStyle(main()).borderRadius === '14px', 'Compact menu has a 14px corner radius');
  check(main().querySelector('.node-add-menu-row')!.getBoundingClientRect().height === 32, 'Compact menu rows use a 32px height');
  const ids = searchableNodeMenuEntries.map(entry => entry.nodeId).sort();
  check(JSON.stringify(ids) === JSON.stringify(Object.keys(nodeTypes).filter(id => !['model-input', 'position-logger'].includes(id)).sort()), 'Public nodes are searchable; model-input and position-logger stay hidden');
  const categorized = Object.values(nodeMenuCategories).flatMap(groups => groups.flatMap(group => group.entries.map(entry => entry.id)));
  check(new Set(categorized).size === categorized.length && ids.every(id => ['sunburst', 'ideogram', 'nano-banana'].includes(id!) || categorized.includes(id!)), 'Every non-model node has one tool category');
  check(!categorized.some(id => ['model-input', 'position-logger'].includes(id)), 'Hidden helper nodes have no add-menu category');
  const dock = find('.canvas-sidebar').getBoundingClientRect();
  check(dock.width === 50 && dock.height === 338, 'Dock matches the Figma 50 × 338 geometry');
  check(document.querySelectorAll('.canvas-sidebar-button').length === 6, 'Dock retains all six design slots');
  const dockImages = Array.from(document.querySelectorAll<HTMLImageElement>('.canvas-sidebar img'));
  await Promise.all(dockImages.map(img => img.decode()));
  check(dockImages.every((img, index) => img.naturalWidth === (index === 0 ? 24 : 18) && img.getBoundingClientRect().width === img.naturalWidth), 'Dock assets retain their original 24px and 18px geometry');
  await input('model-input');
  check(menuNodeIds().length === 0, 'Dock keeps model-input hidden');
  await input('position-logger');
  check(menuNodeIds().length === 0, 'Dock keeps position-logger hidden');
  await input('');
  const images = Array.from(main().querySelectorAll<HTMLImageElement>('.node-add-menu-icon img'));
  await Promise.all(images.map(img => img.decode()));
  check(images.every(img => img.naturalWidth === 18 && img.getBoundingClientRect().width === 18 && img.getBoundingClientRect().height === 18), 'Figma row icons retain their original 18px geometry');
  check(['openai', 'gemini', 'ideogram', 'jimeng', 'deepmind'].every(name => images.some(img => img.src.endsWith(`/${name}.svg`))), 'OpenAI, Gemini, Ideogram, Jimeng and DeepMind assets are present');
  find<HTMLButtonElement>('[title="Seedance 2.0（尚未接入）"]').click(); await settle();
  check(api.getNodes().length === 0, 'Unimplemented model entries cannot create placeholder nodes');

  point(category('editing'));
  await wait(120, false);
  check(!sub(), 'Hover does not open a submenu before 220ms');
  await wait(150);
  check(expanded('editing') && Boolean(sub()), 'Hover opens after 220ms');
  await Promise.all(sub()!.getAnimations().map(animation => animation.finished.catch(() => {})));
  const editIcons = Array.from(sub()!.querySelectorAll<HTMLImageElement>('.node-add-menu-icon img'));
  await Promise.all(editIcons.map(img => img.decode()));
  check(editIcons.length === 10 && editIcons.every(img => img.naturalWidth === 18 && img.getBoundingClientRect().width === 18 && img.getBoundingClientRect().height === 18), 'All ten Figma editing icons retain their local asset and original geometry');
  check(sub()!.getBoundingClientRect().height === Math.min(376, innerHeight - 16), 'Compact submenu uses a viewport-bounded 376px height');
  const edit = category('editing').getBoundingClientRect();
  const helper = category('helpers').getBoundingClientRect();
  point(category('editing'), bounds.left + 30, edit.top + 18);
  point(category('helpers'), bounds.right - 24, helper.top + 18);
  await wait(300);
  check(expanded('editing'), 'Diagonal motion across the next row keeps the original submenu');
  await wait(950);
  check(expanded('helpers'), 'A stationary pointer switches rows after the 1.2s protection limit');

  category('editing').click(); await settle();
  point(category('editing'), bounds.left + 30, edit.top + 18);
  point(category('helpers'), bounds.right - 24, helper.top + 18);
  await wait(260);
  check(expanded('editing'), 'Protection remains active while the pointer stays in its triangle');
  point(category('helpers'), bounds.left + 10, helper.top + 18);
  await settle();
  check(expanded('helpers'), 'Leaving the triangle switches to the waiting row immediately');

  category('editing').click(); await settle();
  point(category('editing'), bounds.left + 30, edit.top + 18);
  point(category('helpers'), bounds.right - 24, helper.top + 18);
  await wait(260);
  point(category('helpers'), bounds.right - 70, helper.top + 18);
  await settle();
  check(expanded('helpers'), 'Reversing inside the old triangle immediately releases the waiting row');

  category('editing').click(); await settle();
  point(category('editing'), bounds.left + 30, edit.top + 18);
  point(document.body, bounds.left - 10, helper.top + 18);
  point(category('helpers'), bounds.left + 50, helper.top + 18);
  await wait(270);
  check(expanded('helpers'), 'Re-entering from outside uses normal hover timing, not a stale triangle');

  category('editing').click(); await settle();
  point(category('editing'), bounds.left + 30, edit.top + 18);
  point(category('helpers'), bounds.right - 24, helper.top + 18);
  await wait(260);
  point(category('helpers'), bounds.right - 24, helper.top + 20);
  await settle();
  check(expanded('helpers'), 'Vertical row navigation releases the old triangle');

  category('editing').click(); await settle();
  point(category('editing'), bounds.left + 30, edit.top + 18);
  point(category('helpers'), bounds.right - 24, helper.top + 18);
  await wait(100);
  point(sub()!);
  await wait(1150);
  check(expanded('editing'), 'Entering the submenu cancels the entire pending protected switch');

  key(find('.node-add-menu input'), 'Escape'); await settle(); await open();
  point(category('editing')); await wait(100);
  point(category('helpers')); await wait(100);
  point(category('editing')); await wait(120, false);
  check(!sub(), 'Quick A/B/A movement does not reuse a previous row hover deadline');
  await wait(140);
  check(expanded('editing'), 'Only the last hovered row opens after its own 220ms');

  key(find('.node-add-menu input'), 'Escape'); await settle(); await open();
  for (let index = 0; index < 80; index++) point(category(index % 2 ? 'helpers' : 'editing'));
  await wait(120, false);
  check(!sub(), 'A burst of pointer events does not prematurely open a submenu');
  await wait(140);
  check(expanded('helpers'), 'A burst leaves only the final row timer active');

  point(document.body, bounds.right + 4, helper.top + 18);
  await wait(180);
  point(sub()!);
  await wait(230);
  check(Boolean(sub()), 'Crossing the parent/submenu gap cancels the pending close');
  point(document.body, innerWidth - 10, innerHeight - 10);
  await wait(300, false);
  check(Boolean(sub()), 'Leaving keeps the submenu open for the 360ms grace period');
  await wait(100);
  check(!sub() && Boolean(main()), 'Leaving for 360ms closes only the submenu and preserves the main menu');
  category('editing').click(); await settle();
  point(document.body, innerWidth - 10, innerHeight - 10); await wait(100);
  point(main());
  point(document.body, innerWidth - 10, innerHeight - 10); await wait(280, false);
  check(Boolean(sub()), 'Rapid leave/re-enter/leave starts a fresh submenu close deadline');
  point(main()); await wait(100);
  check(Boolean(sub()), 'Re-entry near the close deadline prevents a late submenu close');
  key(find('.node-add-menu input'), 'Escape'); await settle();
  await open();
  point(category('editing')); await wait(50);
  key(find('.node-add-menu input'), 'Escape'); await wait(250);
  check(!document.querySelector('.node-add-menu'), 'Escape cancels pending hover timers');
  check(document.activeElement === document.querySelector('.canvas-sidebar-add'), 'Escape restores focus to the dock trigger');

  await open();
  category('editing').focus(); key(category('editing'), 'ArrowRight'); await settle();
  check(sub()?.contains(document.activeElement), 'ArrowRight opens and focuses the submenu');
  key(document.activeElement as HTMLElement, 'ArrowDown'); await settle();
  check(document.activeElement?.textContent === '合成器', 'ArrowDown navigates submenu items');
  key(document.activeElement as HTMLElement, 'ArrowLeft'); await settle();
  check(!sub() && document.activeElement === category('editing'), 'ArrowLeft returns to the category');
  key(category('editing'), 'ArrowRight'); await settle();
  key(document.activeElement as HTMLElement, 'Escape'); await settle();
  check(!sub() && Boolean(main()), 'Escape in a submenu returns to the main menu');
  await input('没有这个节点');
  check(main().textContent?.includes('没有匹配的节点'), 'Empty search reports no matches');
  await input('resize');
  check(menuNodeIds().join() === 'resize', 'English search finds existing nodes');
  await input('蒙版');
  check(menuNodeIds().length === 2, 'Chinese search includes nested tool categories');
  key(find('.node-add-menu input'), 'Enter', true); await settle();
  check(api.getNodes().length === 0, 'IME confirmation does not accidentally create a node');
  key(find('.node-add-menu input'), 'Escape'); await settle();

  for (const entry of searchableNodeMenuEntries.filter(entry => !['model-input', 'position-logger'].includes(entry.nodeId!))) {
    await open(); await input(entry.nodeId!);
    find<HTMLButtonElement>(`.node-add-menu [data-node-id="${entry.nodeId}"]`).click(); await settle();
    const created = api.getNodes().at(-1);
    check(api.getNodes().length === 1 && created?.type === entry.nodeId && created?.selected, `Creates ${entry.nodeId} through the dock`);
    check(!document.querySelector('.node-add-menu'), `Choosing ${entry.nodeId} dismisses the menu`);
    if (['text', 'router', 'file', 'sunburst'].includes(entry.nodeId!)) await checkEntrance(created!.id, `Dock ${entry.nodeId}`);
    canvasHistoryShortcut('undo'); await settle();
    check(api.getNodes().length === 0, `Undo removes ${entry.nodeId} in one step`);
  }
  canvasHistoryShortcut('redo'); await settle();
  check(api.getNodes().length === 1, 'Redo restores menu-created nodes');
  check(!document.querySelector('[data-node-entrance], .port-ripple'), 'Redo does not replay menu node entrance');
  await storage.save({ nodes: api.getNodes(), edges: [], colorMode: 'dark', viewport: api.getViewport() });
  const reader = new WorkflowStorage(database);
  const restored = await reader.load();
  check(restored?.nodes[0]?.id === api.getNodes()[0]?.id, 'Menu-created nodes survive IndexedDB save/restore');
  reader.dispose();

  const right = { left: 200, right: 432, top: 100, bottom: 500 };
  check(isInMenuTriangle({ x: 150, y: 250 }, { x: 100, y: 200 }, right), 'Triangle geometry includes diagonal movement to the right');
  check(!isInMenuTriangle({ x: 90, y: 250 }, { x: 100, y: 200 }, right), 'Triangle geometry excludes movement away from the child');
  check(isInMenuTriangle({ x: 150, y: 250 }, { x: 200, y: 200 }, { left: -132, right: 100, top: 100, bottom: 500 }), 'Triangle geometry supports a left-opening submenu');
  await open();
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await settle();
  check(!document.querySelector('.node-add-menu'), 'Clicking outside dismisses the menu');

  const pane = find('.react-flow__pane');
  const context = async (x: number, y: number) => {
    // React Flow also pans with button 2, so it opens context menus on a
    // stationary right-button release rather than a bare contextmenu event.
    const event = (type: string, buttons: number) => new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, button: 2, buttons, clientX: x, clientY: y,
    });
    pane.dispatchEvent(event('mousedown', 2));
    pane.dispatchEvent(event('mouseup', 0));
    await settle();
    // Geometry assertions below describe the settled menu, not an entry frame.
    await Promise.all(main().getAnimations().map(animation => animation.finished.catch(() => {})));
  };
  await open();
  await context(420, 90);
  check(document.querySelectorAll('.node-add-menu:not(.node-add-menu-submenu)').length === 1
    && find('.canvas-sidebar-add').getAttribute('aria-expanded') === 'false', 'Right-click replaces the dock menu');
  check(!document.querySelector('.connection-menu') && main().id === 'canvas-node-menu', 'Canvas right-click reuses the Figma node menu');
  check(main().getBoundingClientRect().left === 420 && main().getBoundingClientRect().top === 90, 'Context menu anchors at the click position');
  point(document.body, 420, 90);
  await wait(450);
  check(Boolean(main()) && document.activeElement === main().querySelector('input'), 'An outside pointer event at the opening corner does not dismiss the idle context menu');
  document.body.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: null }));
  await wait(450);
  check(Boolean(main()), 'Leaving the page with the pointer preserves the main context menu');
  category('editing').click(); await settle();
  point(document.body, 420, 90);
  await wait(450);
  check(!sub() && Boolean(main()), 'Context menu pointer departure collapses only its submenu');
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
  await settle();
  check(!document.querySelector('.node-add-menu'), 'An outside click still dismisses the context menu');
  await context(420, 90);
  window.dispatchEvent(new Event('blur')); await settle();
  check(!document.querySelector('.node-add-menu'), 'Window blur still dismisses the context menu');
  await context(420, 90);
  await input('resize');
  await context(420, 90);
  check(find<HTMLInputElement>('.node-add-menu input').value === '', 'Repeated right-click at the same position resets search');
  await input('resize');
  await context(450, 110);
  check(find<HTMLInputElement>('.node-add-menu input').value === '' && !sub(), 'Repeated right-click resets search and pending submenu state');
  const expected = api.screenToFlowPosition({ x: 450, y: 110 });
  const count = api.getNodes().length;
  await input('resize'); find<HTMLButtonElement>('.node-add-menu [data-node-id="resize"]').click(); await settle();
  const contextNode = api.getNodes().at(-1);
  check(contextNode?.type === 'resize' && contextNode.position.x === expected.x && contextNode.position.y === expected.y, 'Context-created nodes preserve the exact flow position under zoom');
  await checkEntrance(contextNode!.id, 'Canvas context menu');
  canvasHistoryShortcut('undo'); await settle();
  check(api.getNodes().length === count, 'Context creation is one undo step');
  await context(innerWidth - 10, innerHeight - 10);
  const clamped = main().getBoundingClientRect();
  check(clamped.right <= innerWidth - 8 && clamped.bottom <= innerHeight - 8, 'Context menu clamps to the viewport without changing creation coordinates');
  category('editing').click(); await settle();
  const leftChild = sub()!.getBoundingClientRect();
  check(leftChild.right < clamped.left, 'A context menu near the right edge opens its submenu to the left');
  const leftEdit = category('editing').getBoundingClientRect();
  const leftHelper = category('helpers').getBoundingClientRect();
  point(category('editing'), clamped.right - 30, leftEdit.top + 18);
  point(category('helpers'), clamped.left + 24, leftHelper.top + 18);
  await wait(270);
  check(expanded('editing'), 'Left-opening submenu protects diagonal movement across the next row');
  point(category('helpers'), clamped.left + 70, leftHelper.top + 18); await settle();
  check(expanded('helpers'), 'Reversal also releases protection for a left-opening submenu');
  await open();
  check(find('.canvas-sidebar-add').getAttribute('aria-expanded') === 'true' && document.querySelectorAll('.node-add-menu:not(.node-add-menu-submenu)').length === 1, 'Opening the dock replaces an existing context menu');
  key(find('.node-add-menu input'), 'Escape'); await settle();
  await context(420, 90);
  point(category('editing')); await wait(100);
  await context(460, 130); await wait(170);
  check(!sub(), 'Replacing a context menu cancels the old 220ms timer');
  key(find('.node-add-menu input'), 'Escape'); await wait(80);
  check(!document.querySelector('.node-add-menu'), 'Escape dismisses context menus with no leftover timer');

  api.setNodes([
    { id: 'qa-text', type: 'text', position: { x: 100, y: 80 }, data: { text: '菜单验收 · 提示词' } },
    { id: 'qa-router', type: 'router', position: { x: 820, y: 180 }, data: {} },
    { id: 'qa-position', type: 'position-logger', position: { x: 820, y: 380 }, data: { label: '拖动核对坐标' } },
  ]);
  await settle();
  const logger = find('[data-id="qa-position"]');
  const box = logger.getBoundingClientRect();
  const from = { x: box.left + 20, y: box.top + 12 };
  logger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1, button: 0, clientX: from.x, clientY: from.y }));
  for (let step = 1; step <= 5; step++) {
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window, buttons: 1, button: 0, clientX: from.x + step * 12, clientY: from.y + step * 6 }));
    await settle();
  }
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window, buttons: 0, button: 0, clientX: from.x + 60, clientY: from.y + 30 }));
  await settle();
  check(api.getNode('qa-position')!.position.x > 820 && logger.textContent?.includes(`${Math.round(api.getNode('qa-position')!.position.x)}px`), 'Node dragging still updates the stored position and visible coordinates');
  const filteredHost = document.createElement('div');
  document.body.append(filteredHost);
  const filteredRoot = createRoot(filteredHost);
  const renderFilteredMenu = (ids: string[]) => filteredRoot.render(<NodeAddMenu
    screen={{ x: 100, y: innerHeight - 100 }} mode="connect"
    choices={ids.map(id => ({ id, itemId: id }))} onChoose={() => {}} onDismiss={() => {}} />);
  renderFilteredMenu(['text', 'image-describer', 'router', 'text-iterator']);
  await settle();
  category('helpers').click(); await settle();
  const filteredHeight = sub()!.offsetHeight;
  const filteredViewport = sub()!.querySelector<HTMLElement>('.node-add-menu-scroll')!;
  check(filteredHeight === 212 && filteredViewport.scrollHeight === filteredViewport.clientHeight, 'Four filtered helpers fit their content and row spacing without empty space or scrolling');
  check(!sub()!.querySelector('[data-slot="scroll-area-thumb"]'), 'Content-sized submenu has no unnecessary scrollbar');
  renderFilteredMenu(['text']); await settle();
  check(sub()!.offsetHeight === 80, 'Submenu shrinks again when only one matching helper remains');
  renderFilteredMenu(['text', 'image-describer', 'router', 'text-iterator']); await settle();
  check(sub()!.offsetHeight === filteredHeight && sub()!.getBoundingClientRect().bottom <= innerHeight - 8, 'Growing submenu repositions to stay inside the viewport');
  filteredRoot.unmount(); filteredHost.remove();
  find('#results').dataset.result = 'passed';
  find('#results').textContent = `PASS · ${checks.length} checks\n${checks.join('\n')}`;
}
function menuNodeIds() { return Array.from(main().querySelectorAll<HTMLElement>('[data-node-id]')).map(element => element.dataset.nodeId); }
void run().catch(error => {
  find('#results').dataset.result = 'failed';
  find('#results').textContent = `FAIL\n${checks.join('\n')}\n${error instanceof Error ? error.stack : error}`;
});
