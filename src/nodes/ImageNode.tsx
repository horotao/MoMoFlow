import type { NodeProps } from '@xyflow/react';
import { CanvasImageNode } from './CanvasImageNode';
import { SunburstNode } from './SunburstNode';
import type { SunburstNode as Sunburst } from './types';

export function ImageNode(props: NodeProps<Sunburst>) {
  const { data } = props;
  return data.composer ? <CanvasImageNode {...props} data={{ ...data, composer: data.composer }} /> : <SunburstNode {...props} />;
}
