// Proof blocks (Parsons problems, any subject): the learner puts given steps in order (a proof, a derivation, a
// procedure, an argument); distractors are steps a known wrong model would take. The check is the steps' dependency
// graph, so any order it allows passes (R2), and it reports the first failure only. Its ordering state (order, pool) is
// shared with timeline.mjs, so one view draws both (src/elements/Order.jsx).
import { checks, str, clip } from './check.mjs';

const { fail, int, arr, object } = checks('proofblocks');
const ID = /^[A-Za-z][\w-]{0,15}$/;

export const purpose = 'proof blocks: the learner arranges given steps (a proof, a derivation, a procedure, an argument) in order; distractor steps come from known wrong models, and any order the steps\' dependencies allow passes';

export const example = {
  blocks: [
    { id: 'sq', text: 'Then $n^2 = 4k^2 + 4k + 1$.' },
    { id: 'odd', text: 'Let $n$ be odd, so $n = 2k + 1$ for some integer $k$.' },
    { id: 'bad', text: 'Then $n^2 = 2k^2 + 1$.' },
    { id: 'end', text: 'So $n^2 = 2(2k^2 + 2k) + 1$, which is odd.' },
  ],
  solution: { deps: { sq: ['odd'], end: ['sq'] } },
  distractors: ['bad'],
};

export const rules = `spec: {"blocks", "solution", "distractors"}:
- blocks: 3 to 16 steps, each {"id", "text", "indent"}: id a letter, then up to 15 letters, digits, _ or -; text the step as the course writes it (at most 200 characters; inline \`code\` and $math$ allowed); indent 0-4, optional, for nested code or cases. List them in the order the learner first sees them: shuffle them yourself, the page never reorders.
- solution: {"deps": {"<id>": ["<ids that must come before it>"]}} when several orders are valid (any order that respects deps passes), or {"order": ["<ids in the one right order>"]} when only one is. Every block not in distractors belongs to the solution.
- distractors: 0 to 4 ids of steps that do not belong, each one a known wrong model would take.
The check reports only the first failure. Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["consolidation", "transfer"], task: "construct: no checkpoints; the solution in the spec is the target, and the check reports the first failure only.",  adapters: ['A1', 'A2', 'A3', 'A4'], modes: ['construct', 'change', 'compare'], translations: ['argmap'], reveals: ['F4', 'F6', 'F7', 'F11'],
  notice: ['what each step needs from the steps before it', 'which step would only follow from a wrong idea'] };

export function validate(input) {
  const raw = object(input), ids = new Set();
  const blocks = arr(raw.blocks, 'blocks', 3, 16).map((b, i) => {
    if (!b || typeof b !== 'object') fail(`blocks[${i}] must be an object like {"id": "a", "text": "…"}`);
    const id = str(b.id).trim(), text = str(b.text).trim();
    if (!ID.test(id)) fail(`blocks[${i}].id ${JSON.stringify(b.id)} must be a letter, then up to 15 letters, digits, _ or -`);
    if (ids.has(id)) fail(`two blocks are named ${id}`);
    ids.add(id);
    if (!text) fail(`block ${id} has no text`);
    if (text.length > 200) fail(`block ${id}'s text is over 200 characters; split the step`);
    return { id, text, indent: b.indent == null ? 0 : int(b.indent, `block ${id}'s indent`, 0, 4) };
  });
  const distractors = (raw.distractors == null ? [] : arr(raw.distractors, 'distractors', 0, 4)).map(d => str(d).trim());
  for (const d of distractors) if (!ids.has(d)) fail(`distractors names ${JSON.stringify(d)}, which is not a block`);
  const required = blocks.map(b => b.id).filter(id => !distractors.includes(id)), named = id => required.includes(id) ? id : fail(`${JSON.stringify(id)} is ${ids.has(id) ? 'a distractor' : 'not a block'}; the solution uses only the other blocks`);
  if (required.length < 2) fail('at least 2 blocks must belong to the solution');
  const s = raw.solution && typeof raw.solution === 'object' && !Array.isArray(raw.solution) ? raw.solution : fail('solution must be {"deps": {...}} or {"order": [...]}');
  if (s.deps != null) {
    if (typeof s.deps !== 'object' || Array.isArray(s.deps)) fail('solution.deps must map a block id to the ids that must come before it');
    const deps = Object.fromEntries(Object.entries(s.deps).map(([id, before]) => [named(id), arr(before, `solution.deps.${id}`, 0, 16).map(d => named(str(d).trim()))]));
    // A dependency cycle has no valid order.
    const done = new Set(), on = new Set();
    const visit = id => { if (on.has(id)) fail(`solution.deps has a cycle through ${id}`); if (done.has(id)) return; on.add(id); (deps[id] || []).forEach(visit); on.delete(id); done.add(id); };
    required.forEach(visit);
    return { blocks, solution: { deps }, distractors };
  }
  const order = arr(s.order, 'solution.order', 2, 16).map(id => named(str(id).trim()));
  if (order.length !== required.length || new Set(order).size !== order.length) fail(`solution.order must list every block that is not a distractor exactly once (${required.join(', ')})`);
  return { blocks, solution: { order }, distractors };
}

