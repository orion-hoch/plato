// An argument map (docs/system-spec.md §15b; interactive-learning.md §B, §D): claims, the sources and claims that support
// or undermine them, and support propagated through it, so the page (not a model) says which claims survive when a
// source is removed. Any subject that argues from evidence: history, law, literature, a design review. Pure.
import { checks, str, clip } from './check.mjs';
import { diffValues } from './values.mjs';

const { fail, arr, object } = checks('argmap');
const ID = /^[A-Za-z][\w-]{0,23}$/, KINDS = ['supports', 'undermines'];

export const purpose = 'an argument map: sources and claims linked by supports and undermines; the page propagates support, so switching a source off shows which claims fall';

export const example = {
  claims: [{ id: 'c1', text: 'The 1919 settlement made a second war likely.' }, { id: 'c2', text: 'German resentment of the treaty was widespread.' }],
  sources: [{ id: 's1', text: 'Keynes, The Economic Consequences of the Peace', author: 'J. M. Keynes', date: '1919' }, { id: 's2', text: 'Election results of the early 1930s', date: '1932' }, { id: 's3', text: 'Reparations were largely unpaid after 1924', date: '1932' }],
  links: [{ from: 's1', to: 'c2', kind: 'supports' }, { from: 's2', to: 'c2', kind: 'supports' }, { from: 'c2', to: 'c1', kind: 'supports' }, { from: 's3', to: 'c1', kind: 'undermines' }, { from: 's1', to: 'c1', kind: 'supports' }],
};

