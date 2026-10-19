// The element toolkit (docs/system-spec.md §15b): one registry, read by the engine to choose an element for a move and
// by the page to draw it and run its task (task.mjs). Each kind is one module, shared/elements/<kind>.mjs, exporting:
//   purpose, rules, example                 what a model writing a spec reads (study's representations, the engine)
//   info { adapters, modes, notice, translations, reveals }   reveals: the error kinds (F1–F12, §8) it can make visible
//   validate(spec) → spec                   normalized, or throws "Invalid <kind>: …" worded so a model can act on it
//   init(spec) → state                      the runtime state ({ spec, … }), the source of truth for every reveal
//   step(state, action) → state             pure; an action it can't take throws
//   passes(state, action) → gate keys       the checkpoints an action passes ("line 7", "flip A", "set h")
//   values(state) → { name: value }         what can be predicted, revealed and checked
//   brief(state), anchors(state)            a line for Plato and the director; the parts point_to can land on
//   next?                                   the action that moves it on, for kinds with a position (a checkpoint waits there)
//   check?(state, target), diff?(predicted, actual, names), gate?(state, at), parse?(text, names)
// Adding a kind is one module and one line below; nothing in the engine changes. Nothing here branches on subject.
import { checks, str, clip } from './check.mjs';
import * as stepper from './trace.mjs';
import * as circuit from './circuit.mjs';
import * as figure from './figure.mjs';
import * as scene3d from './scene3d.mjs';
import * as memory from './memory.mjs';
import * as numberline from './numberline.mjs';
import * as graph from './graph.mjs';
import * as proofblocks from './proofblocks.mjs';
import * as tracetable from './tracetable.mjs';
import * as timeline from './timeline.mjs';
import * as argmap from './argmap.mjs';
import * as sorter from './sorter.mjs';
import * as curves from './curves.mjs';
import * as sim from './sim.mjs';
import * as pathway from './pathway.mjs';
import * as canvas from './canvas.mjs';

const { fail, arr, object } = checks('element');

export { same, predictionFrom, diffValues } from './values.mjs';
import { diffValues, checkValues, same, canon } from './values.mjs';

