import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { SunburstNode } from './types';
import { reorderImageReferences } from './imageReferenceOrder.ts';
import { prepareSunburstRun } from './sunburstRun.ts';
import { defaultSunburstSettings } from './sunburst.ts';

const edges: Edge[] = [
  { id: 'b', source: 'source-b', sourceHandle: 'result', target: 'target', targetHandle: 'image-7', selected: true },
  { id: 'other', source: 'source-a', sourceHandle: 'result', target: 'other', targetHandle: 'image-0' },
  { id: 'a', source: 'source-a', sourceHandle: 'result', target: 'target', targetHandle: 'image-2' },
];

test('reference sorting keeps edge identities, sparse slots and unrelated connections', () => {
  const sorted = reorderImageReferences(edges, 'target', ['b', 'a']);
  assert.deepEqual(sorted.map(edge => edge.targetHandle), ['image-2', 'image-0', 'image-7']);
  assert.equal(sorted[0].source, 'source-b');
  assert.equal(sorted[0].selected, true);
  assert.equal(sorted[1], edges[1]);
  assert.equal(edges[0].targetHandle, 'image-7');
  assert.deepEqual(reorderImageReferences(sorted, 'target', ['a', 'b']), edges);
});

test('no-op and stale drag orders cannot remove or duplicate connections', () => {
  for (const ids of [['a', 'b'], ['a'], ['b', 'b'], ['a', 'missing'], ['a', 'b', 'other']]) {
    assert.equal(reorderImageReferences(edges, 'target', ids), edges);
  }
});

test('the reordered references reach the actual generation request in the displayed order', () => {
  const image = (id: string): SunburstNode => ({ id, type: 'sunburst', position: { x: 0, y: 0 }, data: {
    ...defaultSunburstSettings, imageInputs: 16,
    composer: { prompt: '合成两张参考图', ratio: 'auto', quantity: 1 },
    results: [{ id: `${id}-asset`, name: `${id}.png`, url: `blob:${id}`, kind: 'image' }],
  } });
  const nodes = [image('source-a'), image('source-b'), image('target')];
  const run = prepareSunburstRun(nodes, reorderImageReferences(edges, 'target', ['b', 'a']), ['target'], 1);
  assert.equal(run.error, undefined);
  assert.deepEqual(run.tasks[0].imageRequest?.images, ['blob:source-b', 'blob:source-a']);
});
