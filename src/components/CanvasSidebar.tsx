import { OpenAIIcon } from './OpenAIIcon';
import { useEffect, useRef, useState } from 'react';
import { useReactFlow, useNodes } from '@xyflow/react';
import { Search, Images, CircleHelp, Sun, Moon, X, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { isFileNode } from '../nodes/fileAsset';
import { isSunburstNode, type AppNode } from '../nodes/types';
import { items, navigation, createLibraryNode, type Category, type Item } from './libraryCatalog';
import './CanvasSidebar.css';

const titles: Partial<Record<Category, string>> = { Recents: 'Quick access', Tools: 'Toolbox', Image: 'Image Models', Video: 'Video Models', Models: 'Community Models' };

export function CanvasSidebar({ colorMode, onThemeChange }: { colorMode: 'light' | 'dark'; onThemeChange: () => void }) {
  const [active, setActive] = useState<Category | null>(null);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [filter, setFilter] = useState('All');
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { setNodes, screenToFlowPosition } = useReactFlow<AppNode>();
  const nodes = useNodes<AppNode>();
  const assets = nodes.flatMap(n => isSunburstNode(n) ? n.data.results ?? [] : isFileNode(n) ? (n.data.assets ?? (n.data.asset ? [n.data.asset] : [])) : []).filter((asset, index, all) => all.findIndex(a => a.id === asset.id) === index).filter(asset => asset.name.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
    if (active === 'Search') searchRef.current?.focus();
  }, [active]);
  const choose = (category: Category) => { setActive(current => current === category ? null : category); setQuery(''); setFilter('All'); setHelp(false); };
  const add = (item: Item) => {
    const position = screenToFlowPosition({ x: 310 + (window.innerWidth - 310) / 2 - 140, y: Math.max(100, window.innerHeight / 2 - 160) });
    const node = createLibraryNode(item.id, position);
    if (node) setNodes(current => [...current.map(n => ({ ...n, selected: false })), node]);
    setRecent(current => [item.id, ...current.filter(id => id !== item.id)].slice(0, 8));
  };
  const cards = (list: Item[]) => <div className="library-grid">{list.map(item => <button type="button" key={item.id} className="library-card" disabled={!item.nodeType} title={item.nodeType ? `Add ${item.label}` : `${item.label} · Preview model`} draggable={Boolean(item.nodeType)} onDragStart={event => { event.dataTransfer.setData('application/x-momoflow-library', item.id); event.dataTransfer.effectAllowed = 'copy'; }} onDragEnd={event => { if (event.dataTransfer.dropEffect !== 'none') setRecent(current => [item.id, ...current.filter(id => id !== item.id)].slice(0, 8)); }} onClick={() => add(item)}>{item.id === 'sunburst' ? <OpenAIIcon size={20} /> : <item.icon size={20} strokeWidth={1.25} style={{ color: item.color }} />}<span>{item.label}</span>{!item.nodeType && <small>Mock</small>}</button>)}</div>;
  const matching = items.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()) && (filter === 'All' || item.category === filter));
  const quick = [...recent.map(id => items.find(item => item.id === id)!), ...items.filter(item => ['text', 'file', 'image-describer', 'model-input'].includes(item.id) && !recent.includes(item.id))];
  return <>
    <div className={`canvas-library nodrag nopan nowheel ${active ? 'is-open' : ''}`} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { setActive(null); setHelp(false); } }}>
      <aside className="library-drawer" aria-label={active ? `${active} panel` : 'Library panel'} id="canvas-library-panel" {...(!active ? { inert: '' } : {})}>
        <div className="library-title"><span>untitled</span><button type="button" aria-label="Close sidebar" onClick={() => setActive(null)}><X size={15} /></button></div>
        <div className="library-search"><Search size={15} strokeWidth={1.4} /><input ref={searchRef} aria-label="Search library" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={12} /></button>}</div>
        {active === 'Search' && <div className="library-filters"><SlidersHorizontal size={13} /><span>Type</span><select aria-label="Filter category" value={filter} onChange={event => setFilter(event.target.value)}>{['All', 'Tools', 'Image', 'Video', 'Models'].map(value => <option key={value}>{value}</option>)}</select></div>}
        <div className={`library-content ${active && !['Assets', 'Recents', 'Search'].includes(active) ? 'library-content-category' : ''}`} ref={contentRef}>
          {(query && active !== 'Assets') || (active === 'Search' && filter !== 'All') ? <><h2>Search results <span>{matching.length}</span></h2>{matching.length ? cards(matching) : <p className="library-empty">No results found.<br />Try a different name.</p>}</> : active === 'Assets' ? <><h2>Assets</h2>{assets.length ? <div className="library-grid">{assets.map(asset => <button type="button" className="library-asset" key={asset.id} title={asset.name} onClick={() => { const position = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 3 }); setNodes(current => [...current.map(n => ({ ...n, selected: false })), { id: crypto.randomUUID(), type: 'file', position, selected: true, data: { assets: [asset] } }]); }}>{asset.kind === 'image' ? <img src={asset.url} alt={asset.name} /> : <Images size={24} />}<span>{asset.name}</span></button>)}</div> : <div className="library-asset-empty"><Images size={28} strokeWidth={1} /><p>No assets yet</p><span>Import files to see them here.</span><button type="button" onClick={() => add(items[2])}>+ Import</button></div>}</> : active === 'Saved' ? <><h2>Saved <ChevronDown size={14} /></h2>{['Models', 'Nodes', 'Groups'].map(label => <section key={label}><h3>{label}</h3><p className="library-empty">No saved {label.toLowerCase()} yet.{label === 'Nodes' && <><br />Saving nodes is coming later.</>}</p></section>)}</> : <>
            {(active === 'Search' || active === 'Recents') && <section><h2>Quick access</h2>{cards(quick)}</section>}
            {(active === 'Search' || active === 'Recents' ? ['Tools', 'Image', 'Video', 'Models'] : [active]).map(category => category && <section key={category}><h2>{titles[category as Category]}</h2>{Array.from(new Set(items.filter(item => item.category === category).map(item => item.group))).map(group => <section key={group}><h3>{group}</h3>{cards(items.filter(item => item.category === category && item.group === group))}</section>)}</section>)}
          </>}
        </div>
      </aside>
      <nav className="library-rail" aria-label="Canvas tools"><div className="library-nav">{navigation.map(({ name, icon: Icon, divider }) => <div key={name} className={divider ? 'library-nav-divider' : undefined}><button type="button" aria-label={name} aria-expanded={active === name} aria-controls="canvas-library-panel" onClick={() => choose(name)}><span className="library-icon"><Icon size={22} strokeWidth={1.25} /></span><span>{name}</span></button></div>)}</div><div className="library-footer"><button type="button" aria-label="Help" aria-expanded={help} onClick={() => setHelp(value => !value)}><CircleHelp size={21} strokeWidth={1.25} /></button><button type="button" aria-label={colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={onThemeChange}>{colorMode === 'dark' ? <Sun size={20} strokeWidth={1.25} /> : <Moon size={20} strokeWidth={1.25} />}</button></div></nav>
      {help && <div className="library-help"><strong>Canvas shortcuts</strong><p>V <span>Select</span></p><p>H <span>Pan</span></p><p>⌘ / Ctrl Z <span>Undo</span></p><p>Esc <span>Close sidebar</span></p><small>Click a card or drag it onto the canvas.</small></div>}
    </div>
    {!active && <div className="library-workflow-title nodrag nopan">untitled</div>}
  </>;
}
