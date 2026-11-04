import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge } from '@xyflow/react';
import type { AppNode, FileAsset } from './types';
import { nodeConnectionColor, nodeEdgeStyle, nodePortKind } from './nodeConnectionStyle.ts';
import { nodeConnectionColors } from './nodePortAppearance.ts';
import { modelParameterPosition, nodeConnectionOffset, nodePortCenterY } from './nodeLayout.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { defaultNanoBananaSettings } from './nanoBanana.ts';
import { defaultCompositorDocument } from './compositor.ts';

const position = { x: 0, y: 0 };
const node = (type: string, data: Record<string, unknown> = {}): AppNode => ({ id: type, type, position, data }) as AppNode;
const wire = (source: string, sourceHandle: string | null, target: string, targetHandle: string): Edge => ({ id: `${source}-${target}`, source, sourceHandle, target, targetHandle });

test('all source families use shared visual kinds without merging mask semantics', () => {
  const sources: [string, string | null, string][] = [
    ['text', null, 'text'], ['text-iterator', 'text', 'text'], ['image-describer', null, 'text'], ['model-input', null, 'text'], ['position-logger', null, 'text'],
    ['image-iterator', 'file', 'image'], ['color-palette', 'image', 'image'], ['color-palette', 'text', 'text'],
    ['painter', 'result', 'image'], ['painter', 'mask', 'mask'], ['masks-extractor', 'result', 'image'], ['masks-extractor', 'mask', 'mask'], ['matte-grow-shrink', 'result', 'mask'],
    ['compare', 'output-1', 'image'], ['compare', 'output-2', 'image'],
    ...['sunburst', 'nano-banana', 'ideogram', 'blend', 'compositor', 'resize', 'rotate-flip', 'invert', 'levels', 'blur', 'crop', 'color-correction'].map(type => [type, 'result', 'image'] as [string, string, string]),
  ];
  for (const [type, handle, expected] of sources) assert.equal(nodePortKind(node(type), handle, 'source'), expected, type);
  for (const kind of ['image', 'video', 'audio', '3d'] as const) {
    const file = node('file', { assets: [{ id: 'asset', name: 'asset', url: 'blob:fixture', kind } satisfies FileAsset] });
    assert.equal(nodePortKind(file, 'file', 'source'), kind);
  }
  assert.equal(nodePortKind(node('file'), 'file', 'source'), 'file');
  assert.equal(nodeConnectionColors.image, nodeConnectionColors.mask);
  assert.notEqual(nodePortKind(node('painter'), 'result', 'source'), nodePortKind(node('painter'), 'mask', 'source'));
});

test('forward edges, reversed input previews and Router chains share color resolution', () => {
  const paint = node('painter'), prompt = node('text', { text: 'hello' }), first = node('router'), second = { ...node('router'), id: 'next' };
  const model = node('sunburst', { ...defaultSunburstSettings, imageInputs: 2, exposed: ['quality'] });
  const nodes = [paint, prompt, first, second, model];
  for (const sourceHandle of ['result', 'mask']) {
    const edges = [wire('painter', sourceHandle, 'router', 'input'), wire('router', 'output', 'next', 'input'), wire('next', 'output', 'sunburst', 'mask')];
    assert.equal(nodePortKind(second, 'output', 'source', nodes, edges), sourceHandle === 'mask' ? 'mask' : 'image');
    for (const edge of edges) assert.equal(nodeEdgeStyle(edge, nodes, edges).stroke, '#80B9F1');
    assert.equal(nodeConnectionColor(second, 'input', 'target', nodes, edges), '#80B9F1');
    assert.equal(nodeConnectionColor(model, 'mask', 'target', nodes, edges), '#80B9F1');
    assert.equal(nodeConnectionColor(model, 'image-1', 'target', nodes, edges), '#80B9F1');
  }
  const textEdges = [wire('text', null, 'router', 'input'), wire('router', 'output', 'next', 'input')];
  assert.equal(nodeConnectionColor(second, 'output', 'source', nodes, textEdges), '#5F5F5F');
  assert.equal(nodeConnectionColor(model, 'quality', 'target', nodes, textEdges), '#5F5F5F');
  assert.equal(nodePortKind(second, 'output', 'source', nodes, []), 'unknown');
  assert.equal(nodeConnectionColor(second, 'output', 'source', nodes, []), '#5F5F5F');
});

