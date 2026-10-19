import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreSunburstData } from './sunburstClipboard.ts';
import { defaultSunburstSettings, validateSunburstSettings } from './sunburst.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import type { SunburstNode, TextNode } from './types';

const original: SunburstNode = {
  id: 'original', type: 'sunburst', position: { x: 100, y: 200 },
  data: {
    ...defaultSunburstSettings, imageInputs: 2, label: '产品替换 · 已选第一张',
    results: [
      { id: 'first', name: 'first.png', kind: 'image', url: 'blob:first', width: 864, height: 1536 },
      { id: 'last', name: 'last.png', kind: 'image', url: 'blob:last', width: 1024, height: 1024 },
    ], activeResultId: 'first',
  },
};

function clipboardRoundTrip(node: SunburstNode) {
  const saved = JSON.parse(JSON.stringify({ format: 'momoflow-sunburst-node', node }));
  return restoreSunburstData(saved.node.data);
}

test('cut clipboard round trip preserves name, selected result and downstream image', () => {
  const data = clipboardRoundTrip(original);
  assert.ok(data);
  assert.deepEqual(data, original.data);
  assert.equal(imageOutput({ ...original, id: 'pasted', data })[0].url, 'blob:first');
});

test('unfinished sizes survive clipboard restoration but still fail run validation', () => {
  const prompt: TextNode = { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: '替换产品' } };
  for (const size of ['1000x1024', 'x1024', '1024x', '', '512x512', '4096x2048']) {
    const data = clipboardRoundTrip({ ...original, data: { ...original.data, size } });
    assert.ok(data);
    assert.equal(data.size, size);
    assert.equal(data.label, original.data.label);
    assert.equal(data.activeResultId, 'first');
    assert.throws(() => validateSunburstSettings(data));
    const restored = { ...original, id: 'pasted', data };
    const run = prepareSunburstRun([restored, prompt], [{ id: 'edge', source: 'prompt', target: restored.id, targetHandle: 'prompt' }], [restored.id], 1);
    assert.equal(run.tasks.length, 0);
    assert.ok(run.error);
    assert.equal(imageOutput(restored)[0].id, 'first');
  }
});

test('missing or stale selection retains last-result fallback and optional names remain optional', () => {
  for (const activeResultId of [undefined, 'missing', 123]) {
    const data = restoreSunburstData({ ...original.data, activeResultId, label: 123 });
    assert.ok(data);
    assert.equal(data.activeResultId, undefined);
    assert.equal(data.label, undefined);
    assert.equal(imageOutput({ ...original, data })[0].id, 'last');
  }
  const data = restoreSunburstData({ ...defaultSunburstSettings, imageInputs: 1 });
  assert.ok(data);
  assert.deepEqual(data.results, []);
});

test('clipboard restoration keeps other settings, asset and input-count guards', () => {
  for (const invalid of [null, {}, { ...original.data, size: 123 }, { ...original.data, imageInputs: 0 }, { ...original.data, imageInputs: 17 },
    { ...original.data, imageInputs: 1.5 }, { ...original.data, results: [{}] }, { ...original.data, results: 'bad' }]) assert.equal(restoreSunburstData(invalid), undefined);
  for (const invalid of [{ ...original.data, quality: 'max' }, { ...original.data, background: 'transparent', outputFormat: 'jpeg' }]) assert.throws(() => restoreSunburstData(invalid));
  const data = restoreSunburstData({ ...original.data, locked: true, exposed: ['size'], extra: 'ignored' });
  assert.ok(data);
  assert.equal(data.locked, undefined);
  assert.equal(data.exposed, undefined);
  assert.equal('extra' in data, false);
});
