import { newId, safe } from '../core/util.mjs';
import { s, validate } from '../core/shape.mjs';
import { AppError } from '../core/errors.mjs';
import { MOVES, LEVELS } from '../../shared/cards.mjs';
import { D, DAY, PRIOR, logistic, topicOf, days, combine, fold, explainedBy, restored } from './model.mjs';

// Learner model v2 (docs/system-spec.md §2–3, §10–11; research/personalization.md §3, §5; reading.md §7.6;
// domain-generality.md §6.2), for any course: what the teaching engine reads about one learner. Everything is a fold over
// the append-only learner_observations (rows `{ v: 2, kind: 'observe' | 'expose' }`, beside the v1 rows of model.mjs),
// keyed by the course model's KC ids ("<topicId>:k1"). The engine labels (verified verdicts); code keeps score.
// - Strength: P = g + (1 − g)·σ(κ(θ − d)) (model.mjs, κ for θ's uncertainty); priors hierarchical (learner level μ, topic offset, KC offset), each
//   KC's own evidence left out of its prior. Exposure and teaching raise σ, never θ.
// - Wrong models: Bayesian p per model; suspected → confirmed (hits on two independent items) → addressed (a repair) →
//   resolved (an unaided success on a later day). Calibration: bias and resolution from confidence and hedges.
// - What works: per teaching move (and representation) × KC kind, the residual of later unaided outcomes against the
//   θ before the move; a later-day outcome replaces the same-day one. Learning rate from the same residuals.
// - Half-life per KC; reading skill; affect, help-seeking and preferences as traits.

const FAMILIES = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10'];
const REGIMES = ['R1', 'R2', 'R3', 'R4', 'R5'];
const FAMILY_D = { E1: -1, E2: -0.4, E3: 0.3, E4: 0.3, E5: 0.6, E6: 0.8, E7: 1, E8: 1, E9: 1, E10: 0 }; // d when the item gives none
const GENERATIVE = new Set(['E4', 'E5', 'E6', 'E7', 'E8', 'E9']); // mastery's "unaided generative success"
const HIER = { tau: 1.25, kappa: 0.5, omega: 0.5 }; // σ² of the learner's level, a topic's offset, a KC's offset (sum = PRIOR)
const W = { beta: 0.3, gamma: 0.5, mu: 0.8, delta: 0.6 }; // §11: weights on σ, due, an open wrong model, recency
const TARGET = { p: 0.8, d: D.apply }; // the strength every KC aims at: P(apply-level success) ≥ .8
const LR = { hit: 8, separated: 0.25, correct: 0.7, missed: 0.5 }; // wrong-model likelihood ratios (a full-strength hit, …)
const FIRES = 0.8; // P(a held wrong model gives its own answer where it predicts one): LR.hit's 0.8 against 0.1
const REPAIR = 0.5; // a targeted repair move: the chance it took at once (p ← p·(1 − REPAIR)); later evidence decides the rest
const HALF = { first: 1, min: 0.25, max: 180 }; // half-life, days
const WHAT = { prior: 0.25, immediate: 0.3, gain: 0.3, pseudo: 10 }; // what works: σ² of a learner's deviation; same-day weight; λ's expected gain and pseudo-episodes
const COLD = { items: 10, sigma: 0.8 }; // cold start: at most this many items; done once important KCs are this sure
const unaided = r => r.kind === 'observe' && r.outcome != null && r.rank <= 3 && !r.assistance && r.enacted !== 'viewing' && r.family !== 'E10';
const sure = r => (r.trust ?? 1) >= 0.5; // a verdict trusted enough for discrete credit: confirmation, resolution, half-life, mastery
const dayOf = iso => new Date(iso).toDateString(); // the learner's calendar day (the server runs on their machine)
const laterDay = (a, b) => !!a && !!b && b > a && dayOf(a) !== dayOf(b);
const pOf = (theta, d, g = 0) => g + (1 - g) * logistic(theta - d);
/**
 * Whether wrong model `id` gives its own answer on `item`: 'yes' (the item's wrongAnswers name it, or it is the model's
 * separating probe), 'no' (an executable model's computed answers leave it out), '?' (no item-level information).
 */
const firesOn = (id, def, item) => !item ? '?' : item.wrongAnswers?.[id] !== undefined || def?.separatingProbe === item.id ? 'yes'
  : item.wrongAnswers && /^exec/.test(def?.detector?.type ?? def?.signature?.kind ?? '') ? 'no' : '?';
const r2 = x => x == null ? null : Math.round(x * 100) / 100;
const median = xs => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); return a[a.length >> 1]; };
const push = (m, k, x) => (m.get(k) || m.set(k, []).get(k)).push(x);

