import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildIdeogramRequest, buildIdeogramEditRequest, ideogramPlugin, pollingDelay, runIdeogramPrediction, uploadIdeogramImages } from './ideogram.ts';
import { captureMiddleware } from './testMiddleware.ts';
import { defaultIdeogramSettings, ideogramModel } from '../src/nodes/ideogram.ts';

const input = { ...defaultIdeogramSettings, prompt: 'A poster saying HELLO' };
const output = 'https://images.wavespeed.ai/test.png';
const completed = { id: 'pred_123', status: 'completed', outputs: [output] };
const queued = { id: 'pred_123', status: 'created', outputs: [] };
const noWait = async () => {};

async function invoke({ hook = 'configureServer', headers = {}, body = input, key = 'test-only', provider = async () => Response.json({ data: completed }), method = 'POST', path = '/api/ideogram' }: {
  hook?: 'configureServer' | 'configurePreviewServer'; headers?: Record<string, string | undefined>; body?: unknown; key?: string; provider?: typeof fetch; method?: string; path?: string;
} = {}) {
  const handler = captureMiddleware(ideogramPlugin(key, provider, noWait), hook);
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { url: path, method, headers: { host: 'localhost:5173', 'content-type': 'application/json', ...headers }, socket: {} });
  let status = 0; let text = '';
  const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, writeHead(code: number) { status = code; }, end(value: string) { text = value; this.writableEnded = true; } });
  await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => assert.fail('unexpected next'));
  return { status, body: JSON.parse(text) };
}

test('only documented parameters reach the fixed provider model, including explicit false', () => {
  assert.deepEqual(buildIdeogramRequest({ ...input, resolution: '2k', quality: 'high', aspectRatio: '9:16', enablePromptExpansion: false, model: 'other', images: ['secret'] }), {
    prompt: input.prompt, resolution: '2k', quality: 'high', aspect_ratio: '9:16', enable_prompt_expansion: false,
  });
  for (const body of [null, {}, { ...input, prompt: '' }, { ...input, prompt: 'a'.repeat(10001) }, { ...input, resolution: '4k' }, { ...input, quality: 'auto' }, { ...input, aspectRatio: 'auto' }, { ...input, enablePromptExpansion: 'false' }]) assert.throws(() => buildIdeogramRequest(body));
  assert.equal(buildIdeogramRequest({ ...input, prompt: '猫'.repeat(10000) }).prompt.length, 10000);
});

const image = 'data:image/png;base64,AQIDBA==';
const edit = { prompt: 'Change the sky', image, referenceImages: [image], mask: image, editQuality: 'very_low', editPrecision: 'high', editSize: 'auto' };
const ticket = (index = 1) => ({ download_url: `https://cdn.example/input-${index}.png`, upload: { method: 'PUT', url: `https://upload.example/file-${index}?signature=signed`, headers: { 'Content-Type': 'image/png', 'x-ticket': 'required' } } });

test('edit validates all parameters and image limits before uploads, strips generation-only fields', async () => {
  assert.deepEqual(buildIdeogramEditRequest({ ...input, ...edit, model: 'other' }), { prompt: edit.prompt, image, reference_images: [image], mask_url: image, quality: 'very_low', edit_precision: 'high' });
  assert.equal(buildIdeogramEditRequest({ ...edit, mask: undefined, editPrecision: 'regular', editSize: '1536*1024' }).size, '1536*1024');
  const invalid = [
    {}, { ...edit, image: 'https://example.com/source.png' }, { ...edit, referenceImages: [image, image, image, image] },
    { ...edit, mask: image.replace('image/png', 'image/jpeg') }, { ...edit, editSize: '1024*1024' },
    { ...edit, image: 'data:image/png;base64,bad' }, { ...edit, referenceImages: [null] }, { ...edit, editQuality: 'unknown' },
    { ...edit, image: `data:image/png;base64,${Buffer.alloc(32 * 1024 * 1024 + 1).toString('base64')}` },
    { ...edit, image: `data:image/png;base64,${Buffer.alloc(24 * 1024 * 1024).toString('base64')}`, referenceImages: [`data:image/png;base64,${Buffer.alloc(23 * 1024 * 1024).toString('base64')}`] },
  ];
  for (const body of invalid) assert.throws(() => buildIdeogramEditRequest(body));
  const result = await invoke({ path: '/api/ideogram/edit', body: invalid[2], provider: async () => assert.fail('invalid inputs must never upload') });
  assert.equal(result.status, 400);
});

