import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDiagram, DIAGRAM_TYPES } from '../src/visuals/diagram.mjs';

const SAMPLES = {
  plot: { xLabel: 'n', yLabel: 'steps', series: [{ name: 'n log n', points: [[1, 0], [2, 2], [4, 8], [8, 24]] }, { name: 'n²', points: [[1, 1], [2, 4], [4, 16]] }] },
  bars: { labels: ['A', 'B', 'C'], values: [3, 7, -2], unit: 'ms' },
  tree: { root: { label: '8', children: [{ label: '4', children: [{ label: '2' }, { label: '2' }] }, { label: '4' }] } },
  array: { items: [5, 2, 9, 1], highlight: [1], pointers: [{ index: 0, label: 'i' }, { index: 3, label: 'j' }] },
  number_line: { min: 0, max: 10, marks: [{ value: 3, label: 'a' }], ranges: [{ from: 2, to: 6, label: 'window' }] },
  table: { columns: ['n', 'T(n)'], rows: [[1, 1], [2, 4]] },
  graph: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ from: 'a', to: 'b', directed: true, label: '3' }, { from: 'b', to: 'c' }, { from: 'c', to: 'c', directed: true }] },
  bits: { bits: '01000000101000000000000000000000', groups: [{ from: 0, to: 0, label: 'sign' }, { from: 1, to: 8, label: 'exponent' }, { from: 9, to: 31, label: 'mantissa' }], caption: '5.0 as a float' },
  memory: { cells: [{ address: '0x7ff8', value: '0x10078', label: 'saved ra' }, { address: '0x7ff0', value: 42, label: 'x' }, { address: '0x7fe8', value: '' }], pointers: [{ at: 1, label: 'fp' }, { at: 2, label: 'sp' }], caption: 'A frame' },
  chart: { type: 'step', xScale: 'log2', xLabel: 'size', yLabel: 'cycles', series: [{ name: 'L1', points: [[1024, 1], [32768, 4], [1048576, 12]] }], annotations: [{ x: 32768, label: 'L1' }] },
  waveform: { cycles: 4, signals: [{ name: 'clk' }, { name: 'D', values: '01x.' }, { name: 'addr', values: ['0x0', '0x4', 'x', '0x8'] }], markers: [{ at: 2, label: 'edge' }] },
  pipeline: { rows: [{ label: 'lw x1, 0(x2)', start: 1 }, { label: 'add x3, x1, x4', start: 2, stalls: [4] }], hazards: [{ fromRow: 0, fromCycle: 4, toRow: 1, toCycle: 5, label: 'x1' }] },
  kmap: { vars: ['A', 'B', 'C'], values: '0010 0111', groups: [{ cells: [5, 6], label: 'AC' }, { cells: [2, 6], label: 'BC' }] },
  truth_table: { inputs: ['A', 'B'], outputs: [{ name: 'F', values: '0110' }] },
};

