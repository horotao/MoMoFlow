import { NodeToolbarTooltip } from '../components/NodeToolbarTooltip';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { NodeResizer, NodeToolbar, ViewportPortal, useReactFlow, useStore, useStoreApi, type NodeProps } from '@xyflow/react';
import { Download, Play, Ungroup } from 'lucide-react';
import { AnimatePresence, useIsPresent } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { CanvasAlignmentMenu } from '../components/CanvasAlignmentMenu';
import { CanvasToolbarDivider, CanvasToolbarSurface } from '../components/CanvasSelectionToolbar';
import { canvasDownloadContents } from './canvasDownloads';
import { arrangeGroup, ungroupNodes } from './canvasGroups';
import { downloadAssets } from './fileMedia';
import { generationNodes, maxSelectionGenerationNodes, requestCanvasRun } from './selectionGeneration';
import { isCanvasGroup, isNodeLocked, type AppNode, type CanvasGroup } from './types';
import './CanvasGroupNode.css';

const colors = [
  { label: '默认', value: '#ffffff' },
  { label: '天蓝色', value: '#68d6ee' },
  { label: '柠檬色', value: '#d5f971' },
  { label: '紫色', value: '#b99af1' },
  { label: '黄色', value: '#f4cb6b' },
  { label: '珊瑚色', value: '#e9817f' },
  { label: '绿色', value: '#a6f899' },
  { label: '粉色', value: '#ed9fda' },
  { label: '青色', value: '#64c0bb' },
];

type GroupMenu = 'color' | 'alignment';

export function CanvasGroupNode({ id, data, selected, dragging, positionAbsoluteX, positionAbsoluteY, width, height }: NodeProps<CanvasGroup>) {
  const { setNodes, getEdges } = useReactFlow<AppNode>();
  const store = useStoreApi();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState<GroupMenu | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const leaveTimer = useRef<number | undefined>(undefined);
  const resizing = useStore(state => Boolean(state.nodeLookup.get(id)?.resizing));
  const canResize = useStore(state => state.elementsSelectable && !state.userSelectionRect && !state.connection.inProgress);
  const showToolbar = useStore(state => !dragging && !resizing && state.elementsSelectable
    && !editing && !state.userSelectionRect && !state.connection.inProgress
    && (hovered || focused || menu !== null || selected && !state.nodes.some(node => node.selected && node.id !== id)));
  useEffect(() => {
    if (showToolbar) return;
    setFocused(false);
    setMenu(null);
  }, [showToolbar]);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  const enter = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    window.clearTimeout(leaveTimer.current);
    setHovered(true);
  };
  const leave = () => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setHovered(false), 160);
  };
  const update = (patch: Partial<CanvasGroup['data']>) => setNodes(nodes => nodes.map(node =>
    node.id === id && isCanvasGroup(node) ? { ...node, data: { ...node.data, ...patch } } : node));
  const rename = () => {
    const label = draft.trim();
    if (label && label !== data.label) update({ label });
    setEditing(false);
  };
  const color = colors.find(option => option.value === data.color)?.value ?? colors[0].value;
  const startResize = useCallback(() => {
    const { domNode, unselectNodesAndEdges, addSelectedNodes } = store.getState();
    store.setState({ nodesSelectionActive: false });
    unselectNodesAndEdges();
    addSelectedNodes([id]);
    domNode?.focus({ preventScroll: true });
  }, [id, store]);

  return <div className="canvas-group" style={{ '--group-color': color } as CSSProperties}
    onPointerEnter={enter} onPointerLeave={leave}>
    {(resizing || (canResize && !data.locked && !editing && !dragging)) && <ViewportPortal>
      <div className="canvas-group-resize-frame nopan nokey" aria-hidden="true"
        style={{ left: positionAbsoluteX, top: positionAbsoluteY, width, height }}>
        <NodeResizer nodeId={id} minWidth={64} minHeight={64} autoScale={false} onResizeStart={startResize}
          lineClassName="canvas-group-resize" handleClassName="canvas-group-resize" />
      </div>
    </ViewportPortal>}
    <div className="canvas-group-title">
      {editing ? <input className="nodrag nopan nokey" aria-label="群组名称" autoFocus value={draft} maxLength={128}
        onChange={event => setDraft(event.target.value)} onBlur={rename} onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Enter') { event.preventDefault(); rename(); }
          if (event.key === 'Escape') { event.preventDefault(); setEditing(false); }
        }} /> : <span title={data.label} onDoubleClick={event => {
          event.stopPropagation(); setDraft(data.label); setEditing(true);
        }}>{data.label}</span>}
    </div>
    <AnimatePresence>
      {showToolbar && <NodeToolbar key="toolbar" isVisible offset={40} className="canvas-group-toolbar-anchor" style={{ zIndex: 11 }}
        onPointerEnter={enter} onPointerLeave={leave}>
        <GroupActions id={id} name={data.label} color={color} menu={menu}
          onFocusChange={setFocused} onMenuChange={setMenu} onColor={value => update({ color: value })}
          onUngroup={() => {
            store.getState().domNode?.focus({ preventScroll: true });
            setNodes(nodes => ungroupNodes(nodes, id));
          }}
          onArrange={action => setNodes(nodes => arrangeGroup(nodes, getEdges(), id, action))} />
      </NodeToolbar>}
    </AnimatePresence>
  </div>;
}

