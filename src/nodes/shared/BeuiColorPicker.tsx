// Adapted from https://beui.dev/components/motion/color-picker (Saurabh / beUI).
// Original morph, loupe, channel controls and preset-hop motion; React Flow owns
// the fixed portal, gesture cancellation and history commits.

import { HugeiconsIcon } from '@hugeicons/react';
import { ColorPickerIcon } from '@hugeicons/core-free-icons';
import { createPortal } from 'react-dom';
import { useViewport } from '@xyflow/react';
import {
  AnimatePresence,
  arc,
  LayoutGroup,
  type MotionValue,
  motion,
  type Transition,
  useReducedMotionConfig as useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from 'motion/react';
import {
  Children,
  type ComponentPropsWithRef,
  createContext,
  isValidElement,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { EASE_OUT, SPRING_GLIDE, SPRING_LAYOUT, SPRING_PRESS } from './beuiColorPickerMotion';
import { BLACK, clamp, hsvaToRgba, rgbaToHsva, parseHex, formatHex, hsvToHsl, hslToHsv, type Hsva, type Rgba } from './beuiColorPickerMath';
import { useIsPresent } from 'motion/react';
import { capturePointer, releasePointer, TOUCH_GESTURE_CLASS } from './beuiColorPickerMotion';
import { cn } from '@/lib/utils';
import { useColorPickerMorph } from './useColorPickerMorph';

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

/** English defaults. Override per instance with `labels`, or app-wide with `LocaleProvider`. */
const colorPickerMessages = {
  dialog: 'Color picker',
  area: 'Saturation and brightness',
  areaRole: '2D slider',
  areaValue: 'Saturation {saturation}%, brightness {brightness}%',
  hue: 'Hue',
  hueValue: '{value} degrees',
  opacity: 'Opacity',
  opacityValue: '{value}%',
  hex: 'Hex color',
  saturation: 'Saturation',
  lightness: 'Lightness',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  opacityPercent: 'Opacity percent',
  eyeDropper: 'Pick a color from the screen',
};

type ColorPickerMessages = typeof colorPickerMessages;

type ColorPickerContextValue = {
  id: string;
  t: (key: keyof ColorPickerMessages, values?: Record<string, string | number>) => string;
  hsva: Hsva;
  rgba: Rgba;
  hex: string;
  alpha: boolean;
  disabled: boolean;
  update: (next: Hsva) => void;
  commit: () => void;
  begin: () => void;
  cancel: () => void;
  open: boolean;
  morphActive: boolean;
  setMorphActive: (active: boolean) => void;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement>;
};

const ColorPickerContext = createContext<ColorPickerContextValue | null>(null);
const PICKER_OPEN_EVENT = 'momoflow-color-picker-open';

function usePickerContext(component: string) {
  const context = useContext(ColorPickerContext);
  if (!context) throw new Error(`${component} must be used within ColorPicker`);
  return context;
}

/** Current color and a setter, for custom parts inside a ColorPicker. */
function useColorPicker() {
  const { hex, rgba, hsva, alpha, disabled, update, commit, begin, cancel, open } = usePickerContext('useColorPicker');
  return {
    hex,
    rgba,
    hsva,
    alpha,
    disabled, open, begin, cancel, commit,
    preview: (value: string) => {
      const parsed = parseHex(value);
      if (parsed) update(rgbaToHsva({ ...parsed, a: alpha ? parsed.a : 1 }, hsva));
    },
    /** Accepts any hex form. Invalid input is ignored. */
    setColor: (value: string) => {
      const parsed = parseHex(value);
      if (!parsed) return;
      update(rgbaToHsva(parsed, hsva));
      commit();
    },
  };
}

export interface ColorPickerProps
  extends Omit<ComponentPropsWithRef<'fieldset'>, 'onChange' | 'defaultValue'> {
  /** Controlled hex color (#rgb, #rrggbb or #rrggbbaa). */
  value?: string;
  defaultValue?: string;
  /** Fires on every change while dragging or typing, with a lowercase hex. */
  onValueChange?: (value: string) => void;
  /** Fires once an interaction settles: pointer release, key, preset or field commit. */
  onValueCommit?: (value: string) => void;
  onValueCancel?: (value: string) => void;
  /** Allow transparency. When false the value is always opaque. Default true. */
  alpha?: boolean;
  /** Submits the hex value with a form under this name. */
  name?: string;
  /** Controlled open state for ColorPickerTrigger + ColorPickerContent. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Override any built-in string. */
  labels?: Partial<ColorPickerMessages>;
}

/** Give it an aria-label, or a legend through children. */
export function ColorPicker({
  value,
  defaultValue = '#3478f6',
  onValueChange,
  onValueCommit,
  onValueCancel,
  alpha = true,
  disabled = false,
  name,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  form,
  labels,
  className,
  children,
  ...props
}: ColorPickerProps) {
  const t = (key: keyof ColorPickerMessages, values?: Record<string, string | number>) => {
    const text = labels?.[key] ?? colorPickerMessages[key];
    return text.replace(/\{(\w+)\}/g, (match, name: string) => String(values?.[name] ?? match));
  };
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [openInternal, setOpenInternal] = useState(defaultOpen);
  const [morphActive, setMorphActive] = useState(false);
  const open = !disabled && (openProp ?? openInternal);
  const setOpen = (next: boolean) => {
    if (next === open) return;
    if (next) document.dispatchEvent(new CustomEvent(PICKER_OPEN_EVENT, { detail: id }));
    if (openProp === undefined) setOpenInternal(next);
    onOpenChange?.(next);
  };
  const openChange = useRef(onOpenChange); openChange.current = onOpenChange;
  useEffect(() => {
    const switchPicker = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) return;
      const field = document.activeElement;
      if (field instanceof HTMLInputElement && document.getElementById(`${id}-content`)?.contains(field)) field.blur();
      // Listen even while closed: successive triggers can open in one React
      // batch, before a newly opened panel has installed its dismiss handler.
      setOpenInternal(false);
      openChange.current?.(false);
    };
    document.addEventListener(PICKER_OPEN_EVENT, switchPicker);
    return () => document.removeEventListener(PICKER_OPEN_EVENT, switchPicker);
  }, [id]);
  const controlled = value !== undefined;
  const incoming = controlled ? value : defaultValue;
  const [state, setState] = useState(() => ({
    source: incoming,
    hsva: rgbaToHsva(parseHex(incoming) ?? BLACK),
  }));

  // A controlled value the picker did not emit itself is re-read here, during
  // render, so the thumbs never paint a stale color for a frame.
  let hsva = state.hsva;
  if (controlled && value !== state.source) {
    const parsed = parseHex(value);
    hsva = parsed ? rgbaToHsva(parsed, state.hsva) : state.hsva;
    setState({ source: value, hsva });
  }
  if (!alpha && hsva.a !== 1) hsva = { ...hsva, a: 1 };

  const rgba = hsvaToRgba(hsva);
  const hex = formatHex(rgba);
  // Event handlers read the latest emitted hex, which may be ahead of render.
  const hexRef = useRef(hex);
  const start = useRef(hex);
  useLayoutEffect(() => { if (value && value.toLowerCase() !== hex.toLowerCase()) start.current = value; }, [value, hex]);
  useLayoutEffect(() => {
    hexRef.current = hex;
  }, [hex]);

  const update = (next: Hsva) => {
    const clean: Hsva = {
      h: clamp(next.h, 0, 360),
      s: clamp(next.s, 0, 100),
      v: clamp(next.v, 0, 100),
      a: alpha ? clamp(next.a, 0, 1) : 1,
    };
    const nextHex = formatHex(hsvaToRgba(clean));
    const changed = nextHex !== hexRef.current;
    hexRef.current = nextHex;
    setState({ source: nextHex, hsva: clean });
    if (changed) onValueChange?.(nextHex);
  };

  return (
    <ColorPickerContext.Provider
      value={{
        id,
        t,
        hsva,
        rgba,
        hex,
        alpha,
        disabled,
        update,
        commit: () => { onValueCommit?.(hexRef.current); },
        begin: () => { start.current = hexRef.current; },
        cancel: () => {
          const restore = start.current;
          update(rgbaToHsva(parseHex(restore) ?? BLACK, hsva));
          onValueCancel?.(restore);
        },
        open,
        morphActive, setMorphActive,
        setOpen,
        triggerRef,
      }}
    >
      <fieldset
        {...props}
        disabled={disabled}
        form={form}
        className={cn(
          'relative flex w-full min-w-0 max-w-72 flex-col gap-3 border-0 p-0',
          // Holding a trigger, the root is just the trigger's box, so the panel
          // anchors under it even inside a stretching flex or grid parent.
          'has-[>[data-color-picker-trigger]]:w-fit has-[>[data-color-picker-trigger]]:self-start',
          disabled && 'opacity-50',
          className,
        )}
      >
        {children}
        {name && <input type="hidden" name={name} value={hex} form={form} />}
      </fieldset>
    </ColorPickerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Pointer + spring plumbing shared by the area and the sliders
// ---------------------------------------------------------------------------

function useGlide(target: number) {
  const reduce = useReducedMotion();
  const spring = useSpring(target, SPRING_GLIDE);
  useEffect(() => {
    if (reduce) spring.jump(target);
    else spring.set(target);
  }, [reduce, spring, target]);
  return { spring, offset: useTransform(spring, (n) => `${n}%`) };
}

function useDrag(
  onPoint: (x: number, y: number) => void,
  onEnd: () => void,
  disabled: boolean,
) {
  const { begin, cancel, open } = usePickerContext('ColorPicker drag');
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; element: HTMLDivElement }>();
  const [dragging, setDragging] = useState(false);
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    onPoint(clamp((event.clientX - rect.left) / rect.width, 0, 1), clamp((event.clientY - rect.top) / rect.height, 0, 1));
  };
  const finish = (canceled: boolean) => {
    const gesture = active.current;
    if (!gesture) return;
    active.current = undefined;
    setDragging(false);
    if (canceled) cancel(); else onEnd();
    releasePointer(gesture.element, gesture.id);
  };
  const latest = useRef(finish); latest.current = finish;
  useEffect(() => {
    const abort = () => latest.current(true);
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z')) abort();
    };
    window.addEventListener('blur', abort);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('blur', abort); window.removeEventListener('keydown', key, true); abort(); };
  }, []);
  useEffect(() => { if (disabled || !open) latest.current(true); }, [disabled, open]);
  return {
    railRef, thumbRef, dragging,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (disabled || event.button !== 0 || active.current) return;
        event.preventDefault();
        begin();
        active.current = { id: event.pointerId, element: event.currentTarget };
        setDragging(true);
        capturePointer(event.currentTarget, event.pointerId);
        thumbRef.current?.focus({ preventScroll: true });
        point(event);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => { if (active.current?.id === event.pointerId) point(event); },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => { if (active.current?.id === event.pointerId) { point(event); finish(false); } },
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => { if (active.current?.id === event.pointerId) finish(true); },
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => { if (active.current?.id === event.pointerId) finish(true); },
    },
  };
}

