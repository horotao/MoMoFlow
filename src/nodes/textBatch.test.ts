import test from 'node:test';
import assert from 'node:assert/strict';
import { runTextBatch, prepareTextRequest, type TextBatchItem, type TextExecutor } from './textGenerationClient.ts';
import { completeTextBatchResult, selectTextResult, textHistory } from './textGeneration.ts';
import { createLibraryNode } from '../components/libraryCatalog.ts';
import type { CanvasText } from './types.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const result = (text: string) => ({ text, model: 'gpt-6-luna' as const, responseId: `response-${text}` });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('Text batches cap concurrency at three, preserve each stream and commit out-of-order results in submission order', async () => {
  const ids = ['one', 'two', 'three', 'four', 'five'];
  const pending = ids.map(() => deferred<ReturnType<typeof result>>());
  let calls = 0; let active = 0; let peak = 0;
  const deltas: ((text: string) => void)[] = [];
  let latest: TextBatchItem[] = [];
  const snapshots: TextBatchItem[][] = [];
  let data = (createLibraryNode('text', { x: 0, y: 0 }) as CanvasText).data;
  data = { ...data, text: 'Original', textComposer: { ...data.textComposer, quantity: 5, format: 'md' } };
  const original = textHistory(data)[0];
  const execute: TextExecutor = async (_signal, onText) => {
    const index = calls++; active++; peak = Math.max(peak, active); deltas[index] = onText;
    try { return await pending[index].promise; } finally { active--; }
  };
  const running = runTextBatch(ids, 'Captured prompt', execute, new AbortController().signal, {
    onChange: items => { latest = items; snapshots.push(items); },
    onCompleted: output => { data = { ...data, ...completeTextBatchResult(data, output, ids, false) }; },
  });
  assert.equal(calls, 3); assert.equal(peak, 3);
  deltas[0]('first partial'); deltas[1]('second partial');
  assert.equal(latest[0].text, 'first partial'); assert.equal(latest[1].text, 'second partial');
  assert.equal(snapshots[0][0].state, 'queued');
  pending[2].resolve(result('third')); await flush();
  assert.equal(calls, 4); assert.deepEqual(data.textHistory?.map(item => item.id), [original.id, 'three']);
  pending[3].resolve(result('fourth')); await flush();
  assert.equal(calls, 5);
  pending[0].resolve(result('first')); pending[4].resolve(result('fifth')); pending[1].resolve(result('second'));
  const items = await running;
  assert.equal(peak, 3); assert.equal(calls, 5);
  assert.deepEqual(items.map(item => item.state), ids.map(() => 'completed'));
  assert.deepEqual(data.textHistory?.map(item => item.id), [original.id, ...ids]);
  assert.equal(data.text, 'Original', 'background completions do not take over a selected old result');
  assert.equal(data.textComposer.quantity, 5); assert.equal(data.textComposer.format, 'md');
  assert.ok(data.textHistory?.slice(1).every(item => item.prompt === 'Captured prompt'));
  data = { ...data, ...selectTextResult(data, data.textHistory![2]) };
  assert.equal(data.text, 'second');
  const replay = completeTextBatchResult(data, data.textHistory![2], ids, false);
  assert.equal(replay.textHistory.length, 6, 'a repeated completion cannot duplicate a history slot');
});

test('one failed Text variant does not retry, stop siblings or commit its partial output', async () => {
  let calls = 0; const completed: string[] = [];
  const items = await runTextBatch(['a', 'b', 'c', 'd'], 'Prompt', async (_signal, onText) => {
    const index = calls++; onText(`partial-${index}`);
    if (index === 1) throw new Error('rate limited');
    return result(String(index));
  }, new AbortController().signal, { onChange: () => {}, onCompleted: result => completed.push(result.id) });
  assert.equal(calls, 4); assert.deepEqual(completed.sort(), ['a', 'c', 'd']);
  assert.equal(items[1].state, 'failed'); assert.equal(items[1].text, '');
  assert.equal(items[1].result, undefined); assert.equal(items[1].error, 'rate limited');
});

test('cancelling a Text batch aborts active requests, stops queued work and retains only confirmed completions', async () => {
  const controller = new AbortController();
  const pending = Array.from({ length: 6 }, () => deferred<ReturnType<typeof result>>());
  const completed: string[] = []; let calls = 0; let changes = 0;
  const running = runTextBatch(['a', 'b', 'c', 'd', 'e', 'f'], 'Prompt', async signal => {
    const index = calls++;
    signal.addEventListener('abort', () => pending[index].reject(signal.reason), { once: true });
    return pending[index].promise;
  }, controller.signal, { onChange: () => { changes++; }, onCompleted: result => completed.push(result.id) });
  pending[0].resolve(result('first')); await flush(); assert.equal(calls, 4);
  controller.abort(); const before = changes;
  await running;
  assert.equal(calls, 4); assert.equal(changes, before); assert.deepEqual(completed, ['a']);
  let abortedCalls = 0;
  await runTextBatch(['never'], '', async () => { abortedCalls++; return result('never'); }, controller.signal,
    { onChange: () => assert.fail('aborted batch must not publish'), onCompleted: () => assert.fail('aborted batch must not commit') });
  assert.equal(abortedCalls, 0);
});

test('a prepared Text batch snapshots payload and provider credentials and checks cancellation before submitting', async () => {
  const input = { model: 'gpt-6-luna' as const, prompt: 'Captured', images: [], webSearch: true };
  const signal = new AbortController().signal;
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let configuredKey = 'test-key-before';
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => JSON.stringify({ provider: 'openai', credentials: { openai: { apiKey: configuredKey, baseUrl: 'https://gateway.example/v1' } } }),
  } });
  const previousFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(String(options?.body));
    assert.equal(new Headers(options?.headers).get('X-MoMoFlow-Api-Key'), 'test-key-before');
    assert.equal(new Headers(options?.headers).get('X-MoMoFlow-Base-Url'), 'https://gateway.example/v1');
    return new Response(`data: ${JSON.stringify({ type: 'completed', ...result('saved') })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const execute = await prepareTextRequest(input, signal);
    input.prompt = 'Changed later'; input.webSearch = false; configuredKey = 'test-key-after';
    await Promise.all([execute(signal, () => {}), execute(signal, () => {})]);
    assert.deepEqual(bodies.map(body => JSON.parse(body).prompt), ['Captured', 'Captured']);
    assert.deepEqual(bodies.map(body => JSON.parse(body).webSearch), [true, true]);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(execute(controller.signal, () => {})); assert.equal(bodies.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
