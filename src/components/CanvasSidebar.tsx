import { Fragment, useCallback, useId, useRef, useState } from 'react';
import type { CanvasTool } from './CanvasDock';
import { Button } from './ui/button';
import { NodeAddMenu } from './NodeAddMenu';
import './CanvasSidebar.css';

type DockItem = {
  id: 'add' | 'files' | CanvasTool | 'search' | 'more';
  label: string;
  shortcut?: string;
  divider?: boolean;
};

const dockItems: DockItem[] = [
  { id: 'add', label: '添加' },
  { id: 'files', label: '文件' },
  { id: 'select', label: '选择工具', shortcut: 'V', divider: true },
  { id: 'hand', label: '抓手工具', shortcut: 'H' },
  { id: 'search', label: '搜索' },
  { id: 'more', label: '更多', divider: true },
];

type Props = {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  onAddNode: (id: string) => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
};

export function CanvasSidebar({ tool, onToolChange, onAddNode, menuOpen, onMenuOpenChange }: Props) {
  const [tooltip, setTooltip] = useState<DockItem['id'] | null>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const menuId = useId();
  const dismissMenu = useCallback(() => {
    onMenuOpenChange(false);
    if (document.activeElement?.closest('.node-add-menu')) addTrigger.current?.focus({ preventScroll: true });
  }, [onMenuOpenChange]);
  const dismissTooltip = (id: DockItem['id']) => {
    setTooltip(current => current === id ? null : current);
  };

  return <div className="canvas-sidebar-positioner nodrag nopan nowheel">
    <nav className="canvas-sidebar" aria-label="画布工具栏" onKeyDown={event => {
      if (event.key === 'Escape' && tooltip) {
        setTooltip(null);
        event.stopPropagation();
      }
    }}>
      {dockItems.map(({ id, label, shortcut, divider }) => <Fragment key={id}>
        {divider && <div className="canvas-sidebar-divider" aria-hidden="true" />}
        <Button
          ref={id === 'add' ? addTrigger : undefined}
          type="button"
          variant="ghost"
          size="icon"
          className={`canvas-sidebar-button${id === 'add' ? ' canvas-sidebar-add' : ''}`}
          aria-label={label}
          aria-pressed={id === 'select' || id === 'hand' ? tool === id : undefined}
          aria-keyshortcuts={shortcut}
          aria-haspopup={id === 'add' ? 'dialog' : undefined}
          aria-expanded={id === 'add' ? menuOpen : undefined}
          aria-controls={id === 'add' && menuOpen ? menuId : undefined}
          aria-describedby={tooltip === id ? `${tooltipId}-${id}` : undefined}
          onPointerEnter={event => { if (event.pointerType !== 'touch' && !menuOpen) setTooltip(id); }}
          onPointerLeave={() => dismissTooltip(id)}
          onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setTooltip(id); }}
          onBlur={() => dismissTooltip(id)}
          onClick={() => {
            setTooltip(null);
            if (id === 'add') onMenuOpenChange(!menuOpen);
            if (id === 'select' || id === 'hand') onToolChange(id);
          }}
        >
          <img src={`/canvas-sidebar/${id}.svg`} alt="" draggable={false} />
          <span id={`${tooltipId}-${id}`} role="tooltip" className="canvas-sidebar-tooltip" data-visible={tooltip === id} aria-hidden={tooltip !== id}>
            {label}{shortcut && <kbd>{shortcut}</kbd>}
          </span>
        </Button>
      </Fragment>)}
    </nav>
    {menuOpen && <NodeAddMenu id={menuId} trigger={addTrigger} onDismiss={dismissMenu}
      onChoose={id => { onAddNode(id); dismissMenu(); }} />}
  </div>;
}
