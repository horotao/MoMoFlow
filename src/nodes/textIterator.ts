export const textIteratorLimit = 50;
export const textIteratorTextLimit = 32000;
export type TextIteratorItem = { id: string; text: string };
export type TextIteratorData = { label?: string; locked?: boolean; items: TextIteratorItem[] };
export type TextIteration = { kind?: 'text'; nodeId: string; itemId: string; index: number; total: number; text: string };

export const newTextIteratorItem = (text = ''): TextIteratorItem => ({ id: crypto.randomUUID(), text });
export const defaultTextIteratorData = (): TextIteratorData => ({ items: [newTextIteratorItem()] });

// A connected text is one item, including its line breaks. Only an explicit
// JSON array expands into several items; never split a multiline prompt.
export function parseIteratorText(text: string): TextIteratorItem[] {
  let values: unknown = [text];
  if (text.trim().startsWith('[')) {
    try { values = JSON.parse(text); } catch { throw new Error('输入的数组格式无效，请使用 JSON 文本数组。'); }
  }
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new Error('数组中的每一项都必须是文本。');
  if (values.length > textIteratorLimit) throw new Error(`最多支持 ${textIteratorLimit} 条文本。`);
  return values.map((value: string, index) => ({ id: `input-${index}`, text: value }));
}

export function validateIteratorItems(items: TextIteratorItem[]): void {
  if (!items.length) throw new Error('请至少添加一条文本。');
  if (items.length > textIteratorLimit) throw new Error(`最多支持 ${textIteratorLimit} 条文本。`);
  for (const [index, item] of items.entries()) {
    if (!item.text.trim()) throw new Error(`第 ${index + 1} 条文本为空，请填写或删除。`);
    if (item.text.length > textIteratorTextLimit) throw new Error(`第 ${index + 1} 条文本超过 ${textIteratorTextLimit} 个字符。`);
  }
}

export function readTextIteratorData(value: unknown): TextIteratorData | undefined {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)
    || value.items.length > textIteratorLimit) return;
  const ids = new Set<string>();
  const items: TextIteratorItem[] = [];
  for (const item of value.items as unknown[]) {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id
      || ids.has(item.id) || !('text' in item) || typeof item.text !== 'string' || item.text.length > textIteratorTextLimit) return;
    ids.add(item.id); items.push({ id: item.id, text: item.text });
  }
  return { items, label: 'label' in value && typeof value.label === 'string' ? value.label : undefined, locked: 'locked' in value && value.locked === true };
}
