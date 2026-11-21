import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Element, Root, RootContent, Text } from 'hast';
import type { TextCitation } from '../../nodes/types';
import { textCitationParts, textWithCitations } from '../../nodes/textCitations';

const words = (text: string) => text.split(/(\s+)/u).filter(Boolean);

// Stable word positions let appended words fade in without replaying the
// already readable prefix. Code blocks keep their literal text and formatting.
function rehypeTextOutput({ reveal, streaming }: { reveal: boolean; streaming: boolean }) {
  return (root: Root) => {
    let last: Element | undefined;
    function visit(parent: Root | Element) {
      if (parent.type === 'element' && parent.tagName === 'pre') { last = undefined; return; }
      parent.children = parent.children.flatMap((child): RootContent[] => {
        if (child.type === 'element') {
          if (child.tagName === 'code') last = parent.type === 'element' ? parent : undefined;
          else visit(child);
        }
        if (child.type !== 'text' || !child.value.trim()) return [child];
        if (parent.type === 'element') last = parent;
        return reveal ? words(child.value).map((value): Text | Element => /^\s+$/u.test(value)
          ? { type: 'text', value }
          : { type: 'element', tagName: 'span', properties: { className: ['text-node-stream-word'] }, children: [{ type: 'text', value }] }) : [child];
      });
    }
    visit(root);
    if (streaming) {
      const cursor: Element = { type: 'element', tagName: 'span', properties: { className: ['text-node-output-cursor'], ariaHidden: 'true' }, children: [] };
      (last ?? root).children.push(cursor);
    }
  };
}

/** Key by result/run ID: history reads stay immediate; only a live run reveals. */
export const TextOutput = memo(function TextOutput({ text, citations, format, streaming, reveal = streaming }: {
  text: string; citations?: TextCitation[]; format: 'txt' | 'md'; streaming: boolean; reveal?: boolean;
}) {
  if (format === 'md' && text) return <div className="text-node-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeTextOutput, { reveal, streaming }]]}
      components={{ a: ({ href, children, title }) => <a className="nodrag nopan" href={href} title={title} target="_blank" rel="noopener noreferrer"
        onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>{children}</a> }}>
      {textWithCitations(text, citations)}
    </ReactMarkdown>
  </div>;
  return <div className="text-node-output-source">
    {textCitationParts(text, citations).map((part, partIndex) => part.citation
      ? <a key={`citation-${partIndex}`} className="text-node-citation nodrag nopan" href={part.citation.url} title={part.citation.title}
        target="_blank" rel="noopener noreferrer" aria-label={`来源 ${part.index! + 1}：${part.citation.title}`}
        onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>{part.text}</a>
      : reveal ? words(part.text).map((word, index) => /^\s+$/u.test(word) ? word : <span key={`${partIndex}-${index}`} className="text-node-stream-word">{word}</span>) : part.text)}
    {streaming && <span className="text-node-output-cursor" data-empty={!text || undefined} aria-hidden="true" />}
  </div>;
});
