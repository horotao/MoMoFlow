import { createRoot } from 'react-dom/client';
import { ReactFlowProvider, useNodes, useEdges, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { useModelTaskStore } from '../src/components/useModelTasks';
import { isImageGeneratorNode, isTextIteratorNode, type AppNode } from '../src/nodes/types';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { isActiveTask } from '../src/nodes/taskQueue';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

let api: ReactFlowInstance<AppNode>;
let store: ReturnType<typeof useModelTaskStore>;
function Probe() {
  api = useReactFlow<AppNode>(); store = useModelTaskStore();
  const nodes = useNodes<AppNode>(), edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes: nodes.map(node => ({ id: node.id, position: node.position })), edges })}</output>;
}
const requests: string[] = [];
let failOnce = true;
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (path === '/api/sunburst') {
    const body = JSON.parse(String(init?.body)) as { prompt: string };
    requests.push(body.prompt);
    if (body.prompt.includes('像素') && failOnce) { failOnce = false; return Promise.resolve(Response.json({ error: '模拟单项失败' }, { status: 500 })); }
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = body.prompt.includes('水彩') ? '#9baea4' : body.prompt.includes('像素') ? '#a79fb4' : '#c9ad91'; ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif'; ctx.fillText(body.prompt, 20, 126);
    return Promise.resolve(Response.json({ image: canvas.toDataURL('image/png'), format: 'png' }));
  }
  if (/^(blob:|data:)/.test(path)) return originalFetch(input, init);
  return Promise.reject(new Error(`Unexpected request blocked: ${path}`));
};
const initialItems = ['一只水彩风格的猫', '一只像素风格的猫', '一只写实风格的猫'].map((text, index) => ({ id: `item-${index}`, text }));
const workflow: Workflow = {
  nodes: [
    { id: 'iterator', type: 'text-iterator', position: { x: 480, y: 120 }, data: { items: initialItems } },
    { id: 'model', type: 'sunburst', position: { x: 1100, y: 120 }, data: { ...defaultSunburstSettings, imageInputs: 1 } },
  ], edges: [{ id: 'iterator-model', source: 'iterator', sourceHandle: 'text', target: 'model', targetHandle: 'prompt' }],
  colorMode: 'dark', viewport: { x: 0, y: 100, zoom: .75 },
};
const storage = new WorkflowStorage(`momoflow-iterator-qa-${crypto.randomUUID()}`);
const root = createRoot(document.getElementById('root')!);
let version = 0;
function render(saved: Workflow) {
  root.render(<ReactFlowProvider key={++version}><ModelTasksProvider><Flow storage={storage} saved={saved} /><Probe /></ModelTasksProvider></ReactFlowProvider>);
}
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
async function until(check: () => boolean, message: string) { for (let i = 0; i < 180; i++) { if (check()) return; await settle(); } throw new Error(message); }
function find<T extends HTMLElement = HTMLElement>(selector: string): T { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element; }
const iteratorSelector = '[data-id="iterator"]';
function iterator() { const node = api.getNode('iterator'); if (!isTextIteratorNode(node)) throw new Error('Iterator missing'); return node; }
function input(selector: string, text: string) {
  const element = find<HTMLTextAreaElement>(selector); element.focus();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, text);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const results = document.getElementById('results')!;
