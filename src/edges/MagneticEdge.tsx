import { useContext } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { ConnectionEffectsContext } from './connectionEffects';
import { MagneticCable } from './MagneticCable';
import { curveOptions } from './curve';

export function MagneticEdge(props: EdgeProps) {
  const feedback = useContext(ConnectionEffectsContext).animations.get(props.id);
  return <MagneticCable {...props} {...curveOptions} release={feedback?.release} impact={feedback?.impact} />;
}
