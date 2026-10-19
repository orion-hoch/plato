// A pathway (docs/system-spec.md §15b; interactive-learning.md §B, §9.5): pools of something and the steps that move it
// from pool to pool, run a round at a time by the page with the amounts kept exactly (a step only moves what its inputs
// hold). Metabolism, a supply chain, a nutrient or carbon cycle, any stepwise flow. Inhibit a step and see what builds up.
// Pure.
import { checks, str, clip } from './check.mjs';
import { diffValues } from './values.mjs';

const { fail, num, arr, object } = checks('pathway');
const ID = /^[A-Za-z][\w-]{0,23}$/, MAX_ROUNDS = 100;

export const purpose = 'a pathway: pools and the steps that move amounts between them, run a round at a time with every amount kept; a step can be inhibited';

export const example = {
  pools: [{ id: 'glc', label: 'glucose', amount: 2 }, { id: 'g3p', label: 'G3P', amount: 0 }, { id: 'pyr', label: 'pyruvate', amount: 0 }, { id: 'atp', label: 'ATP', amount: 0 }],
  steps: [{ id: 'split', label: 'investment and split', from: { glc: 1 }, to: { g3p: 2 } }, { id: 'payoff', label: 'payoff phase', from: { g3p: 1 }, to: { pyr: 1, atp: 2 }, by: 'enzymes 6-10' }],
  inhibited: [],
};

export const rules = `spec: {"pools", "steps", "inhibited"}:
- pools: 1 to 16, each {"id", "label", "amount"} (amount a number ≥ 0). steps: 1 to 16, in the order they run, each {"id", "label", "from": {"<pool id>": n}, "to": {"<pool id>": n}, "by"} (by: the enzyme or agent, optional; from may be {} for an inflow, to {} for an outflow).
- id: a letter, then up to 23 letters, digits, _ or -. inhibited: step ids that start blocked.
- How the page runs it: each round, every step in order fires once if it is not inhibited and its from pools hold enough; firing takes from and adds to. Nothing is created or lost but what the steps say.
- Values (what can be predicted and checked): each pool's amount by pool id, and "fired <step id>" (how many times it has fired).
- Checkpoints: {"at": "round 2", "predict": ["pyr"]} (what a pool holds after round 2: running into round 2 waits for their prediction), or "inhibit <step id>" (before they block that step).
- Construct targets: {"<pool id>": amount} or {"inhibit": ["<step id>"]} (exactly these steps blocked).
Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["first_contact", "repair"], task: "predict: checkpoints at 'round N' (after N rounds) or 'inhibit <step id>'; predict pool ids (their amounts) or 'fired <step id>'.",  adapters: ['A2', 'A4'], modes: ['predict', 'change', 'compare', 'teach'], translations: ['tracetable'], reveals: ['F4', 'F7', 'F9'],
  notice: ['which step is the bottleneck', 'which pool builds up when a step is blocked', 'that a step only moves amounts, never makes them'] };

export function validate(input) {
  const raw = object(input), named = new Set(), seen = new Set();
  const pools = arr(raw.pools, 'pools', 1, 16).map((p, i) => {
    const id = str(p?.id).trim();
    if (!ID.test(id)) fail(`pools[${i}].id ${JSON.stringify(p?.id)} must be a letter, then up to 23 letters, digits, _ or -`);
    if (named.has(id)) fail(`two pools are named ${id}`);
    named.add(id);
    return { id, label: clip(str(p.label).trim(), 40) || id, amount: num(p.amount, `pools[${i}].amount`, 0) };
  });
  const flow = (o, what) => Object.fromEntries(Object.entries(o == null ? {} : object(o, what)).map(([pool, n]) => {
    if (!named.has(pool)) fail(`${what}.${pool}: ${pool} is not a pool`);
    return [pool, num(n, `${what}.${pool}`, Number.MIN_VALUE)];
  }));
  const steps = arr(raw.steps, 'steps', 1, 16).map((s, i) => {
    const id = str(s?.id).trim();
    if (!ID.test(id)) fail(`steps[${i}].id ${JSON.stringify(s?.id)} must be a letter, then up to 23 letters, digits, _ or -`);
    if (seen.has(id)) fail(`two steps are named ${id}`);
    seen.add(id);
    const from = flow(s.from, `steps[${i}].from`), to = flow(s.to, `steps[${i}].to`);
    if (!Object.keys(from).length && !Object.keys(to).length) fail(`steps[${i}] (${id}) moves nothing: give it from or to`);
    return { id, label: clip(str(s.label).trim(), 60) || id, from, to, by: clip(str(s.by).trim(), 40) };
  });
  const inhibited = (raw.inhibited == null ? [] : arr(raw.inhibited, 'inhibited', 0, 16)).map(id => seen.has(str(id)) ? str(id) : fail(`inhibited: ${JSON.stringify(id)} is not a step`));
  return { pools, steps, inhibited };
}

export const init = spec => ({ spec, amounts: Object.fromEntries(spec.pools.map(p => [p.id, p.amount])), inhibited: spec.inhibited, rounds: 0, fired: Object.fromEntries(spec.steps.map(s => [s.id, 0])) });

/** One round: every step not inhibited fires once, in order, if its inputs hold enough. */
function round(state) {
  const amounts = { ...state.amounts }, fired = { ...state.fired };
  for (const s of state.spec.steps) {
    if (state.inhibited.includes(s.id) || Object.entries(s.from).some(([pool, n]) => amounts[pool] < n - 1e-9)) continue;
    for (const [pool, n] of Object.entries(s.from)) amounts[pool] = +(amounts[pool] - n).toPrecision(12);
    for (const [pool, n] of Object.entries(s.to)) amounts[pool] = +(amounts[pool] + n).toPrecision(12);
    fired[s.id]++;
  }
  return { ...state, amounts, fired, rounds: state.rounds + 1 };
}
const stepOf = (spec, id) => spec.steps.find(s => s.id === id) || fail(`${id} is not a step`);

/** "run" (one round), "round N" (run on to the end of round N), "inhibit <step>", "release <step>", or "reset". */
export function step(state, action) {
  const a = String(action ?? '').trim(), m = /^(inhibit|release) (\S+)$/.exec(a), r = /^round (\d+)$/.exec(a);
  if (a === 'reset') return init(state.spec);
  if (a === 'run') { if (state.rounds >= MAX_ROUNDS) fail(`at most ${MAX_ROUNDS} rounds`); return round(state); }
  if (r) {
    const n = +r[1];
    if (n <= state.rounds || n > MAX_ROUNDS) fail(`round ${n} has already run, or is past ${MAX_ROUNDS}`);
    let s = state;
    while (s.rounds < n) s = round(s);
    return s;
  }
  if (m) {
    const s = stepOf(state.spec, m[2]), off = state.inhibited.filter(id => id !== s.id);
    return { ...state, inhibited: m[1] === 'inhibit' ? [...off, s.id] : off };
  }
  fail(`unknown action ${JSON.stringify(a)}; use run, "round N", "inhibit <step>", "release <step>" or reset`);
}
// No `next`: an "inhibit" checkpoint has no place in the run, so every checkpoint waits for its prediction from the start
// (a round checkpoint is passed by "run" or "round N").
export function passes(state, action) {
  const a = String(action ?? '').trim(), r = /^round (\d+)$/.exec(a), m = /^inhibit (\S+)$/.exec(a);
  if (a === 'run') return [`round ${state.rounds + 1}`];
  if (r) return Array.from({ length: Math.max(0, +r[1] - state.rounds) }, (_, i) => `round ${state.rounds + i + 1}`);
  return m ? [`inhibit ${m[1]}`] : [];
}
export function gate(state, at) {
  const t = String(at ?? '').trim(), r = /^round\s+(\d+)$/i.exec(t), m = /^inhibit\s+(\S+)$/i.exec(t);
  if (r && +r[1] >= 1 && +r[1] <= MAX_ROUNDS) return `round ${+r[1]}`;
  if (m) { if (!state.spec.steps.some(s => s.id === m[1])) fail(`checkpoint at ${JSON.stringify(t)}: ${m[1]} is not a step`); return `inhibit ${m[1]}`; }
  fail(`a checkpoint's "at" is "round N" (1 to ${MAX_ROUNDS}) or "inhibit <step id>", not ${JSON.stringify(at)}`);
}