// ---------- the ordering the arranging kinds share (proof blocks, timeline): the ids placed, in order, and the rest ----------
const idsOf = spec => (spec.blocks || spec.events).map(it => it.id);
/** The pool keeps the spec's own order, so an item taken back returns where it was. */
export const arranged = (spec, order) => ({ order, pool: idsOf(spec).filter(id => !order.includes(id)) });
/** 'add <id>', 'remove <id>', 'move <id> <position>' (1-based), 'reset'; false when the action isn't one of these. */
export function arrange(state, action, start = []) {
  const [verb, id, at] = String(action).trim().split(/\s+/), order = state.order;
  if (verb === 'reset' && !id) return { ...state, ...arranged(state.spec, start) };
  if (!['add', 'remove', 'move'].includes(verb)) return false;
  if (!idsOf(state.spec).includes(id)) fail(`${JSON.stringify(id ?? '')} is not one of its items`);
  if (verb === 'add' && !at) return order.includes(id) ? fail(`${id} is already placed`) : { ...state, ...arranged(state.spec, [...order, id]) };
  if (verb === 'remove' && !at) return !order.includes(id) ? fail(`${id} is not placed`) : { ...state, ...arranged(state.spec, order.filter(x => x !== id)) };
  if (verb === 'move' && /^\d+$/.test(at ?? '')) {
    if (!order.includes(id)) fail(`${id} is not placed`);
    const rest = order.filter(x => x !== id), to = Math.max(1, Math.min(order.length, +at));
    return { ...state, ...arranged(state.spec, [...rest.slice(0, to - 1), id, ...rest.slice(to - 1)]) };
  }
  return false;
}
/** The arrangement as values: { order: 'a,b,c', 'pos <id>': '2' | 'out' }. */
export const placed = state => ({ order: state.order.join(','), ...Object.fromEntries(idsOf(state.spec).map(id => [`pos ${id}`, state.order.includes(id) ? String(state.order.indexOf(id) + 1) : 'out'])) });

export const init = spec => ({ spec, ...arranged(spec, []) });
export function step(state, action) {
  return arrange(state, action) || fail(`unknown action ${JSON.stringify(action)}; use "add <id>", "remove <id>", "move <id> <position>" or reset`);
}
export const values = placed;

const quote = (spec, id) => `'${clip(spec.blocks.find(b => b.id === id).text, 70)}'`;
/** The arrangement against the solution; the first failure only, never which step is missing. */
export function check(state) {
  const { spec, order } = state, { solution, distractors } = spec, say = id => quote(spec, id);
  const stray = order.find(id => distractors.includes(id));
  if (stray) return { pass: false, firstFailure: `the step ${say(stray)} is not part of the proof` };
  const required = spec.blocks.map(b => b.id).filter(id => !distractors.includes(id));
  if (solution.order) {
    const wrong = order.findIndex((id, i) => solution.order[i] !== id);
    if (wrong >= 0) return { pass: false, firstFailure: `step ${wrong + 1}, ${say(order[wrong])}, is out of place` };
  } else for (const [i, id] of order.entries()) {
    const need = (solution.deps[id] || []).find(d => !order.slice(0, i).includes(d));
    if (need) return { pass: false, firstFailure: `the step ${say(id)} is used before ${say(need)}, which it depends on` };
  }
  if (order.length < required.length) return { pass: false, firstFailure: `a step is missing: ${order.length} of ${required.length} are placed` };
  return { pass: true, firstFailure: null };
}
export const brief = state => `${state.order.length} of ${state.spec.blocks.length - state.spec.distractors.length} steps placed${state.order.length ? `: ${state.order.map((id, i) => `${i + 1}. ${clip(state.spec.blocks.find(b => b.id === id).text, 50)}`).join(' ')}` : ''}`.slice(0, 400);
export const anchors = state => state.spec.blocks.map(b => `block-${b.id}`);
