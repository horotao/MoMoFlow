import type { Position, XYPosition } from '@xyflow/react';

const mix = (a: XYPosition, b: XYPosition, t: number): XYPosition => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
type Cubic = [XYPosition, XYPosition, XYPosition, XYPosition];
export type CableDisturbance = { center: number; normal: XYPosition };
type CurveSegment = { curve: Cubic; from: number; to: number };
export type CablePathOptions = { sourcePosition?: Position; targetPosition?: Position; curvature?: number };

function splitCubic([a, b, c, d]: Cubic, t: number): [Cubic, Cubic] {
  const ab = mix(a, b, t), bc = mix(b, c, t), cd = mix(c, d, t);
  const abc = mix(ab, bc, t), bcd = mix(bc, cd, t);
  const joint = mix(abc, bcd, t);
  return [[a, ab, abc, joint], [joint, bcd, cd, d]];
}

function parameterAtLength(curve: Cubic, fraction: number) {
  const lengths = [0];
  let previous = curve[0];
  // Measure the resting curve, so a percentage refers to cable length, not x distance.
  for (let index = 1; index <= 64; index++) {
    const point = splitCubic(curve, index / 64)[0][3];
    lengths.push(lengths[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    previous = point;
  }
  const desired = lengths[64] * fraction;
  const index = Math.max(1, lengths.findIndex(length => length >= desired));
  const weight = (desired - lengths[index - 1]) / (lengths[index] - lengths[index - 1] || 1);
  return (index - 1 + weight) / 64;
}

const cubicCommand = ([, b, c, d]: Cubic) => `C ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;

function restingCable(source: XYPosition, target: XYPosition, options: CablePathOptions = {}): Cubic {
  const offset = (distance: number) => distance >= 0 ? distance / 2 : (options.curvature ?? 0.42) * 25 * Math.sqrt(-distance);
  const control = (point: XYPosition, other: XYPosition, position: `${Position}`): XYPosition => {
    switch (position) {
      case 'left': return { x: point.x - offset(point.x - other.x), y: point.y };
      case 'right': return { x: point.x + offset(other.x - point.x), y: point.y };
      case 'top': return { x: point.x, y: point.y - offset(point.y - other.y) };
      case 'bottom': return { x: point.x, y: point.y + offset(other.y - point.y) };
    }
  };
  return [source, control(source, target, options.sourcePosition ?? 'right'), control(target, source, options.targetPosition ?? 'left'), target];
}

// Distance is measured to the whole cable, including crossings and its middle.
// Use current flow coordinates and screen pixels so zoom does not widen the shock.
export function nearbyCable(source: XYPosition, target: XYPosition, impact: XYPosition, zoom: number, options?: CablePathOptions) {
  const curve = restingCable(source, target, options);
  const lengths = [0];
  let previous = source, nearest = source, nearestIndex = 0;
  let distance = Math.hypot(source.x - impact.x, source.y - impact.y);
  for (let index = 1; index <= 64; index++) {
    const point = splitCubic(curve, index / 64)[0][3];
    lengths.push(lengths[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    const nextDistance = Math.hypot(point.x - impact.x, point.y - impact.y);
    if (nextDistance < distance) { distance = nextDistance; nearest = point; nearestIndex = index; }
    previous = point;
  }
  const screenDistance = distance * zoom;
  if (screenDistance >= 180 || lengths[64] < 1) return null;
  const fraction = lengths[nearestIndex] / lengths[64];
  const center = Math.max(0.18, Math.min(0.82, fraction));
  const t = nearestIndex / 64;
  const tangent = {
    x: (1 - t) ** 2 * (curve[1].x - curve[0].x) + 2 * (1 - t) * t * (curve[2].x - curve[1].x) + t ** 2 * (curve[3].x - curve[2].x),
    y: (1 - t) ** 2 * (curve[1].y - curve[0].y) + 2 * (1 - t) * t * (curve[2].y - curve[1].y) + t ** 2 * (curve[3].y - curve[2].y),
  };
  if (Math.hypot(tangent.x, tangent.y) < 0.001) { tangent.x = target.x - source.x; tangent.y = target.y - source.y; }
  const length = Math.hypot(tangent.x, tangent.y) || 1;
  const normal = { x: -tangent.y / length, y: tangent.x / length };
  return {
    shape: { center: parameterAtLength(curve, center), normal },
    distance: screenDistance,
    weight: (1 - screenDistance / 180) ** 1.4,
    direction: Math.sign((nearest.x - impact.x) * normal.x + (nearest.y - impact.y) * normal.y) || 1,
  };
}

function disturbSegments(segments: CurveSegment[], { shape, bend }: { shape: CableDisturbance; bend: number }) {
  // The entire cable participates, tapering away from the impact to both pinned
  // endpoints. End tangents may flex; the two halves meet with a smooth tangent.
  const offset = (t: number) => {
    const rising = t <= shape.center;
    const width = rising ? shape.center : 1 - shape.center;
    const u = rising ? t / width : (1 - t) / width;
    return { value: bend * u * (2 - u), slope: bend * 2 * (1 - u) / width * (rising ? 1 : -1) };
  };
  return segments.flatMap(segment => {
    const cuts = [shape.center].filter(t => t > segment.from && t < segment.to);
    let remainder = segment.curve, from = segment.from;
    return [...cuts, segment.to].map(to => {
      const [curve, rest] = splitCubic(remainder, (to - from) / (segment.to - from));
      const a = offset(from), b = offset(to), step = (to - from) / 3;
      const offsets = [a.value, a.value + a.slope * step, b.value - b.slope * step, b.value];
      const displaced = curve.map((point, index) => ({ x: point.x + shape.normal.x * offsets[index], y: point.y + shape.normal.y * offsets[index] })) as Cubic;
      remainder = rest;
      const result = { curve: displaced, from, to };
      from = to;
      return result;
    });
  });
}

// Direct release respects its selected range; neighboring impacts affect the full cable.
export function bouncingCable(source: XYPosition, target: XYPosition, bend: number, reverse = false, range = 100, disturbance?: { shape: CableDisturbance; bend: number }, options?: CablePathOptions) {
  const dx = target.x - source.x, dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const rest = restingCable(source, target, options);
  let segments: CurveSegment[] = [{ curve: rest, from: 0, to: 1 }];
  if (bend !== 0 && range < 100) {
    const fraction = Math.max(0.1, range / 100);
    const split = parameterAtLength(rest, reverse ? fraction : 1 - fraction);
    const [left, right] = splitCubic(rest, split);
    const active = reverse ? left : right;
    const localDx = active[3].x - active[0].x, localDy = active[3].y - active[0].y;
    const localLength = Math.hypot(localDx, localDy) || 1;
    // The control point at the join stays untouched, preserving a smooth tangent
    // and the exact resting geometry everywhere outside the affected segment.
    const index = reverse ? 1 : 2;
    active[index] = { x: active[index].x - localDy / localLength * bend * 1.7, y: active[index].y + localDx / localLength * bend * 1.7 };
    segments = [{ curve: left, from: 0, to: split }, { curve: right, from: split, to: 1 }];
  } else if (bend !== 0) {
    const nearSource = bend * (reverse ? 1.35 : 0.65);
    const nearTarget = bend * (reverse ? 0.65 : 1.35);
    rest[1] = { x: rest[1].x + normal.x * nearSource, y: rest[1].y + normal.y * nearSource };
    rest[2] = { x: rest[2].x + normal.x * nearTarget, y: rest[2].y + normal.y * nearTarget };
  }
  if (disturbance && disturbance.bend !== 0) segments = disturbSegments(segments, disturbance);
  return `M ${source.x},${source.y} ${segments.map(segment => cubicCommand(segment.curve)).join(' ')}`;
}

// Connect two circular lobes with tangent-matched bridges. The attachment angles
// follow their overlap, so the small lobe melts into the larger one continuously.
export function magneticOutline(anchor: XYPosition, tip: XYPosition, radius: number, tipRadius = 8) {
  const distance = Math.hypot(tip.x - anchor.x, tip.y - anchor.y);
  if (distance <= radius - tipRadius) {
    return `M ${anchor.x - radius},${anchor.y} a ${radius},${radius} 0 1,0 ${radius * 2},0 a ${radius},${radius} 0 1,0 ${-radius * 2},0 Z`;
  }
  const acos = (value: number) => Math.acos(Math.max(-1, Math.min(1, value)));
  const overlaps = distance < radius + tipRadius;
  const overlapLarge = overlaps ? acos((radius ** 2 + distance ** 2 - tipRadius ** 2) / (2 * radius * distance)) : 0;
  const overlapSmall = overlaps ? acos((tipRadius ** 2 + distance ** 2 - radius ** 2) / (2 * tipRadius * distance)) : 0;
  const tangentAngle = acos((radius - tipRadius) / distance);
  const largeAngle = (overlapLarge + tangentAngle) / 2;
  const smallAngle = (Math.PI - overlapSmall + tangentAngle) / 2;
  const axis = Math.atan2(tip.y - anchor.y, tip.x - anchor.x);
  const polar = (center: XYPosition, r: number, angle: number): XYPosition => ({ x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) });
  const a = polar(anchor, radius, axis + largeAngle), b = polar(tip, tipRadius, axis + smallAngle);
  const c = polar(tip, tipRadius, axis - smallAngle), d = polar(anchor, radius, axis - largeAngle);
  const handleScale = Math.min(1.2, Math.hypot(a.x - b.x, a.y - b.y) / (radius + tipRadius)) * Math.min(1, distance * 2 / (radius + tipRadius));
  const largeHandle = radius * handleScale, smallHandle = tipRadius * handleScale;
  const halfPi = Math.PI / 2;
  const ab = polar(a, largeHandle, axis + largeAngle - halfPi);
  const ba = polar(b, smallHandle, axis + smallAngle + halfPi);
  const cd = polar(c, smallHandle, axis - smallAngle - halfPi);
  const dc = polar(d, largeHandle, axis - largeAngle + halfPi);
  const point = ({ x, y }: XYPosition) => `${x},${y}`;
  return `M ${point(a)} C ${point(ab)} ${point(ba)} ${point(b)} A ${tipRadius},${tipRadius} 0 ${smallAngle > halfPi ? 1 : 0},0 ${point(c)} C ${point(cd)} ${point(dc)} ${point(d)} A ${radius},${radius} 0 1,0 ${point(a)} Z`;
}
