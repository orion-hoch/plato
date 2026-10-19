import test from 'node:test';
import assert from 'node:assert/strict';
import { codeify } from '../src/conversation-log.mjs';

test('code-like words in the conversation show as code; English words and the words themselves never change', () => {
  assert.equal(codeify('Put 0x2A in a0, then call malloc() and check MAX_SIZE.'), 'Put `0x2A` in `a0`, then call `malloc()` and check `MAX_SIZE`.');
  assert.equal(codeify('x10 holds 0b1011; t1 and s11 too'), '`x10` holds `0b1011`; `t1` and `s11` too');
  // Mnemonics and sp/ra/zero are English too; a register name needs its digit.
  for (const plain of ['Add and or zero: sp and ra stay words.', 'A1 sauce, a 2x2 grid, tax10, load word', 'a-zero, hex 2A']) assert.equal(codeify(plain), plain);
  // What is already code or math is left as it is.
  assert.equal(codeify('already `a0` here, and $x_1$ math'), 'already `a0` here, and $x_1$ math');
  // Dollars that are money (as the page reads them) are plain text, and a $-register is left whole.
  for (const plain of ['between $5 and $10', 'the $sp register, $t0 and $a0']) assert.equal(codeify(plain), plain);
  assert.equal(codeify(''), '');
});
