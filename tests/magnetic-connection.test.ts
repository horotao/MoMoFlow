// Browser-only regression checks: /tests/magnetic-connection.html?check
import { magneticOutline, nearbyCable } from './magnetic-connection/geometry';

const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

function port(node: string, handle: string) {
  const element = document.querySelector<HTMLElement>(`[data-nodeid="${node}"][data-handleid="${handle}"]`);
  if (!element) throw new Error(`Missing port: ${node}/${handle}`);
  const rect = element.getBoundingClientRect();
  return { element, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function mouse(element: EventTarget, type: string, x: number, y: number) {
  element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, bubbles: true, cancelable: true, view: window }));
}

async function drag(from: [string, string], to: [string, string], offset = -50) {
  const source = port(...from), target = port(...to);
  mouse(source.element, 'mousedown', source.x, source.y);
  mouse(document, 'mousemove', source.x + 8, source.y);
  await settle();
  mouse(document, 'mousemove', target.x + offset, target.y);
  await settle();
  return { x: target.x + offset, y: target.y };
}

async function sampleCable(edgeId: string) {
  const samples: { start: DOMPoint; end: DOMPoint; middle: DOMPoint; nearSource: DOMPoint; nearTarget: DOMPoint; fromSource: DOMPoint; fromTarget: DOMPoint }[] = [];
  const started = performance.now();
  while (performance.now() - started < 1600) {
    const path = document.querySelector<SVGPathElement>(`.react-flow__edge[data-id="${edgeId}"] .magnetic-cable`);
    if (!path) throw new Error(`Missing cable: ${edgeId}`);
    const length = path.getTotalLength();
    const restLength = path.parentElement!.querySelector<SVGPathElement>('.react-flow__edge-interaction')!.getTotalLength();
    samples.push({
      start: path.getPointAtLength(0), end: path.getPointAtLength(length), middle: path.getPointAtLength(length / 2),
      nearSource: path.getPointAtLength(restLength * 0.1), nearTarget: path.getPointAtLength(length - restLength * 0.1),
      fromSource: path.getPointAtLength(restLength * 0.6), fromTarget: path.getPointAtLength(length - restLength * 0.6),
    });
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  return samples;
}

async function sampleRipple(nodeId: string, handleId: string) {
  const selector = `[data-nodeid="${nodeId}"][data-handleid="${handleId}"] .port-ripple-ring`;
  const read = () => {
    const ring = document.querySelector<SVGCircleElement>(selector);
    if (!ring) throw new Error(`Missing connection ripple: ${nodeId}/${handleId}`);
    return { radius: ring.r.baseVal.value, opacity: Number(getComputedStyle(ring).opacity) };
  };
  const start = read();
  await wait(180);
  const expanded = read();
  await wait(550);
  return { start, expanded, removed: !document.querySelector(selector) };
}

async function sampleAbsorption(nodeId: string, handleId: string) {
  const selector = `[data-nodeid="${nodeId}"][data-handleid="${handleId}"] .absorbing-tip`;
  const read = () => {
    const tip = document.querySelector<SVGCircleElement>(selector);
    return tip ? { radius: tip.r.baseVal.value, distance: Math.hypot(tip.cx.baseVal.value, tip.cy.baseVal.value) } : null;
  };
  const start = read();
  await wait(80);
  const shrinking = read();
  await wait(220);
  return { start, shrinking, removed: !document.querySelector(selector) };
}

async function setSlider(label: string, value: number) {
  const slider = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, String(value));
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

function maximumFieldCorner() {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  let maximum = 0;
  for (const zoom of [0.6, 1.6]) {
    for (const distance of [0, 25.99, 26.01, 38, 49.99, 50.01, 65]) {
      for (const angle of [0, 0.7, 2.5]) {
        const outline = magneticOutline({ x: 0, y: 0 }, { x: distance * Math.cos(angle) / zoom, y: distance * Math.sin(angle) / zoom }, 38 / zoom, 12 / zoom);
        if (/NaN|Infinity/.test(outline)) throw new Error('Non-finite metaball outline');
        path.setAttribute('d', outline);
        const length = path.getTotalLength(), step = 0.3 / zoom;
        for (let offset = 0; offset < length; offset += step / 2) {
          const before = path.getPointAtLength((offset + length - step) % length);
          const point = path.getPointAtLength(offset);
          const after = path.getPointAtLength((offset + step) % length);
          const ux = point.x - before.x, uy = point.y - before.y;
          const vx = after.x - point.x, vy = after.y - point.y;
          const cosine = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
          maximum = Math.max(maximum, Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI);
        }
      }
    }
  }
  return maximum;
}

export async function runMagneticChecks() {
  const result = document.createElement('output');
  result.id = 'magnetic-checks';
  result.style.cssText = 'position:fixed;bottom:80px;left:24px;z-index:3000;max-width:530px;padding:12px 18px;border:1px solid #555;background:#161a13;color:#cddd96;font:11px/1.7 monospace;white-space:pre-line;pointer-events:none';
  result.textContent = 'Running magnetic connection checks…';
  document.body.append(result);
  const checks: string[] = [];
  const check = (value: unknown, message: string) => { if (!value) throw new Error(message); checks.push(message); };
  const count = () => document.querySelectorAll('.react-flow__edge').length;
  const field = () => document.querySelector('.magnetic-field');
  const release = async (point: { x: number; y: number }) => { mouse(document, 'mouseup', point.x, point.y); await settle(); };
  try {
    await document.fonts.ready;
    for (let attempt = 0; attempt < 120 && document.querySelectorAll('.magnetic-port').length < 8; attempt++) await settle();
    await wait(400);
    check(count() === 1, 'Initial fixture has one edge');
    check(maximumFieldCorner() < 8, 'Metaball contour stays smooth through overlap, rotation and zoom');
    check(nearbyCable({ x: -350, y: 0 }, { x: 350, y: 0 }, { x: 0, y: 50 }, 1), 'Nearby response includes a cable passing through the area with distant endpoints');
    check(!nearbyCable({ x: -350, y: 0 }, { x: 350, y: 0 }, { x: 0, y: 200 }, 1), 'Cables outside the impact radius are excluded');
    let point = await drag(['image', 'image-out'], ['mixer', 'image-in']);
    check(field(), 'Attracts before the pointer touches the port');
    check(!document.querySelector('.port-ripple, .port-absorption'), 'Hover and attraction do not trigger release feedback');
    await release(point);
    check(count() === 2, 'Release commits a forward connection');
    const [samples, ripple, absorption] = await Promise.all([sampleCable('xy-edge__imageimage-out-mixerimage-in'), sampleRipple('mixer', 'image-in'), sampleAbsorption('mixer', 'image-in')]);
    const final = samples.at(-1)!;
    const dx = final.end.x - final.start.x, dy = final.end.y - final.start.y;
    const displacements = samples.map(sample => ((sample.middle.x - final.middle.x) * -dy + (sample.middle.y - final.middle.y) * dx) / Math.hypot(dx, dy));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    check(reduced ? !absorption.start && !absorption.shrinking : absorption.start && absorption.shrinking && absorption.shrinking.radius < absorption.start.radius - 0.5 && absorption.shrinking.distance < absorption.start.distance - 1, reduced ? 'Reduced motion skips moving and shrinking the released tip' : 'Released tip shrinks while travelling into the dropped port');
    check(absorption.removed, 'Absorbed tip is removed after the transition');
    check(reduced ? ripple.expanded.radius === ripple.start.radius : ripple.expanded.radius > ripple.start.radius + 5, reduced ? 'Reduced motion uses a stationary confirmation flash' : 'Successful connection expands a ring from the dropped port');
    check(ripple.expanded.opacity < ripple.start.opacity && ripple.removed, 'Success ripple fades and is removed after playing once');
    check(reduced ? Math.max(...displacements.map(Math.abs)) < 0.1 : Math.min(...displacements) < -1 && Math.max(...displacements) > 1, reduced ? 'Reduced motion skips the release bounce' : 'Release bends past rest and rebounds in the opposite direction');
    check(samples.every(sample => Math.hypot(sample.start.x - final.start.x, sample.start.y - final.start.y) < 0.1 && Math.hypot(sample.end.x - final.end.x, sample.end.y - final.end.y) < 0.1), 'Both cable endpoints stay pinned throughout the bounce');
    check(displacements.slice(-6).every(value => Math.abs(value) < 0.1), 'Release oscillation settles to the resting curve');
    point = await drag(['image', 'image-out'], ['mixer', 'image-in']);
    await release(point);
    check(count() === 2, 'Repeated connection does not duplicate an edge');
    await wait(650);
    point = await drag(['text', 'text-out'], ['mixer', 'image-in'], -15);
    check(!field(), 'Incompatible port has no magnetic field');
    await release(point);
    check(count() === 2, 'Incompatible release does not connect');
    check(!document.querySelector('.port-ripple, .port-absorption'), 'An incompatible drop has no release feedback');
    point = await drag(['mixer', 'number-in'], ['number', 'number-out'], 50);
    check(field(), 'Reverse drag attracts to the output');
    await release(point);
    check(count() === 3, 'Reverse drag commits a connection');
    check(document.querySelector('[data-nodeid="number"][data-handleid="number-out"] .port-ripple') && !document.querySelector('[data-nodeid="mixer"] .port-ripple'), 'Reverse connection ripples at the dropped output');
    point = await drag(['text', 'text-out'], ['mixer', 'text-in']);
    mouse(document, 'mousemove', 25, window.innerHeight / 2);
    await settle();
    check(!field(), 'Leaving the radius releases the field');
    await release({ x: 25, y: window.innerHeight / 2 });
    check(count() === 3, 'Blank release creates no edge');
    await wait(650);
    point = await drag(['text', 'text-out'], ['mixer', 'text-in']);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await release(point);
    check(count() === 3 && !document.querySelector('.magnetic-preview'), 'Escape cancels without committing');
    check(!document.querySelector('.port-ripple, .port-absorption'), 'Escape cancellation has no release feedback');
    point = await drag(['image', 'image-out'], ['preview', 'image-in']);
    await release(point);
    check(count() === 3 && !document.querySelector('.react-flow__edge[data-id="mixer-preview"]'), 'An occupied input replaces its previous edge');
    const range = document.querySelector<HTMLInputElement>('input[aria-label="回弹范围"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '30');
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    check(range.parentElement!.querySelector('output')!.textContent === '30%', 'Range control updates to 30%');
    for (const reverse of [false, true]) {
      point = reverse ? await drag(['mixer', 'text-in'], ['text', 'text-out'], 50) : await drag(['text', 'text-out'], ['mixer', 'text-in']);
      await release(point);
      const local = await sampleCable('xy-edge__texttext-out-mixertext-in');
      const rest = local.at(-1)!;
      const quiet = reverse ? 'fromTarget' : 'fromSource';
      const moving = reverse ? 'nearSource' : 'nearTarget';
      const displacement = (key: typeof quiet | typeof moving) => Math.max(...local.map(sample => Math.hypot(sample[key].x - rest[key].x, sample[key].y - rest[key].y)));
      check(displacement(quiet) < 0.1, `${reverse ? 'Reverse' : 'Forward'} local bounce leaves the distant 70% unchanged`);
      check(reduced ? displacement(moving) < 0.1 : displacement(moving) > 2, `${reverse ? 'Reverse' : 'Forward'} local bounce follows the dropped endpoint and motion preference`);
    }
    const strength = document.querySelector<HTMLInputElement>('input[aria-label="回弹力度"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(strength, '0');
    strength.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    point = await drag(['image', 'image-out'], ['preview', 'image-in']);
    await release(point);
    check(document.querySelector('[data-nodeid="preview"][data-handleid="image-in"] .port-ripple'), 'Zero cable bounce still confirms the connection with a ripple');
    await wait(650);
    await setSlider('涟漪羽化', 6);
    await setSlider('涟漪速度', 0.25);
    point = await drag(['image', 'image-out'], ['mixer', 'image-in']);
    await release(point);
    const slowSelector = '[data-nodeid="mixer"][data-handleid="image-in"] .port-ripple';
    check(getComputedStyle(document.querySelector(slowSelector)!).filter.includes('blur(6px)'), 'Feather slider softens the ripple edge');
    await wait(250);
    await setSlider('涟漪羽化', 0);
    await setSlider('涟漪速度', 2);
    point = await drag(['text', 'text-out'], ['mixer', 'text-in']);
    await release(point);
    const fastSelector = '[data-nodeid="mixer"][data-handleid="text-in"] .port-ripple';
    check(getComputedStyle(document.querySelector(fastSelector)!).filter === 'none', 'Zero feather keeps a crisp ring');
    await wait(480);
    const slow = document.querySelector(slowSelector);
    check(slow && !document.querySelector(fastSelector) && (reduced || Number(getComputedStyle(slow.querySelector('circle')!).opacity) > 0), 'Fast ripple retires independently while the earlier slow ripple continues');
    await wait(1600);
    check(!document.querySelector(slowSelector), 'Slow ripple completes and removes itself without being cut short');
    await setSlider('回弹力度', 100);
    await setSlider('回弹范围', 100);
    const responses: { peak: number; crossings: number }[] = [];
    for (const rigidity of [0, 100]) {
      await setSlider('线条刚性', rigidity);
      point = await drag(['image', 'image-out'], ['mixer', 'image-in']);
      await release(point);
      const cable = await sampleCable('xy-edge__imageimage-out-mixerimage-in');
      const rest = document.querySelector<SVGPathElement>('.react-flow__edge[data-id="xy-edge__imageimage-out-mixerimage-in"] .react-flow__edge-interaction')!;
      const middle = rest.getPointAtLength(rest.getTotalLength() / 2);
      const { start, end } = cable[0];
      const dx = end.x - start.x, dy = end.y - start.y;
      const offsets = cable.map(sample => ((sample.middle.x - middle.x) * -dy + (sample.middle.y - middle.y) * dx) / Math.hypot(dx, dy));
      const moving = offsets.filter(value => Math.abs(value) > 0.3);
      responses.push({
        peak: Math.max(...offsets.map(Math.abs)),
        crossings: moving.slice(1).filter((value, index) => Math.sign(value) !== Math.sign(moving[index])).length,
      });
    }
    const [soft, rigid] = responses;
    check(reduced ? soft.peak < 0.1 && rigid.peak < 0.1 : soft.peak > rigid.peak * 2, reduced ? 'Every rigidity setting respects reduced motion' : 'High rigidity resists bending under the same release impulse');
    check(reduced ? soft.crossings === 0 && rigid.crossings === 0 : soft.crossings > rigid.crossings && rigid.crossings === 0, 'High rigidity suppresses oscillation while low rigidity stays flexible');
    // A settled three-input fixture isolates the newly connected cable's impulse
    // from the subtle response of existing neighbors and the distant output.
    document.querySelector<HTMLButtonElement>('.settings-actions button')!.click();
    await wait(450);
    await setSlider('线条刚性', 50);
    point = await drag(['image', 'image-out'], ['mixer', 'image-in']);
    await release(point);
    point = await drag(['number', 'number-out'], ['mixer', 'number-in']);
    await release(point);
    await wait(1600);
    point = await drag(['text', 'text-out'], ['mixer', 'text-in']);
    await release(point);
    const [primary, nearImage, nearNumber, far] = await Promise.all([
      sampleCable('xy-edge__texttext-out-mixertext-in'), sampleCable('xy-edge__imageimage-out-mixerimage-in'),
      sampleCable('xy-edge__numbernumber-out-mixernumber-in'), sampleCable('mixer-preview'),
    ]);
    const peak = (cable: typeof primary, key: keyof typeof primary[number]) => Math.max(...cable.map(sample => Math.hypot(sample[key].x - cable.at(-1)![key].x, sample[key].y - cable.at(-1)![key].y)));
    const primaryPeak = Math.max(peak(primary, 'middle'), peak(primary, 'nearTarget'));
    check([nearImage, nearNumber].every(cable => reduced ? peak(cable, 'nearTarget') < 0.1 : peak(cable, 'nearTarget') > 2 && peak(cable, 'nearTarget') < primaryPeak * 0.25), reduced ? 'Reduced motion skips neighboring cable response' : 'Existing nearby cables visibly respond while staying lighter than the new cable');
    check([nearImage, nearNumber].every(cable => peak(cable, 'start') < 0.1 && peak(cable, 'end') < 0.1), 'Neighboring cable endpoints stay pinned');
    check([nearImage, nearNumber].every(cable => reduced ? peak(cable, 'nearSource') < 0.1 && peak(cable, 'middle') < 0.1 : peak(cable, 'nearSource') > 0.3 && peak(cable, 'middle') > 1 && peak(cable, 'nearSource') < peak(cable, 'nearTarget') * 0.75), 'Neighbor response reaches the full cable and weakens toward its far end');
    check(peak(far, 'middle') < 0.1 && peak(far, 'nearSource') < 0.1, 'Distant connected cables remain still');
    check([nearImage, nearNumber].every(cable => cable.slice(-6).every(sample => Math.hypot(sample.nearTarget.x - cable.at(-1)!.nearTarget.x, sample.nearTarget.y - cable.at(-1)!.nearTarget.y) < 0.1)), 'Neighbor response quickly settles');
    point = await drag(['text', 'text-out'], ['mixer', 'image-in'], -15);
    await release(point);
    check(peak(await sampleCable('xy-edge__imageimage-out-mixerimage-in'), 'nearTarget') < 0.1, 'Invalid drops do not disturb nearby cables');
    point = await drag(['text', 'text-out'], ['mixer', 'text-in']);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await release(point);
    check(peak(await sampleCable('xy-edge__imageimage-out-mixerimage-in'), 'nearTarget') < 0.1, 'Cancellation does not disturb nearby cables');
    await setSlider('回弹力度', 0);
    point = await drag(['text', 'text-out'], ['mixer', 'text-in']);
    await release(point);
    check(peak(await sampleCable('xy-edge__imageimage-out-mixerimage-in'), 'nearTarget') < 0.1, 'Zero bounce strength also disables the neighboring response');
    result.dataset.result = 'passed';
    result.textContent = `PASS · ${checks.length} checks\n${checks.join('\n')}`;
  } catch (error) {
    mouse(document, 'mouseup', 0, 0);
    result.dataset.result = 'failed';
    result.style.color = '#ff9c91';
    result.textContent = `FAIL · ${String(error)}\n${checks.join('\n')}`;
    console.error(error);
  }
}
