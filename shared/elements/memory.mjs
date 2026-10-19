// A memory or state diagram with no program (docs/system-spec.md §15b): cells (an address, a value, a label), pointers to
// cells, and a short list of operations (store, point, copy) the engine applies one at a time. A learner predicts what a
// cell or a pointer will hold after an operation and steps it to see; every state comes from applying the operations,
// never from what anyone said. A pointer holds an address, never the value there.
import { checks, str, clip } from './check.mjs';

const { fail, arr, object } = checks('memory');
const OPS = ['store', 'point', 'copy'];

export const purpose = 'a memory or state diagram: cells (address, value, label) and pointers, changed by a short list of operations (store, point, copy) the learner steps through one at a time';

export const example = {
  cells: [{ address: '0x7ff0', value: '5', label: 'x' }, { address: '0x7ff4', value: '9', label: 'y' }],
  pointers: [{ label: 'p', at: '0x7ff0' }],
  ops: [{ op: 'store', address: '0x7ff0', value: '20', note: '*p = 20;' }, { op: 'point', label: 'p', at: '0x7ff4', note: 'p = &y;' }, { op: 'copy', from: '0x7ff0', to: '0x7ff4', note: '*p = x;' }],
  caption: 'p holds an address; *p is the cell at that address.',
};

export const rules = `spec: {"cells", "pointers", "ops", "caption"}:
- cells: 1 to 24 boxes, top row first: {"address": "0x7ff0" (or any short unique name, 18 characters at most), "value": "5" (text, 20 at most; "" for an empty slot), "label": "x" (optional, 24 at most)}.
- A raw byte or word of memory is written in hex ("0x9c", "0x0000ffff"): that is how memory holds it, and the page shows a value as written. Decimal only when the case is about decimal values (an array of ints the program adds up).
- pointers: up to 8 at the start: {"label": "p" (12 characters at most, unique), "at": the address of the cell it points at}.
- ops: up to 24, applied in order, one per step: {"op": "store", "address", "value"} writes a value into a cell; {"op": "point", "label", "at"} aims a pointer (new or old; 8 pointers at most in all) at a cell; {"op": "copy", "from", "to"} copies one cell's value into another. Each may carry "note": the line of code or the sentence it stands for (60 characters at most), shown as that op's line; without one the page writes the op plainly.
- caption: optional, one short sentence under the drawing.
Never write the values after an op: the engine applies the ops. What a learner can predict and the engine checks: "mem <address>" for each cell, the cell's label when no other cell has it, and "ptr <label>" (the address the pointer holds). A checkpoint waits before an op runs: {"at": "op 2", "predict": ["mem 0x7ff4"]}.
Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["first_contact", "repair"], task: "predict: checkpoints at 'op N' (before op N runs); predict 'mem <address>' or 'ptr <label>' (the address it holds).",  adapters: ['A1'], modes: ['predict', 'change', 'teach', 'compare'], translations: ['stepper', 'tracetable'], reveals: ['F1', 'F6', 'F7', 'F8'],
  notice: ['which cell a store writes', 'that a pointer holds an address, not the value there', 'which cells change and which stay'] };

export function validate(input) {
  const raw = object(input), seen = new Set();
  const cells = arr(raw.cells, 'cells', 1, 24).map((c, i) => {
    if (!c || typeof c !== 'object') fail(`cells[${i}] must be an object like {"address": "0x7ff0", "value": "5", "label": "x"}`);
    const address = clip(str(c.address).trim(), 18);
    if (!address) fail(`cells[${i}].address is required: an address like "0x7ff0", or a short name`);
    if (seen.has(address)) fail(`two cells have the address ${address}; give each its own`);
    seen.add(address);
    if (c.value === undefined || c.value === null) fail(`cells[${i}].value is required ("" for an empty slot)`);
    return { address, value: clip(str(c.value).trim(), 20), label: clip(str(c.label).trim(), 24) };
  });
  const cell = (address, where) => { const a = str(address).trim(); if (!seen.has(a)) fail(`${where}: ${JSON.stringify(address)} is not a cell's address (the cells are ${[...seen].slice(0, 8).join(', ')})`); return a; };
  const named = new Set();
  const pointer = (label, where) => {
    const name = clip(str(label).trim(), 12);
    if (!name) fail(`${where}: a pointer needs a label`);
    if (!named.has(name) && named.size >= 8) fail(`${where}: at most 8 pointers in all`);
    named.add(name);
    return name;
  };
  const pointers = (raw.pointers == null ? [] : arr(raw.pointers, 'pointers', 0, 8)).map((p, i) => {
    if (named.has(clip(str(p?.label).trim(), 12))) fail(`two pointers are named ${str(p?.label).trim()}`);
    return { label: pointer(p?.label, `pointers[${i}].label`), at: cell(p?.at, `pointers[${i}].at`) };
  });
  const ops = (raw.ops == null ? [] : arr(raw.ops, 'ops', 0, 24)).map((o, i) => {
    const at = `ops[${i}]`;
    if (!o || !OPS.includes(o.op)) fail(`${at}.op must be one of ${OPS.join(', ')}`);
    const note = clip(str(o.note).trim(), 60);
    if (o.op === 'store') {
      if (o.value === undefined || o.value === null) fail(`${at}: a store needs the value it writes`);
      return { op: 'store', address: cell(o.address, `${at}.address`), value: clip(str(o.value).trim(), 20), note };
    }
    if (o.op === 'copy') return { op: 'copy', from: cell(o.from, `${at}.from`), to: cell(o.to, `${at}.to`), note };
    return { op: 'point', label: pointer(o.label, `${at}.label`), at: cell(o.at, `${at}.at`), note };
  });
  return { cells, pointers, ops, caption: clip(str(raw.caption).trim(), 160) };
}

