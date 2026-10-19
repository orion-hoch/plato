import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, validateElement } from '../shared/elements/index.mjs';
import { evaluate } from '../shared/elements/circuit.mjs';
import { steps } from '../shared/elements/trace.mjs';

const refused = (kind, spec, pattern) => assert.throws(() => validateElement(kind, spec), error => error.message.startsWith(`Invalid ${kind}: `) && pattern.test(error.message));
const last = list => list.at(-1);
const value = (step, name) => step.vars.find(v => v.name === name)?.value;

test('every example validates, from JSON text too, and a validated spec validates to itself (the page checks again)', () => {
  for (const [kind, element] of Object.entries(ELEMENTS)) {
    assert.ok(element.purpose && element.rules.includes('Example:'), kind);
    const spec = validateElement(kind, JSON.stringify(element.example));
    assert.deepEqual(validateElement(kind, spec), spec, kind);
    assert.deepEqual(validateElement(kind, JSON.parse(JSON.stringify(spec))), spec, kind);
  }
  assert.throws(() => validateElement('video', {}), /unknown kind "video"/);
  refused('circuit', '{"parts": [', /not valid JSON/);
  refused('circuit', { parts: [{ id: 'A', type: 'input', col: 0, row: 0, label: 'x'.repeat(20_000) }] }, /over 16 KB/);
});

test('circuit: gate-built and built-in latches hold, a flip-flop takes D only on a rising edge, loops that run away are refused', () => {
  const sr = validateElement('circuit', ELEMENTS.circuit.example);
  let r = evaluate(sr, { R: 0, S: 0 });
  assert.equal(r.values.Q, 0);
  for (const [S, R, Q] of [[1, 0, 1], [0, 0, 1], [0, 1, 0], [0, 0, 0]]) { r = evaluate(sr, { S, R }, r.state); assert.equal(r.values.Q, Q, `S=${S} R=${R}`); }

  const dff = validateElement('circuit', { parts: [
    { id: 'D', type: 'input', col: 0, row: 0 }, { id: 'CLK', type: 'clock', col: 0, row: 1 },
    { id: 'FF', type: 'dff', in: ['D', 'CLK'], col: 1, row: 0 }, { id: 'Q', type: 'output', in: ['FF'], col: 2, row: 0 }, { id: 'Qn', type: 'output', in: ['FF.qn'], col: 2, row: 1 },
  ] });
  r = evaluate(dff, { D: 1, CLK: 0 });
  assert.deepEqual([r.values.Q, r.values.Qn], [0, 1]);
  r = evaluate(dff, { D: 1, CLK: 1 }, r.state); assert.equal(r.values.Q, 1, 'rising edge');
  r = evaluate(dff, { D: 0, CLK: 1 }, r.state); assert.equal(r.values.Q, 1, 'D ignored while the clock is high');
  r = evaluate(dff, { D: 0, CLK: 0 }, r.state); assert.equal(r.values.Q, 1, 'falling edge');
  r = evaluate(dff, { D: 0, CLK: 1 }, r.state); assert.equal(r.values.Q, 0);

  // The course's flip-flop: two D latches, the first one's C inverted. Q changes only as the clock rises.
  const ms = validateElement('circuit', { parts: [
    { id: 'D', type: 'input', col: 0, row: 0 }, { id: 'C', type: 'clock', col: 0, row: 1 }, { id: 'nc', type: 'not', in: ['C'], col: 1, row: 1 },
    { id: 'L1', type: 'dlatch', in: ['D', 'nc'], col: 2, row: 0 }, { id: 'L2', type: 'dlatch', in: ['L1', 'C'], col: 3, row: 0 }, { id: 'Q', type: 'output', in: ['L2'], col: 4, row: 0 },
  ] });
  r = evaluate(ms, { D: 1, C: 0 });
  assert.equal(r.values.Q, 0);
  r = evaluate(ms, { D: 1, C: 1 }, r.state); assert.equal(r.values.Q, 1);
  r = evaluate(ms, { D: 0, C: 1 }, r.state); assert.equal(r.values.Q, 1);
  r = evaluate(ms, { D: 0, C: 0 }, r.state); assert.equal(r.values.Q, 1);

  // A toggle: D wired to its own Q̄ flips Q on every rising edge.
  const toggle = validateElement('circuit', { parts: [{ id: 'CLK', type: 'clock', col: 0, row: 0 }, { id: 'T', type: 'dff', in: ['T.qn', 'CLK'], col: 1, row: 0 }, { id: 'Q', type: 'output', in: ['T'], col: 2, row: 0 }] });
  r = evaluate(toggle, { CLK: 0 });
  const seen = [];
  for (let i = 0; i < 4; i++) { r = evaluate(toggle, { CLK: 1 }, r.state); seen.push(r.values.Q); r = evaluate(toggle, { CLK: 0 }, r.state); }
  assert.deepEqual(seen, [1, 0, 1, 0]);

  refused('circuit', { parts: [{ id: 'A', type: 'input', col: 0, row: 0 }, { id: 'n', type: 'nand', in: ['A', 'n'], col: 1, row: 0 }] }, /never settles when A=1/);
  refused('circuit', { parts: [{ id: 'A', type: 'input', col: 0, row: 0 }, { id: 'g', type: 'and', in: ['A', 'B'], col: 1, row: 0 }] }, /"B", which is not a part/);
  refused('circuit', { parts: [{ id: 'A', type: 'input', col: 0, row: 0 }, { id: 'g', type: 'not', in: ['A.qn'], col: 1, row: 0 }] }, /only latches and flip-flops have .q and .qn/);
  refused('circuit', { parts: [{ id: 'A', type: 'input', col: 0, row: 0 }, { id: 'B', type: 'input', col: 0, row: 0 }] }, /cell another part already has/);
  refused('circuit', { parts: [{ id: 'A', type: 'input', col: 0, row: 0 }, { id: 'F', type: 'dff', in: ['A'], col: 1, row: 0 }] }, /takes 2 inputs \[D, clk\]/);
  refused('circuit', { parts: [{ id: 'valueOf', type: 'input', col: 0, row: 0 }] }, /valueOf is a reserved word/);
  refused('circuit', '{"parts": [{"id": {"toString": 1}, "type": "input", "col": 0, "row": 0}]}', /parts\[0\].id \{"toString":1\} must be a letter/);
});

