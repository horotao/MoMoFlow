import { useEffect, useState } from 'react';
import { Position, useEdges, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { isColorPaletteNode, type AppNode, type ColorPaletteNode as PaletteNode } from './types';
import { paletteBands, paletteLimit, paletteRevision, paletteSize } from './colorPalette';
import { assetResources } from './assetResources';
import { TextNodeMenu } from './TextNodeMenu';
import { ColorPaletteColors } from './ColorPaletteColors';
import { NodeFrame, NodeHeader } from './shared/NodeFrame';
import { NodePort } from './shared/NodePort';
import './shared/mediaNodeStyle.css';

export function ColorPaletteNode({ id, data, isConnectable }: NodeProps<PaletteNode>) {
  const edges = useEdges();
  const updateInternals = useUpdateNodeInternals();
  const rows = Math.ceil((data.colors.length + (data.colors.length < paletteLimit ? 1 : 0)) / 2);
  const height = 74 + rows * 32 + Math.max(0, rows - 1) * 6;
  const portCenter = height / 2 - 1; // Absolute positions start inside the frame's border.
  useEffect(() => updateInternals(id), [id, height, updateInternals]);
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
  return <NodeFrame className="media-node-frame palette-node-frame">
    <NodeHeader icon={<span className="palette-title-icon"><img src="/palette-node/palette.svg" width={24} height={24} alt="" /></span>} title={renaming
      ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
        onBlur={() => { const current = getNode(id); if (name.trim() && isColorPaletteNode(current) && !current.data.locked) updateNodeData(id, { label: name.trim() }); setRenaming(false); }}
        onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
      : <span>{data.label || '调色板'}</span>}
      actions={<TextNodeMenu appearance="shared" id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || '调色板'); setRenaming(true); }}><img src="/node-style/more.svg" width={18} height={18} alt="" /></TextNodeMenu>} />
    <ColorPaletteColors node={{ id, data }} inline />
    {[{ id: 'image', label: 'Image', top: portCenter - 31 }, { id: 'text', label: 'Text', top: portCenter + 31 }].map(port => <div className={`palette-port palette-port-${port.id}`} key={port.id}>
      <NodePort label={port.label} top={port.top} type="source" position={Position.Right} id={port.id}
        isConnectable={isConnectable && !data.locked}>
        <img src={`/palette-node/port-${port.id}.svg`} width={32} height={32} alt="" />
        {edges.some(edge => edge.source === id && edge.sourceHandle === port.id) && <span className="media-port-dot" />}
      </NodePort>
    </div>)}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </NodeFrame>;
}
