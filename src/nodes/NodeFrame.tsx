import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import './NodeFrame.css';

export function NodeFrame({ children, kind = 'image', minHeight, className = '', ...props }: {
  children: ReactNode;
  kind?: 'text' | 'image' | 'compact';
  minHeight?: number;
} & Omit<ComponentPropsWithoutRef<'div'>, 'children'>) {
  return <div {...props} className={`node-frame node-frame--${kind} ${className}`} style={{ minHeight }}>{children}</div>;
}

export function NodeTitle({ children, type }: { children: ReactNode; type: string }) {
  return <div className="node-frame-title text-node-title">
    <div className="node-frame-name">{children}</div>
    <span className="node-frame-type" title={type}>{type}</span>
  </div>;
}
