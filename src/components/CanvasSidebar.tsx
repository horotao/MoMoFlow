import { Fragment, useId } from 'react';
import type { RefObject } from 'react';
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
  onAddMenu: () => void;
};
export function CanvasSidebar({ tool, onToolChange, addTrigger, menuOpen, onAddMenu }: Props) {
  const tooltipId = useId();
  return <div className="canvas-sidebar-positioner nodrag nopan nowheel">
    <nav className="canvas-sidebar" aria-label="画布工具栏">
      {dockItems.map(({ id, label, asset, shortcut, divider }) => <Fragment key={id}>
        {divider && <div className="canvas-sidebar-divider" aria-hidden="true" />}
        <button ref={id === 'add' ? addTrigger : undefined} type="button"
          className={`canvas-sidebar-button${id === 'add' ? ' canvas-sidebar-add' : ''}`}
          aria-label={label} aria-pressed={id === 'select' || id === 'hand' ? tool === id : undefined}
          aria-keyshortcuts={shortcut} aria-haspopup={id === 'add' ? 'dialog' : undefined}
          aria-expanded={id === 'add' ? menuOpen : undefined}
          aria-controls={id === 'add' && menuOpen ? 'canvas-node-menu' : undefined}
          aria-describedby={`${tooltipId}-${id}`}
          onClick={() => {
            if (id === 'add') onAddMenu();
            if (id === 'select' || id === 'hand') onToolChange(id);
          }}>
          <img src={`/canvas-menu/${asset}.svg`} alt="" draggable={false} />
          {!menuOpen && <span id={`${tooltipId}-${id}`} role="tooltip" className="canvas-sidebar-tooltip">
            {label}{shortcut && <kbd>{shortcut}</kbd>}
          </span>}
        </button>
      </Fragment>)}
    </nav>
  </div>;
}
