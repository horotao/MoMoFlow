import { getNodesBounds, useStore, ViewportPortal, type ReactFlowState } from '@xyflow/react';
import { Columns2, Download, FolderPlus, Group, Link, Lock, LockOpen, MessagesSquare, Play, Presentation, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion, useIsPresent, type HTMLMotionProps } from 'motion/react';
import { useSyncExternalStore, type CSSProperties } from 'react';
import { colorTags, nodeColorTags, selectedTagNodes, type ColorTag } from '../nodes/colorTags';
import { selectionLockState } from '../nodes/nodeLocks';
import { maxSelectionGenerationNodes, selectedGenerationNodes } from '../nodes/selectionGeneration';
import { canGroupSelection } from '../nodes/canvasGroups';
import type { AppNode } from '../nodes/types';
import { alignmentNodeCount, type CanvasAlignment } from './canvasLayout';
import { CanvasAlignmentMenu } from './CanvasAlignmentMenu';
import { ColorTagPicker } from './NodeColorTagButton';
import { handleToolbarKeys } from './canvasToolbarKeys';
import './CanvasSelectionToolbar.css';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const readReducedMotion = () => reducedMotion.matches;
const subscribeReducedMotion = (callback: () => void) => {
  reducedMotion.addEventListener('change', callback);
  return () => reducedMotion.removeEventListener('change', callback);
};

const assetActions = [
  { label: '项目聊天', icon: MessagesSquare },
  { label: '添加到演示文稿', icon: Presentation },
  { label: '添加到素材库', icon: FolderPlus },
  { label: '下载所选内容', icon: Download },
  { label: '复制所选节点链接', icon: Link },
];

function PlaceholderAction({ label, icon: Icon }: {
  label: string; icon: LucideIcon;
}) {
  return <button type="button" aria-label={label} title={`${label}（暂未实现）`} disabled>
    <Icon size={16} aria-hidden="true" />
  </button>;
}

export function CanvasToolbarDivider() {
  return <span className="canvas-selection-toolbar-divider" aria-hidden="true" />;
}

export function CanvasToolbarSurface({ className, ...props }: Pick<HTMLMotionProps<'div'>,
  'className' | 'children' | 'aria-label' | 'onFocus' | 'onBlur'>) {
  const present = useIsPresent();
  const reduce = useSyncExternalStore(subscribeReducedMotion, readReducedMotion);
  return <motion.div {...props}
    className={`canvas-selection-toolbar nodrag nopan nowheel nokey${className ? ` ${className}` : ''}`}
    role="toolbar" aria-hidden={!present || undefined} {...(!present ? { inert: '' } : {})}
    initial={reduce ? false : { opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 4 }}
    transition={{ duration: reduce ? 0 : .18, ease: [.23, 1, .32, 1] }}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    onKeyDown={handleToolbarKeys} />;
}

function selectedBounds(state: ReactFlowState) {
  const selected = state.nodes.filter(node => node.selected && !node.hidden);
  if (selected.length < 2) return;
  return getNodesBounds(selected, { nodeLookup: state.nodeLookup, nodeOrigin: state.nodeOrigin });
}

export function CanvasSelectionOutline() {
  const bounds = useStore(
    state => state.nodesSelectionActive && !state.userSelectionActive ? selectedBounds(state) : undefined,
    (a, b) => a?.x === b?.x && a?.y === b?.y && a?.width === b?.width && a?.height === b?.height,
  );
  if (!bounds) return null;
  return <ViewportPortal>
    <div className="canvas-selection-outline" aria-hidden="true" style={{
      left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height,
    }} />
  </ViewportPortal>;
}

function selectionAnchor(state: ReactFlowState) {
  if (state.userSelectionRect || state.connection.inProgress || !state.width || !state.height) return;
  const bounds = selectedBounds(state);
  if (!bounds) return;
  const [x, y, zoom] = state.transform;
  const left = x + bounds.x * zoom;
  const top = y + bounds.y * zoom;
  const right = left + bounds.width * zoom;
  const bottom = top + bounds.height * zoom;
  if (right <= 0 || left >= state.width || bottom <= 0 || top >= state.height) return;
  return { x: (left + right) / 2, y: top };
}

type ToolbarActions = {
  nodes: AppNode[];
  onAlign: (action: CanvasAlignment) => void;
  onArrange: () => void;
  onChangeTags: (color?: ColorTag) => void;
  onGroup?: () => void;
  onToggleLock: () => void;
  onRun: () => void;
};

function SelectionActions({ anchor, nodes, onAlign, onArrange, onChangeTags, onGroup, onToggleLock, onRun }: ToolbarActions & {
  anchor: { x: number; y: number };
}) {
  const present = useIsPresent();
  const editable = selectedTagNodes(nodes);
  const tags = editable.map(nodeColorTags);
  const commonTags = tags.length ? colorTags.filter(tag => tags.every(nodeTags => nodeTags.includes(tag.id))).map(tag => tag.id) : [];
  const alignmentCount = alignmentNodeCount(nodes);
  const { count, allLocked } = selectionLockState(nodes);
  const LockIcon = allLocked ? LockOpen : Lock;
  const lockLabel = allLocked ? '解锁所选节点' : '锁定所选节点';
  const runCount = selectedGenerationNodes(nodes).length;
  const runLabel = runCount > maxSelectionGenerationNodes ? `一次最多运行 ${maxSelectionGenerationNodes} 个节点` : '运行所选节点';

  return <div className="canvas-selection-toolbar-anchor" style={{
    '--selection-toolbar-x': `${anchor.x}px`,
    // Leave room for the node titles and keep the toolbar in view near the top.
    top: Math.max(50, anchor.y - 40),
  } as CSSProperties}>
    <CanvasToolbarSurface aria-label="多选节点工具栏">
      {assetActions.map(action => <PlaceholderAction key={action.label} {...action} />)}
      <CanvasToolbarDivider />
      <PlaceholderAction label="并排对比" icon={Columns2} />
      <CanvasToolbarDivider />
      <ColorTagPicker tags={commonTags} disabled={!present || !editable.length} onChange={onChangeTags} forSelection />
      <CanvasToolbarDivider />
      <button type="button" aria-label="编组" title="编组" disabled={!present || !onGroup || !canGroupSelection(nodes)} onClick={onGroup}>
        <Group size={16} aria-hidden="true" />
      </button>
      <button type="button" aria-label={lockLabel} title={lockLabel} disabled={!present || count < 2} onClick={onToggleLock}>
        <LockIcon size={16} aria-hidden="true" />
      </button>
      <CanvasAlignmentMenu disabled={!present || alignmentCount < 2} count={alignmentCount}
        onAlign={onAlign} onArrange={onArrange} />
      <CanvasToolbarDivider />
      <button type="button" aria-label="运行所选节点" title={runLabel}
        disabled={!present || !runCount || runCount > maxSelectionGenerationNodes} onClick={onRun}>
        <Play size={16} fill="currentColor" aria-hidden="true" />
      </button>
    </CanvasToolbarSurface>
  </div>;
}

export function CanvasSelectionToolbar({ enabled, ...actions }: ToolbarActions & { enabled: boolean }) {
  const anchor = useStore(selectionAnchor, (a, b) => a?.x === b?.x && a?.y === b?.y);
  return <AnimatePresence>
    {enabled && anchor && <SelectionActions key="selection" anchor={anchor} {...actions} />}
  </AnimatePresence>;
}
