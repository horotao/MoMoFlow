import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryNode } from '../components/libraryCatalog.ts';
import { canConnect } from './connectionRules.ts';
import { connectionChoices } from './connectionRecommendations.ts';
import { hasLegacyImageGraph, migrateLegacyImageGraph } from '../persistence/legacyImageMigration.ts';
import type { AppNode, CanvasImage } from './types.ts';
import { completeTextResult, estimateCanvasTextCost, selectTextResult, textGenerationInput, textHistory } from './textGeneration.ts';
import { estimateTextCost } from './textPricing.ts';
import type { CanvasText, TextGenerationResult } from './types.ts';

const a = { ...createLibraryNode('text', { x: 0, y: 0 }), id: 'a' };
const b = { ...createLibraryNode('text', { x: 500, y: 0 }), id: 'b' };
const image = { ...createLibraryNode('image', { x: -500, y: 0 }), id: 'image' };
const textWire = { id: 'ab', source: 'a', sourceHandle: 'text', target: 'b', targetHandle: 'text' };
const imageWire = { id: 'ib', source: 'image', sourceHandle: 'result', target: 'b', targetHandle: 'image-0' };
const nodes: AppNode[] = [a, b, image];

test('Text accepts typed inputs while rejecting wrong modalities, duplicates, cycles and locks', () => {
  assert.ok(canConnect(textWire, nodes, []));
  assert.ok(canConnect(imageWire, nodes, [textWire]));
  assert.equal(canConnect({ ...imageWire, targetHandle: 'text' }, nodes, []), false);
  assert.equal(canConnect({ ...textWire, targetHandle: 'image-0' }, nodes, []), false);
  assert.equal(canConnect(textWire, nodes, [textWire]), false);
  assert.equal(canConnect({ ...textWire, source: 'b', target: 'a' }, nodes, [textWire]), false);
  assert.equal(canConnect(textWire, [a, { ...b, data: { ...b.data, locked: true } }], []), false);
});

test('modern Text results and mixed connections survive migration, including alongside legacy nodes', () => {
  const output = { ...a, data: { ...a.data, text: '# Saved result', textComposer: { ...a.data.textComposer, format: 'md' as const } } };
  assert.equal(hasLegacyImageGraph([output, b, image], [textWire, imageWire]), false);
  for (const legacy of [[], [{ id: 'legacy', type: 'text' as const, position: { x: 0, y: 500 }, data: { text: 'Old prompt' } }]]) {
    const restored = migrateLegacyImageGraph([output, b, image, ...legacy], [textWire, imageWire]);
    assert.deepEqual(restored.nodes.find(node => node.id === a.id)?.data, output.data);
    assert.deepEqual([...restored.edges].sort((a, b) => a.id.localeCompare(b.id)), [textWire, imageWire]);
  }
});

test('connection menu offers Image Prompt and Text for text output and typed reverse creation', () => {
  const pending = { nodeId: 'a', handleId: 'text', direction: 'source' as const, screen: { x: 0, y: 0 }, position: { x: 0, y: 0 } };
  assert.deepEqual(connectionChoices(pending, nodes).map(choice => choice.itemId), ['image', 'text']);
  assert.deepEqual(connectionChoices({ ...pending, nodeId: 'image', handleId: 'result' }, nodes).map(choice => choice.itemId), ['image', 'text']);
  assert.deepEqual(connectionChoices({ ...pending, direction: 'target' }, nodes).map(choice => choice.itemId), ['text']);
});

test('Text resolves saved legacy choices, upstream output and ordered image inputs without mutating the graph', async () => {
  const { textGenerationInput, textModelSelection } = await import('./textGeneration.ts');
  const upstream = { ...a, data: { ...a.data, text: '上游内容' } };
  const target = { ...b, data: { ...b.data, textComposer: { ...b.data.textComposer, prompt: '整理成两句', selection: { modelIds: ['gpt-4o'], autoSelect: false, multiple: false } } } };
  const reference = { ...image, data: { ...image.data, results: [{ id: 'asset', name: 'ref.png', kind: 'image' as const, url: 'data:image/png;base64,aGVsbG8=' }] } };
  const result = textGenerationInput('b', [upstream, target, reference], [textWire, imageWire]);
  assert.equal(result.model, 'gpt-6.1-terra'); assert.equal(result.prompt, '上游内容\n\n整理成两句');
  assert.deepEqual(result.images, ['data:image/png;base64,aGVsbG8=']);
  assert.deepEqual(target.data.textComposer.selection.modelIds, ['gpt-4o']);
  assert.deepEqual(textModelSelection({ modelIds: ['gpt-4.1', 'o4-mini'], autoSelect: false, multiple: true }).modelIds, ['gpt-6.2-sol', 'gpt-6-luna']);
  assert.throws(() => textGenerationInput('b', [a, target, reference], [textWire, imageWire]), /上游 Text/);
  for (const quantity of [1, 3, 20]) assert.equal(textGenerationInput('b', [upstream,
    { ...target, data: { ...target.data, textComposer: { ...target.data.textComposer, quantity } } }, reference], [textWire, imageWire]).quantity, quantity);
  for (const quantity of [0, -1, 21, 1.5, NaN, Infinity]) assert.throws(() => textGenerationInput('b', [upstream,
    { ...target, data: { ...target.data, textComposer: { ...target.data.textComposer, quantity } } }, reference], [textWire, imageWire]), /数量/);
});

