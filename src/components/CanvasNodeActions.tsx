import * as Menu from '@radix-ui/react-dropdown-menu';
import { useReactFlow, type Edge, type XYPosition } from '@xyflow/react';
import { Check, ClipboardPaste, Copy, CopyPlus, Download, Eraser, Image, ImageUp, PencilLine, Tag, Trash2 } from 'lucide-react';
import { useContext, useEffect, useState, type RefObject } from 'react';
import { selectedImageResult } from '../nodes/annotationGraph';
import { selectedAudioAsset } from '../nodes/audioPreview';
import { canvasDownloadContents } from '../nodes/canvasDownloads';
import { changeColorTags, colorTags, nodeColorTags } from '../nodes/colorTags';
import { copyAssetImage, downloadAsset, downloadAssets, saveBlob } from '../nodes/fileMedia';
import { syncImageReferenceRatios } from '../nodes/imageReferenceRatio';
import { cloneNodeGraph, copyNodeGraph } from '../nodes/nodeClipboard';
import { clearNodeContents, hasNodeContents, requestNodeCommand } from '../nodes/nodeCommands';
import { isActiveTask } from '../nodes/taskQueue';
import { textOutputValue } from '../nodes/textGeneration';
import { isCanvasAudio, isCanvasGroup, isCanvasImageNode, isCanvasTextNode, isCanvasVideo, isNodeLocked, type AppNode } from '../nodes/types';
import { useVisibleCanvasImage } from '../nodes/visibleCanvasImage';
import { useNodeGenerationRunning } from '../nodes/visibleCanvasText';
import { CanvasHistoryContext } from './useCanvasHistory';
import { useModelTasks } from './useModelTasks';
import './canvas-node-actions.css';

const items = [
  ['copy', '复制', Copy, 'C'], ['png', '复制为 PNG', Image, ''], ['paste', '粘贴', ClipboardPaste, 'V'],
  ['duplicate', '创建副本', CopyPlus, 'D'], ['download', '下载', Download, '⇧D'], ['rename', '重命名', PencilLine, 'E'],
  ['tag', '标签', Tag, ''], ['delete', '删除', Trash2, 'del'], ['clear', '清空节点', Eraser, '⇧X'], ['replace', '替换图片', ImageUp, '⇧R'],
] as const;
type Action = typeof items[number][0];
export type NodeMenuLocation = { id: string; screen: XYPosition };

