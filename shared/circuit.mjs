// Live logic circuits (backend/session/circuit.mjs): Plato's netlist as the Logic Circuit Simulator's circuit and page.
// Pure, so the voice's tool list (backend/session/agent.mjs, also loaded by the page) can carry its shape.

const GATES = new Set(['and', 'or', 'not', 'buf', 'nand', 'nor', 'xor', 'xnor']);
// Parts by the simulator's type, their pins in its order (the order its nodes are numbered in); `opt`: may be left unwired;
// `args`: the order a list of inputs is read in ("in": ["D", "CLK"]).
const PARTS = {
  'd-flipflop': { type: 'ff-d', ins: ['Clock', 'Pre', 'Clr', 'D'], outs: ['Q', 'Qbar'], opt: ['Pre', 'Clr'], args: ['D', 'Clock'] },
  'd-latch': { type: 'latch-d', ins: ['D', 'E', 'Pre', 'Clr'], outs: ['Q', 'Qbar'], opt: ['Pre', 'Clr'] },
  'sr-latch': { type: 'latch-sr', ins: ['S', 'R'], outs: ['Q', 'Qbar'] },
  'half-adder': { type: 'halfadder', ins: ['A', 'B'], outs: ['S', 'Cout'] },
  'full-adder': { type: 'adder', ins: ['A', 'B', 'Cin'], outs: ['S', 'Cout'] },
};
const TYPES = { ...Object.fromEntries([...GATES, ...Object.keys(PARTS)].map(k => [k.replace(/-/g, ''), k])), dff: 'd-flipflop', flipflop: 'd-flipflop', latch: 'd-latch', adder: 'full-adder' };
export const NETLIST_HELP = `{"inputs": ["A", "B"], "clocks": ["CLK"], "parts": [{"name": "g1", "type": "xor", "in": ["A", "B"]}, {"name": "ff", "type": "d-flipflop", "in": {"D": "g1", "Clock": "CLK"}}], "outputs": {"S": "g1", "Q": "ff.Q"}}. Gates (in: 1 signal for not/buf, 2-8 for the rest): ${[...GATES].join(', ')}. Parts (in: by pin): ${Object.entries(PARTS).map(([k, p]) => `${k} (${p.ins.filter(x => !p.opt?.includes(x)).join(', ')} → ${p.outs.join(', ')})`).join('; ')}. A signal is an input, a clock, a gate's name, or part.pin; feedback loops are fine.`;

/**
 * A netlist (NETLIST_HELP) as the simulator's circuit (format v8): { circuit, inputs, outputs, height } or { problems }.
 * Laid out left to right by logic depth: each part one column past the furthest of what feeds it (a loop's back edge is
 * not followed), the outputs after the last.
 */
