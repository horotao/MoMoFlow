import { ChatGptIcon, ImportIcon, TextIcon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';
import { nanoBananaBrandIcon, seedreamBrandIcon } from './modelBrandIcons';

export const nodeIcons = {
  text: TextIcon,
  file: ImportIcon,
  sunburst: ChatGptIcon,
  'nano-banana': nanoBananaBrandIcon,
  seedream: seedreamBrandIcon,
} satisfies Record<string, IconSvgElement>;