function GroupActions({ id, name, color, menu, onFocusChange, onMenuChange, onColor, onUngroup, onArrange }: {
  id: string;
  name: string;
  color: string;
  menu: GroupMenu | null;
  onFocusChange: (focused: boolean) => void;
  onMenuChange: (menu: GroupMenu | null) => void;
  onColor: (color: string) => void;
  onUngroup: () => void;
  onArrange: (action?: Parameters<typeof arrangeGroup>[3]) => void;
}) {
  const present = useIsPresent();
  const members = useStore(state => (state.nodes as AppNode[]).filter(node => node.parentId === id && !node.hidden),
    (previous, next) => previous.length === next.length && previous.every((node, index) => node === next[index]));
  const runnable = generationNodes(members).length;
  const editable = members.filter(node => !isNodeLocked(node)).length;
  const contents = useMemo(() => canvasDownloadContents(members), [members]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const download = async () => {
    if (busy) return;
    setBusy(true); setError(false);
    try { await downloadAssets(contents.assets, { extraFiles: contents.extraFiles, name: `${name}.zip` }); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  return <CanvasToolbarSurface className="canvas-group-toolbar" aria-label="群组工具栏"
    onFocus={event => { if (event.target.matches(':focus-visible')) onFocusChange(true); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onFocusChange(false); }}>
    <Menu.Root modal={false} open={present && menu === 'color'} onOpenChange={open => onMenuChange(open ? 'color' : null)}>
      <NodeToolbarTooltip label="群组颜色"><Menu.Trigger asChild>
        <button type="button" aria-label="群组颜色">
          <span className="canvas-group-color-dot" style={{ background: color }} />
        </button>
      </Menu.Trigger></NodeToolbarTooltip>
      <Menu.Portal>
        <Menu.Content className="canvas-group-color-menu canvas-alignment-menu nodrag nopan nowheel nokey"
          aria-label="群组颜色" sideOffset={9} align="start" collisionPadding={8}
          onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}
          onWheel={event => event.stopPropagation()}>
          <Menu.RadioGroup value={color} onValueChange={onColor}>
            {colors.map(option => <Menu.RadioItem key={option.value} value={option.value} aria-label={option.label}
              className="canvas-alignment-item">
              <span className="canvas-group-color-dot" style={{ background: option.value }} />
            </Menu.RadioItem>)}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
    <CanvasToolbarDivider />
    <NodeToolbarTooltip label="解组"><button type="button" aria-label="解组" onClick={onUngroup}>
      <Ungroup size={16} aria-hidden="true" />
    </button></NodeToolbarTooltip>
    <NodeToolbarTooltip label="下载群组内容"><button type="button" aria-label="下载群组内容"
      disabled={busy || !contents.assets.length && !contents.extraFiles.length} onClick={() => void download()}>
      <Download size={16} aria-hidden="true" />
    </button></NodeToolbarTooltip>
    <CanvasAlignmentMenu count={editable} disabled={editable < 2} onAlign={onArrange} onArrange={onArrange}
      open={present && menu === 'alignment'} onOpenChange={open => onMenuChange(open ? 'alignment' : null)} />
    <CanvasToolbarDivider />
    <NodeToolbarTooltip label={runnable > maxSelectionGenerationNodes ? `一次最多运行 ${maxSelectionGenerationNodes} 个节点` : '运行群组节点'}><button type="button" aria-label="运行群组节点"
      disabled={!runnable || runnable > maxSelectionGenerationNodes} onClick={() => requestCanvasRun(members.map(node => node.id))}>
      <Play size={16} aria-hidden="true" />
    </button></NodeToolbarTooltip>
    {error && <span className="canvas-group-download-error" role="alert">下载群组内容失败，请重试。</span>}
  </CanvasToolbarSurface>;
}
