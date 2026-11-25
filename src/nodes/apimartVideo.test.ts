import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeVideoComposer, videoOptions, parseVideoTaskResult, planVideoRequest } from './apimartVideo.ts';

test('Seedance sends Flash model, editable options and the native ordered frame roles', () => {
  const plan = planVideoRequest({ model: 'seedance', prompt: 'Motion', seconds: 12, ratio: '21:9', options: {
    mode: 'first-last', resolution: '480p', generateAudio: false, watermark: true, seed: 0, format: 'mov',
    returnLastFrame: true, webSearch: true, moderate: true,
  } }, 2, 0, 0);
  assert.deepEqual(plan.withMedia(['first', 'last'], [], []), {
    model: 'seedance-2-5-flash', prompt: 'Motion', resolution: '480p', duration: 12, size: 'adaptive',
    generate_audio: false, watermark: true, seed: 0, output_format: 'mov', return_last_frame: true, web_search: true, nsfw_check: true,
    image_with_roles: [{ url: 'first', role: 'first_frame' }, { url: 'last', role: 'last_frame' }],
  });
  assert.throws(() => planVideoRequest({ model: 'seedance', prompt: 'edit', options: { mode: 'edit' } }, 0, 0, 0));
  assert.throws(() => planVideoRequest({ model: 'seedance', prompt: 'frames', options: { mode: 'first-last' } }, 2, 1, 0));
  const edit = planVideoRequest({ model: 'seedance', prompt: 'edit', ratio: '21:9', options: { mode: 'edit' } }, 0, 1, 0);
  assert.equal(edit.body.duration, -1);
  assert.equal(edit.body.size, 'adaptive');
  assert.equal(edit.body.omni_reference_task_type, 'edit');
  assert.deepEqual(parseVideoTaskResult({ videos: [{ url: ['https://cdn.example.com/clip.mp4'], last_frame_url: 'https://cdn.example.com/tail.png' }] }),
    { videoUrl: 'https://cdn.example.com/clip.mp4', lastFrameUrl: 'https://cdn.example.com/tail.png' });
});

test('Kling strips unsupported aspect ratio from first-frame and extend modes', () => {
  const plan = planVideoRequest({ model: 'kling', prompt: '', ratio: '21:9' }, 1, 0, 0);
  assert.deepEqual(plan.withMedia(['frame'], [], []), { model: 'kling-v4-flash', nsfw_check: false, resolution: '720p', duration: 5,
    image_with_roles: [{ url: 'frame', role: 'first_frame' }] });
  const edit = planVideoRequest({ model: 'kling', prompt: 'New sky', seconds: -1, ratio: 'auto', options: { mode: 'edit', keepAudio: true } }, 1, 1, 0);
  assert.deepEqual(edit.withMedia(['style'], ['source'], []), { model: 'kling-v4-flash', nsfw_check: false, prompt: 'New sky', resolution: '720p',
    omni_reference_task_type: 'edit', image_urls: ['style'], video_url: 'source' });
  const extend = planVideoRequest({ model: 'kling', prompt: 'Next shot', ratio: '21:9', options: { mode: 'extend' } }, 0, 1, 0);
  assert.equal(extend.body.aspect_ratio, undefined);
  const reference = planVideoRequest({ model: 'kling', prompt: 'Motion', ratio: 'auto', options: { mode: 'reference', keepAudio: true } }, 1, 1, 0);
  assert.equal(reference.body.audio_setting, 'origin');
  assert.equal(reference.body.aspect_ratio, 'auto');
});

test('MiniMax H3 distinguishes multimodal references from frame roles and rejects incompatible options', () => {
  const prompt = 'Time lapse';
  const frame = planVideoRequest({ model: 'minimax', prompt, options: { mode: 'last', resolution: '768P', watermark: true } }, 1, 0, 0);
  assert.deepEqual(frame.withMedia(['last'], [], []), { model: 'MiniMax-H3', nsfw_check: false, prompt, resolution: '768P', duration: 5, watermark: true,
    image_with_roles: [{ url: 'last', role: 'last_frame' }] });
  assert.throws(() => planVideoRequest({ model: 'minimax', prompt }, 0, 0, 1));
  assert.throws(() => planVideoRequest({ model: 'minimax', prompt, seconds: 16 }, 0, 0, 0));
  assert.throws(() => planVideoRequest({ model: 'minimax', prompt, options: { mode: 'last' } }, 1, 1, 0));
  const reference = planVideoRequest({ model: 'minimax', prompt, ratio: 'auto' }, 1, 0, 1);
  assert.deepEqual(reference.withMedia(['style'], [], ['music']), { model: 'MiniMax-H3', nsfw_check: false, prompt, resolution: '2K', duration: 5,
    watermark: false, image_urls: ['style'], audio_urls: ['music'] });
});

