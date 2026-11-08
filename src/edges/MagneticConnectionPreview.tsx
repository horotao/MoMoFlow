import { useEffect, useRef, type MutableRefObject } from 'react';
import { getBezierPath, useViewport, type ConnectionLineComponentProps } from '@xyflow/react';
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { magneticOutline } from './magneticGeometry';
import { cableSpring } from './magneticDynamics';
import { magneticSizeScale, magneticTipRadius } from './magneticSizing';
import type { ConnectionVisualSnapshot, MagneticSettings } from './magneticTypes';

type Props = ConnectionLineComponentProps & {
  settings: Pick<MagneticSettings, 'radius' | 'speed' | 'rigidity' | 'field' | 'enabled'>;
  visual: MutableRefObject<(() => ConnectionVisualSnapshot) | null>;
  color: string; className?: string; curvature?: number;
};

export function MagneticConnectionPreview({ fromX, fromY, toX, toY, fromPosition, toPosition, pointer, connectionStatus,
  settings, visual, color, className = '', curvature = 0.42,
}: Props) {
  const viewport = useViewport();
  const sizeScale = magneticSizeScale(viewport.zoom);
  const reduced = useReducedMotion();
  const group = useRef<SVGGElement>(null);
  const snapped = connectionStatus === 'valid';
  const cursor = { x: (pointer.x - viewport.x) / viewport.zoom, y: (pointer.y - viewport.y) / viewport.zoom };
  const distance = Math.hypot(cursor.x - toX, cursor.y - toY);
  const proximity = snapped ? Math.max(0, 1 - distance / (settings.radius * sizeScale)) : 0;
  const pull = snapped && settings.enabled ? 0.18 + proximity * 0.55 : snapped ? 1 : 0;
  const targetX = cursor.x + (toX - cursor.x) * pull;
  const targetY = cursor.y + (toY - cursor.y) * pull;
  const spring = cableSpring(settings.speed, settings.rigidity, 'drag');
  const x = useSpring(targetX, spring), y = useSpring(targetY, spring);
  useEffect(() => {
    if (reduced || !settings.enabled) { x.jump(targetX); y.jump(targetY); }
    else { x.set(targetX); y.set(targetY); }
  }, [targetX, targetY, x, y, reduced, settings.enabled]);
  const path = useTransform([x, y], () => getBezierPath({ sourceX: fromX, sourceY: fromY, sourcePosition: fromPosition,
    targetX: x.get(), targetY: y.get(), targetPosition: toPosition, curvature })[0]);
  const radius = (32 + proximity * 12) * sizeScale;
  const outline = useTransform([x, y], () => magneticOutline({ x: toX, y: toY }, { x: x.get(), y: y.get() }, radius, 12 * sizeScale));
  useEffect(() => {
    visual.current = () => ({ x: (x.get() - toX) / sizeScale, y: (y.get() - toY) / sizeScale, radius: radius / sizeScale,
      color: group.current ? getComputedStyle(group.current).color : color });
    return () => { visual.current = null; };
  }, [visual, x, y, toX, toY, radius, sizeScale, color]);
  return <g ref={group} className={`magnetic-preview ${className}`} data-snapped={snapped} style={{ color }}>
    {snapped && settings.enabled && settings.field && <motion.path className="magnetic-field" d={outline} fill="currentColor" fillOpacity={0.11} stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
    <motion.path className="react-flow__connection-path magnetic-wire" d={path} fill="none" style={{ stroke: 'currentColor' }} vectorEffect="non-scaling-stroke" />
    <motion.circle className="cable-tip" cx={x} cy={y} r={magneticTipRadius * sizeScale} fill="currentColor" />
  </g>;
}
