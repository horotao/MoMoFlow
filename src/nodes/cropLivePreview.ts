export type CropLiveFrame = { canvas: HTMLCanvasElement; width: number; height: number };
// Only a display preview: downstream processing always uses the committed PNG.
class CropLivePreviews {
  private frames = new Map<string, CropLiveFrame>();
  private listeners = new Map<string, Set<() => void>>();
  get(id?: string) { return id ? this.frames.get(id) : undefined; }
  subscribe(id: string | undefined, listener: () => void) {
    if (!id) return () => {};
    const listeners = this.listeners.get(id) ?? new Set<() => void>();
    listeners.add(listener); this.listeners.set(id, listeners);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(id); };
  }
  publish(id: string, frame: CropLiveFrame) {
    this.frames.set(id, frame); this.listeners.get(id)?.forEach(listener => listener());
  }
  clear(id: string) {
    if (this.frames.delete(id)) this.listeners.get(id)?.forEach(listener => listener());
  }
}
export const cropLivePreviews = new CropLivePreviews();
