import type { XYPosition } from '@xyflow/react';
import { springValue } from 'motion';
import { cableSpring } from './magneticDynamics';
import type { CableDeflection } from './magneticGeometry';

export const nodeWireStrength = 0.45;
export const restingWireLag: XYPosition = { x: 0, y: 0 };

const spring = { ...cableSpring(360, 68, 'release'), restSpeed: 1, restDelta: 0.1 };

export function createWireFollower(position: XYPosition) {
  return { x: springValue(position.x, spring), y: springValue(position.y, spring) };
}

export function aimWireFollower(follower: ReturnType<typeof createWireFollower>, position: XYPosition, drag: boolean) {
  follower.x.set(position.x);
  follower.y.set(position.y);
  if (!drag) {
    // Replace a target that may still be queued this frame, then snap to it.
    follower.x.jump(position.x);
    follower.y.jump(position.y);
  }
}

const atRest = { widthScale: 1 } as const;

export function nodeWireResponse(source: XYPosition, target: XYPosition, sourceLag: XYPosition, targetLag: XYPosition,
  strength = nodeWireStrength, zoom = 1): { widthScale: number; deflection?: CableDeflection } {
  if (!strength || (!sourceLag.x && !sourceLag.y && !targetLag.x && !targetLag.y)) return atRest;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  if (distance * zoom <= 1) return atRest;

  // Only the inside of the wire follows the springs. Keep both ends pinned.
  const x = sourceLag.x + targetLag.x;
  const y = sourceLag.y + targetLag.y;
  const length = Math.hypot(x, y);
  const limit = Math.min(90 / zoom, distance * 0.36);
  const deflection = length * zoom > 0.1 ? {
    shape: { center: 0.5, normal: { x: x / length, y: y / length } },
    bend: strength * limit * length / (limit + length),
  } : undefined;

  // Lengthwise pulls tighten the stroke, even on a perfectly straight wire.
  const tension = ((sourceLag.x - targetLag.x) * dx + (sourceLag.y - targetLag.y) * dy) / distance;
  const widthScale = 1 - strength * 0.275 * Math.max(0, Math.min(1, tension * zoom / 100));
  return { deflection, widthScale };
}