test('trace: RISC-V runs in the interpreter, with the calling convention, sign extension and the stack drawn', () => {
  const sum = steps(validateElement('trace', ELEMENTS.trace.example));
  assert.equal(sum[0].line, 2);
  assert.equal(value(sum[0], 'a0'), '0x1000');
  assert.deepEqual(sum[0].memory.map(c => [c.address, c.value]), [['0x1008', '9'], ['0x1004', '-2'], ['0x1000', '5']]);
  assert.equal(last(sum).line, null);
  assert.equal(value(last(sum), 'a0'), '12');

  // The course's add/sub example: sub saves ra on the stack, calls add, restores ra and returns to main.
  const call = steps(validateElement('trace', { lang: 'riscv', code: [
    'add:', '  add a0, a0, a1', '  ret', 'sub:', '  addi sp, sp, -16', '  sd ra, 0(sp)', '  not a1, a1', '  addi a1, a1, 1', '  call add',
    '  ld ra, 0(sp)', '  addi sp, sp, 16', '  ret', 'main:', '  li a0, 3', '  li a1, 4', '  call sub',
  ].join('\n'), watch: ['a0', 'ra', 'sp'] }));
  assert.equal(call[0].line, 14, 'starts at main');
  assert.equal(value(last(call), 'a0'), '-1');
  assert.equal(value(last(call), 'sp'), '0x8000');
  const saved = call.find(s => s.memory.some(c => c.label === 'ra'));
  assert.deepEqual(saved.memory, [{ address: '0x7ff0', value: '52', label: 'ra' }]);
  assert.deepEqual(saved.pointers, [{ at: 0, label: 'sp' }]);
  assert.ok(call.some(s => s.vars.find(v => v.name === 'sp').changed));

  // From the notes: sw 0x49C then lb sign-extends 0x9c (shown in hex, as it was written).
  const bytes = steps(validateElement('trace', { lang: 'riscv', code: 'addi x11, x0, 0x49C\nsw x11, 0(x5)\nlb x12, 0(x5)\nlbu x13, 0(x5)', init: { regs: { x5: '0x100' } }, watch: ['x11', 'x12', 'x13'] }));
  assert.deepEqual(last(bytes).vars.map(v => v.value), ['0x49c', '0xffffffffffffff9c', '0x9c']);

  refused('trace', { lang: 'riscv', code: 'addi a0, a0, 5000' }, /line 1: 5000 does not fit addi \(-2048 to 2047\); use li/);
  refused('trace', { lang: 'riscv', code: 'fadd.s f0, f1, f2' }, /line 1: fadd.s is not supported/);
  refused('trace', { lang: 'riscv', code: 'loop:\n  j loop' }, /runs more than 200 instructions/);
  refused('trace', { lang: 'riscv', code: '.data\nx: .word 5' }, /line 1: .data is not supported/);
  refused('trace', { lang: 'riscv', code: 'beq a0, a1, nowhere' }, /no label "nowhere"/);
  refused('trace', { lang: 'riscv', code: 'li a0, 1', watch: ['pc'] }, /"pc" is not a register/);
  refused('trace', { lang: 'riscv', code: 'constructor a0, a1' }, /line 1: constructor is not supported/);
  refused('trace', '{"lang": "riscv", "code": {"toString": 1}}', /code is empty/);
});

