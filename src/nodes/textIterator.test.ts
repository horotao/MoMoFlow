import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTextIteratorData, parseIteratorText, readTextIteratorData, validateIteratorItems } from './textIterator.ts';
import { iteratorItems, resolveTextValue } from './textVariables.ts';
import { canConnect, withoutReplacedInput } from './connectionRules.ts';
import { connectionChoices } from './connectionRecommendations.ts';
import { outputKind } from './router.ts';
import { workflowSnapshot } from '../persistence/workflowStorage.ts';
import { defaultSunburstSettings } from './sunburst.ts';
import type { AppNode, TextIteratorNode } from './types';

const iterator: TextIteratorNode = { id: 'i', type: 'text-iterator', position: { x: 1, y: 2 }, data: { items: [{ id: 'a', text: '水彩猫' }, { id: 'b', text: '像素猫' }] } };
const prompt: AppNode = { id: 'p', type: 'text', position: { x: 0, y: 0 }, data: { text: '["水彩猫", "像素猫"]' } };
const model: AppNode = { id: 'm', type: 'sunburst', position: { x: 0, y: 0 }, data: { ...defaultSunburstSettings, imageInputs: 1 } };

test('iterator input preserves multiline prompts and only expands explicit string arrays', () => {
  assert.deepEqual(parseIteratorText('第一行\n第二行').map(item => item.text), ['第一行\n第二行']);
  assert.deepEqual(parseIteratorText('["相同", "相同", "换行\\n文字"]').map(item => item.text), ['相同', '相同', '换行\n文字']);
  assert.throws(() => parseIteratorText('[broken'), /数组格式/);
  assert.throws(() => parseIteratorText('["text", 42]'), /每一项/);
  assert.throws(() => parseIteratorText(JSON.stringify(Array(51).fill('text'))), /50/);
  assert.throws(() => validateIteratorItems([]), /至少/);
  assert.throws(() => validateIteratorItems(parseIteratorText('["a", " "]')), /第 2 条/);
  assert.throws(() => validateIteratorItems(parseIteratorText('x'.repeat(32001))), /32000/);
  assert.doesNotThrow(() => validateIteratorItems(parseIteratorText(JSON.stringify(Array(50).fill('合法')))));
});

test('connected inputs are live and disconnect restores independent local entries', () => {
  const edges = [{ id: 'e', source: 'p', target: 'i', targetHandle: 'input' }];
  assert.deepEqual(iteratorItems(iterator, [iterator, prompt], edges).map(item => item.text), ['水彩猫', '像素猫']);
  assert.equal(resolveTextValue('i', [iterator, { ...prompt, data: { text: '新文本' } }], edges), '新文本');
  assert.deepEqual(iteratorItems(iterator, [iterator, prompt], []), iterator.data.items);
  assert.equal(iterator.data.items.length, 2);
  const fresh = defaultTextIteratorData(), other = defaultTextIteratorData();
  assert.equal(fresh.items.length, 1); assert.notEqual(fresh.items[0].id, other.items[0].id);
});

test('iterator ports support prompts and Router while rejecting images, invalid ports, cycles and locks', () => {
  const image: AppNode = { id: 'image', type: 'file', position: { x: 0, y: 0 }, data: { asset: { id: 'a', name: 'a', kind: 'image', url: 'blob:a' } } };
  const router: AppNode = { id: 'r', type: 'router', position: { x: 0, y: 0 }, data: {} };
  const nodes = [iterator, prompt, model, image, router];
  const input = { source: 'p', target: 'i', sourceHandle: null, targetHandle: 'input' };
  const output = { source: 'i', target: 'm', sourceHandle: 'text', targetHandle: 'prompt' };
  assert.ok(canConnect(input, nodes, [])); assert.ok(canConnect(output, nodes, []));
  assert.equal(outputKind(iterator, 'text'), 'text'); assert.equal(outputKind(iterator, 'missing'), undefined);
  assert.equal(canConnect({ ...input, source: 'image', sourceHandle: 'file' }, nodes, []), false);
  assert.equal(canConnect({ ...output, targetHandle: 'image-0' }, nodes, []), false);
  assert.equal(canConnect({ ...output, sourceHandle: 'missing' }, nodes, []), false);
  assert.equal(canConnect({ ...input, targetHandle: 'missing' }, nodes, []), false);
  assert.equal(canConnect(input, nodes.map(node => node.id === 'i' ? { ...iterator, data: { ...iterator.data, locked: true } } : node), []), false);
  assert.equal(canConnect(input, nodes, [{ id: 'cycle', source: 'i', sourceHandle: 'text', target: 'p', targetHandle: 'variable-1' }]), false);
  const route = { id: 'route', source: 'i', sourceHandle: 'text', target: 'r', targetHandle: 'input' };
  assert.ok(canConnect(route, nodes, []));
  assert.ok(canConnect({ ...output, source: 'r', sourceHandle: 'output' }, nodes, [route]));
  const existing = [{ id: 'old', source: 'other', target: 'i', targetHandle: 'input' }, route];
  assert.deepEqual(withoutReplacedInput(input, nodes, existing), [route]);
});

test('both connection directions recommend iterator with the correct source and target handles', () => {
  const pending = { nodeId: 'm', direction: 'target' as const, handleId: 'prompt', screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.equal(connectionChoices(pending, [model], []).find(choice => choice.itemId === 'text-iterator')?.handleId, 'text');
  assert.equal(connectionChoices({ ...pending, nodeId: 'p', direction: 'source', handleId: null }, [prompt], []).find(choice => choice.itemId === 'text-iterator')?.handleId, 'input');
  assert.ok(connectionChoices({ ...pending, nodeId: 'i', direction: 'source', handleId: 'text' }, [iterator], []).some(choice => choice.itemId === 'sunburst'));
});

test('snapshot and clipboard retain ordered text while rejecting malformed or oversized entries', () => {
  const saved = workflowSnapshot({ nodes: [{ ...iterator, data: { ...iterator.data, locked: true, label: '我的列表' } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, colorMode: 'dark' });
  const restored = readTextIteratorData(JSON.parse(JSON.stringify(saved.nodes[0].data)));
  assert.deepEqual(restored, { items: iterator.data.items, locked: true, label: '我的列表' });
  for (const data of [{ items: [1] }, { items: [{ id: 'a', text: 1 }] }, { items: [iterator.data.items[0], iterator.data.items[0]] }, { items: Array(51).fill(iterator.data.items[0]) }]) assert.equal(readTextIteratorData(data), undefined);
});
