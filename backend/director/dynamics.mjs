import { ADAPTERS } from '../understanding/adapters.mjs';

// The learning-dynamics model (docs/system-spec.md §5): for a KC of kind κ, the learner's state and a move m, an expected
// gain Δ(m | κ, s, L) and a cost c(m). One model, three uses: the policy chooses among the moves that apply by Δ per
// minute (choose); evals' simulator samples randomized versions of it (PRIORS, gain); real outcomes update it through the
// learner model's what-works residuals (the posterior here). Domain-general: subjects enter only through the adapter's
// move emphasis (domain-generality.md §7.7), chosen per item.

/**
 * The moves the engine weighs, each with its family (spec §4), the element task mode that carries it (spec §15b), the
 * adapter emphasis key that scales it, and a cost in minutes of the learner's time.
 */
export const ACTS = {
  read:           { move: 'read',     mode: null,        emphasis: null,                    cost: 3 },
  explain:        { move: 'present',  mode: null,        emphasis: null,                    cost: 1 },
  worked_example: { move: 'present',  mode: null,        emphasis: 'workedExampleFade',     cost: 3 },
  experiment:     { move: 'present',  mode: 'change',    emphasis: 'predictObserveExplain', cost: 3 },
  strategy_model: { move: 'present',  mode: null,        emphasis: 'strategyModelling',     cost: 3 },
  predict:        { move: 'elicit',   mode: 'predict',   emphasis: 'predictObserveExplain', cost: 2 },
  try_first:      { move: 'probe',    mode: 'predict',   emphasis: null,                    cost: 3 },
  explain_why:    { move: 'elicit',   mode: 'explain',   emphasis: null,                    cost: 2 },
  compare:        { move: 'elicit',   mode: 'compare',   emphasis: 'compareCases',          cost: 3 },
  argue:          { move: 'elicit',   mode: null,        emphasis: 'argumentDialogue',      cost: 3 },
  teach_back:     { move: 'elicit',   mode: 'teach',     emphasis: null,                    cost: 4 },
  draw:           { move: 'elicit',   mode: 'draw',      emphasis: null,                    cost: 3 },
  construct:      { move: 'practice', mode: 'construct', emphasis: 'feedbackOnDraft',       cost: 4 },
  solo_problem:   { move: 'practice', mode: null,        emphasis: null,                    cost: 3 },
  interleave:     { move: 'practice', mode: null,        emphasis: 'interleaving',          cost: 2 },
  retrieval:      { move: 'practice', mode: null,        emphasis: 'spacedRetrieval',       cost: 1 },
  refute:         { move: 'repair',   mode: null,        emphasis: 'refute',                cost: 2 },
};

/**
 * Prior gains (0–1) per KC kind and move, from domain-generality.md §6.4 ("emphasised" high, "avoid" low) and
 * deep-understanding.md §1–6. ponytail: hand-set from the research tables; the learner's residuals move them per learner,
 * and evals' worlds randomize them (spec §17 level 3) — refit from real outcomes when there are enough.
 */
