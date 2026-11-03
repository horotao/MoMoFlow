import { useStoreApi } from '@xyflow/react';
import { useSyncExternalStore } from 'react';

type Part = 'body' | 'actions';
type Target = { nodeId: string; element: HTMLElement };
const scopes = new WeakMap<object, ReturnType<typeof createTargets>>();
function createTargets() {
  const targets = new Map<Part, Target>();
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get: (nodeId: string, part: Part) => targets.get(part)?.nodeId === nodeId ? targets.get(part)!.element : null,
    set: (nodeId: string, part: Part, element: HTMLElement | null) => {
      if (element) targets.set(part, { nodeId, element });
      else if (targets.get(part)?.nodeId === nodeId) targets.delete(part);
      listeners.forEach(listener => listener());
    },
  };
}
export function useNodeSettingsTargets() {
  // Scope portals to this canvas; another mounted workflow must never own them.
  const flow = useStoreApi();
  let targets = scopes.get(flow.getState);
  if (!targets) { targets = createTargets(); scopes.set(flow.getState, targets); }
  return targets;
}
export function useNodeSettingsTarget(nodeId: string, part: Part) {
  const targets = useNodeSettingsTargets();
  return useSyncExternalStore(targets.subscribe, () => targets.get(nodeId, part));
}
