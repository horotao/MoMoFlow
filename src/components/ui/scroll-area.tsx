import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type RefObject,
} from 'react';
import { cn } from '@/lib/utils';
import { useTouchPrimary } from '@/hooks/use-touch-primary';
import {
  computeDragScroll,
  computeThumbMetrics,
  computeTrackClickScroll,
  type ThumbMetrics,
} from '../scrollbarGeometry';
import './scroll-area.css';

const SCROLL_LINGER_MS = 700;
const CLICK_LINGER_MS = 900;
const MIN_THUMB_SIZE = 24;

let activeDragCount = 0;

function setGlobalDragging(dragging: boolean) {
  if (typeof document === 'undefined') return;
  activeDragCount = Math.max(0, activeDragCount + (dragging ? 1 : -1));
  if (activeDragCount > 0) {
    document.documentElement.dataset.scrollbarDragging = 'true';
  } else {
    delete document.documentElement.dataset.scrollbarDragging;
  }
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else (ref as MutableRefObject<T | null>).current = value;
}

type Orientation = 'vertical' | 'horizontal' | 'both';
type Axis = 'vertical' | 'horizontal';

interface AxisScrollbarProps {
  axis: Axis;
  viewportRef: RefObject<HTMLElement | null>;
  visible: boolean;
  className?: string;
  onDraggingChange: (dragging: boolean) => void;
  onInteract: () => void;
}

