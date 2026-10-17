import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';
import { isFileNode } from '../nodes/fileAsset';
import { fileOutputKind, filePortColors } from '../nodes/fileCollection';
import type { AppNode } from '../nodes/types';
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
  const source = fromNode as AppNode;
  const fileColor = isFileNode(source) ? filePortColors[fileOutputKind(source.data)] : undefined;
  const isTextConnection = fromNode.type === 'text' || toNode?.type === 'text';

  return (
    <g className={isTextConnection ? 'text-variable-connection' : undefined}>
      <path className="react-flow__connection-path" d={path} fill="none" style={fileColor ? { stroke: fileColor } : undefined} />
      <circle className="connection-endpoint" cx={toX} cy={toY} r={3} style={fileColor ? { fill: fileColor, stroke: fileColor } : undefined} />
    </g>
  );
}
