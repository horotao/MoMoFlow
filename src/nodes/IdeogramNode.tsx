import { NodeIcon } from './NodeIcon';
import { useEdges, useNodes, type NodeProps } from '@xyflow/react';
import type { AppNode, IdeogramNode as Ideogram } from './types';
import { ideogramFieldLabels, ideogramImageInputCount, ideogramName, validateIdeogramEditSize } from './ideogram';
import { ImageGenerationNode } from './SunburstNode';
import { effectiveIdeogramSettings } from './ideogramRun';
import { imageOutput } from './sunburstRun';

export function IdeogramNode(props: NodeProps<Ideogram>) {
  const nodes = useNodes<AppNode>(), edges = useEdges();
  const node = nodes.find(item => item.id === props.id) as Ideogram | undefined;
  const sourceEdge = edges.find(edge => edge.target === props.id && edge.targetHandle === 'image-0');
  const masked = edges.some(edge => edge.target === props.id && edge.targetHandle === 'mask');
  let previewAspectRatio: string | null | undefined;
  if (sourceEdge) {
    const source = imageOutput(nodes.find(item => item.id === sourceEdge.source), sourceEdge.sourceHandle, nodes, edges)[0];
    previewAspectRatio = source?.width && source.height ? `${source.width} / ${source.height}` : null;
    if (node) {
      const settings = effectiveIdeogramSettings(node, nodes, edges);
      if (!masked && settings.editPrecision !== 'high') {
        try {
          const size = validateIdeogramEditSize(settings.editSize);
          if (size !== 'auto') previewAspectRatio = size.replace('*', ' / ');
        } catch { /* Keep the source ratio while a custom size is incomplete. */ }
      }
    }
  }
  return <ImageGenerationNode {...props} data={{ ...props.data, imageInputs: ideogramImageInputCount(props.data.imageInputs) }} name={ideogramName} icon={<NodeIcon nodeType="ideogram" size={20} />} fieldLabels={ideogramFieldLabels} maxImages={masked ? 4 : 5} mask
    imageLabels={['Image', 'Reference 1', 'Reference 2', 'Reference 3', 'Reference 4']} addImageLabel="添加参考图输入" previewAspectRatio={previewAspectRatio} />;
}
