import assert from 'node:assert/strict';
import test from 'node:test';
import { createLibraryNode } from '../components/libraryCatalog.ts';
import { createImportedCanvasImage } from './importCanvasImage.ts';
import { runGenerationSelection, selectedGenerationNodes } from './selectionGeneration.ts';

test('batch targets are visible selected generation nodes, including those awaiting input', () => {
  const origin = { x: 0, y: 0 };
  const text = createLibraryNode('text', origin)!;
  const image = createLibraryNode('image', origin)!;
  const imported = createImportedCanvasImage({ id: 'static', name: 'Static', url: 'blob:static', kind: 'image' }, origin);
  const locked = { ...text, id: 'locked', data: { ...text.data, locked: true } } as typeof text;
  const candidates = [imported, text, image, locked, { ...image, id: 'hidden', hidden: true }]
    .map(node => ({ ...node, selected: true }));
  assert.deepEqual(selectedGenerationNodes([...candidates, { ...text, id: 'other', selected: false }]).map(node => node.id), [text.id, image.id]);
});

test('independent nodes start together, and a dependent node waits for both selected references', async () => {
  const calls: string[] = [];
  let finishA!: (result: boolean) => void;
  let finishB!: (result: boolean) => void;
  const inputA = new Promise<boolean>(resolve => { finishA = resolve; });
  const inputB = new Promise<boolean>(resolve => { finishB = resolve; });
  const edges = [
    { id: 'ad', source: 'a', target: 'downstream' },
    { id: 'bd', source: 'b', target: 'downstream' },
    { id: 'xd', source: 'unselected', target: 'downstream' },
  ];
  const pending = new Map<string, Promise<boolean>>();
  const start = (id: string) => {
    calls.push(id);
    return id === 'a' ? inputA : id === 'b' ? inputB : Promise.resolve(true);
  };
  const run = runGenerationSelection(['downstream', 'a', 'b'], edges, start, pending);
  await Promise.resolve();
  assert.deepEqual(calls, ['a', 'b']);
  const repeated = runGenerationSelection(['a', 'b', 'downstream'], edges, start, pending);
  finishA(true);
  await Promise.resolve();
  assert.deepEqual(calls, ['a', 'b']);
  finishB(true);
  await Promise.all([run, repeated]);
  assert.deepEqual(calls, ['a', 'b', 'downstream']);
  assert.equal(pending.size, 0);
});

test('failed dependencies and invalid cycles leave independent targets runnable', async () => {
  const calls: string[] = [];
  await runGenerationSelection(['cycle-a', 'cycle-b', 'dependent', 'failed', 'independent'], [
    { id: 'cycle1', source: 'cycle-a', target: 'cycle-b' },
    { id: 'cycle2', source: 'cycle-b', target: 'cycle-a' },
    { id: 'failed', source: 'failed', target: 'dependent' },
  ], async id => { calls.push(id); return id !== 'failed'; });
  assert.deepEqual(calls, ['failed', 'independent']);
});
