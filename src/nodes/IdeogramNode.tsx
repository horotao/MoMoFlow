import { type NodeProps } from '@xyflow/react';
import type { IdeogramNode as Ideogram } from './types';
import { ideogramFieldLabels, ideogramImageInputCount, ideogramName } from './ideogram';
import { NodeIcon } from './NodeIcon';
import { ImageGenerationNode } from './SunburstNode';

export function IdeogramNode(props: NodeProps<Ideogram>) {
  return <ImageGenerationNode {...props} data={{ ...props.data, imageInputs: ideogramImageInputCount(props.data.imageInputs) }}
    name={ideogramName} icon={<NodeIcon nodeType="ideogram" size={20} />} fieldLabels={ideogramFieldLabels} maxImages={5} mask
    imageLabels={['Image', 'Reference 1', 'Reference 2', 'Reference 3', 'Reference 4']} />;
}
