import { test } from 'node:test'; import assert from 'node:assert/strict';
import { showCapacity } from './capacity';
test('smaller of show and room cap', () => { assert.equal(showCapacity({ capacity: 180, room: { capacity: 120 } }), 120); assert.equal(showCapacity({ capacity: 90, room: { capacity: 120 } }), 90); });
test('no room: the show cap alone, never a throw', () => { assert.equal(showCapacity({ capacity: 40, room: null }), 40); assert.equal(showCapacity({ capacity: 40 }), 40); });
test('nothing usable means zero seats, so nothing is oversold', () => { assert.equal(showCapacity({ capacity: null, room: null }), 0); assert.equal(showCapacity({}), 0); });
