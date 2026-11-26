import { createContext, useCallback, useEffect, useRef } from 'react';
import { useStoreApi, type XYPosition } from '@xyflow/react';

export const magneticPortRadius = 160;
export const inputAnchorX = -24;
export const outputAnchorOffset = 28;

export type PortPointer = XYPosition & { width: number; height: number };
type Listener = (pointer: PortPointer | null) => void;
type Register = (id: string, listener: Listener) => () => void;
export const CanvasPortPointerContext = createContext<Register | null>(null);

// Project the pointer once per frame. React Flow already tracks absolute positions
// (including grouped nodes) and measured sizes, so zoom needs no per-node DOM reads.
export function useCanvasPortPointer() {
  const store = useStoreApi();
  const listeners = useRef(new Map<string, Listener>());
  const refresh = useRef<() => void>();
  const register = useCallback<Register>((id, listener) => {
    listeners.current.set(id, listener);
    refresh.current?.();
    return () => { listeners.current.delete(id); };
  }, []);

  useEffect(() => {
    let pointer: XYPosition | null = null;
    let bounds: DOMRect | undefined;
    let frame = 0;
    let nearby = new Set<Listener>();
    function update() {
      frame = 0;
      const state = store.getState();
      const next = new Set<Listener>();
      if (pointer && state.domNode) {
        bounds ??= state.domNode.getBoundingClientRect();
        const [tx, ty, zoom] = state.transform;
        const flowX = (pointer.x - bounds.left - tx) / zoom;
        const flowY = (pointer.y - bounds.top - ty) / zoom;
        for (const [id, listener] of listeners.current) {
          const node = state.nodeLookup.get(id);
          if (!node || node.hidden) continue;
          const { width, height } = node.measured;
          if (!width || !height) continue;
          const x = flowX - node.internals.positionAbsolute.x;
          const y = flowY - node.internals.positionAbsolute.y;
          if (y < -magneticPortRadius || y > height + magneticPortRadius
            || Math.min(Math.abs(x - inputAnchorX), Math.abs(x - width - outputAnchorOffset)) >= magneticPortRadius) continue;
          listener({ x, y, width, height });
          next.add(listener);
        }
      }
      for (const listener of nearby) if (!next.has(listener)) listener(null);
      nearby = next;
    }
    function schedule() {
      if (!frame && (pointer || nearby.size)) frame = requestAnimationFrame(update);
    }
    function move(event: PointerEvent) {
      pointer = event.pointerType === 'mouse' || event.pointerType === 'pen' ? { x: event.clientX, y: event.clientY } : null;
      schedule();
    }
    function leave() { pointer = null; schedule(); }
    function invalidateBounds() { bounds = undefined; schedule(); }
    refresh.current = schedule;
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', leave);
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('resize', invalidateBounds);
    window.addEventListener('scroll', invalidateBounds, true);
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.domNode !== previous.domNode || state.width !== previous.width || state.height !== previous.height) invalidateBounds();
      else if (state.transform !== previous.transform || state.nodes !== previous.nodes || state.nodeLookup !== previous.nodeLookup) schedule();
    });
    return () => {
      refresh.current = undefined;
      unsubscribe();
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', invalidateBounds);
      window.removeEventListener('scroll', invalidateBounds, true);
    };
  }, [store]);
  return register;
}
