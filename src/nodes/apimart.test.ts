import test from 'node:test';
import assert from 'node:assert/strict';
import { apimartSvgModelEfforts, defaultSunburstSettings, sunburstFormats, sunburstProviderSettings, validateApimartGifSize } from './sunburst.ts';
import { prepareSunburstRun } from './sunburstRun.ts';
import { restoreSunburstData } from './sunburstClipboard.ts';
import { canConnect } from './connectionRules.ts';
import { graphGuard, preflight, requestSignature, type ExecutionGraph } from './executionGraph.ts';
import type { AppNode, SunburstNode } from './types';

const generator: SunburstNode = { id: 'g', type: 'sunburst', position: { x: 400, y: 0 }, data: { ...defaultSunburstSettings, provider: 'apimart', variant: 'Flare', size: '16:9', resolution: '4K', complexity: 'high', imageInputs: 1 } };
const prompt: AppNode = { id: 'p', type: 'text', position: { x: 0, y: 0 }, data: { text: 'a red circle' } };
const edge = { id: 'prompt', source: 'p', target: 'g', targetHandle: 'prompt' };
const graph = { nodes: [generator, prompt], edges: [edge] };

test('APIMart freezes resolution, fixed settings, provider and version in queued requests and signatures', () => {
  const result = prepareSunburstRun(graph.nodes, graph.edges, ['g'], 2);
  assert.equal(result.error, undefined);
  assert.equal(result.tasks[0].model, 'gpt-image-2.6-ext');
  assert.deepEqual(result.tasks[0].imageRequest, { ...defaultSunburstSettings, channelModel: 'gpt-image-2.6-ext', provider: 'apimart', variant: 'Flare', size: '16:9', resolution: '4K', complexity: 'auto', moderation: 'low', prompt: 'a red circle', images: [], mask: undefined });
});

test('APIMart clipboard and provider transitions preserve valid values', () => {
  const restored = restoreSunburstData(JSON.parse(JSON.stringify(generator.data)));
  assert.equal(restored?.provider, 'apimart'); assert.equal(restored?.variant, 'Flare');
  assert.equal(restored?.size, '16:9'); assert.equal(restored?.resolution, '4K'); assert.equal(restored?.complexity, 'auto');
  assert.deepEqual(sunburstFormats('apimart'), ['png', 'jpeg', 'webp', 'gif']);
  assert.deepEqual(sunburstFormats('openai'), ['png', 'jpeg', 'webp', 'svg']);
  assert.equal(sunburstProviderSettings({ ...defaultSunburstSettings, size: '3840x2160' }, 'apimart').size, '16:9');
  assert.equal(sunburstProviderSettings({ ...defaultSunburstSettings, size: '3840x2160' }, 'apimart').resolution, '4K');
  assert.equal(sunburstProviderSettings(generator.data, 'openai').size, '3840x2160');
  assert.equal(sunburstProviderSettings({ ...defaultSunburstSettings, size: '1200x1008' }, 'apimart').size, 'auto');
});

test('APIMart run and workflow preflight reject masks and incompatible local settings', () => {
  const masked = { ...graph, edges: [...graph.edges, { id: 'mask', source: 'p', target: 'g', targetHandle: 'mask' }] };
  assert.match(prepareSunburstRun(masked.nodes, masked.edges, ['g'], 1).error!, /不支持 Mask/);
  assert.throws(() => preflight(masked, ['g'], 1), /不支持 Mask/);
  assert.equal(canConnect({ source: 'p', sourceHandle: null, target: 'g', targetHandle: 'background' }, graph.nodes, []), false);
  assert.equal(canConnect({ source: 'p', sourceHandle: null, target: 'g', targetHandle: 'mask' }, graph.nodes, []), false);
  const bad: SunburstNode = { ...generator, data: { ...generator.data, size: '1024x1024' } };
  assert.match(prepareSunburstRun([bad, prompt], [edge], ['g'], 1).error!, /不支持自定义/);
});

