import { useEdges, useNodes } from '@xyflow/react';
import { outputKind, outputColor } from '../nodes/router';
import { type ConnectionLineComponentProps } from '@xyflow/react';
import { useContext } from 'react';
import { isFileNode } from '../nodes/fileAsset';
import { fileOutputKind, filePortColors } from '../nodes/fileCollection';
import type { AppNode } from '../nodes/types';
import { curveOptions } from './curve';
import { MagneticConnectionPreview } from './MagneticConnectionPreview';
import { ConnectionEffectsContext } from './connectionEffects';
import { magneticDefaults } from './magneticTypes';

export function ConnectionLine(props: ConnectionLineComponentProps) {
  const { fromNode, fromHandle, toNode } = props;
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const { visual } = useContext(ConnectionEffectsContext);
  const source = fromNode as AppNode;
  // The starting handle determines the preview color, including reverse drags from inputs.
  const handleId = fromHandle.id ?? '';
  const portColor = source.type === 'router' ? outputColor(outputKind(source, 'output', nodes, edges)) : isFileNode(source) ? filePortColors[fileOutputKind(source.data)]
    : source.type === 'preview' || source.type === 'matte-grow-shrink' ? 'var(--sunburst-mask-port)'
    : ['sunburst', 'painter'].includes(source.type ?? '') && handleId === 'mask' ? 'var(--sunburst-mask-port)'
    : ['sunburst', 'painter'].includes(source.type ?? '') && (handleId === 'image' || handleId === 'result' || /^image-\d+$/.test(handleId)) ? 'var(--sunburst-image-port)'
    : source.type === 'image-describer' && /^image-\d+$/.test(handleId) ? filePortColors.image
    : undefined;
  const isTextConnection = fromNode.type === 'text' || toNode?.type === 'text';

  return <MagneticConnectionPreview {...props} {...curveOptions} settings={magneticDefaults} visual={visual}
    className={isTextConnection ? 'text-variable-connection' : undefined}
    color={portColor ?? 'var(--xy-connectionline-stroke, var(--xy-connectionline-stroke-default, #b1b1b7))'} />;
}
