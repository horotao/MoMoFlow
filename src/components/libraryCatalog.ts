import { seedreamName } from '../nodes/seedream';
import { nanoBananaName } from '../nodes/nanoBanana';
import { sunburstName } from '../nodes/sunburst';
import { nanoBananaPreset, seedreamPreset, sunburstPreset } from './imageNodePresets';
import {
  AiBackgroundEraserIcon, AiChipIcon, Album01Icon, Bookmark02Icon,
  HistoryIcon, Image02Icon, ImageUpscaleIcon, PlaySquareIcon, Search01Icon, ToolCaseIcon,
} from '@hugeicons/core-free-icons';
import { nodeIcons } from '../nodes/nodeIcons';
import type { IconSvgElement } from '@hugeicons/react';
import type { AppNode } from '../nodes/types';
import { defaultTextNodeText } from '../nodes/defaults';
export type Category = 'Search' | 'Recents' | 'Saved' | 'Tools' | 'Image' | 'Video' | 'Models' | 'Assets';
export type Item = { id: string; label: string; icon: IconSvgElement; category: Category; group: string; color?: string; nodeType?: string };
const itemLabels: Record<string, string> = { text: '提示词', file: '导入', background: '移除背景', upscale: '图像放大' };
export const libraryItemLabel = (item: Item) => itemLabels[item.id] ?? item.label;

export const navigation: { name: Category; icon: IconSvgElement; divider?: boolean }[] = [
  { name: 'Search', icon: Search01Icon }, { name: 'Recents', icon: HistoryIcon }, { name: 'Saved', icon: Bookmark02Icon, divider: true },
  { name: 'Tools', icon: ToolCaseIcon }, { name: 'Image', icon: Image02Icon }, { name: 'Video', icon: PlaySquareIcon },
  { name: 'Models', icon: AiChipIcon, divider: true }, { name: 'Assets', icon: Album01Icon },
];
export const items: Item[] = [
  { id: 'text', label: 'Prompt', icon: nodeIcons['text'], category: 'Tools', group: 'Text tools', nodeType: 'text' },
  { id: 'file', label: 'Import', icon: nodeIcons['file'], category: 'Tools', group: 'Helpers', nodeType: 'file' },
  { id: 'sunburst', label: sunburstName, icon: nodeIcons['sunburst'], category: 'Image', group: 'Generate from text', nodeType: 'sunburst' },
  { id: 'nano-banana', nodeType: 'nano-banana', label: nanoBananaName, icon: nodeIcons['nano-banana'], category: 'Image', group: 'Generate from text' },
  { id: 'seedream', nodeType: 'seedream', label: seedreamName, icon: nodeIcons.seedream, category: 'Image', group: 'Generate from text or image' },
  { id: 'kling', label: 'Kling Video', icon: PlaySquareIcon, color: '#b1e65b', category: 'Video', group: 'Generate from text or image' },
  { id: 'background', label: 'Background Removal', icon: AiBackgroundEraserIcon, color: '#9b7cde', category: 'Models', group: 'Community models' },
  { id: 'upscale', label: 'Image Upscale', icon: ImageUpscaleIcon, category: 'Models', group: 'Community models' },
];

export function createLibraryNode(id: string, position: { x: number; y: number }): AppNode | undefined {
  const base = { id: crypto.randomUUID(), position, selected: true };
  switch (id) {
    case 'text': return { ...base, type: id, data: { text: defaultTextNodeText } };
    case 'file': return { ...base, type: id, data: {} };
    case 'sunburst': return { ...base, type: id, data: sunburstPreset.newNodeData() };
    case 'seedream': return { ...base, type: id, data: seedreamPreset.newNodeData() };
    case 'nano-banana': return { ...base, type: id, data: nanoBananaPreset.newNodeData() };
  }
}
