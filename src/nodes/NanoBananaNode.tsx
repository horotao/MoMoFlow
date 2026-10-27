import type { NodeProps } from '@xyflow/react';
import { Sparkles } from 'lucide-react';
import type { NanoBananaNode as NanoBanana } from './types';
import { nanoBananaFieldLabels, nanoBananaMaxImages, nanoBananaName } from './nanoBanana';
import { ImageGenerationNode } from './SunburstNode';

export function NanoBananaNode(props: NodeProps<NanoBanana>) {
  return <ImageGenerationNode {...props} name={nanoBananaName} icon={<Sparkles size={20} strokeWidth={1.25} />} fieldLabels={nanoBananaFieldLabels} maxImages={nanoBananaMaxImages} />;
}
