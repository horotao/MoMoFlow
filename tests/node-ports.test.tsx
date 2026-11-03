import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance, type Edge } from '@xyflow/react';
import { Flow } from '../src/App';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { nodeTypes } from '../src/nodes';
import type { AppNode, SunburstNode, ImageDescriberNode } from '../src/nodes/types';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';
import '../src/nodes/compositor/Compositor.css';
import '../src/nodes/ColorPaletteNode.css';
import '../src/nodes/BlendNode.css';
import '../src/nodes/CompareNode.css';
import '../src/nodes/ResizeNode.css';
import '../src/nodes/RotateFlipNode.css';
import '../src/nodes/InvertNode.css';
import '../src/nodes/LevelsNode.css';
import '../src/nodes/MatteGrowShrinkNode.css';
import '../src/nodes/BlurNode.css';
import '../src/nodes/ColorCorrectionNode.css';
import '../src/nodes/CropNode.css';
import '../src/nodes/PreviewNode.css';
import '../src/nodes/PainterNode.css';

let api: ReactFlowInstance<AppNode>;
const viewport = { x: 25, y: 150, zoom: .55 };
function Probe() {
  api = useReactFlow<AppNode>();
  return <div id="qa-controls"><button onClick={() => { void api.setViewport(viewport); }}>图片／蒙版连线</button><button onClick={() => { void api.fitView({ padding: .1 }); }}>全部 26 类节点</button></div>;
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(predicate: () => boolean, message: string) {
  const deadline = performance.now() + 8000;
  while (!predicate()) { if (performance.now() > deadline) throw new Error(message); await settle(); }
}
function find<T extends Element = HTMLElement>(selector: string) { const result = document.querySelector<T>(selector); if (!result) throw new Error(`Missing ${selector}`); return result; }
const checks: string[] = [];
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks.push(message); }
const handle = (id: string, direction: string, port?: string) => find<HTMLElement>(`[data-id="${id}"] .node-port.${direction}${port ? `[data-handleid="${port}"]` : ''}`);
const color = (id: string) => getComputedStyle(find(`[data-id="${id}"] .react-flow__edge-path`)).stroke;
const edge = (id: string, source: string, sourceHandle: string | null, target: string, targetHandle: string): Edge => ({ id, source, sourceHandle, target, targetHandle });
async function preview(from: HTMLElement) {
  const rect = from.getBoundingClientRect(), start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const event = (type: string, x: number, y: number, buttons: number) => new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons, clientX: x, clientY: y });
  from.dispatchEvent(event('mousedown', start.x, start.y, 1));
  document.dispatchEvent(event('mousemove', start.x + 60, start.y + 50, 1)); await settle();
  check(getComputedStyle(find('.node-design-connection path')).stroke === 'rgb(128, 185, 241)', '正向／反向拖线预览使用浅蓝色');
  // Release over the original handle to cancel without creating a new node.
  document.dispatchEvent(event('mousemove', start.x, start.y, 1));
  from.dispatchEvent(event('mouseup', start.x, start.y, 0)); await settle();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
}
async function run() {
  const originalFetch = window.fetch.bind(window); let providerCalls = 0;
  window.fetch = async (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (path.startsWith('/api/') || /^https?:/.test(path)) { providerCalls++; throw new Error('No providers in port QA'); }
    return originalFetch(input, init);
  };
  const nodes = Object.keys(nodeTypes).map((type, index) => ({
    ...(createLibraryNode(type, { x: 100 + index % 4 * 700, y: 1600 + Math.floor(index / 4) * 900 }) ?? { type, position: { x: 800, y: 8500 }, data: { label: '坐标记录' } }),
    id: type, selected: false,
  } as AppNode));
  const paint = nodes.find(node => node.id === 'painter')!; paint.position = { x: 120, y: 110 };
  const model = nodes.find(node => node.id === 'sunburst')!; model.position = { x: 1250, y: 110 };
  const router = nodes.find(node => node.id === 'router')!; router.position = { x: 760, y: 180 }; router.data.label = '图片中转';
  nodes.push({ ...router, id: 'mask-router', position: { x: 760, y: 350 }, data: { label: '蒙版中转' } });
  const edges = [edge('image-in', 'painter', 'result', 'router', 'input'), edge('image-out', 'router', 'output', 'sunburst', 'image-0'), edge('mask-in', 'painter', 'mask', 'mask-router', 'input'), edge('mask-out', 'mask-router', 'output', 'sunburst', 'mask')];
  const workflow: Workflow = { nodes, edges, colorMode: new URLSearchParams(location.search).has('light') ? 'light' : 'dark', viewport };
  const db = `momoflow-ports-qa-${crypto.randomUUID()}`, storage = new WorkflowStorage(db); await storage.load();
  createRoot(find('#root')).render(<ReactFlowProvider><Flow storage={storage} saved={workflow} /><Probe /></ReactFlowProvider>);
  await until(() => document.querySelectorAll('.react-flow__node').length === nodes.length && document.querySelectorAll('.react-flow__edge-path').length === edges.length, 'All node families and edges mount');
  await until(() => [...document.querySelectorAll<HTMLImageElement>('.node-port-icon img')].every(img => img.naturalWidth === 8), 'Local SVGs load');
  for (const type of Object.keys(nodeTypes)) {
    const ports = [...find(`[data-id="${type}"]`).querySelectorAll<HTMLElement>('.react-flow__handle')];
    check(ports.length > 0 && ports.every(port => port.classList.contains('node-port') && getComputedStyle(port).width === '30px' && Boolean(port.querySelector('img,svg'))), `${type}：全部端点为 30px 图标`);
    const bounds = find(`[data-id="${type}"]`).getBoundingClientRect();
    if (!find(`[data-id="${type}"]`).querySelector('.node-frame')) {
      for (const port of ports) {
        const rect = port.getBoundingClientRect(), gap = port.classList.contains('source') ? rect.left - bounds.right : bounds.left - rect.right;
        check(Math.abs(gap - 8 * api.getZoom()) < 1, `${type}：端点与卡片保留 8px 间隔`);
      }
    }
  }
  check(handle('painter', 'source', 'result').classList.contains('node-port--image') && handle('painter', 'source', 'mask').classList.contains('node-port--mask'), '双输出用不同图标区分图片与蒙版');
  check(handle('router', 'source').classList.contains('node-port--image') && handle('mask-router', 'source').classList.contains('node-port--mask'), 'Router 图标跟随上游类型');
  check(edges.every(item => color(item.id) === 'rgb(128, 185, 241)'), '图片、蒙版及 Router 分支正式线均为浅蓝色');
  for (const item of edges) {
    const path = find<SVGPathElement>(`[data-id="${item.id}"] .react-flow__edge-path`), start = path.getPointAtLength(0), end = path.getPointAtLength(path.getTotalLength());
    const origin = api.getInternalNode(item.source)!.internals, target = api.getInternalNode(item.target)!.internals;
    const a = origin.handleBounds!.source!.find(port => port.id === item.sourceHandle)!, b = target.handleBounds!.target!.find(port => port.id === item.targetHandle)!;
    check(Math.abs(start.x - origin.positionAbsolute.x - a.x - a.width) < 1 && Math.abs(start.y - origin.positionAbsolute.y - a.y - a.height / 2) < 1 && Math.abs(end.x - target.positionAbsolute.x - b.x) < 1 && Math.abs(end.y - target.positionAbsolute.y - b.y - b.height / 2) < 1, `${item.id}：线的两端精确连接图标边缘`);
  }
  await preview(handle('painter', 'source', 'result')); await preview(handle('painter', 'source', 'mask')); await preview(handle('sunburst', 'target', 'mask'));
  api.setEdges(current => current.filter(item => item.id !== 'image-out').map(item => item.id === 'image-in' ? { ...item, source: 'text', sourceHandle: null } : item)); await settle();
  check(handle('router', 'source').classList.contains('node-port--text') && color('image-in') === 'rgb(95, 95, 95)', '换成文本上游后，Router 图标及连线同步改变');
  api.setEdges(current => current.filter(item => item.id !== 'image-in')); await settle();
  check(handle('router', 'source').classList.contains('node-port--unknown'), '断开后 Router 恢复未知类型');
  api.setEdges(edges); await settle();
  find<HTMLButtonElement>('[data-id="sunburst"] .node-port-add').click();
  await until(() => Boolean(api.getInternalNode('sunburst')?.internals.handleBounds?.target?.find(port => port.id === 'image-1')), 'New image input measured');
  check((api.getNode('sunburst') as SunburstNode).data.imageInputs === 2 && Math.abs(api.getInternalNode('sunburst')!.internals.handleBounds!.target!.find(port => port.id === 'mask')!.y + 15 - 221) < .1, '模型新增图片后，蒙版端点自动下移且重新测量');
  canvasHistoryShortcut('undo'); await settle(); check((api.getNode('sunburst') as SunburstNode).data.imageInputs === 1, '撤销同时恢复动态端点位置');
  api.updateNodeData('sunburst', { exposed: ['quality'] }); await settle();
  check(handle('sunburst', 'target', 'quality').classList.contains('node-port--text'), '暴露参数使用文本图标并保留字段 ID');
  find<HTMLButtonElement>('[data-id="image-describer"] .node-port-add').click(); await settle();
  check((api.getNode('image-describer') as ImageDescriberNode).data.imageInputs === 2 && Boolean(handle('image-describer', 'target', 'image-1')), '描述节点加号新增真实图片输入');
  check([...document.querySelectorAll('.node-port-add')].every(button => !button.classList.contains('react-flow__handle')), '所有加号都是操作按钮，不是数据端点');
  api.updateNodeData('sunburst', { locked: true }); await settle();
  check([...find('[data-id="sunburst"]').querySelectorAll('.node-port')].every(port => port.getAttribute('aria-disabled') === 'true') && find<HTMLButtonElement>('[data-id="sunburst"] .node-port-add').disabled, '锁定禁用连接及添加输入');
  check(handle('model-input', 'target').getAttribute('aria-disabled') === 'true', '未启用的 Options 输入保持不可连接');
  api.updateNodeData('sunburst', { locked: false, exposed: [] }); await settle();
  const reader = new WorkflowStorage(`${db}-roundtrip`); await reader.load(); await reader.save({ ...workflow, nodes: api.getNodes(), edges: api.getEdges() });
  const restored = await reader.load();
  check(restored?.edges.length === 4 && restored.edges.some(item => item.sourceHandle === 'mask') && restored.nodes.find(node => node.id === 'painter')?.position.x === 120, '保存恢复保留蒙版端口 ID、连线与原始坐标'); reader.dispose();
  await api.setViewport({ ...viewport, zoom: 1 }); await settle();
  check(handle('painter', 'source').getBoundingClientRect().width === 30, '100% 下图标端点为 30px，随画布缩放');
  await api.setViewport(viewport); await settle();
  check(providerCalls === 0, '未请求真实模型或外部素材');
  find<HTMLElement>('#results').dataset.result = 'passed'; find('#results').textContent = `PASS · ${checks.length} 项检查 · 全部 26 类节点\n${checks.join('\n')}`;
}
void run().catch(error => { find<HTMLElement>('#results').dataset.result = 'failed'; find('#results').textContent = `${checks.join('\n')}\nFAIL: ${String(error)}`; });
