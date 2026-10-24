// A gesture may produce requests faster than a worker can render. Display each
// completed draft in that gesture, but reject everything from an older gesture,
// input set, committed document, or editor lifetime.
export class CompositorPreviewSession {
  private key = '';
  private generation = 0;
  update(draft: boolean, source: string) {
    const key = `${draft ? 'draft' : 'native'}:${source}`;
    if (key !== this.key) { this.key = key; this.generation++; }
    return this.generation;
  }
  accepts(generation: number) { return generation === this.generation; }
}

export type DropSide = 'before' | 'after';
export function reorderAtDrop<T extends { id: string }>(items: T[], source: string, target: string, side: DropSide): T[] {
  const from = items.findIndex(item => item.id === source), to = items.findIndex(item => item.id === target);
  if (from < 0 || to < 0 || from === to) return items;
  const insertion = to + (side === 'after' ? 1 : 0), destination = insertion - (from < insertion ? 1 : 0);
  if (destination === from) return items;
  const next = [...items], [item] = next.splice(from, 1);
  next.splice(destination, 0, item);
  return next;
}
