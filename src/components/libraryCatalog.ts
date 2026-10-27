import { defaultIdeogramEditSettings, defaultIdeogramSettings, ideogramName } from '../nodes/ideogram';
import { defaultMatteGrowShrinkSettings } from '../nodes/matteGrowShrink';
import { defaultNanoBananaSettings, nanoBananaName } from '../nodes/nanoBanana';
import { defaultBlendSettings } from '../nodes/blend';
import { defaultCompareData } from '../nodes/compare';
import { defaultResizeSettings } from '../nodes/resize';
import { defaultCompositorDocument } from '../nodes/compositor';
import { defaultRotateFlipSettings } from '../nodes/rotateFlip';
import { defaultLevelsSettings } from '../nodes/levels';
import { defaultBlurSettings } from '../nodes/blur';
import { defaultColorSettings } from '../nodes/colorCorrection';
import { defaultCropData } from '../nodes/crop';
import { defaultPainterData } from '../nodes/painter';
import { defaultSunburstSettings, sunburstName } from '../nodes/sunburst';
import {
  AiBackgroundEraserIcon, AiChipIcon, AiVideoIcon, Album01Icon, Bookmark02Icon,
  HistoryIcon, Image02Icon, ImageUpscaleIcon, PlaySquareIcon, Search01Icon, ToolCaseIcon,
} from '@hugeicons/core-free-icons';
import { nodeIcons } from '../nodes/nodeIcons';
import type { IconSvgElement } from '@hugeicons/react';
import type { AppNode } from '../nodes/types';
import { defaultInstructions } from '../nodes/describer';
import { defaultTextNodeText } from '../nodes/defaults';
export type Category = 'Search' | 'Recents' | 'Saved' | 'Tools' | 'Image' | 'Video' | 'Models' | 'Assets';
export type Item = { id: string; label: string; icon: IconSvgElement; category: Category; group: string; color?: string; nodeType?: string };
const itemLabels: Record<string, string> = {
  'matte-grow-shrink': '蒙版扩张 / 收缩', 'masks-extractor': '蒙版提取', router: '路由', 'color-palette': '调色板', compositor: '合成器', text: '提示词',
  'image-describer': '图像描述', file: '导入', preview: '预览', compare: '对比', blend: '混合',
  'model-input': '模型名称', 'position-logger': '坐标记录', resize: '调整尺寸',
  'rotate-flip': '旋转与翻转', 'color-correction': '色彩校正', levels: '色阶',
  invert: '反相', blur: '模糊', crop: '裁剪', painter: '绘图',
  background: '移除背景', upscale: '图像放大',
};
export const libraryItemLabel = (item: Item) => itemLabels[item.id] ?? item.label;