function AxisScrollbar({
  axis,
  viewportRef,
  visible,
  className,
  onDraggingChange,
  onInteract,
}: AxisScrollbarProps) {
  const vertical = axis === 'vertical';
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [dragging, setDragging] = useState(false);
  const hasOverflowRef = useRef(false);
  const draggingRef = useRef(false);
  const metricsRef = useRef<ThumbMetrics>({
    hasOverflow: false,
    thumbSize: 0,
    thumbOffset: 0,
    maxScroll: 0,
    maxOffset: 0,
  });
  const dragStateRef = useRef<{
    pointerId: number;
    startClient: number;
    startScroll: number;
    scale: number;
  } | null>(null);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!viewport || !track) return;

    const style = getComputedStyle(track);
    const paddingStart = parseFloat(vertical ? style.paddingTop : style.paddingLeft) || 0;
    const paddingEnd = parseFloat(vertical ? style.paddingBottom : style.paddingRight) || 0;
    const trackSize = vertical ? track.clientHeight : track.clientWidth;
    const viewportSize = vertical ? viewport.clientHeight : viewport.clientWidth;
    const contentSize = vertical ? viewport.scrollHeight : viewport.scrollWidth;
    const scrollPos = vertical ? viewport.scrollTop : viewport.scrollLeft;

    const metrics = computeThumbMetrics({
      viewportSize,
      contentSize,
      trackSize,
      paddingStart,
      paddingEnd,
      scrollPos,
      minThumbSize: MIN_THUMB_SIZE,
    });
    metricsRef.current = metrics;

    if (hasOverflowRef.current !== metrics.hasOverflow) {
      hasOverflowRef.current = metrics.hasOverflow;
      setHasOverflow(metrics.hasOverflow);
    }

    if (thumb && metrics.hasOverflow) {
      if (vertical) {
        thumb.style.height = `${metrics.thumbSize}px`;
        thumb.style.transform = `translate3d(0, ${metrics.thumbOffset}px, 0)`;
      } else {
        thumb.style.width = `${metrics.thumbSize}px`;
        thumb.style.transform = `translate3d(${metrics.thumbOffset}px, 0, 0)`;
      }
    }
  }, [vertical, viewportRef]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    let rafId = 0;
    const scheduleMeasure = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        measure();
      });
    };

    measure();
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(viewport);
    resizeObserver.observe(track);
    for (const child of Array.from(viewport.children)) resizeObserver.observe(child);

    const mutationObserver = new MutationObserver(() => {
      for (const child of Array.from(viewport.children)) resizeObserver.observe(child);
      scheduleMeasure();
    });
    mutationObserver.observe(viewport, { childList: true, subtree: true, characterData: true });

    viewport.addEventListener('scroll', measure, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      viewport.removeEventListener('scroll', measure);
    };
  }, [measure, viewportRef]);

  // Forward wheel events over the overlay track directly to the viewport.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const handleWheel = (event: WheelEvent) => {
      const viewport = viewportRef.current;
      if (!viewport || !metricsRef.current.hasOverflow) return;
      event.preventDefault();
      event.stopPropagation();
      if (vertical) {
        viewport.scrollTop += event.deltaY;
      } else {
        viewport.scrollLeft += event.deltaX || event.deltaY;
      }
    };
    track.addEventListener('wheel', handleWheel, { passive: false });
    return () => track.removeEventListener('wheel', handleWheel);
  }, [vertical, viewportRef]);

  const endDrag = useCallback((pointerId?: number) => {
    if (!draggingRef.current) return;
    const track = trackRef.current;
    if (track && pointerId !== undefined && track.hasPointerCapture(pointerId)) {
      try { track.releasePointerCapture(pointerId); } catch { /* ignore released capture */ }
    }
    draggingRef.current = false;
    dragStateRef.current = null;
    setDragging(false);
    onDraggingChange(false);
    setGlobalDragging(false);
  }, [onDraggingChange]);

  useEffect(() => () => {
    if (draggingRef.current) {
      draggingRef.current = false;
      dragStateRef.current = null;
      setGlobalDragging(false);
    }
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    event.preventDefault();
    event.stopPropagation();
    onInteract();
    measure();

    const metrics = metricsRef.current;
    if (!metrics.hasOverflow) return;

    const rect = track.getBoundingClientRect();
    const layoutTrackSize = vertical ? track.clientHeight : track.clientWidth;
    const screenTrackSize = vertical ? rect.height : rect.width;
    const scale = layoutTrackSize > 0 && screenTrackSize > 0 ? screenTrackSize / layoutTrackSize : 1;

    const hitThumb = Boolean(thumbRef.current && thumbRef.current.contains(event.target as Node));
    if (!hitThumb) {
      const style = getComputedStyle(track);
      const paddingStart = parseFloat(vertical ? style.paddingTop : style.paddingLeft) || 0;
      const clientOffset = vertical ? event.clientY - rect.top : event.clientX - rect.left;
      const nextScroll = computeTrackClickScroll({
        clientOffset,
        scale,
        paddingStart,
        thumbSize: metrics.thumbSize,
        maxScroll: metrics.maxScroll,
        maxOffset: metrics.maxOffset,
      });
      if (vertical) viewport.scrollTop = nextScroll;
      else viewport.scrollLeft = nextScroll;
      measure();
    }

    try { track.setPointerCapture(event.pointerId); } catch { /* synthetic events may not support capture */ }
    draggingRef.current = true;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClient: vertical ? event.clientY : event.clientX,
      startScroll: vertical ? viewport.scrollTop : viewport.scrollLeft,
      scale,
    };
    setDragging(true);
    onDraggingChange(true);
    setGlobalDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    const metrics = metricsRef.current;
    const deltaClient = (vertical ? event.clientY : event.clientX) - drag.startClient;
    const nextScroll = computeDragScroll({
      startScroll: drag.startScroll,
      deltaClient,
      scale: drag.scale,
      maxScroll: metrics.maxScroll,
      maxOffset: metrics.maxOffset,
    });
    if (vertical) viewport.scrollTop = nextScroll;
    else viewport.scrollLeft = nextScroll;
    measure();
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      event.stopPropagation();
      endDrag(event.pointerId);
    }
  };

  const shown = hasOverflow && (visible || dragging);

  return (
    <div
      ref={trackRef}
      aria-hidden="true"
      data-slot="scroll-area-scrollbar"
      data-orientation={axis}
      data-overflow={hasOverflow ? '' : undefined}
      data-visible={shown ? '' : undefined}
      data-dragging={dragging ? 'true' : undefined}
      className={cn('nodrag nopan nowheel', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={() => endDrag()}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
    >
      <div
        ref={thumbRef}
        data-slot="scroll-area-thumb"
        style={hasOverflow ? undefined : { display: 'none' }}
      />
    </div>
  );
}

export interface OverlayScrollbarsProps {
  viewportRef: RefObject<HTMLElement | null>;
  hostRef?: RefObject<HTMLElement | null>;
  orientation?: Orientation;
  className?: string;
}

/**
 * Shared overlay scrollbar layer that can be attached to any scrollable viewport
 * inside a `position: relative` host container.
 */
export function OverlayScrollbars({
  viewportRef,
  hostRef,
  orientation = 'vertical',
  className,
}: OverlayScrollbarsProps) {
  const isTouch = useTouchPrimary();
  const [hovering, setHovering] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [draggingCount, setDraggingCount] = useState(0);
  const hoveringRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealOnScroll = useCallback(() => {
    setScrolling(true);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => setScrolling(false), SCROLL_LINGER_MS);
  }, []);

  const revealOnClick = useCallback(() => {
    setClicked(true);
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => setClicked(false), CLICK_LINGER_MS);
  }, []);

  const handleDraggingChange = useCallback((dragging: boolean) => {
    setDraggingCount(current => Math.max(0, current + (dragging ? 1 : -1)));
  }, []);

  useEffect(() => () => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
  }, []);

  useEffect(() => {
    if (isTouch) return;
    const viewport = viewportRef.current;
    const host = hostRef?.current ?? viewport?.parentElement ?? viewport;
    if (!viewport || !host) return;

    const enter = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (!hoveringRef.current) {
        hoveringRef.current = true;
        setHovering(true);
      }
    };
    const leave = () => {
      if (hoveringRef.current) {
        hoveringRef.current = false;
        setHovering(false);
      }
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button === 0) revealOnClick();
    };

    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointermove', enter);
    host.addEventListener('pointerleave', leave);
    host.addEventListener('pointerdown', pointerDown, true);
    viewport.addEventListener('scroll', revealOnScroll, { passive: true });
    return () => {
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointermove', enter);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('pointerdown', pointerDown, true);
      viewport.removeEventListener('scroll', revealOnScroll);
    };
  }, [hostRef, isTouch, revealOnClick, revealOnScroll, viewportRef]);

  if (isTouch) return null;

  const visible = hovering || scrolling || clicked || draggingCount > 0;

  return (
    <>
      {orientation !== 'horizontal' && (
        <AxisScrollbar
          axis="vertical"
          viewportRef={viewportRef}
          visible={visible}
          className={className}
          onDraggingChange={handleDraggingChange}
          onInteract={revealOnClick}
        />
      )}
      {orientation !== 'vertical' && (
        <AxisScrollbar
          axis="horizontal"
          viewportRef={viewportRef}
          visible={visible}
          className={className}
          onDraggingChange={handleDraggingChange}
          onInteract={revealOnClick}
        />
      )}
    </>
  );
}

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  viewportClassName?: string;
  viewportStyle?: CSSProperties;
  viewportRef?: Ref<HTMLDivElement>;
  viewportProps?: HTMLAttributes<HTMLDivElement>;
  scrollbarClassName?: string;
  /** Which axes get scrollbars. Defaults to `"vertical"`. */
  orientation?: Orientation;
  /** Hide the custom scrollbar while keeping smooth wheel/touch scrolling. */
  hideScrollbar?: boolean;
}

