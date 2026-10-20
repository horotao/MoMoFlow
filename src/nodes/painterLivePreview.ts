export type PainterLiveFrame = {
  result: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  width: number;
  height: number;
  drawing: boolean;
};

// Transient canvases never enter node data, undo history, storage or model inputs.
export class PainterLivePreviews {
  private frames = new Map<string, PainterLiveFrame>();
  private listeners = new Map<string, Set<() => void>>();

  get(id: string | undefined) { return id ? this.frames.get(id) : undefined; }

  subscribe(id: string | undefined, listener: () => void) {
    if (!id) return () => {};
    const listeners = this.listeners.get(id) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(id);
    };
  }

  publish(id: string, frame: PainterLiveFrame) {
    this.frames.set(id, frame);
    this.listeners.get(id)?.forEach(listener => listener());
  }

  clear(id: string) {
    if (this.frames.delete(id)) this.listeners.get(id)?.forEach(listener => listener());
  }
}

export const painterLivePreviews = new PainterLivePreviews();
