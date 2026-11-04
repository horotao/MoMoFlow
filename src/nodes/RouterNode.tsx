import { NodePort } from './NodePort';
import { useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { LockKeyhole } from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { routerIcons } from './nodeIcons';
import type { AppNode, RouterNode as Router } from './types';
import { outputKind } from './router';
import { NodeFrame } from './NodeFrame';
import { NodeHeader } from './NodeHeader';
import './RouterNode.css';

export function RouterNode({ id, data, isConnectable }: NodeProps<Router>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const kind = outputKind(nodes.find(node => node.id === id), 'output', nodes, edges);
  return <NodeFrame kind="compact" className="node-router-frame" minHeight={84}>
    <div className="node-frame-card node-router-card">
      <NodeHeader id={id} label={data.label} fallback="路由" type="ROUTER" locked={data.locked}
        icon={<span className="node-router-icon">{kind ? <HugeiconsIcon icon={routerIcons[kind]} size={16} aria-hidden="true" /> : <img src="/node-ports/router.svg" alt="" />}</span>} />
      {data.locked && <LockKeyhole className="node-router-lock" size={12} aria-label="已锁定" />}
    </div>
    <NodePort id="input" direction="target" label="Router input" isConnectable={isConnectable && !data.locked} />
    <NodePort id="output" direction="source" label="Router output" isConnectable={isConnectable && !data.locked} />
  </NodeFrame>;
}
