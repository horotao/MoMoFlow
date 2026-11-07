import type { CSSProperties, ReactNode } from 'react';
import './nodeStyle.css';

/** Opt in one node at a time; the React Flow host keeps its graph identity. */
export function NodeFrame({ children, className = '', style }: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`node-frame ${className}`} style={style}>{children}</div>;
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
