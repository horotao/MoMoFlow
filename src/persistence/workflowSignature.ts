import { workflowSnapshot, type Workflow } from './workflowStorage.ts';

export function workflowSignature(workflow: Workflow): string {
  const { nodes, edges, viewport, colorMode } = workflowSnapshot(workflow);
  return JSON.stringify({ nodes, edges, viewport, colorMode }, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
}
