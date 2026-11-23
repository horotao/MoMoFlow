import assert from 'node:assert/strict';
import test from 'node:test';
import { selectionLockState, toggleSelectionLock } from './nodeLocks.ts';
import { isNodeLocked, type TextNode } from './types.ts';

function node(id: string, locked?: boolean): TextNode {
  return { id, type: 'text', position: { x: 0, y: 0 }, selected: true,
    data: { text: id, ...(locked === undefined ? {} : { locked }) } };
}

test('batch lock locks an unlocked selection and unlocks an entirely locked selection', () => {
  const nodes = [node('a'), node('b', false)];
  assert.deepEqual(selectionLockState(nodes), { count: 2, allLocked: false });
  const locked = toggleSelectionLock(nodes);
  assert.deepEqual(selectionLockState(locked), { count: 2, allLocked: true });
  assert.deepEqual(toggleSelectionLock(locked).map(isNodeLocked), [false, false]);
});

test('batch lock only changes unlocked visible selected nodes in a mixed selection', () => {
  const nodes = [node('a', true), node('b'), { ...node('hidden'), hidden: true },
    { ...node('other'), selected: false }];
  const result = toggleSelectionLock(nodes);
  assert.deepEqual(result.map(isNodeLocked), [true, true, false, false]);
  assert.deepEqual(result[1], { ...nodes[1], data: { ...nodes[1].data, locked: true } });
  for (const index of [0, 2, 3]) assert.equal(result[index], nodes[index]);
  assert.equal(isNodeLocked(nodes[1]), false);
});

test('batch lock does nothing without a visible multi-selection', () => {
  const nodes = [node('a'), { ...node('hidden'), hidden: true }];
  assert.equal(toggleSelectionLock(nodes), nodes);
});
