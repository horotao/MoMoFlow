import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryNode } from './libraryCatalog.ts';
import { sunburstPreset } from './imageNodePresets.ts';
import { changeComposerProvider, changeComposerSettings } from '../nodes/imageComposerSettings.ts';
import { prepareModel } from '../nodes/executionGraph.ts';

function storage(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  return values;
}
const image = () => createLibraryNode('image', { x: 100, y: 200 })!;

test('fresh Image uses APIMart EXT, 1:1 and a request with the same parameters', t => {
  storage(t);
  const node = image();
  assert.equal(node.data.provider, 'apimart');
  assert.equal(node.data.channelModel, 'gpt-image-2.6-ext');
  assert.equal(node.data.size, '1:1');
  assert.equal(node.data.composer!.ratio, '1:1');
  assert.equal(node.data.outputFormat, 'png');
  node.data.composer!.prompt = 'A green leaf';
  const request = prepareModel({ nodes: [node], edges: [] }, node.id)[0];
  assert.equal(request.model, 'gpt-image-2.6-ext');
  assert.equal(request.imageRequest!.size, '1:1');
});

test('new Image immediately inherits the last generation options without copying canvas content', t => {
  const values = storage(t);
  const source = image();
  Object.assign(source.data, changeComposerSettings(source.data, { ratio: '16:9', quantity: 3, prompt: 'Private prompt' }, {
    resolution: '2K', quality: 'high', outputFormat: 'jpeg',
  }));
  Object.assign(source.data, { locked: true, label: 'Private label', results: [{ id: 'secret', name: 'Private result', kind: 'image', url: 'blob:private' }] });
  sunburstPreset.remember(source.data);
  const node = image();
  for (const key of ['provider', 'channelModel', 'size', 'resolution', 'quality', 'outputFormat'] as const) assert.equal(node.data[key], source.data[key]);
  assert.equal(node.data.composer!.ratio, '16:9');
  assert.equal(node.data.composer!.quantity, 3);
  assert.equal(node.data.composer!.prompt, '');
  assert.equal(node.data.results, undefined);
  assert.equal(node.data.locked, undefined);
  assert.equal(node.data.label, undefined);
  assert.equal(node.data.imageInputs, 16);
  const saved = [...values.values()][0];
  for (const secret of ['Private prompt', 'Private label', 'blob:private']) assert.ok(!saved.includes(secret));
  node.data.composer!.ratio = '1:1';
  assert.equal(image().data.composer!.ratio, '16:9');
});

test('OpenAI channel and transparent background survive creating another node', t => {
  storage(t);
  const source = image();
  Object.assign(source.data, changeComposerProvider(source.data, 'openai'));
  Object.assign(source.data, changeComposerSettings(source.data, { ratio: '9:21' }, {
    resolution: '4K', quality: 'max', background: 'transparent', outputFormat: 'png',
  }));
  sunburstPreset.remember(source.data);
  const node = image();
  assert.equal(node.data.provider, 'openai');
  assert.equal(node.data.channelModel, 'gpt-image-2.6-ext');
  assert.equal(node.data.resolution, '4K');
  assert.equal(node.data.background, 'transparent');
  assert.equal(node.data.quality, 'max');
  assert.equal(node.data.size, '1632x3808');
  assert.equal(node.data.composer!.ratio, '9:21');
});

test('model choice and model-specific options are retained across subsequent edits', t => {
  storage(t);
  const source = image();
  Object.assign(source.data, changeComposerSettings(source.data, { ratio: '2:1', selection: {
    modelIds: ['seedream-5-5'], multiple: false, autoSelect: false,
  } }, { resolution: '2K', background: 'transparent', outputFormat: 'png' }));
  sunburstPreset.remember(source.data);
  const node = image();
  assert.deepEqual(node.data.composer!.selection!.modelIds, ['seedream-5-5']);
  node.data.composer!.prompt = 'A tree';
  const request = prepareModel({ nodes: [node], edges: [] }, node.id)[0].seedreamRequest!;
  assert.equal(request.size, '2:1');
  assert.equal(request.resolution, '2K');
  assert.equal(request.background, 'transparent');
  Object.assign(node.data, changeComposerSettings(node.data, { selection: { modelIds: ['gpt-image-2-6'], multiple: false, autoSelect: false } }));
  sunburstPreset.remember(node.data);
  assert.equal(image().data.composer!.ratio, 'auto');
  assert.equal(image().data.composer!.modelSettings!['seedream-5-5'].background, 'transparent');
});

test('legacy presets recover ratio, and corrupt or inaccessible storage uses factory defaults', t => {
  const values = storage(t);
  const old = { ...image().data, composer: undefined, provider: 'openai', size: '2048x1152', resolution: undefined };
  values.set('momoflow-sunburst-preset-v1', JSON.stringify(old));
  assert.equal(image().data.composer!.ratio, '16:9');
  assert.equal(image().data.resolution, '2K');
  values.set('momoflow-sunburst-preset-v1', '{invalid');
  assert.equal(image().data.composer!.ratio, '1:1');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
  assert.equal(image().data.provider, 'apimart');
  assert.doesNotThrow(() => sunburstPreset.remember(image().data));
});
