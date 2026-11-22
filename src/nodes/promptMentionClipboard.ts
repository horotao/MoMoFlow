import type { MentionEdit } from './promptMentions.ts';
import { validPromptMentions } from './promptMentionText.ts';

export const promptMentionClipboardType = 'application/x-momoflow-prompt+json';
export function encodePromptClipboard(edit: MentionEdit) {
  return JSON.stringify({ version: 1, prompt: edit.prompt, mentions: validPromptMentions(edit.prompt, edit.mentions) });
}
export function decodePromptClipboard(value: string, plain: string): MentionEdit | undefined {
  try {
    const data = JSON.parse(value);
    if (data?.version !== 1 || typeof data.prompt !== 'string' || data.prompt !== plain || !Array.isArray(data.mentions)) return;
    if (!data.mentions.every((item: unknown) => item && typeof item === 'object' && 'nodeId' in item && typeof item.nodeId === 'string')) return;
    const mentions = validPromptMentions(data.prompt, data.mentions);
    if (mentions.length !== data.mentions.length) return;
    return { prompt: data.prompt, mentions };
  } catch { return; }
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function promptClipboardHtml(edit: MentionEdit) {
  return `<div data-momoflow-prompt="${escapeHtml(encodePromptClipboard(edit))}" style="white-space:pre-wrap">${escapeHtml(edit.prompt)}</div>`;
}