test('APIMart resolution and version changes invalidate reusable results', () => {
  const base = prepareSunburstRun(graph.nodes, graph.edges, ['g'], 1).tasks[0];
  const signature = requestSignature(base, graph);
  for (const patch of [{ resolution: '2K' }, { variant: 'Sunburst' }]) {
    const nodes = [{ ...generator, data: { ...generator.data, ...patch } } as SunburstNode, prompt];
    const task = prepareSunburstRun(nodes, [edge], ['g'], 1).tasks[0];
    assert.notEqual(requestSignature(task, { nodes, edges: [edge] }), signature);
  }
});

test('removed APIMart controls ignore legacy values and do not schedule connected upstream models', () => {
  for (const channelModel of ['gpt-image-2.6-ext', 'gpt-image-2.6'] as const) {
    const node: SunburstNode = { ...generator, data: { ...generator.data, channelModel, moderation: 'auto', exposed: ['complexity', 'moderation'] } };
    // This model would fail preflight if its obsolete connection scheduled it.
    const legacy: AppNode = { ...generator, id: 'legacy' };
    const edges = [edge, ...['complexity', 'moderation'].map(field => ({ id: field, source: legacy.id, target: node.id, targetHandle: field }))];
    const nodes: AppNode[] = [node, prompt, legacy];
    const connected = { nodes, edges };
    const dependencies = preflight(connected, ['g'], 1).get('g')!;
    assert.ok([...dependencies].every(key => !key.startsWith('legacy:')));
    const prepared = prepareSunburstRun(nodes, edges, ['g'], 1);
    assert.equal(prepared.error, undefined);
    assert.equal(prepared.tasks[0].imageRequest?.complexity, 'auto');
    assert.equal(prepared.tasks[0].imageRequest?.moderation, 'low');
    for (const targetHandle of ['complexity', 'moderation']) {
      assert.equal(canConnect({ source: 'p', sourceHandle: null, target: 'g', targetHandle }, nodes, []), false);
    }
    const changed: SunburstNode = { ...node, data: { ...node.data, complexity: 'low', moderation: 'low' } };
    const nextGraph: ExecutionGraph = { nodes: [changed, prompt], edges: [edge] };
    const next = prepareSunburstRun(nextGraph.nodes, nextGraph.edges, ['g'], 1).tasks[0];
    assert.equal(requestSignature(next, nextGraph), requestSignature(prepared.tasks[0], connected));
    assert.equal(graphGuard(nextGraph, 'g', true), graphGuard(connected, 'g', true));
  }
});

test('APIMart local channel model, SVG effort and GIF frames freeze in requests', () => {
  const node: SunburstNode = { ...generator, data: { ...generator.data, channelModel: 'gpt-image-2.6', outputFormat: 'svg', svgModel: 'gpt-6.1-sol', svgEffort: 'max' } };
  const nodes = [node, prompt];
  const edges = [edge];
  assert.doesNotThrow(() => preflight({ nodes, edges }, ['g'], 1));
  const prepared = prepareSunburstRun(nodes, edges, ['g'], 1);
  assert.equal(prepared.error, undefined);
  assert.equal(prepared.tasks[0].model, 'gpt-image-2.6-flare');
  assert.equal(prepared.tasks[0].imageRequest?.svgModel, 'gpt-6.1-sol');
  assert.equal(prepared.tasks[0].imageRequest?.svgEffort, 'max');
  const signature = requestSignature(prepared.tasks[0], { nodes, edges });
  node.data.svgEffort = 'high';
  assert.notEqual(requestSignature(prepareSunburstRun(nodes, edges, ['g'], 1).tasks[0], { nodes, edges }), signature);
  assert.equal(prepared.tasks[0].imageRequest?.svgEffort, 'max');
  node.data.svgEffort = 'none';
  assert.match(prepareSunburstRun(nodes, edges, ['g'], 1).error!, /effort/);
  assert.throws(() => preflight({ nodes, edges }, ['g'], 1), /effort/);
  assert.equal(apimartSvgModelEfforts('gpt-6-luna').includes('none'), true);
  assert.equal(apimartSvgModelEfforts('gpt-6.1-sol').includes('none'), false);
  const gif: SunburstNode = { ...generator, data: { ...generator.data, channelModel: 'gpt-image-2.6', outputFormat: 'gif', size: 'auto', frameCount: 16 } };
  assert.equal(prepareSunburstRun([gif, prompt], edges, ['g'], 1).tasks[0].imageRequest?.frameCount, 16);
  gif.data.frameCount = 1;
  assert.match(prepareSunburstRun([gif, prompt], edges, ['g'], 1).error!, /2–16/);
});

