import test from 'node:test';
import assert from 'node:assert/strict';
import { creationBounds, defaultText, graphicPadding, isGraphicSource, normalizePath, pathCommands, wrapText } from './compositorGraphics.ts';
import { compositorLayout, compositorRevision, createLayer, defaultCompositorDocument, newEffect, restoreCompositorData, snapshotCompositor } from './compositor.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import { snapTargets } from './compositor/canvasGeometry.ts';
import type { CompositorNode } from './types';

test('Drawing bounds support all drag directions, Shift ratio and Alt center with size limits', () => {
  assert.deepEqual(creationBounds({ x: 100, y: 80 }, { x: 40, y: 100 }), { x: 40, y: 80, width: 60, height: 20, rotation: 0 });
  assert.deepEqual(creationBounds({ x: 100, y: 80 }, { x: 40, y: 100 }, true, true), { x: 40, y: 20, width: 120, height: 120, rotation: 0 });
  assert.equal(creationBounds({ x: 0, y: 0 }, { x: 1e5, y: 1e5 }).width, 16384);
});

test('Normalized Bézier geometry retains every anchor and handle and closes with a curve', () => {
  const points = [{ x: 20, y: 30, out: { x: 30, y: 10 } }, { x: 60, y: 70, in: { x: 40, y: 80 }, out: { x: 70, y: 90 } }];
  const { source, transform } = normalizePath(points, true);
  source.points.forEach((point, index) => {
    assert.equal(point.x * transform.width + transform.x, points[index].x);
    assert.equal(point.y * transform.height + transform.y, points[index].y);
  });
  assert.equal(isGraphicSource(source), true);
  assert.equal(pathCommands(points, true), 'M 20 30 C 30 10 40 80 60 70 C 70 90 20 30 20 30 Z');
});

test('Text wrapping preserves explicit line breaks, words and CJK glyphs', () => {
  const measure = (text: string) => Array.from(text).length * 10;
  assert.deepEqual(wrapText('hello world\n中文测试\n', 50, measure), ['hello', 'world', '中文测试', '']);
  assert.deepEqual(wrapText('长字符串😀abc', 30, measure), ['长字符', '串😀a', 'bc']);
});

test('Graphics are editable document data, survive snapshots, and do not allocate asset URLs', () => {
  const document = defaultCompositorDocument();
  document.layers.push({ ...createLayer('text', 'Text', defaultText()), transform: { x: 30, y: 20, width: 300, height: 100, rotation: 15 } });
  const node: CompositorNode = { id: 'comp', type: 'compositor', position: { x: 0, y: 0 }, data: { document } };
  const restored = restoreCompositorData(JSON.parse(JSON.stringify(node.data)));
  assert.deepEqual(restored?.document, document);
  assert.deepEqual(snapshotCompositor(document, {}), document);
  assert.deepEqual(nodeAssetUrls([node]), new Set());
  let mapped = 0;
  assert.deepEqual((mapAssets([node], asset => { mapped++; return asset; })[0] as CompositorNode).data.document.layers[2], document.layers[2]);
  assert.equal(mapped, 0);
  const copy = structuredClone(document);
  const text = copy.layers[2].source;
  if (text.kind === 'text') text.text = 'updated';
  assert.notEqual(compositorRevision(copy, {}), compositorRevision(document, {}));
  assert.equal(isGraphicSource(document.layers[2].source), true);
  assert.notDeepEqual(copy.layers[2], document.layers[2]);
  const targets = snapTargets(compositorLayout(document, {}), 'background');
  assert.ok(targets.x.length > 3, 'Graphics participate in alignment');
});

test('Restoration rejects corrupt graphics, unbounded text and missing graphic transforms', () => {
  assert.equal(isGraphicSource({ ...defaultText(), fontSize: Infinity }), false);
  assert.equal(isGraphicSource({ ...defaultText(), text: 'a'.repeat(10001) }), false);
  assert.equal(isGraphicSource({ kind: 'path', fill: null, closed: true, points: [{ x: 0, y: 0 }, { x: NaN, y: 1 }] }), false);
  assert.equal(isGraphicSource({ kind: 'shape', shape: 'script', fill: '#ffffff' }), false);
  const document = defaultCompositorDocument(); document.layers.push(createLayer('bad', 'Text', defaultText()));
  assert.equal(restoreCompositorData({ document }), undefined);
});

test('Graphic bounds reserve transparent room for thick joins and chained blur without toggle jitter', () => {
  const layer = createLayer('path', 'Path', { kind: 'path', fill: null, closed: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  layer.stroke = { enabled: true, width: 10, color: '#ffffff', join: 'miter' };
  assert.equal(graphicPadding(layer), 50);
  layer.effects = [newEffect('blur')];
  const padding = graphicPadding(layer); assert.ok(padding > 50);
  layer.effects[0].enabled = false;
  assert.equal(graphicPadding(layer), padding);
});
