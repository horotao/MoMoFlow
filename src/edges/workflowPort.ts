import type { Point } from './wireGeometry';

export function workflowPort(root: HTMLElement | null, node: string, type: 'source' | 'target', id?: string | null) {
  const host = root?.querySelector(`.react-flow__node[data-id="${CSS.escape(node)}"]`);
  const handle = [...host?.querySelectorAll<HTMLElement>(`.react-flow__handle.${type}`) ?? []]
    .find(element => (element.dataset.handleid ?? '') === (id ?? ''));
  return handle?.closest('[data-connection-port]')?.querySelector('.image-node-port, .image-node-output-visual') ?? handle;
}

export function portCenter(port: Element | undefined | null, inverse: DOMMatrix | undefined, fallback: Point) {
  if (!port || !inverse) return fallback;
  const rect = port.getBoundingClientRect();
  if (!rect.width || !rect.height) return fallback;
  return new DOMPoint(rect.x + rect.width / 2, rect.y + rect.height / 2).matrixTransform(inverse);
}
