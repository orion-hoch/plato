// A logic circuit the student flips switches on (CS 3410: gates, latches, flip-flops). The model places parts on
// a grid; evaluate() settles it, the same on the server (which rejects a circuit that never settles) and in the
// page (src/elements/Circuit.jsx).
import { checks, str, clip } from './check.mjs';

const { fail, int, arr, object } = checks('circuit');
const GATES = {
  and: v => v.every(Boolean), or: v => v.some(Boolean), xor: v => v.filter(Boolean).length % 2 === 1,
  nand: v => !v.every(Boolean), nor: v => !v.some(Boolean), xnor: v => v.filter(Boolean).length % 2 === 0,
  not: v => !v[0], buf: v => Boolean(v[0]),
};
/** Latches and flip-flops, by their input pins in order. */
export const PINS = { dlatch: ['D', 'C'], dff: ['D', 'clk'], srlatch: ['S', 'R'] };
const TYPES = ['input', 'clock', ...Object.keys(GATES), ...Object.keys(PINS), 'output'];
const ID = /^[A-Za-z]\w{0,11}$/, REF = /^([A-Za-z]\w{0,11})(?:\.(q|qn))?$/i;
export const isSwitch = part => part.type === 'input' || part.type === 'clock';
export const nameOf = part => part.label || part.id;

export const purpose = 'a logic circuit the student can flip switches on: gates, latches and flip-flops with clocks, every wire showing its live value';

export const example = {
  parts: [
    { id: 'R', type: 'input', col: 0, row: 0 },
    { id: 'S', type: 'input', col: 0, row: 1 },
    { id: 'top', type: 'nor', in: ['R', 'bot'], value: 0, col: 1, row: 0 },
    { id: 'bot', type: 'nor', in: ['S', 'top'], value: 1, col: 1, row: 1 },
    { id: 'Q', type: 'output', in: ['top'], col: 2, row: 0 },
  ],
  caption: 'Each NOR gate feeds the other, so Q keeps its value while S and R are both 0.',
};

export const rules = `spec: {"parts": [...], "caption": "..."}. Each part is {"id", "type", "in", "value", "col", "row", "label"}:
- id: a letter, then up to 11 letters, digits or _; unique. The page names the part by it unless label (12 characters at most) is given.
- type: input or clock (switches the student flips), and, or, xor, nand, nor, xnor, not, buf, dlatch (D latch), dff (D flip-flop, rising edge), srlatch, output (a lamp).
- in: the part's inputs in order, as part ids; "X.qn" is the inverted output of latch or flip-flop X ("X" is its Q). Pins: dlatch [D, C] (stores D while C is 1), dff [D, clock], srlatch [S, R]. not, buf and output take 1 input; the other gates 2 to 4; input and clock none.
- value: 0 or 1 to start with (default 0): a switch's position, a latch's or flip-flop's stored bit, or, for a gate in a feedback loop, its starting output (give the gates of a loop consistent values).
- col 0-7 and row 0-7 place it on a grid, one part per cell: switches in column 0, signals flowing left to right, outputs in the last column, each part to the right of what feeds it (feedback may loop back). Use as few columns as the circuit needs: four or fewer fit a phone.
- caption: optional, one short sentence under the drawing.
At most 24 parts, 6 switches and 4 latches or flip-flops. Use the built-in dlatch, dff and srlatch unless the point is how one is built from gates. A circuit that never settles for some setting of its switches is rejected.
Example: ${JSON.stringify(example)}`;

