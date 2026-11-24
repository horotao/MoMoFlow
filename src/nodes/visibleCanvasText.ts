import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { TextGenerationResult } from './types';

// Match the locally previewed history item, including an unfinished batch item.
const visible = new Map<string, TextGenerationResult | undefined>();
const generating = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => listeners.forEach(listener => listener());

export function usePublishVisibleText(nodeId: string, result?: TextGenerationResult) {
  useLayoutEffect(() => {
    visible.set(nodeId, result); notify();
    return () => { visible.delete(nodeId); notify(); };
  }, [nodeId, result]);
}

export function useVisibleCanvasText(nodeId: string | null, fallback?: TextGenerationResult) {
  return useSyncExternalStore(subscribe, () => nodeId && visible.has(nodeId) ? visible.get(nodeId) : fallback);
}

/** The whole batch drives incoming wires, even while viewing a completed variant. */
export function usePublishNodeGeneration(nodeId: string, running: boolean) {
  useLayoutEffect(() => {
    if (!running) return;
    generating.add(nodeId); notify();
    return () => { generating.delete(nodeId); notify(); };
  }, [nodeId, running]);
}

export function useNodeGenerationRunning(nodeId: string) {
  return useSyncExternalStore(subscribe, () => generating.has(nodeId));
}