const ID = s.string({ min: 1, max: 200 }), opt = x => s.nullable(x);
const OBSERVATION = s.object({
  kcs: s.array(ID, { min: 1, max: 20 }), family: s.enum(FAMILIES), regime: opt(s.enum(REGIMES)), rank: s.int({ min: 1, max: 5 }),
  outcome: opt(s.fraction()), assistance: opt(s.fraction()), helpLevel: opt(s.int({ min: 0, max: 4 })),
  wrongModelHits: s.array(s.object({ id: ID, p: s.fraction() }), { max: 20 }),
  latencyMs: opt(s.number({ min: 0 })), hedges: opt(s.int({ min: 0, max: 100 })), confidence: opt(s.fraction()),
  steps: s.array(s.object({ kc: opt(ID), outcome: s.fraction() }), { max: 50 }),
  source: s.string({ min: 1, max: 40 }), responseId: opt(ID), sessionId: opt(ID), cardId: opt(ID), itemId: opt(ID),
  difficulty: opt(s.number({ min: -8, max: 8 })), level: opt(s.enum(Object.keys(D))), options: opt(s.int({ min: 2, max: 50 })),
  enacted: opt(s.enum(LEVELS)),
  taughtBy: opt(s.object({ move: s.enum(MOVES), act: opt(s.string({ max: 80 })), representation: opt(s.string({ max: 60 })), cardId: opt(ID), wrongModel: opt(ID) }, { optional: ['act', 'representation', 'cardId', 'wrongModel'] })),
  repairs: opt(ID), portionId: opt(ID), affect: opt(s.string({ max: 40 })),
  trust: opt(s.fraction()), reasoningShown: opt(s.bool()), explains: opt(ID),
}, { optional: ['regime', 'outcome', 'assistance', 'helpLevel', 'wrongModelHits', 'latencyMs', 'hedges', 'confidence', 'steps', 'responseId', 'sessionId', 'cardId', 'itemId', 'difficulty', 'level', 'options', 'enacted', 'taughtBy', 'repairs', 'portionId', 'affect', 'trust', 'reasoningShown', 'explains'] });
const EXPOSURE = s.object({ kcs: s.array(ID, { min: 1, max: 20 }), portionId: ID, readingEvent: opt(s.json()), sessionId: opt(ID), cardId: opt(ID) }, { optional: ['readingEvent', 'sessionId', 'cardId'] });

/** The course model as the learner reads it (ids are global: "<topicId>:<localId>"). */
function index(cm) {
  const kcs = new Map((cm?.kcs || []).map(k => [k.id, k])), items = new Map([...(cm?.probes || []), ...(cm?.problems || [])].map(x => [x.id, x]));
  const wrongs = new Map((cm?.wrongModels || []).map(w => [w.id, w])), wrongsByKc = new Map(), dependents = new Map();
  for (const w of wrongs.values()) push(wrongsByKc, w.kc, w);
  for (const k of kcs.values()) for (const p of k.prerequisites || []) dependents.set(p, (dependents.get(p) || 0) + 1);
  const spine = new Set((cm?.spine || []).flatMap(x => x.kcs || [])), threshold = new Set((cm?.topics || []).filter(t => t.threshold?.is).map(t => t.topicId));
  return { kcs, items, wrongs, wrongsByKc, dependents, spine, threshold, problems: cm?.problems || [] };
}

/**
 * The hierarchical prior from each KC's own evidence (pass 1, flat prior backed out): θ_k = μ + δ_topic + ε_k. A KC's prior
 * is its topic's mean given the learner's level elsewhere and the topic's other KCs; its own evidence is left out.
 */
function hierarchy(flat) {
  const topics = new Map();
  for (const [key, st] of flat) {
    if (!st.kc || !st.answers) continue;
    const pe = 1 / st.v - 1 / PRIOR; // the evidence's precision, the flat prior (mean 0) taken out
    if (pe < 0.05) continue;
    const pr = 1 / (1 / pe + HIER.omega), m = st.theta / st.v / pe, t = topics.get(st.topicId) || topics.set(st.topicId, { s: 0, p: 0, own: new Map() }).get(st.topicId);
    t.s += m * pr; t.p += pr; t.own.set(key, { s: m * pr, p: pr });
  }
  const level = skip => { let sum = 0, p = 1 / HIER.tau; for (const [id, t] of topics) if (id !== skip && t.p > 1e-9) { const v = 1 / t.p + HIER.kappa; sum += t.s / t.p / v; p += 1 / v; } return { theta: sum / p, v: 1 / p }; };
  /** The topic's mean (μ + δ) without `key`'s own evidence. */
  const topic = (topicId, key = null) => {
    const mu = level(topicId), t = topics.get(topicId), own = t?.own.get(key), p = (t?.p || 0) - (own?.p || 0), sum = (t?.s || 0) - (own?.s || 0);
    return p > 1e-9 ? combine({ theta: mu.theta, v: mu.v + HIER.kappa }, [{ theta: sum / p, v: 1 / p }]) : { theta: mu.theta, v: mu.v + HIER.kappa };
  };
  return { topic, prior: (key, topicId) => { const t = topic(topicId, key); return { theta: t.theta, v: Math.min(PRIOR, t.v + HIER.omega) }; } };
}

