import test from 'node:test';
import assert from 'node:assert/strict';
import { changeComposerChannel, changeComposerSettings, composerAspectRatios, composerChannel, composerSettings } from './imageComposerSettings.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { buildApimartRequest } from '../../server/apimart.ts';
import { buildSunburstRequest } from '../../server/sunburst.ts';
import { preflight, prepareModel } from './executionGraph.ts';
import type { SunburstNode } from './types';
import { imagePromptGenerationAspectRatios } from '../components/image-prompt-node/imagePromptAspectRatios.ts';

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

test('choosing OpenAI resolution from auto uses an explicit matching square size', () => {
  for (const [resolution, size] of [['1K', '1024x1024'], ['2K', '2048x2048'], ['4K', '2880x2880']]) {
    const node = image();
    node.data.composer!.ratio = 'auto';
    Object.assign(node.data, changeComposerSettings(node.data, {}, { resolution }));
    assert.equal(node.data.composer!.ratio, '1:1');
    assert.equal(prepareModel({ nodes: [node], edges: [] }, node.id)[0].imageRequest!.size, size);
    Object.assign(node.data, changeComposerSettings(node.data, { ratio: 'auto' }));
    assert.equal(node.data.size, 'auto');
  }
});

test('channel switches preserve the selected model, ratio and resolution', () => {
  const node = image();
  Object.assign(node.data, changeComposerSettings(node.data, { ratio: '16:9' }, { resolution: '2K' }));
  Object.assign(node.data, changeComposerChannel(node.data, 'gpt-image-2.6'));
  assert.equal(composerChannel(node.data), 'gpt-image-2.6');
  let request = prepareModel({ nodes: [node], edges: [] }, node.id)[0].imageRequest!;
  assert.equal(request.provider, 'apimart');
  assert.equal(request.channelModel, 'gpt-image-2.6');
  assert.equal(buildApimartRequest(request).body.size, '16:9');
  assert.equal(buildApimartRequest(request).body.resolution, '2k');
  Object.assign(node.data, changeComposerSettings(node.data, { ratio: 'auto' }, { resolution: '4K' }));
  assert.equal(node.data.composer!.ratio, 'auto');
  assert.equal(node.data.size, 'auto');
  Object.assign(node.data, changeComposerSettings(node.data, { ratio: '9:16' }));
  Object.assign(node.data, changeComposerChannel(node.data, 'openai'));
  request = prepareModel({ nodes: [node], edges: [] }, node.id)[0].imageRequest!;
  assert.equal(request.provider, 'openai');
  assert.equal(buildSunburstRequest(request).body.size, '2160x3840');
  assert.equal(composerSettings(node.data).resolution, '4K');
});

test('the APIMart selector routes both GPT Image variants and preserves supported parameters', () => {
  const node = image();
  node.data.provider = 'apimart'; // Older APIMart nodes omitted the channel model.
  assert.equal(composerChannel(node.data), 'gpt-image-2.6-ext');
  const graph = { nodes: [node], edges: [] };
  const payload = () => buildApimartRequest(prepareModel(graph, node.id)[0].imageRequest!).body;
  for (const [modelId, version] of [['gpt-image-2-6', 'sunburst'], ['gpt-image-2-6-flare', 'flare']] as const) {
    Object.assign(node.data, changeComposerChannel(node.data, 'gpt-image-2.6'));
    Object.assign(node.data, changeComposerSettings(node.data, {
      selection: { modelIds: [modelId], autoSelect: false, multiple: false }, ratio: '9:21',
    }, { resolution: '2K', background: 'transparent' }));
    assert.deepEqual(payload(), {
      model: `gpt-image-2.6-${version}`, prompt: 'Draw a green leaf', size: '9:21', resolution: '2k',
      quality: 'medium', output_format: 'png', n: 1, nsfw_check: false, background: 'transparent', moderation: 'low',
    });

    Object.assign(node.data, changeComposerChannel(node.data, 'gpt-image-2.6-ext'));
    assert.equal(composerChannel(node.data), 'gpt-image-2.6-ext');
    assert.deepEqual(payload(), {
      model: 'gpt-image-2.6-ext', version, prompt: 'Draw a green leaf', size: 'auto', resolution: '2k',
      quality: 'medium', output_format: 'png', n: 1, nsfw_check: false,
    });
    Object.assign(node.data, changeComposerSettings(node.data, { ratio: '4:3' }, { outputFormat: 'jpeg' }));
    assert.equal(payload().output_format, 'jpeg');
    Object.assign(node.data, changeComposerChannel(node.data, 'gpt-image-2.6'));
    assert.equal(payload().size, '4:3');
    assert.equal(payload().background, 'transparent');
    assert.equal(payload().output_format, 'png');
  }
});

test('switching APIMart variants keeps a restored GIF request valid', () => {
  const node = image();
  Object.assign(node.data, { provider: 'apimart', channelModel: 'gpt-image-2.6', size: '512x512', outputFormat: 'gif' });
  const graph = { nodes: [node], edges: [] };
  for (const channel of ['gpt-image-2.6-ext', 'gpt-image-2.6'] as const) {
    Object.assign(node.data, changeComposerChannel(node.data, channel));
    assert.equal(node.data.composer?.ratio, 'auto');
    const request = prepareModel(graph, node.id)[0].imageRequest!;
    assert.equal(buildApimartRequest(request).body.output_format, 'gif');
    assert.equal(buildApimartRequest(request).body.size, 'auto');
  }
});

test('expanded menu ratios create valid OpenAI and APIMart standard requests at every resolution', () => {
  const additions = ['5:4', '4:5', '2:1', '1:2', '3:1', '1:3', '9:21'];
  for (const ratio of additions) {
    assert.ok(imagePromptGenerationAspectRatios.some(value => value === ratio));
    for (const resolution of ['1K', '2K', '4K']) {
      const node = image();
      Object.assign(node.data, changeComposerSettings(node.data, { ratio }, { resolution }));
      const request = prepareModel({ nodes: [node], edges: [] }, node.id)[0].imageRequest!;
      const [width, height] = buildSunburstRequest(request).body.size.split('x').map(Number);
      const [x, y] = ratio.split(':').map(Number);
      assert.equal(width * y, height * x);
      Object.assign(node.data, changeComposerChannel(node.data, 'gpt-image-2.6'));
      const api = buildApimartRequest(prepareModel({ nodes: [node], edges: [] }, node.id)[0].imageRequest!).body;
      assert.equal(api.size, ratio);
      assert.equal(api.resolution, resolution.toLowerCase());
    }
  }
});

test('both ratio menus can filter unsupported provider and model choices', () => {
  const node = image();
  assert.ok(composerAspectRatios(node.data).includes('9:21'));
  node.data.provider = 'apimart';
  assert.ok(composerAspectRatios(node.data).includes('5:4'));
  for (const ratio of ['2:1', '1:2', '3:1', '1:3', '9:21']) assert.ok(!composerAspectRatios(node.data).includes(ratio));
  node.data.channelModel = 'gpt-image-2.6';
  assert.ok(composerAspectRatios(node.data).includes('9:21'));
  node.data.composer!.ratio = '9:21';
  Object.assign(node.data, changeComposerSettings(node.data, { selection: {
    modelIds: ['seedream-5-5'], autoSelect: false, multiple: false,
  } }));
  assert.equal(node.data.composer!.ratio, 'auto');
  assert.ok(composerAspectRatios(node.data).includes('2:1'));
  assert.ok(!composerAspectRatios(node.data).includes('9:21'));
  assert.doesNotThrow(() => preflight({ nodes: [node], edges: [] }, [node.id], 1));
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
