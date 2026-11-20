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

export function withoutVariables(document: JSONContent, handles: ReadonlySet<string>): JSONContent {
  if (!document.content) return document;
  const content = document.content
    .filter(child => child.type !== 'promptVariable' || !handles.has(String(child.attrs?.handleId ?? '')))
    .map(child => withoutVariables(child, handles));
  return content.length === document.content.length && content.every((child, index) => child === document.content?.[index])
    ? document : { ...document, content };
}

export type VariablePosition = { paragraph: number; offset: number; slot: number };

// The offset ignores inline variables, so removing other references and
// ProseMirror joining adjacent text nodes do not move this position.
function inlineWidth(node: JSONContent) {
  if (node.type === 'promptVariable') return 0;
  return node.type === 'text' ? (node.text?.length ?? 0) : 1;
}

export function variablePositions(document: JSONContent, handles: ReadonlySet<string>) {
  const positions = new Map<string, VariablePosition[]>();
  if (!handles.size) return positions;
  for (const [paragraph, block] of (document.content ?? []).entries()) {
    let offset = 0;
    let slot = 0;
    for (const child of block.content ?? []) {
      if (child.type === 'promptVariable') {
        const handle = String(child.attrs?.handleId ?? '');
        if (handles.has(handle)) {
          const list = positions.get(handle) ?? [];
          list.push({ paragraph, offset, slot });
          positions.set(handle, list);
        }
        slot++;
      } else {
        offset += inlineWidth(child);
        slot = 0;
      }
    }
  }
  return positions;
}

export function restoreVariables(document: JSONContent, ownerId: string, references: ReadonlyMap<string, VariablePosition[]>): JSONContent {
  if (!references.size) return document;
  const blocks: JSONContent[] = document.content?.length ? [...document.content] : [{ type: 'paragraph' }];
  const insertions = [...references].flatMap(([handleId, positions]) => positions.map(position => ({ ...position, handleId })));
  insertions.sort((a, b) => a.paragraph - b.paragraph || a.offset - b.offset || a.slot - b.slot);
  for (const { paragraph, offset, slot, handleId } of insertions) {
    const index = Math.min(paragraph, blocks.length - 1);
    const block = blocks[index];
    const content = [...block.content ?? []];
    const variable = { type: 'promptVariable', attrs: { ownerId, handleId } };
    let before = 0;
    let variables = 0;
    let at = 0;
    for (; at < content.length; at++) {
      const child = content[at];
      if (child.type === 'promptVariable') {
        if (before === offset && variables >= slot) break;
        variables++;
        continue;
      }
      const after = before + inlineWidth(child);
      if (before >= offset) break;
      if (after > offset && child.type === 'text' && child.text) {
        const cut = offset - before;
        content.splice(at, 1, { ...child, text: child.text.slice(0, cut) }, { ...child, text: child.text.slice(cut) });
        at++;
        break;
      }
      before = after;
      variables = 0;
    }
    content.splice(at, 0, variable);
    blocks[index] = { ...block, content };
  }
  return { ...document, content: blocks };
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
