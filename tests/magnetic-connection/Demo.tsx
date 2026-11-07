import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  addEdge, Background, Handle, MiniMap, Panel, Position, ReactFlow,
  useConnection, useEdgesState, useNodesState, useReactFlow, useStoreApi, useViewport,
  type Connection, type ConnectionLineComponentProps, type EdgeProps, type NodeProps,
} from '@xyflow/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Image01Icon, MagnetIcon, RefreshIcon, Settings01Icon, TextIcon } from '@hugeicons/core-free-icons';
import { canConnect, colors, findPort, initialEdges, initialNodes, type CableImpact, type DemoEdge, type DemoNode } from './model';
import { MagneticCable } from '../../src/edges/MagneticCable';
import { MagneticConnectionPreview } from '../../src/edges/MagneticConnectionPreview';
import { PortAbsorption, PortRipple } from '../../src/edges/PortFeedback';
import type { ConnectionVisualSnapshot } from '../../src/edges/magneticTypes';
import { useConnectionGesture } from '../../src/edges/useConnectionGesture';
import '@xyflow/react/dist/style.css';
import './style.css';

const Settings = createContext({ radius: 86, speed: 380, rigidity: 50, field: true, enabled: true });
type AbsorptionSnapshot = { x: number; y: number; radius: number };
const ConnectionVisual = createContext<{ current: (() => ConnectionVisualSnapshot) | null }>({ current: null });
type PortRippleEvent = { id: string; nodeId: string; handleId: string | null; feather: number; duration: number; delay: number; expiresAt: number; absorption?: AbsorptionSnapshot & { field: boolean } };
const PortRipples = createContext<PortRippleEvent[]>([]);
const icons = { text: TextIcon, image: Image01Icon, number: Settings01Icon, mixer: Settings01Icon, preview: Image01Icon };

function MagneticNode({ id, data, selected }: NodeProps<DemoNode>) {
  const ripples = useContext(PortRipples);
  const connection = useConnection(state => ({ inProgress: state.inProgress, isValid: state.isValid, fromNode: state.fromNode, fromHandle: state.fromHandle, toNode: state.toNode, toHandle: state.toHandle }));
  const fromPort = connection.fromNode && connection.fromHandle ? findPort(connection.fromNode.id, connection.fromHandle.id) : undefined;
  const compatible = !fromPort || (connection.fromNode?.id !== id && data.ports.some(port => port.kind === fromPort.kind && port.side !== fromPort.side));
  const active = connection.inProgress && connection.isValid && connection.toNode?.id === id;
  return <article className={`demo-node ${data.content}${selected ? ' selected' : ''}${active ? ' receiving' : ''}${!compatible && connection.fromNode?.id !== id ? ' dimmed' : ''}`}>
    <header><HugeiconsIcon icon={icons[data.content]} size={16} /><span>{data.title}</span><span className="node-grip" aria-hidden="true">⠿</span></header>
    {data.content === 'text' && <div className="text-content">Light in motion.<br />色彩流动，灵感相连。</div>}
    {(data.content === 'image' || data.content === 'preview') && <div className={`demo-art ${data.content === 'preview' ? 'alternate' : ''}`}><div className="art-orb" /><span>CHROMATIC / 01</span></div>}
    {data.content === 'number' && <div className="number-content"><span>0.75</span><div className="number-track"><i /></div></div>}
    {data.content === 'mixer' && <div className="mixer-content">{Object.entries(colors).map(([kind, color], index) => <div className="fader" key={kind} style={{ '--color': color, '--level': `${28 + index * 18}%` } as CSSProperties}><i /><span>{kind === 'text' ? 'T' : kind === 'image' ? 'I' : 'N'}</span></div>)}</div>}
    <footer>{data.caption}</footer>
    {data.ports.map(port => {
      const available = !fromPort || (fromPort.kind === port.kind && fromPort.side !== port.side && connection.fromNode?.id !== id);
      const captured = active && connection.toHandle?.id === port.id;
      return <Handle key={port.id} id={port.id} type={port.side} position={port.side === 'source' ? Position.Right : Position.Left}
        aria-label={`${data.title} ${port.label} ${port.side === 'source' ? '输出' : '输入'}`}
        className={`magnetic-port${available ? '' : ' unavailable'}${captured ? ' captured' : ''}`}
        style={{ top: port.y, '--port-color': colors[port.kind] } as CSSProperties}>
        <span className="port-core" /><span className="port-label">{port.label}</span>
        {ripples.filter(ripple => ripple.nodeId === id && ripple.handleId === port.id).map(ripple => <span className="port-feedback" key={ripple.id}>
          {ripple.absorption && <PortAbsorption snapshot={ripple.absorption} />}
          <PortRipple feather={ripple.feather} duration={ripple.duration} delay={ripple.delay} />
        </span>)}
      </Handle>;
    })}
  </article>;
}

