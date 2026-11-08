import { useEffect, useRef } from 'react';
import { EdgeText, getBezierPath, type EdgeProps } from '@xyflow/react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { bouncingCable, nearbyCable, type CableDisturbance } from './magneticGeometry';
import { cableSpring } from './magneticDynamics';
import type { CableImpact, CableRelease } from './magneticTypes';

type Props = EdgeProps & {
  release?: CableRelease; impact?: CableImpact; enabled?: boolean; curvature?: number; selectedStroke?: string;
  entrance?: { direction: 'source' | 'target'; scale: MotionValue<number>; radius: number };
};

export function MagneticCable({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, selected,
  markerStart, markerEnd, interactionWidth = 18, release, impact, enabled = true, curvature = 0.42, selectedStroke,
  label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, entrance,
}: Props) {
  const reduced = Boolean(useReducedMotion());
  const bend = useMotionValue(0);
  const neighborBend = useMotionValue(0);
  const restScale = useMotionValue(1);
  const disturbance = useRef<CableDisturbance>();
  const played = useRef<string>();
  const playedImpact = useRef<string>();
  useEffect(() => {
    if (!release || played.current === release.id) return;
    played.current = release.id;
    if (!enabled || reduced) return;
    let frameStarted = false;
    const animation = animate(bend, 0, {
      type: 'spring', ...cableSpring(release.speed, release.rigidity, 'release'),
      velocity: release.velocity, restSpeed: 0.5, restDelta: 0.02,
      onUpdate: () => { frameStarted = true; },
    });
    return () => {
      animation.stop(); bend.jump(0);
      // StrictMode repeats mount effects before their first animation frame.
      if (!frameStarted && played.current === release.id) played.current = undefined;
    };
  }, [release, bend, enabled, reduced]);
  useEffect(() => {
    if (!impact || playedImpact.current === impact.id) return;
    playedImpact.current = impact.id;
    if (!enabled || reduced) return;
    const response = nearbyCable({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, impact.point, impact.zoom, { sourcePosition, targetPosition, curvature });
    if (!response) return;
    disturbance.current = response.shape;
    const spring = cableSpring(impact.speed, impact.rigidity, 'release');
    let frameStarted = false;
    const animation = animate(neighborBend, 0, {
      type: 'spring', ...spring,
      damping: Math.max(spring.damping, 2 * Math.sqrt(spring.stiffness * spring.mass) * 0.6),
      velocity: Math.min(Math.abs(impact.velocity) * 0.25, 350 / impact.zoom) * response.weight * response.direction,
      delay: 0.025 + response.distance / 1400, restSpeed: 0.1, restDelta: 0.005,
      onUpdate: () => { frameStarted = true; },
    });
    return () => {
      animation.stop(); neighborBend.jump(0);
      if (!frameStarted && playedImpact.current === impact.id) playedImpact.current = undefined;
    };
  }, [impact, enabled, reduced, neighborBend, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature]);
  const source = { x: sourceX, y: sourceY }, target = { x: targetX, y: targetY };
  const options = { sourcePosition, targetPosition, curvature };
  const path = useTransform([bend, neighborBend, entrance?.scale ?? restScale], () => {
    const delta = entrance && !reduced ? (entrance.scale.get() - 1) * entrance.radius : 0;
    return bouncingCable(
      { x: source.x + (entrance?.direction === 'source' ? delta : 0), y: source.y },
      { x: target.x - (entrance?.direction === 'target' ? delta : 0), y: target.y },
      bend.get(), release?.reverse, release?.range,
      disturbance.current ? { shape: disturbance.current, bend: neighborBend.get() } : undefined, options,
    );
  });
  const [, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, ...options });
  return <>
    <path className="react-flow__edge-interaction" d={bouncingCable(source, target, 0, false, 100, undefined, options)} fill="none" stroke="transparent" strokeWidth={interactionWidth} />
    <motion.path className="react-flow__edge-path magnetic-cable magnetic-wire" d={path} fill="none" markerStart={markerStart} markerEnd={markerEnd}
      style={{ ...style, ...(selected && selectedStroke ? { stroke: selectedStroke } : {}) }} vectorEffect="non-scaling-stroke" />
    {label != null && <EdgeText x={labelX} y={labelY} label={label} labelStyle={labelStyle} labelShowBg={labelShowBg}
      labelBgStyle={labelBgStyle} labelBgPadding={labelBgPadding} labelBgBorderRadius={labelBgBorderRadius} />}
  </>;
}
