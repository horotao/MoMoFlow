import assert from 'node:assert/strict';
import test from 'node:test';
import { ColorRenderer } from './colorCorrectionRender.ts';
import { defaultColorSettings } from './colorCorrection.ts';
import type { ColorReply, ColorRequest } from './colorCorrectionProtocol';

function fixture() {
  const sent: ColorRequest[] = [];
  let terminated = false;
  const worker = {
    onmessage: null as Worker['onmessage'],
    onerror: null as Worker['onerror'],
    postMessage(message: ColorRequest) { sent.push(message); },
    terminate() { terminated = true; },
  };
  const renderer = new ColorRenderer({} as ImageBitmap, worker);
  return {
    renderer, sent, terminated: () => terminated,
    reply: (data: ColorReply) => worker.onmessage?.call(worker as unknown as Worker, { data } as MessageEvent<ColorReply>),
    fail: () => worker.onerror?.call(worker as unknown as Worker, {} as ErrorEvent),
  };
}

test('rapid slider requests keep only the latest waiting frame and preserve the final export', async () => {
  const f = fixture();
  const first = f.renderer.render(defaultColorSettings, false);
  const skipped = f.renderer.render({ ...defaultColorSettings, exposure: 1 }, false);
  const latest = f.renderer.render({ ...defaultColorSettings, exposure: 2 }, true);
  assert.equal(await skipped, undefined);
  assert.equal(f.sent.length, 2); // source plus the active render
  const firstFrame = { width: 50 };
  f.reply(firstFrame);
  assert.equal(await first, firstFrame);
  assert.deepEqual(f.sent[2], { type: 'render', settings: { ...defaultColorSettings, exposure: 2 }, exportPng: true });
  const finalFrame = { width: 50, blob: new Blob(['png']) };
  f.reply(finalFrame);
  assert.equal(await latest, finalFrame);
  f.renderer.dispose();
});

test('source replacement or unmount settles work and releases late image frames', async () => {
  const f = fixture();
  const active = f.renderer.render(defaultColorSettings, false);
  const pending = f.renderer.render(defaultColorSettings, true);
  f.renderer.dispose();
  assert.equal(await active, undefined);
  assert.equal(await pending, undefined);
  assert.equal(f.terminated(), true);
  let closed = false;
  f.reply({ bitmap: { close() { closed = true; } } as ImageBitmap });
  assert.equal(closed, true);
  await assert.rejects(f.renderer.render(defaultColorSettings, true));
});

test('worker failures reject the active job and release waiting jobs', async () => {
  const f = fixture();
  const active = f.renderer.render(defaultColorSettings, false);
  const rejected = assert.rejects(active, /调色线程运行失败/);
  const pending = f.renderer.render(defaultColorSettings, true);
  f.fail();
  await rejected;
  assert.equal(await pending, undefined);
  assert.equal(f.terminated(), true);
});
