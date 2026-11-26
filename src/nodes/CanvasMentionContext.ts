import { createContext, useContext, useMemo } from 'react';
import { useStore } from '@xyflow/react';
import { mentionCandidates, type MentionEdit, type MentionSources } from './promptMentions';
import { useCanvasNodeContents } from './useCanvasNodeContents';

export const CanvasMentionContext = createContext<(id: string, edit: MentionEdit, sourceId?: MentionSources) => boolean>(() => false);
export function useCanvasMentions(id: string) {
  const commit = useContext(CanvasMentionContext);
  const nodes = useCanvasNodeContents();
  const edges = useStore(state => state.edges);
  const candidates = useMemo(() => mentionCandidates(id, nodes, edges), [id, nodes, edges]);
  return { candidates, onEdit: (edit: MentionEdit, sourceId?: MentionSources) => commit(id, edit, sourceId) };
}
