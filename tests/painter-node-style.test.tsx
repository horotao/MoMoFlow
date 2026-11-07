import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlowProvider, useEdges, useNodes, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { isPainterNode, type AppNode } from '../src/nodes/types';
import { painterRevision } from '../src/nodes/painter';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';

let api: ReactFlowInstance<AppNode>;
const storage = new WorkflowStorage(`momoflow-painter-style-qa-${crypto.randomUUID()}`);
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes, edges, viewport: api.getViewport() })}</output>;
}
const painter = createLibraryNode('painter', { x: 180, y: 70 })!;
painter.id = 'paint'; painter.selected = false;
const saved: Workflow = { nodes: [painter,
  { id: 'result', type: 'preview', position: { x: 820, y: 70 }, data: {} },
  { id: 'mask', type: 'preview', position: { x: 1370, y: 70 }, data: {} },
], edges: [
  { id: 'result-preview', source: 'paint', sourceHandle: 'result', target: 'result', targetHandle: 'file' },
  { id: 'mask-preview', source: 'paint', sourceHandle: 'mask', target: 'mask', targetHandle: 'file' },
], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' };
const root = createRoot(document.getElementById('root')!);
root.render(<MotionConfig reducedMotion="user"><ReactFlowProvider><ModelTasksProvider>
  <Flow storage={storage} saved={saved} /><Probe />
</ModelTasksProvider></ReactFlowProvider></MotionConfig>);
const checks: string[] = [];
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function pass(message: string) { checks.push(message); document.getElementById('results')!.textContent = checks.map(item => `PASS ${item}`).join('\n'); }
function find<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector); check(element, `Missing ${selector}`); return element;
}
const scope = '[data-id="paint"]';
const within = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`${scope} ${selector}`);
function node() { const value = api.getNode('paint'); check(value && isPainterNode(value), 'Painter node missing'); return value; }
async function until(test: () => boolean, message: string) {
  for (let index = 0; index < 180; index++) { if (test()) return; await settle(); }
  throw new Error(message);
}
function input(selector: string, value: string) {
  const element = find<HTMLInputElement>(selector);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
function tool(name: string) { within<HTMLButtonElement>(name === '重置' ? '.painter-reset' : `[aria-label="${name}"]`).click(); }
async function menu(action: string) {
  tool('更多选项'); await settle(); within<HTMLButtonElement>(`[data-action="${action}"]`).click(); await settle();
}
async function pixels(url: string, x: number, y: number) {
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
  return Array.from(context.getImageData(x, y, 1, 1).data);
}
async function exported() { await until(() => node().data.outputRevision === painterRevision(node().data) && Boolean(node().data.result), 'Painter must export the current revision'); }
async function run() {
  await until(() => Boolean(document.querySelector(`${scope} canvas`)) && Boolean(node().data.result), 'Painter must mount');
  await document.fonts.ready;
  const frame = within('.node-frame'), preview = within('.painter-preview');
  check(frame.offsetWidth === 456 && frame.offsetHeight === 656, '456×656 frame');
  check(preview.clientWidth === 424 && preview.clientHeight === 424, '424×424 drawing surface');
  check(getComputedStyle(frame).borderRadius === '28px' && getComputedStyle(preview).borderRadius === '14px', 'Shared 28/14px corners');
  check(!document.querySelector(`${scope} button[aria-label="画布"]`), 'Canvas tool removed');
  check(within('[role="toolbar"]').querySelectorAll('button').length === 4, 'Four tool buttons');
  check(within('[aria-label="画笔"]').offsetWidth === 28 && within('.painter-color-swatch').offsetWidth === 24, '28px tools and 24px color swatch');
  check((await pixels(node().data.result!.url, 0, 0))[3] === 0, 'New blank canvas exports transparent pixels');
  for (const img of within('.node-frame').querySelectorAll('img')) {
    await until(() => img.complete && img.naturalWidth > 0, `Load ${img.getAttribute('src')}`);
    check(img.width === (img.getAttribute('src')?.includes('port-') ? 32 : 18), 'Design SVG intrinsic dimensions');
  }
  pass('Figma 外框、画布、工具尺寸与本地 SVG；新建画布透明导出');
  for (const [label, icon] of [['矩形', 'rectangle'], ['圆形', 'ellipse'], ['三角形', 'triangle'], ['星形', 'star']]) {
    tool('形状菜单'); await settle();
    const popup = within('[aria-label="绘图形状"]'); check(popup.offsetWidth === 152 && popup.offsetHeight === 144, 'Shape menu geometry');
    Array.from(popup.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === label)!.click(); await settle();
    check(within<HTMLImageElement>('[aria-label="形状"] img').getAttribute('src') === `/painter-node/${icon}-active.svg`, 'Shape selection updates toolbar icon');
    check(!document.querySelector(`${scope} input[aria-label="大小"]`), 'Shape tool only exposes color');
  }
  tool('画笔'); await settle();
  input(`${scope} input[aria-label="大小"]`, '61'); input(`${scope} input[aria-label="硬度"]`, '73'); await settle();
  tool('橡皮擦'); await settle();
  check(within<HTMLInputElement>('input[aria-label="大小"]').value === '30', 'Eraser keeps independent size');
  input(`${scope} input[aria-label="大小"]`, '82'); await settle(); tool('画笔'); await settle();
  check(within<HTMLInputElement>('input[aria-label="大小"]').value === '61' && within<HTMLInputElement>('input[aria-label="硬度"]').value === '73', 'Brush settings survive tool switching');
  pass('四种形状、菜单选择与图标同步；画笔和橡皮擦参数独立');
  tool('颜色选择器'); await settle();
  const picker = find('[role="dialog"][aria-label="颜色选择器"]');
  check(picker.offsetWidth === 280 && picker.offsetHeight === 356, '280×356 color picker');
  check(getComputedStyle(picker).backgroundColor === 'rgb(34, 34, 34)', 'Color panel surface');
  check(find('.painter-design-picker .painter-color-area').clientWidth === 256 && find('.painter-design-picker .painter-color-area').clientHeight === 180, '256×180 saturation area');
  check(picker.querySelectorAll('.painter-picker-presets button').length === 7, 'Seven color presets');
  find<HTMLButtonElement>('[aria-label="使用颜色 #F87171"]').click(); await settle();
  check(within<HTMLInputElement>('input[aria-label="颜色"]').value === 'F87171', 'Preset synchronizes inline HEX');
  input('.painter-design-picker input[aria-label="十六进制颜色"]', '60a5fa'); await settle();
  check(within<HTMLInputElement>('input[aria-label="颜色"]').value === '60A5FA', 'Panel HEX synchronizes brush color');
  input('.painter-design-picker input[aria-label="颜色选择器不透明度"]', '37'); await settle();
  check(within<HTMLInputElement>('input[aria-label="颜色不透明度"]').value === '37', 'Panel opacity synchronizes inline opacity');
  input('.painter-design-picker input[aria-label="色相"]', '180'); await settle();
  check(within<HTMLInputElement>('input[aria-label="颜色"]').value !== '60A5FA', 'Hue slider changes actual color');
  picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  check(!document.querySelector('.painter-design-picker') && document.activeElement === within('.painter-color-swatch'), 'Escape closes picker and restores focus');
  tool('颜色选择器'); await settle(); find<HTMLButtonElement>('[aria-label="关闭颜色面板"]').click(); await settle();
  pass('颜色面板尺寸、七个预设、HEX / 色相 / 透明度双向同步与关闭焦点');
  const stroke = { tool: 'rectangle' as const, color: '#f87171', opacity: 1, size: .03, hardness: 1, points: [{ x: .2, y: .2 }, { x: .6, y: .6 }] };
  api.updateNodeData('paint', { strokes: [stroke] }); await until(() => node().data.strokes.length === 1, 'Drawing update must commit'); await exported();
  check(JSON.stringify(await pixels(node().data.result!.url, 400, 400)) === '[248,113,113,255]', 'Result preserves stroke color');
  check(JSON.stringify(await pixels(node().data.mask!.url, 400, 400)) === '[255,255,255,255]', 'Mask marks the same drawing region white');
  check((await pixels(node().data.alphaMask!.url, 400, 400))[3] === 0, 'Alpha mask preserves transparent edit region');
  tool('重置'); await until(() => node().data.strokes.length === 0, 'Reset clears drawing');
  canvasHistoryShortcut('undo'); await until(() => node().data.strokes.length === 1, 'Undo restores drawing');
  canvasHistoryShortcut('redo'); await until(() => node().data.strokes.length === 0, 'Redo resets drawing');
  await menu('lock'); check(within<HTMLFieldSetElement>('.painter-controls').disabled, 'Lock disables all tool controls');
  await menu('lock'); check(!within<HTMLFieldSetElement>('.painter-controls').disabled, 'Unlock restores controls');
  await until(() => Boolean(document.querySelector('[data-id="result"] canvas[aria-label="Live Painter Result preview"]')), 'Result preview remains connected');
  await until(() => Boolean(document.querySelector('[data-id="mask"] canvas[aria-label="Live Painter Mask preview"]')), 'Mask preview remains connected');
  await until(() => !document.querySelector('.workflow-save-error'), 'No save error');
  await new Promise(resolve => setTimeout(resolve, 500));
  const stored = await storage.load(); check(stored?.nodes.some(item => item.id === 'paint' && isPainterNode(item) && item.data.backgroundOpacity === 0), 'Save retains transparent Painter data');
  input(`${scope} input[aria-label="颜色"]`, 'ffffff'); input(`${scope} input[aria-label="颜色不透明度"]`, '100');
  input(`${scope} input[aria-label="大小"]`, '30'); input(`${scope} input[aria-label="硬度"]`, '100');
  pass('Result / 黑白与透明蒙版像素、重置撤销重做、锁定、下游预览与隔离保存');
  Object.assign(window, { painterQA: { api, storage } });
  const results = document.getElementById('results')!; results.dataset.result = 'passed'; results.textContent += `\n${checks.length} groups passed. Ready for pointer acceptance.`;
}
void run().catch(error => { const results = document.getElementById('results')!; results.dataset.result = 'failed'; results.textContent = `FAIL ${error instanceof Error ? error.message : String(error)}`; });