export function CanvasNodeActions({ node, nodes, edges, location, canvas, onClose, onPaste, onError }: {
  node: AppNode; nodes: AppNode[]; edges: Edge[]; location: NodeMenuLocation | null; canvas: RefObject<HTMLDivElement>;
  onClose: () => void; onPaste: (screen: XYPosition) => Promise<void>; onError: (message: string) => void;
}) {
  const { setNodes, setEdges, deleteElements } = useReactFlow<AppNode>();
  const history = useContext(CanvasHistoryContext);
  const running = useNodeGenerationRunning(node.id);
  const tasks = useModelTasks();
  const busy = running || tasks.some(task => task.nodeId === node.id && isActiveTask(task));
  const locked = isNodeLocked(node);
  const group = isCanvasGroup(node);
  const image = useVisibleCanvasImage(node.id, isCanvasImageNode(node) ? selectedImageResult(node) : undefined);
  const asset = image ?? (isCanvasVideo(node) ? node.data.asset : isCanvasAudio(node) ? selectedAudioAsset(node.data) : undefined);
  const text = isCanvasTextNode(node) ? textOutputValue(node.data) : '';
  const groupFiles = group ? canvasDownloadContents(nodes.filter(member => member.parentId === node.id)) : undefined;
  const disabled: Partial<Record<Action, boolean>> = {
    png: !image, download: !(asset || text || groupFiles?.assets.length || groupFiles?.extraFiles.length),
    rename: locked, tag: locked || group, delete: locked || (group && nodes.some(member => member.parentId === node.id && isNodeLocked(member))),
    clear: locked || busy || !hasNodeContents(node), replace: locked || busy || !isCanvasImageNode(node),
  };
  const [colorIndex, setColorIndex] = useState(0);
  const tags = nodeColorTags(node);
  const apple = /Mac|iPhone|iPad/.test(navigator.platform);
  const focusCanvas = () => canvas.current?.focus({ preventScroll: true });

  async function run(action: Action) {
    if (disabled[action]) return;
    if (action !== 'rename') focusCanvas();
    try {
      switch (action) {
        case 'copy': await copyNodeGraph(cloneNodeGraph(nodes, edges, node.id, node.position, true)); break;
        case 'png': if (image) await copyAssetImage(image); break;
        case 'paste': if (location) await onPaste(location.screen); break;
        case 'duplicate': {
          const graph = cloneNodeGraph(nodes, edges, node.id, { x: node.position.x + 40, y: node.position.y + 40 }, false);
          setNodes(current => [...current.map(n => n.selected ? { ...n, selected: false } : n), ...graph.nodes]);
          setEdges(current => [...current.map(e => e.selected ? { ...e, selected: false } : e), ...graph.edges]);
          break;
        }
        case 'download':
          if (groupFiles) await downloadAssets(groupFiles.assets, { extraFiles: groupFiles.extraFiles, name: node.data.label + '.zip' });
          else if (asset) await downloadAsset(asset);
          else if (isCanvasTextNode(node)) saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), (node.data.label || 'Text') + '.' + node.data.textComposer.format);
          break;
        case 'rename': case 'replace': requestNodeCommand(node.id, action); break;
        case 'delete': await deleteElements({ nodes: [{ id: node.id }] }); break;
        case 'clear':
          history.endEditGroup();
          setNodes(current => {
            const next = current.map(n => n.id === node.id ? clearNodeContents(n) : n);
            return isCanvasImageNode(node) ? syncImageReferenceRatios(next, edges, node.id,
              new Set(tasks.filter(isActiveTask).map(task => task.nodeId))) : next;
          });
          break;
      }
    } catch (error) {
      onError(error instanceof Error && error.name !== 'NotAllowedError' ? error.message : '操作未完成，请检查浏览器的剪贴板权限后重试。');
    }
  }

  // Only claim a shortcut when the canvas or its own context menu owns the keyboard.
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable], [role=dialog], [role=listbox]')) return;
      const menu = target.closest('.canvas-node-actions');
      if (!menu && (target !== document.body && !canvas.current?.contains(target)
        || document.querySelector('[role=menu], [role=dialog], dialog[open], .image-edit-mode, [role=listbox]'))) return;
      if (!menu && target.closest('.react-flow__panel')) return;
      const key = (event.shiftKey ? '⇧' : '') + event.key.toUpperCase();
      if (key === 'C' && window.getSelection()?.toString()) return;
      const item = items.find(item => item[3] === key);
      if (!item || (item[0] === 'paste' && !menu) || disabled[item[0]]) return;
      event.preventDefault();
      event.stopPropagation();
      if (menu) onClose();
      void run(item[0]);
    };
    window.addEventListener('keydown', shortcut, true);
    return () => window.removeEventListener('keydown', shortcut, true);
  });

  if (!location) return null;
  const toggleTag = (index: number) => setNodes(current => changeColorTags(current, [node.id], colorTags[index].id));
  const row = (item: typeof items[number]) => {
    const [action, label, Icon, key] = item;
    const icon = <span className="canvas-node-action-icon"><Icon aria-hidden="true" size={12} /></span>;
    if (action === 'tag') return <Menu.Item key={action} className="canvas-node-action canvas-node-tag" disabled={disabled.tag}
      textValue={label} onSelect={event => { event.preventDefault(); toggleTag(colorIndex); }}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault(); event.stopPropagation();
        setColorIndex(i => (i + (event.key === 'ArrowRight' ? 1 : -1) + colorTags.length) % colorTags.length);
      }}>
      {icon}{label}<span className="canvas-node-swatches">{colorTags.map((tag, i) =>
        <button key={tag.id} type="button" tabIndex={-1} disabled={disabled.tag} role="checkbox" aria-checked={tags.includes(tag.id)}
          aria-label={tag.label} title={tag.label} data-current={i === colorIndex} style={{ backgroundColor: tag.color }}
          onPointerMove={() => setColorIndex(i)} onClick={event => { event.stopPropagation(); toggleTag(i); }}>
          {tags.includes(tag.id) && <Check size={10} aria-hidden="true" />}
        </button>)}</span>
    </Menu.Item>;
    const hint = key === 'del' ? '⌫, del' : (apple ? '⌘' + key : 'Ctrl+' + key.replace('⇧', 'Shift+'));
    return <Menu.Item key={action} className="canvas-node-action" disabled={disabled[action]} textValue={label}
      onSelect={() => { void run(action); }}>
      {icon}<span>{label}</span>{key && <kbd>{hint}</kbd>}
    </Menu.Item>;
  };
  return <Menu.Root modal={false} open onOpenChange={open => { if (!open) onClose(); }}>
    <Menu.Trigger tabIndex={-1} aria-hidden className="canvas-node-action-anchor"
      style={{ left: location.screen.x, top: location.screen.y }} />
    <Menu.Portal><Menu.Content aria-label="节点操作" className="canvas-node-actions nodrag nopan nowheel nokey"
      side="right" align="start" collisionPadding={4} loop
      onCloseAutoFocus={event => event.preventDefault()}
      onEscapeKeyDown={event => { event.stopPropagation(); focusCanvas(); }}
      onKeyDownCapture={event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]:not([data-disabled])')];
        const current = rows.indexOf((event.target as HTMLElement).closest('[role=menuitem]') as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
          : event.key === 'ArrowDown' ? (current + 1) % rows.length : (Math.max(current, 0) - 1 + rows.length) % rows.length;
        event.preventDefault(); event.stopPropagation(); rows[next]?.focus();
      }}
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if ((event.key === 'Delete' || event.key === 'Backspace') && !disabled.delete && !event.repeat) {
          event.preventDefault(); onClose(); void run('delete');
        }
      }}>
      {items.slice(0, 6).map(row)}<Menu.Separator />
      {row(items[6])}<Menu.Separator />{row(items[7])}<Menu.Separator />{items.slice(8).map(row)}
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}