/** The cells (address → value) and pointers (label → address) after the first `n` ops. */
function apply(spec, n) {
  const cells = Object.fromEntries(spec.cells.map(c => [c.address, c.value])), ptrs = Object.fromEntries(spec.pointers.map(p => [p.label, p.at]));
  for (const o of spec.ops.slice(0, n)) {
    if (o.op === 'store') cells[o.address] = o.value;
    else if (o.op === 'copy') cells[o.to] = cells[o.from];
    else ptrs[o.label] = o.at;
  }
  return { cells, ptrs };
}
/** An op as its line on the page: its note, else the op written plainly. */
/** The text the view draws: the caption, the cells' labels, and each op's line (its note, else the op written out). */
export const text = state => [state.spec.caption, ...state.spec.cells.map(c => c.label), ...state.spec.ops.map(o => opText(o))].filter(Boolean);
export const opText = o => o.note || (o.op === 'store' ? `store ${o.value} at ${o.address}` : o.op === 'copy' ? `copy ${o.from} to ${o.to}` : `point ${o.label} at ${o.at}`);
/** Every pointer the diagram ever has: the starting ones, then those the ops add. */
const labelsOf = spec => [...new Set([...spec.pointers.map(p => p.label), ...spec.ops.filter(o => o.op === 'point').map(o => o.label)])];

export const init = spec => ({ spec, at: 0, ...apply(spec, 0) });
/** The action that moves it on: the next op. */
export const next = 'next';
export function step(state, action) {
  const to = action === 'next' ? state.at + 1 : action === 'back' ? state.at - 1 : action === 'reset' ? 0 : fail(`unknown action ${JSON.stringify(action)}; use next, back or reset`);
  const at = Math.max(0, Math.min(state.spec.ops.length, to));
  return { spec: state.spec, at, ...apply(state.spec, at) };
}
export const passes = (state, action) => action === 'next' && state.at < state.spec.ops.length ? [`op ${state.at + 1}`] : [];
/** "mem <address>" per cell, the cell's label when it is the only cell with it, and "ptr <label>" (null before the op that makes it). */
export function values(state) {
  const out = {}, labels = state.spec.cells.map(c => c.label).filter(Boolean);
  for (const c of state.spec.cells) {
    out[`mem ${c.address}`] = state.cells[c.address];
    if (c.label && labels.indexOf(c.label) === labels.lastIndexOf(c.label)) out[c.label] = state.cells[c.address];
  }
  for (const label of labelsOf(state.spec)) out[`ptr ${label}`] = state.ptrs[label] ?? null;
  return out;
}
export function brief(state) {
  const { spec, at } = state, next = spec.ops[at];
  const cells = spec.cells.map(c => `${c.label || c.address}=${state.cells[c.address] === '' ? '(empty)' : state.cells[c.address]}`).join(', ');
  const ptrs = Object.entries(state.ptrs).map(([label, a]) => `${label}→${a}`).join(', ');
  return `${at} of ${spec.ops.length} ops done${next ? ` (next: ${opText(next)})` : ''}; ${cells}${ptrs ? `; ${ptrs}` : ''}`.slice(0, 400);
}
/** Each cell, each pointer and each op. */
export const anchors = state => [...state.spec.cells.map(c => `mem-${c.address}`), ...labelsOf(state.spec).map(label => `ptr-${label}`), ...state.spec.ops.map((_, i) => `op-${i + 1}`)];
/** A checkpoint's place: "op N", before op N runs. */
export function gate(state, at) {
  const m = /^op\s+(\d+)$/i.exec(String(at ?? '').trim());
  if (!m) fail(`a checkpoint's "at" is "op N" (before op N runs), not ${JSON.stringify(at)}`);
  if (+m[1] < 1 || +m[1] > state.spec.ops.length) fail(`checkpoint at op ${+m[1]}: there ${state.spec.ops.length === 1 ? 'is 1 op' : `are ${state.spec.ops.length} ops`}`);
  return `op ${+m[1]}`;
}
