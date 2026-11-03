import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { createModelTaskStore, ModelTasksContext } from '../src/components/useModelTasks';
import type { AppNode, FileAsset, ImageGeneratorNode, ImageDescriberNode, FileNode } from '../src/nodes/types';
import type { PreviewTask } from '../src/nodes/taskQueue';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { assetResources } from '../src/nodes/assetResources';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

let api: ReactFlowInstance<AppNode>;
const store = createModelTaskStore();
const viewport = { x: 20, y: 160, zoom: .55 };
function Probe() {
  api = useReactFlow<AppNode>();
  return <div id="qa-controls"><button onClick={() => { void api.setViewport(viewport); }}>三个图像模型</button><button onClick={() => { void api.setViewport({ ...viewport, y: -340 }); }}>图片与迭代</button><button onClick={() => { void api.setViewport({ ...viewport, y: -850 }); }}>图像描述</button></div>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(predicate: () => boolean, message: string) {
  const deadline = performance.now() + 8000;
  while (!predicate()) { if (performance.now() > deadline) throw new Error(message); await settle(); }
}
function find<T extends Element = HTMLElement>(selector: string) { const result = document.querySelector<T>(selector); if (!result) throw new Error(`Missing ${selector}`); return result; }
const checks: string[] = [];
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks.push(message); }
const button = (id: string, label: string) => find<HTMLButtonElement>(`[data-id="${id}"] [aria-label="${label}"]`);
const read = (id: string) => api.getNode(id) as ImageGeneratorNode;
const css = (selector: string) => getComputedStyle(find(selector));
async function sample(id: string, color: string, width = 400, height = 520): Promise<FileAsset> {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!; const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, '#dbe7e4'); gradient.addColorStop(1, color); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, height); ctx.lineTo(width * .45, height * .3); ctx.lineTo(width, height * .85); ctx.lineTo(width, height); ctx.fill();
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(result => resolve(result!), 'image/png'));
  return { id, kind: 'image', name: `${id}.png`, url: assetResources.create(blob), width, height };
}
async function run() {
  const portrait = await sample('山间晨雾', '#367d88'), landscape = await sample('黄昏山谷', '#bc815c', 600, 400), third = await sample('蓝色山峰', '#677cba');
  let providerCalls = 0; const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (path.startsWith('/api/') || /^https?:/.test(path)) { providerCalls++; throw new Error('No provider calls in visual QA'); }
    return originalFetch(input, init);
  };
  const types = ['sunburst', 'ideogram', 'nano-banana', 'file', 'image-iterator', 'text-iterator', 'image-describer'];
  const nodes = types.map((type, index) => ({ ...createLibraryNode(type, { x: 100 + index % 3 * 600, y: Math.floor(index / 3) * 950 })!, id: type, selected: false }));
  for (const [index, type] of types.slice(0, 3).entries()) {
    const model = nodes.find(node => node.id === type)!;
    model.data = { ...model.data, results: [portrait, landscape, third], activeResultId: [portrait, third, portrait][index].id } as ImageGeneratorNode['data'];
  }
  const file = nodes.find(node => node.id === 'file')!; file.data = { assets: [portrait, landscape], activeAssetId: portrait.id };
  const images = nodes.find(node => node.id === 'image-iterator')!; images.data = { ...images.data, assets: [portrait, landscape], activeAssetId: portrait.id };
  nodes.find(node => node.id === 'image-describer')!.data.label = '画面描述';
  const workflow: Workflow = { nodes, edges: [], colorMode: new URLSearchParams(location.search).has('light') ? 'light' : 'dark', viewport };
  const db = `momoflow-media-qa-${crypto.randomUUID()}`, storage = new WorkflowStorage(db); await storage.load();
  createRoot(find('#root')).render(<ReactFlowProvider><ModelTasksContext.Provider value={store}><Flow storage={storage} saved={workflow} /><Probe /></ModelTasksContext.Provider></ReactFlowProvider>);
  await until(() => document.querySelectorAll('.node-frame').length === types.length, 'All media shells mount');
  await until(() => [...document.querySelectorAll<HTMLImageElement>('.sunburst-preview > img, .file-node-single > img')].every(image => image.naturalWidth > 0), 'Local results load');
  for (const type of types) {
    const text = ['text-iterator', 'image-describer'].includes(type);
    check(css(`[data-id="${type}"]`).width === `${text ? 528 : 476}px` && css(`[data-id="${type}"] .node-frame-type`).fontSize === '16px', `${type}：公共外壳及 16px 英文类型`);
    const ports = api.getInternalNode(type)!.internals.handleBounds!;
    check([...ports.source ?? [], ...ports.target ?? []].every(port => port.x === 0 || Math.abs(port.x + port.width - (text ? 528 : 476)) < .1), `${type}：端点仍在真实外壳边缘`);
  }
  for (const type of types.slice(0, 3)) {
    check(find(`[data-id="${type}"] .node-frame-name`).textContent === '图像生成' && css(`[data-id="${type}"] .sunburst-preview`).width === '400px', `${type}：中文标题及 400px 预览`);
    check(css(`[data-id="${type}"] .sunburst-preview > img`).objectFit === 'contain', `${type}：保留完整图片`);
    check(find(`[data-id="${type}"] .node-run-feedback`).textContent?.includes('3 张结果'), `${type}：恢复已有结果状态`);
    const before = read(type).data.results;
    button(type, 'Next result').click(); await settle();
    check(read(type).data.activeResultId !== (workflow.nodes.find(node => node.id === type) as ImageGeneratorNode).data.activeResultId && read(type).data.results === before, `${type}：切换结果不清空素材`);
    button(type, 'Single').click(); await settle(); check(find(`[data-id="${type}"] .sunburst-preview`).classList.contains('is-grid') && find(`[data-id="${type}"] .file-node-grid`).querySelectorAll('.file-node-tile').length === 3, `${type}：结果集合视图`);
    button(type, 'All').click(); await settle();
    button(type, 'Full screen result').click(); await settle(); check(Boolean(document.querySelector('.file-gallery')), `${type}：全屏图库`);
    document.querySelector<HTMLElement>('.file-gallery')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  }
  check(find('[data-id="image-describer"] .node-frame-title').textContent === '画面描述IMAGE DESCRIBER', '图像描述保留自定义名称与英文类型');
  check(css('[data-id="image-describer"] .node-frame-card').width === '452px', '描述内容卡片为 452px');
  api.updateNodeData('image-describer', { text: '本地验收：山峰与柔和晨雾。', outputMode: 'manual' }); await settle();
  check(find<HTMLTextAreaElement>('[data-id="image-describer"] textarea').value.includes('晨雾') && (api.getNode('image-describer') as ImageDescriberNode).data.outputMode === 'manual', '描述文本保留可编辑的手动输出模式');
  button('image-describer', 'Add another image input').click(); await settle();
  check(Boolean(document.querySelector('[data-id="image-describer"] [data-handleid="image-1"]')), '描述节点动态图片输入仍可用');
  const firstResult = read('sunburst').data.results;
  const task = (state: PreviewTask['state'], extra: Partial<PreviewTask> = {}): PreviewTask => ({ id: 'visual-task', batchId: 'visual-batch', nodeId: 'sunburst', model: 'sunburst', createdAt: 1, state, progress: 0, started: 0, ...extra });
  for (const state of ['Queued', 'Running', 'Failed', 'Cancelled', 'Done'] as const) {
    store.update(() => [task(state, { progress: state === 'Running' ? 42 : 0, error: state === 'Failed' ? '模拟服务暂时不可用' : undefined })]); await settle();
    check(find('[data-id="sunburst"] .node-run-feedback').getAttribute('data-state') === state && read('sunburst').data.results === firstResult, `${state}：状态更新且保留已有结果`);
    if (state === 'Running') check(find('[data-id="sunburst"] [role="progressbar"]').getAttribute('aria-valuenow') === '42', '运行按钮保留进度及取消入口');
    if (state === 'Failed') check(find('[data-id="sunburst"] .node-run-error').textContent === '模拟服务暂时不可用', '失败说明显示在节点上');
  }
  store.update(() => [task('Running', { progress: 17 }), task('Queued', { id: 'queued' })]); await settle();
  button('sunburst', '取消运行').click(); await settle();
  check(store.getSnapshot().every(task => task.state === 'Cancelled'), '取消仍终止该节点的运行与排队任务');
  store.update(() => [task('Failed', { error: '批次中一项失败' }), task('Done', { id: 'done', createdAt: 2 })]); await settle();
  check(find('[data-id="sunburst"] .node-run-feedback').getAttribute('data-state') === 'Failed', '同批部分成功仍保留失败提示');
  store.update(() => []); await settle();
  api.updateNodeData('sunburst', { results: [], activeResultId: undefined }); await settle();
  check(Boolean(document.querySelector('[data-id="sunburst"] .node-media-empty')) && find('[data-id="sunburst"] .node-run-feedback').textContent === '未运行', '空模型具有预览空态和运行入口');
  api.updateNodeData('sunburst', { results: firstResult, activeResultId: portrait.id }); await settle();
  const fileBefore = (api.getNode('file') as FileNode).data.assets;
  button('file', 'Next item').click(); await settle(); check((api.getNode('file') as FileNode).data.activeAssetId === landscape.id && (api.getNode('file') as FileNode).data.assets === fileBefore, '图片切换保留素材集合');
  button('file', 'Single').click(); await settle(); check(find('[data-id="file"] .file-node-media').classList.contains('is-grid'), '图片集合视图可切换');
  canvasHistoryShortcut('undo'); await settle(); check(!find('[data-id="file"] .file-node-media').classList.contains('is-grid'), '图片视图切换可撤销');
  const transfer = new DataTransfer(); transfer.items.add(new File([await (await originalFetch(third.url)).blob()], '新增图片.png', { type: 'image/png' }));
  const input = button('file', 'Choose files') as unknown as HTMLInputElement; input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => (api.getNode('file') as FileNode).data.assets?.length === 3, 'Imported local image');
  check((api.getNode('file') as FileNode).data.assets?.at(-1)?.name === '新增图片.png', '本地导入保留原始文件名');
  const downloads: string[] = []; const catchDownload = (event: MouseEvent) => { if (event.target instanceof HTMLAnchorElement && event.target.download) { event.preventDefault(); downloads.push(event.target.download); } };
  document.addEventListener('click', catchDownload, true); button('file', 'Download current').click(); await until(() => downloads.length === 1, 'Download action'); document.removeEventListener('click', catchDownload, true);
  check(downloads[0] === '新增图片.png', '下载当前图片保留原始文件名');
  api.updateNodeData('sunburst', { locked: true }); await settle(); check(find<HTMLButtonElement>('[data-id="sunburst"] .sunburst-run').disabled && button('sunburst', '添加图片输入').disabled, '锁定继续禁用运行和增加输入');
  api.updateNodeData('sunburst', { locked: false }); await settle();
  const savedNodes = api.getNodes(); await storage.save({ ...workflow, nodes: savedNodes }); const restored = await storage.load();
  check((restored?.nodes.find(node => node.id === 'file') as FileNode).data.assets?.length === 3 && (restored?.nodes.find(node => node.id === 'sunburst') as ImageGeneratorNode).data.results?.length === 3, '保存恢复保留文件集合及模型结果');
  check(!JSON.stringify(restored).includes('visual-task'), '临时运行状态不进入工作流持久化');
  check(providerCalls === 0, '切换布局与状态未调用模型');
  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: false }))); await api.setViewport(viewport); await settle();
  find<HTMLElement>('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} 项检查 · 阶段 3\n${checks.join('\n')}`;
}
void run().catch(error => { find<HTMLElement>('#results').dataset.result = 'failed'; find('#results').textContent = `${checks.join('\n')}\nFAIL: ${String(error)}`; });
