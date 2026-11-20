import type { Node, Rect, XYPosition } from '@xyflow/react';

const clearance = 48;
type Direction = 'up' | 'right' | 'down' | 'left';
type Occupied = { id: string; rect: Rect; fixed: boolean };
type Insertion = { id: string; rect: Rect; direction: 'up' | 'right' };
export type NodePush = {
  id: string; depth: number; axis: 'x' | 'y'; sign: 1 | -1;
  behind: { id: string; separation: number }[];
};

function lane(rect: Rect, direction: Direction) {
  const vertical = direction === 'up' || direction === 'down';
  const reverse = direction === 'up' || direction === 'left';
  const origin = vertical ? rect.y : rect.x;
  const size = vertical ? rect.height : rect.width;
  const cross = vertical ? rect.x : rect.y;
  return { start: reverse ? -origin - size : origin, end: reverse ? -origin : origin + size,
    cross, crossEnd: cross + (vertical ? rect.width : rect.height) };
}

function shift(rect: Rect, direction: Direction, distance: number): Rect {
  const { x, y } = rect;
  if (direction === 'right') return { ...rect, x: x + distance };
  if (direction === 'left') return { ...rect, x: x - distance };
  return { ...rect, y: y + (direction === 'up' ? -distance : distance) };
}

type Lane = ReturnType<typeof lane>;
const sameLane = (a: Lane, b: Lane) => a.cross < b.crossEnd + clearance && a.crossEnd + clearance > b.cross;
const overlaps = (a: Lane, b: Lane) => sameLane(a, b) && a.start < b.end + clearance && a.end + clearance > b.start;

function clearSpace(rect: Rect, occupied: Occupied[], direction: Direction) {
  const obstacles = occupied.map(item => lane(item.rect, direction));
  let area = lane(rect, direction);
  let blockers = obstacles.filter(item => overlaps(item, area));
  while (blockers.length) {
    rect = shift(rect, direction, Math.ceil(Math.max(...blockers.map(item => item.end + clearance)) - area.start));
    area = lane(rect, direction);
    blockers = obstacles.filter(item => overlaps(item, area));
  }
  return rect;
}

function pushAlong(occupied: Occupied[], rect: Rect, direction: Direction) {
  const axis = direction === 'up' || direction === 'down' ? 'y' : 'x';
  const sign = direction === 'up' || direction === 'left' ? -1 : 1;
  const lanes = occupied.map(item => ({ ...item, area: lane(item.rect, direction) }));
  const fixed = lanes.filter(item => item.fixed);
  const movable = lanes.filter(item => !item.fixed).sort((a, b) => a.area.start - b.area.start || a.id.localeCompare(b.id));
  const swept: { area: Lane; depth: number; id?: string; size: number }[] = [{ area: lane(rect, direction), depth: -1, size: 0 }];
  const moved = new Map<string, { rect: Rect; push: NodePush }>();
  for (const item of movable) {
    const area = item.area;
    const blockers = swept.filter(other => overlaps(area, other.area));
    if (!blockers.length) continue;
    const lead = blockers.reduce((furthest, other) => other.area.end > furthest.area.end ? other : furthest);
    const distance = lead.area.end + clearance - area.start;
    const next = shift(item.rect, direction, distance);
    const finalArea = lane(next, direction);
    const travel = { ...area, end: finalArea.end };
    // An existing overlap behind a moving node can clear as it moves away.
    // A fixed obstruction ahead must also stay clear of the swept path.
    if (fixed.some(other => overlaps(other.area, finalArea)
      || (other.area.start >= area.start && overlaps(other.area, travel)))) return;
    const depth = lead.depth + 1;
    const size = area.end - area.start;
    const behind = blockers.flatMap(other => other.id
      ? [{ id: other.id, separation: sign === 1 ? other.size : size }]
      : []);
    moved.set(item.id, { rect: next, push: { id: item.id, depth, axis, sign, behind } });
    swept.push({ area: travel, depth, id: item.id, size });
  }
  return moved;
}

/** Make room for each addition, keeping fixed nodes and previously placed additions in place. */
export function makeRoomForNodes(nodes: Node[], additions: Insertion[], pinned: ReadonlySet<string>) {
  const parents = new Set(nodes.flatMap(node => node.parentId ? [node.parentId] : []));
  const occupied = new Map(nodes.flatMap((node): [string, Occupied][] => {
    // React Flow group children use parent-relative coordinates. Their parent
    // participates as a single fixed obstacle.
    if (node.hidden || node.parentId) return [];
    const width = node.measured?.width ?? node.width;
    const height = node.measured?.height ?? node.height;
    if (!width || !height) return [];
    return [[node.id, { id: node.id, rect: { ...node.position, width, height },
      fixed: Boolean(node.data.locked || node.dragging || pinned.has(node.id) || parents.has(node.id)) }]];
  }));
  const positions = new Map<string, XYPosition>();
  const pushes: NodePush[] = [];
  for (const item of additions) {
    const obstacles = [...occupied.values()];
    const { direction } = item;
    const rect = clearSpace(item.rect, obstacles.filter(other => other.fixed), direction);
    const alternatives: Direction[] = direction === 'up' ? ['up', 'right', 'left', 'down'] : ['right', 'down', 'up', 'left'];
    let moves: ReturnType<typeof pushAlong>;
    for (const alternative of alternatives) {
      moves = pushAlong(obstacles, rect, alternative);
      if (moves) break;
    }
    const placement = moves ? rect : clearSpace(rect, obstacles, direction);
    for (const [id, { rect: next, push }] of moves ?? []) {
      occupied.get(id)!.rect = next;
      positions.set(id, { x: next.x, y: next.y });
      pushes.push(push);
    }
    occupied.set(item.id, { id: item.id, rect: placement, fixed: true });
    positions.set(item.id, { x: placement.x, y: placement.y });
  }
  return { positions, pushes };
}
