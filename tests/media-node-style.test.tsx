import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { SunburstNode } from '../src/nodes/SunburstNode';
import { NanoBananaNode } from '../src/nodes/NanoBananaNode';
import { IdeogramNode } from '../src/nodes/IdeogramNode';
import { defaultNanoBananaSettings } from '../src/nodes/nanoBanana';
import { defaultIdeogramSettings } from '../src/nodes/ideogram';
import { FileNode } from '../src/nodes/FileNode';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import { ModelTasksProvider } from '../src/components/ModelTasksProvider';
import { useModelTaskStore } from '../src/components/useModelTasks';
import type { AppNode, FileAsset } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

const assets: FileAsset[] = [
  { id: 'landscape', name: 'B landscape.png', kind: 'image', url: '/tests/fixtures/image-node-1.png', width: 1536, height: 1152 },
  { id: 'square', name: 'A square.png', kind: 'image', url: '/tests/fixtures/image-node-2.png', width: 1024, height: 1024 },
];
const modelIds = ['gpt', 'nano', 'ideogram'];
const allIds = [...modelIds, 'import'];
const zoom = .6;
const initial: AppNode[] = [
  { id: 'gpt', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } },
  { id: 'nano', type: 'nano-banana', position: { x: 540, y: 0 }, data: { ...defaultNanoBananaSettings, imageInputs: 1 } },
  { id: 'ideogram', type: 'ideogram', position: { x: 1080, y: 0 }, data: { ...defaultIdeogramSettings, imageInputs: 1 } },
  { id: 'import', type: 'file', position: { x: 1620, y: 0 }, data: {} },
];
const nodeTypes = { sunburst: SunburstNode, 'nano-banana': NanoBananaNode, ideogram: IdeogramNode, file: FileNode };
let api: ReactFlowInstance<AppNode>;
let tasks: ReturnType<typeof useModelTaskStore>;
function fill(count: number) {
  modelIds.forEach(id => document.querySelector<HTMLButtonElement>(`[data-id="${id}"] button[aria-label="返回单张展示"]`)?.click());
  const collection = count === 4 ? [...assets, ...assets.map(item => ({ ...item, id: `${item.id}-copy` }))] : assets.slice(0, count);
  modelIds.forEach(id => api.updateNodeData(id, { results: collection, activeResultId: collection[0]?.id, orderBy: 'date' }));
  api.updateNodeData('import', { assets: collection, activeAssetId: collection[0]?.id, viewMode: 'single', orderBy: 'date' });
  if (count) requestAnimationFrame(() => requestAnimationFrame(() => button('import', '图片画廊')?.focus()));
}
function progress(value: number) {
  tasks.update(() => modelIds.map(id => ({ id: `fixture-${id}`, batchId: 'fixture', nodeId: id, model: id, createdAt: 0, started: 0, progress: value, state: 'Running' })));
}
function Graph() {
  api = useReactFlow<AppNode>(); tasks = useModelTaskStore();
  const [nodes, , onNodesChange] = useNodesState(initial);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  return <>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onConnect={connection => setEdges(current => addEdge(connection, current))} colorMode="dark" defaultViewport={{ x: 50, y: 40, zoom }}>
      <Background /><Controls /><MiniMap pannable zoomable />
    </ReactFlow>
    <div className="qa-toolbar"><button onClick={() => fill(0)}>空状态</button><button onClick={() => fill(2)}>双图</button><button onClick={() => fill(4)}>四图</button><button onClick={() => progress(37)}>运行 37%</button><button onClick={() => tasks.update(() => [])}>结束运行</button></div>
  </>;
}
const checks: string[] = [];
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function until(check: () => boolean, message: string) {
  const deadline = performance.now() + 5000;
  while (!check()) { if (performance.now() > deadline) throw new Error(message); await frame(); }
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  checks.push(message);
}
const node = (id: string) => document.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
const surface = (id: string) => node(id).querySelector<HTMLElement>(id === 'import' ? '.file-node-media' : '.sunburst-preview')!;
const button = (id: string, label: string) => node(id).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
async function run() {
  const result = document.getElementById('results')!;
  try {
    await until(() => allIds.every(id => node(id)?.offsetWidth), 'Nodes must mount');
    await document.fonts.ready;
    for (const id of allIds) {
      check(node(id).querySelector('.node-frame')?.clientWidth === 454, `${id}: 456px shared frame including border`);
      check(surface(id).clientWidth === 424 && surface(id).clientHeight === 424, `${id}: 424px square checkerboard`);
      check(getComputedStyle(surface(id)).borderRadius === '14px', `${id}: 14px image corners`);
      check(Math.abs(node(id).getBoundingClientRect().height / zoom - 542) < 1, `${id}: 542px empty node height (actual ${node(id).offsetHeight}, frame ${node(id).querySelector<HTMLElement>('.node-frame')!.offsetHeight})`);
    }
    fill(2);
    await until(() => Array.from(document.querySelectorAll<HTMLImageElement>('.node-image-single > img')).every(img => img.complete && img.naturalWidth > 0) && Boolean(surface('gpt').querySelector('img')), 'Fixture images must load');
    await until(() => Math.abs(surface('gpt').clientHeight - 318) < 1, 'GPT preview must use actual result ratio');
    for (const id of allIds) {
      check(surface(id).clientHeight === 318, `${id}: landscape preview retains natural ratio`);
      check(surface(id).querySelector('.node-image-resolution')?.textContent === '1536 × 1152', `${id}: actual dimensions appear`);
      button(id, '图片画廊').focus(); await frame();
      check(getComputedStyle(surface(id).querySelector('.node-image-overlay')!).opacity === '1', `${id}: keyboard focus reveals image tools`);
      check(button(id, '全屏展开').offsetWidth === 24 && button(id, '全屏展开').offsetHeight === 24, `${id}: 24px image actions`);
      button(id, '排序方式').click(); await frame(); await frame();
      const sort = document.querySelector<HTMLButtonElement>('[role="menu"] button:last-child')!;
      sort.click(); await frame(); await frame();
      const current = api.getNode(id);
      check(current && 'orderBy' in current.data && current.data.orderBy === 'name', `${id}: sorting menu updates the owning node`);
      button(id, '下一张').click();
      await until(() => surface(id).clientHeight === 424, `${id}: square preview must resize`);
      button(id, '上一张').click();
      await until(() => surface(id).clientHeight === 318, `${id}: previous image must return`);
      button(id, '图片画廊').click();
      await until(() => surface(id).querySelectorAll('.node-image-tile').length === 2, `${id}: gallery must open`);
      const tile = surface(id).querySelector<HTMLElement>('.node-image-tile[aria-pressed="false"]')!;
      tile.click(); await frame(); await frame();
      check(tile.getAttribute('aria-pressed') === 'true', `${id}: thumbnail updates active image`);
      check(parseFloat(getComputedStyle(surface(id).querySelector('.node-image-grid')!).paddingLeft) === 8, `${id}: gallery has 8px edge padding`);
      check(surface(id).querySelectorAll('.node-image-column').length === 2, `${id}: masonry uses two columns`);
      button(id, '返回单张展示').click();
      await until(() => surface(id).clientHeight === 424, `${id}: gallery return keeps selected image`);
      button(id, '全屏展开').click();
      await until(() => Boolean(document.querySelector('[role="dialog"]')), 'Fullscreen viewer must open');
      check(Boolean(document.querySelector('.file-gallery img')), `${id}: fullscreen displays current image`);
      document.querySelector<HTMLButtonElement>('.file-gallery button[aria-label="Close"]')!.click();
      await frame(); await frame();
    }
    fill(4); await frame(); await frame();
    for (const id of allIds) {
      button(id, '图片画廊').click(); await frame(); await frame();
      check(surface(id).querySelectorAll('.node-image-tile').length === 4, `${id}: four-image gallery`);
      check(surface(id).querySelectorAll('.node-image-column')[0].children.length === 2, `${id}: images distribute across columns`);
    }
    const widths: number[] = [];
    for (const value of [9, 10, 100]) {
      progress(value); await frame(); await frame();
      for (const id of modelIds) {
        const control = node(id).querySelector<HTMLElement>('.image-node-run-progress')!;
        widths.push(control.getBoundingClientRect().width);
        check(getComputedStyle(control).fontFamily.includes('DM Mono'), `${id} ${value}%: monospace progress font`);
      }
    }
    check(widths.every(width => Math.abs(width - 98 * zoom) < .1), 'All three models keep a fixed 98px control at 9%, 10%, 100%');
    for (const id of modelIds) {
      button(id, '取消运行').click(); await frame(); await frame();
      check(tasks.getSnapshot().find(task => task.nodeId === id)?.state === 'Cancelled', `${id}: progress cancel still cancels the actual task`);
    }
    check(!node('nano').querySelector('[data-handleid="mask"]') && node('ideogram').querySelector('[data-handleid="mask"]'), 'Model-specific mask inputs are preserved');
    for (const id of ['nano', 'ideogram']) check(Boolean(node(id).querySelector('.node-title-icon svg')), `${id}: original model brand icon is preserved`);
    fill(0); await frame(); await frame();
    const loadedImages = Array.from(document.querySelectorAll<HTMLImageElement>('.media-node-frame img'));
    await until(() => loadedImages.every(img => img.complete && img.naturalWidth > 0), 'All design SVG assets must load');
    check(loadedImages.every(img => img.getBoundingClientRect().width > 0), 'Every visible design asset has non-empty rendered geometry');
    result.dataset.result = 'passed'; result.textContent = `PASS (${checks.length}) · 无真实模型调用\n${checks.join(' · ')}`;
  } catch (error) {
    result.dataset.result = 'failed'; result.textContent = `FAIL after ${checks.length} checks: ${error instanceof Error ? error.message : String(error)}`;
  }
}
createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><ModelTasksProvider><ReactFlowProvider><Graph /></ReactFlowProvider></ModelTasksProvider></MotionConfig>);
void run();
