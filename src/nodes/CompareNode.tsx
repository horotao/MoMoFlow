import { useEffect, useState } from 'react';
import { Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Eye, EyeOff } from 'lucide-react';
import { isNodeLocked, type AppNode, type CompareNode as Compare } from './types';
import { imageOutput } from './sunburstRun';
import { TextNodeMenu } from './TextNodeMenu';
import { DescriberModelSelect } from '../components/DescriberModelSelect';
import { NodeFrame, NodeHeader } from './shared/NodeFrame';
import { NodePort } from './shared/NodePort';
import { BeforeAfterSlider } from './shared/BeforeAfterSlider';
import './shared/mediaNodeStyle.css';
import './CompareNode.css';

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
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const reference = first ?? second;
  const size = reference && (dimensions[reference.url] ?? (reference.width && reference.height ? { width: reference.width, height: reference.height } : undefined));
  const patch = (value: Partial<Compare['data']>) => { if (!isNodeLocked(getNode(id))) updateNodeData(id, value); };
  useEffect(() => { setReveal(false); }, [first?.url, second?.url, data.mode, data.split, data.locked]);
  useEffect(() => updateInternals(id), [id, size?.width, size?.height, updateInternals]);
  useEffect(() => {
    const blur = () => setReveal(false);
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, []);
  const both = Boolean(first && second);
  const image = (asset: typeof first, index: number) => asset && <img key={`${index}-${asset.url}`} src={asset.url} alt={`Image ${index}`} draggable={false}
    onLoad={event => { const img = event.currentTarget; setDimensions(current => ({ ...current, [asset.url]: { width: img.naturalWidth, height: img.naturalHeight } })); setFailed(current => current.filter(url => url !== asset.url)); }}
    onError={() => setFailed(current => current.includes(asset.url) ? current : [...current, asset.url])} />;
  return <NodeFrame className="media-node-frame compare-node-frame">
    <NodeHeader icon={<img src="/compare-node/compare.svg" width={16} height={16} alt="" />} title={renaming
        ? <input className="text-node-rename nodrag nopan" autoFocus aria-label="节点名称" value={name} onChange={event => setName(event.target.value)}
          onBlur={() => { if (name.trim()) patch({ label: name.trim() }); setRenaming(false); }}
          onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false); }} />
        : <span>{data.label || '对比'}</span>}
      actions={<TextNodeMenu appearance="shared" id={id} locked={Boolean(data.locked)} onRename={() => { setName(data.label || '对比'); setRenaming(true); }}><img src="/node-style/more.svg" width={18} height={18} alt="" /></TextNodeMenu>} />
    <div className="preview-image compare-image nodrag nopan" style={{ aspectRatio: size ? `${size.width} / ${size.height}` : '1' }}>
      {data.mode === 'slider' && both
        ? <BeforeAfterSlider before={image(first, 1)} after={image(second, 2)} value={data.split * 100} disabled={Boolean(data.locked)}
          resetKey={JSON.stringify([first?.id, first?.url, second?.id, second?.url])} onValueCommit={value => patch({ split: value / 100 })} />
        : <>
          <div className="compare-layer" style={{ visibility: data.mode === 'toggle' && reveal && both ? 'hidden' : undefined }}>{image(second ?? first, second ? 2 : 1)}</div>
          {both && <div className="compare-layer" style={{ visibility: !reveal ? 'hidden' : undefined }}>{image(first, 1)}</div>}
        </>}
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
    <div className="compare-controls nodrag nopan"><div className="compare-mode"><span>模式</span><DescriberModelSelect compact appearance="compare" fluidHover label="模式" menuLabel="Compare mode" value={data.mode === 'toggle' ? 'Toggle' : 'Slider'} choices={['Slider', 'Toggle']} disabled={Boolean(data.locked)}
      onChange={value => { setReveal(false); patch({ mode: value === 'Toggle' ? 'toggle' : 'slider', split: .5 }); }} /></div>
      {data.mode === 'slider' && <button className="compare-reset" type="button" disabled={data.locked || data.split === .5} onClick={() => patch({ split: .5 })}>Reset</button>}
    </div>
    {[false, true].flatMap(output => [1, 2].map(index => {
      const handle = `${output ? 'output' : 'input'}-${index}`, label = `${output ? 'Output' : 'Input'} ${index}`;
      const connected = edges.some(edge => output ? edge.source === id && edge.sourceHandle === handle : edge.target === id && edge.targetHandle === handle);
      return <div className="media-port-image" key={handle}>
        <NodePort label={label} id={handle} type={output ? 'source' : 'target'} position={output ? Position.Right : Position.Left} top={89 + (index - 1) * 60}
          isConnectable={isConnectable && !data.locked}>
          <img src="/image-node/port-image.svg" width={32} height={32} alt="" />
          {connected && <span className="media-port-dot" />}
        </NodePort>
      </div>;
    }))}
    {[first, second].some(asset => asset && failed.includes(asset.url)) && <div role="alert" className="preview-error">无法读取对比图片，请检查图片来源。</div>}
  </NodeFrame>;
}
