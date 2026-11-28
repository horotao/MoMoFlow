export const addNodeEntries = [
  { type: 'image', label: '图片', description: '生成和编辑图片', key: 'I' },
  { type: 'text', label: '文本', description: '生成文本与 Markdown', key: 'T' },
  { type: 'video', label: '视频', description: '生成和编辑视频', key: 'V' },
  { type: 'audio', label: '音频', description: '生成和编辑音频', key: 'A' },
  { type: 'router', label: '路由', description: '向下游转接输入', key: '' },
] as const;

export type AddNodeType = typeof addNodeEntries[number]['type'];
