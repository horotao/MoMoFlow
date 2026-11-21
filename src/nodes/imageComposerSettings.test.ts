import test from 'node:test';
import assert from 'node:assert/strict';
import { changeComposerSettings, composerSettings } from './imageComposerSettings.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { preflight, prepareModel } from './executionGraph.ts';
import type { SunburstNode } from './types';

function image(): SunburstNode {
  return { id: 'image', type: 'sunburst', position: { x: 0, y: 0 }, data: {
    ...defaultSunburstSettings, provider: 'openai', imageInputs: 1,
    composer: { prompt: 'Draw a green leaf', ratio: '1:1', quantity: 1 },
  } };
}

test('ratio and resolution controls produce matching GPT API sizes', () => {
  const node = image();
  Object.assign(node.data, changeComposerSettings(node.data, { ratio: '16:9' }, { resolution: '2K' }));
  const request = prepareModel({ nodes: [node], edges: [] }, node.id)[0].imageRequest!;
  assert.equal(request.size, '2048x1152');
  Object.assign(node.data, changeComposerSettings(node.data, { ratio: '9:16' }));
  assert.equal(node.data.size, '1152x2048');
  assert.equal(composerSettings(node.data).resolution, '2K');
});

test('editing prompt or quality preserves an existing custom GPT size', () => {
  const node = image();
  node.data.size = '1600x1024';
  Object.assign(node.data, changeComposerSettings(node.data, { prompt: 'A different prompt' }, { quality: 'high' }));
  assert.equal(node.data.size, '1600x1024');
});

test('Seedream options reach its request and model switches preserve independent settings', () => {
  const node = image();
  Object.assign(node.data, changeComposerSettings(node.data, { selection: {
    modelIds: ['seedream-5-5'], autoSelect: false, multiple: false,
  } }, { resolution: '2K', background: 'transparent', outputFormat: 'png' }));
  const graph = { nodes: [node], edges: [] };
  assert.doesNotThrow(() => preflight(graph, [node.id], 1));
  const task = prepareModel(graph, node.id)[0];
  assert.equal(task.model, 'seedream-5-5');
  assert.equal(task.seedreamRequest?.prompt, 'Draw a green leaf');
  assert.equal(task.seedreamRequest?.resolution, '2K');
  assert.equal(task.seedreamRequest?.background, 'transparent');
  assert.equal(task.seedreamRequest?.nsfwCheck, false);
  Object.assign(node.data, changeComposerSettings(node.data, { selection: {
    modelIds: ['gpt-image-2-6'], autoSelect: false, multiple: false,
  } }));
  assert.equal(composerSettings(node.data).resolution, '1K');
  assert.equal(node.data.composer?.modelSettings?.['seedream-5-5'].background, 'transparent');
  assert.equal(prepareModel(graph, node.id)[0].imageRequest?.quality, 'medium');
});

test('Nano Banana 2.1 options use its existing client with the composer prompt', () => {
  const node = image();
  Object.assign(node.data, changeComposerSettings(node.data, { ratio: '4:3', selection: {
    modelIds: ['nano-banana-2-1'], autoSelect: false, multiple: false,
  } }, { resolution: '4K', outputFormat: 'jpeg' }));
  const graph = { nodes: [node], edges: [] };
  assert.doesNotThrow(() => preflight(graph, [node.id], 1));
  assert.deepEqual(prepareModel(graph, node.id)[0].nanoBananaRequest, {
    aspectRatio: '4:3', imageSize: '4K', outputFormat: 'jpeg', prompt: 'Draw a green leaf', images: [],
  });
});
