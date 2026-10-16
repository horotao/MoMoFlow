import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { PromptVariableView } from './PromptVariableView';

export const PromptVariable = Node.create<{ resolve: (handleId: string) => string }>({
  name: 'promptVariable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions: () => ({ resolve: () => '' }),
  addAttributes: () => ({ handleId: { default: '' }, ownerId: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-prompt-variable]' }],
  renderHTML({ node }) {
    return ['span', { 'data-prompt-variable': '', 'data-handle-id': node.attrs.handleId }, this.options.resolve(node.attrs.handleId)];
  },
  renderText({ node }) { return this.options.resolve(node.attrs.handleId); },
  addNodeView() { return ReactNodeViewRenderer(PromptVariableView); },
});
