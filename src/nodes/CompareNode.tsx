import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Ellipsis, Eye, EyeOff } from 'lucide-react';
import { isNodeLocked, type AppNode, type CompareNode as Compare } from './types';
import { imageOutput } from './sunburstRun';
import { CompareIcon } from './CompareIcon';
import { TextNodeMenu } from './TextNodeMenu';
import { DescriberModelSelect } from '../components/DescriberModelSelect';

export function CompareNode({ id, data, isConnectable }: NodeProps<Compare>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { getNode, updateNodeData } = useReactFlow<AppNode>();
  const updateInternals = useUpdateNodeInternals();
  const node = nodes.find(item => item.id === id);
  const first = imageOutput(node, 'output-1', nodes, edges)[0];
  const second = imageOutput(node, 'output-2', nodes, edges)[0];
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [reveal, setReveal] = useState(false);
  const [draft, setDraft] = useState<number>();
  const draftRef = useRef<number>();
  const [hoverY, setHoverY] = useState(50);
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const preview = useRef<HTMLDivElement>(null);
  const reference = first ?? second;
  const size = reference && (dimensions[reference.url] ?? (reference.width && reference.height ? { width: reference.width, height: reference.height } : undefined));
  const split = draft ?? data.split;
  const patch = (value: Partial<Compare['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  const cancel = () => { draftRef.current = undefined; setDraft(undefined); };
  useEffect(() => { setReveal(false); draftRef.current = undefined; setDraft(undefined); }, [first?.url, second?.url, data.mode, data.split, data.locked]);
  useEffect(() => updateInternals(id), [id, size?.width, size?.height, updateInternals]);
  useEffect(() => {
    const blur = () => { setReveal(false); draftRef.current = undefined; setDraft(undefined); };
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, []);
  const move = (event: PointerEvent) => {
    const box = preview.current!.getBoundingClientRect();
    setHoverY(Math.max(0, Math.min(100, (event.clientY - box.top) / box.height * 100)));
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || data.locked || draftRef.current === undefined) return;
    const value = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    draftRef.current = value; setDraft(value);
  };
  const both = Boolean(first && second);
  const image = (asset: typeof first, index: number) => asset && <img key={`${index}-${asset.url}`} src={asset.url} alt={`Image ${index}`} draggable={false}
    onLoad={event => { const img = event.currentTarget; setDimensions(current => ({ ...current, [asset.url]: { width: img.naturalWidth, height: img.naturalHeight } })); setFailed(current => current.filter(url => url !== asset.url)); }}
    onError={() => setFailed(current => current.includes(asset.url) ? current : [...current, asset.url])} />;
  return <>
    <header className="text-node-header">
      <div className="text-node-title"><CompareIcon />{renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || 'Compare'}</span>}</div>
      <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || 'Compare'); setRenaming(true); }}><Ellipsis size={24} /></TextNodeMenu>
    </header>
    <div ref={preview} className="preview-image compare-image nodrag nopan" style={{ aspectRatio: size ? `${size.width} / ${size.height}` : '1' }}>
      <div className="compare-layer" style={{ visibility: data.mode === 'toggle' && reveal && both ? 'hidden' : undefined }}>{image(second ?? first, second ? 2 : 1)}</div>
      {both && <div className="compare-layer" style={{ clipPath: data.mode === 'slider' ? `inset(0 ${(1 - split) * 100}% 0 0)` : undefined, visibility: data.mode === 'toggle' && !reveal ? 'hidden' : undefined }}>{image(first, 1)}</div>}
      {data.mode === 'slider' && both && <div className={`compare-slider${draft !== undefined ? ' is-dragging' : ''}`} role="slider" aria-label="Comparison divider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split * 100)} aria-orientation="horizontal" aria-disabled={Boolean(data.locked)} tabIndex={data.locked ? -1 : 0}
        onPointerDown={event => { if (event.button !== 0 || data.locked) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); draftRef.current = split; move(event); }}
        onPointerMove={move} onPointerUp={event => { const value = draftRef.current; cancel(); if (value !== undefined) patch({ split: value }); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={cancel} onLostPointerCapture={cancel}
        onKeyDown={event => {
          if (event.metaKey || event.ctrlKey) return;
          if (event.key === 'Escape') { event.stopPropagation(); cancel(); return; }
          if (data.locked || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          patch({ split: event.key === 'Home' ? 0 : event.key === 'End' ? 1 : Math.max(0, Math.min(1, split + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .1 : .01))) });
        }}>
        <span className="compare-divider" style={{ left: `${split * 100}%` }}>
          <span className="compare-grip" style={{ top: `${hoverY}%` }} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="11.5" stroke="currentColor" />
              <path d="m5 12 4-3v6Zm14 0-4-3v6Z" fill="currentColor" />
            </svg>
            {draft !== undefined && <><span className="compare-image-label compare-image-label-first">Image 1</span><span className="compare-image-label compare-image-label-second">Image 2</span></>}
          </span>
        </span>
      </div>}
      {data.mode === 'toggle' && reference && <div className="compare-toggle">
        <button type="button" className="file-icon-button" disabled={!both} aria-label={reveal ? 'Hide comparison' : 'Reveal comparison'} aria-pressed={reveal} title="按住查看 Image 1，松开查看 Image 2"
          onPointerDown={event => { if (event.button === 0 && both) { event.currentTarget.setPointerCapture(event.pointerId); setReveal(true); } }}
          onPointerUp={() => setReveal(false)} onPointerCancel={() => setReveal(false)} onLostPointerCapture={() => setReveal(false)} onBlur={() => setReveal(false)}
          onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (both) setReveal(true); } }}
          onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); setReveal(false); } }}>
          {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
        </button><span>{reveal || !second ? 'Image 1' : 'Image 2'}</span>
      </div>}
    </div>
    <div className="compare-controls nodrag nopan"><span>Mode</span><DescriberModelSelect compact label="Mode" menuLabel="Compare mode" value={data.mode === 'toggle' ? 'Toggle' : 'Slider'} choices={['Toggle', 'Slider']} disabled={Boolean(data.locked)}
      onChange={value => { cancel(); setReveal(false); patch({ mode: value === 'Toggle' ? 'toggle' : 'slider', split: .5 }); }} />
      {data.mode === 'slider' && <button className="compare-reset" type="button" disabled={data.locked || split === .5} onClick={() => { cancel(); patch({ split: .5 }); }}>Reset</button>}
    </div>
    {[false, true].flatMap(output => [1, 2].map(index => {
      const handle = `${output ? 'output' : 'input'}-${index}`, label = `${output ? 'Output' : 'Input'} ${index}`;
      const connected = edges.some(edge => output ? edge.source === id && edge.sourceHandle === handle : edge.target === id && edge.targetHandle === handle);
      return <div className="describer-port-wrapper" key={handle}>
        <span className={`describer-port-label sunburst-label-image${output ? ' output-label' : ''}`} style={{ top: 61 + (index - 1) * 60 }}>{label}</span>
        <Handle id={handle} type={output ? 'source' : 'target'} position={output ? Position.Right : Position.Left} style={{ top: 89 + (index - 1) * 60 }}
          aria-label={`Compare ${label}`} className={`describer-port sunburst-port-image${connected ? ' is-connected' : ''}`} isConnectable={isConnectable && !data.locked && (output || !connected)} />
      </div>;
    }))}
    {[first, second].some(asset => asset && failed.includes(asset.url)) && <div role="alert" className="preview-error">无法读取对比图片，请检查图片来源。</div>}
  </>;
}
