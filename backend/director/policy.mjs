import { ACTS, choose } from './dynamics.mjs';
import { LEVELS } from '../../shared/cards.mjs';

// The move policy (docs/system-spec.md §12–14, §8, §15b): pure functions over the engine's view of a turn. Given the
// verified verdict, the arc, the KC's slice of the course model and the learner's state, `decide` returns the next move
// by first match (§13), and `next` the arc's planned move, chosen among the moves that apply by the learning-dynamics
// model. Nothing here branches on subject: kinds, families, regimes, error kinds and registry modes only.

/** Session kinds (§14) and their arcs (§12): slots the dynamics model fills, 3–7 moves, replanned every turn. */
export const SLOTS = {
  learn: ['teach', 'engage', 'test', 'summary'], // teach first (the user, 10 Oct): a section starts by teaching, never a test
  new_material: ['read', 'after', 'test', 'summary'], // the reading's own prequestion frames it
  study_by_reading: ['read', 'after', 'read', 'after'],
  repair: ['separate', 'repair', 'retest', 'summary'],
  consolidate: ['retrieval', 'interleave', 'retrieval'],
  exam_practice: ['exam_item', 'exam_item', 'exam_item'],
  problem_help: ['request_attempt', 'teach', 'matching', 'test'],
};
export const SESSION_KINDS = Object.keys(SLOTS);

/** Every act the engine performs: its family (spec §4) and how long to wait after it (spec §15 rule 6). */
export const ACT = {
  ...Object.fromEntries(Object.entries(ACTS).map(([k, a]) => [k, { move: a.move, wait: a.move === 'read' ? 'reading' : a.mode === 'construct' || k === 'solo_problem' ? 'work' : 'reasoning' }])),
  retrieval: { move: 'practice', wait: 'recall' },
  first_step: { move: 'probe', wait: 'reasoning' }, request_attempt: { move: 'probe', wait: 'work' }, separating_question: { move: 'probe', wait: 'reasoning' },
  test: { move: 'probe', wait: 'work' }, retest: { move: 'probe', wait: 'work' }, diagnostic: { move: 'probe', wait: 'reasoning' }, prequestion: { move: 'probe', wait: 'reasoning' },
  verify_extend: { move: 'feedback', wait: 'work' }, flag: { move: 'feedback', wait: 'work' }, locate: { move: 'feedback', wait: 'work' },
  vary_surface: { move: 'practice', wait: 'work' }, strategy_prompt: { move: 'metacognitive', wait: 'reasoning' }, detour: { move: 'probe', wait: 'reasoning' },
  refutation: { move: 'repair', wait: 'reasoning' }, contrast: { move: 'repair', wait: 'work' }, revoice: { move: 'elicit', wait: 'reasoning' }, contrast_step: { move: 'repair', wait: 'reasoning' }, run_their_model: { move: 'repair', wait: 'reasoning' },
  new_frame: { move: 'repair', wait: 'reasoning' }, counter_case: { move: 'repair', wait: 'reasoning' }, reread: { move: 'repair', wait: 'reading' },
  evidence_standard: { move: 'repair', wait: 'reasoning' }, generative_check: { move: 'practice', wait: 'work' },
  pump: { move: 'scaffold', wait: 'work' }, general_hint: { move: 'scaffold', wait: 'work' }, specific_hint: { move: 'scaffold', wait: 'work' },
  tell_step: { move: 'scaffold', wait: 'work' }, worked_solution: { move: 'scaffold', wait: 'reading' },
  explain_reasoning: { move: 'elicit', wait: 'reasoning' }, summary: { move: 'elicit', wait: 'reasoning' }, after_reading: { move: 'elicit', wait: 'reasoning' },
  choice: { move: 'affect', wait: 'recall' }, matching: { move: 'practice', wait: 'work' },
};

/** The repair for each kind of error (§8): the act, then what follows it. */
export const REPAIR = {
  F1: 'flag', F2: 'vary_surface', F3: 'strategy_prompt', F4: 'detour', F5: 'refutation', F6: 'contrast_step',
  F7: 'run_their_model', F8: 'new_frame', F9: 'counter_case', F10: 'reread', F11: 'evidence_standard', F12: 'generative_check',
};
/** The help ladder (§13 rule 10; tutoring-evidence.md §4.4): H0 pump … H4 worked solution, then a matching item done alone. */
export const LADDER = ['pump', 'general_hint', 'specific_hint', 'tell_step', 'worked_solution'];

