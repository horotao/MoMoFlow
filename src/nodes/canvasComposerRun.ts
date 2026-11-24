export const composerRunEvent = { text: 'canvas-text-run', video: 'canvas-video-run' } as const;
export type ComposerRunRequest = { id: string; completion?: Promise<boolean | void> };

export function startCanvasComposerRun(type: keyof typeof composerRunEvent, id: string) {
  const detail: ComposerRunRequest = { id };
  window.dispatchEvent(new CustomEvent(composerRunEvent[type], { detail }));
  return detail.completion;
}
