import type { FileAsset } from './types';

export async function measureAsset(asset: FileAsset): Promise<FileAsset> {
  if (asset.kind !== 'image') return asset;
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(asset), 10000);
    image.onload = () => { window.clearTimeout(timer); resolve({ ...asset, width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { window.clearTimeout(timer); resolve(asset); };
    image.src = asset.url;
  });
}
async function assetBlob(asset: FileAsset) {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error('Could not download this file. Check the link and try again.');
  return response.blob();
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function downloadAsset(asset: FileAsset) { saveBlob(await assetBlob(asset), asset.name); }

// Store-only ZIP: retain original bytes and avoid separate browser downloads for every image.
export function zipFiles(files: { name: string; bytes: Uint8Array }[]): Blob {
  const parts: ArrayBuffer[] = [];
  const directory: ArrayBuffer[] = [];
  let offset = 0;
  const used = new Set<string>();
  for (const file of files) {
    const original = file.name.replace(/[\\/]/g, '_');
    let name = original;
    for (let suffix = 2; used.has(name); suffix++) name = `${suffix}-${original}`;
    used.add(name);
    const encoded = new TextEncoder().encode(name);
    let crc = 0xffffffff;
    for (const byte of file.bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + encoded.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint32(14, crc, true); view.setUint32(18, file.bytes.length, true); view.setUint32(22, file.bytes.length, true);
    view.setUint16(26, encoded.length, true); local.set(encoded, 30);
    const central = new Uint8Array(46 + encoded.length);
    const entry = new DataView(central.buffer);
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x800, true);
    entry.setUint32(16, crc, true); entry.setUint32(20, file.bytes.length, true); entry.setUint32(24, file.bytes.length, true);
    entry.setUint16(28, encoded.length, true); entry.setUint32(42, offset, true); central.set(encoded, 46);
    parts.push(local.buffer, new Uint8Array(file.bytes).buffer); directory.push(central.buffer);
    offset += local.length + file.bytes.length;
  }
  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true);
  endView.setUint32(12, directory.reduce((sum, entry) => sum + entry.byteLength, 0), true); endView.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: 'application/zip' });
}
export async function downloadAssets(assets: FileAsset[]) {
  const files = await Promise.all(assets.map(async (asset) => ({ name: asset.name, bytes: new Uint8Array(await (await assetBlob(asset)).arrayBuffer()) })));
  saveBlob(zipFiles(files), 'images.zip');
}
export async function copyAssetImage(asset: FileAsset) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image copying is not supported by this browser.');
  const png = (async () => {
    const bitmap = await createImageBitmap(await assetBlob(asset));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not copy image.')), 'image/png'));
    } finally { bitmap.close(); }
  })();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
