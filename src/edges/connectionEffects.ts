import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { Edge } from '@xyflow/react';
import { motionValue } from 'motion/react';
import type { NodeEntranceEvent } from './magneticTypes';
import { useConnectionGesture } from './useConnectionGesture';

export const ConnectionEffectsContext = createContext({ entrances: new Map<string, NodeEntranceEvent>() });

export function useConnectionEffects() {
  const gesture = useConnectionGesture(40, true);
  const { cancel } = gesture;
  const [entrances, setEntrances] = useState(() => new Map<string, NodeEntranceEvent>());
  useEffect(() => {
    if (!entrances.size) return;
    const expiry = Math.min(...[...entrances.values()].map(event => event.expiresAt));
    const timer = window.setTimeout(() => setEntrances(current =>
      new Map([...current].filter(([, event]) => event.expiresAt > performance.now()))), Math.max(1, Math.ceil(expiry - performance.now())));
    return () => window.clearTimeout(timer);
  }, [entrances]);
  const clear = useCallback(() => { cancel(); setEntrances(new Map()); }, [cancel]);
  const created = useCallback((edge: Edge | null, nodeId: string, direction: 'source' | 'target' = 'target') => {
    const event: NodeEntranceEvent = {
      id: crypto.randomUUID(), edgeId: edge?.id ?? null, nodeId, direction,
      handleId: (direction === 'source' ? edge?.sourceHandle : edge?.targetHandle) ?? null,
      scale: motionValue(1), opacity: motionValue(0), origin: motionValue('0px 0px'),
      played: false, finished: false, expiresAt: performance.now() + 4000,
    };
    setEntrances(current => new Map(current).set(nodeId, event));
  }, []);
  const value = useMemo(() => ({ entrances }), [entrances]);
  return { ...gesture, value, clear, created };
}
