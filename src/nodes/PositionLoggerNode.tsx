import { NodeFrame, NodeTitle } from './NodeFrame';
import { NodePort } from './NodePort';
import { type NodeProps } from '@xyflow/react';

import { type PositionLoggerNode } from './types';

export function PositionLoggerNode({
  positionAbsoluteX,
  positionAbsoluteY,
  data,
  isConnectable,
}: NodeProps<PositionLoggerNode>) {
  const x = `${Math.round(positionAbsoluteX)}px`;
  const y = `${Math.round(positionAbsoluteY)}px`;

  return (
    <NodeFrame kind="compact">
      <NodePort direction="target" label="坐标输入" isConnectable={isConnectable} />
      <header className="text-node-header"><NodeTitle type="POSITION LOGGER"><span>{!data.label || data.label === 'Position Logger' ? '坐标记录' : data.label}</span></NodeTitle></header>

      <div className="node-frame-card node-position-card">
        <span>X {x}</span><span>Y {y}</span>
      </div>

      <NodePort direction="source" label="坐标输出" isConnectable={isConnectable} />
    </NodeFrame>
  );
}
