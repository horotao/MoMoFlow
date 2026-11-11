import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { spring } from '../lib/springs';
import { ArrowLeft, X } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  isNodeMenuCategory, nodeMenuCategories, nodeMenuGroups, searchableNodeMenuEntries, resolveMenuGroups,
  type NodeMenuEntry, type NodeMenuGroup, type NodeMenuChoice,
} from './nodeMenuCatalog';
import { useCascadeMenu } from './useCascadeMenu';
import { ScrollArea } from './ui/scroll-area';
import './NodeAddMenu.css';

type Props = {
  id?: string;
  animateEntrance?: boolean;
  instantEntrance?: boolean;
  mode?: 'create' | 'connect';
  choices?: NodeMenuChoice[];
  actions?: NodeMenuEntry[];
  onAction?: (id: string) => void;
  trigger?: RefObject<HTMLButtonElement>;
  screen: { x: number; y: number };
  onChoose: (choice: NodeMenuChoice) => void;
  onDismiss: () => void;
};
type Placement = { left: number; top: number; overlaid?: boolean; transformOrigin?: string };
type MenuRowData = { entry: NodeMenuEntry; rowId: string; hasSubmenu: boolean; available: boolean };
const menuMotionStyle = { '--node-menu-duration': `${spring.moderate.duration}s` } as CSSProperties;

