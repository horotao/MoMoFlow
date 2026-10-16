import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';
import { curveOptions } from './curve';

export function ConnectionLine({
  fromX, fromY, toX, toY, fromPosition, toPosition, fromNode, toNode,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    ...curveOptions,
  });
  const isTextConnection = fromNode.type === 'text' || toNode?.type === 'text';

  return (
    <g className={isTextConnection ? 'text-variable-connection' : undefined}>
      <path className="react-flow__connection-path" d={path} fill="none" />
      <circle className="connection-endpoint" cx={toX} cy={toY} r={3} />
    </g>
  );
}
