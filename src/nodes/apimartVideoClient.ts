import { apiCredentialHeaders, validApiKey, validBaseUrl } from '../components/apiSettings.ts';
import { downloadMedia, requestMediaTask } from './apimartMediaClient.ts';
import { uploadApimartImages } from './apimartUpload.ts';
import { planVideoRequest, videoCapabilities, videoOptions, videoReferenceUrl } from './apimartVideo.ts';
import { seedanceAudioByteLimit, seedanceAudioFormat, validateSeedanceAudio } from './seedanceAudio.ts';
import { assetBlob } from './fileMedia.ts';
import { assetResources } from './assetResources.ts';
import { numberedMentionPrompt } from './promptMentionText.ts';
import type { FileAsset, PromptMention, VideoComposer } from './types.ts';

export const videoStopNotice = '停止等待不会取消已提交的 APIMart 任务，也不会撤回可能的费用。';

async function uploadReference(kind: 'videos' | 'audios', blob: Blob, filename: string, headers: Record<string, string>, signal: AbortSignal) {
  const key = headers['X-MoMoFlow-Api-Key'];
  const base = headers['X-MoMoFlow-Base-Url'];
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(180000)]);
  if (kind === 'audios' && !key && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    const response = await fetch('/api/apimart/audio-upload', { method: 'POST', body: blob,
      headers: { 'Content-Type': filename.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav' }, signal: timeout });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? 'APIMart 参考音频上传失败。');
    return videoReferenceUrl(data?.url);
  }
  const label = kind === 'audios' ? '音频' : '视频';
  if (!key || !validApiKey(key) || !validBaseUrl(base ?? '')) throw new Error(`使用参考${label}前，请在「更多 → API 设置」保存 APIMart API Key。`);
  const form = new FormData();
  form.append('file', blob, filename);
  const response = await fetch(`${base.replace(/\/+$/, '')}/uploads/${kind}?retention_days=3`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: timeout,
    credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`APIMart 参考${label}上传失败（HTTP ${response.status}），未提交生成任务。`);
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

export async function generateApimartVideo(composer: VideoComposer, prompt: string, mentions: PromptMention[] | undefined,
  images: { nodeId: string; asset: FileAsset }[], videos: FileAsset[], audio: FileAsset[], signal: AbortSignal, onSubmitted: (taskId: string) => void) {
  const options = videoOptions(composer);
  const input = { model: composer.model, prompt, ratio: images.length || videos.length ? 'auto' : composer.ratio, seconds: composer.seconds, options };
  const preliminary = planVideoRequest(input, images.length, videos.length, audio.length);
  const imageRefs = images.map(({ nodeId, asset }) => ({ nodeId, url: asset.url }));
  input.prompt = numberedMentionPrompt(prompt, mentions, imageRefs, imageRefs.map(ref => ref.url), index => preliminary.frames
    ? (index === 1 ? '首帧' : '尾帧')
    : composer.model === 'kling' ? `@Image${index}` : `@图片${index}`);
  validateMedia(composer, images.map(ref => ref.asset), videos, preliminary);
  const headers = apiCredentialHeaders('apimart');
  // Images stay in port order, including manually connected images and mentions.
  const audioFormats = audio.map(seedanceAudioFormat);
  const [imageBlobs, videoBlobs, audioBlobs] = await Promise.all([
    Promise.all(images.map(ref => assetBlob(ref.asset, signal))),
    Promise.all(videos.map(asset => assetBlob(asset, signal))),
    Promise.all(audio.map(asset => assetBlob(asset, signal))),
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
  const checkedAudio = await Promise.all(audio.map(async (asset, index) => {
    const blob = audioBlobs[index];
    let duration = asset.duration;
    if (duration === undefined && blob.size > 0 && blob.size <= seedanceAudioByteLimit) {
      const context = new OfflineAudioContext(1, 1, 12000);
      duration = await context.decodeAudioData(await blob.arrayBuffer()).then(decoded => decoded.duration, () => undefined);
    }
    return { ...asset, size: blob.size, duration };
  }));
  validateSeedanceAudio(checkedAudio);
  const imageUrls = await uploadApimartImages(imageBlobs, headers, signal);
  const videoUrls: string[] = [];
  for (const { blob, name } of videoFiles) videoUrls.push(await uploadReference('videos', blob, name, headers, signal));
  const audioUrls: string[] = [];
  for (const [index, blob] of audioBlobs.entries()) {
    audioUrls.push(await uploadReference('audios', blob, `reference-${index + 1}.${audioFormats[index]}`, headers, signal));
  }
  return requestMediaTask({ label: '视频', submitPath: '/api/apimart/videos', taskPath: '/api/apimart/video-task', headers,
    input: { ...input, images: imageUrls, videos: videoUrls, audio: audioUrls }, signal, onSubmitted,
    readResult: async (data, taskId) => {
      const clip = await downloadMedia(data.videoUrl, signal, '视频', 'video/mp4', ['video/mp4'], 300);
      const name = `${videoCapabilities[composer.model].apiModel}-${taskId}.mp4`;
      signal.throwIfAborted();
      return { id: crypto.randomUUID(), kind: 'video', name, url: assetResources.create(clip),
        mimeType: clip.type, size: clip.size, createdAt: Date.now() } satisfies FileAsset;
    },
  });
}
