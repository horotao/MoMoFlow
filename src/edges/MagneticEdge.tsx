import { useContext, useLayoutEffect } from 'react';
import { useInternalNode, useStoreApi, type EdgeProps } from '@xyflow/react';
import { useMotionValue } from 'motion/react';
import { ConnectionEffectsContext } from './connectionEffects';
import { MagneticCable, type NodeCableDrag } from './MagneticCable';
import { curveOptions } from './curve';
import { layoutHandle } from './nodeEntranceGeometry';
import { restingWireLag } from './nodeWireSpring';
import type { NodeEntranceEvent } from './magneticTypes';

export function MagneticEdge(props: EdgeProps) {
  const { animations, entrances, nodeDragWires } = useContext(ConnectionEffectsContext);
  const { source, target } = props;
  const sourceLag = useMotionValue(restingWireLag);
  const targetLag = useMotionValue(restingWireLag);
  useLayoutEffect(() => nodeDragWires?.watch(source, sourceLag), [nodeDragWires, source, sourceLag]);
  useLayoutEffect(() => nodeDragWires?.watch(target, targetLag), [nodeDragWires, target, targetLag]);
  const nodeDrag = nodeDragWires && { sourceLag, targetLag, getZoom: nodeDragWires.getZoom };
  const feedback = animations.get(props.id);
  const sourceEntrance = entrances.get(props.source), targetEntrance = entrances.get(props.target);
  const entrance = sourceEntrance?.edgeId === props.id ? sourceEntrance : targetEntrance?.edgeId === props.id ? targetEntrance : undefined;
  if (entrance) return <EntranceCable {...props} nodeDrag={nodeDrag} event={entrance} />;
  return <MagneticCable {...props} {...curveOptions} nodeDrag={nodeDrag} release={feedback?.release} impact={feedback?.impact} />;
}

function EntranceCable({ event, ...props }: EdgeProps & { event: NodeEntranceEvent; nodeDrag?: NodeCableDrag }) {
  const store = useStoreApi();
  const node = useInternalNode(event.nodeId);
  const feedback = useContext(ConnectionEffectsContext).animations.get(props.id);
  const host = store.getState().domNode?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(event.nodeId)}"]`);
  const port = host && layoutHandle(host, event.direction, event.handleId);
  const x = node && port ? node.internals.positionAbsolute.x + port.x : undefined;
  const y = node && port ? node.internals.positionAbsolute.y + port.y : undefined;
  return <MagneticCable {...props} {...curveOptions} release={feedback?.release} impact={feedback?.impact}
    {...(port && x !== undefined && y !== undefined ? event.direction === 'source'
      ? { sourceX: x + port.radius, sourceY: y }
      : { targetX: x - port.radius, targetY: y } : {})}
    entrance={{ direction: event.direction, scale: event.scale, radius: port?.radius ?? 16 }} />;
}
