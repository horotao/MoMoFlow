import { readFileSync, realpathSync } from 'node:fs';
import { git, isMain, projectRoot, runQuality, type QualityResult } from './quality.ts';

type StopInput = { hook_event_name?: string; cwd?: string; stop_hook_active?: boolean; permission_mode?: string };
type StopOutput = { decision?: 'block'; reason?: string; systemMessage?: string };

export function stopResponse(input: StopInput, result: QualityResult): StopOutput {
  if (result.ok) return {};
  const message = `MoMoFlow 自动检查未通过。${result.detail}${result.logPath ? `\n完整日志：${result.logPath}` : ''}`;
  // Allow one repair continuation. Recheck repaired files, but never keep a turn
  // alive indefinitely when a failure needs user input or lies outside this task.
  if (input.stop_hook_active === true) return { systemMessage: `${message}\n自动续跑已使用，请在回复中说明剩余问题。` };
  return {
    decision: 'block',
    reason: `${message}\n请遵守用户的只读与修改范围约束，处理本任务范围内的问题并运行 npm run check。若问题属于已有改动、环境或任务范围外，请明确说明；不要修改检查规则来绕过失败。`,
  };
}

if (isMain(import.meta.url)) {
  let input: StopInput = {};
  try {
    const value: unknown = JSON.parse(readFileSync(0, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a Codex hook JSON object');
    input = value as StopInput;
    if (input.hook_event_name !== 'Stop') throw new Error('Expected a Codex Stop event');
    if (!input.cwd || realpathSync(git(input.cwd, ['rev-parse', '--show-toplevel']).trim()) !== realpathSync(projectRoot)) {
      throw new Error('Hook cwd does not match this project');
    }
    // Plan mode must not create build output or local caches.
    const result = input.permission_mode === 'plan'
      ? { ok: true, cached: false, detail: 'Plan mode' }
      : runQuality(projectRoot, { useCache: true });
    process.stdout.write(JSON.stringify(stopResponse(input, result)));
  } catch (error) {
    process.stdout.write(JSON.stringify(stopResponse(input, {
      ok: false, cached: false, detail: error instanceof Error ? error.message : String(error),
    })));
  }
}