export const rules = `spec: {"claims": [...], "sources": [...], "links": [...], "target": {"links": [...]}}:
- claims: 1 to 12, each {"id", "text"}; sources: 0 to 12, each {"id", "text", "author", "date", "off"} (author, date optional; "off": true starts it switched off).
- id: a letter, then up to 23 letters, digits, _ or -; unique across claims and sources. text: at most 300 characters.
- links: at most 48, each {"from": a source or claim id, "to": a claim id, "kind": "supports" | "undermines"}; one link per pair.
- How the page decides: a claim stands when the links supporting it outnumber the links undermining it, counting only sources that are on and claims that stand. A claim with no grounding in a source falls.
- target (construct tasks): the links the learner should build, in the same shape; start them from "links": [] or a partial map.
- Checkpoints: {"at": "toggle s1", "predict": ["c1"]}: before switching source s1 off (or on), which claims stand or fall. Values: each claim's id is "stands" or "falls"; each source's id is "on" or "off".
Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["repair", "transfer"], task: "predict: checkpoints at 'toggle <source id>' (that source switched off or on); predict claim ids, each 'stands' or 'falls'. construct: target {\"links\": [...]}.",  adapters: ['A3', 'A4'], modes: ['predict', 'change', 'construct', 'compare', 'teach'], translations: ['sorter', 'timeline'], reveals: ['F9', 'F10', 'F11'],
  notice: ['which claims rest on a single source', 'what undermines what', 'which claims fall when one source is removed'] };

function linksOf(raw, name, ids, claims) {
  const seen = new Set();
  return (raw == null ? [] : arr(raw, name, 0, 48)).map((l, i) => {
    const from = str(l?.from).trim(), to = str(l?.to).trim(), kind = str(l?.kind).trim() || 'supports';
    if (!ids.has(from)) fail(`${name}[${i}].from ${JSON.stringify(l?.from)} is not a source or claim id`);
    if (!claims.has(to)) fail(`${name}[${i}].to ${JSON.stringify(l?.to)} is not a claim id (links point at claims)`);
    if (from === to) fail(`${name}[${i}] links ${from} to itself`);
    if (!KINDS.includes(kind)) fail(`${name}[${i}].kind must be "supports" or "undermines"`);
    if (seen.has(`${from}>${to}`)) fail(`${name} links ${from} to ${to} twice; one link per pair`);
    seen.add(`${from}>${to}`);
    return { from, to, kind };
  });
}

export function validate(input) {
  const raw = object(input), ids = new Set();
  const named = (list, what, min) => arr(list, what, min, 12).map((x, i) => {
    const id = str(x?.id).trim();
    if (!ID.test(id)) fail(`${what}[${i}].id ${JSON.stringify(x?.id)} must be a letter, then up to 23 letters, digits, _ or -`);
    if (ids.has(id)) fail(`two items are named ${id}; ids are unique across claims and sources`);
    ids.add(id);
    const text = clip(str(x.text).trim(), 300);
    if (!text) fail(`${what}[${i}] (${id}) needs its text`);
    return { id, text };
  });
  const claims = named(raw.claims, 'claims', 1), sources = named(raw.sources ?? [], 'sources', 0).map((s, i) => {
    const r = raw.sources[i];
    return { ...s, author: clip(str(r.author).trim(), 80), date: clip(str(r.date).trim(), 40), off: r.off === true };
  });
  const claimIds = new Set(claims.map(c => c.id));
  const spec = { claims, sources, links: linksOf(raw.links, 'links', ids, claimIds) };
  if (raw.target != null) spec.target = { links: linksOf(object(raw.target, 'target').links, 'target.links', ids, claimIds) };
  return spec;
}

export const init = spec => ({ spec, off: spec.sources.filter(s => s.off).map(s => s.id), links: spec.links });

/** Which claims stand: supports from sources that are on and claims that stand must outnumber the underminers. */
export function standing(state) {
  const { spec, off, links } = state, sources = new Set(spec.sources.map(s => s.id).filter(id => !off.includes(id)));
  let stands = new Set();
  // ponytail: iterate to a fixpoint from "nothing stands" (support must be grounded in a source); a map that undermines
  // in a cycle can oscillate, so it stops after 2n + 2 passes on the last pass, which is still deterministic.
  for (let pass = 0; pass < 2 * spec.claims.length + 2; pass++) {
    const live = from => sources.has(from) || stands.has(from), next = new Set();
    for (const c of spec.claims) {
      const count = kind => links.filter(l => l.to === c.id && l.kind === kind && live(l.from)).length;
      if (count('supports') > count('undermines')) next.add(c.id);
    }
    if (next.size === stands.size && [...next].every(id => stands.has(id))) break;
    stands = next;
  }
  return stands;
}

const textOf = (spec, id) => (spec.claims.find(c => c.id === id) || spec.sources.find(s => s.id === id))?.text ?? id;
const short = text => clip(String(text).replace(/[.!?]+$/, ''), 60);

/** "toggle s1" (a source on or off), "link s1 c2 supports", "unlink s1 c2", or "reset". */
export function step(state, action) {
  const a = String(action ?? '').trim(), [verb, x, y, kind] = a.split(/\s+/), { spec } = state, ids = new Set([...spec.claims, ...spec.sources].map(n => n.id));
  if (a === 'reset') return init(spec);
  if (verb === 'toggle') {
    if (!spec.sources.some(s => s.id === x)) fail(`${x} is not a source`);
    return { ...state, off: state.off.includes(x) ? state.off.filter(id => id !== x) : [...state.off, x] };
  }
  if (verb === 'link') {
    if (!ids.has(x) || !spec.claims.some(c => c.id === y) || x === y) fail(`link ${x} ${y}: link a source or claim to a claim`);
    if (!KINDS.includes(kind)) fail('a link is "supports" or "undermines"');
    return { ...state, links: [...state.links.filter(l => !(l.from === x && l.to === y)), { from: x, to: y, kind }] };
  }
  if (verb === 'unlink') return { ...state, links: state.links.filter(l => !(l.from === x && l.to === y)) };
  fail(`unknown action ${JSON.stringify(a)}; use "toggle <source>", "link <from> <claim> supports|undermines", "unlink <from> <claim>" or reset`);
}

export const passes = (state, action) => { const m = /^toggle (\S+)$/.exec(String(action ?? '').trim()); return m ? [`toggle ${m[1]}`] : []; };

export function gate(state, at) {
  const m = /^toggle\s+(\S+)$/i.exec(String(at ?? '').trim());
  if (!m) fail(`a checkpoint's "at" is "toggle <source id>", not ${JSON.stringify(at)}`);
  if (!state.spec.sources.some(s => s.id === m[1])) fail(`checkpoint at "toggle ${m[1]}": ${m[1]} is not a source`);
  return `toggle ${m[1]}`;
}

