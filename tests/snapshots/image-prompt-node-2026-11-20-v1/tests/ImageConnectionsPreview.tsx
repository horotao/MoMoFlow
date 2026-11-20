import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ImageConnections, type ImageConnection } from '../components/image-connections/ImageConnections';
import { ImagePromptNode } from '../components/image-prompt-node/ImagePromptNode';
import './image-connections-preview.css';

const result = new URL('./generation-preview.png', import.meta.url).href;
const params = new URLSearchParams(location.search);

export function ImageConnectionsPreview() {
  const [connections, setConnections] = useState<ImageConnection[]>(params.has('wired') ? [{ id: 'example', source: 'result', target: 'image' }] : []);
  const [scale, setScale] = useState(Math.max(.5, Math.min(1.5, Number(params.get('scale')) || Math.min(.85, (window.innerWidth - 40) / 1280))));
  const [selected, setSelected] = useState<string | null>(null);
  const [locks, setLocks] = useState<Record<string, boolean>>({});
  const [positions, setPositions] = useState({ result: { x: 180, y: 160 }, image: { x: 850, y: 290 } });
  const [completed, setCompleted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [resultPrompt, setResultPrompt] = useState('Beauty close-up, dewy, soft light');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const drag = useRef<{ id: 'result' | 'image'; x: number; y: number; left: number; top: number; element: HTMLElement } | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>, id: 'result' | 'image') {
    if (event.button !== 0 || locks[id] || !(event.target instanceof Element) || !event.target.closest('.image-node-heading')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, x: event.clientX, y: event.clientY, left: positions[id].x, top: positions[id].y, element: event.currentTarget };
  }
  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active) return;
    active.element.style.left = `${active.left + (event.clientX - active.x) / scale}px`;
    active.element.style.top = `${active.top + (event.clientY - active.y) / scale}px`;
  }
  function endDrag() {
    const active = drag.current;
    if (!active) return;
    setPositions(current => ({ ...current, [active.id]: { x: Number.parseFloat(active.element.style.left), y: Number.parseFloat(active.element.style.top) } }));
    drag.current = null;
  }

  return <main className="connection-preview-stage" style={{ backgroundSize: `${32 * scale}px ${32 * scale}px` }}>
    <ImageConnections connections={connections} onConnectionsChange={setConnections}>
      <div className="connection-preview-world" style={{ transform: `scale(${scale})` }}>
        {(['result', 'image'] as const).map(id => <div key={id} className="connection-preview-node" data-connection-node={id} data-has-output={id === 'result' || completed}
          style={{ left: positions[id].x, top: positions[id].y }}
          onPointerDown={event => startDrag(event, id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <ImagePromptNode title={id === 'result' ? '完成图片' : 'Image'}
            result={id === 'result' || completed ? <img src={result} alt="本地生成完成示例" /> : undefined}
            prompt={id === 'result' ? resultPrompt : prompt} onPromptChange={id === 'image' ? setPrompt : setResultPrompt}
            selected={selected === id} onSelectedChange={value => setSelected(value ? id : null)}
            locked={Boolean(locks[id])} onLockedChange={value => setLocks(current => ({ ...current, [id]: value }))}
            imageInputCount={connections.filter(edge => edge.target === id).length} outputConnected={connections.some(edge => edge.source === id)}
            generation={id === 'image' && generating ? { id: 'local', estimatedSeconds: 2 } : null}
            onGenerate={() => {
              if (id !== 'image') return;
              setGenerating(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => { setGenerating(false); setCompleted(true); }, 2000);
            }} />
        </div>)}
      </div>
    </ImageConnections>
    <div className="connection-preview-controls" aria-label="连线预览控制">
      <label>缩放 <select aria-label="预览缩放" value={scale} onChange={event => setScale(Math.max(.5, Math.min(1.5, Number(event.target.value) || .85)))}>
        {[...new Set([.5, .85, 1, 1.5, scale])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
      </select></label>
      <button type="button" onClick={() => setConnections([])}>清空连线</button>
      <span>拖动图片输出 → Image 输入 · 拖动标题移动节点 · Esc 取消 · 选中连线后 Delete 删除</span>
    </div>
  </main>;
}