/** Arrow, Page and Home/End stepping. Returns the delta, or null when unhandled. */
function keyStep(event: KeyboardEvent, big: number): { axis: 'x' | 'y'; delta: number } | 'min' | 'max' | null {
  const step = event.shiftKey ? big : 1;
  switch (event.key) {
    case 'ArrowRight':
      return { axis: 'x', delta: step };
    case 'ArrowLeft':
      return { axis: 'x', delta: -step };
    case 'ArrowUp':
      return { axis: 'y', delta: step };
    case 'ArrowDown':
      return { axis: 'y', delta: -step };
    case 'PageUp':
      return { axis: 'y', delta: big };
    case 'PageDown':
      return { axis: 'y', delta: -big };
    case 'Home':
      return 'min';
    case 'End':
      return 'max';
    default:
      return null;
  }
}

const CHECKERBOARD =
  'repeating-conic-gradient(#d4d4d8 0% 25%, #fafafa 0% 50%) 0 0 / 8px 8px';

// The loupe lifts with a visible overshoot so it reads as picked up, unlike
// the critically damped glide the thumb itself rides on.
const LOUPE_LIFT: Transition = { type: 'spring', stiffness: 520, damping: 24, mass: 0.6 };
const LOUPE_DROP: Transition = { duration: 0.12, ease: EASE_OUT };
// Glide velocity in %/s mapped to a pendulum swing, so the loupe trails the drag.
const LOUPE_TILT_INPUT = [-400, 400];
const LOUPE_TILT_DEGREES = [16, -16];

