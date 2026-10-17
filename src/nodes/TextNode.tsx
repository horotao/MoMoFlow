import { LockKeyhole } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, useNodes, useEdges, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';

import { isFileNode } from './fileAsset';
import { fileAssets } from './fileCollection';
import { textVariableCount, variableHandleId, variableIndex } from './textVariables';
import type { Editor } from '@tiptap/react';
import { TextPromptEditor } from './TextPromptEditor';
import { TextNodeMenu } from './TextNodeMenu';
import { TextDisplaySelect } from './TextDisplaySelect';
import type { AppNode, TextNode as TextNodeType } from './types';

function TextNodeIcon({ name }: { name: 'text' | 'more' | 'add' | 'chevron' | 'port' | 'port-connected' }) {
  return (
    <span className={`text-node-icon text-node-icon-${name}`} aria-hidden="true">
      <img className="text-node-icon-light" src={`/text-node/${name}-light.svg`} alt="" draggable={false} />
      <img className="text-node-icon-dark" src={`/text-node/${name}-dark.svg`} alt="" draggable={false} />
    </span>
  );
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
    <>
      <header className="text-node-header">
        <div className="text-node-title"><TextNodeIcon name="text" />
          {renaming ? <input ref={renameRef} className="text-node-rename nodrag nopan" aria-label="节点名称"
            value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (!cancelRename.current && title.trim()) updateNodeData(id, { label: title.trim() });
              setRenaming(false);
            }} onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') { cancelRename.current = true; event.currentTarget.blur(); }
            }} /> : <span>{data.label || 'Prompt'}</span>}
          {data.locked && <LockKeyhole size={12} aria-label="已锁定" />}
        </div>
        <TextNodeMenu id={id} locked={Boolean(data.locked)} onRename={() => {
          cancelRename.current = false; setTitle(data.label || 'Prompt'); setRenaming(true);
        }}><TextNodeIcon name="more" /></TextNodeMenu>
      </header>
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
          <TextNodeIcon name="add" />添加变量
        </button>
        {variableCount > 0 && <TextDisplaySelect value={displayMode} onChange={(mode) => updateNodeData(id, { displayMode: mode })}>
          <TextNodeIcon name="chevron" />
        </TextDisplaySelect>}
      </footer>
      {Array.from({ length: variableCount }, (_, index) => {
        const connected = inputs.some((edge) => variableIndex(edge.targetHandle) === index);
        const invalid = inputs.some((edge) => {
          const source = nodes.find((node) => node.id === edge.source);
          return variableIndex(edge.targetHandle) === index && source && isFileNode(source) && fileAssets(source.data).length > 0;
        });
        return (
          <Fragment key={variableHandleId(index)}>
            <span className="text-node-port-label text-node-port-label-input" style={{ top: 66 + index * 60 }}>Variable {index + 1}</span>
            <Handle className={`text-node-port${invalid ? ' is-type-error' : ''}`} title={invalid ? 'Incompatible types: this input accepts text, not media.' : undefined} id={variableHandleId(index)} type="target" position={Position.Left}
              style={{ top: 89 + index * 60 }} isConnectable={isConnectable && !connected} aria-label={`Variable ${index + 1}`}>
              <TextNodeIcon name={connected ? 'port-connected' : 'port'} />
            </Handle>
          </Fragment>
        );
      })}
      <span className="text-node-port-label text-node-port-label-output">Prompt</span>
      <Handle className="text-node-port" type="source" position={Position.Right} isConnectable={isConnectable}>
        <TextNodeIcon name={outputConnected ? 'port-connected' : 'port'} />
      </Handle>
    </>
  );
}
