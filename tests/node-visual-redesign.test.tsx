import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, useNodes, useEdges, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { defaultNanoBananaSettings } from '../src/nodes/nanoBanana';
import type { AppNode, FileAsset, NanoBananaNode, TextNode } from '../src/nodes/types';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { assetResources } from '../src/nodes/assetResources';
import { connectionChoices } from '../src/nodes/connectionRecommendations';
import { nodeConnectionOffset, nodePortY } from '../src/nodes/nodeLayout';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <><output id="qa-state">{JSON.stringify({ nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges })}</output>
    <div id="qa-controls"><button onClick={() => { void api.setViewport({ x: 20, y: 130, zoom: .6 }); }}>整体预览 60%</button>
      <button onClick={() => { void api.setViewport({ x: -650, y: 80, zoom: 1 }); }}>模型 100%</button></div></>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(predicate: () => boolean, message: string) {
  const deadline = performance.now() + 6000;
  while (!predicate()) { if (performance.now() > deadline) throw new Error(message); await settle(); }
}
function find<T extends HTMLElement = HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element;
}
const checks: string[] = [];
function check(value: unknown, message: string) { if (!value) throw new Error(message); checks.push(message); }
const readText = () => api.getNode('prompt') as TextNode;
const readModel = () => api.getNode('model') as NanoBananaNode;

