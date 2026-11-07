import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlowProvider, useEdges, useNodes, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { suggestedTextNodeText } from '../src/nodes/defaults';
import { isTextNode, resolveTextValue } from '../src/nodes/textVariables';
import { initialTextDocument } from '../src/nodes/textDocument';
import type { AppNode } from '../src/nodes/types';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';
import '../src/nodes/LevelsNode.css';

let api: ReactFlowInstance<AppNode>;
function Probe() {
  api = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>();
  const edges = useEdges();
  return <output id="qa-state">{JSON.stringify({ nodes, edges, viewport: api.getViewport() })}</output>;
}
const storage = new WorkflowStorage(`momoflow-text-style-qa-${crypto.randomUUID()}`);
const root = createRoot(document.getElementById('root')!);
const legacy = createLibraryNode('levels', { x: 900, y: 90 })!;
legacy.id = 'legacy'; legacy.selected = false;
const workflow: Workflow = {
  nodes: [
    { id: 'prompt', type: 'text', position: { x: 280, y: 90 }, data: { text: '' } },
    { id: 'source', type: 'text', position: { x: -320, y: 90 }, data: { text: '上游中文内容' } },
    legacy,
  ], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark',
};
const results = document.getElementById('results')!;
const checks: string[] = [];
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function pass(message: string) { checks.push(message); results.textContent = checks.map(item => `PASS ${item}`).join('\n'); }
function find<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector); check(element, `Missing ${selector}`); return element;
}
const scope = '[data-id="prompt"]';
const within = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`${scope} ${selector}`);
function prompt() { const node = api.getNode('prompt'); check(node && isTextNode(node), 'Text node missing'); return node; }
async function until(check: () => boolean, message: string) {
  for (let i = 0; i < 180; i++) { if (check()) return; await settle(); }
  throw new Error(message);
}
async function menu(action: string) {
  const trigger = within('[aria-label="更多选项"]');
  if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
  await settle();
  within<HTMLButtonElement>(`[role="menuitem"][data-action="${action}"]`).click();
  await settle();
}
function paste(text: string) {
  const editor = within('.text-node-editor'); editor.focus();
  const data = new DataTransfer(); data.setData('text/plain', text);
  editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
}

