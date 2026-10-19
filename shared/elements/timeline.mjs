// A timeline (history, literature, a case's chronology, evolution, any sequence with dates): the learner puts events
// in order, and can predict when one happened before its date is shown. The dates are the referee. Shares the ordering
// of proofblocks.mjs (order, pool), so one view draws both (src/elements/Order.jsx).
import { checks, str, clip } from './check.mjs';
import { arrange, arranged, placed } from './proofblocks.mjs';

const { fail, arr, object } = checks('timeline');
const ID = /^[A-Za-z][\w-]{0,15}$/;

export const purpose = 'a timeline: the learner puts events in order, or says when one happened before its date is shown; the dates decide';

export const example = {
  events: [
    { id: 'versailles', label: 'Treaty of Versailles signed', date: '1919-06-28' },
    { id: 'armistice', label: 'Armistice ends the fighting', date: '1918-11-11' },
    { id: 'locarno', label: 'Locarno Treaties', date: 1925 },
    { id: 'league', label: 'League of Nations first meets', date: '1920-01-16' },
  ],
};

export const rules = `spec: {"events", "start"}:
- events: 2 to 16, each {"id", "label", "date", "detail"}: id a letter, then up to 15 letters, digits, _ or -; label what happened, at most 80 characters (never the date itself); date a year as a number (negative for BCE) or "YYYY", "YYYY-MM" or "YYYY-MM-DD"; detail optional, at most 160 characters. List them in the order the learner first sees them: shuffle them yourself.
- start: optional, ids already placed in order (a frame to build on).
Events with the same date may go in either order. A checkpoint "date <id>" asks for the year of that event before it is revealed (its value is "year <id>"). Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["consolidation", "first_contact"], task: "construct: no checkpoints (the target is chronological order). predict: checkpoints at 'date <event id>'; predict 'year <event id>'.",  adapters: ['A3', 'A4', 'A2'], modes: ['construct', 'predict', 'change', 'compare'], translations: ['argmap', 'sorter'], reveals: ['F9', 'F10'],
  notice: ['what was known by each date', 'which events overlap or come close together'] };

// A date as given, and as a number that sorts (year, then month, then day).
function when(value, at) {
  const t = str(value).trim(), m = typeof value === 'number' ? (Number.isInteger(value) ? [null, String(value)] : null) : /^(-?\d{1,5})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(t);
  if (!m) fail(`${at}.date must be a year as a number, or "YYYY", "YYYY-MM" or "YYYY-MM-DD", not ${JSON.stringify(value)}`);
  const year = +m[1], month = m[2] ? +m[2] : 0, day = m[3] ? +m[3] : 0;
  if (month > 12 || day > 31) fail(`${at}.date ${JSON.stringify(value)} is not a real date`);
  return { date: typeof value === 'number' ? String(value) : t, year, key: year * 10_000 + month * 100 + day };
}

export function validate(input) {
  const raw = object(input), ids = new Set();
  const events = arr(raw.events, 'events', 2, 16).map((e, i) => {
    if (!e || typeof e !== 'object') fail(`events[${i}] must be an object like {"id": "a", "label": "…", "date": 1919}`);
    const id = str(e.id).trim(), label = str(e.label).trim();
    if (!ID.test(id)) fail(`events[${i}].id ${JSON.stringify(e.id)} must be a letter, then up to 15 letters, digits, _ or -`);
    if (ids.has(id)) fail(`two events are named ${id}`);
    ids.add(id);
    if (!label) fail(`event ${id} has no label`);
    if (label.length > 80) fail(`event ${id}'s label is over 80 characters`);
    return { id, label, ...when(e.date, `event ${id}`), detail: clip(str(e.detail).trim(), 160) };
  });
  const start = (raw.start == null ? [] : arr(raw.start, 'start', 0, events.length)).map(id => str(id).trim());
  for (const id of start) if (!ids.has(id)) fail(`start names ${JSON.stringify(id)}, which is not an event`);
  if (new Set(start).size < start.length) fail('start names an event twice');
  return { events, start };
}

