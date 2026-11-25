import type { FileAsset } from './types';
import { defaultSunoOptions, type SunoOptions } from './suno.ts';

export const audioModel = { id: 'suno-v6', name: 'Suno V6', brand: 'suno', time: '30–120 秒', description: '根据提示词创作人声歌曲或纯音乐。' } as const;
export interface AudioComposer {
  prompt: string;
  quantity: number;
  pinned?: string[];
  suno?: SunoOptions;
}

export interface AudioResult {
  id: string; createdAt: number; model: string; prompt: string;
  suno?: SunoOptions; asset?: FileAsset; peaks?: number[]; taskId?: string;
}

export const defaultAudioComposer: AudioComposer = { prompt: '', quantity: 1, pinned: [audioModel.id], suno: defaultSunoOptions };

// Older preview nodes may contain pins and selections for retired model IDs.
export function audioPinned(composer: AudioComposer) {
  if (!composer.suno) return [audioModel.id];
  return composer.pinned?.includes(audioModel.id) ? [audioModel.id] : [];
}

const legacyNames: Record<string, string> = {
  multilingual: 'ElevenLabs Multilingual v2', lyria: 'Lyria 3.5', 'music-v1': 'ElevenLabs Music v1', 'eleven-v4': 'Eleven v4',
  'music-v2': 'ElevenLabs Music v2.5', turbo: 'Eleven v4 Turbo', 'eleven-v3': 'ElevenLabs v3', effects: 'ElevenLabs Sound Effects',
  gemini: 'Gemini 3.1 Flash TTS', stable: 'Stable Audio 3',
};
export function audioResultModel(id: string) {
  return id === audioModel.id ? audioModel.name : legacyNames[id] ?? id;
}
