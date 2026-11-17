import type { ComponentProps } from 'react';
import { NodePort } from './NodePort';
import './annotationStyle.css';

export function AnnotationPort({ connected, ...props }: Omit<ComponentProps<typeof NodePort>, 'children'> & { connected: boolean }) {
  return <div className="annotation-port">
    <NodePort {...props}>
      <span className="annotation-port-icon" data-connected={connected} aria-hidden="true" />
    </NodePort>
  </div>;
}
