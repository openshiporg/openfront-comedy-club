import test from 'node:test';
import assert from 'node:assert/strict';
import { capacityBlock, layoutCapacity, normalizeChange, removeTableBlock, sameLabel, tableEditBlock } from './layout';

test('normalizeChange cleans and bounds input', () => {
  assert.deepEqual(normalizeChange({ kind: 'addTable', sectionId: 's1', label: '  B  1 ', seats: '4', shape: 'square' }), { kind: 'addTable', sectionId: 's1', label: 'B 1', seats: 4, shape: 'square', x: 0, y: 0 });
  assert.throws(() => normalizeChange({ kind: 'addTable', sectionId: 's1', label: 'A', seats: 0 }), /Seats/);
  assert.throws(() => normalizeChange({ kind: 'addTable', sectionId: 's1', label: 'A', seats: 2.5 }), /Seats/);
  assert.throws(() => normalizeChange({ kind: 'addTable', sectionId: 's1', label: 'A', seats: 99 }), /Seats/);
  assert.throws(() => normalizeChange({ kind: 'addTable', sectionId: 's1', label: ' ', seats: 2 }), /label/);
  assert.throws(() => normalizeChange({ kind: 'addTable', sectionId: 's1', label: 'A', seats: 2, shape: 'star' }), /Shape/);
  assert.throws(() => normalizeChange({ kind: 'updateTable', tableId: 't' }), /Nothing/);
  assert.throws(() => normalizeChange({ kind: 'nope' }), /Unknown/);
  assert.throws(() => normalizeChange(null), /Unknown/);
});

test('removing a table is blocked only by live use', () => {
  assert.equal(removeTableBlock('A1', { liveShows: [], history: 0 }), null);
  assert.match(removeTableBlock('A1', { liveShows: [], history: 2 })!, /2 past bookings/);
  assert.match(removeTableBlock('A1', { liveShows: ['Fri Late', 'Sat'], history: 5 })!, /A1 is held, sold or seated for Fri Late, Sat/);
  assert.match(removeTableBlock('A1', { liveShows: ['a', 'b', 'c', 'd', 'e'], history: 0 })!, /and 2 more/);
});

test('seats and section are locked while in use; moving or renaming is not', () => {
  const live = { liveShows: ['Fri'], history: 1 }; const cur = { seats: 4, sectionId: 's1' };
  assert.match(tableEditBlock('A1', live, cur, { seats: 6 })!, /cannot change/);
  assert.match(tableEditBlock('A1', live, cur, { sectionId: 's2' })!, /cannot change/);
  assert.equal(tableEditBlock('A1', live, cur, { seats: 4, sectionId: 's1' }), null);
  assert.equal(tableEditBlock('A1', live, cur, {}), null);
  assert.equal(tableEditBlock('A1', { liveShows: [], history: 3 }, cur, { seats: 8 }), null);
});

test('capacity follows the tables and refuses to oversell', () => {
  assert.equal(layoutCapacity([{ seats: 4 }, { seats: 6 }, { seats: null }]), 10);
  assert.equal(capacityBlock(50, [{ title: 'A', sold: 20, held: 10 }]), null);
  assert.match(capacityBlock(25, [{ title: 'A', sold: 20, held: 10 }])!, /30 sold or held/);
});

test('label comparison ignores case and spacing', () => { assert.ok(sameLabel('b 1', ' B  1')); assert.ok(!sameLabel('B1', 'B2')); });
