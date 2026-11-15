import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { ColorPaletteNode } from '../src/nodes/ColorPaletteNode';
import { PainterNode } from '../src/nodes/PainterNode';
import type { AppNode } from '../src/nodes/types';
import '../src/index.css';
import '../src/nodes/ColorPaletteNode.css';

// Real nodes with isolated component state: no saved canvas or model requests.
let api: ReactFlowInstance<AppNode>;
const nodeTypes = { 'color-palette': ColorPaletteNode, painter: PainterNode };
const initial = () => [
  { ...createLibraryNode('color-palette', { x: 60, y: 50 })!, id: 'palette' },
  { ...createLibraryNode('painter', { x: 600, y: 50 })!, id: 'painter' },
];
function Harness({ zoom }: { zoom: number }) {
  const [nodes, , onNodesChange] = useNodesState<AppNode>(initial());
  api = useReactFlow<AppNode>();
  return <ReactFlow nodes={nodes} nodeTypes={nodeTypes} onNodesChange={onNodesChange} defaultViewport={{ x: 0, y: 0, zoom }} />;
}
const root = createRoot(document.getElementById('root')!);
const results = document.getElementById('results')!;
const reduce = new URLSearchParams(location.search).has('reduce-motion');
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const pause = async (frames: number) => { for (let i = 0; i < frames; i++) await frame(); };
const find = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
function alignment(id: string) {
  const socket = find(`[data-id="${id}"] .beui-picker-trigger-chip`);
  const chip = socket.querySelector<HTMLElement>(':scope > span:last-child')!;
  const a = socket.getBoundingClientRect(), b = chip.getBoundingClientRect();
  if (a.width < 5 || a.height < 5) throw new Error(`${id} color chip has no rendered area`);
  return Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
}
const passed: string[] = [];
const failures: string[] = [];
async function run() {
  for (const zoom of [.53, 1, 1.5]) {
    root.render(<MotionConfig reducedMotion={reduce ? 'always' : 'user'}><ReactFlowProvider key={zoom}><Harness zoom={zoom} /></ReactFlowProvider></MotionConfig>);
    for (let i = 0; i < 120; i++) {
      await frame();
      if (document.querySelector('[data-id="painter"] .beui-picker-trigger-chip') && api.getNode('palette')) break;
    }
    await pause(45);
    const worst = { palette: 0, painter: 0 };
    for (let step = 0; step < 20; step++) {
      api.setNodes(nodes => nodes.map(node => ({ ...node, dragging: true, position: { x: node.position.x + 6, y: node.position.y + (step < 10 ? 3 : -3) } })));
      await frame();
      for (const id of ['palette', 'painter'] as const) worst[id] = Math.max(worst[id], alignment(id));
    }
    api.setNodes(nodes => nodes.map(node => ({ ...node, dragging: false })));
    for (let step = 0; step < 12; step++) {
      await frame();
      for (const id of ['palette', 'painter'] as const) worst[id] = Math.max(worst[id], alignment(id));
    }
    for (const id of ['palette', 'painter'] as const) {
      if (worst[id] > .75) { failures.push(`${id} chip drifted ${worst[id].toFixed(2)}px at ${zoom * 100}%`); continue; }
      passed.push(`${id} chip follows the node at ${zoom * 100}% (max drift ${worst[id].toFixed(2)}px)`);
    }
    for (const id of ['palette', 'painter'] as const) {
      const trigger = find<HTMLButtonElement>(`[data-id="${id}"] [data-color-picker-trigger]`);
      trigger.click(); await frame();
      // The previous picker may still be returning to its chip. Measure the
      // active dialog's area rather than the first area retained for exit.
      const panel = find('[role="dialog"]');
      const area = panel.querySelector<HTMLElement>('[data-color-picker-area]')!;
      let openingDrift = Infinity;
      // beUI's spring can keep settling after its visual duration, especially
      // when morphing between a zoomed chip and the fixed-size portal.
      for (let i = 0; i < 120; i++) {
        await frame();
        const a = area.getBoundingClientRect(), b = panel.getBoundingClientRect();
        openingDrift = Math.max(Math.abs(a.left - b.left - 12), Math.abs(a.top - b.top - 12));
        if (openingDrift <= .25) break;
      }
      if (openingDrift > .75) failures.push(`${id} panel failed to settle at ${zoom * 100}% (offset ${openingDrift.toFixed(2)}px)`);
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await pause(45);
      let drift = alignment(id);
      api.setNodes(nodes => nodes.map(node => ({ ...node, position: { x: node.position.x + 12, y: node.position.y + 6 } })));
      for (let i = 0; i < 4; i++) { await frame(); drift = Math.max(drift, alignment(id)); }
      if (drift > .75) failures.push(`${id} chip drifted ${drift.toFixed(2)}px after closing at ${zoom * 100}%`);
      else passed.push(`${id} opens and closes at the current node position at ${zoom * 100}%`);
    }
    results.textContent = passed.map(value => `PASS ${value}`).join('\n');
  }
  root.render(<MotionConfig reducedMotion={reduce ? 'always' : 'user'}><ReactFlowProvider key="manual"><Harness zoom={1} /></ReactFlowProvider></MotionConfig>);
  results.dataset.result = failures.length ? 'failed' : 'passed';
  results.textContent = failures.length ? failures.map(value => `FAIL ${value}`).join('\n') : `${passed.length} checks passed\n${results.textContent}`;
}
void run().catch(error => {
  results.dataset.result = 'failed';
  results.textContent = `FAIL ${error instanceof Error ? error.message : String(error)}\n${passed.join('\n')}`;
});

// Native mouse acceptance samples every rendered frame while a real header
// drag runs, so a final screenshot cannot hide a transient offset.
let native: { id: string; startX: number; startY: number; worst: number; trusted: boolean } | undefined;
const manual = document.getElementById('manual')!;
const monitor = () => {
  if (!native) return;
  native.worst = Math.max(native.worst, alignment(native.id));
  requestAnimationFrame(monitor);
};
document.addEventListener('pointerdown', event => {
  const header = (event.target as HTMLElement).closest('.node-header');
  const id = header?.closest<HTMLElement>('[data-id]')?.dataset.id;
  const node = id ? api.getNode(id) : undefined;
  if (!node) return;
  native = { id: node.id, startX: node.position.x, startY: node.position.y, worst: 0, trusted: event.isTrusted };
  requestAnimationFrame(monitor);
}, true);
document.addEventListener('pointerup', () => {
  if (!native) return;
  const drag = native;
  requestAnimationFrame(() => {
    const node = api.getNode(drag.id)!;
    drag.worst = Math.max(drag.worst, alignment(drag.id));
    const moved = Math.hypot(node.position.x - drag.startX, node.position.y - drag.startY) > 5;
    manual.textContent = moved
      ? `${drag.trusted && drag.worst <= .75 ? 'PASS' : 'FAIL'} Native ${drag.id} drag; trusted=${drag.trusted}; max drift=${drag.worst.toFixed(2)}px`
      : 'No node movement recorded. Drag either node header to check native movement.';
    native = undefined;
  });
}, true);