export function validate(input) {
  const raw = object(input), ids = new Set(), cells = new Set();
  const parts = arr(raw.parts, 'parts', 1, 24).map((p, i) => {
    if (!p || typeof p !== 'object') fail(`parts[${i}] must be an object`);
    const id = str(p.id);
    if (!ID.test(id)) fail(`parts[${i}].id ${JSON.stringify(p.id)} must be a letter, then up to 11 letters, digits or _`);
    if (id in Object.prototype) fail(`parts[${i}].id ${id} is a reserved word; pick another name`); // evaluate() keys plain objects by id
    if (ids.has(id)) fail(`two parts are named ${id}`);
    ids.add(id);
    if (!TYPES.includes(p.type)) fail(`${id}.type must be one of ${TYPES.join(', ')}`);
    const col = int(p.col, `${id}.col`, 0, 7), row = int(p.row, `${id}.row`, 0, 7);
    if (cells.has(`${col},${row}`)) fail(`${id} is in a cell another part already has (col ${col}, row ${row}); give each part its own cell`);
    cells.add(`${col},${row}`);
    const ins = p.in === undefined || p.in === null ? [] : arr(typeof p.in === 'string' ? p.in.split(/[\s,]+/).filter(Boolean) : p.in, `${id}.in`, 0, 4).map(str);
    const [lo, hi] = isSwitch(p) ? [0, 0] : PINS[p.type] ? [2, 2] : ['not', 'buf', 'output'].includes(p.type) ? [1, 1] : [2, 4];
    if (ins.length < lo || ins.length > hi) fail(`${id} (${p.type}) takes ${lo === hi ? lo : `${lo} to ${hi}`} input${hi === 1 ? '' : 's'}${PINS[p.type] ? ` [${PINS[p.type].join(', ')}]` : ''}, not ${ins.length}`);
    const value = p.value === undefined || p.value === null ? 0 : [0, 1, false, true].includes(p.value) ? Number(p.value) : fail(`${id}.value must be 0 or 1`);
    return { id, type: p.type, in: ins, label: clip(str(p.label).trim(), 12), value, col, row };
  });
  const byId = new Map(parts.map(p => [p.id, p]));
  for (const p of parts) p.in = p.in.map(ref => {
    const m = REF.exec(ref.trim()), source = m && byId.get(m[1]), pin = m?.[2]?.toLowerCase();
    if (!source) fail(`${p.id} takes an input from ${JSON.stringify(ref)}, which is not a part`);
    if (source.type === 'output') fail(`${p.id} takes an input from ${source.id}, which is an output lamp; wire it from what feeds ${source.id}`);
    if (pin && !PINS[source.type]) fail(`${ref}: only latches and flip-flops have .q and .qn; write ${source.id}`);
    return pin === 'qn' ? `${source.id}.qn` : source.id;
  });
  if (parts.filter(isSwitch).length > 6) fail('at most 6 inputs and clocks together');
  if (parts.filter(p => PINS[p.type]).length > 4) fail('at most 4 latches and flip-flops');
  const spec = { parts, caption: clip(str(raw.caption).trim(), 160) };
  // Every setting of the switches, reached one flip at a time (as the student would), must settle.
  // ponytail: one walk through the settings; a loop that only runs away after some other sequence of flips
  // slips through, and the page then shows its last values.
  const switches = parts.filter(isSwitch);
  let inputs = Object.fromEntries(switches.map(p => [p.id, p.value])), state = {};
  for (let i = 0; i < 2 ** switches.length; i++) {
    if (i) { const flip = switches[Math.log2(i & -i)]; inputs = { ...inputs, [flip.id]: 1 - inputs[flip.id] }; }
    const result = evaluate(spec, inputs, state);
    if (!result.settled) fail(`it never settles${switches.length ? ` when ${switches.map(p => `${nameOf(p)}=${inputs[p.id]}`).join(' ')}` : ''} (a loop that keeps changing); break the loop or use a latch`);
    state = result.state;
  }
  return spec;
}

/**
 * The circuit settled for `inputs` (switch id → 0|1), carrying on from `state` (the last result's, or {} to
 * start). Gates update in place, in the order written, until nothing changes, so cross-coupled gates hold a
 * value; a latch follows its inputs; a flip-flop takes D on its clock's rising edge. Returns { values (part id
 * → 0|1, and "id.qn" for latches and flip-flops), state, settled }.
 */
export function evaluate(spec, inputs = {}, state = {}) {
  const { parts } = spec, values = { ...state.values }, held = { ...state.held }, clocks = { ...state.clocks };
  const read = ref => values[ref] ?? 0, flops = parts.filter(p => p.type === 'dff');
  for (const p of parts) {
    values[p.id] ??= p.value;
    if (PINS[p.type]) { held[p.id] ??= p.value; values[`${p.id}.qn`] ??= 1 - p.value; }
  }
  const out = p => {
    const v = p.in.map(read);
    switch (p.type) {
      case 'input': case 'clock': return [inputs[p.id] ?? values[p.id]];
      case 'output': return [v[0]];
      case 'dlatch': { const q = v[1] ? v[0] : held[p.id]; return [q, 1 - q]; }
      case 'srlatch': return v[0] && v[1] ? [0, 0] : v[0] ? [1, 0] : v[1] ? [0, 1] : [held[p.id], 1 - held[p.id]];
      case 'dff': return [held[p.id], 1 - held[p.id]];
      default: return [GATES[p.type](v) ? 1 : 0];
    }
  };
  const settle = () => {
    for (let pass = 0; pass <= 2 * parts.length; pass++) {
      let moved = false;
      for (const p of parts) {
        const [q, qn] = out(p);
        if (values[p.id] !== q) { values[p.id] = q; moved = true; }
        if (qn !== undefined && values[`${p.id}.qn`] !== qn) { values[`${p.id}.qn`] = qn; moved = true; }
      }
      if (!moved) return true;
    }
    return false;
  };
  let settled = settle();
  // Flip-flops whose clock rose take D (as it was before any of them changed), then the circuit settles again;
  // one clocked by another's output (a ripple counter) takes its edge in the next round.
  for (let round = 0; settled && round <= flops.length; round++) {
    const rising = flops.filter(p => clocks[p.id] === 0 && read(p.in[1]) === 1);
    for (const p of flops) clocks[p.id] = read(p.in[1]);
    if (!rising.length) break;
    for (const p of rising) held[p.id] = read(p.in[0]);
    settled = settle();
  }
  for (const p of parts) if (p.type === 'dlatch' || (p.type === 'srlatch' && !(read(p.in[0]) && read(p.in[1])))) held[p.id] = values[p.id];
  return { values, state: { values, held, clocks }, settled };
}

