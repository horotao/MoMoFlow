import { createContext, useContext, useMemo } from 'react';
import { useEdges, type Edge } from '@xyflow/react';
import type { JSONContent } from '@tiptap/core';

export const PromptAnnotationEdits = createContext<((edit: {
  nodeId: string;
  content: JSONContent;
  previousContent: JSONContent;
  removedHandles: ReadonlySet<string>;
  restoreEdges: Edge[];
}) => Edge[]) | null>(null);

export const PromptAnnotationLinks = createContext<Edge[]>([]);
export const EnsureResultAnnotationWorkflow = createContext<((nodeId: string, imageId: string, animate: boolean) => void) | null>(null);

export function useWorkflowEdges() {
  const canvas = useEdges();
  const annotations = useContext(PromptAnnotationLinks);
  return useMemo(() => annotations.length ? [...canvas, ...annotations] : canvas, [canvas, annotations]);
}
