import { useContext, useLayoutEffect } from 'react';
import { useInternalNode, useStore, useStoreApi, useUpdateNodeInternals } from '@xyflow/react';
import { animate, useReducedMotion } from 'motion/react';
import { ConnectionEffectsContext } from './connectionEffects';
import { layoutHandle } from './nodeEntranceGeometry';
import type { NodeEntranceEvent } from './magneticTypes';
import { spring } from '../lib/springs';

function Entrance({ event }: { event: NodeEntranceEvent }) {
  const node = useInternalNode(event.nodeId);
  const connected = useStore(state => event.edgeId === null || state.edgeLookup.has(event.edgeId));
  const store = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  const { reveal } = useContext(ConnectionEffectsContext);
  const reduced = useReducedMotion();
  const ready = Boolean(node?.measured.width && (event.edgeId === null || node.internals.handleBounds?.[event.direction]?.some(handle => (handle.id ?? null) === event.handleId)));
  useLayoutEffect(() => {
    if (!ready || !connected || event.finished) return;
    const host = store.getState().domNode?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(event.nodeId)}"]`);
    const port = event.edgeId && host ? layoutHandle(host, event.direction, event.handleId) : null;
    if (!host || (event.edgeId && !port)) return;
    const frame = host.querySelector<HTMLElement>('.node-frame');
    if (!frame) return;
    event.origin.set(port ? `${port.x}px ${port.y}px` : `${frame.offsetWidth / 2}px ${frame.offsetHeight / 2}px`);
    if (!event.played) {
      event.scale.jump(reduced ? 1 : 0.94);
      event.played = true;
      reveal(event);
    }
    frame?.setAttribute('data-node-entrance', 'playing');
    const finish = () => {
      if (event.finished) return;
      event.finished = true; event.scale.jump(1); event.opacity.jump(1);
      frame?.removeAttribute('data-node-entrance');
      updateNodeInternals(event.nodeId);
    };
    if (reduced) event.scale.jump(1);
    const animations = [animate(event.opacity, 1, { ...spring.fast, ...(reduced ? { onComplete: finish } : {}) })];
    if (!reduced) animations.push(animate(event.scale, 1, { ...spring.slow, onComplete: finish }));
    // A fresh pointer interaction takes priority over the entrance; finish
    // before React Flow reads handles for another drag or a node move.
    const interrupt = () => { animations.forEach(animation => animation.stop()); finish(); };
    host.addEventListener('pointerdown', interrupt, true);
    return () => {
      host.removeEventListener('pointerdown', interrupt, true);
      animations.forEach(animation => animation.stop());
      // StrictMode may repeat setup before the first frame. Keep the values
      // for that setup; history/removal clears the event through its provider.
      frame?.removeAttribute('data-node-entrance');
    };
  }, [event, ready, connected, reduced, reveal, store, updateNodeInternals]);
  return null;
}

export function NodeEntrance() {
  const { entrances } = useContext(ConnectionEffectsContext);
  return <>{[...entrances.values()].map(event => <Entrance key={event.id} event={event} />)}</>;
}
