// A function graph (docs/system-spec.md §15b): f(x) with parameters on sliders (only the live ones move), optional data
// points, and the values a learner predicts, all computed here: f at chosen x, the maximum and minimum over the x range
// (sampled, then refined), and the first root (bisection). Expressions use the formula diagram's parser (no eval).
import { checks, str, clip, numeric } from './check.mjs';
import { same, predictionFrom } from './values.mjs';
import { compile } from '../../src/visuals/formula.mjs';

const { fail, num, arr, object } = checks('graph');
const NAME = /^[A-Za-z_]\w{0,15}$/, FUNCTIONS = ['log2', 'ln', 'sqrt', 'abs', 'floor', 'ceil', 'pow', 'min', 'max'];
const round = v => Number.isFinite(v) ? +v.toPrecision(6) : null;
// An x the engine found (an extreme, a root) on a grid of a ten-millionth of the x range, so 7e-9 reads as 0.
const atX = (spec, v) => { const g = (spec.x[1] - spec.x[0]) * 1e-7; return Number.isFinite(v) ? round(Math.round(v / g) * g) : null; };
const fmt = v => String(round(+v) ?? v).replace('-', '−');
// A slider step of 1, 2 or 5 times a power of ten, about 200 steps across the range.
const niceStep = span => { const raw = span / 200, p = 10 ** Math.floor(Math.log10(raw)); return +([1, 2, 5, 10].map(m => m * p).find(s => s >= raw)).toPrecision(12); };
/** Round values covering [lo, hi] in about five steps of 1, 2 or 5 times a power of ten (the view's ticks, anchored "x-<v>"). */
export function ticks(lo, hi) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / 5, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map(m => m * p).find(s => s >= raw), out = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9 * step; k++) out.push(+(k * step).toPrecision(12));
  return out;
}

export const purpose = 'a function graph the learner can change: f(x) with parameters on sliders (only the live ones move), optional data points, and values the engine computes (f at chosen x, the maximum, the minimum, the first root)';

export const example = {
  expr: 'a*(x-h)^2+k',
  params: [{ name: 'a', value: 1, min: -3, max: 3, step: 0.5, label: 'stretch' }, { name: 'h', value: 0, min: -5, max: 5, step: 1, label: 'shift' }, { name: 'k', value: -1, min: -5, max: 5, step: 1 }],
  live: ['h'], x: [-6, 6], y: [-6, 10], at: [2],
};

