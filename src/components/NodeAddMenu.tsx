import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ArrowLeft, ChevronRight, Search, X } from 'lucide-react';
import {
  isNodeMenuCategory, nodeMenuCategories, nodeMenuGroups, searchableNodeMenuEntries,
  type NodeMenuEntry, type NodeMenuGroup,
} from './nodeMenuCatalog';
import { useCascadeMenu } from './useCascadeMenu';
import './NodeAddMenu.css';

type Props = {
  id: string;
  onChoose: (id: string) => void;
  onDismiss: () => void;
} & ({ trigger: RefObject<HTMLButtonElement>; screen?: never } | { screen: { x: number; y: number }; trigger?: never });
type Placement = { left: number; top: number; overlaid?: boolean };

function MenuIcon({ entry }: { entry: NodeMenuEntry }) {
  const Icon = entry.icon;
  return <span className={`node-add-menu-icon${entry.tone ? ` is-${entry.tone}` : ''}`} aria-hidden="true">
    {entry.brand ? <img src={`/node-menu/${entry.brand}.svg`} alt="" draggable={false} />
      : Icon && <Icon size={12} strokeWidth={1.5} />}
  </span>;
}

const menuButtons = (root: HTMLDivElement | null) => Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
function focusButton(button?: HTMLButtonElement) {
  button?.focus({ preventScroll: true });
  button?.scrollIntoView({ block: 'nearest' });
}

