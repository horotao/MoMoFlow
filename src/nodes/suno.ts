import { apimartResultUrl } from './apimartResult.ts';

export const sunoVoices = ['Male', 'Female', '纯音乐'] as const;
export const sunoVarieties = ['off', 'normal', 'high', 'extra', 'max'] as const;
export const sunoFormats = ['mp3', 'm4a', 'wav'] as const;
export type SunoFormat = typeof sunoFormats[number];
export const sunoWeightLabels = { style_weight: '风格权重', weirdness_constraint: '怪异度', audio_weight: '音频权重' } as const;
export interface SunoOptions {
  voice: typeof sunoVoices[number];
  variety: typeof sunoVarieties[number];
  audio_format: SunoFormat;
  style_weight: number;
  weirdness_constraint: number;
  audio_weight: number;
}
export const defaultSunoOptions: SunoOptions = {
  voice: 'Male', variety: 'normal', audio_format: 'mp3', style_weight: .5, weirdness_constraint: .5, audio_weight: .5,
};

export function sunoRequest(input: Record<string, unknown>) {
  const { voice, variety, audio_format, style_weight, weirdness_constraint, audio_weight } = input;
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt || [...prompt].length > 3000) throw new Error('请填写 1–3000 个字符的音乐描述。');
  if (!sunoVoices.some(v => v === voice) || !sunoVarieties.some(v => v === variety) || !sunoFormats.some(v => v === audio_format)) {
    throw new Error('Suno 人声、风格变化程度或音频格式无效。');
  }
  for (const [key, label] of Object.entries(sunoWeightLabels)) {
    const weight = input[key];
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(label + '应在 0.00 至 1.00 之间。');
  }
  return { model: 'suno', version: 'v6', custom: false, prompt, instrumental: voice === '纯音乐',
    ...(voice === '纯音乐' ? {} : { vocal_gender: voice }), variety, audio_format, style_weight, weirdness_constraint, audio_weight };
}

export interface SunoTrack { url: string; title?: string; duration?: number }
export function sunoTracks(result: { music?: unknown }): SunoTrack[] {
  if (!Array.isArray(result.music) || !result.music.length) throw new Error('Suno 未返回音轨。');
  return result.music.map(track => ({
    url: apimartResultUrl(track?.audio_url),
    title: typeof track.title === 'string' ? track.title.trim() : undefined,
    duration: typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0 ? track.duration : undefined,
  }));
}
