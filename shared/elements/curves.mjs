// Supply and demand (docs/system-spec.md §15b; interactive-learning.md §B, §E): two straight curves, shifts and a per-
// unit tax wedge, with the equilibrium and the surpluses solved by the page (a linear market solver), never by a model.
// Economics and any two-sided linear balance. Pure.
import { checks, str, clip } from './check.mjs';
import { same } from './values.mjs';
import { diff, tidy, niceStep } from './sim.mjs';

export { diff };
const { fail, num, arr, object } = checks('curves');
const ID = /^[A-Za-z]\w{0,7}$/;
const r4 = v => Math.round(v * 1e4) / 1e4;

export const purpose = 'supply and demand: two straight curves the learner can shift, a tax wedge, and the equilibrium, surpluses and deadweight loss solved by the page';

export const example = { curves: [{ id: 'D', kind: 'demand', a: 10, b: 1, label: 'Demand' }, { id: 'S', kind: 'supply', a: 2, b: 1, label: 'Supply' }], tax: 0, live: ['D', 'tax'], q: [0, 10], p: [0, 12] };

export const rules = `spec: {"curves", "shifts", "tax", "live", "q", "p"}:
- curves: exactly one demand and one supply, each {"id", "kind": "demand" | "supply", "a", "b", "label"}: demand is P = a - b(Q - shift), supply is P = a + b(Q - shift); a is the price where it meets the price axis, b > 0 its slope.
- shifts: optional starting shifts by curve id ({"D": 2} moves demand 2 units right; negative is left). tax: a per-unit tax (the wedge: buyers pay P, sellers keep Ps = P - tax), default 0.
- live: the controls the learner may move: curve ids (its shift, from -half to +half the Q axis) and/or "tax" (0 to half the P axis); the rest stay fixed.
- q, p: the axes, [0, max] each; the equilibrium should sit inside them.
- Values (what can be predicted and checked): Q, P (what buyers pay), Ps (what sellers keep), CS, PS, DWL (the surplus lost against no tax), "shift <id>", tax. A prediction counts within 2%.
- Checkpoints: {"at": "shift D=2", "predict": ["Q", "P"]} (the slider holds at 2 until they predict), "shift D" (their first move of it), "tax=2" or "tax".
- Construct targets: {"shift": {"D": 2}}, {"direction": {"D": "right"}}, or values ({"Q": 5, "tolerance": 0.1}).
Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["first_contact", "repair"], task: "predict: checkpoints at 'shift <curve id>=<value>' or 'tax=<value>'; predict 'Q', 'P', 'Ps', 'CS', 'PS' or 'DWL'. construct: target {\"Q\": v} or {\"direction\": {\"<id>\": \"right\"}}.",  adapters: ['A2'], modes: ['predict', 'change', 'construct', 'compare'], translations: ['graph', 'numberline'], reveals: ['F6', 'F7', 'F8', 'F9'],
  notice: ['a shift of the curve versus a movement along it', 'who bears a tax: the side with the steeper curve', 'what happens to the quantity, not only the price'] };

export function validate(input) {
  const raw = object(input), ids = new Set();
  const curves = arr(raw.curves, 'curves', 2, 2).map((c, i) => {
    const id = str(c?.id).trim();
    if (!ID.test(id)) fail(`curves[${i}].id ${JSON.stringify(c?.id)} must be a letter and up to 7 more letters or digits`);
    if (ids.has(id)) fail(`two curves are named ${id}`);
    ids.add(id);
    if (!['demand', 'supply'].includes(c.kind)) fail(`curves[${i}].kind must be "demand" or "supply"`);
    return { id, kind: c.kind, a: num(c.a, `curves[${i}].a`), b: num(c.b, `curves[${i}].b`, Number.MIN_VALUE), label: clip(str(c.label).trim(), 20) || id };
  });
  if (curves.filter(c => c.kind === 'demand').length !== 1) fail('curves must be exactly one demand and one supply');
  const q = arr(raw.q, 'q', 2, 2).map((v, i) => num(v, `q[${i}]`)), p = arr(raw.p, 'p', 2, 2).map((v, i) => num(v, `p[${i}]`));
  if (q[0] !== 0 || q[1] <= 0 || p[0] !== 0 || p[1] <= 0) fail('q and p are axes [0, max] with max above 0');
  const shiftsRaw = raw.shifts == null ? {} : object(raw.shifts, 'shifts');
  for (const id of Object.keys(shiftsRaw)) if (!ids.has(id)) fail(`shifts.${id}: ${id} is not a curve`);
  const shifts = Object.fromEntries(curves.map(c => [c.id, shiftsRaw[c.id] == null ? 0 : num(shiftsRaw[c.id], `shifts.${c.id}`, -q[1] / 2, q[1] / 2)]));
  const tax = raw.tax == null ? 0 : num(raw.tax, 'tax', 0, p[1] / 2);
  const live = (raw.live == null ? [] : arr(raw.live, 'live', 0, 3)).map(x => str(x).trim()).map(x => x === 'tax' || ids.has(x) ? x : fail(`live: ${JSON.stringify(x)} is not a curve id or "tax"`));
  const spec = { curves, shifts, tax, live, q, p }, eq = solve(curves, shifts, 0);
  if (eq.Q <= 0) fail('the curves never cross at a positive quantity: demand\'s a must be above supply\'s a');
  if (eq.Q > q[1] || eq.P > p[1]) fail(`the equilibrium (Q ${r4(eq.Q)}, P ${r4(eq.P)}) is outside the axes; widen q or p`);
  return spec;
}

const demandOf = curves => curves.find(c => c.kind === 'demand'), supplyOf = curves => curves.find(c => c.kind === 'supply');
/** The market with these shifts and tax: buyers pay Pb, sellers keep Ps = Pb − tax, and both curves agree on Q. */
function solve(curves, shifts, tax) {
  const d = demandOf(curves), s = supplyOf(curves), sd = shifts[d.id] ?? 0, ss = shifts[s.id] ?? 0;
  // Q = sd + (a_d − Pb)/b_d = ss + (Pb − tax − a_s)/b_s
  let Pb = (sd - ss + d.a / d.b + (tax + s.a) / s.b) / (1 / d.b + 1 / s.b), Q = sd + (d.a - Pb) / d.b;
  if (Q < 0) { Q = 0; Pb = d.a + d.b * sd; } // no trade: buyers' best price is where demand meets the price axis
  const Ps = Pb - tax;
  // Surpluses are the areas between each curve and its price, from 0 to Q (exact for straight lines).
  const CS = d.a * Q - d.b * (Q * Q / 2 - sd * Q) - Pb * Q, PS = Ps * Q - (s.a * Q + s.b * (Q * Q / 2 - ss * Q));
  return { Q, P: Pb, Ps, CS, PS };
}

export function init(spec) { return { spec, shifts: { ...spec.shifts }, tax: spec.tax }; }

/** A live control's range and step: a curve's shift (half the Q axis either way) or the tax (up to half the P axis). */
export const controlRange = (spec, name) => name === 'tax' ? { min: 0, max: spec.p[1] / 2, step: niceStep(spec.p[1] / 2) } : { min: -spec.q[1] / 2, max: spec.q[1] / 2, step: niceStep(spec.q[1]) };
const control = controlRange;
const snap = (range, v) => tidy(Math.min(range.max, Math.max(range.min, range.min + Math.round((v - range.min) / range.step) * range.step)));
/** The control an action moves ("shift D=2" → D's shift; "tax=1.5" → the tax) and its snapped value, or null. */
function parseAction(spec, action) {
  const m = /^(?:shift (\w+)|(tax))=(-?[\d.e+-]+)$/.exec(String(action ?? '').trim());
  if (!m) return null;
  const name = m[2] ? 'tax' : m[1];
  if (name !== 'tax' && !spec.curves.some(c => c.id === name)) fail(`${name} is not a curve`);
  return { name, value: snap(control(spec, name), +m[3]) };
}
/** "shift D=2", "tax=1.5" (live controls only, clamped to their range) or "reset". */
export function step(state, action) {
  if (String(action ?? '').trim() === 'reset') return init(state.spec);
  const move = parseAction(state.spec, action);
  if (!move) fail(`unknown action ${JSON.stringify(action)}; use "shift <curve>=<value>", "tax=<value>" or reset`);
  if (!state.spec.live.includes(move.name)) fail(`${move.name} is fixed here (live: ${state.spec.live.join(', ') || 'none'})`);
  return move.name === 'tax' ? { ...state, tax: move.value } : { ...state, shifts: { ...state.shifts, [move.name]: move.value } };
}
export function passes(state, action) {
  let move = null;
  try { move = parseAction(state.spec, action); } catch { return []; }
  return !move ? [] : move.name === 'tax' ? ['tax', `tax=${move.value}`] : [`shift ${move.name}`, `shift ${move.name}=${move.value}`];
}
export function gate(state, at) {
  const t = String(at ?? '').trim(), m = /^(?:shift\s+(\w+)|(tax))(?:\s*=\s*(-?[\d.e+-]+))?$/i.exec(t);
  if (!m) fail(`a checkpoint's "at" is "shift <curve>", "shift <curve>=<value>", "tax" or "tax=<value>", not ${JSON.stringify(at)}`);
  const name = m[2] ? 'tax' : m[1];
  if (name !== 'tax' && !state.spec.curves.some(c => c.id === name)) fail(`checkpoint at ${JSON.stringify(t)}: ${name} is not a curve`);
  if (!state.spec.live.includes(name)) fail(`checkpoint at ${JSON.stringify(t)}: ${name} is not live, so the learner can never move it`);
  const head = name === 'tax' ? 'tax' : `shift ${name}`;
  return m[3] == null ? head : `${head}=${snap(control(state.spec, name), +m[3])}`;
}

