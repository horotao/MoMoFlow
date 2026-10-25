import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const steps = ['lint', 'test', 'build', 'check:docs', 'check:diff'];

export function isMain(url: string) {
  return Boolean(process.argv[1]) && process.argv[1] !== '-'
    && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(url));
}

export function git(root: string, args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}

export function repositoryFiles(root: string) {
  return [...new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort();
}

// Include contents (also untracked/deleted files) and index blobs: a staged error
// must invalidate a pass even if the working copy has already been repaired.
export function fingerprint(root: string) {
  const hash = createHash('sha256').update(`${process.version}\0${process.platform}\0${process.arch}\0${process.env.MOMOFLOW_DIFF_BASE ?? ''}\0`);
  hash.update(git(root, ['ls-files', '--stage', '-z']));
  for (const file of repositoryFiles(root)) {
    if (file.startsWith('.codex/.quality/') || /(^|\/)\.env($|\.)/.test(file)) continue;
    hash.update(file).update('\0');
    try { hash.update(createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      hash.update('deleted');
    }
    hash.update('\0');
  }
  // npm updates this marker on installation; reinstalling dependencies invalidates
  // the hook cache without hashing all of node_modules on every turn.
  try {
    const marker = resolve(root, 'node_modules/.package-lock.json');
    hash.update(readFileSync(marker)).update(String(statSync(marker).mtimeMs));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    hash.update('dependencies-missing');
  }
  return hash.digest('hex');
}

type StepResult = { status: number | null; output: string };
export type QualityResult = { ok: boolean; cached: boolean; detail: string; logPath?: string };

export function runQuality(root: string, options: {
  useCache?: boolean;
  report?: (message: string) => void;
  execute?: (script: string, timeout: number) => StepResult;
} = {}): QualityResult {
  const cacheDir = resolve(root, '.codex/.quality');
  const statePath = resolve(cacheDir, 'passed.json');
  const before = fingerprint(root);
  if (options.useCache) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8')) as { fingerprint?: string };
      if (state.fingerprint === before) return { ok: true, cached: true, detail: '当前文件已通过检查，复用结果。' };
    } catch { /* Missing or damaged cache always means a fresh check. */ }
  }

  mkdirSync(cacheDir, { recursive: true });
  // A failed forced rerun must invalidate an older success for identical files.
  rmSync(statePath, { force: true });
  const logPath = resolve(cacheDir, `run-${Date.now()}-${process.pid}.log`);
  const output: string[] = [];
  const deadline = Date.now() + 540_000;
  const report = (message: string) => { output.push(message); options.report?.(message); };
  const finish = (ok: boolean, detail: string): QualityResult => {
    if (!ok) rmSync(statePath, { force: true });
    report(detail);
    writeFileSync(logPath, output.join('\n'));
    return { ok, cached: false, detail, logPath };
  };
  const execute = options.execute ?? ((script, timeout) => {
    const result = spawnSync('npm', ['run', script], {
      cwd: root, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024,
    });
    return { status: result.status, output: [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n') };
  });

  for (const step of steps) {
    report(`\n[quality] npm run ${step}`);
    const remaining = deadline - Date.now();
    if (remaining <= 0) return finish(false, '检查超过 9 分钟，请查看日志并手动运行 npm run check。');
    const result = execute(step, remaining);
    report(result.output);
    if (result.status !== 0) return finish(false, `npm run ${step} 未通过。\n${result.output.slice(-6000)}`);
  }

  if (fingerprint(root) !== before) return finish(false, '检查期间文件发生了变化，结果未缓存；请对最新文件重新运行 npm run check。');
  const temporary = `${statePath}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ fingerprint: before, checkedAt: new Date().toISOString(), logPath }));
  renameSync(temporary, statePath);
  return finish(true, '全部自动检查通过。浏览器交互仍需按改动范围验收。');
}

if (isMain(import.meta.url)) {
  try {
    const result = runQuality(projectRoot, { report: message => console.log(message) });
    console.log(`[quality] 日志：${result.logPath}`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error('[quality]', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