test('saved video nodes use only current controls for the next generation', () => {
  const legacy = { moderate: true, watermark: true, seed: 42, audioReferences: 'https://cdn.example/old.mp3', returnLastFrame: true, webSearch: true, format: 'mov', generateAudio: false };
  for (const model of ['seedance', 'kling', 'minimax'] as const) {
    const composer = normalizeVideoComposer({ model, modelOptions: { [model]: legacy }, seconds: 5, ratio: '16:9', prompt: 'Motion' });
    const options = videoOptions(composer);
    for (const key of ['moderate', 'watermark', 'seed', 'audioReferences', 'returnLastFrame', 'webSearch', 'format']) assert.ok(!(key in options));
    const body = planVideoRequest({ ...composer, options }, 0, 0, 0).withMedia([], [], []);
    assert.equal(body.nsfw_check, false);
    if (model !== 'kling') assert.equal(body.watermark, false);
    if (model === 'seedance') {
      assert.equal(body.return_last_frame, false);
      assert.equal(body.web_search, false);
      assert.equal(body.output_format, 'mp4');
      assert.equal(body.generate_audio, false);
    }
    assert.ok(!('seed' in body) && !('audio_urls' in body));
  }
});

test('Seedance uses connected images as references even when a saved node selected first and last frames', () => {
  const composer = normalizeVideoComposer({ model: 'seedance', prompt: 'Motion', ratio: '16:9', seconds: 5,
    modelOptions: { seedance: { mode: 'first-last', resolution: '480p' } } });
  const options = videoOptions(composer);
  assert.equal(options.mode, 'auto');
  const body = planVideoRequest({ ...composer, options }, 1, 0, 0).withMedia(['reference'], [], []);
  assert.equal(body.resolution, '480p');
  assert.deepEqual(body.image_urls, ['reference']);
  assert.ok(!('omni_reference_task_type' in body) && !('image_with_roles' in body));
});

test('Kling and MiniMax resume saved manual modes using the connected media', () => {
  for (const model of ['kling', 'minimax'] as const) {
    const composer = normalizeVideoComposer({ model, prompt: 'Motion', ratio: '16:9', seconds: 5,
      modelOptions: { [model]: { mode: model === 'kling' ? 'extend' : 'last', keepAudio: true } } });
    const options = videoOptions(composer);
    assert.equal(options.mode, 'auto');
    const input = { ...composer, options };
    const single = planVideoRequest(input, 1, 0, 0).withMedia(['image'], [], []);
    if (model === 'kling') assert.deepEqual(single.image_with_roles, [{ url: 'image', role: 'first_frame' }]);
    else assert.deepEqual(single.image_urls, ['image']);
    const reference = planVideoRequest(input, 1, 1, 0).withMedia(['image'], ['clip'], []);
    assert.deepEqual(reference.video_urls, ['clip']);
    assert.deepEqual(reference.image_urls, ['image']);
    assert.ok(!('omni_reference_task_type' in reference));
  }
});

test('the explicit image mode sends ordered first and last frames only for models that support them', () => {
  for (const model of ['seedance', 'minimax', 'kling'] as const) {
    const composer = normalizeVideoComposer({ model, prompt: 'Sunrise to sunset', seconds: 5, ratio: 'auto',
      modelOptions: { [model]: { imageMode: 'first-last' } } });
    const options = videoOptions(composer);
    const request = planVideoRequest({ ...composer, options }, 2, 0, 0).withMedia(['dawn', 'dusk'], [], []);
    if (model === 'kling') {
      assert.equal(options.imageMode, 'auto');
      assert.deepEqual(request.image_urls, ['dawn', 'dusk']);
    } else {
      assert.equal(options.imageMode, 'first-last');
      assert.deepEqual(request.image_with_roles, [{ url: 'dawn', role: 'first_frame' }, { url: 'dusk', role: 'last_frame' }]);
      assert.equal(request.image_urls, undefined);
    }
  }
});

test('Seedance audio-only keeps the selected aspect ratio and ordered audio references', async () => {
  const { validateSeedanceAudio, seedanceAudioByteLimit } = await import('./seedanceAudio.ts');
  const audio = { id: 'a', url: 'blob:test', kind: 'audio' as const, name: 'music.wav', mimeType: 'audio/wav', duration: 6, size: seedanceAudioByteLimit };
  validateSeedanceAudio(Array(5).fill(audio));
  for (const change of [{ duration: 1.99 }, { duration: 30.01 }, { size: seedanceAudioByteLimit + 1 }, { mimeType: 'audio/mp4' }]) {
    assert.throws(() => validateSeedanceAudio([{ ...audio, ...change }]));
  }
  assert.throws(() => validateSeedanceAudio([{ ...audio, duration: 25 }, audio]));
  const input = { model: 'seedance', prompt: 'Cut to @音频1', ratio: '9:16' };
  assert.throws(() => planVideoRequest(input, 0, 0, 6));
  const payload = planVideoRequest(input, 0, 0, 2).withMedia([], [], ['first', 'second']);
  assert.deepEqual(payload.audio_urls, ['first', 'second']);
  assert.equal(payload.size, '9:16');
  assert.equal(payload.image_urls, undefined);
});
