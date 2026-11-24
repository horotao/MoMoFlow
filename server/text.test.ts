import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { textPlugin, buildTextRequest } from './text.ts';
import { captureMiddleware } from './testMiddleware.ts';
import { readSse } from '../src/nodes/responseStream.ts';
import { readTextResponse } from '../src/nodes/textGenerationClient.ts';
import { deepSeekFlashModel } from '../src/nodes/textGeneration.ts';

const input = { model: 'gpt-6.2-sol', prompt: '你好', images: [] };
const png = 'data:image/png;base64,aGVsbG8=';
const sse = (items: object[]) => new Response(items.map(item => `data: ${JSON.stringify(item)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
const completed = (model = input.model, text = '你好，世界') => ({ type: 'response.completed', response: { id: 'resp_test', model, status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] } });
async function invoke(provider: typeof fetch, body: unknown = input, headers: Record<string, string> = {}, hook: 'configureServer' | 'configurePreviewServer' = 'configureServer', key = 'test-openai-key') {
  const middleware = captureMiddleware(textPlugin({ openai: key, apimart: key ? 'test-apimart-key' : '' }, provider), hook);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end(); }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/text`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, text: await response.text(), headers: response.headers };
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('all three Text model IDs produce Responses payloads with ordered text and image inputs', () => {
  for (const model of ['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna']) {
    const request = buildTextRequest({ ...input, model, images: [png, png] });
    assert.equal(request.provider, 'openai');
    const body = request.payload;
    assert.equal(body.model, model); assert.equal(body.stream, true); assert.equal(body.store, false);
    assert.deepEqual(body.reasoning, { effort: 'low' });
    assert.deepEqual(body.input[0].content, [{ type: 'input_text', text: '你好' }, { type: 'input_image', image_url: png, detail: 'auto' }, { type: 'input_image', image_url: png, detail: 'auto' }]);
  }
  for (const bad of [{ ...input, model: 'gpt-4.1' }, { ...input, prompt: '' }, { ...input, images: ['https://internal/image'] }, { ...input, images: Array(17).fill(png) }]) assert.throws(() => buildTextRequest(bad));
});
test('Text reasoning settings reach the provider and reject invalid values before submission', async () => {
  for (const reasoningEffort of ['low', 'medium', 'high', 'xhigh', 'max']) {
    const result = await invoke(async (_url, options) => {
      assert.equal(JSON.parse(String(options?.body)).reasoning.effort, reasoningEffort);
      return sse([completed()]);
    }, { ...input, reasoningEffort });
    assert.equal(result.status, 200);
    assert.match(result.text, new RegExp(`"reasoningEffort":"${reasoningEffort}"`));
  }
  for (const reasoningEffort of ['none', 'invalid', 42]) {
    const result = await invoke(async () => { assert.fail('invalid effort must not reach provider'); }, { ...input, reasoningEffort });
    assert.equal(result.status, 400);
  }
});
for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
  test(`${hook}: streams real deltas and final result, excluding provider internals`, async () => {
    let calls = 0;
    const result = await invoke(async (url, options) => {
      calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-openai-key');
      assert.equal(JSON.parse(String(options?.body)).model, input.model);
      assert.equal(options?.redirect, 'error');
      return sse([{ type: 'response.created', response: { internal: 'hidden' } }, { type: 'response.output_text.delta', delta: '你好，' }, { type: 'response.output_text.delta', delta: '世界' }, completed()]);
    }, input, {}, hook);
    assert.equal(result.status, 200); assert.equal(calls, 1);
    const events = []; for await (const event of readSse(new Response(result.text).body!, new AbortController().signal)) events.push(event);
    assert.deepEqual(events.map(event => event.type), ['delta', 'delta', 'completed']);
    assert.equal(events[2].text, '你好，世界'); assert.equal(result.text.includes('hidden'), false);
    const clientText: string[] = [];
    const response = new Response(result.text, { headers: result.headers });
    const output = await readTextResponse(response, new AbortController().signal, value => clientText.push(value));
    assert.equal(output.model, input.model); assert.deepEqual(clientText, ['你好，', '你好，世界', '你好，世界']);
  });
}
test('Text uses explicit BYOK settings without mixing provider keys or retrying', async () => {
  let calls = 0;
  const result = await invoke(async (url, options) => {
    calls++; assert.equal(url, 'https://gateway.example/v1/responses');
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer custom-text-key');
    return sse([completed()]);
  }, input, { 'x-momoflow-provider': 'openai', 'x-momoflow-api-key': 'custom-text-key', 'x-momoflow-base-url': 'https://gateway.example/v1' });
  assert.equal(result.status, 200); assert.equal(calls, 1);
  assert.equal((await invoke(async () => { assert.fail('no key must not submit'); }, input, {}, 'configureServer', '')).status, 503);
  assert.equal((await invoke(async () => { assert.fail('wrong provider must not submit'); }, input, { 'x-momoflow-provider': 'deepseek', 'x-momoflow-api-key': 'x', 'x-momoflow-base-url': 'https://example.com' })).status, 400);
});
test('Text HTTP and streaming failures redact credentials and never report partial text as success', async () => {
  for (const provider of [
    async () => Response.json({ error: { message: 'bad Bearer test-openai-key' } }, { status: 429 }),
    async () => sse([{ type: 'response.output_text.delta', delta: 'partial' }, { type: 'response.failed', response: { error: { message: 'test-openai-key' } } }]),
    async () => sse([{ type: 'response.output_text.delta', delta: 'partial' }]),
    async () => sse([{ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }]),
    async () => sse([completed('gpt-other')]),
  ]) {
    let calls = 0;
    const result = await invoke(async () => { calls++; return provider(); });
    assert.equal(calls, 1); assert.equal(result.text.includes('test-openai-key'), false);
    const response = new Response(result.text, { status: result.status, headers: result.headers });
    await assert.rejects(readTextResponse(response, new AbortController().signal, () => {}));
  }
});
test('SSE decoder handles split UTF-8, CRLF, multiline data and cancellation', async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\ndata: {"type":"delta",\r\ndata: "delta":"你好🌙"}\r\n\r\n');
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); }, cancel() { cancelled = true; } });
  const actual = []; for await (const event of readSse(stream, new AbortController().signal)) actual.push(event);
  assert.deepEqual(actual, [{ type: 'delta', delta: '你好🌙' }]);
  const controller = new AbortController();
  const hanging = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const iterator = readSse(hanging, controller.signal);
  const pending = iterator.next(); controller.abort();
  await assert.rejects(pending); assert.equal(cancelled, true);
});

