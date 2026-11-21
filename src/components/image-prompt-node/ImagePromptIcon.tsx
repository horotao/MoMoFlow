import './image-prompt-shared.css';

const icons = {
  'ratio-auto': new URL('./assets/ratio-auto.svg', import.meta.url).href,
  'model-openai': new URL('./assets/model-openai.svg', import.meta.url).href,
  'search': new URL('./assets/search.svg', import.meta.url).href,
  'info': new URL('./assets/info.svg', import.meta.url).href,
  'pin': new URL('./assets/pin.svg', import.meta.url).href,
  'pin-off': new URL('./assets/pin-off.svg', import.meta.url).href,
  'close': new URL('./assets/close.svg', import.meta.url).href,
  'check': new URL('./assets/check.svg', import.meta.url).href,
  'model-text': new URL('./assets/model-text.svg', import.meta.url).href,
  'model-image': new URL('./assets/model-image.svg', import.meta.url).href,
  'bytedance': new URL('./assets/bytedance.svg', import.meta.url).href,
  'chevron': new URL('./assets/chevron.svg', import.meta.url).href,
  'comment': new URL('./assets/comment.svg', import.meta.url).href,
  'download': new URL('./assets/download.svg', import.meta.url).href,
  'enhance': new URL('./assets/enhance.svg', import.meta.url).href,
  'folder': new URL('./assets/folder.svg', import.meta.url).href,
  'generate': new URL('./assets/generate.svg', import.meta.url).href,
  'hash': new URL('./assets/hash.svg', import.meta.url).href,
  'image': new URL('./assets/image.svg', import.meta.url).href,
  'mention': new URL('./assets/mention.svg', import.meta.url).href,
  'mic': new URL('./assets/mic.svg', import.meta.url).href,
  'minus': new URL('./assets/minus.svg', import.meta.url).href,
  'openai': new URL('./assets/openai.svg', import.meta.url).href,
  'plus': new URL('./assets/plus.svg', import.meta.url).href,
  'text': new URL('./assets/text.svg', import.meta.url).href,
  'tools': new URL('./assets/tools.svg', import.meta.url).href,
  'unlock': new URL('./assets/unlock.svg', import.meta.url).href,
};

export type ImagePromptIconName = keyof typeof icons;

export function ImagePromptIcon({ name, className = '' }: { name: ImagePromptIconName; className?: string }) {
  return <span aria-hidden="true" className={`image-node-icon ${className}`} style={{ maskImage: `url("${icons[name]}")` }} />;
}
