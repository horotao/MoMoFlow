import { Handle, Position, type HandleProps } from '@xyflow/react';
import type { ReactNode } from 'react';

export function NodePort({ label, top = 89, invalid = false, children, ...props }: HandleProps & {
  label: string;
  top?: number;
  invalid?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const side = props.position === Position.Left ? 'input' : 'output';
  return <>
    <span className={`node-port-label node-port-label-${side} text-node-port-label`}
      style={{ top: top - 8 }}>{label}</span>
    <Handle {...props} aria-label={label} className={`node-port${invalid ? ' is-type-error' : ''}`}
      style={{ top }}>
      {children}
    </Handle>
  </>;
}