test('APIMart standard accepts image references for all formats and masks only for static output', () => {
  const image: AppNode = { id: 'ref', type: 'file', position: { x: 0, y: 0 }, data: { assets: [{ id: 'a', name: 'a.png', kind: 'image', url: 'blob:a' }] } };
  const edges = [edge, { id: 'image', source: 'ref', sourceHandle: 'file', target: 'g', targetHandle: 'image-0' }];
  const maskEdge = { id: 'mask', source: 'ref', sourceHandle: 'file', target: 'g', targetHandle: 'mask' };
  for (const outputFormat of ['png', 'gif', 'svg'] as const) {
    const node: SunburstNode = { ...generator, data: { ...generator.data, channelModel: 'gpt-image-2.6', size: 'auto', outputFormat } };
    const nodes: AppNode[] = [node, prompt, image];
    assert.doesNotThrow(() => preflight({ nodes, edges }, ['g'], 1));
    assert.equal(prepareSunburstRun(nodes, edges, ['g'], 1).tasks[0].imageRequest?.images[0], 'blob:a');
    const canvasNode: SunburstNode = { ...node, data: { ...node.data, composer: { prompt: 'prompt', ratio: 'auto', quantity: 1 } } };
    const reference: SunburstNode = { ...canvasNode, id: image.id };
    assert.equal(canConnect({ ...maskEdge, sourceHandle: 'result' }, [canvasNode, reference], []), false);
    if (outputFormat === 'png') assert.equal(prepareSunburstRun(nodes, [...edges, maskEdge], ['g'], 1).error, undefined);
    else assert.throws(() => preflight({ nodes, edges: [...edges, maskEdge] }, ['g'], 1), /Mask/);
  }
});

test('APIMart standard settings survive clipboard and GIF sheet limits follow frame count', () => {
  const data = { ...generator.data, channelModel: 'gpt-image-2.6' as const, outputFormat: 'svg' as const, size: '1600x1200', moderation: 'auto' as const, background: 'transparent' as const, svgModel: 'gpt-6.1-sol' as const, svgEffort: 'max' as const, frameCount: 16 };
  for (const provider of ['apimart', 'openai'] as const) {
    const restored = restoreSunburstData({ ...data, provider });
    assert.equal(restored?.channelModel, 'gpt-image-2.6');
    assert.equal(restored?.svgModel, 'gpt-6.1-sol'); assert.equal(restored?.svgEffort, 'max');
    assert.equal(restored?.frameCount, 16); assert.equal(restored?.moderation, provider === 'apimart' ? 'low' : 'auto');
    assert.equal(restored?.size, '1600x1200');
  }
  for (let count = 2; count <= 16; count++) assert.equal(validateApimartGifSize('512x512', count), '512x512');
  assert.equal(validateApimartGifSize('768x768', 12), '768x768');
  assert.throws(() => validateApimartGifSize('768x768', 13));
  assert.throws(() => validateApimartGifSize('1024x1024', 2));
  assert.equal(sunburstProviderSettings({ ...data, outputFormat: 'gif', size: '512x512' }, 'openai').size, 'auto');
  assert.equal(sunburstProviderSettings({ ...data, size: '9:21', resolution: '4K' }, 'openai').size, '1648x3840');
});
