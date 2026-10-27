import {
  AiImageIcon, ArrowExpand01Icon, AudioWave01Icon, BlendIcon, BlurIcon,
  ChartHistogramIcon, ChatGptIcon, ContrastIcon, CropIcon, CubeIcon,
  CursorMagicSelection03Icon, ExpandIcon, File01Icon, FilterHorizontalIcon,
  Image02Icon, ImportIcon, Layers01Icon, Location01Icon, PaintBoardIcon,
  PaintBrush01Icon, PlaySquareIcon, Rotate01Icon, Route01Icon, SearchVisualIcon,
  SlidersVerticalIcon, SquareSplitHorizontalIcon, TextIcon, ViewIcon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';
import type { OutputKind } from './router';

export const nodeIcons = {
  'matte-grow-shrink': ExpandIcon,
  'masks-extractor': CursorMagicSelection03Icon,
  router: Route01Icon,
  'color-palette': PaintBoardIcon,
  compositor: Layers01Icon,
  text: TextIcon,
  'image-describer': SearchVisualIcon,
  file: ImportIcon,
  preview: ViewIcon,
  compare: SquareSplitHorizontalIcon,
  blend: BlendIcon,
  'model-input': FilterHorizontalIcon,
  'position-logger': Location01Icon,
  sunburst: ChatGptIcon,
  resize: ArrowExpand01Icon,
  'rotate-flip': Rotate01Icon,
  'color-correction': SlidersVerticalIcon,
  levels: ChartHistogramIcon,
  invert: ContrastIcon,
  blur: BlurIcon,
  crop: CropIcon,
  painter: PaintBrush01Icon,
  'nano-banana': AiImageIcon,
} satisfies Record<string, IconSvgElement>;

export const routerIcons: Record<OutputKind, IconSvgElement> = {
  text: nodeIcons.text,
  image: Image02Icon,
  mask: Image02Icon,
  video: PlaySquareIcon,
  audio: AudioWave01Icon,
  '3d': CubeIcon,
  file: File01Icon,
};
