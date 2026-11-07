import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { isColorCorrectionNode, type AppNode } from '../src/nodes/types';
import { colorControls, colorRevision, defaultColorSettings } from '../src/nodes/colorCorrection';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/PreviewNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() { api = useReactFlow<AppNode>(); return null; }
const storage = new WorkflowStorage(`momoflow-color-style-qa-${crypto.randomUUID()}`);
const color = createLibraryNode('color-correction', { x: 200, y: 30 })!;
color.id = 'color'; color.selected = false;
const saved: Workflow = { nodes: [color, { id: 'preview', type: 'preview', position: { x: 800, y: 30 }, data: {} }],
  edges: [{ id: 'result-preview', source: 'color', sourceHandle: 'result', target: 'preview', targetHandle: 'file' }],
  viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' };
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><ReactFlowProvider><ModelTasksProvider>
  <Flow storage={storage} saved={saved} /><Probe />
</ModelTasksProvider></ReactFlowProvider></MotionConfig>);
const results = document.getElementById('results')!;
const checks: string[] = [];
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function pass(message: string) { checks.push(message); results.textContent = checks.map(item => `PASS ${item}`).join('\n'); }
function within<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(`[data-id="color"] ${selector}`); check(element, `Missing ${selector}`); return element;
}
function node() { const value = api.getNode('color'); check(value && isColorCorrectionNode(value), 'Color node missing'); return value; }
async function until(test: () => boolean, message: string) { for (let i = 0; i < 240; i++) { if (test()) return; await settle(); } throw new Error(message); }
function key(element: HTMLElement, key: string) { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }
async function number(label: string, value: string, cancel = false) {
  const input = within<HTMLInputElement>(`input[type="number"][aria-label="${label}"]`); input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  if (cancel) key(input, 'Escape'); else input.blur(); await settle();
}
async function exported() { await until(() => node().data.outputRevision === colorRevision(node().data, node().data.baseImage?.id ?? '') && Boolean(node().data.result), 'Current full-size result'); }
async function menu(action: string) { within<HTMLButtonElement>('[aria-label="更多选项"]').click(); await settle(); within<HTMLButtonElement>(`[data-action="${action}"]`).click(); await settle(); }
async function run() {
  await until(() => Boolean(document.querySelector('.color-node-frame')), 'Color mounts'); await document.fonts.ready;
  const frame = within('.node-frame'), preview = within('.color-image');
  check(frame.offsetWidth === 456 && preview.clientWidth === 424 && preview.clientHeight === 280, 'Shared 456px frame and 424×280 empty preview');
  check(getComputedStyle(preview).backgroundImage.includes('/image-node/checkerboard.svg'), 'Shared media checkerboard');
  check(within<HTMLInputElement>('input[type="range"]').disabled, 'No input disables editing');
  check(frame.querySelectorAll('.node-range-input').length === 7, 'All seven controls reuse the shared slider');
  if (!frame.matches(':hover')) check(getComputedStyle(within('.node-port-label')).visibility === 'hidden', 'Idle port labels hidden');
  for (const image of frame.querySelectorAll('img')) await until(() => image.complete && image.naturalWidth > 0, `Local asset ${image.src}`);
  pass('共享外框、滑块、菜单与端口；空状态和本地素材');
  const source = document.createElement('canvas'); source.width = 320; source.height = 200;
  const context = source.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 320, 0); gradient.addColorStop(0, '#182038'); gradient.addColorStop(1, '#f8d496');
  context.fillStyle = gradient; context.fillRect(0, 0, 320, 200);
  api.updateNodeData('color', { baseImage: { id: 'color-source', name: 'gradient.png', kind: 'image', url: source.toDataURL(), width: 320, height: 200 } }); await exported();
  for (const control of colorControls) {
    const value = control.key === 'exposure' ? .75 : 20;
    await number(control.label, String(value)); await until(() => node().data.settings[control.key] === value, `${control.label} commits`); await exported();
  }
  canvasHistoryShortcut('undo'); await until(() => node().data.settings.shadows === 0, 'Undo correction');
  canvasHistoryShortcut('redo'); await until(() => node().data.settings.shadows === 20, 'Redo correction');
  await number('曝光', '2.50', true); check(node().data.settings.exposure === .75, 'Escape cancels numeric edit');
  within<HTMLButtonElement>('[aria-label="重置色彩校正"]').click(); await until(() => JSON.stringify(node().data.settings) === JSON.stringify(defaultColorSettings), 'Reset all settings'); await exported();
  await until(() => !within<HTMLButtonElement>('[aria-label="下载校正图片"]').disabled, 'Exact output enables download');
  const bitmap = new Image(); bitmap.src = node().data.result!.url; await bitmap.decode();
  const output = document.createElement('canvas'); output.width = 320; output.height = 200; const outputContext = output.getContext('2d')!; outputContext.drawImage(bitmap, 0, 0);
  check(context.getImageData(160, 100, 1, 1).data.every((value, index) => value === outputContext.getImageData(160, 100, 1, 1).data[index]), 'Default output matches source pixels');
  const compare = within('[aria-label="查看原图"]'); key(compare, ' '); await settle(); check(within<HTMLCanvasElement>('canvas').style.visibility === 'hidden', 'Hold compares source');
  compare.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); await settle(); check(within<HTMLCanvasElement>('canvas').style.visibility === '', 'Release restores output');
  pass('七项参数提交、撤销重做、取消、重置、原图对比及输出像素');
  for (const [width, height] of [[200, 320], [256, 256], [320, 200]]) {
    source.width = width; source.height = height; context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    api.updateNodeData('color', { baseImage: { id: `color-source-${width}-${height}`, name: 'gradient.png', kind: 'image', url: source.toDataURL() } }); await exported();
    await until(() => Math.abs(preview.getBoundingClientRect().height - 424 * height / width) < 1, 'Decoded image ratio fills preview');
    check(node().data.result?.width === width && node().data.result?.height === height, 'Native output dimensions');
  }
  pass('横图、竖图与方图适配；输出保留原尺寸');
  await menu('lock'); check(within<HTMLInputElement>('input[type="range"]').disabled && within<HTMLInputElement>('input[type="number"]').disabled, 'Lock disables controls'); await menu('lock');
  await until(() => Boolean(document.querySelector('[data-id="preview"] img')), 'Downstream receives result');
  api.updateNode('color', { selected: true }); await settle(); check(getComputedStyle(frame).borderColor === 'rgb(82, 82, 82)', 'Shared selected border');
  check(getComputedStyle(within('.node-port-label')).visibility === 'visible', 'Selected port labels visible'); api.updateNode('color', { selected: false });
  pass('锁定、下游预览、选中边框和端口标签');
  results.dataset.result = 'passed'; Object.assign(window, { colorQA: { api, storage } });
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${String(error)}`; });
