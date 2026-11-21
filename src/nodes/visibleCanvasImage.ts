import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { FileAsset } from './types';

// A running batch previews history locally without changing execution inputs.
// The inspector observes that same preview without persisting transient state.
const visible = new Map<string, FileAsset | undefined>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => listeners.forEach(listener => listener());

export function usePublishVisibleImage(nodeId: string, asset?: FileAsset) {
  useLayoutEffect(() => {
    visible.set(nodeId, asset); notify();
    return () => { visible.delete(nodeId); notify(); };
  }, [nodeId, asset]);
}

export function useVisibleCanvasImage(nodeId: string | null, fallback?: FileAsset) {
  return useSyncExternalStore(subscribe, () => nodeId && visible.has(nodeId) ? visible.get(nodeId) : fallback);
}
