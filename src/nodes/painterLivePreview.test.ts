import test from 'node:test';
import assert from 'node:assert/strict';
import { PainterLivePreviews, type PainterLiveFrame } from './painterLivePreview.ts';

const frame = (drawing: boolean): PainterLiveFrame => ({
  result: { width: 1024, height: 512 } as HTMLCanvasElement,
  mask: { width: 1024, height: 512 } as HTMLCanvasElement,
  width: 1536, height: 768, drawing,
});

test('each draft frame reaches all previews of the same Painter before a committed frame exists', () => {
  const previews = new PainterLivePreviews();
  const resultFrames: PainterLiveFrame[] = [], maskFrames: PainterLiveFrame[] = [];
  previews.subscribe('paint', () => resultFrames.push(previews.get('paint')!));
  previews.subscribe('paint', () => maskFrames.push(previews.get('paint')!));
  const first = frame(true), second = frame(true);
  previews.publish('paint', first);
  previews.publish('paint', second);
  assert.deepEqual(resultFrames, [first, second]);
  assert.deepEqual(maskFrames, [first, second]);
  assert.notEqual(second.result, second.mask);
  assert.equal(previews.get('paint')?.drawing, true);
});

test('cancel restores committed pixels, disconnection unsubscribes, and deletion clears live canvases', () => {
  const previews = new PainterLivePreviews();
  const committed = frame(false);
  previews.publish('paint', committed);
  assert.equal(previews.get('paint'), committed);
  let updates = 0;
  const unsubscribe = previews.subscribe('paint', () => updates++);
  previews.publish('paint', frame(true));
  previews.publish('paint', committed);
  assert.equal(previews.get('paint'), committed);
  assert.equal(previews.get('paint')?.drawing, false);
  unsubscribe();
  previews.publish('paint', frame(true));
  assert.equal(updates, 2);
  previews.clear('paint');
  assert.equal(previews.get('paint'), undefined);
});

test('independent Painters and unconnected previews never share live frames or notifications', () => {
  const previews = new PainterLivePreviews();
  let updates = 0;
  previews.subscribe('other', () => updates++);
  previews.subscribe(undefined, () => updates++);
  const other = frame(false);
  previews.publish('other', other);
  previews.publish('paint', frame(true));
  previews.clear('paint');
  assert.equal(updates, 1);
  assert.equal(previews.get('other'), other);
  assert.equal(previews.get(undefined), undefined);
  previews.clear('other');
  assert.equal(updates, 2);
});
