export interface ThumbMetricsInput {
  viewportSize: number;
  contentSize: number;
  trackSize: number;
  paddingStart: number;
  paddingEnd: number;
  scrollPos: number;
  minThumbSize?: number;
}

export interface ThumbMetrics {
  hasOverflow: boolean;
  thumbSize: number;
  thumbOffset: number;
  maxScroll: number;
  maxOffset: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.min(max, Math.max(min, value));
}

/** Compute overlay thumb size and track offset in layout pixels. */
export function computeThumbMetrics({
  viewportSize,
  contentSize,
  trackSize,
  paddingStart,
  paddingEnd,
  scrollPos,
  minThumbSize = 24,
}: ThumbMetricsInput): ThumbMetrics {
  const maxScroll = Math.max(0, contentSize - viewportSize);
  const usableTrack = Math.max(0, trackSize - paddingStart - paddingEnd);
  if (maxScroll <= 1 || viewportSize <= 0 || usableTrack <= 0) {
    return { hasOverflow: false, thumbSize: 0, thumbOffset: paddingStart, maxScroll: 0, maxOffset: 0 };
  }
  const ratio = viewportSize / contentSize;
  // On short tracks the minimum must leave room to drag in either direction.
  const minimum = Math.min(minThumbSize, usableTrack / 2);
  const thumbSize = Math.max(minimum, usableTrack * ratio);
  const maxOffset = Math.max(0, usableTrack - thumbSize);
  const progress = clamp(scrollPos / maxScroll, 0, 1);
  return {
    hasOverflow: true,
    thumbSize,
    thumbOffset: paddingStart + progress * maxOffset,
    maxScroll,
    maxOffset,
  };
}

/**
 * Convert a pointer delta (in screen pixels) to a viewport scroll position,
 * compensating for ancestor CSS transforms such as React Flow canvas zoom.
 */
export function computeDragScroll({
  startScroll,
  deltaClient,
  scale,
  maxScroll,
  maxOffset,
}: {
  startScroll: number;
  deltaClient: number;
  scale: number;
  maxScroll: number;
  maxOffset: number;
}): number {
  if (maxScroll <= 0 || maxOffset <= 0) return 0;
  const safeScale = Number.isFinite(scale) && scale > 0.01 ? scale : 1;
  const deltaLayout = deltaClient / safeScale;
  return clamp(startScroll + (deltaLayout / maxOffset) * maxScroll, 0, maxScroll);
}

/** Convert a pointer click on the track (screen px relative to track start) to scroll position. */
export function computeTrackClickScroll({
  clientOffset,
  scale,
  paddingStart,
  thumbSize,
  maxScroll,
  maxOffset,
}: {
  clientOffset: number;
  scale: number;
  paddingStart: number;
  thumbSize: number;
  maxScroll: number;
  maxOffset: number;
}): number {
  if (maxScroll <= 0 || maxOffset <= 0) return 0;
  const safeScale = Number.isFinite(scale) && scale > 0.01 ? scale : 1;
  const layoutPos = clientOffset / safeScale;
  const targetOffset = clamp(layoutPos - thumbSize / 2 - paddingStart, 0, maxOffset);
  return clamp((targetOffset / maxOffset) * maxScroll, 0, maxScroll);
}