// ---------- the circuit as a registry engine (shared/elements/registry.mjs): the task layer runs on these ----------
export const info = { bestFor: ["first_contact", "repair", "consolidation"], task: "predict: checkpoints at 'set A=1' or 'set A=1,B=0' (switches set before the reveal) or 'flip A'; predict any part by its shown name (a lamp, a gate, a latch), 0 or 1. construct: target {\"Q\": 1} (values the circuit must reach).",  adapters: ['A1'], modes: ['predict', 'change', 'construct', 'compare'], translations: ['tracetable'], reveals: ['F1', 'F7'],
  notice: ['which wires carry 1', 'what a latch holds when its enable is 0', 'which input a gate is waiting on'] };
const partNamed = (spec, name) => spec.parts.find(p => p.id === name) || spec.parts.find(p => nameOf(p).toLowerCase() === String(name).toLowerCase());
export function init(spec) {
  const inputs = Object.fromEntries(spec.parts.filter(isSwitch).map(p => [p.id, p.value]));
  return { spec, inputs, sim: evaluate(spec, inputs) };
}
/** "flip A", "set A=1" (several: "set A=1,B=0") or "reset". */
export function step(state, action) {
  if (action === 'reset') return init(state.spec);
  const flip = /^flip (\S+)$/.exec(action), set = /^set (.+)$/.exec(action), inputs = { ...state.inputs };
  if (flip) { const p = partNamed(state.spec, flip[1]); if (!p || !isSwitch(p)) fail(`${flip[1]} is not a switch`); inputs[p.id] = 1 - inputs[p.id]; }
  else if (set) for (const pair of set[1].split(',')) { const [name, v] = pair.split('=').map(x => x.trim()), p = partNamed(state.spec, name); if (!p || !isSwitch(p) || !['0', '1'].includes(v)) fail(`set ${pair}: name a switch and 0 or 1`); inputs[p.id] = +v; }
  else fail(`unknown action ${JSON.stringify(action)}; use "flip A", "set A=1" or reset`);
  return { ...state, inputs, sim: evaluate(state.spec, inputs, state.sim.state) };
}
export function passes(state, action) {
  const flip = /^flip (\S+)$/.exec(action), p = flip && partNamed(state.spec, flip[1]);
  return p ? [`flip ${p.id}`, `set ${p.id}=${1 - state.inputs[p.id]}`] : /^set /.test(action) ? [action.replace(/\s+/g, '')] : [];
}
/** Every part's value by its shown name (a switch, a lamp, a gate, a latch's Q). */
export const values = state => Object.fromEntries(state.spec.parts.map(p => [nameOf(p), state.sim.values[p.id]]));
/** target: the values to reach ({ Q: 1 }, or { outputs: { Q: 1 } }); the first part off target is the first failure. */
export function check(state, target = {}) {
  const want = target.outputs || target, now = values(state);
  const miss = Object.entries(want).find(([name, v]) => Number(now[name] ?? now[nameOf(partNamed(state.spec, name) || {})]) !== Number(v));
  return { pass: !miss, firstFailure: miss ? `${miss[0]} is ${now[miss[0]] ?? '?'}, not ${miss[1]}` : null };
}
export function brief(state) {
  const shown = state.spec.parts.filter(p => p.type === 'output'), held = shown.length ? shown : state.spec.parts.filter(p => PINS[p.type]), v = values(state);
  return `switches ${state.spec.parts.filter(isSwitch).map(p => `${nameOf(p)}=${v[nameOf(p)]}`).join(', ')}${held.length ? `; ${held.map(p => `${nameOf(p)}=${v[nameOf(p)]}`).join(', ')}` : ''}`;
}
export const anchors = state => state.spec.parts.map(p => `part-${p.id}`);
/** A checkpoint's place: "flip A" (before that switch is flipped) or "set A=1". */
export function gate(state, at) {
  const text = String(at ?? '').trim(), flip = /^flip (\S+)$/i.exec(text), set = /^set (.+)$/i.exec(text);
  const sw = name => { const p = partNamed(state.spec, name); if (!p || !isSwitch(p)) fail(`checkpoint at ${JSON.stringify(text)}: ${name} is not a switch`); return p.id; };
  if (flip) return `flip ${sw(flip[1])}`;
  if (set) return `set ${set[1].split(',').map(pair => { const [name, v] = pair.split('=').map(x => x.trim()); if (!['0', '1'].includes(v)) fail(`checkpoint at ${JSON.stringify(text)}: set a switch to 0 or 1`); return `${sw(name)}=${v}`; }).join(',')}`;
  fail(`a checkpoint's "at" is "flip A" or "set A=1", not ${JSON.stringify(text)}`);
}