const checks: string[] = [];
function pass(message: string) { checks.push(message); results.textContent = checks.map(item => `PASS ${item}`).join('\n'); }
async function menu(action: string) {
  const trigger = find(`${iteratorSelector} [aria-label="更多选项"]`);
  if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
  await settle();
  const button = [...document.querySelectorAll<HTMLElement>(`${iteratorSelector} [role="menuitem"]`)].find(item => item.textContent?.startsWith(action));
  check(button, `Menu ${action}`); button.click(); await settle();
}
async function run() {
  await storage.load(); render(workflow);
  await until(() => Boolean(document.querySelector(`${iteratorSelector} textarea`)), 'Nodes mount'); await settle();
  check(getComputedStyle(find(iteratorSelector)).width === '460px', 'Reference node width');
  check(parseFloat(getComputedStyle(find(iteratorSelector)).height) < 260, 'Compact height overrides shared Prompt height');
  check(parseFloat(getComputedStyle(find(`${iteratorSelector} textarea`)).width) > 400, 'Entries fill available width');
  check(find(`${iteratorSelector} .iterator-count`).textContent === '3/50', 'Counter');
  check(document.querySelectorAll(`${iteratorSelector} textarea`).length === 3, 'Three separate entries');
  pass('460px 节点、3/50 计数、独立文本输入与双端口');

  const selector = `${iteratorSelector} textarea[aria-label="第 1 条文本"]`;
  find(selector).dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  input(selector, '中文输入\n保留多行');
  find(selector).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
  find(selector).dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文输入' })); await settle();
  check(iterator().data.items.length === 3 && iterator().data.items[0].text === '中文输入\n保留多行', 'IME/multiline');
  check(find<HTMLTextAreaElement>(selector).getBoundingClientRect().height > 32 * api.getZoom(), 'Textarea expands');
  pass('中文合成事件、多行粘贴内容和自动高度');
  input(selector, initialItems[0].text); await settle();
  find(`${iteratorSelector} .iterator-add`).click(); await settle();
  check(iterator().data.items.length === 4 && document.activeElement?.getAttribute('aria-label') === '第 4 条文本', 'New row auto focus');
  input(`${iteratorSelector} textarea[aria-label="第 4 条文本"]`, '新增条目'); await settle();
  find(`${iteratorSelector} [aria-label="删除第 4 条文本"]`).click(); await settle();
  check(iterator().data.items.length === 3, 'Delete row');
  find('[aria-label="撤销"]').click(); await settle(); check(iterator().data.items[3]?.text === '新增条目', 'Undo deletion');
  find('[aria-label="重做"]').click(); await settle(); check(iterator().data.items.length === 3, 'Redo deletion');
  pass('添加自动聚焦、删除与单步撤销重做');

  find(`${iteratorSelector} [aria-label="移动第 1 条文本"]`).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await settle();
  check(iterator().data.items[1].id === 'item-0', 'Reorder keyboard');
  find('[aria-label="撤销"]').click(); await settle(); check(iterator().data.items[0].id === 'item-0', 'Reorder undo');
  const grip = find(`${iteratorSelector} [aria-label="移动第 1 条文本"]`), last = find(`${iteratorSelector} .iterator-item:last-of-type`);
  const transfer = new DataTransfer(); grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
  last.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  last.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  grip.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer })); await settle();
  check(iterator().data.items[2].id === 'item-0', 'Drag reorder');
  find('[aria-label="撤销"]').click(); await settle();
  pass('键盘和拖放排序、顺序撤销');

  await menu('锁定'); check(iterator().data.locked && find<HTMLTextAreaElement>(selector).readOnly, 'Locked editor');
  check(find<HTMLButtonElement>(`${iteratorSelector} .iterator-add`).disabled, 'Locked add');
  check(!find(`${iteratorSelector} .react-flow__handle.source`).classList.contains('connectable'), 'Locked port');
  await menu('解锁'); check(!iterator().data.locked, 'Unlock');
  await menu('创建副本');
  const copy = api.getNodes().find(node => node.id !== 'iterator' && isTextIteratorNode(node)); check(copy && isTextIteratorNode(copy), 'Copy');
  check(copy.data.items.length === 3, 'Copy contains list');
  input(selector, '原节点独立修改'); await settle();
  check(copy.data.items[0].text === initialItems[0].text, 'Copy is independent');
  input(selector, initialItems[0].text); await settle(); await api.deleteElements({ nodes: [copy] }); await settle();
  pass('菜单锁定、解锁与独立副本');

  await menu('重命名');
  const rename = find<HTMLInputElement>(`${iteratorSelector} [aria-label="节点名称"]`);
  rename.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(rename, 'wen ben');
  rename.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  for (const key of ['Enter', 'Escape']) {
    rename.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true })); await settle();
    check(document.activeElement === rename && rename.isConnected && !iterator().data.label, `Composing ${key} preserves rename without committing`);
  }
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(rename, '中文迭代名称');
  rename.dispatchEvent(new Event('input', { bubbles: true }));
  rename.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文迭代名称' })); await settle();
  rename.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
  check(iterator().data.label === '中文迭代名称' && !rename.isConnected, 'Enter commits only after composition ends');
  find('[aria-label="撤销"]').click(); await settle(); check(!iterator().data.label, 'Undo rename');
  find('[aria-label="重做"]').click(); await settle(); check(iterator().data.label === '中文迭代名称', 'Redo rename');
  await menu('重命名');
  const cancelRename = find<HTMLInputElement>(`${iteratorSelector} [aria-label="节点名称"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(cancelRename, '取消更名');
  cancelRename.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  cancelRename.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  check(iterator().data.label === '中文迭代名称' && !cancelRename.isConnected, 'Escape cancels after composition');
  api.updateNodeData('iterator', { label: undefined }); await settle();
  pass('重命名中文合成期间 Enter/Escape 不提交不退出；结束后提交、取消、撤销重做');

  api.addNodes({ id: 'invalid-input', type: 'text', position: { x: -400, y: 0 }, data: { text: '[' } });
  api.addEdges({ id: 'invalid-iterator', source: 'invalid-input', target: 'iterator', targetHandle: 'input' });
  await settle();
  for (const text of ['[', '["文本", 42]', JSON.stringify(Array(51).fill('文本'))]) {
    api.updateNodeData('invalid-input', { text }); await settle();
    await menu('创建副本');
    const error = find(`${iteratorSelector} .text-node-menu-error`).textContent;
    check(error && !error.includes('剪贴板') && api.getNodes().length === 3, 'Invalid snapshot reports input error and preserves nodes');
    await menu('重命名');
    const rename = find<HTMLInputElement>(`${iteratorSelector} [aria-label="节点名称"]`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(rename, '异常输入仍可管理');
    rename.dispatchEvent(new Event('input', { bubbles: true })); await settle();
    rename.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
    check(iterator().data.label === '异常输入仍可管理', 'Rename works with invalid upstream');
    await menu('锁定'); check(iterator().data.locked, 'Lock works with invalid upstream');
    await menu('解锁'); check(!iterator().data.locked, 'Unlock works with invalid upstream');
    await menu('删除'); check(!api.getNode('iterator'), 'Delete works with invalid upstream');
    find('[aria-label="撤销"]').click(); await settle();
    check(api.getNode('iterator') && api.getEdges().some(edge => edge.id === 'invalid-iterator'), 'Undo restores node and invalid input');
  }
  await api.deleteElements({ nodes: [{ id: 'invalid-input' }] });
  api.updateNodeData('iterator', { label: undefined }); await settle();
  pass('无效 JSON、非文本成员、超过上限时仍可重命名、锁定、解锁、删除及撤销；副本错误提示准确');

  api.updateNodeData('iterator', { items: Array.from({ length: 50 }, (_, index) => ({ id: `limit-${index}`, text: `${index}` })) }); await settle();
  check(find<HTMLButtonElement>(`${iteratorSelector} .iterator-add`).disabled && find(`${iteratorSelector} .iterator-count`).textContent === '50/50', '50 limit');
  api.updateNodeData('iterator', { items: initialItems }); await settle();
  pass('50 条上限');

  api.updateNodeData('iterator', { items: [] }); await settle();
  const warning = find('[data-id="model"] .iterator-warning');
  check(warning.textContent?.includes('请至少添加') && warning.querySelector('svg[aria-hidden="true"]'), 'Empty list warning and icon');
  check(getComputedStyle(warning).borderTopStyle === 'solid', 'Warning separator');
  check(!warning.textContent?.includes('text-iterator'), 'No internal node type in warning');
  check(!document.querySelector(`${iteratorSelector} .iterator-warning`), 'Iterator keeps compact list');
  api.updateNodeData('iterator', { items: [{ id: 'empty', text: ' ' }] }); await settle();
  check(find('[data-id="model"] .iterator-warning').textContent?.includes('第 1 条文本为空'), 'Blank item warning');
  input(`${iteratorSelector} textarea`, '补齐文本'); await settle();
  check(!document.querySelector('.iterator-warning') && find('[data-id="model"] .text-iteration-summary').textContent?.includes('1 个任务'), 'Filling entry clears warning');
  api.updateNodeData('iterator', { items: initialItems }); await settle();
  pass('空列表与空白条目的分隔线、警告图标及提示，补齐后自动恢复');

  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === 'model' }))); await settle();
  check(find('[data-id="model"] .text-iteration-summary').textContent?.includes('3 个任务'), 'Model batch count');
  find('[data-id="model"] .sunburst-run').click();
  await until(() => requests.length === 3 && !store.getSnapshot().some(isActiveTask), 'Three independent requests finish');
  check(requests.join('|') === initialItems.map(item => item.text).join('|'), 'Separate prompts');
  check(store.getSnapshot().filter(task => task.state === 'Done').length === 2 && store.getSnapshot().filter(task => task.state === 'Failed').length === 1, 'Independent failures');
  await settle();
  const batch = find<HTMLButtonElement>('.task-batch .task-main'); batch.click(); await settle();
  find('[aria-label="重试任务"]').click();
  await until(() => requests.length === 4 && !store.getSnapshot().some(isActiveTask), 'Retry one item');
  check(requests[3] === initialItems[1].text, 'Retry only failed prompt');
  const model = api.getNode('model'); check(model && isImageGeneratorNode(model) && model.data.results?.length === 3, 'Three results accumulated');
  pass('三条独立请求、两成功一失败、单项重试、三张结果汇总（模拟）');

  find('[aria-label="增加运行次数"]').click(); await settle();
  for (const summary of document.querySelectorAll('.text-iteration-summary')) check(summary.textContent?.includes('6 个任务（每条 2 次）'), 'Node and settings show the same count');
  check(document.querySelectorAll('.text-iteration-summary').length === 2, 'Node and settings summaries both present');
  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === 'iterator' }))); await settle();
  check(find('[data-id="model"] .text-iteration-summary').textContent?.includes('6 个任务'), 'Count persists when selection changes');
  const beforeRepeats = requests.length;
  find('[data-id="model"] .sunburst-run').click();
  await until(() => requests.length === beforeRepeats + 6 && !store.getSnapshot().some(isActiveTask), 'Six independent repeated requests finish');
  check(requests.slice(beforeRepeats).sort().join('|') === initialItems.flatMap(item => [item.text, item.text]).sort().join('|'), 'Displayed six tasks match two requests per item');
  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === 'model' }))); await settle();
  find('[aria-label="减少运行次数"]').click(); await settle();
  for (const summary of document.querySelectorAll('.text-iteration-summary')) check(summary.textContent?.includes('3 个任务') && !summary.textContent.includes('每条 2 次'), 'Reducing repeats updates both summaries');
  pass('运行次数共享：3 条 × 2 次显示 6 个任务，切换选择后节点入口仍提交 6 次（模拟）');

  await until(() => document.body.textContent?.includes('已保存到此浏览器') === true, 'Autosave');
  const saved = await storage.load(); check(saved && saved.nodes.some(node => isTextIteratorNode(node) && node.data.items.length === 3), 'Persisted entries');
  check(saved.edges.some(edge => edge.source === 'iterator' && edge.sourceHandle === 'text'), 'Persisted connection');
  render(saved); await until(() => !!document.querySelector(`${iteratorSelector} textarea`), 'Restored node'); await settle();
  check(iterator().data.items.map(item => item.text).join('|') === initialItems.map(item => item.text).join('|'), 'Restored order and text');
  pass('独立 IndexedDB 保存、重新挂载恢复条目、顺序、连接与结果');
  results.dataset.result = 'passed'; results.textContent = `PASS (${checks.length}) · 本地模拟，无真实模型调用\n${checks.join('\n')}`;
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${error instanceof Error ? error.stack : String(error)}`; });
