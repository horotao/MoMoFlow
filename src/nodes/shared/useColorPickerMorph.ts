import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { animate, useMotionValue, usePresence, useReducedMotionConfig } from 'motion/react';
import { EASE_OUT, PICKER_MORPH } from './beuiColorPickerMotion';

const REST = 'translate(0px, 0px) scale(1, 1)';
const RADIUS = '12px / 12px';
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

function screenBox(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const [x, y = x] = getComputedStyle(element).borderTopLeftRadius.split(/[\s/]+/);
  const radius = (value: string, size: number, localSize: number) => value.endsWith('%')
    ? parseFloat(value) / 100 * size : (parseFloat(value) || 0) * size / localSize;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    rx: radius(x, rect.width, element.offsetWidth), ry: radius(y, rect.height, element.offsetHeight) };
}

// Morph inside the fixed portal. The node's chip never takes part in layout
// projection, so moving a React Flow node cannot add a second translation.
export function useColorPickerMorph({ enabled, area, trigger, onActiveChange }: {
  enabled: boolean;
  area: RefObject<HTMLDivElement>;
  trigger: RefObject<HTMLButtonElement>;
  onActiveChange: (active: boolean) => void;
}) {
  const [present, safeToRemove] = usePresence();
  const reduce = useReducedMotionConfig();
  const transform = useMotionValue(REST);
  const borderRadius = useMotionValue(RADIUS);
  const opacity = useMotionValue(1);
  const started = useRef(false);
  const [positioned, setPositioned] = useState(!enabled);
  // AnimatePresence refreshes this callback when the viewport re-renders.
  // Keep its latest value without restarting an in-flight return on every pan.
  const remove = useRef(safeToRemove);
  useLayoutEffect(() => { remove.current = safeToRemove; }, [safeToRemove]);

  useLayoutEffect(() => {
    if (!enabled) return;
    onActiveChange(true);
    return () => onActiveChange(false);
  }, [enabled, onActiveChange]);

  useLayoutEffect(() => {
    if (!enabled) return;
    let canceled = false;
    let animations: { stop: () => void }[] = [];
    // Content places the portal in its layout effect. Measure on the next
    // frame, using untransformed local dimensions even when reversing an exit.
    const frame = requestAnimationFrame(() => {
      const element = area.current;
      const chip = trigger.current?.querySelector<HTMLElement>('[data-color-picker-chip]');
      if (!element || !chip) { if (!present) remove.current?.(); return; }
      const width = element.offsetWidth, height = element.offsetHeight;
      const source = screenBox(started.current ? element : chip);
      if (!width || !height || !source.width || !source.height) { if (!present) remove.current?.(); return; }
      started.current = true;
      if (reduce) {
        transform.jump(REST); borderRadius.jump(RADIUS);
        setPositioned(true);
        const fade = animate(opacity, present ? 1 : 0, { duration: .12, ease: EASE_OUT });
        animations = [fade];
        if (!present) void fade.then(() => { if (!canceled) remove.current?.(); });
        return;
      }
      opacity.jump(1);
      const draw = (progress: number) => {
        const parentRect = (element.offsetParent as HTMLElement | null)?.getBoundingClientRect();
        const left = (parentRect?.left ?? 0) + element.offsetLeft;
        const top = (parentRect?.top ?? 0) + element.offsetTop;
        // The node can move or zoom while this portal is returning. Read the
        // live destination each frame, without resetting the spring's clock.
        const target = present ? { left, top, width, height, rx: 12, ry: 12 } : screenBox(chip);
        const scaleX = Math.max(.001, mix(source.width, target.width, progress) / width);
        const scaleY = Math.max(.001, mix(source.height, target.height, progress) / height);
        transform.set(`translate(${mix(source.left, target.left, progress) - left}px, ${mix(source.top, target.top, progress) - top}px) scale(${scaleX}, ${scaleY})`);
        borderRadius.set(`${mix(source.rx, target.rx, progress) / scaleX}px / ${mix(source.ry, target.ry, progress) / scaleY}px`);
      };
      draw(0);
      setPositioned(true);
      const move = animate(0, 1, { ...PICKER_MORPH, onUpdate: draw });
      animations = [move];
      void move.then(() => {
        if (canceled) return;
        if (present) { transform.jump(REST); borderRadius.jump(RADIUS); }
        else remove.current?.();
      });
    });
    return () => {
      canceled = true;
      cancelAnimationFrame(frame);
      animations.forEach(animation => animation.stop());
    };
  }, [enabled, present, reduce, area, trigger, transform, borderRadius, opacity]);

  return {
    present,
    style: { transform, borderRadius, opacity, transformOrigin: '0 0', visibility: positioned ? 'visible' as const : 'hidden' as const },
  };
}