test('every diagram type renders one well-formed SVG', () => {
  assert.deepEqual([...DIAGRAM_TYPES].sort(), Object.keys(SAMPLES).sort());
  for (const [type, data] of Object.entries(SAMPLES)) {
    const out = renderDiagram({ type, data: JSON.stringify(data) });
    assert.match(out.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+" width="\d+" height="\d+" role="img" aria-label="[^"]+">/, type);
    assert.ok(out.svg.endsWith('</svg>'), type);
    assert.equal((out.svg.match(/<svg/g) || []).length, 1, type);
    assert.ok(Number.isInteger(out.width) && Number.isInteger(out.height) && out.width > 0 && out.height > 0, type);
    assert.equal(/NaN|undefined|Infinity/.test(out.svg), false, type);
  }
});

test('bits: one cell per bit, positions above field edges, fields labelled; lists and spaced strings work too', () => {
  const out = renderDiagram({ type: 'bits', data: { bits: '1111 1111 0000 0001 0000 0001 0001 0011', groups: [{ from: 25, to: 31, label: 'opcode' }, { from: 0, to: 11, label: 'imm[11:0]' }, { from: 12, to: 16, label: 'rs1' }, { from: 17, to: 19, label: 'funct3' }, { from: 20, to: 24, label: 'rd' }] } });
  const digits = [...out.svg.matchAll(/font-family="ui-monospace[^"]*"[^>]*>([01])<\/text>/g)].map(m => m[1]).join('');
  assert.equal(digits, '11111111000000010000000100010011');
  for (const label of ['opcode', 'imm[11:0]', 'rs1', 'funct3', 'rd', '>31<', '>20<', '>19<', '>0<']) assert.ok(out.svg.includes(label), label);
  assert.equal(renderDiagram({ type: 'bits', data: { bits: [0, 1, 0, 0, 0, 0, 0, 1] } }).svg.match(/font-family="ui-monospace[^"]*"[^>]*>[01]<\/text>/g).length, 8);
});

test('bits too long for the page wrap into rows aligned on bit positions; captions break to fit', () => {
  const digits = out => [...out.svg.matchAll(/y="([\d.]+)" font-family="ui-monospace[^"]*"[^>]*>([01])<\/text>/g)];
  const rows = out => new Set(digits(out).map(m => m[1])).size, phone = { width: 322 };
  const desk = renderDiagram({ type: 'bits', data: SAMPLES.bits }), narrow = renderDiagram({ type: 'bits', data: SAMPLES.bits }, phone);
  for (const [out, count] of [[desk, 1], [narrow, 2]]) {
    assert.equal(digits(out).map(m => m[2]).join(''), SAMPLES.bits.bits);
    assert.equal(rows(out), count);
  }
  assert.ok(narrow.width <= 322);
  assert.equal(narrow.svg.match(/>mantissa</g).length, 2, 'a field split across rows is labelled in each');
  assert.equal(rows(renderDiagram({ type: 'bits', data: { bits: '01'.repeat(32) } })), 2, '64 bits take two rows of 32 on a desktop page');
  assert.ok(renderDiagram({ type: 'memory', data: { cells: [{ value: 1 }], caption: 'the frame after the prologue has saved ra and s0 and moved sp down by sixteen bytes' } }, phone).width <= 322);
});

test('number line labels use a true minus, like the ticks', () => {
  const { svg } = renderDiagram({ type: 'number_line', data: { min: -8, max: 7, marks: [{ value: -5 }, { value: -3, label: '-3' }] } });
  assert.ok(svg.includes('>−3<') && !/>-\d/.test(svg));
});

test('memory: rows top to bottom with addresses, values, labels and pointers', () => {
  const { svg } = renderDiagram({ type: 'memory', data: SAMPLES.memory });
  const order = ['0x7ff8', '0x10078', 'saved ra', '0x7ff0', '42', 'x', '0x7fe8'].map(s => svg.indexOf(`>${s}<`));
  assert.ok(order.every((at, i) => at > 0 && (!i || at > order[i - 1])), 'rows in order');
  assert.ok(svg.includes('>fp<') && svg.includes('>sp<') && svg.includes('>A frame<'));
});

test('labels are escaped', () => {
  for (const out of [renderDiagram({ type: 'bars', data: { labels: ['<script>'], values: [1] } }), renderDiagram({ type: 'memory', data: { cells: [{ value: '<img src=x onerror=alert(1)>' }] } })]) {
    assert.equal(/<script|<img/.test(out.svg), false);
  }
});

test('malformed data is refused with a message the agent can act on', () => {
  for (const [bad, says] of [
    [{ type: 'plot', data: { series: [] } }, /series must be a list/],
    [{ type: 'bars', data: { labels: ['a', 'b'], values: [1] } }, /same length/],
    [{ type: 'tree', data: {} }, /root/],
    [{ type: 'array', data: { items: [1], pointers: [{ index: 5, label: 'x' }] } }, /pointers\[0\]\.index/],
    [{ type: 'number_line', data: { min: 5, max: 1 } }, /max must be greater/],
    [{ type: 'number_line', data: { min: 0, max: 1, marks: [{ value: 3 }] } }, /between min and max/],
    [{ type: 'table', data: { columns: ['a', 'b'], rows: [[1]] } }, /row 0/],
    [{ type: 'graph', data: { nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'z' }] } }, /edges\[0\]/],
    [{ type: 'bits', data: { bits: '0102' } }, /bit 3 is "2"/],
    [{ type: 'bits', data: { bits: '' } }, /1 to 64 bits/],
    [{ type: 'bits', data: { bits: '0101', groups: [{ from: 0, to: 4 }] } }, /groups\[0\]/],
    [{ type: 'bits', data: { bits: '0101', groups: [{ from: 0, to: 2 }, { from: 2, to: 3 }] } }, /overlap/],
    [{ type: 'memory', data: { cells: [] } }, /cells must be a list/],
    [{ type: 'memory', data: { cells: [{ address: '0x0' }] } }, /cells\[0\]\.value/],
    [{ type: 'memory', data: { cells: [{ value: 1 }], pointers: [{ at: 1, label: 'sp' }] } }, /pointers\[0\]\.at/],
    [{ type: 'pie', data: {} }, /unknown type "pie"; use one of/],
    [{ type: 'toString', data: {} }, /unknown type/],
    [{ type: 'plot', data: '{not json' }, /not valid JSON/],
  ]) assert.throws(() => renderDiagram(bad), error => /^Invalid diagram: /.test(error.message) && says.test(error.message), JSON.stringify(bad));
});
