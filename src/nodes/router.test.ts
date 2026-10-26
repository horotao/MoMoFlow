import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset, RouterNode, TextNode, PainterNode } from './types';
import { outputKind, replaceRouterInput, resolveOutputSource, routerFromOutput } from './router.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices } from './connectionRecommendations.ts';
import { resolveTextValue } from './textVariables.ts';
import { imageOutput, prepareSunburstRun } from './sunburstRun.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { defaultPainterData, painterRevision } from './painter.ts';
import { invertRevision } from './invert.ts';
import { mapAssets, workflowSnapshot } from '../persistence/workflowStorage.ts';

const position = { x: 0, y: 0 };
const router = (id = 'router'): RouterNode => ({ id, type: 'router', position, data: {} });
const prompt = (id = 'prompt', text = 'A red balloon'): TextNode => ({ id, type: 'text', position, data: { text } });
const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}`, width: 3840, height: 2160 });
const file: AppNode = { id: 'file', type: 'file', position, data: { assets: [asset('a'), asset('b')] } };
const preview: AppNode = { id: 'preview', type: 'preview', position, data: {} };
const edge = (source: string, target: string, sourceHandle: string | null = null, targetHandle = 'input'): Edge => ({ id: `${source}-${target}`, source, target, sourceHandle, targetHandle });

test('Router forwards live text to multiple branches and chains, and clears disconnected values', () => {
  const nodes = [prompt(), router(), router('next'), prompt('first', ''), prompt('second', '')];
  const edges = [edge('prompt', 'router'), edge('router', 'next', 'output'), edge('router', 'first', 'output', 'variable-1'), edge('next', 'second', 'output', 'variable-1')];
  for (const id of ['router', 'next', 'first', 'second']) assert.equal(resolveTextValue(id, nodes, edges), 'A red balloon');
  assert.equal(resolveTextValue('second', nodes.map(node => node.id === 'prompt' ? prompt('prompt', 'Blue sky') : node), edges), 'Blue sky');
  assert.equal(resolveTextValue('second', nodes, edges.slice(1)), '');
  const cycle = [edge('next', 'router', 'output'), edge('router', 'next', 'output')];
  assert.equal(resolveTextValue('next', nodes, cycle), '');
  assert.deepEqual(imageOutput(router(), 'output', nodes, cycle), []);
  assert.equal(resolveOutputSource(router(), 'output', nodes, cycle), undefined);
});

test('Router preserves full image collections, source handles and output invalidation', () => {
  const nodes = [file, router(), router('next')];
  const edges = [edge('file', 'router', 'file'), edge('router', 'next', 'output')];
  assert.deepEqual(imageOutput(router('next'), 'output', nodes, edges), [asset('a'), asset('b')]);
  assert.deepEqual(imageOutput(router(), 'invalid', nodes, edges), []);
  assert.deepEqual(imageOutput(router(), 'output', nodes, []), []);
  assert.equal(resolveTextValue('router', nodes, edges), '');
  const palette: AppNode = { id: 'palette', type: 'color-palette', position, data: { colors: [{ id: 'red', hex: '#FF0000' }, { id: 'white', hex: '#FFFFFF' }] } };
  assert.equal(resolveTextValue('router', [palette, router()], [edge('palette', 'router', 'text')]), '#FF0000*#FFFFFF');
  assert.equal(resolveTextValue('router', [palette, router()], [edge('palette', 'router', 'image')]), '');
  const invert: AppNode = { id: 'invert', type: 'invert', position, data: { baseImage: asset('a'), result: asset('inverse'), outputRevision: invertRevision('a') } };
  const connected = [edge('invert', 'router', 'result')];
  assert.equal(imageOutput(router(), 'output', [invert, router()], connected)[0].id, 'inverse');
  assert.deepEqual(imageOutput(router(), 'output', [{ ...invert, data: { ...invert.data, baseImage: asset('b') } }, router()], connected), []);
});

test('Router replacement preserves branches, checks all consumers, and rejects locks, invalid ports and cycles', () => {
  const nodes = [prompt(), prompt('other'), file, router(), router('next'), preview, prompt('consumer', '')];
  const input = edge('prompt', 'router');
  const branch = edge('router', 'consumer', 'output', 'variable-1');
  const current = [input, branch];
  const replacement = edge('other', 'router');
  assert.ok(canConnect(replacement, nodes, current));
  assert.deepEqual(replaceRouterInput(replacement, nodes, current), [branch]);
  assert.equal(canConnect(edge('file', 'router', 'file'), nodes, current), false);
  assert.equal(canConnect(edge('router', 'preview', 'output', 'file'), nodes, current), false);
  assert.ok(canConnect(edge('file', 'router', 'file'), nodes, []));
  assert.ok(canConnect(edge('router', 'preview', 'output', 'file'), nodes, [edge('file', 'router', 'file')]));
  assert.equal(canConnect(edge('router', 'preview', 'bad', 'file'), nodes, []), false);
  assert.equal(canConnect(edge('prompt', 'router', null, 'bad'), nodes, []), false);
  assert.equal(canConnect(replacement, nodes.map(node => node.type === 'router' ? { ...node, data: { locked: true } } : node), current), false);
  const chain = [edge('router', 'next', 'output'), edge('next', 'preview', 'output', 'file')];
  assert.equal(canConnect(input, nodes, chain), false);
  assert.ok(canConnect(edge('file', 'router', 'file'), nodes, chain));
  assert.equal(canConnect(edge('next', 'router', 'output'), nodes, chain), false);
  assert.equal(canConnect(edge('router', 'router', 'output'), nodes, []), false);
  assert.equal(canConnect(edge('preview', 'router', null), nodes, []), false);
});

test('Empty Router can be wired first, and recommendations follow its current input and downstream requirements', () => {
  const nodes = [prompt(), file, router(), preview];
  const output = edge('router', 'preview', 'output', 'file');
  assert.ok(canConnect(output, nodes, []));
  assert.equal(canConnect(edge('prompt', 'router'), nodes, [output]), false);
  const pending = { nodeId: 'router', handleId: 'output', direction: 'source' as const, screen: position, position };
  const textChoices = connectionChoices(pending, nodes, [edge('prompt', 'router')]);
  assert.ok(textChoices.some(item => item.itemId === 'text'));
  assert.ok(!textChoices.some(item => item.itemId === 'preview'));
  assert.deepEqual(connectionChoices(pending, nodes.map(node => node.id === 'prompt' ? { ...node, data: { ...node.data, locked: true } } as AppNode : node), [edge('prompt', 'router')]), textChoices);
  const imageChoices = connectionChoices(pending, nodes, [edge('file', 'router', 'file')]);
  assert.ok(imageChoices.some(item => item.itemId === 'preview'));
  assert.ok(!imageChoices.some(item => item.itemId === 'text'));
  const reverse = connectionChoices({ ...pending, direction: 'target', handleId: 'input' }, nodes, [output]);
  assert.ok(reverse.some(item => item.itemId === 'file'));
  assert.ok(!reverse.some(item => item.itemId === 'text'));
  for (const item of ['text', 'preview', 'router']) assert.ok(connectionChoices(pending, nodes, []).some(choice => choice.itemId === item));
});

test('Painter Mask and Invert mask conversion reach Sunburst through Router chains', () => {
  const painter: PainterNode = { id: 'painter', type: 'painter', position, data: { ...defaultPainterData, result: asset('result'), mask: asset('mask'), alphaMask: asset('alpha'), outputRevision: painterRevision(defaultPainterData) } };
  const generator: AppNode = { id: 'generate', type: 'sunburst', position, data: { ...defaultSunburstSettings, imageInputs: 1 } };
  const nodes = [painter, generator, prompt(), file, router(), router('next')];
  const edges = [edge('prompt', 'generate', null, 'prompt'), edge('file', 'generate', 'file', 'image-0'), edge('painter', 'router', 'mask'), edge('router', 'next', 'output'), edge('next', 'generate', 'output', 'mask')];
  assert.equal(outputKind(router(), 'output', nodes, edges), 'mask');
  assert.equal(imageOutput(router(), 'output', nodes, edges)[0].url, 'blob:mask');
  const run = prepareSunburstRun(nodes, edges, ['generate'], 1);
  assert.equal(run.error, undefined);
  assert.equal(run.tasks[0].imageRequest?.mask, 'blob:alpha');
  const invert: AppNode = { id: 'painter', type: 'invert', position, data: { baseImage: asset('a'), result: asset('inverse'), outputRevision: invertRevision('a') } };
  const inverse = prepareSunburstRun(nodes.map(node => node.id === 'painter' ? invert : node), edges.map(edge => edge.source === 'painter' ? { ...edge, sourceHandle: 'result' } : edge), ['generate'], 1);
  assert.equal(inverse.tasks[0].imageRequest?.maskMode, 'luminance');
});

test('Quick creation and persistence retain graph references without copying assets', () => {
  const nodes = [file, preview], edges = [edge('file', 'preview', 'file', 'file')];
  const graph = routerFromOutput('file', 'file', { x: 500, y: 100 }, nodes, edges, 'router')!;
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.deepEqual(graph.edges[0], edges[0]);
  assert.deepEqual(graph.nodes[2].data, {});
  assert.equal(routerFromOutput('preview', null, position, nodes, edges, 'bad'), undefined);
  const stored = workflowSnapshot({ ...graph, colorMode: 'dark', viewport: { x: 0, y: 0, zoom: 1 } });
  const mapped = mapAssets(stored.nodes, asset => ({ ...asset, url: `blob:restored-${asset.id}` }));
  assert.deepEqual(imageOutput(mapped[2], 'output', mapped, stored.edges).map(asset => asset.url), ['blob:restored-a', 'blob:restored-b']);
});
