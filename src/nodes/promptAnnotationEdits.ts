import { createContext } from 'react';
import type { Edge } from '@xyflow/react';
import type { JSONContent } from '@tiptap/core';

export const PromptAnnotationEdits = createContext<((edit: {
  nodeId: string;
  content: JSONContent;
  removedHandles: ReadonlySet<string>;
  restoreEdges: Edge[];
}) => Edge[]) | null>(null);
