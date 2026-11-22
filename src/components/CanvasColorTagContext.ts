import { createContext, useContext } from 'react';
import { useNodeId } from '@xyflow/react';
import type { ColorTag } from '../nodes/colorTags';

export interface CanvasColorTagState {
  nodes: ReadonlyMap<string, { tags: ColorTag[]; locked: boolean }>;
  active: readonly ColorTag[];
  zoom: number;
  change: (id: string, color?: ColorTag) => void;
}
export const CanvasColorTagContext = createContext<CanvasColorTagState>({ nodes: new Map(), active: [], zoom: 1, change: () => {} });
export function useNodeColorTags() {
  const id = useNodeId();
  const state = useContext(CanvasColorTagContext);
  return { ...state.nodes.get(id ?? ''), id, active: state.active, zoom: state.zoom, change: (color?: ColorTag) => { if (id) state.change(id, color); } };
}
