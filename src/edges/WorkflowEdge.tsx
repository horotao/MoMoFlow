import { useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useStore, useStoreApi, type EdgeProps } from '@xyflow/react';
import { useModelTaskStore } from '../components/useModelTasks';
import { portCenter, workflowPort } from './workflowPort';
import { wireCurve, wirePacket, wirePacketCenter } from './wireGeometry';
import './workflowWire.css';

export function WorkflowEdge({ source, target, sourceHandleId, targetHandleId, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const sweepId = useId();
  const tasks = useModelTaskStore();
  const running = useSyncExternalStore(tasks.subscribe,
    () => tasks.getSnapshot().some(task => task.nodeId === target && task.state === 'Running'));
  const connectedNodeSelected = useStore(state => Boolean(
    state.nodeLookup.get(source)?.selected || state.nodeLookup.get(target)?.selected,
  ));
  const group = useRef<SVGGElement>(null);
  const clock = useRef({ started: 0, duration: 0 });
  const store = useStoreApi();
  useLayoutEffect(() => {
    const element = group.current!;
    const root = store.getState().domNode;
    const a = workflowPort(root, source, 'source', sourceHandleId);
    const b = workflowPort(root, target, 'target', targetHandleId);
    const paths = element.querySelectorAll('path');
    const light = element.querySelector('radialGradient');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let packet: ReturnType<typeof wirePacket> | undefined;
    let curve = '';
    let frame = 0, awakeUntil = 0;
    if (!running) clock.current.duration = 0;
    function draw(now = performance.now()) {
      frame = 0;
      // Only geometry changes read port layout; the running light reuses it.
      if (!curve || now < awakeUntil) {
        const inverse = element.getScreenCTM()?.inverse();
        const start = portCenter(a, inverse, { x: sourceX, y: sourceY });
        const end = portCenter(b, inverse, { x: targetX, y: targetY });
        const d = wireCurve(start, end, 1);
        if (d !== curve) {
          curve = d;
          paths.forEach(path => path.setAttribute('d', d));
          if (light) {
            packet = wirePacket(start, end);
            light.setAttribute('r', String(packet.radius));
          }
        }
      }
      const animating = packet && light && !reduced.matches;
      if (packet && light && animating) {
        const timing = clock.current;
        if (timing.duration !== packet.durationMs) {
          // Keep the same phase when dragging changes the length or duration.
          const phase = timing.duration ? ((now - timing.started) / timing.duration) % 1 : 0;
          timing.duration = packet.durationMs;
          timing.started = now - phase * timing.duration;
        }
        const center = wirePacketCenter(packet, ((now - timing.started) / timing.duration) % 1);
        light.setAttribute('cx', String(center.x));
        light.setAttribute('cy', String(center.y));
      }
      if (animating || now < awakeUntil) frame = requestAnimationFrame(draw);
    }
    function wake() {
      awakeUntil = performance.now() + 180;
      if (!frame) frame = requestAnimationFrame(draw);
    }
    const hosts = [a, b].map(port => port?.closest('.react-flow__node')).filter((host): host is Element => !!host);
    const observer = new MutationObserver(wake);
    for (const port of [a, b]) {
      const button = port?.closest('[data-connection-port]');
      if (button) observer.observe(button, { attributes: true, attributeFilter: ['style'] });
    }
    hosts.forEach(host => host.addEventListener('transitionrun', wake));
    const reveal = () => hosts.forEach(host => host.setAttribute('data-wire-hover', 'true'));
    const hide = () => hosts.forEach(host => host.removeAttribute('data-wire-hover'));
    element.addEventListener('pointerenter', reveal);
    element.addEventListener('pointerleave', hide);
    reduced.addEventListener('change', wake);
    if (element.matches(':hover')) reveal();
    draw();
    return () => {
      hide();
      observer.disconnect();
      reduced.removeEventListener('change', wake);
      cancelAnimationFrame(frame);
      hosts.forEach(host => host.removeEventListener('transitionrun', wake));
      element.removeEventListener('pointerenter', reveal);
      element.removeEventListener('pointerleave', hide);
    };
  }, [store, source, target, sourceHandleId, targetHandleId, sourceX, sourceY, targetX, targetY, running]);
  return <g ref={group} data-node-selected={connectedNodeSelected || undefined} data-running={running || undefined}>
    <path className="workflow-wire" />
    {running && <>
      <defs><radialGradient id={sweepId} gradientUnits="userSpaceOnUse">
        <stop offset="0.4" stopColor="#fff" />
        <stop offset="1" stopColor="#fff" stopOpacity="0.25" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient></defs>
      <path className="workflow-wire-sweep" stroke={`url(#${sweepId})`} aria-hidden="true" />
    </>}
    <path className="workflow-wire-hit" />
  </g>;
}
