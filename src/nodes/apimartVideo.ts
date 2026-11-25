import { apimartInputUrl, apimartResultUrl } from './apimartResult.ts';
import type { VideoComposer, VideoModelId } from './types.ts';

export type VideoMode = 'auto' | 'reference' | 'first' | 'first-last' | 'last' | 'edit' | 'extend';
export type VideoOptions = {
  resolution?: string; imageMode?: 'auto' | 'first-last'; mode?: VideoMode; generateAudio?: boolean;
  keepAudio?: boolean;
};
export const videoRatios = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'auto'] as const;
export const videoCapabilities = {
  seedance: { apiModel: 'seedance-2-5-flash', resolutions: ['720p', '480p'], min: 4, max: 30, ratios: videoRatios,
    modes: ['auto', 'reference', 'first', 'first-last', 'edit', 'extend'], videoMB: 200 },
  kling: { apiModel: 'kling-v4-flash', resolutions: ['720p'], min: 3, max: 20,
    ratios: ['16:9', '1:1', '9:16', '21:9', 'auto'], modes: ['auto', 'reference', 'first', 'edit', 'extend'], videoMB: 200 },
  minimax: { apiModel: 'MiniMax-H3', resolutions: ['2K', '768P'], min: 4, max: 15, ratios: videoRatios,
    modes: ['auto', 'reference', 'first', 'first-last', 'last'], videoMB: 50 },
} as const satisfies Record<VideoModelId, { apiModel: string; resolutions: readonly string[]; min: number; max: number;
  ratios: readonly string[]; modes: readonly VideoMode[]; videoMB: number }>;

export function normalizeVideoComposer(composer: VideoComposer): VideoComposer {
  const requested = composer.selection?.modelIds[0] ?? composer.model;
  const model: VideoModelId = Object.prototype.hasOwnProperty.call(videoCapabilities, requested) ? requested : 'seedance';
  const cap = videoCapabilities[model];
  const options = videoOptions(composer, model);
  const seconds = composer.seconds === -1 && model === 'seedance' ? -1
    : Math.max(cap.min, Math.min(cap.max, Number.isInteger(composer.seconds) ? composer.seconds : 5));
  return { ...composer, model, selection: { modelIds: [model], autoSelect: false, multiple: false }, seconds,
    ratio: cap.ratios.find(item => item === composer.ratio) ?? '16:9',
    modelOptions: { ...composer.modelOptions, [model]: { ...options,
      resolution: cap.resolutions.find(item => item === options.resolution) ?? cap.resolutions[0] } } };
}

export function videoOptions(composer: VideoComposer, model = composer.model): VideoOptions {
  // Only forward current canvas settings, including when reopening older workflows.
  const { resolution, generateAudio, keepAudio, imageMode } = composer.modelOptions?.[model] ?? {};
  const mode = model !== 'kling' && imageMode === 'first-last' ? 'first-last' : 'auto';
  return { imageMode: mode, mode, resolution, generateAudio, keepAudio };
}
export function videoReferenceUrl(value: unknown) {
  if (typeof value === 'string' && /^asset:\/\/[\w-]{1,256}$/.test(value)) return value;
  try { return apimartInputUrl(value); } catch { throw new Error('参考素材需要公开 HTTPS 地址或已审核的 APIMart 素材 ID。'); }
}

