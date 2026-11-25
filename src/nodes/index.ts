import type { NodeTypes } from '@xyflow/react';
import { CanvasImageNode } from './CanvasImageNode';
import { CanvasTextNode } from './CanvasTextNode';
import { CanvasVideoNode } from './CanvasVideoNode';
import { CanvasAudioNode } from './CanvasAudioNode';
import { CanvasGroupNode } from './CanvasGroupNode';
import type { AppNode } from './types';

export const initialNodes: AppNode[] = [];
export const nodeTypes = { sunburst: CanvasImageNode, text: CanvasTextNode, video: CanvasVideoNode, audio: CanvasAudioNode, 'canvas-group': CanvasGroupNode } satisfies NodeTypes;