export const rules = `spec: {"expr", "params", "live", "x", "y", "points", "at"}:
- expr: f(x), written with x, the params' names, numbers, + - * / ^, parentheses and log2 ln sqrt min max abs floor ceil pow; multiply with * (2*x, not 2x). At most 200 characters.
- params: up to 6, each {"name", "value", "min", "max", "step", "label"} (name: letters, digits and _, not x; value within min..max; step optional; label optional, 32 characters at most).
- live: the params the learner can move (default: all); the others stay fixed, so one experiment changes one thing.
- x: [min, max] of the x axis (default [-10, 10]); y: optional [min, max] (default: fitted to the curve).
- points: optional data as [[x, y], …] (200 at most), drawn as dots.
- at: up to 6 x values whose f(x) the learner may predict.
Never compute values yourself: the engine does. What a learner can predict and the engine checks: each param, "f(<x>)" for each x in at (written as in at: "f(2)"), "max" and "argmax" (where it is), "min" and "argmin", and "root" (the smallest x in range where f crosses zero; none when it doesn't). A checkpoint waits before a param is moved: {"at": "set h", "predict": ["argmin"]}. A construct target: {"params": {"h": 2}} or {"through": [[2, 3]]}, with an optional "tolerance".
Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["first_contact", "repair", "transfer"], task: "predict: checkpoints at 'set <param>=<value>' (a live param moved to that value); predict 'root', 'max', 'argmax', 'min', 'argmin', a param, or 'f(<x>)' for an x listed in at. construct: target {\"params\": {...}} or {\"through\": [[x, y]]}.",  adapters: ['A2', 'A1'], modes: ['predict', 'change', 'construct', 'compare'], translations: ['numberline', 'sim', 'curves'], reveals: ['F2', 'F7', 'F9'],
  notice: ['where the curve crosses zero', 'where it peaks or bottoms out', 'which way it moves as one parameter changes', 'the scale on each axis'] };

const compiled = new WeakMap();
/** f as a function of x for these param values. */
const fOf = (spec, params) => {
  let f = compiled.get(spec);
  if (!f) compiled.set(spec, f = compile(spec.expr, ['x', ...spec.params.map(p => p.name)]));
  return x => f({ ...params, x });
};
/** n + 1 samples [x, f(x)] across the x range. */
export const sample = (spec, params, n = 200) => { const f = fOf(spec, params), [a, b] = spec.x; return Array.from({ length: n + 1 }, (_, i) => { const x = a + (b - a) * i / n; return [x, f(x)]; }); };

export function validate(input) {
  const raw = object(input), expr = str(raw.expr).trim(), seen = new Set(['x']);
  if (!expr) fail('expr is required: f(x) written with x, the params, + - * / ^, parentheses and log2 ln sqrt min max abs floor ceil pow');
  if (expr.length > 200) fail('expr is over 200 characters');
  const params = (raw.params == null ? [] : arr(raw.params, 'params', 0, 6)).map((p, i) => {
    const at = `params[${i}]`, name = str(p?.name).trim();
    if (!NAME.test(name) || FUNCTIONS.includes(name) || name === 'x') fail(`${at}.name must be a short name of letters, digits and _, not x or a function's name`);
    if (seen.has(name)) fail(`two params are named ${name}`);
    seen.add(name);
    const min = num(numeric(p.min), `${at}.min`), max = num(numeric(p.max), `${at}.max`);
    if (max <= min) fail(`${at}.max must be greater than its min`);
    const value = num(numeric(p.value), `${at}.value`, min, max), step = p.step == null ? niceStep(max - min) : num(numeric(p.step), `${at}.step`, Number.MIN_VALUE, max - min);
    return { name, label: clip(str(p.label).trim(), 32), value, min, max, step };
  });
  const names = params.map(p => p.name);
  try { compile(expr, ['x', ...names]); } catch (error) { fail(String(error.message).replace(/^Invalid formula: /, '').replace(/result\.expr/g, 'expr')); }
  const live = raw.live == null ? names : arr(raw.live, 'live', 0, 6).map(n => names.includes(str(n)) ? str(n) : fail(`live: ${JSON.stringify(n)} is not one of the params (${names.join(', ') || 'there are none'})`));
  const range = (v, what, fallback) => {
    if (v == null) return fallback;
    const r = arr(v, what, 2, 2).map((x, i) => num(numeric(x), `${what}[${i}]`));
    if (r[1] <= r[0]) fail(`${what} must be [min, max] with min < max`);
    return r;
  };
  const x = range(raw.x, 'x', [-10, 10]), y = range(raw.y, 'y', null);
  const points = (raw.points == null ? [] : arr(raw.points, 'points', 0, 200)).map((p, i) => Array.isArray(p) && p.length === 2 ? [num(numeric(p[0]), `points[${i}][0]`), num(numeric(p[1]), `points[${i}][1]`)] : fail(`points[${i}] must be [x, y]`));
  const at = (raw.at == null ? [] : arr(raw.at, 'at', 0, 6)).map((v, i) => num(numeric(v), `at[${i}]`, x[0], x[1]));
  const spec = { expr, params, live, x, y, points, at };
  if (!sample(spec, Object.fromEntries(params.map(p => [p.name, p.value])), 64).some(([, v]) => Number.isFinite(v))) fail(`expr gives no finite value for x from ${x[0]} to ${x[1]} at the params' starting values`);
  return spec;
}

