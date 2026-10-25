import { ResizeIcon } from '../nodes/ResizeIcon';
import { defaultResizeSettings } from '../nodes/resize';
import { defaultCompositorDocument } from '../nodes/compositor';
import { Layers, Palette } from 'lucide-react';
import { RotateFlipIcon } from '../nodes/RotateFlipIcon';
import { defaultRotateFlipSettings } from '../nodes/rotateFlip';
import { InvertIcon } from '../nodes/InvertIcon';
import { defaultLevelsSettings } from '../nodes/levels';
import { defaultBlurSettings } from '../nodes/blur';
import { defaultColorSettings } from '../nodes/colorCorrection';
import { defaultCropData } from '../nodes/crop';
import { defaultPainterData } from '../nodes/painter';
import { defaultSunburstSettings, sunburstName } from '../nodes/sunburst';
import { ChartNoAxesCombined, Blend, SlidersVertical, Crop, Eye, Paintbrush, Search, History, Bookmark, BriefcaseBusiness, Image, SquarePlay, AudioLines, Blocks, Images, Type, Import, ScanEye, ListFilter, MapPin, Sparkles, WandSparkles, type LucideIcon } from 'lucide-react';
import type { AppNode } from '../nodes/types';
import { defaultInstructions } from '../nodes/describer';
import { defaultTextNodeText } from '../nodes/defaults';
export type Category = 'Search' | 'Recents' | 'Saved' | 'Tools' | 'Image' | 'Video' | 'Models' | 'Assets';
export type Item = { id: string; label: string; icon: LucideIcon; category: Category; group: string; color?: string; nodeType?: string };
export const navigation: { name: Category; icon: LucideIcon; divider?: boolean }[] = [
  { name: 'Search', icon: Search }, { name: 'Recents', icon: History }, { name: 'Saved', icon: Bookmark, divider: true },
  { name: 'Tools', icon: BriefcaseBusiness }, { name: 'Image', icon: Image }, { name: 'Video', icon: SquarePlay },
  { name: 'Models', icon: Blocks, divider: true }, { name: 'Assets', icon: Images },
];
export const items: Item[] = [
  { id: 'color-palette', label: 'Color palette', icon: Palette, category: 'Tools', group: 'Editing', nodeType: 'color-palette' },
  { id: 'compositor', label: 'Compositor', icon: Layers, category: 'Tools', group: 'Editing', nodeType: 'compositor' },
  { id: 'text', label: 'Prompt', icon: Type, category: 'Tools', group: 'Text tools', nodeType: 'text' },
  { id: 'image-describer', label: 'Image Describer', icon: ScanEye, category: 'Tools', group: 'Text tools', nodeType: 'image-describer' },
  { id: 'file', label: 'Import', icon: Import, category: 'Tools', group: 'Helpers', nodeType: 'file' },
  { id: 'preview', label: 'Preview', icon: Eye, category: 'Tools', group: 'Helpers', nodeType: 'preview' },
  { id: 'model-input', label: 'Model Name', icon: ListFilter, category: 'Tools', group: 'Datatypes', nodeType: 'model-input' },
  { id: 'position-logger', label: 'Position Logger', icon: MapPin, category: 'Tools', group: 'Helpers', nodeType: 'position-logger' },
  { id: 'sunburst', label: sunburstName, icon: Sparkles, category: 'Image', group: 'Generate from text', nodeType: 'sunburst' },
  { id: 'resize', label: 'Resize', icon: ResizeIcon, category: 'Tools', group: 'Editing', nodeType: 'resize' },
  { id: 'rotate-flip', label: 'Rotate and flip', icon: RotateFlipIcon, category: 'Tools', group: 'Editing', nodeType: 'rotate-flip' },
  { id: 'color-correction', label: 'Color correction', icon: SlidersVertical, category: 'Tools', group: 'Editing', nodeType: 'color-correction' },
  { id: 'levels', label: 'Levels', icon: ChartNoAxesCombined, category: 'Tools', group: 'Editing', nodeType: 'levels' },
  { id: 'invert', label: 'Invert', icon: InvertIcon, category: 'Tools', group: 'Editing', nodeType: 'invert' },
  { id: 'blur', label: 'Blur', icon: Blend, category: 'Tools', group: 'Editing', nodeType: 'blur' },
  { id: 'crop', label: 'Crop', icon: Crop, category: 'Tools', group: 'Editing', nodeType: 'crop' },
  { id: 'painter', label: 'Painter', icon: Paintbrush, category: 'Tools', group: 'Editing', nodeType: 'painter' },
  { id: 'gpt-image', label: 'GPT Image', icon: Sparkles, category: 'Image', group: 'Generate from text' },
  { id: 'nano-banana', label: 'Nano Banana', icon: Sparkles, color: '#a48cdd', category: 'Image', group: 'Generate from text' },
  { id: 'seedance', label: 'Seedance', icon: AudioLines, color: '#6bc9ca', category: 'Video', group: 'Generate from text or image' },
  { id: 'kling', label: 'Kling Video', icon: SquarePlay, color: '#b1e65b', category: 'Video', group: 'Generate from text or image' },
  { id: 'background', label: 'Background Removal', icon: WandSparkles, color: '#9b7cde', category: 'Models', group: 'Community models' },
  { id: 'upscale', label: 'Image Upscale', icon: Image, category: 'Models', group: 'Community models' },
];

export function createLibraryNode(id: string, position: { x: number; y: number }): AppNode | undefined {
  const item = items.find(candidate => candidate.id === id);
  if (!item?.nodeType) return;
  const data = id === 'resize' ? { settings: { ...defaultResizeSettings } } : id === 'color-palette' ? { colors: [] } : id === 'compositor' ? { document: defaultCompositorDocument() } : id === 'rotate-flip' ? { settings: { ...defaultRotateFlipSettings } } : id === 'levels' ? { channel: 'RGB', settings: structuredClone(defaultLevelsSettings) } : id === 'blur' ? { settings: { ...defaultBlurSettings } } : id === 'color-correction' ? { settings: { ...defaultColorSettings } } : id === 'crop' ? { ...defaultCropData, rect: { ...defaultCropData.rect } } : id === 'painter' ? { ...defaultPainterData, strokes: [] } : id === 'sunburst' ? { ...defaultSunburstSettings, imageInputs: 1 } : id === 'text' ? { text: defaultTextNodeText } : id === 'image-describer' ? { text: '', model: 'deepseek-flash', instructions: defaultInstructions, imageInputs: 1 } : id === 'model-input' ? { model: 'deepseek-flash' } : id === 'invert' || id === 'file' || id === 'preview' ? {} : { label: item.label, category: item.category };
  return { id: crypto.randomUUID(), type: item.nodeType, position, data, selected: true } as AppNode;
}
