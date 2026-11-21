import type { TextModelId } from './textGeneration.ts';
import type { TextReasoningEffort } from './types.ts';

// USD per million tokens, verified against the model pages on this date.
export const textPricingVersion = '2026-11-21';
export type TextRates = { input: number; cached: number; write30m: number; write12h: number; output: number; search: number };
export const textPrices: Record<TextModelId, TextRates> = {
  'gpt-6.2-sol': { input: 2, cached: .1, write30m: 2.5, write12h: 5, output: 10, search: .01 },
  'gpt-6.1-terra': { input: 1, cached: .05, write30m: 1.25, write12h: 2.5, output: 5, search: .01 },
  'gpt-6-luna': { input: .1, cached: .01, write30m: .125, write12h: .25, output: .5, search: .01 },
};
export interface TextUsage {
  inputTokens: number; cachedTokens: number; write30mTokens: number; write12hTokens: number;
  outputTokens: number; reasoningTokens: number; searchRequests?: number;
}
export interface TextBilling {
  currency: 'USD'; pricingVersion: string; model: TextModelId; serviceTier: string;
  rates: TextRates; usage: TextUsage; tokenUsd: number; searchUsd?: number; totalUsd?: number;
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

export function readTextUsage(value: unknown): TextUsage | undefined {
  const usage = record(value);
  const keys = ['inputTokens', 'cachedTokens', 'write30mTokens', 'write12hTokens', 'outputTokens', 'reasoningTokens'] as const;
  if (!keys.every(key => count(usage[key])) || (usage.searchRequests !== undefined && !count(usage.searchRequests))) return;
  const parsed = Object.fromEntries(keys.map(key => [key, usage[key]])) as unknown as TextUsage;
  if (parsed.cachedTokens + parsed.write30mTokens + parsed.write12hTokens > parsed.inputTokens || parsed.reasoningTokens > parsed.outputTokens) return;
  return { ...parsed, ...(count(usage.searchRequests) ? { searchRequests: usage.searchRequests } : {}) };
}

/** Use tool_usage's billable count; output search items can include discounted calls. */
export function responseTextUsage(value: unknown, webSearch: boolean): TextUsage | undefined {
  const response = record(value), usage = record(response.usage), details = record(usage.input_tokens_details);
  const writes = record(details.cache_write_tokens_details);
  const writeCount = details.cache_write_tokens ?? 0;
  // The request does not set extended retention; older responses omit TTL details.
  const write12hTokens = writes.ttl_12h_tokens ?? 0;
  const write30mTokens = writes.ttl_30m_tokens ?? (count(writeCount) && count(write12hTokens) ? writeCount - write12hTokens : undefined);
  if (!count(writeCount) || !count(write30mTokens) || !count(write12hTokens) || writeCount !== write30mTokens + write12hTokens) return;
  const searchUsage = record(record(response.tool_usage).web_search);
  const noSearch = Array.isArray(response.output) && !response.output.some(item => record(item).type === 'web_search_call');
  return readTextUsage({ inputTokens: usage.input_tokens, cachedTokens: details.cached_tokens,
    write30mTokens, write12hTokens, outputTokens: usage.output_tokens,
    reasoningTokens: record(usage.output_tokens_details).reasoning_tokens ?? 0,
    searchRequests: count(searchUsage.num_requests) ? searchUsage.num_requests : !webSearch || noSearch ? 0 : undefined });
}

function bill(usage: TextUsage, rates: TextRates) {
  const uncached = usage.inputTokens - usage.cachedTokens - usage.write30mTokens - usage.write12hTokens;
  const tokenUsd = (uncached * rates.input + usage.cachedTokens * rates.cached + usage.write30mTokens * rates.write30m
    + usage.write12hTokens * rates.write12h + usage.outputTokens * rates.output) / 1e6;
  const searchUsd = usage.searchRequests === undefined ? undefined : usage.searchRequests * rates.search;
  return { tokenUsd, ...(searchUsd === undefined ? {} : { searchUsd, totalUsd: tokenUsd + searchUsd }) };
}

export function textBilling(model: TextModelId, response: unknown, webSearch: boolean, baseUrl: string): { usage?: TextUsage; billing?: TextBilling } {
  const usage = responseTextUsage(response, webSearch);
  if (!usage) return {};
  // A compatible gateway can charge different rates; never call list-price math its actual bill.
  if (baseUrl.replace(/\/+$/, '') !== 'https://api.openai.com/v1') return { usage };
  const tier = record(response).service_tier ?? 'default';
  const factor = tier === 'default' || tier === 'standard' ? 1 : tier === 'fast' || tier === 'priority' ? 2 : tier === 'flex' ? .5 : undefined;
  if (factor === undefined || typeof tier !== 'string') return { usage };
  // Aggregated tool turns do not expose the per-turn long-context billing boundary.
  if (webSearch && usage.inputTokens > 272000) return { usage };
  const long = usage.inputTokens > 272000;
  const base = textPrices[model];
  const rates: TextRates = { input: base.input * factor * (long ? 2 : 1), cached: base.cached * factor * (long ? 2 : 1),
    write30m: base.write30m * factor * (long ? 2 : 1), write12h: base.write12h * factor * (long ? 2 : 1),
    output: base.output * factor * (long ? 1.5 : 1), search: base.search };
  return { usage, billing: { currency: 'USD', pricingVersion: textPricingVersion, model, serviceTier: tier, rates, usage, ...bill(usage, rates) } };
}

export function readTextBilling(value: unknown): TextBilling | undefined {
  const data = record(value), prices = record(data.rates), usage = readTextUsage(data.usage);
  const keys = ['input', 'cached', 'write30m', 'write12h', 'output', 'search'] as const;
  if (!usage || data.currency !== 'USD' || typeof data.model !== 'string' || !Object.prototype.hasOwnProperty.call(textPrices, data.model)
    || typeof data.serviceTier !== 'string' || typeof data.pricingVersion !== 'string' || data.pricingVersion.length > 40
    || !keys.every(key => amount(prices[key]))) return;
  const rates = Object.fromEntries(keys.map(key => [key, prices[key]])) as unknown as TextRates;
  const computed = bill(usage, rates);
  for (const key of ['tokenUsd', 'searchUsd', 'totalUsd'] as const) {
    const expected = computed[key], actual = data[key];
    if (expected === undefined ? actual !== undefined : !amount(actual) || Math.abs(actual - expected) > 1e-9) return;
  }
  return { currency: 'USD', pricingVersion: data.pricingVersion, model: data.model as TextModelId, serviceTier: data.serviceTier, rates, usage, ...computed };
}

export function estimateTextCost(model: TextModelId, prompt: string, imageCount: number, quantity: number, effort: TextReasoningEffort, webSearch: boolean) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
  const wide = (prompt.match(/[^\p{ASCII}]/gu) ?? []).length;
  const input = Math.ceil((prompt.length - wide) / 4 + wide + 32 + imageCount * 1536 + (webSearch ? 2304 : 0));
  const reasoning: Record<TextReasoningEffort, number> = { low: 128, medium: 768, high: 3072, xhigh: 6144, max: 12288 };
  const rates = textPrices[model];
  return ((input * rates.input + (512 + reasoning[effort]) * rates.output) / 1e6 + (webSearch ? rates.search : 0)) * quantity;
}

export function textCostLabel(value?: number, estimated = false) {
  if (!amount(value)) return '—';
  const prefix = estimated ? '≈' : '';
  if (value > 0 && value < .000001) return `${prefix}<$0.000001`;
  return `${prefix}$${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 6 })}`;
}

export function textBillingDescription(billing?: TextBilling) {
  if (!billing) return '该结果缺少完整计费用量或渠道费率，无法确认本次花费；旧记录不会按当前价格补算。';
  const usage = billing.usage;
  return `按 OpenAI ${billing.pricingVersion} 单价与本次实际用量计算（美元），最终以账单为准。输入 ${usage.inputTokens} tokens，缓存读取 ${usage.cachedTokens}，缓存写入 ${usage.write30mTokens + usage.write12hTokens}；输出 ${usage.outputTokens}（已含推理 ${usage.reasoningTokens}）。${usage.searchRequests === undefined ? '搜索计费次数未返回，总费用未知。' : `计费搜索 ${usage.searchRequests} 次。`}`;
}
