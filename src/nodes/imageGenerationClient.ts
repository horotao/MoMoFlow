export async function readImage(url: string, signal: AbortSignal, mask = false, formats: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']): Promise<Blob> {
  if (!/^(blob:|data:image\/|https?:\/\/)/.test(url)) throw new Error('无效的输入图片地址。');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('无法读取输入图片。');
  const blob = await response.blob();
  if (!(mask ? ['image/png'] : formats).includes(blob.type)) throw new Error(mask ? 'Mask 必须为带透明通道的 PNG。' : `参考图片需为 ${formats.map(type => type.slice(6).toUpperCase()).join('、')}。`);
  if (blob.size > 32 * 1024 * 1024) throw new Error('单张图片不能超过 32 MiB。');
  return blob;
}
export const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('无法读取图片。'));
  reader.readAsDataURL(blob);
});
