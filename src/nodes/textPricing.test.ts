import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTextCost, readTextBilling, responseTextUsage, textBilling, textCostLabel, textPrices } from './textPricing.ts';
import { createLibraryNode } from '../components/libraryCatalog.ts';
import { completeTextBatchResult, completeTextResult, estimateCanvasTextCost, selectTextResult, textHistory } from './textGeneration.ts';
import type { TextGenerationResult } from './types.ts';

const official = 'https://api.openai.com/v1';
const response = {
  service_tier: 'default', output: [{ type: 'web_search_call', action: { type: 'search' } }],
  usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 150,
    cache_write_tokens_details: { ttl_30m_tokens: 100, ttl_12h_tokens: 50 } }, output_tokens: 200, output_tokens_details: { reasoning_tokens: 100 } },
  tool_usage: { web_search: { num_requests: 2 } },
};

test('Text billing separates cache reads and both write TTLs, includes reasoning once, and uses billable search counts', () => {
  const { billing } = textBilling('gpt-6.2-sol', response, true, official);
  assert.ok(billing);
  assert.ok(Math.abs(billing.tokenUsd - .00382) < 1e-12);
  assert.equal(billing.searchUsd, .02);
  assert.ok(Math.abs(billing.totalUsd! - .02382) < 1e-12);
  assert.equal(billing.usage.reasoningTokens, 100);
  const discounted = textBilling('gpt-6.2-sol', { ...response, tool_usage: { web_search: { num_requests: 0 } } }, true, official).billing!;
  assert.equal(discounted.searchUsd, 0, 'do not count discounted output search items as billed calls');
  assert.equal(discounted.totalUsd, discounted.tokenUsd);
});

test('Text rates cover all three models, standard app batches, processing tiers and long contexts', () => {
  const simple = { output: [], usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1000 } };
  for (const model of ['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna'] as const) {
    const standard = textBilling(model, simple, false, official).billing!;
    assert.equal(standard.totalUsd, (textPrices[model].input + textPrices[model].output) / 1000);
    assert.equal(textBilling(model, { ...simple, service_tier: 'priority' }, false, official).billing?.totalUsd, standard.totalUsd! * 2);
    assert.equal(textBilling(model, { ...simple, service_tier: 'flex' }, false, official).billing?.totalUsd, standard.totalUsd! / 2);
  }
  const long = { ...simple, usage: { ...simple.usage, input_tokens: 300000 } };
  assert.equal(textBilling('gpt-6.2-sol', long, false, official).billing?.totalUsd, 1.215);
  assert.equal(textBilling('gpt-6.2-sol', long, true, official).billing, undefined);
});

test('Text billing keeps unknown usage, search counts, gateway rates and unsupported tiers unknown', () => {
  assert.equal(textBilling('gpt-6.2-sol', {}, false, official).billing, undefined);
  assert.equal(textBilling('gpt-6.2-sol', response, true, 'https://gateway.example/v1').billing, undefined);
  assert.ok(textBilling('gpt-6.2-sol', response, true, 'https://gateway.example/v1').usage);
  assert.equal(textBilling('gpt-6.2-sol', { ...response, service_tier: 'unknown' }, true, official).billing, undefined);
  const missingSearch = textBilling('gpt-6.2-sol', { ...response, tool_usage: undefined }, true, official).billing!;
  assert.ok(missingSearch.tokenUsd > 0); assert.equal(missingSearch.totalUsd, undefined);
  assert.equal(textCostLabel(missingSearch.totalUsd), '—');
  assert.equal(responseTextUsage({ ...response, usage: { ...response.usage, input_tokens: -1 } }, true), undefined);
  assert.equal(responseTextUsage({ ...response, usage: { ...response.usage, input_tokens: 10 } }, true), undefined);
  assert.equal(responseTextUsage({ ...response, usage: { ...response.usage, output_tokens: 1 } }, true), undefined);
  assert.equal(readTextBilling({ ...textBilling('gpt-6.2-sol', response, true, official).billing, totalUsd: -1 }), undefined);
});

test('Text estimates react to quantity, reasoning, search, upstream text and images without affecting stored result costs', () => {
  const base = estimateTextCost('gpt-6.2-sol', 'Hello', 0, 1, 'low', false)!;
  assert.equal(estimateTextCost('gpt-6.2-sol', 'Hello', 0, 3, 'low', false), base * 3);
  assert.ok(estimateTextCost('gpt-6.2-sol', 'Hello', 0, 1, 'high', false)! > base);
  assert.ok(estimateTextCost('gpt-6.2-sol', 'Hello', 0, 1, 'low', true)! > base + .01);
  assert.ok(estimateTextCost('gpt-6.2-sol', 'Hello', 1, 1, 'low', false)! > base);
  assert.equal(estimateTextCost('gpt-6.2-sol', '', 0, 0, 'low', false), undefined);
  const a = { ...createLibraryNode('text', { x: 0, y: 0 }), id: 'a' };
  const b = { ...createLibraryNode('text', { x: 500, y: 0 }), id: 'b' };
  a.data.text = '上游文字'.repeat(100);
  assert.ok(estimateCanvasTextCost('b', [a, b], [{ id: 'ab', source: 'a', sourceHandle: 'text', target: 'b', targetHandle: 'text' }])! > estimateCanvasTextCost('b', [a, b], [])!);
  assert.equal(textCostLabel(.0000001), '<$0.000001');
  assert.equal(textCostLabel(0), '$0.000');
  assert.match(textCostLabel(base, true), /^≈\$/);
});

test('Text history and out-of-order batches keep each bill snapshot through settings, price edits, save and restore', () => {
  const initial = createLibraryNode('text', { x: 0, y: 0 }).data;
  const first: TextGenerationResult = { id: 'a', text: 'First', prompt: 'Prompt', model: 'gpt-6.2-sol', responseId: 'resp-a', createdAt: 1,
    ...textBilling('gpt-6.2-sol', response, true, official) };
  const second = { ...first, id: 'b', text: 'Second', model: 'gpt-6-luna', ...textBilling('gpt-6-luna', response, true, official) };
  let data = { ...initial, ...completeTextBatchResult(initial, second, ['a', 'b'], true) };
  data = { ...data, ...completeTextBatchResult(data, first, ['a', 'b'], false) };
  const restored = JSON.parse(JSON.stringify(data));
  assert.deepEqual(textHistory(restored).map(item => item.id), ['a', 'b']);
  const saved = textHistory(restored)[0].billing!;
  assert.equal(selectTextResult(restored, first).text, 'First');
  const previous = textPrices['gpt-6.2-sol'].input;
  try {
    textPrices['gpt-6.2-sol'].input = 999;
    assert.equal(readTextBilling(saved)?.totalUsd, first.billing?.totalUsd);
    assert.notEqual(readTextBilling(saved)?.totalUsd, second.billing?.totalUsd);
  } finally { textPrices['gpt-6.2-sol'].input = previous; }
  assert.equal(completeTextResult(initial, { ...first, billing: undefined, usage: undefined }).textHistory[0].billing, undefined);
});
