import test from 'node:test';
import assert from 'node:assert/strict';
import { changeColorTags, changeSelectedColorTags, clearColorTags, countNodeColorTags, nodeColorTags, nodeTagHighlight, readColorTags } from './colorTags.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import { restoreSunburstData } from './sunburstClipboard.ts';
import { isCanvasImageNode, type AppNode, type CanvasImage, type CanvasText } from './types.ts';

const image = (id: string, locked = false): CanvasImage => ({ id, type: 'sunburst', position: { x: 12, y: -25 }, selected: true,
  data: { ...defaultSunburstSettings, imageInputs: 16, locked, composer: { prompt: 'hello', ratio: '1:1', quantity: 1 } } });
const text: CanvasText = { id: 'text', type: 'text', position: { x: 200, y: 40 }, data: { text: 'output',
  textComposer: { prompt: 'input', quantity: 1, format: 'md', selection: { modelIds: ['gpt-6.2-sol'], autoSelect: false, multiple: false } } } };

test('tag edits allow multiple colors, toggle separately and preserve canvas and model data', () => {
  const originalImage = image('image');
  const original = [originalImage, image('locked', true), text];
  const red = changeColorTags(original, ['image', 'locked', 'text'], 'red');
  const both = changeColorTags(red, ['image'], 'blue');
  assert.deepEqual(nodeColorTags(both[0]), ['red', 'blue']);
  assert.deepEqual(nodeColorTags(both[2]), ['red']);
  assert.equal(both[1], original[1]);
  assert.equal(both[0].position, original[0].position);
  assert.equal(both[0].selected, original[0].selected);
  assert.ok(isCanvasImageNode(both[0]));
  assert.equal(both[0].data.composer, originalImage.data.composer);
  assert.deepEqual(nodeColorTags(changeColorTags(both, ['image'], 'red')[0]), ['blue']);
  assert.deepEqual(nodeColorTags(changeColorTags(both, ['image'])[0]), []);
  assert.deepEqual(nodeColorTags(original[0]), []);
});

test('bulk clear removes only matching tags and respects locked nodes', () => {
  const nodes: AppNode[] = changeColorTags([image('a'), text], ['a', 'text'], 'red');
  const both = changeColorTags(nodes, ['a'], 'blue');
  const locked = { ...image('locked', true), data: { ...image('locked', true).data, colorTags: ['red' as const] } };
  const cleared = clearColorTags([...both, locked], 'red');
  assert.deepEqual(cleared.map(nodeColorTags), [['blue'], [], ['red']]);
  assert.equal(cleared[2], locked);
  assert.deepEqual(clearColorTags(cleared).map(nodeColorTags), [[], [], ['red']]);
});

test('the selection picker fills mixed tags, removes common tags, and skips locked and unselected nodes', () => {
  const locked = image('locked', true);
  locked.data.colorTags = ['red'];
  const nodes = changeColorTags([image('a'), { ...text, selected: true }, locked, { ...image('other'), selected: false }], ['a', 'other'], 'red');
  const added = changeSelectedColorTags(nodes, 'red');
  assert.deepEqual(added.map(nodeColorTags), [['red'], ['red'], ['red'], ['red']]);
  assert.equal(added[0], nodes[0]);
  const removed = changeSelectedColorTags(added, 'red');
  assert.deepEqual(removed.map(nodeColorTags), [[], [], ['red'], ['red']]);
  assert.deepEqual(changeSelectedColorTags(added).map(nodeColorTags), removed.map(nodeColorTags));
  assert.equal(removed[2], nodes[2]);
  assert.equal(removed[3], nodes[3]);
});

test('saved and copied tags normalize unknown or duplicate values and retain a gray tag', () => {
  assert.deepEqual(readColorTags(['blue', 'fake', 'red', 'gray', 'red']), ['red', 'blue', 'gray']);
  assert.deepEqual(readColorTags('#ff0000'), []);
  const tagged = changeColorTags([image('a')], ['a'], 'gray')[0];
  const saved = JSON.parse(JSON.stringify(tagged));
  assert.deepEqual(nodeColorTags(saved), ['gray']);
  assert.deepEqual(restoreSunburstData(saved.data)?.colorTags, ['gray']);
});

test('available filter colors count each tagged node once and disappear after the last tag is removed', () => {
  const red = changeColorTags([image('a'), text], ['a', 'text'], 'red');
  const both = changeColorTags(red, ['a'], 'blue');
  assert.deepEqual(countNodeColorTags(both), { red: 2, orange: 0, yellow: 0, green: 0, blue: 1, purple: 0, gray: 0 });
  const removedImage = both.filter(node => node.id !== 'a');
  assert.equal(countNodeColorTags(removedImage).red, 1);
  assert.equal(countNodeColorTags(removedImage).blue, 0);
  assert.ok(Object.values(countNodeColorTags(clearColorTags(removedImage))).every(count => count === 0));
  assert.ok(Object.values(countNodeColorTags([])).every(count => count === 0));
});

test('a highlight uses the matching tag color and becomes white only for multiple active matches', () => {
  assert.equal(nodeTagHighlight(['red', 'blue'], ['blue']), '#0090ff');
  assert.equal(nodeTagHighlight(['red', 'blue'], ['red', 'green']), '#ec5d5e');
  assert.equal(nodeTagHighlight(['red', 'blue'], ['red', 'blue']), '#ffffff');
  assert.equal(nodeTagHighlight(['red'], ['blue', 'green']), undefined);
  assert.equal(nodeTagHighlight(['gray'], ['gray']), '#2a2a2a');
});
