import { StrictMode, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { ProjectLibrary } from '../src/persistence/projectLibrary';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { useWorkflowPersistence } from '../src/persistence/useWorkflowPersistence';
import { canvasImage } from './fixtures/canvasImage';
import { isSunburstNode, type FileAsset } from '../src/nodes/types';
import '../src/index.css';

const output = document.getElementById('results')!;
let checks = 0;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
  checks++;
  output.textContent += `PASS ${message}\n`;
}
async function until(condition: () => unknown) {
  const deadline = performance.now() + 8000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('等待界面更新超时。');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
function button(selector: string) {
  const element = document.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`按钮不存在：${selector}`);
  return element;
}
const empty: Workflow = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' };

async function run() {
  const prefix = `momoflow-project-qa-${crypto.randomUUID()}`;
  const library = new ProjectLibrary(prefix, `${prefix}-legacy`);
  const restored = await library.restore();
  assert(restored.projects.length === 1 && restored.active.id === 'current', '首次使用保留旧画布入口');
  const old = library.storage(restored.active);
  await old.load();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#e8a87c'; context.fillRect(0, 0, 32, 32);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!)));
  const url = URL.createObjectURL(blob);
  const workflow: Workflow = { ...empty, viewport: { x: 120, y: 140, zoom: 0.7 }, nodes: [
    canvasImage('source', 0, 0, { results: [{ id: 'local', kind: 'image', name: '本地图片.png', url }] }),
    canvasImage('router', 650, 0), canvasImage('preview', 1100, 0),
  ], edges: [{ id: 'edge', source: 'source', sourceHandle: 'result', target: 'router', targetHandle: 'image-0' }] };
  await old.save(workflow);
  await library.rename('current', '无乳糖牛奶—移除产品与包装的长项目名称');
  await library.updatePreview('current', workflow);
  const list = (await library.restore()).projects;
  assert(list[0].thumbnail?.startsWith('data:image/'), '缩略图持久化为小图，不保存临时 URL');
  const second = await library.create('暖冬直播间');
  assert((await library.restore()).active.id === 'current', '新建列表条目不会改变上次选中的旧画布');
  const next = library.storage(second);
  assert((await next.load())?.nodes.length === 0, '新建项目保存真实空画布');
  await next.save(workflow);
  await next.save(empty);
  next.dispose(); old.dispose();
  const reloaded = library.storage(restored.active);
  const original = await reloaded.load();
  assert(original?.nodes.length === 3 && original.edges.length === 1 && original.viewport.zoom === 0.7, '其他项目清空不影响旧项目节点、连线与视图');
  const file = original.nodes[0];
  assert(isSunburstNode(file) && file.data.results?.[0] && (await (await fetch(file.data.results[0].url)).blob()).size === blob.size,
    '其他项目的素材清理不删除旧项目图片');
  reloaded.dispose();
  await library.select(second.id);
  assert((await library.restore()).active.id === second.id, '刷新时恢复上次选择的项目');
  await library.select('current');
  URL.revokeObjectURL(url);

  // Verify switching can await the current save and any edits arriving during it.
  const holder = document.createElement('div'); document.body.append(holder);
  const writes: Workflow[] = [];
  const releases: (() => void)[] = [];
  let fail = false;
  class ControlledStorage extends WorkflowStorage {
    override async save(snapshot: Workflow) {
      if (fail) throw new DOMException('full', 'QuotaExceededError');
      writes.push(snapshot);
      await new Promise<void>(resolve => releases.push(resolve));
    }
  }
  const controlled = new ControlledStorage();
  let controls: { edit: (snapshot: Workflow) => void; persistence: ReturnType<typeof useWorkflowPersistence> } | undefined;
  function SaveHarness() {
    const [snapshot, edit] = useState(empty);
    const persistence = useWorkflowPersistence(controlled, snapshot);
    useLayoutEffect(() => { controls = { edit, persistence }; }, [persistence]);
    return null;
  }
  const harness = createRoot(holder); harness.render(<SaveHarness />);
  await until(() => controls);
  controls!.edit({ ...empty, viewport: { x: 1, y: 0, zoom: 1 } });
  await until(() => controls!.persistence.status === '等待保存…');
  const first = controls!.persistence.flush();
  assert(first === controls!.persistence.flush(), '切换时等待已在进行的保存');
  controls!.edit({ ...empty, viewport: { x: 2, y: 0, zoom: 1 } });
  await new Promise(resolve => setTimeout(resolve, 20));
  releases.shift()!();
  await until(() => writes.length === 2);
  releases.shift()!();
  assert(await first && writes[1].viewport.x === 2, '保存完成包含保存期间到达的新修改');
  fail = true;
  controls!.edit({ ...empty, viewport: { x: 3, y: 0, zoom: 1 } });
  await until(() => controls!.persistence.status === '等待保存…');
  assert(!await controls!.persistence.flush(), '保存失败返回失败，阻止切换');
  await until(() => controls!.persistence.status === '保存失败');
  harness.unmount(); holder.remove();

  const root = createRoot(document.getElementById('root')!);
  root.render(<StrictMode><App projectLibrary={library} /></StrictMode>);
  await until(() => document.querySelector('.canvas-project-count')?.textContent === '节点 3');
  const name = document.querySelector<HTMLElement>('.canvas-project-name')!;
  assert(name.scrollWidth > name.clientWidth && getComputedStyle(name).textOverflow === 'ellipsis', '长项目名在左上角截断');
  await until(() => document.querySelector('.canvas-project-status')?.textContent === '已保存');
  assert(document.querySelector('.canvas-project-status')?.textContent === '已保存', '已保存状态与节点数量显示');
  button('.canvas-project-trigger').click();
  await until(() => document.querySelector('[role="menu"] [aria-checked="true"]'));
  assert(document.activeElement?.getAttribute('aria-checked') === 'true', '菜单打开后焦点落在当前项目');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert(document.activeElement?.textContent === '新建画布项目', 'End 到达固定的新建入口');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => !document.querySelector('.canvas-project-menu'));
  assert(document.activeElement?.classList.contains('canvas-project-trigger'), 'Esc 关闭并恢复触发按钮焦点');
  button('.canvas-project-trigger').click();
  await until(() => document.querySelector('.canvas-project-row[aria-checked="false"]'));
  const switchingMenu = document.querySelector('.canvas-project-menu')!;
  const idleDeleteOpacities: string[] = [];
  const observeSwitchIcons = new MutationObserver(() => {
    if (switchingMenu.getAttribute('aria-busy') !== 'true') return;
    switchingMenu.querySelectorAll('.canvas-project-item:not(:hover) .canvas-project-delete:not(:focus-visible)')
      .forEach(item => idleDeleteOpacities.push(getComputedStyle(item).opacity));
  });
  observeSwitchIcons.observe(switchingMenu, { attributes: true, attributeFilter: ['aria-busy'] });
  button('.canvas-project-row[aria-checked="false"]').click();
  await until(() => document.querySelector('.canvas-project-count')?.textContent === '节点 0');
  observeSwitchIcons.disconnect();
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    assert(idleDeleteOpacities.length > 0 && idleDeleteOpacities.every(opacity => opacity === '0'),
      '切换项目时，未悬停且未聚焦的删除按钮保持隐藏');
  }
  assert(document.querySelector('.canvas-project-name')?.textContent === second.name, '项目切换同时替换名称与画布');
  button('.canvas-project-trigger').click();
  await until(() => document.querySelector('.canvas-project-create'));
  button('.canvas-project-create').click();
  await until(() => document.querySelector('.canvas-project-name')?.textContent === '未命名项目');
  assert(document.querySelector('.canvas-project-count')?.textContent === '节点 0', '新建入口打开空画布');
  button('.canvas-project-trigger').click();
  await until(() => document.querySelectorAll('.canvas-project-row').length === 3);
  const legacyButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.canvas-project-row'))
    .find(item => item.title.startsWith('无乳糖'))!;
  legacyButton.click();
  await until(() => document.querySelector('.canvas-project-count')?.textContent === '节点 3');
  assert(document.querySelectorAll('.react-flow__node').length === 3, '切回旧项目还原全部节点');
  button('.canvas-project-trigger').click();
  await until(() => document.querySelectorAll('.canvas-project-row').length === 3);
  const inactive = button('.canvas-project-row[aria-checked="false"]').closest('.canvas-project-item')!;
  inactive.querySelector<HTMLButtonElement>('.canvas-project-delete')!.click();
  await until(() => document.querySelectorAll('.canvas-project-row').length === 2);
  assert(document.querySelector('.canvas-project-count')?.textContent === '节点 3', '删除其他项目不会切换或改动当前画布');
  await until(() => document.activeElement?.getAttribute('aria-checked') === 'true');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await until(() => document.activeElement?.classList.contains('canvas-project-delete'));
  assert(document.activeElement?.getAttribute('aria-label')?.startsWith('删除项目：'), '右方向键可进入独立删除按钮');
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert(document.activeElement?.classList.contains('canvas-project-row'), '左方向键返回项目选择');
  button('.canvas-project-row[aria-checked="true"]').closest('.canvas-project-item')!
    .querySelector<HTMLButtonElement>('.canvas-project-delete')!.click();
  await until(() => document.querySelector('.canvas-project-count')?.textContent === '节点 0');
  const remaining = await library.restore();
  assert(remaining.projects.length === 1 && remaining.active.id !== 'current', '删除当前项目后切换到剩余项目');
  const retained = library.storage(restored.active);
  assert((await retained.load())?.nodes.length === 3, '删除仅移出项目列表，原画布快照保留');
  retained.dispose();
  button('.canvas-project-trigger').click();
  await until(() => document.querySelectorAll('.canvas-project-row').length === 1);
  button('.canvas-project-delete').click();
  await until(() => !document.querySelector('.canvas-project-menu'));
  const replacement = await library.restore();
  assert(replacement.projects.length === 1 && replacement.active.id !== remaining.active.id
    && document.querySelector('.canvas-project-count')?.textContent === '节点 0', '删除最后一个项目后保留一个新的空白画布');

  const otherSession = new ProjectLibrary(prefix, `${prefix}-legacy`);
  const unnamedId = replacement.active.id;
  assert(!await library.autoName(unnamedId, ' \n '), '空白提示词不用于命名');
  const [firstNamed, secondNamed] = await Promise.all([library.autoName(unnamedId, ' 山间云海\n 晨光 '), otherSession.autoName(unnamedId, '海边日落')]);
  assert(firstNamed && firstNamed.name === secondNamed?.name && ['山间云海 晨光', '海边日落'].includes(firstNamed.name), '并发会话均得到最终保存的标题');
  assert((await otherSession.autoName(unnamedId, '另一次的提示词'))?.name === firstNamed.name
    && (await otherSession.restore()).active.name === firstNamed.name, '按提示词命名后持久化，重新打开项目后不再起名');
  const long = await library.create();
  const prefixText = `${'山'.repeat(30)}👩‍🎨`;
  assert(await library.autoName(long.id, `${prefixText}晨光`)
    && (await library.restore()).projects.find(project => project.id === long.id)?.name === `${prefixText}…`, '长提示词截断到 32 个字符并保留完整表情');
  await otherSession.rename(long.id, '未命名项目');
  const manualName = await library.autoName(long.id, '新的标题');
  assert(manualName?.name === '未命名项目' && manualName.nameStatus === 'manual', '手动标题即使与默认名相同也不会被覆盖');

  root.unmount();
  const archive = new ProjectLibrary(`${prefix}-archive`, `${prefix}-archive-legacy`);
  const archivePeer = new ProjectLibrary(`${prefix}-archive`, `${prefix}-archive-legacy`);
  const firstArchive = (await archive.restore()).active;
  const secondArchive = await archive.create();
  const png = canvas.toDataURL('image/png');
  const result = (id: string, time: number, prompt: string, model: 'Sunburst' | 'Seedream'): FileAsset => ({
    id, name: `${model}-${time}.png`, url: png, kind: 'image',
    generation: { version: 1, inputSignature: JSON.stringify(['model-input-v1', model, { prompt }]), outputSignature: id },
  });
  const newest = result('newest', 1790000000400, '后来运行的提示词', 'Seedream');
  const earliest = result('earliest', 1790000000200, `${prefixText}晨光`, 'Sunburst');
  const olderWithoutPrompt = { ...result('unreadable', 1790000000100, '', 'Sunburst'), generation: undefined };
  const corrupt = result('corrupt', 1790000000150, '损坏记录', 'Sunburst');
  corrupt.generation!.inputSignature = '{broken';
  const firstStorage = archive.storage(firstArchive);
  await firstStorage.save({ ...empty, nodes: [
    canvasImage('newest-model', 20, 120, { results: [newest] }),
    canvasImage('earliest-model', 500, 120, { results: [olderWithoutPrompt, corrupt, earliest], activeResultId: 'unreadable' }),
  ] });
  firstStorage.dispose();
  const secondStorage = archive.storage(secondArchive);
  await secondStorage.load();
  await secondStorage.save({ ...empty, nodes: [canvasImage('another', 20, 120, {
    results: [result('another', 1790000000500, '项目切换补名', 'Sunburst')],
  })] });
  secondStorage.dispose();

  const reopened = createRoot(document.getElementById('root')!);
  reopened.render(<StrictMode><App projectLibrary={archive} /></StrictMode>);
  await until(() => document.querySelector('.canvas-project-name')?.textContent === `${prefixText}…`);
  assert((await archive.restore()).active.name === `${prefixText}…`, '启动时恢复 Image 节点中的最早生图提示词并截断保存');
  button('.canvas-project-trigger').click();
  await until(() => document.querySelector('.canvas-project-row[aria-checked="false"]'));
  button('.canvas-project-row[aria-checked="false"]').click();
  await until(() => document.querySelector('.canvas-project-name')?.textContent === '项目切换补名');
  assert((await archive.restore()).active.name === '项目切换补名', '从菜单打开只保留 Image 生图的旧项目也能补名');
  await archivePeer.rename(secondArchive.id, '另一个标签页手动改名');
  await until(() => document.querySelector('.canvas-project-name')?.textContent === '另一个标签页手动改名');
  assert((await archive.restore()).active.name === '另一个标签页手动改名', '其他会话保存手动标题后同步更新当前项目');

  await archive.rename(firstArchive.id, '未命名项目');
  button('.canvas-project-trigger').click();
  await until(() => document.querySelector('.canvas-project-row[aria-checked="false"][title="未命名项目"]'));
  button('.canvas-project-row[aria-checked="false"][title="未命名项目"]').click();
  await until(() => document.querySelector('.canvas-project-count')?.textContent === '节点 2');
  assert((await archive.restore()).active.name === '未命名项目' && document.querySelector('.canvas-project-name')?.textContent === '未命名项目', '重新打开旧项目时保留手动设定的默认名称');
  output.textContent += `\n${checks} checks passed`;
  output.dataset.result = 'passed';
}

void run().catch(cause => { output.dataset.result = 'failed'; output.textContent += `\nFAIL ${String(cause)}`; console.error(cause); });
