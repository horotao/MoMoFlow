import { useEdges, useNodes } from '@xyflow/react';
import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';
import type { AppNode } from '../nodes/types';
import { curveOptions } from './curve';
import { nodeConnectionColor } from '../nodes/nodeConnectionStyle';

export function ConnectionLine({
  fromX, fromY, toX, toY, fromPosition, toPosition, fromNode, fromHandle,
}: ConnectionLineComponentProps) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    ...curveOptions,
  });
  const portColor = nodeConnectionColor(fromNode as AppNode, fromHandle.id, fromHandle.type, nodes, edges);
  return <g className="node-design-connection">
    <path className="react-flow__connection-path" d={path} fill="none" style={{ stroke: portColor, strokeWidth: 3, strokeLinecap: 'round' }} />
    <circle className="connection-endpoint" cx={toX} cy={toY} r={3} style={{ fill: portColor, stroke: portColor }} />
  </g>;
}
