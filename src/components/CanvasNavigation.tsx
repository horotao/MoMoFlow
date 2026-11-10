import { MapIcon, MinusSignIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MiniMap, Panel, useReactFlow, useStore, useStoreApi, type MiniMapNodeProps } from '@xyflow/react';
import { cubicBezier } from 'motion';
import { motion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { createContext, memo, useContext, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MutableRefObject } from 'react';
import { spring } from '../lib/springs';
import { NodeIcon } from '../nodes/NodeIcon';
import { nodeIcons } from '../nodes/nodeIcons';
import type { AppNode } from '../nodes/types';
import './CanvasNavigation.css';

export const canvasMinZoom = 0.01;
export const canvasMaxZoom = 2;

const zoomStep = 1.2;
const zoomEase = cubicBezier(0.23, 1, 0.32, 1);
const digitPlaces = [100, 10, 1];
const minPercent = Math.round(canvasMinZoom * 100);
const maxPercent = Math.round(canvasMaxZoom * 100);
const minimapSize = { width: 200, height: 106 };
const minimapLayout = { '--navigation-map-height': `${minimapSize.height + 2}px` } as CSSProperties;
const MinimapScaleContext = createContext(0);
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const getReducedMotion = () => reducedMotionQuery.matches;
function subscribeReducedMotion(onChange: () => void) {
  reducedMotionQuery.addEventListener('change', onChange);
  return () => reducedMotionQuery.removeEventListener('change', onChange);
}

export type ZoomTarget = { value: number };
const MapNode = memo(function MapNode({ id, x, y, width, height, selected }: MiniMapNodeProps) {
  const type = useStore(state => state.nodeLookup.get(id)?.type);
  const icon = type && type in nodeIcons ? type as keyof typeof nodeIcons : 'file';
  const scale = useContext(MinimapScaleContext);
  const side = width * 0.735;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const showIcon = width * scale >= 15;

  return <g className="navigation-map-node" data-selected={selected}>
    <rect x={centerX - side / 2} y={centerY - side / 2} width={side} height={side} rx={side * 0.22} />
    {showIcon && <svg x={centerX} y={centerY} width="4.9%" height="8.82%" viewBox="0 0 24 24" overflow="visible">
      <g transform="translate(-12 -12)"><NodeIcon nodeType={icon} /></g>
    </svg>}
  </g>;
});

const ZoomDigit = memo(function ZoomDigit({ place, position }: { place: number; position: MotionValue<number> }) {
  // Repeat zero at the end of the units strip so wrapping from 9 to 0 is seamless.
  const rows = place === 1 ? 11 : Math.floor(maxPercent / place) + 1;
  const transform = useTransform(position, value => {
    const whole = Math.floor(value);
    const turns = Math.floor(whole / place);
    const row = place === 1 ? turns % 10 : turns;
    const carry = whole % place === place - 1 ? value - whole : 0;
    return `translateY(${-(row + carry) * 100 / rows}%)`;
  });
  const width = useTransform(position, value => `${Math.max(0, Math.min(1, value - place + 1))}ch`);

  return <motion.span className="navigation-digit" style={{ width }}>
    <motion.span className="navigation-digit-strip" style={{ transform }}>
      {Array.from({ length: rows }, (_, index) => <span key={index}>
        {place > 1 && index === 0 ? '\u00a0' : index % 10}
      </span>)}
    </motion.span>
  </motion.span>;
});

function ZoomReadout({ percent, reducedMotion }: { percent: number; reducedMotion: boolean }) {
  const rolling = useSpring(percent, { visualDuration: spring.fast.duration, bounce: spring.fast.bounce });
  const position = useTransform(rolling, value => Math.max(minPercent, Math.min(maxPercent, value)));

  useLayoutEffect(() => {
    if (reducedMotion) rolling.jump(percent);
    else rolling.set(percent);
  }, [percent, reducedMotion, rolling]);

  return <span className="navigation-readout" aria-hidden="true">
    <span className="navigation-digits">
      {digitPlaces.map(place => <ZoomDigit key={place} place={place} position={position} />)}
    </span>
    <span className="navigation-percent-sign">%</span>
  </span>;
}

function ZoomPercentage({ percent, reducedMotion, onChange }: {
  percent: number;
  reducedMotion: boolean;
  onChange: (zoom: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const initialValue = useRef('');
  const restoreFocus = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const editing = draft !== null;

  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  const finishEditing = (value: string, cancelled = false) => {
    setDraft(null);
    if (cancelled) return;
    const match = /^(\d+)\s*%?$/.exec(value.normalize('NFKC').trim());
    if (!match || match[1] === initialValue.current) return;
    const number = Number(match[1]);
    if (Number.isFinite(number)) onChange(number / 100);
  };

  if (draft === null) return <button type="button" className="navigation-percentage" ref={trigger}
    aria-label={`编辑缩放比例，当前 ${percent}%`} title="编辑缩放比例" onClick={() => {
      initialValue.current = String(percent);
      setDraft(initialValue.current);
    }}>
    <ZoomReadout percent={percent} reducedMotion={reducedMotion} />
  </button>;

  return <div className="navigation-percentage navigation-percentage-editor">
    <input ref={input} type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off" aria-label="缩放比例（1% 至 200%）"
      value={draft} style={{ width: `${Math.max(1, Math.min(4, draft.length))}ch` }}
      onChange={event => setDraft(event.currentTarget.value)}
      onBlur={event => finishEditing(event.currentTarget.value)}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return;
        event.preventDefault();
        restoreFocus.current = true;
        finishEditing(event.currentTarget.value, event.key === 'Escape');
      }} />
    {!/[%％]\s*$/.test(draft) && <span aria-hidden="true">%</span>}
  </div>;
}

export function CanvasNavigation({ pendingZoom }: { pendingZoom: MutableRefObject<ZoomTarget | null> }) {
  const [mapOpen, setMapOpen] = useState(false);
  const [mapProjection, setMapProjection] = useState<{ scale: number; frame: CSSProperties } | null>(null);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion);
  const zoom = useStore(state => state.transform[2]);
  const store = useStoreApi();
  const { getZoom, setCenter, zoomTo } = useReactFlow();
  const mapId = useId();
  const mapTrigger = useRef<HTMLButtonElement>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const percent = Math.round(zoom * 100);
  const zoomMotion = { duration: reducedMotion ? 0 : 220, ease: zoomEase };

  useLayoutEffect(() => {
    if (!mapOpen) return;
    const svg = mapContainer.current?.querySelector<SVGSVGElement>('.react-flow__minimap-svg');
    const mask = svg?.querySelector('.react-flow__minimap-mask');
    if (!svg || !mask) return;

    // Project the viewport into the minimap's centered SVG viewBox.
    const updateProjection = () => {
      const { x, y, width, height } = svg.viewBox.baseVal;
      if (!width || !height) return;
      const scale = Math.min(minimapSize.width / width, minimapSize.height / height);
      const { width: canvasWidth, height: canvasHeight, transform: [panX, panY, zoom] } = store.getState();
      setMapProjection({ scale, frame: {
        left: (minimapSize.width - width * scale) / 2 - (panX / zoom + x) * scale,
        top: (minimapSize.height - height * scale) / 2 - (panY / zoom + y) * scale,
        width: canvasWidth / zoom * scale,
        height: canvasHeight / zoom * scale,
      } });
    };
    updateProjection();
    const observer = new MutationObserver(updateProjection);
    observer.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
    // Panning can move the viewport without changing the minimap viewBox.
    observer.observe(mask, { attributes: true, attributeFilter: ['d'] });
    return () => observer.disconnect();
  }, [mapOpen, store]);

  const changeZoom = (value: number) => {
    const target = { value: Math.min(canvasMaxZoom, Math.max(canvasMinZoom, value)) };
    pendingZoom.current = target;
    void zoomTo(target.value, zoomMotion).then(() => {
      if (pendingZoom.current === target) pendingZoom.current = null;
    });
  };

  const stepZoom = (factor: number) => changeZoom((pendingZoom.current?.value ?? getZoom()) * factor);

  return <Panel position="bottom-left" className="canvas-navigation nodrag nopan nowheel" data-map-open={mapOpen}
    style={minimapLayout} onKeyDown={event => {
      if (event.key !== 'Escape' || !mapOpen) return;
      event.stopPropagation();
      setMapOpen(false);
      mapTrigger.current?.focus({ preventScroll: true });
    }}>
    <div className="navigation-toolbar" role="group" aria-label="画布缩放和小地图">
      <button type="button" title="缩小" aria-label="缩小" disabled={zoom <= canvasMinZoom} onClick={() => stepZoom(1 / zoomStep)}>
        <HugeiconsIcon icon={MinusSignIcon} size={16} aria-hidden="true" />
      </button>
      <ZoomPercentage percent={percent} reducedMotion={reducedMotion} onChange={changeZoom} />
      <button type="button" title="放大" aria-label="放大" disabled={zoom >= canvasMaxZoom} onClick={() => stepZoom(zoomStep)}>
        <HugeiconsIcon icon={PlusSignIcon} size={16} aria-hidden="true" />
      </button>
      <span className="navigation-divider" aria-hidden="true" />
      <button type="button" ref={mapTrigger} title={mapOpen ? '收起小地图' : '展开小地图'}
        aria-label={mapOpen ? '收起小地图' : '展开小地图'} aria-expanded={mapOpen} aria-controls={mapId}
        onClick={() => setMapOpen(open => !open)}>
        <HugeiconsIcon icon={MapIcon} size={17} aria-hidden="true" />
      </button>
    </div>
    <div className="navigation-map-reveal" id={mapId} aria-hidden={!mapOpen}
      onPointerDownCapture={() => { pendingZoom.current = null; }}
      onWheelCapture={() => { pendingZoom.current = null; }}>
      <div className="navigation-map" ref={mapContainer}>
        <MinimapScaleContext.Provider value={mapProjection?.scale ?? 0}>
          <MiniMap<AppNode> position="bottom-left" style={minimapSize}
            ariaLabel="画布小地图" nodeComponent={MapNode} pannable zoomable
            bgColor="transparent" maskColor="transparent" maskStrokeColor="transparent"
            onClick={(_event, { x, y }) => void setCenter(x, y, { zoom: getZoom() })} />
        </MinimapScaleContext.Provider>
        {mapProjection && <div className="navigation-map-viewport" style={mapProjection.frame} aria-hidden="true" />}
      </div>
    </div>
  </Panel>;
}
