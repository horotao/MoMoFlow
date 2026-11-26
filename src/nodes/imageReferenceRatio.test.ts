import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import { connectImageReferenceRatio, referenceRatioSettings, syncImageReferenceRatios } from './imageReferenceRatio.ts';
import { changeComposerSettings } from './imageComposerSettings.ts';
import { canvasImageSize } from './canvasImageGeometry.ts';
import { prepareModel } from './executionGraph.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { CanvasImage } from './types';

function image(id: string): CanvasImage {
  return { id, type: 'sunburst', position: { x: 0, y: 0 }, data: {
    ...defaultSunburstSettings, provider: 'apimart', channelModel: 'gpt-image-2.6-ext', size: '1:1', resolution: '2K', imageInputs: 16,
    composer: { prompt: 'Edit the reference', ratio: '1:1', quantity: 1 },
  } };
}
function reference(id = 'source', width = 1536, height = 1024): CanvasImage {
  const node = image(id);
  node.data.imageSource = 'imported';
  node.data.results = [{ id: `${id}-asset`, name: 'reference.png', kind: 'image', url: 'data:image/png;base64,aGVsbG8=', width, height }];
  return node;
}
const wire: Edge = { id: 'wire', source: 'source', sourceHandle: 'result', target: 'target', targetHandle: 'image-0' };

test('connecting a reference overrides creation preferences in both geometry and the actual request', () => {
  const target = image('target');
  Object.assign(target.data, changeComposerSettings(target.data, { ratio: '16:9' }, { quality: 'high', outputFormat: 'jpeg' }));
  const nodes = connectImageReferenceRatio([reference(), target], [], [wire], target.id);
  const updated = nodes[1] as CanvasImage;
  assert.equal(updated.data.composer.ratio, '3:2');
  assert.equal(updated.data.composer.followReferenceRatio, true);
  assert.equal(target.data.composer.ratio, '16:9');
  assert.deepEqual(canvasImageSize(updated.data.composer.ratio), { width: 576, height: 384 });
  const request = prepareModel({ nodes, edges: [wire] }, target.id)[0].imageRequest!;
  assert.equal(request.size, '3:2');
  assert.equal(request.resolution, '2K');
  assert.equal(request.quality, 'high');
  assert.equal(request.outputFormat, 'jpeg');
});

test('existing auto nodes resolve reference ratio into an OpenAI pixel size', () => {
  const target = image('target');
  target.data.provider = 'openai';
  target.data.composer.ratio = 'auto';
  target.data.size = 'auto';
  Object.assign(target.data, referenceRatioSettings(target.data, { width: 1024, height: 1536 }));
  const request = prepareModel({ nodes: [reference(), target], edges: [wire] }, target.id)[0].imageRequest!;
  assert.equal(target.data.composer.ratio, '2:3');
  assert.equal(request.size, '1344x2016');
  assert.equal(referenceRatioSettings(target.data, { width: 1024, height: 1536 }), undefined);
});

test('references that become ready later and upstream replacements keep following', () => {
  const source = image('source');
  const target = connectImageReferenceRatio([source, image('target')], [], [wire], 'target')[1] as CanvasImage;
  assert.equal(target.data.composer.followReferenceRatio, true);
  assert.equal(target.data.composer.ratio, '1:1');
  Object.assign(target.data, referenceRatioSettings(target.data, { width: 1200, height: 1600 }));
  assert.equal(target.data.composer.ratio, '3:4');
  Object.assign(target.data, referenceRatioSettings(target.data, { width: 1600, height: 900 }));
  assert.equal(target.data.composer.ratio, '16:9');
  Object.assign(target.data, changeComposerSettings(target.data, { ratio: '1:1' }));
  assert.equal(referenceRatioSettings(target.data, { width: 1600, height: 900 }), undefined);
  // An extra input must not override a manually selected ratio.
  const extra = { ...wire, id: 'extra', source: 'extra', targetHandle: 'image-1' };
  const nodes = [reference(), target, reference('extra', 1200, 1600)];
  assert.equal(connectImageReferenceRatio(nodes, [wire], [wire, extra], 'target'), nodes);
});

test('the first usable input in port order controls inference, including reverse connections', () => {
  const empty = image('empty');
  const first = { ...wire, id: 'first', source: 'empty' };
  const second = { ...wire, id: 'second', source: 'portrait', targetHandle: 'image-1' };
  const third = { ...wire, id: 'third', source: 'landscape', targetHandle: 'image-2' };
  const nodes = connectImageReferenceRatio([image('target'), reference('landscape'), empty, reference('portrait', 1200, 1600)], [], [third, second, first], 'target');
  assert.equal((nodes[0] as CanvasImage).data.composer.ratio, '3:4');
  assert.equal((nodes[2] as CanvasImage).data.composer.ratio, '1:1');
});

test('inference respects channel presets, locked targets and missing image dimensions', () => {
  const target = image('target');
  target.data.composer.followReferenceRatio = true;
  Object.assign(target.data, referenceRatioSettings(target.data, { width: 2000, height: 1000 }));
  assert.equal(target.data.composer.ratio, '16:9');
  assert.equal(target.data.size, '16:9');
  target.data.channelModel = 'gpt-image-2.6';
  Object.assign(target.data, referenceRatioSettings(target.data, { width: 2000, height: 1000 }));
  assert.equal(target.data.composer.ratio, '2:1');
  for (const dimensions of [{ width: 0, height: 1024 }, { width: NaN, height: 1024 }, { width: 1024 }]) assert.equal(referenceRatioSettings(target.data, dimensions), undefined);
  target.data.locked = true;
  assert.equal(referenceRatioSettings(target.data, { width: 1200, height: 1600 }), undefined);
  const locked = connectImageReferenceRatio([reference(), target], [], [wire], 'target');
  assert.equal(locked[1], target);
});

test('clearing or replacing a reference updates following nodes in the same graph edit', () => {
  const target = image('target');
  target.data.composer.followReferenceRatio = true;
  const other = reference('other', 1024, 1536);
  const edges = [wire, { ...wire, id: 'second', source: other.id, targetHandle: 'image-1' }];
  const replaced = [reference(), target, other];
  const updated = syncImageReferenceRatios(replaced, edges, 'source', new Set())[1] as CanvasImage;
  assert.equal(updated.data.composer.ratio, '3:2');
  const cleared = syncImageReferenceRatios([image('source'), updated, other], edges, 'source', new Set())[1] as CanvasImage;
  assert.equal(cleared.data.composer.ratio, '2:3');
  assert.equal(syncImageReferenceRatios(replaced, edges, 'source', new Set(['target']))[1], target);
  assert.equal(target.data.composer.ratio, '1:1');
});
