import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';
import { isFileNode } from '../nodes/fileAsset';
import { fileOutputKind, filePortColors } from '../nodes/fileCollection';
import type { AppNode } from '../nodes/types';
import { curveOptions } from './curve';

export function ConnectionLine({
  fromX, fromY, toX, toY, fromPosition, toPosition, fromNode, fromHandle, toNode,
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
  // The starting handle determines the preview color, including reverse drags from inputs.
  const handleId = fromHandle.id ?? '';
  const portColor = isFileNode(source) ? filePortColors[fileOutputKind(source.data)]
    : source.type === 'preview' ? 'var(--sunburst-mask-port)'
    : ['sunburst', 'painter'].includes(source.type ?? '') && handleId === 'mask' ? 'var(--sunburst-mask-port)'
    : ['sunburst', 'painter'].includes(source.type ?? '') && (handleId === 'image' || handleId === 'result' || /^image-\d+$/.test(handleId)) ? 'var(--sunburst-image-port)'
    : source.type === 'image-describer' && /^image-\d+$/.test(handleId) ? filePortColors.image
    : undefined;
  const isTextConnection = fromNode.type === 'text' || toNode?.type === 'text';

  return (
    <g className={isTextConnection ? 'text-variable-connection' : undefined}>
      <path className="react-flow__connection-path" d={path} fill="none" style={portColor ? { stroke: portColor } : undefined} />
      <circle className="connection-endpoint" cx={toX} cy={toY} r={3} style={portColor ? { fill: portColor, stroke: portColor } : undefined} />
    </g>
  );
}
