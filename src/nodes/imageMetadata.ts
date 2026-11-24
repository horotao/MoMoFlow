import type { FileAsset } from './types';
import { modelInputSignatureVersion } from './generationRecord.ts';
import { nanoBananaModel, nanoBananaProModel } from './nanoBanana.ts';
import { klingImageModel, klingImageName } from './klingImage.ts';

const formats: Record<string, string> = { png: 'PNG', jpeg: 'JPEG', jpg: 'JPEG', webp: 'WEBP', gif: 'GIF', svg: 'SVG', 'svg+xml': 'SVG', avif: 'AVIF', bmp: 'BMP', tiff: 'TIFF', tif: 'TIFF' };
const modelNames: Record<string, string> = {
  'gpt-image-2.6-sunburst': 'GPT Image 2.6 Sunburst',
  'gpt-image-2.6-flare': 'GPT Image 2.6 Flare',
  'gpt-image-2.6-ext': 'GPT Image 2.6 EXT',
  [nanoBananaModel]: 'Nano Banana 2.1',
  [nanoBananaProModel]: 'Nano Banana Pro',
  'seedream-5-5': 'Seedream 5.5',
  [klingImageModel]: klingImageName,
};

export const imageModelName = (model: string): string => modelNames[model] ?? model;

export function imageFormat(asset: FileAsset): string | undefined {
  const mime = typeof asset.mimeType === 'string' ? /^image\/([^;]+)/i.exec(asset.mimeType)?.[1]?.toLowerCase() : undefined;
  return (mime && formats[mime]) || formats[/\.([a-z]+)$/i.exec(asset.name)?.[1]?.toLowerCase() ?? ''] || undefined;
}

export function imageCreatedAt(asset: FileAsset): number | undefined {
  if (typeof asset.createdAt === 'number' && Number.isFinite(asset.createdAt) && asset.createdAt > 0
    && !Number.isNaN(new Date(asset.createdAt).getTime())) return asset.createdAt;
  // Existing image clients recorded completion time in these exact filenames.
  const time = /^(?:Sunburst|Flare|Seedream|Nano-Banana-(?:2\.1|Pro))-(\d{13})\.[a-z]+$/i.exec(asset.name)?.[1];
  return time ? Number(time) : undefined;
}

export function imageModel(asset: FileAsset): string | undefined {
  const record = asset.generation;
  if (record?.version !== 1 || record.outputSignature !== asset.id) return;
  try {
    const input: unknown = JSON.parse(record.inputSignature);
    if (!Array.isArray(input) || input[0] !== modelInputSignatureVersion || typeof input[1] !== 'string') return;
    return imageModelName(input[1]);
  } catch { /* Incomplete legacy records remain unknown instead of using today's settings. */ }
}

export function imageSizeLabel(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${bytes} B`;
  const index = Math.min(3, Math.floor(Math.log10(bytes) / 3));
  return `${Number((bytes / 1000 ** index).toFixed(1))} ${['B', 'KB', 'MB', 'GB'][index]}`;
}

export function imageDateLabel(time?: number): string {
  if (typeof time !== 'number' || !Number.isFinite(time)) return '—';
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
