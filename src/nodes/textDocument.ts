import type { JSONContent } from '@tiptap/core';

export function textToDocument(text: string): JSONContent {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}

export function documentText(document: JSONContent, variable: (handleId: string) => string = () => ''): string {
  if (document.type === 'text') return document.text ?? '';
  if (document.type === 'hardBreak') return '\n';
  if (document.type === 'promptVariable') return variable(String(document.attrs?.handleId ?? ''));
  return (document.content ?? []).map((child) => documentText(child, variable))
    .join(document.type === 'doc' ? '\n' : '');
}

export function hasVariable(document: JSONContent, handleId: string): boolean {
  return (document.type === 'promptVariable' && document.attrs?.handleId === handleId)
    || (document.content ?? []).some((child) => hasVariable(child, handleId));
}

export function initialTextDocument(text: string, handles: string[], ownerId: string): JSONContent {
  const document = textToDocument(text);
  const paragraph = document.content![0];
  paragraph.content = [
    ...handles.flatMap((handleId) => [
      { type: 'promptVariable', attrs: { handleId, ownerId } },
      { type: 'text', text: ' ' },
    ]),
    ...paragraph.content ?? [],
  ];
  return document;
}
