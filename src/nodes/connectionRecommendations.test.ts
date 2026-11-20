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

test('text and image outputs recommend compatible implemented inputs with stable handle IDs', () => {
  assert.deepEqual(connectionChoices(pending('text'), [text], []).map(c => [c.itemId, c.handleId]), [
    ['text', 'variable-1'], ['sunburst', 'prompt'], ['nano-banana', 'prompt'], ['seedream', 'prompt'],
  ]);
  assert.deepEqual(connectionChoices(pending('image', 'source', 'file'), [image], []).map(c => [c.itemId, c.handleId]), [
    ['sunburst', 'image-0'], ['nano-banana', 'image-0'], ['seedream', 'image-0'],
  ]);
  assert.deepEqual(connectionChoices(pending('generator', 'source', 'result'), [generator], []).map(c => c.itemId), ['sunburst', 'nano-banana', 'seedream']);
});

test('non-image and empty files never suggest incompatible text or image consumers', () => {
  for (const data of [{}, { assets: [{ id: 'v', name: 'v.mp4', url: 'blob:v', kind: 'video' as const }] }]) {
    assert.deepEqual(connectionChoices(pending('file'), [{ id: 'file', type: 'file', position: { x: 0, y: 0 }, data }], []), []);
  }
});

test('reverse image and mask connections retain the exact target handle and offer Import', () => {
  for (const handle of ['image-0', 'mask']) {
    const start = pending('generator', 'target', handle);
    const choices = connectionChoices(start, [generator], []);
    assert.deepEqual(choices.map(c => c.itemId), ['file', 'sunburst', 'nano-banana', 'seedream']);
    assert.deepEqual(choiceConnection(start, choices[0], 'new'), { source: 'new', sourceHandle: 'file', target: 'generator', targetHandle: handle });
    const empty: AppNode = { id: 'new', type: 'file', position: { x: 0, y: 0 }, data: {} };
    const connection = choiceConnection(start, choices[0], 'new');
    assert.equal(canConnect(connection, [generator, empty], []), false);
    assert.equal(canConnect(connection, [generator, empty], [], 'new'), true);
  }
});

test('reverse text ports offer text producers, unavailable inputs and stale starts offer none', () => {
  assert.deepEqual(connectionChoices(pending('generator', 'target', 'prompt'), [generator], []).map(c => c.itemId), ['text']);
  assert.deepEqual(connectionChoices(pending('generator', 'target', 'quality'), [generator], []), []);
  assert.deepEqual(connectionChoices(pending('gone'), [text], []), []);
  assert.deepEqual(connectionChoices(pending('text'), [{ ...text, data: { text: '', locked: true } }], []), []);
  const occupied = { id: 'edge', source: 'other', target: 'text', targetHandle: 'variable-3' };
  assert.deepEqual(connectionChoices(pending('text', 'target', 'variable-3'), [text], [occupied]),
    connectionChoices(pending('text', 'target', 'variable-3'), [text], []));
  assert.ok(connectionChoices(pending('text', 'target', 'variable-4'), [text], [occupied]).length);
});

test('shared validator rejects duplicate connections, cycles, locked nodes and incompatible types', () => {
  const edge = { id: 'edge', source: 'text', sourceHandle: null, target: 'generator', targetHandle: 'prompt' };
  assert.equal(canConnect(edge, [text, generator], []), true);
  assert.equal(canConnect(edge, [text, generator], [edge]), false);
  assert.equal(canConnect(edge, [{ ...text, data: { text: '', locked: true } }, generator], []), false);
  assert.equal(canConnect({ ...edge, source: 'image', sourceHandle: 'file' }, [image, generator], []), false);
  const second = { ...text, id: 'second' };
  assert.equal(canConnect({ source: 'second', target: 'text', sourceHandle: null, targetHandle: 'variable-1' }, [text, second], [{ id: 'cycle', source: 'text', target: 'second' }]), false);
});

test('legacy GPT Image parameter ports cannot accept connections or recommend producers', () => {
  const exposed = ['provider', 'variant', 'channelModel', 'quality', 'size', 'resolution', 'background', 'outputFormat', 'frameCount', 'svgModel', 'svgEffort'] as const;
  const target: SunburstNode = { ...generator, data: { ...generator.data, exposed: [...exposed] } };
  for (const field of exposed) {
    assert.deepEqual(connectionChoices(pending(target.id, 'target', field), [target, text], []), []);
    assert.equal(canConnect({ source: text.id, sourceHandle: null, target: target.id, targetHandle: field }, [target, text], []), false);
  }
});
