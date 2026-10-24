import { useEffect, useState } from 'react';
import { Handle, Position, useEdges, useReactFlow, type NodeProps } from '@xyflow/react';
import { Ellipsis, Palette } from 'lucide-react';
import { isColorPaletteNode, type AppNode, type ColorPaletteNode as PaletteNode } from './types';
import { paletteBands, paletteRevision, paletteSize } from './colorPalette';
import { assetResources } from './assetResources';
import { TextNodeMenu } from './TextNodeMenu';
import { ColorPaletteColors } from './ColorPaletteColors';

export function ColorPaletteNode({ id, data, isConnectable }: NodeProps<PaletteNode>) {
  const edges = useEdges();
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState('');
  const revision = paletteRevision(data.colors);
  useEffect(() => {
    let cancelled = false;
    setError('');
    if (!data.colors.length || data.locked) return;
    const node = getNode(id);
    if (!isColorPaletteNode(node) || (node.data.result && node.data.outputRevision === revision)) return;
    const canvas = document.createElement('canvas'); canvas.width = paletteSize; canvas.height = paletteSize;
    const context = canvas.getContext('2d');
    if (!context) { setError('无法生成色板图片。'); return; }
    for (const band of paletteBands(data.colors)) { context.fillStyle = band.hex; context.fillRect(0, band.y, paletteSize, band.height); }
    canvas.toBlob(blob => {
      const current = getNode(id);
      if (cancelled || !isColorPaletteNode(current) || current.data.locked || paletteRevision(current.data.colors) !== revision) return;
      if (!blob) { setError('无法生成色板图片。'); return; }
      updateNodeData(id, { result: { id: crypto.randomUUID(), name: 'Color palette.png', kind: 'image', url: assetResources.create(blob), size: blob.size, width: paletteSize, height: paletteSize }, outputRevision: revision });
    }, 'image/png');
    return () => { cancelled = true; };
  }, [id, data.colors, data.locked, revision, getNode, updateNodeData]);
  return <>
    <header className="text-node-header"><div className="text-node-title"><Palette size={24} />{renaming
      ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
        onBlur={() => { const current = getNode(id); if (name.trim() && isColorPaletteNode(current) && !current.data.locked) updateNodeData(id, { label: name.trim() }); setRenaming(false); }}
        onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
      : <span>{data.label || 'Color palette'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || 'Color palette'); setRenaming(true); }}><Ellipsis size={24} /></TextNodeMenu>
    </header>
    <ColorPaletteColors node={{ id, data }} inline />
    {[{ id: 'image', label: 'Image', top: 89 }, { id: 'text', label: 'Text', top: 149 }].map(port => <div className="describer-port-wrapper" key={port.id}>
      <span className={`describer-port-label output-label ${port.id === 'image' ? 'sunburst-label-image' : ''}`} style={{ top: port.top - 28 }}>{port.label}</span>
      <Handle type="source" position={Position.Right} id={port.id} style={{ top: port.top }} aria-label={`Color palette ${port.label}`}
        className={`describer-port ${port.id === 'image' ? 'sunburst-port-image' : ''}${edges.some(edge => edge.source === id && edge.sourceHandle === port.id) ? ' is-connected' : ''}`}
        isConnectable={isConnectable && !data.locked} />
    </div>)}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </>;
}