export function createLearnerV2(app, { model, profiles }) {
  const { clock } = app;
  const courseOf = scope => { const U = app.services.understanding; return safe(() => (U?.courseModel || U?.course)?.(scope), null); };

  /** What the course model says about this observation: each key's topic and kind, and the wrong models it bears on. */
  function context(ix, kcs, { itemId = null, hits = [], stepKcs = [], repairs = null } = {}) {
    const topics = Object.fromEntries([...kcs, ...stepKcs].map(k => [k, ix.kcs.get(k)?.topicId ?? topicOf(k)]));
    const kinds = Object.fromEntries(kcs.map(k => [k, ix.kcs.get(k)?.kind ?? null]));
    const item = itemId ? ix.items.get(itemId) : null, wm = new Map();
    for (const k of kcs) for (const w of ix.wrongsByKc.get(k) || []) wm.set(w.id, { id: w.id, kc: w.kc, prior: w.prior ?? 0.1, fire: firesOn(w.id, w, item) });
    for (const id of [...hits.map(h => h.id), repairs].filter(Boolean)) if (!wm.has(id)) { const w = ix.wrongs.get(id); wm.set(id, { id, kc: w?.kc ?? kcs[0], prior: w?.prior ?? 0.1, fire: hits.some(h => h.id === id) ? 'yes' : firesOn(id, w, item) }); }
    return { topics, kinds, item, wm: [...wm.values()] };
  }

  /**
   * One verified observation (spec §3; fields agreed with the engine) → stored, folded, the topic bars moved. The same
   * response, item and KCs again is the stored row (a retry). Throws invalid_input on a malformed observation.
   */
  function observe(scope, input) {
    // Known fields are checked strictly; others (v1's `keys`, the page's extras) are ignored.
    const o = Object.fromEntries(Object.keys(OBSERVATION.props).filter(k => input?.[k] !== undefined).map(k => [k, input[k]]));
    if (Array.isArray(o.hedges)) o.hedges = o.hedges.length; else if (typeof o.hedges === 'boolean') o.hedges = +o.hedges;
    if (Array.isArray(o.steps)) o.steps = o.steps.map(x => ({ kc: x?.kc ?? null, outcome: x?.outcome ?? (typeof x?.ok === 'boolean' ? +x.ok : null) })).filter(x => x.outcome != null);
    if (o.taughtBy?.move) o.taughtBy = { ...o.taughtBy, move: String(o.taughtBy.move).toLowerCase() };
    validate(OBSERVATION, o, { what: 'observation' });
    if (o.outcome == null && o.rank !== 5) throw new AppError('invalid_input', 'Invalid observation: an outcome is required below rank 5.');
    const kcs = [...new Set(o.kcs)];
    if (o.responseId) { // a retry is the same content again; a resolution of the same response (another verdict) is new evidence
      const key = r => [r.itemId ?? null, r.kcs.join(), r.family, r.outcome ?? null, r.trust ?? 1, r.reasoningShown ?? null, r.explains ?? null].join('|');
      const mine = key({ ...o, kcs }), same = model.rows(scope).find(r => r.v === 2 && r.kind === 'observe' && r.responseId === o.responseId && key(r) === mine);
      if (same) return same;
    }
    const ix = index(courseOf(scope)), c = context(ix, kcs, { itemId: o.itemId, hits: o.wrongModelHits || [], stepKcs: (o.steps || []).map(x => x.kc).filter(Boolean), repairs: o.repairs ?? o.taughtBy?.wrongModel });
    const row = {
      id: newId('obs'), scope, createdAt: clock.iso(), v: 2, kind: 'observe', kcs, topics: c.topics, kinds: c.kinds,
      family: o.family, regime: o.regime ?? c.item?.regime ?? null, rank: o.rank, outcome: o.outcome ?? null,
      assistance: o.assistance ?? (o.helpLevel != null ? o.helpLevel / 4 : 0), helpLevel: o.helpLevel ?? null,
      // ponytail: d from the item's level or family, never learned from outcomes; cross-learner calibration if an anchoring offset shows (CONTRACTS.md).
      d: o.difficulty ?? D[o.level] ?? D[c.item?.level] ?? FAMILY_D[o.family], g: o.options ? 1 / o.options : 0,
      wrongModelHits: o.wrongModelHits || [], wm: c.wm, latencyMs: o.latencyMs ?? null, hedges: o.hedges ?? null, confidence: o.confidence ?? null,
      steps: o.steps || [], source: o.source, responseId: o.responseId ?? null, sessionId: o.sessionId ?? null, cardId: o.cardId ?? null, itemId: o.itemId ?? null,
      enacted: o.enacted ?? null, taughtBy: o.taughtBy ?? null, repairs: o.repairs ?? o.taughtBy?.wrongModel ?? null, portionId: o.portionId ?? null, affect: o.affect ?? null,
      trust: o.trust ?? 1, reasoningShown: o.reasoningShown ?? null, explains: o.explains ?? null,
    };
    return model.record(scope, row);
  }

  /**
   * Reading is exposure, not evidence (spec §10, reading.md §7.6): the KCs are marked presented and σ grows (more for each
   * question, gloss or look-back); θ never moves. `readingEvent` is reading.md §8's (or its `reading` part).
   */
  function expose(scope, input) {
    validate(EXPOSURE, input, { what: 'exposure' });
    const e = input.readingEvent || {}, r = e.reading || e, count = x => Array.isArray(x) ? x.length : Number.isFinite(x) ? x : 0;
    const kcs = [...new Set(input.kcs)], c = context(index(courseOf(scope)), kcs);
    return model.record(scope, {
      id: newId('obs'), scope, createdAt: clock.iso(), v: 2, kind: 'expose', source: 'reading', kcs, topics: c.topics, kinds: c.kinds,
      portionId: input.portionId, sessionId: input.sessionId ?? null, cardId: input.cardId ?? null,
      activeMs: Number.isFinite(r.activeMs) ? r.activeMs : null, expectedMs: Number.isFinite(r.expectedMs) ? r.expectedMs : null, words: Number.isFinite(e.words ?? r.words) ? e.words ?? r.words : null,
      signals: count(r.questions) + count(r.glosses) + count(r.lookBacks), audio: !!r.audioRequested,
    });
  }

  /** Everything at once: the KC states (pass 2, hierarchical priors) and what the stream says about the learner. */
  function analyze(scope) {
    const ix = index(courseOf(scope)), rows = model.rows(scope), since = model.since(scope), now = clock.iso();
    const hier = hierarchy(fold(rows, since, now));
    const start = e => e.kc ? hier.prior(e.key, e.topicId) : null;
    const A = { kc: new Map(), wm: new Map(), episodes: new Map(), calibration: [], selfRatings: new Map(), reading: [], afterReading: [], affect: [], help: [], items: new Set(), latencies: [], explained: explainedBy(rows) };
    const kcOf = key => A.kc.get(key) || A.kc.set(key, { last: null, latencies: [], families: new Set(), items: new Set(), half: null, practiced: null, presented: null, generative: false, rank1: [] }).get(key);
    const before = (keys, e) => keys.get(e.key) || { ...hier.prior(e.key, e.topicId) };
    const keys = fold(rows, since, now, { start, visit: (row, events, keys) => row.v === 2 && collect(row, events, keys, { A, kcOf, before }) });
    return { ix, keys, hier, A, now };
  }

  /** One v2 row's contribution to the learner-level picture, read before its θ update. */
  function collect(row, events, keys, { A, kcOf, before }) {
    const at = row.createdAt, kcEvents = events.filter(e => row.kcs.includes(e.key));
    if (row.kind === 'expose') {
      for (const e of kcEvents) { const k = kcOf(e.key); k.presented = { how: 'read', portionId: row.portionId, at }; k.last = at; k.practiced = at; }
      teach(A, { id: `read|${row.id}`, move: 'read', representation: 'reading', at, row }, kcEvents, keys, before);
      A.reading.push(row);
      return;
    }
    if (row.taughtBy) {
      const t = row.taughtBy;
      teach(A, { id: t.cardId || `${row.sessionId}|${t.move}|${t.act}|${t.representation}|${row.kcs.join()}`, move: t.move, representation: t.representation ?? null, at, row }, kcEvents, keys, before);
      if (['present', 'read'].includes(t.move)) for (const e of kcEvents) kcOf(e.key).presented ||= { how: t.move, portionId: null, at };
    }
    wrongModels(A, row);
    if (row.itemId && row.outcome != null) A.items.add(row.itemId);
    if (row.affect) A.affect.push(row.affect);
    A.help.push(row.assistance || 0);
    if (row.portionId && unaided(row) && sure(row)) A.afterReading.push(row.outcome); // an after-move with the text closed
    // Calibration: a confidence question counts in full; hedges count half, a little less sure when unusually slow (latency
    // only tips it: personalization §3.3).
    const slow = row.latencyMs != null && A.latencies.length >= 5 && row.latencyMs > 2 * median(A.latencies);
    if (row.latencyMs != null) A.latencies.push(row.latencyMs);
    const t = row.trust ?? 1;
    if (row.outcome != null) {
      if (row.confidence != null) A.calibration.push({ c: row.confidence, o: row.outcome, w: t, at });
      else if (row.hedges != null) A.calibration.push({ c: (row.hedges > 0 ? 0.45 : 0.8) - (slow ? 0.1 : 0), o: row.outcome, w: 0.5 * t, at });
    } else if (row.rank === 5 && row.confidence != null) for (const kc of row.kcs) A.selfRatings.set(kc, row.confidence); // "I get it", a self-rating: scored by the next unaided outcome
    const free = unaided(row), credit = sure(row), reasoned = row.reasoningShown !== false || restored(A.explained, row) >= 0.5;
    for (const e of kcEvents) {
      const k = kcOf(e.key), gap = days(k.practiced, at);
      k.last = at;
      if (free) {
        const sr = A.selfRatings.get(e.key);
        if (sr != null) { A.calibration.push({ c: sr, o: row.outcome, w: 0.5 * t, at }); A.selfRatings.delete(e.key); }
        if (credit && row.outcome >= 0.8) {
          k.half = k.half == null ? HALF.first : gap >= k.half / 2 ? Math.min(HALF.max, k.half * 2) : k.half; // §10: a success after half a half-life doubles it
          if (row.latencyMs != null) k.latencies = [...k.latencies, row.latencyMs].slice(-5);
          k.families.add(row.family); if (row.itemId) k.items.add(row.itemId);
          if (reasoned && GENERATIVE.has(row.family)) k.generative = true; // mastery needs the reasoning shown (or explained after)
          if (reasoned && row.rank === 1) k.rank1.push({ day: dayOf(at), itemId: row.itemId, family: row.family });
        } else if (credit && row.outcome < 0.5 && k.half != null) k.half = Math.max(HALF.min, k.half / 2); // a failure halves it
        resolveEpisodes(A, e, row);
      }
      k.practiced = at;
    }
  }

  /** A teaching move on these KCs: an episode waiting for later unaided outcomes, with θ before the move. */
  function teach(A, ep, events, keys, before) {
    if (A.episodes.has(ep.id)) return;
    A.episodes.set(ep.id, { ...ep, day: dayOf(ep.at), kcs: new Map(events.map(e => [e.key, { theta: before(keys, e).theta, kind: ep.row.kinds?.[e.key] ?? null, now: null, later: null }])) });
  }

  /** An unaided outcome on a KC scores every open episode on it: same day as the move, else a later day (which closes it). */
  function resolveEpisodes(A, e, row) {
    for (const ep of A.episodes.values()) {
      const x = ep.kcs.get(e.key);
      if (!x || x.later || row.createdAt < ep.at) continue;
      const p = pOf(x.theta, row.d, row.g), r = { r: row.outcome - p, pq: p * (1 - p), t: row.trust ?? 1 };
      if (dayOf(row.createdAt) === ep.day) x.now ||= r; else x.later = r;
    }
  }

  /** Wrong-model beliefs (personalization §3.2) and the status machine (spec §10). */
  function wrongModels(A, row) {
    const hits = new Map(row.wrongModelHits.map(h => [h.id, h.p])), indep = row.itemId ?? row.responseId ?? row.id, at = row.createdAt;
    for (const m of row.wm || []) {
      const w = A.wm.get(m.id) || A.wm.set(m.id, { id: m.id, kc: m.kc, p: m.prior, status: null, hits: new Set(), repairs: new Set(), confirmed: false, addressedAt: null, at: null }).get(m.id);
      const repair = row.taughtBy?.cardId ?? row.cardId ?? row.id; // one transition per repair move, however many items follow it
      if (row.repairs === m.id && w.status && w.status !== 'resolved' && !w.repairs.has(repair)) { w.repairs.add(repair); w.p *= 1 - REPAIR; w.status = 'addressed'; w.addressedAt = at; }
      // An item the model is known not to fire on says nothing about it; one with no item-level information, a little.
      const h = hits.get(m.id) || 0, o = row.outcome, f = m.fire ?? (m.sep ? 'yes' : '?');
      const lr = h > 0 ? 1 + h * (LR.hit - 1) : o == null || f === 'no' ? 1 : o >= 0.8 ? (f === 'yes' ? LR.separated : LR.correct) ** (1 - (row.assistance || 0)) : o < 0.5 && f === 'yes' ? LR.missed : 1;
      const odds = w.p / (1 - w.p) * lr ** (row.trust ?? 1); // a weakly trusted verdict moves the belief weakly
      w.p = Math.min(0.999, Math.max(0.001, odds / (1 + odds))); w.at = at;
      if (h > 0) {
        if (sure(row)) w.hits.add(indep); // an uncertain verdict never counts toward the two independent items
        if (w.status === 'resolved' || w.status === 'addressed') w.status = w.confirmed && sure(row) ? 'confirmed' : 'suspected'; // it came back
        else if (!w.status) w.status = 'suspected';
        if (w.status === 'suspected' && w.hits.size >= 2 && w.p >= 0.7) { w.status = 'confirmed'; w.confirmed = true; } // two independent items
      } else if (o != null && o >= 0.8 && unaided(row) && sure(row) && f !== 'no' && (f === 'yes' || row.kcs.includes(m.kc))) {
        if (w.status === 'addressed' && laterDay(w.addressedAt, at)) w.status = 'resolved'; // only on a later day
        else if (w.status === 'confirmed' && w.p < 0.2 && laterDay(w.firstAt, at)) w.status = 'resolved';
      }
      if (w.status === 'suspected' && w.p < 0.05) { w.status = null; w.hits.clear(); } // never fired where it should have
      w.firstAt ||= w.status ? at : null;
    }
  }

  /** A KC's strength: its own (hierarchical) state, else the prior its topic and the learner's level give. */
  function strength(a, kcId, topicId = a.ix.kcs.get(kcId)?.topicId ?? topicOf(kcId)) {
    const st = a.keys.get(kcId);
    if (st?.answers) return { theta: st.theta, v: st.v, source: 'observed', n: st.answers };
    const p = a.hier.prior(kcId, topicId);
    return { theta: p.theta, v: st ? st.v : p.v, source: 'inferred', n: 0 }; // exposure alone leaves θ and widens σ
  }

  const dueOf = (a, kcId) => { const k = a.A.kc.get(kcId); if (k?.half == null) return { due: 0, dueAt: null }; const age = days(k.practiced, a.now); return { due: 1 - 2 ** (-age / k.half), dueAt: new Date(Date.parse(k.practiced) + k.half * DAY).toISOString() }; };
  const operative = (a, kcId) => [...a.A.wm.values()].filter(w => w.kc === kcId && w.status).map(w => ({ wrongModelId: w.id, p: r2(w.p), status: w.status }));
  const openWrong = (a, kcId) => Math.max(0, ...[...a.A.wm.values()].filter(w => w.kc === kcId).map(w => w.status === 'confirmed' ? 1 : w.status === 'suspected' ? w.p : w.status === 'addressed' && laterDay(w.addressedAt, a.now) ? 0.5 : 0));
  const recency = (a, kcId) => { const last = a.A.kc.get(kcId)?.last; return last ? Math.exp(-(Date.parse(a.now) - Date.parse(last)) / 3_600_000) : 0; };
  /** How often a held wrong model fires on an item: FIRES where it answers differently, 0 where it doesn't, 1 when unknown (the conservative 1 − p). */
  const fires = (a, id, item) => ({ yes: FIRES, no: 0, '?': 1 })[firesOn(id, a.ix.wrongs.get(id), item)];
  /**
   * P(no wrong model of the KC fires on this item): Π(1 − p·fires), over the open ones (suspected, confirmed, addressed:
   * what is shown and ranked), or with `all` over every one at its posterior, its prior when untested (the prediction:
   * assuming p = 0 for a model never probed over-predicts success where it fires).
   */
  const clear = (a, kcId, item = null, all = false) => {
    const ws = all ? (a.ix.wrongsByKc.get(kcId) || []).map(d => a.A.wm.get(d.id) || { id: d.id, p: d.prior ?? 0.1 }) : [...a.A.wm.values()].filter(w => w.kc === kcId && w.status && w.status !== 'resolved');
    if (all) for (const w of a.A.wm.values()) if (w.kc === kcId && !a.ix.wrongs.has(w.id)) ws.push(w); // one the course model no longer lists
    return ws.reduce((f, w) => f * (1 - w.p * fires(a, w.id, item)), 1);
  };
  const openConfirmed = (a, kcId) => [...a.A.wm.values()].some(w => w.kc === kcId && w.confirmed && w.status !== 'resolved');
  /** The effective chance of an apply-level success, shown and ranked: θ's chance × P(no open wrong model fires). */
  const effective = (a, kcId, st) => clear(a, kcId) * pOf(st.theta, TARGET.d);
  const leverageOf = (ix, kcId) => { const kc = ix.kcs.get(kcId); return 1 + (ix.threshold.has(kc?.topicId) ? 1 : 0) + (ix.spine.has(kcId) ? 1 : 0) + 0.1 * (ix.dependents.get(kcId) || 0); };

  /** Mastery (spec §13): an unaided generative success, and a new-surface success on a later day (threshold ideas: two transfers on different days). */
  function masteryOf(a, kcId) {
    const k = a.A.kc.get(kcId), threshold = a.ix.threshold.has(a.ix.kcs.get(kcId)?.topicId) || a.ix.spine.has(kcId);
    const laterDays = new Set((k?.rank1 || []).map(x => x.day)), transfers = new Set((k?.rank1 || []).filter(x => x.family === 'E7').map(x => x.day));
    const missing = [!k?.generative && 'an unaided generative success', !laterDays.size && 'a new-surface success on a later day', threshold && transfers.size < 2 && 'two transfers on different days', openConfirmed(a, kcId) && 'every confirmed wrong model resolved'].filter(Boolean);
    return { met: !missing.length, threshold, missing };
  }

  /** The KCs of `kcIds` whose mastery is met, from one analysis (state() per KC took 12 s over a 523-KC course). */
  function mastered(scope, kcIds) { const a = analyze(scope); return new Set(kcIds.filter(id => masteryOf(a, id)?.met)); }
  function state(scope, kcId) {
    const a = analyze(scope), st = strength(a, kcId), k = a.A.kc.get(kcId), { due, dueAt } = dueOf(a, kcId);
    return {
      kcId, theta: r2(st.theta), sigma: r2(Math.sqrt(st.v)), source: st.source, n: st.n, operative: operative(a, kcId),
      fluency: { medianMs: median(k?.latencies || []), n: k?.latencies.length || 0 },
      flexibility: { families: [...(k?.families || [])].sort(), items: k?.items.size || 0 },
      halfLife: r2(k?.half ?? null), due: r2(due), dueAt, presented: k?.presented ?? null, mastery: masteryOf(a, kcId),
      /**
       * P(correct) on an item of difficulty `d` (logits, or a level: recall … exam, core, beyond; default the item's level,
       * else apply): P(no wrong model of the KC fires on it, each at its posterior) × the predictive σ(κ(θ − d)), κ for θ's
       * uncertainty.
       */
      pEffective: (d = null, itemId = null) => {
        const item = itemId ? a.ix.items.get(itemId) ?? null : null, dd = typeof d === 'number' ? d : D[d] ?? D[item?.level] ?? TARGET.d;
        return clear(a, kcId, item, true) * logistic((st.theta - dd) / Math.sqrt(1 + Math.PI * st.v / 8));
      },
    };
  }

  /** Bias (mean confidence − outcome, shrunk) and resolution (weighted AUC of confidence against right and wrong). */
  function calibrationOf(data) {
    const n = data.length, sw = data.reduce((x, d) => x + d.w, 0);
    const bias = sw ? data.reduce((x, d) => x + d.w * (d.c - d.o), 0) / (sw + 2) : 0;
    const right = data.filter(d => d.o >= 0.5), wrong = data.filter(d => d.o < 0.5);
    let num = 0, den = 0;
    for (const x of right) for (const y of wrong) { const w = x.w * y.w; num += w * (x.c > y.c ? 1 : x.c === y.c ? 0.5 : 0); den += w; }
    const sure = data.filter(d => d.c >= 0.7);
    return { bias: r2(bias), resolution: den ? r2(num / den) : null, n, sureRight: sure.length >= 3 ? sure.filter(d => d.o >= 0.5).length / sure.length : null };
  }

  /** Each scored episode's residual { r, pq, w }: a later day's outcome replaces the same day's (weight 1 against 0.3). */
  const residuals = (a, keep = () => true) => [...a.A.episodes.values()].flatMap(ep => [...ep.kcs.values()].filter(x => (x.later || x.now) && keep(ep, x)).map(x => { const r = x.later || x.now; return { ...r, w: (x.later ? 1 : WHAT.immediate) * r.t }; }));
  const sum = (xs, f) => xs.reduce((t, x) => t + f(x), 0);

  /** Per-learner gain (logits, shrunk to 0) from later unaided outcomes after a move: Σ w·r / (1/σ₀² + Σ w·P(1 − P)). */
  function gains(a, keep) {
    const rs = residuals(a, keep), den = 1 / WHAT.prior + sum(rs, x => x.w * x.pq);
    return { mean: r2(sum(rs, x => x.w * x.r) / den), sd: r2(Math.sqrt(1 / den)), n: rs.length };
  }

  function traits(scope) {
    const a = analyze(scope), A = a.A;
    // Learning rate: residuals after teaching against those a gain of WHAT.gain would give, shrunk toward 1.
    const rs = residuals(a), pseudo = WHAT.pseudo * 0.25 * WHAT.gain;
    const lambda = Math.min(3, Math.max(0.3, (sum(rs, x => x.w * x.r) + pseudo) / (sum(rs, x => x.w * WHAT.gain * x.pq) + pseudo)));
    // Reading: speed against the portion's expected time (≈ 200 words a minute), comprehension from after-moves.
    const timed = A.reading.filter(r => r.activeMs > 0 && r.expectedMs > 0), ratio = median(timed.map(r => r.expectedMs / r.activeMs));
    const wpm = median(A.reading.filter(r => r.words && r.activeMs > 0).map(r => r.words / (r.activeMs / 60_000))) ?? (ratio != null ? 200 * ratio : null);
    const comprehension = A.afterReading.length ? (A.afterReading.reduce((x, y) => x + y, 0) + 1.4) / (A.afterReading.length + 2) : null;
    const level = wpm == null && comprehension == null ? null : (wpm ?? 200) < 150 || (comprehension ?? 0.7) < 0.5 ? 'low' : (wpm ?? 200) > 280 && (comprehension ?? 0.7) > 0.75 ? 'high' : 'typical';
    const counts = new Map(); for (const x of A.affect.slice(-10)) counts.set(x, (counts.get(x) || 0) + 1);
    const pattern = [...counts].filter(([x, c]) => c >= 2 && x !== 'neutral' && x !== 'engaged').sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    const facts = safe(() => profiles.examSnapshot(scope)?.facts, []) || [];
    const { sureRight, ...calibration } = calibrationOf(A.calibration);
    return {
      learningRate: { lambda: r2(lambda), n: rs.length },
      // factor: what reading gains for this learner against a typical one (comprehension of in-zone portions over .7), for the dynamics model.
      readingSkill: { wpm: wpm == null ? null : Math.round(wpm), comprehension: r2(comprehension), skims: timed.filter(r => r.activeMs < 0.3 * r.expectedMs).length, n: A.reading.length, level, factor: comprehension == null ? 1 : r2(Math.min(1.2, Math.max(0.6, comprehension / 0.7))) },
      calibration,
      /** The measured gain of a move family (and representation) on this kind of KC: { mean (logits), sd, n }; mean 0 when n = 0. */
      whatWorks: (move = null, kcKind = null, representation = null) => gains(a, (ep, x) => (!move || ep.move === move) && (!kcKind || x.kind === kcKind) && (!representation || ep.representation === representation)),
      /** The same by element kind alone (personalization's representation_response). */
      representationResponse: (representation, kcKind = null) => gains(a, (ep, x) => ep.representation === representation && (!kcKind || x.kind === kcKind)),
      affect: { recent: A.affect.at(-1) ?? null, pattern },
      helpSeeking: { hintRate: A.help.length ? r2(A.help.filter(x => x > 0).length / A.help.length) : null, meanAssistance: A.help.length ? r2(A.help.reduce((x, y) => x + y, 0) / A.help.length) : null, n: A.help.length },
      preferences: Object.fromEntries(facts.filter(f => f.status === 'active' && f.kind === 'preference').map(f => [f.key, f.value])),
    };
  }

  /** Readiness of prerequisites (KC ids or other topics' ids): the weakest one's P(apply) against 0.7, at most 1. */
  function readiness(a, prerequisites) {
    if (!prerequisites?.length) return 1;
    return Math.min(...prerequisites.map(p => { const t = a.ix.kcs.has(p) ? strength(a, p) : a.hier.topic(p); return Math.min(1, pOf(t.theta, TARGET.d) / 0.7); }));
  }

  /**
   * Candidates (KC ids, or { kc, topicId?, leverage?, prerequisites? }; default every KC of the course model) ranked by
   * spec §11: leverage·gap·ready + β·σ + γ·due + μ·openWrongModel − δ·recent. Each gets its parts and the biggest reason.
   */
  function priorities(scope, candidates = null) {
    const a = analyze(scope), list = (candidates || [...a.ix.kcs.keys()]).map(c => typeof c === 'string' ? { kc: c } : c);
    return list.map(c => {
      const kc = a.ix.kcs.get(c.kc), st = strength(a, c.kc, c.topicId ?? kc?.topicId ?? topicOf(c.kc));
      const parts = { leverage: c.leverage ?? leverageOf(a.ix, c.kc), gap: Math.max(0, TARGET.p - effective(a, c.kc, st)), ready: readiness(a, c.prerequisites ?? kc?.prerequisites), sigma: Math.sqrt(st.v), due: dueOf(a, c.kc).due, wrongModel: openWrong(a, c.kc), recent: recency(a, c.kc) };
      const terms = { gap: parts.leverage * parts.gap * parts.ready, sigma: W.beta * parts.sigma, due: W.gamma * parts.due, wrongModel: W.mu * parts.wrongModel };
      const priority = terms.gap + terms.sigma + terms.due + terms.wrongModel - W.delta * parts.recent;
      return { ...c, priority: r2(priority), reason: Object.entries(terms).sort((x, y) => y[1] - x[1])[0][0], parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r2(v)])) };
    }).sort((x, y) => y.priority - x.priority);
  }

  const VERB = { fact: 'recall', concept: 'recognize', procedure: 'carry out', principle: 'explain and use', strategy: 'choose and monitor an approach for', epistemic: 'weigh the evidence for' };

  /** The open learner model (spec §10, personalization §3.4): can-do statements, wrong models being worked on, calibration, what's due. No θ numbers. */
  function map(scope) {
    const a = analyze(scope), kcs = [...a.ix.kcs.values()];
    const canDo = kcs.map(k => {
      const st = strength(a, k.id), p = effective(a, k.id, st), seen = st.source === 'observed';
      return { kcId: k.id, topicId: k.topicId, statement: `I can ${VERB[k.kind] || 'use'}: ${k.statement}`, strength: seen ? r2(p) : null, status: !seen ? 'not_yet' : p >= 0.7 && st.v < 0.8 && !openConfirmed(a, k.id) ? 'secure' : 'growing', mastered: masteryOf(a, k.id).met };
    });
    const wrongModels = [...a.A.wm.values()].filter(w => ['confirmed', 'addressed', 'resolved'].includes(w.status)).map(w => ({ id: w.id, kcId: w.kc, topicId: a.ix.kcs.get(w.kc)?.topicId ?? topicOf(w.kc), belief: a.ix.wrongs.get(w.id)?.belief ?? null, status: w.status }));
    const { sureRight, ...cal } = calibrationOf(a.A.calibration);
    const line = sureRight != null ? `When you feel sure, you're right ${Math.round(10 * sureRight)} times in 10.` : cal.n >= 3 ? (Math.abs(cal.bias) < 0.1 ? 'Your confidence matches your results.' : cal.bias > 0 ? 'Your confidence is running ahead of your results.' : 'You know more than you think.') : null;
    const due = kcs.map(k => ({ k, ...dueOf(a, k.id) })).filter(x => x.due >= 0.5).sort((x, y) => y.due - x.due).map(({ k, dueAt }) => ({ kcId: k.id, topicId: k.topicId, statement: k.statement, dueAt }));
    return { canDo, wrongModels, calibration: { ...cal, line }, due };
  }

  /**
   * The next diagnostic item (personalization R3.10): a course-model problem not yet answered, on the spine (or threshold)
   * KCs first while any is unsure, by the variance its answer would remove (information at the current θ) × leverage, a
   * little toward the top of prerequisite chains. null after COLD.items answers, once the important KCs are sure, or with no course model.
   */
  function coldStart(scope) {
    const a = analyze(scope);
    if (!a.ix.kcs.size || a.A.items.size >= COLD.items) return null;
    const important = [...a.ix.kcs.keys()].filter(id => a.ix.spine.has(id) || a.ix.threshold.has(a.ix.kcs.get(id).topicId));
    const unsure = id => Math.sqrt(strength(a, id).v) >= COLD.sigma;
    const pool = important.some(unsure) ? new Set(important.filter(unsure)) : new Set([...a.ix.kcs.keys()].filter(unsure));
    if (!pool.size) return null;
    let best = null;
    for (const item of a.ix.problems) {
      if (!pool.has(item.kc) || a.A.items.has(item.id) || item.family === 'E10' || /:sep_/.test(item.id)) continue;
      const st = strength(a, item.kc), s = logistic(st.theta - (D[item.level] ?? FAMILY_D[item.family] ?? TARGET.d)), info = s * (1 - s);
      const gain = st.v * st.v * info / (1 + st.v * info); // the variance this answer is expected to remove
      const score = gain * leverageOf(a.ix, item.kc) * (1 + 0.1 * (a.ix.kcs.get(item.kc)?.prerequisites?.length || 0));
      if (!best || score > best.score) best = { score, item, p: s };
    }
    if (!best) return null;
    const spine = a.ix.spine.has(best.item.kc);
    return { itemId: best.item.id, kc: best.item.kc, why: `${spine ? 'a spine idea' : 'an important idea'} not yet known; this item is the most informative now (P ≈ ${best.p.toFixed(2)})` };
  }

  // Topic bars and goals by need (model.mjs `shown`): per topic, the mean over its observed KCs of P(no open wrong model
  // fires), and a cap below secure while any has a confirmed, unresolved wrong model.
  model.effective = scope => {
    const a = analyze(scope), topics = new Map();
    for (const [key, st] of a.keys) {
      if (!st.kc || !st.answers) continue;
      const t = topics.get(st.topicId) || topics.set(st.topicId, { sum: 0, n: 0, cap: 100 }).get(st.topicId);
      t.sum += clear(a, key); t.n++;
      if (openConfirmed(a, key)) t.cap = 69;
    }
    return new Map([...topics].map(([id, t]) => [id, { factor: t.sum / t.n, cap: t.cap }]));
  };

  return { observe, expose, state, mastered, traits, priorities, map, coldStart };
}