export const navigation: { name: Category; icon: IconSvgElement; divider?: boolean }[] = [
  { name: 'Search', icon: Search01Icon }, { name: 'Recents', icon: HistoryIcon }, { name: 'Saved', icon: Bookmark02Icon, divider: true },
  { name: 'Tools', icon: ToolCaseIcon }, { name: 'Image', icon: Image02Icon }, { name: 'Video', icon: PlaySquareIcon },
  { name: 'Models', icon: AiChipIcon, divider: true }, { name: 'Assets', icon: Album01Icon },
];
export const items: Item[] = [
  { id: 'ideogram', nodeType: 'ideogram', label: ideogramName, icon: nodeIcons.ideogram, category: 'Image', group: 'Generate from text' },
  { id: 'matte-grow-shrink', label: 'Matte Grow / Shrink', icon: nodeIcons['matte-grow-shrink'], category: 'Tools', group: 'Matte', nodeType: 'matte-grow-shrink' },
  { id: 'masks-extractor', label: 'Masks Extractor', icon: nodeIcons['masks-extractor'], category: 'Tools', group: 'Matte', nodeType: 'masks-extractor' },
  { id: 'router', label: 'Router', icon: nodeIcons['router'], category: 'Tools', group: 'Helpers', nodeType: 'router' },
  { id: 'color-palette', label: 'Color palette', icon: nodeIcons['color-palette'], category: 'Tools', group: 'Editing', nodeType: 'color-palette' },
  { id: 'compositor', label: 'Compositor', icon: nodeIcons['compositor'], category: 'Tools', group: 'Editing', nodeType: 'compositor' },
  { id: 'text', label: 'Prompt', icon: nodeIcons['text'], category: 'Tools', group: 'Text tools', nodeType: 'text' },
  { id: 'image-describer', label: 'Image Describer', icon: nodeIcons['image-describer'], category: 'Tools', group: 'Text tools', nodeType: 'image-describer' },
  { id: 'file', label: 'Import', icon: nodeIcons['file'], category: 'Tools', group: 'Helpers', nodeType: 'file' },
  { id: 'preview', label: 'Preview', icon: nodeIcons['preview'], category: 'Tools', group: 'Helpers', nodeType: 'preview' },
  { id: 'compare', label: 'Compare', icon: nodeIcons['compare'], category: 'Tools', group: 'Helpers', nodeType: 'compare' },
  { id: 'blend', label: 'Blend', icon: nodeIcons['blend'], category: 'Tools', group: 'Helpers', nodeType: 'blend' },
  { id: 'model-input', label: 'Model Name', icon: nodeIcons['model-input'], category: 'Tools', group: 'Datatypes', nodeType: 'model-input' },
  { id: 'position-logger', label: 'Position Logger', icon: nodeIcons['position-logger'], category: 'Tools', group: 'Helpers', nodeType: 'position-logger' },
  { id: 'sunburst', label: sunburstName, icon: nodeIcons['sunburst'], category: 'Image', group: 'Generate from text', nodeType: 'sunburst' },
  { id: 'resize', label: 'Resize', icon: nodeIcons['resize'], category: 'Tools', group: 'Editing', nodeType: 'resize' },
  { id: 'rotate-flip', label: 'Rotate and flip', icon: nodeIcons['rotate-flip'], category: 'Tools', group: 'Editing', nodeType: 'rotate-flip' },
  { id: 'color-correction', label: 'Color correction', icon: nodeIcons['color-correction'], category: 'Tools', group: 'Editing', nodeType: 'color-correction' },
  { id: 'levels', label: 'Levels', icon: nodeIcons['levels'], category: 'Tools', group: 'Editing', nodeType: 'levels' },
  { id: 'invert', label: 'Invert', icon: nodeIcons['invert'], category: 'Tools', group: 'Editing', nodeType: 'invert' },
  { id: 'blur', label: 'Blur', icon: nodeIcons['blur'], category: 'Tools', group: 'Editing', nodeType: 'blur' },
  { id: 'crop', label: 'Crop', icon: nodeIcons['crop'], category: 'Tools', group: 'Editing', nodeType: 'crop' },
  { id: 'painter', label: 'Painter', icon: nodeIcons['painter'], category: 'Tools', group: 'Editing', nodeType: 'painter' },
  { id: 'gpt-image', label: 'GPT Image', icon: nodeIcons.sunburst, category: 'Image', group: 'Generate from text' },
  { id: 'nano-banana', nodeType: 'nano-banana', label: nanoBananaName, icon: nodeIcons['nano-banana'], color: '#a48cdd', category: 'Image', group: 'Generate from text' },
  { id: 'seedance', label: 'Seedance', icon: AiVideoIcon, color: '#6bc9ca', category: 'Video', group: 'Generate from text or image' },
  { id: 'kling', label: 'Kling Video', icon: PlaySquareIcon, color: '#b1e65b', category: 'Video', group: 'Generate from text or image' },
  { id: 'background', label: 'Background Removal', icon: AiBackgroundEraserIcon, color: '#9b7cde', category: 'Models', group: 'Community models' },
  { id: 'upscale', label: 'Image Upscale', icon: ImageUpscaleIcon, category: 'Models', group: 'Community models' },
];

export function createLibraryNode(id: string, position: { x: number; y: number }): AppNode | undefined {
  const item = items.find(candidate => candidate.id === id);
  if (!item?.nodeType) return;
  const data = id === 'ideogram' ? { ...defaultIdeogramSettings, ...defaultIdeogramEditSettings, imageInputs: 1 } : id === 'matte-grow-shrink' ? { settings: { ...defaultMatteGrowShrinkSettings } } : id === 'blend' ? { settings: { ...defaultBlendSettings } } : id === 'compare' ? { ...defaultCompareData } : id === 'resize' ? { settings: { ...defaultResizeSettings } } : id === 'color-palette' ? { colors: [] } : id === 'compositor' ? { document: defaultCompositorDocument() } : id === 'rotate-flip' ? { settings: { ...defaultRotateFlipSettings } } : id === 'levels' ? { channel: 'RGB', settings: structuredClone(defaultLevelsSettings) } : id === 'blur' ? { settings: { ...defaultBlurSettings } } : id === 'color-correction' ? { settings: { ...defaultColorSettings } } : id === 'crop' ? { ...defaultCropData, rect: { ...defaultCropData.rect } } : id === 'painter' ? { ...defaultPainterData, strokes: [] } : id === 'nano-banana' ? { ...defaultNanoBananaSettings, imageInputs: 1 } : id === 'sunburst' ? { ...defaultSunburstSettings, imageInputs: 1 } : id === 'text' ? { text: defaultTextNodeText } : id === 'image-describer' ? { text: '', model: 'deepseek-flash', instructions: defaultInstructions, imageInputs: 1 } : id === 'model-input' ? { model: 'deepseek-flash' } : id === 'masks-extractor' || id === 'router' || id === 'invert' || id === 'file' || id === 'preview' ? {} : { label: item.label, category: item.category };
  return { id: crypto.randomUUID(), type: item.nodeType, position, data, selected: true } as AppNode;
}
