import { NodePort } from './NodePort';
import { NodeFrame } from './NodeFrame';
import { NodeHeader } from './NodeHeader';
import { useEffect, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { isColorPaletteNode, type AppNode, type ColorPaletteNode as PaletteNode } from './types';
import { paletteBands, paletteRevision, paletteSize } from './colorPalette';
import { assetResources } from './assetResources';
import { ColorPaletteColors } from './ColorPaletteColors';

export function ColorPaletteNode({ id, data, isConnectable }: NodeProps<PaletteNode>) {
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
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
  return <NodeFrame>
    <NodeHeader id={id} label={data.label} fallback="调色板" type="COLOR PALETTE" locked={data.locked} />
    <ColorPaletteColors node={{ id, data }} inline />
    {[{ id: 'image', label: 'Image' }, { id: 'text', label: 'Text' }].map(port => <NodePort key={port.id}
      id={port.id} direction="source" label={`Color palette ${port.label}`} isConnectable={isConnectable && !data.locked} />)}
    {error && <div role="alert" className="preview-error">{error}</div>}
  </NodeFrame>;
}
