import type { PreviewTask } from './taskQueue';

export async function requestDescription(task: PreviewTask, signal: AbortSignal): Promise<string> {
  if (task.model !== 'deepseek-flash') throw new Error('请选择 deepseek-flash；其他模型尚未接入。');
  if (!task.images?.length || task.images.length > 14) throw new Error('请连接 1–14 张图片。');
  const images: string[] = [];
  let total = 0;
  for (const url of task.images) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('无法读取输入图片。');
    const blob = await response.blob();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(blob.type)) throw new Error('仅支持 JPEG、PNG、GIF、WebP 图片。');
    if (blob.size > 32 * 1024 * 1024) throw new Error('单张图片不能超过 32 MiB。');
    total += Math.ceil(blob.size / 3) * 4;
    if (total > 46 * 1024 * 1024) throw new Error('图片总大小过大，请压缩后重试。');
    images.push(await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('图片读取失败。'));
      reader.readAsDataURL(blob);
    }));
  }
  const response = await fetch('/api/describer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: task.model, instructions: task.instructions ?? '', images }), signal,
  });
  const result = await response.json().catch(() => { throw new Error('本地 API 不可用，请通过 npm run dev 启动服务。'); });
  if (!response.ok) throw new Error(result.error || '图片理解失败。');
  if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('未返回提示词。');
  return result.text;
}
