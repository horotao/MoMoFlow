import { useReactFlow, useStore, type ReactFlowState } from '@xyflow/react';
import { animate } from 'motion';
import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { NodeIcon } from '../nodes/NodeIcon';
import { nodeIcons } from '../nodes/nodeIcons';
import { findMapFocus, fitMapCamera, mapPointToCanvas, minimapSize, projectMapRect, type MapCamera } from './minimapGeometry';

function selectMap(state: ReactFlowState) {
  const [x, y, zoom] = state.transform;
  return {
    viewport: { x: -x / zoom, y: -y / zoom, width: state.width / zoom, height: state.height / zoom },
    nodes: [...state.nodeLookup.values()].filter(node => !node.hidden).map(node => ({
      id: node.id, type: node.type, selected: node.selected,
      ...node.internals.positionAbsolute,
      width: node.measured.width ?? node.width ?? 0,
      height: node.measured.height ?? node.height ?? 0,
    })),
  };
}
const equalMap = (a: ReturnType<typeof selectMap>, b: ReturnType<typeof selectMap>) =>
  a.viewport.x === b.viewport.x && a.viewport.y === b.viewport.y
  && a.viewport.width === b.viewport.width && a.viewport.height === b.viewport.height
  && a.nodes.length === b.nodes.length && a.nodes.every((node, index) => {
    const other = b.nodes[index];
    return node.id === other.id && node.type === other.type && node.selected === other.selected
      && node.x === other.x && node.y === other.y && node.width === other.width && node.height === other.height;
  });

type MapMotion = { duration: number; ease: (value: number) => number };

export function CanvasMinimap({ motion, minZoom, maxZoom }: {
  motion: MapMotion;
  minZoom: number;
  maxZoom: number;
}) {
  const { viewport, nodes } = useStore(selectMap, equalMap);
  const { getViewport, setViewport, setCenter, zoomTo } = useReactFlow();
  const target = fitMapCamera(viewport, nodes);
  const [camera, setCamera] = useState(target);
  const cameraRef = useRef(camera);
  const [focusWeights, setFocusWeights] = useState<Record<string, number>>({});
  const focusWeightsRef = useRef(focusWeights);
  const svg = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const drag = useRef<{
    pointerId: number; x: number; y: number; moved: boolean;
    camera: MapCamera; viewport: ReturnType<typeof getViewport>;
  } | null>(null);

  useLayoutEffect(() => {
    setFocusedId(current => findMapFocus(viewport, nodes, current));
  }, [viewport, nodes]);

  useLayoutEffect(() => {
    const start = cameraRef.current;
    const end = dragging ? start : { x: target.x, y: target.y, scale: target.scale };
    const startWeights = focusWeightsRef.current;
    const ids = new Set([...Object.keys(startWeights), ...(focusedId ? [focusedId] : [])]);
    const update = (progress: number) => {
      const next = {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
        scale: start.scale + (end.scale - start.scale) * progress,
      };
      cameraRef.current = next;
      setCamera(next);
      const weights: Record<string, number> = {};
      for (const id of ids) {
        const from = startWeights[id] ?? 0;
        const to = id === focusedId ? 1 : 0;
        const weight = from + (to - from) * progress;
        if (weight > 0) weights[id] = weight;
      }
      focusWeightsRef.current = weights;
      setFocusWeights(weights);
    };
    if (start.x === end.x && start.y === end.y && start.scale === end.scale
      && [...ids].every(id => (startWeights[id] ?? 0) === (id === focusedId ? 1 : 0))) return;
    if (!motion.duration) { update(1); return; }
    // Camera movement and focus magnification share one clock and retarget together.
    // During a map drag only the camera is locked; focus can still follow the viewport.
    const animation = animate(0, 1, { duration: motion.duration / 1000, ease: motion.ease, onUpdate: update });
    return () => animation.stop();
  }, [target.x, target.y, target.scale, focusedId, dragging, motion.duration, motion.ease]);

  useLayoutEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (drag.current) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? minimapSize.height : 1);
      void zoomTo(Math.min(maxZoom, Math.max(minZoom, getViewport().zoom * 2 ** (-delta / 500))));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [getViewport, zoomTo, minZoom, maxZoom]);

  const point = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * minimapSize.width / bounds.width,
      y: (event.clientY - bounds.top) * minimapSize.height / bounds.height };
  };
  const endDrag = (event: PointerEvent<SVGSVGElement>, cancelled = false) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && !active.moved) {
      const center = mapPointToCanvas(point(event), active.camera);
      void setCenter(center.x, center.y, { zoom: getViewport().zoom, ...motion });
    }
  };
  const frame = projectMapRect(viewport, camera);

  return <svg ref={svg} className="navigation-map-svg" width={minimapSize.width} height={minimapSize.height}
    viewBox={`0 0 ${minimapSize.width} ${minimapSize.height}`} role="img" aria-label="画布小地图"
    data-dragging={dragging}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      const position = point(event);
      // Stop an in-flight click/zoom before taking ownership of the viewport.
      void setViewport(getViewport());
      drag.current = { pointerId: event.pointerId, ...position, moved: false,
        camera: cameraRef.current, viewport: getViewport() };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }}
    onPointerMove={event => {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const position = point(event);
      const dx = position.x - active.x;
      const dy = position.y - active.y;
      if (!active.moved && Math.hypot(dx, dy) < 3) return;
      active.moved = true;
      const ratio = active.viewport.zoom / active.camera.scale;
      void setViewport({ ...active.viewport, x: active.viewport.x - dx * ratio, y: active.viewport.y - dy * ratio });
    }}
    onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)}
    onLostPointerCapture={event => endDrag(event, true)}>
    {[...nodes].sort((a, b) => Number(a.id === focusedId) - Number(b.id === focusedId)).map(node => {
      const rect = projectMapRect(node, camera);
      const side = rect.width * 0.735;
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const type = node.type && node.type in nodeIcons ? node.type as keyof typeof nodeIcons : 'file';
      const iconSize = Math.min(10, side * 0.7);
      return <g key={node.id} className="navigation-map-node" data-selected={node.selected}
        data-focused={node.id === focusedId} style={{ transform: `scale(${1 + 0.2 * (focusWeights[node.id] ?? 0)})` }}>
        <rect x={cx - side / 2} y={cy - side / 2} width={side} height={side} rx={side * 0.22} />
        <g transform={`translate(${cx - iconSize / 2} ${cy - iconSize / 2}) scale(${iconSize / 24})`}>
          <NodeIcon nodeType={type} />
        </g>
      </g>;
    })}
    <path className="navigation-map-shade" fillRule="evenodd"
      d={`M0 0H200V106H0Z M${frame.x} ${frame.y}h${frame.width}v${frame.height}h${-frame.width}Z`} />
    <rect className="navigation-map-viewport" {...frame} />
  </svg>;
}
