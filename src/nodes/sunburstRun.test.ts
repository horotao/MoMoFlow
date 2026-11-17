import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppNode, SunburstNode, FileAsset } from './types';
import { prepareSunburstRun, imageOutput } from './sunburstRun.ts';
import { defaultSunburstSettings, imageSizes, validateSunburstSize } from './sunburst.ts';
import { prepareDescriberRun } from './describerRun.ts';
const generator: SunburstNode = { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 2 } };
const prompt: AppNode = { id: 'p', type: 'text', position: { x: 0, y: 0 }, data: { text: '一只猫' } };
const asset: FileAsset = { id: 'asset', kind: 'image', name: 'image.png', url: 'blob:image' };
const file: AppNode = { id: 'f', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset] } };
const promptEdge = { id: 'p-g', source: 'p', target: 'g', targetHandle: 'prompt' };
test('text-only runs snapshot every setting, resolve upstream text, and honor count', () => {
  const run = prepareSunburstRun([generator, prompt], [promptEdge], ['g'], 2);
  assert.equal(run.tasks.length, 2); assert.equal(run.error, undefined);
  assert.equal(run.tasks[0].model, 'gpt-image-2.6-sunburst');
  assert.deepEqual(run.tasks[0].imageRequest, { ...defaultSunburstSettings, provider: 'openai', variant: 'Sunburst', prompt: '一只猫', images: [], mask: undefined });
  assert.equal(run.tasks[0].batchId, run.tasks[1].batchId);
});
test('provider is frozen per task and invalid channels block the batch before enqueue', () => {
  const node: SunburstNode = { ...generator, data: { ...generator.data, provider: 'openai' } };
  const run = prepareSunburstRun([node, prompt], [promptEdge], ['g'], 2);
  assert.equal(run.error, undefined);
  node.data.provider = 'apimart';
  assert.ok(run.tasks.every(task => task.imageRequest?.provider === 'openai' && task.model === 'gpt-image-2.6-sunburst'));
  const invalid = { ...node, data: { ...node.data, provider: 'unknown' } } as unknown as SunburstNode;
  const rejected = prepareSunburstRun([invalid, prompt], [promptEdge], ['g'], 1);
  assert.equal(rejected.tasks.length, 0);
  assert.match(rejected.error!, /渠道商/);
});
test('OpenAI keeps local quality and ignores retired parameter edges', () => {
  const upstream: AppNode = { ...prompt, id: 'quality', data: { text: 'invalid' } };
  for (const quality of ['xhigh', 'max'] as const) {
    const node: SunburstNode = { ...generator, data: { ...generator.data, provider: 'openai', variant: 'Flare', quality } };
    const result = prepareSunburstRun([node, prompt, upstream], [promptEdge,
      { id: 'legacy', source: 'quality', target: 'g', targetHandle: 'quality' },
    ], ['g'], 1);
    assert.equal(result.error, undefined);
    assert.equal(result.tasks[0].imageRequest?.quality, quality);
    assert.equal(result.tasks[0].model, 'gpt-image-2.6-flare');
  }
});

test('images retain port order and mask stays separate from source images', () => {
  const second: AppNode = { ...file, id: 'second', data: { assets: [{ ...asset, url: 'blob:second' }] } };
  const mask: AppNode = { ...file, id: 'mask', data: { assets: [{ ...asset, url: 'blob:mask' }] } };
  const result = prepareSunburstRun([generator, prompt, file, second, mask], [promptEdge,
    { id: '2', source: 'second', target: 'g', targetHandle: 'image-1' },
    { id: '1', source: 'f', target: 'g', targetHandle: 'image-0' },
    { id: 'm', source: 'mask', target: 'g', targetHandle: 'mask' }], ['g'], 1);
  assert.deepEqual(result.tasks[0].imageRequest?.images, ['blob:image', 'blob:second']);
  assert.equal(result.tasks[0].imageRequest?.mask, 'blob:mask');
});
test('missing prompt in any selected node blocks the whole batch; locks cannot enqueue', () => {
  const other = { ...generator, id: 'other' };
  assert.equal(prepareSunburstRun([generator, other, prompt], [promptEdge], ['g', 'other'], 1).tasks.length, 0);
  assert.match(prepareSunburstRun([generator], [], ['g'], 1).error!, /Prompt/);
  assert.equal(prepareSunburstRun([{ ...generator, data: { ...generator.data, locked: true } }, prompt], [promptEdge], ['g'], 1).tasks.length, 0);
  for (const runs of [0, 11, 1.5, NaN]) assert.equal(prepareSunburstRun([generator, prompt], [promptEdge], ['g'], runs).tasks.length, 0);
});
test('empty connected image, orphan mask and incompatible format fail before enqueue', () => {
  const edges = [promptEdge, { id: 'i', source: 'f', target: 'g', targetHandle: 'image-0' }];
  assert.match(prepareSunburstRun([generator, prompt], edges, ['g'], 1).error!, /Image/);
  assert.match(prepareSunburstRun([generator, prompt, file], [promptEdge, { id: 'm', source: 'f', target: 'g', targetHandle: 'mask' }], ['g'], 1).error!, /Image/);
  const incompatible: SunburstNode = { ...generator, data: { ...generator.data, background: 'transparent', outputFormat: 'jpeg' } };
  assert.match(prepareSunburstRun([incompatible, prompt], [promptEdge], ['g'], 1).error!, /PNG/);
});
test('active generated result feeds downstream Sunburst and Image Describer', () => {
  const generated = { ...generator, data: { ...generator.data, results: [asset, { ...asset, id: 'two', url: 'blob:two' }], activeResultId: 'asset' } };
  assert.equal(imageOutput(generated)[0].url, 'blob:image');
  const describer: AppNode = { id: 'd', type: 'image-describer', position: { x: 0, y: 0 }, data: { text: '', model: 'deepseek-flash', instructions: '', imageInputs: 1 } };
  assert.deepEqual(prepareDescriberRun([generated, describer], [{ id: 'gd', source: 'g', target: 'd', targetHandle: 'image-0' }], ['d'], 1).tasks[0].images, ['blob:image']);
});
test('custom size validates alignment, aspect ratio, pixel count and both edge limits', () => {
  for (const size of [...imageSizes, '2048x2048', '3840x2160', '2160x3840', '1280x512', '512x1280']) assert.equal(validateSunburstSize(size), size);
  for (const size of ['', 'custom', '1025x1024', '3841x2160', '3856x2160', '2160x3856', '1536x496', '496x1536', '512x512', '3072x3072', '0x1024', '-1024x1024', '1024xInfinity']) assert.throws(() => validateSunburstSize(size), size);
});
test('local custom settings and a saved WebP format reach the request snapshot', () => {
  const fields = { quality: 'high', background: 'opaque', size: '1536x864', outputFormat: 'webp' } as const;
  const node = { ...generator, data: { ...generator.data, ...fields } };
  const result = prepareSunburstRun([node, prompt], [promptEdge], ['g'], 1);
  assert.equal(result.error, undefined);
  for (const [field, value] of Object.entries(fields)) assert.equal(result.tasks[0].imageRequest?.[field as keyof typeof fields], value);
});
