import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { useReactFlow, ViewportPortal, type XYPosition } from '@xyflow/react';
import { wireCurve } from '../edges/wireGeometry';
import { OutputPortIcon } from './image-prompt-node/OutputPortIcon';

export type SelectionConnectionMenu = { sourceIds: string[]; screen: XYPosition; position: XYPosition };

export interface SelectionOutputProps {
  menu?: SelectionConnectionMenu;
  onOpen: (menu: SelectionConnectionMenu) => void;
}

// FLORA measures the pull from the left midpoint of the stationary hit area.
function moveGlyph(glyph: HTMLSpanElement, button: HTMLButtonElement, pointer: XYPosition) {
  const rect = button.getBoundingClientRect();
  const inside = pointer.x >= rect.left && pointer.x < rect.right && pointer.y >= rect.top && pointer.y < rect.bottom;
  const dx = pointer.x - rect.left, dy = pointer.y - (rect.top + rect.height / 2);
  const pull = Math.min(.35, 20 / Math.max(1, Math.hypot(dx, dy)));
  glyph.style.setProperty('--selection-pull', inside ? `translate(${dx * pull}px, ${dy * pull}px)` : 'translate(0px, 0px)');
}

export function CanvasSelectionOutput({ anchor, sourceIds, menu, onOpen }: SelectionOutputProps & {
  anchor: XYPosition; sourceIds: string[];
}) {
  const { screenToFlowPosition, getInternalNode } = useReactFlow();
  const button = useRef<HTMLButtonElement>(null);
  const glyph = useRef<HTMLSpanElement>(null);
  const hoverPoint = useRef<XYPosition>();
  function resetPull() {
    hoverPoint.current = undefined;
    glyph.current?.style.removeProperty('--selection-pull');
  }
  function followPointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'touch' || !event.isPrimary) { resetPull(); return; }
    hoverPoint.current = { x: event.clientX, y: event.clientY };
    if (glyph.current) moveGlyph(glyph.current, event.currentTarget, hoverPoint.current);
  }
  useLayoutEffect(() => {
    if (menu) resetPull();
    else if (hoverPoint.current && glyph.current && button.current) moveGlyph(glyph.current, button.current, hoverPoint.current);
  }, [anchor.x, anchor.y, menu]);
  useEffect(() => {
    window.addEventListener('blur', resetPull);
    return () => window.removeEventListener('blur', resetPull);
  }, []);
  const press = useRef<{ id: number; start: XYPosition; moved: boolean }>();
  const [tip, setTip] = useState<XYPosition>();
  const active = tip !== undefined;
  useEffect(() => {
    if (!active) return;
    function cancel() {
      press.current = undefined;
      setTip(undefined);
    }
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    }
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
    };
  }, [active]);

  function open(screen: XYPosition) {
    onOpen({ sourceIds, screen, position: screenToFlowPosition(screen) });
  }

  const endpoint = menu?.position ?? tip;
  return <>
    <button ref={button} type="button" aria-label="从所选节点创建下游节点" aria-haspopup="dialog"
      className="canvas-selection-output nodrag nopan nokey" data-dragging={active || undefined}
      style={{ left: anchor.x + 8, top: anchor.y, visibility: menu ? 'hidden' : undefined }}
      onPointerEnter={followPointer} onPointerLeave={resetPull} onPointerCancel={resetPull}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.stopPropagation();
        const screen = { x: event.clientX, y: event.clientY };
        press.current = { id: event.pointerId, start: screen, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        setTip(screenToFlowPosition(screen));
      }}
      onPointerMove={event => {
        followPointer(event);
        const current = press.current;
        if (!current || current.id !== event.pointerId) return;
        const screen = { x: event.clientX, y: event.clientY };
        if (Math.hypot(screen.x - current.start.x, screen.y - current.start.y) > 4) current.moved = true;
        setTip(screenToFlowPosition(screen));
      }}
      onLostPointerCapture={() => { press.current = undefined; setTip(undefined); }}
      onPointerUp={event => {
        const current = press.current;
        if (!current || current.id !== event.pointerId) return;
        event.stopPropagation();
        press.current = undefined;
        setTip(undefined);
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        if (!current.moved || hit?.classList.contains('react-flow__pane')) open({ x: event.clientX, y: event.clientY });
      }}
      onClick={event => {
        event.stopPropagation();
        if (event.detail === 0) {
          const rect = event.currentTarget.getBoundingClientRect();
          open({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }
      }}>
      <span ref={glyph} className="canvas-selection-output-glyph"><OutputPortIcon /></span>
    </button>
    {endpoint && <ViewportPortal><svg className="canvas-selection-wires" aria-hidden="true">
      {(menu?.sourceIds ?? sourceIds).map(id => {
        const node = getInternalNode(id);
        if (!node?.measured.width || !node.measured.height) return null;
        const { x, y } = node.internals.positionAbsolute;
        const start = { x: x + node.measured.width, y: y + node.measured.height / 2 };
        return <path key={id} className="workflow-preview" d={wireCurve(start, endpoint, 1)} />;
      })}
    </svg></ViewportPortal>}
  </>;
}
