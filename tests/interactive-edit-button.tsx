import { createRoot } from 'react-dom/client';
import { InteractiveEditButton } from '../src/nodes/shared/InteractiveEditButton';
import { NodeFrame, NodeHeader } from '../src/nodes/shared/NodeFrame';
import sampleUrl from './fixtures/image-node-1.png';
import '../src/index.css';
import '../src/nodes/shared/mediaNodeStyle.css';
import './interactive-edit-button.css';

createRoot(document.getElementById('root')!).render(
  <main className="interactive-edit-button-preview">
    <NodeFrame className="media-node-frame">
      <NodeHeader
        icon={<img src="/image-node/brand.svg" width={16} height={16} alt="" className="node-monochrome" />}
        title="GPT Image 2.6"
        actions={null}
      />
      <img className="interactive-edit-button-sample" src={sampleUrl} width={1536} height={1152} alt="示例图片" />
      <div className="interactive-edit-button-actions">
        <InteractiveEditButton />
      </div>
    </NodeFrame>
  </main>,
);
