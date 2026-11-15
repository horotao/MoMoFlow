import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { createLibraryNode } from '../src/components/libraryCatalog';
import { ColorPaletteNode } from '../src/nodes/ColorPaletteNode';
import { PainterNode } from '../src/nodes/PainterNode';
import type { AppNode } from '../src/nodes/types';
import '../src/index.css';
import '../src/nodes/ColorPaletteNode.css';

const nodeTypes = { 'color-palette': ColorPaletteNode, painter: PainterNode };
let api: ReactFlowInstance<AppNode>;
function Harness({ zoom }: { zoom: number }) {
  const [nodes, , onNodesChange] = useNodesState<AppNode>([
    { ...createLibraryNode('color-palette', { x: 50, y: 40 })!, id: 'palette' },
    { ...createLibraryNode('painter', { x: 580, y: 40 })!, id: 'painter' },
  ]);
  api = useReactFlow<AppNode>();
  return <ReactFlow nodes={nodes} nodeTypes={nodeTypes} onNodesChange={onNodesChange} panOnDrag={[1, 2]} defaultViewport={{ x: 0, y: 0, zoom }} />;
}
const root = createRoot(document.getElementById('root')!);
const results = document.getElementById('results')!;
const reduce = new URLSearchParams(location.search).has('reduce-motion');
let revision = 0;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const pause = async (count: number) => { for (let i = 0; i < count; i++) await frame(); };
function find<T extends HTMLElement = HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const palette = (index: number) => document.querySelectorAll<HTMLButtonElement>('[data-id="palette"] [data-color-picker-trigger]')[index];
const painter = () => find<HTMLButtonElement>('[data-id="painter"] [data-color-picker-trigger]');
const area = () => find('[role="dialog"] [data-color-picker-area]');
async function reset(zoom = 1) {
  root.render(<MotionConfig reducedMotion={reduce ? 'always' : 'user'}><ReactFlowProvider key={++revision}><Harness zoom={zoom} /></ReactFlowProvider></MotionConfig>);
  for (let i = 0; i < 120; i++) { await frame(); if (document.querySelector('[data-id="painter"] [data-color-picker-trigger]')) break; }
  await pause(8);
}
async function open(trigger: HTMLButtonElement, settle = true) {
  trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  trigger.click(); await frame();
  if (settle) {
    for (let i = 0; i < 120; i++) {
      await frame();
      if (getComputedStyle(area()).visibility === 'visible' && Math.abs(area().getBoundingClientRect().width - area().offsetWidth) < .25 && i > 5) break;
    }
    await pause(5);
  }
}
function close() { find('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
const passed: string[] = [], failures: string[] = [];
async function test(name: string, run: () => Promise<void>) {
  try { await run(); passed.push(name); } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
  results.textContent = [...failures.map(value => `FAIL ${value}`), ...passed.map(value => `PASS ${value}`)].join('\n');
}
async function returnMotion(trigger: HTMLButtonElement, dismiss = close) {
  await open(trigger);
  const previous = area(), initial = previous.getBoundingClientRect();
  const socket = trigger.querySelector<HTMLElement>('.beui-picker-trigger-chip')!;
  const target = socket.getBoundingClientRect();
  dismiss();
  let shrank = false, arrived = false;
  for (let i = 0; i < 120; i++) {
    await frame();
    if (!previous.isConnected) break;
    const rect = previous.getBoundingClientRect();
    if (rect.width < initial.width * .9 && rect.width > target.width + 1) shrank = true;
    if (Math.abs(rect.left - target.left) < 2 && Math.abs(rect.top - target.top) < 2 && Math.abs(rect.width - target.width) < 2) arrived = true;
  }
  check(reduce || (shrank && arrived), `No visible return path (shrank=${shrank}, arrived=${arrived})`);
  check(!previous.isConnected, 'Closed saturation area remained mounted');
  const restored = socket.querySelector<HTMLElement>('[data-color-picker-chip]')!;
  check(getComputedStyle(restored).visibility === 'visible', 'Restored chip stayed hidden');
  const chip = restored.getBoundingClientRect();
  check(Math.abs(chip.left - target.left) < .75 && Math.abs(chip.top - target.top) < .75, 'Color chip did not settle in its socket');
}
async function panDuringReturn(trigger: HTMLButtonElement, closeFirst: boolean) {
  await open(trigger);
  const previous = area();
  const socket = trigger.querySelector<HTMLElement>('.beui-picker-trigger-chip')!;
  const chip = socket.querySelector<HTMLElement>('[data-color-picker-chip]')!;
  const pane = find('.react-flow__pane');
  const start = api.getViewport();
  const pointer = { bubbles: true, button: 1, buttons: 4, clientX: 30, clientY: 140 };
  if (closeFirst) { close(); await pause(3); }
  pane.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, pointerId: 1, pointerType: 'mouse' }));
  pane.dispatchEvent(new MouseEvent('mousedown', { ...pointer, view: window }));
  let restoredWhileHeld = false, arrived = false, drift = 0;
  try {
    for (let step = 1; step <= 100; step++) {
      window.dispatchEvent(new MouseEvent('mousemove', { ...pointer, view: window, clientX: 30 + step * 2, clientY: 140 + Math.sin(step / 12) * 24 }));
      await frame();
      const target = socket.getBoundingClientRect();
      if (previous.isConnected) {
        const rect = previous.getBoundingClientRect();
        if (Math.abs(rect.left - target.left) < 3 && Math.abs(rect.top - target.top) < 3 && Math.abs(rect.width - target.width) < 2) arrived = true;
      } else if (getComputedStyle(chip).visibility === 'visible') {
        restoredWhileHeld = true;
        const rect = chip.getBoundingClientRect();
        drift = Math.max(drift, Math.abs(rect.left - target.left), Math.abs(rect.top - target.top));
      }
    }
    check(Math.abs(api.getViewport().x - start.x) > 150, 'Middle-button mouse events did not pan the real React Flow viewport');
    check(restoredWhileHeld, 'Color stayed in the portal until middle-button release');
    check(reduce || arrived, 'Return animation missed the moving color socket');
    check(drift < .75, `Restored color drifted ${drift.toFixed(2)}px while panning`);
    check(!document.querySelector('[data-color-picker-panel]'), 'Closed panel remained mounted during pan');
  } finally {
    window.dispatchEvent(new MouseEvent('mouseup', { ...pointer, view: window, buttons: 0 }));
    pane.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, pointerId: 1, pointerType: 'mouse' }));
  }
}
async function run() {
  for (const zoom of [.53, 1, 1.5]) {
    for (const id of ['palette', 'painter']) {
      for (const closeFirst of [false, true]) {
        await reset(zoom);
        await test(`${id} returns during held middle pan${closeFirst ? ' started after closing' : ''} at ${zoom * 100}%`, () => panDuringReturn(id === 'palette' ? palette(0) : painter(), closeFirst));
      }
    }
  }
  if (new URLSearchParams(location.search).has('pan-only')) { finish(); return; }
  for (const zoom of [.53, 1, 1.5]) {
    for (const id of ['palette', 'painter']) {
      await reset(zoom);
      await test(`${id} returns visibly and unmounts at ${zoom * 100}%`, () => returnMotion(id === 'palette' ? palette(0) : painter()));
    }
  }
  await reset();
  await test('Switching palette colors removes the previous saturation area', async () => {
    await open(palette(0)); const previous = area();
    await open(palette(1));
    await pause(90);
    check(!previous.isConnected, 'First color area did not exit');
    check(document.querySelectorAll('[data-color-picker-area]').length === 1, 'Multiple saturation areas remain after switching');
    check(palette(0).getAttribute('aria-expanded') === 'false' && palette(1).getAttribute('aria-expanded') === 'true', 'Wrong active color');
  });
  for (const id of ['palette', 'painter']) {
    for (const method of ['trigger', 'outside']) {
      await reset();
      const trigger = id === 'palette' ? palette(0) : painter();
      await test(`${id} returns when closed by ${method}`, () => returnMotion(trigger, () => {
        if (method === 'trigger') trigger.click();
        else document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      }));
    }
  }
  await reset();
  await test('Rapid A/B/C/A switching leaves only the current color', async () => {
    for (const index of [0, 1, 2, 0, 3, 1, 0]) { await open(palette(index), false); await pause(2); }
    await pause(120);
    check(document.querySelectorAll('[data-color-picker-area]').length === 1, 'Rapid switching left an old area');
    check(document.querySelectorAll('[data-color-picker-panel]').length === 1, 'Rapid switching left an old panel');
    check(document.querySelectorAll('[aria-expanded="true"][data-color-picker-trigger]').length === 1, 'Multiple active triggers');
    check(palette(0).getAttribute('aria-expanded') === 'true', 'Last color did not stay open');
    close(); await pause(120);
    check(!document.querySelector('[data-color-picker-area]'), 'Final close left a saturation area');
  });
  await reset();
  await test('Opening two triggers in one batch selects the last color', async () => {
    palette(0).click(); palette(1).click(); await pause(120);
    check(document.querySelectorAll('[data-color-picker-area]').length === 1, 'Same-batch switching opened two areas');
    check(palette(0).getAttribute('aria-expanded') === 'false' && palette(1).getAttribute('aria-expanded') === 'true', 'Same-batch active color is wrong');
  });
  for (const id of ['palette', 'painter']) {
    await reset();
    await test(`${id} can reopen during return without a duplicate area`, async () => {
      const trigger = id === 'palette' ? palette(0) : painter();
      await open(trigger); close(); await pause(3); await open(trigger, false); await pause(120);
      check(document.querySelectorAll('[data-color-picker-area]').length === 1 && trigger.getAttribute('aria-expanded') === 'true', 'Interrupted return did not reopen cleanly');
      close(); await pause(120);
      check(!document.querySelector('[data-color-picker-area]'), 'Interrupted return failed to clean up');
    });
  }
  await reset();
  finish();
}
function finish() {
  results.dataset.result = failures.length ? 'failed' : 'passed';
  results.textContent = `${failures.length ? `${failures.length} checks failed` : `${passed.length} checks passed`}\n${results.textContent}`;
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent = `FAIL ${error instanceof Error ? error.message : String(error)}`; });