for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
  test(`${hook}: edit uploads exact bytes using signed tickets, then submits once with public URLs`, async () => {
    let uploads = 0, puts = 0, submissions = 0;
    const result = await invoke({ hook, path: '/api/ideogram/edit', body: edit, provider: async (url, options) => {
      assert.equal(options?.redirect, 'error');
      const headers = new Headers(options?.headers);
      if (String(url).includes('/media/uploads')) {
        uploads++;
        assert.equal(url, 'https://api.wavespeed.ai/api/v3/media/uploads');
        assert.equal(headers.get('Authorization'), 'Bearer test-only');
        assert.deepEqual(JSON.parse(String(options?.body)), { filename: `${['source', 'reference-1', 'mask'][uploads - 1]}.png`, size: 4, content_type: 'image/png' });
        return Response.json({ data: ticket(uploads) });
      }
      if (options?.method === 'PUT') {
        puts++; assert.equal(url, ticket(puts).upload.url);
        assert.equal(headers.has('Authorization'), false); assert.equal(headers.get('x-ticket'), 'required');
        assert.deepEqual([...(options.body as Uint8Array)], [1, 2, 3, 4]);
        return new Response(null, { status: 200 });
      }
      submissions++; assert.equal(url, 'https://api.wavespeed.ai/api/v3/ideogram-ai/ideogram-v4.5/edit');
      assert.equal(headers.get('Authorization'), 'Bearer test-only');
      assert.deepEqual(JSON.parse(String(options?.body)), { prompt: edit.prompt, image: ticket(1).download_url, reference_images: [ticket(2).download_url], mask_url: ticket(3).download_url, quality: 'very_low', edit_precision: 'high' });
      return Response.json({ data: completed });
    } });
    assert.equal(result.status, 200); assert.deepEqual([uploads, puts, submissions], [3, 3, 1]);
  });
}

test('failed/malformed upload tickets and PUT failures never submit generation or leak ticket details', async () => {
  const malformed = [
    { ...ticket(), upload: { ...ticket().upload, method: 'POST' } },
    { ...ticket(), upload: { ...ticket().upload, url: 'http://unsafe.example' } },
    { ...ticket(), download_url: 'https://user:password@host.example' },
    { ...ticket(), upload: { ...ticket().upload, headers: { Authorization: 'Bearer test-only' } } },
  ];
  for (const data of malformed) {
    let calls = 0;
    const result = await invoke({ path: '/api/ideogram/edit', body: edit, provider: async () => { calls++; return Response.json({ data }); } });
    assert.equal(calls, 1); assert.equal(result.status, 502); assert.match(result.body.error, /尚未提交/);
    assert.equal(JSON.stringify(result).includes('test-only'), false); assert.equal(JSON.stringify(result).includes('password'), false);
  }
  let calls = 0;
  const result = await invoke({ path: '/api/ideogram/edit', body: edit, provider: async (_url, options) => {
    calls++; return options?.method === 'PUT' ? new Response('secret signed URL', { status: 503 }) : Response.json({ data: ticket() });
  } });
  assert.equal(calls, 2); assert.equal(result.status, 502); assert.match(result.body.error, /尚未提交/); assert.doesNotMatch(result.body.error, /secret|signed/);
});