// ---------- reading: a portion's blocks, every sentence anchored (study's course model uses the same names) ----------
const SENTENCE = /(?<=[.!?])\s+(?=[A-Z0-9"“(`$−-])/;
/** A block's sentences as [{ anchor, text }]: its own when given, else its text split, named "<block anchor>.s1", ".s2", …. */
export function sentenceAnchors(block) {
  if (Array.isArray(block?.sentences) && block.sentences.length) return block.sentences.map((s, i) => ({ anchor: str(s?.anchor).trim() || `${block.anchor}.s${i + 1}`, text: str(s?.text) }));
  return str(block?.text).trim().split(SENTENCE).filter(Boolean).map((text, i) => ({ anchor: `${block.anchor}.s${i + 1}`, text }));
}
const BLOCKS = ['heading', 'para', 'list', 'code', 'math', 'figure', 'table', 'quote'];
const reading = {
  purpose: 'a reading portion: a clean document whose title is its purpose, every sentence anchored', rules: '', example: null,
  info: { adapters: ['A1', 'A2', 'A3', 'A4', 'A5'], modes: ['explain'], notice: ['the key sentences the purpose points at'], translations: [], reveals: ['F5', 'F10'] },
  validate(portion) {
    const p = object(portion, 'portion', 200_000), id = str(p.id).trim() || fail('a portion needs an id'), purpose = str(p.purpose).trim() || fail('a portion needs a purpose (its title)');
    const body = arr(p.body, 'body', 1, 400).map((b, i) => {
      if (!b || !BLOCKS.includes(b.kind)) fail(`body[${i}].kind must be one of ${BLOCKS.join(', ')}`);
      const anchor = str(b.anchor).trim() || `b${i + 1}`;
      return { ...b, anchor, text: str(b.text), ...(['para', 'quote', 'heading'].includes(b.kind) ? { sentences: sentenceAnchors({ ...b, anchor }) } : {}),
        ...(b.kind === 'list' ? { items: (Array.isArray(b.items) ? b.items : str(b.text).split('\n').filter(Boolean).map(text => ({ text: text.replace(/^\s*[-*\d.]+\s*/, '') }))).map((it, k) => ({ anchor: str(it?.anchor).trim() || `${anchor}.i${k + 1}`, text: str(it?.text ?? it) })) } : {}) };
    });
    return { ...p, id, purpose: clip(purpose, 300), body, keyAnchors: Array.isArray(p.keyAnchors) ? p.keyAnchors.map(str) : [] };
  },
  init: spec => ({ spec }), step: state => state, passes: () => [], values: () => ({}), brief: state => `reading: ${state.spec.purpose}`,
  anchors: state => state.spec.body.flatMap(b => [b.anchor, ...(b.sentences || b.items || []).map(s => s.anchor)]),
};

// ---------- compare: a layout of two instances that differ in one feature, stepped together ----------
const compare = {
  purpose: 'two cases side by side that differ in exactly one feature, stepped together', example: null,
  rules: 'spec: {"pair": [ElementSpec, ElementSpec] (same kind), "difference": "the one feature that differs"}; each side is a whole element spec ({kind, state}); controls named in both move both.',
  info: { adapters: ['A1', 'A2', 'A3', 'A4', 'A5'], modes: ['compare', 'predict'], notice: ['the one feature that differs', 'what stays the same'], translations: [], reveals: ['F2', 'F9'] },
  validate(spec) {
    const raw = object(spec, 'compare'), pair = arr(raw.pair, 'pair', 2, 2).map((side, i) => { try { return checkElementSpec(side); } catch (error) { fail(`pair[${i}]: ${error.message}`); } });
    if (pair.some(p => p.kind === 'compare')) fail('a compare holds two elements, not another compare');
    // at: the value the two differ in, shown under each side once revealed (a repair compare starts revealed).
    return { pair, difference: clip(str(raw.difference).trim(), 200), at: clip(str(raw.at ?? '').trim(), 80) || null };
  },
};

/** Every kind, by name (§15b). Old names still resolve (kindOf). */
const MODULES = { stepper, circuit, figure, scene3d, memory, numberline, graph, proofblocks, tracetable, timeline, argmap, sorter, curves, sim, pathway, canvas };
// A kind with nothing to run (a figure, a 3D scene) is its spec, unchanged by any action.
const engineOf = m => ({ validate: m.validate, init: m.init ?? (spec => ({ spec })), step: m.step ?? (state => state), next: m.next ?? null, passes: m.passes ?? (() => []), values: m.values ?? (() => ({})),
  check: m.check ?? ((state, target) => checkValues(state, target, m.values ?? (() => ({})))), diff: m.diff ?? diffValues, brief: m.brief ?? (() => ''), gate: m.gate ?? ((_, at) => String(at ?? '').trim()), parse: m.parse ?? null,
  actionFor: m.actionFor ?? (at => at), // the action that passes a checkpoint (its gate, by default)
  visible: m.visible ?? m.values ?? (() => ({})), // what the page displays of the values (a kind that hides some says which)
  text: m.text ?? null, // the text its view draws, when the spec's own fields don't say it all (ops written out)
  // Everything shown, for an element that starts revealed (a repair compare): a kind with a position runs to its end.
  reveal: m.reveal ?? (state => { let s = state; if (m.next) for (let i = 0; i < 2000 && (m.passes?.(s, m.next) || []).length; i++) s = m.step(s, m.next); return s; }) });
const entry = (kind, m) => ({ kind, adapters: m.info?.adapters ?? [], modes: m.info?.modes ?? [], engine: engineOf(m), anchors: m.anchors ?? (() => []),
  notice: m.info?.notice ?? [], translations: m.info?.translations ?? [], reveals: m.info?.reveals ?? [], purpose: m.purpose, rules: m.rules, example: m.example,
  bestFor: m.info?.bestFor ?? [], task: m.info?.task ?? '' }); // the moments it serves best; its checkpoint grammar and value names, for a generator
export const REGISTRY = Object.fromEntries([...Object.entries(MODULES).map(([kind, m]) => [kind, entry(kind, m)]), ['reading', entry('reading', reading)], ['compare', { ...entry('compare', compare), engine: { ...engineOf(compare), validate: compare.validate } }]]);
export default REGISTRY;
const ALIASES = { trace: 'stepper', number_line: 'numberline', proof: 'proofblocks', parsons: 'proofblocks', trace_table: 'tracetable', argument_map: 'argmap' };
/** A kind's registry name (old names such as "trace" resolve). */
export const kindOf = kind => ALIASES[kind] ?? kind;

const MODES = ['predict', 'change', 'construct', 'compare', 'explain', 'teach', 'draw'];
/**
 * An ElementSpec checked and normalized for the page and the engine (§15): { kind, state, task, signatures, level,
 * moment, concepts, title, anchors }. Accepts a legacy element too ({ kind, spec }). Throws "Invalid element: …".
 */
export function checkElementSpec(input) {
  const raw = object(input, 'element', 120_000), kind = kindOf(raw.kind), k = REGISTRY[kind];
  if (!k || kind === 'reading') fail(`unknown kind ${JSON.stringify(raw.kind)}; use one of ${Object.keys(REGISTRY).filter(x => x !== 'reading').join(', ')}`);
  const state = kind === 'compare' ? compare.validate(raw.state ?? raw) : k.engine.validate(raw.state ?? raw.spec);
  const out = { kind, state, revealed: raw.revealed === true, title: clip(str(raw.title).trim(), 120) || null, level: raw.level ?? null, moment: raw.moment ?? null, concepts: Array.isArray(raw.concepts) ? raw.concepts.map(str).slice(0, 12) : [],
    signatures: Array.isArray(raw.signatures) ? raw.signatures.slice(0, 12) : [], views: Array.isArray(raw.views) ? raw.views.map(str) : [], controls: raw.controls ?? null, task: null };
  if (kind === 'compare') { out.anchors = state.pair.flatMap((side, i) => side.anchors.map(a => `${'ab'[i]}.${a}`)); }
  else out.anchors = k.anchors(k.engine.init(state));
  if (raw.task) {
    const t = object(raw.task, 'task');
    if (!MODES.includes(t.mode)) fail(`task.mode must be one of ${MODES.join(', ')}`);
    if (kind !== 'compare' && !k.modes.includes(t.mode)) fail(`a ${kind} supports ${k.modes.join(', ') || 'no task'}, not ${t.mode}`);
    const first = kind === 'compare' ? null : k.engine.init(state), known = first ? Object.keys(k.engine.values(first)) : [];
    const checkpoints = (t.checkpoints == null ? [] : arr(t.checkpoints, 'task.checkpoints', 0, 12)).map((c, i) => {
      const at = kind === 'compare' ? str(c?.at).trim() : k.engine.gate(first, c?.at ?? (c?.step != null ? `step ${c.step}` : c?.set ? `set ${Object.entries(c.set).map(([n, v]) => `${n}=${v}`).join(',')}` : null));
      const predict = arr(c?.predict, `task.checkpoints[${i}].predict`, 1, 8).map(str);
      for (const name of predict) if (known.length && !known.includes(name)) fail(`task.checkpoints[${i}] predicts ${JSON.stringify(name)}, which this ${kind} does not show (it shows ${known.slice(0, 16).join(', ')})`);
      return { at, predict };
    });
    out.task = { mode: t.mode, ask: str(t.ask).trim() || null, checkpoints, target: t.target ?? null, rubric: Array.isArray(t.rubric) ? t.rubric.map(str).slice(0, 12) : null,
      prediction: t.prediction && typeof t.prediction === 'object' ? t.prediction : null, attempt: t.attempt && typeof t.attempt === 'object' ? t.attempt : null };
    // A prediction the page already gives away is no prediction (its own answer committed, a repair or a classmate, is).
    if (out.task.checkpoints.length && !out.task.prediction && !out.task.attempt) { const leak = leaks(out); if (leak) fail(leak); }
  }
  return out;
}

/**
 * The engine's values where the learner would see them: at each checkpoint, after the action that passes it (a kind with
 * a position steps up to it first), else once at the end of the run. { rows, before, failed?, why? }: before[i] is what
 * the page shows just before checkpoint i opens; failed names a checkpoint whose action the engine refused.
 */
export function truthOf(kind, state, checkpoints = []) {
  const E = REGISTRY[kindOf(kind)].engine, rows = [], before = [];
  let s = E.init(state);
  const run = action => { try { s = E.step(s, action); return null; } catch (error) { return error.message; } };
  for (const c of checkpoints) {
    if (E.next) for (let i = 0; i < 2000; i++) { const keys = E.passes(s, E.next); if (!keys.length || keys.includes(c.at)) break; const why = run(E.next); if (why) return { rows, before, failed: c.at, why }; }
    before.push(E.visible(s));
    const why = run(E.next ?? E.actionFor(c.at));
    if (why) return { rows, before, failed: c.at, why };
    rows.push(E.values(s));
  }
  if (!checkpoints.length) {
    if (E.next) for (let i = 0; i < 2000 && E.passes(s, E.next).length; i++) { const why = run(E.next); if (why) return { rows, before, failed: 'the run', why }; }
    rows.push(E.values(s));
  }
  return { rows, before };
}

// The text an element's spec puts on the page (labels, notes, captions, titles), less what the page keeps hidden until
// a reveal or never shows as text (answers, keys, targets, references, program text and expressions, ids, raw values).
const UNSHOWN = new Set(['id', 'code', 'expr', 'rates', 'stopWhen', 'key', 'solution', 'distractors', 'reference', 'target', 'date', 'from', 'to', 'in', 'watch', 'init', 'live', 'params', 'at', 'value', 'amount', 'kind', 'type', 'frame', 'address']); // an address is where, like an axis tick
function shownText(node, out = [], hidden = false) {
  if (typeof node === 'string') { if (!hidden && /[a-z]/i.test(node)) out.push(node); return out; }
  if (Array.isArray(node)) { for (const x of node) shownText(x, out, hidden); return out; }
  if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (!UNSHOWN.has(k)) shownText(v, out, hidden || node.hidden === true);
  return out;
}
// A value as it may be written: as given, decimal, hex and binary (a whole number), and in words up to twenty.
const WORDS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
function writings(value) {
  const c = canon(value), out = new Set([String(value).toLowerCase(), c]);
  if (/^-?\d+$/.test(c)) { const n = BigInt(c); if (n >= 0n) { out.add(`0x${n.toString(16)}`); out.add(`0b${n.toString(2)}`); if (n <= 20n) out.add(WORDS[Number(n)]); } else if (n >= -20n) out.add(`minus ${WORDS[Number(-n)]}`); }
  return [...out].filter(Boolean);
}
// A single digit is everywhere in labels ("4 bits", "line 3"), so only a distinctive answer is looked for in the text.
const distinctive = value => !/^\d$/.test(canon(value));
const escape = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DIRECTION = /\b(outward|inward|net (?:water )?(?:movement|flow|gain|loss)|increases?|decreases?|rises?|grows?|shrinks?|swells?|gains?|loses?|flows? (?:in|out)|moves? (?:in|out)|into the cell|out of the cell)\b/i;
/**
 * Why a predict element gives its answer away before the learner commits, or null: a predicted value the page already
 * shows when the checkpoint opens (the action it waits on has nothing left to show), a predicted value written in a
 * label, note or title (in any of its writings), or a label that states the direction of a change being predicted.
 */
export function leaks(spec) {
  const truth = truthOf(spec.kind, spec.state, spec.task.checkpoints);
  if (truth.failed) return null; // the action's own failure is reported where the element is accepted
  const E = REGISTRY[spec.kind].engine, text = [spec.title || '', ...shownText(spec.state), ...(E.text ? E.text(E.init(spec.state)) : [])].join(' \n ').toLowerCase();
  for (const [i, c] of spec.task.checkpoints.entries()) {
    const after = truth.rows[i] || {}, shown = truth.before[i] || {};
    for (const name of c.predict) {
      const v = after[name];
      if (v == null) continue;
      if (shown[name] != null && same(shown[name], v)) return `at checkpoint "${c.at}" the page already shows ${name} = ${v}, the answer: put the checkpoint before the action that produces it`;
      // A verdict the engine computes ("falls"), already shown on another part, gives away the rule the learner is to
      // predict. A value the spec itself states (a bin a worked example sits in) is an input, not a verdict.
      const computed = !/^-?[\d.]+$/.test(canon(v)) && !JSON.stringify(spec.state).toLowerCase().includes(`"${canon(v)}"`);
      const other = computed && shown[name] != null && Object.entries(shown).find(([n, x]) => n !== name && x != null && same(x, v));
      if (other) return `at the start the page already shows ${other[0]} = ${v}, the outcome the learner is to predict for ${name}: start with no part showing it`;
      if (distinctive(v)) for (const w of writings(v)) if (new RegExp(`(^|[^\\w.-])${escape(w)}($|[^\\w])`).test(text)) return `a label, note or title shows ${w}, the value of ${name} the learner is to predict: take it out`;
      const m = DIRECTION.exec(text);
      if (m) return `a label, note or title says "${m[0]}", the direction of the change the learner is to predict: describe the step without its outcome`;
    }
  }
  return null;
}


/** The spec rules of every kind a model may write (study's representations, the engine's prompts). */
export const RULES = Object.fromEntries(Object.entries(REGISTRY).filter(([, k]) => k.rules).map(([kind, k]) => [kind, `${k.purpose}\n${k.rules}`]));
