import { useContext } from 'react';
import { useInternalNode, useStore, ViewportPortal } from '@xyflow/react';
import { ConnectionEffectsContext } from './connectionEffects';
import { PortAbsorption, PortRipple } from './PortFeedback';
import type { PortFeedbackEvent } from './magneticTypes';

function FeedbackAtPort({ event }: { event: PortFeedbackEvent }) {
  const node = useInternalNode(event.nodeId);
  const connected = useStore(state => state.edgeLookup.has(event.edgeId));
  const handle = node?.internals.handleBounds?.[event.direction]?.find(item => (item.id ?? null) === event.handleId);
  if (!connected || !node || !handle) return null;
  const x = node.internals.positionAbsolute.x + handle.x + handle.width / 2;
  const y = node.internals.positionAbsolute.y + handle.y + handle.height / 2;
  return <div className="connection-feedback-anchor" data-feedback-node={event.nodeId} data-feedback-handle={event.handleId ?? ''}
    style={{ left: x, top: y, color: event.color }}>
    {event.absorption && <PortAbsorption snapshot={event.absorption} />}
    <PortRipple feather={event.feather} duration={event.duration} delay={event.delay} />
  </div>;
}

export function ConnectionEffectsLayer() {
  const { ports } = useContext(ConnectionEffectsContext);
  return <ViewportPortal><div className="connection-feedback-layer" aria-hidden="true">
    {ports.map(event => <FeedbackAtPort key={event.id} event={event} />)}
  </div></ViewportPortal>;
}
