import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { NodeRangeInput } from '../src/nodes/shared/NodeRangeInput';
import { rangePointer } from './nodeRangeGesture';
import '../src/index.css';

const events: string[] = [];
const actions: { lock?: () => void; unlock?: () => void; source?: () => void; reset?: (value: number) => void; reduce?: () => void; zoom?: (value: number) => void; hide?: () => void } = {};
function Control({ label, min, max, step, initial }: { label: string; min: number; max: number; step: number; initial: number }) {
  const [value, setValue] = useState(initial), [committed, setCommitted] = useState(initial);
  const [disabled, setDisabled] = useState(false), [source, setSource] = useState('a');
  if (label === '曝光') {
    actions.lock = () => setDisabled(true); actions.unlock = () => setDisabled(false);
    actions.source = () => setSource('b'); actions.reset = setValue;
  }
  return <div className="range-qa-row"><span>{label}</span><NodeRangeInput aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} resetKey={source}
    onValueStart={() => events.push('start')}
    onValueChange={value => { setValue(value); events.push(`change:${value}`); }}
    onValueCommit={value => { setCommitted(value); events.push(`commit:${value}`); }}
    onValueCancel={initial => { setValue(initial); events.push(`cancel:${initial}`); }} />
    <output aria-label={`${label}提交值`}>{committed}</output></div>;
}
export function RangeHarness() {
  const [reduced, setReduced] = useState(false), [zoom, setZoom] = useState(1), [visible, setVisible] = useState(true);
  actions.reduce = () => setReduced(true); actions.zoom = setZoom; actions.hide = () => setVisible(false);
  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'}><div style={{ transform: `scale(${zoom})`, transformOrigin: 'left top' }}>
    {visible && <Control label="曝光" min={-5} max={5} step={.01} initial={0} />}
    <Control label="不透明度" min={0} max={100} step={1} initial={75} />
    <Control label="色相" min={0} max={360} step={1} initial={213.11688311688312} />
    <Control label="画笔大小" min={1} max={500} step={1} initial={30} />
  </div></MotionConfig>;
}
createRoot(document.getElementById('root')!).render(<RangeHarness />);
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const results = document.getElementById('results')!;
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function pass(message: string) { results.textContent += `\nPASS ${message}`; }
function slider(label = '曝光') { const element = document.querySelector<HTMLElement>(`[role="slider"][aria-label="${label}"]`); check(element, `Missing ${label}`); return element; }
function value() { return Number(slider().getAttribute('aria-valuenow')); }
function key(key: string, shiftKey = false, metaKey = false) { slider().dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, metaKey, bubbles: true, cancelable: true })); }
async function move(next: number) { rangePointer(slider(), 'pointermove', next); await settle(); }
async function begin() { rangePointer(slider(), 'pointerdown'); await settle(); }
async function end() { rangePointer(slider(), 'pointerup'); await settle(); }
async function run() {
  await settle(); await document.fonts.ready;
  check(document.querySelectorAll('[role="slider"]').length === 4, 'All ranges mount');
  check(slider('色相').getAttribute('aria-valuetext') === '213', 'Hue readout follows step precision');
  check(slider().getAttribute('aria-valuemin') === '-5' && slider().getAttribute('aria-valuemax') === '5', 'Accessible domain');
  key('ArrowRight'); await settle(); check(value() === .01 && events.includes('commit:0.01'), 'Exposure precision');
  key('ArrowRight', true); await settle(); check(value() === 1.01, 'Shift large step');
  key('PageDown'); await settle(); check(value() === .01, 'PageDown');
  key('Home'); await settle(); check(value() === -5, 'Home'); key('End'); await settle(); check(value() === 5, 'End');
  actions.reset!(0); await settle();
  pass('小数步长、方向键、Shift、PageDown、Home/End 与可访问性');
  events.length = 0;
  await begin(); await move(1.25); await move(2.5);
  check(value() === 2.5 && !events.some(event => event.startsWith('commit:')), 'Draft remains uncommitted');
  await end(); check(events.filter(event => event.startsWith('commit:')).length === 1 && events.includes('commit:2.5'), 'One release commit');
  pass('实时更新与松手仅提交一次');
  for (const scale of [.53, 1, 1.5]) {
    actions.zoom!(scale); await settle();
    await begin(); await move(-2.25); await end(); check(value() === -2.25, `Pointer mapping at ${scale}`);
  }
  actions.zoom!(1); await settle();
  await begin(); await move(.04); check(value() === 0, 'Zero detent'); await move(.8); check(value() === .8, 'Detent releases');
  await move(15); check(value() === 5, 'Overshoot clamps value');
  const band = slider().closest('.node-range-input')!.querySelector<HTMLElement>('.node-range-track')!;
  check(band.style.transform.includes('scaleX(') && !band.style.transform.includes('scaleX(1)'), 'Band stretches');
  await end(); await new Promise(resolve => setTimeout(resolve, 900)); check(getComputedStyle(band).transform === 'none' || Math.abs(new DOMMatrix(getComputedStyle(band).transform).a - 1) < .01, 'Band settles');
  pass('53%/100%/150% 缩放定位、零点吸附、边界限制及回弹收敛');
  for (const cancel of ['Escape', 'undo', 'pointercancel', 'capture', 'blur', 'lock', 'source']) {
    await begin(); await move(1.5); events.length = 0;
    if (cancel === 'Escape') key('Escape');
    else if (cancel === 'undo') key('z', false, true);
    else if (cancel === 'pointercancel') rangePointer(slider(), 'pointercancel');
    else if (cancel === 'capture') slider().closest('.node-range-input')!.querySelector('.node-range-control')!.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }));
    else if (cancel === 'blur') window.dispatchEvent(new Event('blur'));
    else if (cancel === 'lock') actions.lock!();
    else actions.source!();
    await settle(); await end(); check(value() === 5 && events.some(event => event.startsWith('cancel:')) && !events.some(event => event.startsWith('commit:')), `${cancel} rolls back without commit`);
    if (cancel === 'lock') { check(slider().tabIndex === -1 && slider().getAttribute('aria-disabled') === 'true', 'Disabled focus'); actions.unlock!(); await settle(); }
  }
  pass('Esc、撤销快捷键、指针取消、丢失捕获、窗口失焦、锁定与换图取消草稿');
  actions.reduce!(); await settle(); await begin(); await move(-15);
  check(band.style.transform === 'none' || !band.style.transform.includes('scaleX('), 'Reduced stretch'); await end();
  pass('减少动态时取消越界拉伸');
  await begin(); await move(2); events.length = 0; actions.hide!(); await settle();
  check(events.some(event => event.startsWith('cancel:')) && !events.some(event => event.startsWith('commit:')), 'Unmount cancels owner draft');
  pass('关闭控件清理未提交草稿');
  results.dataset.result = 'passed';
}
void run().catch(error => { results.dataset.result = 'failed'; results.textContent += `\nFAIL ${String(error)}`; });
