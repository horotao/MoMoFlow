import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotionConfig, useSpring, useTransform, useVelocity, type MotionStyle } from 'motion/react';
import { clampRange, nodeRangeMotion as springs, rangeDecimals, rangeDetent, rangePercent, rangeRubber, snapRange } from '../nodeRange';
import './NodeRangeInput.css';

type Props = {
  value: number; min?: number; max?: number; step?: number; disabled?: boolean;
  id?: string; className?: string; style?: CSSProperties; 'aria-label': string;
  marks?: readonly number[]; format?: (value: number) => string;
  /** Invalidate a gesture when its source or editor selection changes. */
  resetKey?: string;
  onValueStart?: () => void;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  onValueCancel?: (initialValue: number) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
};
type Drag = { pointer: number; initial: number; grab: number; edge: number; detent?: number; samples: { time: number; position: number }[] };

/** Compact Arc Elastic Slider, adapted from https://uiarc.dev/r/elastic-slider.json.
 * Keeps the approved stretch, spring, thumb and tag; values stay synchronous.
 */
export function NodeRangeInput({ value, min = 0, max = 100, step = 1, disabled = false, id, className = '', style,
  'aria-label': label, marks = min < 0 && max > 0 ? [0] : [], format, resetKey,
  onValueStart, onValueChange, onValueCommit, onValueCancel, onKeyDown }: Props) {
  const reduced = useReducedMotionConfig() ?? false;
  const blocked = disabled || max <= min;
  const increment = step > 0 ? step : 1;
  const current = clampRange(value, min, max);
  const pct = (next: number) => rangePercent(next, min, max);
  const snap = (next: number) => snapRange(next, min, max, increment);
  const rail = useRef<HTMLDivElement>(null), thumb = useRef<HTMLDivElement>(null), control = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>();
  const latest = useRef(current), goal = useRef(pct(current)), width = useRef(1), previousKey = useRef(resetKey);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const callbacks = useRef({ onValueStart, onValueChange, onValueCommit, onValueCancel });
  callbacks.current = { onValueStart, onValueChange, onValueCommit, onValueCancel };
  const [active, setActive] = useState(false), [tag, setTag] = useState(false);
  const position = useMotionValue(pct(current)), lag = useMotionValue(0), over = useMotionValue(0), press = useMotionValue(0);
  const shown = useTransform(() => position.get() + lag.get());
  const thumbX = useTransform(shown, at => `${at - 100}%`);
  const fill = useTransform(shown, at => `inset(0 ${100 - clampRange(at, 0, 100)}% 0 0 round 999px)`);
  const scaleX = useTransform(over, px => 1 + Math.abs(px) / width.current);
  const originX = useTransform(over, px => px < 0 ? 1 : 0);
  const scaleY = useTransform(() => (1 + press.get() * .45) * (1 - Math.abs(over.get()) / 26 * .32));
  const trailed = useSpring(shown, springs.tag), velocity = useVelocity(trailed);
  const tagAt = reduced ? shown : trailed;
  const tagX = useTransform(tagAt, at => `${at - 100}%`);
  const rotate = useTransform(velocity, speed => reduced ? 0 : clampRange(-speed / 100 * width.current * .009, -11, 11));

  const releaseCapture = (pointer: number) => {
    if (control.current?.hasPointerCapture(pointer)) control.current.releasePointerCapture(pointer);
  };
  const emit = (next: number) => {
    if (latest.current === next) return;
    latest.current = next;
    callbacks.current.onValueChange(next);
  };
  const cancel = () => {
    const state = drag.current;
    if (!state) return;
    drag.current = undefined;
    latest.current = state.initial; goal.current = pct(state.initial);
    lag.jump(0); position.jump(goal.current); over.jump(0); press.jump(0);
    setActive(false); setTag(false);
    releaseCapture(state.pointer);
    if (callbacks.current.onValueCancel) callbacks.current.onValueCancel(state.initial);
    else callbacks.current.onValueChange(state.initial);
  };
  const action = useRef({ cancel }); action.current = { cancel };
  useLayoutEffect(() => {
    if (blocked || previousKey.current !== resetKey) cancel();
    previousKey.current = resetKey;
    latest.current = current;
    const target = pct(current);
    if (drag.current || goal.current === target) return;
    goal.current = target;
    const from = shown.get(); lag.jump(0); position.jump(from);
    if (reduced) position.jump(target); else animate(position, target, springs.thumb);
  });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { if (entry) width.current = entry.contentRect.width || 1; });
    if (rail.current) observer.observe(rail.current);
    const blur = () => action.current.cancel();
    window.addEventListener('blur', blur);
    return () => {
      observer.disconnect(); window.removeEventListener('blur', blur); clearTimeout(timer.current);
      // An owner can outlive a popover and must not retain its unfinished draft.
      if (drag.current) action.current.cancel();
    };
  }, []);

  const follow = (state: Drag, clientX: number, time: number, first = false) => {
    const rect = rail.current!.getBoundingClientRect();
    const raw = (clientX - rect.left) / (rect.width || 1) * 100 - state.grab;
    const edge = clampRange(raw, 0, 100);
    width.current = rail.current!.clientWidth || 1;
    over.set(reduced ? 0 : rangeRubber((raw - edge) / 100 * width.current));
    const detent = rangeDetent(edge, marks, min, max, width.current);
    const placed = detent === undefined ? edge : pct(detent);
    if (first || state.detent !== detent) {
      const tick = detent === undefined ? null : rail.current!.querySelector<HTMLElement>(`[data-mark="${detent}"]`);
      if (tick && !first && !reduced) animate(tick, { scale: [1, 2.1, 1] }, { duration: .34, ease: springs.enter });
      const from = shown.get(); position.set(placed);
      lag.jump(reduced ? 0 : from - placed);
      if (!reduced) animate(lag, 0, springs.thumb);
    } else position.set(placed);
    state.edge = edge; state.detent = detent;
    state.samples.push({ time, position: placed });
    if (state.samples.length > 6) state.samples.shift();
    emit(detent ?? snap(min + edge / 100 * (max - min)));
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (blocked || event.button !== 0 || !event.isPrimary || drag.current) return;
    event.preventDefault(); event.stopPropagation();
    // Finish the number field's blur/revision before starting the next draft.
    flushSync(() => thumb.current?.focus({ preventScroll: true }));
    const rect = rail.current!.getBoundingClientRect();
    // A spring's motion value can be one frame ahead of its painted transform.
    // Re-grab the visible thumb, so interrupting a rebound never shifts the grab.
    const painted = thumb.current!.getBoundingClientRect();
    const from = (painted.left + painted.width / 2 - rect.left) / (rect.width || 1) * 100;
    const at = (event.clientX - rect.left) / (rect.width || 1) * 100;
    lag.jump(0); position.jump(from);
    const state: Drag = { pointer: event.pointerId, initial: latest.current, grab: (event.target as HTMLElement).closest('[data-thumb]') ? at - from : 0, edge: from, samples: [] };
    drag.current = state;
    event.currentTarget.setPointerCapture(event.pointerId);
    callbacks.current.onValueStart?.();
    clearTimeout(timer.current); setActive(true); setTag(true);
    if (reduced) press.jump(1); else animate(press, 1, springs.press);
    follow(state, event.clientX, event.timeStamp, true);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    if (blocked || event.type !== 'pointerup') { cancel(); return; }
    const first = state.samples[0], last = state.samples[state.samples.length - 1];
    const elapsed = last && first ? (last.time - first.time) / 1000 : 0;
    const speed = (elapsed > .008 && event.timeStamp - last.time < 60 ? (last.position - first.position) / elapsed : 0) + lag.getVelocity();
    const next = state.detent ?? snap(min + state.edge / 100 * (max - min));
    drag.current = undefined;
    const from = shown.get(); lag.jump(0); position.jump(from); goal.current = pct(next);
    if (reduced) { position.jump(goal.current); over.jump(0); press.jump(0); }
    else {
      animate(position, goal.current, { ...springs.thumb, velocity: speed });
      animate(over, 0, { ...springs.release, velocity: over.getVelocity() });
      animate(press, 0, springs.press);
    }
    emit(next); setActive(false);
    timer.current = setTimeout(() => setTag(false), 700);
    releaseCapture(state.pointer);
    callbacks.current.onValueCommit?.(next);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase()) && drag.current) cancel();
    onKeyDown?.(event);
    if (event.defaultPrevented || blocked || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') {
      if (drag.current) { event.preventDefault(); event.stopPropagation(); cancel(); }
      return;
    }
    const large = Math.max(increment, (max - min) / 10);
    const moves: Record<string, number> = { ArrowRight: increment, ArrowUp: increment, ArrowLeft: -increment, ArrowDown: -increment, PageUp: large, PageDown: -large };
    if (!(event.key in moves) && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (drag.current) cancel();
    const wanted = event.key === 'Home' ? min : event.key === 'End' ? max : latest.current + (event.shiftKey && event.key.startsWith('Arrow') ? Math.sign(moves[event.key]) * large : moves[event.key]);
    const next = snap(wanted);
    goal.current = pct(next); lag.jump(0); position.jump(goal.current);
    if (next !== latest.current) { emit(next); callbacks.current.onValueCommit?.(next); }
  };
  const decimals = rangeDecimals(increment, min);
  const text = format ? format(current) : current.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <div className={`node-range-input nodrag nopan nowheel ${className}`} style={style} data-disabled={blocked || undefined} data-dragging={active || undefined} data-tag={tag || undefined}>
    <div ref={control} className="node-range-control" onPointerDown={begin}
      onPointerMove={event => { if (drag.current?.pointer === event.pointerId) follow(drag.current, event.clientX, event.timeStamp); }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      <div ref={rail} className="node-range-rail">
        <motion.div className="node-range-track" style={{ scaleX, scaleY, originX }}><motion.div className="node-range-fill" style={{ clipPath: fill }} /></motion.div>
        {marks.filter(mark => mark > min && mark < max).map(mark => <span key={mark} data-mark={mark} className="node-range-tick" style={{ left: `${pct(mark)}%` }} />)}
      </div>
      <div className="node-range-layers">
        <motion.div className="node-range-layer" style={{ x: tagX }}><motion.span className="node-range-tag-anchor" style={{ x: over, '--at': tagAt } as MotionStyle}>
          <AnimatePresence>{tag && <motion.span className="node-range-tag" aria-hidden="true" style={{ rotate }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .7, y: 6, filter: 'blur(2px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: .85, y: 4, filter: 'blur(2px)', transition: { duration: .12, ease: springs.exit } }}
            transition={reduced ? { duration: .15 } : { ...springs.press, opacity: { duration: .16, ease: springs.enter }, filter: { duration: .16, ease: springs.enter } }}>{text}</motion.span>}</AnimatePresence>
        </motion.span></motion.div>
        <motion.div className="node-range-layer" style={{ x: thumbX }}><motion.div className="node-range-layer" style={{ x: over }}>
          <motion.div ref={thumb} id={id} role="slider" data-thumb="" className="node-range-thumb" tabIndex={blocked ? -1 : 0}
            aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={current} aria-valuetext={text} aria-orientation="horizontal" aria-disabled={blocked || undefined}
            initial={false} animate={{ scale: active && !reduced ? 1.28 : 1 }} transition={reduced ? { duration: 0 } : springs.press}
            onKeyDown={keyboard} />
        </motion.div></motion.div>
      </div>
    </div>
  </div>;
}
