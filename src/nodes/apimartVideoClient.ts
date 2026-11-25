import { apiCredentialHeaders, validApiKey, validBaseUrl } from '../components/apiSettings.ts';
import { notifyApimartGenerationCompleted } from './apimartGeneration.ts';
import { apimartResultUrl } from './apimartResult.ts';
import { uploadApimartImages } from './apimartUpload.ts';
import { planVideoRequest, videoCapabilities, videoOptions, videoReferenceUrl } from './apimartVideo.ts';
import { assetBlob } from './fileMedia.ts';
import { assetResources } from './assetResources.ts';
import { modelTimeoutCode } from './modelRequestError.ts';
import { numberedMentionPrompt } from './promptMentionText.ts';
import type { FileAsset, PromptMention, VideoComposer } from './types.ts';

export const videoTaskIdPattern = /^[a-zA-Z0-9_-]{1,200}$/;
export const videoStopNotice = '停止等待不会取消已提交的 APIMart 任务，也不会撤回可能的费用。';

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function uploadVideo(blob: Blob, filename: string, headers: Record<string, string>, signal: AbortSignal) {
  const key = headers['X-MoMoFlow-Api-Key'];
  const base = headers['X-MoMoFlow-Base-Url'];
  if (!key || !validApiKey(key) || !validBaseUrl(base ?? '')) throw new Error('使用本地参考视频前，请在「更多 → API 设置」保存 APIMart API Key。');
  const form = new FormData();
  form.append('file', blob, filename);
  const response = await fetch(`${base.replace(/\/+$/, '')}/uploads/videos?retention_days=3`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
    credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`APIMart 参考视频上传失败（HTTP ${response.status}），未提交生成任务。`);
  return videoReferenceUrl(data?.url);
}

function validateMedia(composer: VideoComposer, images: FileAsset[], videos: FileAsset[], plan: ReturnType<typeof planVideoRequest>) {
  const { model } = composer;
  const min = model === 'minimax' ? 256 : 300;
  const max = model === 'seedance' ? 6000 : model === 'minimax' ? 5760 : Infinity;
  if (images.some(({ width, height }) => width && height && (width < min || height < min || width > max || height > max || width / height < .4 || width / height > 2.5))) {
    throw new Error(`参考图片的宽高需至少 ${min}px，宽高比需在 2:5 至 5:2 之间，并符合模型尺寸上限。`);
  }
  const minLength = model === 'kling' ? (plan.extending ? 0 : 3) : model === 'seedance' && plan.editing ? 4 : 2;
  const maxLength = model === 'seedance' ? 30 : model === 'kling' ? (plan.extending ? Infinity : 20) : 15;
  if (videos.some(({ duration, size, width, height }) => {
    if (size && size > videoCapabilities[model].videoMB * 1e6 || duration && (duration + .05 < minLength || duration > maxLength + .05)) return true;
    if (!width || !height) return false;
    if (model === 'kling') return !plan.extending && (Math.min(width, height) < 700 || Math.max(width, height) > 4553);
    return width < min || height < min || width > max || height > max || width / height < .4 || width / height > 2.5
      || model === 'seedance' && (width * height < 409600 || width * height > 8295044);
  }) || videos.reduce((total, asset) => total + (asset.duration ?? 0), 0) > maxLength + .05) {
    throw new Error('参考视频的尺寸、大小或时长不符合当前模型和模式，请检查已连接的视频。');
  }
}

async function downloadVideo(url: unknown, signal: AbortSignal) {
  const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(180000)]);
  const response = await fetch(apimartResultUrl(url), { signal: downloadSignal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`视频结果下载失败（HTTP ${response.status}），不会重新提交任务。`);
  const declaredMime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (declaredMime && !['video/mp4', 'application/octet-stream'].includes(declaredMime)) throw new Error('APIMart 未返回有效的视频文件。');
  const limit = 300 * 1024 * 1024;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('APIMart 返回了空视频。');
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get('content-length')) > limit) throw new Error('视频结果超过 300 MiB。');
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('视频结果超过 300 MiB。');
      parts.push(new Uint8Array(value));
    }
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  signal.throwIfAborted();
  if (!size) throw new Error('APIMart 返回了空视频。');
  return new Blob(parts, { type: 'video/mp4' });
}