const eventOf = (spec, id) => spec.events.find(e => e.id === id);
export const init = spec => ({ spec, ...arranged(spec, spec.start), revealed: [] });
/** The values the page displays: an event's year only once revealed. */
export const visible = state => Object.fromEntries(Object.entries(values(state)).filter(([name]) => !name.startsWith('year ') || state.revealed.includes(name.slice(5))));
/** Every date shown (a repair compare starts revealed). */
export const reveal = state => ({ ...state, revealed: state.spec.events.map(e => e.id) });
/** The shared arranging actions, and 'reveal <id>': its date shown (the reveal a "date <id>" checkpoint waits for). */
export function step(state, action) {
  const reveal = /^reveal (\S+)$/.exec(String(action).trim());
  if (reveal) {
    if (!eventOf(state.spec, reveal[1])) fail(`${JSON.stringify(reveal[1])} is not an event`);
    return state.revealed.includes(reveal[1]) ? state : { ...state, revealed: [...state.revealed, reveal[1]] };
  }
  const next = arrange(state, action, state.spec.start);
  return next ? next : fail(`unknown action ${JSON.stringify(action)}; use "add <id>", "remove <id>", "move <id> <position>", "reveal <id>" or reset`);
}
export const passes = (state, action) => { const m = /^reveal (\S+)$/.exec(String(action).trim()); return m ? [`date ${m[1]}`] : []; };
/** The arrangement, and each event's year (the engine's truth; the view shows a date only once revealed). */
export const values = state => ({ ...placed(state), ...Object.fromEntries(state.spec.events.map(e => [`year ${e.id}`, String(e.year)])) });
/** The action that passes a checkpoint: 'date <id>' is passed by revealing that event. */
export const actionFor = at => String(at).replace(/^date /, 'reveal ');
export function gate(state, at) {
  const m = /^date\s+(\S+)$/i.exec(str(at).trim());
  if (!m || !eventOf(state.spec, m[1])) fail(`a timeline checkpoint's "at" is "date <event id>", not ${JSON.stringify(at)}`);
  return `date ${m[1]}`;
}
/** Years said as numbers, "500 BC" as -500, given to the names in order. */
export function parse(text, names) {
  const years = [...String(text ?? '').matchAll(/(?<![\w.])(-?\d{1,5})(?:\s*(b\.?c\.?e?\.?)(?![a-z]))?/gi)].map(m => String(m[2] ? -Math.abs(+m[1]) : +m[1]));
  const values = Object.fromEntries(names.flatMap((name, i) => years[i] !== undefined ? [[name, years[i]]] : []));
  return { values, parsed: Object.keys(values).length > 0 };
}
/** Chronological, ties free; the first failure is the first neighbouring pair out of order, then anything not placed. */
export function check(state) {
  const { spec, order } = state, at = id => eventOf(spec, id);
  const i = order.findIndex((id, k) => k > 0 && at(order[k - 1]).key > at(id).key);
  if (i > 0) return { pass: false, firstFailure: `'${at(order[i - 1]).label}' is placed before '${at(order[i]).label}', but it happened later` };
  if (order.length < spec.events.length) return { pass: false, firstFailure: `${spec.events.length - order.length} of ${spec.events.length} events are not placed yet` };
  return { pass: true, firstFailure: null };
}
export const brief = state => `${state.order.length} of ${state.spec.events.length} events placed${state.order.length ? `: ${state.order.map((id, i) => { const e = eventOf(state.spec, id); return `${i + 1}. ${clip(e.label, 40)}${state.revealed.includes(id) ? ` (${e.date})` : ''}`; }).join(' ')}` : ''}`.slice(0, 400);
export const anchors = state => state.spec.events.map(e => `event-${e.id}`);
