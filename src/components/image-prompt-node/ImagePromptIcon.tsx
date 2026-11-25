import './image-prompt-shared.css';

const icons = {
  audio: new URL('../add-node-menu/assets/audio.svg', import.meta.url).href,
  video: new URL('../add-node-menu/assets/video.svg', import.meta.url).href,
  'history-text': new URL('./assets/history-text.svg', import.meta.url).href,
  'plug': new URL('./assets/plug.svg', import.meta.url).href,
  'metadata-info': new URL('./assets/metadata-info.svg', import.meta.url).href,
  'metadata-extend': new URL('./assets/metadata-extend.svg', import.meta.url).href,
  'metadata-edit': new URL('./assets/metadata-edit.svg', import.meta.url).href,
  'metadata-crop': new URL('./assets/metadata-crop.svg', import.meta.url).href,
  'metadata-upscale': new URL('./assets/metadata-upscale.svg', import.meta.url).href,
  'metadata-remove-background': new URL('./assets/metadata-remove-background.svg', import.meta.url).href,
  'metadata-more': new URL('./assets/metadata-more.svg', import.meta.url).href,
  'metadata-fullscreen': new URL('./assets/metadata-fullscreen.svg', import.meta.url).href,
  'metadata-save': new URL('./assets/metadata-save.svg', import.meta.url).href,
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
  'expand-preview': new URL('./assets/expand-preview.svg', import.meta.url).href,
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
  'replace-image': new URL('./assets/replace-image.svg', import.meta.url).href,
  'send-image': new URL('./assets/send-image.svg', import.meta.url).href,
  'text': new URL('./assets/text.svg', import.meta.url).href,
  'tools': new URL('./assets/tools.svg', import.meta.url).href,
  'unlock': new URL('./assets/unlock.svg', import.meta.url).href,
};

export type ImagePromptIconName = keyof typeof icons;

export function ImagePromptIcon({ name, className = '' }: { name: ImagePromptIconName; className?: string }) {
  return <span aria-hidden="true" className={`image-node-icon ${className}`} style={{ maskImage: `url("${icons[name]}")` }} />;
}
