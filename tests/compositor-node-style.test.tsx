import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { isCompositorNode, type AppNode } from '../src/nodes/types';
import { defaultCompositorDocument } from '../src/nodes/compositor';
import { assetResources } from '../src/nodes/assetResources';
import { imageOutput } from '../src/nodes/sunburstRun';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import '../src/index.css';
import '../src/nodes/compositor/Compositor.css';

let api: ReactFlowInstance<AppNode>;
const storage = new WorkflowStorage(`momoflow-compositor-style-qa-${crypto.randomUUID()}`);
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes, edges, viewport: api.getViewport() })}</output>;
}
const compositor = createLibraryNode('compositor', { x: 180, y: 30 })!;
compositor.id = 'compositor'; compositor.selected = false;
const saved: Workflow = { nodes: [compositor, { id: 'preview', type: 'preview', position: { x: 800, y: 30 }, data: {} }],
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
const within = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`[data-id="compositor"] ${selector}`);
function node() { const value = api.getNode('compositor'); check(value && isCompositorNode(value), 'Compositor node missing'); return value; }
async function until(test: () => boolean, message: string) { for (let i = 0; i < 240; i++) { if (test()) return; await settle(); } throw new Error(message); }
function key(element: HTMLElement, key: string) { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }
async function run() {
  await until(() => Boolean(document.querySelector('[data-id="compositor"] .node-frame')), 'Compositor must mount');
  await document.fonts.ready;
  const frame = within('.node-frame'), preview = within('.compositor-node-preview');
  check(frame.offsetWidth === 456 && frame.offsetHeight === 540, '456×540 empty frame');
  check(preview.clientWidth === 424 && preview.clientHeight === 424, '424×424 empty preview');
  check(within('.compositor-add').offsetWidth === 110 && within('.compositor-edit').offsetWidth === 72 && within('.compositor-node-footer').offsetHeight === 28, 'Compact Add layer and Edit controls');
  check(getComputedStyle(frame).backgroundColor === 'rgb(34, 34, 34)' && getComputedStyle(frame).borderRadius === '28px', 'Shared dark frame and corners');
  for (const image of frame.querySelectorAll('img')) await until(() => image.complete && image.naturalWidth > 0, `Local SVG loads: ${image.src}`);
  const board = new Image(); board.src = '/compositor-node/checkerboard.svg'; await board.decode();
  check(board.naturalWidth === 424 && board.naturalHeight === 424, 'Local checkerboard is 424×424');
  check(frame.querySelectorAll('.node-port img').length === 3, 'Three shared image ports');
  const portY = (id: string) => within(`[data-handleid="${id}"]`).getBoundingClientRect().y;
  check(portY('layer-1') - portY('background') === 62 && portY('result') === portY('background'), 'Aligned output and 62px input spacing');
  pass('Figma 外框、预览、按钮、SVG 与端口尺寸');

  within<HTMLButtonElement>('.node-options-trigger').click(); await settle();
  const menu = within('[role="menu"]'), menuBox = menu.getBoundingClientRect(), buttonBox = within('.node-options-trigger').getBoundingClientRect();
  check(Math.abs(menuBox.right - buttonBox.right) < 1 && menuBox.top > buttonBox.bottom, 'Menu opens below and aligns right');
  check(document.elementFromPoint(menuBox.x + 20, menuBox.y + 20)?.closest('[role="menu"]') === menu, 'Menu paints above preview');
  check(within<HTMLButtonElement>('[data-action="save"]').disabled, 'Save remains disabled');
  key(menu, 'Escape'); await settle();
  check(!frame.querySelector('[role="menu"]') && document.activeElement === within('.node-options-trigger'), 'Escape dismisses and restores focus');
  within<HTMLButtonElement>('.node-options-trigger').click(); await settle();
  within<HTMLButtonElement>('[data-action="lock"]').click(); await settle();
  check(within<HTMLButtonElement>('.compositor-add').disabled && within('[data-handleid="background"]').classList.contains('connectable') === false, 'Lock disables adding layers and connecting');
  check(!within<HTMLButtonElement>('.compositor-edit').disabled, 'Locked editor remains viewable');
  within<HTMLButtonElement>('.node-options-trigger').click(); await settle();
  within<HTMLButtonElement>('[data-action="lock"]').click(); await settle();
  pass('更多菜单右对齐、覆盖预览、禁用保存、Esc 与锁定');

  within<HTMLButtonElement>('.compositor-add').click(); await settle();
  check(node().data.document.inputs.length === 3 && within('[data-handleid="layer-2"]'), 'Adding a layer creates the real input');
  for (let i = 0; i < 7; i++) { within<HTMLButtonElement>('.compositor-add').click(); await settle(); }
  const last = within('[data-handleid="layer-9"]').getBoundingClientRect();
  check(last.bottom < within('.compositor-node-footer').getBoundingClientRect().top, 'Many layer ports remain above footer');
  api.updateNodeData('compositor', { document: defaultCompositorDocument() }); await settle();
  check(frame.offsetHeight === 540, 'Removing inputs restores normal frame');
  pass('动态添加图层、端口更新与多层节点高度');

  const canvas = new OffscreenCanvas(640, 360), context = canvas.getContext('2d')!;
  context.fillStyle = '#aabbcc'; context.fillRect(0, 0, 640, 360);
  const asset = { id: crypto.randomUUID(), name: 'QA.png', kind: 'image' as const, width: 640, height: 360, url: assetResources.create(await canvas.convertToBlob()) };
  api.addNodes({ id: 'source', type: 'file', position: { x: -520, y: 30 }, data: { assets: [asset] } });
  api.setEdges([{ id: 'background', source: 'source', sourceHandle: 'file', target: 'compositor', targetHandle: 'background' },
    { id: 'result', source: 'compositor', sourceHandle: 'result', target: 'preview', targetHandle: 'file' }]);
  await until(() => Boolean(imageOutput(node(), 'result', api.getNodes(), api.getEdges())[0]?.width === 640), 'Wide input publishes original-size output');
  await until(() => preview.clientHeight === 239, 'Preview keeps document aspect ratio');
  check(within('[data-handleid="background"] .media-port-dot') && within('[data-handleid="result"] .media-port-dot'), 'Both connected ports show center dots');
  const output = imageOutput(node(), 'result', api.getNodes(), api.getEdges())[0];
  check(output?.width === 640 && output.height === 360, 'Output dimensions remain independent from preview');
  const bitmap = await createImageBitmap(await (await fetch(output.url)).blob());
  const outputCanvas = new OffscreenCanvas(640, 360), outputContext = outputCanvas.getContext('2d')!;
  outputContext.drawImage(bitmap, 0, 0); bitmap.close();
  check([...outputContext.getImageData(320, 180, 1, 1).data].join(',') === '170,187,204,255', 'Output pixels remain unchanged');
  pass('横图比例、连接圆点与原尺寸 PNG 像素');

  within<HTMLButtonElement>('.compositor-edit').click(); await settle();
  check(find('.compositor-editor').parentElement === document.body, 'Edit opens existing full-screen editor in body');
  find<HTMLButtonElement>('[aria-label="Close compositor"]').click(); await settle();
  check(!document.querySelector('.compositor-editor'), 'Editor closes normally');
  api.setEdges([]); api.deleteElements({ nodes: [{ id: 'source' }] });
  api.updateNodeData('compositor', { document: defaultCompositorDocument() });
  await settle();
  pass('原 Edit 编辑器打开与关闭');
  results.dataset.result = 'passed';
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${String(error)}`; console.error(error); });
