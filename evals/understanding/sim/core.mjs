// The simulated learner's ground truth, in code (docs/research/personalization.md §6.1–6.3): knowledge θ per concept,
// misconceptions as executable (or structured) beliefs that fire with a probability, slips, confidence bias, learning
// rate λ, help-seeking, frustration, stated preferences that may be false, and forgetting. Code decides the CONTENT of
// every answer; an LLM only phrases it (sim/student.mjs). Seeded: the same seed, persona and world give the same student.
// The response functions are randomized across worlds (A, B, C, N) so the evaluation tests the tutor's inference, not
// whether it follows one theory of learning.

/** mulberry32: a small seeded generator. */
export function rng(seed) {
  let a = (Math.imul(seed, 0x9e3779b9) ^ 0x5bd1e995) >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: xs => xs[Math.floor(next() * xs.length)], normal: () => Math.sqrt(-2 * Math.log(next() || 1e-12)) * Math.cos(2 * Math.PI * next()) };
}
const σ = x => 1 / (1 + Math.exp(-x));

// ---------- worlds: how much each kind of move teaches, as a function of the gap θ − d (randomized truth, §6.2) ----------
// gain(move, gap, ctx) in logits per move on its concept; ctx = { interactivity: 'low'|'high', memory: bool, attempted: bool }.
// read(match, ctx): what reading a passage teaches, by how well its level matches the student (match 0–1: exp(−(θ − level)²/2)),
// also randomized across worlds (the user's "reading is a first-class teaching mode"; its effect is not assumed).
const base = { explain: 0.25, worked_example: 0.35, try_first: 0.3, hint: 0.15, question: 0.2, refutation: 0.2, diagram: 0.25, analogy: 0.2, feedback: 0.1, told: 0.05, other: 0.05 };
export const WORLDS = {
  // A, expertise reversal: worked examples give large gains at low θ and slightly negative ones at high θ.
  A: { name: 'expertise reversal', gain: (m, gap) => m === 'worked_example' ? (gap < -0.5 ? 0.6 : gap > 0.5 ? -0.1 : 0.3) : base[m] ?? 0.05,
    read: (match, c) => c.gap > 1 && match < 0.4 ? -0.05 : 0.45 * match }, // a well-matched text teaches a lot; a basic one bores an expert
  // B, productive failure: trying first beats explaining first at moderate gaps on low-interactivity concepts.
  B: { name: 'productive failure', gain: (m, gap, c) => (m === 'try_first' && c.interactivity === 'low' && Math.abs(gap) < 1.5) ? 0.55 : (m === 'explain' && !c.attempted) ? 0.15 : base[m] ?? 0.05,
    read: (match, c) => (c.attempted ? 0.4 : 0.12) * match }, // reading pays after an attempt, little before
  // C, representation-sensitive: for this student only, diagrams add 0.8 logits on memory and pointer concepts; analogies add nothing.
  C: { name: 'representation-sensitive', gain: (m, gap, c) => m === 'diagram' && c.memory ? (base.diagram + 0.8) : m === 'analogy' ? 0 : base[m] ?? 0.05,
    read: match => 0.25 * match },
  // N, null: only θ matters; every kind of move teaches the same, so no trait can help.
  N: { name: 'null', gain: m => (m === 'told' || m === 'other' || m === 'feedback') ? 0.05 : 0.25, read: () => 0.25 },
};

// ---------- personas (§6.3), each with a null twin: the same θ profile, neutral traits ----------
// Reading traits (docs/research/reading.md §9): readBenefit scales what reading teaches (0: a reading-poor learner),
// skim is the chance they skim a portion (then it teaches a third as much), and gotItAfterRead inflates "I get it".
const NEUTRAL = { bias: 0, lambda: 1, slip: 0.05, help: 0.1, frustration: { gain: 0.1, budget: 4 }, statedPref: null, repEffect: 0, gotIt: 0.15, wpm: 200, readBenefit: 1, skim: 0.1, gotItAfterRead: 0.35 };
export const PERSONAS = {
  P1: { name: 'anxious novice', theta: -1.2, traits: { bias: -0.25, frustration: { gain: 0.3, budget: 2 }, wpm: 150 } },
  P2: { name: 'overconfident and fluent', theta: 0, traits: { bias: 0.3, gotIt: 0.6 } },
  P3: { name: 'strong and easily bored', theta: 1.5, traits: { frustration: { gain: 0.25, budget: 2 }, wpm: 260 } },
  P4: { name: 'misconception holder', theta: 0, bugs: 2, traits: {} },
  P5: { name: 'gamer', theta: -0.3, traits: { help: 0.6 } },
  P6: { name: 'stated visual (myth control)', theta: -0.3, world: 'N', traits: { statedPref: "i'm a visual learner, i need pictures" } },
  P7: { name: 'representation-sensitive', theta: -0.3, world: 'C', traits: {} },
  P8: { name: 'crammer', theta: 0, traits: { statedPref: 'my exam is in 2 days, i just need to pass' } },
  P9: { name: 'fast learner', theta: -0.5, traits: { lambda: 1.6 } },
  P9s: { name: 'slow learner', theta: -0.5, traits: { lambda: 0.6 } },
};
/** A persona's full trait set; `twin` gives its null twin (same θ profile and bugs, neutral traits, world N unless fixed). */
export function personaOf(id, { twin = false } = {}) {
  const p = PERSONAS[id];
  if (!p) throw Error(`no persona ${id}`);
  return { id: twin ? `${id}-twin` : id, name: twin ? `${p.name} (null twin)` : p.name, theta: p.theta, bugs: p.bugs ?? 1, world: twin ? 'N' : p.world ?? null, traits: twin ? { ...NEUTRAL } : { ...NEUTRAL, ...p.traits } };
}

