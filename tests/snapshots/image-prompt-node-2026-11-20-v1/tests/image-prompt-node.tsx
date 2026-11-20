import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ImagePromptNode } from '../components/image-prompt-node/ImagePromptNode';
import { ImagePromptToolbar } from '../components/image-prompt-node/ImagePromptToolbar';
import type { ImagePromptGenerationState } from '../components/image-prompt-node/ImagePromptGeneration';
import { AddNodeMenuPreview } from './AddNodeMenuPreview';
import { ImageConnectionsPreview } from './ImageConnectionsPreview';
import './image-prompt-node.css';

const options = new URLSearchParams(window.location.search);
const generationPreview = new URL('./generation-preview.png', import.meta.url).href;
const historyPreviews = [
  new URL('./history-preview-1.webp', import.meta.url).href,
  new URL('./history-preview-2.webp', import.meta.url).href,
];
const previewScale = Math.max(.25, Math.min(1.5, Number(options.get('scale')) || 1));
const examplePrompt = 'Beauty close-up, dewy, soft light';
const initialHistoryCount = options.has('complete') ? Math.max(1, Math.min(20, Math.trunc(Number(options.get('history'))) || 1)) : 0;

export function SnapshotPreview() {
  const [prompt, setPrompt] = useState(options.has('long') ? Array.from({ length: 30 }, () => examplePrompt).join('\n') : options.has('generating') || options.has('complete') ? examplePrompt : '');
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState(false);
  const [locked, setLocked] = useState(false);
  const [generation, setGeneration] = useState<ImagePromptGenerationState | null>(() => options.has('generating') ? {
    id: 'preview',
    startedAt: options.has('fallback') ? undefined : Date.now() - Math.max(0, Number(options.get('elapsed')) || 0) * 1000,
    estimatedSeconds: 25,
    progress: options.has('progress') ? Number(options.get('progress')) : undefined,
  } : null);
  const [completed, setCompleted] = useState(options.has('complete'));
  const [history, setHistory] = useState<{ id: number; prompt: string; pending: boolean; src: string }[]>(() => Array.from({ length: initialHistoryCount }, (_, id) => ({
    id, prompt: examplePrompt, pending: false, src: historyPreviews[id % historyPreviews.length],
  })));
  const [activeVariant, setActiveVariant] = useState(Math.max(0, initialHistoryCount - 1));
  const preparationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => {
    clearTimeout(preparationTimer.current);
    clearTimeout(completionTimer.current);
  }, []);

  function runLocalDemo(request: { prompt: string; quantity: number }) {
    clearTimeout(preparationTimer.current);
    clearTimeout(completionTimer.current);
    const id = Date.now();
    const pending = Array.from({ length: request.quantity }, (_, index) => ({ id: id + index, prompt: request.prompt, pending: true, src: generationPreview }));
    setHistory(current => [...current, ...pending]);
    setActiveVariant(history.length);
    setSelected(false);
    setGeneration({ id, estimatedSeconds: 25 });
    preparationTimer.current = setTimeout(() => setGeneration({ id, startedAt: Date.now(), estimatedSeconds: 25 }), 900);
    const duration = Number(options.get('demoDuration'));
    completionTimer.current = setTimeout(() => {
      setGeneration(null);
      setCompleted(!options.has('returnToPrompt'));
      setHistory(current => current.map(item => pending.some(next => next.id === item.id) ? { ...item, pending: false } : item));
    }, Number.isFinite(duration) && duration > .9 ? duration * 1000 : 25900);
  }

  const activeHistory = history[activeVariant];
  const result = completed && !activeHistory?.pending ? <img src={activeHistory?.src ?? generationPreview} alt="Generated preview" /> : undefined;
  const visibleGeneration = history.length === 0 || history[activeVariant]?.pending ? generation : null;
  const variants = history.map(item => ({ id: item.id, pending: item.pending, thumbnail: item.pending ? undefined : <img src={item.src} alt="" /> }));
  function selectVariant(index: number) {
    setActiveVariant(index);
    setPrompt(history[index].prompt);
  }

  return <main className="prototype-stage" onPointerDown={event => {
    if (event.target === event.currentTarget || (event.target instanceof Element && event.target.classList.contains('prototype-context-target'))) {
      setSelected(false);
      (document.activeElement as HTMLElement)?.blur();
    }
  }}>
    <AddNodeMenuPreview initiallyOpen={options.has('addnode')} />
    {!options.has('addnode') && <div className="prototype-node-mount" style={{ transform: `scale(${previewScale})` }}>
    {options.has('toolbar')
      ? <ImagePromptToolbar locked={locked} onLockedChange={setLocked} />
      : options.has('uncontrolled') ? <ImagePromptNode generation={visibleGeneration} result={result} onGenerate={runLocalDemo} /> : <ImagePromptNode prompt={prompt} onPromptChange={setPrompt}
        quantity={quantity} onQuantityChange={setQuantity}
        selected={selected} onSelectedChange={setSelected}
        locked={locked} onLockedChange={setLocked}
        generation={visibleGeneration} result={result} variants={variants} activeVariant={activeVariant} onVariantChange={selectVariant} onGenerate={runLocalDemo} />}
    </div>}
  </main>;
}

const existingRoot = import.meta.hot?.data.root as Root | undefined;
const root = existingRoot ?? createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(options.has('connections') ? <ImageConnectionsPreview /> : <SnapshotPreview />);
