import { Fragment, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { spring } from '../lib/springs';
import { Tooltip, TooltipProvider } from './ui/tooltip';
import { GridViewIcon, Settings02Icon } from '@hugeicons/core-free-icons';
import { NodeAddMenu } from './NodeAddMenu';
import './CanvasSidebar.css';

export type CanvasTool = 'select' | 'hand';

type DockId = 'add' | 'files' | CanvasTool | 'search' | 'more';
const dockItems: { id: DockId; label: string; asset: string; shortcut?: string; divider?: boolean }[] = [
  { id: 'add', label: '添加节点', asset: 'add01' },
  { id: 'files', label: '文件', asset: 'folder01' },
  { id: 'select', label: '选择工具', asset: 'cursor02', shortcut: 'V', divider: true },
  { id: 'hand', label: '抓手工具', asset: 'hand', shortcut: 'H' },
  { id: 'search', label: '搜索', asset: 'search-dock' },
  { id: 'more', label: '更多', asset: 'more-horizontal', divider: true },
];
type Props = {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  addTrigger: RefObject<HTMLButtonElement>;
  menuOpen: boolean;
  onAddMenu: (keyboard: boolean) => void;
  onApiSettings?: () => void;
  gridSnap?: { enabled: boolean; toggle: () => void };
};
const apiSettingsAction = { id: 'api-settings', label: 'API 设置', icon: Settings02Icon };
export function CanvasSidebar({ tool, onToolChange, addTrigger, menuOpen, onAddMenu, onApiSettings, gridSnap }: Props) {
  const moreActions = [apiSettingsAction, ...(gridSnap ? [
    { id: 'grid-snap', label: '网格对齐', icon: GridViewIcon, checked: gridSnap.enabled },
  ] : [])];
  const selectTrigger = useRef<HTMLButtonElement>(null);
  const handTrigger = useRef<HTMLButtonElement>(null);
  const toolIndicator = useRef<HTMLSpanElement>(null);
  const pointerToolChange = useRef<CanvasTool | null>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number; keyboard: boolean } | null>(null);
  const dismissMore = useCallback(() => {
    setMoreMenu(null);
    moreTrigger.current?.focus({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    const indicator = toolIndicator.current;
    const button = (tool === 'select' ? selectTrigger : handTrigger).current;
    if (indicator && button) {
      // Only pointer changes travel; mount, shortcuts and keyboard clicks snap.
      indicator.dataset.animate = String(pointerToolChange.current === tool);
      indicator.style.transform = `translateY(${button.offsetTop}px)`;
    }
    pointerToolChange.current = null;
  }, [tool]);
  return <div className="canvas-sidebar-positioner nodrag nopan nowheel">
    <nav className="canvas-sidebar" aria-label="画布工具栏">
      <span ref={toolIndicator} className="canvas-sidebar-tool-indicator" aria-hidden="true"
        style={{ transitionDuration: `${spring.moderate.duration}s` }} />
      <TooltipProvider disableHoverableContent>
        {dockItems.map(({ id, label, asset, shortcut, divider }) => <Fragment key={id}>
          {divider && <div className="canvas-sidebar-divider" aria-hidden="true" />}
          <Tooltip side="right" sideOffset={12} forceOpen={menuOpen || moreMenu ? false : undefined}
            className="canvas-sidebar-tooltip"
            contentClassName="canvas-sidebar-tooltip-content"
            content={shortcut ? <span className="inline-flex items-center gap-2 whitespace-nowrap">
              {label}<kbd>{shortcut}</kbd>
            </span> : label}>
            <button ref={id === 'add' ? addTrigger : id === 'more' ? moreTrigger : id === 'select' ? selectTrigger : id === 'hand' ? handTrigger : undefined} type="button"
              className={`canvas-sidebar-button${id === 'add' ? ' canvas-sidebar-add' : ''}`}
              aria-label={label} aria-pressed={id === 'select' || id === 'hand' ? tool === id : undefined}
              aria-keyshortcuts={shortcut} aria-haspopup={id === 'add' ? 'dialog' : id === 'more' ? 'menu' : undefined}
              aria-expanded={id === 'add' ? menuOpen : id === 'more' ? Boolean(moreMenu) : undefined}
              aria-controls={id === 'add' && menuOpen ? 'canvas-node-menu' : id === 'more' && moreMenu ? 'canvas-more-menu' : undefined}
              onClick={event => {
                if (id === 'more') {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setMoreMenu(current => current ? null : { x: bounds.right + 12, y: bounds.top, keyboard: event.detail === 0 });
                } else setMoreMenu(null);
                if (id === 'add') onAddMenu(event.detail === 0);
                if (id === 'select' || id === 'hand') {
                  pointerToolChange.current = event.detail > 0 && tool !== id ? id : null;
                  onToolChange(id);
                }
              }}>
              <span className="canvas-sidebar-icon" aria-hidden="true" style={{
                '--dock-icon': `url("/canvas-menu/${asset}.svg")`,
                ...(id === 'add' ? { transitionDuration: `${menuOpen ? spring.moderate.duration : spring.moderate.exit.duration}s` } : {}),
              } as CSSProperties} />
            </button>
          </Tooltip>
        </Fragment>)}
      </TooltipProvider>
    </nav>
    {moreMenu && <NodeAddMenu id="canvas-more-menu" actions={moreActions} trigger={moreTrigger}
      screen={moreMenu} animateEntrance instantEntrance={moreMenu.keyboard} onChoose={() => {}}
      onDismiss={dismissMore}
      onAction={id => {
        dismissMore();
        if (id === 'grid-snap') gridSnap?.toggle();
        else if (id === 'api-settings') onApiSettings?.();
      }} />}
  </div>;
}