export function values(state) {
  const stands = standing(state);
  return { ...Object.fromEntries(state.spec.claims.map(c => [c.id, stands.has(c.id) ? 'stands' : 'falls'])), ...Object.fromEntries(state.spec.sources.map(s => [s.id, state.off.includes(s.id) ? 'off' : 'on'])) };
}

const VERDICT = /\b(stands?|holds?|survives?|true|still true|remains?|falls?|collapses?|fails?|false|loses?)\b/gi;
const verdict = word => /^(stand|stands|hold|holds|survive|survives|true|remain|remains)$/i.test(word) ? 'stands' : 'falls';
/** Predictions said in words: "c1 falls", "c2 still stands", or one verdict for every claim asked ("both stand"). */
export function parse(text, names) {
  const said = String(text ?? ''), values = {};
  for (const name of names) {
    const m = new RegExp(`(?<![\\w-])${name.replace(/[-]/g, '\\-')}(?![\\w-])[^.;,]{0,24}?\\b(stands?|holds?|survives?|true|remains?|falls?|collapses?|fails?|false|loses?)\\b`, 'i').exec(said);
    if (m) values[name] = verdict(m[1]);
  }
  const loose = [...said.matchAll(VERDICT)].map(m => verdict(m[1].replace(/^still /, ''))), rest = names.filter(n => !(n in values));
  if (rest.length && loose.length) rest.forEach((name, i) => { values[name] = loose.length === 1 ? loose[0] : loose[Math.min(i, loose.length - 1)]; });
  return { values, parsed: Object.keys(values).length > 0 };
}
export const diff = (predicted, actual, names) => diffValues(predicted, actual, names);

/** target: { links } (construct; else the spec's own target) — the first link missing, of the wrong kind, or extra; or claim values. */
export function check(state, target = {}) {
  const want = target?.links ?? state.spec.target?.links, { spec } = state, says = l => `"${short(textOf(spec, l.from))}" ${l.kind === 'supports' ? 'supports' : 'undermines'} "${short(textOf(spec, l.to))}"`;
  if (Array.isArray(want)) {
    for (const l of want) {
      const have = state.links.find(h => h.from === l.from && h.to === l.to);
      if (!have) return { pass: false, firstFailure: `missing: ${says(l)}` };
      if (have.kind !== l.kind) return { pass: false, firstFailure: `"${short(textOf(spec, l.from))}" should ${l.kind === 'supports' ? 'support' : 'undermine'} "${short(textOf(spec, l.to))}", not ${have.kind === 'supports' ? 'support' : 'undermine'} it` };
    }
    const extra = state.links.find(h => !want.some(l => l.from === h.from && l.to === h.to));
    return extra ? { pass: false, firstFailure: `not in the argument: ${says(extra)}` } : { pass: true, firstFailure: null };
  }
  const now = values(state), miss = Object.entries(target || {}).find(([name, v]) => now[name] !== undefined && now[name] !== v);
  return { pass: !miss, firstFailure: miss ? `"${short(textOf(spec, miss[0]))}" ${now[miss[0]]}, not ${miss[1]}` : null };
}

export function brief(state) {
  const v = values(state), ids = list => list.map(x => x.id);
  const up = ids(state.spec.claims).filter(id => v[id] === 'stands'), down = ids(state.spec.claims).filter(id => v[id] === 'falls');
  return `claims standing: ${up.join(', ') || 'none'}; falling: ${down.join(', ') || 'none'}${state.off.length ? `; sources off: ${state.off.join(', ')}` : ''}; ${state.links.length} links`;
}

export const anchors = state => [...state.spec.sources.map(s => `source-${s.id}`), ...state.spec.claims.map(c => `claim-${c.id}`), ...state.links.map(l => `link-${l.from}-${l.to}`)];