export const PRIORS = {
  fact:      { retrieval: 0.8, interleave: 0.6, explain: 0.5, read: 0.4, compare: 0.4, teach_back: 0.3, draw: 0.3, predict: 0.2, worked_example: 0.2, construct: 0.2, solo_problem: 0.4, explain_why: 0.3, try_first: 0.1, experiment: 0.2, strategy_model: 0.1, argue: 0.1, refute: 0.5 },
  concept:   { compare: 0.8, interleave: 0.7, predict: 0.5, read: 0.5, explain: 0.5, retrieval: 0.5, teach_back: 0.5, worked_example: 0.4, try_first: 0.4, draw: 0.4, construct: 0.4, solo_problem: 0.5, explain_why: 0.5, experiment: 0.5, strategy_model: 0.2, argue: 0.3, refute: 0.6 },
  procedure: { worked_example: 0.9, solo_problem: 0.6, construct: 0.6, read: 0.6, interleave: 0.5, compare: 0.5, predict: 0.4, explain_why: 0.4, retrieval: 0.4, experiment: 0.4, teach_back: 0.4, try_first: 0.3, draw: 0.3, explain: 0.3, strategy_model: 0.4, argue: 0.1, refute: 0.5 },
  principle: { predict: 0.8, try_first: 0.7, explain_why: 0.7, experiment: 0.7, refute: 0.7, compare: 0.6, read: 0.6, teach_back: 0.6, draw: 0.5, worked_example: 0.4, explain: 0.4, retrieval: 0.4, interleave: 0.4, solo_problem: 0.5, construct: 0.5, strategy_model: 0.3, argue: 0.4 },
  strategy:  { strategy_model: 0.9, worked_example: 0.6, interleave: 0.6, solo_problem: 0.5, explain_why: 0.5, compare: 0.5, read: 0.4, teach_back: 0.4, construct: 0.5, predict: 0.3, retrieval: 0.3, explain: 0.3, try_first: 0.4, experiment: 0.3, draw: 0.3, argue: 0.4, refute: 0.4 },
  epistemic: { argue: 0.8, compare: 0.7, read: 0.7, strategy_model: 0.6, construct: 0.6, teach_back: 0.5, explain_why: 0.5, worked_example: 0.5, solo_problem: 0.4, refute: 0.5, predict: 0.3, explain: 0.3, interleave: 0.4, retrieval: 0.2, try_first: 0.3, experiment: 0.3, draw: 0.3 },
};
const ARROWS = { '↑↑': 1.5, '↑': 1.2, '0': 1, '↓': 0.7 };
const sigmoid = x => 1 / (1 + Math.exp(-x));

/**
 * How the learner's state changes a move's gain, by the research's interactions: worked examples gain at low θ and lose
 * at high θ (expertise reversal); trying first pays at a moderate gap; retrieval, interleaving, constructing and teaching
 * need some strength to work on; telling alone helps most when θ is low. `gap` is θ − d for the item in play.
 */
function stateFactor(act, gap) {
  switch (act) {
    case 'worked_example': case 'explain': return sigmoid(-1.5 * (gap - 0.3));
    case 'try_first': return Math.exp(-((gap + 0.5) ** 2) / 2);
    case 'retrieval': case 'interleave': return sigmoid(1.5 * (gap + 0.5));
    case 'construct': case 'teach_back': case 'solo_problem': return sigmoid(1.5 * gap);
    default: return 1;
  }
}

/**
 * Expected gain Δ of `act` for a KC of `kind`: the research prior × the adapter's emphasis × the state interaction ×
 * this learner's posterior (the what-works residual for the move's family, and for the representation when there is one). `works(moveFamily, kcKind, representation)` → { mean, n } is the learner's.
 */
export function gain(act, { kind = 'concept', gap = 0, adapter = null, works = null, representation = null, readingSkill = 1 } = {}) {
  const a = ACTS[act];
  if (!a) return 0;
  const prior = PRIORS[kind]?.[act] ?? PRIORS.concept[act] ?? 0.3;
  const emphasis = a.emphasis ? ARROWS[ADAPTERS[adapter]?.moveEmphasis?.[a.emphasis]] ?? 1 : 1;
  const residual = w => w?.mean ?? 0; // the learner model's what-works mean is already shrunk toward 0
  const learner = works ? Math.exp(0.5 * (residual(works(a.move, kind, null)) + (representation ? residual(works(a.move, kind, representation)) : 0))) : 1;
  return prior * emphasis * stateFactor(act, gap) * learner * (act === 'read' ? Math.min(1.2, Math.max(0.6, readingSkill)) : 1);
}

/** The applicable moves ranked by expected gain per minute: [{ act, gain, score }], best first. `cost` overrides minutes (a reading's own). */
export function choose(acts, ctx = {}, cost = {}) {
  return acts.filter(a => ACTS[a]).map(act => { const g = gain(act, ctx); return { act, gain: g, score: g / (1 + (cost[act] ?? ACTS[act].cost) / 4) }; }).sort((x, y) => y.score - x.score);
}
