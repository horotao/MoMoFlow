/** Read unscaled handle layout so entrance transforms never change graph geometry. */
export function layoutHandle(host: HTMLElement, direction: 'source' | 'target', handleId: string | null) {
  const handles = host.querySelectorAll<HTMLElement>(`.react-flow__handle.${direction}`);
  const handle = [...handles].find(item => (item.dataset.handleid ?? null) === handleId);
  if (!handle) return undefined;
  const transform = new DOMMatrixReadOnly(getComputedStyle(handle).transform);
  let x = handle.offsetWidth / 2 + transform.e, y = handle.offsetHeight / 2 + transform.f;
  let element: HTMLElement | null = handle;
  while (element && element !== host) {
    x += element.offsetLeft + (element === handle ? 0 : element.clientLeft);
    y += element.offsetTop + (element === handle ? 0 : element.clientTop);
    element = element.offsetParent as HTMLElement | null;
  }
  return { x, y, radius: handle.offsetWidth / 2 };
}