export const values = state => ({ ...state.amounts, ...Object.fromEntries(Object.entries(state.fired).map(([id, n]) => [`fired ${id}`, n])) });
export const diff = (predicted, actual, names) => diffValues(predicted, actual, names, 1e-6);

/** target: { <pool>: amount } or { inhibit: [steps] } (exactly those blocked); the first miss only. */
export function check(state, target = {}) {
  const { inhibit, ...want } = target || {}, label = id => state.spec.steps.find(s => s.id === id)?.label ?? id;
  if (Array.isArray(inhibit)) {
    const missing = inhibit.find(id => !state.inhibited.includes(id)), extra = state.inhibited.find(id => !inhibit.includes(id));
    if (missing) return { pass: false, firstFailure: `"${label(missing)}" is not blocked` };
    if (extra) return { pass: false, firstFailure: `"${label(extra)}" is blocked, and should not be` };
  }
  const now = values(state), miss = Object.entries(want).find(([name, v]) => !(name in now) || !diff({ [name]: v }, { [name]: now[name] }, [name])[0].match);
  return { pass: !miss, firstFailure: miss ? `${miss[0]} is ${now[miss[0]] ?? 'not a pool'}, not ${miss[1]}` : null };
}
export function brief(state) {
  const pools = state.spec.pools.map(p => `${p.label} ${state.amounts[p.id]}`).join(', ');
  return `${state.rounds ? `after round ${state.rounds}` : 'before the first round'}: ${pools}${state.inhibited.length ? `; blocked: ${state.inhibited.map(id => state.spec.steps.find(s => s.id === id)?.label ?? id).join(', ')}` : ''}`;
}
export const anchors = state => [...state.spec.pools.map(p => `pool-${p.id}`), ...state.spec.steps.map(s => `step-${s.id}`)];
