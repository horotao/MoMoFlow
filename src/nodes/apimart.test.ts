import test from 'node:test';
import assert from 'node:assert/strict';
import { apimartAspectRatios, defaultSunburstSettings, sunburstFormats, sunburstParameterData, sunburstProviderSettings } from './sunburst.ts';
import { prepareSunburstRun } from './sunburstRun.ts';
import { restoreSunburstData } from './sunburstClipboard.ts';
import { canConnect } from './connectionRules.ts';
import { preflight, requestSignature } from './executionGraph.ts';
import type { AppNode, SunburstNode, ModelInputNode } from './types';

const generator: SunburstNode = { id: 'g', type: 'sunburst', position: { x: 400, y: 0 }, data: { ...defaultSunburstSettings, provider: 'apimart', variant: 'Flare', size: '16:9', resolution: '4K', complexity: 'high', imageInputs: 1 } };
const prompt: AppNode = { id: 'p', type: 'text', position: { x: 0, y: 0 }, data: { text: 'a red circle' } };
const edge = { id: 'prompt', source: 'p', target: 'g', targetHandle: 'prompt' };
const graph = { nodes: [generator, prompt], edges: [edge] };

test('APIMart freezes resolution, complexity, provider and version in queued requests and signatures', () => {
  const result = prepareSunburstRun(graph.nodes, graph.edges, ['g'], 2);
  assert.equal(result.error, undefined);
  assert.equal(result.tasks[0].model, 'gpt-image-2.6-ext');
  assert.deepEqual(result.tasks[0].imageRequest, { ...defaultSunburstSettings, provider: 'apimart', variant: 'Flare', size: '16:9', resolution: '4K', complexity: 'high', prompt: 'a red circle', images: [], mask: undefined });
});

test('APIMart external parameters, clipboard and provider transitions preserve valid values', () => {
  const resolution: ModelInputNode = { id: 'r', type: 'model-input', position: { x: 0, y: 0 }, data: sunburstParameterData('resolution', '2K', 'apimart') };
  const nodes: AppNode[] = [generator, prompt, resolution];
  const result = prepareSunburstRun(nodes, [edge, { id: 'r-g', source: 'r', target: 'g', targetHandle: 'resolution' }], ['g'], 1);
  assert.equal(result.tasks[0].imageRequest?.resolution, '2K');
  resolution.data.model = '4K';
  assert.equal(result.tasks[0].imageRequest?.resolution, '2K');
  const restored = restoreSunburstData(JSON.parse(JSON.stringify(generator.data)));
  assert.equal(restored?.provider, 'apimart'); assert.equal(restored?.variant, 'Flare');
  assert.equal(restored?.size, '16:9'); assert.equal(restored?.resolution, '4K'); assert.equal(restored?.complexity, 'high');
  assert.deepEqual(sunburstParameterData('size', '16:9', 'apimart').options, apimartAspectRatios);
  assert.deepEqual(sunburstFormats('apimart'), ['png', 'jpeg', 'webp', 'gif']);
  assert.deepEqual(sunburstFormats('openai'), ['png', 'jpeg', 'webp', 'svg']);
  assert.equal(sunburstProviderSettings({ ...defaultSunburstSettings, size: '3840x2160' }, 'apimart').size, '16:9');
  assert.equal(sunburstProviderSettings({ ...defaultSunburstSettings, size: '3840x2160' }, 'apimart').resolution, '4K');
  assert.equal(sunburstProviderSettings(generator.data, 'openai').size, '3840x2160');
  assert.equal(sunburstProviderSettings({ ...defaultSunburstSettings, size: '1200x1008' }, 'apimart').size, 'auto');
});

test('APIMart run and workflow preflight reject masks and incompatible connected settings', () => {
  const masked = { ...graph, edges: [...graph.edges, { id: 'mask', source: 'p', target: 'g', targetHandle: 'mask' }] };
  assert.match(prepareSunburstRun(masked.nodes, masked.edges, ['g'], 1).error!, /不支持 Mask/);
  assert.throws(() => preflight(masked, ['g'], 1), /不支持 Mask/);
  assert.equal(canConnect({ source: 'p', sourceHandle: null, target: 'g', targetHandle: 'background' }, graph.nodes, []), false);
  assert.equal(canConnect({ source: 'p', sourceHandle: null, target: 'g', targetHandle: 'mask' }, graph.nodes, []), false);
  const bad: SunburstNode = { ...generator, data: { ...generator.data, size: '1024x1024' } };
  assert.match(prepareSunburstRun([bad, prompt], [edge], ['g'], 1).error!, /不支持自定义/);
});

test('APIMart resolution, complexity and version changes invalidate reusable results', () => {
  const base = prepareSunburstRun(graph.nodes, graph.edges, ['g'], 1).tasks[0];
  const signature = requestSignature(base, graph);
  for (const patch of [{ resolution: '2K' }, { complexity: 'low' }, { variant: 'Sunburst' }]) {
    const nodes = [{ ...generator, data: { ...generator.data, ...patch } } as SunburstNode, prompt];
    const task = prepareSunburstRun(nodes, [edge], ['g'], 1).tasks[0];
    assert.notEqual(requestSignature(task, { nodes, edges: [edge] }), signature);
  }
});
