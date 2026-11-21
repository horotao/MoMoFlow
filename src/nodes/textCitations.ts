import type { TextCitation } from './types.ts';

/** Only complete, non-overlapping HTTP(S) citations can become clickable links. */
export function textCitations(value: unknown, text: string): TextCitation[] {
  if (!Array.isArray(value)) return [];
  const candidates: TextCitation[] = [];
  for (const item of value.slice(0, 256)) {
    if (!item || typeof item !== 'object') continue;
    const { url, title, startIndex, endIndex } = item;
    if (typeof url !== 'string' || url.length > 4096 || typeof title !== 'string'
      || !Number.isInteger(startIndex) || !Number.isInteger(endIndex) || startIndex < 0 || endIndex <= startIndex || endIndex > text.length) continue;
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) continue;
      candidates.push({ url: parsed.href, title: title.slice(0, 512), startIndex, endIndex });
    } catch { /* Invalid provider annotations remain plain text. */ }
  }
  const result: TextCitation[] = [];
  for (const citation of candidates.sort((a, b) => a.startIndex - b.startIndex)) {
    if (!result.length || citation.startIndex >= result[result.length - 1].endIndex) result.push(citation);
  }
  return result;
}

export function textCitationParts(text: string, citations?: readonly TextCitation[]) {
  const parts: { text: string; citation?: TextCitation; index?: number }[] = [];
  let offset = 0;
  for (const [index, citation] of textCitations(citations, text).entries()) {
    parts.push({ text: text.slice(offset, citation.startIndex) }, { text: `[${index + 1}]`, citation, index });
    offset = citation.endIndex;
  }
  parts.push({ text: text.slice(offset) });
  return parts;
}

/** Preserve real source URLs in Markdown previews and downstream Text inputs. */
export function textWithCitations(text: string, citations?: readonly TextCitation[]) {
  return textCitationParts(text, citations).map(part => part.citation
    ? `[${part.text}](<${part.citation.url.replace(/</g, '%3C').replace(/>/g, '%3E')}>)` : part.text).join('');
}
