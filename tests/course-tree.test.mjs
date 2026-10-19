import test from 'node:test';
import assert from 'node:assert/strict';
import { outline, subtree } from '../src/course-tree.mjs';

const topics = [
  { id: 'u1', parentId: null, title: 'Analysis', mastery: { status: 'unknown', displayIndex: null } },
  { id: 'a', parentId: 'u1', title: 'Big-O', mastery: { status: 'estimated', displayIndex: 60 } },
  { id: 'b', parentId: 'u1', title: 'Master theorem', mastery: { status: 'unknown', displayIndex: null } },
  { id: 'c', parentId: null, title: 'Merge sort', mastery: { status: 'estimated', displayIndex: 20 } },
  { id: 'lost', parentId: 'gone', title: 'Orphan' },
];

test('the outline keeps the course order, numbers it, and fills with mastery', () => {
  const { units, overall } = outline(topics);
  assert.deepEqual(units.map(u => [u.number, u.title]), [['1', 'Analysis'], ['2', 'Merge sort'], ['3', 'Orphan']]); // a dangling parent is a unit
  assert.deepEqual(units[0].children.map(c => [c.number, c.title]), [['1.1', 'Big-O'], ['1.2', 'Master theorem']]);
  assert.equal(units[0].children[1].assessed, false);
  assert.equal(units[0].fill, 0.3);  // the average of its topics; not assessed counts as not yet there
  assert.equal(units[0].assessed, true);
  assert.ok(Math.abs(overall - (0.6 + 0 + 0.2 + 0) / 4) < 1e-9);
  assert.equal(outline([]).overall, 0);
});

test('a unit\'s subtree includes its topics', () => {
  assert.deepEqual([...subtree(topics, 'u1')].sort(), ['a', 'b', 'u1']);
  assert.deepEqual([...subtree(topics, 'c')], ['c']);
});
