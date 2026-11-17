import { useContext, useEffect, useRef, type MutableRefObject } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { isHistoryTransaction } from '@tiptap/pm/history';
import { Slice } from '@tiptap/pm/model';
import { useReactFlow, type Edge } from '@xyflow/react';
import { PromptAnnotationEdits } from './promptAnnotationEdits';
import { annotationInputs } from './interactiveEdit';
import { PromptVariable } from './promptVariable';
import { documentText, hasVariable, initialTextDocument, textToDocument } from './textDocument';
import { resolveTextInput, textInputHandle } from './textVariables';
import { suggestedTextNodeText } from './defaults';
import type { AppNode, TextNode } from './types';

export function TextPromptEditor({ id, data, handles, editorRef }: {
  id: string;
  data: TextNode['data'];
  handles: string[];
  editorRef: MutableRefObject<Editor | null>;
}) {
  const { getNodes, getEdges, updateNodeData, updateNode } = useReactFlow<AppNode>();
  const previousHandles = useRef(new Set(handles));
  const applyAnnotationEdit = useContext(PromptAnnotationEdits);
  const removedEdges = useRef(new Map<string, Edge>());
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false, bold: false, bulletList: false, code: false, codeBlock: false,
        heading: false, horizontalRule: false, italic: false, link: false, listItem: false,
        listKeymap: false, orderedList: false, strike: false, underline: false, trailingNode: false,
      }),
      Placeholder.configure({ placeholder: suggestedTextNodeText, showOnlyWhenEditable: true }),
      PromptVariable.configure({
        resolve: (handleId) => {
          const input = getEdges().find((edge) => edge.target === id && textInputHandle(edge.targetHandle) === textInputHandle(handleId));
          return input ? resolveTextInput(input, getNodes(), getEdges()) : '';
        },
      }),
    ],
    content: data.content ?? initialTextDocument(data.text, handles, id),
    editorProps: {
      attributes: {
        class: 'text-node-editor', role: 'textbox', 'aria-label': '文本节点内容',
        'aria-multiline': 'true', spellcheck: 'false',
      },
      handleKeyDown: (view, event) => {
        if (event.isComposing || view.composing) return false;
        if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
          && view.state.doc.textContent === '' && view.state.doc.childCount === 1
          && view.state.doc.firstChild?.childCount === 0) {
          const content = view.state.schema.nodeFromJSON(textToDocument(suggestedTextNodeText));
          view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, content.content));
          return true;
        }
        if (event.key === 'Escape') {
          view.dom.blur();
          updateNode(id, { selected: false });
          return true;
        }
        return false;
      },
      // Paste text, not foreign graph references or external HTML formatting.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        if (text === undefined) return false;
        const content = view.state.schema.nodeFromJSON(textToDocument(text));
        view.dispatch(view.state.tr.replaceSelection(new Slice(content.content, 1, 1)).scrollIntoView());
        return true;
      },
    },
    onCreate: ({ editor: current }) => {
      const content = current.getJSON();
      updateNodeData(id, { content, text: documentText(content) });
    },
    onUpdate: ({ editor: current, transaction }) => {
      const content = current.getJSON();
      if (applyAnnotationEdit) {
        const before = transaction.before.toJSON();
        const removedHandles = new Set(annotationInputs.filter(handle => hasVariable(before, handle) && !hasVariable(content, handle)));
        const restoreEdges = isHistoryTransaction(transaction) ? [...removedEdges.current].flatMap(([handle, edge]) =>
          !hasVariable(before, handle) && hasVariable(content, handle) ? [edge] : []) : [];
        if (removedHandles.size || restoreEdges.length) {
          const disconnected = applyAnnotationEdit({ nodeId: id, content, removedHandles, restoreEdges });
          for (const handle of removedHandles) removedEdges.current.delete(handle);
          for (const edge of disconnected) if (edge.targetHandle) removedEdges.current.set(edge.targetHandle, edge);
          return;
        }
      }
      updateNodeData(id, { content, text: documentText(content) });
    },
  });

  useEffect(() => { editor?.setEditable(!data.locked); }, [editor, data.locked]);

  useEffect(() => {
    editorRef.current = editor;
    return () => { editorRef.current = null; };
  }, [editor, editorRef]);

  useEffect(() => {
    if (!editor || !data.content || JSON.stringify(data.content) === JSON.stringify(editor.getJSON())) return;
    editor.commands.setContent(data.content, { emitUpdate: false });
  }, [editor, data.content]);

  useEffect(() => {
    if (!editor) return;
    const added = handles.filter((handleId) => !previousHandles.current.has(handleId));
    previousHandles.current = new Set(handles);
    for (const handleId of added) {
      if (!hasVariable(editor.getJSON(), handleId)) {
        editor.commands.insertContentAt(editor.state.selection.to, [
          { type: 'promptVariable', attrs: { handleId, ownerId: id } },
          { type: 'text', text: ' ' },
        ]);
      }
    }
  }, [editor, handles, id]);

  return <div className="text-node-editor-host nodrag nopan nowheel"
    onKeyDown={(event) => event.stopPropagation()}>
    <EditorContent editor={editor} className="text-node-editor-content" />
    <div className="text-node-suggestion" aria-hidden="true">
      {suggestedTextNodeText.replace(/\n/g, '')}<kbd>Tab</kbd>
    </div>
  </div>;
}
