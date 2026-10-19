// The cs3410 fixture's belief library for simulated students (evals/understanding/sim): skills a student can be asked,
// each solved in code, and misconceptions as executable buggy rules that compute the wrong answer each belief produces.
// Written independently of any Study (never imported from backend/understanding), so a Study's diagnosis is graded
// against beliefs it did not author. Provenance: docs/research/course-decomposition.md §6.5 (C = catalogued study,
// N = the course's notes warn against it, I = inferred). A rule returns null where its belief changes nothing.

const W = { char: 1, short: 2, int: 4, long: 8, double: 8, float: 4 };
const hex = n => `0x${BigInt.asUintN(64, BigInt(n)).toString(16)}`;
const bitsOk = b => typeof b === 'string' && /^[01]{2,16}$/.test(b);
const unsignedOf = b => parseInt(b, 2), signedOf = b => unsignedOf(b) - (b[0] === '1' ? 2 ** b.length : 0);
const ext = (op, v) => {
  const n = { b: 8, h: 16, w: 32 }[op[1]], x = Number(BigInt(v) & ((1n << BigInt(n)) - 1n)), unsigned = op.endsWith('u');
  return unsigned ? x : x >= 2 ** (n - 1) ? x - 2 ** n : x;
};

export const concepts = [
  { id: 'tc', topicId: 'top_19GPgvM7VX2py6Kk', title: "Two's complement", idea: "the top bit's place value is negative, minus 2 to the n minus 1, and the other bits keep their positive weights, so you add up the weights of the ones", interactivity: 'low', memory: false },
  { id: 'ptr', topicId: 'top_l8nI67tXPqtbjJsV', title: 'Pointer arithmetic', idea: 'adding n to a pointer moves it by n whole elements, so the address grows by n times the size of what it points to', interactivity: 'low', memory: true },
  { id: 'ext', topicId: 'top_lxQfRxnXym12Wg9d', title: 'Sign and zero extension', idea: 'the plain loads copy the top bit into all the upper bits, which keeps a signed value; the u loads fill them with zeros, which keeps an unsigned value', interactivity: 'low', memory: true },
];

export const bugs = [
  { id: 'sign_magnitude', concept: 'tc', errorKind: 'F7', belief: 'the leading 1 is just a minus sign and the rest is the magnitude', provenance: 'C (Herman, Zilles & Loui 2011)', detector: { type: 'execute' } },
  { id: 'flip_add_one_read', concept: 'tc', errorKind: 'F6', belief: 'to read any pattern you flip the bits and add one', provenance: 'C (Herman, Zilles & Loui 2011)', detector: { type: 'execute' } },
  { id: 'carry_out_overflow', concept: 'tc', errorKind: 'F5', belief: 'overflow means a carry out of the top bit', provenance: 'C (Herman, Zilles & Loui 2011)', detector: { type: 'execute' } },
  { id: 'adds_bytes', concept: 'ptr', errorKind: 'F6', belief: 'p + n adds n bytes to the address, whatever p points to', provenance: 'N (L08 states the rule) / I (the error)', detector: { type: 'execute' } },
  { id: 'zero_extends_always', concept: 'ext', errorKind: 'F6', belief: 'a load fills the upper bits with zeros, whichever load it is', provenance: 'N (L16)', detector: { type: 'execute' } },
  { id: 'extension_never_changes', concept: 'ext', errorKind: 'F5', belief: 'extending never changes a value, so the unsigned loads still give the signed value', provenance: 'N (L16)', detector: { type: 'execute' } },
];

