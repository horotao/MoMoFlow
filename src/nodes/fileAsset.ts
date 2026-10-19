import { assetResources } from './assetResources';
import type { AppNode, FileNode, FileAsset } from './types';

export const fileAccept = '.jpg,.jpeg,.png,.webp,.gif,.heic,.avif,.webm,.mp4,.mov,.mp3,.wav,.ogg,.m4a,.glb,.obj,.fbx,.ply';

export function fileKind(name: string, mime = ''): FileAsset['kind'] | undefined {
  const extension = name.split('.').pop()?.toLowerCase();
  if (mime.startsWith('image/') || /^(jpg|jpeg|png|webp|gif|heic|avif)$/.test(extension ?? '')) return 'image';
  if (mime.startsWith('video/') || /^(webm|mp4|mov)$/.test(extension ?? '')) return 'video';
  if (mime.startsWith('audio/') || /^(mp3|wav|ogg|m4a)$/.test(extension ?? '')) return 'audio';
  if (/^(glb|obj|fbx|ply)$/.test(extension ?? '')) return '3d';
}

export function assetFromLink(value: string): FileAsset {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Enter a valid file link.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an http or https file link.');
  const name = decodeURIComponent(url.pathname.split('/').pop() || 'Linked file');
  const kind = fileKind(name);
  if (!kind) throw new Error('Use a direct image, video, audio or 3D file link.');
  return { id: crypto.randomUUID(), name, kind, url: url.href };
}

export function assetFromFile(file: File): FileAsset {
  const kind = fileKind(file.name, file.type);
  if (!kind) throw new Error('Unsupported file. Choose an image, video, audio or 3D file.');
  if (file.size > 100 * 1024 * 1024) throw new Error('Choose a file smaller than 100 MB.');
  return { id: crypto.randomUUID(), name: file.name, kind, url: assetResources.create(file), size: file.size };
}

export const isFileNode = (node: AppNode): node is FileNode => node.type === 'file';

// External file drops and browser image drags share the same File asset shape.
export function imagesFromDrop(transfer: Pick<DataTransfer, 'files' | 'getData'>) {
  const assets: FileAsset[] = [];
  const errors: string[] = [];
  if (transfer.files.length) {
    for (const file of Array.from(transfer.files)) {
      try {
        if (fileKind(file.name, file.type) !== 'image') throw new Error(`${file.name}: choose an image file.`);
        assets.push(assetFromFile(file));
      } catch (error) { errors.push(error instanceof Error ? error.message : 'Could not import image.'); }
    }
    return { assets, errors };
  }
  const html = transfer.getData('text/html');
  const imageSource = html ? new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.getAttribute('src') : undefined;
  const uri = transfer.getData('text/uri-list').split(/\r?\n/).find((line) => line.trim() && !line.startsWith('#'));
  const value = imageSource || uri;
  if (value) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an http or https image link.');
      const name = decodeURIComponent(url.pathname.split('/').pop() || 'Image');
      if (!imageSource && fileKind(name) !== 'image') throw new Error('Drag an image rather than a webpage link.');
      assets.push({ id: crypto.randomUUID(), name, url: url.href, kind: 'image' });
    } catch (error) { errors.push(error instanceof Error ? error.message : 'Could not import image link.'); }
  }
  return { assets, errors };
}
