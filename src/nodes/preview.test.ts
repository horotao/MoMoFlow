import test from 'node:test';
import assert from 'node:assert/strict';
import { previewImages } from './preview.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices, choiceConnection, type PendingConnection } from './connectionRecommendations.ts';
import { defaultPainterData, painterRevision } from './painter.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { AppNode, PainterNode, PreviewNode, FileAsset } from './types';

const asset = (id: string): FileAsset => ({ id, name: `${id}.png`, kind: 'image', url: `blob:${id}` });
const preview: PreviewNode = { id: 'preview', type: 'preview', position: { x: 0, y: 0 }, data: {} };
const painter: PainterNode = { id: 'paint', type: 'painter', position: { x: 0, y: 0 }, data: { ...defaultPainterData, result: asset('result'), mask: asset('mask'), outputRevision: painterRevision(defaultPainterData) } };
const image: AppNode = { id: 'import', type: 'file', position: { x: 0, y: 0 }, data: { assets: [asset('one'), asset('two')] } };
const edge = { id: 'edge', source: painter.id, sourceHandle: 'result', target: preview.id, targetHandle: 'file' };

test('Preview reads Result and black-white Mask independently and follows render invalidation', () => {
  assert.deepEqual(previewImages(preview.id, [painter, preview], [edge]), [painter.data.result]);
  assert.deepEqual(previewImages(preview.id, [painter, preview], [{ ...edge, sourceHandle: 'mask' }]), [painter.data.mask]);
  const changed = { ...painter, data: { ...painter.data, background: '#ff0000' } };
  assert.deepEqual(previewImages(preview.id, [changed, preview], [edge]), []);
  assert.deepEqual(previewImages(preview.id, [painter, preview], []), []);
  assert.deepEqual(previewImages(preview.id, [preview], [edge]), []);
});

test('Preview shows an Import collection and the selected Sunburst result', () => {
  assert.deepEqual(previewImages(preview.id, [preview, image], [{ ...edge, source: image.id, sourceHandle: 'file' }]).map(item => item.id), ['one', 'two']);
  const generator: AppNode = { id: 'generate', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1, results: [asset('old'), asset('new')], activeResultId: 'old' } };
  const connection = { ...edge, source: generator.id };
  assert.equal(previewImages(preview.id, [preview, generator], [connection])[0].id, 'old');
  assert.equal(previewImages(preview.id, [preview, { ...generator, data: { ...generator.data, activeResultId: 'new' } }], [connection])[0].id, 'new');
});

test('Preview only accepts a single image connection and has no outgoing connections', () => {
  const nodes = [preview, painter, image];
  assert.equal(canConnect(edge, nodes, []), true);
  assert.equal(canConnect({ ...edge, sourceHandle: 'mask' }, nodes, []), true);
  assert.equal(canConnect(edge, nodes, [edge]), false);
  assert.equal(canConnect({ ...edge, targetHandle: 'wrong' }, nodes, []), false);
  assert.equal(canConnect(edge, [{ ...preview, data: { locked: true } }, painter], []), false);
  assert.equal(canConnect({ ...edge, source: preview.id, target: painter.id, targetHandle: 'image' }, nodes, []), false);
  for (const source of [
    { id: 'bad', type: 'text' as const, position: { x: 0, y: 0 }, data: { text: 'hello' } },
    { ...image, id: 'bad', data: { assets: [{ ...asset('video'), kind: 'video' as const }] } },
  ]) assert.equal(canConnect({ ...edge, source: 'bad' }, [preview, source], []), false);
});

test('dragging either Painter output offers Preview, reverse drag offers Result and Mask', () => {
  const pending: PendingConnection = { nodeId: painter.id, handleId: 'result', direction: 'source', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  for (const handleId of ['result', 'mask']) {
    const start = { ...pending, handleId };
    const choice = connectionChoices(start, [painter], []).find(item => item.itemId === 'preview')!;
    assert.ok(choice);
    assert.equal(canConnect(choiceConnection(start, choice, preview.id), [painter, preview], []), true);
  }
  const start: PendingConnection = { ...pending, nodeId: preview.id, handleId: 'file', direction: 'target' };
  const choices = connectionChoices(start, [preview], []);
  assert.deepEqual(choices.filter(item => item.itemId === 'painter').map(item => item.handleId), ['result', 'mask']);
  const empty: AppNode = { ...image, data: {} };
  const connection = choiceConnection(start, choices[0], empty.id);
  assert.equal(canConnect(connection, [preview, empty], []), false);
  assert.equal(canConnect(connection, [preview, empty], [], empty.id), true);
  assert.deepEqual(connectionChoices({ ...start, direction: 'source' }, [preview], []), []);
});