test('Text appends completed results, preserves legacy output and restores prompt, model and downstream text from history', () => {
  const initial = (a as CanvasText).data;
  const first: TextGenerationResult = { id: 'first', text: '# First output', prompt: 'First prompt', model: 'gpt-6.2-sol', responseId: 'response-1', createdAt: 1 };
  const second: TextGenerationResult = { id: 'second', text: '**Second output**', prompt: 'Second prompt', model: 'gpt-6-luna', responseId: 'response-2', createdAt: 2 };
  assert.deepEqual(textHistory(initial), []);
  const one = { ...initial, ...completeTextResult(initial, first) };
  const two = { ...one, ...completeTextResult({ ...one, textComposer: { ...one.textComposer, format: 'md' } }, second) };
  assert.deepEqual(two.textHistory, [first, second]);
  assert.equal(two.activeTextResultId, 'second');
  assert.equal(two.text, second.text);
  const restored = { ...two, ...selectTextResult({ ...two, textComposer: { ...two.textComposer, format: 'md' } }, first) };
  assert.equal(restored.text, first.text);
  assert.equal(restored.textComposer.prompt, first.prompt);
  assert.equal(restored.textComposer.format, 'md');
  assert.deepEqual(restored.textComposer.selection, { modelIds: ['gpt-6.2-sol'], autoSelect: false, multiple: false });
  assert.deepEqual(restored.textGeneration, { model: first.model, responseId: first.responseId, createdAt: first.createdAt });
  const target = { ...b, data: { ...b.data, textComposer: { ...(b as CanvasText).data.textComposer, prompt: 'Continue' } } };
  assert.equal(textGenerationInput('b', [{ ...a, data: restored }, target], [textWire]).prompt, `${first.text}\n\nContinue`);
  assert.deepEqual(textHistory(JSON.parse(JSON.stringify(restored))), [first, second]);
  assert.equal(one.textHistory.length, 1);
  const legacy = { ...initial, text: 'Saved before history', textGeneration: { model: 'gpt-6.1-terra', responseId: 'old', createdAt: 0 } };
  const migrated = completeTextResult(legacy, second);
  assert.equal(migrated.textHistory.length, 2);
  assert.equal(migrated.textHistory[0].text, legacy.text);
  assert.equal(migrated.textHistory[0].responseId, 'old');
});

test('an unrun Text and an uploaded image feed only the downstream request; history takes precedence after generation', () => {
  const source = { ...a, data: { ...a.data, textComposer: { ...a.data.textComposer, prompt: '描述图中主体，不超过30字。' } } };
  const reference = { ...image, data: { ...image.data, results: [{ id: 'upload', kind: 'image' as const, name: '参考图.png', url: 'https://example.com/reference.png' }] } };
  const graph = [source, b, reference];
  const edges = [textWire, imageWire];
  const before = JSON.stringify(graph);
  const input = textGenerationInput('b', graph, edges);
  assert.equal(input.prompt, source.data.textComposer.prompt);
  assert.deepEqual(input.images, [reference.data.results[0].url]);
  assert.equal(input.quantity, 1);
  assert.deepEqual(estimateCanvasTextCost('b', graph, edges), estimateTextCost(input.model, input.prompt, 1, 1, input.reasoningEffort ?? 'low', false));
  assert.equal(JSON.stringify(graph), before);
  assert.equal(source.data.text, ''); assert.deepEqual(textHistory(source.data), []);
  source.data.textComposer.prompt = '换成新的手写内容';
  assert.equal(textGenerationInput('b', graph, edges).prompt, '换成新的手写内容');
  const first: TextGenerationResult = { id: 'one', text: '第一份输出', prompt: '第一份提示词', model: 'gpt-6-luna', responseId: 'resp-1', createdAt: 1 };
  const second = { ...first, id: 'two', text: '第二份输出', responseId: 'resp-2', createdAt: 2 };
  const generated = { ...source.data, ...completeTextResult(source.data, first) };
  const latest = { ...generated, ...completeTextResult(generated, second) };
  for (const result of [first, second]) {
    const data = { ...latest, ...selectTextResult(latest, result), textComposer: { ...latest.textComposer, prompt: '尚未重新生成的编辑' } };
    assert.equal(textGenerationInput('b', [{ ...source, data }, b, reference], edges).prompt, result.text);
  }
  source.data.textComposer.prompt = ' ';
  assert.throws(() => textGenerationInput('b', graph, edges), /上游 Text 为空/);
});

