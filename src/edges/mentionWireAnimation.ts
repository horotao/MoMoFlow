// Interaction-only: restoring a project or undoing never replays a new wire.
const pending = new Map<string, number>();
export function animateMentionWire(id: string) { pending.set(id, performance.now()); }
export function takeMentionWireAnimation(id: string) {
  const started = pending.get(id);
  pending.delete(id);
  return started !== undefined && performance.now() - started < 2000;
}
