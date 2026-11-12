import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeDetent, rangePercent, rangeRubber, snapRange } from './nodeRange.ts';

test('Slider steps preserve exposure precision, offset minima and scientific notation', () => {
  assert.equal(snapRange(.675, -5, 5, .01), .68);
  assert.equal(snapRange(-.675, -5, 5, .01), -.67);
  assert.equal(snapRange(1.25, .05, 2.05, .2), 1.25);
  assert.equal(snapRange(.000000151, 0, 1, 1e-8), .00000015);
  assert.equal(snapRange(-999, -100, 100, 1), -100);
  assert.equal(snapRange(999, 1, 500, 1), 500);
});

test('Zero detents use track pixels and release outside their 7px reach', () => {
  assert.equal(rangePercent(0, -100, 100), 50);
  assert.equal(rangeDetent(53.5, [0], -100, 100, 200), 0);
  assert.equal(rangeDetent(53.6, [0], -100, 100, 200), undefined);
  assert.equal(rangeDetent(50, [-200, 200], -100, 100, 200), undefined);
  assert.equal(rangeDetent(50, [], -100, 100, 200), undefined);
});

test('Elastic overshoot is symmetric, bounded and increasingly resistant', () => {
  assert.equal(rangeRubber(0), 0);
  for (const value of [1, 10, 100, 10000]) {
    assert.equal(rangeRubber(-value), -rangeRubber(value));
    assert.ok(rangeRubber(value) > 0 && rangeRubber(value) < 26);
  }
  assert.ok(rangeRubber(200) - rangeRubber(100) < rangeRubber(100));
});
