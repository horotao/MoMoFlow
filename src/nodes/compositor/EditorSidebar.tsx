import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Ellipsis, Eye, EyeOff, Frame, Layers, Lock, Pencil, Plus, Search, Trash2, Unlock, X } from 'lucide-react';
import { layerAsset, MAX_COMPOSITOR_LAYERS, moveCompositorLayer, type CompositorDocument, type CompositorInputs } from '../compositor';
import type { FileAsset } from '../types';
import { assetResources } from '../assetResources';
import { LayerIcon } from './GraphicProperties';
import { isGraphicSource } from '../compositorGraphics';
import { EditorPopover } from './EditorPopover';
import { reorderAtDrop, type DropSide } from './interaction';

export const COMPOSITOR_ASSET_DRAG = 'application/x-momoflow-compositor-asset';
export function EditorSidebar({ name, tab, document, inputs, selected, assets, locked, onSelect, onChange, onDuplicate, onRemove, onAddAsset }: {
  name: string; tab: 'layers' | 'assets'; document: CompositorDocument; inputs: CompositorInputs; selected?: string; assets: FileAsset[]; locked: boolean;
  onSelect: (id?: string) => void; onChange: (document: CompositorDocument) => void; onDuplicate: () => void; onRemove: () => void; onAddAsset: (asset: FileAsset) => void;
}) {
  const [rename, setRename] = useState<string>(), [renameText, setRenameText] = useState(''), cancelled = useRef(false);
  const [drop, setDrop] = useState<{ id: string; side: DropSide }>(), [dragging, setDragging] = useState<string>();
  const dragged = useRef<string>();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; point?: { x: number; y: number } }>();
  const [query, setQuery] = useState(''), [search, setSearch] = useState(false);
  const [preview, setPreview] = useState<{ asset: FileAsset; anchor: HTMLElement }>();
  useEffect(() => preview ? assetResources.retain([preview.asset.url]) : undefined, [preview]);
  const layer = document.layers.find(item => item.id === selected), rows = [...document.layers].reverse();
  const readOnly = locked || Boolean(layer?.locked), limit = document.layers.length >= MAX_COMPOSITOR_LAYERS;
  const startRename = (id: string) => {
    const item = document.layers.find(layer => layer.id === id);
    if (!item || locked || item.locked) return;
    cancelled.current = false; setRename(id); setRenameText(item.name);
  };
  const action = (callback: () => void) => { setMenu(undefined); menu?.anchor.focus(); callback(); };
  const selectRow = (id: string) => { onSelect(id); setMenu(undefined); };
  const shown = assets.filter(asset => asset.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <aside className="comp-sidebar" aria-label={tab === 'layers' ? 'Layers panel' : 'Assets panel'}>
    <header><span>{name}</span>{locked && <Lock className="comp-sidebar-locked" size={13} aria-label="Locked" />}</header>
    <div className="comp-sidebar-caption"><span>{tab === 'layers' ? 'Layers' : 'Assets'}</span><div>
      {tab === 'layers' && layer && <button aria-label="图层操作" title="图层操作" aria-haspopup="menu" aria-expanded={Boolean(menu)} onClick={event => setMenu(menu ? undefined : { anchor: event.currentTarget })}><Ellipsis size={15} /></button>}
      {tab === 'assets' && <button aria-label="Search assets" title="Search assets" aria-pressed={search} onClick={() => { setSearch(!search); setQuery(''); }}><Search size={14} /></button>}
    </div></div>
    {tab === 'layers' ? <>
      <button className={`comp-canvas-row${!selected ? ' is-selected' : ''}`} aria-label="Select canvas" onClick={() => selectRow('')}><Frame size={14} /><span>Canvas</span></button>
      <div className="comp-layer-tree" role="list" aria-label="Layers tree" onScroll={() => setMenu(undefined)}>{rows.map(item => {
        const asset = layerAsset(item, inputs), isSelected = selected === item.id;
        return <div key={item.id} role="listitem" data-layer-id={item.id}
          className={`comp-layer-row${isSelected ? ' is-selected' : ''}${!item.visible ? ' is-hidden' : ''}${item.locked ? ' is-locked' : ''}${dragging === item.id ? ' is-dragging' : ''}${drop?.id === item.id ? ` drop-${drop.side}` : ''}`}
          draggable={!locked && !item.locked && rename !== item.id}
          onContextMenu={event => { event.preventDefault(); onSelect(item.id); setMenu({ anchor: event.currentTarget.querySelector('button')!, point: { x: event.clientX, y: event.clientY } }); }}
          onDragStart={event => { dragged.current = item.id; setDragging(item.id); setMenu(undefined); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }}
          onDragOver={event => {
            if (!dragged.current || dragged.current === item.id) return;
            event.preventDefault(); event.dataTransfer.dropEffect = 'move';
            const rect = event.currentTarget.getBoundingClientRect(), side = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            setDrop(current => current?.id === item.id && current.side === side ? current : { id: item.id, side });
            const tree = event.currentTarget.parentElement!;
            const bounds = tree.getBoundingClientRect();
            if (event.clientY < bounds.top + 28) tree.scrollTop -= 12;
            if (event.clientY > bounds.bottom - 28) tree.scrollTop += 12;
          }}
          onDragEnd={() => { dragged.current = undefined; setDragging(undefined); setDrop(undefined); }}
          onDrop={event => {
            event.preventDefault();
            if (dragged.current && !locked) {
              const rect = event.currentTarget.getBoundingClientRect(), side = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
              const next = reorderAtDrop(rows, dragged.current, item.id, side);
              if (next !== rows) onChange({ ...document, layers: [...next].reverse() });
            }
            dragged.current = undefined; setDragging(undefined); setDrop(undefined);
          }}>
          <button className="comp-layer-select" aria-label={`Select ${item.name}`} aria-pressed={isSelected} title={asset?.name ?? item.name}
            onClick={() => selectRow(item.id)} onDoubleClick={() => startRename(item.id)} onKeyDown={event => {
              if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); startRename(item.id); }
              if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); event.stopPropagation(); onSelect(item.id); setMenu({ anchor: event.currentTarget }); }
              if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (!locked && !item.locked) onChange(moveCompositorLayer(document, item.id, document.layers.findIndex(layer => layer.id === item.id) + (event.key === 'ArrowUp' ? 1 : -1))); }
            }}><LayerIcon source={item.source} /><span>{rename === item.id ? '' : item.name}</span></button>
          {rename === item.id && <input className="comp-rename" aria-label="Layer name" autoFocus value={renameText} onFocus={event => event.currentTarget.select()} onChange={event => setRenameText(event.target.value)}
            onBlur={() => { if (!cancelled.current && renameText.trim() && renameText.trim() !== item.name) onChange({ ...document, layers: document.layers.map(layer => layer.id === item.id ? { ...layer, name: renameText.trim() } : layer) }); setRename(undefined); }}
            onKeyDown={event => {
              event.stopPropagation(); if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' || event.key === 'Escape') {
                cancelled.current = event.key === 'Escape';
                const trigger = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.comp-layer-select');
                event.currentTarget.blur(); trigger?.focus();
              }
            }} />}
          <button className={`comp-layer-visibility${!item.visible ? ' is-persistent' : ''}`} aria-label={`${item.visible ? 'Hide' : 'Show'} ${item.name}`} title={item.visible ? 'Hide layer' : 'Show layer'} disabled={locked || item.locked}
            onClick={() => onChange({ ...document, layers: document.layers.map(layer => layer.id === item.id ? { ...layer, visible: !layer.visible } : layer) })}>{item.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
          <button className={`comp-layer-lock${item.locked ? ' is-persistent' : ''}`} aria-label={`${item.locked ? 'Unlock' : 'Lock'} ${item.name}`} title={item.locked ? 'Unlock layer' : 'Lock layer'} disabled={locked}
            onClick={() => onChange({ ...document, layers: document.layers.map(layer => layer.id === item.id ? { ...layer, locked: !layer.locked } : layer) })}>{item.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
        </div>;
      })}</div>
    </> : <>
      {search && <div className="comp-asset-search"><Search size={13} /><input autoFocus aria-label="Search image assets" placeholder="Search images…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); event.currentTarget.closest('aside')?.querySelector<HTMLButtonElement>('[aria-label="Search assets"]')?.focus(); setSearch(false); setQuery(''); }
      }} />{query && <button aria-label="Clear asset search" onClick={event => { event.currentTarget.parentElement?.querySelector('input')?.focus(); setQuery(''); }}><X size={12} /></button>}</div>}
      <div className="comp-assets-caption">Images<span>{shown.length}</span></div>
      <div className="comp-assets">{shown.map(asset => {
        const count = document.layers.filter(layer => layerAsset(layer, inputs)?.id === asset.id).length;
        return <button className="comp-asset-card" key={asset.id} aria-label={`Preview ${asset.name}`} title={`${asset.name} · Drag to canvas`} draggable={!locked && !limit}
          onDragStart={event => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(COMPOSITOR_ASSET_DRAG, asset.id); setPreview(undefined); }}
          onClick={event => setPreview(preview?.asset.id === asset.id ? undefined : { asset, anchor: event.currentTarget })}>
          <span className="comp-asset-thumbnail"><img src={asset.url} alt="" draggable={false} loading="lazy" />{count > 0 && <span className="comp-asset-count"><Layers size={11} />{count}</span>}</span>
          <span className="comp-asset-name">{asset.name}</span>
        </button>;
      })}</div>
      {!shown.length && <p className="comp-assets-empty">{assets.length ? 'No matching images.' : 'Connect an image or import one into the workflow to see it here.'}</p>}
    </>}
    {menu && layer && <EditorPopover {...menu} label="图层操作" onClose={() => setMenu(undefined)}>
      <button role="menuitem" disabled={readOnly} onClick={() => action(() => startRename(layer.id))}><Pencil /><span>重命名</span><kbd>F2</kbd></button>
      <button role="menuitem" disabled={readOnly || limit || (!layerAsset(layer, inputs) && !isGraphicSource(layer.source))} onClick={() => action(onDuplicate)}><Copy /><span>创建副本</span><kbd>⌘D</kbd></button>
      <div role="separator" />
      <button role="menuitem" disabled={readOnly || rows[0].id === layer.id} onClick={() => action(() => onChange(moveCompositorLayer(document, layer.id, document.layers.findIndex(item => item.id === layer.id) + 1)))}><ArrowUp /><span>上移一层</span><kbd>⌥↑</kbd></button>
      <button role="menuitem" disabled={readOnly || rows[rows.length - 1].id === layer.id} onClick={() => action(() => onChange(moveCompositorLayer(document, layer.id, document.layers.findIndex(item => item.id === layer.id) - 1)))}><ArrowDown /><span>下移一层</span><kbd>⌥↓</kbd></button>
      <div role="separator" />
      <button role="menuitem" disabled={readOnly || (layer.source.kind === 'input' && layer.source.handle === 'background')} onClick={() => action(onRemove)}><Trash2 /><span>删除</span><kbd>⌫</kbd></button>
    </EditorPopover>}
    {tab === 'assets' && preview && <EditorPopover anchor={preview.anchor} label={`Asset ${preview.asset.name}`} side="right" menu={false} width={240} onClose={() => setPreview(undefined)}>
      <div className="comp-asset-preview"><img src={preview.asset.url} alt={preview.asset.name} /><div><span>{preview.asset.name}</span><button aria-label="Close asset preview" onClick={() => { preview.anchor.focus(); setPreview(undefined); }}><X size={14} /></button></div><p>{preview.asset.width && preview.asset.height ? `${preview.asset.width} × ${preview.asset.height}` : 'Image'}</p>
        <button className="comp-asset-insert" disabled={locked || limit} onClick={() => { onAddAsset(preview.asset); setPreview(undefined); }}><Plus size={14} />Add to canvas</button>
      </div>
    </EditorPopover>}
  </aside>;
}
