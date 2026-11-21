import test from 'node:test';
import assert from 'node:assert/strict';
import { canConnect, withoutReplacedInput } from './connectionRules.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { SunburstNode } from './types';

test('Image input replacement keeps other slots and rejects loops, duplicates and locked targets', () => {
  const nodes: SunburstNode[] = ['a', 'b', 'c', 'd'].map(id => ({ id, type: 'sunburst', position: { x: 0, y: 0 },
    data: { ...defaultSunburstSettings, imageInputs: 16, composer: { prompt: '', quantity: 1, ratio: '1:1' } } }));
  const link = (source: string, target: string, index: number) => ({ id: source + target, source, target, sourceHandle: 'result', targetHandle: 'image-' + index });
  const edges = [link('a', 'b', 0), link('d', 'b', 1)];
  const replacement = link('c', 'b', 0);
  assert.ok(canConnect(replacement, nodes, edges));
  assert.deepEqual(withoutReplacedInput(replacement, nodes, edges), [edges[1]]);
  for (const invalid of [link('a', 'b', 1), link('b', 'a', 0), link('a', 'a', 0), link('c', 'b', 16)]) {
    assert.equal(canConnect(invalid, nodes, edges), false);
  }
  nodes[1].data.locked = true;
  assert.equal(canConnect(replacement, nodes, edges), false);
});
