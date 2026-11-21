export type Point = { x: number; y: number };
type Bezier = readonly [Point, Point, Point, Point];

function controls(start: Point, end: Point, zoom: number): Bezier {
  const distance = (end.x - start.x) / zoom;
  // A nearly vertical gesture stays nearly vertical. Reverse gestures use
  // the same 0.25 curvature as the canvas, without a minimum-width S bend.
  const bend = zoom * (distance >= 0 ? distance / 2 : 6.25 * Math.sqrt(-distance));
  return [start, { x: start.x + bend, y: start.y }, { x: end.x - bend, y: end.y }, end];
}

function at(points: Bezier, t: number): Point {
  const u = 1 - t;
  const weights = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
  return {
    x: points.reduce((sum, point, index) => sum + point.x * weights[index], 0),
    y: points.reduce((sum, point, index) => sum + point.y * weights[index], 0),
  };
}

function tangent(points: Bezier, t: number): Point {
  const u = 1 - t;
  return {
    x: 3 * u * u * (points[1].x - points[0].x) + 6 * u * t * (points[2].x - points[1].x) + 3 * t * t * (points[3].x - points[2].x),
    y: 3 * u * u * (points[1].y - points[0].y) + 6 * u * t * (points[2].y - points[1].y) + 3 * t * t * (points[3].y - points[2].y),
  };
}

function segment(points: Bezier, from: number, to: number) {
  const a = at(points, from), b = at(points, to);
  const da = tangent(points, from), db = tangent(points, to);
  const span = (to - from) / 3;
  return `M${a.x},${a.y} C${a.x + da.x * span},${a.y + da.y * span} ${b.x - db.x * span},${b.y - db.y * span} ${b.x},${b.y}`;
}

export function wireCurve(start: Point, end: Point, zoom: number) {
  return segment(controls(start, end, zoom), 0, 1);
}

/** Running highlights use a radial light, rather than a percentage of the stroke.
 * Eight curve samples match the reference's length estimate in canvas units. */
export function wirePacket(start: Point, end: Point) {
  const points = controls(start, end, 1);
  let length = 0, previous = start;
  for (let index = 1; index <= 8; index++) {
    const next = at(points, index / 8);
    length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  const radius = Math.min(50, length / 3);
  const lead = radius * 1.4;
  return { points, length, radius, lead,
    durationMs: Math.min(2000, Math.max(500, (length + 2 * lead) / 600 * 1000)) };
}

export function wirePacketCenter(packet: ReturnType<typeof wirePacket>, phase: number): Point {
  const { points, length, lead } = packet;
  const distance = phase * (length + 2 * lead) - lead;
  const t = Math.max(0, Math.min(1, distance / Math.max(length, .0001)));
  const point = at(points, t);
  const overshoot = distance < 0 ? distance : Math.max(distance - length, 0);
  if (!overshoot) return point;
  let direction = tangent(points, t);
  if (Math.hypot(direction.x, direction.y) < .0001) {
    direction = { x: points[3].x - points[0].x, y: points[3].y - points[0].y };
  }
  const magnitude = Math.hypot(direction.x, direction.y);
  return magnitude < .0001 ? point : {
    x: point.x + direction.x / magnitude * overshoot,
    y: point.y + direction.y / magnitude * overshoot,
  };
}

/** Flora's moving dashes are spaced in Bézier parameter t: they stretch a
 * little in the fast middle of the curve. Uniform SVG dasharray loses that
 * shape. Sub-curves preserve its horizontal tangents and moving dash phase. */
export function movingWireDashes(start: Point, end: Point, zoom: number, elapsedMs: number) {
  const points = controls(start, end, zoom);
  let length = 0;
  let previous = start;
  for (let index = 1; index <= 12; index++) {
    const next = at(points, index / 12);
    length += Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  if (length < .01) return '';
  const period = 24 * zoom / length;
  // Measured from sequential reference frames: ~40 node units per second,
  // towards the loose endpoint; one 24-unit dash period takes 600ms.
  const phase = (elapsedMs % 600) / 600 * period;
  const paths: string[] = [];
  for (let from = phase - period; from < 1; from += period) {
    const to = Math.min(1, from + period / 3);
    if (to > 0) paths.push(segment(points, Math.max(0, from), to));
  }
  return paths.join(' ');
}
