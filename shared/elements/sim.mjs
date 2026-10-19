// A small simulation (docs/system-spec.md §15b; interactive-learning.md §B): a few quantities that change by rates the
// course states (dx/dt = v, dv/dt = −g), integrated by the page with fixed-step RK4, never by a model. The learner moves
// the live parameters (a guided experiment) and predicts what the run will do. Physics, chemistry kinetics, population
// models, compound interest: anything written as rates. Pure.
import { checks, str, clip } from './check.mjs';
import { same } from './values.mjs';
import { compile } from '../../src/visuals/formula.mjs';

const { fail, num, arr, object } = checks('sim');
const NAME = /^[A-Za-z_]\w{0,15}$/, RESERVED = new Set(['t', 'log2', 'ln', 'sqrt', 'abs', 'floor', 'ceil', 'pow', 'min', 'max']);
const MAX_STEPS = 5000;
/** A number as gates and values write it: 12 significant digits, so a slider's 0.30000000000000004 is 0.3. */
export const tidy = v => +(+v).toPrecision(12);
const shown = v => +(+v).toPrecision(6);
/** A slider step of 1, 2 or 5 times a power of ten, about a hundred steps across `span`. */
export const niceStep = span => { const raw = span / 100, p = 10 ** Math.floor(Math.log10(raw)); return tidy([1, 2, 5, 10].map(m => m * p).find(x => x >= raw)); };
// ponytail: a prediction matches within 2% of the true value (0.005 at least), the same for every value; give a
// check its own tolerance when a quantity needs a finer one.
/** Prediction against truth, name by name, within 2% (a sim or a market is read off a graph, not to the last digit). */
export const diff = (predicted, actual, names) => names.map(name => {
  const p = predicted?.[name] ?? null, a = actual?.[name] ?? null;
  return { name, predicted: p, actual: a, match: p != null && a != null && same(p, a, Math.max(0.02 * Math.abs(Number(a)) || 0, 0.005)) };
});

export const purpose = 'a small simulation: quantities that change by stated rates (dx/dt = v, dv/dt = -g), run by the page, with sliders for the live parameters';

export const example = {
  vars: { x: 0, y: 0, vx: 'v0 * 0.8', vy: 'v0 * 0.6' },
  params: [{ name: 'v0', label: 'launch speed', value: 20, min: 5, max: 40, step: 1, unit: 'm/s' }, { name: 'g', label: 'gravity', value: 9.8, min: 1, max: 25, step: 0.1, unit: 'm/s²' }],
  live: ['v0'], rates: { x: 'vx', y: 'vy', vx: '0', vy: '-g' }, dt: 0.01, t: [0, 6], stopWhen: '-y', plot: ['x', 'y'], at: [1],
};

