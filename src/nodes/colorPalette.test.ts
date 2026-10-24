import test from 'node:test';
import assert from 'node:assert/strict';
import { insertPaletteColor, movePaletteColor, paletteBands, paletteDocument, paletteRevision, paletteText, restorePaletteData } from './colorPalette.ts';
import { imageOutput } from './sunburstRun.ts';
import { resolveTextValue } from './textVariables.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, type PendingConnection } from './connectionRecommendations.ts';
import { nodeAssetUrls } from './assetResources.ts';
import { mapAssets } from '../persistence/workflowStorage.ts';
import type { AppNode, ColorPaletteNode } from './types';

const colors = [{ id: 'red', hex: '#FF0000' }, { id: 'green', hex: '#00FF00' }, { id: 'blue', hex: '#0000FF' }];
const palette: ColorPaletteNode = { id: 'palette', type: 'color-palette', position: { x: 0, y: 0 }, data: { colors, outputRevision: paletteRevision(colors), result: { id: 'image', name: 'palette.png', kind: 'image', url: 'blob:palette', width: 1024, height: 1024 } } };
const preview: AppNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
const prompt: AppNode = { id: 'prompt', type: 'text', position: { x: 0, y: 0 }, data: { text: '' } };
const nodes = [palette, preview, prompt];
const edge = { id: 'edge', source: palette.id, sourceHandle: 'text', target: prompt.id, targetHandle: 'variable-1' };

test('palette insertion is bounded, preserves duplicate colors, and reorder keeps stable identities', () => {
  let next = colors;
  for (let i = 0; i < 15; i++) next = insertPaletteColor(next, 1);
  assert.equal(next.length, 10);
  assert.equal(new Set(next.map(color => color.id)).size, 10);
  assert.equal(next[1].hex, '#FFFFFF');
  assert.equal(insertPaletteColor(next), next);
  assert.deepEqual(movePaletteColor(colors, 'blue', 0).map(color => color.id), ['blue', 'red', 'green']);
  assert.deepEqual(movePaletteColor(colors, 'red', 99).map(color => color.id), ['green', 'blue', 'red']);
  assert.equal(movePaletteColor(colors, 'missing', 1), colors);
  assert.equal(colors[0].id, 'red');
});

test('every palette size fills the PNG without gaps or overlaps and follows display order', () => {
  for (let count = 1; count <= 10; count++) {
    const bands = paletteBands(Array.from({ length: count }, (_, i) => colors[i % 3]));
    assert.equal(bands[0].y, 0);
    assert.equal(bands.reduce((sum, band) => sum + band.height, 0), 1024);
    for (let i = 1; i < count; i++) assert.equal(bands[i].y, bands[i - 1].y + bands[i - 1].height);
  }
  assert.deepEqual(paletteBands([]), []);
  assert.deepEqual(paletteBands(movePaletteColor(colors, 'blue', 0)).map(band => band.hex), ['#0000FF', '#FF0000', '#00FF00']);
});

test('palette text is ordered HEX joined with asterisks and updates downstream dynamically', () => {
  assert.equal(paletteText(colors), '#FF0000*#00FF00*#0000FF');
  assert.equal(resolveTextValue(prompt.id, nodes, [edge]), paletteText(colors));
  const reordered = { ...palette, data: { ...palette.data, colors: movePaletteColor(colors, 'blue', 0) } };
  assert.equal(resolveTextValue(prompt.id, [reordered, prompt], [edge]), '#0000FF*#FF0000*#00FF00');
  assert.equal(paletteText([]), '');
});

test('image output rejects stale, empty and wrong-port results even without a graph', () => {
  assert.deepEqual(imageOutput(palette, 'image'), [palette.data.result]);
  for (const handle of ['text', 'result', undefined]) assert.deepEqual(imageOutput(palette, handle), []);
  for (const value of [[], colors.slice(1), movePaletteColor(colors, 'red', 2), [{ id: 'red', hex: '#FFFFFF' }]]) {
    assert.deepEqual(imageOutput({ ...palette, data: { ...palette.data, colors: value } }, 'image'), []);
  }
  assert.deepEqual(paletteDocument(palette.data), { colors, label: undefined, locked: undefined });
});

