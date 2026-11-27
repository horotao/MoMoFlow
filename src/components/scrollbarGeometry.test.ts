import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDragScroll, computeThumbMetrics, computeTrackClickScroll } from './scrollbarGeometry.ts';

test('computeThumbMetrics reports no overflow when content fits within 1px tolerance', () => {
  const exact = computeThumbMetrics({
    viewportSize: 200,
    contentSize: 200,
    trackSize: 200,
    paddingStart: 4,
    paddingEnd: 4,
    scrollPos: 0,
  });
  assert.equal(exact.hasOverflow, false);
  assert.equal(exact.thumbSize, 0);

  const subpixel = computeThumbMetrics({
    viewportSize: 200,
    contentSize: 200.6,
    trackSize: 200,
    paddingStart: 4,
    paddingEnd: 4,
    scrollPos: 0,
  });
  assert.equal(subpixel.hasOverflow, false);
});

test('computeThumbMetrics calculates proportional thumb size, minimum clamp, and offset', () => {
  const normal = computeThumbMetrics({
    viewportSize: 200,
    contentSize: 600,
    trackSize: 208,
    paddingStart: 4,
    paddingEnd: 4,
    scrollPos: 200,
  });
  assert.equal(normal.hasOverflow, true);
  assert.ok(Math.abs(normal.thumbSize - 200 / 3) < 0.01);
  assert.equal(normal.maxScroll, 400);
  // Halfway scrolled -> halfway along usable track
  assert.ok(Math.abs(normal.thumbOffset - (4 + normal.maxOffset / 2)) < 0.01);

  const tiny = computeThumbMetrics({
    viewportSize: 100,
    contentSize: 10000,
    trackSize: 108,
    paddingStart: 4,
    paddingEnd: 4,
    scrollPos: 9900,
    minThumbSize: 24,
  });
  assert.equal(tiny.hasOverflow, true);
  assert.equal(tiny.thumbSize, 24);
  assert.equal(tiny.thumbOffset, 4 + (100 - 24));
});

test('a short inspector track can be dragged in both directions from a nonzero position', () => {
  const startScroll = 96;
  const metrics = computeThumbMetrics({
    viewportSize: 40, contentSize: 232, trackSize: 40,
    paddingStart: 8, paddingEnd: 8, scrollPos: startScroll,
  });
  assert.ok(metrics.hasOverflow && metrics.maxOffset > 0);
  const offset = metrics.thumbOffset - 8;
  const drag = (deltaClient: number) => computeDragScroll({ ...metrics, startScroll, deltaClient, scale: 1 });
  assert.equal(drag(0), startScroll);
  assert.equal(drag(-offset), 0);
  assert.equal(drag(metrics.maxOffset - offset), metrics.maxScroll);
});

test('computeDragScroll maintains 1:1 cursor tracking across canvas zoom levels', () => {
  // maxOffset = 100 layout px, maxScroll = 500 scroll px
  for (const zoom of [0.25, 0.5, 0.69, 1, 1.5, 2, 4]) {
    // Dragging the entire screen-space travel (100 * zoom px) scrolls exactly to maxScroll
    const end = computeDragScroll({
      startScroll: 0,
      deltaClient: 100 * zoom,
      scale: zoom,
      maxScroll: 500,
      maxOffset: 100,
    });
    assert.ok(Math.abs(end - 500) < 0.001, `zoom ${zoom} reached ${end}`);

    // Halfway drag from middle back to start
    const back = computeDragScroll({
      startScroll: 250,
      deltaClient: -50 * zoom,
      scale: zoom,
      maxScroll: 500,
      maxOffset: 100,
    });
    assert.ok(Math.abs(back - 0) < 0.001, `zoom ${zoom} back reached ${back}`);
  }
});

test('computeTrackClickScroll centers thumb at click position across zoom levels', () => {
  // track 208px, padding 4px each -> usable 200px, thumb 40px -> maxOffset 160px, maxScroll 800px
  // Clicking midpoint (104 layout px -> 104 * scale screen px) targets midpoint scroll 400px
  for (const zoom of [0.5, 1, 2]) {
    const mid = computeTrackClickScroll({
      clientOffset: 104 * zoom,
      scale: zoom,
      paddingStart: 4,
      thumbSize: 40,
      maxScroll: 800,
      maxOffset: 160,
    });
    assert.ok(Math.abs(mid - 400) < 0.001, `zoom ${zoom} midpoint was ${mid}`);
  }

  // Clicking near top clamps cleanly to 0
  const top = computeTrackClickScroll({
    clientOffset: 2,
    scale: 1,
    paddingStart: 4,
    thumbSize: 40,
    maxScroll: 800,
    maxOffset: 160,
  });
  assert.equal(top, 0);
});