/** Skills: what the tutor can ask, in code. `params` describes the parameters the perception extracts from a question. */
export const skills = [
  { id: 'tc_decode', concept: 'tc', describe: "the decimal value of a bit pattern read as two's complement (the pattern's length is its width)", params: { bits: 'the bit pattern, e.g. "1011"' },
    valid: p => bitsOk(p.bits), solve: p => signedOf(p.bits), difficulty: p => (p.bits[0] === '1' ? 0.3 : -0.5),
    bugs: { sign_magnitude: p => p.bits[0] === '1' ? -unsignedOf(p.bits.slice(1)) : null, flip_add_one_read: p => { const n = p.bits.length, f = ((~unsignedOf(p.bits) & (2 ** n - 1)) + 1) & (2 ** n - 1); return p.bits[0] === '0' ? f : -f; } } },
  { id: 'tc_encode', concept: 'tc', describe: "the bit pattern that represents a decimal value in n-bit two's complement", params: { value: 'the integer', width: 'the number of bits' },
    valid: p => Number.isInteger(p.value) && Number.isInteger(p.width) && p.width >= 2 && p.width <= 16 && p.value >= -(2 ** (p.width - 1)) && p.value < 2 ** (p.width - 1),
    solve: p => (p.value < 0 ? p.value + 2 ** p.width : p.value).toString(2).padStart(p.width, '0'), difficulty: p => (p.value < 0 ? 0.4 : -0.5),
    bugs: { sign_magnitude: p => p.value < 0 && -p.value < 2 ** (p.width - 1) ? `1${(-p.value).toString(2).padStart(p.width - 1, '0')}` : null } },
  { id: 'tc_range', concept: 'tc', describe: "the smallest and the largest value n-bit two's complement can represent (answer as \"min, max\")", params: { width: 'the number of bits' },
    valid: p => Number.isInteger(p.width) && p.width >= 2 && p.width <= 16, solve: p => `${-(2 ** (p.width - 1))}, ${2 ** (p.width - 1) - 1}`, difficulty: () => 0.2,
    bugs: { sign_magnitude: p => `${-(2 ** (p.width - 1) - 1)}, ${2 ** (p.width - 1) - 1}` } },
  { id: 'tc_fits', concept: 'tc', describe: "whether a decimal value fits in n-bit two's complement (yes or no)", params: { value: 'the integer', width: 'the number of bits' },
    valid: p => Number.isInteger(p.value) && Number.isInteger(p.width) && p.width >= 2 && p.width <= 16, solve: p => p.value >= -(2 ** (p.width - 1)) && p.value < 2 ** (p.width - 1) ? 'yes' : 'no', difficulty: p => p.value === -(2 ** (p.width - 1)) || p.value === 2 ** (p.width - 1) ? 0.5 : 0,
    bugs: { sign_magnitude: p => p.value === -(2 ** (p.width - 1)) ? 'no' : null } },
  { id: 'tc_overflow', concept: 'tc', describe: "whether a + b overflows in n-bit two's complement (answer yes or no)", params: { a: 'an integer', b: 'an integer', width: 'the number of bits' },
    valid: p => [p.a, p.b, p.width].every(Number.isInteger) && p.width >= 2 && p.width <= 16, solve: p => { const lo = -(2 ** (p.width - 1)), hi = 2 ** (p.width - 1) - 1, s = p.a + p.b; return s < lo || s > hi ? 'yes' : 'no'; }, difficulty: () => 0.6,
    bugs: { carry_out_overflow: p => { const m = 2 ** p.width, u = ((p.a % m) + m) % m + ((p.b % m) + m) % m; return u >= m ? 'yes' : 'no'; } } },
  { id: 'ptr_add', concept: 'ptr', describe: 'the address p + n, for a pointer p of element type T (char, short, int, long, float or double) holding address A', params: { address: 'the address A, e.g. "0x1000"', n: 'the integer n', type: 'the element type T' },
    valid: p => /^0x[0-9a-f]+$/i.test(p.address ?? '') && Number.isInteger(p.n) && W[p.type], solve: p => hex(BigInt(p.address) + BigInt(p.n * W[p.type])), difficulty: p => p.type === 'char' ? -0.5 : 0.2,
    bugs: { adds_bytes: p => W[p.type] === 1 ? null : hex(BigInt(p.address) + BigInt(p.n)) } },
  { id: 'ptr_index', concept: 'ptr', describe: 'the address of a[i], for an array a of element type T starting at address A', params: { address: 'the start address A, e.g. "0x1000"', i: 'the index i', type: 'the element type T' },
    valid: p => /^0x[0-9a-f]+$/i.test(p.address ?? '') && Number.isInteger(p.i) && W[p.type], solve: p => hex(BigInt(p.address) + BigInt(p.i * W[p.type])), difficulty: () => 0,
    bugs: { adds_bytes: p => W[p.type] === 1 ? null : hex(BigInt(p.address) + BigInt(p.i)) } },
  { id: 'ext_load', concept: 'ext', describe: 'the value (in decimal) a RISC-V load (lb, lbu, lh, lhu, lw or lwu) leaves in its register, given the bytes it loads as one hex value', params: { op: 'the load instruction', value: 'the loaded byte, half or word, e.g. "0x9c"' },
    valid: p => /^l[bhw]u?$/.test(p.op ?? '') && /^0x[0-9a-f]+$/i.test(p.value ?? ''), solve: p => ext(p.op, p.value), difficulty: p => p.op.endsWith('u') ? 0 : 0.4,
    bugs: { zero_extends_always: p => p.op.endsWith('u') ? null : ext(`${p.op}u`, p.value), extension_never_changes: p => p.op.endsWith('u') ? ext(p.op.slice(0, -1), p.value) : null } },
];

