import { useStore, type NodeProps } from '@xyflow/react';
import { NodeIcon } from './NodeIcon';
import type { AppNode, SeedreamNode as Seedream } from './types';
import { seedreamFieldLabels, seedreamMaxImages, seedreamName, seedreamPreviewAspectRatio } from './seedream';
import { resolveTextValue } from './textVariables';
import { ImageGenerationNode } from './SunburstNode';

export function SeedreamNode(props: NodeProps<Seedream>) {
  const size = useStore(state => {
    const edge = state.edges.find(item => item.target === props.id && item.targetHandle === 'size');
    return edge ? resolveTextValue(edge.source, state.nodes as AppNode[], state.edges).trim() : props.data.size;
  });
  return <ImageGenerationNode {...props} name={seedreamName} icon={<NodeIcon nodeType="seedream" size={20} />} fieldLabels={seedreamFieldLabels} maxImages={seedreamMaxImages} previewAspectRatio={seedreamPreviewAspectRatio(size)} />;
}
