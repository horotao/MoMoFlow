import { selectedAudioAsset } from './audioPreview';
import { selectedImageResult } from './annotationGraph';
import { isCanvasAudio, isCanvasVideo, isCanvasImageNode, isCanvasTextNode, type AppNode, type FileAsset } from './types';

export function canvasDownloadContents(nodes: AppNode[]) {
  const assets: FileAsset[] = [];
  const extraFiles: { name: string; bytes: Uint8Array }[] = [];
  for (const node of nodes) {
    if (isCanvasImageNode(node) || isCanvasVideo(node) || isCanvasAudio(node)) {
      const asset = isCanvasAudio(node) ? selectedAudioAsset(node.data) : isCanvasVideo(node) ? node.data.asset : selectedImageResult(node);
      if (asset && !assets.some(item => item.url === asset.url)) assets.push(asset);
    } else if (isCanvasTextNode(node) && node.data.text) {
      extraFiles.push({ name: `${node.data.label || 'Text'}.${node.data.textComposer.format}`,
        bytes: new TextEncoder().encode(node.data.text) });
    }
  }
  return { assets, extraFiles };
}
