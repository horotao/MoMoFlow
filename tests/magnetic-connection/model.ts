import type { Connection, Edge, Node, XYPosition } from '@xyflow/react';

export const colors = { text: '#d8abfc', image: '#d1df83', number: '#a9c8ec' };
export type PortKind = keyof typeof colors;
export type Port = { id: string; label: string; kind: PortKind; side: 'source' | 'target'; y: number };
export type DemoNode = Node<{ title: string; caption: string; content: 'text' | 'image' | 'number' | 'mixer' | 'preview'; ports: Port[] }, 'magnetic'>;
export type CableImpact = { id: string; point: XYPosition; zoom: number; velocity: number; speed: number; rigidity: number };
export type DemoEdge = Edge<{ release?: { id: string; velocity: number; reverse: boolean; speed: number; rigidity: number; range: number }; impact?: CableImpact }, 'magnetic'>;

export const initialNodes: DemoNode[] = [
  { id: 'text', type: 'magnetic', position: { x: 100, y: 160 }, data: { title: 'Text', caption: '提示词', content: 'text', ports: [{ id: 'text-out', label: 'Text', kind: 'text', side: 'source', y: 90 }] } },
  { id: 'image', type: 'magnetic', position: { x: 100, y: 410 }, data: { title: 'Image', caption: '参考图像', content: 'image', ports: [{ id: 'image-out', label: 'Image', kind: 'image', side: 'source', y: 112 }] } },
  { id: 'number', type: 'magnetic', position: { x: 450, y: 70 }, data: { title: 'Number', caption: '参数', content: 'number', ports: [{ id: 'number-out', label: 'Number', kind: 'number', side: 'source', y: 84 }] } },
  { id: 'mixer', type: 'magnetic', position: { x: 610, y: 345 }, data: { title: 'Mixer', caption: '把相同颜色的端口连接起来', content: 'mixer', ports: [
    { id: 'image-in', label: 'Image', kind: 'image', side: 'target', y: 76 },
    { id: 'text-in', label: 'Text', kind: 'text', side: 'target', y: 136 },
    { id: 'number-in', label: 'Number', kind: 'number', side: 'target', y: 196 },
    { id: 'image-out', label: 'Image', kind: 'image', side: 'source', y: 136 },
  ] } },
  { id: 'preview', type: 'magnetic', position: { x: 1060, y: 370 }, data: { title: 'Preview', caption: '连线交互演示', content: 'preview', ports: [{ id: 'image-in', label: 'Image', kind: 'image', side: 'target', y: 112 }] } },
];

export const initialEdges: DemoEdge[] = [{ id: 'mixer-preview', source: 'mixer', sourceHandle: 'image-out', target: 'preview', targetHandle: 'image-in', style: { stroke: colors.image } }];

export function findPort(nodeId: string, handleId: string | null | undefined) {
  return initialNodes.find(node => node.id === nodeId)?.data.ports.find(port => port.id === handleId);
}

export function canConnect(connection: Connection | Edge) {
  const source = findPort(connection.source, connection.sourceHandle);
  const target = findPort(connection.target, connection.targetHandle);
  return connection.source !== connection.target && source?.side === 'source' && target?.side === 'target' && source.kind === target.kind;
}
