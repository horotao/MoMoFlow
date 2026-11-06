import type { IconSvgElement } from '@hugeicons/react';
import { nodeIcons } from '../nodes/nodeIcons';
import { items, libraryItemLabel } from './libraryCatalog';

export type NodeMenuChoice = { id: string; itemId: string; detail?: string };
export type NodeMenuEntry = {
  id: string;
  label: string;
  asset?: string;
  icon?: IconSvgElement;
  nodeId?: string;
  keywords?: string;
  choice?: NodeMenuChoice;
};
export type NodeMenuGroup = { label?: string; entries: NodeMenuEntry[] };
export type NodeMenuCategory = 'editing' | 'helpers';

const assets: Record<string, string> = {
  text: 'text', sunburst: 'openai', 'nano-banana': 'gemini', ideogram: 'ideogram',
  'color-palette': 'paint-board', compositor: 'layers01', resize: 'arrow-expand01',
  'rotate-flip': 'rotate01', 'color-correction': 'sliders-vertical', levels: 'chart-histogram',
  invert: 'contrast', blur: 'blur', crop: 'crop', painter: 'paint-brush01',
};
function node(id: string): NodeMenuEntry {
  const item = items.find(item => item.id === id && item.nodeType);
  if (!item) throw new Error(`Unknown menu node: ${id}`);
  return {
    id, nodeId: id, label: id === 'resize' ? '调节尺寸' : libraryItemLabel(item),
    keywords: `${id} ${item.label} ${libraryItemLabel(item)}`, asset: assets[id],
    icon: nodeIcons[id as keyof typeof nodeIcons],
  };
}
const group = (label: string, ids: string[]): NodeMenuGroup => ({ label, entries: ids.map(node) });
const seedance: NodeMenuEntry = { id: 'seedance', label: 'Seedance 2.0', asset: 'jimeng' };
const lyria: NodeMenuEntry = { id: 'lyria', label: 'Lyria 3', asset: 'deepmind' };

export const nodeMenuCategories: Record<NodeMenuCategory, NodeMenuGroup[]> = {
  editing: [
    group('图像编辑', ['color-palette', 'compositor', 'resize', 'rotate-flip', 'color-correction', 'levels', 'invert', 'blur', 'crop', 'painter']),
    group('混合与蒙版', ['blend', 'masks-extractor', 'matte-grow-shrink']),
  ],
  helpers: [
    group('输入与预览', ['file', 'preview', 'compare']),
    group('文本与参数', ['text', 'image-describer', 'model-input']),
    group('流程与批量', ['router', 'text-iterator', 'image-iterator']),
    group('调试', ['position-logger']),
  ],
};
export const nodeMenuGroups: NodeMenuGroup[] = [
  { entries: [...['text', 'sunburst', 'nano-banana', 'ideogram'].map(node), seedance, lyria] },
  { label: '工具', entries: [
    { id: 'editing', label: '图像编辑节点', asset: 'ai-image-edit' },
    { id: 'helpers', label: '辅助工具节点', asset: 'tool-case' },
  ] },
  group('图像', ['sunburst']),
  { label: '视频', entries: [seedance] },
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
export const isNodeMenuCategory = (id: string | null): id is NodeMenuCategory => id === 'editing' || id === 'helpers';

const portLabels: Record<string, string> = {
  Back: '底图', Front: '前景', 'Input 1': '输入 1', Background: '背景', 'Layer 1': '图层 1',
  File: '文件', Image: '图像', 'Image With Alpha': '透明抠图', Input: '输入', Mask: '遮罩', Prompt: '提示词',
  'System Instructions': '系统指令', Result: '结果', 'Output 1': '输出 1', Output: '输出', Text: '文本',
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
