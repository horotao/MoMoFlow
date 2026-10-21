import assert from 'node:assert/strict';
import test from 'node:test';
import { BlurRenderer } from './blurRender.ts';
import { defaultBlurSettings } from './blur.ts';
import type { BlurReply, BlurRequest } from './blurProtocol';

function fixture() {
  const sent: BlurRequest[] = [];
  let terminated = false;
  const worker = {
    onmessage: null as Worker['onmessage'],
    onerror: null as Worker['onerror'],
    postMessage(message: BlurRequest) { sent.push(message); },
    terminate() { terminated = true; },
  };
  const renderer = new BlurRenderer({} as ImageBitmap, worker);
  return {
    renderer, sent, terminated: () => terminated,
    reply: (data: BlurReply) => worker.onmessage?.call(worker as unknown as Worker, { data } as MessageEvent<BlurReply>),
    fail: () => worker.onerror?.call(worker as unknown as Worker, {} as ErrorEvent),
  };
}

test('rapid slider requests keep only the latest waiting frame and preserve the final export', async () => {
  const f = fixture();
  const first = f.renderer.render(defaultBlurSettings, false, true);
  const skipped = f.renderer.render({ ...defaultBlurSettings, size: 60 }, false, true);
  const latest = f.renderer.render({ ...defaultBlurSettings, size: 80 }, true);
  assert.equal(await skipped, undefined);
  assert.equal(f.sent.length, 2); // source plus the active render
  assert.deepEqual(f.sent[1], { type: 'render', settings: defaultBlurSettings, exportPng: false, draft: true });
  const firstFrame = { width: 50 };
  f.reply(firstFrame);
  assert.equal(await first, firstFrame);
  assert.deepEqual(f.sent[2], { type: 'render', settings: { ...defaultBlurSettings, size: 80 }, exportPng: true, draft: false });
  const finalFrame = { width: 50, blob: new Blob(['png']) };
  f.reply(finalFrame);
  assert.equal(await latest, finalFrame);
  f.renderer.dispose();
});

test('source replacement or unmount settles work and releases late image frames', async () => {
  const f = fixture();
  const active = f.renderer.render(defaultBlurSettings, false);
  const pending = f.renderer.render(defaultBlurSettings, true);
  f.renderer.dispose();
  assert.equal(await active, undefined);
  assert.equal(await pending, undefined);
  assert.equal(f.terminated(), true);
  let closed = false;
  f.reply({ bitmap: { close() { closed = true; } } as ImageBitmap });
  assert.equal(closed, true);
  await assert.rejects(f.renderer.render(defaultBlurSettings, true));
});

test('worker failures reject the active job and release waiting jobs', async () => {
  const f = fixture();
  const active = f.renderer.render(defaultBlurSettings, false);
  const rejected = assert.rejects(active, /模糊线程运行失败/);
  const pending = f.renderer.render(defaultBlurSettings, true);
  f.fail();
  await rejected;
  assert.equal(await pending, undefined);
  assert.equal(f.terminated(), true);
});
