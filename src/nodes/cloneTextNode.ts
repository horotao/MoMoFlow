import type { TextNode } from './types';

export function cloneTextNode(node: TextNode): TextNode {
  const id = `text-${crypto.randomUUID()}`;
  const data = structuredClone(node.data);
  const remap = (content: NonNullable<typeof data.content>) => {
    if (content.type === 'promptVariable') content.attrs = { ...content.attrs, ownerId: id };
    content.content?.forEach(remap);
  };
  if (data.content) remap(data.content);
  return { id, type: 'text', data: { ...data, locked: false },
    position: { x: node.position.x + 40, y: node.position.y + 40 },
    origin: node.origin, selected: true };
}

