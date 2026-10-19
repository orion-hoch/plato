// A number line (docs/system-spec.md §15b): fixed marks the spec places, marks the learner places (snapped to the
// line's step), hidden marks a learner predicts before they are shown, and labelled ranges. The engine keeps every
// value, a hidden one's included, so a reveal or a check comes from it, never from what anyone said.
import { checks, str, clip, numeric } from './check.mjs';

const { fail, num, arr, object } = checks('numberline');
const fmt = v => String(+(+v).toPrecision(12)).replace('-', '−');

export const purpose = 'a number line with marks: fixed ones, ones the learner places (snapped to the step), and hidden ones a learner predicts before they are shown; ranges as labelled bands';

export const example = {
  min: -5, max: 5, step: 1,
  marks: [{ label: 'a', value: -3 }, { label: 'b', value: 2 }, { label: 'a+b', value: -1, hidden: true }, { label: 'b−a' }],
  ranges: [{ from: -5, to: 0, label: 'negative' }],
};

export const rules = `spec: {"min", "max", "step", "marks", "ranges"}:
- min, max: the ends of the line (min < max). A line for an n-bit range spans the whole range (four-bit two's complement: -8 to 7). step: the spacing marks snap to (default 1 for a short whole-number line, else a round tenth or so of the length; at most 2000 places).
- marks: up to 12, each {"label", "value", "hidden"}: label (12 characters at most, unique, no "=") names it for predictions and checks; a mark with a value is placed by the spec; with "hidden": true its value stays hidden until the learner has said where it lands; a mark with no value is the learner's to place.
- ranges: up to 4 labelled bands: {"from", "to", "label"}.
What a learner can predict and the engine checks: each mark's value, by its label. A checkpoint waits before a hidden mark is shown: {"at": "show a+b", "predict": ["a+b"]}. A construct target names where the learner's marks belong: {"b−a": 5, "tolerance": 0}.
Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["first_contact", "consolidation"], task: "predict: checkpoints at 'show <label>' for a hidden mark; predict that mark's value by its label. construct: marks with no value are the learner's to place; target {\"<label>\": value}.",  adapters: ['A1', 'A2'], modes: ['predict', 'construct', 'change', 'compare'], translations: ['graph'], reveals: ['F1', 'F7', 'F9'],
  notice: ['where zero is', 'the spacing between marks', 'which of two marks is larger, and by how much'] };

/** The spacing marks snap to when the spec gives none: 1 for a short whole-number line, else a round number about a fortieth of it. */
function defaultStep(min, max) {
  if (Number.isInteger(min) && Number.isInteger(max) && max - min <= 100) return 1;
  const raw = (max - min) / 40, p = 10 ** Math.floor(Math.log10(raw));
  return +([1, 2, 5, 10].map(m => m * p).find(s => s >= raw * .999)).toPrecision(12);
}
/** The labelled ticks: round values in about eight steps (the view draws them, anchored "tick-<v>"). */
export function ticksOf(spec) {
  const raw = (spec.max - spec.min) / 8, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map(m => m * p).find(s => s >= raw * .999), out = [];
  for (let k = Math.ceil(spec.min / step - 1e-9); k * step <= spec.max + 1e-9 * step; k++) out.push(+(k * step).toPrecision(12));
  return out;
}

export function validate(input) {
  const raw = object(input), min = num(numeric(raw.min), 'min'), max = num(numeric(raw.max), 'max');
  if (max <= min) fail('max must be greater than min');
  const step = raw.step == null ? defaultStep(min, max) : num(numeric(raw.step), 'step', Number.MIN_VALUE, max - min);
  if ((max - min) / step > 2000) fail(`a step of ${step} makes more than 2000 places on the line; use a larger step`);
  const inside = (v, what) => v >= min - 1e-9 && v <= max + 1e-9 ? v : fail(`${what} must be from ${min} to ${max}`), seen = new Set();
  const marks = (raw.marks == null ? [] : arr(raw.marks, 'marks', 0, 12)).map((m, i) => {
    const label = clip(str(m?.label).trim(), 12);
    if (!label) fail(`marks[${i}].label is required (a short name such as "a" or "−3/4"): predictions and checks use it`);
    if (label.includes('=')) fail(`marks[${i}].label must not contain "="`);
    if (seen.has(label)) fail(`two marks are labelled ${label}`);
    seen.add(label);
    const placed = m.value != null && m.value !== '';
    if (m.hidden && !placed) fail(`marks[${i}] (${label}) is hidden, so it needs its value: the engine shows it when the learner has predicted`);
    return { label, value: placed ? inside(num(numeric(m.value), `marks[${i}].value`), `marks[${i}].value`) : null, hidden: Boolean(m.hidden && placed), learner: !placed };
  });
  const ranges = (raw.ranges == null ? [] : arr(raw.ranges, 'ranges', 0, 4)).map((r, i) => {
    const from = inside(num(numeric(r?.from), `ranges[${i}].from`), `ranges[${i}].from`), to = inside(num(numeric(r?.to), `ranges[${i}].to`), `ranges[${i}].to`);
    return { from: Math.min(from, to), to: Math.max(from, to), label: clip(str(r.label).trim(), 32) };
  });
  return { min, max, step, marks, ranges };
}

const markOf = (spec, label) => spec.marks.find(m => m.label === label) ?? fail(`there is no mark labelled ${JSON.stringify(label)} (the marks are ${spec.marks.map(m => m.label).join(', ') || 'none'})`);
/** A value on the line's grid: snapped to the step, kept between the ends. */
export const snap = (spec, v) => +Math.min(spec.max, Math.max(spec.min, spec.min + Math.round((v - spec.min) / spec.step) * spec.step)).toPrecision(12);

/** placed: the learner's marks (label → value); shown: the hidden marks revealed so far. */
export const init = spec => ({ spec, placed: {}, shown: {} });
/** The values the page displays: a hidden mark's only once shown. */
export const visible = state => Object.fromEntries(Object.entries(values(state)).filter(([label]) => { const m = state.spec.marks.find(x => x.label === label); return !m?.hidden || state.shown[label]; }));
/** Everything shown (a repair compare starts revealed). */
export const reveal = state => ({ ...state, shown: Object.fromEntries(state.spec.marks.filter(m => m.hidden).map(m => [m.label, true])) });
/** "place <label>=<value>" (one of the learner's marks, snapped), "show <label>" (a hidden mark), or reset. */
export function step(state, action) {
  if (action === 'reset') return init(state.spec);
  const place = /^place (.+?)\s*=\s*(\S+)$/.exec(action), show = /^show (.+)$/.exec(action);
  if (place) {
    const m = markOf(state.spec, place[1].trim()), v = Number(String(place[2]).replace('−', '-'));
    if (!m.learner) fail(`${m.label} is placed by the spec; only the learner's own marks move`);
    if (!Number.isFinite(v)) fail(`place ${m.label}: ${place[2]} is not a number`);
    return { ...state, placed: { ...state.placed, [m.label]: snap(state.spec, v) } };
  }
  if (show) {
    const m = markOf(state.spec, show[1].trim());
    if (!m.hidden) fail(`${m.label} is not hidden`);
    return { ...state, shown: { ...state.shown, [m.label]: true } };
  }
  fail(`unknown action ${JSON.stringify(action)}; use "place a=3", "show a" or reset`);
}
export function passes(state, action) {
  const show = /^show (.+)$/.exec(action), place = /^place (.+?)\s*=/.exec(action), m = show && state.spec.marks.find(x => x.label === show[1].trim());
  return m?.hidden && !state.shown[m.label] ? [`show ${m.label}`] : place ? [`place ${place[1].trim()}`] : [];
}
/** Each mark's value by its label: a hidden one's too (the engine knows it), a learner's mark null until placed. */
export const values = state => Object.fromEntries(state.spec.marks.map(m => [m.label, m.learner ? state.placed[m.label] ?? null : m.value]));
/** target: where the learner's marks belong ({ "b−a": 5 }, or { values: {…} }), within `tolerance` (default half a step). */
export function check(state, target = {}) {
  const now = values(state), tol = Number(target.tolerance ?? state.spec.step / 2);
  for (const [label, want] of Object.entries(target.values ?? target)) {
    if (label === 'tolerance') continue;
    if (now[label] == null) return { pass: false, firstFailure: `${label} is not placed` };
    if (Math.abs(now[label] - Number(String(want).replace('−', '-'))) > tol + 1e-9) return { pass: false, firstFailure: `${label} is at ${fmt(now[label])}, not ${fmt(want)}` };
  }
  return { pass: true, firstFailure: null };
}
export function brief(state) {
  const { spec } = state, v = values(state);
  const marks = spec.marks.map(m => m.hidden && !state.shown[m.label] ? `${m.label} hidden` : v[m.label] == null ? `${m.label} not placed` : `${m.label} at ${fmt(v[m.label])}`);
  return `number line ${fmt(spec.min)} to ${fmt(spec.max)}${marks.length ? `: ${marks.join(', ')}` : ''}`;
}
/** Each mark, each range, and each labelled tick. */
export const anchors = state => [...state.spec.marks.map(m => `mark-${m.label}`), ...state.spec.ranges.map((_, i) => `range-${i}`), ...ticksOf(state.spec).map(v => `tick-${v}`)];
/** A checkpoint's place: "show <label>", before a hidden mark is shown. */
export function gate(state, at) {
  const m = /^show\s+(.+)$/i.exec(String(at ?? '').trim()), mark = m && state.spec.marks.find(x => x.label === m[1].trim());
  if (!m) fail(`a checkpoint's "at" is "show <label>" (before a hidden mark is shown), not ${JSON.stringify(at)}`);
  if (!mark?.hidden) fail(`checkpoint at ${JSON.stringify(at)}: ${m[1].trim()} is not a hidden mark`);
  return `show ${mark.label}`;
}
