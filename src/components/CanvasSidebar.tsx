import { Fragment } from 'react';
import type { RefObject } from 'react';
import { spring } from '../lib/springs';
import { Tooltip, TooltipProvider } from './ui/tooltip';
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
};
export function CanvasSidebar({ tool, onToolChange, addTrigger, menuOpen, onAddMenu }: Props) {
  return <div className="canvas-sidebar-positioner nodrag nopan nowheel">
    <nav className="canvas-sidebar" aria-label="画布工具栏">
      <TooltipProvider disableHoverableContent>
        {dockItems.map(({ id, label, asset, shortcut, divider }) => <Fragment key={id}>
          {divider && <div className="canvas-sidebar-divider" aria-hidden="true" />}
          <Tooltip side="right" sideOffset={12} forceOpen={menuOpen ? false : undefined}
            className="canvas-sidebar-tooltip"
            contentClassName="canvas-sidebar-tooltip-content"
            content={shortcut ? <span className="inline-flex items-center gap-2 whitespace-nowrap">
              {label}<kbd>{shortcut}</kbd>
            </span> : label}>
            <button ref={id === 'add' ? addTrigger : undefined} type="button"
              className={`canvas-sidebar-button${id === 'add' ? ' canvas-sidebar-add' : ''}`}
              aria-label={label} aria-pressed={id === 'select' || id === 'hand' ? tool === id : undefined}
              aria-keyshortcuts={shortcut} aria-haspopup={id === 'add' ? 'dialog' : undefined}
              aria-expanded={id === 'add' ? menuOpen : undefined}
              aria-controls={id === 'add' && menuOpen ? 'canvas-node-menu' : undefined}
              onClick={event => {
                if (id === 'add') onAddMenu(event.detail === 0);
                if (id === 'select' || id === 'hand') onToolChange(id);
              }}>
              <img src={`/canvas-menu/${asset}.svg`} alt="" draggable={false}
                style={id === 'add' ? { transitionDuration: `${menuOpen ? spring.moderate.duration : spring.moderate.exit.duration}s` } : undefined} />
            </button>
          </Tooltip>
        </Fragment>)}
      </TooltipProvider>
    </nav>
  </div>;
}
