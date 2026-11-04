import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { createLibraryNode } from '../src/components/libraryCatalog';
import type { AppNode, FileAsset, FileNode, ModelInputNode, RotateFlipNode } from '../src/nodes/types';
import { isInvertNode, isRotateFlipNode, isColorPaletteNode, isCompositorNode } from '../src/nodes/types';
import { imageOutput } from '../src/nodes/sunburstRun';
import { assetResources } from '../src/nodes/assetResources';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/InvertNode.css';
import '../src/nodes/RotateFlipNode.css';
import '../src/nodes/ColorPaletteNode.css';
import '../src/nodes/compositor/Compositor.css';

let api: ReactFlowInstance<AppNode>;
const viewport = { x: 85, y: 100, zoom: .46 };
function Probe() {
  api = useReactFlow<AppNode>(); const nodes = useNodes<AppNode>();
  return <><output id="qa-state">{JSON.stringify(nodes.map(({ id, position }) => ({ id, position })))}</output><div id="qa-controls">
    <button onClick={() => { void api.setViewport(viewport); }}>整体预览</button>
    <button onClick={() => { void api.setViewport({ x: 85, y: -470, zoom: 1 }); }}>路由与参数 100%</button>
    <button onClick={() => { void api.setViewport({ x: -430, y: 100, zoom: 1 }); }}>旋转与反相 100%</button>
  </div></>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(predicate: () => boolean, message: string) {
  const deadline = performance.now() + 10000;
  while (!predicate()) { if (performance.now() > deadline) throw new Error(message); await settle(); }
}
function find<T extends HTMLElement = HTMLElement>(selector: string) { const result = document.querySelector<T>(selector); if (!result) throw new Error(`Missing ${selector}`); return result; }
const checks: string[] = [];
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks.push(message); }
const output = (id: string) => imageOutput(api.getNode(id), id === 'palette' ? 'image' : 'result', api.getNodes(), api.getEdges())[0];
const rotation = () => (api.getNode('rotate') as RotateFlipNode).data.settings;
async function rename(id: string, value: string) {
  find<HTMLButtonElement>(`[data-id="${id}"] [aria-label="更多选项"]`).click(); await settle();
  [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.includes('重命名'))!.click(); await settle();
  const input = find<HTMLInputElement>(`[data-id="${id}"] [aria-label="节点名称"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); await settle(); return input;
}
async function pixel(asset: FileAsset) {
  const image = new Image(); image.src = asset.url; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0); return [...ctx.getImageData(0, 0, 1, 1).data].join(',');
}
async function run() {
  const sourceCanvas = document.createElement('canvas'); sourceCanvas.width = 640; sourceCanvas.height = 480;
  const ctx = sourceCanvas.getContext('2d')!; ctx.fillStyle = '#b9c8d6'; ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = '#467577'; ctx.beginPath(); ctx.moveTo(0, 480); ctx.lineTo(260, 110); ctx.lineTo(640, 480); ctx.fill();
  const blob = await new Promise<Blob>(resolve => sourceCanvas.toBlob(value => resolve(value!), 'image/png'));
  const source: FileAsset = { id: 'mountain', kind: 'image', name: '山间晨光.png', url: assetResources.create(blob), width: 640, height: 480 };
  const originalFetch = window.fetch.bind(window); let providerCalls = 0;
  window.fetch = async (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (path.startsWith('/api/') || /^https?:/.test(path)) { providerCalls++; throw new Error('No provider requests in final QA'); }
    return originalFetch(input, init);
  };
  const specs = [['file', 'file', 0, 50], ['invert', 'invert', 560, 50], ['rotate', 'rotate-flip', 1120, 50], ['preview', 'preview', 1680, 50], ['router', 'router', 0, 550], ['model', 'model-input', 560, 550], ['palette', 'color-palette', 1120, 550], ['compositor', 'compositor', 1680, 550]] as const;
  const nodes: AppNode[] = specs.map(([id, type, x, y]) => ({ ...createLibraryNode(type, { x, y })!, id, selected: false, style: { width: 460, height: 405 } }));
  nodes.push({ id: 'position', type: 'position-logger', position: { x: 0, y: 750 }, data: { label: '坐标记录' } });
  for (const node of nodes) {
    if (node.type === 'file') (node as FileNode).data.assets = [source];
    if (isInvertNode(node) || isRotateFlipNode(node)) node.data.baseImage = source;
    if (isColorPaletteNode(node)) node.data.colors = [{ id: 'sky', hex: '#b9c8d6' }, { id: 'mountain', hex: '#467577' }, { id: 'sand', hex: '#e7b88e' }];
    if (node.type === 'model-input') { (node as ModelInputNode).data.model = '柔和'; (node as ModelInputNode).data.options = ['柔和', '鲜明']; }
  }
  const compositor = nodes.find(isCompositorNode)!;
  const workflow: Workflow = { nodes, edges: [
    { id: 'to-router', source: 'file', sourceHandle: 'file', target: 'router', targetHandle: 'input' },
    { id: 'to-preview', source: 'router', sourceHandle: 'output', target: 'preview', targetHandle: 'file' },
    ...compositor.data.document.inputs.map(input => ({ id: input.id, source: 'file', sourceHandle: 'file', target: 'compositor', targetHandle: input.id })),
  ], colorMode: new URLSearchParams(location.search).has('light') ? 'light' : 'dark', viewport };
  const storage = new WorkflowStorage(`momoflow-final-qa-${crypto.randomUUID()}`); await storage.load();
  const root = createRoot(find('#root')); root.render(<ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider>);
  await settle();
  await until(() => Boolean(api) && ['invert', 'rotate', 'palette', 'compositor'].every(id => Boolean(output(id))), 'Local processors produce outputs');
  check(await pixel(output('invert')) === '70,55,41,255', '反相输出保留真实像素与原尺寸');
  check(output('invert').width === 640 && output('invert').height === 480 && output('palette').width === 1024, '处理结果不随节点显示尺寸缩小');
  await until(() => Boolean(document.querySelector<HTMLImageElement>('[data-id="preview"] img')?.naturalWidth), 'Preview image loads');
  check(find<HTMLImageElement>('[data-id="preview"] .preview-image img').src === source.url, '预览通过路由显示原始图片');
  find<HTMLButtonElement>('[aria-label="Show original"]').click(); await settle(); check(find<HTMLImageElement>('[data-id="invert"] .preview-image img').src === source.url, '反相显示原图操作保留');
  find<HTMLButtonElement>('[aria-label="Show original"]').click();
  find<HTMLButtonElement>('[aria-label="Rotate 90° clockwise"]').click(); await until(() => output('rotate')?.width === 480, 'Rotation output');
  check(rotation().rotation === 90 && output('rotate').height === 640, '旋转按钮提交 90° 与交换后的输出尺寸');
  find<HTMLButtonElement>('[aria-label="Flip horizontal"]').click(); await settle(); check(rotation().flipHorizontal, '水平翻转保持可用');
  canvasHistoryShortcut('undo'); await settle(); check(!rotation().flipHorizontal && rotation().rotation === 90, '撤销只撤回本次翻转');
  canvasHistoryShortcut('redo'); await settle(); check(rotation().flipHorizontal, '重做恢复翻转');
  find<HTMLButtonElement>('.rotate-flip-reset').click(); await until(() => output('rotate')?.width === 640, 'Reset output');
  check(rotation().rotation === 0 && !rotation().flipHorizontal, '重置恢复原图方向');
  api.updateNodeData('rotate', { locked: true }); await settle(); check([...find('[data-id="rotate"]').querySelectorAll<HTMLButtonElement>('.rotate-flip-controls button')].every(button => button.disabled), '锁定后旋转与翻转控件禁用');
  api.updateNodeData('rotate', { locked: false }); await settle();
  let input = await rename('preview', '取消的名称'); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  check(api.getNode('preview')?.data.label !== '取消的名称', 'Escape 取消重命名，不被失焦提交');
  input = await rename('preview', '山间预览'); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })); await settle();
  check(document.activeElement === input, '中文输入法确认不会提前结束重命名');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle(); check(api.getNode('preview')?.data.label === '山间预览', '重命名提交后保留英文类型');
  find<HTMLButtonElement>('[data-id="model"] [role="combobox"]').click(); await settle();
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent?.includes('鲜明'))!.click(); await settle();
  check((api.getNode('model') as ModelInputNode).data.model === '鲜明', '参数输入节点下拉继续提交原有值');
  const before = compositor.data.document.inputs.length;
  find<HTMLButtonElement>('[data-id="compositor"] .compositor-add').click(); await settle();
  const updated = api.getNode('compositor'); check(isCompositorNode(updated) && updated.data.document.inputs.length === before + 1, '合成器添加图层仍增加真实输入');
  canvasHistoryShortcut('undo'); await settle(); await until(() => Boolean(output('compositor')), 'Composition recovers after undo');
  for (const zoom of [.3, 1, 1.5]) {
    await api.setViewport({ ...viewport, zoom }); await settle();
    check(Math.abs(find('[data-id="preview"] .preview-image').getBoundingClientRect().width - 400 * zoom) < .1 && Math.abs(find('[data-id="router"] .node-router-card').getBoundingClientRect().width - 344 * zoom) < .1, `${zoom * 100}% 缩放保持媒体与紧凑卡片比例`);
  }
  await api.setViewport(viewport); await settle();
  await storage.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges(), viewport }); const restored = await storage.load(); check(restored, 'IndexedDB 可以读取保存结果');
  root.render(<ReactFlowProvider key="restored"><Flow storage={storage} saved={restored} /><Probe /></ReactFlowProvider>);
  await settle();
  await until(() => Boolean(api) && ['invert', 'rotate', 'palette', 'compositor'].every(id => Boolean(output(id))), 'Restored processor outputs');
  check(api.getNode('preview')?.data.label === '山间预览' && (api.getNode('model') as ModelInputNode).data.model === '鲜明' && api.getEdges().length === workflow.edges.length, '重新挂载恢复自定义名称、参数与连线');
  check(await pixel(output('invert')) === '70,55,41,255', '重新挂载后反相输出像素一致');
  const oldPosition = api.getNode('position')!.position;
  api.updateNode('position', { position: { x: oldPosition.x + 100, y: oldPosition.y } }); await settle();
  find('.react-flow__pane').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  check(document.activeElement === find('.react-flow'), '点击空白画布取得快捷键焦点');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await settle();
  check(api.getNode('position')!.position.x === oldPosition.x, '空白画布焦点可撤销节点移动');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); await settle();
  check(api.getNode('position')!.position.x === oldPosition.x + 100, '空白画布焦点可重做节点移动');
  canvasHistoryShortcut('undo'); await settle();
  check(providerCalls === 0, '全过程不调用真实模型或外部素材');
  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} 项收尾检查\n${checks.join('\n')}`;
}
void run().catch(error => { find('#results').dataset.result = 'failed'; find('#results').textContent = `${checks.join('\n')}\nFAIL: ${String(error)}`; });
