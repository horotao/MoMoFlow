import { useEffect, useState } from 'react';
import { useViewport } from '@xyflow/react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { magneticOutline } from './magneticGeometry';
import { magneticSizeScale } from './magneticSizing';
import type { PortFeedbackEvent } from './magneticTypes';
import './magneticEffects.css';

export function PortAbsorption({ snapshot }: { snapshot: NonNullable<PortFeedbackEvent['absorption']> }) {
  const { zoom } = useViewport();
  const reduced = useReducedMotion();
  const progress = useMotionValue(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (reduced) return;
    const animation = animate(progress, 1, { duration: 0.24, ease: [0.32, 0, 0.2, 1], onComplete: () => setPlaying(false) });
    return () => animation.stop();
  }, [progress, reduced]);
  const x = useTransform(progress, value => snapshot.x * (1 - value));
  const y = useTransform(progress, value => snapshot.y * (1 - value));
  const radius = useTransform(progress, value => 6.5 * (1 - value));
  const opacity = useTransform(progress, [0, 0.65, 1], [1, 1, 0]);
  const outline = useTransform(progress, value => magneticOutline(
    { x: 0, y: 0 }, { x: snapshot.x * (1 - value), y: snapshot.y * (1 - value) },
    8 + (snapshot.radius - 8) * (1 - value), 12 * (1 - value),
  ));
  if (reduced || !playing) return null;
  return <svg className="connection-port-effect port-absorption" viewBox="-64 -64 128 128" aria-hidden="true" style={{ transform: `translate(-50%, -50%) scale(${magneticSizeScale(zoom)})` }}>
    {snapshot.field && <motion.path className="absorbing-field" d={outline} fill="currentColor" fillOpacity={0.11} stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} opacity={opacity} />}
    <motion.circle className="absorbing-tip cable-tip" cx={x} cy={y} r={radius} fill="currentColor" />
  </svg>;
}

export function PortRipple({ feather, duration, delay }: Pick<PortFeedbackEvent, 'feather' | 'duration' | 'delay'>) {
  const { zoom } = useViewport();
  const reduced = useReducedMotion();
  return <svg className="connection-port-effect port-ripple" viewBox="-64 -64 128 128" aria-hidden="true" style={{ transform: `translate(-50%, -50%) scale(${magneticSizeScale(zoom)})`, filter: feather === 0 ? 'none' : `blur(${feather}px) drop-shadow(0 0 ${feather * 2}px currentColor)` }}>
    <motion.circle className="port-ripple-ring" cx={0} cy={0} fill="none" stroke="currentColor" strokeWidth={1.6}
      initial={{ r: 9, opacity: 0.7 }} animate={reduced ? { r: 9, opacity: 0 } : { r: 52, opacity: [0.7, 0.5, 0] }}
      transition={{ r: { delay: reduced ? 0 : delay, duration: reduced ? 0 : duration, ease: [0.16, 1, 0.3, 1] }, opacity: { delay: reduced ? 0 : delay, duration: reduced ? 0.16 : duration, ease: 'linear', times: reduced ? [0, 1] : [0, 0.18, 1] } }} />
  </svg>;
}
