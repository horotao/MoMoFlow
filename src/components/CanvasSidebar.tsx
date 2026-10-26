import { OpenAIIcon } from './OpenAIIcon';
import { useEffect, useRef, useState } from 'react';
import { useReactFlow, useNodes } from '@xyflow/react';
import { Search, Images, CircleHelp, Sun, Moon, X, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { isFileNode } from '../nodes/fileAsset';
import { isSunburstNode, type AppNode } from '../nodes/types';
import { items, navigation, createLibraryNode, libraryItemLabel as itemLabel, type Category, type Item } from './libraryCatalog';
import './CanvasSidebar.css';

const categoryLabels: Record<Category, string> = {
  Search: '搜索', Recents: '最近', Saved: '收藏', Tools: '工具',
  Image: '图像', Video: '视频', Models: '模型', Assets: '素材',
};
const titles: Partial<Record<Category, string>> = {
  Recents: '快速访问', Tools: '工具箱', Image: '图像模型', Video: '视频模型', Models: '社区模型',
};
const groupLabels: Record<string, string> = {
  Helpers: '辅助工具', Editing: '图像编辑', 'Text tools': '文本工具', Datatypes: '数据类型',
  'Generate from text': '文本生成图像', 'Generate from text or image': '文本或图像生成视频',
  'Community models': '社区模型',
};
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
  const cards = (list: Item[]) => <div className="library-grid">{list.map(item => <button type="button" key={item.id} className="library-card" disabled={!item.nodeType} title={item.nodeType ? `添加${itemLabel(item)}` : `${itemLabel(item)} · 暂未开放`} draggable={Boolean(item.nodeType)} onDragStart={event => { event.dataTransfer.setData('application/x-momoflow-library', item.id); event.dataTransfer.effectAllowed = 'copy'; }} onDragEnd={event => { if (event.dataTransfer.dropEffect !== 'none') setRecent(current => [item.id, ...current.filter(id => id !== item.id)].slice(0, 8)); }} onClick={() => add(item)}>{item.id === 'sunburst' ? <OpenAIIcon size={20} /> : <item.icon size={20} strokeWidth={1.25} style={{ color: item.color }} />}<span>{itemLabel(item)}</span>{!item.nodeType && <small>未开放</small>}</button>)}</div>;
  const matching = items.filter(item => `${itemLabel(item)} ${item.label}`.toLowerCase().includes(query.trim().toLowerCase()) && (filter === 'All' || item.category === filter));
  const quick = [...recent.map(id => items.find(item => item.id === id)!), ...items.filter(item => ['text', 'file', 'image-describer', 'model-input'].includes(item.id) && !recent.includes(item.id))];
  return <>
    <div className={`canvas-library nodrag nopan nowheel ${active ? 'is-open' : ''}`} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { setActive(null); setHelp(false); } }}>
      <aside className="library-drawer" aria-label={active ? `${categoryLabels[active]}面板` : '资源库面板'} id="canvas-library-panel" {...(!active ? { inert: '' } : {})}>
        <div className="library-title"><span>未命名</span><button type="button" aria-label="关闭侧边栏" onClick={() => setActive(null)}><X size={15} /></button></div>
        <div className="library-search"><Search size={15} strokeWidth={1.4} /><input ref={searchRef} aria-label="搜索资源库" placeholder="搜索" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X size={12} /></button>}</div>
        {active === 'Search' && <div className="library-filters"><SlidersHorizontal size={13} /><span>类型</span><select aria-label="筛选分类" value={filter} onChange={event => setFilter(event.target.value)}>{['All', 'Tools', 'Image', 'Video', 'Models'].map(value => <option key={value} value={value}>{value === 'All' ? '全部' : categoryLabels[value as Category]}</option>)}</select></div>}
        <div className={`library-content ${active && !['Assets', 'Recents', 'Search'].includes(active) ? 'library-content-category' : ''}`} ref={contentRef}>
          {(query && active !== 'Assets') || (active === 'Search' && filter !== 'All') ? <><h2>搜索结果 <span>{matching.length}</span></h2>{matching.length ? cards(matching) : <p className="library-empty">未找到结果。<br />试试其他名称。</p>}</> : active === 'Assets' ? <><h2>素材</h2>{assets.length ? <div className="library-grid">{assets.map(asset => <button type="button" className="library-asset" key={asset.id} title={asset.name} onClick={() => { const position = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 3 }); setNodes(current => [...current.map(n => ({ ...n, selected: false })), { id: crypto.randomUUID(), type: 'file', position, selected: true, data: { assets: [asset] } }]); }}>{asset.kind === 'image' ? <img src={asset.url} alt={asset.name} /> : <Images size={24} />}<span>{asset.name}</span></button>)}</div> : <div className="library-asset-empty"><Images size={28} strokeWidth={1} /><p>暂无素材</p><span>导入的文件会显示在这里。</span><button type="button" onClick={() => add(items.find(item => item.id === 'file')!)}>+ 导入</button></div>}</> : active === 'Saved' ? <><h2>收藏 <ChevronDown size={14} /></h2>{['模型', '节点', '分组'].map(label => <section key={label}><h3>{label}</h3><p className="library-empty">暂无收藏的{label}。{label === '节点' && <><br />节点收藏功能即将推出。</>}</p></section>)}</> : <>
            {(active === 'Search' || active === 'Recents') && <section><h2>快速访问</h2>{cards(quick)}</section>}
            {(active === 'Search' || active === 'Recents' ? ['Tools', 'Image', 'Video', 'Models'] : [active]).map(category => category && <section key={category}><h2>{titles[category as Category]}</h2>{Array.from(new Set(items.filter(item => item.category === category).map(item => item.group))).map(group => <section key={group}><h3>{groupLabels[group] ?? group}</h3>{cards(items.filter(item => item.category === category && item.group === group))}</section>)}</section>)}
          </>}
        </div>
      </aside>
      <nav className="library-rail" aria-label="画布工具栏"><div className="library-nav">{navigation.map(({ name, icon: Icon, divider }) => <div key={name} className={divider ? 'library-nav-divider' : undefined}><button type="button" aria-label={categoryLabels[name]} aria-expanded={active === name} aria-controls="canvas-library-panel" onClick={() => choose(name)}><span className="library-icon"><Icon size={22} strokeWidth={1.25} /></span><span>{categoryLabels[name]}</span></button></div>)}</div><div className="library-footer"><button type="button" aria-label="帮助" aria-expanded={help} onClick={() => setHelp(value => !value)}><CircleHelp size={21} strokeWidth={1.25} /></button><button type="button" aria-label={colorMode === 'dark' ? '切换浅色模式' : '切换深色模式'} onClick={onThemeChange}>{colorMode === 'dark' ? <Sun size={20} strokeWidth={1.25} /> : <Moon size={20} strokeWidth={1.25} />}</button></div></nav>
      {help && <div className="library-help"><strong>画布快捷键</strong><p>V <span>选择</span></p><p>H <span>平移</span></p><p>⌘ / Ctrl Z <span>撤销</span></p><p>Esc <span>关闭侧边栏</span></p><small>点击卡片，或将其拖入画布。</small></div>}
    </div>
    {!active && <div className="library-workflow-title nodrag nopan">未命名</div>}
  </>;
}
