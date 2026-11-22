import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppNode, SunburstNode } from './types';
import { connectionChoices, choiceConnection, type PendingConnection } from './connectionRecommendations.ts';
import { canConnect } from './connectionRules.ts';
import { defaultSunburstSettings } from './sunburst.ts';

const text: AppNode = { id: 'text', type: 'text', position: { x: 0, y: 0 }, data: { text: '' } };
const image: AppNode = { id: 'image', type: 'file', position: { x: 0, y: 0 }, data: { assets: [{ id: 'a', name: 'a.png', url: 'blob:a', kind: 'image' }] } };
const generator: SunburstNode = { id: 'generator', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };
function pending(nodeId: string, direction: 'source' | 'target' = 'source', handleId: string | null = null): PendingConnection {
  return { nodeId, direction, handleId, screen: { x: 400, y: 300 }, position: { x: 200, y: 150 } };
}

test('empty Image composers wire together and recommend compatible Image or Text targets', () => {
  const first: SunburstNode = { ...generator, id: 'first', data: { ...generator.data, composer: { prompt: '', ratio: '1:1', quantity: 1 } } };
  const second = { ...first, id: 'second' };
  const nodes = [first, second, generator, text, image];
  const link = { source: first.id, sourceHandle: 'result', target: second.id, targetHandle: 'image-0' };
  assert.ok(canConnect(link, nodes, []));
  for (const source of [generator.id, image.id]) {
    assert.equal(canConnect({ ...link, source, sourceHandle: source === image.id ? 'file' : 'result' }, nodes, []), false);
  }
  assert.equal(canConnect({ ...link, target: generator.id }, nodes, []), false);
  assert.equal(canConnect({ ...link, source: text.id, sourceHandle: null, targetHandle: 'prompt' }, nodes, []), false);
  for (const [origin, direction, handle] of [[first.id, 'source', 'result'], [second.id, 'target', 'image-0']] as const) {
    const start = pending(origin, direction, handle);
    const choices = connectionChoices(start, nodes);
    assert.deepEqual(choices.map(choice => choice.itemId), direction === 'source' ? ['image', 'text'] : ['image']);
    assert.deepEqual(choiceConnection(start, choices[0], origin === first.id ? second.id : first.id), link);
  }
  assert.deepEqual(connectionChoices(pending(second.id, 'target', 'prompt'), nodes).map(choice => choice.itemId), ['text']);
});

test('quick-created targets align their input with the drop using the source image ratio', () => {
  const size = (width: number, height: number): SunburstNode => ({ ...generator, data: {
    ...generator.data, composer: { prompt: '', ratio: 'auto', quantity: 1 },
    results: [{ id: 'asset', name: 'source.png', kind: 'image', url: 'blob:source', width, height }],
  } });
  const start = pending(generator.id, 'source', 'result');
  for (const [width, height, portX, portY] of [[3, 4, -24, 288], [2, 1, -216, 224]]) {
    const [choice] = connectionChoices(start, [size(width, height)]);
    assert.deepEqual([choice.portX, choice.portY], [portX, portY]);
  }
});
