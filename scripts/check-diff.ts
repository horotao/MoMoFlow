import { spawnSync } from 'node:child_process';
import { git, isMain, projectRoot } from './quality.ts';

export function checkDiff(root: string, base = process.env.MOMOFLOW_DIFF_BASE): string[] {
  const commands = [['diff', '--check'], ['diff', '--cached', '--check']];
  if (base) {
    if (/^0+$/.test(base)) {
      // A push creating a branch has no previous commit. Compare the full tree.
      base = git(root, ['hash-object', '-t', 'tree', '--stdin']).trim();
    } else {
      // Resolve explicitly, with no option injection and no silent shallow fallback.
      base = git(root, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim();
    }
    commands.push(['diff', '--check', base, 'HEAD', '--']);
  }
  for (const path of git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
    if (!path.startsWith('.codex/.quality/') && !/(^|\/)\.env($|\.)/.test(path)) {
      commands.push(['diff', '--no-index', '--check', '--', '/dev/null', path]);
    }
  }
  const errors: string[] = [];
  for (const args of commands) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    // --no-index implies --exit-code: 1 with no diagnostics means an ordinary
    // file addition, not a whitespace failure. Whitespace errors still fail.
    if (args.includes('--no-index') && result.status === 1 && !result.stdout && !result.stderr && !result.error) continue;
    if (result.status !== 0) errors.push(result.stdout || result.stderr || result.error?.message || `git ${args.join(' ')} failed`);
  }
  return errors;
}

if (isMain(import.meta.url)) {
  try {
    const errors = checkDiff(projectRoot);
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('工作区、暂存区及指定 CI 提交范围没有空白错误。');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