test('dynamic inputs, exposed parameters and double outputs retain distinct rows', () => {
  const model = node('sunburst', { ...defaultSunburstSettings, imageInputs: 3, exposed: ['quality', 'size'] });
  assert.equal(nodePortCenterY(model, 'prompt', 'target'), 95);
  assert.equal(nodePortCenterY(model, 'image-2', 'target'), 221);
  assert.equal(nodePortCenterY(model, 'mask', 'target'), 263);
  assert.equal(nodePortCenterY(model, 'size', 'target'), 347);
  const banana = node('nano-banana', { ...defaultNanoBananaSettings, imageInputs: 2, exposed: ['imageSize'] });
  assert.equal(nodePortCenterY(banana, 'imageSize', 'target'), 221);
  const describer = node('image-describer', { imageInputs: 2, exposed: ['instructions'] });
  assert.equal(nodePortCenterY(describer, 'instructions', 'target'), 179);
  for (const [type, handle] of [['compare', 'output-2'], ['painter', 'mask'], ['masks-extractor', 'mask'], ['color-palette', 'text']]) assert.equal(nodePortCenterY(node(type), handle, 'source'), 137);
  const doc = defaultCompositorDocument();
  const compositor = node('compositor', { document: doc });
  doc.inputs.forEach((input, index) => assert.equal(nodePortCenterY(compositor, input.id, 'target'), 95 + index * 42));
});

test('creation offsets land on the actual connection edge for all shared frames', () => {
  assert.deepEqual(nodeConnectionOffset(node('text', { text: '' }), null, 'source'), { x: 528, y: 95 });
  assert.deepEqual(nodeConnectionOffset(node('file'), 'file', 'source'), { x: 476, y: 95 });
  assert.deepEqual(nodeConnectionOffset(node('nano-banana', { imageInputs: 1 }), 'image-0', 'target'), { x: 0, y: 137 });
  assert.deepEqual(nodeConnectionOffset(node('sunburst', { imageInputs: 1 }), 'image-0', 'target'), { x: 0, y: 137 });
  assert.deepEqual(nodeConnectionOffset(node('blend'), 'front', 'target'), { x: 0, y: 137 });
  assert.deepEqual(nodeConnectionOffset(node('painter'), 'mask', 'source'), { x: 476, y: 137 });
  assert.deepEqual(nodeConnectionOffset(node('router'), 'output', 'source'), { x: 420, y: 45 });
  assert.deepEqual(nodeConnectionOffset(node('model-input'), null, 'source'), { x: 420, y: 95 });
});


test('exposed parameter placement accounts for the enlarged input frame', () => {
  const parent = { ...node('sunburst'), position: { x: 1000, y: 80 } };
  assert.deepEqual(modelParameterPosition(parent, [parent], 0), { x: 490, y: 80 });
  assert.deepEqual(modelParameterPosition(parent, [parent], 2), { x: 490, y: 480 });
});

test('re-exposing parameters avoids neighbors and retained inputs without moving them', () => {
  const parent = { ...node('sunburst'), position: { x: 1000, y: 80 } };
  const existing = [parent, { ...node('model-input'), position: { x: 490, y: 80 }, width: 250, measured: { height: 140 } },
    { ...node('text'), position: { x: 490, y: 260 }, measured: { height: 300 } }];
  const before = structuredClone(existing);
  assert.deepEqual(modelParameterPosition(parent, existing, 0), { x: 490, y: 600 });
  assert.deepEqual(existing, before);
});