test('cancel between upload ticket and PUT stops all further upload and generation requests', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(uploadIdeogramImages('test-only', buildIdeogramEditRequest(edit), controller.signal, async () => {
    calls++; controller.abort(); return Response.json({ data: ticket() });
  }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
  test(`${hook}: server-only credentials, fixed endpoint, trusted local caller and validation`, async () => {
    let calls = 0;
    const result = await invoke({ hook, provider: async (url, options) => {
      calls++;
      assert.equal(url, `https://api.wavespeed.ai/api/v3/${ideogramModel}`);
      assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer test-only');
      assert.equal(options?.redirect, 'error');
      assert.deepEqual(JSON.parse(String(options?.body)), buildIdeogramRequest(input));
      return Response.json({ data: completed });
    } });
    assert.equal(calls, 1); assert.equal(result.status, 200);
    assert.deepEqual(result.body, { taskId: 'pred_123', outputs: [output] });
    const provider = async () => { assert.fail('must not submit'); };
    for (const headers of [{ origin: 'https://evil.example' }, { host: 'localhost.evil.example' }, { origin: 'null' }]) assert.equal((await invoke({ hook, headers, provider })).status, 403);
    assert.equal((await invoke({ hook, key: '', provider })).status, 503);
    assert.equal((await invoke({ hook, method: 'GET', provider })).status, 405);
    assert.equal((await invoke({ hook, body: {}, provider })).status, 400);
    assert.equal((await invoke({ hook, headers: { 'content-type': 'text/plain' }, provider })).status, 415);
    assert.equal((await invoke({ hook, body: { ...input, prompt: 'a'.repeat(128 * 1024) }, provider })).status, 413);
  });
}

test('polls by task ID, ignores upstream URLs, retries GET network/429/5xx only and honors Retry-After', async () => {
  const calls: string[] = [], waits: number[] = [];
  const responses = [
    () => Response.json({ data: { ...queued, urls: { get: 'https://evil.example' } } }),
    () => { throw new TypeError('fetch failed'); },
    () => new Response('', { status: 429, headers: { 'retry-after': '7' } }),
    () => new Response('', { status: 503 }),
    () => Response.json({ data: { ...queued, status: 'processing' } }),
    () => Response.json(completed),
  ];
  const result = await runIdeogramPrediction('test-only', buildIdeogramRequest(input), new AbortController().signal, async (url, options) => {
    calls.push(options?.method ?? 'GET');
    assert.equal(url, calls.length === 1 ? `https://api.wavespeed.ai/api/v3/${ideogramModel}` : 'https://api.wavespeed.ai/api/v3/predictions/pred_123/result');
    return responses.shift()!();
  }, async ms => { waits.push(ms); });
  assert.deepEqual(result, { taskId: 'pred_123', outputs: [output] });
  assert.deepEqual(calls, ['POST', 'GET', 'GET', 'GET', 'GET', 'GET']);
  assert.deepEqual(waits, [2000, 2000, 7000, 8000, 2000]);
  assert.equal(pollingDelay('Wed, 21 Oct 2026 10:00:05 GMT', 1, Date.parse('2026-10-21T10:00:00Z')), 5000);
});

test('all failure terminal states stop polling and retain the task ID without upstream error text', async () => {
  for (const status of ['failed', 'cancelled', 'timeout', 'deleted']) {
    let calls = 0;
    const result = await invoke({ provider: async () => { calls++; return Response.json({ data: { ...queued, status, error: 'secret prompt and API key' } }); } });
    assert.equal(calls, 1); assert.equal(result.status, 502);
    assert.match(result.body.error, new RegExp(status)); assert.match(result.body.error, /pred_123/);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});

test('ambiguous submit failures never retry; credentials, prompts and response bodies stay private', async () => {
  for (const failure of [() => new Response('test-only secret prompt', { status: 502 }), () => { throw new Error('WaveSpeed test-only'); }, () => new Response('{broken'), () => Response.json({ data: { status: 'created' } }), () => Response.json({ code: 400, message: 'test-only' })]) {
    let calls = 0;
    const result = await invoke({ provider: async () => { calls++; return failure(); } });
    assert.equal(calls, 1); assert.equal(result.status, 502);
    assert.equal(JSON.stringify(result).includes('test-only'), false);
    assert.match(result.body.error, /不会自动重试/);
  }
});

test('malformed, missing or unsafe outputs and mismatched task IDs fail without resubmission', async () => {
  for (const outputs of [[], ['http://localhost/private'], ['data:text/plain,secret'], ['https://user:password@host.test/image'], [{}]]) {
    assert.equal((await invoke({ provider: async () => Response.json({ data: { ...completed, outputs } }) })).status, 502);
  }
  let calls = 0;
  const result = await invoke({ provider: async () => { calls++; return Response.json({ data: calls === 1 ? queued : { ...completed, id: 'other-task' } }); } });
  assert.equal(calls, 2); assert.match(result.body.error, /不匹配/);
});

test('cancelling between polls stops requests; disconnect aborts an in-flight request', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(runIdeogramPrediction('test-only', buildIdeogramRequest(input), controller.signal,
    async () => { calls++; return Response.json({ data: queued }); }, async () => { controller.abort(); }), { name: 'AbortError' });
  assert.equal(calls, 1);
  const res = Object.assign(new EventEmitter(), { destroyed: true, writableEnded: false });
  const handler = captureMiddleware(ideogramPlugin('test-only', async (_url, options) => {
    res.emit('close'); assert.equal(options?.signal?.aborted, true); throw new DOMException('Cancelled', 'AbortError');
  }), 'configureServer');
  const req = Object.assign(Readable.from([JSON.stringify(input)]), { url: '/api/ideogram', method: 'POST', headers: { host: 'localhost', 'content-type': 'application/json' }, socket: {} });
  await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => assert.fail());
});
