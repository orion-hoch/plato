import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMaterial, parseInline, highlightCode, boardTextParts } from '../shared/board-rich-text.mjs';

const types = nodes => nodes.map(node => node.type);
const plain = nodes => nodes.map(node => node.text ?? (node.children ? plain(node.children) : node.type === 'br' ? '\n' : '')).join('');

test('math vs currency: Pandoc rules for $…$, every delimiter form, nothing inside code', () => {
  assert.deepEqual(parseInline('It costs $5 and $10, or $5.00.'), [{ type: 'text', text: 'It costs $5 and $10, or $5.00.' }]);
  assert.deepEqual(parseInline('$0$ or $1$').filter(n => n.type === 'math').map(n => n.text), ['0', '1']);
  assert.deepEqual(parseInline('\\(a\\) \\[b\\] $$c$$ $d$').filter(n => n.type === 'math').map(n => [n.text, n.display]), [['a', false], ['b', true], ['c', true], ['d', false]]);
  assert.deepEqual(parseInline('`$x$` is code, \\$5 is money'), [{ type: 'code', text: '$x$' }, { type: 'text', text: ' is code, $5 is money' }]);
  const [code] = parseMaterial('```c\nprintf("$%d", x); // costs $5 and $x$\n```');
  assert.deepEqual(code, { type: 'code', lang: 'c', text: 'printf("$%d", x); // costs $5 and $x$' });
  assert.deepEqual(parseMaterial('$$\n- x + 1\n| a |\n$$'), [{ type: 'math', text: '- x + 1\n| a |' }]);
});

test('HTML stays literal text everywhere', () => {
  const html = '<img src=x onerror=alert(1)>';
  const doc = parseMaterial(`${html}\n\n# ${html}\n\n- ${html}\n\n| h |\n|---|\n| ${html} |`);
  assert.deepEqual(types(doc), ['p', 'h', 'list', 'table']);
  assert.deepEqual(doc[0].children, [{ type: 'text', text: html }]);
  assert.equal(plain(doc[1].children), html);
  assert.equal(plain(doc[2].items[0][0].children), html);
  assert.equal(plain(doc[3].rows[0][0]), html);
  const kinds = new Set();
  JSON.stringify(doc, (key, value) => { if (key === 'type') kinds.add(value); return value; });
  assert.deepEqual([...kinds].filter(kind => !['p', 'h', 'list', 'table', 'text', 'br', 'code', 'math', 'strong', 'em', 'quote', 'rule'].includes(kind)), []);
});

test('emphasis needs flanking: snake_case, 2*3*4 and C pointers stay as written', () => {
  assert.deepEqual(parseInline('**bold *it* x**'), [{ type: 'strong', children: [{ type: 'text', text: 'bold ' }, { type: 'em', children: [{ type: 'text', text: 'it' }] }, { type: 'text', text: ' x' }] }]);
  assert.deepEqual(types(parseInline('***both***')), ['strong']);
  for (const literal of ['snake_case_name', '2*3*4', 'int *p, *q;', 'a * b * c', '**', '\\*not em\\*']) assert.equal(plain(parseInline(literal)), literal.replace(/\\\*/g, '*'), literal);
});

test('links and images show their text only', () => {
  assert.deepEqual(parseInline('see [lecture 7](https://example.com/7) and ![a gate](g.png), or [x] alone'), [{ type: 'text', text: 'see lecture 7 and a gate, or [x] alone' }]);
});

test('paragraphs, line breaks, headings, quotes and rules', () => {
  const doc = parseMaterial('Line one\r\nline two\n\n#### Small\n\n> quoted\n> still\n\n---\n\nafter');
  assert.deepEqual(types(doc), ['p', 'h', 'quote', 'rule', 'p']);
  assert.deepEqual(types(doc[0].children), ['text', 'br', 'text']);
  assert.equal(doc[1].level, 4);
  assert.equal(plain(doc[2].blocks[0].children), 'quoted\nstill');
  assert.equal(parseMaterial('###### deep')[0].level, 4);
});

test('lists: bullets, numbered with a start, one nested level, lazy lines, code inside an item', () => {
  const [intro, list, numbered] = parseMaterial('Steps:\n- one\n- two\n  - nested\ncarried on\n- three\n\n3. three\n4. four\n   ```c\n   x++;\n   ```');
  assert.equal(intro.type, 'p');
  assert.equal(list.ordered, false);
  assert.deepEqual(list.items.map(item => types(item)), [['p'], ['p', 'list'], ['p']]);
  assert.equal(plain(list.items[1][1].items[0][0].children), 'nested\ncarried on');
  assert.deepEqual([numbered.ordered, numbered.start, numbered.items.length], [true, 3, 2]);
  assert.deepEqual(numbered.items[1][1], { type: 'code', lang: 'c', text: 'x++;' });
});

test('tables: GFM pipes, escaped \\| in code, alignment, short non-word columns centred', () => {
  const [table] = parseMaterial('| a | b | a \\| b | name | op |\n|---|--:|---|:--|---|\n| 0 | 1 | 1 | or | `a \\| b` |\n| 1 | 1 | 1 | and | `a & b` |');
  assert.deepEqual(table.align, ['center', 'right', 'center', 'left', null]);
  assert.equal(plain(table.head[2]), 'a | b');
  assert.deepEqual(table.rows[0][4], [{ type: 'code', text: 'a | b' }]);
  assert.deepEqual(table.rows.map(row => plain(row[0])), ['0', '1']);
  assert.deepEqual(types(parseMaterial('a | b\n--- | --- | ---')), ['p']); // the delimiter must match the header
});

test('code: languages by name or by look; C and RISC-V highlighting', () => {
  assert.deepEqual(parseMaterial('```riscv\nret\n```\n\n```\naddi sp, sp, -16\n```\n\n```\nint x = 1;\n```\n\n```text\n0101\n```').map(b => b.lang), ['asm', 'asm', 'c', 'text']);
  const tokens = (code, lang) => highlightCode(code, lang).filter(t => t.type).map(t => `${t.type}:${t.text}`);
  assert.deepEqual(tokens('#include <stdio.h>\nuint32_t x = 0x2A; /* c */ char *s = "hi"; return 0;', 'c'), ['kw:#include', 'kw:uint32_t', 'num:0x2A', 'com:/* c */', 'kw:char', 'str:"hi"', 'kw:return', 'num:0']);
  assert.deepEqual(tokens('main:\n  addi sp, sp, -16  # frame\n  sd ra, 8(sp)\n.L2: jalr x0, 0(ra)', 'asm'), ['kw:addi', 'reg:sp', 'reg:sp', 'num:-16', 'com:# frame', 'kw:sd', 'reg:ra', 'num:8', 'reg:sp', 'kw:jalr', 'reg:x0', 'num:0', 'reg:ra']);
  assert.equal(highlightCode('spam s12 a8 x32', 'asm').filter(t => t.type === 'reg').length, 0);
  assert.equal(highlightCode('a < b', 'text').map(t => t.text).join(''), 'a < b');
});

test('boardTextParts keeps the legacy shape on the same math rules', () => {
  assert.deepEqual(boardTextParts('price $5 and $x$ here'), [{ type: 'text', text: 'price $5 and ' }, { type: 'math', text: 'x', display: false }, { type: 'text', text: ' here' }]);
  assert.deepEqual(boardTextParts(''), []);
});