export async function generateApimartVideo(composer: VideoComposer, prompt: string, mentions: PromptMention[] | undefined,
  images: { nodeId: string; asset: FileAsset }[], videos: FileAsset[], signal: AbortSignal, onSubmitted: (taskId: string) => void) {
  const options = videoOptions(composer);
  const input = { model: composer.model, prompt, ratio: composer.ratio, seconds: composer.seconds, options };
  const preliminary = planVideoRequest(input, images.length, videos.length, 0);
  const imageRefs = images.map(({ nodeId, asset }) => ({ nodeId, url: asset.url }));
  input.prompt = numberedMentionPrompt(prompt, mentions, imageRefs, imageRefs.map(ref => ref.url), index => preliminary.firstFrame
    ? '首帧'
    : composer.model === 'kling' ? `@Image${index}` : `@图片${index}`);
  validateMedia(composer, images.map(ref => ref.asset), videos, preliminary);
  const headers = apiCredentialHeaders('apimart');
  // Images stay in port order, including manually connected images and mentions.
  const [imageBlobs, videoBlobs] = await Promise.all([
    Promise.all(images.map(ref => assetBlob(ref.asset, signal))),
    Promise.all(videos.map(asset => assetBlob(asset, signal))),
  ]);
  signal.throwIfAborted();
  if (videoBlobs.length && !headers['X-MoMoFlow-Api-Key']) throw new Error('使用本地参考视频前，请在「更多 → API 设置」保存 APIMart API Key。');
  if (imageBlobs.some(blob => blob.size >= 30e6) || videoBlobs.some(blob => !blob.size || blob.size > videoCapabilities[composer.model].videoMB * 1e6)) {
    throw new Error('参考图片或视频超过当前模型的单文件限制。');
  }
  if (!headers['X-MoMoFlow-Api-Key'] && imageBlobs.reduce((total, blob) => total + blob.size, 0) > 45 * 1024 * 1024) throw new Error('本地默认 Key 的参考图总量过大，请使用 API 设置保存的 Key 直传。');
  const videoFiles = videoBlobs.map((blob, index) => {
    const mov = blob.type === 'video/quicktime' || /\.mov$/i.test(videos[index].name);
    if (!mov && blob.type && !['video/mp4', 'application/octet-stream'].includes(blob.type)) throw new Error('参考视频只支持 MP4 或 MOV。');
    return { blob, name: `reference-${index + 1}.${mov ? 'mov' : 'mp4'}` };
  });
  const imageUrls = await uploadApimartImages(imageBlobs, headers, signal);
  const videoUrls: string[] = [];
  for (const { blob, name } of videoFiles) videoUrls.push(await uploadVideo(blob, name, headers, signal));
  const call = async (path: string, body: object, requestSignal: AbortSignal) => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body), signal: requestSignal, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    return { response, data };
  };
  let taskId: string | undefined;
  try {
    const submitted = await call('/api/apimart/videos', { ...input, images: imageUrls, videos: videoUrls, audio: [] },
      AbortSignal.any([signal, AbortSignal.timeout(70000)]));
    if (!submitted.response.ok) throw new Error(submitted.data?.error ?? `视频提交失败（HTTP ${submitted.response.status}）。`);
    if (typeof submitted.data?.taskId !== 'string' || !videoTaskIdPattern.test(submitted.data.taskId)) throw new Error('未收到有效任务编号，请先检查 APIMart 请求记录。');
    taskId = submitted.data.taskId as string;
    onSubmitted(taskId);
    const deadline = Date.now() + 30 * 60_000;
    while (Date.now() < deadline) {
      await sleep(5000, signal);
      let polled;
      try {
        polled = await call('/api/apimart/video-task', { taskId }, AbortSignal.any([signal, AbortSignal.timeout(30000)]));
      } catch {
        signal.throwIfAborted();
        continue; // Only retry polling; never submit another billable request.
      }
      const { response, data } = polled;
      if ([408, 429, 503, 504].includes(response.status) || [408, 429, 500, 502, 503, 504].includes(data?.diagnostic?.status) || data?.code === modelTimeoutCode) continue;
      if (!response.ok) throw new Error(data?.error ?? `视频查询失败（HTTP ${response.status}）。`);
      if (data?.status === 'cancelled') throw new Error('APIMart 任务已取消。');
      if (['submitted', 'pending', 'processing'].includes(data?.status)) continue;
      if (data?.status !== 'completed') throw new Error('APIMart 返回了未知任务状态。');
      notifyApimartGenerationCompleted();
      const clip = await downloadVideo(data.videoUrl, signal);
      const name = `${videoCapabilities[composer.model].apiModel}-${taskId}.mp4`;
      signal.throwIfAborted();
      return { id: crypto.randomUUID(), kind: 'video', name, url: assetResources.create(clip),
        mimeType: clip.type, size: clip.size, createdAt: Date.now() } satisfies FileAsset;
    }
    throw new Error('已停止等待，任务可能仍在 APIMart 运行，请查请求记录。');
  } catch (cause) {
    signal.throwIfAborted();
    const reason = cause instanceof Error ? cause.message : '视频生成失败。';
    throw new Error(taskId ? `${reason}\n任务编号：${taskId}` : `${reason} 如提交结果不明，请先检查 APIMart 请求记录再重试。`);
  }
}
