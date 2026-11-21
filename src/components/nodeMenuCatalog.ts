import type { IconSvgElement } from '@hugeicons/react';
export type NodeMenuChoice = { id: string; itemId: string; detail?: string };
export type NodeMenuEntry = {
  id: string;
  label: string;
  asset?: string;
  icon?: IconSvgElement;
  nodeId?: string;
  keywords?: string;
  choice?: NodeMenuChoice;
  submenu?: NodeMenuGroup[];
};
export type NodeMenuGroup = { label?: string; entries: NodeMenuEntry[] };

export const searchableNodeMenuEntries: NodeMenuEntry[] = [{ id: 'image', nodeId: 'image', label: '图片', keywords: 'Image' }];
export const nodeMenuGroups = [{ entries: searchableNodeMenuEntries }];
const portLabels: Record<string, string> = {
  File: '文件', Image: '图像', Mask: '遮罩', Prompt: '提示词', Result: '结果', Text: '文本',
};
// Preserve each compatible port's choice identity, even when several belong to one node.
export function resolveMenuGroups(groups: NodeMenuGroup[], choices?: NodeMenuChoice[]): NodeMenuGroup[] {
  return groups.map(group => ({ ...group, entries: group.entries.flatMap(entry => {
    if (!entry.nodeId) return [entry];
    if (!choices) return [{ ...entry, choice: { id: entry.nodeId, itemId: entry.nodeId } }];
    const matches = choices.filter(choice => choice.itemId === entry.nodeId);
    return matches.map(choice => ({
      ...entry, id: `${entry.id}:${choice.id}`, choice,
      label: matches.length > 1 && choice.detail ? `${entry.label} · ${portLabels[choice.detail] ?? choice.detail}` : entry.label,
      keywords: `${entry.keywords} ${choice.detail ?? ''} ${portLabels[choice.detail ?? ''] ?? ''}`,
    }));
  }) })).filter(group => group.entries.length > 0);
}
