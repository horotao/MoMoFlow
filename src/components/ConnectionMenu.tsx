import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, CircleX, Search } from 'lucide-react';
import { items } from './libraryCatalog';
import type { ConnectionChoice, PendingConnection } from '../nodes/connectionRecommendations';
import './ConnectionMenu.css';

export type NodeMenuChoice = Pick<ConnectionChoice, 'id' | 'itemId' | 'detail'>;

type Props = {
  screen: PendingConnection['screen'];
  mode: 'create' | 'connect';
  choices: NodeMenuChoice[];
  onChoose: (choice: NodeMenuChoice) => void;
  onDismiss: () => void;
};

export function ConnectionMenu({ screen, mode, choices, onChoose, onDismiss }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const filterOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [creator, setCreator] = useState<'all' | 'me'>('all');
  const [filterPosition, setFilterPosition] = useState({ x: 0, y: 0 });
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState('');
  // Opening and typing keep focus in search without highlighting a result.
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState(screen);
  // Built-in catalog nodes remain available for both creator filters, as in Weavy.
  const matches = choices.flatMap(choice => {
    const item = items.find(item => item.id === choice.itemId && item.nodeType);
    return item && `${item.label} ${choice.detail ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()) ? [{ choice, item }] : [];
  });
  const activeIndex = active < matches.length ? active : -1;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(screen.x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(screen.y + 5, window.innerHeight - bounds.height - 8)),
    });
  }, [screen, matches.length]);
  useLayoutEffect(() => { searchRef.current?.focus(); }, [screen]);
  useLayoutEffect(() => {
    if (!filterOpen || !filterRef.current || !filterButtonRef.current) return;
    const trigger = filterButtonRef.current.getBoundingClientRect();
    const bounds = filterRef.current.getBoundingClientRect();
    setFilterPosition({
      x: Math.max(8, Math.min(trigger.right - bounds.width, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, trigger.bottom + 4 + bounds.height <= window.innerHeight - 8
        ? trigger.bottom + 4 : trigger.top - bounds.height - 4),
    });
  }, [filterOpen, position]);
  useLayoutEffect(() => {
    if (filterOpen) filterOptionRefs.current[creator === 'all' ? 0 : 1]?.focus({ preventScroll: true });
  }, [filterOpen, creator]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target)) onDismiss();
      else if (!filterRef.current?.contains(target) && !filterButtonRef.current?.contains(target)) setFilterOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault(); event.stopPropagation();
        if (filterOpen) { setFilterOpen(false); filterButtonRef.current?.focus(); }
        else onDismiss();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', onDismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [onDismiss, filterOpen]);

  const focusOption = (index: number) => {
    setActive(index);
    if (index < 0) searchRef.current?.focus();
    else {
      optionRefs.current[index]?.focus({ preventScroll: true });
      optionRefs.current[index]?.scrollIntoView({ block: 'nearest' });
    }
  };

  return <div ref={menuRef} className="connection-menu nodrag nopan nowheel" role="dialog" aria-label={mode === 'create' ? '创建节点' : '推荐节点'}
    style={{ left: position.x, top: position.y }}
    onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if (event.target === filterButtonRef.current && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault(); setFilterOpen(true); return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const fromSearch = event.target === searchRef.current;
        const current = fromSearch ? -1 : activeIndex;
        const next = event.key === 'ArrowDown'
          ? current + 1 >= matches.length ? -1 : current + 1
          : current <= -1 ? matches.length - 1 : current - 1;
        focusOption(next);
      }
      if (event.key === 'Enter' && event.target === searchRef.current && matches.length) {
        event.preventDefault(); onChoose(matches[Math.max(0, activeIndex)].choice);
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (event.target === searchRef.current) { setActive(-1); filterButtonRef.current?.focus(); }
        else focusOption(-1);
      }
    }}>
    <div className="connection-menu-search-row">
    <div className="connection-menu-search">
      <Search size={16} strokeWidth={1.5} aria-hidden="true" />
      <input ref={searchRef} value={query} autoComplete="off" spellCheck={false}
        aria-label={mode === 'create' ? '搜索节点' : '搜索可连接节点'} placeholder="Search" onFocus={() => setActive(-1)}
        onChange={event => { setQuery(event.target.value); setActive(-1); }}
        role="combobox" aria-expanded="true" aria-controls="connection-recommendations" aria-autocomplete="list" />
      {query && <button type="button" className="connection-menu-clear" aria-label="清空搜索" tabIndex={-1}
        onClick={() => { setQuery(''); setActive(-1); searchRef.current?.focus(); }}>
        <CircleX size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>}
    </div>
    <button ref={filterButtonRef} type="button" className="connection-menu-filter-trigger"
      aria-label="Created by" title={`Created by: ${creator === 'all' ? 'All members' : 'Me'}`}
      aria-haspopup="menu" aria-expanded={filterOpen} aria-controls={filterOpen ? 'connection-creator-menu' : undefined}
      data-filter-active={creator === 'me'} onClick={() => { setActive(-1); setFilterOpen(open => !open); }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="6.5" fill={creator === 'me' ? 'currentColor' : 'none'} stroke="currentColor" />
        <path d="M8.5 9.5h7m-6 2.5h5m-4 2.5h3" stroke={creator === 'me' ? 'var(--connection-menu-surface)' : 'currentColor'} strokeLinecap="round" />
      </svg>
    </button>
    </div>
    {filterOpen && <div ref={filterRef} id="connection-creator-menu" className="connection-menu-filter"
      role="menu" aria-labelledby="connection-creator-heading" style={{ left: filterPosition.x, top: filterPosition.y }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        const current = filterOptionRefs.current.findIndex(option => option === document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : current === 0 ? 1 : 0;
          filterOptionRefs.current[next]?.focus();
        }
        if (event.key === 'Tab') {
          event.preventDefault(); setFilterOpen(false); filterButtonRef.current?.focus();
        }
      }}>
      <div id="connection-creator-heading" className="connection-menu-filter-heading">Created by</div>
      {(['all', 'me'] as const).map((value, index) => <button key={value} ref={element => { filterOptionRefs.current[index] = element; }}
        type="button" role="menuitemradio" aria-checked={creator === value} tabIndex={-1}
        onClick={() => { setCreator(value); setFilterOpen(false); filterButtonRef.current?.focus(); }}>
        <span>{value === 'all' ? 'All members' : 'Me'}</span>
        {creator === value && <Check size={14} strokeWidth={1.25} aria-hidden="true" />}
      </button>)}
    </div>}
    <div id="connection-recommendations" role="listbox" aria-label={mode === 'create' ? '可创建节点' : '可连接节点'} className="connection-menu-results">
      {matches.map(({ choice, item }, index) => <button type="button" role="option" aria-selected={activeIndex === index}
        ref={element => { optionRefs.current[index] = element; }} tabIndex={-1}
        id={`connection-choice-${index}`} key={choice.id} className={activeIndex === index ? 'is-active' : ''}
        aria-label={`${item.label}${choice.detail ? ` · ${choice.detail}` : ''}`}
        title={choice.detail ? `${item.label} · ${choice.detail}` : item.label}
        onMouseEnter={() => setActive(index)}
        onMouseLeave={() => setActive(optionRefs.current.findIndex(option => option === document.activeElement))}
        onFocus={() => setActive(index)} onClick={() => onChoose(choice)}>
        <span>{item.label}</span>
      </button>)}
    </div>
    {!matches.length && <span className="connection-menu-status" role="status">{choices.length ? '没有匹配的节点' : mode === 'create' ? '暂无可创建的节点' : '暂无可连接的节点'}</span>}
  </div>;
}
