import { isCanvasImageNode, isCanvasTextNode, isNodeLocked, type AppNode } from './types.ts';

export const colorTags = [
  { id: 'red', label: '红色', color: '#ec5d5e' },
  { id: 'orange', label: '橙色', color: '#ff801f' },
  { id: 'yellow', label: '黄色', color: '#ffe629' },
  { id: 'green', label: '绿色', color: '#3dd68c' },
  { id: 'blue', label: '蓝色', color: '#0090ff' },
  { id: 'purple', label: '紫色', color: '#d19dff' },
  { id: 'gray', label: '灰色', color: '#2a2a2a' },
] as const;
export type ColorTag = typeof colorTags[number]['id'];
export function readColorTags(value: unknown): ColorTag[] {
  return colorTags.filter(tag => Array.isArray(value) && value.includes(tag.id)).map(tag => tag.id);
}
export function nodeColorTags(node?: AppNode): ColorTag[] {
  return node && (isCanvasImageNode(node) || isCanvasTextNode(node)) ? readColorTags(node.data.colorTags) : [];
}
export function countNodeColorTags(nodes: readonly AppNode[]): Record<ColorTag, number> {
  const counts = Object.fromEntries(colorTags.map(tag => [tag.id, 0])) as Record<ColorTag, number>;
  for (const node of nodes) for (const tag of nodeColorTags(node)) counts[tag]++;
  return counts;
}
export function nodeTagHighlight(tags: readonly ColorTag[], active: readonly ColorTag[]): string | undefined {
  const matches = colorTags.filter(tag => tags.includes(tag.id) && active.includes(tag.id));
  return matches.length > 1 ? '#ffffff' : matches[0]?.color;
}
export function changeColorTags(nodes: AppNode[], ids: readonly string[], color?: ColorTag): AppNode[] {
  const targets = new Set(ids);
  return nodes.map(node => {
    if (!targets.has(node.id) || isNodeLocked(node) || !(isCanvasImageNode(node) || isCanvasTextNode(node))) return node;
    const tags = nodeColorTags(node);
    const next = color === undefined ? [] : tags.includes(color) ? tags.filter(tag => tag !== color) : [...tags, color];
    if (next.length === tags.length && next.every(tag => tags.includes(tag))) return node;
    const colorTags = readColorTags(next);
    return isCanvasImageNode(node) ? { ...node, data: { ...node.data, colorTags } } : { ...node, data: { ...node.data, colorTags } };
  });
}
export function clearColorTags(nodes: AppNode[], color?: ColorTag): AppNode[] {
  const ids = nodes.filter(node => color ? nodeColorTags(node).includes(color) : nodeColorTags(node).length > 0).map(node => node.id);
  return changeColorTags(nodes, ids, color);
}
