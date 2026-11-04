import {
  Blend, Brush, CircleDashed, Contrast, Crop, FileInput, Image, Images,
  Layers, List, MapPin, MessageSquareText, Mic, Palette, PictureInPicture2,
  Repeat2, RotateCw, ScanText, SlidersHorizontal, Split, SquareDashed,
  StickyNote, Table2, TextCursorInput, Type, WandSparkles, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { items, libraryItemLabel } from './libraryCatalog';

export type NodeMenuEntry = {
  id: string;
  label: string;
  icon?: LucideIcon;
  brand?: string;
  tone?: 'image' | 'video' | 'audio' | 'utility';
  nodeId?: string;
  keywords?: string;
};
export type NodeMenuGroup = { label?: string; entries: NodeMenuEntry[] };
export type NodeMenuCategory = 'editing' | 'helpers';

const icons: Record<string, LucideIcon> = {
  text: TextCursorInput, file: FileInput, preview: Image, compare: PictureInPicture2,
  'image-describer': ScanText, 'model-input': List, 'position-logger': MapPin,
  'image-iterator': Images, 'text-iterator': Repeat2, router: Split,
  'color-palette': Palette, compositor: Layers, resize: SquareDashed,
  'rotate-flip': RotateCw, 'color-correction': SlidersHorizontal, levels: Contrast,
  invert: Contrast, blur: CircleDashed, crop: Crop, painter: Brush, blend: Blend,
  'matte-grow-shrink': SquareDashed, 'masks-extractor': WandSparkles,
};
const brands: Record<string, string> = { sunburst: 'openai', 'nano-banana': 'gemini', ideogram: 'ideogram' };

function node(id: string): NodeMenuEntry {
  const item = items.find(item => item.id === id && item.nodeType);
  if (!item) throw new Error(`Unknown menu node: ${id}`);
  return {
    id, nodeId: id, label: libraryItemLabel(item), keywords: `${id} ${item.label}`,
    icon: icons[id], brand: brands[id], tone: brands[id] ? 'image' : undefined,
  };
}
const group = (label: string, ids: string[]): NodeMenuGroup => ({ label, entries: ids.map(node) });
const seedance: NodeMenuEntry = { id: 'seedance', label: 'Seedance 2.0', brand: 'jimeng', tone: 'video' };
const lyria: NodeMenuEntry = { id: 'lyria', label: 'Lyria 3', brand: 'deepmind', tone: 'audio' };

export const nodeMenuCategories: Record<NodeMenuCategory, NodeMenuGroup[]> = {
  editing: [
    group('调色与质感', ['color-palette', 'color-correction', 'levels', 'invert', 'blur']),
    group('尺寸与变换', ['resize', 'rotate-flip', 'crop']),
    group('绘图与合成', ['painter', 'compositor', 'blend']),
    group('蒙版', ['masks-extractor', 'matte-grow-shrink']),
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
    { id: 'editing', label: '图像编辑节点', icon: SlidersHorizontal },
    { id: 'helpers', label: '辅助工具节点', icon: Wrench },
  ] },
  group('图像', ['sunburst', 'nano-banana', 'ideogram']),
  { label: '视频', entries: [seedance] },
  { label: '音频', entries: [lyria,
    { id: 'voiceover', label: '配音', icon: Mic, tone: 'audio' },
    { id: 'voice-change', label: '更换声音', icon: MessageSquareText, tone: 'audio' },
    { id: 'translate', label: '翻译', icon: Type, tone: 'audio' },
  ] },
  { label: '实用工具', entries: [
    { ...node('text'), id: 'utility-text', label: '文本', tone: 'utility', icon: Type },
    { id: 'note', label: '便签', icon: StickyNote, tone: 'utility' },
    { id: 'table', label: '表格', icon: Table2, tone: 'utility' },
  ] },
];

export const searchableNodeMenuEntries = items.filter(item => item.nodeType).map(item => node(item.id));
export const isNodeMenuCategory = (id: string | null): id is NodeMenuCategory => id === 'editing' || id === 'helpers';