type OptionsInput = Record<string, unknown>;
export function planVideoRequest(input: OptionsInput, imageCount: number, videoCount: number, audioCount: number) {
  const model = input.model;
  if (typeof model !== 'string' || !Object.prototype.hasOwnProperty.call(videoCapabilities, model)) throw new Error('不支持的视频模型。');
  const id = model as VideoModelId;
  const cap = videoCapabilities[id];
  const options = (input.options ?? {}) as OptionsInput;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('高级参数格式错误。');
  const mode = cap.modes.find(item => item === (options.mode ?? 'auto'));
  if (!mode) throw new Error('当前模型不支持此生成模式。');
  const resolution = cap.resolutions.find(item => item === (options.resolution ?? cap.resolutions[0]));
  if (!resolution) throw new Error('当前模型不支持此分辨率。');
  const ratio = cap.ratios.find(item => item === (input.ratio ?? '16:9'));
  if (!ratio) throw new Error('当前模型不支持此宽高比。');
  const hasRefs = imageCount + videoCount + audioCount > 0;
  const editing = mode === 'edit', extending = mode === 'extend';
  const firstFrame = mode === 'first' || id === 'kling' && mode === 'auto' && imageCount === 1 && !videoCount;
  const frames = firstFrame || mode === 'first-last' || mode === 'last';
  const reference = !frames && !editing && !extending && hasRefs;
  if (imageCount > 9 || videoCount > 3 || audioCount > (id === 'kling' ? 0 : id === 'seedance' ? 5 : 3)) throw new Error('当前视频节点的参考素材超过上限。');
  if (frames && (imageCount !== (mode === 'first-last' ? 2 : 1) || videoCount || audioCount)) {
    throw new Error(mode === 'first-last' ? '首尾帧模式需要按顺序连接两张图片，不可混用视频或音频。' : '此帧模式需要恰好一张图片，不可混用视频或音频。');
  }
  if (mode === 'reference' && !hasRefs) throw new Error('请先连接参考素材。');
  if (id === 'minimax' && audioCount && !imageCount && !videoCount) throw new Error('MiniMax H3 的参考音频需与图片或视频一起使用。');
  if ((editing || extending) && (id === 'kling' ? videoCount !== 1 : !videoCount)) throw new Error('请连接所需的源视频：可灵需要恰好一段，Seedance 至少一段。');
  if (id === 'kling' && extending && imageCount) throw new Error('可灵续写只接收一段源视频，不能添加参考图。');
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if ((!prompt && !(id === 'kling' && firstFrame)) || prompt.length > (id === 'minimax' ? 7000 : 32000)) throw new Error('请输入有效的提示词（MiniMax H3 最多 7000 字符）。');
  const seconds = input.seconds ?? 5;
  const automatic = seconds === -1 && (id === 'seedance' || id === 'kling' && editing);
  if (!(id === 'seedance' && editing) && !automatic && (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < cap.min || seconds > cap.max)) {
    throw new Error(`时长必须介于 ${cap.min} 和 ${cap.max} 秒之间。`);
  }
  const body: Record<string, unknown> = { model: cap.apiModel, resolution, ...(prompt ? { prompt } : {}) };
  if (!(id === 'kling' && automatic)) body.duration = id === 'seedance' && editing ? -1 : seconds;
  for (const key of ['moderate', 'watermark', 'generateAudio', 'returnLastFrame', 'webSearch', 'keepAudio']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new Error('高级开关参数无效。');
  }
  body.nsfw_check = options.moderate ?? false;
  if (id === 'seedance') {
    body.size = frames || editing || extending || ratio === 'auto' ? 'adaptive' : ratio;
    body.generate_audio = options.generateAudio ?? true;
    body.watermark = options.watermark ?? false;
    if (options.seed !== undefined) {
      if (!Number.isSafeInteger(options.seed)) throw new Error('随机种子必须为安全整数。');
      body.seed = options.seed;
    }
    if (options.format !== undefined && options.format !== 'mp4' && options.format !== 'mov') throw new Error('不支持的视频格式。');
    body.output_format = options.format ?? 'mp4';
    body.return_last_frame = options.returnLastFrame ?? false;
    body.web_search = options.webSearch ?? false;
  } else if (id === 'kling') {
    if (!frames && !extending && (ratio !== 'auto' || reference)) body.aspect_ratio = ratio;
    if (reference && videoCount && options.keepAudio) body.audio_setting = 'origin';
  } else {
    if (!frames && ratio !== 'auto') body.aspect_ratio = ratio;
    body.watermark = options.watermark ?? false;
  }
  if (id !== 'minimax' && (editing || extending || mode === 'reference' || id === 'kling' && reference && imageCount > 1)) {
    body.omni_reference_task_type = editing ? 'edit' : extending ? 'extend' : 'reference';
  }
  return {
    body, frames, firstFrame, editing, extending,
    withMedia(images: string[], videos: string[], audio: string[]) {
      const payload = { ...body };
      if (frames) {
        const roles = mode === 'first-last' ? ['first_frame', 'last_frame'] : [mode === 'last' ? 'last_frame' : 'first_frame'];
        payload.image_with_roles = images.map((url, index) => ({ url, role: roles[index] }));
      } else if (images.length) payload.image_urls = images;
      if (videos.length) {
        if (id === 'kling' && (editing || extending)) payload.video_url = videos[0];
        else payload.video_urls = videos;
      }
      if (audio.length) payload.audio_urls = audio;
      return payload;
    },
  };
}

export function parseVideoTaskResult(result: { videos?: { url?: unknown; last_frame_url?: unknown }[] }) {
  const video = Array.isArray(result?.videos) ? result.videos[0] : undefined;
  const first = Array.isArray(video?.url) ? video.url[0] : video?.url;
  let lastFrameUrl: string | undefined;
  if (video?.last_frame_url) {
    try { lastFrameUrl = apimartResultUrl(video.last_frame_url); } catch { /* an optional frame must not block the video */ }
  }
  return { videoUrl: apimartResultUrl(first), ...(lastFrameUrl ? { lastFrameUrl } : {}) };
}
