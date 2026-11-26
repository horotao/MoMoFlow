import { Handle, Position, useEdges, useNodesData, useReactFlow, type NodeProps } from '@xyflow/react';
import { AlignLeft, AudioLines, Image as ImageIcon, Merge, Video } from 'lucide-react';
import { ImageNodeTitle } from '../components/image-prompt-node/ImageNodeTitle';
import { InputPortRing } from '../components/image-prompt-node/InputPortRing';
import { OutputPortIcon } from '../components/image-prompt-node/OutputPortIcon';
import { useMagneticPorts } from '../components/image-prompt-node/useMagneticPorts';
import { selectedImageResult } from './annotationGraph';
import { routedEdges, routerLabel, routerSize } from './router';
import type { CanvasAudio, CanvasImage, CanvasRouter, CanvasText, CanvasVideo } from './types';
import './CanvasRouterNode.css';

const labels = { sunburst: 'Image', text: 'Text', video: 'Video', audio: 'Audio' };
const icons = { sunburst: ImageIcon, text: AlignLeft, video: Video, audio: AudioLines };

export function CanvasRouterNode({ id, data, selected, isConnectable }: NodeProps<CanvasRouter>) {
  const edges = useEdges();
  const input = routedEdges(edges).find(edge => edge.target === id && edge.targetHandle === 'in');
  const source = useNodesData<CanvasImage | CanvasVideo | CanvasText | CanvasAudio>(input?.source ?? '');
  const type = source?.type && source.type in labels ? source.type : undefined;
  const Icon = type ? icons[type] : Merge;
  const image = source?.type === 'sunburst' && selectedImageResult(source)?.url;
  const video = source?.type === 'video' && source.data.asset?.url;
  const ports = useMagneticPorts();
  const { updateNodeData } = useReactFlow<CanvasRouter>();
  const connectable = isConnectable && !data.locked;
  return <section ref={ports.node} className={`image-node canvas-router${selected ? ' is-selected' : ''}${data.locked ? ' is-locked' : ''}`} style={routerSize}>
    <div className="image-node-card">
      <span className="canvas-router-icon" aria-hidden="true">
        {image ? <img src={image} alt="" draggable={false} /> : video ? <video src={video} muted playsInline preload="auto" />
          : <Icon size={14} className={type ? undefined : 'canvas-router-merge'} />}
      </span>
      <div className="canvas-router-copy">
        <ImageNodeTitle title={routerLabel(data)} editable={selected} locked={Boolean(data.locked)} onChange={label => updateNodeData(id, { label, labelEdited: true })} />
        <span className="canvas-router-kind">{type ? labels[type] : 'None'}</span>
      </div>
    </div>
    <div className="image-node-ports">
      <div className="image-node-inputs">
        <button ref={ports.input} type="button" data-connection-port="in" data-connected={Boolean(input)} className="image-node-input" disabled={!connectable} aria-label="路由输入端口">
          <InputPortRing />
          <Handle id="in" type="target" position={Position.Left} isConnectable={connectable} />
        </button>
      </div>
      <button ref={ports.output} type="button" data-connection-port="output" className="image-node-output" disabled={!connectable} aria-label="路由输出端口">
        <span className="image-node-output-visual"><OutputPortIcon /></span>
        <Handle id="out" type="source" position={Position.Right} isConnectable={connectable} />
      </button>
    </div>
  </section>;
}
