import type { NodeProps } from '@xyflow/react';
import { NodeIcon } from './NodeIcon';
import type { SeedreamNode as Seedream } from './types';
import { seedreamMaxImages, seedreamName, seedreamPreviewAspectRatio } from './seedream';
import { ImageGenerationNode } from './SunburstNode';

export function SeedreamNode(props: NodeProps<Seedream>) {
  return <ImageGenerationNode {...props} name={seedreamName} icon={<NodeIcon nodeType="seedream" size={20} />} maxImages={seedreamMaxImages} previewAspectRatio={seedreamPreviewAspectRatio(props.data.size)} />;
}
