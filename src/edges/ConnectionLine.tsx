import { useLayoutEffect, useRef } from 'react';
import { useStoreApi, type ConnectionLineComponentProps } from '@xyflow/react';
import { movingWireDashes, type Point } from './wireGeometry';
import { canConnect } from '../nodes/connectionRules';
import type { AppNode } from '../nodes/types';
import { workflowPort, portCenter } from './workflowPort';

export function ConnectionLine(props: ConnectionLineComponentProps) {
  const path = useRef<SVGPathElement>(null);
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const store = useStoreApi();
  useLayoutEffect(() => {
    const root = store.getState().domNode;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const element = path.current!;
    const start = performance.now();
    const { fromNode, fromHandle } = latest.current;
    const origin = workflowPort(root, fromNode.id, fromHandle.type, fromHandle.id);
    let frame = 0, tip: Point | undefined, transition: { from: Point; start: number } | undefined;
    let snapped: Element | null | undefined;
    root?.setAttribute('data-wire-drag', 'true');
    const ports = root?.querySelectorAll<HTMLElement>('[data-connection-port]') ?? [];
    for (const port of ports) {
      const handle = port.querySelector<HTMLElement>('.react-flow__handle.connectable');
      const node = handle?.dataset.nodeid;
      const handleId = handle?.dataset.handleid ?? null;
      const reverse = fromHandle.type === 'target';
      const compatibleSide = handle?.classList.contains(reverse ? 'source' : 'target');
      const graph = store.getState();
      const eligible = node && compatibleSide && canConnect(reverse
        ? { source: node, sourceHandle: handleId, target: fromNode.id, targetHandle: fromHandle.id ?? null }
        : { target: node, targetHandle: handleId, source: fromNode.id, sourceHandle: fromHandle.id ?? null },
      graph.nodes as AppNode[], graph.edges);
      port.dataset.connectionEligible = String(port.contains(origin ?? null) || Boolean(eligible));
    }
    function draw(now: number) {
      const { pointer, fromX, fromY, toNode, toHandle, connectionStatus } = latest.current;
      const [x, y, zoom] = store.getState().transform;
      const inverse = element.getScreenCTM()?.inverse();
      const anchor = portCenter(origin, inverse, { x: fromX, y: fromY });
      const next = connectionStatus === 'valid' && toNode && toHandle
        ? workflowPort(root, toNode.id, toHandle.type, toHandle.id) : null;
      if (next !== snapped) {
        snapped?.closest('[data-connection-port]')?.removeAttribute('data-connection-snapped');
        snapped = next;
        snapped?.closest('[data-connection-port]')?.setAttribute('data-connection-snapped', 'true');
        transition = tip && { from: tip, start: now };
      }
      const destination = portCenter(snapped, inverse, { x: (pointer.x - x) / zoom, y: (pointer.y - y) / zoom });
      tip = destination;
      if (transition && !reduced.matches) {
        const t = Math.min(1, (now - transition.start) / 120);
        const k = (1 - t) ** 3;
        tip = { x: destination.x + (transition.from.x - destination.x) * k, y: destination.y + (transition.from.y - destination.y) * k };
        if (t === 1) transition = undefined;
      }
      const elapsed = reduced.matches ? 0 : now - start;
      element.setAttribute('d', fromHandle.type === 'source' ? movingWireDashes(anchor, tip, 1, elapsed) : movingWireDashes(tip, anchor, 1, -elapsed));
      frame = requestAnimationFrame(draw);
    }
    draw(start);
    return () => {
      cancelAnimationFrame(frame);
      root?.removeAttribute('data-wire-drag');
      for (const port of ports) delete port.dataset.connectionEligible;
      snapped?.closest('[data-connection-port]')?.removeAttribute('data-connection-snapped');
    };
  }, [store]);
  return <path ref={path} className="workflow-preview" />;
}
