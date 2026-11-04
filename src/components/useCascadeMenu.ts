import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type Point = { x: number; y: number };
type Bounds = { left: number; right: number; top: number; bottom: number };
export const MENU_OPEN_DELAY = 220;
export const MENU_CLOSE_DELAY = 360;
export const MENU_AIM_LIMIT = 1200;

// The near edge also works when a submenu flips to the parent's left.
export function isInMenuTriangle(point: Point, origin: Point, submenu: Bounds) {
  if (origin.x > submenu.left && origin.x < submenu.right) return false;
  const edgeX = origin.x <= submenu.left ? submenu.left : submenu.right;
  if (edgeX === origin.x) return false;
  const progress = (point.x - origin.x) / (edgeX - origin.x);
  if (progress < 0 || progress > 1) return false;
  const upperY = origin.y + (submenu.top - origin.y) * progress;
  const lowerY = origin.y + (submenu.bottom - origin.y) * progress;
  return point.y >= Math.min(upperY, lowerY) && point.y <= Math.max(upperY, lowerY);
}

type Options = {
  main: RefObject<HTMLDivElement>;
  submenu: RefObject<HTMLDivElement>;
  trigger?: RefObject<HTMLButtonElement>;
  onDismiss: () => void;
};

export function useCascadeMenu({ main, submenu, trigger, onDismiss }: Options) {
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);
  const control = useRef<{ activate: (id: string | null) => void; cancel: () => void }>();
  const activate = useCallback((id: string | null) => control.current?.activate(id), []);
  const cancelHover = useCallback(() => control.current?.cancel(), []);

  useEffect(() => {
    let current: string | null = null;
    let previous: { point: Point; row: string | null } | null = null;
    let pointer: Point | null = null;
    let pending: { id: string | null; since: number } | null = null;
    let protection: { origin: Point; since: number; direction: number } | null = null;
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    const cancelClose = () => { clearTimeout(closeTimer); closeTimer = undefined; };
    const cancel = () => {
      clearTimeout(hoverTimer); hoverTimer = undefined;
      pending = null; protection = null;
    };
    const select = (id: string | null) => {
      cancel(); cancelClose(); current = id;
      setActiveRow(id); setHighlightedRow(id);
    };
    const resolve = () => {
      clearTimeout(hoverTimer);
      if (!pending) return;
      const now = performance.now();
      const bounds = submenu.current?.getBoundingClientRect();
      const protectedFor = protection ? now - protection.since : MENU_AIM_LIMIT;
      if (protection && bounds && pointer && protectedFor < MENU_AIM_LIMIT
        && isInMenuTriangle(pointer, protection.origin, bounds)) {
        // A stationary pointer must not keep the old submenu open forever.
        hoverTimer = setTimeout(resolve, MENU_AIM_LIMIT - protectedFor);
        return;
      }
      protection = null;
      const remaining = MENU_OPEN_DELAY - (now - pending.since);
      if (remaining > 0) { hoverTimer = setTimeout(resolve, remaining); return; }
      select(pending.id);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = event.target instanceof Element ? event.target : null;
      pointer = { x: event.clientX, y: event.clientY };
      if (target && (submenu.current?.contains(target) || trigger?.current?.contains(target))) {
        cancel(); cancelClose();
        previous = null;
      } else if (target && main.current?.contains(target)) {
        cancelClose();
        const row = target.closest<HTMLElement>('[data-main-row]');
        const id = row?.dataset.mainRow ?? null;
        if (id === current) {
          cancel(); setHighlightedRow(id);
        } else {
          const bounds = submenu.current?.getBoundingClientRect();
          if (protection && previous) {
            const dx = pointer.x - previous.point.x;
            const dy = pointer.y - previous.point.y;
            // Membership in the old triangle is insufficient after a reversal
            // or vertical row navigation. A stationary pointer keeps its deadline.
            if (dx * protection.direction < 0 || (dx === 0 && dy !== 0)) protection = null;
          }
          // Only a fresh departure from the active parent can begin protection.
          // Outside/submenu coordinates and already-hovered sibling rows cannot
          // re-arm it after a reversal or after the pointer leaves the triangle.
          if (!protection && bounds && previous?.row === current
            && isInMenuTriangle(pointer, previous.point, bounds)) {
            protection = {
              origin: previous.point, since: performance.now(),
              direction: previous.point.x <= bounds.left ? 1 : -1,
            };
          }
          if (!pending || pending.id !== id) pending = { id, since: performance.now() };
          if (!bounds) setHighlightedRow(id);
          resolve();
        }
        previous = { point: pointer, row: id };
      } else {
        cancel();
        previous = null;
        if (closeTimer === undefined) closeTimer = setTimeout(onDismiss, MENU_CLOSE_DELAY);
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!main.current?.contains(target) && !submenu.current?.contains(target) && !trigger?.current?.contains(target)) onDismiss();
    };
    const leaveWindow = (event: PointerEvent) => {
      if (event.relatedTarget === null) {
        cancel();
        previous = null;
        if (closeTimer === undefined) closeTimer = setTimeout(onDismiss, MENU_CLOSE_DELAY);
      }
    };
    const keyboard = () => { cancel(); cancelClose(); previous = null; };
    const reenter = (event: PointerEvent) => {
      const target = event.target as Node;
      if (main.current?.contains(target) || submenu.current?.contains(target) || trigger?.current?.contains(target)) cancelClose();
    };
    const windowBlur = () => { cancel(); cancelClose(); onDismiss(); };
    control.current = { activate: select, cancel: keyboard };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('pointerout', leaveWindow);
    document.addEventListener('pointerover', reenter);
    document.addEventListener('keydown', keyboard, true);
    window.addEventListener('resize', keyboard);
    window.addEventListener('blur', windowBlur);
    return () => {
      cancel(); cancelClose(); control.current = undefined;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('pointerout', leaveWindow);
      document.removeEventListener('pointerover', reenter);
      document.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('resize', keyboard);
      window.removeEventListener('blur', windowBlur);
    };
  }, [main, submenu, trigger, onDismiss]);

  return { activeRow, highlightedRow, activate, cancelHover };
}
