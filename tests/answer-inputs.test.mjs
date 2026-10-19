import test from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeSpec, answerReady, readable, move, typedAnswer } from '../src/inputs/answer.mjs';
import { onScreen, nearest, keep, touches } from '../src/inputs/ink.mjs';

test('agent ask_input string lists become ids; backend specs keep theirs', () => {
  assert.deepEqual(normalizeSpec('choice', { options: ['n', 'n log n'] }).options, [{ id: 'A', text: 'n' }, { id: 'B', text: 'n log n' }]);
  assert.deepEqual(normalizeSpec('choice', { options: [{ id: 'c2', text: 'x' }] }).options, [{ id: 'c2', text: 'x' }]);
  assert.deepEqual(normalizeSpec('match', { left: ['a'], right: ['b'] }), { left: [{ id: 'l1', text: 'a' }], right: [{ id: 'r1', text: 'b' }] });
});

test('readiness and readable answers per kind', () => {
  const choice = normalizeSpec('choice', { options: ['n²', 'n log n'] });
  assert.equal(readable('choice', 'B', choice), 'B) n log n');
  const order = normalizeSpec('order', { items: ['merge', 'split'] });
  assert.equal(answerReady('order', ['i2'], order), false);
  assert.equal(readable('order', ['i2', 'i1'], order), '1. split; 2. merge');
  const match = normalizeSpec('match', { left: ['O', 'Ω'], right: ['upper', 'lower'] });
  assert.equal(answerReady('match', [['l1', 'r1']], match), false);
  assert.equal(readable('match', [['l1', 'r1'], ['l2', 'r2']], match), 'O → upper; Ω → lower');
  assert.equal(readable('number', 3, { unit: 'ms' }), '3 ms');
  assert.equal(answerReady('number', NaN), false);
  assert.equal(answerReady('text', '  '), false);
});

test('typed words answer a text or number question; a number answer is decimal', () => {
  assert.deepEqual(typedAnswer('number', ' 42 '), { kind: 'number', value: 42 });
  assert.deepEqual(typedAnswer('number', '-5'), { kind: 'number', value: -5 });
  assert.deepEqual(typedAnswer('number', '.5'), { kind: 'number', value: .5 });
  assert.deepEqual(typedAnswer('number', '1e3'), { kind: 'number', value: 1000 });
  assert.equal(typedAnswer('number', '0x2A'), null, 'copying 0x2A is not converting it to decimal');
  assert.equal(typedAnswer('number', '0b101010'), null);
  assert.equal(typedAnswer('number', 'forty-two'), null, 'not a number: the words go to Plato as a turn');
  assert.equal(typedAnswer('number', '  '), null);
  assert.deepEqual(typedAnswer('text', ' lw t0, 0(sp) '), { kind: 'text', value: 'lw t0, 0(sp)' });
  assert.equal(typedAnswer('choice', 'A'), null, 'only typed kinds');
});

test('move swaps within bounds only', () => {
  assert.deepEqual(move(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(move(['a', 'b'], 0, -1), ['a', 'b']);
});

test('writing on the page moves with the part it was written on, shows only within the page, and stays when that part goes', () => {
  // A stand-in for an element: where it is on the screen now, whether it is still shown, and whether it is a question.
  const el = (left, top, height = 100, isConnected = true, asks = false) => ({ isConnected, classList: { contains: name => asks && name === 'page-ask' }, getBoundingClientRect: () => ({ left, top, bottom: top + height, height }) });
  const box = { left: 0, top: 10 }, sheet = el(300, 40, 700), dot = { x: 12, y: 250, p: .5 };
  const part = el(340, -150), free = { on: null, points: [dot] }, written = { on: part, sheet, points: [dot] };
  const [off, on] = onScreen([free, written], box);
  assert.equal(off, free, 'writing off the page stays where it is');
  // The part has scrolled up 150 past the canvas's top: the writing went with it.
  assert.deepEqual(on.points, [{ x: 352, y: 90, p: .5 }]);
  assert.deepEqual(on.clip, { top: 30, height: 700 });
  // New material replaces that part: the writing stays exactly where it was last seen, as a note on the old material.
  part.isConnected = false;
  assert.equal(keep(written), written, 'the same stroke, kept');
  assert.deepEqual(onScreen([written], box)[0].points, [{ x: 352, y: 90, p: .5 }]);
  assert.deepEqual(written.clip, { top: 30, height: 700 });
  assert.equal(written.note, true);
  // Writing under a question is kept as the student's own work when the question goes.
  const asked = el(340, 380, 200, true, true), answer = { on: asked, sheet, points: [dot] };
  onScreen([answer], box); asked.isConnected = false; keep(answer);
  assert.equal(answer.note, false);
  // Writing in the page's margin belongs to the part nearest it.
  const material = el(340, 40, 300), question = el(340, 380, 200);
  assert.equal(nearest([material, question], 370), question);
  assert.equal(nearest([material, question], 200), material);
  assert.equal(nearest([], 200), null);
});

test('the eraser takes a stroke it passes near, along any of its segments, and no other', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.equal(touches(line, 50, 10, 14), true, 'near the middle of the first segment');
  assert.equal(touches(line, 110, 60, 14), true, 'near the second segment');
  assert.equal(touches(line, 50, 40, 14), false, 'inside the corner, far from both');
  assert.equal(touches(line, -20, 0, 14), false, 'past the end');
  assert.equal(touches([{ x: 5, y: 5 }], 10, 10, 14), true, 'a dot');
  assert.equal(touches([{ x: 5, y: 5 }, { x: 5, y: 5 }], 40, 40, 14), false, 'a zero-length segment');
});
