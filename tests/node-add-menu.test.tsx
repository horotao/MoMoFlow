import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { nodeTypes } from '../src/nodes';
import type { AppNode } from '../src/nodes/types';
import { searchableNodeMenuEntries } from '../src/components/nodeMenuCatalog';
import { WorkflowStorage } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';

let api: ReactFlowInstance<AppNode>;
function Probe() { api = useReactFlow<AppNode>(); return null; }
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
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
const key = (element: HTMLElement, key: string, isComposing = false) => element.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing, bubbles: true, cancelable: true }));
const input = async (value: string) => {
  const field = find<HTMLInputElement>('.node-add-menu input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
};
const open = async () => { find<HTMLButtonElement>('.canvas-sidebar-add').click(); await settle(); };
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
  const toolIndicator = find('.canvas-sidebar-tool-indicator');
  check(getComputedStyle(toolIndicator).borderRadius === '16px' && getComputedStyle(toolIndicator).backgroundColor === 'rgb(56, 56, 56)'
    && Math.abs(toolIndicator.getBoundingClientRect().top - handTool.getBoundingClientRect().top) < 0.5, 'The active dock tool has an aligned 16px-radius selection background');
  selectTool.click(); await settle();
  check(selectTool.getAttribute('aria-pressed') === 'true' && find('.react-flow').classList.contains('canvas-tool-select'), 'Dock selection tool restores normal node interaction');
  await open();
  check(document.activeElement === main().querySelector('input'), 'Opening focuses search in StrictMode');
  const bounds = main().getBoundingClientRect();
  check(bounds.width === 216 && bounds.height === Math.min(456, innerHeight - 16), 'Compact menu dimensions: 216 × 456 with viewport clamping');
  check(getComputedStyle(main()).borderRadius === '14px', 'Compact menu has a 14px corner radius');
  check(main().querySelector('.node-add-menu-row')!.getBoundingClientRect().height === 32, 'Compact menu rows use a 32px height');
  const ids = searchableNodeMenuEntries.map(entry => entry.nodeId).sort();
  check(JSON.stringify(ids) === JSON.stringify(Object.keys(nodeTypes).sort()), 'Public nodes are searchable and retired Ideogram stays out of the menu');
  const dock = find('.canvas-sidebar').getBoundingClientRect();
  check(dock.width === 50 && dock.height === 338, 'Dock matches the Figma 50 × 338 geometry');
  check(document.querySelectorAll('.canvas-sidebar-button').length === 6, 'Dock retains all six design slots');
  const dockImages = Array.from(document.querySelectorAll<HTMLImageElement>('.canvas-sidebar img'));
  await Promise.all(dockImages.map(img => img.decode()));
  check(dockImages.every((img, index) => img.naturalWidth === (index === 0 ? 24 : 18) && img.offsetWidth === img.naturalWidth), 'Dock assets retain their original 24px and 18px layout widths');
  await input('model-input');
  check(menuNodeIds().length === 0, 'Dock keeps model-input hidden');
  await input('position-logger');
  check(menuNodeIds().length === 0, 'Dock keeps position-logger hidden');
  await input('Ideogram');
  check(menuNodeIds().length === 0, 'Searching Ideogram has no creation result');
  await input('');
  const images = Array.from(main().querySelectorAll<HTMLImageElement>('.node-add-menu-icon img'));
  await Promise.all(images.map(img => img.decode()));
  check(images.every(img => img.naturalWidth === 18 && img.getBoundingClientRect().width === 18 && img.getBoundingClientRect().height === 18), 'Figma row icons retain their original 18px geometry');
  check(['openai', 'gemini', 'jimeng', 'deepmind'].every(name => images.some(img => img.src.endsWith(`/${name}.svg`))), 'OpenAI, Gemini, Jimeng and DeepMind assets are present');
  find<HTMLButtonElement>('[title="Lyria 3（尚未接入）"]').click(); await settle();
  check(api.getNodes().length === 0, 'Unimplemented model entries cannot create placeholder nodes');

  key(find('.node-add-menu input'), 'Escape'); await settle();
  const imageModels = ['sunburst', 'nano-banana', 'seedream'];
  let lastCreationIds: string[] = [];
  for (const entry of searchableNodeMenuEntries) {
    const isImageModel = imageModels.includes(entry.nodeId!);
    await open(); await input(entry.nodeId!);
    find<HTMLButtonElement>(`.node-add-menu [data-node-id="${entry.nodeId}"]`).click(); await settle();
    if (isImageModel) {
      check(sub()?.getAttribute('aria-label') === entry.label && api.getNodes().length === 0, `Search opens the ${entry.label} submenu before creating a node`);
      find<HTMLButtonElement>(`.node-add-menu-submenu [data-choice-id="${entry.nodeId}"]`).click(); await settle();
    }
    const created = api.getNodes().at(-1);
    check(api.getNodes().length === (isImageModel ? 2 : 1) && created?.type === entry.nodeId && created?.selected, `Creates ${entry.nodeId} through the dock`);
    lastCreationIds = api.getNodes().map(node => node.id);
    if (isImageModel) check(api.getEdges().length === 1 && api.getEdges()[0].targetHandle === 'prompt', `Text-to-image adds one prompt wire for ${entry.label}`);
    check(!document.querySelector('.node-add-menu'), `Choosing ${entry.nodeId} dismisses the menu`);
    if (['text', 'file'].includes(entry.nodeId!)) await checkEntrance(created!.id, `Dock ${entry.nodeId}`);
    canvasHistoryShortcut('undo'); await settle();
    check(api.getNodes().length === 0, `Undo removes ${entry.nodeId} in one step`);
  }
  canvasHistoryShortcut('redo'); await settle();
  check(api.getNodes().map(node => node.id).join() === lastCreationIds.join(), 'Redo restores menu-created nodes');
  check(!document.querySelector('[data-node-entrance], .port-ripple'), 'Redo does not replay menu node entrance');
  await storage.save({ nodes: api.getNodes(), edges: api.getEdges(), colorMode: 'dark', viewport: api.getViewport() });
  const reader = new WorkflowStorage(database);
  const restored = await reader.load();
  check(restored?.nodes.map(node => node.id).join() === lastCreationIds.join() && restored.edges.length === api.getEdges().length, 'Menu-created nodes and edges survive IndexedDB save/restore');
  reader.dispose();

  canvasHistoryShortcut('undo'); await settle();
  for (const id of imageModels) {
    await open();
    const parent = find<HTMLButtonElement>(`.node-add-menu [data-node-id="${id}"]`);
    parent.focus(); key(parent, 'ArrowRight'); await settle();
    check(document.activeElement?.textContent?.trim() === '模型节点', `Keyboard opens the ${id} submenu on model-only creation`);
    key(document.activeElement as HTMLElement, 'ArrowDown'); await settle();
    check(document.activeElement?.textContent?.trim() === '文生图', `ArrowDown reaches text-to-image for ${id}`);
    key(document.activeElement as HTMLElement, 'ArrowDown'); await settle();
    const imageToImage = document.activeElement as HTMLButtonElement;
    check(imageToImage.textContent === '图生图', `ArrowDown reaches image-to-image for ${id}`);
    imageToImage.click(); await settle();
    const nodes = api.getNodes();
    const model = nodes.find(node => node.type === id);
    const prompt = nodes.find(node => node.type === 'text');
    const file = nodes.find(node => node.type === 'file');
    const edges = api.getEdges();
    check(nodes.length === 3 && model?.selected && prompt && !prompt.selected && file && !file.selected, `Image-to-image creates three nodes and selects ${id}`);
    check(edges.length === 2 && edges.some(edge => edge.source === prompt?.id && edge.target === model?.id && edge.targetHandle === 'prompt')
      && edges.some(edge => edge.source === file?.id && edge.sourceHandle === 'file' && edge.target === model?.id && edge.targetHandle === 'image-0'), `Image-to-image wires both inputs for ${id}`);
    canvasHistoryShortcut('undo'); await settle();
    check(api.getNodes().length === 0 && api.getEdges().length === 0, `One undo removes all of image-to-image for ${id}`);

    await open();
    const modelRow = find<HTMLButtonElement>(`.node-add-menu [data-node-id="${id}"]`);
    modelRow.focus(); key(modelRow, 'ArrowRight'); await settle();
    const modelOnly = document.activeElement as HTMLButtonElement;
    check(modelOnly.textContent === '模型节点', `Model-only creation is the first action for ${id}`);
    modelOnly.click(); await settle();
    const [standalone] = api.getNodes();
    check(api.getNodes().length === 1 && standalone?.type === id && standalone.selected && api.getEdges().length === 0,
      `Model-only creation selects ${id} without adding nodes or edges`);
    canvasHistoryShortcut('undo'); await settle();
    check(api.getNodes().length === 0, `One undo removes the standalone ${id}`);
    canvasHistoryShortcut('redo'); await settle();
    check(api.getNodes().length === 1 && api.getNodes()[0].id === standalone.id && api.getEdges().length === 0,
      `One redo restores the standalone ${id}`);
    canvasHistoryShortcut('undo'); await settle();
  }

  find('#results').dataset.result = 'passed';
  find('#results').textContent = `PASS · ${checks.length} checks\n${checks.join('\n')}`;
}
function menuNodeIds() { return Array.from(main().querySelectorAll<HTMLElement>('[data-node-id]')).map(element => element.dataset.nodeId); }
void run().catch(error => {
  find('#results').dataset.result = 'failed';
  find('#results').textContent = `FAIL\n${checks.join('\n')}\n${error instanceof Error ? error.stack : error}`;
});