function MagneticConnection(props: ConnectionLineComponentProps<DemoNode>) {
  const settings = useContext(Settings);
  const visual = useContext(ConnectionVisual);
  const color = colors[findPort(props.fromNode.id, props.fromHandle.id)?.kind ?? 'image'];
  return <MagneticConnectionPreview {...props} settings={settings} visual={visual} color={color} />;
}

function MagneticEdge(props: EdgeProps<DemoEdge>) {
  const { enabled } = useContext(Settings);
  return <MagneticCable {...props} enabled={enabled} release={props.data?.release} impact={props.data?.impact} selectedStroke="#f0f3e8" />;
}

const nodeTypes = { magnetic: MagneticNode };
const edgeTypes = { magnetic: MagneticEdge };
const defaultEdgeOptions = { type: 'magnetic', interactionWidth: 18 };

export function Demo() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [radius, setRadius] = useState(86);
  const [speed, setSpeed] = useState(380);
  const [rigidity, setRigidity] = useState(50);
  const [lineWidth, setLineWidth] = useState(1.5);
  const [bounceStrength, setBounceStrength] = useState(100);
  const [bounceRange, setBounceRange] = useState(100);
  const [rippleFeather, setRippleFeather] = useState(1);
  const [rippleSpeed, setRippleSpeed] = useState(1);
  const [ripples, setRipples] = useState<PortRippleEvent[]>([]);
  const [field, setField] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState('拖出一条连线，慢慢靠近相同颜色的端口');
  const [showReference, setShowReference] = useState(false);
  const { zoomIn, zoomOut, fitView } = useReactFlow<DemoNode>();
  const { zoom } = useViewport();
  const store = useStoreApi();
  const { cancelled, cancel: cancelGesture, start, startClick, end, withinRadius, connectionRadius } = useConnectionGesture(enabled ? radius : 12);
  const connectionVisual = useRef<(() => ConnectionVisualSnapshot) | null>(null);
  const connection = useConnection(state => ({ inProgress: state.inProgress, isValid: state.isValid }));
  const cancel = useCallback(() => { cancelGesture(); setStatus('已取消连线'); }, [cancelGesture]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancel(); setShowReference(false); } };
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', escape); window.removeEventListener('blur', cancel); };
  }, [cancel]);
  useEffect(() => {
    if (!ripples.length) return;
    // Each connection keeps its own duration; a newer fast ripple must not
    // truncate an older slow one. Also retire feedback for deleted nodes.
    const delay = Math.max(1, Math.ceil(Math.min(...ripples.map(ripple => ripple.expiresAt)) - performance.now()));
    const timeout = window.setTimeout(() => setRipples(current => current.filter(ripple => ripple.expiresAt > performance.now())), delay);
    return () => window.clearTimeout(timeout);
  }, [ripples]);
  const onConnect = useCallback((next: Connection) => {
    if (cancelled.current || !withinRadius(next) || !canConnect(next)) return;
    const color = colors[findPort(next.source, next.sourceHandle)!.kind];
    const { connection: drag, transform: [tx, ty, scale] } = store.getState();
    if (enabled && drag.inProgress && drag.toHandle) {
      const { nodeId } = drag.toHandle;
      const handleId = drag.toHandle.id ?? null;
      const duration = 0.52 / rippleSpeed;
      const snapshot = connectionVisual.current?.();
      const delay = snapshot ? 0.1 : 0;
      const ripple: PortRippleEvent = { id: crypto.randomUUID(), nodeId, handleId, feather: rippleFeather, duration, delay, expiresAt: performance.now() + (duration + delay) * 1000 + 80, absorption: snapshot ? { ...snapshot, field } : undefined };
      setRipples(current => [...current.filter(currentRipple => currentRipple.nodeId !== nodeId || currentRipple.handleId !== handleId), ripple]);
    }
    let release: NonNullable<DemoEdge['data']>['release'];
    let impact: CableImpact | undefined;
    if (enabled && bounceStrength > 0 && drag.inProgress) {
      const tip = { x: (drag.pointer.x - tx) / scale, y: (drag.pointer.y - ty) / scale };
      const anchor = { x: (drag.to.x - tx) / scale, y: (drag.to.y - ty) / scale };
      const dx = anchor.x - drag.from.x, dy = anchor.y - drag.from.y;
      const pullX = tip.x - anchor.x, pullY = tip.y - anchor.y;
      const reverse = drag.fromHandle.type === 'target';
      const direction = Math.sign((-dy * pullX + dx * pullY) * (reverse ? -1 : 1)) || 1;
      release = { id: crypto.randomUUID(), reverse, speed, rigidity, range: bounceRange, velocity: direction * (600 + Math.min(65, Math.hypot(pullX, pullY) * scale) * 8) / scale * bounceStrength / 100 };
      impact = { id: release.id, point: anchor, zoom: scale, velocity: release.velocity, speed, rigidity };
    }
    setEdges(current => {
      const retained = current.filter(edge => edge.target !== next.target || edge.targetHandle !== next.targetHandle);
      const neighbors = impact ? retained.map(edge => ({ ...edge, data: { ...edge.data, impact } })) : retained;
      return addEdge({ ...next, type: 'magnetic', data: { release }, style: { stroke: color } }, neighbors);
    });
    setStatus('已连接 · 可继续拖线，或选中连线按 Delete 删除');
  }, [setEdges, store, enabled, field, speed, rigidity, bounceStrength, bounceRange, rippleFeather, rippleSpeed, cancelled, withinRadius]);
  const reset = () => {
    cancel();
    setNodes(initialNodes.map(node => ({ ...node, position: { ...node.position } })));
    setEdges(initialEdges);
    setRipples([]);
    setStatus('已重置 · 从左侧彩色端口开始拖动');
    requestAnimationFrame(() => { void fitView({ padding: 0.18, duration: 350 }); });
  };
  return <Settings.Provider value={{ radius, speed, rigidity, field, enabled }}><ConnectionVisual.Provider value={connectionVisual}><PortRipples.Provider value={ripples}>
    <main className={`magnetic-lab${connection.inProgress ? ' connecting' : ''}`} style={{ '--cable-width': `${lineWidth}px` } as CSSProperties}>
      <ReactFlow<DemoNode, DemoEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect} onConnectStart={start} onClickConnectStart={startClick} onConnectEnd={(_, state) => { end(); if (!cancelled.current && !state.isValid) setStatus('未连接 · 请靠近相同颜色的端口'); }}
        isValidConnection={next => withinRadius(next) && canConnect(next)} connectionRadius={connectionRadius} connectionLineComponent={MagneticConnection}
        defaultEdgeOptions={defaultEdgeOptions} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.35} maxZoom={1.6}
        deleteKeyCode={['Backspace', 'Delete']} nodesConnectable={!showReference} nodesDraggable={!showReference}
        colorMode="dark" proOptions={{ hideAttribution: true }}>
        <Background color="#30312f" gap={26} size={1} />
        <Panel position="top-left" className="lab-heading"><div className="eyebrow">MOMOFLOW <span>/</span> INTERACTION LAB <b>01</b></div><h1>让连线，有一点引力。</h1><p>拖动 · 靠近 · 吸附</p></Panel>
        <Panel position="top-right" className="lab-settings nowheel">
          <div className="settings-heading"><span><HugeiconsIcon icon={MagnetIcon} size={17} /> 磁吸连线</span><button className={`switch ${enabled ? 'on' : ''}`} role="switch" aria-checked={enabled} aria-label="磁吸效果" onClick={() => setEnabled(value => !value)}><i /></button></div>
          <label className="range-label">吸附范围 <output>{radius} px</output><input aria-label="吸附范围" type="range" min="36" max="120" value={radius} onChange={event => setRadius(Number(event.target.value))} /></label>
          <label className="range-label">弹性速度 <output>{speed < 350 ? '柔和' : speed > 600 ? '利落' : '适中'}</output><input aria-label="弹性速度" type="range" min="180" max="900" step="20" value={speed} onChange={event => setSpeed(Number(event.target.value))} /></label>
          <label className="range-label">线条刚性 <output>{rigidity}%</output><input aria-label="线条刚性" aria-valuetext={`${rigidity}%，${rigidity < 35 ? '柔软' : rigidity > 75 ? '紧绷' : '适中'}`} type="range" min="0" max="100" step="5" value={rigidity} onChange={event => setRigidity(Number(event.target.value))} /></label>
          <label className="range-label">线条粗细 <output>{lineWidth.toFixed(1)} px</output><input aria-label="线条粗细" aria-valuetext={`${lineWidth.toFixed(1)} 像素`} type="range" min="0.5" max="2" step="0.1" value={lineWidth} onChange={event => setLineWidth(Number(event.target.value))} /></label>
          <label className="range-label">回弹力度 <output>{bounceStrength}%</output><input aria-label="回弹力度" aria-valuetext={bounceStrength === 0 ? '0%，无回弹' : `${bounceStrength}%`} type="range" min="0" max="200" step="10" value={bounceStrength} onChange={event => setBounceStrength(Number(event.target.value))} /></label>
          <label className="range-label">回弹范围 <output>{bounceRange}%</output><input aria-label="回弹范围" aria-valuetext={`从松手端起 ${bounceRange}% 的线长`} type="range" min="10" max="100" step="5" value={bounceRange} onChange={event => setBounceRange(Number(event.target.value))} /></label>
          <label className="range-label">涟漪羽化 <output>{rippleFeather} px</output><input aria-label="涟漪羽化" type="range" min="0" max="8" step="0.5" value={rippleFeather} onChange={event => setRippleFeather(Number(event.target.value))} /></label>
          <label className="range-label">涟漪速度 <output>{rippleSpeed.toFixed(2)}×</output><input aria-label="涟漪速度" type="range" min="0.25" max="2" step="0.25" value={rippleSpeed} onChange={event => setRippleSpeed(Number(event.target.value))} /></label>
          <label className="field-toggle"><input type="checkbox" checked={field} onChange={event => setField(event.target.checked)} /> 显示液态磁场</label>
          <div className="settings-actions"><button onClick={reset}><HugeiconsIcon icon={RefreshIcon} size={14} /> 重置</button><button onClick={() => { setEdges([]); setRipples([]); }}>清空连线</button></div>
          <button className="reference-button" onClick={() => setShowReference(true)}>查看参考视频 <span>↗</span></button>
        </Panel>
        <Panel position="bottom-left" className="view-controls"><button aria-label="缩小" onClick={() => void zoomOut()}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="放大" onClick={() => void zoomIn()}>+</button><button onClick={() => void fitView({ padding: 0.18, duration: 350 })}>适应画布</button></Panel>
        <Panel position="bottom-center" className={`lab-status${connection.isValid ? ' captured' : ''}`} role="status"><i />{connection.inProgress ? (connection.isValid ? '已进入磁场 · 松手连接，拉远脱离' : '寻找同色端口 · Esc 取消') : status}</Panel>
        <MiniMap pannable zoomable position="bottom-right" style={{ width: 125, height: 78 }} nodeColor="#4a4d43" maskColor="#111111b0" />
      </ReactFlow>
      {showReference && <div className="reference-backdrop" onClick={() => setShowReference(false)}><section role="dialog" aria-modal="true" aria-label="参考视频" onClick={event => event.stopPropagation()}><button autoFocus onClick={() => setShowReference(false)}>关闭视频 · Esc</button><video src="/506205129.mp4" controls autoPlay /></section></div>}
    </main>
  </PortRipples.Provider></ConnectionVisual.Provider></Settings.Provider>;
}
