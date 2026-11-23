import * as Menu from '@radix-ui/react-dropdown-menu';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Panel } from '@xyflow/react';
import { motion } from 'motion/react';
import { clearColorTags, colorTags, countNodeColorTags, nodeColorTags, type ColorTag } from '../nodes/colorTags';
import type { AppNode } from '../nodes/types';
import { canvasDownloadContents } from '../nodes/canvasDownloads';
import { downloadAssets } from '../nodes/fileMedia';
import './canvas-color-tags.css';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const getServerReducedMotion = () => false;
function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function CanvasColorTags({ nodes, active, onActiveChange, setNodes, onRestoreCanvasFocus }: {
  nodes: AppNode[]; active: ColorTag[]; onActiveChange: (colors: ColorTag[]) => void;
  setNodes: (update: (nodes: AppNode[]) => AppNode[]) => void;
  onRestoreCanvasFocus: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [busy, setBusy] = useState(false);
  const downloading = useRef(false);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState('');
  const expanded = hover || focused || open;
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion);
  const transition = { duration: keyboard || reducedMotion ? 0 : 0.2, ease: 'easeOut' as const };
  const counts = useMemo(() => countNodeColorTags(nodes), [nodes]);
  const availableColors = colorTags.filter(tag => counts[tag.id] > 0);
  useEffect(() => {
    const next = active.filter(color => counts[color] > 0);
    if (next.length !== active.length) onActiveChange(next);
    if (!colorTags.some(tag => counts[tag.id] > 0)) {
      setOpen(false); setHover(false); setFocused(false);
    }
  }, [active, counts, onActiveChange]);
  const tagged = (color?: ColorTag) => nodes.filter(node => color ? nodeColorTags(node).includes(color) : nodeColorTags(node).length > 0);
  async function download(color?: ColorTag) {
    if (downloading.current) return;
    const { assets, extraFiles } = canvasDownloadContents(tagged(color));
    if (!assets.length && !extraFiles.length) { setError('这些标记节点还没有可下载的内容。'); return; }
    downloading.current = true; setBusy(true); setError('');
    try { await downloadAssets(assets, { extraFiles, name: 'tagged.zip' }); }
    catch { setError('标记内容下载失败，请重试。'); }
    finally { downloading.current = false; setBusy(false); }
  }
  if (!availableColors.length) return null;
  return <Panel position="top-right" className="canvas-color-tags nodrag nopan nowheel" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
    <div className="canvas-color-tag-group" data-expanded={expanded} data-active={active.length > 0} data-keyboard={keyboard}
      onPointerEnter={() => { setKeyboard(false); setFocused(false); setHover(true); }} onPointerLeave={() => setHover(false)}
      onKeyDownCapture={event => { if (event.target instanceof Node && event.currentTarget.contains(event.target)) { setKeyboard(true); setFocused(true); } }}
      onFocusCapture={event => { if (event.currentTarget.contains(event.target) && event.target.matches(':focus-visible')) { setKeyboard(true); setFocused(true); } }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <motion.div className="canvas-color-swatches" role="group" aria-label="按颜色高亮节点" initial={false} animate={{ opacity: expanded ? 1 : 0.5 }} transition={transition}>
        {availableColors.map((tag, index) => <motion.div key={tag.id} className="canvas-color-swatch" initial={false} animate={{ marginLeft: expanded ? 2 : index === 0 ? 0 : -4 }} transition={transition}>
          <button type="button" aria-label={`高亮${tag.label}标记节点`} aria-pressed={active.includes(tag.id)}
          className="canvas-color-filter" style={{ background: expanded && active.includes(tag.id) ? `color-mix(in srgb, ${tag.color} 15%, transparent)` : undefined }}
          onKeyDown={() => setKeyboard(true)} onClick={() => onActiveChange(active.includes(tag.id) ? active.filter(color => color !== tag.id) : [...active, tag.id])}>
          <span className="node-tag-dot" style={{ background: tag.color }} />{expanded && active.includes(tag.id) && <span>{counts[tag.id]}</span>}
          </button>
        </motion.div>)}
      </motion.div>
      <Menu.Root open={open} onOpenChange={setOpen} modal={false}>
        <motion.div className="color-tag-more-reveal" initial={false} animate={{ width: expanded ? 18 : 0, opacity: expanded ? 1 : 0 }} transition={transition}>
          <Menu.Trigger asChild><button ref={moreTrigger} type="button" className="color-tag-more" aria-label="颜色标记更多操作" onPointerDown={() => setKeyboard(false)} onKeyDown={() => setKeyboard(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
          </button></Menu.Trigger>
        </motion.div>
        <Menu.Portal><Menu.Content className="color-tag-menu color-tag-actions nodrag nopan nowheel" align="start" sideOffset={9} collisionPadding={0} data-keyboard={keyboard}
          onCloseAutoFocus={event => { if (!moreTrigger.current?.isConnected) { event.preventDefault(); onRestoreCanvasFocus(); } }}
          aria-label="颜色标记更多操作" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => { setKeyboard(true); event.stopPropagation(); }}>
          <div className="color-tag-action-grid">
            {(['download', 'save', 'clear'] as const).map(action => <Menu.Group key={action} className="color-tag-action-row">
              <Menu.Label className="color-tag-action-label">{action === 'download' ? 'Download tagged' : action === 'save' ? 'Save tagged' : 'Clear'}</Menu.Label>
              {colorTags.map(tag => <Menu.Item key={tag.id} disabled={!counts[tag.id] || action === 'save' || (action === 'download' && busy)}
                aria-label={`${action === 'download' ? '下载' : action === 'save' ? '保存' : '清除'}${tag.label}标记${action === 'clear' ? '' : '内容'}`}
                className="color-tag-action-dot" data-color={tag.id} data-unavailable={!counts[tag.id]} onSelect={() => { if (action === 'download') void download(tag.id); else setNodes(nodes => clearColorTags(nodes, tag.id)); }}>
                <span className="node-tag-dot" style={{ background: tag.color }} />
                {action !== 'save' && <svg className="color-tag-action-mark" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {action === 'download' ? <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></> : <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>}
                </svg>}
              </Menu.Item>)}
            </Menu.Group>)}
          </div>
          <Menu.Separator />
          <Menu.Item className="color-tag-action-item" aria-label="下载全部标记内容" disabled={busy} onSelect={() => void download()}>Download all tagged</Menu.Item>
          <Menu.Item className="color-tag-action-item" aria-label="保存全部标记内容" disabled>Save all tagged</Menu.Item>
          <Menu.Separator />
          <Menu.Item className="color-tag-action-item color-tag-danger" aria-label="清除全部标记" onSelect={() => setNodes(nodes => clearColorTags(nodes))}>Clear all tags</Menu.Item>
        </Menu.Content></Menu.Portal>
      </Menu.Root>
    </div>
    {error && <div className="color-tag-error" role="alert">{error}<button type="button" aria-label="关闭下载提示" onClick={() => setError('')}>×</button></div>}
  </Panel>;
}
