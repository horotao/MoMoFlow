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
    <>
      <NodePort direction="target" label="坐标输入" isConnectable={isConnectable} />
      {data.label && <div>{data.label === 'Position Logger' ? '坐标记录' : data.label}</div>}

      <div>
        {x} {y}
      </div>

      <NodePort direction="source" label="坐标输出" isConnectable={isConnectable} />
    </>
  );
}