const sigmoid = x => 1 / (1 + Math.exp(-x));
/** An item's difficulty on the learner model's logit scale, from its level and family (spec §3). */
export const difficulty = item => Number.isFinite(item?.d) ? item.d : ({ core: -0.3, exam: 0.7, beyond: 1.4 })[item?.level] ?? (['E1'].includes(item?.family) ? -1 : ['E7', 'E8', 'E9'].includes(item?.family) ? 1 : 0);
/** Predicted success on an item: the learner model's effective probability (open wrong models folded in), else σ(θ − d). */
export const predicted = (st, item) => { const d = difficulty(item), p = typeof st?.pEffective === 'function' ? st.pEffective(d, item?.id) : null; return Number.isFinite(p) ? p : sigmoid((st?.theta ?? 0) - d); };
const usable = p => p.verification?.ok !== false && typeof p.prompt === 'string' && p.prompt.trim();

/**
 * The item for a move: unused, verified, at about `want` predicted success (0.7; 0.8 after failures), on a new surface
 * (another family or form than the last), with an exam-level or integrative one for exam practice. null when none is left.
 */
export function pickItem(problems, { st, used = [], last = null, want = 0.7, exam = false, families = null, easier = false, keep = null } = {}) {
  const pool = (problems || []).filter(p => usable(p) && !used.includes(p.id) && (!families || families.includes(p.family)) && (!keep || keep(p)));
  if (!pool.length) return null;
  const score = p => -Math.abs(predicted(st, p) - want) - (last && (p.familyId ?? p.form) === (last.familyId ?? last.form) ? 0.15 : 0)
    + (exam && (p.level === 'exam' || p.family === 'E7') ? 0.5 : 0) + (easier ? 0.3 * (1 - difficulty(p) / 2) : 0) + (p.element?.kind ? 0.05 : 0);
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

/** Acts carried by a registry element with a task (§15b). */
const READY = 0.7;
const OPENERS = new Set(['predict', 'first_step', 'try_first', 'prequestion', 'experiment', 'diagnostic']);
const ELEMENT_ACTS = new Set(['experiment', 'predict', 'compare', 'construct', 'teach_back', 'draw']);
/** Reading level from θ, and whether a reading is in the learner's zone (§13; reading.md §7.1): prerequisites not known weak, predicted after-move success ≥ 0.6. */
export const readingLevel = st => (st?.theta ?? 0) < 0.5 ? 'intro' : (st?.theta ?? 0) < 1.5 ? 'core' : 'advanced'; // new to it: the high-cohesion version
export function inZone(st, prereqs = []) {
  const level = readingLevel(st), at = d => sigmoid((st?.theta ?? 0) - d); // comprehension of the portion: θ against its level, never the wrong models' folding (decisive12: 60% of KCs read as out of zone at θ 0, so `read` almost never ran)
  const weak = prereqs.filter(p => p.state?.source === 'observed' && predicted(p.state, { level: 'core' }) < 0.5);
  return { ok: at({ intro: -1, core: -0.3, advanced: 0.7 }[level]) >= 0.6 && weak.length <= prereqs.length * 0.3, level, weak: weak.map(p => p.kc) };
}

/**
 * The element for a move (§15b): among the KC's representations whose registry kind supports the move's mode, the one
 * whose bestFor fits the moment, scored by the learner's measured response to that kind. null when none applies.
 */
export function chooseElement({ mode, moment, representations = [], registry = null, works = null, kind = 'concept', move = 'elicit', avoid = [], used = [] }) {
  if (!mode || !registry) return null;
  const fit = { first_contact: 'first', repair: 'repair', transfer: 'transfer' }[moment];
  const residual = r => works?.(move, kind, r.kind)?.mean ?? 0; // already shrunk toward 0 by the learner model
  const gated = r => !['predict', 'teach'].includes(mode) || !!(r.checkpoints || r.task?.checkpoints?.length || registry[r.kind].engine?.next != null); // a prediction needs a checkpoint to commit at
  const ok = representations.filter(r => r.kind && registry[r.kind]?.modes?.includes(mode) && (r.spec || mode === 'draw') && gated(r) && !avoid.includes(r.kind) && !used.includes(r.id)); // a representation already worked through in this arc isn't offered again
  return ok.map(r => ({ r, s: (r.bestFor === fit ? 1 : 0.5) + residual(r) })).sort((a, b) => b.s - a.s)[0]?.r ?? null;
}

/** Two instances to compare (§15b): two of the KC's representations of one registry kind that supports compare, or null. */
export function comparePair(representations = [], registry = null) {
  const ok = representations.filter(r => r.kind && r.spec && registry?.[r.kind]?.modes?.includes('compare')), a = ok.find((r, i) => ok.slice(i + 1).some(o => o.kind === r.kind));
  return a ? [a, ok.find(o => o !== a && o.kind === a.kind)] : null;
}

/** The engagement ladder's task mode at a rung (interactive-learning.md §A), for the "engage" slot. */
const RUNG_ACTS = { responding: ['predict', 'compare', 'try_first'], changing: ['experiment', 'predict', 'compare'], constructing: ['construct', 'draw', 'solo_problem'], presenting: ['teach_back', 'argue'] };

/** A fresh arc on a KC (§12): its slots for the session kind, the ladder at responding, no help yet. */
// Exam-aware pacing (the user, 11 Oct: "the right timing for each topic"): within CRUNCH_DAYS of the exam, a new idea is taught
// and tested, no more: no engage slot, no summary, one round of practice before the test, never a long reading.
export const CRUNCH_DAYS = 7;
const CRUNCH_SLOTS = { learn: ['teach', 'test'], new_material: ['teach', 'test'] };
export function planArc({ kc, sessionKind = 'learn', crunch = false }) {
  return { kc: kc?.id ?? null, topicId: kc?.topicId ?? null, sessionKind, crunch, slots: [...((crunch && CRUNCH_SLOTS[sessionKind]) || SLOTS[sessionKind] || SLOTS.learn)], rung: 1, help: { itemId: null, level: 0, fails: {} }, used: [], successes: 0, tested: false, summarized: false, repair: null, detour: null, last: null, asked: [] };
}

/**
 * What applies for a slot, given the KC's content: the acts that have what they need (a reading, a worked example, a
 * runnable element, an item…). The dynamics model ranks them; `ctx` = { slice, st, prereqs, traits, registry, adapter, kind }.
 */
function applicable(slot, ctx, arc) {
  const { slice, registry } = ctx, has = mode => !!chooseElement({ mode, representations: slice?.representations, registry });
  const items = (slice?.problems || []).filter(p => usable(p) && !arc.used.includes(p.id)).length;
  const worked = !!(slice?.explanation?.workedExamples?.length || slice?.problems?.some(p => p.steps?.length) || slice?.procedures?.length);
  const zone = inZone(ctx.st, ctx.prereqs);
  const all = {
    read: !!slice?.readings?.length && zone.ok, explain: !!slice?.explanation, worked_example: worked, experiment: has('change'), strategy_model: ctx.kind === 'strategy' && worked,
    predict: has('predict') || items > 0, try_first: items > 0, explain_why: true, compare: !!comparePair(slice?.representations, registry), argue: ctx.kind === 'epistemic',
    teach_back: (slice?.wrongModels || []).length > 0, draw: !!registry?.canvas?.modes?.includes('draw') && (slice?.representations || []).some(r => r.notice?.length && (r.spec || r.board?.diagramType)), construct: has('construct'), solo_problem: items > 0,
  };
  if (slot === 'engage') { const tasks = [has('predict') && 'predict', has('construct') && 'construct', has('change') && 'experiment'].filter(Boolean); if (tasks.length) return tasks; } // §13 binding rule 6: a runnable element is used with a task, never only shown
  const acts = slot === 'teach' ? ['read', 'worked_example', 'explain', 'experiment', 'strategy_model', 'try_first', 'argue', 'compare']
    : slot === 'engage' ? RUNG_ACTS[LEVELS[arc.rung]] || RUNG_ACTS.responding : [];
  return acts.filter(a => all[a]);
}

/**
 * A wrong model still open on the arc's KC (spec §13: an arc never closes over one): the learner model's suspected or
 * confirmed model, likeliest first, unless this arc repaired it since; else a claim refuted in this arc and not yet answered
 * right. { wrongModel } | { claim } | null.
 */
export function openModel(a, ctx) {
  const op = (ctx?.st?.operative || []).filter(o => ['suspected', 'confirmed'].includes(o.status) && o.p >= 0.3 && !(a.repaired || []).includes(o.wrongModelId) && (!ctx.wrongModel || ctx.wrongModel(o.wrongModelId))).sort((x, y) => y.p - x.p)[0]; // one the cards can state
  return op ? { wrongModel: op.wrongModelId } : a.open?.claim ? { claim: a.open.claim, wrongModel: a.open.id ?? null } : null;
}
/**
 * Sure enough to repair (decisive2): a model confirmed for this learner, or a hit at p ≥ 0.75 with no rival within 0.2 (two
 * models giving the same answer are told apart first). Below that the move is the separating probe, never a repair aimed at
 * the top candidate, so a guess is never spoken as their belief. → the hit, or null.
 */
export const SURE = 0.75;
const confirmedFor = (ctx, id) => (ctx?.st?.operative || []).some(o => o.wrongModelId === id && o.status === 'confirmed');
/**
 * A model with standing for this learner before this line: confirmed; addressed (repaired once, now back: decisive6, where a
 * confirmed model repaired and then restated got step hints); or suspected at p ≥ 0.5. A new match on it is the second piece
 * of evidence, so it is sure: its repair comes before any generic hint (a hint is for an error of another kind).
 */
const standingFor = (ctx, id) => (ctx?.st?.operative || []).some(o => o.wrongModelId === id && (o.status === 'confirmed' || o.status === 'addressed' || (o.status === 'suspected' && o.p >= 0.5)));
export function sureOf(hits, ctx, a = null, said = true) {
  const hs = [...(hits || [])].filter(h => !h.unverified).sort((x, y) => y.p - x.p), top = hs[0]; // a claim not yet judged false is never sure
  if (!top) return null;
  const rival = hs[1] && top.p - hs[1].p < 0.2;
  if (confirmedFor(ctx, top.id) || (standingFor(ctx, top.id) && !rival)) return top;
  // A belief they said: as sure as its match. A value that a model computes ("1003"): one match is a candidate; a second
  // matching answer (this arc) confirms it, and only then is the belief theirs (decisive4: never attributed on one value).
  return said ? (top.p >= SURE && !rival ? top : null) : (a?.suspects?.[top.id] || 0) >= 1 && !rival ? top : null;
}
/** The open model's own state is sure (confirmed, or the learner model's p ≥ 0.75). */
const sureModel = (ctx, id) => (ctx?.st?.operative || []).some(o => o.wrongModelId === id && (o.status === 'confirmed' || o.p >= SURE));
/** The separating probe while no model is sure, at most twice in an arc; then the arc teaches on without naming one. */
const separate = (a, ids) => { if (!ids?.length || (Number(a.separated) || 0) >= 2) return null; a.separated = (Number(a.separated) || 0) + 1; return ids; };
/**
 * The repair for an open wrong model or claim: by its error kind first, then the refutation, the right way worked, a new case.
 * open: { wrongModel?, claim? }: a claim no catalogued model names carries its candidate id (cand:…) and its words.
 */
export function repairOf(a, open, ctx) {
  const wm = open.wrongModel && ctx.wrongModel?.(open.wrongModel), kind = wm?.errorKind || 'F5';
  const again = a.repair && (open.claim ? !!a.repair.claim : a.repair.wrongModel === open.wrongModel); // one open claim per arc, however it is worded
  const tries = again ? (a.repair.tries || 1) + 1 : 1;
  a.repair = { wrongModel: open.wrongModel ?? null, claim: open.claim ?? null, errorKind: kind, tries };
  if (open.wrongModel) a.repaired = [...new Set([...(a.repaired || []), open.wrongModel])];
  if (open.claim) a.open = { claim: open.claim, id: open.wrongModel ?? null };
  a.slots = ['retest', ...a.slots.filter(x => !['repair', 'retest'].includes(x))];
  const seq = [...new Set([open.wrongModel && !open.claim ? REPAIR[kind] || 'refutation' : 'refutation', 'refutation', 'worked_example', 'counter_case'])]; // never the same repair twice in a row
  // Rule 8 (close the contrast): they just answered a case by the belief: both results side by side, why they differ, then a
  // fresh case. A false belief, a flawed model or a missing counter-case (F5, F7, F9) starts there; any repair answered by it does.
  const contrast = !!ctx.answered && (again || ['F5', 'F7', 'F9'].includes(kind));
  return { act: contrast ? 'contrast' : seq[Math.min(tries, seq.length) - 1], wrongModel: open.wrongModel ?? null, errorKind: kind, adhoc: open.claim ? { belief: open.claim } : null };
}

/** The arc's next planned move (§13 rule 13): its next slot, filled by the dynamics model. null when the arc is done. */
export function next(arc, ctx) {
  const a = { ...arc, slots: [...arc.slots] };
  const guard = () => {
    const open = openModel(a, ctx);
    if (!open) return null;
    if (open.wrongModel && !open.claim && !sureModel(ctx, open.wrongModel) && (ctx.st?.n ?? 0) >= 2) { const ids = separate(a, [open.wrongModel]); return ids ? { arc: a, act: 'separating_question', slot: 'separate', hypotheses: ids } : null; } // suspected, not sure: probe it
    const r = repairOf(a, open, ctx); return { arc: a, act: r.act, slot: 'repair', wrongModel: r.wrongModel, errorKind: r.errorKind, adhoc: r.adhoc };
  };
  while (a.slots.length) {
    if (['test', 'summary'].includes(a.slots[0])) { const g = guard(); if (g) return g; } // an arc never closes over an open wrong model
    const slot = a.slots.shift(), dyn = { kind: ctx.kind, gap: ctx.st?.theta ?? 0, adapter: ctx.adapter, works: ctx.traits?.whatWorks, readingSkill: ctx.traits?.readingSkill?.factor ?? 1 };
    if (slot === 'teach' && a.fluent) continue; // expertise reversal: fast, correct and explained skips the telling (Moment 5)
    if (slot === 'summary' && !a.tested) continue;
    // A test only once the learner model says they should know it (the user, 10 Oct): predicted success on a core item ≥ READY,
    // or they asked to be tested; else practice with them first (an element task, then a matching item), at most twice.
    if (slot === 'test' && !a.fluent && predicted(ctx.st, { level: 'core' }) < READY && (a.practised || 0) < (a.crunch ? 1 : 2)) { a.practised = (a.practised || 0) + 1; a.slots = ['test', ...a.slots]; const ranked = choose(applicable('engage', ctx, a), { kind: ctx.kind, gap: ctx.st?.theta ?? 0, adapter: ctx.adapter, works: ctx.traits?.whatWorks, readingSkill: ctx.traits?.readingSkill?.factor ?? 1 }); return { arc: a, act: ranked[0]?.act ?? 'matching', slot: 'engage', ranked }; }
    if (slot === 'teach' || slot === 'engage') {
      const ranked = choose(applicable(slot, ctx, a), dyn);
      // A new idea's exposition is a reading portion in learn and new-material sessions (§13, §14 reading bands): first contact
      // with a KC that has one in zone. Else elements first (§15b): a move carried by a runnable element with a task.
      if (slot === 'teach' && !a.crunch && ['learn', 'new_material', 'study_by_reading'].includes(a.sessionKind ?? 'learn') && !ctx.st?.presented && ranked.some(r => r.act === 'read')) return { arc: a, act: 'read', slot, ranked };
      const teach = slot === 'teach' ? ranked.filter(r => !['predict', 'try_first', ...(a.crunch ? ['read'] : [])].includes(r.act)) : ranked, pool = teach.length ? teach : ranked; // the teach slot teaches: an element shown to change, never a prediction first
      // Exam pacing: the teach slot tells it (an explanation or a worked example, the element alongside), never an element's
      // question first (12 Oct: a circuit asking "what do you get?" was the first thing said on a new idea).
      if (slot === 'teach' && a.crunch) { const told = teach.find(r => ['explain', 'worked_example'].includes(r.act)); return { arc: a, act: told?.act ?? 'explain', slot, ranked: pool }; }
      const element = pool.find(r => ELEMENT_ACTS.has(r.act));
      if (pool.length) return { arc: a, act: (element ?? pool[0]).act, slot, ranked: pool };
      continue;
    }
    if (slot === 'repair') { // the strongest open wrong model, repaired by its kind (§8)
      const top = [...(ctx.st?.operative || [])].sort((x, y) => y.p - x.p)[0], wm = top && ctx.wrongModel?.(top.wrongModelId);
      if (!wm) continue;
      if (!sureModel(ctx, wm.id)) { const ids = (ctx.st?.n ?? 0) >= 2 ? separate(a, [wm.id]) : null; if (ids) return { arc: a, act: 'separating_question', slot: 'separate', hypotheses: ids }; continue; }
      a.repair = { wrongModel: wm.id, errorKind: wm.errorKind || 'F5' };
      return { arc: a, act: REPAIR[a.repair.errorKind] || 'refutation', slot };
    }
    const act = { open: ctx.slice?.representations?.some(r => r.spec) ? 'predict' : 'first_step', separate: (ctx.st?.operative || []).length ? 'separating_question' : 'first_step', exam_item: 'solo_problem', after: 'after_reading' }[slot] ?? slot;
    if (['read', 'prequestion', 'after'].includes(slot) && !ctx.slice?.readings?.length) { if (slot === 'read') return { arc: a, act: 'explain', slot }; continue; }
    return { arc: a, act, slot };
  }
  return guard() ?? { arc: a, act: null, slot: null };
}

/**
 * The move for a turn, first match wins (§13). `v` is the verified verdict: { value, wrongModelHits, reasoning, hedged,
 * request, frustrated, question, trust }. Returns { rule, act, helpLevel, wrongModel?, errorKind?, arc }.
 */
export function decide(v, arc, ctx) {
  const a = { ...arc, help: { ...arc.help, fails: { ...arc.help.fails } } }, h = a.help, out = (rule, act, extra = {}) => ({ rule, act, helpLevel: h.level, arc: a, ...extra });
  const fail = () => { h.fails[h.level] = (h.fails[h.level] || 0) + 1; a.rung = Math.max(1, a.rung - 1); };
  const succeed = () => { a.successes++; h.level = Math.max(0, h.level - 1); h.fails = {}; a.rung = Math.min(LEVELS.length - 1, a.rung + 1); };
  // A wrong model repaired by its error kind (§8); the same one again: the direct refutation (§13 binding rule 4), then the
  // right way worked, then a new case. A claim no catalogued model names is repaired as a false belief (F5).
  const repair = (id, claim = null) => { const r = repairOf(a, { wrongModel: id ?? null, claim }, ctx); return out(8, r.act, { wrongModel: r.wrongModel, errorKind: r.errorKind, adhoc: r.adhoc }); };
  const claimed = top => (v.candidate && (!top || top.id === v.candidate.id) ? v.candidate : null); // their own claim, with its candidate id
  // A claim of theirs not proven false (§13 rule 9): named back once, in their own words, as a question (that answer's one
  // draw-out); then a case to try it on; their answer to a case, judged wrong by the verifier, is shown against the key,
  // naming nothing. A candidate is never told apart by a separating question: it has no computed answers to separate on.
  const isClaim = h => !!h && (h.unverified || String(h.id).startsWith('cand:'));
  // Repair first (decisive6: on a confirmed, unrepaired model, 14 of cs3410's 32 cards and 8 of bio's 26 were generic moves):
  // a model confirmed for this learner and not yet repaired in this arc gets its repair before any generic move (a hint, an
  // explanation, the next slot), unless their latest error is of another kind (another model matched) or they asked for something.
  const due = (ctx.st?.operative || []).filter(o => o.status === 'confirmed' && !(a.repaired || []).includes(o.wrongModelId) && (!ctx.wrongModel || ctx.wrongModel(o.wrongModelId))).sort((x, y) => y.p - x.p)[0] ?? null;
  const repairDue = () => (due ? repair(due.wrongModelId) : null);
  const unproven = h => {
    if (!(a.revoiced || []).includes(h.id)) { a.revoiced = [...(a.revoiced || []), h.id]; return out(8, 'revoice', { wrongModel: h.id, suspected: true, unattributed: true, unverifiedClaim: true }); }
    if (ctx.answered && v.verifiedWrong) return out(8, 'contrast', { unattributed: true, wrongModel: h.id, suspected: true });
    return out(8, 'counter_case', { unattributed: true, unverifiedClaim: true, wrongModel: h.id, suspected: true });
  };
  // Each model an answer matches, counted in the arc: a value matched a second time confirms its model (sureOf).
  const suspect = hits => { const n = { ...(a.suspects || {}) }; for (const h of hits || []) if (h.p >= 0.3) n[h.id] = (n[h.id] || 0) + 1; a.suspects = n; };
  const ladderUp = rule => { h.level = Math.min(4, h.level + 1); return out(rule, LADDER[h.level]); };
  // Too little evidence to diagnose (fewer than two answers on this idea): a wrong answer is shown the right way, never told
  // apart from a misconception by a separating question (12 Oct: one wrong first answer got an XNOR truth-table probe).
  const novice = (ctx.st?.n ?? 0) < 2, showRight = () => out(8, ctx.slice?.explanation?.workedExamples?.length ? 'worked_example' : 'explain');
  // 3. A request or a change of goal: honoured within the invariants, then the work is handed back.
  if (v.request === 'read') return out(3, ctx.slice?.readings?.length ? 'read' : 'explain');
  if (v.request === 'talk') return out(3, ctx.card?.act !== 'worked_example' && (ctx.slice?.explanation?.workedExamples?.length || ctx.slice?.problems?.some(p => p.steps?.length)) ? 'worked_example' : 'explain');
  if (v.request === 'hint' || v.request === 'answer') { h.level = Math.min(4, h.level + 1); return out(3, LADDER[h.level]); } // one level per request, never a jump
  // Skip, or go faster: no more telling; they show it by performance (deep-understanding Moment 5), then on.
  if (v.request === 'skip') { const n = next({ ...a, fluent: true, slots: a.slots.filter(x => !['teach', 'read', 'after', 'prequestion', 'summary'].includes(x)) }, ctx); return n.act ? { ...n, rule: 3, helpLevel: h.level } : out(3, 'generative_check'); }
  if (v.question) return out(3, null); // a question about the card: the voice answers it (think); the card stands
  if (v.frustrated && (h.fails[h.level] || 0) + (v.value === 'stuck' ? 1 : 0) >= 1) return out(9, 'choice'); // step in on frustration: a bounded choice, a change of pace
  if (v.value === 'claims_understanding' || v.value === 'unverified') { if (v.value === 'claims_understanding') a.claimed = true; return out(12, 'generative_check'); } // a claim, or content nothing could read: shown by doing
  // A tentative reply to a revoicing ("kind of"): the case at once; their answer on it decides (§13 rule 9).
  if (v.value === 'tentative_claim') return out(8, 'counter_case', { unattributed: true, unverifiedClaim: true, wrongModel: v.claimId, suspected: true });
  // Never a guess, and never a second draw-out (§13 binding rule 1): the voice's neutral line drew them out once on this
  // answer. With nothing verified yet (uncertain, or the verifier still running: binding rule 2) the move teaches at once: a
  // wrong model the line looks like is repaired by its kind; an answer to a "why" or a summary moves on; else the telling the
  // arc hasn't made yet; else one step up the ladder; then on.
  if (v.value === 'uncertain' || v.value === 'pending') {
    const hits = [...(v.wrongModelHits || [])].filter(x => x.p >= 0.3).sort((x, y) => y.p - x.p), sure = sureOf(hits, ctx, a, !v.byValue), c = claimed(sure);
    suspect(hits);
    if (sure) return c ? repair(c.id ?? null, c.claim) : repair(sure.id);
    if (!hits.length && due) return repairDue(); // nothing matched yet: the confirmed model's repair before teaching on
    const claimOnly = hits.find(isClaim); if (claimOnly) return unproven(claimOnly);
    const ids = novice ? null : separate(a, hits.filter(x => !isClaim(x)).map(x => x.id)); if (ids) return out(8, 'separating_question', { hypotheses: ids, wrongModel: ids[0], suspected: true }); // a guess at a model: told apart, never repaired
    if (['explain_why', 'summary', 'after_reading'].includes(ctx.card?.act)) return { ...next(a, ctx), rule: 13, helpLevel: h.level };
    if (!a.taught) { const n = next({ ...a, slots: ['teach', ...a.slots.filter(x => x !== 'teach')] }, ctx); if (n.act) return { ...n, rule: 13, helpLevel: h.level }; }
    // An answer to a question, still being checked: their reasoning, not a hint (12 Oct: a hint while the judge ran read as
    // "wrong" to a right answer); the verdict lands on that card when the check is back.
    if (v.value === 'pending' && ctx.card?.item && !h.askedWhy) { h.askedWhy = true; return out(13, 'explain_why'); }
    if (!h.hinted) { h.hinted = true; return ladderUp(10); }
    return { ...next(a, ctx), rule: 13, helpLevel: h.level };
  }
  // Partial work: one step up the ladder (a hint, never a second draw-out).
  if (v.value === 'partial') return ladderUp(10);
  // 4. No attempt yet: ask for one (once per item; a second time they are stuck).
  if (v.value === 'no_attempt' && !(h.fails.attempt > 0)) { h.fails.attempt = 1; return out(4, 'request_attempt'); }
  if (v.value === 'correct' || v.value === 'valid_nonstandard') {
    // Right answer, wrong reason (decisive8): the reason's match decides the move, the answer confirmed in it (never a bare
    // "yes"). Sure: rule 8's contrast on the reason; a claim not yet judged false: named back as a question; a guess: told apart.
    const why = v.reason ? [...(v.wrongModelHits || [])].filter(x => x.p >= 0.3).sort((x, y) => y.p - x.p) : [];
    if (why.length) {
      suspect(why);
      const sure = sureOf(why, ctx, a, true), c = claimed(sure);
      if (sure) { const r = repairOf(a, { wrongModel: c ? c.id ?? null : sure.id, claim: c?.claim ?? null }, ctx); return out(8, 'contrast', { wrongModel: r.wrongModel, errorKind: r.errorKind, adhoc: r.adhoc }); }
      const claimOnly = why.find(isClaim);
      if (claimOnly) return unproven(claimOnly);
      const ids = novice ? null : separate(a, why.map(x => x.id));
      if (ids) return out(8, 'separating_question', { hypotheses: ids, wrongModel: ids[0], suspected: true });
    }
    succeed();
    a.open = null; // a right answer after a refuted claim closes it
    // They said they already know it, and the one quick check confirms it (the user, 10 Oct): the section is done, the next one next.
    if (a.claimed && ['generative_check', 'test'].includes(ctx.card?.act) && !v.hedged && !v.reason) { a.tested = true; a.slots = []; return { arc: a, act: null, rule: 5, helpLevel: h.level }; }
    // 6. Correct without reasoning, or unsure: ask why. The move waits for the explanation; the evidence is recorded now (reasoningShown: false).
    if ((!v.reasoning || v.hedged) && !['explain_why', 'explain_reasoning', 'summary'].includes(ctx.card?.act) && ctx.card?.item) return out(6, 'explain_why');
    // 5. Correct with the reasoning shown: verify and extend; one shallowness check on a new or threshold KC.
    if (ctx.card?.act === 'test' || ctx.card?.act === 'retest' || ctx.card?.act === 'generative_check') a.tested = true;
    if (['first_step', 'predict', 'prequestion'].includes(ctx.card?.act) && v.reasoning && !v.hedged) a.fluent = true;
    return { ...next(a, ctx), rule: 5, helpLevel: h.level };
  }
  // Their reply to a course case, not judged the course's account (decisive11b): rule 8 on it, the case's own account against their words.
  if (v.caseReply && ctx.card?.verdict?.wrongModel) return out(8, 'contrast', { wrongModel: ctx.card.verdict.wrongModel });
  // A reading's one consolidation always follows "done" (§13 reading moves; decisive13: after 3 of 5), before any repair or next slot.
  if (ctx.card?.show?.kind === 'reading' && a.slots[0] === 'after' && ['answered', 'question'].includes(v.value) && !v.question) { a.slots = a.slots.slice(1); return out(13, 'after_reading'); }
  if (due && ['slip', 'stuck', 'incorrect', 'missing_piece', 'answered'].includes(v.value)) return repairDue();
  // Try first, then a time for telling (§13): an attempt before the idea was told that misses gets the exposition (a reading in
  // learn sessions), never a hint ladder on what was never taught.
  if (a.slots.includes('teach') && OPENERS.has(ctx.card?.act) && ['incorrect', 'stuck', 'partial', 'slip', 'no_attempt', 'missing_piece', 'answered'].includes(v.value)) { const n = next({ ...a, slots: ['teach', ...a.slots.filter(x => x !== 'teach')] }, ctx); if (n.act) { fail(); return { ...n, rule: 13, helpLevel: h.level }; } } // an error of no other kind, or no answer to it: the repair first
  // 7. A slip: an indirect flag first, then point to where.
  if (v.value === 'slip') { fail(); return out(7, (h.fails.slip = (h.fails.slip || 0) + 1) > 1 ? 'locate' : 'flag'); }
  // 8. A wrong model: the separating question while it is uncertain which; then repair by its kind, then a re-test.
  if (v.value === 'wrong_model') {
    fail();
    const hits = [...(v.wrongModelHits || [])].sort((x, y) => y.p - x.p), sure = sureOf(hits, ctx, a, !v.byValue), c = claimed(sure);
    suspect(hits);
    // A sure model (confirmed; a belief they said at p ≥ 0.75; a value matched twice): its repair now, the belief named.
    if (sure) return c ? repair(c.id ?? null, c.claim) : repair(sure.id);
    // A claim no catalogued model names, not yet judged false: a case to try their idea on; its outcome speaks (decisive4).
    const claimOnly = hits.find(isClaim);
    if (claimOnly && !hits.some(x => !isClaim(x) && x.p >= 0.3)) return unproven(claimOnly);
    const cands = hits.filter(x => x.p >= 0.3 && !isClaim(x)).map(x => x.id);
    // A candidate on their own case: the unattributed contrast (their answer, the key, the reason: safe at any p), then a fresh
    // case that separates the candidates (rule 8, decisive4). The card carries the candidate, suspected, never said.
    if (cands.length && ctx.answered) return out(8, 'contrast', { hypotheses: cands, unattributed: true, wrongModel: cands[0], suspected: true });
    if (novice) return showRight();
    const ids = separate(a, cands);
    return ids ? out(8, 'separating_question', { hypotheses: ids, wrongModel: ids[0], suspected: true }) : ladderUp(10);
  }
  // 9. A missing piece: a detour to the weakest prerequisite, then back.
  if (v.value === 'missing_piece' && ctx.prereqs?.length && !a.detour) {
    fail();
    const weakest = [...ctx.prereqs].sort((x, y) => (x.state?.theta ?? 0) - (y.state?.theta ?? 0))[0];
    a.detour = { from: a.kc, to: weakest.kc };
    return out(9, 'detour', { prereq: weakest.kc });
  }
  // 10–11. Stuck (or wrong with no diagnosis): one step up the ladder; two failures at one level switch representation or step down.
  if (['stuck', 'incorrect', 'missing_piece', 'no_attempt'].includes(v.value)) {
    fail();
    if ((h.fails[h.level] || 0) >= 2 && h.level >= 2) return out(11, 'matching', { easier: true, switchRepresentation: true });
    h.level = Math.min(4, h.level + (v.frustrated ? 2 : 1));
    return out(10, LADDER[h.level]);
  }
  // 13. Otherwise: the arc's next move.
  return { ...next(a, ctx), rule: 13, helpLevel: h.level };
}

/** Which session kind the learner wants (§14), from what they asked and what the course knows about them. */
export function sessionKindFor({ asked = null, goalMode = null, operative = [], due = false, prefersReading = false }) {
  if (SESSION_KINDS.includes(asked)) return asked;
  if (operative.some(o => o.status === 'confirmed')) return 'repair';
  if (goalMode === 'exam' || goalMode === 'practice') return 'exam_practice';
  if (due) return 'consolidate';
  return prefersReading ? 'new_material' : 'learn';
}
