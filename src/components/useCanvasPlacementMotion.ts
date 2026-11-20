import { useCallback, useEffect, useRef, useState } from 'react';
import { cubicBezier } from 'motion';
import type { Node, XYPosition } from '@xyflow/react';
import type { NodePush } from './canvasInsertion';

type Move = { from: XYPosition; to: XYPosition; delay: number };
type Contact = { follower: string; leader: string; axis: 'x' | 'y'; sign: 1 | -1; separation: number };
type Placement = { moves: Map<string, Move>; contacts: Contact[]; elapsed: number };
const samePosition = (a: XYPosition, b: XYPosition) => a.x === b.x && a.y === b.y;
const reducedMotion = '(prefers-reduced-motion: reduce)';
const duration = .38;
const pushDelays = [0, .06, .105, .14, .166];
const ease = cubicBezier(.25, .68, .4, 1);

export function useCanvasPlacementMotion() {
  const [placement, setPlacement] = useState<Placement>();
  const frame = useRef<number>();
  const stop = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    setPlacement(undefined);
  }, []);
  useEffect(() => {
    const media = window.matchMedia(reducedMotion);
    const update = () => { if (media.matches) stop(); };
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [stop]);

  const play = useCallback((visible: Node[], positions: ReadonlyMap<string, XYPosition>, pushes: NodePush[]) => {
    const delays = new Map<string, number>();
    for (const { id, depth } of pushes) {
      const delay = pushDelays[Math.min(depth, pushDelays.length - 1)];
      delays.set(id, Math.min(delay, delays.get(id) ?? delay));
    }
    const moves = new Map<string, Move>();
    for (const node of visible) {
      const to = positions.get(node.id);
      if (to && !samePosition(node.position, to)) moves.set(node.id, { from: node.position, to, delay: delays.get(node.id) ?? 0 });
    }
    if (!moves.size || window.matchMedia(reducedMotion).matches) return;
    const contacts: Contact[] = [];
    for (const { id, axis, sign, behind } of pushes) {
      const follower = moves.get(id);
      if (!follower || sign * (follower.to[axis] - follower.from[axis]) <= 0) continue;
      for (const { id: leaderId, separation } of behind) {
        const leader = moves.get(leaderId);
        if (!leader || sign * (leader.to[axis] - leader.from[axis]) <= 0) continue;
        contacts.push({ follower: id, leader: leaderId, axis, sign,
          separation: Math.min(separation, sign * (follower.from[axis] - leader.from[axis])) });
      }
    }
    const total = duration + Math.max(...[...moves.values()].map(move => move.delay));
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    setPlacement({ moves, contacts, elapsed: 0 });
    // Start on the first animation frame so mounting the two new cards
    // cannot consume the lead node's head start.
    let start: number | undefined;
    const nextFrame = (now: number) => {
      start ??= now;
      const elapsed = (now - start) / 1000;
      if (elapsed >= total) {
        stop();
        return;
      }
      if (elapsed > 0) setPlacement({ moves, contacts, elapsed });
      frame.current = requestAnimationFrame(nextFrame);
    };
    frame.current = requestAnimationFrame(nextFrame);
  }, [stop]);

  const project = useCallback(<T extends Node>(nodes: T[]) => {
    if (!placement) return nodes;
    const { moves, contacts, elapsed } = placement;
    const displayed = new Map<string, XYPosition>();
    for (const node of nodes) {
      const move = moves.get(node.id);
      if (!move || node.dragging || !samePosition(node.position, move.to)) continue;
      const progress = ease(Math.max(0, Math.min(1, (elapsed - move.delay) / duration)));
      displayed.set(node.id, { x: move.from.x + (move.to.x - move.from.x) * progress,
        y: move.from.y + (move.to.y - move.from.y) * progress });
    }
    // Let a follower move sooner if the card behind it reaches it during the delay.
    for (const { follower, leader, axis, sign, separation } of contacts) {
      const behind = displayed.get(leader), ahead = displayed.get(follower);
      if (!behind || !ahead) continue;
      const minimum = Math.min(sign * moves.get(follower)!.to[axis], sign * behind[axis] + separation);
      if (sign * ahead[axis] < minimum) ahead[axis] = sign * minimum;
    }
    return nodes.map(node => {
      const position = displayed.get(node.id);
      return position && !samePosition(position, node.position) ? { ...node, position } : node;
    });
  }, [placement]);
  return { project, play, stop };
}
