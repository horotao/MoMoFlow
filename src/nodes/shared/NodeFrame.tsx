import { useContext, type CSSProperties, type ReactNode } from 'react';
import { useNodeId } from '@xyflow/react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { ConnectionEffectsContext } from '../../edges/connectionEffects';
import './nodeStyle.css';

/** Opt in one node at a time; the React Flow host keeps its graph identity. */
export function NodeFrame({ children, className = '', style }: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const id = useNodeId();
  const entrance = useContext(ConnectionEffectsContext).entrances.get(id ?? '');
  const rest = useMotionValue(1);
  const transform = useTransform(entrance?.scale ?? rest, scale => scale === 1 ? 'none' : `scale(${scale})`);
  return <motion.div className={`node-frame ${className}`} style={{ ...style, transform,
    ...(entrance ? { opacity: entrance.opacity, transformOrigin: entrance.origin } : { opacity: 1 }) }}>{children}</motion.div>;
}

export function NodeHeader({ icon, title, status, actions }: {
  icon: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  actions: ReactNode;
}) {
  return <header className="node-header">
    <div className="node-title"><span className="node-title-icon">{icon}</span>
      <div className="node-title-label">{title}</div>{status}
    </div>
    {actions}
  </header>;
}
