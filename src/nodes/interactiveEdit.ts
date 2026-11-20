import type { FileAsset } from './types';

export type AnnotationPoint = { x: number; y: number };
export type AnnotationMark = { id: string; start: AnnotationPoint; end?: AnnotationPoint };
export type AnnotationHistory = { imageId?: string; frames: AnnotationMark[][]; index: number };
export type InteractiveEditData = { label?: string; locked?: boolean; baseImage?: FileAsset; history?: AnnotationHistory };

export const annotationLimit = 6;
export const annotationLimitMessage = `已达 ${annotationLimit} 个标注上限`;
export const annotationInputs = Array.from({ length: annotationLimit }, (_, index) => `annotation-${index + 1}`);
export const annotationInputIndex = (handle?: string | null) => annotationInputs.indexOf(handle ?? '');
export const fileAnnotationInputPrefix = 'annotation-file:';
export const resultAnnotationDraftHandle = fileAnnotationInputPrefix + 'draft';
export const isAnnotationInput = (handle?: string | null) => annotationInputIndex(handle) >= 0 || Boolean(handle?.startsWith(fileAnnotationInputPrefix));
export const annotationLabel = (index: number) => `标注 ${index + 1}`;

export const emptyAnnotationHistory: AnnotationHistory = { frames: [[]], index: 0 };
export function annotationHistory(data: InteractiveEditData, imageId?: string) {
  return imageId && data.history?.imageId === imageId ? data.history : emptyAnnotationHistory;
}

export function fileAnnotationHistory(histories: AnnotationHistory[] | undefined, imageId?: string) {
  return (imageId && histories?.find(history => history.imageId === imageId)) || emptyAnnotationHistory;
}

export function withFileAnnotationHistory(histories: AnnotationHistory[] | undefined, next: AnnotationHistory) {
  return [...(histories ?? []).filter(history => history.imageId !== next.imageId), next];
}

export function commitAnnotations(history: AnnotationHistory, imageId: string, marks: AnnotationMark[]): AnnotationHistory {
  const frames = [...history.frames.slice(Math.max(0, history.index - 98), history.index + 1), marks];
  return { imageId, frames, index: frames.length - 1 };
}

export const annotationCoordinate = (value: number) => Math.min(999, Math.round(value * 1000));

export function annotationMarkup({ start, end }: AnnotationMark) {
  if (!end) return `<point>${annotationCoordinate(start.x)} ${annotationCoordinate(start.y)}</point>`;
  const [x1, x2] = [Math.min(start.x, end.x), Math.max(start.x, end.x)].map(annotationCoordinate);
  const [y1, y2] = [Math.min(start.y, end.y), Math.max(start.y, end.y)].map(annotationCoordinate);
  return `<bbox>${x1} ${y1} ${x2} ${y2}</bbox>`;
}

export function restoreInteractiveEditData(value: unknown): InteractiveEditData | undefined {
  if (!value || typeof value !== 'object') return;
  const { label, baseImage, history } = value as Partial<InteractiveEditData>;
  const point = (value: AnnotationPoint | undefined) => value && [value.x, value.y].every(axis => Number.isFinite(axis) && axis >= 0 && axis <= 1);
  const valid = history && typeof history.imageId === 'string' && Array.isArray(history.frames) && history.frames.length <= 100
    && Number.isInteger(history.index) && history.index >= 0 && history.index < history.frames.length
    && history.frames.every(frame => Array.isArray(frame) && frame.length <= annotationLimit
      && frame.every(mark => mark && typeof mark.id === 'string' && point(mark.start) && (mark.end === undefined || point(mark.end)))
      && new Set(frame.map(mark => mark.id)).size === frame.length);
  return { label: typeof label === 'string' ? label : undefined, history: valid ? history : undefined,
    baseImage: baseImage && baseImage.kind === 'image' && typeof baseImage.id === 'string' && typeof baseImage.name === 'string'
      && typeof baseImage.url === 'string' && /^(blob:|https?:)/.test(baseImage.url) ? baseImage : undefined };
}

export function restoreFileAnnotations(value: unknown, assets: FileAsset[]) {
  if (!Array.isArray(value)) return;
  const histories = assets.flatMap(asset => {
    if (asset.kind !== 'image') return [];
    const history = restoreInteractiveEditData({ history: value.find(item => item?.imageId === asset.id) })?.history;
    return history ? [history] : [];
  });
  return histories.length ? histories : undefined;
}
