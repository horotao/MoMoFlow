export const canvasTextRunEvent = 'canvas-text-run';

export type CanvasTextRunRequest = { id: string; completion?: Promise<boolean | void> };

export function startCanvasTextRun(id: string) {
  const detail: CanvasTextRunRequest = { id };
  window.dispatchEvent(new CustomEvent(canvasTextRunEvent, { detail }));
  return detail.completion;
}