function Thumb({
  thumbRef,
  dragging,
  color,
  glide,
  x,
  y,
  className,
  ...props
}: ComponentPropsWithRef<'div'> & {
  thumbRef: RefObject<HTMLDivElement>;
  dragging: boolean;
  color: string;
  /** Horizontal glide spring, read for the loupe's tilt. */
  glide: MotionValue<number>;
  x: MotionValue<string>;
  y?: MotionValue<string>;
}) {
  const reduce = useReducedMotion();
  const velocity = useVelocity(glide);
  const tilt = useSpring(
    useTransform(velocity, LOUPE_TILT_INPUT, LOUPE_TILT_DEGREES, { clamp: true }),
    SPRING_PRESS,
  );
  const lifted = dragging && !reduce;
  return (
    <motion.div className="pointer-events-none absolute inset-0" style={{ x, y }}>
      <div
        {...props}
        ref={thumbRef}
        className={cn(
          'absolute left-0 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full outline-none',
          y ? 'top-0' : 'top-1/2',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
          className,
        )}
      >
        <motion.span
          aria-hidden="true"
          animate={{ scale: lifted ? 0.78 : 1 }}
          transition={SPRING_PRESS}
          className="block size-full rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgb(0_0_0/0.12),0_2px_6px_rgb(0_0_0/0.25)]"
          style={{ backgroundColor: color }}
        />
        <AnimatePresence>
          {lifted && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[calc(100%+12px)] left-1/2 z-10 -ml-5 block size-10"
              style={{ rotate: tilt, originX: 0.5, originY: 1.3 }}
              initial={{ opacity: 0, scale: 0.3, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: LOUPE_LIFT }}
              exit={{ opacity: 0, scale: 0.3, y: 16, transition: LOUPE_DROP }}
            >
              {/* A square with one sharp corner, turned so the point aims at the thumb. */}
              <span
                className="absolute inset-0 -rotate-45 overflow-hidden rounded-[50%_50%_50%_0] border-[3px] border-white shadow-[0_0_0_1px_rgb(0_0_0/0.1),0_6px_16px_rgb(0_0_0/0.28)]"
                style={{ background: CHECKERBOARD }}
              >
                <span className="absolute inset-0" style={{ background: color }} />
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Saturation / brightness area
// ---------------------------------------------------------------------------

export interface ColorPickerAreaProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Accessible name for the 2D thumb. Default "Saturation and brightness". */
  label?: string;
}

// One surface: the trigger chip grows into the area and shrinks back into it.
const CHIP_RADIUS = 6;

/** True inside ColorPickerContent, where the area morphs out of the trigger chip. */
const MorphContext = createContext(false);

export function ColorPickerArea({ label, className, style, ...props }: ColorPickerAreaProps) {
  const { t, hsva, rgba, hex, disabled, update, commit, triggerRef, setMorphActive } = usePickerContext('ColorPickerArea');
  const morph = useContext(MorphContext);
  const reduce = useReducedMotion();
  const { railRef, thumbRef, dragging, handlers } = useDrag(
    (x, y) => update({ ...hsva, s: x * 100, v: (1 - y) * 100 }),
    commit,
    disabled,
  );
  const x = useGlide(hsva.s);
  const y = useGlide(100 - hsva.v);
  const s = Math.round(hsva.s);
  const v = Math.round(hsva.v);
  const morphing = morph && !reduce;
  const animation = useColorPickerMorph({ enabled: morph, area: railRef, trigger: triggerRef, onActiveChange: setMorphActive });
  const rgb = `rgb(${rgba.r} ${rgba.g} ${rgba.b})`;

  return (
    <motion.div
      {...(props as React.ComponentProps<typeof motion.div>)}
      {...handlers}
      ref={railRef}
      data-color-picker-area=""
      data-color-picker-returning={!animation.present || undefined}
      className={cn(
        'relative h-40 w-full touch-none',
        TOUCH_GESTURE_CLASS,
        disabled ? 'cursor-not-allowed' : 'cursor-crosshair',
        className,
      )}
      style={{
        ...style,
        ...animation.style,
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsva.h} 100% 50%))`,
      }}
    >
      {/* Arriving from the chip, the solid color dissolves to reveal the spectrum behind it. */}
      {morphing && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ backgroundColor: hex }}
          initial={{ opacity: 1 }}
          animate={{ opacity: animation.present ? 0 : 1 }}
          transition={{ duration: animation.present ? .4 : .1, ease: EASE_OUT, delay: animation.present ? .06 : 0 }}
        />
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/10 ring-inset" />
      <motion.div
        className="absolute inset-0"
        initial={morphing ? { opacity: 0 } : false}
        animate={{ opacity: animation.present ? 1 : 0 }}
        transition={{ duration: .2, delay: animation.present ? .22 : 0 }}
      >
        <Thumb
          thumbRef={thumbRef}
          dragging={dragging}
          color={rgb}
          glide={x.spring}
          x={x.offset}
          y={y.offset}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label ?? t('area')}
          aria-roledescription={t('areaRole')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s}
          aria-valuetext={t('areaValue', { saturation: s, brightness: v })}
          aria-disabled={disabled || undefined}
          onKeyDown={(event) => {
            if (disabled) return;
            const step = keyStep(event, 10);
            if (!step) return;
            event.preventDefault();
            if (step === 'min') update({ ...hsva, s: 0 });
            else if (step === 'max') update({ ...hsva, s: 100 });
            else if (step.axis === 'x') update({ ...hsva, s: hsva.s + step.delta });
            else update({ ...hsva, v: hsva.v + step.delta });
            commit();
          }}
        />
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Hue and alpha sliders
// ---------------------------------------------------------------------------

function ChannelSlider({
  value,
  max,
  onValue,
  label,
  valueText,
  background,
  thumbColor,
  className,
  ...props
}: Omit<ComponentPropsWithRef<'div'>, 'children'> & {
  value: number;
  max: number;
  onValue: (next: number) => void;
  label: string;
  valueText: string;
  background: string;
  thumbColor: string;
}) {
  const { disabled, commit } = usePickerContext('ColorPicker slider');
  const { railRef, thumbRef, dragging, handlers } = useDrag((x) => onValue(x * max), commit, disabled);
  const x = useGlide((value / max) * 100);

  return (
    <div
      {...props}
      {...handlers}
      className={cn(
        'relative h-3.5 w-full touch-none rounded-full',
        TOUCH_GESTURE_CLASS,
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
      style={{ background }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10 ring-inset" />
      {/* The rail is inset by half a thumb so the thumb never leaves the rounded track. */}
      <div ref={railRef} className="absolute inset-y-0 right-[9px] left-[9px]">
        <Thumb
          thumbRef={thumbRef}
          dragging={dragging}
          color={thumbColor}
          glide={x.spring}
          x={x.offset}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.round(value)}
          aria-valuetext={valueText}
          aria-disabled={disabled || undefined}
          onKeyDown={(event) => {
            if (disabled) return;
            const step = keyStep(event, 10);
            if (!step) return;
            event.preventDefault();
            if (step === 'min') onValue(0);
            else if (step === 'max') onValue(max);
            else onValue(Math.round(value) + step.delta);
            commit();
          }}
        />
      </div>
    </div>
  );
}

export interface ColorPickerHueProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  label?: string;
}

export function ColorPickerHue({ label, ...props }: ColorPickerHueProps) {
  const { t, hsva, update } = usePickerContext('ColorPickerHue');
  const h = Math.round(hsva.h);
  return (
    <ChannelSlider
      {...props}
      value={hsva.h}
      max={360}
      onValue={(next) => update({ ...hsva, h: next })}
      label={label ?? t('hue')}
      valueText={t('hueValue', { value: h })}
      background="linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
      thumbColor={`hsl(${hsva.h} 100% 50%)`}
    />
  );
}

export interface ColorPickerAlphaProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  label?: string;
}

/** Renders nothing when the picker has `alpha={false}`. */
export function ColorPickerAlpha({ label, ...props }: ColorPickerAlphaProps) {
  const { t, hsva, rgba, alpha, update } = usePickerContext('ColorPickerAlpha');
  if (!alpha) return null;
  const rgb = `${rgba.r} ${rgba.g} ${rgba.b}`;
  const percent = Math.round(hsva.a * 100);
  return (
    <ChannelSlider
      {...props}
      value={hsva.a * 100}
      max={100}
      onValue={(next) => update({ ...hsva, a: Math.round(next) / 100 })}
      label={label ?? t('opacity')}
      valueText={t('opacityValue', { value: percent })}
      background={`linear-gradient(to right, rgb(${rgb} / 0), rgb(${rgb})), ${CHECKERBOARD}`}
      thumbColor={`rgb(${rgb} / ${hsva.a})`}
    />
  );
}

// ---------------------------------------------------------------------------
// Swatch
// ---------------------------------------------------------------------------

export type ColorPickerSwatchProps = Omit<ComponentPropsWithRef<'span'>, 'children'>;

/** The current color over a transparency checkerboard. Decorative. */
export function ColorPickerSwatch({ className, style, ...props }: ColorPickerSwatchProps) {
  const { hex } = usePickerContext('ColorPickerSwatch');
  return (
    <span
      {...props}
      aria-hidden="true"
      className={cn('relative block size-9 shrink-0 overflow-hidden rounded-lg', className)}
      style={{ ...style, background: CHECKERBOARD }}
    >
      <span
        className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] transition-colors duration-150"
        style={{ backgroundColor: hex }}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Text fields
// ---------------------------------------------------------------------------

const FIELD_CLASS =
  'h-9 w-full min-w-0 rounded-lg border border-border bg-background text-sm text-foreground tabular-nums outline-none transition-colors focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed';

/** A horizontal shake for rejected input; dropped under reduced motion. */
type ChannelSpec = { key: string; short: string; name: string; max: number; value: number; set: (n: number) => Hsva };

function ChannelField({ spec }: { spec: ChannelSpec }) {
  const { update, commit, disabled, open, begin } = usePickerContext('ColorPickerChannels');
  const [draft, setDraft] = useState<string | null>(null);
  const shown = Math.round(spec.value);

  return (
    <label className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-label={spec.name}
        value={draft ?? String(shown)}
        onFocus={begin}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d]/g, '').slice(0, 3);
          setDraft(next);
          if (next !== '') update(spec.set(clamp(Number(next), 0, spec.max)));
        }}
        onBlur={(event) => {
          if (open && draft !== null && !event.currentTarget.closest('[data-canceling]')) commit();
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          const delta = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
          if (delta) {
            event.preventDefault();
            setDraft(null);
            update(spec.set(clamp(shown + delta * (event.shiftKey ? 10 : 1), 0, spec.max)));
            commit();
          } else if (event.key === 'Enter') {
            setDraft(null);
            commit();
          }
        }}
        className={cn(FIELD_CLASS, 'px-1 text-center')}
      />
      <span aria-hidden="true" className="text-[11px] font-medium text-muted-foreground">
        {spec.short}
      </span>
    </label>
  );
}

export interface ColorPickerChannelsProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Which channels to edit. Default "rgb". */
  format?: 'rgb' | 'hsl';
}

/** Numeric RGB or HSL fields, plus an opacity field when alpha is enabled. Arrow keys nudge. */
export function ColorPickerChannels({ format = 'rgb', className, ...props }: ColorPickerChannelsProps) {
  const { t, hsva, rgba, alpha } = usePickerContext('ColorPickerChannels');
  const fromRgb = (patch: Partial<Rgba>) => rgbaToHsva({ ...rgba, ...patch }, hsva);
  let specs: ChannelSpec[];
  if (format === 'hsl') {
    const hsl = hsvToHsl(hsva);
    specs = [
      { key: 'h', short: 'H', name: t('hue'), max: 360, value: hsl.h, set: (n) => hslToHsv(n, hsl.s, hsl.l, hsva, hsva.a) },
      { key: 's', short: 'S', name: t('saturation'), max: 100, value: hsl.s, set: (n) => hslToHsv(hsl.h, n, hsl.l, hsva, hsva.a) },
      { key: 'l', short: 'L', name: t('lightness'), max: 100, value: hsl.l, set: (n) => hslToHsv(hsl.h, hsl.s, n, hsva, hsva.a) },
    ];
  } else {
    specs = [
      { key: 'r', short: 'R', name: t('red'), max: 255, value: rgba.r, set: (n) => fromRgb({ r: n }) },
      { key: 'g', short: 'G', name: t('green'), max: 255, value: rgba.g, set: (n) => fromRgb({ g: n }) },
      { key: 'b', short: 'B', name: t('blue'), max: 255, value: rgba.b, set: (n) => fromRgb({ b: n }) },
    ];
  }
  if (alpha) {
    specs.push({ key: 'a', short: 'A', name: t('opacityPercent'), max: 100, value: hsva.a * 100, set: (n) => ({ ...hsva, a: n / 100 }) });
  }
  return (
    <div {...props} className={cn('flex min-w-0 flex-1 gap-1.5', className)}>
      {specs.map((spec) => (
        <ChannelField key={`${format}-${spec.key}`} spec={spec} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eye dropper
// ---------------------------------------------------------------------------

type EyeDropperConstructor = new () => { open: (options?: { signal: AbortSignal }) => Promise<{ sRGBHex: string }> };

export interface ColorPickerEyeDropperProps extends Omit<ComponentPropsWithRef<'button'>, 'type'> {
  children?: ReactNode;
}

/** Samples a color from the screen. Renders nothing where the EyeDropper API is missing. */
export function ColorPickerEyeDropper({
  className,
  children,
  onClick,
  'aria-label': ariaLabel,
  ...props
}: ColorPickerEyeDropperProps) {
  const { t, hsva, update, commit, disabled, open } = usePickerContext('ColorPickerEyeDropper');
  const reduce = useReducedMotion();
  const request = useRef<AbortController>();
  const enabled = useRef(false); enabled.current = open && !disabled;
  useEffect(() => {
    if (!open || disabled) request.current?.abort();
    return () => request.current?.abort();
  }, [open, disabled]);
  const [EyeDropper, setEyeDropper] = useState<EyeDropperConstructor | null>(null);
  useEffect(() => {
    const ctor = (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
    if (ctor) setEyeDropper(() => ctor);
  }, []);
  if (!EyeDropper) return null;

  return (
    <motion.button
      {...(props as React.ComponentProps<typeof motion.button>)}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel ?? t('eyeDropper')}
      whileTap={reduce || disabled ? undefined : { scale: 0.92 }}
      transition={SPRING_PRESS}
      onClick={async (event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        try {
          request.current?.abort();
          const controller = new AbortController(); request.current = controller;
          const { sRGBHex } = await new EyeDropper().open({ signal: controller.signal });
          if (!enabled.current || controller.signal.aborted) return;
          const parsed = parseHex(sRGBHex);
          if (!parsed) return;
          update(rgbaToHsva({ ...parsed, a: hsva.a }, hsva));
          commit();
        } catch {
          // Dismissed with Escape.
        }
      }}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
        className,
      )}
    >
      {children ?? <HugeiconsIcon icon={ColorPickerIcon} size={16} aria-hidden="true" />}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

// The selection ring hops between swatches over a low arc instead of sliding.
// arc() bends with distance (the apex sits at half of strength x distance), so
// a neighbour gets a ~5px hop and a jump across the row clears the fields above.
// Automatic direction always puts a horizontal bulge below the row; a negative
// strength mirrors it above, in both directions of travel.
const PRESET_HOP: Transition = {
  ...SPRING_LAYOUT,
  layout: { ...SPRING_LAYOUT, path: arc({ strength: -0.3 }) },
};

export type ColorPickerPresetsProps = ComponentPropsWithRef<'div'>;

export function ColorPickerPresets({ className, children, ...props }: ColorPickerPresetsProps) {
  const { id } = usePickerContext('ColorPickerPresets');
  return (
    <div {...props} className={cn('flex flex-wrap gap-2', className)}>
      <LayoutGroup id={`${id}-presets`}>{children}</LayoutGroup>
    </div>
  );
}

export interface ColorPickerPresetProps
  extends Omit<ComponentPropsWithRef<'button'>, 'value' | 'children' | 'type'> {
  /** Hex color this preset applies. */
  value: string;
  /** Accessible color name. Defaults to the hex. */
  label?: string;
}

export function ColorPickerPreset({ value, label, className, onClick, ...props }: ColorPickerPresetProps) {
  const { hsva, hex, update, commit, disabled } = usePickerContext('ColorPickerPreset');
  const reduce = useReducedMotion();
  const parsed = parseHex(value);
  const normalized = parsed ? formatHex(parsed) : value;
  const selected = normalized.slice(0, 7) === hex.slice(0, 7);

  return (
    <motion.button
      {...(props as React.ComponentProps<typeof motion.button>)}
      type="button"
      disabled={disabled}
      aria-label={label ?? normalized}
      aria-pressed={selected}
      whileTap={reduce || disabled ? undefined : { scale: 0.88 }}
      transition={SPRING_PRESS}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !parsed) return;
        update(rgbaToHsva({ ...parsed, a: hsva.a }, hsva));
        commit();
      }}
      className={cn(
        'relative size-6 shrink-0 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-foreground disabled:cursor-not-allowed',
        className,
      )}
    >
      {selected && (
        <motion.span
          aria-hidden="true"
          layoutId={reduce ? undefined : 'color-picker-preset'}
          initial={false}
          transition={PRESET_HOP}
          className="pointer-events-none absolute -inset-[3px] rounded-full border-2 border-foreground/70"
        />
      )}
      <span
        aria-hidden="true"
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{ background: CHECKERBOARD }}
      >
        <span
          className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
          style={{ backgroundColor: normalized }}
        />
      </span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Popover: trigger chip morphs into the area
// ---------------------------------------------------------------------------

export interface ColorPickerTriggerProps extends Omit<ComponentPropsWithRef<'button'>, 'type'> {
  /** Replaces the hex label beside the chip. */
  children?: ReactNode;
}

/** The node swatch stays static; the portal owns both directions of the morph. */
export function ColorPickerTrigger({ className, children, onClick, ...props }: ColorPickerTriggerProps) {
  const { id, hex, open, morphActive, setOpen, triggerRef, disabled } = usePickerContext('ColorPickerTrigger');
  return (
    <button
      {...props}
      ref={triggerRef}
      type="button"
      data-color-picker-trigger=""
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? `${id}-content` : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(!open);
      }}
      className={cn(
        'inline-flex h-10 w-fit items-center gap-2.5 rounded-xl border border-border bg-background pr-3.5 pl-2.5 text-sm text-foreground outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
        className,
      )}
    >
      <span aria-hidden="true" className="beui-picker-trigger-chip relative size-6 shrink-0">
        {/* The chip's empty socket while it is out being the area. */}
        <span className="absolute inset-0 rounded-md border border-dashed border-foreground/20" />
        <span
          data-color-picker-chip=""
          className="absolute inset-0 overflow-hidden"
          style={{ borderRadius: CHIP_RADIUS, background: CHECKERBOARD, visibility: open || morphActive ? 'hidden' : 'visible' }}
        >
          <span
            className="absolute inset-0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
            style={{ backgroundColor: hex, borderRadius: CHIP_RADIUS }}
          />
        </span>
      </span>
      {children}
    </button>
  );
}

export interface ColorPickerContentProps extends Omit<ComponentPropsWithRef<'div'>, 'role'> {
  /** Edge of the trigger the panel lines up with. Default "start". */
  align?: 'start' | 'end';
}

/** Minimum gap between the panel and the viewport edge, in px. */
const VIEWPORT_GUTTER = 8;

// Each layer owns its enter and exit values instead of inheriting them from
// the panel. Reopening during the close cancels the exit per element, and an
// element only returns to its enter state if that state is its own.
const PANEL_DELAY = 0.1;
const PANEL_STAGGER = 0.035;

const PANEL_ITEM = {
  initial: { opacity: 0, y: -6, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
};

const PANEL_ITEM_REDUCED = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

const PANEL_ITEM_EXIT = { opacity: 0, transition: { duration: 0.1 } };

/**
 * Panel opened by ColorPickerTrigger, laid out under it. A ColorPickerArea
 * placed directly inside grows out of the trigger chip; the other children
 * stagger in behind it. Closes on outside press and Escape.
 */
export function ColorPickerValue({ children }: { children: (value: ReturnType<typeof useColorPicker>) => ReactNode }) {
  return <>{children(useColorPicker())}</>;
}

export function ColorPickerContent({ align = 'start', className, children, ...props }: ColorPickerContentProps) {
  const { id, t, open, setOpen, triggerRef } = usePickerContext('ColorPickerContent');
  const reduce = useReducedMotion() ?? false;
  const panelRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport();
  useLayoutEffect(() => {
    if (!open || !panelRef.current || !triggerRef.current) return;
    const place = () => {
      const panel = panelRef.current, trigger = triggerRef.current;
      if (!panel || !trigger) return;
      const anchor = trigger.getBoundingClientRect();
      const width = panel.offsetWidth, height = panel.offsetHeight;
      const left = align === 'end' ? anchor.right - width : anchor.left;
      const below = anchor.bottom + 8;
      const top = below + height <= window.innerHeight - VIEWPORT_GUTTER || anchor.top < height + 16 ? below : anchor.top - height - 8;
      panel.style.left = `${clamp(left, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER))}px`;
      panel.style.top = `${clamp(top, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, window.innerHeight - height - VIEWPORT_GUTTER))}px`;
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(panelRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, align, viewport.x, viewport.y, viewport.zoom, triggerRef]);
  const actions = useRef({ setOpen }); actions.current = { setOpen };
  useEffect(() => {
    if (!open) return;
    if (panelRef.current) delete panelRef.current.dataset.canceling;
    panelRef.current?.focus({ preventScroll: true });
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      // Flush a field before unmounting; pointerdown precedes the normal blur.
      const field = document.activeElement;
      if (field instanceof HTMLInputElement && panelRef.current?.contains(field)) field.blur();
      actions.current.setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, triggerRef]);
  return createPortal(<AnimatePresence>{open && <PickerPresence>
    {({ present }) => <motion.div
      {...(props as React.ComponentProps<typeof motion.div>)}
      data-color-picker-panel=""
      ref={panelRef} id={`${id}-content`} role={present ? 'dialog' : undefined}
      aria-label={props['aria-label'] ?? t('dialog')} aria-hidden={!present || undefined}
      {...(!present ? { inert: '' } : {})} tabIndex={-1} layoutRoot
      className={cn('beui-color-picker nodrag nopan nowheel', present && className)}
      style={{ ...props.style, pointerEvents: present ? 'auto' : 'none' }}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    >
      <motion.div aria-hidden="true" className="beui-picker-surface"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: .16, ease: EASE_OUT, delay: reduce ? 0 : PANEL_DELAY }} />
      <MorphContext.Provider value>
        {Children.map(children, (child, row) => {
          if (isValidElement(child) && child.type === ColorPickerArea) return child;
          const item = reduce ? PANEL_ITEM_REDUCED : PANEL_ITEM;
          return <motion.div initial={item.initial} animate={item.animate} exit={PANEL_ITEM_EXIT}
            transition={{ ...SPRING_LAYOUT, delay: reduce ? 0 : PANEL_DELAY + row * PANEL_STAGGER }}>{child}</motion.div>;
        })}
      </MorphContext.Provider>
    </motion.div>}
  </PickerPresence>}</AnimatePresence>, document.body);
}

function PickerPresence({ children }: { children: (value: { present: boolean }) => ReactNode }) {
  return <>{children({ present: useIsPresent() })}</>;
}