async function run() {
  // Locally generated fixture, independent of user assets, storage and providers.
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 520;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 400, 520);
  gradient.addColorStop(0, '#b9cee1'); gradient.addColorStop(.5, '#dde4db'); gradient.addColorStop(1, '#638f94');
  context.fillStyle = gradient; context.fillRect(0, 0, 400, 520);
  context.fillStyle = '#3f737b'; context.beginPath(); context.moveTo(0, 440); context.lineTo(170, 200); context.lineTo(400, 490); context.lineTo(400, 520); context.lineTo(0, 520); context.fill();
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
  const asset: FileAsset = { id: 'local-fixture', kind: 'image', name: '参考图片.png', url: assetResources.create(blob), width: 400, height: 520 };
  const originalFetch = window.fetch.bind(window);
  let modelCalls = 0;
  window.fetch = async (url, init) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path.startsWith('/api/') || /^https?:/.test(path)) { modelCalls++; throw new Error('Isolated visual QA does not call providers'); }
    return originalFetch(url, init);
  };
  const workflow: Workflow = {
    nodes: [
      { id: 'prompt', type: 'text', position: { x: 150, y: 50 }, style: { width: 460, height: 405 }, data: { text: '保留山峰的轮廓，呈现柔和的晨光与淡蓝色雾气。', variableCount: 1 } },
      { id: 'reference', type: 'file', position: { x: 150, y: 470 }, data: { assets: [asset], label: '参考图片' } },
      { id: 'model', type: 'nano-banana', position: { x: 900, y: 150 }, data: { ...defaultNanoBananaSettings, imageInputs: 1, results: [{ ...asset, id: 'result-fixture' }] } },
    ],
    edges: [
      { id: 'prompt-model', source: 'prompt', target: 'model', targetHandle: 'prompt' },
      { id: 'image-model', source: 'reference', sourceHandle: 'file', target: 'model', targetHandle: 'image-0' },
    ],
    colorMode: new URLSearchParams(location.search).has('light') ? 'light' : 'dark', viewport: { x: 20, y: 130, zoom: .6 },
  };
  const db = `momoflow-node-design-qa-${crypto.randomUUID()}`;
  const storage = new WorkflowStorage(db); await storage.load();
  createRoot(find('#root')).render(<ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider>);
  await until(() => Boolean(document.querySelector('[data-id="model"] .node-port')), 'Nodes mount');
  await until(() => find<HTMLImageElement>('[data-id="model"] .sunburst-preview > img').naturalWidth === 400, 'Fixture loads');
  await settle();
  const css = (selector: string) => getComputedStyle(find(selector));
  check(css('[data-id="prompt"] .node-frame-card').width === '452px', '旧宽高数据恢复后，提示词卡片仍为 452px');
  check(css('[data-id="reference"] .file-node-media').width === '400px' && css('[data-id="model"] .sunburst-preview').width === '400px', '图片与模型主体为 400px');
  check(css('[data-id="prompt"] .node-frame-card').height === '336px', '提示词卡片高 336px');
  check(css('[data-id="model"] .node-port').width === '30px' && css('[data-id="model"] .node-frame-type').fontSize === '16px', '端点与标题采用两倍尺寸');
  check(find('[data-id="model"] .node-frame-title').textContent === '图像生成NANO BANANA', '模型显示中文名称与英文品牌类型');
  check(find('[data-id="reference"] .node-frame-title').textContent === '参考图片IMAGE', '图片保留自定义名称与英文类型');
  check(!document.querySelector('[data-id="model"] [data-handleid="mask"]'), '没有从原型误增 Nano Banana 蒙版能力');
  check(!find('[data-id="prompt"] .react-flow__handle.source').hasAttribute('data-handleid'), '文本输出继续使用无显式 ID 的端点');
  await until(() => [...document.querySelectorAll<HTMLImageElement>('.node-port-icon img')].every(img => img.naturalWidth === 8), 'Port icons load');
  check([...document.querySelectorAll<HTMLImageElement>('.node-port-icon img')].every(img => Math.abs(img.getBoundingClientRect().width - 9.6) < .1), '原始 8px SVG 通过包装缩放为画布 16px');
  await until(() => document.querySelectorAll('.react-flow__edge-path').length === 2, 'Edges follow measured handles');
  check(css('[data-id="prompt-model"] .react-flow__edge-path').stroke === 'rgb(95, 95, 95)', '提示词正式连线为灰色');
  check(css('[data-id="image-model"] .react-flow__edge-path').stroke === 'rgb(128, 185, 241)', '图片正式连线为浅蓝色');
  check(css('[data-id="image-model"] .react-flow__edge-path').strokeWidth === '3px', '连线宽度为 3px');
  const source = api.getInternalNode('reference')!.internals.handleBounds!.source![0];
  const target = api.getInternalNode('model')!.internals.handleBounds!.target!.find(port => port.id === 'image-0')!;
  check(Math.abs(source.x + source.width - 476) < .1 && Math.abs(source.y + source.height / 2 - 95) < .1 && Math.abs(target.x) < .1 && Math.abs(target.y + target.height / 2 - 137) < .1, '实际 Handle 锚点与图标端点边界一致');
  const initialResults = readModel().data.results;
  find<HTMLButtonElement>('[data-id="model"] [aria-label="添加图片输入"]').click(); await settle();
  await until(() => api.getInternalNode('model')!.internals.handleBounds!.target!.some(port => port.id === 'image-1'), 'Dynamic handles remeasure');
  check(readModel().data.imageInputs === 2 && !find('[data-id="model"] .node-port-add').classList.contains('react-flow__handle'), '添加图标只新增图片输入，不是数据端点');
  check(readModel().data.results === initialResults, '增加输入入口不清空已有结果');
  canvasHistoryShortcut('undo'); await settle(); check(readModel().data.imageInputs === 1, '撤销恢复输入数量');
  find<HTMLButtonElement>('[data-id="prompt"] [aria-label="添加变量"]').click(); await settle();
  check(readText().data.variableCount === 2 && JSON.stringify(readText().data.content).includes('variable-2'), '添加变量同时保留内联变量编辑');
  find('[data-id="prompt"] .text-node-editor').blur(); canvasHistoryShortcut('undo'); await settle();
  check(readText().data.variableCount === 1, '画布撤销恢复变量数');
  const choices = connectionChoices({ nodeId: 'reference', handleId: 'file', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } }, api.getNodes(), api.getEdges());
  check(nodeConnectionOffset(readModel(), choices.find(choice => choice.itemId === 'nano-banana')?.handleId, 'target').y === nodePortY(1), '拖线新建模型使用更新后的图片端点偏移');
  await api.setViewport({ x: 0, y: 0, zoom: 1 }); await settle();
  check(find('[data-id="model"] .node-port').getBoundingClientRect().width === 30, '100% 画布下端点为 30px');
  await api.setViewport(workflow.viewport!); await settle();
  const restoredStorage = new WorkflowStorage(`${db}-roundtrip`); await restoredStorage.load();
  await restoredStorage.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const reloaded = new WorkflowStorage(`${db}-roundtrip`), restored = await reloaded.load();
  check(restored?.edges.length === 2 && restored.nodes.find(node => node.id === 'reference')?.position.x === 150, '持久化保留连线与原始节点位置');
  check((restored?.nodes.find(node => node.id === 'model') as NanoBananaNode).data.results?.[0].id === 'result-fixture', '持久化保留模型结果与素材 ID');
  reloaded.dispose(); restoredStorage.dispose();
  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: false }))); await settle();
  check(modelCalls === 0, '全过程未调用真实模型');
  find('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} 项检查 · 阶段 1\n${checks.join('\n')}`;
}
void run().catch(error => {
  find('#results').dataset.result = 'failed'; find('#results').textContent = `${checks.join('\n')}\nFAIL: ${String(error)}`;
});