async function run() {
  await storage.load();
  root.render(<MotionConfig reducedMotion="user"><ReactFlowProvider><ModelTasksProvider>
    <Flow storage={storage} saved={workflow} /><Probe />
  </ModelTasksProvider></ReactFlowProvider></MotionConfig>);
  await until(() => Boolean(document.querySelector(`${scope} .text-node-editor`)), 'Text editor mounts');
  await document.fonts.ready; await settle();
  const frame = within('.node-frame');
  const frameStyle = getComputedStyle(frame);
  check(frameStyle.width === '454px' && frameStyle.height === '395px', `Figma frame: ${frameStyle.width} × ${frameStyle.height}`);
  check(frameStyle.borderRadius === '28px' && frameStyle.borderTopWidth === '1px', 'Outer radius and border');
  check(getComputedStyle(within('.text-node-content')).width === '424px', '424px content');
  check(getComputedStyle(within('.text-node-content')).borderRadius === '14px', 'Inset radius');
  check(getComputedStyle(frame).backgroundColor === 'rgb(34, 34, 34)', 'Dark node surface');
  check(getComputedStyle(within('.text-node-content')).backgroundColor === 'rgb(25, 25, 25)', 'Dark inset surface');
  check(Boolean(document.querySelector(`${scope} .node-port.target`)) && !frame.querySelector('.node-display'), 'Empty node reserves its first input without variable controls');
  check(getComputedStyle(find('[data-id="legacy"]')).width === '460px'
    && !document.querySelector('[data-id="legacy"] .node-frame'), 'Other nodes retain legacy styling');
  pass('Figma 尺寸 454×395、424px 输入区、28/14px 圆角、1px 边框与深色变量；其他节点保留原样');

  for (const img of frame.querySelectorAll<HTMLImageElement>('img')) {
    await until(() => img.complete, `Asset loads: ${img.src}`);
    check(img.naturalWidth > 0 && img.naturalHeight > 0, `Nonempty image ${img.src}`);
    const width = parseFloat(getComputedStyle(img).width);
    const expected = img.src.endsWith('/text.svg') ? 16 : img.src.endsWith('/more.svg') ? 18
      : img.src.endsWith('/add.svg') ? 11 : 32;
    check(width === expected, `Asset intrinsic size: ${img.src}: ${width}`);
  }
  check(getComputedStyle(within('.text-node-suggestion')).display !== 'none' && prompt().data.text === '', 'Suggestion is not saved as text');
  const editor = within('.text-node-editor'); editor.focus();
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await settle();
  check(prompt().data.text === suggestedTextNodeText, 'Tab inserts suggestion');
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
  check(document.activeElement !== editor, 'Escape exits editor');
  pass('Figma 原始 SVG 尺寸与加载正确；Tab 建议、Escape 退出编辑');

  api.updateNodeData('prompt', { text: '', content: initialTextDocument('', [], 'prompt') }); await settle();
  paste('第一行\n第二行 <b>纯文本</b>'); await settle();
  check(prompt().data.text === '第一行\n第二行 <b>纯文本</b>', 'Paste plain multiline text');
  check(!within('.text-node-editor').querySelector('b'), 'Pasted HTML stays literal');
  editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const before = prompt().data.text;
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', isComposing: true, bubbles: true, cancelable: true }));
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true }));
  editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' })); await settle();
  check(prompt().data.text === before, 'IME keys preserve text');
  api.updateNodeData('prompt', { text: '', content: initialTextDocument('', [], 'prompt') }); await settle();
  within('.text-node-add').click(); await settle();
  check(prompt().data.variableCount === 1 && within('.text-node-variable').textContent?.includes('Variable 1'), 'Add inline variable');
  check(within('.node-port.target').getAttribute('data-handleid') === 'variable-1', 'Stable input handle');
  const port = within('.node-port.target').getBoundingClientRect();
  const bounds = frame.getBoundingClientRect();
  check(Math.abs(port.y + port.height / 2 - bounds.y - 90) <= 1, 'Port vertical center matches Figma');
  api.setEdges([{ id: 'source-prompt', source: 'source', target: 'prompt', targetHandle: 'variable-1' }]); await settle();
  check(within('.text-node-variable').textContent === 'Variable 1: 上游中文内容', 'Name and value display');
  check(getComputedStyle(within('.text-node-variable')).height === '22px', 'Figma variable chip height');
  check(within<HTMLImageElement>('.node-port.target img').src.endsWith('port-text-connected.svg'), 'Connected port state');
  check(resolveTextValue('prompt', api.getNodes(), api.getEdges()).trim() === '上游中文内容', 'Dynamic output');
  pass('多行纯文本粘贴、中文合成事件保护、添加变量、端口位置和真实图数据解析');

  for (const [mode, expected] of [['value', '上游中文内容'], ['source', 'Variable 1'], ['source-value', 'Variable 1: 上游中文内容']] as const) {
    within('.text-node-display-trigger').click(); await settle();
    check(getComputedStyle(within('.node-display-menu')).width === '152px', 'Display menu width');
    within(`[role="option"][data-action="${mode}"]`).click(); await settle();
    check(prompt().data.displayMode === mode && within('.text-node-variable').textContent === expected, `Display ${mode}`);
  }
  api.updateNodeData('source', { text: '上游已更新', content: initialTextDocument('上游已更新', [], 'source') }); await settle();
  check(within('.text-node-variable').textContent?.includes('上游已更新'), 'Updates stay live across display modes');
  pass('变量名+值 / 变量值 / 变量名 三种显示与 152px 菜单；上游更新动态同步');

  await new Promise(resolve => setTimeout(resolve, 400));
  const saved = await storage.load();
  const savedPrompt = saved?.nodes.find(node => node.id === 'prompt');
  check(savedPrompt && isTextNode(savedPrompt) && savedPrompt.data.displayMode === 'source-value'
    && savedPrompt.data.content && saved?.edges.some(edge => edge.target === 'prompt'), 'Rich document, display and connections autosave');
  pass('隔离 IndexedDB 实际保存富文本、变量显示方式和连接，不依赖已移除的保存提示');

  within('[aria-label="更多选项"]').click(); await settle();
  const items = [...frame.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  check(items.map(item => item.dataset.action).join(',') === 'save,duplicate,cut,rename,lock,delete', 'All six Figma menu options');
  check(items[0].disabled && getComputedStyle(within('.node-options-menu')).width === '150px', 'Disabled Save and menu width');
  items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
  check(document.activeElement === items[5], 'Menu End');
  items[5].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  check(document.activeElement === items[1], 'Menu wraps and skips disabled Save');
  items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle();
  check(!frame.querySelector('[role="menu"]'), 'Escape closes menu');
  await menu('rename');
  const rename = within<HTMLInputElement>('[aria-label="节点名称"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(rename, '新的提示词名称');
  rename.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  rename.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
  check(Boolean(frame.querySelector('input')), 'IME Enter does not commit rename');
  rename.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
  check(prompt().data.label === '新的提示词名称', 'Rename commits');
  await menu('lock');
  check(prompt().data.locked && within<HTMLButtonElement>('.text-node-add').disabled
    && within('.text-node-editor').getAttribute('contenteditable') === 'false', 'Lock protects editor and add');
  check(!within('.node-port.target').classList.contains('connectable'), 'Lock protects connections');
  await menu('lock'); check(!prompt().data.locked, 'Unlock');
  await menu('duplicate');
  const copy = api.getNodes().find(node => node.id !== 'prompt' && node.id !== 'source' && isTextNode(node));
  check(copy && isTextNode(copy) && copy.data.displayMode === 'source-value', 'Duplicate preserves content and display');
  await api.deleteElements({ nodes: [copy] }); await settle();
  within('[aria-label="更多选项"]').click(); await settle();
  within('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true })); await settle();
  const shortcutCopy = api.getNodes().find(node => node.id !== 'prompt' && node.id !== 'source' && isTextNode(node));
  check(shortcutCopy && !frame.querySelector('[role="menu"]'), 'Menu shortcut runs once and closes popup');
  await api.deleteElements({ nodes: [shortcutCopy] }); await settle();
  pass('更多菜单六项、保存禁用、键盘导航、重命名合成保护、锁定/解锁与复制');

  await new Promise(resolve => setTimeout(resolve, 350));
  const long = '中文长内容，保持自动增长和内部滚动。\n'.repeat(100);
  api.updateNodeData('prompt', { text: long, content: initialTextDocument(long, [], 'prompt') }); await settle();
  check(parseFloat(getComputedStyle(editor).height) === 518 && editor.scrollHeight > editor.clientHeight, 'Editor scroll cap');
  check(api.getNode('prompt')?.position.x === 280, 'Editing does not move node');
  api.updateNodeData('prompt', { label: '', text: '', content: initialTextDocument('', [], 'prompt'), variableCount: 0 });
  api.setEdges([]); await settle();
  await new Promise(resolve => setTimeout(resolve, 350));
  api.updateNodeData('prompt', { label: '可撤销的标题' }); await settle();
  canvasHistoryShortcut('undo'); await settle();
  check(prompt().data.label === '', 'Undo data edit');
  canvasHistoryShortcut('redo'); await settle();
  check(prompt().data.label === '可撤销的标题', 'Redo data edit');
  api.updateNodeData('prompt', { label: '' });
  api.setNodes(nodes => nodes.map(node => ({ ...node, selected: false }))); await settle();
  pass('长文本增长/滚动、编辑不移动画布、撤销/重做');
  results.dataset.result = 'passed';
  results.textContent += `\n${checks.length} groups passed. Ready for pointer acceptance.`;
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${error instanceof Error ? error.stack : String(error)}`; });
