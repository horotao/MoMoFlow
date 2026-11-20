import { useEffect, useRef, type ReactNode } from 'react';
import { movingWireDashes, wireCurve, type Point } from './wireGeometry';
import './image-connections.css';

export interface ImageConnection {
  id: string;
  source: string;
  target: string;
}

type Port = HTMLButtonElement;

/** Local frontend wiring only. Each child host declares data-connection-node;
 * data-has-output="true" marks an available image result. No model or storage IO. */
export function ImageConnections({ children, connections, onConnectionsChange }: {
  children: ReactNode;
  connections: readonly ImageConnection[];
  onConnectionsChange: (connections: ImageConnection[]) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const preview = useRef<SVGPathElement>(null);
  const graph = useRef(connections);
  const redraw = useRef<() => void>(() => {});
  graph.current = connections;

  useEffect(() => {
    const root = canvas.current!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let awakeUntil = 0;
    let selected: string | null = null;
    let pointerId: number | null = null;
    let origin: Port | null = null;
    let snapped: Port | null = null;
    let pointer: Point = { x: 0, y: 0 };
    let tip: Point = { x: 0, y: 0 };
    let transition: { from: Point; started: number } | null = null;
    let suppressClickUntil = 0;
    let dashStarted = 0;
    const ports = () => [...root.querySelectorAll<Port>('[data-connection-port]')];
    const host = (port: Element) => port.closest<HTMLElement>('[data-connection-node]')!;
    const nodeId = (port: Element) => host(port).dataset.connectionNode!;
    const endpoint = (port: Port): Point => {
      const visual = port.querySelector('.image-node-port, .image-node-output-visual')!;
      const box = visual.getBoundingClientRect();
      const bounds = root.getBoundingClientRect();
      return { x: box.left + box.width / 2 - bounds.left, y: box.top + box.height / 2 - bounds.top };
    };
    const scale = (port: Port) => host(port).querySelector('.image-node')!.getBoundingClientRect().width / 384;
    const findPort = (id: string, name: string) => ports().find(port => nodeId(port) === id && port.dataset.connectionPort === name);

    function valid(a: Port, b: Port) {
      if (a.disabled || b.disabled || nodeId(a) === nodeId(b)) return false;
      const output = a.dataset.connectionPort === 'output' ? a : b;
      const input = output === a ? b : a;
      if (output.dataset.connectionPort !== 'output' || input.dataset.connectionPort !== 'image' || host(output).dataset.hasOutput !== 'true') return false;
      const source = nodeId(output), target = nodeId(input);
      if (graph.current.some(edge => edge.source === source && edge.target === target)) return false;
      if (graph.current.filter(edge => edge.target === target).length >= 16) return false;
      const visited = new Set<string>();
      const pending = [target];
      while (pending.length) {
        const next = pending.pop()!;
        if (next === source) return false;
        if (visited.has(next)) continue;
        visited.add(next);
        pending.push(...graph.current.filter(edge => edge.source === next).map(edge => edge.target));
      }
      return true;
    }

    function hit(): Port | null {
      if (!origin) return null;
      // Adjacent inputs are only 40 units apart. A pointer over Prompt must
      // not be stolen by the nearby compatible Image magnet.
      const bounds = root.getBoundingClientRect();
      for (const port of ports()) {
        if (port.dataset.connectionPort !== 'prompt') continue;
        const rect = port.getBoundingClientRect();
        const x = pointer.x + bounds.left, y = pointer.y + bounds.top;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return null;
      }
      let nearest: Port | null = null;
      let distance = Infinity;
      for (const port of ports()) {
        if (!valid(origin, port)) continue;
        const center = endpoint(port);
        const next = Math.hypot(pointer.x - center.x, pointer.y - center.y);
        // Measured visually at 72% and 100%; scale with the node, not the screen.
        if (next <= 40 * scale(port) && next < distance) { nearest = port; distance = next; }
      }
      return nearest;
    }

    function render(now: number) {
      frame = 0;
      for (const edge of graph.current) {
        const a = findPort(edge.source, 'output'), b = findPort(edge.target, 'image');
        const group = [...root.querySelectorAll<SVGGElement>('[data-connection-id]')].find(item => item.dataset.connectionId === edge.id);
        if (!a || !b || !group) continue;
        const path = wireCurve(endpoint(a), endpoint(b), scale(a));
        group.querySelectorAll('path').forEach(item => item.setAttribute('d', path));
        group.querySelector<SVGPathElement>('.image-connection-line')!.style.strokeWidth = String(3 * scale(a));
      }
      if (origin) {
        if (origin.disabled) { cancel(); return; }
        const next = hit();
        if (next !== snapped) {
          snapped?.removeAttribute('data-connection-snapped');
          snapped = next;
          snapped?.setAttribute('data-connection-snapped', 'true');
          transition = reduced.matches ? null : { from: { ...tip }, started: now };
        }
        const destination = snapped ? endpoint(snapped) : pointer;
        const t = transition ? Math.min(1, (now - transition.started) / 120) : 1;
        const eased = 1 - (1 - t) ** 3;
        tip = transition ? { x: transition.from.x + (destination.x - transition.from.x) * eased, y: transition.from.y + (destination.y - transition.from.y) * eased } : destination;
        if (t >= 1) transition = null;
        const anchor = endpoint(origin);
        if (preview.current) {
          const zoom = scale(origin);
          // Always parameterize from the gesture origin, including reverse
          // input drags, so the dash flow follows the hand's direction.
          const forward = origin.dataset.connectionPort === 'output';
          const elapsed = reduced.matches ? 0 : now - dashStarted;
          preview.current.setAttribute('d', forward
            ? movingWireDashes(anchor, tip, zoom, elapsed)
            : movingWireDashes(tip, anchor, zoom, -elapsed));
          preview.current.style.strokeWidth = String(2 * zoom);
        }
      }
      if (origin || now < awakeUntil) frame = requestAnimationFrame(render);
    }
    function wake() {
      awakeUntil = performance.now() + 650;
      if (!frame) frame = requestAnimationFrame(render);
    }
    redraw.current = wake;
    function revealEdge(id: string | null) {
      root.querySelectorAll('[data-connection-visible]').forEach(node => node.removeAttribute('data-connection-visible'));
      if (id) {
        const edge = graph.current.find(item => item.id === id);
        if (edge) [findPort(edge.source, 'output'), findPort(edge.target, 'image')].forEach(port => { if (port) host(port).setAttribute('data-connection-visible', 'true'); });
      }
      wake();
    }
    function cancel() {
      if (pointerId !== null && root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
      origin = null;
      pointerId = null;
      snapped = null;
      transition = null;
      root.removeAttribute('data-connection-dragging');
      ports().forEach(port => { delete port.dataset.connectionEligible; delete port.dataset.connectionSnapped; });
      root.querySelectorAll('[data-connection-origin]').forEach(node => node.removeAttribute('data-connection-origin'));
      wake();
    }
    function down(event: PointerEvent) {
      if (event.button !== 0 || origin || !(event.target instanceof Element)) return;
      const port = event.target.closest<Port>('[data-connection-port]');
      if (!port || port.disabled || port.dataset.connectionPort === 'prompt' || (port.dataset.connectionPort === 'output' && host(port).dataset.hasOutput !== 'true')) return;
      event.preventDefault();
      event.stopPropagation();
      origin = port;
      dashStarted = performance.now();
      pointerId = event.pointerId;
      // Capture native drags beyond the browser viewport; synthetic QA events
      // have no active pointer to capture.
      if (event.isTrusted) root.setPointerCapture(event.pointerId);
      const bounds = root.getBoundingClientRect();
      pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      tip = endpoint(port);
      selected = null;
      root.querySelectorAll('[data-selected]').forEach(item => item.removeAttribute('data-selected'));
      root.dataset.connectionDragging = 'true';
      host(port).dataset.connectionOrigin = 'true';
      for (const candidate of ports()) candidate.dataset.connectionEligible = String(candidate === port || valid(port, candidate));
      wake();
    }
    function move(event: PointerEvent) {
      if (origin && event.pointerId === pointerId) {
        const bounds = root.getBoundingClientRect();
        pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      }
      wake();
    }
    function up(event: PointerEvent) {
      if (!origin || event.pointerId !== pointerId) return;
      const bounds = root.getBoundingClientRect();
      pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const target = hit();
      if (target) {
        const sourcePort = origin.dataset.connectionPort === 'output' ? origin : target;
        const targetPort = sourcePort === origin ? target : origin;
        onConnectionsChange([...graph.current, { id: crypto.randomUUID(), source: nodeId(sourcePort), target: nodeId(targetPort) }]);
      }
      suppressClickUntil = performance.now() + 100;
      cancel();
    }
    function click(event: MouseEvent) {
      if (performance.now() < suppressClickUntil) { event.stopPropagation(); event.preventDefault(); return; }
      if (!(event.target instanceof Element)) return;
      const edge = event.target.closest<SVGGElement>('[data-connection-id]');
      if (!edge && event.target.closest('.image-node')) return;
      selected = edge?.dataset.connectionId ?? null;
      root.querySelectorAll('[data-connection-id]').forEach(item => item.toggleAttribute('data-selected', item === edge));
    }
    function over(event: PointerEvent) {
      if (origin || !(event.target instanceof Element)) return;
      const edge = event.target.closest<SVGGElement>('[data-connection-id]');
      revealEdge(edge?.dataset.connectionId ?? null);
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        cancel();
        selected = null;
        root.querySelectorAll('[data-selected]').forEach(item => item.removeAttribute('data-selected'));
        revealEdge(null);
        return;
      }
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable=true]')) return;
      if (event.target instanceof Element && (event.key === 'Enter' || event.key === ' ')) {
        const edge = event.target.closest<SVGGElement>('[data-connection-id]');
        if (edge) {
          event.preventDefault();
          selected = edge.dataset.connectionId!;
          root.querySelectorAll('[data-connection-id]').forEach(item => item.toggleAttribute('data-selected', item === edge));
        }
      }
      if (selected && (event.key === 'Delete' || event.key === 'Backspace')) {
        const edge = graph.current.find(item => item.id === selected);
        if (edge && !findPort(edge.source, 'output')?.disabled && !findPort(edge.target, 'image')?.disabled) {
          event.preventDefault();
          onConnectionsChange(graph.current.filter(item => item.id !== selected));
          selected = null;
          revealEdge(null);
        }
      }
    }
    function out(event: PointerEvent) { if (event.target instanceof Element && event.target.closest('[data-connection-id]')) revealEdge(null); }
    root.addEventListener('pointerdown', down, true);
    root.addEventListener('click', click, true);
    root.addEventListener('pointerover', over);
    root.addEventListener('pointerout', out);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', wake);
    window.addEventListener('scroll', wake, true);
    reduced.addEventListener('change', wake);
    const observer = new ResizeObserver(wake);
    observer.observe(root);
    root.querySelectorAll('.image-node').forEach(node => observer.observe(node));
    wake();
    return () => {
      cancel();
      cancelAnimationFrame(frame);
      redraw.current = () => {};
      observer.disconnect();
      root.removeEventListener('pointerdown', down, true);
      root.removeEventListener('click', click, true);
      root.removeEventListener('pointerover', over);
      root.removeEventListener('pointerout', out);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', wake);
      window.removeEventListener('scroll', wake, true);
      reduced.removeEventListener('change', wake);
    };
  }, [onConnectionsChange]);

  // A new committed edge needs its first measured path, even when the pointer rests.
  useEffect(() => { redraw.current(); }, [connections, children]);

  return <div className="image-connection-canvas" ref={canvas}>
    <svg className="image-connection-lines" role="group" aria-label="图片连线">
      {connections.map(edge => <g key={edge.id} data-connection-id={edge.id} role="button" tabIndex={0} aria-label="图片连接，Enter 选中，Delete 删除">
        <path className="image-connection-line" />
        <path className="image-connection-hit" />
      </g>)}
      <path ref={preview} className="image-connection-preview" />
    </svg>
    {children}
  </div>;
}
