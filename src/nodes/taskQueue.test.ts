import test from 'node:test';
import assert from 'node:assert/strict';
import { readyDescriberTasks, advanceTasks, clearFinishedTasks, groupState, isActiveTask, taskGroups, type PreviewTask } from './taskQueue.ts';
const task = (id: string): PreviewTask => ({ id, batchId: 'batch', nodeId: 'node', model: 'preview', createdAt: 100, started: 0, progress: 0, state: 'Queued' });
test('preview runs one job at a time and completes at 100 percent without mutating prior snapshots', () => {
  const initial = [task('a'), task('b')];
  const running = advanceTasks(initial, 1000, () => undefined);
  assert.equal(initial[0].state, 'Queued');
  assert.deepEqual(running.map((t) => t.state), ['Running', 'Queued']);
  const halfway = advanceTasks(running, 6000, () => undefined);
  assert.equal(halfway[0].progress, 50);
  const completed = advanceTasks(halfway, 12000, () => undefined);
  assert.equal(completed[0].progress, 100);
  assert.equal(completed[0].state, 'Done');
  assert.equal(advanceTasks(completed, 12100, () => undefined)[1].state, 'Running');
});
test('cancelled and failed jobs stay terminal, failures do not block the queue', () => {
  const cancelled = { ...task('a'), state: 'Cancelled' as const, progress: 30 };
  const failed = advanceTasks([cancelled, task('b'), task('c')], 1000, () => 'Image disconnected.');
  assert.equal(failed[0], cancelled);
  assert.equal(failed[1].state, 'Failed');
  assert.equal(failed[1].error, 'Image disconnected.');
  const next = advanceTasks(failed, 1200, () => undefined);
  assert.equal(next[2].state, 'Running');
  assert.equal(next.filter(isActiveTask).length, 1);
});
test('batch grouping keeps chronological runs together with accurate mixed status', () => {
  const a = { ...task('a'), state: 'Done' as const, progress: 100 };
  const b = { ...task('b'), state: 'Failed' as const };
  const c = { ...task('c'), batchId: 'new' };
  assert.deepEqual(taskGroups([a, b, c]).map((g) => g.map((t) => t.id)), [['c'], ['a', 'b']]);
  assert.equal(groupState([a, b]), 'Failed');
  assert.equal(groupState([a, c]), 'Queued');
  assert.deepEqual([a, b, c].filter(isActiveTask), [c]);
});

test('clearing history retains completed children of an active batch so totals remain stable', () => {
  const done = { ...task('a'), state: 'Done' as const, progress: 100 };
  const queued = task('b');
  const old = { ...done, id: 'old', batchId: 'old' };
  assert.deepEqual(clearFinishedTasks([done, queued, old]), [done, queued]);
  assert.deepEqual(clearFinishedTasks([done, old]), []);
});

test('different nodes start together while repeated runs of a node stay ordered', () => {
  const tasks = [{ ...task('a1'), nodeId: 'a' }, { ...task('a2'), nodeId: 'a' }, { ...task('b1'), nodeId: 'b' }];
  assert.deepEqual(readyDescriberTasks(tasks, []).map((item) => item.id), ['a1', 'b1']);
  assert.deepEqual(readyDescriberTasks(tasks, ['a']).map((item) => item.id), ['b1']);
  assert.deepEqual(readyDescriberTasks([{ ...tasks[0], state: 'Running' }, ...tasks.slice(1)], []).map((item) => item.id), ['b1']);
  assert.deepEqual(readyDescriberTasks([{ ...tasks[0], state: 'Done' }, ...tasks.slice(1)], []).map((item) => item.id), ['a2', 'b1']);
});
test('cancellation and failure cannot restart terminal tasks or block unrelated nodes', () => {
  const tasks: PreviewTask[] = [{ ...task('a1'), nodeId: 'a', state: 'Cancelled' }, { ...task('a2'), nodeId: 'a' }, { ...task('b1'), nodeId: 'b', state: 'Failed' }, { ...task('c1'), nodeId: 'c' }];
  assert.deepEqual(readyDescriberTasks(tasks, ['a']).map((item) => item.id), ['c1']);
  assert.deepEqual(readyDescriberTasks(tasks, []).map((item) => item.id), ['a2', 'c1']);
});
