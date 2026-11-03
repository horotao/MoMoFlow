import { Handle, Position, useNodeId, useStore } from '@xyflow/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { routerIcons } from './nodeIcons';
import { nodePortCenterY, nodePortY } from './nodeLayout';
import { nodePortKind } from './nodeConnectionStyle';
import { nodePortColor, type NodePortKind } from './nodePortAppearance';
import type { AppNode } from './types';
import './NodePort.css';

function PortIcon({ kind }: { kind: NodePortKind | 'add' }) {
  if (kind === 'video' || kind === 'audio' || kind === '3d') return <HugeiconsIcon className="node-port-media-icon" icon={routerIcons[kind]} size={16} aria-hidden="true" />;
  return <span className="node-port-icon" aria-hidden="true"><img src={`/node-ports/${kind === 'unknown' ? 'file' : kind}.svg`} alt="" draggable={false} /></span>;
}

export function NodePort({ id, direction, kind, label, index, connected, isConnectable = true, invalid = false, title }: {
  id?: string;
  direction: 'source' | 'target';
  kind?: NodePortKind;
  label: string;
  index?: number;
  connected?: boolean;
  isConnectable?: boolean;
  invalid?: boolean;
  title?: string;
}) {
  const nodeId = useNodeId();
  const visual = useStore(state => {
    const node = state.nodeLookup.get(nodeId ?? '') as AppNode | undefined;
    return {
      kind: kind ?? nodePortKind(node, id, direction, state.nodes as AppNode[], state.edges),
      y: node?.type === 'position-logger' ? '50%' : node ? nodePortCenterY(node, id, direction, index) : nodePortY(index),
      connected: connected ?? state.edges.some(edge => direction === 'source' ? edge.source === nodeId && (edge.sourceHandle ?? null) === (id ?? null) : edge.target === nodeId && (edge.targetHandle ?? null) === (id ?? null)),
    };
  }, (a, b) => a.kind === b.kind && a.y === b.y && a.connected === b.connected);
  return <Handle id={id} type={direction} position={direction === 'target' ? Position.Left : Position.Right}
    className={`node-port node-port--${visual.kind}${visual.connected ? ' is-connected' : ''}${invalid ? ' is-type-error' : ''}`}
    style={{ top: typeof visual.y === 'number' ? `calc(${visual.y}px - var(--node-port-border, 2px))` : visual.y, color: nodePortColor(visual.kind) }}
    isConnectable={isConnectable} aria-label={label} aria-disabled={!isConnectable}
    title={title ?? (invalid ? `${label}：不支持当前输入类型` : label)}>
    <PortIcon kind={visual.kind} /><span className="node-port-label">{label}</span>
  </Handle>;
}

export function NodePortAdd({ index, label, disabled, onClick }: { index: number; label: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className="node-port-add nodrag nopan" style={{ top: `calc(${nodePortY(index)}px - var(--node-port-border, 2px))` }}
    aria-label={label} title={label} disabled={disabled} onClick={onClick}>
    <PortIcon kind="add" /><span className="node-port-label">{label}</span>
  </button>;
}