/** The held-out unassisted test (pre and post): fixed items, never shown to the tutor. */
export const tests = [
  { skill: 'tc_decode', params: { bits: '1011' } }, { skill: 'tc_decode', params: { bits: '110' } }, { skill: 'tc_decode', params: { bits: '0101' } }, { skill: 'tc_decode', params: { bits: '10000001' } },
  { skill: 'tc_encode', params: { value: -6, width: 4 } }, { skill: 'tc_encode', params: { value: -1, width: 8 } }, { skill: 'tc_range', params: { width: 6 } }, { skill: 'tc_fits', params: { value: -32, width: 6 } }, { skill: 'tc_fits', params: { value: 32, width: 6 } },
  { skill: 'tc_overflow', params: { a: 5, b: 4, width: 4 } }, { skill: 'tc_overflow', params: { a: -3, b: -2, width: 4 } }, { skill: 'tc_overflow', params: { a: -8, b: -1, width: 4 } },
  { skill: 'ptr_add', params: { address: '0x2000', n: 3, type: 'int' } }, { skill: 'ptr_add', params: { address: '0x10', n: 2, type: 'double' } }, { skill: 'ptr_add', params: { address: '0x400', n: 5, type: 'char' } },
  { skill: 'ptr_index', params: { address: '0x800', i: 6, type: 'short' } }, { skill: 'ptr_index', params: { address: '0x1000', i: 4, type: 'long' } },
  { skill: 'ext_load', params: { op: 'lb', value: '0x9c' } }, { skill: 'ext_load', params: { op: 'lbu', value: '0x9c' } }, { skill: 'ext_load', params: { op: 'lh', value: '0x8001' } }, { skill: 'ext_load', params: { op: 'lb', value: '0x7f' } },
];

/** Practice items for a tutor that needs them (the fixed sequence of the ablation): never the tests. */
export const practice = [
  { skill: 'tc_decode', params: { bits: '1101' } }, { skill: 'tc_decode', params: { bits: '0110' } }, { skill: 'tc_decode', params: { bits: '1000' } }, { skill: 'tc_overflow', params: { a: 6, b: 3, width: 4 } }, { skill: 'tc_encode', params: { value: -3, width: 4 } },
  { skill: 'ptr_add', params: { address: '0x3000', n: 2, type: 'int' } }, { skill: 'ptr_add', params: { address: '0x40', n: 3, type: 'short' } }, { skill: 'ptr_index', params: { address: '0x100', i: 2, type: 'double' } },
  { skill: 'ext_load', params: { op: 'lb', value: '0x80' } }, { skill: 'ext_load', params: { op: 'lbu', value: '0xf0' } }, { skill: 'ext_load', params: { op: 'lh', value: '0xfffe' } },
];