export function toCircuit(net) {
  const problems = [], name = x => String(x ?? '').trim();
  const inputs = (Array.isArray(net?.inputs) ? net.inputs : []).map(name).filter(Boolean);
  const clocks = (Array.isArray(net?.clocks) ? net.clocks : []).map(name).filter(Boolean);
  // The obvious variants read as meant (14 Oct: Opus wrote "inputs", a gate's own "output" name, "dlatch", outputs as a list).
  const parts = (Array.isArray(net?.parts) ? net.parts : []).map(p => ({ name: name(p?.name), type: TYPES[name(p?.type).toLowerCase().replace(/[^a-z]/g, '')] ?? name(p?.type).toLowerCase(), in: p?.in ?? p?.inputs, out: name(p?.output) }));
  const alias = new Map(parts.filter(p => p.out && GATES.has(p.type)).map(p => [p.out, p.name])), sig = s => alias.get(name(s)) ?? name(s);
  for (const p of parts) p.in = Array.isArray(p.in) ? p.in.map(sig) : p.in && typeof p.in === 'object' ? Object.fromEntries(Object.entries(p.in).map(([k, v]) => [k, sig(v)])) : p.in;
  const outputs = Array.isArray(net?.outputs) ? net.outputs.map(s => [name(s), sig(s)]) : Object.entries(net?.outputs && typeof net.outputs === 'object' ? net.outputs : {}).map(([k, v]) => [name(k), sig(v)]);
  if (!inputs.length && !clocks.length) problems.push('no inputs or clocks');
  if (!outputs.length) problems.push('no outputs');
  // Each part's input pins: [pin, signal] in the simulator's order.
  for (const p of parts) {
    if (GATES.has(p.type)) {
      const ins = Array.isArray(p.in) ? p.in.map(name) : [];
      const one = p.type === 'not' || p.type === 'buf';
      if (one ? ins.length !== 1 : ins.length < 2 || ins.length > 8) problems.push(`${p.name}: a ${p.type} takes ${one ? '1 input' : '2-8 inputs'}`);
      p.pins = ins.map((s, k) => [`In${k}`, s]);
    } else if (PARTS[p.type]) {
      const def = PARTS[p.type], given = Array.isArray(p.in) ? Object.fromEntries(p.in.map((s, k) => [(def.args || def.ins)[k], s])) : p.in && typeof p.in === 'object' ? p.in : {};
      p.pins = def.ins.map(pin => [pin, name(given[pin])]);
      for (const [pin, s] of p.pins) if (!s && !def.opt?.includes(pin)) problems.push(`${p.name}: pin ${pin} is not wired`);
    } else problems.push(`${p.name || 'a part'}: unknown type "${p.type}"`);
  }
  const known = new Set([...inputs, ...clocks, ...parts.flatMap(p => PARTS[p.type] ? PARTS[p.type].outs.map(o => `${p.name}.${o}`) : [p.name])]);
  const names = [...inputs, ...clocks, ...parts.map(p => p.name)];
  for (const n of new Set(names)) if (!n || names.filter(x => x === n).length > 1) problems.push(n ? `the name "${n}" is used twice` : 'a part has no name');
  for (const p of parts) for (const [, s] of p.pins || []) if (s && !known.has(s)) problems.push(`${p.name}: no signal "${s}"`);
  for (const [o, s] of outputs) if (!known.has(s)) problems.push(`output ${o}: no signal "${s}"`);
  if (problems.length) return { problems };

  const byName = new Map(parts.map(p => [p.name, p])), depth = new Map(), visiting = new Set();
  const depthOf = s => {
    const p = byName.get(s.split('.')[0]);
    if (!p) return 0; // an input or a clock
    if (depth.has(p.name)) return depth.get(p.name);
    if (visiting.has(p.name)) return 0; // a loop's back edge
    visiting.add(p.name);
    const d = 1 + Math.max(0, ...p.pins.filter(([, x]) => x).map(([, x]) => depthOf(x)));
    visiting.delete(p.name); depth.set(p.name, d);
    return d;
  };
  parts.forEach(p => depthOf(p.name));
  // ponytail: a fixed grid by depth; the student can drag parts (mode "connect") when a big circuit's wires cross.
  const COL = 150, ROW = { gate: 70, part: 110 }, columns = [];
  // Odd columns start half a row down, so a wire that skips a column passes between its parts.
  const place = (d, h) => { const c = columns[d] ??= { y: d % 2 ? 85 : 50 }; const y = c.y + h / 2; c.y += h; return [80 + d * COL, y]; };
  let id = 0;
  const node = new Map(), components = [], wires = [];
  for (const n of [...inputs, ...clocks]) {
    node.set(n, id);
    components.push(clocks.includes(n) ? { type: 'clock', pos: place(0, ROW.gate), id: id++, name: n, period: 4000 } : { type: 'in', pos: place(0, ROW.gate), id: id++, name: n, val: 0 });
  }
  for (const p of [...parts].sort((a, b) => depth.get(a.name) - depth.get(b.name))) {
    const ins = p.pins.map(() => id++), part = PARTS[p.type], d = depth.get(p.name);
    p.inIds = ins;
    if (part) {
      const outs = part.outs.map(o => { node.set(`${p.name}.${o}`, id); return id++; });
      components.push({ type: part.type, pos: place(d, ROW.part), in: ins, out: outs });
    } else {
      node.set(p.name, id);
      components.push({ type: p.type, ...(p.pins.length > 2 ? { bits: p.pins.length } : {}), pos: place(d, ROW.gate), in: ins.length === 1 ? ins[0] : ins, out: id++ });
    }
  }
  for (const p of parts) p.pins.forEach(([, s], k) => { if (s) wires.push([node.get(s), p.inIds[k]]); });
  const last = Math.max(0, ...depth.values()) + 1;
  for (const [o, s] of outputs) { components.push({ type: 'out', pos: place(last, ROW.gate), id, name: o }); wires.push([node.get(s), id++]); }
  // width: to the last column's right edge, with room for the outputs' names.
  return { circuit: { v: 8, components, wires }, inputs: [...inputs, ...clocks], outputs: outputs.map(([o]) => o), width: 80 + last * COL + 110, height: Math.max(...columns.map(c => c.y)) + 40 };
}

/**
 * The page for a circuit: the simulator in "connect" mode (flip inputs, drag parts), its height told to the frame.
 * The simulator draws at a fixed scale and clips at its frame, so it is zoomed to fit the frame's width (19 Oct, the user:
 * "it cuts out half the diagram"; the page is narrower than most circuits).
 */
export function circuitPage({ circuit, width = 760, height }, title = 'Circuit') {
  const json = JSON.stringify(circuit).replace(/</g, '\\u003c'), esc = s => String(s).replace(/[<&"]/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<script>
// The frame has no origin of its own (sandboxed), so browser storage throws there: the simulator gets an in-memory one.
for (const k of ['localStorage', 'sessionStorage']) {
  try { window[k].length; } catch {
    const m = new Map();
    Object.defineProperty(window, k, { value: { getItem: x => (m.has(x) ? m.get(x) : null), setItem: (x, v) => m.set(x, String(v)), removeItem: x => m.delete(x), clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } } });
  }
}
</script>
<script src="/logic-sim.js"></script>
<style>html{color-scheme:light}body{margin:0;background:transparent}.wrap{padding:4px}</style>
</head><body><div class="wrap"></div>
<script>
const circuit = ${json}, W = ${Math.ceil(width)}, H = ${Math.ceil(height)}, wrap = document.querySelector('.wrap');
const zoom = () => Math.max(35, Math.min(100, Math.floor((innerWidth - 8) / W * 100)));
const fit = z => { wrap.style.height = Math.max(160, Math.ceil(H * z / 100)) + 'px'; return z; };
const editor = document.createElement('logic-editor'), data = document.createElement('script');
for (const [k, v] of [['mode', 'connect'], ['lang', 'en'], ['showkeyinfo', 'false']]) editor.setAttribute(k, v);
data.type = 'application/json'; data.textContent = JSON.stringify({ ...circuit, opts: { zoom: fit(zoom()) } });
editor.append(data); wrap.append(editor);
let was = innerWidth;
addEventListener('resize', () => { if (innerWidth !== was) { was = innerWidth; editor.setZoom?.(fit(zoom()), false); } });
new ResizeObserver(() => parent.postMessage({ anatomy: Math.ceil(document.body.getBoundingClientRect().bottom) + 8 }, '*')).observe(document.body);
document.documentElement.addEventListener('pointerleave', () => parent.postMessage({ anatomy: 'leave' }, '*'));</script>
</body></html>`;
}
