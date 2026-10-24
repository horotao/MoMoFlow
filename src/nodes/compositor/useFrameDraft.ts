import { useCallback, useLayoutEffect, useRef } from 'react';

// Coalesce high-rate pointer/IME input; never let a queued preview run after a
// commit, cancellation, or unmount. Committed data always uses the last event.
export function useFrameDraft<T>(publish: (value: T) => void) {
  const callback = useRef(publish), frame = useRef<number>(), latest = useRef<{ value: T }>();
  callback.current = publish;
  const clear = useCallback(() => { if (frame.current !== undefined) cancelAnimationFrame(frame.current); frame.current = undefined; latest.current = undefined; }, []);
  useLayoutEffect(() => clear, [clear]);
  return {
    clear,
    schedule(value: T) {
      latest.current = { value };
      if (frame.current === undefined) frame.current = requestAnimationFrame(() => {
        frame.current = undefined; const pending = latest.current; latest.current = undefined;
        if (pending) callback.current(pending.value);
      });
    },
  };
}
