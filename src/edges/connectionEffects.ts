import { createContext, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useStoreApi, type Edge } from '@xyflow/react';
import { magneticDefaults, type CableImpact, type CableRelease, type ConnectionVisualSnapshot, type PortFeedbackEvent } from './magneticTypes';
import { useConnectionGesture } from './useConnectionGesture';

type EdgeFeedback = { release?: CableRelease; impact?: CableImpact; expiresAt: number };
type FeedbackState = { animations: Map<string, EdgeFeedback>; ports: PortFeedbackEvent[] };
type EffectsContext = FeedbackState & { visual: MutableRefObject<(() => ConnectionVisualSnapshot) | null> };
const emptyFeedback = (): FeedbackState => ({ animations: new Map(), ports: [] });
export const ConnectionEffectsContext = createContext<EffectsContext>({ ...emptyFeedback(), visual: { current: null } });

// Transient feedback lives outside graph data, persistence, history and execution.
export function useConnectionEffects() {
  const store = useStoreApi();
  const gesture = useConnectionGesture(magneticDefaults.radius);
  const { cancelled, cancel } = gesture;
  const visual = useRef<(() => ConnectionVisualSnapshot) | null>(null);
  const [state, setState] = useState(emptyFeedback);
  useEffect(() => {
    const expiries = [...state.animations.values()].map(item => item.expiresAt).concat(state.ports.map(item => item.expiresAt));
    if (!expiries.length) return;
    const timeout = window.setTimeout(() => setState(current => {
      const now = performance.now();
      return { animations: new Map([...current.animations].filter(([, item]) => item.expiresAt > now)), ports: current.ports.filter(item => item.expiresAt > now) };
    }), Math.max(1, Math.ceil(Math.min(...expiries) - performance.now())));
    return () => window.clearTimeout(timeout);
  }, [state]);
  const clear = useCallback(() => { cancel(); setState(emptyFeedback()); }, [cancel]);
  const connected = useCallback((edge: Edge, retainedEdges: Edge[]) => {
    const { connection: drag, transform: [tx, ty, scale] } = store.getState();
    if (cancelled.current || !drag.inProgress || !drag.isValid || !drag.toHandle) return;
    const settings = magneticDefaults;
    const snapshot = visual.current?.();
    const id = crypto.randomUUID();
    const now = performance.now();
    const anchor = { x: (drag.to.x - tx) / scale, y: (drag.to.y - ty) / scale };
    const tip = { x: (drag.pointer.x - tx) / scale, y: (drag.pointer.y - ty) / scale };
    const dx = anchor.x - drag.from.x, dy = anchor.y - drag.from.y;
    const pullX = tip.x - anchor.x, pullY = tip.y - anchor.y;
    const reverse = drag.fromHandle.type === 'target';
    const direction = Math.sign((-dy * pullX + dx * pullY) * (reverse ? -1 : 1)) || 1;
    const velocity = direction * (600 + Math.min(65, Math.hypot(pullX, pullY) * scale) * 8) / scale * settings.bounceStrength / 100;
    const release: CableRelease = { id, velocity, reverse, speed: settings.speed, rigidity: settings.rigidity, range: settings.bounceRange };
    const impact: CableImpact = { id, point: anchor, zoom: scale, velocity, speed: settings.speed, rigidity: settings.rigidity };
    const duration = 0.52 / settings.rippleSpeed, delay = snapshot ? 0.1 : 0;
    const port: PortFeedbackEvent = {
      id, edgeId: edge.id, nodeId: drag.toHandle.nodeId, handleId: drag.toHandle.id ?? null, direction: drag.toHandle.type,
      color: snapshot?.color ?? '#e28cf8', feather: settings.rippleFeather, duration, delay, expiresAt: now + (duration + delay) * 1000 + 80,
      absorption: snapshot ? { ...snapshot, field: settings.field } : undefined,
    };
    setState(current => {
      const retained = new Set(retainedEdges.map(item => item.id));
      const animations = new Map([...current.animations].filter(([key]) => retained.has(key)));
      for (const item of retainedEdges) animations.set(item.id, { ...animations.get(item.id), impact, expiresAt: now + 4000 });
      animations.set(edge.id, { release, expiresAt: now + 4000 });
      return { animations, ports: [...current.ports.filter(item => retained.has(item.edgeId)
        && !(item.nodeId === port.nodeId && item.handleId === port.handleId && item.direction === port.direction)), port] };
    });
  }, [store, cancelled]);
  const value = useMemo(() => ({ ...state, visual }), [state]);
  return { ...gesture, value, clear, connected };
}