/** The market now: its equilibrium, surpluses and the deadweight loss against the same curves with no tax. */
export function market(state) {
  const now = solve(state.spec.curves, state.shifts, state.tax), free = solve(state.spec.curves, state.shifts, 0);
  return { ...now, DWL: Math.max(0, free.CS + free.PS - (now.CS + now.PS + state.tax * now.Q)), free };
}
export function values(state) {
  const m = market(state);
  return { Q: r4(m.Q), P: r4(m.P), Ps: r4(m.Ps), CS: r4(m.CS), PS: r4(m.PS), DWL: r4(m.DWL), ...Object.fromEntries(state.spec.curves.map(c => [`shift ${c.id}`, state.shifts[c.id]])), tax: state.tax };
}

/** target: { shift: { D: 2 } }, { direction: { D: 'right' } }, or values ({ Q: 5, tolerance }). The first miss only. */
export function check(state, target = {}) {
  const { shift = {}, direction = {}, tolerance, ...want } = target || {}, now = values(state), tol = tolerance ?? state.spec.q[1] / 100;
  for (const [id, v] of Object.entries(shift)) if (!same(state.shifts[id], v, tol)) return { pass: false, firstFailure: `${id} is shifted ${state.shifts[id] ?? 0}, not ${v}` };
  for (const [id, way] of Object.entries(direction)) {
    const s = state.shifts[id] ?? 0, ok = way === 'right' ? s > tol / 2 : s < -tol / 2;
    if (!ok) return { pass: false, firstFailure: s === 0 ? `${id} has not moved ${way}` : `${id} moved ${s > 0 ? 'right' : 'left'}, not ${way}` };
  }
  const miss = Object.entries(want).find(([name, v]) => !(name in now) || !(tolerance != null ? same(now[name], v, tolerance) : diff({ [name]: v }, { [name]: now[name] }, [name])[0].match));
  return { pass: !miss, firstFailure: miss ? `${miss[0]} is ${now[miss[0]] ?? 'not shown'}, not ${miss[1]}` : null };
}
export function brief(state) {
  const v = values(state), moved = state.spec.curves.filter(c => state.shifts[c.id]).map(c => `${c.label} shifted ${state.shifts[c.id] > 0 ? '+' : ''}${state.shifts[c.id]}`);
  return `equilibrium Q = ${v.Q}, P = ${v.P}${state.tax ? `, sellers keep ${v.Ps} (tax ${state.tax}, deadweight loss ${v.DWL})` : ''}${moved.length ? `; ${moved.join(', ')}` : ''}`;
}
export const anchors = state => [...state.spec.curves.map(c => `curve-${c.id}`), 'eq', 'axis-q', 'axis-p', ...(state.spec.tax || state.spec.live.includes('tax') ? ['tax'] : [])];
