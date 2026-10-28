import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useNodesState, useReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { SunburstNode } from '../src/nodes/SunburstNode';
import { IdeogramNode } from '../src/nodes/IdeogramNode';
import { NanoBananaNode } from '../src/nodes/NanoBananaNode';
import { defaultSunburstSettings } from '../src/nodes/sunburst';
import { defaultIdeogramSettings } from '../src/nodes/ideogram';
import { defaultNanoBananaSettings } from '../src/nodes/nanoBanana';
import type { AppNode } from '../src/nodes/types';
import '@xyflow/react/dist/style.css';
import '../src/index.css';
import '../src/nodes/SunburstNode.css';

// Exercise the real components and MotionConfig without opening a workflow or
// calling a model. ?native keeps the OS query intact for DevTools media checks.
const nativeMedia = new URLSearchParams(location.search).has('native');
const originalMatchMedia = window.matchMedia.bind(window);
const media = originalMatchMedia('(prefers-reduced-motion: reduce)');
let reduced = false;
if (!nativeMedia) {
  Object.defineProperty(media, 'matches', { get: () => reduced });
  window.matchMedia = query => /^\(prefers-reduced-motion(?:: reduce)?\)$/.test(query) ? media : originalMatchMedia(query);
}
function setReduced(value: boolean) {
  reduced = value;
  media.dispatchEvent(new MediaQueryListEvent('change', { matches: value, media: media.media }));
}

const ids = ['sunburst', 'ideogram', 'nano-banana'] as const;
const nodeTypes = { sunburst: SunburstNode, ideogram: IdeogramNode, 'nano-banana': NanoBananaNode };
const initialNodes: AppNode[] = [
  { id: 'sunburst', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, size: '1024x1024', imageInputs: 1 } },
  { id: 'ideogram', type: 'ideogram', position: { x: 540, y: 0 }, data: { ...defaultIdeogramSettings, aspectRatio: '1:1', imageInputs: 1 } },
  { id: 'nano-banana', type: 'nano-banana', position: { x: 1080, y: 0 }, data: { ...defaultNanoBananaSettings, aspectRatio: '1:1', imageInputs: 1 } },
];
let api: ReactFlowInstance<AppNode>;
let setPolicy: (value: 'user' | 'always' | 'never') => void;
let setMounted: (value: boolean) => void;
function Graph() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  api = useReactFlow<AppNode>();
  return <ReactFlow nodes={nodes} nodeTypes={nodeTypes} onNodesChange={onNodesChange} colorMode="dark" defaultViewport={{ x: 40, y: 230, zoom: .55 }}>
    <Background /><Controls /><MiniMap pannable zoomable />
  </ReactFlow>;
}
function Harness() {
  const [policy, changePolicy] = useState<'user' | 'always' | 'never'>('user');
  const [mounted, changeMounted] = useState(true);
  setPolicy = changePolicy; setMounted = changeMounted;
  return <MotionConfig reducedMotion={policy}>
    {mounted && <ReactFlowProvider><Graph /></ReactFlowProvider>}
    <div className="qa-toolbar"><button onClick={() => ids.forEach(id => setRatio(id, true))}>Portrait</button><button onClick={() => ids.forEach(id => setRatio(id, false))}>Landscape</button></div>
  </MotionConfig>;
}
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const settle = async () => { await frame(); await frame(); };
const preview = (id: string) => document.querySelector<HTMLElement>(`[data-id="${id}"] .sunburst-preview`)!;
const height = (id: string) => parseFloat(getComputedStyle(preview(id)).height);
const targetHeight = (id: string, portrait: boolean) => parseFloat(getComputedStyle(preview(id)).width) * (portrait ? 1.5 : 2 / 3);
function setRatio(id: string, portrait: boolean) {
  api.updateNodeData(id, id === 'sunburst' ? { size: portrait ? '1024x1536' : '1536x1024' } : { aspectRatio: portrait ? '2:3' : '3:2' });
}
async function until(check: () => boolean, message: string) {
  const deadline = performance.now() + 3000;
  while (!check()) { if (performance.now() > deadline) throw new Error(message); await frame(); }
}
const checks: string[] = [];
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  checks.push(message);
}
async function atTarget(id: string, portrait: boolean) {
  await until(() => Math.abs(height(id) - targetHeight(id, portrait)) < .1, `${id} must settle at its ratio`);
}
async function startsAnimating(id: string, portrait: boolean) {
  const before = height(id), target = targetHeight(id, portrait);
  setRatio(id, portrait);
  await until(() => Math.abs(height(id) - before) > 2, `${id} must start changing size`);
  check(Math.abs(height(id) - target) > 2, `${id}: animation has intermediate heights`);
}
async function run() {
  const output = document.getElementById('results')!;
  try {
    await until(() => ids.every(id => preview(id)?.offsetWidth > 0), 'All three image nodes must mount');
    await settle();
    if (nativeMedia) { output.textContent = 'Native media mode · use Portrait / Landscape and emulate prefers-reduced-motion'; return; }
    for (const id of ids) {
      const mountedPreview = preview(id);
      await startsAnimating(id, true);
      setReduced(true);
      await settle();
      check(Math.abs(height(id) - targetHeight(id, true)) < .1, `${id}: enabling reduced motion stops the active spring at its target`);
      setRatio(id, false); await settle();
      check(Math.abs(height(id) - targetHeight(id, false)) < .1, `${id}: subsequent ratio changes snap while reduced motion is on`);
      setReduced(false); await settle();
      await startsAnimating(id, true); await atTarget(id, true);
      check(preview(id) === mountedPreview, `${id}: turning reduced motion off restores animation without remounting`);
    }
    setReduced(true); await settle();
    setMounted(false); await settle();
    setReduced(false); setReduced(true);
    setMounted(true);
    await until(() => ids.every(id => preview(id)?.offsetWidth > 0), 'Nodes remount'); await settle();
    for (const id of ids) {
      setRatio(id, true); await settle();
      check(Math.abs(height(id) - targetHeight(id, true)) < .1, `${id}: nodes mounted with reduced motion enabled snap immediately`);
    }
    setPolicy('never'); await settle();
    await startsAnimating('sunburst', false); await atTarget('sunburst', false);
    check(reduced, 'MotionConfig never overrides an enabled system preference');
    setPolicy('always'); setReduced(false); await settle();
    setRatio('sunburst', true); await settle();
    check(Math.abs(height('sunburst') - targetHeight('sunburst', true)) < .1, 'MotionConfig always overrides a disabled system preference');
    setPolicy('user'); await settle();
    await startsAnimating('sunburst', false); await atTarget('sunburst', false);
    check(true, 'Returning to user policy restores the live system preference');
    output.dataset.result = 'passed'; output.textContent = `PASS · ${checks.length} checks\n${checks.join('\n')}`;
  } catch (error) {
    output.dataset.result = 'failed'; output.textContent = `FAIL · ${String(error)}\n${checks.join('\n')}`;
  }
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
void run();