test('Text snapshots reasoning settings, restores historical effort and preserves legacy low', () => {
  const initial = a.data;
  assert.equal(textGenerationInput('a', [{ ...a, data: { ...initial, textComposer: { ...initial.textComposer, prompt: 'Test' } } }], []).reasoningEffort, 'medium');
  const legacy = { ...initial, textComposer: { ...initial.textComposer, prompt: 'Test', reasoningEffort: undefined } };
  assert.equal(textGenerationInput('a', [{ ...a, data: legacy }], []).reasoningEffort, 'low');
  const result: TextGenerationResult = { id: 'effort', text: 'Output', prompt: 'Test', model: 'gpt-6-luna', responseId: 'resp', createdAt: 1, reasoningEffort: 'high' };
  const saved = { ...initial, ...completeTextResult(initial, result) };
  assert.equal(selectTextResult(saved, textHistory(saved)[0]).textComposer.reasoningEffort, 'high');
  assert.equal(selectTextResult(saved, { ...result, reasoningEffort: undefined }).textComposer.reasoningEffort, 'low');
});

test('Text saves search settings and citations, restores history defaults, and passes clickable sources downstream', () => {
  const initial = a.data;
  const text = '来自官方的信息。[来源]';
  const result: TextGenerationResult = { id: 'search', text, prompt: 'Search', model: 'gpt-6.2-sol', responseId: 'resp_search', createdAt: 1,
    webSearch: true, citations: [{ url: 'https://openai.com/', title: 'OpenAI', startIndex: text.indexOf('[来源]'), endIndex: text.length }] };
  const saved = { ...initial, ...completeTextResult(initial, result) };
  assert.equal(saved.textComposer.webSearch, true);
  assert.equal(textGenerationInput('a', [{ ...a, data: saved }], []).webSearch, true);
  assert.equal(selectTextResult(saved, { ...result, webSearch: undefined }).textComposer.webSearch, false);
  const restored = JSON.parse(JSON.stringify(saved));
  assert.deepEqual(restored.textHistory[0].citations, result.citations);
  const target = { ...b, data: { ...b.data, textComposer: { ...b.data.textComposer, prompt: 'Continue' } } };
  assert.equal(textGenerationInput('b', [{ ...a, data: restored }, target], [textWire]).prompt, '来自官方的信息。[[1]](<https://openai.com/>)\n\nContinue');
});


test('Text connects to Image Prompt with type, cycle, lock, reverse creation and mixed migration protection', () => {
  const link = { id: 'prompt', source: a.id, sourceHandle: 'text', target: image.id, targetHandle: 'prompt' };
  const target: CanvasImage = { ...(image as CanvasImage), data: { ...image.data, composer: { ...(image as CanvasImage).data.composer, prompt: '保留草稿' } } };
  const graph = [a, b, target];
  assert.ok(canConnect(link, graph, []));
  assert.equal(canConnect({ ...link, targetHandle: 'text' }, graph, []), false);
  assert.equal(canConnect({ ...link, source: image.id, sourceHandle: 'result' }, graph, []), false);
  assert.equal(canConnect(link, [a, b, { ...target, data: { ...target.data, locked: true } }], []), false);
  assert.equal(canConnect(link, [a, b, { ...target, data: { ...target.data, imageSource: 'imported' as const } }], []), false);
  assert.equal(canConnect(link, graph, [{ ...imageWire, target: a.id }]), false);
  assert.equal(hasLegacyImageGraph(graph, [link]), false);
  for (const extra of [[], [{ id: 'old', type: 'text' as const, position: { x: 0, y: 500 }, data: { text: '旧提示词' } }]]) {
    const restored = migrateLegacyImageGraph([...graph, ...extra], [link]);
    assert.deepEqual(restored.edges, [link]);
    assert.equal((restored.nodes.find(node => node.id === target.id) as typeof target).data.composer.prompt, '保留草稿');
    assert.ok(restored.nodes.some(node => node.id === a.id && node.type === 'text'));
  }
});
