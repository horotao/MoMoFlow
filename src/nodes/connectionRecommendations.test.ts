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
    assert.deepEqual(choices.map(choice => choice.itemId), direction === 'source' ? ['image', 'text', 'video'] : ['image']);
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

test('Video enforces three typed inputs, slot limits and compatible forward and reverse recommendations', async () => {
  const { createLibraryNode } = await import('../components/libraryCatalog.ts');
  const { migrateLegacyImageGraph } = await import('../persistence/legacyImageMigration.ts');
  const position = { x: 0, y: 0 };
  const target = createLibraryNode('video', position);
  const movie = { ...target, id: 'import', data: { label: 'example.mp4', asset: { id: 'asset', kind: 'video' as const, name: 'example.mp4', url: 'blob:test' } } };
  const still = createLibraryNode('image', position), prompt = createLibraryNode('text', position);
  const nodes = [target, movie, still, prompt];
  const wire = (source: string, sourceHandle: string, targetHandle: string) => ({ id: source, source, sourceHandle, target: target.id, targetHandle });
  const inputs = [wire(prompt.id, 'text', 'prompt'), wire(still.id, 'result', 'image-8'), wire(movie.id, 'video', 'video-2')];
  for (const edge of inputs) assert.ok(canConnect(edge, nodes, []));
  for (const edge of [wire(prompt.id, 'text', 'video-0'), wire(still.id, 'result', 'image-9'), wire(movie.id, 'video', 'video-3'),
    { ...inputs[2], target: movie.id }, { ...inputs[0], target: movie.id }]) assert.equal(canConnect(edge, nodes, []), false);
  assert.equal(canConnect(inputs[2], nodes, inputs), false);
  assert.deepEqual(connectionChoices(pending(movie.id, 'source', 'video'), nodes).map(choice => choice.handleId), ['video-0']);
  assert.deepEqual(connectionChoices(pending(target.id, 'target', 'video-0'), nodes).map(choice => choice.handleId), ['video']);
  for (const legacy of [[], [text]]) {
    const restored = migrateLegacyImageGraph([...nodes, ...legacy], inputs);
    assert.deepEqual(new Set(restored.edges.map(edge => edge.id)), new Set(inputs.map(edge => edge.id)));
  }
});

test('Audio connects both ways to Seedance Auto only and its slots survive workflow restoration', async () => {
  const { createLibraryNode } = await import('../components/libraryCatalog.ts');
  const { migrateLegacyImageGraph } = await import('../persistence/legacyImageMigration.ts');
  const position = { x: 0, y: 0 };
  const source = createLibraryNode('audio', position), target = createLibraryNode('video', position);
  assert.ok(target.type === 'video' && target.data.videoComposer);
  const nodes = [source, target];
  const wire = { id: 'music', source: source.id, sourceHandle: 'audio', target: target.id, targetHandle: 'audio-4' };
  assert.ok(canConnect(wire, nodes, []));
  assert.equal(canConnect({ ...wire, targetHandle: 'audio-5' }, nodes, []), false);
  assert.equal(canConnect(wire, nodes, [wire]), false);
  assert.equal(connectionChoices(pending(source.id, 'source', 'audio'), nodes)[0].handleId, 'audio-0');
  assert.equal(connectionChoices(pending(target.id, 'target', 'audio-4'), nodes)[0].itemId, 'audio');
  for (const extra of [[], [text]]) assert.deepEqual(migrateLegacyImageGraph([...nodes, ...extra], [wire]).edges, [wire]);
  for (const options of [{ model: 'kling' }, { model: 'minimax' }, { modelOptions: { seedance: { imageMode: 'first-last' } } }] as const) {
    const other: AppNode = { ...target, data: { ...target.data, videoComposer: { ...target.data.videoComposer, ...options } } };
    assert.equal(canConnect(wire, [source, other], []), false);
    assert.deepEqual(connectionChoices(pending(other.id, 'target', 'audio-0'), [source, other]), []);
  }
});
