import { createContext, useContext, useSyncExternalStore } from 'react';
import type { PreviewTask } from '../nodes/taskQueue';

// Runtime-only state: progress must not enter canvas history or persistence.
export function createModelTaskStore() {
  let tasks: PreviewTask[] = [];
  let runs = 1;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => tasks,
    getRuns: () => runs,
    setRuns: (next: number) => {
      if (!Number.isInteger(next) || next < 1 || next > 10 || next === runs) return;
      runs = next;
      listeners.forEach(listener => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update: (change: (current: PreviewTask[]) => PreviewTask[]) => {
      const next = change(tasks);
      if (next === tasks) return;
      tasks = next;
      listeners.forEach(listener => listener());
    },
  };
}

// Standalone node fixtures may omit a provider; each application uses its own store.
export const ModelTasksContext = createContext(createModelTaskStore());
export const useModelTaskStore = () => useContext(ModelTasksContext);
export function useModelRuns() {
  const store = useModelTaskStore();
  return [useSyncExternalStore(store.subscribe, store.getRuns), store.setRuns] as const;
}
export function useModelTasks() {
  const store = useModelTaskStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