test('Text cancels the provider stream when the browser disconnects', async () => {
  let observedAbort!: () => void;
  const aborted = new Promise<void>(resolve => { observedAbort = resolve; });
  const middleware = captureMiddleware(textPlugin({ openai: 'test-key' }, async (_url, options) => {
    options?.signal?.addEventListener('abort', observedAbort, { once: true });
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"开始"}\n\n'));
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  }), 'configureServer');
  const server = createServer((req, res) => { void middleware(req, res, () => res.end()); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal });
    const reader = response.body!.getReader(); await reader.read();
    controller.abort(); await reader.cancel().catch(() => {});
    await Promise.race([aborted, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('provider was not cancelled')), 2000); })]);
  } finally { clearTimeout(timer); controller.abort(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('Text rejects untrusted origins and invalid bodies before provider access', async () => {
  const provider: typeof fetch = async () => { assert.fail('provider must not be contacted'); };
  assert.equal((await invoke(provider, input, { origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await invoke(provider, input, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await invoke(provider, { ...input, model: 'gpt-other' })).status, 400);
});

test('Text web search is opt-in for all three models and rejects malformed settings before provider access', async () => {
  for (const model of ['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna']) {
    for (const webSearch of [undefined, false]) {
      const request = buildTextRequest({ ...input, model, webSearch });
      assert.equal(request.provider, 'openai');
      assert.equal(request.payload.tools, undefined);
    }
    const result = await invoke(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.deepEqual(body.tools, [{ type: 'web_search' }]);
      assert.equal(body.model, model);
      return sse([completed(model)]);
    }, { ...input, model, webSearch: true });
    assert.equal(result.status, 200);
    assert.match(result.text, /"webSearch":true/);
  }
  for (const webSearch of ['true', 'enabled', 1, null, {}]) {
    assert.equal((await invoke(async () => { assert.fail('invalid setting must not reach provider'); }, { ...input, webSearch })).status, 400);
  }
});

test('DeepSeek streams Chat Completions through APIMart and saves usage with the answer', async () => {
  const body = { ...input, model: deepSeekFlashModel, images: [png], reasoningEffort: 'medium', webSearch: true };
  const chunk = { id: 'chatcmpl-test', model: deepSeekFlashModel };
  const provider: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.apimart.ai/v1/chat/completions');
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-apimart-key');
    assert.deepEqual(JSON.parse(String(options?.body)), {
      model: deepSeekFlashModel, reasoning_effort: 'high', stream: true, max_tokens: 16384,
      messages: [{ role: 'user', content: [{ type: 'text', text: input.prompt }, { type: 'image_url', image_url: { url: png } }] }],
    });
    const upstream = sse([
      { ...chunk, choices: [{ delta: { reasoning_content: 'hide this' } }] },
      { ...chunk, choices: [{ delta: { content: '你好' } }] },
      { ...chunk, choices: [{ delta: { content: '！' }, finish_reason: 'stop' }] },
      { ...chunk, choices: [], usage: { prompt_tokens: 31, completion_tokens: 9, prompt_cache_hit_tokens: 3, completion_tokens_details: { reasoning_tokens: 4 } } },
    ]);
    return new Response(await upstream.text() + 'data: [DONE]\n\n', { headers: upstream.headers });
  };
  const result = await invoke(provider, body);
  assert.equal(result.status, 200);
  assert.doesNotMatch(result.text, /hide this/);
  const updates: string[] = [];
  const output = await readTextResponse(new Response(result.text, { headers: result.headers }), new AbortController().signal, text => updates.push(text));
  assert.deepEqual(updates, ['你好', '你好！', '你好！']);
  assert.equal(output.model, deepSeekFlashModel);
  assert.equal(output.responseId, 'chatcmpl-test');
  assert.equal(output.reasoningEffort, 'high');
  assert.equal(output.webSearch, false);
  assert.equal(output.usage?.cachedTokens, 3);
  assert.equal(output.usage?.reasoningTokens, 4);
  assert.equal(output.billing, undefined);
});

test('DeepSeek uses APIMart BYOK credentials and preserves history on partial responses', async () => {
  const body = { ...input, model: deepSeekFlashModel };
  const headers = { 'x-momoflow-provider': 'apimart', 'x-momoflow-api-key': 'custom-apimart-key', 'x-momoflow-base-url': 'https://gateway.example/v1' };
  const partial = { id: 'chatcmpl-test', choices: [{ delta: { content: 'partial' } }] };
  for (const tail of [[], [{ choices: [{ finish_reason: 'length' }] }], [{ error: { message: 'bad custom-apimart-key' } }]]) {
    const result = await invoke(async (url, options) => {
      assert.equal(url, 'https://gateway.example/v1/chat/completions');
      assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer custom-apimart-key');
      assert.deepEqual(JSON.parse(String(options?.body)).messages, [{ role: 'user', content: input.prompt }]);
      return sse([partial, ...tail]);
    }, body, headers);
    assert.match(result.text, /"type":"error"/);
    assert.doesNotMatch(result.text, /"type":"completed"|custom-apimart-key/);
  }
  const unused: typeof fetch = async () => { assert.fail('provider must not be contacted'); };
  assert.equal((await invoke(unused, body, { ...headers, 'x-momoflow-provider': 'openai' })).status, 400);
  assert.equal((await invoke(unused, body, {}, 'configureServer', '')).status, 503);
});

test('Text search streams text, carries safe citations across output parts and restores them in the client', async () => {
  const prefix = '检索结果：';
  const body = '官方信息。citesource';
  const citation = { type: 'url_citation', start_index: 5, end_index: body.length, url: 'https://openai.com/', title: 'OpenAI' };
  const result = await invoke(async () => sse([
    { type: 'response.web_search_call.in_progress' },
    { type: 'response.output_text.delta', delta: prefix + body },
    { type: 'response.completed', response: { id: 'resp_search', model: input.model, status: 'completed', output: [
      { type: 'web_search_call', id: 'search_call', action: { type: 'search' } },
      { type: 'message', content: [{ type: 'output_text', text: prefix }, { type: 'output_text', text: body, annotations: [citation,
        { ...citation, url: 'javascript:alert(1)' }] }] },
    ] } },
  ]), { ...input, webSearch: true });
  const deltas: string[] = [];
  const response = await readTextResponse(new Response(result.text, { headers: result.headers }), new AbortController().signal, text => deltas.push(text));
  assert.equal(response.text, prefix + body);
  assert.equal(response.webSearch, true);
  assert.deepEqual(response.citations, [{ url: citation.url, title: citation.title, startIndex: prefix.length + 5, endIndex: prefix.length + body.length }]);
  assert.equal(result.text.includes('search_call'), false);
  assert.ok(deltas[0].includes('检索结果'));
});

test('Text search provider rejection does not retry or silently generate without search', async () => {
  let calls = 0;
  const result = await invoke(async (_url, options) => {
    calls++;
    assert.deepEqual(JSON.parse(String(options?.body)).tools, [{ type: 'web_search' }]);
    return Response.json({ error: { message: 'web_search unavailable' } }, { status: 400 });
  }, { ...input, webSearch: true });
  assert.equal(calls, 1);
  assert.equal(result.status, 400);
  assert.match(result.text, /web_search unavailable/);
});

test('Text completes with actual usage and a stable USD snapshot through the SSE client, leaving gateway prices unknown', async () => {
  const provider: typeof fetch = async () => {
    const event = completed();
    return sse([{ ...event, response: { ...event.response, service_tier: 'default', usage: {
      input_tokens: 1000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 },
      output_tokens: 100, output_tokens_details: { reasoning_tokens: 60 },
    }, tool_usage: { web_search: { num_requests: 1 } } } }]);
  };
  const result = await invoke(provider, { ...input, webSearch: true });
  const parsed = await readTextResponse(new Response(result.text, { headers: result.headers }), new AbortController().signal, () => {});
  assert.equal(parsed.usage?.inputTokens, 1000);
  assert.equal(parsed.usage?.reasoningTokens, 60);
  assert.equal(parsed.usage?.searchRequests, 1);
  assert.equal(parsed.billing?.pricingVersion, '2026-11-21');
  assert.equal(parsed.billing?.model, input.model);
  assert.ok(Math.abs(parsed.billing!.totalUsd! - .01262) < 1e-12);
  const custom = await invoke(provider, input, { 'x-momoflow-provider': 'openai', 'x-momoflow-api-key': 'custom-key', 'x-momoflow-base-url': 'https://gateway.example/v1' });
  const gateway = await readTextResponse(new Response(custom.text, { headers: custom.headers }), new AbortController().signal, () => {});
  assert.ok(gateway.usage);
  assert.equal(gateway.billing, undefined);
  const legacy = await invoke(async () => sse([completed()]));
  const missing = await readTextResponse(new Response(legacy.text, { headers: legacy.headers }), new AbortController().signal, () => {});
  assert.equal(missing.text, '你好，世界'); assert.equal(missing.billing, undefined);
});
