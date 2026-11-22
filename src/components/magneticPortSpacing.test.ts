import test from 'node:test';
import assert from 'node:assert/strict';
import { inputPortMinimumSpacing, inputPortSpacing, separateInputPorts } from './magneticPortSpacing.ts';

test('input rings approach as closely as FLORA without moving an idle or outward port', () => {
  assert.equal(inputPortSpacing, 40);
  assert.equal(inputPortMinimumSpacing, 26);
  assert.deepEqual(separateInputPorts(20, -20, 40, 26), [7, -7]);
  assert.deepEqual(separateInputPorts(7, -7, 40, 26), [7, -7]);
  assert.deepEqual(separateInputPorts(0, -20, 40, 26), [0, -14]);
  assert.deepEqual(separateInputPorts(20, 0, 40, 26), [14, 0]);
  assert.deepEqual(separateInputPorts(20, 10, 40, 26), [20, 10]);
  assert.deepEqual(separateInputPorts(-10, -20, 40, 26), [-10, -20]);
  assert.deepEqual(separateInputPorts(-20, 20, 40, 26), [-20, 20]);
});

test('all intermediate offsets keep input order and spacing without increasing magnetic travel', () => {
  // Covers independently retargeted animation frames, not just settled targets.
  for (let top = -20; top <= 20; top += .5) {
    for (let bottom = -20; bottom <= 20; bottom += .5) {
      const [a, b] = separateInputPorts(top, bottom, inputPortSpacing, inputPortMinimumSpacing);
      assert.ok(40 + b - a >= inputPortMinimumSpacing - 1e-9, `${top}, ${bottom}`);
      assert.ok(Math.abs(a) <= Math.abs(top) && Math.abs(b) <= Math.abs(bottom));
      if (top <= 0) assert.equal(a, top);
      if (bottom >= 0) assert.equal(b, bottom);
    }
  }
});