/** The highest (sign 1) or lowest (sign −1) point over the x range: the best of 400 samples, refined by golden section. */
function extreme(spec, params, sign) {
  const f = fOf(spec, params), score = x => { const v = f(x); return Number.isFinite(v) ? sign * v : -Infinity; }, [a, b] = spec.x, n = 400;
  let best = a;
  for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; if (score(x) > score(best)) best = x; }
  let lo = Math.max(a, best - (b - a) / n), hi = Math.min(b, best + (b - a) / n);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 60; i++) { const c = hi - g * (hi - lo), d = lo + g * (hi - lo); if (score(c) > score(d)) hi = d; else lo = c; }
  const refined = (lo + hi) / 2, x = score(refined) >= score(best) ? refined : best;
  return { x, y: f(x) };
}
/** The smallest x in range where f crosses zero (a sign change refined by bisection; a pole is not a root), or null. */
function root(spec, params) {
  const f = fOf(spec, params), [a, b] = spec.x, n = 400, pts = sample(spec, params, n), scale = Math.max(1, ...pts.map(p => Math.abs(p[1])).filter(Number.isFinite));
  for (let i = 0; i < n; i++) {
    let [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (y0 === 0) return x0;
    if (!Number.isFinite(y0) || !Number.isFinite(y1) || Math.sign(y0) === Math.sign(y1)) continue;
    for (let k = 0; k < 80; k++) { const m = (x0 + x1) / 2, ym = f(m); if (!Number.isFinite(ym) || ym === 0) { x0 = x1 = m; break; } if (Math.sign(ym) === Math.sign(y0)) { x0 = m; y0 = ym; } else { x1 = m; y1 = ym; } }
    const x = (x0 + x1) / 2;
    if (Math.abs(f(x)) <= 1e-6 * scale) return x;
  }
  return null;
}

export const init = spec => ({ spec, params: Object.fromEntries(spec.params.map(p => [p.name, p.value])) });
/** "set <param>=<value>" (a live param, clamped to its range and snapped to its step), or reset. */
export function step(state, action) {
  if (action === 'reset') return init(state.spec);
  const m = /^set ([A-Za-z_]\w*)\s*=\s*(\S+)$/.exec(action);
  if (!m) fail(`unknown action ${JSON.stringify(action)}; use "set <param>=<value>" or reset`);
  const p = state.spec.params.find(q => q.name === m[1]), v = Number(String(m[2]).replace('−', '-'));
  if (!p) fail(`${m[1]} is not a param`);
  if (!state.spec.live.includes(p.name)) fail(`${p.name} is fixed here`);
  if (!Number.isFinite(v)) fail(`set ${p.name}: ${m[2]} is not a number`);
  return { ...state, params: { ...state.params, [p.name]: +Math.min(p.max, Math.max(p.min, p.min + Math.round((v - p.min) / p.step) * p.step)).toPrecision(12) } };
}
/** A move of a param passes its bare gate ("set h") and, at the value it lands on, its valued one ("set h=2"). */
export function passes(state, action) {
  const m = /^set ([A-Za-z_]\w*)=(-?[\d.e+-]+)$/.exec(String(action ?? '').trim()), p = m && state.spec.params.find(x => x.name === m[1]);
  return p ? [`set ${p.name}`, `set ${p.name}=${snapTo(p, +m[2])}`] : [];
}
const snapTo = (p, v) => +Math.min(p.max, Math.max(p.min, p.min + Math.round((v - p.min) / p.step) * p.step)).toPrecision(12);
/** Each param, f(x) for each x in `at`, max/argmax, min/argmin, and root (null when it doesn't cross zero). */
export function values(state) {
  const { spec, params } = state, f = fOf(spec, params), hi = extreme(spec, params, 1), lo = extreme(spec, params, -1), r = root(spec, params);
  return { ...params, ...Object.fromEntries(spec.at.map(x => [`f(${x})`, round(f(x))])), max: round(hi.y), argmax: atX(spec, hi.x), min: round(lo.y), argmin: atX(spec, lo.x), root: r === null ? null : atX(spec, r) };
}
/** The y the plot spans: the spec's, else the curve's and the points' extent with a margin. */
export function yRange(state) {
  if (state.spec.y) return state.spec.y;
  const ys = [...sample(state.spec, state.params).map(p => p[1]), ...state.spec.points.map(p => p[1])].filter(Number.isFinite);
  if (!ys.length) return [-1, 1];
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * .08;
  return [lo - pad, hi + pad];
}
/** Predictions said as "f of 2 is 7" or "at x = 2 it's 7": the x named is not the value. */
export const parse = (text, names) => predictionFrom(String(text ?? '').replace(/\bf\s*(?:\(\s*|of\s+)(-?\d+(?:\.\d+)?)\s*\)?/gi, ' f($1) ').replace(/\b(?:at|when|where)\s+x\s*(?:=|is|equals)?\s*-?\d+(?:\.\d+)?/gi, ' '), names);
/** Prediction against truth within 2% (at least 0.01): a predicted value is read off a curve, not computed to the last digit. */
export const diff = (predicted, actual, names) => names.map(name => {
  const p = predicted?.[name] ?? null, a = actual?.[name] ?? null, tol = Number.isFinite(+a) && a !== null ? Math.max(.02 * Math.abs(+a), .01) : 0;
  return { name, predicted: p, actual: a, match: p !== null && a !== null && same(p, a, tol) };
});
/** target: { params: { name: v } } (within half a step) and/or { through: [[x, y]] } (within 2% of the y span), or a `tolerance`. */
export function check(state, target = {}) {
  const { spec, params } = state, tol = target.tolerance == null ? null : Number(target.tolerance);
  for (const [name, want] of Object.entries(target.params || {})) {
    const p = spec.params.find(q => q.name === name);
    if (!p) return { pass: false, firstFailure: `${name} is not a param` };
    if (Math.abs(params[name] - Number(want)) > (tol ?? p.step / 2) + 1e-12) return { pass: false, firstFailure: `${name} is ${fmt(params[name])}, not ${fmt(want)}` };
  }
  const f = fOf(spec, params), [y0, y1] = yRange(state);
  for (const [x, y] of target.through || []) {
    const v = f(Number(x));
    if (!Number.isFinite(v) || Math.abs(v - Number(y)) > (tol ?? .02 * (y1 - y0)) + 1e-12) return { pass: false, firstFailure: `the curve misses (${fmt(x)}, ${fmt(y)}): f(${fmt(x)}) is ${Number.isFinite(v) ? fmt(v) : 'undefined'}` };
  }
  return { pass: true, firstFailure: null };
}
export function brief(state) {
  const { spec, params } = state, v = values(state), set = spec.params.map(p => `${p.name}=${fmt(params[p.name])}`).join(', ');
  return `f(x) = ${spec.expr}${set ? ` with ${set}` : ''}; max ${fmt(v.max)} at x=${fmt(v.argmax)}, min ${fmt(v.min)} at x=${fmt(v.argmin)}; ${v.root === null ? 'no root in range' : `root at x=${fmt(v.root)}`}`.slice(0, 400);
}
/** Each param, the curve, each data point, and each labelled x tick. */
export const anchors = state => [...state.spec.params.map(p => `param-${p.name}`), 'curve', ...state.spec.points.map((_, i) => `point-${i}`), ...ticks(...state.spec.x).map(v => `x-${v}`)];
/** A checkpoint's place: "set <param>", before a live param is moved. */
export function gate(state, at) {
  const m = /^set\s+([A-Za-z_]\w*)(?:\s*=\s*(-?[\d.e+-]+))?$/i.exec(String(at ?? '').trim());
  if (!m) fail(`a checkpoint's "at" is "set <param>=<value>" (that live param moved to that value), not ${JSON.stringify(at)}`);
  if (!state.spec.live.includes(m[1])) fail(`checkpoint at ${JSON.stringify(at)}: ${m[1]} is not a live param (${state.spec.live.join(', ') || 'none is live'})`);
  return m[2] == null ? `set ${m[1]}` : `set ${m[1]}=${snapTo(state.spec.params.find(x => x.name === m[1]), +m[2])}`;
}
