import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Panel } from '@xyflow/react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, ArrowDown01Icon, Delete02Icon, Tick02Icon, WorkflowSquare10Icon } from '@hugeicons/core-free-icons';
import type { CanvasProject } from '../persistence/projectLibrary';
import { spring } from '../lib/springs';
import './CanvasProjectHeader.css';

const menuMotionStyle = { '--node-menu-duration': `${spring.moderate.duration}s` } as CSSProperties;
// BeUI Select: a clamped half-turn follows the reveal spring, then eases back.
// https://beui.dev/components/motion/select
const chevronOpen = { type: 'spring', visualDuration: 0.2, bounce: 0.12 } as const;
const chevronClose = { duration: 0.2, ease: [0.16, 1, 0.3, 1] } as const;

export type CanvasProjectActions = {
  project: CanvasProject;
  projects: CanvasProject[];
  refresh: () => Promise<void>;
  open: (project: CanvasProject) => Promise<void>;
  create: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  remove: (project: CanvasProject) => Promise<void>;
};

export function CanvasProjectHeader({ project, projects, refresh, open: openProject, create, rename, remove, nodeCount, status }: CanvasProjectActions & {
  nodeCount: number;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [pointerMotion, setPointerMotion] = useState(false);
  const reduceMotion = useReducedMotion();
  const chevronProgress = useMotionValue(0);
  const chevronTransform = useTransform(chevronProgress, progress =>
    `rotate(${Math.min(1, Math.max(0, progress)) * 180}deg)`);
  useEffect(() => {
    if (reduceMotion || !pointerMotion) {
      chevronProgress.set(open ? 1 : 0);
      return;
    }
    const animation = animate(chevronProgress, open ? 1 : 0, open ? chevronOpen : chevronClose);
    return () => animation.stop();
  }, [open, pointerMotion, reduceMotion, chevronProgress]);
  const [menuOrigin, setMenuOrigin] = useState(0);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const dismiss = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const blur = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('blur', blur);
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('blur', blur); };
  }, [open]);

  const run = async (action: () => Promise<void>, close = true) => {
    if (working.current) return;
    working.current = true;
    setBusy(true); setError('');
    try { await action(); if (close) dismiss(); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法操作项目，请重试。');
      requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true }));
    }
    finally { working.current = false; setBusy(false); }
  };
  const showMenu = (animate = false) => {
    setPointerMotion(animate);
    setMenuOrigin((trigger.current?.offsetWidth ?? 32) - 15);
    setOpen(true); setError('');
    void refresh().catch(cause => setError(cause instanceof Error ? cause.message : '无法读取项目列表。'));
  };
  const navigate = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    const item = (event.target as Element).closest('.canvas-project-item');
    if (item && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      item.querySelector<HTMLButtonElement>(event.key === 'ArrowRight' ? '.canvas-project-delete' : '.canvas-project-row')?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('.canvas-project-row, .canvas-project-create') ?? []);
    const index = items.indexOf(item?.querySelector('.canvas-project-row') ?? document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    items[next]?.focus();
  };
  const saveName = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== project.name) void run(() => rename(name.trim()), false);
  };

  return <Panel position="top-left" className="canvas-project-panel">
    <div ref={root} className="canvas-project-header nodrag nopan nowheel" style={menuMotionStyle}
      data-pointer-motion={pointerMotion ? '' : undefined}
      onPointerDown={event => event.stopPropagation()}
      onContextMenu={event => {
        event.preventDefault(); event.stopPropagation();
        showMenu(event.nativeEvent instanceof PointerEvent && Boolean(event.nativeEvent.pointerType));
      }}
      onBlur={event => { if (!working.current && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        event.stopPropagation();
        setPointerMotion(false);
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); dismiss(); }
      }}>
      <div className="canvas-project-info">
        {editing ? <input className="canvas-project-name-input" aria-label="项目名称" value={name} autoFocus maxLength={200}
          onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)} onBlur={saveName}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') { event.preventDefault(); saveName(); }
            if (event.key === 'Escape') { event.stopPropagation(); setEditing(false); trigger.current?.focus(); }
          }} /> : <button ref={trigger} type="button" className="canvas-project-trigger" aria-haspopup="menu"
          aria-expanded={open} aria-controls={open ? menuId : undefined} title={`${project.name}（双击重命名）`}
          onClick={event => open ? setOpen(false) : showMenu(event.detail > 0)}
          onDoubleClick={() => { setOpen(false); setName(project.name); setEditing(true); }}
          onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); showMenu(); } }}>
          <span className="canvas-project-name">{project.name}</span>
          <motion.span className="canvas-project-chevron" style={{ transform: chevronTransform }} aria-hidden="true">
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} absoluteStrokeWidth />
          </motion.span>
        </button>}
        <span className="canvas-project-count">节点 {nodeCount}</span>
        <span className="canvas-project-divider" aria-hidden="true" />
        <span className="canvas-project-status" role="status" title={status}>{status === '已保存到此浏览器' ? '已保存' : status}</span>
      </div>
      {open && <div ref={menu} id={menuId} role="menu" aria-label="项目" aria-busy={busy}
        className="canvas-project-menu" style={{ transformOrigin: `${menuOrigin}px -6px` }} onKeyDown={navigate}>
        <div className="canvas-project-heading">项目</div>
        <div className="canvas-project-list" role="group" aria-label="项目列表">
          {projects.map(item => <div key={item.id} className="canvas-project-item" role="none">
            <button type="button" role="menuitemradio" tabIndex={-1}
              aria-checked={item.id === project.id} aria-disabled={busy} className="canvas-project-row" title={item.name}
              onClick={() => { if (!busy) void run(() => item.id === project.id ? Promise.resolve() : openProject(item)); }}>
              <span className="canvas-project-thumbnail" aria-hidden="true">
                {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <HugeiconsIcon icon={WorkflowSquare10Icon} size={18} />}
              </span>
              <span className="canvas-project-row-name">{item.name}</span>
              <span className="canvas-project-row-state" aria-hidden="true">
                {item.id === project.id && <HugeiconsIcon className="canvas-project-check" icon={Tick02Icon} size={18} />}
              </span>
            </button>
            <button type="button" role="menuitem" tabIndex={-1} className="canvas-project-delete"
              aria-label={`删除项目：${item.name}`} title="删除项目" aria-disabled={busy}
              onClick={event => {
                event.stopPropagation();
                if (!busy) void run(async () => {
                  await remove(item);
                  if (item.id !== project.id) requestAnimationFrame(() => {
                    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
                  });
                }, item.id === project.id);
              }}>
              <HugeiconsIcon icon={Delete02Icon} size={18} aria-hidden="true" />
            </button>
          </div>)}
        </div>
        <div className="canvas-project-menu-divider" role="separator" />
        <button type="button" role="menuitem" tabIndex={-1} className="canvas-project-create" aria-disabled={busy}
          onClick={() => { if (!busy) void run(create); }}>
          <span>新建画布项目</span><HugeiconsIcon icon={Add01Icon} size={18} aria-hidden="true" />
        </button>
        {error && <div className="canvas-project-error" role="alert">{error}</div>}
      </div>}
      {error && !open && <div className="canvas-project-error" role="alert">{error}</div>}
    </div>
  </Panel>;
}
