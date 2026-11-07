import { LockKeyhole } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Position, useReactFlow, useNodes, useEdges, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';

import { isFileNode } from './fileAsset';
import { fileAssets } from './fileCollection';
import { textVariableCount, variableHandleId, variableIndex } from './textVariables';
import type { Editor } from '@tiptap/react';
import { TextPromptEditor } from './TextPromptEditor';
import { TextNodeMenu } from './TextNodeMenu';
import { TextDisplaySelect } from './TextDisplaySelect';
import type { AppNode, TextNode as TextNodeType } from './types';
import { NodeFrame, NodeHeader } from './shared/NodeFrame';
import { NodePort } from './shared/NodePort';
import './TextNode.css';

function TextNodeIcon({ name }: { name: 'text' | 'more' | 'add' | 'chevron' | 'port-text' | 'port-text-connected' }) {
  return <img className={name.startsWith('port-') ? undefined : 'node-monochrome'}
    src={`/node-style/${name}.svg`} alt="" draggable={false} />;
}

export function TextNode({ id, data, isConnectable }: NodeProps<TextNodeType>) {
  const { updateNodeData } = useReactFlow<AppNode>();

  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const cancelRename = useRef(false);
  useEffect(() => { if (renaming) { renameRef.current?.focus(); renameRef.current?.select(); } }, [renaming]);
  const nodes = useNodes<AppNode>();
  const edges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();
  const node = nodes.find((item) => item.id === id)!;
  const variableCount = textVariableCount(node, edges);
  const displayMode = data.displayMode ?? 'source-value';
  const inputs = edges.filter((edge) => edge.target === id);
  const outputConnected = edges.some((edge) => edge.source === id);
  const editorRef = useRef<Editor | null>(null);
  const connectedVariables = inputs.slice().sort((a, b) => variableIndex(a.targetHandle) - variableIndex(b.targetHandle));

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, variableCount, updateNodeInternals]);

  return (
    <NodeFrame className="text-node-frame" style={{ minHeight: Math.max(395, 121 + (variableCount - 1) * 60) }}>
      <NodeHeader icon={<TextNodeIcon name="text" />} title={
          renaming ? <input ref={renameRef} className="text-node-rename nodrag nopan" aria-label="节点名称"
            value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (!cancelRename.current && title.trim()) updateNodeData(id, { label: title.trim() });
              setRenaming(false);
            }} onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') { cancelRename.current = true; event.currentTarget.blur(); }
            }} /> : <span>{data.label || '提示词'}</span>}
        status={data.locked && <LockKeyhole size={12} aria-label="已锁定" />}
        actions={<TextNodeMenu id={id} appearance="shared" locked={Boolean(data.locked)} onRename={() => {
          cancelRename.current = false; setTitle(data.label || '提示词'); setRenaming(true);
        }}><TextNodeIcon name="more" /></TextNodeMenu>} />
      <div className="text-node-content">
        <TextPromptEditor id={id} data={data} editorRef={editorRef}
          handles={connectedVariables.map((edge) => variableHandleId(variableIndex(edge.targetHandle)))} />
      </div>
      <footer className="text-node-footer">
        <button className="text-node-button text-node-add nodrag nopan" type="button" disabled={data.locked} title="添加变量" onClick={() => {
          updateNodeData(id, { variableCount: variableCount + 1 });
          editorRef.current?.chain().focus().insertContent([
            { type: 'promptVariable', attrs: { handleId: variableHandleId(variableCount), ownerId: id } },
            { type: 'text', text: ' ' },
          ]).run();
        }}>
          <span className="text-node-add-icon"><TextNodeIcon name="add" /></span>添加变量
        </button>
        {variableCount > 0 && <TextDisplaySelect appearance="shared" disabled={data.locked}
          value={displayMode} onChange={(mode) => updateNodeData(id, { displayMode: mode })}>
          <TextNodeIcon name="chevron" />
        </TextDisplaySelect>}
      </footer>
      {Array.from({ length: Math.max(1, variableCount) }, (_, index) => {
        const connected = inputs.some((edge) => variableIndex(edge.targetHandle) === index);
        const invalid = inputs.some((edge) => {
          const source = nodes.find((node) => node.id === edge.source);
          return variableIndex(edge.targetHandle) === index && source && isFileNode(source) && fileAssets(source.data).length > 0;
        });
        return (
          <NodePort key={variableHandleId(index)} label={`Variable ${index + 1}`} invalid={invalid}
            title={invalid ? 'Incompatible types: this input accepts text, not media.' : undefined}
            id={variableHandleId(index)} type="target" position={Position.Left} top={89 + index * 60}
            isConnectable={isConnectable}>
            <TextNodeIcon name={connected ? 'port-text-connected' : 'port-text'} />
          </NodePort>
        );
      })}
      <NodePort label="Prompt" type="source" position={Position.Right} isConnectable={isConnectable}>
        <TextNodeIcon name={outputConnected ? 'port-text-connected' : 'port-text'} />
      </NodePort>
    </NodeFrame>
  );
}
