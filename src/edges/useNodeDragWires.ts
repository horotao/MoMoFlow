import { useContext, useLayoutEffect, useState } from 'react';
import { useStoreApi, type InternalNode, type XYPosition } from '@xyflow/react';
import { MotionConfigContext, type MotionValue } from 'motion/react';
import { aimWireFollower, createWireFollower, restingWireLag } from './nodeWireSpring';

type DragWire = {
  sync: (node: InternalNode | undefined, reduced: boolean) => void;
  reset: () => void;
  listeners: Set<MotionValue<XYPosition>>;
};

function trackNode(initialPosition: XYPosition): DragWire {
  let position = initialPosition;
  const follower = createWireFollower(position);
  const listeners = new Set<MotionValue<XYPosition>>();
  const publish = () => {
    const lag = { x: follower.x.get() - position.x, y: follower.y.get() - position.y };
    for (const output of listeners) output.set(lag);
  };
  follower.x.on('change', publish);
  follower.y.on('change', publish);
  const reset = () => {
    aimWireFollower(follower, position, false);
    publish();
  };
  return {
    listeners, reset,
    sync(node, reduced) {
      const next = node?.internals.positionAbsolute;
      if (!next) { reset(); return; }
      if (next.x === position.x && next.y === position.y) return;
      position = next;
      aimWireFollower(follower, position, Boolean(node.dragging) && !reduced);
      publish();
    },
  };
}

function createDragWires(store: ReturnType<typeof useStoreApi>) {
  const tracks = new Map<string, DragWire>();
  let reduced = false;
  const clear = () => { for (const track of tracks.values()) track.reset(); };
  return {
    clear,
    getZoom: () => store.getState().transform[2],
    setReduced(next: boolean) {
      reduced = next;
      if (reduced) clear();
    },
    sync() {
      const { nodeLookup } = store.getState();
      for (const [id, track] of tracks) track.sync(nodeLookup.get(id), reduced);
    },
    watch(id: string, output: MotionValue<XYPosition>) {
      let track = tracks.get(id);
      if (!track) {
        const position = store.getState().nodeLookup.get(id)?.internals.positionAbsolute;
        if (!position) return;
        track = trackNode(position);
        tracks.set(id, track);
      }
      const current = track;
      current.listeners.add(output);
      return () => {
        current.listeners.delete(output);
        output.set(restingWireLag);
        if (current.listeners.size === 0) {
          current.reset();
          tracks.delete(id);
        }
      };
    },
  };
}

export type NodeDragWires = ReturnType<typeof createDragWires>;

export function useNodeDragWires() {
  const store = useStoreApi();
  const { reducedMotion } = useContext(MotionConfigContext);
  const [wires] = useState(() => createDragWires(store));

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => wires.setReduced(reducedMotion === 'always' || (reducedMotion !== 'never' && media.matches));
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [wires, reducedMotion]);

  useLayoutEffect(() => store.subscribe((next, previous) => {
    // Pan, selection overlays and feedback do not independently move nodes.
    if (next.nodes !== previous.nodes) wires.sync();
  }), [store, wires]);

  return wires;
}
