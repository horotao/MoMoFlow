import type { XYPosition } from '@xyflow/react';
import type { MotionValue } from 'motion/react';

export const magneticDefaults = {
  radius: 86, speed: 380, rigidity: 50, lineWidth: 2,
  bounceStrength: 100, bounceRange: 100, rippleFeather: 1, rippleSpeed: 1,
  field: true, enabled: true,
};
export type MagneticSettings = typeof magneticDefaults;
export type CableRelease = { id: string; velocity: number; reverse: boolean; speed: number; rigidity: number; range: number };
export type CableImpact = { id: string; point: XYPosition; zoom: number; velocity: number; speed: number; rigidity: number };
// Positions and sizes are normalized to the 100% effect size, shared by the
// preview and release overlay so the tip stays continuous through zoom changes.
export type AbsorptionSnapshot = { x: number; y: number; radius: number; tipRadius?: number };
export type ConnectionVisualSnapshot = AbsorptionSnapshot & { color: string };
export type PortFeedbackEvent = {
  id: string; nodeId: string; handleId: string | null; direction: 'source' | 'target'; edgeId: string;
  color: string; feather: number; duration: number; delay: number; expiresAt: number;
  absorption?: AbsorptionSnapshot & { field: boolean };
};
export type NodeEntranceEvent = {
  id: string; nodeId: string; edgeId: string | null; direction: 'source' | 'target'; handleId: string | null;
  color: string; scale: MotionValue<number>; opacity: MotionValue<number>; origin: MotionValue<string>;
  played: boolean; finished: boolean; expiresAt: number;
};
