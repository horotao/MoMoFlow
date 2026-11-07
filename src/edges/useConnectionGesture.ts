import { useCallback, useEffect, useRef } from 'react';
import { useStoreApi, type Connection, type Edge, type OnConnectStart } from '@xyflow/react';
import { magneticSizeScale } from './magneticSizing';

// XYHandle captures its search radius at pointer-down and has no public abort
// method. Keep its candidate search broad, validate against the live viewport,
// and route cancellation through its pointer-up cleanup as well as the store.
export function useConnectionGesture(radius: number) {
  const store = useStoreApi();
  const cancelled = useRef(false);
  const active = useRef(false);
  const pointer = useRef<{ clientX: number; clientY: number } | null>(null);
  const refreshFrame = useRef(0);
  const end = useCallback(() => {
    active.current = false;
    cancelAnimationFrame(refreshFrame.current);
    refreshFrame.current = 0;
  }, []);
  const start: OnConnectStart = useCallback(() => {
    cancelled.current = false;
    active.current = true;
    store.setState({ connectionClickStartHandle: null });
  }, [store]);
  const startClick = useCallback(() => { cancelled.current = false; }, []);
  const cancel = useCallback(() => {
    const state = store.getState();
    if (!state.connection.inProgress && !state.connectionClickStartHandle) return;
    const dragging = state.connection.inProgress;
    cancelled.current = true;
    end();
    state.cancelConnection();
    store.setState({ connectionClickStartHandle: null });
    if (dragging) {
      // XYHandle listens for both mouseup and touchend on this document even
      // for touch drags. Its cleanup stops auto-pan and removes all listeners.
      // The cancelled guard rejects its cached candidate before any graph edit.
      const doc = state.domNode?.ownerDocument ?? document;
      doc.dispatchEvent(new MouseEvent('mouseup', { ...pointer.current, button: 0, buttons: 0, bubbles: true, view: doc.defaultView }));
    }
  }, [store, end]);
  useEffect(() => {
    const doc = store.getState().domNode?.ownerDocument ?? document;
    const track = (event: MouseEvent | TouchEvent) => {
      const point = 'touches' in event ? event.touches[0] ?? event.changedTouches[0] : event;
      if (point) pointer.current = { clientX: point.clientX, clientY: point.clientY };
    };
    // Capture runs before XYHandle validates the current move/release, rather
    // than reading the store's pointer from the preceding mousemove.
    const mouseEvents = ['mousedown', 'mousemove', 'mouseup'] as const;
    const touchEvents = ['touchstart', 'touchmove', 'touchend'] as const;
    mouseEvents.forEach(type => doc.addEventListener(type, track, true));
    touchEvents.forEach(type => doc.addEventListener(type, track, { capture: true, passive: true }));
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) cancel(); };
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', cancel);
    doc.addEventListener('touchcancel', cancel, true);
    const unsubscribe = store.subscribe((state, previous) => {
      if (!active.current || !state.connection.inProgress || state.transform === previous.transform || refreshFrame.current) return;
      // Refresh XYHandle's cached hit after zoom/pan, even if the pointer has
      // not moved. Defer to avoid re-entering its synchronous auto-pan setup.
      refreshFrame.current = requestAnimationFrame(() => {
        refreshFrame.current = 0;
        if (!active.current || !pointer.current || !store.getState().connection.inProgress) return;
        doc.dispatchEvent(new MouseEvent('mousemove', { ...pointer.current, button: 0, buttons: 1, bubbles: true, view: doc.defaultView }));
      });
    });
    return () => {
      cancel();
      end();
      unsubscribe();
      mouseEvents.forEach(type => doc.removeEventListener(type, track, true));
      touchEvents.forEach(type => doc.removeEventListener(type, track, true));
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', cancel);
      doc.removeEventListener('touchcancel', cancel, true);
    };
  }, [store, cancel, end]);
  const withinRadius = useCallback((candidate: Connection | Edge) => {
    const state = store.getState();
    const drag = state.connection;
    // Click connections have no drag pointer and use the clicked handle itself.
    if (!drag.inProgress) return true;
    if (!pointer.current || cancelled.current) return false;
    const reverse = drag.fromHandle.type === 'target';
    const node = state.nodeLookup.get(reverse ? candidate.source : candidate.target);
    const handleId = (reverse ? candidate.sourceHandle : candidate.targetHandle) ?? null;
    const handle = node?.internals.handleBounds?.[reverse ? 'source' : 'target']?.find(item => (item.id ?? null) === handleId);
    const bounds = state.domNode?.getBoundingClientRect();
    if (!node || !handle || !bounds) return false;
    const [tx, ty, zoom] = state.transform;
    const x = (pointer.current.clientX - bounds.left - tx) / zoom;
    const y = (pointer.current.clientY - bounds.top - ty) / zoom;
    const hx = node.internals.positionAbsolute.x + handle.x + handle.width / 2;
    const hy = node.internals.positionAbsolute.y + handle.y + handle.height / 2;
    return Math.hypot(x - hx, y - hy) <= radius * magneticSizeScale(zoom);
  }, [store, radius]);
  return { cancelled, start, startClick, end, cancel, withinRadius, connectionRadius: radius };
}
