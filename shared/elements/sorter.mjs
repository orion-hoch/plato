// A sorter (classification in any subject: examples and near misses, sources by kind, evidence for and against): the
// learner puts each item in a group, or says which group an item belongs to before the engine places it. The key is
// the referee; the check names the first item that is off, never where it belongs.
import { checks, str, clip } from './check.mjs';

const { fail, arr, object } = checks('sorter');
const ID = /^[A-Za-z][\w-]{0,15}$/;

export const purpose = 'a sorter: the learner puts items into groups (examples and near misses, sources by kind, evidence for and against); a key decides';

export const example = {
  items: [{ id: 'whale', text: 'Blue whale' }, { id: 'shark', text: 'Great white shark' }, { id: 'bat', text: 'Fruit bat' }, { id: 'eel', text: 'Moray eel' }],
  bins: [{ id: 'mammal', label: 'Mammals' }, { id: 'fish', label: 'Fish' }],
  key: { whale: 'mammal', shark: 'fish', bat: 'mammal', eel: 'fish' },
};

export const rules = `spec: {"items", "bins", "key"}:
- items: 2 to 24, each {"id", "text"}: id a letter, then up to 15 letters, digits, _ or -; text at most 120 characters (inline \`code\` and $math$ allowed). Include near misses: items that look like one group but belong to another.
- bins: 2 to 6 groups, each {"id", "label"} (label at most 40 characters).
- key: every item's id → the id of the bin it belongs in.
A checkpoint "put <item id>" asks which group that item belongs in before the engine places it (its value is the item's id, a bin id). Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["consolidation", "repair"], task: "construct: no checkpoints (the key is the target). predict: checkpoints at 'put <item id>'; predict the item id (its value is the bin id).",  adapters: ['A1', 'A2', 'A3', 'A4', 'A5'], modes: ['construct', 'change', 'compare', 'predict'], translations: ['argmap', 'timeline'], reveals: ['F2', 'F8'],
  notice: ['the feature that decides the group', 'the near miss that looks like the other group'] };

export function validate(input) {
  const raw = object(input), ids = new Set();
  const named = (list, what, min, max, room) => arr(list, `${what}s`, min, max).map((x, i) => {
    if (!x || typeof x !== 'object') fail(`${what}s[${i}] must be an object with an id`);
    const id = str(x.id).trim(), text = str(what === 'item' ? x.text : x.label).trim();
    if (!ID.test(id)) fail(`${what}s[${i}].id ${JSON.stringify(x.id)} must be a letter, then up to 15 letters, digits, _ or -`);
    if (ids.has(id)) fail(`the id ${id} is used twice (items and bins need different ids)`);
    ids.add(id);
    if (!text) fail(`${what} ${id} has no ${what === 'item' ? 'text' : 'label'}`);
    if (text.length > room) fail(`${what} ${id}'s ${what === 'item' ? 'text' : 'label'} is over ${room} characters`);
    return what === 'item' ? { id, text } : { id, label: text };
  });
  const items = named(raw.items, 'item', 2, 24, 120), bins = named(raw.bins, 'bin', 2, 6, 40);
  const k = raw.key && typeof raw.key === 'object' && !Array.isArray(raw.key) ? raw.key : fail('key must map every item id to a bin id');
  const key = Object.fromEntries(items.map(it => {
    const bin = str(k[it.id]).trim();
    if (!bins.some(b => b.id === bin)) fail(`key.${it.id} must be one of the bins (${bins.map(b => b.id).join(', ')}), not ${JSON.stringify(k[it.id] ?? null)}`);
    return [it.id, bin];
  }));
  for (const id of Object.keys(k)) if (!items.some(it => it.id === id)) fail(`key names ${JSON.stringify(id)}, which is not an item`);
  return { items, bins, key };
}

const itemOf = (spec, id) => spec.items.find(it => it.id === id) || fail(`${JSON.stringify(id ?? '')} is not an item`);
export const init = spec => ({ spec, placed: {} });
/** 'put <item> <bin>' (the learner's placement), 'put <item>' (the engine places it where it belongs: a reveal), 'take <item>', reset. */
export function step(state, action) {
  const [verb, id, bin, extra] = String(action).trim().split(/\s+/);
  if (verb === 'reset' && !id) return init(state.spec);
  if (verb === 'put' && !extra) {
    const item = itemOf(state.spec, id), to = bin ?? state.spec.key[item.id];
    if (!state.spec.bins.some(b => b.id === to)) fail(`${JSON.stringify(to)} is not a bin`);
    return { ...state, placed: { ...state.placed, [item.id]: to } };
  }
  if (verb === 'take' && !bin) { const { [itemOf(state.spec, id).id]: _, ...rest } = state.placed; return { ...state, placed: rest }; }
  fail(`unknown action ${JSON.stringify(action)}; use "put <item> <bin>", "put <item>", "take <item>" or reset`);
}
/** Any placement of an item passes its "put <item>" checkpoint, so a prediction comes first. */
export const passes = (state, action) => { const m = /^put (\S+)(?: \S+)?$/.exec(String(action).trim()); return m ? [`put ${m[1]}`] : []; };
export const values = state => Object.fromEntries(state.spec.items.map(it => [it.id, state.placed[it.id] ?? 'out']));
export function gate(state, at) {
  const m = /^put\s+(\S+)$/i.exec(str(at).trim());
  if (!m || !state.spec.items.some(it => it.id === m[1])) fail(`a sorter checkpoint's "at" is "put <item id>", not ${JSON.stringify(at)}`);
  return `put ${m[1]}`;
}
/** The groups named in what was said (by label or id), in the order said, given to the names in order. */
export function parse(text, names, state = null) {
  const said = ` ${String(text ?? '').toLowerCase()} `, bins = (state?.spec ?? state)?.bins ?? [];
  const hits = bins.flatMap(b => [b.label, b.id].map(w => ({ b, at: said.search(new RegExp(`(?<![\\w])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/s$/, '')}s?(?![\\w])`)) })))
    .filter(h => h.at >= 0).sort((x, y) => x.at - y.at).map(h => h.b.id).filter((id, i, all) => all.indexOf(id) === i);
  const values = Object.fromEntries(names.flatMap((name, i) => hits[i] ? [[name, hits[i]]] : []));
  return { values, parsed: Object.keys(values).length > 0 };
}
/** Every item in its key's bin; the first failure names the first item off, never where it belongs. */
export function check(state) {
  const { spec, placed } = state, off = spec.items.find(it => placed[it.id] !== spec.key[it.id]);
  if (!off) return { pass: true, firstFailure: null };
  return { pass: false, firstFailure: placed[off.id] ? `'${clip(off.text, 60)}' is in the wrong group` : `'${clip(off.text, 60)}' is not sorted yet` };
}
export const brief = state => `${state.spec.bins.map(b => `${b.label}: ${state.spec.items.filter(it => state.placed[it.id] === b.id).map(it => clip(it.text, 30)).join(', ') || 'nothing'}`).join('; ')}; not sorted: ${state.spec.items.filter(it => !state.placed[it.id]).length}`.slice(0, 400);
export const anchors = state => [...state.spec.items.map(it => `item-${it.id}`), ...state.spec.bins.map(b => `bin-${b.id}`)];