export function NodeAddMenu({ id, trigger, screen, onChoose, onDismiss }: Props) {
  const main = useRef<HTMLDivElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const focusSubmenu = useRef(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<Placement>({ left: 68, top: 8 });
  const [subPosition, setSubPosition] = useState<Placement>({ left: 308, top: 8 });
  const { activeRow, highlightedRow, activate, cancelHover } = useCascadeMenu({ main, submenu, trigger, onDismiss });
  const category = isNodeMenuCategory(activeRow) && !query.trim() ? activeRow : null;
  const term = query.trim().toLocaleLowerCase();
  const matches = searchableNodeMenuEntries.filter(entry => `${entry.label} ${entry.keywords}`.toLocaleLowerCase().includes(term));
  const groups = term ? [{ label: '搜索结果', entries: matches }] : nodeMenuGroups;

  useLayoutEffect(() => { search.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    const place = () => {
      const anchor = trigger?.current?.getBoundingClientRect();
      const menu = main.current?.getBoundingClientRect();
      if ((!anchor && !screen) || !menu) return;
      setPosition({
        left: Math.max(8, Math.min(screen?.x ?? anchor!.right + 12, window.innerWidth - menu.width - 8)),
        top: Math.max(8, Math.min(screen?.y ?? anchor!.top, window.innerHeight - menu.height - 8)),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [trigger, screen]);

  useLayoutEffect(() => {
    if (!category) return;
    const place = () => {
      const parent = main.current;
      const bounds = parent?.getBoundingClientRect();
      const row = parent?.querySelector(`[data-main-row="${category}"]`)?.getBoundingClientRect();
      const child = submenu.current?.getBoundingClientRect();
      if (!bounds || !row || !child) return;
      const fitsRight = bounds.right + 8 + child.width <= window.innerWidth - 8;
      const fitsLeft = bounds.left - 8 - child.width >= 8;
      setSubPosition({
        left: fitsRight ? bounds.right + 8 : fitsLeft ? bounds.left - child.width - 8 : bounds.left,
        top: Math.max(8, Math.min(row.top - 8, window.innerHeight - child.height - 8)),
        overlaid: !fitsRight && !fitsLeft,
      });
      if (!fitsRight && !fitsLeft && !submenu.current?.contains(document.activeElement)) {
        focusButton(menuButtons(submenu.current)[0]);
      }
    };
    place();
    if (focusSubmenu.current) { focusButton(menuButtons(submenu.current)[0]); focusSubmenu.current = false; }
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [category, position]);

  const back = () => {
    const parent = main.current?.querySelector<HTMLButtonElement>(`[data-main-row="${category}"]`);
    activate(null); focusButton(parent ?? undefined);
  };
  const openCategory = (entry: NodeMenuEntry, keyboard: boolean) => {
    if (!isNodeMenuCategory(entry.id)) return;
    focusSubmenu.current = keyboard;
    activate(entry.id);
    if (category === entry.id && keyboard) { focusButton(menuButtons(submenu.current)[0]); focusSubmenu.current = false; }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, child: boolean) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
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
      const rowId = (event.target as HTMLElement).dataset.mainRow;
      const entry = nodeMenuGroups.flatMap(group => group.entries).find(entry => entry.id === rowId);
      if (entry && isNodeMenuCategory(entry.id)) { event.preventDefault(); openCategory(entry, true); }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || (!fromSearch && (event.key === 'Home' || event.key === 'End'))) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index <= 0 ? buttons.length : index) - 1;
      focusButton(buttons[next]);
    } else if (event.key === 'Enter' && fromSearch && term && matches[0]?.nodeId) {
      event.preventDefault(); onChoose(matches[0].nodeId);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      // Keep Tab local to the popover; Escape returns to its dock trigger.
      const controls = (category && subPosition.overlaid
        ? [submenu.current?.querySelector<HTMLButtonElement>('.node-add-menu-back'), ...menuButtons(submenu.current)]
        : [search.current, ...menuButtons(main.current), ...menuButtons(submenu.current)])
        .filter((element): element is HTMLInputElement | HTMLButtonElement => Boolean(element));
      const current = controls.indexOf(event.target as HTMLButtonElement);
      const next = (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      controls[next]?.focus();
    }
  };
  const renderGroups = (sections: NodeMenuGroup[], child: boolean) => sections.map((group, groupIndex) => <div key={group.label ?? 'basic'} role="group" aria-label={group.label}>
    {group.label && <div className="node-add-menu-heading" aria-hidden="true">{group.label}</div>}
    {group.entries.map(entry => {
      const hasSubmenu = isNodeMenuCategory(entry.id);
      const available = Boolean(entry.nodeId) || hasSubmenu;
      const rowId = hasSubmenu ? entry.id : `${groupIndex}-${entry.id}`;
      return <button key={entry.id} type="button" role="menuitem" tabIndex={-1}
        className="node-add-menu-row"
        data-main-row={child ? undefined : rowId} data-node-id={entry.nodeId}
        data-active={!child && (highlightedRow === rowId || category === entry.id)}
        aria-disabled={!available || undefined} aria-haspopup={hasSubmenu ? 'menu' : undefined}
        aria-expanded={hasSubmenu ? category === entry.id : undefined}
        aria-controls={hasSubmenu && category === entry.id ? `${id}-submenu` : undefined}
        title={!available ? `${entry.label}（尚未接入）` : undefined}
        onClick={event => {
          if (hasSubmenu) openCategory(entry, event.detail === 0);
          else if (entry.nodeId) onChoose(entry.nodeId);
        }}>
        <MenuIcon entry={entry} /><span className="node-add-menu-label">{entry.label}</span>
        {hasSubmenu && <ChevronRight className="node-add-menu-chevron" size={12} strokeWidth={1.5} aria-hidden="true" />}
      </button>;
    })}
  </div>);

  return <>
    <div ref={main} id={id} className="node-add-menu nodrag nopan nowheel" style={position}
      role="dialog" aria-label="添加节点" onKeyDown={event => onKeyDown(event, false)}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      <div className="node-add-menu-search">
        <Search size={16} strokeWidth={1.25} aria-hidden="true" />
        <input ref={search} value={query} placeholder="搜索" aria-label="搜索节点" autoComplete="off" spellCheck={false}
          onChange={event => { setQuery(event.target.value); activate(null); }} />
        {query && <button type="button" aria-label="清空搜索" onClick={() => { setQuery(''); activate(null); search.current?.focus(); }}><X size={14} /></button>}
      </div>
      <div className="node-add-menu-scroll" role="menu" aria-label="节点" onScroll={() => activate(null)}>
        {renderGroups(groups, false)}
        {term && matches.length === 0 && <div className="node-add-menu-empty" role="status">没有匹配的节点</div>}
      </div>
    </div>
    {category && <div ref={submenu} id={`${id}-submenu`} className="node-add-menu node-add-menu-submenu nodrag nopan nowheel"
      style={{ left: subPosition.left, top: subPosition.top }} role="menu" aria-label={category === 'editing' ? '图像编辑节点' : '辅助工具节点'}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={event => onKeyDown(event, true)} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      {subPosition.overlaid && <button type="button" className="node-add-menu-back" onClick={back}><ArrowLeft size={14} />返回</button>}
      <div className="node-add-menu-scroll">{renderGroups(nodeMenuCategories[category], true)}</div>
    </div>}
  </>;
}
