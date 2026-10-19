import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetResources, assetResources, nodeAssetUrls, taskAssetUrls, writeAssetClipboard, releaseAssetClipboard } from './assetResources.ts';
import type { FileNode, SunburstNode } from './types';

const readable = async (url: string) => assert.equal(await (await fetch(url)).text(), 'image bytes');
const revoked = async (url: string) => assert.rejects(fetch(url));

test('shared canvas/history references protect a blob until the last owner releases it', async () => {
  const resources = new AssetResources();
  const url = resources.create(new Blob(['image bytes']));
  const canvas = Symbol(), history = Symbol();
  resources.adopt(canvas, [url, url]);
  resources.setReferences(history, [url]);
  resources.release(canvas); resources.collect(); await readable(url);
  resources.release(history); resources.collect(); await revoked(url);
});

test('new async imports survive collection before commit; rejected results are released', async () => {
  const resources = new AssetResources();
  const staged = resources.create(new Blob(['image bytes']));
  resources.collect(); await readable(staged);
  resources.discard([staged]); resources.collect(); await revoked(staged);
  const committed = resources.create(new Blob(['image bytes']));
  const owner = Symbol(); resources.adopt(owner, [committed]);
  resources.discard([committed]); resources.collect(); await readable(committed);
  resources.release(owner); resources.collect(); await revoked(committed);
});

test('redo branches/history eviction release only images no longer referenced by any snapshot', async () => {
  const resources = new AssetResources(); const owner = Symbol();
  const first = resources.create(new Blob(['image bytes']));
  const second = resources.create(new Blob(['image bytes']));
  resources.adopt(owner, [first, second]);
  // Undo keeps the second image alive in future, even though only first is visible.
  resources.setReferences(owner, [first, second]); resources.collect(); await readable(second);
  // New edit discards future; older first image remains undoable.
  resources.setReferences(owner, [first]); resources.collect(); await revoked(second); await readable(first);
  // Last snapshot retaining first is evicted from the 100-step history.
  resources.release(owner); resources.collect(); await revoked(first);
});

test('queued tasks, an active worker and in-flight save hold independent leases', async () => {
  const resources = new AssetResources(); const owner = Symbol();
  const url = resources.create(new Blob(['image bytes'])); resources.adopt(owner, [url]);
  const releaseQueued = resources.retain([url]);
  const releaseWorker = resources.retain([url]); const releaseSave = resources.retain([url]);
  resources.release(owner); releaseQueued(); resources.collect(); await readable(url);
  releaseWorker(); resources.collect(); await readable(url);
  releaseSave(); releaseSave(); resources.collect(); await revoked(url);
});

test('cleanup/setup replay reacquires URLs before deferred disposal and ignores foreign URLs', async () => {
  const resources = new AssetResources(); const owner = Symbol();
  const own = resources.create(new Blob(['image bytes']));
  const foreign = URL.createObjectURL(new Blob(['image bytes']));
  resources.adopt(owner, [own, foreign]); resources.release(owner); resources.adopt(owner, [own]);
  resources.collect(); await readable(own); await readable(foreign);
  resources.release(owner); resources.collect(); await revoked(own); await readable(foreign);
  URL.revokeObjectURL(foreign);
});

test('reference collection covers legacy assets, all generated results and task mask', () => {
  const asset = { id: 'a', name: 'a', kind: 'image' as const, url: 'blob:first' };
  const file: FileNode = { id: 'f', type: 'file', position: { x: 0, y: 0 }, data: { asset, assets: [{ ...asset, url: 'blob:second' }] } };
  const generator: SunburstNode = { id: 'g', type: 'sunburst', position: { x: 0, y: 0 }, data: { imageInputs: 1, quality: 'medium', background: 'auto', size: 'auto', outputFormat: 'png', results: [asset, { ...asset, url: 'blob:third' }] } };
  assert.deepEqual([...nodeAssetUrls([file, generator])], ['blob:first', 'blob:second', 'blob:third']);
  assert.deepEqual(taskAssetUrls({ id: 't', batchId: 'b', nodeId: 'g', model: 'm', createdAt: 0, progress: 0, started: 0, state: 'Queued', images: ['blob:first'], imageRequest: { quality: 'medium', background: 'auto', size: 'auto', outputFormat: 'png', prompt: '', images: ['blob:second'], mask: 'blob:mask' } }), ['blob:first', 'blob:second', 'blob:mask']);
});

test('cut clipboard survives history eviction; failed clipboard writes preserve previous entry', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let fail = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { if (fail) throw new Error('denied'); } } } });
  const owner = Symbol();
  const first = assetResources.create(new Blob(['image bytes']));
  const next = assetResources.create(new Blob(['image bytes']));
  try {
    assetResources.adopt(owner, [first, next]);
    await writeAssetClipboard('cut first', [first]);
    assetResources.release(owner); assetResources.collect(); await readable(first); await revoked(next);
    fail = true; await assert.rejects(writeAssetClipboard('failed', []));
    assetResources.collect(); await readable(first);
    fail = false; await writeAssetClipboard('new text clipboard', []);
    assetResources.collect(); await revoked(first);
  } finally {
    releaseAssetClipboard(); assetResources.release(owner); assetResources.collect();
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
