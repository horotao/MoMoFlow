import { textToDocument } from '../src/nodes/textDocument';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { createModelTaskStore, ModelTasksContext } from '../src/components/useModelTasks';
import type { AppNode, ColorCorrectionNode, LevelsNode, SunburstNode, ImageDescriberNode, ModelInputNode, FileAsset } from '../src/nodes/types';
import type { PreviewTask } from '../src/nodes/taskQueue';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { assetResources } from '../src/nodes/assetResources';
import { colorLivePreviews } from '../src/nodes/colorCorrectionLivePreview';
import { levelsLivePreviews } from '../src/nodes/levelsLivePreview';
import { imageOutput } from '../src/nodes/sunburstRun';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/ColorCorrectionNode.css';
import '../src/nodes/LevelsNode.css';

let api: ReactFlowInstance<AppNode>;
const store = createModelTaskStore();
const types = ['color-correction', 'levels', 'image-describer', 'sunburst', 'ideogram', 'nano-banana', 'model-input'];
const names = ['色彩校正', '色阶', '图像描述', 'GPT', 'Ideogram', 'Nano Banana', '模型参数'];
const viewport = { x: 50, y: 140, zoom: .9 };
function Probe() {
  api = useReactFlow<AppNode>();
  return <div id="qa-controls">{types.map((type, index) => <button key={type} onClick={() => { void select(type); void api.setViewport({ ...viewport, x: 50 - index * 650 * viewport.zoom }); }}>{names[index]}</button>)}</div>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(predicate: () => boolean, message: string) { const deadline = performance.now() + 12000; while (!predicate()) { if (performance.now() > deadline) throw new Error(message); await settle(); } }
const checks: string[] = [];
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks.push(message); }
function find<T extends HTMLElement = HTMLButtonElement>(selector: string) { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element; }
const panel = '.node-settings-panel:not([inert])';
async function select(id: string) { api.setNodes(all => all.map(node => ({ ...node, selected: node.id === id }))); await settle(); }
async function click(selector: string) { find(selector).click(); await settle(); }
async function choose(label: string, text: string) { await click(`${panel} [role="combobox"][aria-label="${label}"]`); const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === text); check(option, `可选择 ${label}：${text}`); option.click(); await settle(); }
async function edit(label: string, value: string, key = 'Enter') { const input = find<HTMLInputElement>(`${panel} input[type="number"][aria-label="${label}"]`); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await settle(); input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); await settle(); }
async function drag(label: string, value: number) { const input = find<HTMLInputElement>(`${panel} input[type="range"][aria-label="${label}"]`); input.setPointerCapture = () => {}; input.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true })); Reflect.deleteProperty(input, 'setPointerCapture'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true })); await settle(); return input; }
const color = () => api.getNode('color-correction') as ColorCorrectionNode;
const levels = () => api.getNode('levels') as LevelsNode;
const sunburst = () => api.getNode('sunburst') as SunburstNode;
async function sample(): Promise<FileAsset> { const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; const ctx = canvas.getContext('2d')!; const gradient = ctx.createLinearGradient(0, 0, 640, 480); gradient.addColorStop(0, '#b9c8d6'); gradient.addColorStop(1, '#e7b88e'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = '#467577'; ctx.beginPath(); ctx.moveTo(0, 480); ctx.lineTo(260, 110); ctx.lineTo(640, 480); ctx.fill(); const blob = await new Promise<Blob>(resolve => canvas.toBlob(result => resolve(result!), 'image/png')); return { id: 'mountain', kind: 'image', name: '山间晨光.png', url: assetResources.create(blob), width: 640, height: 480 }; }
async function run() {
  const source = await sample();
  const originalFetch = window.fetch.bind(window); let requests = 0;
  window.fetch = async (input, init) => { const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url; if (path.startsWith('/api/') || /^https?:/.test(path)) { requests++; throw new Error('No provider calls in sidebar QA'); } return originalFetch(input, init); };
  const nodes = types.map((type, index) => ({ ...createLibraryNode(type, { x: index * 650, y: 0 })!, id: type, selected: index === 0 }));
  for (const node of nodes) { if (['color-correction', 'levels'].includes(node.id)) node.data = { ...node.data, baseImage: source } as AppNode['data']; }
  const workflow: Workflow = { nodes, edges: [], viewport, colorMode: new URLSearchParams(location.search).has('light') ? 'light' : 'dark' };
  const database = `momoflow-sidebar-qa-${crypto.randomUUID()}`, storage = new WorkflowStorage(database); await storage.load();
  const root = createRoot(find('#root'));
  root.render(<ReactFlowProvider><ModelTasksContext.Provider value={store}><Flow storage={storage} saved={workflow} /><Probe /></ModelTasksContext.Provider></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector(`${panel} input[aria-label="曝光"]`)) && Boolean(color().data.result && levels().data.result), 'Local renderers and sidebar load');
  check(getComputedStyle(find(panel)).width === '300px', '侧栏固定 300px');
  check(document.querySelectorAll(`${panel} input[type="range"]`).length === 7 && !document.querySelector('[data-id="color-correction"] input[type="range"]'), '七项调色参数只在侧栏');
  check(getComputedStyle(find(`${panel} .parameter-slider label`)).fontSize === '14px', '参数标签 14px');
  await api.setViewport({ ...viewport, zoom: .25 }); await settle(); check(getComputedStyle(find(panel)).width === '300px' && find(`${panel} input`).getBoundingClientRect().height === 28, '25% 缩放下侧栏和控件不变'); await api.setViewport(viewport);
  await edit('曝光', '.7'); await until(() => Boolean(color().data.outputRevision?.includes('0.7')), 'Color final output');
  check(color().data.result?.width === 640 && color().data.result?.height === 480, '调色保留原分辨率输出');
  const committedColor = color().data.outputRevision;
  await drag('曝光', 1.5); await until(() => Boolean(colorLivePreviews.get('color-correction')), 'Color live preview');
  check(color().data.settings.exposure === .7 && color().data.outputRevision === committedColor, '调色拖动只发布临时预览');
  await select('levels'); check(!colorLivePreviews.get('color-correction') && color().data.settings.exposure === .7, '切换节点清理调色草稿');
  check(document.querySelectorAll(`${panel} .parameter-slider`).length === 5 && Boolean(document.querySelector(`${panel} canvas[aria-label="RGB直方图"]`)), '色阶五项参数与真实直方图');
  check(find<HTMLInputElement>(`${panel} input[type="range"][aria-label="伽马"]`).value === '0', '中间调 1 位于对数滑轨中央');
  check(Math.abs(find(`${panel} .levels-histogram-plot`).getBoundingClientRect().width - 253) < .1, '色阶滚动时直方图保持 253px 宽');
  await edit('伽马', '.76'); await until(() => Boolean(levels().data.outputRevision?.includes('0.76')), 'Levels final output');
  await choose('通道', '红色'); await edit('输入黑点', '20');
  check(levels().data.channel === 'R' && levels().data.settings.R.inputMin === 20 && levels().data.settings.RGB.gamma === .76, '色阶保留独立通道和参数');
  const live = await drag('输入黑点', 45); await until(() => Boolean(levelsLivePreviews.get('levels')), 'Levels live preview');
  live.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  check(!levelsLivePreviews.get('levels') && levels().data.settings.R.inputMin === 20, '色阶 Escape 取消拖动');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(live, '55'); live.dispatchEvent(new Event('input', { bubbles: true })); live.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })); await settle(); check(levels().data.settings.R.inputMin === 20, 'Escape 后继续移动到松手不提交取消的拖动');
  await click(`${panel} [role="switch"]`);
  const paused = await drag('输入黑点', 35); check(!levelsLivePreviews.get('levels') && levels().data.settings.R.inputMin === 20, '关闭实时预览后拖动不发布临时帧');
  paused.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })); await settle();
  await until(() => Boolean(levels().data.outputRevision?.includes('35')), 'Preview off still commits');
  check(levels().data.settings.R.inputMin === 35 && levels().data.result?.width === 640, '关闭实时预览仍提交原尺寸结果');
  await drag('输入黑点', 50); await click(`${panel} [aria-label="关闭参数面板"]`);
  check(levels().data.settings.R.inputMin === 35 && !document.querySelector(`${panel} .levels-settings`), '关闭面板取消未提交草稿');
  await select('levels'); check(find('[role="switch"]').getAttribute('aria-checked') === 'false', '实时预览偏好在节点会话中保留');
  const gammaInput = find<HTMLInputElement>(`${panel} input[type="number"][aria-label="伽马"]`); await edit('伽马', '2', 'Escape'); check(gammaInput.value === '1', '数值 Escape 恢复原值');
  await drag('输入黑点', 70); api.updateNodeData('levels', { locked: true }); await settle(); check(levels().data.settings.R.inputMin === 35 && find<HTMLInputElement>(`${panel} input[type="range"]`).disabled, '锁定取消草稿并禁止编辑'); api.updateNodeData('levels', { locked: false }); await settle();
  find(`${panel} .node-settings-actions button`).click(); await settle(); check(levels().data.settings.R.inputMin === 0 && levels().data.settings.RGB.gamma === 1, '顶部重置覆盖所有色阶通道');
  await select('color-correction');
  const reopenedExposure = find<HTMLInputElement>(`${panel} input[type="range"][aria-label="曝光"]`);
  reopenedExposure.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(reopenedExposure, '.71');
  reopenedExposure.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  check(color().data.settings.exposure === .71, '取消拖动并重开侧栏后，方向键仍可修改曝光');
  canvasHistoryShortcut('undo'); await settle();
  await click(`${panel} [role="switch"]`); const noPreview = await drag('曝光', .9); check(!colorLivePreviews.get('color-correction'), '调色关闭实时预览有效'); noPreview.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })); await settle(); await until(() => Boolean(color().data.outputRevision?.includes('0.9')), 'Color preview-off final');
  const exposure = find<HTMLInputElement>(`${panel} input[type="range"][aria-label="曝光"]`);
  exposure.focus(); exposure.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await settle(); check(color().data.settings.exposure === .7, '焦点在侧栏滑块时支持撤销');
  exposure.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })); await settle(); check(color().data.settings.exposure === .9, '焦点在侧栏滑块时支持重做');
  const numberUndo = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
  find<HTMLInputElement>(`${panel} input[type="number"][aria-label="曝光"]`).dispatchEvent(numberUndo); await settle();
  check(!numberUndo.defaultPrevented && color().data.settings.exposure === .9, '数值输入保留原生文本撤销，不回退画布');
  const pendingNumber = find<HTMLInputElement>(`${panel} input[type="number"][aria-label="曝光"]`);
  pendingNumber.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(pendingNumber, '1.2'); pendingNumber.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  const nextDrag = await drag('曝光', 1.3); nextDrag.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })); await settle();
  check(color().data.settings.exposure === 1.3, '编辑曝光数值后首次拖动滑块即可提交');
  canvasHistoryShortcut('undo'); await settle(); canvasHistoryShortcut('undo'); await settle();
  await drag('曝光', 2); api.setNodes(all => all.map(node => ({ ...node, selected: ['levels', 'color-correction'].includes(node.id) }))); await settle(); check(color().data.settings.exposure === .9 && !colorLivePreviews.get('color-correction') && !document.querySelector(`${panel} .color-settings`), '多选取消草稿且不混用参数');
  for (const type of ['color-correction', 'levels']) {
    await select(type); await click(`[data-id="${type}"] [aria-label="更多选项"]`);
    const rename = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent?.trim() === '重命名')!;
    rename.click(); await settle();
    const name = find<HTMLInputElement>(`[data-id="${type}"] input[aria-label="节点名称"]`);
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); await settle();
    check(name.isConnected && document.activeElement === name, `${type} 中文输入法确认候选词不会结束重命名`);
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  }
  for (const type of ['sunburst', 'ideogram', 'nano-banana']) {
    await select(type); check(getComputedStyle(find(panel)).width === '300px', `${type} 共用 300px 外壳`);
    const label = type === 'sunburst' ? '画质' : '宽高比';
    await click(`${panel} [aria-label="将${label}设为输入"]`);
    const edge = api.getEdges().find(edge => edge.target === type && edge.targetHandle === (type === 'sunburst' ? 'quality' : 'aspectRatio'))!;
    await until(() => Boolean(document.querySelector(`[data-id="${edge.id}"] path`)), `${type} exposed edge renders`);
    check(Boolean(edge) && find<HTMLButtonElement>(`${panel} [role="combobox"][aria-label="${label}"]`).disabled, `${type} 参数设为输入并禁用本地控件`);
    const inputBox = find(`[data-id="${edge.source}"]`).getBoundingClientRect();
    const modelBox = find(`[data-id="${type}"]`).getBoundingClientRect();
    check(modelBox.left - inputBox.right >= 80, `${type} 设为输入后节点间保留连线间距、不重叠`);
    check([...document.querySelectorAll<HTMLElement>('.react-flow__node')].filter(element => element.dataset.id !== edge.source).every(element => {
      const box = element.getBoundingClientRect();
      return inputBox.right <= box.left || inputBox.left >= box.right || inputBox.bottom <= box.top || inputBox.top >= box.bottom;
    }), `${type} 新参数节点避开已有节点`);
    const upstream = type === 'sunburst' ? 'high' : '16:9'; api.updateNodeData(edge.source, { model: upstream }); await settle();
    check(find(`${panel} [role="combobox"][aria-label="${label}"]`).textContent?.includes(type === 'sunburst' ? '高' : upstream), `${type} 显示上游有效值`);
    await click(`${panel} [aria-label="${label}使用本地值"]`); check(!api.getEdges().some(item => item.id === edge.id) && !find<HTMLButtonElement>(`${panel} [role="combobox"][aria-label="${label}"]`).disabled, `${type} 收回输入保留有效值`);
  }
  await select('sunburst'); await choose('渠道商', 'OpenAI 官方');
  await choose('背景', '透明'); await choose('输出格式', 'JPEG'); check(sunburst().data.background === 'opaque', 'GPT 保留 JPEG 与背景联动');
  await choose('背景', '自动'); check(sunburst().data.background === 'auto', 'GPT 保留自动背景');
  await choose('宽高比', '1:1'); await choose('分辨率', '4K'); check(sunburst().data.size === '2880x2880', 'GPT 保留 4K 尺寸预设');
  const task: PreviewTask = { id: 'sidebar-task', batchId: 'sidebar-batch', nodeId: 'sunburst', model: 'GPT Image 2.5', state: 'Running', progress: 37, started: Date.now(), createdAt: Date.now() };
  store.update(() => [task]); await settle(); check(Boolean(document.querySelector(`${panel} .node-run-feedback[data-state="Running"]`)) && find<HTMLButtonElement>(`${panel} .describer-primary`).disabled, '侧栏保持运行状态并防止重复运行');
  store.update(all => all.map(task => ({ ...task, state: 'Failed', error: '模拟失败，可重试' }))); await settle(); check(find(`${panel} .node-run-feedback`).textContent?.includes('模拟失败'), '失败详情保持可见');
  await click(`${panel} .describer-panel-top button`); check(Boolean(document.querySelector('#task-manager')), '任务面板可打开');
  await click(`${panel} [aria-label="关闭参数面板"]`); check(store.getSnapshot().some(task => task.id === 'sidebar-task'), '关闭参数面板不清理任务'); await click('[aria-label="关闭任务面板"]');
  await select('image-describer'); await click(`${panel} [aria-label="Set system instructions as input"]`);
  const instructions = api.getEdges().find(edge => edge.target === 'image-describer' && edge.targetHandle === 'instructions')!;
  api.updateNodeData(instructions.source, { text: '中文指令：描述可见画面。', content: textToDocument('中文指令：描述可见画面。') }); await settle();
  check(find<HTMLTextAreaElement>('#describer-instructions').readOnly && find<HTMLTextAreaElement>('#describer-instructions').value === '中文指令：描述可见画面。', '系统指令设为输入读取上游文本');
  await click(`${panel} [aria-label="Set system instructions as input"]`); check((api.getNode('image-describer') as ImageDescriberNode).data.instructions === '中文指令：描述可见画面。', '收回系统指令保留上游值');
  api.setNodes(all => all.map(node => ({ ...node, selected: ['sunburst', 'nano-banana'].includes(node.id) }))); await settle(); check(Boolean(document.querySelector('[aria-label="批量运行"]')) && !document.querySelector(`${panel} .sunburst-settings`), '多选保留批量运行入口，参数不混用');
  store.update(() => []);
  await select('model-input'); const beforeOptions = (api.getNode('model-input') as ModelInputNode).data.options?.length ?? document.querySelectorAll(`${panel} input[type="radio"]`).length;
  await click(`${panel} .model-add-option`); check((api.getNode('model-input') as ModelInputNode).data.options!.length === beforeOptions + 1, '模型参数节点保留添加选项');
  const optionInput = find<HTMLInputElement>(`${panel} input[type="text"]`); optionInput.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(optionInput, '自定义模型'); optionInput.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  check((api.getNode('model-input') as ModelInputNode).data.options?.[0] === '自定义模型', '模型参数节点选项仍可编辑');
  for (const type of ['sunburst', 'ideogram', 'nano-banana', 'image-describer', 'model-input']) { await select(type); api.updateNodeData(type, { locked: true }); await settle(); check([...document.querySelectorAll<HTMLButtonElement>(`${panel} [role="combobox"], ${panel} .describer-expose`)].every(button => button.disabled), `${type} 锁定后参数与设为输入禁用`); api.updateNodeData(type, { locked: false }); await settle(); }
  const exposedEdges = [];
  for (const type of ['sunburst', 'ideogram', 'nano-banana']) {
    await select(type);
    await click(`${panel} [aria-label="将${type === 'sunburst' ? '画质' : '宽高比'}设为输入"]`);
    exposedEdges.push(api.getEdges().find(edge => edge.target === type)!);
  }
  await storage.save({ nodes: api.getNodes(), edges: api.getEdges(), viewport, colorMode: workflow.colorMode }); const saved = await storage.load();
  check((saved?.nodes.find(node => node.id === 'color-correction') as ColorCorrectionNode).data.settings.exposure === .9 && (saved?.nodes.find(node => node.id === 'sunburst') as SunburstNode).data.provider === 'openai', '保存恢复保留本地参数与模型渠道');
  await select('levels'); const deleted = api.getNode('levels')!; await drag('输入黑点', 80); api.setNodes(all => all.filter(node => node.id !== 'levels')); await settle(); check(!levelsLivePreviews.get('levels'), '删除节点清理预览资源'); api.addNodes({ ...deleted, selected: false }); await settle();
  await select('color-correction'); await until(() => Boolean(imageOutput(color(), 'result', api.getNodes(), api.getEdges())[0]), 'Committed output still available'); check(requests === 0, '验收无真实模型请求');
  const restored = await storage.load(); check(restored, '恢复已保存工作流');
  root.render(<ReactFlowProvider key="restored"><ModelTasksContext.Provider value={store}><Flow storage={storage} saved={restored} /><Probe /></ModelTasksContext.Provider></ReactFlowProvider>);
  await settle(); await select('color-correction'); await until(() => Boolean(document.querySelector(`${panel} input[aria-label="曝光"]`)) && Boolean(imageOutput(color(), 'result', api.getNodes(), api.getEdges())[0]), 'Restored renderer output');
  check(color().data.settings.exposure === .9 && find<HTMLInputElement>(`${panel} input[type="number"][aria-label="曝光"]`).value === '0.9' && find('[role="switch"]').getAttribute('aria-checked') === 'true', '重新挂载后恢复参数与有效输出，会话预览偏好重置');
  for (const edge of exposedEdges) {
    await select(edge.target);
    const field = edge.target === 'sunburst' ? '画质' : '宽高比';
    const value = edge.target === 'sunburst' ? '高' : '16:9';
    check(api.getEdges().some(item => item.id === edge.id && item.source === edge.source && item.targetHandle === edge.targetHandle)
      && find<HTMLButtonElement>(`${panel} [role="combobox"][aria-label="${field}"]`).disabled
      && find(`${panel} [role="combobox"][aria-label="${field}"]`).textContent?.includes(value), `${edge.target} 重挂载后保留参数输入连线、禁用状态和有效值`);
    check(find(`[data-id="${edge.target}"]`).getBoundingClientRect().left - find(`[data-id="${edge.source}"]`).getBoundingClientRect().right >= 80, `${edge.target} 恢复后输入节点仍不重叠`);
  }
  await select('color-correction');
  const result = find('#results'); result.dataset.result = 'passed'; result.textContent = `${checks.length} 项通过\n${checks.join('\n')}`;
  window.fetch = originalFetch;
}
void run().catch(error => { const result = find('#results'); result.dataset.result = 'failed'; result.textContent = `${checks.length} 项通过后失败：${String(error)}\n${checks.join('\n')}`; console.error(error); });
