import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFileAsset, fileAssets, fileNodeTitle, fileOutputKind, orderedAssets } from './fileCollection.ts';
import { resolveTextValue } from './textVariables.ts';
import { zipFiles } from './fileMedia.ts';
import type { FileAsset, FileNode, SunburstNode } from './types';
import { defaultSunburstSettings } from './sunburst.ts';
import { imageOutput } from './sunburstRun.ts';
import { restoreSunburstData } from './sunburstClipboard.ts';

const a: FileAsset = { id: 'a', name: 'Zebra.png', url: 'blob:local-a', kind: 'image' };
const b: FileAsset = { id: 'b', name: 'Apple.png', url: 'blob:local-b', kind: 'image' };
const source: FileNode = { id: 'source', type: 'file', position: { x: 1, y: 2 }, data: { assets: [a, b], activeAssetId: 'a', viewMode: 'all' } };

test('legacy files, sorting, titles and output types follow the asset collection', () => {
  assert.deepEqual(fileAssets({ asset: a }), [a]);
  assert.equal(fileNodeTitle(source.data), '2 张图片');
  assert.equal(fileOutputKind(source.data), 'image');
  assert.equal(fileOutputKind({}), 'file');
  assert.deepEqual(orderedAssets({ ...source.data, orderBy: 'name' }).map((item) => item.id), ['b', 'a']);
  assert.deepEqual(source.data.assets, [a, b]);
});

test('extracting a selected image atomically removes it from the original collection', () => {
  const result = extractFileAsset([source], 'source', 'a', { x: 90, y: 120 }, 'new') as FileNode[];
  assert.deepEqual(fileAssets(result[0].data), [b]);
  assert.equal(result[0].data.activeAssetId, 'b');
  assert.equal(fileNodeTitle(result[0].data), 'Apple.png');
  assert.deepEqual(fileAssets(result[1].data), [a]);
  assert.deepEqual(result[1].position, { x: 90, y: 120 });
  assert.deepEqual(source.data.assets, [a, b]);
  const locked = [{ ...source, data: { ...source.data, locked: true } }];
  assert.equal(extractFileAsset(locked, 'source', 'a', { x: 0, y: 0 }, 'new'), locked);
  assert.equal(resolveTextValue('source', [{ ...source, data: { ...source.data, label: 'Should not become prompt text' } }], []), '');
});

test('download-all ZIP retains bytes, unicode names and duplicates without overwriting', async () => {
  const bytes = new TextEncoder().encode('123456789');
  const archive = new Uint8Array(await zipFiles([{ name: '图片.png', bytes }, { name: '图片.png', bytes }]).arrayBuffer());
  const view = new DataView(archive.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0xcbf43926);
  const nameLength = view.getUint16(26, true);
  assert.deepEqual(archive.slice(30 + nameLength, 30 + nameLength + bytes.length), bytes);
  assert.equal(view.getUint16(archive.length - 22 + 10, true), 2);
  assert.ok(new TextDecoder().decode(archive).includes('2-图片.png'));
});

test('Sunburst sorting preserves selected output and clipboard sort preference', () => {
  const node: SunburstNode = { id: 'generator', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1, results: [a, b], orderBy: 'name' } };
  assert.deepEqual(orderedAssets({ assets: node.data.results, orderBy: node.data.orderBy }), [b, a]);
  assert.deepEqual(node.data.results, [a, b]);
  assert.equal(imageOutput(node)[0].id, 'b');
  assert.equal(restoreSunburstData(node.data)?.orderBy, 'name');
  assert.equal(restoreSunburstData({ ...node.data, orderBy: 'invalid' })?.orderBy, undefined);
});

test('Sunburst extraction moves the result atomically and retains a valid downstream output', () => {
  const source: SunburstNode = { id: 'generator', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1, results: [a, b], activeResultId: 'a', orderBy: 'name' } };
  const nodes = [source];
  const result = extractFileAsset(nodes, source.id, a.id, { x: -350, y: 170 }, 'extracted');
  const generator = result[0] as SunburstNode;
  const file = result[1] as FileNode;
  assert.deepEqual(generator.data.results, [b]);
  assert.equal(generator.data.activeResultId, 'b');
  assert.equal(imageOutput(generator)[0].id, 'b');
  assert.deepEqual(fileAssets(file.data), [a]);
  assert.deepEqual(file.position, { x: -350, y: 170 });
  assert.equal(file.selected, true);
  assert.equal(generator.selected, false);
  assert.deepEqual(source.data.results, [a, b]);
  assert.equal(extractFileAsset(nodes, source.id, 'missing', { x: 0, y: 0 }, 'new'), nodes);
  assert.equal(extractFileAsset(result, source.id, b.id, { x: 0, y: 0 }, 'new'), result);
  const locked = [{ ...source, data: { ...source.data, locked: true } }];
  assert.equal(extractFileAsset(locked, source.id, a.id, { x: 0, y: 0 }, 'new'), locked);
  assert.equal(extractFileAsset([], source.id, a.id, { x: 0, y: 0 }, 'new').length, 0);
});
