import { Position, useEdges, type NodeProps } from '@xyflow/react';

import { type PositionLoggerNode } from './types';
import { HelperNodeFrame } from './shared/HelperNodeFrame';
import { NodePort } from './shared/NodePort';

export function PositionLoggerNode({
  id,
  positionAbsoluteX,
  positionAbsoluteY,
  data,
  isConnectable,
}: NodeProps<PositionLoggerNode>) {
  const edges = useEdges();
  const x = `${Math.round(positionAbsoluteX)}px`;
  const y = `${Math.round(positionAbsoluteY)}px`;

  return (
    <HelperNodeFrame id={id} nodeType="position-logger" label={data.label === 'Position Logger' ? '坐标记录' : data.label || '坐标记录'} locked={data.locked}>
      <dl className="helper-node-coordinates"><div><dt>X</dt><dd>{x}</dd></div><div><dt>Y</dt><dd>{y}</dd></div></dl>
      <NodePort label="Input" type="target" position={Position.Left} top={28} isConnectable={isConnectable}>
        <img src={`/node-style/port-text${edges.some(edge => edge.target === id) ? '-connected' : ''}.svg`} alt="" />
      </NodePort>
      <NodePort label="Output" type="source" position={Position.Right} top={28} isConnectable={isConnectable}>
        <img src={`/node-style/port-text${edges.some(edge => edge.source === id) ? '-connected' : ''}.svg`} alt="" />
      </NodePort>
    </HelperNodeFrame>
  );
}
