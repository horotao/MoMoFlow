import { useLayoutEffect, useRef } from 'react';
import { useStore, useStoreApi, type EdgeProps } from '@xyflow/react';
import { portCenter, workflowPort } from './workflowPort';
import { wireCurve } from './wireGeometry';
import './workflowWire.css';

export function WorkflowEdge({ source, target, sourceHandleId, targetHandleId, sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const connectedNodeSelected = useStore(state => Boolean(
    state.nodeLookup.get(source)?.selected || state.nodeLookup.get(target)?.selected,
  ));
  const group = useRef<SVGGElement>(null);
  const store = useStoreApi();
  useLayoutEffect(() => {
    const element = group.current!;
    const root = store.getState().domNode;
    const a = workflowPort(root, source, 'source', sourceHandleId);
    const b = workflowPort(root, target, 'target', targetHandleId);
    const paths = element.querySelectorAll('path');
    let frame = 0, awakeUntil = 0;
    function draw() {
      frame = 0;
      const inverse = element.getScreenCTM()?.inverse();
      const d = wireCurve(portCenter(a, inverse, { x: sourceX, y: sourceY }), portCenter(b, inverse, { x: targetX, y: targetY }), 1);
      paths.forEach(path => path.setAttribute('d', d));
      if (performance.now() < awakeUntil) frame = requestAnimationFrame(draw);
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
    draw();
    return () => {
      hide();
      observer.disconnect();
      cancelAnimationFrame(frame);
      hosts.forEach(host => host.removeEventListener('transitionrun', wake));
      element.removeEventListener('pointerenter', reveal);
      element.removeEventListener('pointerleave', hide);
    };
  }, [store, source, target, sourceHandleId, targetHandleId, sourceX, sourceY, targetX, targetY]);
  return <g ref={group} data-node-selected={connectedNodeSelected || undefined}><path className="workflow-wire" /><path className="workflow-wire-hit" /></g>;
}
