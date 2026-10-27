import { NodeIcon } from './NodeIcon';
import type { NodeProps } from '@xyflow/react';
import type { NanoBananaNode as NanoBanana } from './types';
import { nanoBananaFieldLabels, nanoBananaMaxImages, nanoBananaName } from './nanoBanana';
import { ImageGenerationNode } from './SunburstNode';

export function NanoBananaNode(props: NodeProps<NanoBanana>) {
  return <ImageGenerationNode {...props} name={nanoBananaName} icon={<NodeIcon nodeType="nano-banana" size={20} />} fieldLabels={nanoBananaFieldLabels} maxImages={nanoBananaMaxImages} />;
}