export const rules = `spec: {"vars", "params", "live", "rates", "dt", "t", "stopWhen", "plot", "at"}:
- vars: 1 to 6 quantities by name, each its starting value: a number, or an expression of the params ("v0 * 0.8").
- params: 0 to 6, each {"name", "label", "value", "min", "max", "step", "unit"} (step optional). live: the params the learner may move (default all); the rest stay fixed.
- rates: for every var, its rate of change as an expression of the vars, the params and t ("vx", "-g", "-k * x"); "0" for one that stays put. Expressions use + - * / ^, parentheses, log2 ln sqrt abs floor ceil pow min max (no trig yet: give an angle's sine and cosine as numbers or params).
- dt: the step (RK4, fixed); t: [start, end], at most ${MAX_STEPS} steps. stopWhen (optional): the run stops the moment this expression goes above 0 ("-y" stops when y drops below 0); it must not hold at the start.
- plot: up to 4 vars drawn against t (default the first ones); at: up to 6 times to read the vars at.
- Values (what can be predicted and checked): each var at the end of the run ("x"), "t_end", each var at each "at" time ("x@1"), and each param. A prediction counts within 2%.
- Checkpoints: {"at": "set v0=30", "predict": ["x"]} (the slider holds at 30 until they predict), or "set v0" (their first move of it).
Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["first_contact", "transfer"], task: "predict: checkpoints at 'set <param>=<value>'; predict a var (its value when the run ends), 't_end', or '<var>@<t>' for a t listed in at.",  adapters: ['A2', 'A1'], modes: ['predict', 'change', 'compare'], translations: ['graph', 'tracetable'], reveals: ['F2', 'F7', 'F9'],
  notice: ['which quantity changes because of which rate', 'what a parameter changes and what it leaves alone', 'where the run stops and why'] };

const expr = (text, names, what) => {
  try { return compile(String(text), names); } catch (error) { fail(`${what}: ${String(error.message).replace(/^Invalid formula:\s*/, '').replace(/^result\.expr:?\s*/, '').replace(/result\.expr/g, 'it')}`); }
};
/** The run for these param values: { ts, ys: { var: [] }, tEnd, stopped }. */
function integrate(spec, params) {
  const names = Object.keys(spec.vars), all = [...names, ...spec.params.map(p => p.name), 't'], env = (t, y) => ({ ...params, t, ...Object.fromEntries(names.map((n, i) => [n, y[i]])) });
  const rates = names.map(n => expr(spec.rates[n], all, `rates.${n}`)), stop = spec.stopWhen ? expr(spec.stopWhen, all, 'stopWhen') : null;
  const f = (t, y) => { const e = env(t, y); return rates.map(r => r(e)); };
  const start = names.map(n => typeof spec.vars[n] === 'number' ? spec.vars[n] : expr(spec.vars[n], spec.params.map(p => p.name), `vars.${n}`)({ ...params }));
  const [t0, T] = spec.t, ts = [t0], ys = Object.fromEntries(names.map((n, i) => [n, [start[i]]]));
  let t = t0, y = start, stopped = false;
  while (t < T - 1e-12 && ts.length <= MAX_STEPS) {
    const h = Math.min(spec.dt, T - t), k1 = f(t, y), k2 = f(t + h / 2, y.map((v, i) => v + h / 2 * k1[i])), k3 = f(t + h / 2, y.map((v, i) => v + h / 2 * k2[i])), k4 = f(t + h, y.map((v, i) => v + h * k3[i]));
    let next = y.map((v, i) => v + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])), tn = t + h;
    if (!next.every(Number.isFinite)) break; // it ran away: the run ends at the last finite step
    if (stop) {
      const s0 = stop(env(t, y)), s1 = stop(env(tn, next));
      if (s1 > 0) { const frac = s1 === s0 ? 1 : Math.min(1, Math.max(0, -s0 / (s1 - s0))); next = y.map((v, i) => v + frac * (next[i] - v)); tn = t + frac * h; stopped = true; }
    }
    t = tn; y = next; ts.push(t); names.forEach((n, i) => ys[n].push(y[i]));
    if (stopped) break;
  }
  return { ts, ys, tEnd: t, stopped };
}

export function validate(input) {
  const raw = object(input), seen = new Set();
  const nameOk = (name, what) => { if (!NAME.test(name)) fail(`${what} ${JSON.stringify(name)} must be a short name of letters, digits and _`); if (RESERVED.has(name)) fail(`${what} ${name} is reserved (t and the function names); pick another`); if (seen.has(name)) fail(`two quantities are named ${name}`); seen.add(name); return name; };
  const varsRaw = object(raw.vars, 'vars'), names = Object.keys(varsRaw);
  if (names.length < 1 || names.length > 6) fail('vars must name 1 to 6 quantities');
  const vars = Object.fromEntries(names.map(n => { nameOk(n, 'vars'); const v = varsRaw[n]; return [n, typeof v === 'number' ? num(v, `vars.${n}`) : str(v).trim() || fail(`vars.${n} needs a starting value`)]; }));
  const params = (raw.params == null ? [] : arr(raw.params, 'params', 0, 6)).map((p, i) => {
    const at = `params[${i}]`, name = nameOk(str(p?.name).trim(), `${at}.name`), min = num(p.min, `${at}.min`), max = num(p.max, `${at}.max`);
    if (max <= min) fail(`${at}.max must be greater than its min`);
    return { name, label: clip(str(p.label).trim(), 40), value: num(p.value, `${at}.value`, min, max), min, max, step: p.step == null ? niceStep(max - min) : num(p.step, `${at}.step`, Number.MIN_VALUE, max - min), unit: clip(str(p.unit).trim(), 16) };
  });
  const pnames = params.map(p => p.name);
  const live = raw.live == null ? pnames : arr(raw.live, 'live', 0, 6).map(n => pnames.includes(str(n)) ? str(n) : fail(`live: ${JSON.stringify(n)} is not a param`));
  const ratesRaw = object(raw.rates, 'rates');
  for (const n of Object.keys(ratesRaw)) if (!names.includes(n)) fail(`rates.${n}: ${n} is not one of the vars`);
  const rates = Object.fromEntries(names.map(n => [n, str(ratesRaw[n]).trim() || fail(`rates.${n} is required (use "0" for a quantity that stays put)`)]));
  const t = arr(raw.t, 't', 2, 2).map((v, i) => num(v, `t[${i}]`));
  if (t[1] <= t[0]) fail('t must be [start, end] with end after start');
  const dt = num(raw.dt, 'dt', Number.MIN_VALUE);
  if ((t[1] - t[0]) / dt > MAX_STEPS) fail(`dt is too small for t: at most ${MAX_STEPS} steps (dt at least ${tidy((t[1] - t[0]) / MAX_STEPS)})`);
  const plot = (raw.plot == null ? names.slice(0, 4) : arr(raw.plot, 'plot', 1, 4)).map(n => names.includes(str(n)) ? str(n) : fail(`plot: ${JSON.stringify(n)} is not one of the vars`));
  const atTimes = (raw.at == null ? [] : arr(raw.at, 'at', 0, 6)).map((v, i) => num(v, `at[${i}]`, t[0], t[1]));
  const spec = { vars, params, live, rates, dt, t, stopWhen: raw.stopWhen == null ? null : str(raw.stopWhen).trim() || null, plot, at: atTimes };
  const all = [...names, ...pnames, 't'];
  for (const n of names) expr(rates[n], all, `rates.${n}`);
  if (spec.stopWhen) expr(spec.stopWhen, all, 'stopWhen');
  const start = paramsOf(spec), run = integrate(spec, start);
  if (run.ts.length < 2 && !run.stopped) fail('the rates give a value that is not a number at the start; check them');
  if (spec.stopWhen && run.stopped && run.tEnd === t[0]) fail('stopWhen already holds at the start; it must go above 0 during the run');
  return spec;
}

const paramsOf = spec => Object.fromEntries(spec.params.map(p => [p.name, p.value]));
export const init = spec => { const params = paramsOf(spec); return { spec, params, run: integrate(spec, params) }; };

/** "set v0=30": a live param moved (clamped to its range, on its step). */
export function step(state, action) {
  const m = /^set (\w+)=(-?[\d.e+-]+)$/.exec(String(action ?? '').trim());
  if (String(action).trim() === 'reset') return init(state.spec);
  if (!m) fail(`unknown action ${JSON.stringify(action)}; use "set <param>=<value>" or reset`);
  const p = state.spec.params.find(x => x.name === m[1]);
  if (!p) fail(`${m[1]} is not a param`);
  if (!state.spec.live.includes(p.name)) fail(`${p.name} is fixed here (live: ${state.spec.live.join(', ') || 'none'})`);
  const params = { ...state.params, [p.name]: snap(p, +m[2]) };
  return { ...state, params, run: integrate(state.spec, params) };
}
const snap = (p, v) => tidy(Math.min(p.max, Math.max(p.min, p.min + Math.round((v - p.min) / p.step) * p.step)));

export function passes(state, action) {
  const m = /^set (\w+)=(-?[\d.e+-]+)$/.exec(String(action ?? '').trim()), p = m && state.spec.params.find(x => x.name === m[1]);
  return p ? [`set ${p.name}`, `set ${p.name}=${snap(p, +m[2])}`] : [];
}
export function gate(state, at) {
  const m = /^set\s+(\w+)(?:\s*=\s*(-?[\d.e+-]+))?$/i.exec(String(at ?? '').trim()), p = m && state.spec.params.find(x => x.name === m[1]);
  if (!m) fail(`a checkpoint's "at" is "set <param>" or "set <param>=<value>", not ${JSON.stringify(at)}`);
  if (!p) fail(`checkpoint at ${JSON.stringify(at)}: ${m[1]} is not a param`);
  if (!state.spec.live.includes(p.name)) fail(`checkpoint at ${JSON.stringify(at)}: ${p.name} is not live, so the learner can never move it`);
  return m[2] == null ? `set ${p.name}` : `set ${p.name}=${snap(p, +m[2])}`;
}

