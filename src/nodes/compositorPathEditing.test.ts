import test from 'node:test';
import assert from 'node:assert/strict';
import { editPathPoint, localDragDelta, nearestSegmentParameter, splitPathSegment, togglePathCorner, type PathPatch, type PathSource } from './compositor/pathEditing.ts';
import { isGraphicSource, type Point } from './compositorGraphics.ts';
import type { LayerTransform } from './compositor';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const transform = { x: 100, y: 200, width: 400, height: 300, rotation: 37 };
const source: PathSource = { kind: 'path', fill: null, closed: false, points: [{ x: .1, y: .2 }, { x: .5, y: .5, in: { x: .3, y: .4 }, out: { x: .7, y: .6 } }, { x: .9, y: .8 }] };
const world = (p: Point, t: LayerTransform) => { const x = (p.x - .5) * t.width, y = (p.y - .5) * t.height, a = t.rotation * Math.PI / 180; return { x: t.x + t.width / 2 + x * Math.cos(a) - y * Math.sin(a), y: t.y + t.height / 2 + x * Math.sin(a) + y * Math.cos(a) }; };
const samePoint = (a: Point, b: Point) => { near(a.x, b.x); near(a.y, b.y); };

test('Path anchors can leave rotated bounds while other world-space anchors stay fixed', () => {
  const patch = editPathPoint(source, transform, 1, { x: -700, y: 450 })!;
  assert.ok(isGraphicSource(patch.source));
  for (const i of [0, 2]) samePoint(world(source.points[i], transform), world(patch.source.points[i], patch.transform));
  const before = world(source.points[1], transform), after = world(patch.source.points[1], patch.transform), a = transform.rotation * Math.PI / 180;
  near(after.x - before.x, -700 * Math.cos(a) - 450 * Math.sin(a));
  near(after.y - before.y, -700 * Math.sin(a) + 450 * Math.cos(a));
  assert.equal(editPathPoint(source, transform, 1, { x: 20000, y: 0 }), undefined);
});

test('Screen-space drags remain exact at 25, 50, 100 and 200 percent zoom', () => {
  for (const zoom of [.25, .5, 1, 2]) {
    const patch = editPathPoint(source, transform, 1, localDragDelta(35, -20, zoom, transform.rotation))!;
    const a = world(source.points[1], transform), b = world(patch.source.points[1], patch.transform);
    near((b.x - a.x) * zoom, 35); near((b.y - a.y) * zoom, -20);
  }
});

test('Smooth handles rotate together, Alt breaks linkage, Shift constrains and corner conversion is reversible', () => {
  const t = { ...transform, rotation: 0 };
  const before = world(source.points[1].in!, t);
  const linked = editPathPoint(source, t, 1, { x: 20, y: -40 }, 'out')!;
  const anchor = world(linked.source.points[1], linked.transform), opposite = world(linked.source.points[1].in!, linked.transform);
  near(Math.hypot(opposite.x - anchor.x, opposite.y - anchor.y), Math.hypot(80, 30));
  const broken = editPathPoint(source, t, 1, { x: 20, y: -40 }, 'out', false, true)!;
  samePoint(world(broken.source.points[1].in!, broken.transform), before);
  const constrained = editPathPoint(source, t, 1, { x: 20, y: 40 }, undefined, true)!;
  near(world(constrained.source.points[1], constrained.transform).x, world(source.points[1], t).x);
  const corner = togglePathCorner(source, t, 1)!;
  assert.equal(corner.source.points[1].in, undefined);
  const smooth = togglePathCorner(corner.source, corner.transform, 1)!;
  assert.ok(smooth.source.points[1].in && smooth.source.points[1].out);
  const alt = editPathPoint(corner.source, corner.transform, 1, { x: 50, y: 30 }, undefined, false, true)!;
  samePoint(world(alt.source.points[1], alt.transform), world(corner.source.points[1], corner.transform));
});

const bezier = (a: Point, c: Point, d: Point, b: Point, t: number) => ({ x: (1-t)**3*a.x+3*(1-t)**2*t*c.x+3*(1-t)*t*t*d.x+t**3*b.x, y: (1-t)**3*a.y+3*(1-t)**2*t*c.y+3*(1-t)*t*t*d.y+t**3*b.y });
test('Adding an anchor at the clicked curve position preserves the entire Bézier curve', () => {
  const a = source.points[1], b = source.points[2], ratio = .32;
  const target = bezier(a, a.out!, b, b, ratio);
  const found = nearestSegmentParameter(a, b, target, 1200, 300);
  assert.ok(Math.abs(found-ratio) < .00001);
  const split = splitPathSegment(source, 1, ratio), m = split.points[2];
  for (let i=0; i<=100; i++) {
    const t=i/100, expected=bezier(a,a.out!,b,b,t);
    const actual=t<=ratio ? bezier(split.points[1],split.points[1].out!,m.in!,m,t/ratio) : bezier(m,m.out!,split.points[3].in!,split.points[3],(t-ratio)/(1-ratio));
    samePoint(actual,expected);
  }
  const closed = splitPathSegment({ ...source, closed: true }, 2);
  assert.equal(closed.points.length, 4); assert.equal(closed.closed, true);
});

test('Repeated anchor edits keep all document geometry valid without accumulating position drift', () => {
  let patch: PathPatch = { source, transform };
  for (let i=0;i<100;i++) patch = editPathPoint(patch.source, patch.transform, 1, { x: i%2 ? -50 : 50, y: i%2 ? 40 : -40 })!;
  source.points.forEach((p,i) => samePoint(world(p,transform),world(patch.source.points[i],patch.transform)));
  assert.ok(isGraphicSource(patch.source));
});
