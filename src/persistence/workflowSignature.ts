import { documentText, initialTextDocument } from '../nodes/textDocument.ts';
import { isTextNode, variableHandleId, variableIndex } from '../nodes/textVariables.ts';
import { workflowSnapshot, type Workflow } from './workflowStorage.ts';

// Compare persisted content, not React Flow selection/measurement or storage
// revision metadata. Restoring a legacy text node initializes its editor JSON;
// that equivalent representation is not a user edit either.
export function workflowSignature(workflow: Workflow): string {
  const { nodes, edges, viewport, colorMode } = workflowSnapshot(workflow);
  return JSON.stringify({
    nodes: nodes.map(node => {
      if (!isTextNode(node)) return node;
      const content = node.data.content ?? initialTextDocument(node.data.text,
        edges.filter(edge => edge.target === node.id)
          .sort((a, b) => variableIndex(a.targetHandle) - variableIndex(b.targetHandle))
          .map(edge => variableHandleId(variableIndex(edge.targetHandle))), node.id);
      return { ...node, data: { ...node.data, content, text: documentText(content) } };
    }),
    edges, viewport, colorMode,
  }, (key, value: unknown) => {
    // Tiptap omits empty content arrays when serializing paragraphs.
    if (key === 'content' && Array.isArray(value) && value.length === 0) return undefined;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
}
