import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { isLevelsNode, type AppNode } from '../src/nodes/types';
import { defaultLevelsSettings, levelsRevision } from '../src/nodes/levels';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/LevelsNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() { api = useReactFlow<AppNode>(); return null; }
const storage = new WorkflowStorage(`momoflow-levels-style-qa-${crypto.randomUUID()}`);
const levels = createLibraryNode('levels', { x: 200, y: 30 })!;
levels.id = 'levels'; levels.selected = false;
const saved: Workflow = { nodes: [levels, { id: 'preview', type: 'preview', position: { x: 800, y: 30 }, data: {} }],
  edges: [{ id: 'result-preview', source: 'levels', sourceHandle: 'result', target: 'preview', targetHandle: 'file' }],
  viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' };
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><ReactFlowProvider><ModelTasksProvider>
  <Flow storage={storage} saved={saved} /><Probe />
</ModelTasksProvider></ReactFlowProvider></MotionConfig>);
const results = document.getElementById('results')!;
const checks: string[] = [];
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function pass(message: string) { checks.push(message); results.textContent = checks.map(item => `PASS ${item}`).join('\n'); }
function find<T extends HTMLElement = HTMLElement>(selector: string): T { const element = document.querySelector<T>(selector); check(element, `Missing ${selector}`); return element; }
const within = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`[data-id="levels"] ${selector}`);
function node() { const value = api.getNode('levels'); check(value && isLevelsNode(value), 'Levels node missing'); return value; }
async function until(test: () => boolean, message: string) { for (let i = 0; i < 240; i++) { if (test()) return; await settle(); } throw new Error(message); }
function key(element: HTMLElement, key: string) { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }
function number(label: string, value: string, cancel = false) {
  const input = within<HTMLInputElement>(`input[aria-label="${label}"]`); input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return settle().then(() => { if (cancel) key(input, 'Escape'); else input.blur(); });
}
async function exported() { await until(() => node().data.outputRevision === levelsRevision(node().data, node().data.baseImage?.id ?? '') && Boolean(node().data.result), 'Current full-size result'); }
async function menu(action: string) { within<HTMLButtonElement>('[aria-label="更多选项"]').click(); await settle(); within<HTMLButtonElement>(`[data-action="${action}"]`).click(); await settle(); }
async function run() {
  await until(() => Boolean(document.querySelector('.levels-node-frame')), 'Levels mounts'); await document.fonts.ready;
  const frame = within('.node-frame'), preview = within('.levels-preview');
  check(frame.offsetWidth === 456 && frame.offsetHeight === 696, `456×696 frame, got ${frame.offsetWidth}×${frame.offsetHeight}`);
  check(preview.clientWidth === 424 && preview.clientHeight === 280, '424×280 empty preview');
  check(getComputedStyle(frame).borderRadius === '24px', '24px outer corners');
  check(within('.levels-histogram-plot').clientHeight === 128, '128px histogram');
  check(within<HTMLInputElement>('input[aria-label="伽马"]').value === '1.00', 'Two decimal Gamma');
  if (!frame.matches(':hover')) check(getComputedStyle(within('.node-port-label')).visibility === 'hidden', 'Idle port labels hidden');
  for (const image of frame.querySelectorAll('img')) {
    await until(() => image.complete && image.naturalWidth > 0, `Local asset ${image.src}`);
    check(Math.abs(image.getBoundingClientRect().width - Number(image.getAttribute('width'))) < .1, 'Assets retain intrinsic width');
  }
  pass('456×696 外框、424×280 预览、128px 直方图、本地 SVG 和默认端口状态');
  for (const [label, channel] of [['红', 'R'], ['绿', 'G'], ['蓝', 'B'], ['RGB', 'RGB']]) {
    within<HTMLButtonElement>('[role="combobox"]').click(); await settle();
    const popup = find('[aria-label="色阶通道"]'), trigger = within('[role="combobox"]');
    check(popup.offsetWidth === 116 && popup.offsetHeight === 128, '116×128 channel menu');
    check(getComputedStyle(find('.levels-channel-menu .is-active')).color === 'rgb(255, 255, 255)', 'Active option stays readable on dark surface');
    for (const image of popup.querySelectorAll('img')) {
      await until(() => image.complete && image.naturalWidth > 0, 'Menu SVG loads');
      check(Math.abs(image.getBoundingClientRect().width - Number(image.getAttribute('width'))) < .1, 'Menu SVG intrinsic width');
    }
    check(Math.abs(popup.getBoundingClientRect().top - trigger.getBoundingClientRect().bottom - 4) < .1, 'Menu below trigger');
    const option = Array.from(popup.querySelectorAll<HTMLElement>('[role="option"]')).find(item => item.textContent === label)!;
    option.click(); await settle();
    check(node().data.channel === channel && !document.querySelector('.levels-channel-menu'), 'Choose channel and close');
    check(within('.levels-histogram-heading').textContent === `直方图${label}`, 'Histogram channel label updates');
  }
  within<HTMLButtonElement>('[role="combobox"]').click(); await settle(); key(find('[aria-label="色阶通道"]'), 'Escape'); await settle();
  check(document.activeElement === within('[role="combobox"]'), 'Escape restores channel focus');
  pass('RGB / 红 / 绿 / 蓝切换、菜单位置和尺寸、Escape 焦点恢复');
  const source = document.createElement('canvas'); source.width = 320; source.height = 200;
  const context = source.getContext('2d')!; const gradient = context.createLinearGradient(0, 0, 320, 0); gradient.addColorStop(0, '#182038'); gradient.addColorStop(1, '#f8d496'); context.fillStyle = gradient; context.fillRect(0, 0, 320, 200);
  api.updateNodeData('levels', { baseImage: { id: 'levels-source', name: 'gradient.png', kind: 'image', url: source.toDataURL(), width: 320, height: 200 } }); await exported();
  check(node().data.result?.width === 320 && node().data.result?.height === 200, 'Original output dimensions');
  const originalUrl = node().data.result!.url;
  await number('伽马', '1.75'); await until(() => node().data.settings.RGB.gamma === 1.75, 'Gamma number commits'); await exported();
  check(node().data.result!.url !== originalUrl, 'Gamma produces a fresh output');
  canvasHistoryShortcut('undo'); await until(() => node().data.settings.RGB.gamma === 1, 'Undo Gamma');
  canvasHistoryShortcut('redo'); await until(() => node().data.settings.RGB.gamma === 1.75, 'Redo Gamma');
  await number('伽马', '2.50', true); await settle(); check(node().data.settings.RGB.gamma === 1.75, 'Escape cancels number edit');
  const gamma = within('[data-level-key="gamma"]'); key(gamma, 'ArrowRight'); await until(() => node().data.settings.RGB.gamma > 1.75, 'Arrow key adjusts Gamma');
  within<HTMLButtonElement>('[aria-label="重置色阶"]').click(); await until(() => JSON.stringify(node().data.settings) === JSON.stringify(defaultLevelsSettings), 'Reset all channels'); await exported();
  check(!within<HTMLButtonElement>('[aria-label="下载色阶图片"]').disabled, 'Download ready only after exact output');
  const compare = within('[aria-label="查看原图"]'); key(compare, ' '); await settle(); check(within<HTMLCanvasElement>('[aria-label="色阶预览"]').style.visibility === 'hidden', 'Hold compares source');
  compare.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); await settle(); check(within<HTMLCanvasElement>('[aria-label="色阶预览"]').style.visibility === '', 'Release restores output');
  check(preview.getBoundingClientRect().height === 265, 'Landscape preview follows 320×200 image ratio');
  for (const [width, height] of [[200, 320], [256, 256], [320, 200]]) {
    source.width = width; source.height = height;
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    api.updateNodeData('levels', { baseImage: { id: `levels-source-${width}-${height}`, name: 'gradient.png', kind: 'image', url: source.toDataURL() } });
    await until(() => node().data.baseImage?.id === `levels-source-${width}-${height}`, 'Image replacement commits');
    await exported();
    check(Math.abs(preview.getBoundingClientRect().height - 424 * height / width) < 1, 'Decoded portrait / square / landscape ratio fills preview');
    check(node().data.result?.width === width && node().data.result?.height === height, 'Adaptive preview preserves full-size output');
    const canvas = within<HTMLCanvasElement>('[aria-label="色阶预览"]');
    check(canvas.clientWidth === preview.clientWidth && canvas.clientHeight === preview.clientHeight, 'Image canvas fills the checkerboard');
  }
  pass('横图、竖图和方图根据实际解码尺寸适配棋盘格；输出保持原始尺寸');
  pass('真实图片输出、数值和键盘调节、撤销重做、取消编辑、Reset、原图对比、下载就绪');
  await menu('lock'); check(within<HTMLButtonElement>('[role="combobox"]').disabled && within<HTMLButtonElement>('[role="slider"]').disabled, 'Lock disables levels'); await menu('lock');
  await until(() => Boolean(document.querySelector('[data-id="preview"] img')), 'Connected Preview receives result');
  api.updateNode('levels', { selected: true }); await settle(); check(getComputedStyle(frame).borderColor === 'rgb(82, 82, 82)', 'Selected border');
  check(getComputedStyle(within('.node-port-label')).visibility === 'visible', 'Selected port labels visible');
  api.updateNode('levels', { selected: false });
  pass('共享更多菜单、锁定、下游 Preview、选中边框和端口名称');
  results.dataset.result = 'passed'; Object.assign(window, { levelsQA: { api, storage } });
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${String(error)}`; });
