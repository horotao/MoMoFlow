import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';
import { checkDiff } from './check-diff.ts';
import { checkNodeDocs } from './check-node-docs.ts';
import { fingerprint, git, projectRoot, runQuality } from './quality.ts';

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'momoflow-quality-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  writeFileSync(join(root, '.gitignore'), '.codex/.quality/\nnode_modules/\ndist/\n*.local\n');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/example.ts'), 'export const value = 1;\n');
  git(root, ['add', '.']);
  commit(root);
  return root;
}

function commit(root: string) {
  git(root, ['-c', 'user.name=Quality test', '-c', 'user.email=quality@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Fixture']);
}

const pass = () => ({ status: 0, output: 'passed' });

test('only a full successful check is reusable, while manual checks always run', t => {
  const root = fixture(t);
  const calls: string[] = [];
  const execute = (step: string) => { calls.push(step); return pass(); };
  assert.equal(runQuality(root, { execute }).ok, true);
  assert.deepEqual(calls, ['lint', 'test', 'build', 'check:docs', 'check:diff']);
  assert.equal(runQuality(root, { execute, useCache: true }).cached, true);
  assert.equal(calls.length, 5);
  assert.equal(runQuality(root, { execute }).cached, false);
  assert.equal(calls.length, 10);
});

test('untracked content, deletion, staged-only errors and dependency installs invalidate the hook cache', t => {
  const root = fixture(t);
  const original = fingerprint(root);
  const untracked = join(root, 'src/new.ts');
  writeFileSync(untracked, 'export const n = 1;\n');
  assert.notEqual(fingerprint(root), original);
  const added = fingerprint(root);
  writeFileSync(untracked, 'export const n = 2;\n');
  assert.notEqual(fingerprint(root), added);
  rmSync(untracked);
  assert.equal(fingerprint(root), original);
  writeFileSync(join(root, 'src/example.ts'), 'export const value = 1; \n');
  git(root, ['add', 'src/example.ts']);
  writeFileSync(join(root, 'src/example.ts'), 'export const value = 1;\n');
  assert.notEqual(fingerprint(root), original);
  git(root, ['reset', '-q', 'HEAD', '--', 'src/example.ts']);
  assert.equal(fingerprint(root), original);
  rmSync(join(root, 'src/example.ts'));
  assert.notEqual(fingerprint(root), original);
  mkdirSync(join(root, 'node_modules'));
  const deleted = fingerprint(root);
  writeFileSync(join(root, 'node_modules/.package-lock.json'), '{}');
  assert.notEqual(fingerprint(root), deleted);
});

test('failed and interrupted checks are not cached; a corrupted cache triggers a fresh check', t => {
  const root = fixture(t);
  const execute = () => ({ status: null, output: 'process timed out' });
  assert.equal(runQuality(root, { execute }).ok, false);
  assert.equal(runQuality(root, { execute: pass, useCache: true }).cached, false);
  // A flaky failure or environment failure after a pass must revoke that pass.
  assert.equal(runQuality(root, { execute }).ok, false);
  assert.equal(runQuality(root, { execute: pass, useCache: true }).cached, false);
  writeFileSync(join(root, '.codex/.quality/passed.json'), '{broken');
  assert.equal(runQuality(root, { execute: pass, useCache: true }).cached, false);
});

test('a file edited while checks run cannot receive a passing cache entry', t => {
  const root = fixture(t);
  const result = runQuality(root, { execute: step => {
    if (step === 'build') writeFileSync(join(root, 'src/example.ts'), 'export const value = 2;\n');
    return pass();
  } });
  assert.equal(result.ok, false);
  assert.match(result.detail, /文件发生了变化/);
  assert.equal(runQuality(root, { execute: pass, useCache: true }).cached, false);
});

test('diff checks catch untracked and staged whitespace even with a repaired working copy', t => {
  const root = fixture(t);
  assert.deepEqual(checkDiff(root, ''), []);
  writeFileSync(join(root, 'src/new.ts'), 'export const value = 2;\n');
  assert.deepEqual(checkDiff(root, ''), []);
  writeFileSync(join(root, 'src/new.ts'), 'export const value = 2; \n');
  assert.ok(checkDiff(root, '').some(message => message.includes('src/new.ts')));
  rmSync(join(root, 'src/new.ts'));
  writeFileSync(join(root, 'src/example.ts'), 'export const value = 1; \n');
  git(root, ['add', 'src/example.ts']);
  writeFileSync(join(root, 'src/example.ts'), 'export const value = 1;\n');
  assert.ok(checkDiff(root, '').some(message => message.includes('trailing whitespace')));
});

test('CI diff checks inspect committed changes in a clean checkout and reject a missing base', t => {
  const root = fixture(t);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  writeFileSync(join(root, 'src/example.ts'), 'export const value = 2; \n');
  git(root, ['add', '.']);
  commit(root);
  assert.deepEqual(checkDiff(root, ''), []);
  assert.ok(checkDiff(root, base).some(message => message.includes('trailing whitespace')));
  assert.ok(checkDiff(root, '0'.repeat(40)).some(message => message.includes('trailing whitespace')));
  assert.throws(() => checkDiff(root, 'missing-quality-base'));
});

test('node documentation check catches undocumented registration and broken local links', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'src/nodes'));
  writeFileSync(join(root, 'src/nodes/index.ts'), "export const nodeTypes = { text: TextNode, 'new-node': NewNode } satisfies NodeTypes;\n");
  writeFileSync(join(root, 'src/nodes/README.md'), '| Text | `text` | [TextNode](./Missing.tsx) |\n');
  const errors = checkNodeDocs(root);
  assert.ok(errors.some(message => message.includes('new-node')));
  assert.ok(errors.some(message => message.includes('Missing.tsx')));
});

test('real Stop hook emits JSON, reports failed checks, rechecks once and avoids endless continuation', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'scripts'));
  for (const name of ['quality.ts', 'codex-quality-hook.ts']) copyFileSync(join(projectRoot, 'scripts', name), join(root, 'scripts', name));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    type: 'module', scripts: { lint: `node -e "process.stderr.write('fixture lint failure'); process.exit(1)"` },
  }));
  const invoke = (extra: object = {}) => {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', join(root, 'scripts/codex-quality-hook.ts')], {
      cwd: join(root, 'src'), encoding: 'utf8', timeout: 15_000,
      input: JSON.stringify({ hook_event_name: 'Stop', cwd: join(root, 'src'), ...extra }),
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout) as { decision?: string; reason?: string; systemMessage?: string };
  };
  const first = invoke();
  assert.equal(first.decision, 'block');
  assert.match(first.reason ?? '', /fixture lint failure/);
  const retry = invoke({ stop_hook_active: true });
  assert.equal(retry.decision, undefined);
  assert.match(retry.systemMessage ?? '', /fixture lint failure/);
  assert.deepEqual(invoke({ permission_mode: 'plan' }), {});
  assert.equal(invoke({ cwd: tmpdir() }).decision, 'block');
  // Successful cached content must produce JSON only, even after a repair turn.
  assert.equal(runQuality(root, { execute: pass }).ok, true);
  assert.deepEqual(invoke({ stop_hook_active: true }), {});
  assert.ok(readFileSync(join(root, '.codex/.quality/passed.json'), 'utf8').includes('fingerprint'));
});
