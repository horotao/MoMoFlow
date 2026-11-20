import { Image03Icon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';
import { nodeIcons } from '../nodes/nodeIcons';
import { items, libraryItemLabel } from './libraryCatalog';

export type ImageModelCreationMode = 'text-to-image' | 'image-to-image' | 'model-only';
export type NodeMenuChoice = { id: string; itemId: string; detail?: string; imageModelCreationMode?: ImageModelCreationMode };
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

const assets: Record<string, string> = {
  text: 'text', sunburst: 'openai', 'nano-banana': 'gemini', seedream: 'jimeng',
};
function node(id: string): NodeMenuEntry {
  const item = items.find(item => item.id === id && item.nodeType);
  if (!item) throw new Error(`Unknown menu node: ${id}`);
  return {
    id, nodeId: id, label: libraryItemLabel(item),
    keywords: `${id} ${item.label} ${libraryItemLabel(item)}`, asset: assets[id],
    icon: nodeIcons[id as keyof typeof nodeIcons],
  };
}
const group = (label: string, ids: string[]): NodeMenuGroup => ({ label, entries: ids.map(node) });
const lyria: NodeMenuEntry = { id: 'lyria', label: 'Lyria 3', asset: 'deepmind' };

export const nodeMenuGroups: NodeMenuGroup[] = [
  { entries: [...['text', 'sunburst', 'nano-banana', 'seedream'].map(node), lyria] },
  { entries: [node('file')] },
  group('图像', ['sunburst', 'seedream']),
  { label: '音频', entries: [
    { id: 'voiceover', label: '配音', asset: 'mic01' },
    { id: 'voice-change', label: '更换声音', asset: 'voice' },
    { id: 'translate', label: '翻译', asset: 'translate' },
  ] },
  { label: '实用工具', entries: [
    { ...node('text'), id: 'utility-text', label: '文本' },
    { id: 'note', label: '便签', asset: 'sticky-note01' },
    { id: 'table', label: '表格', asset: 'table' },
  ] },
];
export const searchableNodeMenuEntries = items.filter(item => item.nodeType).map(item => node(item.id));
export const hasImageModelCreationMenu = (id: string) => id === 'sunburst' || id === 'nano-banana' || id === 'seedream';

export function withImageModelCreationMenu(entry: NodeMenuEntry): NodeMenuEntry {
  const { choice } = entry;
  if (!choice || !hasImageModelCreationMenu(choice.itemId)) return entry;
  return {
    ...entry, keywords: `${entry.keywords} 模型节点 文生图 图生图`,
    submenu: [{ label: '快捷操作', entries: [
      { id: 'model-only', label: '模型节点', asset: entry.asset, icon: entry.icon,
        choice: { ...choice, id: `${choice.id}:model-only`, imageModelCreationMode: 'model-only' } },
      { id: 'text-to-image', label: '文生图', asset: 'text', choice },
      { id: 'image-to-image', label: '图生图', icon: Image03Icon, choice: { ...choice, id: `${choice.id}:image-to-image`, imageModelCreationMode: 'image-to-image' } },
    ] }],
  };
}

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
