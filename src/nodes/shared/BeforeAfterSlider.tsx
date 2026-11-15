import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { animate, motion, useMotionValue, useReducedMotionConfig, useSpring, useTransform, useVelocity } from 'motion/react';
import './BeforeAfterSlider.css';

// Adapted from https://beui.dev/components/motion/before-after-slider.
// Keep beUI's curved cut and handle feedback; canvas drafts commit only on release.
const PRESS = { type: 'spring', stiffness: 500, damping: 30, mass: .6 } as const;
const GLIDE = { type: 'spring', stiffness: 700, damping: 50, mass: .5 } as const;
const BEND = { stiffness: 200, damping: 15, mass: .3 };
const clamp = (value: number) => Math.min(100, Math.max(0, value));
type Gesture = { pointer: number; initial: number; value: number; offset: number };
type Props = {
  before: ReactNode; after: ReactNode;
  value: number; disabled?: boolean; resetKey: string;
  onValueCommit: (value: number) => void;
};

export function BeforeAfterSlider({ before, after, value, disabled = false, resetKey, onValueCommit }: Props) {
  const reduce = useReducedMotionConfig() ?? false;
  const frame = useRef<HTMLDivElement>(null), handle = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>();
  const committed = useRef<number>();
  const [dragging, setDragging] = useState(false), [hovered, setHovered] = useState(false);
  const position = useMotionValue(clamp(value));
  const width = useMotionValue(0), height = useMotionValue(0);
  const velocity = useVelocity(position);
  const pull = useTransform(velocity, [-250, 0, 250], [-1, 0, 1]);
  const bend = useSpring(useTransform(pull, amount => reduce ? 0 : amount), BEND);
  const clipPath = useTransform(() => {
    const p = position.get(), w = width.get(), h = height.get();
    if (!w || !h) return `inset(0 ${100 - p}% 0 0)`;
    const middle = p / 100 * w, trail = reduce ? 0 : bend.get() * .12 * h;
    // At the endpoints show the whole image, even while the rope settles.
    if (p <= 0 || p >= 100) return `inset(0 ${100 - p}% 0 0)`;
    return `path("M0 0 L${middle - trail} 0 Q${middle + trail} ${h / 2} ${middle - trail} ${h} L0 ${h} Z")`;
  });
  const line = useTransform(() => {
    const p = position.get(), w = width.get(), h = height.get();
    const trail = w && p > 0 && p < 100 && !reduce ? bend.get() * .12 * h / w * 100 : 0;
    return `M${p - trail} 0 Q${p + trail} 50 ${p - trail} 100`;
  });
  const x = useTransform(position, p => `${p}%`);
  const beforeOpacity = useTransform(position, [8, 22], [0, 1]);
  const afterOpacity = useTransform(position, [78, 92], [1, 0]);
  const release = (pointer: number) => {
    if (frame.current?.hasPointerCapture(pointer)) frame.current.releasePointerCapture(pointer);
  };
  const cancel = (restore = gesture.current?.initial ?? clamp(value)) => {
    const active = gesture.current;
    gesture.current = undefined;
    position.jump(restore); bend.jump(0);
    handle.current?.setAttribute('aria-valuenow', String(Math.round(restore)));
    handle.current?.setAttribute('aria-valuetext', `${Math.round(restore)}% Image 1`);
    setDragging(false); setHovered(false);
    if (active) release(active.pointer);
  };
  const actions = useRef({ cancel }); actions.current = { cancel };
  const previous = useRef({ value, resetKey, disabled });
  useLayoutEffect(() => {
    const old = previous.current;
    const accepted = committed.current !== undefined && Math.abs(committed.current - value) < .000001;
    if (old.resetKey !== resetKey || old.disabled !== disabled || (old.value !== value && !accepted)) {
      cancel(clamp(value));
    }
    if (old.value !== value || old.resetKey !== resetKey || old.disabled !== disabled) committed.current = undefined;
    if (reduce) { position.jump(gesture.current?.value ?? clamp(value)); bend.jump(0); }
    previous.current = { value, resetKey, disabled };
  });
  useLayoutEffect(() => {
    if (!frame.current) return;
    // clip-path uses local CSS pixels, not the zoomed screen rectangle.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) { width.set(entry.contentRect.width); height.set(entry.contentRect.height); }
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [width, height]);
  useEffect(() => {
    const blur = () => actions.current.cancel();
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('blur', blur); position.stop(); };
  }, [position]);
  const follow = (active: Gesture, clientX: number, smooth = false) => {
    const rect = frame.current!.getBoundingClientRect();
    if (!rect.width) return;
    active.value = Math.round(clamp((clientX - rect.left) / rect.width * 100 - active.offset) * 100) / 100;
    position.stop();
    if (smooth && !reduce) animate(position, active.value, GLIDE);
    else if (reduce) position.jump(active.value);
    else position.set(active.value);
    // Motion drives the preview without rendering the canvas on every move.
    handle.current?.setAttribute('aria-valuenow', String(Math.round(active.value)));
    handle.current?.setAttribute('aria-valuetext', `${Math.round(active.value)}% Image 1`);
  };
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0 || gesture.current) return;
    event.preventDefault(); event.stopPropagation();
    position.stop();
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const pointer = (event.clientX - rect.left) / rect.width * 100;
    const onHandle = Boolean((event.target as HTMLElement).closest('[role="slider"]'));
    const active = { pointer: event.pointerId, initial: clamp(value), value: position.get(), offset: onHandle ? pointer - position.get() : 0 };
    gesture.current = active;
    event.currentTarget.setPointerCapture(event.pointerId);
    handle.current?.focus({ preventScroll: true }); setDragging(true);
    if (!onHandle) follow(active, event.clientX, true);
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (event.type !== 'pointerup' || disabled) { cancel(); return; }
    gesture.current = undefined; setDragging(false); release(active.pointer);
    if (active.value !== value) { committed.current = active.value; onValueCommit(active.value); }
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && gesture.current) {
      event.preventDefault(); event.stopPropagation(); cancel(); return;
    }
    if (event.metaKey || event.ctrlKey) { if (gesture.current) cancel(); return; }
    if (disabled || event.altKey) return;
    const step = event.shiftKey ? 10 : 1;
    const next = ({ ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step,
      PageUp: value + 10, PageDown: value - 10, Home: 0, End: 100 } as Record<string, number>)[event.key];
    if (next === undefined) return;
    event.preventDefault(); event.stopPropagation();
    cancel(); position.jump(clamp(next));
    if (clamp(next) !== value) onValueCommit(clamp(next));
  };
  const split = reduce ? 0 : dragging ? 3 : hovered ? 1.5 : 0;
  return <div ref={frame} className={`before-after-slider compare-slider nodrag nopan${dragging ? ' is-dragging' : ''}`} data-disabled={disabled || undefined}
    onPointerDown={begin} onPointerMove={event => { if (gesture.current?.pointer === event.pointerId && !disabled) follow(gesture.current, event.clientX); }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={event => { if (event.target === event.currentTarget) finish(event); }}
    onDragStart={event => event.preventDefault()}>
    <div className="before-after-layer">{after}</div>
    <motion.div className="before-after-layer before-after-first" style={{ clipPath }}>{before}</motion.div>
    <div aria-hidden="true" className="before-after-labels">
      <motion.span className="before-after-label before-after-label-first" style={{ opacity: beforeOpacity }}>Image 1</motion.span>
      <motion.span className="before-after-label before-after-label-second" style={{ opacity: afterOpacity }}>Image 2</motion.span>
    </div>
    <svg aria-hidden="true" className="before-after-line" viewBox="0 0 100 100" preserveAspectRatio="none">
      {[false, true].map(front => <motion.path key={String(front)} d={line} fill="none" stroke={front ? 'white' : 'rgb(0 0 0 / .14)'}
        strokeLinecap="square" vectorEffect="non-scaling-stroke" initial={false}
        animate={{ strokeWidth: (front ? 2 : 4) + (dragging && !reduce ? .5 : 0) }} transition={PRESS} />)}
    </svg>
    <motion.div className="before-after-handle-track" style={{ x }}><div className="before-after-handle-anchor">
      <motion.div ref={handle} role="slider" className="before-after-handle compare-grip" tabIndex={disabled ? -1 : 0}
        aria-label="Comparison divider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(value)}% Image 1`}
        aria-orientation="horizontal" aria-disabled={disabled} onKeyDown={keyboard}
        onPointerEnter={event => { if (!disabled && event.pointerType !== 'touch' && matchMedia('(hover: hover) and (pointer: fine)').matches) setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        initial={false} animate={{ scale: reduce || disabled ? 1 : dragging ? 1.08 : hovered ? 1.04 : 1 }} transition={PRESS}>
        {[ChevronLeft, ChevronRight].map((Icon, index) => <motion.span key={index} aria-hidden="true" className="before-after-chevron"
          animate={{ x: index === 0 ? -split : split }} transition={PRESS}><Icon size={14} strokeWidth={2.5} /></motion.span>)}
      </motion.div>
    </div></motion.div>
  </div>;
}
