import { useEffect, useRef } from 'react';

// FLORA's rendered handle geometry: 160-unit attraction radius, 35% pull,
// capped at 20 units, retargeted from the current position over 500ms (easeOutCubic).
// Magnetic movement and the separate 150ms reveal never share a transform.
export function useMagneticPorts() {
  const node = useRef<HTMLElement>(null);
  const inputs = useRef<(HTMLButtonElement | null)[]>([]);
  const output = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const tracks = Array.from({ length: 3 }, () => ({
      x: 0, y: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, started: 0,
    }));
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;

    function advance(track: typeof tracks[number], now: number) {
      const progress = reduced.matches ? 1 : Math.min(1, Math.max(0, (now - track.started) / 500));
      const eased = 1 - (1 - progress) ** 3;
      track.x = track.fromX + (track.toX - track.fromX) * eased;
      track.y = track.fromY + (track.toY - track.fromY) * eased;
      return progress < 1;
    }

    function paint(now: number) {
      frame = 0;
      let moving = false;
      const elements = [...inputs.current, output.current];
      tracks.forEach((track, index) => {
        moving = advance(track, now) || moving;
        const element = elements[index];
        const transform = `translate3d(${track.x}px, ${track.y}px, 0px)`;
        if (element && element.style.transform !== transform) element.style.transform = transform;
      });
      if (moving) frame = requestAnimationFrame(paint);
    }

    function retarget() {
      const rect = node.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = rect.width / 384;
      const anchors = [
        { x: -24, y: 172 },
        { x: -24, y: 212 },
        { x: 412, y: 192 },
      ];
      const now = performance.now();
      tracks.forEach((track, index) => {
        advance(track, now);
        let x = 0;
        let y = 0;
        const element = [...inputs.current, output.current][index];
        if (pointer && finePointer.matches && !element?.disabled && element?.dataset.connectionEligible !== 'false') {
          const dx = (pointer.x - rect.left) / scale - anchors[index].x;
          const dy = (pointer.y - rect.top) / scale - anchors[index].y;
          if (Math.hypot(dx, dy) < 160) {
            x = dx * .35;
            y = dy * .35;
            const length = Math.hypot(x, y);
            if (length > 20) { x *= 20 / length; y *= 20 / length; }
          }
        }
        if (track.toX === x && track.toY === y) return;
        track.fromX = track.x;
        track.fromY = track.y;
        track.toX = x;
        track.toY = y;
        track.started = now;
      });
      if (!frame) paint(now);
    }

    function move(event: PointerEvent) {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      pointer = { x: event.clientX, y: event.clientY };
      retarget();
    }
    function leave() { pointer = null; retarget(); }
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', leave);
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('resize', retarget);
    window.addEventListener('scroll', retarget, { passive: true, capture: true });
    reduced.addEventListener('change', retarget);
    finePointer.addEventListener('change', retarget);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', retarget);
      window.removeEventListener('scroll', retarget, true);
      reduced.removeEventListener('change', retarget);
      finePointer.removeEventListener('change', retarget);
    };
  }, []);

  return { node, inputs, output };
}