const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  (
    {
      className,
      children,
      viewportClassName,
      viewportStyle,
      viewportRef,
      viewportProps,
      scrollbarClassName,
      orientation = 'vertical',
      hideScrollbar = false,
      ...rest
    },
    ref,
  ) => {
    const internalRootRef = useRef<HTMLDivElement | null>(null);
    const internalViewportRef = useRef<HTMLDivElement | null>(null);

    const setRootRef = useCallback(
      (node: HTMLDivElement | null) => {
        internalRootRef.current = node;
        assignRef(ref, node);
      },
      [ref],
    );

    const setViewportRef = useCallback(
      (node: HTMLDivElement | null) => {
        internalViewportRef.current = node;
        assignRef(viewportRef, node);
      },
      [viewportRef],
    );

    return (
      <div
        ref={setRootRef}
        data-slot="scroll-area"
        className={cn('shared-scroll-area', className)}
        {...rest}
      >
        <div
          ref={setViewportRef}
          data-slot="scroll-area-viewport"
          data-orientation={orientation}
          {...viewportProps}
          style={{ ...viewportProps?.style, ...viewportStyle }}
          className={cn('shared-scroll-viewport', viewportProps?.className, viewportClassName)}
        >
          {children}
        </div>
        {!hideScrollbar && (
          <OverlayScrollbars
            viewportRef={internalViewportRef}
            hostRef={internalRootRef}
            orientation={orientation}
            className={scrollbarClassName}
          />
        )}
      </div>
    );
  },
);

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
export type { Orientation as ScrollAreaOrientation };
