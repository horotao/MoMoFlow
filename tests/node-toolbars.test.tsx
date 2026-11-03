import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { MaskInferenceContext, type MaskPredictor } from '../src/nodes/masksInference';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { assetResources } from '../src/nodes/assetResources';
import { imageOutput } from '../src/nodes/sunburstRun';
import type { AppNode, FileAsset, BlurNode, ResizeNode, CropNode, BlendNode, MatteGrowShrinkNode, PainterNode, MasksExtractorNode, CompareNode } from '../src/nodes/types';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/PainterNode.css';
import '../src/nodes/BlurNode.css';
import '../src/nodes/ResizeNode.css';
import '../src/nodes/CropNode.css';
import '../src/nodes/BlendNode.css';
import '../src/nodes/CompareNode.css';
import '../src/nodes/MatteGrowShrinkNode.css';
import '../src/nodes/ColorCorrectionNode.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/SunburstNode.css';

const types = ['painter', 'blur', 'resize', 'crop', 'blend', 'matte-grow-shrink', 'masks-extractor', 'compare'];
const labels = ['绘图', '模糊', '调整尺寸', '裁剪', '混合', '蒙版扩张', '蒙版提取', '对比'];
let api: ReactFlowInstance<AppNode>;
const viewport = { x: 120, y: 210, zoom: .8 };
function Probe() {
  api = useReactFlow<AppNode>();
  return <div id="qa-controls">{types.map((type, i) => <button key={type} onClick={() => { void focus(type); }}>{labels[i]}</button>)}<button onClick={() => { void api.zoomTo(.3); }}>30%</button><button onClick={() => { void api.zoomTo(1); }}>100%</button></div>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(predicate: () => boolean, message: string) { const deadline = performance.now() + 12000; while (!predicate()) { if (performance.now() > deadline) throw new Error(message); await settle(); } }
function find<T extends Element = HTMLElement>(selector: string) { const result = document.querySelector<T>(selector); if (!result) throw new Error(`Missing ${selector}`); return result; }
const checks: string[] = [];
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks.push(message); }
const shell = (id: string) => `.react-flow__node[data-id="${id}"]`;
const bar = (id: string) => `.react-flow__node-toolbar[data-id="${id}"]`;
const read = <T extends AppNode>(id: string) => api.getNode(id) as T;
const output = (id: string, handle = 'result') => imageOutput(api.getNode(id), handle, api.getNodes(), api.getEdges())[0];
async function select(id: string) { api.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === id }))); await settle(); }
async function focus(id: string) { await select(id); const node = api.getNode(id)!; await api.setViewport({ ...viewport, x: viewport.x - node.position.x * viewport.zoom, y: viewport.y - node.position.y * viewport.zoom }); await settle(); }
async function click(selector: string) { find<HTMLButtonElement>(selector).click(); await settle(); }
function key(element: HTMLElement, key: string, options: KeyboardEventInit = {}) { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })); }
async function edit(selector: string, value: string, finish = 'Enter') { const input = find<HTMLInputElement>(selector); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await settle(); key(input, finish); await settle(); }
async function draftRange(id: string, value: number) {
  const input = find<HTMLInputElement>(`${bar(id)} input[type="range"]`);
  input.setPointerCapture = () => {};
  input.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true }));
  Reflect.deleteProperty(input, 'setPointerCapture');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true })); await settle();
}
async function choose(id: string, label: string, value: string) { await click(`${bar(id)} [role="combobox"][aria-label="${label}"]`); const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === value); check(option, `${id}：可选择 ${value}`); option.click(); await settle(); }
async function sample(id: string, color: string): Promise<FileAsset> { const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240; const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 320, 240); ctx.fillStyle = '#e7e4d4'; ctx.beginPath(); ctx.arc(220, 80, 32, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#335c64'; ctx.beginPath(); ctx.moveTo(0, 240); ctx.lineTo(130, 55); ctx.lineTo(320, 240); ctx.fill(); const blob = await new Promise<Blob>(resolve => canvas.toBlob(result => resolve(result!), 'image/png')); return { id, kind: 'image', name: `${id}.png`, url: assetResources.create(blob), width: 320, height: 240 }; }
let holdMask = false, abortedMask = false;
const predict: MaskPredictor = async (_source, _point, options) => {
  options.onProgress({ stage: 'segmenting' });
  if (holdMask) await new Promise<void>((_resolve, reject) => options.signal.addEventListener('abort', () => { abortedMask = true; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true }));
  return { width: 4, height: 4, pixels: new Uint8Array([0,0,0,0,0,255,255,0,0,255,255,0,0,0,0,0]) };
};
async function pointMask() { const canvas = find<HTMLCanvasElement>(`${shell('masks-extractor')} canvas`), rect = canvas.getBoundingClientRect(); canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: rect.left + rect.width * .5, clientY: rect.top + rect.height * .5 })); await settle(); }
async function run() {
  const source = await sample('晨间山峰', '#89a8ae'), second = await sample('暖色山峰', '#c1a484');
  const originalFetch = window.fetch.bind(window); let requests = 0;
  window.fetch = async (input, init) => { const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url; if (path.startsWith('/api/') || /^https?:/.test(path)) { requests++; throw new Error('No external requests in toolbar QA'); } return originalFetch(input, init); };
  const nodes = types.map((type, i) => ({ ...createLibraryNode(type, { x: i * 650, y: 0 })!, id: type, selected: false }));
  for (const node of nodes) node.data = { ...node.data, baseImage: source } as AppNode['data'];
  const blend = nodes.find(node => node.id === 'blend') as BlendNode; blend.data = { ...blend.data, back: source, front: second };
  const compare = nodes.find(node => node.id === 'compare') as CompareNode; compare.data = { ...compare.data, input1: source, input2: second };
  const painter = nodes.find(node => node.id === 'painter') as PainterNode; painter.data = { ...painter.data, baseImage: undefined, width: 320, height: 240, background: '#89a8ae' };
  const workflow: Workflow = { nodes, edges: [], colorMode: new URLSearchParams(location.search).has('light') ? 'light' : 'dark', viewport };
  const database = `momoflow-toolbar-qa-${crypto.randomUUID()}`, storage = new WorkflowStorage(database); await storage.load();
  createRoot(find('#root')).render(<ReactFlowProvider><MaskInferenceContext.Provider value={predict}><Flow storage={storage} saved={workflow} /><Probe /></MaskInferenceContext.Provider></ReactFlowProvider>);
  await until(() => document.querySelectorAll('.tool-node-frame').length === 8, 'Eight tool shells mount');
  check(!document.querySelector('.node-parameter-toolbar'), '未选中时显示标题，无工具栏');
  for (const type of types) {
    await focus(type);
    const toolbar = find(`${bar(type)} .node-parameter-toolbar`), rect = toolbar.getBoundingClientRect();
    check(document.querySelectorAll('.node-parameter-toolbar').length === 1 && getComputedStyle(find(`${shell(type)} header`)).visibility === 'hidden', `${type}：单选显示工具栏并隐藏标题`);
    check(rect.height === 50 && getComputedStyle(find(`${shell(type)} .node-frame`)).width === '476px', `${type}：50px 屏幕工具栏及 400px 图片主体`);
    const bounds = api.getInternalNode(type)!.internals.handleBounds!;
    check([...bounds.source ?? [], ...bounds.target ?? []].every(handle => handle.x === 0 || Math.abs(handle.x + handle.width - 476) < .1), `${type}：端点锚点仍在外侧边缘`);
    await api.zoomTo(.25); await settle(); check(Math.abs(toolbar.getBoundingClientRect().width - rect.width) < .1 && toolbar.getBoundingClientRect().height === 50, `${type}：缩放至 25% 工具栏尺寸不变`);
    await click(`${bar(type)} [aria-label="关闭参数工具栏"]`);
    check(!document.querySelector(bar(type)) && getComputedStyle(find(`${shell(type)} header`)).visibility === 'visible' && api.getNode(type)!.selected, `${type}：关闭保留选中与内容，恢复标题`);
    find(`${shell(type)} .node-frame-title`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    check(Boolean(document.querySelector(bar(type))), `${type}：再次单击已选节点打开`);
  }
  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: ['blur', 'resize'].includes(node.id) }))); await settle(); check(!document.querySelector('.node-parameter-toolbar'), '多选收起单节点工具栏');
  await focus('blur'); await until(() => Boolean(output('blur')), 'Blur output ready');
  await choose('blur', 'Type', 'Box');
  await edit(`${bar('blur')} input[type="number"]`, '12'); await until(() => read<BlurNode>('blur').data.settings.size === 12 && Boolean(output('blur')), 'Blur commit');
  check(output('blur').width === 320 && output('blur').height === 240, '模糊迁移后仍输出原图尺寸');
  await edit(`${bar('blur')} input[type="number"]`, '55', 'Escape'); check(read<BlurNode>('blur').data.settings.size === 12, '数值 Escape 放弃草稿');
  canvasHistoryShortcut('undo'); await settle(); check(read<BlurNode>('blur').data.settings.size === 50, '模糊提交可一步撤销');
  await draftRange('blur', 75); check(read<BlurNode>('blur').data.settings.size === 50, '模糊拖动只更新草稿');
  await click(`${bar('blur')} [aria-label="关闭参数工具栏"]`); check(read<BlurNode>('blur').data.settings.size === 50, '关闭工具栏取消未提交的模糊草稿');
  await focus('resize'); await until(() => Boolean(output('resize')), 'Resize ready'); await edit(`${bar('resize')} [aria-label="Width"]`, '160'); await until(() => output('resize')?.width === 160, 'Resize output');
  check(read<ResizeNode>('resize').data.settings.height === 120 && output('resize').height === 120, '调整尺寸保留比例联动及真实输出');
  await click(`${bar('resize')} .resize-reset`); await until(() => output('resize')?.width === 320, 'Resize reset'); check(output('resize').height === 240, '调整尺寸重置仍可达');
  await focus('crop'); await until(() => Boolean(output('crop')), 'Crop ready'); await choose('crop', '宽高比', '1:1'); await until(() => output('crop')?.width === output('crop')?.height, 'Square crop');
  check(read<CropNode>('crop').data.aspectLocked, '裁剪比例预设保持锁定'); await click(`${bar('crop')} .crop-free`); check(!read<CropNode>('crop').data.aspectLocked, '自由裁剪只解除比例，不清空选区');
  await edit(`${bar('crop')} [aria-label="裁剪宽度"]`, '120'); await until(() => output('crop')?.width === 120, 'Crop dimension'); check(output('crop').height === 240, '裁剪宽高输入仍生成原生像素');
  await click(`${bar('crop')} .crop-reset`); check(read<CropNode>('crop').data.rect.width === 1, '裁剪重置保留');
  await focus('blend'); await until(() => Boolean(output('blend')), 'Blend ready'); await choose('blend', 'Mode', 'Multiply'); await edit(`${bar('blend')} [aria-label="Opacity"]`, '35%'); await until(() => Boolean(output('blend')), 'Blend commit');
  check(read<BlendNode>('blend').data.settings.opacity === .35 && output('blend').width === 320, '混合模式与透明度保持原生输出');
  await draftRange('blend', 70); await select('crop'); await select('blend'); check(find<HTMLInputElement>(`${bar('blend')} [aria-label="Opacity"]`).value === '35%', '切换节点放弃混合草稿，不串入下一节点');
  await focus('matte-grow-shrink'); await until(() => Boolean(output('matte-grow-shrink')), 'Matte ready'); await edit(`${bar('matte-grow-shrink')} input[type="number"]`, '-12'); await until(() => Boolean(output('matte-grow-shrink')), 'Matte commit'); check(read<MatteGrowShrinkNode>('matte-grow-shrink').data.settings.size === -12, '蒙版扩张保留负数收缩');
  await focus('compare'); await choose('compare', 'Mode', 'Toggle'); check(read<CompareNode>('compare').data.mode === 'toggle' && Boolean(document.querySelector(`${shell('compare')} .compare-toggle`)), '对比保留按住查看模式');
  await choose('compare', 'Mode', 'Slider'); api.updateNodeData('compare', { split: .2 }); await settle(); await click(`${bar('compare')} .compare-reset`); check(read<CompareNode>('compare').data.split === .5, '对比分割位置重置为 50%');
  await focus('masks-extractor'); await choose('masks-extractor', '选区模式', '添加'); await choose('masks-extractor', '选区模式', '减去'); await choose('masks-extractor', '选区模式', '选择'); await pointMask(); await until(() => Boolean(output('masks-extractor', 'mask')), 'Mask generated');
  check(Boolean(output('masks-extractor')) && output('masks-extractor', 'mask').width === 320, '提取蒙版保留透明抠图和黑白蒙版双输出');
  holdMask = true; await click(`${bar('masks-extractor')} .masks-recalculate`); await until(() => Boolean(document.querySelector('.masks-progress')), 'Mask pending'); const maskBefore = read<MasksExtractorNode>('masks-extractor').data.selection?.id; key(find(`${bar('masks-extractor')} [role="combobox"]`), 'Escape'); await settle();
  check(abortedMask && !document.querySelector('.masks-progress') && read<MasksExtractorNode>('masks-extractor').data.selection?.id === maskBefore, '蒙版重算可从工具栏 Escape 取消且保留选区'); holdMask = false;
  await click(`${bar('masks-extractor')} [aria-label="清空选区"]`); check(!output('masks-extractor'), '清空选区操作可达'); canvasHistoryShortcut('undo'); await settle(); await until(() => Boolean(output('masks-extractor')), 'Restore mask');
  await focus('painter'); await until(() => Boolean(output('painter')), 'Painter ready');
  await click(`${bar('painter')} [aria-label="画笔设置"]`); check(Boolean(document.querySelector('.node-toolbar-popover [aria-label="硬度"]')), '绘图弹层保留大小、硬度及不透明度');
  await edit('.node-toolbar-popover [aria-label="硬度"]', '42'); key(find('.node-toolbar-popover'), 'Escape'); await settle();
  await click(`${bar('painter')} [aria-label="形状菜单"]`); check(document.querySelectorAll('.node-toolbar-shapes button').length === 4, '绘图保留四种形状'); key(find('.node-toolbar-popover'), 'Escape'); await settle();
  await click(`${bar('painter')} [aria-label="颜色选择器"]`); check(Boolean(document.querySelector('.painter-color-popover [aria-label="十六进制颜色"]')), '颜色弹层保留 HEX 和透明度'); key(find('.painter-color-popover'), 'Escape'); await settle();
  await click(`${bar('painter')} [aria-label="画布"]`); await edit('.node-toolbar-popover [aria-label="宽度"]', '400'); check(read<PainterNode>('painter').data.width === 400 && read<PainterNode>('painter').data.height === 300, '画布尺寸和比例锁定仍可调整'); key(find('.node-toolbar-popover'), 'Escape'); await settle();
  await click(`${bar('painter')} [aria-label="画笔"]`);
  const canvas = find<HTMLCanvasElement>(`${shell('painter')} canvas`), box = canvas.getBoundingClientRect(); canvas.setPointerCapture = () => {};
  canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, bubbles: true, clientX: box.left + 50, clientY: box.top + 60 })); canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, bubbles: true, clientX: box.left + 120, clientY: box.top + 150 })); canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })); Reflect.deleteProperty(canvas, 'setPointerCapture'); await settle();
  check(read<PainterNode>('painter').data.strokes.length === 1 && read<PainterNode>('painter').data.strokes[0].hardness === .42, '绘图工具栏参数用于真实笔画');
  await click(`${bar('painter')} [aria-label="撤销"]`); check(read<PainterNode>('painter').data.strokes.length === 0, '绘图撤销复用画布历史'); await click(`${bar('painter')} [aria-label="重做"]`); check(read<PainterNode>('painter').data.strokes.length === 1, '绘图重做恢复笔画');
  for (const type of types) { await focus(type); api.updateNodeData(type, { locked: true }); await settle(); check([...document.querySelectorAll<HTMLInputElement>(`${bar(type)} input,${bar(type)} [role="combobox"]`)].every(input => input.disabled || input.matches(':disabled')), `${type}：锁定后参数输入禁用`); api.updateNodeData(type, { locked: false }); await settle(); }
  await focus('painter'); await api.setViewport({ x: -160, y: 5, zoom: .25 }); await settle(); const edgeRect = find('.node-parameter-toolbar').getBoundingClientRect(); check(edgeRect.left >= 7.9 && edgeRect.top >= 7.9 && edgeRect.right <= innerWidth - 7.9, '工具栏在低缩放及窗口边缘保持可用');
  check(requests === 0, '未请求真实模型或远程素材');
  const beforeMove = api.getNode('painter')!.position;
  api.updateNode('painter', { position: { x: beforeMove.x + 2200, y: beforeMove.y + 600 } }); await settle();
  const moved = find('.node-parameter-toolbar').getBoundingClientRect(); check(moved.left > 8 && moved.top > 8, '移动节点后工具栏重新定位，不滞留窗口边缘');
  api.updateNode('painter', { position: beforeMove }); await settle();
  await storage.save({ nodes: api.getNodes(), edges: api.getEdges(), viewport, colorMode: workflow.colorMode });
  const saved = await storage.load(); check(saved?.nodes.length === 8 && (saved.nodes.find(node => node.id === 'painter') as PainterNode).data.strokes.length === 1, '保存恢复保留八类节点的参数与绘图数据');
  await focus('painter'); await api.setViewport({ x: 160, y: 210, zoom: .9 });
  const results = find<HTMLElement>('#results'); results.dataset.result = 'passed'; results.textContent = `${checks.length} checks passed\n${checks.join('\n')}`;
}
void run().catch(error => { const result = find<HTMLElement>('#results'); result.dataset.result = 'failed'; result.textContent = `FAIL after ${checks.length}: ${error.message}\n${error.stack}`; console.error(error); });
