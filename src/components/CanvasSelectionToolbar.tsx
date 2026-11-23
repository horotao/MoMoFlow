import { ArrangeIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { getNodesBounds, useStore, type Edge, type ReactFlowState } from '@xyflow/react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useSyncExternalStore, type KeyboardEvent } from 'react';
import { colorTags, nodeColorTags, selectedTagNodes, type ColorTag } from '../nodes/colorTags';
import type { AppNode } from '../nodes/types';
import { canArrangeSelectedNodes } from './canvasLayout';
import { ColorTagPicker } from './NodeColorTagButton';
import './CanvasSelectionToolbar.css';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const readReducedMotion = () => reducedMotion.matches;
const subscribeReducedMotion = (callback: () => void) => {
  reducedMotion.addEventListener('change', callback);
  return () => reducedMotion.removeEventListener('change', callback);
};

function selectionAnchor(state: ReactFlowState) {
  if (state.userSelectionRect || state.connection.inProgress) return;
  const selected = state.nodes.filter(node => node.selected && !node.hidden);
  if (selected.length < 2 || !state.width || !state.height) return;
  const bounds = getNodesBounds(selected, { nodeLookup: state.nodeLookup, nodeOrigin: state.nodeOrigin });
  const [x, y, zoom] = state.transform;
  const left = x + bounds.x * zoom;
  const top = y + bounds.y * zoom;
  const right = left + bounds.width * zoom;
  const bottom = top + bounds.height * zoom;
  if (right <= 0 || left >= state.width || bottom <= 0 || top >= state.height) return;
  return { x: (left + right) / 2, y: top };
}

function handleToolbarKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.stopPropagation();
  event.preventDefault();
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:enabled'));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
    (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
  buttons[next]?.focus({ preventScroll: true });
}

type ToolbarActions = {
  nodes: AppNode[];
  edges: Edge[];
  onArrange: () => void;
  onChangeTags: (color?: ColorTag) => void;
};

function SelectionActions({ anchor, nodes, edges, onArrange, onChangeTags }: ToolbarActions & {
  anchor: { x: number; y: number };
}) {
  const present = useIsPresent();
  const reduce = useSyncExternalStore(subscribeReducedMotion, readReducedMotion);
  const editable = selectedTagNodes(nodes);
  const tags = editable.map(nodeColorTags);
  const commonTags = tags.length ? colorTags.filter(tag => tags.every(nodeTags => nodeTags.includes(tag.id))).map(tag => tag.id) : [];

  return <div className="canvas-selection-toolbar-anchor" style={{
    left: `clamp(49px, ${anchor.x}px, 100% - 49px)`,
    // Leave room for the node titles and keep the toolbar in view near the top.
    top: Math.max(50, anchor.y - 26),
  }}>
    <motion.div className="canvas-selection-toolbar nodrag nopan nowheel nokey"
      role="toolbar" aria-label="多选节点工具栏" aria-hidden={!present || undefined}
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 4 }}
      transition={{ duration: reduce ? 0 : .18, ease: [.23, 1, .32, 1] }}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
      onKeyDown={handleToolbarKeys}>
      <ColorTagPicker tags={commonTags} disabled={!present || !editable.length} onChange={onChangeTags} forSelection />
      <span className="canvas-selection-toolbar-divider" aria-hidden="true" />
      <button type="button" aria-label="自动整理" title="自动整理（Shift + L）"
        disabled={!present || !canArrangeSelectedNodes(nodes, edges)} onClick={onArrange}>
        <HugeiconsIcon icon={ArrangeIcon} size={16} aria-hidden="true" />
      </button>
    </motion.div>
  </div>;
}

export function CanvasSelectionToolbar({ enabled, ...actions }: ToolbarActions & { enabled: boolean }) {
  const anchor = useStore(selectionAnchor, (a, b) => a?.x === b?.x && a?.y === b?.y);
  return <AnimatePresence>
    {enabled && anchor && <SelectionActions key="selection" anchor={anchor} {...actions} />}
  </AnimatePresence>;
}
