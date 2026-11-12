import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { isBlurNode, isColorCorrectionNode, isMatteGrowShrinkNode, type AppNode } from '../src/nodes/types';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { imageOutput } from '../src/nodes/sunburstRun';
import { canvasHistoryShortcut } from './canvasShortcuts';
import { rangePointer } from './nodeRangeGesture';
import '../src/index.css';
import '../src/nodes/PreviewNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() { api = useReactFlow<AppNode>(); return null; }
const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 96;
const context = canvas.getContext('2d')!; context.fillStyle = '#18283b'; context.fillRect(0, 0, 128, 96);
context.fillStyle = '#e0b76c'; context.fillRect(32, 24, 64, 48);
const sample = { id: 'range-node-source', name: 'sample.png', kind: 'image' as const, url: canvas.toDataURL(), width: 128, height: 96 };
const types = ['color-correction', 'blur', 'matte-grow-shrink'] as const;
const nodes: AppNode[] = types.flatMap((type, index) => {
  const node = createLibraryNode(type, { x: 120 + index * 550, y: 80 })!; node.id = type;
  return [{ ...node, data: { ...node.data, baseImage: sample } } as AppNode,
    { id: `preview-${type}`, type: 'preview', position: { x: 120 + index * 550, y: 900 }, data: {} }];
});
const saved: Workflow = { nodes, edges: types.map(type => ({ id: `result-${type}`, source: type, sourceHandle: 'result', target: `preview-${type}`, targetHandle: 'file' })), viewport: { x: 0, y: 0, zoom: .6 }, colorMode: 'dark' };
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><ReactFlowProvider><ModelTasksProvider>
  <Flow storage={new WorkflowStorage(`momoflow-range-nodes-${crypto.randomUUID()}`)} saved={saved} /><Probe />
</ModelTasksProvider></ReactFlowProvider></MotionConfig>);
const results = document.getElementById('results')!;
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function until(check: () => boolean, message: string) { const start = performance.now(); while (performance.now() - start < 15000) { if (check()) return; await settle(); } throw new Error(message); }
function parameter(id: string) {
  const node = api.getNode(id);
  if (isColorCorrectionNode(node)) return node.data.settings.exposure;
  if (isBlurNode(node) || isMatteGrowShrinkNode(node)) return node.data.settings.size;
  throw new Error('Missing test node');
}
function slider(id: string) { const control = document.querySelector<HTMLElement>(`[data-id="${id}"] [role="slider"]`); check(control, `Missing ${id} slider`); return control; }
function ready(id: string) { return imageOutput(api.getNode(id), 'result', api.getNodes(), api.getEdges())[0]; }
async function run() {
  await until(() => types.every(type => Boolean(document.querySelector(`[data-id="${type}"] [role="slider"]`)) && Boolean(ready(type))), 'Initial exact outputs');
  for (const [index, id] of types.entries()) {
    const initial = parameter(id), next = index === 0 ? 1.25 : 20;
    rangePointer(slider(id), 'pointerdown'); await settle(); rangePointer(slider(id), 'pointermove', next); await settle();
    check(parameter(id) === initial, `${id} draft does not commit`);
    await until(() => Boolean(document.querySelector(`[data-id="preview-${id}"] canvas`)), `${id} publishes downstream draft`);
    rangePointer(slider(id), 'pointerup'); await until(() => parameter(id) === next && Boolean(ready(id)), `${id} exact result`);
    check(ready(id).width === 128 && ready(id).height === 96, `${id} preserves output dimensions`);
    canvasHistoryShortcut('undo'); await until(() => parameter(id) === initial, `${id} undo once`);
    canvasHistoryShortcut('redo'); await until(() => parameter(id) === next && Boolean(ready(id)), `${id} redo once`);
    rangePointer(slider(id), 'pointerdown'); await settle(); rangePointer(slider(id), 'pointermove', index === 0 ? -1.25 : 35); await settle();
    slider(id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle();
    rangePointer(slider(id), 'pointerup'); await settle(); check(parameter(id) === next, `${id} Escape does not commit`);
    rangePointer(slider(id), 'pointerdown'); await settle(); rangePointer(slider(id), 'pointermove', index === 0 ? -1.25 : 35); await settle();
    api.updateNodeData(id, { locked: true }); await settle(); rangePointer(slider(id), 'pointerup'); await settle();
    check(parameter(id) === next && slider(id).getAttribute('aria-disabled') === 'true', `${id} locking cancels draft`);
    api.updateNodeData(id, { locked: false }); await settle();
    results.textContent += `\nPASS ${id}：草稿与下游预览、松手精确输出、单步撤销重做、Esc 和锁定取消`;
  }
  results.dataset.result = 'passed';
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${String(error)}`; });
