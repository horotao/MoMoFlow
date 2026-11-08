import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { MarkerType, ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { Flow } from '../src/App';
import type { AppNode } from '../src/nodes/types';
import { WorkflowStorage, type Workflow } from '../src/persistence/workflowStorage';
import { canvasHistoryShortcut } from './canvasShortcuts';
import '../src/index.css';

let api: ReactFlowInstance<AppNode>;
function Probe() { api = useReactFlow<AppNode>(); return null; }
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const results = document.querySelector<HTMLOutputElement>('#results')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const checks: string[] = [];
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks.push(message); }
async function until(predicate: () => boolean, message: string) {
  for (let index = 0; index < 180; index++) { if (predicate()) return; await settle(); }
  throw new Error(message);
}
function port(node: string, direction: 'source' | 'target', handle?: string) {
  const element = document.querySelector<HTMLElement>(`[data-id="${node}"] .react-flow__handle.${direction}${handle ? `[data-handleid="${handle}"]` : ''}`)!;
  const box = element.getBoundingClientRect();
  return { element, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
function mouse(element: EventTarget, type: string, x: number, y: number) {
  element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, bubbles: true, cancelable: true, view: window }));
}
async function drag(from: ReturnType<typeof port>, to: ReturnType<typeof port>, offset = -55) {
  mouse(from.element, 'mousedown', from.x, from.y);
  mouse(document, 'mousemove', from.x + 10, from.y);
  await settle();
  mouse(document, 'mousemove', to.x + offset, to.y);
  await settle();
  return { x: to.x + offset, y: to.y };
}
async function release(point: { x: number; y: number }) { mouse(document, 'mouseup', point.x, point.y); await settle(); }
const edgePath = (id: string, kind = '.magnetic-cable') => document.querySelector<SVGPathElement>(`.react-flow__edge[data-id="${id}"] ${kind}`)!;
async function sample(ids: string[]) {
  const metrics = new Map(ids.map(id => [id, { peak: 0, far: 0, pins: 0, last: 0 }]));
  const started = performance.now();
  while (performance.now() - started < 1400) {
    for (const id of ids) {
      const path = edgePath(id), rest = edgePath(id, '.react-flow__edge-interaction');
      const length = path.getTotalLength(), restLength = rest.getTotalLength();
      const metric = metrics.get(id)!;
      let peak = 0;
      for (let i = 0; i <= 20; i++) {
        const p = path.getPointAtLength(length * i / 20), r = rest.getPointAtLength(restLength * i / 20);
        const delta = Math.hypot(p.x - r.x, p.y - r.y);
        peak = Math.max(peak, delta);
        if (i === 2) metric.far = Math.max(metric.far, delta);
        if (i === 0 || i === 20) metric.pins = Math.max(metric.pins, delta);
      }
      metric.peak = Math.max(metric.peak, peak); metric.last = peak;
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  return metrics;
}
const workflow: Workflow = {
  nodes: [
    { id: 'a', type: 'text', position: { x: 40, y: 70 }, data: { text: 'First source' } },
    { id: 'b', type: 'text', position: { x: 40, y: 620 }, data: { text: 'Second source' } },
    { id: 'consumer', type: 'text', position: { x: 700, y: 330 }, data: { text: '', variableCount: 3 } },
    { id: 'far', type: 'text', position: { x: 1400, y: 70 }, data: { text: '', variableCount: 2 } },
  ],
  edges: [
    { id: 'near', source: 'b', target: 'consumer', targetHandle: 'variable-1' },
    { id: 'old', source: 'b', target: 'consumer', targetHandle: 'variable-2' },
    { id: 'far', source: 'a', target: 'far', targetHandle: 'variable-1', label: 'Existing label', markerEnd: { type: MarkerType.ArrowClosed } },
  ],
  colorMode: 'dark', viewport: { x: 80, y: 100, zoom: 0.75 },
};
const storage = new WorkflowStorage(`momoflow-magnetic-production-${crypto.randomUUID()}`);
await storage.load();
const root = createRoot(document.querySelector('#root')!);
let version = 0;
function render(saved: Workflow) {
  root.render(<StrictMode><MotionConfig reducedMotion="user"><ReactFlowProvider key={++version}>
    <Flow storage={storage} saved={saved} /><Probe />
  </ReactFlowProvider></MotionConfig></StrictMode>);
}
render(workflow);
await until(() => !!document.querySelector('[data-id="consumer"] .react-flow__handle'), 'Canvas mount');
await document.fonts.ready;
await wait(350);
results.textContent = 'Ready · StrictMode production canvas, isolated storage';
run.onclick = async () => {
  run.disabled = true; checks.length = 0; results.textContent = 'Running';
  try {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    check(document.querySelectorAll('.magnetic-cable').length === 3 && !document.querySelector('.port-ripple'), 'Restored edges use the shared renderer without replaying feedback');
    check(document.querySelector('.react-flow__edge-text')?.textContent === 'Existing label' && edgePath('far').getAttribute('marker-end')?.startsWith('url('), 'Existing labels and arrow markers survive the renderer change');
    let point = await drag(port('a', 'source'), port('consumer', 'target', 'variable-2'));
    check(document.querySelector('.magnetic-preview[data-snapped="true"] .magnetic-field'), 'Production ports magnetically attract before direct contact');
    check(document.querySelectorAll('.magnetic-preview circle').length === 1, 'Preview has one tip and no duplicate port outline');
    check(getComputedStyle(document.querySelector('.magnetic-preview .magnetic-wire')!).strokeWidth === '2px', 'Production preview uses the approved line width');
    await release(point);
    const fresh = api.getEdges().find(edge => edge.target === 'consumer' && edge.targetHandle === 'variable-2')!;
    check(fresh.source === 'a' && api.getEdges().length === 3, 'Magnetic release replaces only the intended input');
    check(reduced ? !document.querySelector('.port-absorption') : document.querySelector('[data-feedback-node="consumer"][data-feedback-handle="variable-2"] .absorbing-tip'), 'Absorption uses the dropped production handle and motion preference');
    const animation = sample([fresh.id, 'near', 'far']);
    await wait(180);
    const ring = document.querySelector<SVGCircleElement>('.port-ripple-ring')!;
    check(ring && (reduced ? ring.r.baseVal.value === 9 : ring.r.baseVal.value > 14), 'Production feedback expands its ripple or uses a stationary reduced-motion flash');
    const metrics = await animation;
    check(reduced ? metrics.get(fresh.id)!.peak < 0.1 : metrics.get(fresh.id)!.peak > 2, 'Release spring works with the main app StrictMode wrapper');
    check(reduced ? metrics.get('near')!.peak < 0.1 : metrics.get('near')!.peak > 1 && metrics.get('near')!.far > 0.2, 'Existing neighboring production wires respond along their full length');
    check(metrics.get('far')!.peak < 0.1 && [...metrics.values()].every(item => item.pins < 0.1 && item.last < 0.1), 'Distant wires remain still, endpoints stay fixed and motion settles');
    check(api.getEdges().every(edge => !edge.data?.release && !edge.data?.impact) && !document.querySelector('.port-ripple, .port-absorption'), 'Feedback stays out of graph data and cleans up its visuals');
    canvasHistoryShortcut('undo'); await settle();
    check(api.getEdges().some(edge => edge.id === 'old') && !api.getEdges().some(edge => edge.id === fresh.id), 'One undo restores the replaced connection');
    canvasHistoryShortcut('redo'); await settle();
    check(api.getEdges().some(edge => edge.id === fresh.id) && !document.querySelector('.port-ripple, .port-absorption'), 'Redo restores the graph without replaying feedback');
    check((await sample([fresh.id])).get(fresh.id)!.peak < 0.1, 'Redo does not restart a stale spring');
    point = await drag(port('consumer', 'target', 'variable-2'), port('b', 'source'), 55);
    await release(point);
    check(document.querySelector('[data-feedback-node="b"][data-feedback-handle=""] .port-ripple'), 'Reverse drops confirm at the output handle');
    await wait(900);
    point = await drag(port('a', 'source'), port('consumer', 'target', 'variable-3'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await release(point);
    check(api.getEdges().length === 3 && !document.querySelector('.magnetic-preview, .port-ripple, .node-add-menu'), 'Escape cancels attraction without committing or opening the creation menu');
    api.updateNodeData('a', { locked: true }); await settle();
    point = await drag(port('a', 'source'), port('consumer', 'target', 'variable-3'));
    await release(point);
    check(api.getEdges().length === 3 && !document.querySelector('.port-ripple'), 'Locked sources remain non-connectable');
    api.updateNodeData('a', { locked: false }); await settle();
    await storage.save({ nodes: api.getNodes(), edges: api.getEdges(), viewport: api.getViewport(), colorMode: 'dark' });
    const saved = await storage.load();
    check(saved && saved.edges.every(edge => !edge.data?.release && !edge.data?.impact), 'Saved workflows contain no animation snapshots');
    render(saved);
    await until(() => !!edgePath('near'), 'Saved canvas mount'); await wait(200);
    check(!document.querySelector('.port-ripple, .port-absorption') && (await sample(['near'])).get('near')!.peak < 0.1, 'Reloaded workflows remain still');
    for (const zoom of [0.25, 0.5, 1, 1.5]) {
      render(saved);
      await until(() => !!edgePath('near'), 'Zoom fixture mount'); await wait(200);
      await api.setViewport({ x: 80, y: 100, zoom }); await settle();
      const screenScale = Math.min(zoom, 1), reach = 86 * screenScale;
      const target = port('consumer', 'target', 'variable-3');
      point = await drag(port('a', 'source'), target, -reach - 12);
      const outside = !document.querySelector('.magnetic-preview[data-snapped="true"]');
      point = { x: target.x - reach * 0.65, y: target.y };
      mouse(document, 'mousemove', point.x, point.y); await wait(250);
      check(outside && document.querySelector('.magnetic-preview[data-snapped="true"]'), `${zoom * 100}% zoom uses the smaller capture area below 100% and caps it above`);
      const tip = document.querySelector<SVGCircleElement>('.magnetic-preview .cable-tip')!.getBoundingClientRect();
      const field = document.querySelector<SVGPathElement>('.magnetic-field')!.getBoundingClientRect();
      check(Math.abs(tip.width - 9 * screenScale) < 0.2 && field.width > 64 * screenScale && field.width < 95 * screenScale,
        `${zoom * 100}% zoom keeps both metaball lobes proportional to the capture area`);
      await release(point);
      const absorption = document.querySelector<SVGCircleElement>('.absorbing-tip')?.getBoundingClientRect();
      const ripple = document.querySelector<SVGSVGElement>('.port-ripple')!.getBoundingClientRect();
      check(Math.abs(ripple.width - 128 * screenScale) < 0.5 && (reduced ? !absorption : absorption && absorption.width <= tip.width && absorption.width > tip.width * 0.4),
        `${zoom * 100}% zoom preserves the tip size on release and scales the ripple`);
      await wait(700);
    }
    const freshCanvas = async () => {
      render(workflow);
      await until(() => !!edgePath('old'), 'Fresh gesture fixture'); await wait(200);
    };
    await freshCanvas();
    point = await drag(port('a', 'source'), port('consumer', 'target', 'variable-2'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await release(point);
    port('a', 'source').element.click(); await settle();
    port('consumer', 'target', 'variable-2').element.click(); await settle();
    check(api.getEdges().some(edge => edge.source === 'a' && edge.targetHandle === 'variable-2'), 'Click connection works immediately after Escape cancels a drag');
    port('b', 'source').element.click(); await settle();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
    check(!document.querySelector('.clickconnecting'), 'Escape also clears a pending click connection');
    for (const reason of ['Escape', 'blur', 'touchcancel']) {
      await freshCanvas();
      const source = port('a', 'source');
      mouse(source.element, 'mousedown', source.x, source.y);
      mouse(document, 'mousemove', window.innerWidth - 2, window.innerHeight / 2);
      await wait(120);
      const moving = api.getViewport(); await wait(100);
      check(api.getViewport().x !== moving.x, `${reason} fixture starts with active edge auto-pan`);
      if (reason === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      else document.dispatchEvent(new Event('touchcancel', { bubbles: true }));
      await settle();
      const stopped = api.getViewport(); await wait(160);
      check(api.getViewport().x === stopped.x && api.getViewport().y === stopped.y && !document.querySelector('.magnetic-preview, .port-ripple, .node-add-menu'),
        `${reason} stops auto-pan without another pointer move or release`);
      await release({ x: window.innerWidth - 2, y: window.innerHeight / 2 });
      check(api.getEdges().some(edge => edge.id === 'old') && api.getEdges().length === 3, `${reason} leaves the graph unchanged after physical release`);
    }
    for (const immediateRelease of [false, true]) {
      await freshCanvas();
      const target = port('consumer', 'target', 'variable-2');
      const flowTarget = api.screenToFlowPosition(target);
      point = await drag(port('a', 'source'), target, -60);
      await api.setViewport({ x: target.x + 60 - flowTarget.x * 1.85, y: target.y - flowTarget.y * 1.85, zoom: 1.85 });
      if (!immediateRelease) {
        await wait(80);
        check(!document.querySelector('.magnetic-preview[data-snapped="true"]'), 'Zoom during a held drag refreshes the hit without pointer movement');
      }
      await release(point);
      check(api.getEdges().some(edge => edge.id === 'old') && api.getEdges().length === 3,
        `${immediateRelease ? 'Immediate' : 'Settled'} release after zoom rejects an obsolete 120px hit`);
    }
    await freshCanvas();
    await api.setViewport({ x: -150, y: -145, zoom: 1.85 }); await settle();
    let target = port('consumer', 'target', 'variable-2');
    point = await drag(port('a', 'source'), target, -60);
    await api.setViewport({ x: 80, y: 100, zoom: 0.5 }); await settle();
    target = port('consumer', 'target', 'variable-2');
    point = { x: target.x - 35, y: target.y };
    mouse(document, 'mousemove', point.x, point.y); await settle();
    check(document.querySelector('.magnetic-preview[data-snapped="true"]'), 'Zooming out mid-drag expands the flow-space search to the current radius');
    await release(point);
    check(api.getEdges().some(edge => edge.source === 'a' && edge.targetHandle === 'variable-2'), 'A valid hit after mid-drag zoom still commits normally');
    results.dataset.result = 'passed'; results.textContent = `PASS · ${checks.length} checks\n${checks.join('\n')}`;
  } catch (error) {
    mouse(document, 'mouseup', 0, 0); results.dataset.result = 'failed'; results.textContent = `FAIL ${String(error)}\n${checks.join('\n')}`;
    console.error(error);
  }
};
if (new URLSearchParams(location.search).has('check')) run.click();
