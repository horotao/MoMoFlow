import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNodeSettingsTarget, useNodeSettingsTargets } from './nodeSettingsTargets';

export function NodeSettingsMount({ nodeId, part }: { nodeId: string; part: 'body' | 'actions' }) {
  const targets = useNodeSettingsTargets();
  const mount = useCallback((element: HTMLDivElement | null) => targets.set(nodeId, part, element), [targets, nodeId, part]);
  return <div ref={mount} className={`node-settings-${part}`} />;
}

export function NodeSettingsPortal({ id, children, actions, onClose }: { id: string; children: ReactNode; actions: ReactNode; onClose: () => void }) {
  const body = useNodeSettingsTarget(id, 'body'), header = useNodeSettingsTarget(id, 'actions');
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; });
  useLayoutEffect(() => () => close.current(), [body]);
  // Controls remain owned by the node and its existing renderer. Only their DOM moves.
  const content = (value: ReactNode) => <div className="node-settings-portal nodrag nopan nowheel"
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onKeyDown={event => event.stopPropagation()}>{value}</div>;
  return <>{body && createPortal(content(children), body)}{header && createPortal(content(actions), header)}</>;
}