function MenuIcon({ entry }: { entry: NodeMenuEntry }) {
  return <span className="node-add-menu-icon" aria-hidden="true">
    {entry.asset ? <img src={`/canvas-menu/${entry.asset}.svg`} alt="" draggable={false} />
      : entry.icon && <HugeiconsIcon icon={entry.icon} size={18} strokeWidth={1.5} absoluteStrokeWidth />}
  </span>;
}
function MenuRow({ row, highlighted, child, category, menuId, onSelect }: {
  row: MenuRowData; highlighted: boolean; child: boolean;
  category: string | null; menuId: string; onSelect: (row: MenuRowData, keyboard: boolean) => void;
}) {
  const { entry, rowId, hasSubmenu, available } = row;
  return <button type="button" role="menuitem" tabIndex={-1}
    className="node-add-menu-row" data-main-row={child ? undefined : rowId}
    data-highlighted={highlighted || undefined}
    data-node-id={entry.nodeId} data-choice-id={entry.choice?.id}
    aria-disabled={!available || undefined} aria-haspopup={hasSubmenu ? 'menu' : undefined}
    aria-expanded={hasSubmenu ? category === entry.id : undefined}
    aria-controls={hasSubmenu && category === entry.id ? `${menuId}-submenu` : undefined}
    title={!available ? `${entry.label}（尚未接入）` : entry.choice?.detail ? `${entry.label} · ${entry.choice.detail}` : undefined}
    onClick={event => { if (available) onSelect(row, event.detail === 0); }}>
    <MenuIcon entry={entry} /><span className="node-add-menu-label">{entry.label}</span>
    {hasSubmenu && <img className="node-add-menu-chevron" src="/canvas-menu/arrow-right01.svg" alt="" draggable={false} />}
  </button>;
}
function MenuList({ groups, child, category, highlightedRow, keyboardInteraction, menuId, categoryAvailable, onSelect }: {
  groups: NodeMenuGroup[]; child: boolean; category: string | null; highlightedRow: string | null;
  keyboardInteraction: boolean;
  menuId: string; categoryAvailable: (id: string) => boolean; onSelect: (row: MenuRowData, keyboard: boolean) => void;
}) {
  return <div className="node-add-menu-list" data-keyboard={keyboardInteraction || undefined}>
    {groups.map((group, groupIndex) => <div key={group.label ?? groupIndex} role="group" aria-label={group.label}>
      {group.label && <div className="node-add-menu-heading" aria-hidden="true">{group.label}</div>}
      {group.entries.map(entry => {
        const rowId = isNodeMenuCategory(entry.id) ? entry.id : `${groupIndex}-${entry.id}`;
        const hasSubmenu = isNodeMenuCategory(entry.id) && categoryAvailable(entry.id);
        const row = { entry, rowId, hasSubmenu, available: Boolean(entry.choice) || hasSubmenu };
        return <MenuRow key={entry.id} row={row} highlighted={!child && rowId === highlightedRow} child={child}
          category={category} menuId={menuId} onSelect={onSelect} />;
      })}
    </div>)}
  </div>;
}
const menuButtons = (root: HTMLDivElement | null) => Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
function focusButton(button?: HTMLButtonElement) {
  button?.focus({ preventScroll: true });
  button?.scrollIntoView({ block: 'nearest' });
}
export function NodeAddMenu({ id = 'canvas-node-menu', animateEntrance = false, instantEntrance = false, screen, trigger, mode = 'create', choices, actions, onAction, onChoose, onDismiss }: Props) {
  const main = useRef<HTMLDivElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const focusSubmenu = useRef(false);
  const [query, setQuery] = useState('');
  const [keyboardInteraction, setKeyboardInteraction] = useState(instantEntrance);
  const [position, setPosition] = useState<Placement>({ left: screen.x, top: screen.y });
  const [subPosition, setSubPosition] = useState<Placement>({ left: screen.x, top: screen.y });
  const { activeRow, highlightedRow, activate, cancelHover } = useCascadeMenu({ main, submenu, trigger, onDismiss });
  const term = query.trim().toLocaleLowerCase();
  const categories = {
    editing: resolveMenuGroups(nodeMenuCategories.editing, choices),
    helpers: resolveMenuGroups(nodeMenuCategories.helpers, choices),
  };
  const categoryAvailable = (key: string) => isNodeMenuCategory(key) && categories[key].length > 0;
  const category = isNodeMenuCategory(activeRow) && categoryAvailable(activeRow) && !term ? activeRow : null;
  const matches = resolveMenuGroups([{ entries: searchableNodeMenuEntries }], choices).flatMap(group => group.entries)
    .filter(entry => `${entry.label} ${entry.keywords}`.toLocaleLowerCase().includes(term));
  const groups = term ? [{ label: '搜索结果', entries: matches }] : resolveMenuGroups(nodeMenuGroups, choices);

  useLayoutEffect(() => {
    if (actions) menuButtons(main.current)[0]?.focus({ preventScroll: true });
    else search.current?.focus({ preventScroll: true });
  }, [actions]);
  useLayoutEffect(() => {
    const place = () => {
      const menu = main.current;
      if (!menu) return;
      const anchor = trigger?.current?.getBoundingClientRect();
      const left = Math.max(8, Math.min(screen.x, window.innerWidth - menu.offsetWidth - 8));
      const top = Math.max(8, Math.min(screen.y, window.innerHeight - menu.offsetHeight - 8));
      setPosition({
        left, top,
        transformOrigin: anchor
          ? `${anchor.right - left}px ${anchor.top + anchor.height / 2 - top}px`
          : `${Math.max(0, screen.x - left)}px ${Math.max(0, screen.y - top)}px`,
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [screen, trigger]);
  useLayoutEffect(() => {
    if (!category) return;
    const place = () => {
      const bounds = main.current?.getBoundingClientRect();
      const row = main.current?.querySelector(`[data-main-row="${category}"]`)?.getBoundingClientRect();
      const child = submenu.current;
      if (!bounds || !row || !child) return;
      // Placement uses the final layout, even if a category is clicked during entry.
      const width = main.current!.offsetWidth;
      const scale = bounds.height / main.current!.offsetHeight;
      const rowTop = position.top + (row.top - bounds.top) / scale;
      const right = position.left + width;
      const fitsRight = right + 8 + child.offsetWidth <= window.innerWidth - 8;
      const fitsLeft = position.left - 8 - child.offsetWidth >= 8;
      const top = Math.max(8, Math.min(rowTop - 8, window.innerHeight - child.offsetHeight - 8));
      const originY = Math.max(0, Math.min(rowTop + row.height / scale / 2 - top, child.offsetHeight));
      setSubPosition({
        left: fitsRight ? right + 8 : fitsLeft ? position.left - child.offsetWidth - 8 : position.left,
        top,
        transformOrigin: `${fitsLeft && !fitsRight ? child.offsetWidth : 0}px ${originY}px`,
        overlaid: !fitsRight && !fitsLeft,
      });
      if (!fitsRight && !fitsLeft && !submenu.current?.contains(document.activeElement)) focusButton(menuButtons(submenu.current)[0]);
    };
    place();
    if (focusSubmenu.current) { focusButton(menuButtons(submenu.current)[0]); focusSubmenu.current = false; }
    const observer = new ResizeObserver(place);
    if (submenu.current) observer.observe(submenu.current);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [category, position]);
  const back = () => {
    const parent = main.current?.querySelector<HTMLButtonElement>(`[data-main-row="${category}"]`);
    activate(null); focusButton(parent ?? undefined);
  };
  const select = (row: MenuRowData, keyboard: boolean) => {
    if (!row.available) return;
    if (actions) { onAction?.(row.entry.id); return; }
    if (row.hasSubmenu) {
      setKeyboardInteraction(keyboard);
      focusSubmenu.current = keyboard;
      activate(row.entry.id);
      if (category === row.entry.id && keyboard) { focusButton(menuButtons(submenu.current)[0]); focusSubmenu.current = false; }
    } else if (row.entry.choice) onChoose(row.entry.choice);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, child: boolean) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    setKeyboardInteraction(true);
    cancelHover();
    const fromSearch = event.target === search.current;
    const buttons = menuButtons(child ? submenu.current : main.current);
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      if (child) back(); else onDismiss();
    } else if (event.key === 'ArrowLeft' && child) {
      event.preventDefault(); back();
    } else if (event.key === 'ArrowRight' && !fromSearch && !child) {
      const key = (event.target as HTMLElement).dataset.mainRow;
      if (key && categoryAvailable(key)) {
        event.preventDefault(); focusSubmenu.current = true; activate(key);
        if (category === key) { focusButton(menuButtons(submenu.current)[0]); focusSubmenu.current = false; }
      }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || (!fromSearch && (event.key === 'Home' || event.key === 'End'))) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index <= 0 ? buttons.length : index) - 1;
      focusButton(buttons[next]);
    } else if (event.key === 'Enter' && fromSearch && term && matches[0]?.choice) {
      event.preventDefault(); onChoose(matches[0].choice);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const controls = (category && subPosition.overlaid
        ? [submenu.current?.querySelector<HTMLButtonElement>('.node-add-menu-back'), ...menuButtons(submenu.current)]
        : [search.current, ...menuButtons(main.current), ...menuButtons(submenu.current)])
        .filter((element): element is HTMLInputElement | HTMLButtonElement => Boolean(element));
      const current = controls.indexOf(event.target as HTMLButtonElement);
      controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    }
  };
  return <>
    <div ref={main} id={id} className={`node-add-menu${actions ? ' node-add-menu-actions' : ''}${mode === 'connect' ? ' connection-menu' : ''} nodrag nopan nowheel`}
      data-animate-entrance={animateEntrance && !instantEntrance || undefined}
      style={{ ...position, ...menuMotionStyle }} role={actions ? 'menu' : 'dialog'} aria-label={actions ? '更多' : mode === 'connect' ? '推荐节点' : '添加节点'}
      onKeyDown={event => onKeyDown(event, false)}
      onPointerMoveCapture={() => setKeyboardInteraction(false)}
      onPointerDownCapture={() => setKeyboardInteraction(false)}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      {!actions && <div className="node-add-menu-search">
        <img src="/canvas-menu/search-menu.svg" alt="" draggable={false} />
        <input ref={search} value={query} placeholder="搜索" aria-label={mode === 'connect' ? '搜索可连接节点' : '搜索节点'} autoComplete="off" spellCheck={false}
          onChange={event => { setQuery(event.target.value); activate(null); }} />
        {query && <button type="button" aria-label="清空搜索" onClick={() => { setQuery(''); activate(null); search.current?.focus(); }}><X size={14} strokeWidth={1.5} absoluteStrokeWidth /></button>}
      </div>}
      {actions ? <div className="node-add-menu-list" data-keyboard={keyboardInteraction || undefined}>
        {actions.map(entry => <MenuRow key={entry.id} row={{ entry, rowId: entry.id, hasSubmenu: false, available: true }}
          highlighted={highlightedRow === entry.id} child={false} category={null} menuId={id} onSelect={select} />)}
      </div> : <>
      <ScrollArea className="node-add-menu-scroll-area" viewportClassName="node-add-menu-scroll fluid-scroll-fade" onScrollCapture={() => activate(null)}>
        <div role="menu" aria-label={mode === 'connect' ? '可连接节点' : '节点'}>
          <MenuList groups={groups} child={false} category={category} highlightedRow={highlightedRow} keyboardInteraction={keyboardInteraction}
            menuId={id} categoryAvailable={categoryAvailable} onSelect={select} />
          {term && matches.length === 0 && <div className="node-add-menu-empty" role="status">没有匹配的节点</div>}
          {!term && mode === 'connect' && choices?.length === 0 && <div className="node-add-menu-empty" role="status">暂无可连接的节点</div>}
        </div>
      </ScrollArea>
      </>}
    </div>
    {category && <div ref={submenu} id={`${id}-submenu`} className="node-add-menu node-add-menu-submenu nodrag nopan nowheel"
      data-animate-entrance={animateEntrance && !keyboardInteraction || undefined}
      style={{ left: subPosition.left, top: subPosition.top, transformOrigin: subPosition.transformOrigin, ...menuMotionStyle }}
      role="menu" aria-label={category === 'editing' ? '图像编辑节点' : '辅助工具节点'}
      onPointerMoveCapture={() => setKeyboardInteraction(false)}
      onPointerDownCapture={() => setKeyboardInteraction(false)}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={event => onKeyDown(event, true)} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      {subPosition.overlaid && <button type="button" className="node-add-menu-back" onClick={back}><ArrowLeft size={14} strokeWidth={1.5} absoluteStrokeWidth />返回</button>}
      <ScrollArea className="node-add-menu-scroll-area" viewportClassName="node-add-menu-scroll fluid-scroll-fade">
        <MenuList groups={categories[category]} child category={category} highlightedRow={null} keyboardInteraction={keyboardInteraction}
          menuId={id} categoryAvailable={categoryAvailable} onSelect={select} />
      </ScrollArea>
    </div>}
  </>;
}
