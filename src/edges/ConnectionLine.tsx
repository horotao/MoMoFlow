import { useEdges, useNodes, useStoreApi, type ConnectionLineComponentProps } from '@xyflow/react';
import { useContext, useLayoutEffect, useState } from 'react';
import { curveOptions } from './curve';
import { MagneticConnectionPreview } from './MagneticConnectionPreview';
import { ConnectionEffectsContext } from './connectionEffects';
import { magneticDefaults } from './magneticTypes';

export function ConnectionLine(props: ConnectionLineComponentProps) {
  const { fromNode, fromHandle } = props;
  const nodes = useNodes(), edges = useEdges();
  const store = useStoreApi();
  const { visual } = useContext(ConnectionEffectsContext);
  const [portColor, setPortColor] = useState<string>();
  const [portRadius, setPortRadius] = useState(2.5);
  useLayoutEffect(() => {
    const host = store.getState().domNode?.querySelector(`[data-id="${CSS.escape(fromNode.id)}"]`);
    const port = [...(host?.querySelectorAll<HTMLElement>(`.react-flow__handle.${fromHandle.type}`) ?? [])]
      .find(element => (element.dataset.handleid ?? '') === (fromHandle.id ?? ''));
    if (!port) { setPortColor(undefined); setPortRadius(2.5); return; }
    const style = getComputedStyle(port);
    // Resolve in the port's scope: its token may be defined on a per-port wrapper
    // or a dynamic Router, and is not inherited by the connection SVG.
    setPortColor(style.getPropertyValue(port.classList.contains('file-node-port') ? '--file-port' : '--node-port-color').trim() || undefined);
    setPortRadius(port.classList.contains('file-node-port') ? 3 : parseFloat(style.getPropertyValue('--node-port-dot-radius')) || 2.5);
  }, [store, fromNode.id, fromHandle.id, fromHandle.type, nodes, edges]);

  return <MagneticConnectionPreview {...props} {...curveOptions} settings={magneticDefaults} visual={visual}
    portRadius={portRadius}
    color={portColor ?? 'var(--xy-connectionline-stroke, var(--xy-connectionline-stroke-default, #b1b1b7))'} />;
}
