import { createContext, useContext } from 'react';
import { useStore } from '@xyflow/react';
import { mentionCandidates, type MentionEdit, type MentionSources } from './promptMentions';
import type { AppNode } from './types';

export const CanvasMentionContext = createContext<(id: string, edit: MentionEdit, sourceId?: MentionSources) => boolean>(() => false);
export function useCanvasMentions(id: string) {
  const commit = useContext(CanvasMentionContext);
  const nodes = useStore(state => state.nodes) as AppNode[];
  const edges = useStore(state => state.edges);
  return { candidates: mentionCandidates(id, nodes, edges), onEdit: (edit: MentionEdit, sourceId?: MentionSources) => commit(id, edit, sourceId) };
}