// ---------- the student ----------
/**
 * A simulated student on one fixture's belief library (`lib`: { concepts: [{ id, memory?, interactivity? }], bugs:
 * [{ id, concept, belief }] , … }). `persona` from personaOf, `world` A|B|C|N, `seed`. The state is plain data (`state`)
 * so it can be saved after every turn and restored.
 */
export function createStudent({ lib, persona, world, seed, theta = null, bugs = null, focus = null }) {
  const r = rng(seed), W = WORLDS[persona.world ?? world] ?? WORLDS.N;
  const concepts = Object.fromEntries(lib.concepts.map(c => [c.id, { theta: (theta?.[c.id] ?? persona.theta) + 0.3 * r.normal(), memory: !!c.memory, interactivity: c.interactivity ?? 'low', attempted: false, seen: 0 }]));
  // Active misconceptions: the persona's count, from the library's bugs (seeded choice), unless given.
  // Planted on the concepts the session is about (a belief about a concept never taught can't be found or repaired).
  const pool = focus?.length ? lib.bugs.filter(b => focus.includes(b.concept)) : lib.bugs;
  const chosen = bugs ?? [...pool].sort(() => r.next() - 0.5).slice(0, persona.bugs).map(b => b.id);
  const state = {
    seed, world: persona.world ?? world, persona: persona.id, concepts, frustration: 0, turn: 0, day: 0,
    bugs: Object.fromEntries(chosen.map(id => [id, { status: 'active', pFire: 0.9, refutedAt: null, repairedAt: null }])),
    log: [],
  };
  // Every trait has a value: a persona built elsewhere (the swap test's sides) may predate a trait (a NaN θ otherwise).
  const t = { ...NEUTRAL, ...persona.traits };
  for (const [k, v] of Object.entries(t)) if (typeof NEUTRAL[k] === 'number' && !Number.isFinite(v)) throw Error(`persona ${persona.id}: trait ${k} is ${v}`);
  const pCorrect = (c, d = 0) => { const g = 0.05; return g + (1 - g) * σ(state.concepts[c].theta - d); };
  const firing = id => { const b = state.bugs[id]; return b && b.status !== 'repaired' ? (b.status === 'pending' ? 0.35 : b.pFire) : b?.status === 'repaired' ? 0.05 : 0; };

  return {
    state, world: W, persona,
    /**
     * The content of an answer to an item: which bug fires (those whose rule applies to the item), else a slip, else
     * right with P(correct), else "I don't know" (low θ) or a wrong guess. Returns { kind: correct|bug|slip|idk|guess,
     * bugId, confidence 0–1 }. `applies`: the ids of active bugs whose rule gives a wrong answer on this item.
     */
    answer({ concept, difficulty = 0, applies = [] }) {
      const c = state.concepts[concept];
      if (c) { c.attempted = true; c.seen++; }
      const p = c ? pCorrect(concept, difficulty) : 0.5;
      for (const id of applies) if (r.next() < firing(id)) return { kind: 'bug', bugId: id, confidence: clip01(0.75 + t.bias + 0.1 * r.normal()) };
      if (r.next() < t.slip) return { kind: 'slip', bugId: null, confidence: clip01(p + t.bias) };
      const right = r.next() < p, conf = clip01(p + t.bias + 0.1 * r.normal());
      if (right) {
        // A correct answer on an item where a pending refutation's bug applies is the re-derivation that repairs it.
        for (const id of applies) if (state.bugs[id]?.status === 'pending') { state.bugs[id].status = 'repaired'; state.bugs[id].repairedAt = state.turn; }
        return { kind: 'correct', bugId: null, confidence: conf };
      }
      for (const id of applies) if (state.bugs[id]?.status === 'pending') state.bugs[id].status = 'active'; // the refutation didn't take
      return { kind: p < 0.3 ? 'idk' : 'guess', bugId: null, confidence: conf };
    },
    /** Whether the student can explain a concept's mechanism now: 'mechanism' (θ high, no active bug on it), 'belief' (explains with its bug), else 'unsure'. */
    explain(concept) {
      const bug = Object.entries(state.bugs).find(([id, b]) => b.status !== 'repaired' && lib.bugs.find(x => x.id === id)?.concept === concept);
      if (bug && r.next() < firing(bug[0])) return { kind: 'belief', bugId: bug[0] };
      return r.next() < pCorrect(concept, 0.8) ? { kind: 'mechanism' } : { kind: 'unsure' };
    },
    /** Reported confidence on a 1–5 scale (§6.2: σ(θ − d) + bias + noise). */
    confidence(concept) { return Math.max(1, Math.min(5, Math.round(1 + 4 * clip01(pCorrect(concept) + t.bias + 0.1 * r.normal())))); },
    /** "I get it" after an explanation, with no evidence: emitted per the persona's bias. */
    saysGotIt() { const p = state.readRecently ? Math.max(t.gotIt, t.gotItAfterRead) : t.gotIt; state.readRecently = false; return r.next() < p; },
    /** Asks for a hint before trying (help-seeking h). */
    seeksHelp() { return r.next() < t.help; },
    /** A tutor move on a concept teaches per the world: θ += λ · gain(kind, gap, ctx). `kind` per sim/student.mjs's perception. */
    learn({ concept, kind, rep = null }) {
      const c = state.concepts[concept];
      if (!c) return 0;
      const move = rep === 'diagram' && kind !== 'told' ? 'diagram' : rep === 'analogy' && kind !== 'told' ? 'analogy' : kind;
      // Diminishing returns: a move teaches less the more the student already knows (σ(−(θ − 0.5)) · 1.2: about 1 at θ −1, 0.45 at θ 1).
      const g = W.gain(move, c.theta, { interactivity: c.interactivity, memory: c.memory, attempted: c.attempted }) * t.lambda * 1.2 * σ(-(c.theta - 0.5));
      if (!Number.isFinite(g)) throw Error(`a non-finite gain (${g}) for ${move} on ${concept}`);
      c.theta += g;
      return g;
    },
    /**
     * Reading a passage of `words` words at `level` (logits: −1 basic, 0 matched to the course, +1 advanced) on a concept:
     * time on text at the persona's reading speed, and a gain by the world's reading response to the level match.
     */
    read({ concept, words = 300, level = 0, learn = true, purpose = false }) {
      const skimmed = r.next() < t.skim, c = state.concepts[concept], seconds = Math.round(words / t.wpm * 60 * (skimmed ? 0.3 : 1));
      state.readRecently = true;
      if (!c || !learn) return { seconds, gain: 0, match: null, skimmed };
      // Gain: the world's response to the level match, scaled by this learner's benefit from reading, a purpose or
      // prequestion bonus (reading.md §3.1), a third when skimmed, and diminishing returns like every other move.
      const match = Math.exp(-((c.theta - level) ** 2) / 2), g = (W.read ?? (() => 0.25))(match, { gap: c.theta - level, attempted: c.attempted, memory: c.memory }) * t.lambda * t.readBenefit * (purpose ? 1.3 : 1) * (skimmed ? 0.33 : 1) * 1.2 * σ(-(c.theta - 0.5));
      c.theta += g;
      return { seconds, gain: g, match, skimmed };
    },
    /** A targeted refutation of a bug (the perception judged it targeted): pending until a correct re-derivation; untargeted feedback changes nothing (§6.2). */
    refute(bugId) { const b = state.bugs[bugId]; if (b && b.status === 'active') { b.status = 'pending'; b.refutedAt = state.turn; return true; } return false; },
    /** Frustration: up on a failure and on confusion past the budget, down on success; disengaged above 1. */
    feel(outcome) { const f = t.frustration; state.frustration = Math.max(0, state.frustration + (outcome === 'fail' ? f.gain : outcome === 'success' ? -f.gain : 0) + (state.turn > f.budget * 3 && outcome !== 'success' ? 0.05 : 0)); return state.frustration > 1; },
    /** Days pass: θ decays toward its start by the half-life; a repaired bug can return (§6.2 "after a delay of Δ days"). */
    delay(days, { halfLife = 7, start = null, returnRate = 0.3 } = {}) {
      for (const [id, c] of Object.entries(state.concepts)) { const s = start?.[id] ?? persona.theta; c.theta = s + (c.theta - s) * Math.pow(0.5, days / halfLife); }
      for (const b of Object.values(state.bugs)) if (b.status === 'repaired' && r.next() < returnRate) b.status = 'active';
      state.day += days;
    },
    /** Expected unassisted success on an item now (no sampling: the outcome metric has no answer noise). */
    expected({ concept, difficulty = 0, applies = [] }) {
      const noBug = applies.reduce((p, id) => p * (1 - firing(id)), 1);
      return noBug * (1 - t.slip) * (state.concepts[concept] ? pCorrect(concept, difficulty) : 0.5);
    },
    tick() { state.turn++; },
    rng: r,
  };
}
const clip01 = x => Math.max(0, Math.min(1, x));
