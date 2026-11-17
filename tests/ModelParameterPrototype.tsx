import { useId, useState, type ReactNode } from 'react';
import { GptSettingsSelect } from '../src/components/GptSettingsSelect';
import { GptSettingsSegments } from '../src/components/GptSettingsSegments';
import { GptRunCount } from '../src/components/GptRunCount';
import { apimartAspectRatios, sunburstResolutions } from '../src/nodes/sunburst';
import '../src/index.css';
import './model-parameter-prototype.css';
import infoIcon from './fixtures/model-parameter-prototype/info.svg';

function SelectField({ label, choices, labels, initial }: {
  label: string; choices: readonly string[]; labels?: readonly string[]; initial: string;
}) {
  const [value, setValue] = useState(initial);
  return <div className="prototype-field">
    <span className="prototype-label">{label}</span>
    <GptSettingsSelect label={label} choices={choices} labels={labels} value={value} onChange={setValue} />
  </div>;
}

function SegmentedField({ label, choices, hint }: { label: string; choices: readonly string[]; hint?: ReactNode }) {
  const [value, setValue] = useState(choices[0]);
  return <div className="prototype-field">
    <div className="prototype-label">{label}{hint}</div>
    <GptSettingsSegments label={label} choices={choices} value={value} onChange={setValue} />
  </div>;
}

function FormatHint() {
  const id = useId();
  return (
    <span className="prototype-hint">
      <button type="button" aria-label="格式说明" aria-describedby={id}>
        <img src={infoIcon} width="11" height="11" alt="" />
      </button>
      <span id={id} role="tooltip">PNG 保留透明度；JPEG 适合照片；GIF 支持动图。</span>
    </span>
  );
}

export function ModelParameterPrototype() {
  const [runs, setRuns] = useState(1);
  const [submitted, setSubmitted] = useState<number | null>(null);

  return (
    <main className="model-prototype">
      <div className="prototype-workspace">
        <p>GPT Image 2.6 · 隔离原型</p>
        <p role="status">{submitted === null ? '仅预览参数交互，运行使用模拟结果。' : `已模拟提交 ${submitted} 次运行。`}</p>
      </div>
      <aside className="prototype-sidebar" aria-labelledby="model-parameter-title" data-settings-select-host>
        <header className="prototype-header">
          <img src="/gpt-sidebar/settings-brand.svg" width="18" height="18" alt="" />
          <h1 id="model-parameter-title">GPT Image 2.6</h1>
        </header>
        <div className="prototype-fields node-settings-fields">
          <SelectField label="渠道商" choices={['APIMart', 'OpenAI']} initial="APIMart" />
          <SelectField label="渠道模型" choices={['GPT Image 2.6 EXT', 'GPT Image 2.6']} initial="GPT Image 2.6 EXT" />
          <SegmentedField label="模型版本" choices={['Sunburst', 'Flare']} />
          <SelectField label="画质" choices={['auto', 'low', 'medium', 'high', 'xhigh', 'max']}
            labels={['自动', '低', '中', '高', '极高', '最高']} initial="medium" />
          <SelectField label="宽高比" choices={apimartAspectRatios}
            labels={['自动', ...apimartAspectRatios.slice(1)]} initial="auto" />
          <SegmentedField label="分辨率" choices={sunburstResolutions} />
          <SegmentedField label="输出格式" choices={['PNG', 'JPEG', 'GIF']} hint={<FormatHint />} />
        </div>
        <footer className="prototype-footer">
          <GptRunCount value={runs} onChange={setRuns} />
          <div className="prototype-cost"><span>总费用</span><span>按实际用量计费</span></div>
          <button type="button" className="prototype-run" onClick={() => setSubmitted(runs)}>
            <img src="/gpt-sidebar/settings-run.svg" width="22" height="22" alt="" />
            运行选中节点
          </button>
        </footer>
      </aside>
    </main>
  );
}