test('palette has no inputs and routes image and text exclusively to compatible inputs', () => {
  const connection = { source: palette.id, sourceHandle: 'image', target: preview.id, targetHandle: 'file' };
  assert.equal(canConnect(connection, nodes, []), true);
  assert.equal(canConnect({ ...connection, sourceHandle: 'text' }, nodes, []), false);
  assert.equal(canConnect(edge, nodes, []), true);
  assert.equal(canConnect({ ...edge, sourceHandle: 'image' }, nodes, []), false);
  assert.equal(canConnect({ ...edge, sourceHandle: null }, nodes, []), false);
  assert.equal(canConnect({ ...edge, source: prompt.id, target: palette.id }, nodes, []), false);
  assert.equal(canConnect(edge, nodes, [edge]), false);
  assert.equal(canConnect(edge, [{ ...palette, data: { ...palette.data, locked: true } }, prompt], []), false);
  const imageConsumers: AppNode[] = ['crop', 'blur', 'levels', 'invert', 'rotate-flip', 'painter', 'color-correction', 'image-describer', 'sunburst'].map(type => ({ id: type, type, position: { x: 0, y: 0 }, data: {} } as AppNode));
  for (const target of imageConsumers) {
    const targetHandle = target.type === 'color-correction' ? 'file' : ['sunburst', 'image-describer'].includes(target.type!) ? 'image-0' : 'image';
    assert.equal(canConnect({ ...connection, target: target.id, targetHandle }, [palette, target], []), true, target.type);
    assert.equal(canConnect({ ...connection, sourceHandle: 'text', target: target.id, targetHandle }, [palette, target], []), false, target.type);
  }
  for (const type of ['sunburst', 'image-describer']) {
    const target = { id: type, type, position: { x: 0, y: 0 }, data: { exposed: ['instructions'] } } as AppNode;
    assert.equal(canConnect({ ...connection, sourceHandle: 'text', target: type, targetHandle: type === 'sunburst' ? 'prompt' : 'instructions' }, [palette, target], []), true);
  }
});

test('connection recommendations distinguish both outputs in both directions', () => {
  const pending: PendingConnection = { nodeId: palette.id, handleId: 'image', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.ok(connectionChoices(pending, nodes, []).some(choice => choice.itemId === 'preview'));
  assert.equal(connectionChoices(pending, nodes, []).some(choice => choice.itemId === 'text'), false);
  assert.ok(connectionChoices({ ...pending, handleId: 'text' }, nodes, []).some(choice => choice.itemId === 'text'));
  for (const [nodeId, handleId, expected] of [['preview', 'file', 'image'], ['prompt', 'variable-1', 'text']]) {
    assert.equal(connectionChoices({ ...pending, nodeId, handleId, direction: 'target' }, nodes, []).find(choice => choice.itemId === 'color-palette')?.handleId, expected);
  }
});

test('clipboard validates color data and regenerates identities; persisted PNG participates in asset ownership', () => {
  const restored = restorePaletteData({ ...palette.data, locked: true });
  assert.ok(restored); assert.equal(restored.locked, false);
  assert.equal(paletteText(restored.colors), paletteText(colors));
  assert.notEqual(restored.colors[0].id, colors[0].id);
  assert.equal(restored.result, undefined);
  for (const value of [null, {}, { colors: 'red' }, { colors: [{ hex: 'url(invalid)' }] }, { colors: Array(11).fill(colors[0]) }]) assert.equal(restorePaletteData(value), undefined);
  assert.equal(restorePaletteData({ colors: [{ hex: '#abc' }] })?.colors[0].hex, '#AABBCC');
  assert.deepEqual([...nodeAssetUrls([palette])], ['blob:palette']);
  const mapped = mapAssets([palette], asset => ({ ...asset, url: 'blob:restored' }))[0] as ColorPaletteNode;
  assert.equal(mapped.data.result?.url, 'blob:restored');
  assert.equal(imageOutput(mapped, 'image')[0]?.url, 'blob:restored');
});