test('trace: C steps are the model\'s, kept to their shape; values that change are marked', () => {
  const spec = validateElement('trace', { lang: 'c', code: 'int x = 1;\nx = x + 4;\nreturn x;', steps: [
    { line: 1, vars: [{ name: 'x', value: '?' }] }, { line: 2, vars: [{ name: 'x', value: '1' }], note: 'x starts at 1' }, { line: 3, vars: [{ name: 'x', value: '5' }], memory: [{ address: '0x7ffc', value: '5', label: 'x' }], pointers: [{ at: 0, label: 'sp' }] },
  ], watch: ['ignored'] });
  assert.equal(spec.watch, undefined);
  assert.deepEqual(steps(spec).map(s => s.vars[0].changed), [false, true, true]);
  refused('trace', { lang: 'c', code: 'int x;', steps: [{ line: 4 }] }, /steps\[0\].line must be a whole number from 1 to 1/);
  refused('trace', { lang: 'c', code: 'int x;', steps: [{ line: 1, pointers: [{ at: 0, label: 'p' }] }] }, /no memory/);
});

test('scene3d: named colours, bounded coordinates, animations of known objects', () => {
  const spec = validateElement('scene3d', ELEMENTS.scene3d.example);
  assert.equal(spec.objects.length, 4);
  refused('scene3d', { objects: [{ type: 'box', color: '#ff0000' }] }, /color must be one of lapis/);
  refused('scene3d', { objects: [{ type: 'sphere', at: [0, 99, 0] }] }, /at\[1\] must be a number from -20 to 20/);
  refused('scene3d', { objects: [{ type: 'mesh', url: 'https://example.com/a.glb' }] }, /type must be one of/);
  refused('scene3d', { objects: [{ type: 'box' }], animate: [{ id: 'nope', spin: 'y' }] }, /id of one of the objects/);
  refused('scene3d', { objects: [{ type: 'label' }] }, /put its text in "label"/);
  refused('scene3d', { objects: [{ type: 'box' }], camera: { position: [0, 0.2, 0] } }, /camera.position must be at least 0.5 away/);
});