/** A var at time t of the run (linear between steps; held at its last value after the run stops). */
function at(run, name, t) {
  const { ts } = run, ys = run.ys[name];
  if (t >= ts.at(-1)) return ys.at(-1);
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
  const f = ts[hi] === ts[lo] ? 0 : (t - ts[lo]) / (ts[hi] - ts[lo]);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}
export function values(state) {
  const { run, spec } = state, names = Object.keys(spec.vars);
  return { ...Object.fromEntries(names.map(n => [n, shown(run.ys[n].at(-1))])), t_end: shown(run.tEnd), ...Object.fromEntries(spec.at.flatMap(t => names.map(n => [`${n}@${t}`, shown(at(run, n, t))]))), ...state.params };
}
export function check(state, target = {}) {
  const now = values(state), { tolerance, ...want } = target || {};
  const miss = Object.entries(want).find(([name, v]) => !(name in now) || !(tolerance != null ? same(now[name], v, tolerance) : diff({ [name]: v }, { [name]: now[name] }, [name])[0].match));
  return { pass: !miss, firstFailure: miss ? `${miss[0]} is ${now[miss[0]] ?? 'not shown'}, not ${miss[1]}` : null };
}
export function brief(state) {
  const v = values(state), names = Object.keys(state.spec.vars);
  return `run ends at t = ${v.t_end}${state.run.stopped ? ' (stopped)' : ''}: ${names.map(n => `${n} = ${v[n]}`).join(', ')}${state.spec.params.length ? `; ${state.spec.params.map(p => `${p.name} = ${state.params[p.name]}`).join(', ')}` : ''}`;
}
export const anchors = state => [...Object.keys(state.spec.vars).map(n => `var-${n}`), ...state.spec.params.map(p => `param-${p.name}`), ...state.spec.plot.map(n => `curve-${n}`)];
