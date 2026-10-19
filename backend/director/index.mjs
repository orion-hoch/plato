import { newId, safe, hashOf } from '../core/util.mjs';
import { words, matchTopic, unitOf, expandTopics } from '../core/match.mjs';
import { fail } from '../core/errors.mjs';
import { s as shape, validate } from '../core/shape.mjs';
import { call, workIdentity } from '../providers/contracts.mjs';
import { checkBoard, fromDraft, standIn } from '../../shared/boards.mjs';
import { checkCard, checkShow, pageCard, occurs, plainVerdict, withoutPlainVerdict, PLAIN_TRUST } from '../../shared/cards.mjs';
import { REGISTRY, predictionFrom, diffValues, same, checkElementSpec } from '../../shared/elements/registry.mjs';
import { GENERATABLE } from '../../shared/elements/generate.mjs';
import * as agent from '../session/agent.mjs';
import { buildFigure, BUDGET_MS, libraryOf, addToLibrary } from '../session/anatomy.mjs';
import { writeCircuit, circuitsReady, NETLIST_HELP } from '../session/circuit.mjs';
import { writeKit } from '../lessons/kits.mjs';
import { buildAnimation, cachedAnimation, animationId, ready as manimReady, BUDGET_MS as ANIMATE_MS } from '../session/animate.mjs';
import { ADAPTERS } from '../understanding/adapters.mjs';
import { currentGoal, INTRO_MODES } from '../session/agenda.mjs';
import { onFields, within } from '../core/fanout.mjs';
import { runC } from '../run/index.mjs';
import { cut, CARD_DRAFT, CHECKED, CLASSIFIED, PROBLEM_DRAFT, THOUGHT, VERIFIED, STUCK, buildCard, bandOf, keyOf, theirsOf, positive, numbersOf, withContrast, elementFor, truthAt, match, valuesOf, sentencesOf, branchDone, clip, atWord, literalOf, alone, reasonPartOf, sameWord, closingConfirm, namesBelief, QUOTED } from './cards.mjs';
import { decide, next, planArc, CRUNCH_DAYS, pickItem, inZone, chooseElement, comparePair, sessionKindFor, predicted, openModel, ACT, SLOTS } from './policy.mjs';
import { knowCard, diagnosticCard, unitCard } from './intro.mjs';
import { EVIDENCE, fromEvents } from './evidence.mjs';
import { buildGuide, publicGuide } from '../lessons/guide.mjs';
import { loadStudy, topicOfLecture, topicOfWords, studyText, loadSources, searchSources, realProblemsText, readSource } from '../lessons/study.mjs';
import { compute } from '../session/compute.mjs';
import { reviewBoard, reviewNote } from '../session/review.mjs';
import path from 'node:path';

// The teaching engine (v12, docs/system-spec.md §5, §8, §11–16; the service keeps the name `director`). Each turn: the
// answer is verified (a literal match against the course model's verified answers at once, else understanding.verify
// while the voice says the card's neutral line); the verdict becomes a learner observation; the first-match policy picks
// the move (policy.mjs); the card is built from the course model with no model call (cards.mjs), and its follow-ups for
// every branch are prepared before the learner answers. A course without a course model is taught from its notes'
// topics by the writer, and its cards say so. A failed or late model call always ends in the card's neutral line plus a
// safe move. Nothing here branches on subject.

const THINK_BODY = shape.object({ question: shape.string({ min: 1, max: 600 }) });
const TOPIC_BODY = shape.object({ to: shape.string({ min: 1, max: 200 }) });
const GUIDE_BODY = shape.object({ action: shape.enum(['show', 'move_on', 'practice', 'make', 'next', 'write', 'look_up', 'read', 'compute', 'figure', 'circuit', 'animate', 'kit']), title: shape.string({ max: 120 }), markdown: shape.string({ max: 4000 }), code: shape.string({ max: 4000 }), language: shape.enum(['c', 'riscv']), points: shape.array(shape.string({ max: 400 }), { max: 8 }), diagram_type: shape.string({ max: 40 }), diagram_data: shape.string({ max: 8000 }), question_kind: shape.enum(['choice', 'multi_select', 'order', 'match', 'number', 'text']), question: shape.string({ max: 1500 }), options: shape.array(shape.string({ max: 300 }), { max: 8 }), items: shape.array(shape.string({ max: 300 }), { max: 8 }), left: shape.array(shape.string({ max: 300 }), { max: 8 }), right: shape.array(shape.string({ max: 300 }), { max: 8 }), answers: shape.array(shape.string({ max: 300 }), { max: 8 }), explain: shape.string({ max: 600 }), board: shape.string({ max: 200 }), why: shape.string({ max: 300 }), about: shape.string({ max: 200 }), idea: shape.string({ max: 2000 }), object: shape.string({ max: 300 }), ready: shape.string({ max: 80 }), netlist: shape.string({ max: 8000 }), name: shape.string({ max: 40 }), spec: shape.string({ max: 8000 }), proof: shape.array(shape.string({ max: 80 }), { max: 12 }), source: shape.string({ max: 200 }), part: shape.int({ min: 1, max: 500 }) }, { optional: ['source', 'part', 'proof', 'board', 'why', 'about', 'idea', 'object', 'ready', 'netlist', 'name', 'spec', 'title', 'markdown', 'code', 'language', 'points', 'diagram_type', 'diagram_data', 'question_kind', 'question', 'options', 'items', 'left', 'right', 'answers', 'explain'] });
const WATCHDOG_MS = 5_000; // a writer card not in by then gives way to a reading from the notes (else the safe move); the writer's card still takes its place
const HELD_MS = 8_000; // a page prediction on the card in play waits this long for the line that says it aloud (its response id)
// The quick path (spec §16, §13 binding rule 2): the move goes out within it; a verdict slower than that is attached when it lands.
const QUICK_MS = 3500, CLASSIFY_MS = Number(process.env.LUNA_CLASSIFY_MS) || 4000; // LUNA_CLASSIFY_MS: smokes force the late-reading path (1)
const PREFER_AHEAD = 4; // sections of the walk the course model builds ahead of the student (doubled: built ones drop out)
const NOTES_RIGHT = 2, NOTES_MAX = 8; // a section taught from the notes (no course model for it yet) is done after this many right answers, or content lines, on it
const ARC_MAX = 14, ARC_MAX_OPEN = 24, ARC_CRUNCH = 8; // within a week of the exam: 8, 14 with a misconception open // cards on one target before the engine moves on (it stays a gap, chosen again by need); longer while a wrong model is open
// Not an answer yet: the whole line is them working, thinking or asking for a moment. A line with anything more is an answer.
const HOLD_ACT = String.raw`(?:give me (?:a|one) (?:sec(?:ond)?|min(?:ute)?|moment)|(?:one|a|just a) (?:sec(?:ond)?|min(?:ute)?|moment)|wait|hold on|hang on|let me (?:think|see|try|work|check|finish|look)(?: (?:(?:about|at|on|over) )?(?:this|it|that))?|i'?m (?:still )?(?:thinking|working(?: on (?:it|this|that))?|reading|on it)|(?:i'?m |i am )?(?:done|finished)|thinking|working on it)`;
const HOLD_TAIL = String.raw`(?: (?:to )?(?:finish|work on|think about|figure out|do|read)(?: (?:this|it|that|the (?:problem|question)))?)?`;
/** Replies to an open question that move nothing on by themselves: an acknowledgement, a hedge, a denial, noise. */
const ACK = /^\s*(?:ok(?:ay)?|k|alright|all right|sure|fine|got it|i see|cool|right|mhm|mm+[- ]?hm+|uh[- ]?huh|yeah|yep|thanks|thank you)[\s.,!…]*$/i;
const TENTATIVE = /\b(?:kind of|sort of|kinda|sorta|maybe|i guess|i suppose|not (?:totally |completely |really |so |entirely |100% |quite )?sure|i don'?t know|idk|probably|partly|somewhat|i think so\?|possibly|perhaps)\b/i;
const DENY = /^\s*(?:no|nope|nah|not really|not exactly|not quite|that'?s not (?:it|right|what i (?:mean|meant|said|think)))\b/i;
const NOISE = /^\s*(?:u+m+|u+h+|h+m+|e+r+m*|a+h+|o+h+|m{2,})[\s.,!?…]*$/i;
/** An acknowledgement that can't be an answer ("ok"; not "yeah" or "right", which may answer a yes/no question). */
const ACK_ONLY = /^\s*(?:ok(?:ay)?|k|alright|all right|fine|cool|thanks|thank you|mhm|mm+[- ]?hm+)[\s.,!…]*$/i;
/** A yes to a revoicing ("So you're saying …?"). */
const AFFIRM = /^\s*(?:yes|yeah|yep|yup|right|exactly|correct|uh[- ]?huh|mm+[- ]?hm+|sure|i do|i think so|basically|pretty much|that'?s (?:right|it|what i (?:mean|meant|think|said)))\b/i;
const HOLD = new RegExp(String.raw`^(?:(?:ok(?:ay)?|alright|all right|sure|yeah|mm+|hm+|uh+|um+)[\s,.!…-]*)?${HOLD_ACT}${HOLD_TAIL}(?:[\s,.!…-]+${HOLD_ACT}${HOLD_TAIL})*[\s.!…]*$`, 'i');
const DONE = /^(?:(?:ok(?:ay)?|alright|yeah|so)[\s,.!-]*)?(?:i'?m |i am |i have |i'?ve )?(?:done|finished|read it|through)(?: (?:reading|with it|it|now))?[\s.!]*$/i;
// What a line is by its words (any subject). ponytail: English cues; the light classifier covers what they miss.
const REQUEST = [
  ['read', /\b(?:can i (?:just )?read|let me read|(?:read|reading) (?:about|up on) (?:it|this|that)|something to read|give me (?:a|the) (?:reading|text|passage)|read it first)\b/i],
  ['talk', /\b(?:talk me through|walk me through|explain (?:it|this|that)(?: to me)?(?: first)?|can you explain|just explain|tell me how it works)\b/i],
  ['answer', /\b(?:just tell me|tell me the answer|what'?s the answer|give me the answer|show me the answer)\b/i],
  ['talk', /\bhelp me (?:with|understand|get)\b/i],
  ['hint', /\b(?:a hint|give me a hint|a clue|a nudge|i need help|help me(?: out)?)\b/i],
  ['skip', /\b(?:skip (?:this|it)|move on|next (?:one|question)|can we (?:do|try) something else|go faster|speed (?:this|it) up|(?:a bit|much) faster)\b/i],
  ['talk', /\b(?:show me (?:what|how)|what (?:does|would) (?:it|that) look like|can you show me)\b/i],
];
const KIND_ASKED = [['exam_practice', /\b(?:exam (?:practice|questions?|problems?)|past (?:exam|paper)s?|practice (?:problems|questions))\b/i], ['consolidate', /\b(?:let'?s review|go over what we did|refresh my memory)\b/i], ['study_by_reading', /\b(?:study by reading|i'?d rather just read)\b/i], ['problem_help', /\b(?:my homework|my assignment|problem set|a problem i have)\b/i]];
const CLAIMS = /^(?:(?:ok(?:ay)?|yeah|yes|right|oh|alright|sure)[\s,.!]*)*(?:i (?:get|got|understand|see) (?:it|that|this|now)|(?:that )?makes sense|got it|i see|understood|clear(?: now)?|i (?:already )?know (?:this|that|it|all (?:of )?this))\b[^?]*$/i;
// Chit-chat with nothing to check (a yes or no is never chat: it may be the answer).
const CHAT = /^(?:hi|hello|hey|thanks|thank you|cool|nice|great|lol|haha|no worries|good (?:morning|afternoon|evening)|how are you)[\s,.!]*(?:plato)?[\s.!]*$/i;
const FRUSTRATED = /\b(?:ugh+|argh+|this is (?:so )?(?:hard|confusing|annoying)|i hate (?:this|it)|i give up|so confused|i'?m (?:so )?lost|frustrat\w*)\b/i;
const NO_ATTEMPT = /\b(?:how do i (?:start|begin)|where do i (?:start|begin)|what do i do(?: first)?|i don'?t (?:get|understand) the question)\b/i;
const GREETING = /^(?:hi|hello|hey|hiya|good (?:morning|afternoon|evening))\b[\s,!.]*/i;
const REQUEST_FORM = /^(?:(?:hi|hello|hey|ok(?:ay)?|so|um+)[\s,!.]+)*(?:(?:can|could|would|will) (?:we|you)\b|let'?s\b|i(?:'d| would) like to\b|i want to\b|please\b)/i;
// Lines about the session, not the question: lost, mishearing, frustrated, or any question at all (12 Oct: "what's going on?",
// "I didn't hear you" and "shut up" each got the question re-asked). The voice orients them; the card stands.
const META = /\?|\b(confus\w*|lost|what'?s going on|what are we (doing|on)|where (are we|am i)|did ?n'?t (hear|catch|get)|can'?t (hear|see|find)|what do you mean|say (that|it) again|repeat|shut up|stop|hold on|wait|i said|you said|no memory)\b/i;
const QUESTION = /^(?:what|why|how|when|where|which|who|is|are|does|do|can|could|would|should|wait,? (?:what|why|how))\b.*\?\s*$/i;
const REASONING = /\b(?:because|since|so that|so it|which means|that means|therefore|as the|due to|if .* then|the reason)\b/i;
const HEDGE = /\b(?:i think|maybe|probably|i guess|perhaps|not sure|might be|i suppose|kind of|sort of)\b/i;
// What the voice says to an answer that is not a literal match, while it is verified: rotated, so none repeats within four cards.
const NEUTRALS = ['Walk me through how you got that.', 'Tell me how you got there.', 'What was your thinking there?', 'Say a bit more about how you worked it out.', 'How did you get that?', 'Talk me through it.'];
/** A line as compared for "the same line": lower case, no leading hedges, no punctuation. */
const normLine = t => String(t ?? '').toLowerCase().replace(/[’']/g, "'").replace(/^(?:(?:so|well|um+|uh+|ok(?:ay)?|yeah|i (?:think|thought|guess|believe|feel)|maybe|probably|i'?d say)[\s,]+)+/, '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
/** A verifier chain that found a wrong claim in the answer (the calibrated answer.unsupported criterion). */
const falseClaimOf = checked => (checked?.provenance?.chain || []).some(x => x.by === 'V8' && /answer\.unsupported: yes/.test(x.note || ''));
const TEACHING = new Set(['contrast', 'read', 'refutation_read', 'explain', 'worked_example', 'experiment', 'strategy_model', 'refutation', 'contrast_step', 'run_their_model', 'new_frame', 'counter_case', 'reread', 'evidence_standard', 'tell_step', 'worked_solution', 'teach_back', 'compare', 'predict']);

export function installDirector(app) {
  const { db, clock, jobs } = app;
  const S = () => app.services.session, K = () => app.services.knowledge, U = () => app.services.understanding, L = () => app.services.learner;
  const scopeOf = s => ({ ...s.scope });
  /** Within CRUNCH_DAYS of the exam (exams.examDate): compact arcs and shorter limits (policy.mjs). */
  const crunchOf = scope => { const at = Date.parse(db.get('exams', scope.examId)?.examDate ?? ''); return at > clock.now() && at - clock.now() <= CRUNCH_DAYS * 864e5; };

  // ---------- state, cards ----------
  const stateOf = s => db.get('director_state', s.id, scopeOf(s)) || { id: s.id, scope: scopeOf(s), createdAt: clock.iso(), rowVersion: 0, cardId: null, n: 0, last: null };
  const saveState = st => db.replace('director_state', { ...st, updatedAt: clock.iso() });
  const getCard = (scope, id) => id ? db.get('director_cards', id, scope) : null;
  const putCard = (scope, card) => db.replace('director_cards', { rowVersion: 0, createdAt: clock.iso(), ...card, scope, sessionId: card.sessionId ?? null, cacheKey: card.cacheKey ?? null });
  const fullCard = ({ scope, rowVersion, cacheKey, ...card }) => card;
  const goalOf = (s, goalId) => s.agenda?.goals.find(g => g.id === goalId) || null;
  const firstSentence = text => sentencesOf(text)[0] || String(text || '');

  // ---------- what the engine reads: the course model (interface A), the learner (interface B) ----------
  // LUNA_COURSE_MODEL=off (evals' level-3 ablation, dev only): the engine sees no course model and teaches from the notes.
  const ABLATED = globalThis.process?.env?.LUNA_COURSE_MODEL === 'off';
  const cmOf = scope => ABLATED ? null : safe(() => U().courseModel?.(scope) ?? null, null);
  const sliceOf = (scope, kcId) => kcId && !ABLATED ? normalized(safe(() => U().forKc(scope, kcId), null)) : null;
  // Older slices name an item's family `facet` and a wrong model's kind of error by its v11 kind: one shape for the policy.
  const V11_ERRORS = { false_belief: 'F5', flawed_model: 'F7', category_mistake: 'F8' };
  const FACET_FAMILY = { recall: 'E1', interpret: 'E2', classify: 'E2', discriminate: 'E2', apply: 'E3', execute: 'E3', predict: 'E4', explain: 'E5', diagnose: 'E6', evaluate: 'E6', critique: 'E6', transfer: 'E7', integrate: 'E7', generate: 'E8', construct: 'E8', perspective: 'E9' };
  const familyOf = p => /^E(10|[1-9])$/.test(p.family || '') ? p.family : /^E(10|[1-9])$/.test(p.facet || '') ? p.facet : FACET_FAMILY[p.facet] ?? 'E3';
  const normalized = slice => slice && { ...slice, problems: (slice.problems || []).map(p => ({ ...p, family: familyOf(p) })), wrongModels: (slice.wrongModels || []).map(w => w.errorKind ? w : { ...w, errorKind: V11_ERRORS[w.kind] ?? 'F5' }) };
  const kcState = (scope, kcId) => safe(() => L().state?.(scope, kcId), null) || { theta: 0, sigma: 1.5, source: 'inferred', operative: [], due: 0, presented: null, mastery: null };
  const traitsOf = scope => safe(() => L().traits?.(scope), null);
  /** A stable id for a claim no catalogued wrong model names (spec §7 stage 12: a candidate wrong model). */
  // The id hashes the claim's words, in any order: "moving molecules across …" and "molecules moving across …" are one claim.
  const candidateOf = (kc, claim) => ({ id: `cand:${kc}:${hashOf(normLine(claim).split(' ').sort().join(' ')).slice(-10)}`, claim: clip(claim, 200), kc });
  /** A claim as the classifier restated it counts only when it is their own (half its words are theirs), never a comment on it. */
  const ownClaim = (c, text) => { const cw = [...words(c || '')], lw = words(text); return cw.length > 0 && cw.filter(x => lw.has(x)).length >= cw.length / 2; };
  /** The claim a line makes, as the reading restated it in their own words, else null: a claim is never made up from the line itself. */
  const claimOf = (cls, text) => (ownClaim(cls?.claim, text) ? cls.claim : null);
  /** A candidate wrong model this session matched, as a wrong model the cards can state (its belief is the claim), else null. */
  const candidateWm = (s, id) => { const x = String(id ?? '').startsWith('cand:') ? (stateOf(s).said || []).find(y => y.id === id && y.claim) : null; return x ? { id, kc: x.kc, belief: x.claim, errorKind: 'F5', candidate: true } : null; };
  /** A line matched as a belief, remembered for the session: said again on the same KC, it is matched the same way, with no model call. */
  function remember(s, kc, text, id, claim = null) {
    const norm = normLine(text), st = stateOf(S().peek(s.id));
    if (norm.split(' ').length < 4) return; // "ok", "no", "I think so": too short to stand for a belief
    if (id && kc) saveState({ ...st, said: [...(st.said || []).filter(x => !(x.kc === kc && x.norm === norm)), { norm, kc, id, claim }].slice(-30) });
  }
  /**
   * A candidate claim (one no catalogued model names) is refuted only once the calibrated narrow judge has found it false
   * (`answer.unsupported`, against the KC's idea and explanation): `claims[id]` true = judged false, false = judged supported,
   * null = being judged (decisive4: a true statement flagged as contradicting was refuted). Until then it is a hypothesis: the
   * move is a case, never a refutation, a contrast or a verdict, and its observation waits for the judge.
   */
  const claimJudged = (s, id) => stateOf(S().peek(s.id) ?? s).claims?.[id];
  const provenFalse = (s, id) => !String(id ?? '').startsWith('cand:') || claimJudged(s, id) === true;
  const setClaim = (s, id, verdict, words = null) => { const st = stateOf(S().peek(s.id)); saveState({ ...st, claims: { ...(st.claims || {}), [id]: verdict }, ...(words ? { claimWords: { ...(st.claimWords || {}), [id]: clip(words, 200) } } : {}) }); };
  function judgeClaim(s, c, held = null) {
    if (!c?.id || claimJudged(s, c.id) !== undefined) return;
    setClaim(s, c.id, null);
    { const st = stateOf(S().peek(s.id)); saveState({ ...st, claimWords: { ...(st.claimWords || {}), [c.id]: clip(c.claim, 200) } }); }
    jobs.enqueue({ scope: scopeOf(s), type: 'director_claim', idempotencyKey: `claim:${s.id}:${c.id}`, payload: { sessionId: s.id, id: c.id, claim: c.claim, kc: c.kc, held }, priority: 36 });
  }
  /**
   * Rule 8 for a belief with no computed cases (decisive10): one case from the course whose stated outcome the belief gets wrong.
   * The cases are the KC's own (its cases, worked examples, items with their answers); the pairing is the calibrated narrow
   * judge's (`answer.unsupported`: the belief, as an answer to the case, against the case's own text). `pairs[id]`: the case,
   * false (none), null (judging). Nothing is generated: the case and its outcome are the course's words.
   */
  /**
   * What a course case says happens, for the learner: its first two statements of fact after the setup. A case's text is written
   * for the tutor too: setup instructions ("Idealize …", "Assume …") and notes to the tutor ("Ask the learner …", "Evidence of
   * understanding is …", "the … model incorrectly …") are not the outcome.
   */
  const INSTRUCTION = /^(?:idealize|assume|use|label|ask|consider|imagine|suppose|let|compare|retain|reject|note|treat|set|keep|give|have|start|begin|show|draw)\b/i;
  const TUTOR_NOTE = /\b(?:learner|student|tutor|evidence of understanding|model incorrectly|incorrectly sends|confuses|exposes|misconception|this (?:controlled )?case|defensible critique)\b/i;
  const imperative = x => INSTRUCTION.test(x.trim()) && !/^\S+\s+(?:can|could|will|would|may|might|must|should|is|are|was|were|has|have|had|does|do|did)\b/i.test(x.trim()); // "Label a fraction…", never "Label can enter…"
  const outcomeOf = text => { const facts = sentencesOf(String(text || '')).filter(x => !imperative(x) && !TUTOR_NOTE.test(x)); return facts.length ? facts.slice(0, 2).join(' ') : null; };
  const learnerText = t => sentencesOf(String(t || '')).filter(x => !TUTOR_NOTE.test(x)).join(' '); // a course case as the learner reads it: no notes to the tutor
  const caseOf = (s, id) => Object.values(stateOf(S().peek(s.id) ?? s).pairs || {}).find(p => p && p.caseId === id) ?? null; // a course case paired this session
  function casesFor(scope, kc) {
    const sl = sliceOf(scope, kc), out = [];
    for (const c of sl?.cases || []) if (c.text) { const o = outcomeOf(c.text); if (o) out.push({ id: c.id, title: c.title || null, text: c.text, outcome: o }); }
    for (const p of sl?.problems || []) { const k = keyOf(p); if (p.prompt && k?.value && k.value.split(/\s+/).length > 3) out.push({ id: p.id, title: null, text: p.prompt, outcome: k.value, item: true }); }
    return out.slice(0, 6);
  }
  function pairCase(s, id, belief, kc) {
    const st = stateOf(S().peek(s.id));
    if (!id || !belief || !kc || (st.pairs || {})[id] !== undefined) return;
    saveState({ ...st, pairs: { ...(st.pairs || {}), [id]: null } });
    jobs.enqueue({ scope: scopeOf(s), type: 'director_pair', idempotencyKey: `pair:${s.id}:${id}`, payload: { sessionId: s.id, id, belief: clip(belief, 300), kc }, priority: 34 });
  }
  /** A candidate's hit as the policy reads it: unverified until the judge has found the claim false. */
  const claimHit = (s, c, p) => ({ id: c.id, p, ...(provenFalse(s, c.id) ? {} : { unverified: true }) });
  // The learner's newest line per session (a late revision never answers an older one), and the lines whose wrong model is recorded.
  const latest = new Map(), diagnosed = new Set(), mark = id => { diagnosed.add(id); if (diagnosed.size > 2000) diagnosed.delete(diagnosed.values().next().value); };
  // The light classifier's reading of a line, cached per session, card and line: the same line in the same place is typed the same way.
  const typed = new Map(), TYPED_MAX = 2000;
  /** A learner observation; a rejected one is logged (the evidence path must never fail silently). */
  const observe = (scope, o) => { try { return L().observe(scope, { ...o, wrongModelHits: (o.wrongModelHits || []).map(h => ({ id: h.id, p: h.p })) }); } catch (error) { console.warn(`[engine] observation rejected: ${error.message}`); return null; } }; // hits as the learner takes them: id and p only
  const itemById = (cm, id) => { const p = id ? cm?.problems?.find(x => x.id === id) ?? null : null; return p && { ...p, family: familyOf(p) }; };
  /** The known wrong beliefs a line on this card might state: the target KC's first, then its topic's, likeliest first (≤ 6). */
  function beliefsFor(s, card, text = '') {
    const cm = cmOf(scopeOf(s)), kc = card.target?.kc, topic = card.target?.topicId;
    if (!cm || !kc) return [];
    const mine = (cm.wrongModels || []).filter(w => w.kc === kc), near = (cm.wrongModels || []).filter(w => w.kc !== kc && w.topicId === topic);
    const local = [...mine, ...near].sort((a, b) => (b.kc === kc) - (a.kc === kc) || (b.prior ?? 0) - (a.prior ?? 0)).slice(0, 6);
    // Any detector type, anywhere in the course: a belief from another topic whose words the line shares (2+ content words) is a candidate too.
    const said = words(text), shared = w => [...words(`${w.belief} ${(w.markers || []).join(' ')}`)].filter(x => said.has(x)).length;
    const far = text ? (cm.wrongModels || []).filter(w => !local.includes(w)).map(w => [shared(w), w]).filter(([n]) => n >= 2).sort((a, b) => b[0] - a[0]).slice(0, 8 - local.length).map(([, w]) => w) : [];
    return normalized({ wrongModels: [...local, ...far] }).wrongModels;
  }
  /** The marker prefilter (§13 binding rule 3): a wrong model one of whose cue phrases the line says (all its content words). */
  // A cue phrase said in order, each word in any form ("adding bytes" for "add bytes"), at most one other word between ("adds n
  // bytes"). Over a line's candidate beliefs, on the measured statements (8 Oct): the right model for 8.9% of belief statements,
  // another model for 0.9%, and it fires on 0.4% of correct statements; the snapshot's bag of content words, 25.8%, 12.9% and
  // 11.9%. Low recall is the price of acting alone: the light reading does the matching (and, late, still revises the move);
  // the marker orders its candidates and stands in only when the reading is unavailable.
  const tokensOf = t => String(t ?? '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+|[+*/=<>-]/g) || [];
  const says = (text, cue) => {
    const l = tokensOf(text), k = tokensOf(cue), same = (x, y) => x === y || (x.length >= 3 && sameWord(x, y));
    const from = (i, j) => j === k.length || l.slice(i, j ? i + 2 : l.length).some((y, t) => same(k[j], y) && from(i + t + 1, j + 1)); // the next word, or one after
    return k.length > 0 && from(0, 0);
  };
  const markerHit = (text, wms) => wms.find(m => (m.markers || []).some(k => says(text, k))) ?? null;
  /** What the policy and the builders need for a KC, in one place. */
  function contextFor(s, kcId, extra = {}) {
    const scope = scopeOf(s), cm = cmOf(scope), slice = sliceOf(scope, kcId), kc = slice?.kc ?? null, st = kc ? kcState(scope, kc.id) : null, traits = traitsOf(scope);
    const adapter = slice?.problems?.find(p => p.adapter)?.adapter ?? cm?.adapters?.[0] ?? null;
    const prereqs = kc ? (kc.prerequisites || []).filter(id => cm.kcs.some(k => k.id === id)).map(id => ({ kc: id, state: kcState(scope, id) })) : [];
    const wrongModel = id => id ? normalized({ wrongModels: (cm?.wrongModels || []).filter(w => w.id === id) }).wrongModels[0] ?? candidateWm(s, id) : null; // course-wide: a wrong answer may name another KC's; a candidate by its claim
    return { scope, sessionId: s.id, cm, slice, kc, st, traits, adapter, wrongModel, kind: kc?.kind ?? 'concept', registry: REGISTRY, prereqs, spine: cm?.spine?.find(sp => (sp.kcs || []).includes(kc?.id))?.id ?? null, epistemic: ADAPTERS[adapter]?.epistemicProfile ?? null, ...extra };
  }
  /** The KC an agenda goal targets: its own, else the most needed KC of its topics (learner.priorities); null without a course model. */
  function targetKc(s, goal) {
    const scope = scopeOf(s), cm = cmOf(scope), closed = new Set(stateOf(s).closedKcs || []);
    if (!cm?.kcs?.length || !goal) return null;
    const ids = (goal.kcIds?.length ? goal.kcIds.filter(id => cm.kcs.some(k => k.id === id)) : cm.kcs.filter(k => (goal.topicIds || []).includes(k.topicId)).map(k => k.id)).filter(id => !closed.has(id));
    if (!ids.length) return null;
    const top = safe(() => L().priorities(scope, ids), null)?.[0];
    return typeof top === 'string' ? top : top?.kc ?? top?.kcId ?? top?.id ?? ids[0];
  }
  /** Why this move, citing the learner evidence (spec §15 `why`). */
  function whyOf(d, ctx, wm = null) {
    const st = ctx.st, works = safe(() => ctx.traits?.whatWorks?.(ACT[d.act]?.move, ctx.kind, null), null);
    return [`rule ${d.rule ?? '—'} → ${d.act}`, st && `θ ${(st.theta ?? 0).toFixed(1)} ± ${(st.sigma ?? 1.5).toFixed(1)} (${st.source ?? 'prior'})`,
      ...(st?.operative || []).filter(o => o.p >= 0.3).slice(0, 2).map(o => `wrong model ${o.wrongModelId} p ${Number(o.p).toFixed(2)} ${o.status}`),
      wm && `repair by kind ${wm.errorKind ?? 'F5'}: "${atWord(wm.belief, 80)}"`, works?.n ? `${ACT[d.act]?.move} works ${works.mean >= 0 ? '+' : ''}${works.mean.toFixed(2)} (n ${works.n})` : null,
      ctx.zone && `reading ${ctx.zone.ok ? 'in zone' : 'out of zone'} (${ctx.zone.level})`, ctx.reasonNote && `target: ${ctx.reasonNote}`].filter(Boolean).join('; ');
  }

  // ---------- a move made into a card ----------
  /**
   * The card for decision `d` on the arc's KC: what the act needs is fetched (an item, a reading, an element, a wrong model,
   * a prerequisite's item), items are marked used, and missing content falls back down a short chain (an element → the
   * item; a reading → the spoken explanation; nothing → a question about what they know). Never throws.
   */
  function cardFor(s, d0, { prev = null, verdict = null, reason = null, first = false, goal = null } = {}) {
    let d = d0;
    const arc = { ...d.arc, used: [...(d.arc?.used || [])], contrasted: [...new Set([...(d.arc?.contrasted || []), ...(stateOf(s).shownCases || [])])] }, base = contextFor(s, arc.kc), { scope, cm, slice, st } = base; // a case shown in this session, in any arc, counts as shown
    const ctx = { ...base, arc, prev, verdict, reason, first, moment: arc.repair ? 'repair' : arc.tested ? 'transfer' : arc.successes ? 'consolidation' : 'first_contact', reasonNote: goal?.why ?? null };
    let act = d.act, item = null, portion = null, rep = null, element = null, wm = null, kcFor = base.kc;
    const take = it => { if (it) { arc.used = [...arc.used, it.id]; arc.last = { id: it.id, familyId: it.familyId ?? null, form: it.form ?? null }; arc.help = { itemId: it.id, level: 0, fails: {}, told: 0 }; d = { ...d, helpLevel: 0 }; } return it; };
    const fresh = (opts = {}) => pickItem(slice?.problems, { st, used: arc.used, last: arc.last, want: Object.keys(arc.help?.fails || {}).length ? 0.8 : 0.7, ...opts });
    // A repair's new case: one whose answer the repair doesn't say aloud (the belief, why it seemed right, the KC's statement).
    const shown = it => !!it && (arc.contrasted || []).includes(it.id); // its answer was said in a contrast: never asked again
    const spoken = () => [wm?.belief, wm?.plausibleBecause, base.kc?.statement, sentencesOf(slice?.explanation?.plain || '')[0], ctx.contrast && `${ctx.contrast.mine} ${ctx.contrast.truth} ${ctx.contrast.why || ''}`].filter(Boolean).join(' '), clean = it => it && !(literalOf(it.answer) && occurs(spoken(), literalOf(it.answer)));
    const newCase = (opts = {}) => { const sep = separating(arc, base, wm); return clean(sep) ? sep : fresh({ ...opts, keep: clean }) ?? fresh(opts) ?? (shown(current()) ? null : current()); }; // no fresh item: the question they answered, again (rank 3), unless its answer was shown
    const current = () => itemById(cm, arc.help?.itemId) ?? itemById(cm, prev?.item?.id);
    // No unused item left: the KC's board is the new case, a representation to change and watch (decisive9), one not yet used.
    const boardCase = () => { const pick = chooseElement({ mode: 'change', moment: 'repair', representations: slice?.representations, registry: REGISTRY, kind: base.kind, move: 'repair', used: arc.repsUsed || [] }); if (!pick) return null; arc.repsUsed = [...(arc.repsUsed || []), pick.id]; const el = elementFor(pick, { registry: REGISTRY, mode: 'change', ask: pick.activeTask ?? null, moment: 'repair', kc: arc.kc }); return el && fair(el.spec) ? el : null; };
    const wmId = d.wrongModel ?? arc.repair?.wrongModel; // a wrong answer may name a wrong model of another KC: looked up course-wide
    wm = base.wrongModel(wmId) ?? (d.adhoc ? { id: wmId ?? null, kc: arc.kc, belief: d.adhoc.belief, errorKind: 'F5', plausibleBecause: null, candidate: true } : null);
    if (!wm && ['refutation', 'contrast_step', 'new_frame', 'contrast'].includes(act)) act = 'counter_case'; // nothing to refute by name: a case where their answer breaks
    // Rule 8: the contrast a repair shows, computed (their answer to the case against its key, else the course model's prediction
    // for the belief on one of its items against that item's key). Its item's answer is then said: never asked after.
    const saidKeys = new Set(stateOf(s).saidKeys || []), said = text => { const k = sentenceKey(text); return !!k && saidKeys.has(k); }; // what this session has heard
    ctx.contrast = wm && ['contrast', 'refutation', 'counter_case'].includes(act) && !d.unverifiedClaim ? contrastFor(base, arc, wm, prev, verdict, said) : null; // a claim not yet judged false: no contrast, no "in fact"
    if (act === 'contrast' && d.unattributed && ctx.contrast?.from !== 'answer') { ctx.contrast = null; act = String(wm?.id ?? '').startsWith('cand:') ? 'counter_case' : 'separating_question'; } // a candidate: contrast on their own answer only, else separate (a claim: a case)
    if (act === 'contrast' && !ctx.contrast) act = 'refutation';
    if (act === 'refutation' && ctx.contrast?.from === 'case') act = 'contrast'; // a course case is asked about, never refuted from (decisive11b)
    if (act === 'counter_case' && ctx.contrast) act = 'contrast'; // a counter-case is shown computed, never left for them to resolve
    if (ctx.contrast?.itemId) { if (!arc.used.includes(ctx.contrast.itemId)) arc.used = [...arc.used, ctx.contrast.itemId]; arc.contrasted = [...new Set([...(arc.contrasted || []), ctx.contrast.itemId])]; } // shown: never asked, never contrasted again
    if (!wm && act === 'teach_back') wm = [...(slice?.wrongModels || [])].sort((a, b) => (b.prior ?? 0) - (a.prior ?? 0))[0] ?? null;
    try {
      switch (act) {
        case 'read': case 'refutation': case 'reread': {
          const zone = inZone(st, base.prereqs); ctx.zone = zone;
          portion = safe(() => U().reading(scope, { kc: arc.kc, level: zone.level, purpose: act === 'refutation' ? 'refute' : null }), null);
          if (portion && act === 'read' && (stateOf(s).readIds || []).includes(portion.id)) portion = null; // read already this session: never the same portion twice (the next KC sharing it is explained instead)
          // A false belief is refuted directly, in speech, then checked on a new case (binding rule 4); the refutation text on the page is for a second time.
          if (act === 'refutation') { if (portion?.refutes && zone.ok && (arc.repair?.tries || 1) > 1 && !ctx.contrast) act = 'refutation_read'; else { portion = null; const it = newCase({ want: 0.8 }); item = it && clean(it) && !shown(it) && !arc.used.includes(it.id) && it.id !== ctx.contrast?.itemId ? take(it) : null; if (!item) element = boardCase(); } } // a new case: never the question on the page again // a case whose answer the refutation says would cut what's true
          if (act === 'read' && !portion) { act = 'explain'; item = take(fresh({ families: ['E2', 'E4', 'E1', 'E3'] })); rep = slice?.representations?.find(r => r.board) ?? null; }
          if (act === 'reread' && !portion) item = current();
          if (portion) portion = framed(portion, { verdict: { wrongModel: wm?.id ?? null, suspected: d.suspected, p: verdict?.p } }, base); // rule 9 on its purpose and prequestions
          if (portion) { arc.readPortion = portion.id; arc.slots = ['after', ...(arc.slots || []).filter(x => !['teach', 'after', 'read'].includes(x))]; } // a reading is the telling; its consolidation comes next, never another portion
          break;
        }
        case 'after_reading': {
          portion = prev?.show?.kind === 'reading' ? prev.show.portion : null;
          ctx.after = portion?.after?.[0] ?? null; ctx.prequestionAnswer = arc.prequestionAnswer ?? null;
          if (ctx.after && ['predict_new_case', 'paired_problem', 'classify'].includes(ctx.after.form)) item = take(fresh());
          break;
        }
        case 'explain': item = take(fresh({ families: ['E2', 'E4', 'E1', 'E3'] })); rep = slice?.representations?.find(r => r.board) ?? null; break;
        case 'worked_example': {
          item = (slice?.problems || []).find(p => p.steps?.length && !arc.used.includes(p.id)) ?? itemById(cm, slice?.explanation?.workedExamples?.[0]?.problemId);
          if (item) {
            arc.used = [...arc.used, item.id]; ctx.workedPrompt = item.prompt;
            // Then the matching item, done alone: its answer is an observation like any other (§10). Same family, else KC; a
            // question board (never an element), a different answer, and one whose answer nothing on the card says.
            const w = item, lit = literalOf(w.answer), alike = p => p.id !== w.id && !arc.used.includes(p.id) && !shown(p) && clean(p) && !p.element?.spec && literalOf(p.answer) !== lit;
            const pool = slice?.problems || [], match = pool.find(p => alike(p) && w.familyId && p.familyId === w.familyId) ?? pool.find(p => alike(p) && p.kc === w.kc);
            if (match) ctx.matching = take(match);
          }
          else if (!slice?.procedures?.length) { act = 'explain'; item = take(fresh({ families: ['E2', 'E4', 'E1', 'E3'] })); }
          break;
        }
        case 'experiment': case 'predict': case 'compare': case 'construct': case 'teach_back': case 'draw': case 'try_first': {
          let mode = { experiment: 'change', predict: 'predict', compare: 'compare', construct: 'construct', teach_back: 'teach', draw: 'draw', try_first: 'predict' }[act];
          const works = (move, kind, repKind) => safe(() => base.traits?.representationResponse?.(repKind, kind) ?? base.traits?.whatWorks?.(move, kind, repKind), null);
          let pick = mode === 'compare' ? null : chooseElement({ mode, moment: ctx.moment, representations: slice?.representations, registry: REGISTRY, works, kind: base.kind, move: ACT[act]?.move, avoid: d.switchRepresentation ? [prev?.show?.kind] : [], used: arc.repsUsed || [] }) ?? (mode === 'change' ? chooseElement({ mode, moment: ctx.moment, representations: slice?.representations, registry: REGISTRY, works, kind: base.kind, move: ACT[act]?.move }) : null); // span the KC's kinds before repeating one
          // Elements first (§15b): no representation to predict on (no checkpoint), the KC's runnable one to change instead.
          if (!pick && mode === 'predict' && (act === 'predict' || act === 'try_first')) { pick = chooseElement({ mode: 'change', moment: ctx.moment, representations: slice?.representations, registry: REGISTRY, works, kind: base.kind, move: 'present' }); if (pick) mode = 'change'; } // still the prequestion (elicit): the telling is still to come
          if (pick) arc.repsUsed = [...new Set([...(arc.repsUsed || []), pick.id])];
          const signatures = (slice?.wrongModels || []).flatMap(w => w.pageState ? [{ when: w.pageState, wrongModel: w.id, reply: 'Not quite: look at what the page shows.' }] : []);
          if (pick) element = elementFor(pick, { registry: REGISTRY, mode, ask: pick.activeTask ?? null, moment: ctx.moment, kc: arc.kc, signatures });
          if (element && !fair(element.spec)) element = null; // a page that gives the answer away never goes out: the item instead
          if (mode === 'draw') element = canvasFor(slice, arc, ctx.moment); // draw from memory: a blank frame, the reference after, a rubric the learner never sees
          if (mode === 'compare') {
            const [a, b] = comparePair(slice?.representations, REGISTRY) || [];
            if (a && b) element = { spec: { kind: 'compare', state: { pair: [{ kind: a.kind, state: a.spec }, { kind: b.kind, state: b.spec }], difference: atWord(a.notice?.[0] || 'the one feature that differs', 200) }, task: { mode: 'compare', ask: 'What is the one difference that matters, and why?' }, moment: ctx.moment, concepts: [arc.kc] }, truth: null };
            if (element) item = take(fresh({ families: ['E2', 'E4', 'E5'] }) ?? fresh()); // a compare carries a question whose answer is evidence (binding rule 6)
          }
          if (element && mode === 'change' && !item) item = take(fresh({ families: ['E4', 'E3', 'E2'] }) ?? fresh()); // an experiment ends in a question whose answer is evidence (binding rule 6)
          if (!element) { // the item's own element (study's problem.element), else the item on its board
            item = take(fresh({ families: mode === 'predict' ? ['E4', 'E2', 'E3'] : null }) ?? fresh());
            if (item?.element?.spec && ['predict', 'teach'].includes(mode)) element = elementFor(item.element, { registry: REGISTRY, mode, ask: clip(item.prompt, 300), moment: ctx.moment, kc: arc.kc, attempt: mode === 'teach' && wm ? attemptOf(item, wm) : null });
            if (!item && !element) act = 'explain';
          }
          if (act === 'try_first') act = element ? 'predict' : 'try_first';
          break;
        }
        case 'run_their_model': {
          const it = current(), theirs = arc.lastAnswer ?? null, prediction = it?.element?.spec && theirs ? predictionOf(it, theirs) : null;
          if (prediction) element = elementFor(it.element, { registry: REGISTRY, mode: 'predict', ask: 'What did your version assume?', moment: 'repair', kc: arc.kc, prediction });
          if (!element) { // nothing to run on the page: the case shown computed both ways when it can be (rule 8), else a counter-case
            ctx.contrast = wm ? contrastFor(base, arc, wm, prev, verdict, said) : null;
            if (ctx.contrast) { act = 'contrast'; if (ctx.contrast.itemId) { if (!arc.used.includes(ctx.contrast.itemId)) arc.used = [...arc.used, ctx.contrast.itemId]; arc.contrasted = [...new Set([...(arc.contrasted || []), ctx.contrast.itemId])]; } const it = newCase({ want: 0.75 }); item = it && clean(it) && !shown(it) && !arc.used.includes(it.id) && it.id !== ctx.contrast.itemId ? take(it) : null; }
            else { act = 'counter_case'; item = take(newCase()); } // no fresh case: the question they answered, again
          }
          break;
        }
        case 'counter_case': case 'new_frame': case 'contrast_step': {
          item = take(newCase({ want: act === 'contrast_step' ? 0.8 : 0.7 })); // every repair ends in a new case
          // No case left to try their idea on, and none computed: a worked case on the page, whose outcome speaks (decisive5:
          // never the frame alone, "Take your idea. Does it still hold?").
          if (!item && act === 'counter_case' && !ctx.contrast) return cardFor(s, { ...d, act: 'worked_example', arc }, { prev, verdict, reason, first, goal });
          const [a, b] = act === 'new_frame' ? [] : comparePair(slice?.representations, REGISTRY) || []; // a contrast is two instances side by side (§15b, repair)
          if (a && b) element = { spec: { kind: 'compare', state: { pair: [{ kind: a.kind, state: a.spec }, { kind: b.kind, state: b.spec }], difference: atWord(a.notice?.[0] || 'the one feature that differs', 200) }, task: { mode: 'compare', ask: 'Which of the two fits your idea, and where does it break?' }, moment: 'repair', concepts: [arc.kc] }, truth: null };
          break;
        }
        case 'revoice': { ctx.revoice = (rightReason(verdict) ? revoiceOf(wm?.belief) ?? revoiceOf(reasonPartOf(arc.lastAnswer, verdict.confirm)) : null) ?? revoiceOf(arc.lastAnswer) ?? revoiceOf(wm?.belief); if (!ctx.revoice) return cardFor(s, { ...d, act: 'counter_case', arc }, { prev, verdict, reason, first, goal }); break; }
        case 'contrast': { if (ctx.contrast?.from === 'case') break; const it = (d.hypotheses?.length ? separatingFor(base, arc, d.hypotheses, shown) ?? separating(arc, base, wm, d.hypotheses) : null) ?? newCase({ want: 0.75 }); item = it && clean(it) && !shown(it) && !arc.used.includes(it.id) && it.id !== ctx.contrast?.itemId ? take(it) : null; if (!item) element = boardCase(); break; } // a fresh case, never the one just shown nor one whose answer it says
        case 'separating_question': item = take(separatingFor(base, arc, d.hypotheses || [], shown) ?? separating(arc, base, wm, d.hypotheses) ?? fresh()); if (!item) act = 'explain'; break;
        case 'detour': {
          const pre = sliceOf(scope, d.prereq ?? arc.detour?.to), pst = pre?.kc ? kcState(scope, pre.kc.id) : null;
          item = pre ? pickItem(pre.problems, { st: pst, used: arc.used, want: 0.7 }) : null;
          if (item) { arc.used = [...arc.used, item.id]; kcFor = pre.kc; ctx.slice = pre; ctx.st = pst; arc.help = { itemId: item.id, level: 0, fails: {}, told: 0 }; } else act = 'general_hint';
          break;
        }
        case 'interleave': {
          const others = (cm?.kcs || []).filter(k => k.id !== arc.kc && (k.topicId === base.kc?.topicId || (cm.links || []).some(l => l.relation === 'contrasts_with' && [l.from, l.to].includes(k.topicId))));
          for (const k of others) { const sl = sliceOf(scope, k.id), it = sl && pickItem(sl.problems, { st: kcState(scope, k.id), used: arc.used }); if (it) { item = it; kcFor = k; ctx.slice = sl; arc.used = [...arc.used, it.id]; arc.help = { itemId: it.id, level: 0, fails: {}, told: 0 }; break; } }
          if (!item) { act = 'retrieval'; item = take(fresh()); }
          break;
        }
        case 'pump': case 'general_hint': case 'specific_hint': case 'tell_step': case 'worked_solution': case 'flag': case 'locate': case 'request_attempt': case 'explain_why': case 'explain_reasoning': {
          item = current();
          if (act === 'tell_step') arc.help = { ...arc.help, told: (arc.help?.told ?? 0) + 1 };
          if (act === 'worked_solution') arc.slots = ['matching', ...(arc.slots || []).filter(x => x !== 'matching')]; // then a matching item done alone
          break;
        }
        case 'refutation_read': break;
        default: { // the item moves: first step, test, re-test, practice, retrieval, matching, generative check, cold start
          if (act === 'prequestion' && slice?.readings?.length) return cardFor(s, { ...d, act: 'read', arc }, { prev, verdict, reason, first, goal });
          const freshOne = fresh({ exam: arc.sessionKind === 'exam_practice', easier: !!d.easier, want: ['matching', 'retest'].includes(act) ? 0.8 : 0.7 });
          item = take(freshOne ?? (['retest', 'test', 'matching'].includes(act) && !shown(current()) ? current() : null)); // no fresh item: a re-test re-ask (never of a case whose answer was shown)
          if (item && !freshOne) ctx.again = true; // said as the same question again, never as a new cases, never skipped
          if (!item && ACT[act]?.move === 'probe' || !item && ACT[act]?.move === 'practice') act = ['test', 'retest'].includes(act) && !openModel(arc, base) ? 'summary' : 'explain';
        }
      }
    } catch (error) { console.warn(`[engine] content for ${d.act}: ${error.message}`); }
    if (act === 'explain' && !item && !slice?.explanation && !rep) act = 'summary'; // nothing to tell and nothing to ask: their own summary (never a "why does that work?" on nothing verified)
    if (!item) { const q = (slice?.topic?.essentialQuestions || []).map(x => x.question).find(x => x && !(arc.asked || []).includes(x)); if (q) { ctx.elicit = q; arc.asked = [...(arc.asked || []), q]; } }
    arc.cards = (arc.cards || 0) + 1;
    if (TEACHING.has(act)) { arc.taught = { move: ACT[act]?.move ?? 'present', act, representation: element?.spec?.kind ?? (portion ? 'reading' : null), wrongModel: wm?.id ?? null }; if (['present', 'read', 'repair'].includes(ACT[act]?.move)) arc.slots = (arc.slots || []).filter(x => x !== 'teach'); } // only an exposition is the telling: an opening prediction leaves it to come (decisive12: it took the teach slot, so a reading never came)
    // Rule 8 as a check (decisive4): every repair naming a computable belief shows a case, its own or a new one said as new; a
    // case already shown this arc is recalled rather than none. Computed before the card is built: the builder names a belief
    // only beside a case.
    if (ACT[act]?.move === 'repair' && act !== 'contrast' && !ctx.contrast && !d.unattributed && wm && !(element && act === 'run_their_model')) {
      const found = contrastFor(base, arc, wm, prev, verdict, said), fresh = found?.from === 'case' ? null : found, again = fresh ? null : modelContrast(base, { ...arc, contrasted: [] }, wm, k => reasonOf(k?.why, base.slice?.explanation, k?.value ?? ''), null, true);
      ctx.contrast = fresh ?? (again && { ...again, recall: (arc.contrasted || []).includes(again.itemId) });
      if (ctx.contrast?.itemId) { if (!arc.used.includes(ctx.contrast.itemId)) arc.used = [...arc.used, ctx.contrast.itemId]; arc.contrasted = [...new Set([...(arc.contrasted || []), ctx.contrast.itemId])]; }
      if (ctx.contrast && item && item.id === ctx.contrast.itemId) item = null; // the case shown is never the one asked
    }
    ctx.fullTruth = fullReason(slice?.explanation, base.kc, said); // the course's full reason, positive, not yet said
    const built = buildCard({ ...d, act }, { ...ctx, said, kc: kcFor, slice: ctx.slice ?? slice, item, portion, rep, wm, element, target: kcFor ? null : fallbackTarget(s, goal) });
    built.why = whyOf({ ...d, act }, ctx, wm);
    if (built.move === 'repair' && ctx.contrast && !built.contrast) Object.assign(built, withContrast(built, ctx.contrast, { theirs: bandOf(built.verdict) === 'plain' && !((built.verdict?.p ?? 1) < 0.75), kind: kcFor?.kind ?? base.kc?.kind })); // a repair whose builder had no place for it
    if (element && act === 'run_their_model') built.contrast = { itemId: null, from: 'element' }; // their version run on the page: a case shown
    if (!element && built.show?.kind === 'markdown' && !portion) { const el = pageElement(built, arc, slice, ctx); if (el) built.show = el; }
    built.arcAfter = arc;
    // A repair with no question of its own asks them to explain the case it showed ("why do the two differ?"): their answer is an
    // explanation of that item (E5, judged by the calibrated criteria), never dropped (decisive11b: "maybe it's 12?" went unrecorded).
    if (!built.item && !built.explains && built.ask && built.contrast?.itemId && (itemById(cm, built.contrast.itemId) || built.contrast.from === 'case')) built.explains = built.contrast.itemId; // a course case's own text is the reference
    if (act === 'summary' && !built.item && !built.explains && kcFor?.id) built.explains = kcFor.id; // their summary explains the KC: an E5, judged against its statement
    return finish(presupposeNothing(built, base), prev);
  }
  /**
   * Elements first (§15b, the user's ask after decisive12: 78% of course-model pages were markdown). A teaching move whose page
   * would be only its question board shows the KC's runnable representation instead, its task the card's question: a
   * prediction where it has a checkpoint, else a change to make and watch, else a build. The move family picks the mode
   * (probe, elicit, practice: predict; present, scaffold, repair: change), `bestFor` the moment, and an arc spans the kinds the
   * KC has before repeating one. Kept as markdown: a worked solution, a rule-8 side by side, a long question (it would be cut).
   */
  /**
   * A reading's frame through rule 9 (decisive13: "Read to find out why manual scaling can select the wrong element" told them
   * they hold it). The purpose in positive form, never naming a belief not sure for them; else "Read to answer this: <its first
   * fair prequestion>"; else the plain purpose to read for the idea. Prequestions that deny or name such a belief are dropped;
   * with none left, one from the purpose. The page's title is the same purpose.
   */
  function framed(portion, card, base) {
    // A belief is named by a word only it uses: its words beyond the KC's own (decisive13: "manual scaling"; "leading bit" is the topic).
    const kcWords = words([base.kc?.statement, base.slice?.explanation?.plain, base.slice?.explanation?.mechanism].filter(Boolean).join(' ')), mine = w => [...kcWords].some(x => x === w || (x.length >= 3 && sameWord(x, w)));
    const unsure = unsureBeliefs(card, base), own = unsure.map(b => [...words(b)].filter(w => w.length >= 4 && !mine(w)).join(' ')), names = t => [...words(t)].some(x => own.some(b => b.split(' ').some(y => y && sameWord(x, y))));
    const fair = t => { const x = String(t || '').trim(); return !!x && positive(x, [], unsure) === x && !names(x); };
    const pre = (portion.prequestions || []).filter(q => fair(q.prompt)), cut = positive(String(portion.purpose || ''), [], unsure).replace(/[.!?]+$/, ''), ownPurpose = cut.split(/\s+/).length >= 5 && !names(cut);
    const ask = q => (/[?]$/.test(q.trim()) ? q.trim() : `${q.trim().replace(/[.]+$/, '')}?`);
    const purpose = ownPurpose ? cut : pre[0] ? `Read to answer this: ${ask(pre[0].prompt)}` : 'Read it through for the idea at work here';
    const after = (portion.after || []).find(a => fair(a.prompt));
    const asked = !ownPurpose && pre[0] ? pre.slice(1) : pre.length ? pre : ownPurpose && /^read to find out (why|how|what|which|when|whether)\b/i.test(purpose) ? [{ prompt: `What's your guess: ${purpose.replace(/^read to find out /i, '')}?`, kind: 'predict', answerAnchor: null }] : !pre[0] && after ? [{ prompt: ask(after.prompt), kind: 'explain', answerAnchor: null }] : [];
    return { ...portion, purpose, prequestions: asked };
  }
  /** A spec the page will show (stage's checkElementSpec: valid, and not giving a predicted value away), else false. */
  const fair = spec => { try { checkElementSpec(spec); return true; } catch { return false; } };
  function pageElement(card, arc, slice, ctx) {
    if (['worked_example', 'worked_solution', 'refutation_read', 'after_reading'].includes(card.act) || card.contrast || !card.ask) return null;
    const move = ACT[card.act]?.move, item = card.item ? itemById(ctx.cm, card.item.id) : null, ask = item ? item.prompt : card.ask;
    if (!['probe', 'elicit', 'practice', 'present', 'scaffold', 'repair'].includes(move) || String(ask).length > 300) return null;
    const modes = ['probe', 'elicit', 'practice'].includes(move) ? ['predict', 'change', 'construct'] : ['change', 'construct'], moment = arc.repair ? 'repair' : ctx.moment, used = arc.repsUsed || [];
    for (const mode of modes) {
      const pick = chooseElement({ mode, moment, representations: slice?.representations, registry: REGISTRY, kind: ctx.kind, move, used }) ?? chooseElement({ mode, moment, representations: slice?.representations, registry: REGISTRY, kind: ctx.kind, move }); // a kind not yet used this arc, else any
      const el = pick && safe(() => elementFor(pick, { registry: REGISTRY, mode, ask: clip(ask, 300), moment, kc: arc.kc }), null);
      if (el?.spec && fair(el.spec)) { arc.repsUsed = [...new Set([...used, pick.id])]; return el.spec; }
    }
    const made = ctx.sessionId ? stateOf(S().peek(ctx.sessionId)).made?.[arc.kc] : null; // made ahead by stage's generator
    return made ? { ...made, task: { ...(made.task || {}), ask: clip(ask, 300) } } : null;
  }
  /**
   * Rule 8 on the page (the user's ask after decisive12): a repair that showed a computed contrast with no new case of its own
   * asks stage's generator (`elements.generate`, background, 20–60 s, cached per case) for a compare element on that case:
   * their rule run beside the true run, their side computing the belief's answer, the key checked. When it lands and the card
   * is still the one in play, the card's page becomes it (`card.updated`); else nothing (the cached result serves the next time).
   */
  function pageCompare(s, card) {
    const c = card.contrast, wmId = card.verdict?.wrongModel;
    if (ACT[card.act]?.move !== 'repair' || card.item || !c?.itemId || !['answer', 'model'].includes(c.from) || !wmId || String(wmId).startsWith('cand:') || !app.services.elements?.generate) return;
    const request = compareRequest(contextFor(s, card.target?.kc), wmId, c.itemId, c.mine);
    if (!request) return;
    jobs.enqueue({ scope: scopeOf(s), type: 'director_compare', idempotencyKey: `compare:${card.id}`, payload: { sessionId: s.id, cardId: card.id, request }, priority: 25 });
  }
  /** Stage's request for a repair compare on a case: their rule (its computed answer there) beside the true run, or null. */
  function compareRequest(base, wmId, itemId, theirs = null) {
    const it = itemById(base.cm, itemId), wm = base.wrongModel(wmId), key = it && literalOf(keyOf(it)?.value), mine = literalOf(theirs ?? predOf(it, wmId) ?? '');
    const pick = it && wm && base.kc && chooseElement({ mode: 'change', moment: 'repair', representations: (base.slice?.representations || []).filter(r => GENERATABLE.includes(r.kind)), registry: REGISTRY, kind: base.kind, move: 'repair' });
    return pick ? { kind: pick.kind, mode: 'change', kc: { id: base.kc.id, statement: clip(base.kc.statement, 600) }, case: { id: it.id, prompt: clip(it.prompt, 1200), key: key ?? null }, wrongModel: { id: wm.id, belief: clip(wm.belief, 400), ...(mine ? { answer: mine } : {}) } } : null;
  }
  /**
   * Elements made ahead (stage's generator; the coordinator's limits: the KC whose arc opens, never every KC; the elements lane
   * at its limit). A KC with no runnable representation gets one for its first item (`made[kc]`, used by `pageElement`); a wrong
   * model confirmed on it gets its repair compare on a case it computes (stage's cache serves the move later).
   */
  function pregen(s, kc) {
    if (!kc || !app.services.elements?.generate) return;
    jobs.enqueue({ scope: scopeOf(s), type: 'director_pregen', idempotencyKey: `pregen:${s.id}:${kc}`, payload: { sessionId: s.id, kc }, priority: 20 });
  }
  /**
   * The element kind that fits a KC with no representation of its own (decisive13: a diffusion KC got a timeline): the kinds its
   * topic's other KCs use (the course model's own choice for that material), most used first; else by the content's shape —
   * a true chronology (dates) → timeline, values in the statement → numberline, a claim to weigh (epistemic) → argmap. A kind
   * must support the mode and be generatable; a timeline never without dates. None fits: null (a reading or the board instead).
   */
  function fitKind(base, mode) {
    const ok = k => GENERATABLE.includes(k) && REGISTRY[k]?.modes.includes(mode), text = `${base.kc?.statement ?? ''} ${base.slice?.explanation?.plain ?? ''}`, dated = /\b(?:1[0-9]{3}|20[0-9]{2})s?\b|\bcentur(?:y|ies)\b/i.test(text);
    const n = {}; for (const k of (base.cm?.kcs || []).filter(k => k.topicId === base.kc?.topicId && k.id !== base.kc?.id)) for (const r of sliceOf(base.scope, k.id)?.representations || []) if (r.spec && ok(r.kind) && (r.kind !== 'timeline' || dated)) n[r.kind] = (n[r.kind] || 0) + 1;
    const sibling = Object.entries(n).sort((x, y) => y[1] - x[1])[0]?.[0];
    if (sibling) return sibling;
    return [dated && 'timeline', valuesOf(base.kc?.statement ?? '').size && 'numberline', base.kind === 'epistemic' && 'argmap'].find(k => k && ok(k)) ?? null;
  }
  jobs.register('director_pregen', async ({ sessionId, kc }) => {
    const s = S().peek(sessionId);
    if (!s) return { state: 'stale' };
    const base = contextFor(s, kc), gen = r => Promise.resolve().then(() => app.services.elements.generate(scopeOf(s), r)).catch(() => null), work = [];
    if (base.kc && !(base.slice?.representations || []).some(r => r.spec && REGISTRY[r.kind] && r.kind !== 'reading')) {
      const kind = fitKind(base, 'predict'), it = (base.slice?.problems || []).find(p => literalOf(keyOf(p)?.value));
      if (kind) work.push(gen({ kind, mode: 'predict', kc: { id: base.kc.id, statement: clip(base.kc.statement, 600) }, ...(it ? { case: { id: it.id, prompt: clip(it.prompt, 1200), key: literalOf(keyOf(it).value) } } : {}) }).then(r => { if (r?.spec) { const st = stateOf(S().peek(sessionId)); saveState({ ...st, made: { ...(st.made || {}), [kc]: r.spec } }); } }));
    }
    for (const o of (base.st?.operative || []).filter(o => o.status === 'confirmed')) { const it = (base.slice?.problems || []).find(p => predOf(p, o.wrongModelId)), r = it && compareRequest(base, o.wrongModelId, it.id); if (r) work.push(gen(r)); }
    await Promise.all(work);
    return { resultRefs: [] };
  }, { maxAttempts: 1 });
  jobs.register('director_compare', async ({ sessionId, cardId, request }) => {
    const s = S().peek(sessionId);
    if (!s) return { state: 'stale' };
    const r = await Promise.resolve().then(() => app.services.elements.generate(scopeOf(s), request)).catch(() => null), now = S().peek(sessionId), cur = now && getCard(scopeOf(now), stateOf(now).cardId);
    if (!r?.spec || !cur || cur.id !== cardId) return { resultRefs: [] };
    const grown = { ...cur, show: { ...r.spec, task: { ...(r.spec.task || {}), ask: cur.ask ?? r.spec.task?.ask } } }, out = pageCard(fullCard(grown));
    putCard(scopeOf(now), grown);
    S().emit(sessionId, 'card.updated', { cardId: cur.id, card: out, text: safe(() => agent.actorCard?.(out) ?? null, null) });
    return { resultRefs: [] };
  }, { maxAttempts: 1 });
  /** A canvas to draw on from memory (spec §15b): the KC's representation as the reference shown afterwards, its notice list as the rubric. */
  function canvasFor(slice, arc, moment) {
    const rep = (slice?.representations || []).find(r => r.notice?.length && ((r.spec && REGISTRY[r.kind] && r.kind !== 'canvas') || r.board?.diagramType));
    if (!rep) return null;
    const data = rep.board?.diagramData ? safe(() => JSON.parse(rep.board.diagramData), null) : null;
    const reference = rep.spec && REGISTRY[rep.kind] ? { kind: rep.kind, state: rep.spec } : data ? { kind: 'diagram', type: rep.board.diagramType, data } : null;
    return reference ? { spec: { kind: 'canvas', state: { frame: 'blank', boxes: [], reference }, task: { mode: 'draw', ask: 'Draw it from memory, and talk me through it as you go.', rubric: rep.notice.slice(0, 6) }, moment, concepts: [arc.kc] }, truth: null } : null;
  }
  /** The wrong model's answer as the classmate's attempt on an item's element (its one predicted name), or null. */
  function attemptOf(item, wm) { const el = elementFor(item.element, { registry: REGISTRY, mode: 'predict', ask: '', kc: item.kc }), names = el?.spec?.task?.checkpoints?.[0]?.predict, a = item.wrongAnswers?.[wm.id]; return names?.length === 1 && a != null ? { [names[0]]: a } : null; }
  /** Their own answer as a prediction on the item's element: the engine's name whose value is the item's verified answer. */
  function predictionOf(item, answer) {
    const truth = elementFor(item.element, { registry: REGISTRY, mode: 'predict', ask: '', kc: item.kc })?.truth;
    const name = truth && Object.keys(truth).find(n => [...valuesOf(truth[n])].some(v => valuesOf(item.answer).has(v))), said = [...valuesOf(answer)][0];
    return name && said != null ? { [name]: said } : null;
  }
  /** The separating question's item (understanding.separatingProbe over the open hypotheses), or null. */
  /**
   * Rule 8 (close the contrast): what a belief gives against what is true, computed. Their own answer to the case they just
   * answered, against its key (or an element's truth); else, for a catalogued model, its predicted answer on one of the KC's
   * items (the course model's runnable model), against that item's key. null when there is nothing to compute.
   */
  /**
   * Why the truth holds, said positively (§13 rule 9): the key's own reason, else the explanation's first sentences, each in
   * positive form, never a denial of a model ("…; it does not negate the remaining digits" → "…a negative place value").
   */
  // A sentence with numbers the case doesn't have is another case's worked example ("1001 selects −8 and +1"): never the reason.
  const reasonOf = (keyWhy, ex, caseText = '') => {
    const own = valuesOf(caseText), fits = x => x.split(/\s+/).length >= 4 && numbersOf(x).every(forms => forms.some(f => own.has(f)));
    for (const t of [keyWhy, ex?.plain, ex?.precise, ex?.mechanism]) for (const x of sentencesOf(positive(String(t || '')))) { const y = x.replace(/[.!?]+$/, ''); if (fits(y)) return atWord(y, 170); }
    return null;
  };
  /** Their words said back to them (§13 rule 9): their claim without its hedges and reasons, first person turned to second. */
  const YOU = { i: 'you', "i'm": "you're", "i've": "you've", "i'd": "you'd", "i'll": "you'll", me: 'you', my: 'your', mine: 'yours', myself: 'yourself' };
  function revoiceOf(text) {
    const raw = String(text ?? '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().replace(/^(?:(?:so|well|um+|uh+|ok(?:ay)?|yeah|hmm+|honestly|basically|like|still|i still (?:think|believe|say)|i (?:think|thought|guess|believe|mean|feel like)|i'?d say|i would say|(?:i'?m |i am )?(?:pretty |quite |fairly )?sure(?: that)?|maybe|probably)[\s,]+)+/i, '');
    const t = raw.split(/,?\s+(?:because|since)\s+|;\s/i)[0].replace(/[.!?…]+$/, ''); // their claim, without their reason
    if (!t) return null;
    const out = atWord(t.replace(/[’']/g, "'").replace(/\b(?:i'm|i've|i'd|i'll|i|me|my|mine|myself)\b/gi, w => YOU[w.toLowerCase()] ?? w), 170).replace(/[.!?…]+$/, '');
    return out.split(/\s+/).length >= 3 ? out.charAt(0).toLowerCase() + out.slice(1) : null;
  }
  /** The case a card puts on the page, as text: its item's prompt, else its element's spec. */
  const caseTextOf = (cm, card) => (card?.item && cm ? itemById(cm, card.item.id)?.prompt ?? '' : card?.show ? JSON.stringify(card.show) : '');
  /**
   * Whether a line answers the case on the page, not one of its own (decisive3 L2: "like for 101101 it's -13" on a card showing
   * 1001). A short value line answers it; a longer one only if at most one of its numbers is foreign to the case (their result).
   * A line with no number answers a case only when that case's key is not a value.
   */
  function answersCase(text, cm, card) {
    const t = String(text ?? ''), nums = numbersOf(t), known = valuesOf(caseTextOf(cm, card)), foreign = nums.filter(forms => !forms.some(f => known.has(f)));
    if (!nums.length) { const it = card?.item && cm ? itemById(cm, card.item.id) : null; return !!it && !valuesOf(keyOf(it)?.value ?? '').size; }
    return t.split(/\s+/).length <= 6 || foreign.length <= 1;
  }
  /**
   * Rule 8 (close the contrast): the belief's result against what is true, computed and on one case.
   * - They answered the case on the page by the belief: that case. Their own answer (its foreign number for a value) against its
   *   key, or the element's truth; else that same item's predicted answer for the belief. Never another case's numbers.
   * - They stated the belief, or answered a case of their own: another item's predicted answer, said and shown as a new case,
   *   each item at most once an arc (a contrast is never repeated). null when there is nothing to compute.
   */
  /**
   * The course's full reason, in positive form (§13 rules 8 and 9): the explanation's sentences that survive the filter, up to
   * about 40 words, skipping any already said this session; null when nothing new is left.
   */
  function fullReason(ex, kc, heard = () => false) {
    const out = [];
    for (const t of [ex?.plain, ex?.mechanism, ex?.precise, kc?.kind !== 'procedure' ? kc?.statement : null]) for (const x of sentencesOf(positive(String(t || '')))) {
      const y = x.trim().replace(/[.!?]+$/, '');
      if (y.split(/\s+/).length < 4 || numbersOf(y).length || heard(`${y}.`) || heard(`As I see it: ${y}.`) || heard(`What actually holds: ${y}.`) || out.some(o => o === y)) continue; // a general reason: no case's numbers (decisive3: never another case's)
      if (out.length >= 2 || [...out, y].join(' ').split(/\s+/).length > 42) return out.length ? out.join('. ') : y;
      out.push(y);
    }
    return out.length ? out.join('. ') : null;
  }
  /** A right answer whose reason matched a wrong model or a claim (decisive8): the verdict stays, the reason is met. */
  const rightReason = verdict => !!verdict?.reason && ['correct', 'valid_nonstandard'].includes(verdict?.value);
  function contrastFor(base, arc, wm, prev, verdict, heard = () => false) {
    const said = arc.lastAnswer, cm = base.cm, it = prev?.item ? itemById(cm, prev.item.id) : null;
    // Their reply to "How does your idea fit that?" is the belief applied to a real case (decisive11b): their words against the
    // course's own account of that case (its outcome, then the reason), shown again, then a new case. Nothing generated.
    if (verdict?.caseReply && prev?.contrast?.from === 'case') {
      const c = base.sessionId ? caseOf({ id: base.sessionId }, prev.contrast.itemId) : null, account = (c && outcomeOf(c.text)) || prev.contrast.truth, mine = theirsOf(said);
      return mine && account ? { mine, truth: account, why: fullReason(base.slice?.explanation, base.kc, heard), itemId: prev.contrast.itemId, from: 'account', prompt: prev.contrast.prompt ?? null } : null;
    }
    // A belief said in a sentence (decisive9), or a right answer's wrong reason (decisive8): for a model with computed cases, a
    // computed case (this one, said as this case: what their rule gives here); else a course case paired by the judge; else their
    // words (the reason, never the answer they got right) against the course's full reason, the new case to follow on the card.
    const right = rightReason(verdict), theirs = right ? reasonPartOf(said, verdict.confirm) ?? wm.belief : verdict?.confirmedClaim ? wm.belief : theirsOf(said); // their words: the reason, the claim they confirmed, or their line
    if (right || (verdict?.utterance === 'belief' && (String(said ?? '').split(/\s+/).length > 6 || verdict?.confirmedClaim))) {
      const computed = modelContrast(base, arc, wm, k => reasonOf(k?.why, base.slice?.explanation, k?.value ?? ''), it);
      if (computed) return computed; // a computed case: the one on the page (said as this case), else another (said as new)
      // A case from the course the belief gets wrong, paired by the calibrated judge (decisive10): its outcome, the course's words.
      const pair = base.sessionId ? (stateOf(S().peek(base.sessionId)).pairs || {})[wm.id] : null;
      // Both sides (decisive11b): their words, then the case's own sentence (quoted verbatim), asked about: no calibrated criterion
      // verifies that a sentence contradicts a belief, so nothing is asserted about it.
      const caseText = learnerText(pair?.text);
      if (pair?.caseId && pair.quote && theirs && !(arc.contrasted || []).includes(pair.caseId)) return { mine: theirs, truth: pair.quote, prompt: caseText, why: null, itemId: pair.caseId, from: 'case' }; // never its title: a tutor-facing label, often the misconception it targets
      const onPage = it ?? itemById(cm, arc.help?.itemId), pageKey = onPage && !(arc.contrasted || []).includes(onPage.id) ? keyOf(onPage) : null, statement = pageKey && !valuesOf(pageKey.value).size && pageKey.value.split(/\s+/).length > 6 ? positive(pageKey.value) : null;
      const mine = theirs, truth = statement && !heard(`As I see it: ${statement}.`) ? statement : fullReason(base.slice?.explanation, base.kc, heard);
      return mine && truth ? { mine, truth, why: null, itemId: truth === statement ? onPage.id : null, from: 'said', same: truth === statement, prompt: truth === statement ? clip(onPage.prompt, 600) : null } : null;
    }
    const key = it ? keyOf(it) : prev?.withheld?.answer && prev?.show?.task ? { value: atWord(prev.withheld.answer, 120), why: null } : null;
    const why = k => reasonOf(k?.why, base.slice?.explanation, `${it?.prompt ?? caseTextOf(cm, prev)} ${k?.value ?? ''}`); // the key's true reason, in positive form, on this case (rule 9)
    // A belief said in a sentence is no answer to the case, whatever number it mentions ("the leading 1 just makes it negative").
    const attempt = verdict?.utterance !== 'belief' || String(said ?? '').split(/\s+/).length <= 6;
    const onCase = prev && said && attempt && answersCase(said, cm, prev) && ['wrong_model', 'incorrect'].concat(verdict?.utterance === 'belief' ? [null] : []).includes(verdict?.value ?? null);
    if (onCase) {
      if (!key || (it && literalOf(it.answer) && occurs(said, literalOf(it.answer))) || (it && (arc.contrasted || []).includes(it.id))) return null; // its contrast was shown: never again
      const known = valuesOf(caseTextOf(cm, prev)), foreign = numbersOf(said).filter(forms => !forms.some(f => known.has(f))).map(forms => forms[0]);
      const value = valuesOf(key.value).size > 0, short = String(said).split(/\s+/).length <= 6;
      // Their number must be a value of the same kind as the key's (an address against an address, not a byte count): within 100×.
      const num = x => Number(numbersOf(x)[0]?.at(-1)), near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(Math.log10(Math.abs(a) + 1) - Math.log10(Math.abs(b) + 1)) <= 2;
      const pickd = value ? (foreign.length === 1 && !short ? foreign[0] : short ? theirsOf(said) : null) : theirsOf(said);
      const mine = value && pickd && !near(num(pickd), num(key.value)) ? null : pickd;
      if (mine) return { mine, truth: key.value, why: why(key), itemId: it?.id ?? null, from: 'answer', same: true, prompt: it ? clip(it.prompt, 600) : null };
      const pred = predOf(it, wm.id); // their result unreadable: this item's own prediction for the belief
      return pred ? { mine: predictedOf(pred), truth: key.value, why: why(key), itemId: it.id, from: 'model', same: true, prompt: clip(it.prompt, 600) } : null;
    }
    return modelContrast(base, arc, wm, why, it);
  }
  // A model's predicted answer as its result only: never the reasoning it comes with ("…, because the Code restored slave status"),
  // which would be said as theirs (rule 9, decisive13).
  const predictedOf = pred => { const x = sentencesOf(String(pred).replace(/\s+/g, ' ').trim())[0] ?? ''; return (x.length > 170 ? `${atWord(x, 170)}…` : x).split(/\s*;\s*|,?\s+(?:because|since|as|so that|given that)\s+/i)[0].replace(/[.!?,]+$/, ''); };
  /** The course model's prediction for a catalogued belief on an item (its pattern's predicted answer), against that item's key. */
  /** A model's computed answer on an item: its pattern's predicted answer, or its executable rule's answer. */
  const predOf = (it, id) => it?.predictedWrongAnswers?.[id] ?? it?.wrongAnswers?.[id] ?? null;
  /**
   * A case that separates candidates (rule 8's fresh case, decisive4): the lead candidate computes an answer other than the key
   * there, and every rival that computes one there computes another. null when no such unused case exists.
   */
  function separatingFor(base, arc, ids, shown = () => false) {
    if (!ids?.length) return null;
    const n = x => String(x ?? '').toLowerCase().replace(/\s+/g, ' ').trim(), kcs = new Set(ids.map(id => base.wrongModel?.(id)?.kc).filter(Boolean));
    const pool = [...(base.slice?.problems || []), ...(base.cm?.problems || []).filter(p => kcs.has(p.kc))];
    return pool.find(it => { const lead = predOf(it, ids[0]); if (!lead || arc.used.includes(it.id) || shown(it) || n(lead) === n(keyOf(it)?.value ?? it.answer)) return false; return ids.slice(1).every(id => !predOf(it, id) || n(predOf(it, id)) !== n(lead)); }) ?? null;
  }
  function modelContrast(base, arc, wm, why, current = null, recall = false) {
    if (wm.candidate || String(wm.id || '').startsWith('cand:')) return null;
    const done = new Set(arc.contrasted || []), q = t => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim(), asked = new Set([...done, ...(arc.used || [])].map(id => q(itemById(base.cm, id)?.prompt)).filter(Boolean));
    const predicts = p => predOf(p, wm.id) && keyOf(p) && !done.has(p.id) && (recall || p === current || !asked.has(q(p.prompt))); // a case already shown under another id (a probe repeating an item) is no new case; a recall is of one shown
    const pick = current && predicts(current) ? current : [...(base.slice?.problems || []), ...(base.cm?.problems || []).filter(p => p.kc === wm.kc)].find(predicts);
    if (!pick) return null;
    const k = keyOf(pick);
    return { mine: predictedOf(predOf(pick, wm.id)), recall, truth: k.value, why: reasonOf(k.why, pick.kc === base.kc?.id ? base.slice?.explanation : (base.cm?.explanations || []).find(e => e.kc === pick.kc), `${pick.prompt} ${k.value}`), itemId: pick.id, from: 'model', same: pick === current, prompt: clip(pick.prompt, 600) };
  }
  function separating(arc, base, wm, hypotheses = null) {
    const hs = [...new Set(hypotheses?.length ? hypotheses : (base.st?.operative || []).filter(o => o.p >= 0.2).map(o => o.wrongModelId).concat(wm ? [wm.id] : []))];
    if (!hs.length) return null;
    const item = itemById(base.cm, safe(() => U().separatingProbe(base.scope, { kc: arc.kc, hypotheses: hs }), null)?.probeId);
    return item && !arc.used.includes(item.id) ? item : null;
  }
  const fallbackTarget = (s, goal) => ({ kc: null, topicId: goal?.topicIds?.[0] ?? null, statement: goal?.title || 'this part of the course' });

  /** A card checked: a leaking line cut back and checked again; an empty one given the safe parts; other problems logged. */
  /**
   * §13 rule 5 applied to content: course-model text keeps a "not Y" / "rather than Y" contrast only when the wrong model behind
   * Y is suspected or confirmed for this learner (or is the one this card repairs); else the clause is cut. Every course-model
   * card passes through here (cardFor, the safe move): its voice fields and its page.
   */
  /**
   * §13 rule 9 for every course-model card (cardFor, the safe move, revisions): deny nothing they haven't shown. Every negated
   * clause goes, in the voice fields and on the page, except protected text: the question on the page (its item's prompt),
   * the case and key a contrast shows, the learner's own words revoiced, and an opener the builder made for a sure model
   * (`card.keepText`). The verdict leads ("Not yet.") are no denial of a belief and stay.
   */
  /**
   * The beliefs in play that aren't sure for this learner (rule 9, decisive11b): "without Y" naming one presupposes it. The KC's
   * wrong models, unless confirmed or the one this card repairs as sure, and their own claims this session, unless that one.
   */
  function unsureBeliefs(card, base) {
    const v = card.verdict, sure = new Set([...(base?.st?.operative || []).filter(o => o.status === 'confirmed').map(o => o.wrongModelId), ...(v?.wrongModel && !v.suspected && !(v.p < 0.75) ? [v.wrongModel] : [])]);
    const claims = base?.sessionId ? stateOf(S().peek(base.sessionId)).claimWords || {} : {}, kc = base?.kc?.id;
    return [...(base?.slice?.wrongModels || []).filter(w => !sure.has(w.id)).map(w => `${w.belief} ${(w.markers || []).join(' ')}`), ...Object.entries(claims).filter(([id]) => kc && id.startsWith(`cand:${kc}:`) && !sure.has(id)).map(([, c]) => c)];
  }
  function presupposeNothing(card, base) {
    const it = card.item ? itemById(base?.cm, card.item.id) : null;
    const protect = [it?.prompt, it?.answer, card.contrast?.truth, card.contrast?.mine, card.contrast?.from === 'case' ? null : card.contrast?.prompt, card.revoice, ...(card.keepText || [])].filter(Boolean).map(String); // a course case's setup is filtered like any course text
    const unsure = unsureBeliefs(card, base), f = t => (typeof t === 'string' && t ? positive(t, protect, unsure) : t), show = card.show;
    return { ...card, say: f(card.say), ask: f(card.ask) || card.ask, handBack: f(card.handBack) || card.handBack, expect: (card.expect || []).map(b => ({ ...b, reply: f(b.reply) })),
      show: !show ? show : show.kind === 'markdown' || typeof show.content === 'string' ? { ...show, content: f(show.content), title: f(show.title) } : show.task?.ask ? { ...show, task: { ...show.task, ask: f(show.task.ask) || show.task.ask } } : show };
  }
  /** Rule 7 kept (§13): plain verdict words out of a say whose verdict is trusted below PLAIN_TRUST, and out of the neutral line. */
  const keepRule7 = c => ({ ...c, say: plainVerdict(c.say) && !(c.verdict?.trust >= PLAIN_TRUST) ? withoutPlainVerdict(c.say) : c.say, neutral: plainVerdict(c.neutral) ? withoutPlainVerdict(c.neutral) || 'Say a bit more.' : c.neutral });
  /** A verdict's trust for the card (rule 7): the verifier's or the page's; for a stated belief, how sure its match is. */
  // A verdict with no source of trust (a branch the reading picked on a card with no item) is no verdict: 0, never unknown, since
  // the voice reads a missing trust as exact.
  const VERDICT_VALUES = new Set(['correct', 'valid_nonstandard', 'partial', 'slip', 'wrong_model', 'missing_piece', 'incorrect']);
  /**
   * A value answer that is a wrong model's computed answer on this item: its pattern's predicted answer, by the values the prompt
   * doesn't already give ("1003" against "a + 3 gives address 1003", the key giving 1012). The course model's runnable model, matched.
   */
  function computedHit(item, text) {
    const said = valuesOf(text), given = valuesOf(item?.prompt ?? ''), own = t => [...valuesOf(String(t ?? '').split(/\s*;\s*/)[0])].filter(x => !given.has(x));
    if (!item || !said.size) return null;
    const key = own(item.key?.value ?? item.answer);
    if (!key.length || key.some(x => said.has(x))) return null; // the key's own values said, or a key with none: not a computed miss
    const hits = Object.entries(item.predictedWrongAnswers || {}).filter(([, a]) => { const want = own(a); return want.length && want.every(x => said.has(x)); }).map(([w]) => w);
    return hits.length ? hits.map(id => ({ id, p: hits.length > 1 ? 0.5 : 0.75 })) : null; // two models giving the same answer: told apart first (the separating question)
  }
  /** A specific confirmation for a right answer: the item's key when it is a short value ("Yes, 1012."), else none. */
  const confirmOf = (scope, card) => { const it = card?.item ? itemById(cmOf(scope), card.item.id) : null, v = it ? keyOf(it)?.value : card?.expect?.find(b => b.kind === 'correct' && b.literal)?.literal; return v && String(v).split(/\s+/).length <= 6 ? v : null; }; // an element's: its correct literal
  /** Rule 8: a line that answered a checkable case (an item, or an element's prediction) by a wrong model. */
  const answeredOf = (s, card, v, text) => (card?.item || v?.element) && !v?.question && (v?.value === 'wrong_model' || v?.stated) && v?.wrongModelHits?.length && answersCase(text, cmOf(scopeOf(s)), card) ? { cardId: card.id } : null;
  const trustOf = v => typeof v?.trust === 'number' ? v.trust : v?.stated || v?.detector ? v.wrongModelHits?.[0]?.p ?? 0 : VERDICT_VALUES.has(v?.value) ? 0 : null;
  /** How sure the match to the wrong model a card repairs is (its hit's p), for saying the belief is theirs only when sure. */
  const pOf = (v, id) => { const hits = v?.wrongModelHits || []; return (id ? hits.find(h => h.id === id) : hits[0])?.p ?? hits[0]?.p ?? null; };
  /** The point a verifier found wrong, for a hedged verdict's check ("for s4"): the first wrong part's label, never its value. */
  function pointOf(s, card, checked) {
    const parts = [...(checked?.provenance?.chain || [])].reverse().find(x => Array.isArray(x.parts))?.parts, i = parts ? parts.indexOf('incorrect') : -1;
    if (i < 0 || parts.length < 2) return null;
    const keys = String(itemById(cmOf(scopeOf(s)), card.item?.id)?.answer ?? '').split(/\s*;\s*/);
    return (keys.length === parts.length ? /^\s*([A-Za-z_$][\w$]*(?:\[\w+\])?)\s*=/.exec(keys[i])?.[1] : null) ?? `part ${i + 1}`;
  }
  function finish(card, prev) {
    let { card: c, problems } = checkCard(keepRule7(card));
    if (problems.some(p => /gives away the answer/.test(p))) {
      const low = t => String(t || '').toLowerCase().replace(/[−–]/g, '-'), secrets = problems.map(p => /gives away the answer "(.+)" below H3/.exec(p)?.[1]).filter(Boolean).map(low);
      const cut = t => (String(t || '').match(/[^.!?]+[.!?]*/g) || []).filter(x => !secrets.some(sec => low(x).includes(sec))).join(' ').replace(/\s+/g, ' ').trim();
      c = { ...c, say: cut(c.say), expect: c.expect.map(b => ['correct', 'valid_nonstandard'].includes(b.kind) ? b : { ...b, reply: b.kind === 'wrong_model' ? 'Not quite.' : cut(b.reply) || 'Take another look.', then: { ...b.then, ask: null } }) };
      ({ card: c, problems } = checkCard(c));
    }
    if (!c.say && !c.ask) ({ card: c, problems } = checkCard({ ...c, ...safeParts(prev) }));
    if (problems.length) console.warn(`[engine] card ${c.act}: ${problems.slice(0, 3).join('; ')}`);
    return { ...c, problems };
  }
  /** The safe parts of a card with nothing else to say: a question that keeps them working; never a verdict, never the neutral line again. */
  const safeParts = prev => ({ say: '', ask: prev?.item ? "What's the first thing you'd work out?" : prev?.handBack || 'Tell me how you would start.', neutral: 'Go on.', handBack: 'Tell me how you would start.' });
  /**
   * A reading from the notes on what they just said (no course model, no model call): a teaching move, never a second
   * draw-out (§13 rule 1). null when the notes have nothing on it.
   */
  function notesCard(s, prev, answer, why) {
    const scope = scopeOf(s), goal = goalOf(s, prev?.goalId) ?? currentGoal(s.agenda);
    const found = safe(() => K().retrieve(scope, s.pinnedKnowledgeManifestId, { topicIds: goal?.topicIds || [], objectiveVersionIds: [], anchorIds: [], query: `${goal?.title || ''} ${answer || ''}`, relationTypes: [], reason: 'safe move', maxTokens: 1200 }).excerpts[0], null);
    if (!found) return null;
    const show = { kind: 'notes', query: goal?.title ?? '', quote: clip(found.text, 600), lecture: safe(() => K().sourceTitle(scope, found.sourceVersionId), null) };
    const card = { move: 'read', act: 'read', helpLevel: prev?.helpLevel ?? 0, target: prev?.target ?? fallbackTarget(s, goal), intention: 'Teach from their notes while the next move is made (never a second draw-out)', verdict: null, wait: 'reasoning', show, say: "Here's what your notes say on that.", ask: 'Read it through: what does it say, in a sentence?', neutral: 'Take your time.', handBack: 'In a sentence: what does it say?', expect: [], persona: null, withheld: {}, item: null, why, source: 'fallback', goalId: prev?.goalId ?? goal?.id ?? null, goalTitle: prev?.goalTitle ?? goal?.title ?? null, arcAfter: null };
    const c = checkCard(card);
    return c.problems.length ? null : c.card;
  }
  /**
   * The safe move (spec §18b) when the next one can't be made in time: never the neutral line again (it was said while the
   * move was made; §13 rule 1). With a course model, one hint from the KC; without, a reading from the notes; else a question.
   */
  function safeCard(s, prev, why, answer = null) {
    if (!prev?.target?.kc) { const notes = notesCard(s, prev, answer, why); if (notes) return { ...notes, problems: [] }; }
    const hint = prev?.target?.kc && prev.target.statement ? { say: `Think about this: ${atWord(prev.target.statement, 200).replace(/[.!?]*$/, '.')}`, ask: prev.item ? 'With that in mind, what do you get?' : 'With that in mind, how would you put it?', neutral: 'Go on.', handBack: 'Your turn.' } : null;
    const card = { move: 'scaffold', act: hint ? 'general_hint' : 'pump', helpLevel: hint ? Math.max(1, prev?.helpLevel ?? 0) : prev?.helpLevel ?? 0, target: prev?.target ?? fallbackTarget(s, currentGoal(s.agenda)), intention: 'A safe move while the next one could not be made', verdict: null, wait: 'work', show: prev?.show ?? null, expect: [], persona: null, withheld: prev?.withheld ?? {}, item: prev?.item ?? null, why, ...safeParts(prev), ...(hint || {}), goalId: prev?.goalId ?? currentGoal(s.agenda)?.id ?? null, goalTitle: prev?.goalTitle ?? null, source: 'safe', arcAfter: prev?.arcAfter ?? stateOf(s).arc ?? null };
    return { ...finish(prev?.target?.kc ? presupposeNothing(card, contextFor(s, prev.target.kc)) : card, prev), problems: [] };
  }

  // ---------- opening a goal: intro cards, the cold start, or an arc on its KC ----------
  /** The arc of the newest earlier session on this KC, if it was left unfinished: a session resumes where the last stopped. */
  function priorArc(s, kcIds) {
    const rows = db.find('director_state', {}, { scope: scopeOf(s) }).filter(r => r.id !== s.id && r.arc?.kc && !r.arc.done);
    const last = rows.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0]?.arc ?? null;
    return last && kcIds.includes(last.kc) ? last : null; // only the newest session's open arc, when this goal covers its KC
  }
  /** Card 1 of a goal: the intro's cards; else an arc on its target KC (resumed when left open), stated with its reason; else the notes fallback. */
  // ---------- guide mode (docs/teaching-guide-spec.md, 12 Oct): new material from a section guide, the tutor choosing how ----------
  /** New material is taught from a guide; practice, review and exam problems (asked for) keep the arc engine. */
  function guideMode(s, goal) {
    if (!goal?.topicIds?.length || goal.kcIds?.length) return false;
    const kind = stateOf(s).askedKind ?? null;
    return !['exam_practice', 'consolidate', 'repair', 'problem_help'].includes(kind) && !['exam', 'practice'].includes(goal.mode);
  }
  /** A section's guide, built in code from its course-model slice (or its notes): the full guide, answers included (director only). */
  function guideFor(s, topicId, { practice = false } = {}) {
    const scope = scopeOf(s), km = s.pinnedKnowledgeManifestId, view = K().view(scope, km), topic = view.topics.find(t => t.topicId === topicId);
    if (!topic) return null;
    const row = db.get('studies', `std_${topicId}`, scope), slice = row?.kcs?.length ? row : null;
    // The section's own passages (its evidence links, defining ones first), never a search: a search for "Switches" found the
    // course overview, and the guide opened on it (12 Oct).
    const RANK = { defines: 0, explains: 1, assesses: 2, exemplifies: 3 };
    const anchors = [...new Set((view.evidenceLinks || []).filter(l => l.topicId === topicId).sort((a, b) => (RANK[a.relation] ?? 9) - (RANK[b.relation] ?? 9)).map(l => l.sourceAnchorId))];
    const passages = safe(() => K().passages(scope, km, anchors, { maxTokens: 4000 }), []).map(p => ({ lecture: p.lecture, section: p.section, text: p.blocks.map(b => b.text).join('\n\n'), anchorId: p.blocks[0]?.anchorId ?? null }));
    const lecture = passages[0]?.lecture ?? null, parent = topic.parentTopicId ? view.topics.find(t => t.topicId === topic.parentTopicId)?.title ?? null : null;
    const { prev, next } = safe(() => S().neighbours(scope, view, topicId), { prev: null, next: null });
    const readingOf = id => { const r = slice?.readings?.find(x => x.id === id); const portion = r && safe(() => U().reading(scope, { kc: `${topicId}:${r.kcs?.[0]}`, level: r.level || 'intro' }), null); return portion ? { kind: 'reading', portion, highlight: portion.keyAnchors || [] } : null; };
    return buildGuide({ topic: { topicId, title: topic.title, lecture, parentTitle: parent }, slice, passages, prev, next, readingOf, crunch: crunchOf(scope), practice });
  }
  /** What the voice should know about the learner in every guide: their exam and date, where they said they are, their own words. */
  function learnerOf(s) {
    const scope = scopeOf(s), exam = db.get('exams', scope.examId), at = exam?.examDate ? new Date(exam.examDate) : null;
    const said = safe(() => S().student(scope)?.said || [], []).map(x => x.words).filter(Boolean).slice(-6);
    const lecture = exam?.introSkipped && exam.lectureFrom === 'start' ? null // set for the walk when the intro was skipped: they never said it (13 Oct: "you're starting from the beginning")
      : exam?.lectureFrom && exam.lectureFrom !== 'start' ? safe(() => K().view(scope, s.pinnedKnowledgeManifestId).topics.find(t => t.topicId === exam.lectureFrom)?.title, null) : exam?.lectureFrom === 'start' ? 'starting from the beginning' : null;
    return { exam: exam?.title ?? null, examDate: at && !Number.isNaN(at.getTime()) ? at.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : null, lecture, said };
  }
  /** The guide card for a goal's section: the voice's resource for it (never a move); the full guide kept in state. */
  /**
   * Practice leads with the question bank's exam-style problems on the section (12 Oct quick runs: the course model's own
   * problems are research-style constructions, some open-ended, which the key-based checker misjudged). Each is a board and a
   * question checked by the calibrated judge against its worked answer.
   */
  function withBank(s, g) {
    // The section's own problems, then its unit's (exam problems are filed under the unit).
    const scope = scopeOf(s), view = safe(() => K().view(scope, s.pinnedKnowledgeManifestId), null), unit = view && safe(() => unitOf(view, g.topicId), null);
    const near = new Set([g.topicId, ...(unit ? safe(() => expandTopics(view, [unit]), []) : []), ...(unit ? [unit] : [])]), rank = q => q.topicId === g.topicId ? 0 : 1;
    const bank = safe(() => db.find('question_records', {}, { scope }).filter(q => near.has(q.topicId) && q.state === 'ready' && (q.prompt || q.setup) && q.expectedAnswer), []).sort((a, b) => rank(a) - rank(b));
    const ex = q => (q.format === 'exam' ? 0 : 1) + (q.intendedDifficulty === 'basic_diagnostic' ? 2 : 0);
    const added = bank.sort((a, b) => ex(a) - ex(b)).slice(0, 8).map((q, i) => {
      const id = `qb${i + 1}`, boardId = `b${g.boards.length + i + 1}`, choices = (q.choices || []).map((c, k) => `${String.fromCharCode(65 + k)}. ${c.text ?? c.label ?? c}`).join('\n');
      // An exam problem goes up whole, every part with its place to answer (the page's exam board); a short one as text.
      const { show } = q.format === 'exam' && q.parts?.length
        ? checkShow({ kind: 'question', questionId: q.id, question: { questionId: q.id, format: 'exam', title: q.title || 'Exam problem', setup: q.setup || q.prompt, parts: q.parts.map(({ id, prompt, points, answer }) => ({ id, prompt, points, answer })), voiceForm: q.voiceForm || '' } })
        : checkShow({ kind: 'markdown', title: q.format === 'exam' ? 'Exam problem' : 'Practice problem', content: cut(`${q.prompt}${choices ? `\n\n${choices}` : ''}`, 1390) });
      const first = sentencesOf(q.voiceForm || q.prompt)[0] || '', spoken = (q.voiceForm || '').length <= 170 && q.voiceForm ? q.voiceForm : `${atWord(first, 150)} It's on the page.`;
      return show && { board: { id: boardId, label: `${q.format === 'exam' ? 'Exam problem' : 'Practice problem'} ${i + 1}`, use: 'question', show, ideaId: null, questionId: id },
        question: { id, ideaId: null, kc: null, itemId: null, bank: q.id, prompt: q.prompt, spoken, boardId, answer: typeof q.expectedAnswer === 'string' ? q.expectedAnswer : JSON.stringify(q.expectedAnswer), mistakes: [], kind: 'practice', level: q.format === 'exam' ? 'exam' : q.intendedDifficulty === 'transfer' ? 'beyond' : 'core' } };
    }).filter(Boolean);
    return { ...g, boards: [...g.boards, ...added.map(x => x.board)], questions: [...added.map(x => x.question), ...g.questions] };
  }
  /** A problem from their own files (a practice prelim, a pset: module items with official solutions), as a board: whole, a long one as a reading. */
  function ownBoard(item) {
    const md = String(item.markdown || '').trim();
    if (md.length <= 1390) return checkShow({ kind: 'markdown', title: item.title || 'Practice problem', content: md }).show;
    // Blocks in the page's shape: a paragraph or heading with its sentences, each anchored (13 Oct: without them a long problem never rendered).
    const blocks = md.split(/\n{2,}/).map(t => t.trim()).filter(Boolean).map((t, k) => ({ anchor: `p${k + 1}`, text: t.replace(/^#+\s*/, ''), kind: /^#{1,6}\s/.test(t) ? 'heading' : /^```/.test(t) ? 'code' : /^\$\$/.test(t) ? 'math' : /^\|.*\|/m.test(t) ? 'table' : 'para' }))
      .map(b => b.kind === 'code' ? { ...b, text: b.text.replace(/^```\w*\n?|```$/g, ''), sentences: [] }
        : ['para', 'heading'].includes(b.kind) ? { ...b, sentences: (b.kind === 'heading' ? [b.text] : sentencesOf(b.text)).map((text, i) => ({ anchor: `${b.anchor}.s${i + 1}`, text })) } : { ...b, sentences: [] });
    return checkShow({ kind: 'reading', portion: { id: `own:${item.id}`, purpose: item.title || 'Practice problem', body: blocks.slice(0, 120), keyAnchors: [] }, highlight: [] }).show;
  }
  /** Their own problems with solutions on these topics (module items filed from their files), most relevant first. */
  function ownProblems(s, topicIds, words = null) {
    // Never one whose text already carries its answer (filed from a solutions PDF: 13 Oct, "0xFE8 = decimal -24" filled in).
    const leaks = i => String(i.solution).split('\n').map(l => l.replace(/[`*$\s]+/g, ' ').trim()).filter(l => l.length >= 14 && /\d/.test(l)).slice(0, 4).some(l => String(i.markdown).replace(/[`*$\s]+/g, ' ').includes(l));
    const scope = scopeOf(s), want = new Set(topicIds), items = safe(() => db.find('module_items', {}, { scope }), []).filter(i => i.kind === 'problem' && i.solution && i.markdown && !leaks(i) && (!want.size || want.has(String(i.moduleId).replace(/^mod_/, ''))));
    if (!words?.size) return items;
    const text = i => `${i.title} ${i.markdown}`.toLowerCase();
    return items.filter(i => [...words].every(w => text(i).includes(w))); // every word of the kind they asked for (12 Oct: "addition overflow" got a C-tracing problem that only said "overflow")
  }
  const ownQuestion = (item, id, boardId) => {
    const first = sentencesOf(String(item.markdown).replace(/^#+.*$/gm, '').replace(/\*\*/g, '')).find(x => /\?\s*$/.test(x) && x.length <= 170);
    return { id, ideaId: null, kc: null, itemId: null, own: item.id, prompt: item.markdown, spoken: first || `${atWord(item.title || 'A problem from your practice material', 120)} is on the page.`, boardId, answer: item.solution, mistakes: [], kind: 'practice', level: 'exam', source: item.title };
  };
  /**
   * Practice (12 Oct, the user: "a more exam-based practice pool"): their own problems first (the practice prelim and psets,
   * with official solutions), the section's then its unit's; then problems written on request from the session's own context
   * (make_problem); the course model's questions after; the generated bank last.
   */
  function withPool(s, g) {
    const scope = scopeOf(s), view = safe(() => K().view(scope, s.pinnedKnowledgeManifestId), null), unit = view && safe(() => unitOf(view, g.topicId), null);
    const near = [g.topicId, ...(unit ? safe(() => expandTopics(view, [unit]), []) : []), ...(unit ? [unit] : [])];
    const own = [...ownProblems(s, [g.topicId]), ...ownProblems(s, near).filter(i => String(i.moduleId) !== `mod_${g.topicId}`)].filter((x, i, all) => all.findIndex(y => y.id === x.id) === i).slice(0, 12);
    const boards = [...g.boards], added = own.map((item, i) => {
      const show = ownBoard(item), boardId = `b${boards.length + 1}`, id = `qp${i + 1}`;
      if (!show) return null;
      boards.push({ id: boardId, label: atWord(item.title || `Practice problem ${i + 1}`, 60), use: 'question', show, ideaId: null, questionId: id });
      return ownQuestion(item, id, boardId);
    }).filter(Boolean);
    const banked = withBank(s, { ...g, boards, questions: [] });
    return { ...g, boards: banked.boards, questions: [...added, ...g.questions, ...banked.questions] };
  }
  /** Teaching: the section's own exam problems (their practice prelim, filed under this section) join its guide, to end the section on. */
  function withOwn(s, g) {
    const boards = [...g.boards], questions = [...g.questions];
    ownProblems(s, [g.topicId]).slice(0, 2).forEach((item, i) => {
      const show = ownBoard(item), boardId = `b${boards.length + 1}`, id = `qp${i + 1}`;
      if (!show) return;
      boards.push({ id: boardId, label: atWord(`Practice prelim: ${String(item.title || '').replace(/^.*?,\s*/, '')}`, 60), use: 'question', show, ideaId: null, questionId: id });
      questions.push(ownQuestion(item, id, boardId));
    });
    return { ...g, boards, questions };
  }
  // After a tool's result the voice goes on with the same turn; what it already said is said (13 Oct runs: every session asked
  // its question twice, two seconds apart).
  const AFTER_TOOL = "(You go on in the same turn: don't repeat what you just said. If you asked them something, stop and wait.)";
  // ---------- the exam's study guide (backend/lessons/study.mjs): its topics in order, each taught as a guide ----------
  const studies = new Map(); // examId → { at, topics }: reread each minute, so an edited guide is taught at once
  function studyOf(scope) {
    if (!app.config.studyDir) return null;
    const hit = studies.get(scope.examId);
    if (hit && Date.now() - hit.at < 60_000) return hit.topics;
    const topics = safe(() => loadStudy(path.join(app.config.studyDir, scope.examId)), null);
    studies.set(scope.examId, { at: Date.now(), topics });
    return topics;
  }
  const sourcesBy = new Map(); // examId → { at, sections }: their own material, for look_up
  function sourcesOf(scope) {
    if (!app.config.studyDir) return [];
    const hit = sourcesBy.get(scope.examId);
    if (hit && Date.now() - hit.at < 60_000) return hit.sections;
    const sections = safe(() => loadSources(path.join(app.config.studyDir, scope.examId)), []);
    sourcesBy.set(scope.examId, { at: Date.now(), sections });
    return sections;
  }
  const setStudyAt = (scope, n) => db.prepare("UPDATE exams SET data = json_set(data, '$.studyAt', ?) WHERE id = ?").run(n, scope.examId);
  /** The lecture a section comes from ("02 Numbers"), by its own passages. */
  function lectureOfTopic(s, topicId) {
    const scope = scopeOf(s), km = s.pinnedKnowledgeManifestId, view = K().view(scope, km);
    const anchors = (view.evidenceLinks || []).filter(l => l.topicId === topicId).map(l => l.sourceAnchorId).slice(0, 3);
    return safe(() => K().passages(scope, km, anchors, { maxTokens: 300 })[0]?.lecture, null);
  }
  /** Where to start: a topic they asked for by name, else the unit of the lecture they asked for, else where they left off, else their lecture's unit. */
  function studyStart(s, goal, topics) {
    const exam = db.get('exams', scopeOf(s).examId), at = Number.isInteger(exam?.studyAt) && exam.studyAt < topics.length ? exam.studyAt : null, asked = goal.why === 'you asked for it';
    if (asked) { const w = topicOfWords(topics, goal.title); if (w >= 0) return w; }
    const u = topicOfLecture(topics, lectureOfTopic(s, goal.topicIds?.[0]));
    if (asked && u >= 0) return u;
    if (at != null) return at;
    return exam?.lectureFrom === 'start' ? 0 : u >= 0 ? u : 0;
  }
  const speakable = q => { const first = sentencesOf(q.replace(/[*`$]/g, '')).find(x => /\?\s*$/.test(x)) || sentencesOf(q.replace(/[*`$]/g, ''))[0] || ''; return first.length <= 170 ? first : `${atWord(first, 150)} It's on the page.`; };
  /** A study-guide topic as a guide: its blocks as boards, its tries (the voice judges them), its practice-prelim problems (checked). */
  function studyGuideOf(s, topics, n, topicId) {
    const t = topics[n], boards = [], questions = [];
    const put = (label, content, use) => {
      const parts = [], paras = String(content || '').split(/\n{2,}/);
      for (const p of paras) { if (parts.length && (parts.at(-1) + '\n\n' + p).length <= 1390) parts[parts.length - 1] += '\n\n' + p; else parts.push(p.slice(0, 1390)); }
      parts.filter(x => x.trim()).forEach((chunk, k, all) => {
        const title = all.length > 1 ? `${label} (${k + 1}/${all.length})` : label, { show } = checkShow({ kind: 'markdown', title, content: chunk });
        if (show) boards.push({ id: `b${boards.length + 1}`, label: title, use, show, ideaId: 'i1', questionId: null });
      });
    };
    put(`${t.title}: rules`, t.blocks.Rules, 'explain'); put('How to do it', t.blocks['How to'], 'explain'); put('Worked example', t.blocks['Worked example'], 'example'); put('Traps', t.blocks.Traps, 'explain');
    t.tries.forEach((x, k) => {
      const id = `t${k + 1}`, boardId = `b${boards.length + 1}`, { show } = checkShow({ kind: 'markdown', title: `Try ${k + 1}`, content: cut(x.q, 1390) });
      if (!show) return;
      boards.push({ id: boardId, label: `Try ${k + 1}`, use: 'question', show, ideaId: 'i1', questionId: id });
      questions.push({ id, ideaId: 'i1', kc: null, itemId: null, voice: true, prompt: x.q, spoken: speakable(x.q), boardId, answer: x.a, mistakes: [], kind: 'check', level: 'core' });
    });
    const own = ownProblems(s, []);
    for (const num of t.problems.slice(0, 3)) {
      const item = own.find(i => new RegExp(`problem ${num}\\b`).test(i.title || ''));
      const show = item && ownBoard(item);
      if (!show) continue;
      const id = `p${num}`, boardId = `b${boards.length + 1}`;
      boards.push({ id: boardId, label: `Practice prelim ${num}`, use: 'question', show, ideaId: null, questionId: id });
      questions.push({ ...ownQuestion(item, id, boardId), level: 'exam' });
    }
    return { id: `study:${n}`, topicId, title: t.title, lecture: t.unit, source: 'study', story: { before: topics[n - 1]?.title ?? null, about: sentencesOf(t.blocks.Idea || '')[0] || t.title, next: topics[n + 1]?.title ?? null },
      ideas: [{ id: 'i1', kc: null, title: t.title, plain: t.blocks.Idea || '', mechanism: t.blocks['How to'] || null, example: null, boardIds: boards.filter(b => !b.questionId).map(b => b.id) }],
      boards, questions, confusions: [], takeaway: '', study: { n, of: topics.length, text: [studyText(topics, n), realOf(s, t), figuresText(t.title)].filter(Boolean).join('\n\n'), tries: t.tries.map((x, k) => ({ id: `t${k + 1}`, answer: x.a })) } };
  }
  /** A topic's real problems (practice prelim with solutions, quiz questions, lab and assignment parts), for the voice to teach toward. */
  function realOf(s, t) {
    const scope = scopeOf(s), items = safe(() => db.find('module_items', {}, { scope }), []).filter(i => i.kind === 'problem' && i.solution && i.markdown);
    const prelim = num => items.find(i => new RegExp(`problem ${num}\\b`).test(i.title || '')) || null;
    const real = safe(() => realProblemsText(path.join(app.config.studyDir, scope.examId), t, { prelim, sections: sourcesOf(scope) }), '');
    // The course's own words on it: the lecture sections that match the topic best (13 Oct: "does it cover everything in the reading").
    // (A course the harness built has no "lecture …" files: its own material, whatever it is, minus the study guide.)
    const all = sourcesOf(scope), lectures = all.filter(x => x.source.startsWith('lecture')), material = lectures.length ? lectures : all.filter(x => !x.source.startsWith('study guide'));
    const notes = safe(() => searchSources(material, `${t.title} ${(t.blocks.Idea || '').slice(0, 200)}`, { max: 3, chars: 2200 }), []);
    return [real, notes.length ? `FROM THEIR LECTURE NOTES (the course's own explanations of this topic; teach in these terms):\n\n${notes.map(n => `[${n.source}]\n${n.text}`).join('\n\n---\n\n')}` : ''].filter(Boolean).join('\n\n');
  }
  /** The guide card for study-guide topic n (where they are kept in exam.studyAt). */
  function studyCard(s, goal, n) {
    const topics = studyOf(scopeOf(s));
    if (!topics?.[n]) return null;
    const topicId = goal.topicIds?.[0] ?? null, g = studyGuideOf(s, topics, n, topicId);
    setStudyAt(scopeOf(s), n);
    saveState({ ...stateOf(s), guide: g, guideGoalId: goal.id, guideActive: null, guideShown: [], guideTally: {}, guideAsked: [] });
    const card = { move: 'present', act: 'guide', wait: 'recall', helpLevel: 0, target: { kc: null, topicId, statement: g.title }, intention: `Teach study-guide topic "${g.title}" in the rhythm`, verdict: null,
      say: '', ask: null, neutral: '', handBack: '', show: null, expect: [], persona: null, withheld: {}, item: null, guide: publicGuide(g), thread: `study:${n}`, learner: learnerOf(s),
      why: `topic ${n + 1} of ${topics.length} of the study guide`, source: 'guide', goalId: goal.id, goalTitle: g.title, arcAfter: null };
    return checkCard(card).card;
  }
  function guideCard(s, goal, { practice = false } = {}) {
    const topicId = goal.topicIds[0], built = guideFor(s, topicId, { practice }), g = !built ? built : practice ? withPool(s, built) : withOwn(s, built);
    if (!g) return null;
    saveState({ ...stateOf(s), guide: g, guideGoalId: goal.id, guideActive: null, guideShown: [], guideTally: {} });
    const card = { move: 'present', act: 'guide', wait: 'recall', helpLevel: 0, target: { kc: null, topicId, statement: g.title }, intention: `Teach "${g.title}" from its guide: the tutor chooses how`, verdict: null,
      say: '', ask: null, neutral: '', handBack: '', show: null, expect: [], persona: null, withheld: {}, item: null, guide: publicGuide(g), thread: topicId, learner: learnerOf(s),
      why: `${goal.why || 'their walk through the lectures'}; a ${g.source === 'notes' ? 'notes-only' : 'course-model'} guide`, source: 'guide', goalId: goal.id, goalTitle: goal.title, arcAfter: null };
    return checkCard(card).card;
  }
  /** A note to the voice: context for its next line, never a turn of its own (tutor.note). */
  // `speak`: a verdict on the line in `responseId`: said at once if nobody has spoken since (12 Oct quick runs: a verdict that
  // landed 0.1 s after the voice began its reply waited for the student's next line).
  const tutorNote = (sessionId, text, extra = {}) => { if (text) S().emit(sessionId, 'tutor.note', { text, ...extra }); };
  /**
   * A line while a guide card is current: no move (the tutor answers it). With a question up, an attempt is checked in the
   * background against its verified answer, recorded as evidence, and the verdict sent as a note; rules add a note when an idea
   * is shown twice, or the same misconception is matched twice.
   */
  /** The tutor's last line to them (a step it set itself while walking through a problem). */
  const askedNow = s => safe(() => clip(S().dialogue(s.id).filter(d => d.speaker !== 'student').at(-1)?.text || '', 400), '');
  async function guideTurn(s, card, response, t0) {
    const st = stateOf(s), g = st.guide, text = String(response.text ?? '').trim();
    const replied = (g?.questions || []).find(q => q.id === response.replyToQuestionId || (q.bank && q.bank === response.replyToQuestionId)); // a hand-in names the bank's id
    const qid = replied?.id ?? st.guideActive;
    const q = qid && g?.questions?.find(x => x.id === qid);
    const code = /```|\breturn\b|[{};]\s*$|^\s*(int|unsigned|if|for|while|void|char)\b/m.test(text); // code is an attempt, even with a "?" in it
    // An answer, not a remark or a request (12 Oct: "I want to see it" and "can you draw it" were checked as answers).
    const asks = REQUEST_FORM.test(text) || /\b(show|draw|explain|can you|could you|i want|let'?s|give me|hit me|next|harder|easier)\b/i.test(text);
    const answerish = /\b(i think|i got|it'?s|it is|they'?re|answer|equals?|is|are|=|yes|no|true|false|both|neither|overflow|carry)\b/i.test(text);
    const attempt = q && text && (code || !!replied || ((valuesOf(text).size > 0 || answerish) && !(asks && !valuesOf(text).size) && !META.test(text.replace(/\?\s*$/, '')) && !CHAT.test(text)));
    const note = extra => saveState({ ...stateOf(S().peek(s.id)), last: { cardId: card.id, answer: clip(text, 300), ms: Date.now() - t0, ...extra } });
    if (!attempt) { note({ kind: 'guide', next: 'none' }); return { kind: 'guide', next: 'none', ms: Date.now() - t0 }; }
    if (q.voice) { note({ kind: 'guide', how: 'guide:voice-judged', next: 'none' }); return { kind: 'guide', next: 'none', ms: Date.now() - t0 }; } // a study-guide try: the voice has its answer and judges it at once
    if (q.bank || q.made || q.own) { // their own, a bank or a made problem: checked against its worked answer
      // On the live lane, in seconds (12 Oct quick runs: the judge, on the background lane behind the course builds, took a minute).
      const r = await call(x => app.providers.directorWriter.check(x), { work: workIdentity({ scope: scopeOf(s), idempotencyKey: `check:${response.id}`, input: { q: q.id, text }, clock }), problem: clip(`${q.prompt}${askedNow(s) ? `\n\nThe tutor's last words to them (judge their answer to this step if it is one): ${askedNow(s)}` : ''}`, 3000), worked: clip(q.answer, 3000), answer: clip(text, 2000) }, { valueSchema: CHECKED, what: 'practice answer check' });
      const ok = r.outcome !== 'ok' ? null : r.value.verdict === 'right' ? true : r.value.verdict === 'wrong' ? false : null, wrongPart = r.outcome === 'ok' ? r.value.wrong : '';
      // A newer line came while this was checked: the verdict still goes to the voice, quietly and labelled with the answer it is
      // about (13 Oct: a part (b) verdict was lost when they asked something else meanwhile; 12 Oct: a stale verdict was spoken over newer writing).
      const stale = latest.get(s.id) !== response.id, label = stale ? `(about their earlier answer "${clip(text, 120)}"; if they've answered again since, the newer one counts) ` : '';
      const parts = /\(\s*[b-h]\s*\)/.test(q.prompt || ''); // a multi-part problem: a right part is not the end of it (13 Oct: "want the next one?" with (c) and (d) still open)
      tutorNote(s.id, (ok === true ? `[Checked] ${q.id}: RIGHT. Say so now, plainly and specifically (what they got right), then ${parts ? 'go straight on to the next part they haven\'t done (offer the next problem only when every part is done)' : 'offer the next'}.`
        : ok === false ? `[Checked] ${q.id}: NOT RIGHT${wrongPart ? `: ${clip(wrongPart, 240)}` : ''}. Say so now: which part is wrong, what they got right, and the right way. The worked answer (they've tried, so you may show it): ${clip(q.answer, 400)}.`
        : `[Checked] ${q.id}: not decided here. Judge it yourself now against the worked answer (or the step you set) and say your verdict in a few words (never ask them to repeat it or how they got it), then go on. Worked answer: ${clip(q.answer, 500)}`).replace('[Checked] ', `[Checked] ${label}`), { speak: !stale, responseId: response.id });
      saveState({ ...stateOf(S().peek(s.id)), guideActive: ok === true && !parts ? null : qid }); // a part right: its later parts are still checked
      if (ok === true) prefetchHarder(S().peek(s.id));
      note({ kind: ok === true ? 'correct' : ok === false ? 'incorrect' : 'uncertain', how: 'guide:bank-judge', next: 'note' });
      return { kind: ok === true ? 'correct' : 'incorrect', next: 'note', ms: Date.now() - t0 };
    }
    if (!q.itemId) { tutorNote(s.id, `[Checked] No verified answer for ${q.id}: talk it through with them.`); note({ kind: 'guide', next: 'none' }); return { kind: 'guide', next: 'none' }; }
    const scope = scopeOf(s), topicId = g.topicId, itemId = `${topicId}:${q.itemId}`, kc = q.kc ? `${topicId}:${q.kc}` : null;
    const qcard = { ...card, act: 'test', move: 'probe', item: { id: itemId, family: 'E3', regime: 'R1' }, target: { kc, topicId, statement: q.spoken }, expect: [], helpLevel: 0 };
    const checked = await verifyItem(scope, itemId, text, response);
    if (!checked) { tutorNote(s.id, `[Checked] Couldn't check their answer to ${q.id}: judge it yourself from what you taught and say your verdict in a few words.`); note({ kind: 'guide', next: 'none' }); return { kind: 'guide', next: 'none' }; }
    const [value, { wrongModelHits }] = valueOf(S().peek(s.id), qcard, checked, 'answer');
    const o = safe(() => observation(S().peek(s.id), qcard, { value, trust: checked.trust, wrongModelHits, lean: leanOf(checked), stated: false }, response, null), null);
    if (o) safe(() => observe(scope, o));
    const right = ['correct', 'valid_nonstandard'].includes(value), sure = (checked.trust ?? 0) >= PLAIN_TRUST, why = clip(checked.reason || checked.explanation || '', 200);
    const wm = (wrongModelHits || []).filter(h => h.p >= 0.5).sort((a, b) => b.p - a.p)[0], conf = wm && g.confusions?.find(c => c.wrongModel === wm.id || `${topicId}:${c.wrongModel}` === wm.id);
    const verdictText = right ? `[Checked] ${q.id}: RIGHT${sure ? '' : ' (likely)'}${why ? ` (${why})` : ''}. Say so now, plainly and specifically, then go on.`
      : value === 'uncertain' ? `[Checked] ${q.id}: couldn't verify it. Judge it yourself from what you taught and say your verdict in a few words.`
      : `[Checked] ${q.id}: NOT RIGHT${sure ? '' : ' (likely)'}${why ? ` (${why})` : ''}. Say so now and show the right way. The answer (they've tried, so you may show it): ${clip(q.answer, 300)}.${conf ? ` It looks like: ${clip(conf.belief, 140)}. What clears it up: ${clip(conf.fix, 180)}` : ''} Say which part is wrong and show the right way, keeping what they got right; don't quiz them on it again yet.`;
    const stale = latest.get(s.id) !== response.id; // superseded by a newer line: passed quietly, labelled, as for bank problems
    tutorNote(s.id, stale ? verdictText.replace('[Checked] ', `[Checked] (about their earlier answer "${clip(text, 120)}"; if they've answered again since, the newer one counts) `) : verdictText, { speak: !stale, responseId: response.id });
    // The rules' notes: an idea shown twice; a misconception matched twice.
    const tally = { ...(stateOf(S().peek(s.id)).guideTally || {}) }, ideaKey = `idea:${q.ideaId}`, wmKey = wm ? `wm:${wm.id}` : null;
    if (right) tally[ideaKey] = (tally[ideaKey] || 0) + 1;
    if (wmKey) tally[wmKey] = (tally[wmKey] || 0) + 1;
    const idea = g.ideas?.find(i => i.id === q.ideaId);
    if (right && tally[ideaKey] === 2) tutorNote(s.id, `[Note] They've shown "${idea?.title || 'this idea'}" twice: fine to go on.`);
    if (wmKey && tally[wmKey] === 2 && conf) tutorNote(s.id, `[Note] Twice now they may be thinking: ${clip(conf.belief, 160)}. Address that directly: ${clip(conf.fix, 200)}`);
    saveState({ ...stateOf(S().peek(s.id)), guideTally: tally, guideActive: right ? null : qid });
    if (right) prefetchHarder(S().peek(s.id));
    note({ kind: right ? 'correct' : value, verdict: value, how: `guide:${checked.provenance?.by ?? 'verify'}`, trust: checked.trust ?? null, next: 'note' });
    return { kind: value, next: 'note', ms: Date.now() - t0 };
  }
  /**
   * make_problem: a problem of the kind they asked for that the guide doesn't have (12 Oct quick runs: "an 8-bit overflow
   * problem" got "I don't have one"). Written on the director lane, its answer checked by the light model (and a C program it
   * prints, run in the sandbox), rewritten once if wrong; then a board and a question, checked by the judge like a bank problem.
   */
  async function makeProblem(s, g, about, { ahead = false, stage = () => {} } = {}) {
    if (!g) return { say: 'There is no section guide right now.' };
    const st0 = stateOf(S().peek(s.id)), recent = (st0.guideAsked || []).slice(-3).map(id => (st0.guide || g).questions.find(q => q.id === id)?.prompt).filter(Boolean).map(p => clip(p, 400));
    // Local context (the user, 12 Oct: "local context can often lead to better results than pregenerated"): what was just said,
    // the problem they're on and how they answered, and their own practice problems as the exam's style.
    const dialogue = safe(() => S().dialogue(s.id).slice(-10).map(d => `${d.speaker}: ${clip(d.text, 240)}`), []);
    const unitIds = safe(() => { const view = K().view(scopeOf(s), s.pinnedKnowledgeManifestId), unit = unitOf(view, g.topicId); return [g.topicId, ...expandTopics(view, [unit]), unit]; }, [g.topicId]);
    const exemplars = ownProblems(s, unitIds).slice(0, 2).map(i => ({ problem: clip(i.markdown, 700), solution: clip(i.solution, 500) }));
    const input = { asked: about || 'a harder problem', section: { title: g.title, ideas: g.ideas.map(i => `${i.title}: ${i.plain}`).slice(0, 8) }, avoid: recent, dialogue, exemplars }; // never a repeat of what they just did
    let draft = null;
    for (let i = 0; i < 2 && !draft; i++) {
      stage(i ? 'Rewriting it (the first answer did not check out)' : 'Writing the problem');
      const r = await call(x => app.providers.directorWriter.problem(x), { work: workIdentity({ scope: scopeOf(s), idempotencyKey: `problem:${s.id}:${about}:${i}:${clock.now()}`, input, clock }), ...input }, { valueSchema: PROBLEM_DRAFT, what: 'practice problem' });
      if (r.outcome !== 'ok') break;
      stage('Checking its answer');
      const checked = await verifyBranch(s, r.value.prompt, r.value.answer, r.value.solution, `${s.id}:${clock.now()}:${i}`);
      if (checked !== 'wrong') draft = r.value;
    }
    if (!draft) return { say: "Couldn't make a checked problem of that kind just now: offer one from the set, or teach it." };
    const st = stateOf(S().peek(s.id)), gg = st.guide || g, n = (gg.questions || []).filter(q => q.made).length + 1, id = `qm${n}`, boardId = `b${gg.boards.length + 1}`;
    const { show } = checkShow({ kind: 'markdown', title: 'New problem', content: cut(draft.prompt, 1390) });
    const first = sentencesOf(draft.prompt).filter(x => /\?\s*$/.test(x)).slice(-1)[0] || sentencesOf(draft.prompt)[0] || '', spoken = first.length <= 170 ? first : `${atWord(first, 150)} It's on the page.`;
    const board = { id: boardId, label: `New problem: ${atWord(about || 'practice', 40)}`, use: 'question', show, ideaId: null, questionId: id };
    const question = { id, ideaId: null, kc: null, itemId: null, made: true, prompt: draft.prompt, spoken, boardId, answer: `${draft.answer}. ${draft.solution}`, mistakes: [], kind: 'practice', level: /\b(harder|tougher|difficult|challenge)\b/i.test(about || '') ? 'beyond' : 'exam' }; // made on "harder": above the set's exam problems
    if (ahead) { saveState({ ...st, guide: { ...gg, boards: [...gg.boards, board], questions: [...gg.questions, question] } }); return { say: '', boardId, board }; } // made ahead: waits, unasked
    saveState({ ...st, guide: { ...gg, boards: [...gg.boards, board], questions: [...gg.questions, question] }, guideShown: [...new Set([...(st.guideShown || []), boardId])], guideActive: id, guideAsked: [...(st.guideAsked || []), id] });
    return { say: `On the page: a new problem. Ask it as: "${spoken}" (just that). The full problem, for you to refer to: ${clip(draft.prompt, 1000)}. Their answer is checked for you: wait for [Checked].`, boardId, board };
  }
  /**
   * Practice: after a right answer, the next harder problem of the kind they last asked for is made ahead, so "harder" is instant
   * (12 Oct quick runs: ~16 s of dead air while one was made). Kept unasked in the guide; next_problem picks it.
   */
  function prefetchHarder(s) {
    const st = stateOf(s), g = st.guide;
    if (g?.mode !== 'practice' || st.guidePrefetching) return;
    const asked = new Set(st.guideAsked || []), RANK = { recall: 0, core: 1, exam: 2, beyond: 3 }, last = g.questions.find(q => q.id === (st.guideAsked || []).at(-1));
    if (g.questions.some(q => !asked.has(q.id) && (RANK[q.level] ?? 1) > (RANK[last?.level] ?? 1))) return; // a harder one is already waiting
    saveState({ ...st, guidePrefetching: true });
    void makeProblem(s, g, `harder ${st.guideAbout || ''}`.trim(), { ahead: true }).finally(() => safe(() => saveState({ ...stateOf(S().peek(s.id)), guidePrefetching: false })));
  }
  // How long each kind of background making has taken lately (a median of the last 7), for the page's progress bar and the voice's
  // "about N seconds" (13 Oct, the user: taking time is fine when they're told what's coming and roughly how long).
  const TOOK = { problem: [25_000], drawing: [20_000], think: [9_000], figure: [240_000], animation: [60_000] }; // figure: the first test build took 227 s (14 Oct); animation: 53 s and 34 s (16 Oct)
  const took = (kind, ms) => { TOOK[kind].push(ms); if (TOOK[kind].length > 7) TOOK[kind].shift(); };
  const etaOf = kind => [...TOOK[kind]].sort((x, y) => x - y)[Math.floor(TOOK[kind].length / 2)];
  const progress = (sessionId, thinkId, extra) => S().emit(sessionId, 'thought.progress', { thinkId, ...extra });
  /** A problem made in the background (it takes seconds): the voice says a holding line now; the problem comes as thought.ready, its board with it. */
  function makeLater(s, g, about) {
    const thinkId = newId('think'), t0 = Date.now(), etaMs = etaOf('problem');
    void makeProblem(s, g, about, { stage: stage => progress(s.id, thinkId, { stage }) }).then(r => { if (r.board) took('problem', Date.now() - t0); return r; }).then(r => S().emit(s.id, 'thought.ready', { thinkId, question: about, say: r.say, board: r.board?.show ? { ...r.board.show, title: r.board.show.title || 'New problem' } : null, boardWhy: null, lecture: null, ms: Date.now() - t0 }))
      .catch(error => S().emit(s.id, 'thought.ready', { thinkId, question: about, say: `Couldn't make that problem (${clip(error.message, 80)}): offer one from the set.`, board: null, ms: Date.now() - t0 }));
    return { say: `Making a new one; it takes about ${Math.round(etaMs / 1000)} seconds (a progress bar is on their page). Say in one line what you're making and roughly how long, then one useful tip for this kind of problem while it comes; it arrives as [Thought] with what to ask.`, thinkId, etaMs, making: { kind: 'problem', label: `Making a problem${about ? `: ${atWord(about, 60)}` : ''}` } };
  }
  /** anatomy (backend/session/anatomy.mjs): the idea built as a real, working machine, in the background (minutes); it comes as thought.ready with its board, the figure's page framed on theirs. */
  // ponytail: one build at a time (each is a long Claude session on the user's plan); a queue if they want several at once.
  let figuring = null;
  // A figure on their page, for think to know of (what they have on the page).
  const figureSeen = (s, f) => { const st = stateOf(S().peek(s.id)); saveState({ ...st, guideWritten: [...(st.guideWritten || []), { title: f.title, content: f.note }].slice(-6) }); };
  const figureBoard = f => ({ kind: 'anatomy', title: f.title, src: `/figures/${f.id}.html` });
  function figureLater(s, idea, object, ready) {
    if (!app.config.figureDir) return { say: 'Figures aren\'t set up on this server: show it with write instead.' };
    if (ready) { // one built before (the library): up at once
      const f = libraryOf(app.config.figureDir).find(x => x.id === ready);
      if (!f) return { say: `There is no ready figure "${ready}": build one (idea), or show it another way.` };
      figureSeen(s, f);
      return { say: `On the page now: "${f.title}" (they can play with it). Its builder's note: ${f.note || 'none; its caption says what it shows'}`, board: { id: f.id, label: f.title, use: 'explain', show: figureBoard(f) } };
    }
    if (!idea) return { say: 'Say what the figure should explain (idea), with its true numbers, or put up a ready one (ready).' };
    // Asked again while one is building, he hears where it is (its real step and time so far), not just "wait".
    if (figuring) return { say: `A figure is already being built (${figuring.what}): ${figuring.stage.toLowerCase()}, ${Math.round((Date.now() - figuring.t0) / 60_000)} of about ${Math.round(etaOf('figure') / 60_000)} minutes so far. One at a time; it comes as [Thought].` };
    const thinkId = newId('think'), id = newId('fig'), t0 = Date.now(), etaMs = etaOf('figure');
    figuring = { what: atWord(object || idea, 60), stage: 'Starting', t0 };
    void buildFigure({ idea, object }, { out: path.join(app.config.figureDir, `${id}.html`), onStage: (stage, fraction) => { figuring.stage = stage; progress(s.id, thinkId, { stage, fraction }); } })
      .then(built => {
        took('figure', Date.now() - t0);
        const f = { id, title: built.title, topic: stateOf(S().peek(s.id)).guide?.title || '', idea, note: built.note };
        safe(() => addToLibrary(app.config.figureDir, f));
        figureSeen(s, f);
        S().emit(s.id, 'thought.ready', { thinkId, question: idea, say: `The figure is on their page now (they can play with it). Its builder's note: ${f.note || 'none (it ran out of time); its caption says what it shows'}`, board: figureBoard(f), boardWhy: null, lecture: null, ms: Date.now() - t0 });
      })
      .catch(error => S().emit(s.id, 'thought.ready', { thinkId, question: idea, say: `Couldn't build that figure (${clip(error.message, 160)}): show it another way.`, board: null, ms: Date.now() - t0 }))
      .finally(() => { figuring = null; });
    return { say: `Building it in the background: about ${Math.round(etaMs / 60_000)} minutes (a progress bar is on their page). Teach on meanwhile; it goes up by itself and comes as [Thought] with what it shows.`, thinkId, etaMs, waitMs: BUDGET_MS + 120_000, making: { kind: 'figure', label: `Building a figure: ${figuring.what}` } };
  }
  /** animate (backend/session/animate.mjs): a Manim clip of `about`, built in the background like a figure (a minute or more); a cached one goes up at once. */
  // ponytail: one build at a time, as figures; a queue if they want several at once.
  let animating = null;
  const animationBoard = a => ({ kind: 'animation', title: a.title, src: `/animations/${a.id}.mp4` });
  function animateLater(s, about, title) {
    const dir = app.config.animationDir;
    if (!dir || !manimReady()) return { say: 'Animations aren\'t set up on this server: show it with write instead.' };
    if (!about) return { say: 'Say what the animation should show (about), with its true numbers.' };
    const cached = cachedAnimation(dir, animationId(about));
    if (cached) { figureSeen(s, cached); return { say: `On the page now: the animation "${cached.title}" (it plays once; they can replay it). Its builder's note: ${cached.note || 'none'}`, board: { id: cached.id, label: cached.title, use: 'explain', show: animationBoard(cached) } }; }
    if (animating) return { say: `An animation is already being built (${animating.what}): ${animating.stage.toLowerCase()}. One at a time; it comes as [Thought].` };
    const thinkId = newId('think'), t0 = Date.now(), etaMs = etaOf('animation');
    animating = { what: atWord(title || about, 60), stage: 'Starting' };
    void buildAnimation({ about, title }, { dir, onStage: (stage, fraction) => { animating.stage = stage; progress(s.id, thinkId, { stage, fraction }); } })
      .then(a => {
        took('animation', Date.now() - t0);
        figureSeen(s, a);
        S().emit(s.id, 'thought.ready', { thinkId, question: about, say: `The animation is on their page now (it plays once; they can replay it). Its builder's note: ${a.note || 'none'}`, board: animationBoard(a), boardWhy: null, lecture: null, ms: Date.now() - t0 });
      })
      .catch(error => S().emit(s.id, 'thought.ready', { thinkId, question: about, say: `Couldn't build that animation (${clip(error.message, 160)}): show it another way.`, board: null, ms: Date.now() - t0 }))
      .finally(() => { animating = null; });
    return { say: `Building it in the background: about ${Math.round(etaMs / 1000)} seconds (a progress bar is on their page). Teach on meanwhile; it goes up by itself and comes as [Thought] with what it shows.`, thinkId, etaMs, waitMs: ANIMATE_MS + 60_000, making: { kind: 'animation', label: `Animating: ${animating.what}` } };
  }
  /** circuit (backend/session/circuit.mjs): a live logic circuit from the voice's netlist, up at once, framed like a figure. */
  function circuitNow(s, title, netlist) {
    if (!app.config.figureDir || !circuitsReady()) return { say: 'The circuit simulator isn\'t set up on this server: draw it with write instead.' };
    let net;
    try { net = JSON.parse(netlist); } catch { return { say: `Not drawn: the netlist isn't JSON. Its shape: ${NETLIST_HELP}` }; }
    const f = { id: newId('circ'), title: title || 'Circuit' }, c = writeCircuit(app.config.figureDir, f.id, net, f.title);
    if (c.problems) return { say: `Not drawn: ${c.problems.slice(0, 6).join('; ')}. Fix it and call circuit again. Its shape: ${NETLIST_HELP}` };
    f.note = `A live circuit. Inputs (they click one to flip it): ${c.inputs.join(', ')}. Outputs: ${c.outputs.join(', ')}.`;
    figureSeen(s, f);
    return { say: `On the page: "${f.title}", live: every wire lights up with its value as they flip inputs (they can drag parts too). Inputs: ${c.inputs.join(', ')}; outputs: ${c.outputs.join(', ')}; all inputs start at 0.`, board: { id: f.id, label: f.title, use: 'explain', show: figureBoard(f) } };
  }
  /** kit (backend/lessons/kits.mjs): one of the course's own figure kits, drawn from Plato's spec, up at once. A spec it can't
   *  draw comes back from the page as a note (the kit's own words on what is wrong). */
  function kitNow(s, name, title, spec) {
    const dir = app.config.studyDir && path.join(app.config.studyDir, s.scope.examId);
    if (!dir || !app.config.figureDir) return { say: 'Figures aren\'t set up on this server: use write instead.' };
    const f = { id: newId('kit'), title: title || name }, k = writeKit(dir, app.config.figureDir, f.id, name, spec, f.title);
    if (k.problem) return { say: `Not drawn: ${k.problem}.` };
    f.title = k.title; f.note = `A ${name} figure, live.`;
    figureSeen(s, f);
    return { say: `On the page: "${f.title}" (the ${name} kit). If the spec was wrong you will get a note saying what; else it is up as you wrote it.`, board: { id: f.id, label: f.title, use: 'explain', show: figureBoard(f) } };
  }
  /** The ready figures, for the voice: this topic's with what each shows, the rest by title. */
  function figuresText(topic) {
    const all = app.config.figureDir ? libraryOf(app.config.figureDir) : [];
    if (!all.length) return '';
    // ponytail: every figure listed; list only this unit's once the library outgrows a few dozen.
    const line = f => `- ${f.id}: "${f.title}"${f.topic === topic ? `: ${clip(String(f.note || '').split('\n').slice(1).join(' '), 300)}` : ` (${f.topic || 'built in a session'})`}`;
    return `READY FIGURES (interactive machines they can play with; anatomy with ready: <id> puts one on their page at once, so build a new one only for what none of these shows):\n${[...all.filter(f => f.topic === topic), ...all.filter(f => f.topic !== topic)].map(line).join('\n')}`;
  }
  /**
   * next_problem (practice): the next problem chosen here, not by the voice (12 Oct quick runs: the voice picked a board, then
   * said a different problem from memory and judged a right answer against its own version). `about`: "harder", "easier", or a
   * kind of problem; a kind the set has none of is made (makeProblem). Gives { say (the exact words to ask), boardId, board }.
   */
  async function nextProblem(s, g, about) {
    if (!g?.questions?.length) return makeLater(s, g, about);
    const st = stateOf(S().peek(s.id)), asked = new Set(st.guideAsked || []), RANK = { recall: 0, core: 1, exam: 2, beyond: 3 }, last = g.questions.find(q => q.id === st.guideActive) || g.questions.find(q => q.id === (st.guideAsked || []).at(-1));
    const open = g.questions.filter(q => !asked.has(q.id)), lvl = q => RANK[q.level] ?? 1, at = last ? lvl(last) : 1;
    const harder = /\b(harder|tougher|difficult|challenge|exam)\b/i.test(about), easier = /\b(easier|simpler|basic|warm.?up)\b/i.test(about);
    // The kind they asked for counts whatever the difficulty ("a harder overflow addition"): every word of it must fit, else one is made.
    const STOP = new Set(['problem', 'problems', 'question', 'another', 'give', 'some', 'with', 'harder', 'tougher', 'difficult', 'challenge', 'easier', 'simpler', 'basic', 'more', 'next', 'that', 'this', 'please', 'exam', 'style', 'like', 'real', 'actual', 'prelim', 'practice', 'past', 'from', 'about', 'test', 'midterm', 'final', 'kind', 'type', 'sort']);
    const kind = new Set((about.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter(w => !STOP.has(w) && !/\d/.test(w)).map(w => w.replace(/(ing|ion|s)$/, '')));
    const fits = q => !kind.size || [...kind].every(w => `${q.prompt || ''} ${q.spoken}`.toLowerCase().includes(w));
    const pool = open.filter(fits).sort((a, b) => harder ? lvl(b) - lvl(a) : easier ? lvl(a) - lvl(b) : Math.abs(lvl(a) - at) - Math.abs(lvl(b) - at));
    const pick = harder ? pool.find(q => lvl(q) > at) ?? (kind.size ? null : pool[0]) : pool[0];
    if (!pick && kind.size) { // a kind the set lacks: one of their own anywhere in the course before one is made
      const found = ownProblems(s, [], kind).find(i => !(g.questions || []).some(q => q.own === i.id));
      if (found) {
        const gg = stateOf(S().peek(s.id)).guide || g, boardId = `b${gg.boards.length + 1}`, id = `qp${gg.questions.filter(q => q.own).length + 1}x`, show = ownBoard(found);
        if (show) {
          const board = { id: boardId, label: atWord(found.title || 'Practice problem', 60), use: 'question', show, ideaId: null, questionId: id }, question = ownQuestion(found, id, boardId);
          const st2 = stateOf(S().peek(s.id));
          saveState({ ...st2, guide: { ...gg, boards: [...gg.boards, board], questions: [...gg.questions, question] }, guideAsked: [...(st2.guideAsked || []), id], guideActive: id, guideShown: [...new Set([...(st2.guideShown || []), boardId])], guideAbout: about });
          return { say: `On the page: ${board.label} (from their own practice material). Ask it as: "${question.spoken}" (just that). The full problem, for you to refer to: ${clip(found.markdown, 1200)}. Their answer is checked for you: wait for [Checked].`, boardId, board };
        }
      }
    }
    if (!pick) return makeLater(s, g, about || 'a harder problem'); // nothing of that kind (or harder) in the set: made, its answer checked
    const b = g.boards.find(x => x.id === pick.boardId);
    saveState({ ...st, guideAsked: [...asked, pick.id], guideActive: pick.id, guideShown: [...new Set([...(st.guideShown || []), pick.boardId])], guideAbout: about || st.guideAbout || null });
    const full = clip(pick.prompt || pageText(b?.show) || '', 1200);
    return { say: `On the page: ${b?.label || 'the next problem'}. Ask it as: "${pick.spoken}" (just that). The full problem, for you to refer to (never read it all aloud): ${full}. Their answer is checked for you: wait for [Checked].`, boardId: pick.boardId, board: b };
  }
  // A colleague's check of a board he wrote (backend/session/review.mjs), in the background; an error reaches him as a quiet note
  // (context, never a turn). LUNA_REVIEW=0 turns it off; tests (node --test) never spawn it.
  function reviewLater(s, g, title, text) {
    if (process.env.LUNA_REVIEW === '0' || process.env.NODE_TEST_CONTEXT) return;
    void reviewBoard({ title, text, course: g?.study?.text || '' }).then(errors => { if (errors) safe(() => S().emit(s.id, 'tutor.note', { text: reviewNote(title, errors) })); });
  }
  /** POST /sessions/{id}/guide: the tutor's own moves in guide mode (show a board, move on, practise). Gives { say, boardId?, card? }. */
  function guideAction(principal, sessionId, body) {
    validate(GUIDE_BODY, body);
    // A slide with its question, code or proof space in one write: both go up, the slide first (15 Oct lesson eval: the
    // definitions on a question's slide never reached the page). The markdown of code or a proof space is its task.
    const slidePart = body.action === 'write' && (body.question_kind || String(body.code || '').trim() || body.proof?.length)
      && (body.points?.length || body.diagram_type || (body.question_kind && String(body.markdown || '').trim()));
    if (slidePart) {
      const only = (o, drop) => Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && !drop.includes(k)));
      const first = guideAction(principal, sessionId, only(body, ['question_kind', 'question', 'options', 'items', 'left', 'right', 'answers', 'explain', 'code', 'language', 'proof', ...(body.question_kind ? [] : ['markdown'])]));
      const then = guideAction(principal, sessionId, only(body, ['points', 'diagram_type', 'diagram_data', ...(body.question_kind ? ['markdown'] : [])]));
      return { ...then, say: `${first.say}\n${then.say}`, before: first.board || null };
    }
    const s0 = S().get(principal, sessionId);
    if (s0.status === 'ended') fail('invalid_input', 'This session has ended.');
    const s = S().peek(s0.id), st = stateOf(s), g = st.guide;
    safe(() => S().emit(s.id, 'guide.action', { action: body.action, board: body.board ?? null, about: body.about ?? null, title: body.title ?? null, code: !!body.code, chars: String(body.markdown || '').length })); // the tutor's tool use, in the session log
    if (body.action === 'look_up') { // their own material, searched in code: instant (13 Oct: "provide them the tools and the context")
      const found = searchSources(sourcesOf(scopeOf(s)), String(body.about || ''));
      return { say: found.length ? found.map(f => `[${f.source}]\n${f.text}`).join('\n\n---\n\n') : 'Nothing in their material matches that: try other words (a problem number, a quiz week, a lab, a topic).' };
    }
    if (body.action === 'read') { // a whole source, part by part: a definition word for word, a chapter's exercises
      const r = readSource(path.join(app.config.studyDir, scopeOf(s).examId), String(body.source || ''), body.part || 1);
      return { say: r.text ? `[${r.source}, part ${r.part} of ${r.parts}]\n${r.text}${r.part < r.parts ? `\n[… part ${r.part + 1} next: read with part ${r.part + 1}]` : ''}` : `No source fits "${clip(String(body.source || ''), 80)}". Their material: ${r.names.join('; ').slice(0, 3000)}` };
    }
    if (body.action === 'compute') return compute(String(body.code || '')).then(out => ({ say: out })); // his scratch work, checked by running it
    if (body.action === 'show') {
      if (!g) return { say: 'There is no section guide right now.' };
      const want = String(body.board || '').trim().toLowerCase(), b = g.boards.find(x => x.id.toLowerCase() === want) || g.boards.find(x => want && x.label.toLowerCase().includes(want));
      if (!b) return { say: `No such board. You can show: ${g.boards.map(x => `${x.id} (${x.label})`).join('; ')}` };
      const q = b.questionId ? g.questions.find(x => x.id === b.questionId) : null;
      saveState({ ...st, guideShown: [...new Set([...(st.guideShown || []), b.id])], guideActive: q ? q.id : st.guideActive });
      if (!q) return { say: `On the page: ${b.label}. ${AFTER_TOOL}`, boardId: b.id }; // a board to teach from (rules, a worked example)
      if (q?.voice) return { say: `On the page: ${b.label}. If you have not asked it yet, ask it once as: "${q.spoken}"; if you already did, say nothing more now (never ask it twice). You judge their answer yourself, the moment they give it: the answer is ${clip(q.answer, 400)}. Right → "Right", and why in one line, then go on; wrong → write the correct steps, say which step slipped, then the next try.`, boardId: b.id, board: b }; // a study-guide try: never a wait for [Checked] (13 Oct: four "what's next?" in silence)
      return { say: q ? `On the page: ${b.label}. Ask it as: "${q.spoken}" (just that; no other problem). The full problem, for you to refer to: ${clip(q.prompt || pageText(b.show) || '', 1000)}. Their answer is checked for you: wait for [Checked] before saying right or wrong.` : `On the page: ${b.label}.`, boardId: b.id };
    }
    if (body.action === 'move_on' && g?.study) { // the study guide's next topic (the walk's goal stays)
      const goal = currentGoal(s.agenda), n = g.study.n + 1, topics = studyOf(scopeOf(s));
      if (!goal || !topics?.[n]) { if (topics && n >= topics.length) setStudyAt(scopeOf(s), 0); return { say: 'That was the last topic of the study guide: offer a mixed review of the practice prelim problems they missed, or any topic they name.' }; }
      const c = studyCard(S().peek(s.id), goal, n), card = c ? issue(S().peek(s.id), c) : null;
      return { say: card ? `Next: ${topics[n].title} (topic ${n + 1} of ${topics.length}). Start it now, in this reply.` : 'Could not open the next topic: go on teaching.', card: card && pageCard(fullCard(card)) };
    }
    if (body.action === 'move_on') {
      const goal = currentGoal(s.agenda);
      if (goal) S().advance(s.id, goal.id, clip(body.why || 'Covered from its guide.', 200));
      const next = opening(S().peek(s.id));
      const card = next ? issue(S().peek(s.id), next) : null;
      return { say: card ? `Next: ${card.goalTitle || card.target?.statement || 'the next section'}.` : 'That was the last section.', card: card && pageCard(fullCard(card)) };
    }
    if (body.action === 'write' && String(body.code || '').trim()) { // code they can edit and run (a C or RISC-V zone), with its task
      const { board: shown, problem } = checkBoard({ kind: 'zone', zone: { kind: 'code', language: body.language || 'c', starter: cut(String(body.code), 4000), task: cut(String(body.markdown || body.title || ''), 400) || null } });
      if (!shown) return { say: `Couldn't put that code up (${problem}).` };
      const written = [...(st.guideWritten || []), { title: clip(String(body.title || 'Code'), 100), content: `\`\`\`${body.language || 'c'}\n${cut(String(body.code), 1500)}\n\`\`\`` }].slice(-6);
      saveState({ ...st, guideWritten: written, guideActive: null });
      return { say: `On the page, in an editor they can change and run:\n${cut(String(body.code), 1200)}\n${AFTER_TOOL}`, board: { id: `w${written.length}`, label: clip(String(body.title || 'Code'), 60), use: 'explain', show: { ...shown, title: clip(String(body.title || ''), 100) || undefined } } };
    }
    if (body.action === 'write' && Array.isArray(body.proof) && body.proof.length) { // a proof-writing space in sections, under its claim
      const { board: shown, problem } = checkBoard({ kind: 'zone', zone: { kind: 'proof', sections: body.proof, task: cut(String(body.markdown || ''), 400) || null } });
      if (!shown) return { say: `Couldn't open the proof space (${problem}).` };
      const written = [...(st.guideWritten || []), { title: clip(String(body.title || 'Proof'), 100), content: `${shown.zone.task || ''}\n[proof space: ${shown.zone.sections.join(', ')}]` }].slice(-6);
      saveState({ ...st, guideWritten: written, guideActive: null });
      return { say: `On the page: a proof space with sections ${shown.zone.sections.join(', ')}. What they write comes to you as [Student's page] while they work. ${AFTER_TOOL}`, board: { id: `w${written.length}`, label: clip(String(body.title || 'Proof'), 60), use: 'explain', show: { ...shown, title: clip(String(body.title || ''), 100) || undefined } } };
    }
    if (body.action === 'write' && body.question_kind) { // an interactive question: choice, select-all, order, match, a number or a short answer; their answer comes back to the voice
      // A choice or select-all comes with its answer key, so the page marks it at once with no turn of his (16 Oct, the user:
      // "make multiple choice questions have the answers preloaded in instead of having to prompt the instructor").
      const keyed = ['choice', 'multi_select'].includes(body.question_kind), same = x => String(x).trim().toLowerCase(), opts = (body.options || []).map(same);
      if (keyed && (!body.answers?.length || !String(body.explain || '').trim() || body.answers.some(a => !opts.includes(same(a))) || (body.question_kind === 'choice' && body.answers.length !== 1)))
        return { say: `Couldn't put that up: a ${body.question_kind} question needs answers (${body.question_kind === 'choice' ? 'the one correct option' : 'every correct option'}, copied exactly from options) and explain (why, and the trap). Write it again with them.` };
      const { board: shown, problem } = checkBoard({ kind: 'check', check: { kind: body.question_kind, prompt: cut(String(body.question || body.title || ''), 1500), options: body.options, items: body.items, left: body.left, right: body.right, ...(keyed ? { answers: body.answers, explain: cut(String(body.explain), 600) } : {}) } });
      if (!shown) return { say: `Couldn't put that question up: ${problem}. A choice or multi_select needs options (2+); order needs items; match needs left and right.` };
      const written = [...(st.guideWritten || []), { title: clip(String(body.title || 'Question'), 100), content: `${shown.check.prompt}\n${(shown.check.options || shown.check.items || shown.check.left || []).map(x => `- ${x}`).join('\n')}` }].slice(-6);
      saveState({ ...st, guideWritten: written, guideActive: null });
      return { say: `On the page, as an interactive ${body.question_kind} question: "${clip(shown.check.prompt, 300)}". ${keyed ? 'The page marks their answer from your key and shows your explain; it comes to you as a note, and you speak again when they write.' : 'Their answer comes back as "[Answered on the board] …": judge it yourself then.'} ${AFTER_TOOL}`, board: { id: `w${written.length}`, label: clip(String(body.title || 'Question'), 60), use: 'question', show: shown } };
    }
    if (body.action === 'write') { // the tutor's own board: a slide (title, points revealed as it talks, a diagram from data, text), instant
      const content = String(body.markdown || '').trim(), points = (body.points || []).map(x => String(x).trim()).filter(Boolean);
      const diagram = body.diagram_type ? { type: String(body.diagram_type).trim(), data: body.diagram_data ?? '' } : null;
      if (!content && !points.length && !diagram) return { say: 'Nothing to write: give markdown, points or a diagram.' };
      const { board: shown, problem } = checkBoard({ kind: 'markdown', title: clip(String(body.title || ''), 100), content: cut(content, 1390), steps: points, diagram });
      if (!shown) return { say: `Couldn't put that up: ${problem}. Fix it and write again.` }; // a diagram's data error, word for word, so it can be fixed
      const text = [shown.content, ...(shown.steps || []).map(x => `- ${x}`), shown.diagram ? `[${shown.diagram.type} diagram]` : null].filter(Boolean).join('\n');
      const written = [...(st.guideWritten || []), { title: shown.title, content: text }].slice(-6);
      // Whatever they answer next is about what he just put up, which he judges himself: no earlier problem stays "active"
      // (13 Oct: one made problem stayed active 85 minutes, and every later answer was "checked" against it).
      saveState({ ...st, guideWritten: written, guideActive: null });
      reviewLater(s, g, shown.title, text);
      // What went up, echoed: the voice always has its own exercise in front of it (13 Oct: "I can't see the rows I put on your page").
      return { say: `${content.length > 1390 ? 'On the page, cut at 1,400 characters (write the rest as a second board)' : 'On the page'}: "${shown.title || 'untitled'}"\n${cut(text, 1200)}${points.length > 1 ? '\nIts points appear one at a time as you finish each line: talk through them in order.' : ''}\n${AFTER_TOOL}`, board: { id: `w${written.length}`, label: shown.title || 'Written', use: 'explain', show: shown } };
    }
    if (body.action === 'make') return makeLater(s, g, String(body.about || '').trim());
    if (body.action === 'animate') return animateLater(s, String(body.idea || '').trim(), String(body.title || '').trim());
    if (body.action === 'circuit') return circuitNow(s, String(body.title || '').trim(), String(body.netlist || ''));
    if (body.action === 'kit') return kitNow(s, String(body.name || '').trim(), String(body.title || '').trim(), String(body.spec || ''));
    if (body.action === 'figure') return figureLater(s, String(body.idea || '').trim(), String(body.object || '').trim(), String(body.ready || '').trim());
    if (body.action === 'next') return nextProblem(s, g, String(body.about || '').trim());
    if (body.action === 'practice' && g?.study) return { say: 'Practice on this topic: show its tries and practice-prelim problems one at a time (show), then next_problem for more like them; when it is done, move_on.' }; // the study guide stays the path
    if (body.action === 'practice') {
      // Practice is a guide too (12 Oct replay: the arc engine ignored "a harder one" and drilled carries): the section's problems,
      // exam-like first, the tutor choosing each one by what they ask; answers checked behind, as in teaching.
      const about = String(body.about || '').trim();
      if (about) safe(() => S().changeTopic(s.id, about));
      const now = S().peek(s.id), goal = currentGoal(now.agenda);
      const g = goal?.topicIds?.length ? safe(() => guideCard(now, goal, { practice: true }), null) : null;
      if (!g?.guide?.questions?.length) return { say: 'No checked practice problems for this section yet: teach it, or try another section.' };
      const card = issue(S().peek(s.id), { ...g, goalId: goal.id, goalTitle: goal.title });
      saveState({ ...stateOf(S().peek(s.id)), guideAbout: about || null });
      prefetchHarder(S().peek(s.id)); // a harder one of the kind they asked for, made while they do the first
      return { say: `Practice set on ${g.guide.title}: ${g.guide.questions.length} problems, exam-style first. Give them one at a time.`, card: pageCard(fullCard(card)) };
    }
    fail('invalid_input', 'Unknown guide action.');
  }

  function firstCard(s, goal) {
    if (INTRO_MODES.has(goal.mode) && studyOf(scopeOf(s))) { // a study guide: no scripted intro, straight to its topics (13 Oct, the user); the voice asks what it needs
      db.prepare("UPDATE exams SET data = json_set(data, '$.introDoneAt', coalesce(json_extract(data, '$.introDoneAt'), ?), '$.lectureFrom', coalesce(json_extract(data, '$.lectureFrom'), 'start'), '$.introSkipped', json('true')) WHERE id = ?").run(new Date(clock.now()).toISOString(), scopeOf(s).examId);
      return null;
    }
    if (INTRO_MODES.has(goal.mode)) return introCard(s, goal);
    if (studyOf(scopeOf(s))) { const c = safe(() => studyCard(s, goal, studyStart(s, goal, studyOf(scopeOf(s)))), null); if (c) return c; } // the exam's study guide, when it has one
    if (guideMode(s, goal)) { const g = safe(() => guideCard(s, goal), null); if (g) return g; }
    const cm = cmOf(scopeOf(s)), covered = cm?.kcs?.filter(k => goal.kcIds?.length ? goal.kcIds.includes(k.id) : (goal.topicIds || []).includes(k.topicId)).map(k => k.id) || [];
    const resumed = priorArc(s, covered), kcId = resumed?.kc ?? targetKc(s, goal);
    if (!kcId) return covered.length ? null : fallbackFirst(s, goal); // every KC of it closed this session: the goal is done
    const ctx = contextFor(s, kcId);
    if (!ctx.kc) return fallbackFirst(s, goal);
    const kind = sessionKindFor({ asked: stateOf(s).askedKind ?? null, goalMode: goal.mode, operative: ctx.st?.operative || [], due: (ctx.st?.due ?? 0) >= 0.8, prefersReading: (safe(() => ctx.traits?.whatWorks?.('read', ctx.kind)?.mean, 0) ?? 0) > 0.3 });
    const n = next(resumed ? { ...resumed, resumed: true } : planArc({ kc: ctx.kc, sessionKind: kind, crunch: crunchOf(scopeOf(s)) }), ctx);
    if (!n.act) return null;
    const cut = /…$/.test(goal.title || ''), section = safe(() => K().view(scopeOf(s), s.pinnedKnowledgeManifestId).topics.find(t => t.topicId === ctx.kc.topicId)?.title, null); // a clipped title reads as nonsense: the section's name instead
    const what = String(cut && section ? `${stateOf(s).arc?.topicId === ctx.kc.topicId ? 'more on ' : ''}${section}` : goal.title || atWord(firstSentence(ctx.kc.statement), 60)).replace(/[.!?…]$/, '');
    const reason = resumed ? `Picking up where we left off: ${what}.` : `${stateOf(s).n > 0 ? 'Next' : 'Today'}: ${what}${!goal.why ? '.' : /^you /i.test(goal.why) ? `, since ${goal.why.replace(/[.!?]$/, '')}.` : `. ${goal.why[0].toUpperCase()}${goal.why.slice(1).replace(/[.!?]$/, '')}.`}`;
    return { ...cardFor(s, { act: n.act, rule: 13, helpLevel: 0, arc: n.arc }, { reason, first: true, goal }), goalId: goal.id, goalTitle: goal.title };
  }
  /** The intro: get_to_know asks what is still unknown; diagnose serves learner.coldStart's probes (else one basic question per unit). */
  function introCard(s, goal) {
    const it = { asked: [], units: {}, items: [], ...stateOf(s).intro }, scope = scopeOf(s);
    if (goal.mode === 'get_to_know') { const key = safe(() => S().unknown(s.id), []).find(k => !it.asked.includes(k)); return key ? knowCard(goal, key, { first: !it.asked.length }) : null; }
    if (goal.mode !== 'diagnose') return null;
    const cm = cmOf(scope);
    if (cm?.kcs?.length) {
      const probe = it.items.length < 12 ? safe(() => L().coldStart?.(scope), null) : null, item = itemById(cm, probe?.itemId);
      if (!item || it.items.includes(item.id)) return null;
      const ctx = contextFor(s, item.kc);
      return diagnosticCard(goal, buildCard({ act: 'diagnostic', helpLevel: 0 }, { ...ctx, item, first: !it.items.length }), { item, why: probe.why || 'maximum information, spine first', at: it.items.length + 1 });
    }
    const i = goal.topicIds.findIndex(u => !it.units[u]);
    if (i < 0) return null;
    const title = safe(() => K().view(scope, s.pinnedKnowledgeManifestId).topics.find(t => t.topicId === goal.topicIds[i])?.title, null) || 'this part of the course';
    return unitCard(goal, { id: goal.topicIds[i], title }, safe(() => S().basicQuestion(s.id, goal.topicIds[i]), null), { at: i + 1, of: goal.topicIds.length });
  }
  /** No course model yet: a first card from the course's own notes on the goal's topic; the card says so. */
  function fallbackFirst(s, goal) {
    const scope = scopeOf(s), topic = goal.topicIds?.[0];
    const found = safe(() => K().retrieve(scope, s.pinnedKnowledgeManifestId, { topicIds: topic ? [topic] : [], objectiveVersionIds: [], anchorIds: [], query: goal.title, relationTypes: [], reason: 'fallback card', maxTokens: 1200 }).excerpts[0], null);
    const show = found ? { kind: 'notes', query: goal.title, quote: clip(found.text, 600), lecture: safe(() => K().sourceTitle(scope, found.sourceVersionId), null) } : null;
    const card = { move: 'probe', act: 'first_step', helpLevel: 0, target: fallbackTarget(s, goal), intention: `Find out where they stand on "${goal.title}", from their notes`, verdict: null, wait: 'reasoning', show,
      say: show ? `Today: ${goal.title}. Here's what your notes say about it.` : `Today: ${goal.title}.`, ask: show ? "What's the main idea there, in a sentence?" : `What do you already know about ${goal.title}?`,
      neutral: 'Say a bit more.', handBack: 'In a sentence: what is the main idea?', expect: [{ kind: 'stuck', when: "stuck, or \"I don't know\"", reply: "That's fine: what's one word or idea you recognise?" }], persona: null, withheld: {}, item: null,
      why: `No course model is built for this course yet, so this is taught from the notes' topic "${goal.title}" (the knowledge graph's fallback).`, source: 'fallback', goalId: goal.id, goalTitle: goal.title, arcAfter: null };
    return checkCard(card).card;
  }
  /** The current goal's card 1. An intro goal with nothing left is done first; with no goal open, what they need next. */
  function opening(s) {
    for (let i = 0; i < 8; i++) {
      const goal = currentGoal(s.agenda);
      if (!goal) { if (!s.agenda || !S().nextByNeed(s.id, { byNeed: ['exam_practice', 'consolidate'].includes(stateOf(s).arc?.sessionKind) })) return null; s = S().peek(s.id); continue; } // the next section in lecture order; by need only in review and exam practice
      safe(() => U().prefer?.(scopeOf(s), [...new Set([...(goal.topicIds || []), ...S().inOrder(scopeOf(s), K().view(scopeOf(s), s.pinnedKnowledgeManifestId)).map(n => n.topicId)])].slice(0, 2 * PREFER_AHEAD))); // the topic they're on, then the sections after it, are studied next
      const card = safe(() => firstCard(s, goal), null);
      if (card) { pregen(s, card.target?.kc); return { ...card, goalId: goal.id, goalTitle: goal.title }; }
      S().advance(s.id, goal.id, 'Nothing left to ask.'); s = S().peek(s.id);
    }
    return null;
  }

  // ---------- issuing: follow-ups prepared for every branch, state moved, the page and the voice told ----------
  /**
   * Speculation (spec §16): before a card goes out, the follow-up for each branch the voice can match (correct, each wrong
   * model, stuck; a reading's done and skip) is decided by the policy on that verdict and built, so a literal answer
   * gets its next card at once. Cards with no course model behind them prepare nothing.
   */
  function prepare(s, card) {
    if (!card.arcAfter?.kc) return card;
    const expect = card.expect.map(b => ({ ...b, then: { ...b.then } }));
    for (const b of expect.filter(x => ['correct', 'valid_nonstandard', 'wrong_model', 'stuck', 'done', 'skip'].includes(x.kind) && !x.then.cardId)) {
      const v = ['done', 'skip'].includes(b.kind) ? null : { value: b.kind === 'stuck' ? 'stuck' : b.kind === 'wrong_model' ? 'wrong_model' : 'correct', wrongModelHits: b.wrongModel ? [{ id: b.wrongModel, p: 0.9 }] : [], byValue: !!b.wrongModel, reasoning: false, hedged: false, spoken: true, trust: 1 }; // a literal match is exact; a model's value is a candidate
      const d = v ? safe(() => decide(v, { ...card.arcAfter, lastAnswer: b.literal ?? card.arcAfter.lastAnswer }, contextFor(s, card.arcAfter.kc, { card, answered: b.kind === 'wrong_model' && b.literal && card.item ? { cardId: card.id } : null })), null) : { rule: 13, act: 'after_reading', helpLevel: card.helpLevel, arc: { ...card.arcAfter, slots: (card.arcAfter.slots || []).filter((x, i) => !(i === 0 && x === 'after')) } };
      if (!d?.act) continue;
      const nextCard = safe(() => cardFor(s, d, { prev: card, verdict: v ? { ...v, value: d.suspected && v.value === 'wrong_model' ? 'incorrect' : v.value, wrongModel: d.wrongModel ?? b.wrongModel ?? null, suspected: !!d.suspected, errorKind: d.errorKind ?? null } : null, goal: goalOf(s, card.goalId) }), null);
      if (!nextCard) continue;
      const id = newId('card');
      putCard(scopeOf(s), { ...nextCard, id, sessionId: s.id, n: null, goalId: card.goalId, goalTitle: card.goalTitle, preparedFor: { cardId: card.id, branchId: b.id, rule: d.rule, act: d.act, hold: !!d.hold, unattributed: !!d.unattributed } });
      b.then.cardId = id;
    }
    // A stated belief caught by the detector (not a literal) gets its repair from here too: the KC's likeliest wrong models
    // that no literal branch covers, each with its repair card prepared now.
    const detect = [];
    for (const w of beliefsFor(s, card).filter(x => !expect.some(b => b.wrongModel === x.id)).slice(0, 3)) {
      const v = { value: 'wrong_model', wrongModelHits: [{ id: w.id, p: 0.75 }], stated: true, reasoning: false, hedged: false, trust: 0.75 }; // as sure as the detector's match (rule 7: hedged)
      const d = safe(() => decide(v, { ...card.arcAfter, lastAnswer: null }, contextFor(s, card.arcAfter.kc, { card })), null); // their words aren't known yet: no contrast on them
      const nextCard = d?.act ? safe(() => cardFor(s, d, { prev: card, verdict: { ...v, value: null, utterance: 'belief', wrongModel: w.id, errorKind: d.errorKind ?? null }, goal: goalOf(s, card.goalId) }), null) : null;
      if (!nextCard) continue;
      const id = newId('card');
      putCard(scopeOf(s), { ...nextCard, id, sessionId: s.id, n: null, goalId: card.goalId, goalTitle: card.goalTitle, preparedFor: { cardId: card.id, wrongModel: w.id, rule: d.rule, act: d.act, hold: false } });
      detect.push({ wrongModel: w.id, cardId: id });
    }
    return { ...card, expect, detect };
  }
  /** A card goes out: follow-ups prepared, the state pointing at it (and its arc), `card.issued` with the voice's text. */
  /** A spoken sentence as remembered for the session ("never said twice"): its words, lowered; short frames ("Now a new case.") don't count. */
  const sentenceKey = x => { const w = normLine(x); return w.split(' ').length >= 5 ? hashOf(w).slice(-12) : null; };
  /**
   * A card goes out: follow-ups prepared, the state pointing at it (and its arc), `card.issued` with the voice's text. Nothing
   * already said in this session is said again (decisive3: the same contrast three times): a sentence of its say said before is
   * dropped. `revision`: a late revision that would add nothing new is not issued at all (null), so it never replaces a card.
   */
  function issue(s, card, { respondsTo = null, revision = false } = {}) {
    const scope = scopeOf(s), st = stateOf(s), n = st.n + 1, said = new Set(st.saidKeys || []);
    const parts = sentencesOf(card.say || ''), dropped = parts.filter(x => !said.has(sentenceKey(x)) || (card.frame || []).includes(x)); // a reading's frame is said every time
    if (revision && !dropped.some(x => sentenceKey(x))) return null;
    // A sentence said before never goes out again (decisive9: the "never strip substance" exception re-issued a refutation word
    // for word). The builders choose new substance (a new case, another true sentence), so what is dropped here is only a repeat.
    const kept = dropped;
    if (kept.length !== parts.length) card = { ...card, say: kept.join(' ') };
    let show = card.show;
    if (show?.kind === 'question') { const question = safe(() => S().offerQuestion(s.id, show.questionId), null); show = question ? { kind: 'question', questionId: show.questionId, question } : null; }
    const id = card.id && !getCard(scope, card.id)?.issuedAt ? card.id : newId('card');
    const arcAfter = card.arcAfter ? { ...card.arcAfter, ...(card.arcAfter.taught?.act === card.act ? { taughtCard: id } : {}) } : null;
    const recent = st.neutrals || [], neutral = NEUTRALS.includes(card.neutral) && recent.includes(card.neutral) ? NEUTRALS.find(x => !recent.includes(x)) ?? card.neutral : card.neutral; // only the generic lines rotate
    const issued = prepare(s, { ...card, neutral, show, id, arcAfter, sessionId: s.id, n, issuedAt: clock.iso(), respondsTo });
    putCard(scope, issued);
    if (issued.show?.kind === 'reading' && issued.show.portion?.id) saveState({ ...stateOf(s), readIds: [...new Set([...(stateOf(s).readIds || []), issued.show.portion.id])] });
    // A delivered repair is recorded at once (§10: no evidence is dropped): the model moves to addressed whatever they say next
    // (decisive6: a worked example's answer left no observation, so the model stayed confirmed and was repaired again). Rank 5,
    // no outcome: θ is untouched; the next answer's observation names the same card, so the repair counts once.
    const repaired = issued.verdict?.wrongModel;
    if (repaired && !issued.verdict?.suspected && issued.arcAfter?.repair?.wrongModel === repaired && (ACT[issued.act]?.move === 'repair' || issued.act === 'worked_example') && provenFalse(s, repaired) && issued.target?.kc)
      safe(() => observe(scope, { kcs: [issued.target.kc], family: issued.item?.family || 'E5', regime: 'R1', rank: 5, outcome: null, wrongModelHits: [], repairs: repaired, source: 'engine', sessionId: s.id, cardId: issued.id, helpLevel: issued.helpLevel ?? 0 }), null);
    pageCompare(s, issued);
    saveState({ ...stateOf(s), cardId: issued.id, n, goalId: issued.goalId, arc: arcAfter ?? st.arc ?? null, neutrals: [...recent, neutral].filter(Boolean).slice(-4), saidKeys: [...(st.saidKeys || []), ...kept.map(sentenceKey).filter(Boolean)].slice(-120), shownCases: issued.contrast?.itemId ? [...new Set([...(st.shownCases || []), issued.contrast.itemId])].slice(-60) : st.shownCases ?? [] });
    const out = pageCard(fullCard(issued));
    // respondsTo: the learner's line this card answers. Nobody has spoken since? Then it is Plato's turn now (the verified verdict, the next move).
    S().emit(s.id, 'card.issued', { card: out, text: safe(() => agent.actorCard?.(out) ?? null, null), respondsTo });
    return issued;
  }
  function start(s) { const card = opening(s); return card ? pageCard(fullCard(issue(S().peek(s.id), card))) : null; }
  const current = (s, { full = false } = {}) => { const c = getCard(scopeOf(s), stateOf(s).cardId); return c ? (full ? fullCard(c) : pageCard(fullCard(c))) : null; };

  // ---------- a turn: hold, verify, observe, decide, issue ----------
  /** What a line is by its words alone (instant): a request, a claim, frustration, a question, no attempt, reasoning shown, hedges. */
  function lexicon(text, response) {
    return { request: REQUEST.find(([, re]) => re.test(text))?.[0] ?? null, kindAsked: KIND_ASKED.find(([, re]) => re.test(text))?.[0] ?? null, claims: CLAIMS.test(text), frustrated: FRUSTRATED.test(text),
      question: QUESTION.test(text) && !valuesOf(text).size, noAttempt: NO_ATTEMPT.test(text), stuck: STUCK.test(text) && !valuesOf(text).size,
      reasoning: REASONING.test(text) || text.split(/\s+/).length >= 12, hedged: HEDGE.test(text) || (response?.hedges || []).length > 0 || /\?\s*$/.test(text) };
  }
  /** The light model's reading of a line the words didn't settle (CLASSIFIED v4); null when it fails or is late. */
  /** The light reading of a line: one call per session, card and line, kept while it runs and after (a failed one is not kept). */
  function classifying(s, card, response, said, beliefs = []) {
    const key = `${s.id}|${card.id}|${normLine(response.text)}`;
    if (!typed.has(key)) {
      const p = Promise.resolve().then(() => call(x => app.providers.directorWriter.classify(x), { work: workIdentity({ scope: scopeOf(s), idempotencyKey: `classify:${response.id}`, input: { card: card.id, answer: response.text }, clock }), question: card.ask, asked: said, problem: card.item ? clip(itemById(cmOf(scopeOf(s)), card.item.id)?.prompt, 600) || null : null, idea: card.target?.statement ? atWord(card.target.statement, 300) : null, beliefs: beliefs.map(w => ({ id: w.id, belief: atWord(w.belief, 260) })), branches: card.expect.map(({ id, kind, when }) => ({ id, kind, when })), answer: response.text }, { valueSchema: CLASSIFIED, what: 'answer classification' })).then(r => r?.outcome === 'ok' ? r.value : null, () => null);
      typed.set(key, p); if (typed.size > TYPED_MAX) typed.delete(typed.keys().next().value);
      p.then(value => { if (!value && typed.get(key) === p) typed.delete(key); });
    }
    return typed.get(key);
  }
  /** The light reading within the quick path (CLASSIFY_MS), else null: a later one is attached when it lands (lateMatch). */
  const classify = (...args) => within(classifying(...args), CLASSIFY_MS);
  /** The verifier (understanding.verify), uncapped: the turn waits for it only within the quick path; a later verdict is attached (binding rule 2). */
  // The line's channel, for V10: writing read from the page, a typed answer to an input, a recognized transcript, or unknown (a plain line).
  const verifyItem = (scope, itemId, answer, response = null) => Promise.resolve().then(() => U().verify(scope, { itemId, answer, channel: response?.drawing ? 'written' : response?.structuredAnswer ? 'typed' : response?.viaAsr ? 'speech' : null, asrConfidence: response?.drawing ? null : response?.confidence ?? null })).catch(() => null);
  /** What the actor actually said last before this answer, or null. */
  function actorLast(s) {
    const d = safe(() => S().dialogue(s.id), []), i = d.map(x => x.speaker).lastIndexOf('student');
    return [...d.slice(0, i < 0 ? d.length : i)].reverse().find(x => x.speaker === 'tutor' && !/^\[On the page\]/.test(x.text))?.text ?? null;
  }

  /**
   * The verdict on a line (spec §13 rule 1). Step 1 is what kind of utterance it is, before any correctness check: an
   * answer or attempt, partial work, a request, a claim of understanding, a question, being stuck, or chit-chat (not an
   * answer yet is the hold rule, before this). Common forms are matched exactly by their words; the light classifier
   * reads the rest. Only an answer or partial work goes to understanding.verify: nothing else is ever `incorrect`.
   * `utterance` rides on the verdict and on state().last, for the evals.
   */
  async function verdictOf(s, card, response, st) {
    const text = String(response.text ?? '').trim(), lex = lexicon(text, response), scope = scopeOf(s), page = st.page?.[card.id];
    const v = { value: null, utterance: null, trust: null, wrongModelHits: [], reasoning: lex.reasoning, hedged: lex.hedged, request: null, frustrated: lex.frustrated, question: false, kindAsked: lex.kindAsked, how: 'words', spoken: false, branch: null, topicRequest: null };
    const is = (utterance, value, extra = {}) => ({ ...v, utterance, value, ...extra });
    if (page && card.show?.task && ['predict', 'construct', 'teach'].includes(card.show.task.mode)) {
      claimHeld(s, card.id, response.id); // the page's row for this attempt carries this line's response id
      const wms = page.value === 'incorrect' && !page.wrongModel ? beliefsFor(s, card, text) : [], cls = wms.length && !(valuesOf(text).size && text.split(/\s+/).length <= 6) ? await classify(s, card, response, actorLast(s), wms) : null;
      const stated = cls?.beliefSure && !cls.agrees && wms.find(w => w.id === cls.wrongModelId);
      return stated ? is('belief', 'wrong_model', { wrongModelHits: [{ id: stated.id, p: 0.75 }], stated: true, statedKc: stated.kc, detector: true, how: 'page+detector', trust: 1, page: true }) : is('answer', page.value, { wrongModelHits: page.wrongModel ? [{ id: page.wrongModel, p: 0.9 }] : [], byValue: !!page.wrongModel, trust: 1, how: 'page', page: true });
    }
    // A line this session already matched (a catalogued wrong model or a claim) is matched the same way again, with no model call;
    // their claims this session join the beliefs, so a rewording matches by meaning.
    const remembered = (st.said || []).find(x => x.kc === card.target?.kc && x.norm === normLine(text) && (!x.claim || claimJudged(s, x.id) === true)) ?? null; // the same proposition, said again
    const known = Object.entries(st.claimWords || {}).filter(([id]) => id.startsWith(`cand:${card.target?.kc}:`) && claimJudged(s, id) !== false).slice(-4).map(([id, claim]) => ({ id, kc: card.target.kc, belief: claim, errorKind: 'F5', candidate: true }));
    // A prediction said aloud on an element's checkpoint is an attempt: checked at once by the element's own engine (never dropped).
    // A line whose value is already judged (an element's check, a literal) still goes to the matching when it says more (§13
    // rule 3: one matching path), within the quick path: a wrong value's repair needs the diagnosis, and a right one's reason
    // decides its move (decisive8: "0x1004, since adding 3 to p adds 3 bytes" heard "Yes, that is it"). A right answer keeps its
    // verdict; a wrong model or a claim its reason states rides on it (`reason`): the move confirms the answer and meets the reason.
    const alsoMatch = async (r, more) => {
      if (r.wrongModelHits?.length || !more || !card.target?.kc) return r;
      const right = ['correct', 'valid_nonstandard'].includes(r.value), how = `${r.how}+reason`;
      if (right && remembered) return { ...r, reason: true, wrongModelHits: [remembered.claim ? claimHit(s, { id: remembered.id }, 0.75) : { id: remembered.id, p: 0.75 }], candidate: remembered.claim ? { id: remembered.id, claim: remembered.claim, kc: remembered.kc } : null, how: `${how}:remembered` };
      const found = [...beliefsFor(s, card, text), ...(right ? known : [])], m = markerHit(text, found), wms = m ? [m, ...found.filter(w => w !== m)] : found;
      if (!right) r.verifiedWrong = true; // checked wrong already (the element's engine): the reading's best match names it, sure or not
      const cls = await classify(s, card, response, actorLast(s), wms);
      if (!cls) { // no reading yet: it is attached when it lands (lateMatch); the marker stands in, a hypothesis for a right answer's reason
        r.lateCls = classifying(s, card, response, actorLast(s), wms); r.wms = wms;
        if (!m || m.candidate) return r;
        if (right) return { ...r, reason: true, wrongModelHits: [{ id: m.id, p: 0.5 }], how: `${how}:marker` };
        mark(response.id); return { ...r, value: 'wrong_model', wrongModelHits: [{ id: m.id, p: 0.5 }], detector: true, how: `${r.how}+marker` };
      }
      const hit = cls.wrongModelId && !cls.agrees ? wms.find(w => w.id === cls.wrongModelId) : null, own = hit?.candidate ? { id: hit.id, claim: hit.belief, kc: hit.kc } : null;
      const claim = own ?? (!hit && cls.contradicts && !cls.agrees && ownClaim(cls.claim, text) ? candidateOf(card.target.kc, cls.claim) : null), p = cls.beliefSure ? 0.75 : 0.6;
      if (right) return hit || (claim && claimJudged(s, claim.id) !== false) ? { ...r, reason: true, wrongModelHits: [claim ? claimHit(s, claim, p) : { id: hit.id, p }], candidate: claim, reasoning: true, how: `${how}:detector` } : r;
      return hit || claim ? { ...r, value: 'wrong_model', wrongModelHits: [{ id: hit?.id ?? claim.id, p }], candidate: claim, detector: true, how: `${r.how}+detector` } : r;
    };
    // A reply to a revoicing (§13 rule 9): their "yes" confirms the claim as theirs; the case follows. Anything else is read.
    // A reply to a revoicing (§13 rule 9). "Yes" confirms the claim as theirs; "no" or a correction drops it (the correction is
    // read as new content); a hedge, an acknowledgement or a few words take it as tentative: the case comes at once, and their
    // answer on it decides (decisive7: "kind of? not totally sure" left the arc with no card).
    if (card.act === 'revoice' && card.revoice && String(card.verdict?.wrongModel ?? '').startsWith('cand:')) {
      const c = { id: card.verdict.wrongModel, claim: card.revoice, kc: card.target?.kc };
      if (DENY.test(text)) { setClaim(s, c.id, false); if (text.replace(/[^\p{L}\p{N}\s']/gu, ' ').trim().split(/\s+/).length <= 4) return is('answer', 'answered', { how: 'revoice:denied' }); }
      else if (AFFIRM.test(text) && !TENTATIVE.test(text)) return is('belief', 'wrong_model', { wrongModelHits: [claimHit(s, c, 0.75)], stated: true, confirmedClaim: true, candidate: c, statedKc: c.kc, how: 'revoice:confirmed' });
      else if (TENTATIVE.test(text) || ACK.test(text) || NOISE.test(text) || text.split(/\s+/).length <= 3) return is('answer', 'tentative_claim', { claimId: c.id, how: 'revoice:tentative' });
    }
    const said = spokenPrediction(card, text);
    if (said) { const b = match(card, text), exact = !!b?.literal && alone(text, b.literal); return alsoMatch(is('answer', said.value, { wrongModelHits: said.wrongModel ? [{ id: said.wrongModel, p: 0.9 }] : [], byValue: !!said.wrongModel, trust: 1, how: 'engine', element: said, spoken: exact }), !exact && text.split(/\s+/).length >= 6); } // the voice said its verdict only on an exact literal
    // 1. The utterance type, by its words (instant). A literal answer is an attempt, and a request in the same line still leads the move.
    const branch = match(card, text);
    // The answer a wrong model computes for this item ("1003" where the key gives 1012): that model, at once (rule 8 then shows both).
    const computedItem = !branch && card.item ? itemById(cmOf(scope), card.item.id) : null, computed = computedItem ? computedHit(computedItem, text) : null;
    if (computed) return is('answer', 'wrong_model', { wrongModelHits: computed, byValue: true, trust: computedItem.verification?.ok ? 1 : 0.9, how: 'computed', request: lex.request });
    // A literal branch is the voice's ("If exactly") only when the line is the answer alone (decisive8): with a reason attached,
    // the voice waits and the engine's card decides, the reason matched first.
    if (branch && ['correct', 'valid_nonstandard', 'wrong_model'].includes(branch.kind)) { const only = alone(text, branch.literal); return alsoMatch(is('answer', branch.kind, { wrongModelHits: branch.wrongModel ? [{ id: branch.wrongModel, p: 0.9 }] : [], byValue: !!branch.wrongModel, trust: 1, how: only ? 'exact' : 'exact+said', spoken: only, branch, request: lex.request }), !only); }
    if (lex.request || lex.kindAsked) return is('request', 'request', { request: lex.request ?? 'kind' });
    if (lex.claims) return is('claim', 'claims_understanding');
    if (lex.stuck || branch?.kind === 'stuck') return is('stuck', 'stuck', branch ? { branch, spoken: true, how: 'exact' } : {});
    if (lex.noAttempt) return is('request', 'no_attempt');
    if (CHAT.test(text)) return is('chat', 'question', { question: true });
    if (ACK_ONLY.test(text)) return is('chat', 'question', { question: true, how: 'ack' }); // never judged as an answer; the never-silent guard re-asks
    if (lex.question) return is('question', 'question', { question: true });
    if (!card.ask && !card.item && !card.explains) return is('answer', 'answered'); // an explanation is content: it goes to the matching
    // 2. On the quick path, in parallel: the light classifier (what the line is, any request, and which of the KC's known wrong
    // beliefs it states: the rubric detector after the marker prefilter) and, for a possible attempt, the verifier.
    const t0 = Date.now(), found = [...beliefsFor(s, card, text), ...known], marked = markerHit(text, found), wms = marked ? [marked, ...found.filter(w => w !== marked)] : found; // the marker prefilter's candidate first
    const verifying = card.item && !lex.question ? verifyItem(scope, card.item.id, text, response) : null;
    const caseJudging = !card.item && card.explains && (card.contrast?.from === 'case' || card.act === 'summary') && !lex.question ? judgeReply(s, card.target?.kc, card.explains, text) : null; // a reply to a course case, or a summary: judged against the case's text, or the KC's
    const short = valuesOf(text).size > 0 && text.split(/\s+/).length <= 6; // "-7", "is it 0x1F?": an attempt by its words, nothing to classify
    // The light reading (one call per session, card and line). A short value on a question is an attempt by its words, with
    // nothing for the reading to match: only the verifier checks it, against the key and the models' computed answers.
    const reading = remembered ? null : classifying(s, card, response, actorLast(s), wms); // a bare value's reading too: a hypothesis at most (below)
    const cls = remembered ? null : card.item && short ? { kind: 'answer', reasoning: lex.reasoning, wrongModelId: null, words: true } : await within(reading, CLASSIFY_MS);
    // Not read within the quick path: the same reading is attached when it lands, and can revise the move (lateMatch).
    if (!cls && !remembered) { v.lateCls = reading; v.wms = wms; }
    // Utterance type first (decisive13: "hi, can we work on reading primary sources?" was judged incorrect by the verifier when the
    // reading ran late): a greeting, a request or a question by its words is never an attempt.
    if (!cls && !remembered && !short && (GREETING.test(text) || REQUEST_FORM.test(text) || QUESTION.test(text.replace(GREETING, '').trim()))) return is('chat', 'question', { question: true, how: 'words' });
    // A change of topic only when it names another topic of the course; a session kind only when it changes the kind; a
    // request for the material in play is a reading; anything else they ask for is the voice's (chat), not a move.
    if (cls?.topicRequest) {
      const t = safe(() => matchTopic(K().view(scope, s.pinnedKnowledgeManifestId), cls.topicRequest), null), goal = currentGoal(s.agenda);
      if (t && !(goal?.topicIds || []).includes(t.topicId)) return is('request', 'request', { request: 'topic', topicRequest: cls.topicRequest, how: 'model' });
      if (/\b(read|text|passage|source|document|packet|notes|reading|wording)\b/i.test(`${text} ${cls.topicRequest}`)) return is('request', 'request', { request: 'read', how: 'model' });
      return is('chat', 'question', { question: true, how: 'model' });
    }
    const newKind = cls?.sessionKind && cls.sessionKind !== (st.arc?.sessionKind ?? 'learn') ? cls.sessionKind : null;
    if (cls?.request || newKind) return is('request', 'request', { request: cls.request ?? 'kind', kindAsked: newKind ?? v.kindAsked, how: 'model' });
    // 3. A stated belief is a diagnosis (binding rule 3): the detector's match (the classifier's, else the marker alone when it
    // is unavailable) is a wrong model at once, repaired by its kind, with the card prepared for it. A verifier already back
    // with "correct" overrules the label; a verdict still coming is attached when it lands.
    const matched = (cls?.wrongModelId && cls.beliefSure && !cls.agrees && wms.find(w => w.id === cls.wrongModelId)) || null, ownMatch = matched?.candidate ? { id: matched.id, claim: matched.belief, kc: matched.kc } : null; // a rewording of a claim of theirs: that candidate
    const stated = (remembered && !remembered.claim ? { id: remembered.id, kc: remembered.kc } : null) || (ownMatch ? null : matched) || (!cls && !remembered && marked && !marked.candidate ? marked : null) || null;
    if (stated) {
      const done = verifying ? await within(verifying, Math.max(0, QUICK_MS - (Date.now() - t0))) : null;
      if (done?.verdict === 'incorrect' && (done.wrongModelHits || []).some(h => h.p >= 0.5)) { const [value, extra] = valueOf(s, card, done); return is('answer', value, { ...extra, byValue: true, trust: done.trust, how: `verifier:${done.provenance?.by ?? '?'}`, reasoning: cls?.reasoning ?? v.reasoning }); } // a decisive verifier's own hits win
      if (!['correct', 'valid_nonstandard'].includes(done?.verdict)) return is('belief', 'wrong_model', { wrongModelHits: [{ id: stated.id, p: cls || remembered ? 0.75 : 0.5 }], stated: true, statedKc: stated.kc, detector: true, how: remembered ? 'detector:remembered' : cls ? 'detector:model' : 'detector:marker', reasoning: cls?.reasoning ?? v.reasoning, late: done ? null : verifying });
    }
    // A claim that contradicts the idea in play but no catalogued belief names (spec §7 stage 12: a candidate): refuted as a false belief now.
    const own = c => ownClaim(c, text); // the claim restates their words, never a comment on them
    const flagged = !stated && !ownMatch && cls?.contradicts && cls.beliefSure && !cls.agrees && cls.claim && own(cls.claim) && card.target?.kc ? candidateOf(card.target.kc, cls.claim) : null;
    const candidate = remembered?.claim ? { id: remembered.id, claim: remembered.claim, kc: remembered.kc } : ownMatch ?? (flagged && claimJudged(s, flagged.id) !== false ? flagged : null); // judged supported: no belief
    if (candidate) {
      const done = verifying ? await within(verifying, Math.max(0, QUICK_MS - (Date.now() - t0))) : null;
      if (!['correct', 'valid_nonstandard'].includes(done?.verdict)) return is('belief', 'wrong_model', { wrongModelHits: [claimHit(s, candidate, 0.75)], verifiedWrong: done?.verdict === 'incorrect' || undefined, stated: true, candidate, statedKc: candidate.kc, detector: true, how: remembered ? 'detector:remembered' : 'detector:claim', reasoning: cls?.reasoning ?? v.reasoning, late: done ? null : verifying });
    }
    if (cls?.kind === 'request') return is('chat', 'question', { question: true, how: 'model' });
    if (cls?.kind === 'claims') return is('claim', 'claims_understanding', { how: 'model' });
    if (cls?.kind === 'stuck') return is('stuck', 'stuck', { how: 'model' });
    if (cls && ['question', 'chat'].includes(cls.kind)) return is(cls.kind, 'question', { question: true, how: 'model' });
    const type = cls?.kind === 'partial' ? 'partial' : 'answer', reasoning = cls?.reasoning ?? v.reasoning;
    // The reading failed (under load) on a long line with nothing to check. On a card with an item it is never judged, for it may
    // be no answer; on any other card it answered the card's ask: no verdict, and the next move goes out, so a card it didn't
    // answer never stays the voice's script (decisive3 bio P4: a correct line left the stale contrast card in place).
    if (!cls && !valuesOf(text).size && text.split(/\s+/).length > 14 && card.item) return is('answer', 'unverified', { how: 'unclassified', late: verifying }); // not judged now; rule 12's check follows, and the verdict is recorded if the late reading finds an attempt
    // A reply to a course case (decisive11b): the calibrated judge, within the quick path, finds it gives the course's account →
    // confirmed, specifically; else rule 8 on it: their words against the course's own account of that case, then a new case.
    if (caseJudging && card.act === 'summary') { const j = await within(caseJudging, Math.max(0, QUICK_MS - (Date.now() - t0))); return j?.outcome === 1 ? is(type, 'correct', { trust: j.trust, reasoning: true, how: 'judge:summary', caseJudging }) : is(type, 'answered', { reasoning, how: j ? 'judge:summary' : 'judge:summary:pending', caseJudging }); } // a summary judged right closes the arc confirmed (decisive12)
    if (caseJudging) { const j = await within(caseJudging, Math.max(0, QUICK_MS - (Date.now() - t0))); return j?.outcome === 1 ? is(type, 'correct', { trust: j.trust, account: true, reasoning: true, how: 'judge:case', caseJudging }) : is(type, 'answered', { caseReply: true, reasoning, how: j ? 'judge:case' : 'judge:case:pending', caseJudging }); }
    if (!card.item) { const b = cls?.branchId ? card.expect.find(x => x.id === cls.branchId) : null; return is(type, b && ['correct', 'wrong_model', 'stuck'].includes(b.kind) ? b.kind : 'answered', { branch: b ?? null, reasoning, how: cls ? 'model' : 'words', wrongModelHits: b?.wrongModel ? [{ id: b.wrongModel, p: 0.7 }] : [] }); }
    // 4. The verifier, for an attempt, waited for only within the quick path: never block the move on it (binding rule 2).
    const checked = await within(verifying, Math.max(0, QUICK_MS - (Date.now() - t0)));
    if (!checked) return is(type, 'pending', { how: 'verifier_pending', reasoning, late: verifying, cls: cls?.words ? null : cls, wms, short, lateCls: v.lateCls ?? (short ? reading : null), wrongModelHits: marked && (!cls || cls.words) ? [{ id: marked.id, p: 0.5 }] : [] }); // a reading that didn't find it overrules the marker
    const [value, extra] = valueOf(s, card, checked, type), by = checked.provenance?.by ?? '?';
    // Right answer, wrong reason (decisive8): a value verified right whose reason states a wrong model, or a claim of theirs, keeps
    // its verdict, and the reason's match rides on it: the move confirms the answer and meets the reason. An explanation judged
    // right is its own reason: the judge's verdict stands.
    const reasonHit = ['correct', 'valid_nonstandard'].includes(value) && !short && card.expect.some(b => b.kind === 'correct' && b.literal) ? (stated ? { id: stated.id, p: cls || remembered ? 0.75 : 0.5 } : candidate ? claimHit(s, candidate, 0.75) : null) : null;
    if (reasonHit) return is(type, value, { ...extra, wrongModelHits: [reasonHit], reason: true, candidate: stated ? null : candidate, trust: checked.trust, how: `verifier:${by}+reason`, reasoning: true });
    // Matching runs unless the verifier said correct or named the wrong model (§13 rule 3): a wrong answer it didn't name is
    // named by the reading or the marker. The verifier settled that it is wrong, so the reading's best match counts unsure.
    // A bare value ("7") says no belief: the reading can only guess which model computes it, so its match is a hypothesis
    // (p 0.5), which the separating probe tests, never repairs (decisive2: two false diagnoses from "7").
    if (checked.verdict === 'incorrect' && !(extra.wrongModelHits || []).some(h => h.p >= 0.3) && card.target?.kc) {
      const r = short ? await within(reading, Math.max(0, CLASSIFY_MS - (Date.now() - t0))) : cls;
      const named = r ? (r.wrongModelId && !r.agrees && wms.find(w => w.id === r.wrongModelId)) || null : short ? null : marked; // the reading decides; the marker only stands in for it
      if (named) return is(type, 'wrong_model', { wrongModelHits: [{ id: named.id, p: short ? 0.5 : r ? (r.beliefSure ? 0.75 : 0.6) : 0.5 }], short, byValue: short || !r, trust: checked.trust, lean: leanOf(checked), point: pointOf(s, card, checked), how: `verifier:${by}+${r ? 'detector' : 'marker'}`, reasoning, verifiedWrong: true });
      const theirs = !short && r?.contradicts && !r.agrees && ownClaim(r.claim, text) ? candidateOf(card.target.kc, r.claim) : null; // a value is no claim
      if (theirs) return is('belief', 'wrong_model', { wrongModelHits: [falseClaimOf(checked) ? { id: theirs.id, p: 0.7 } : claimHit(s, theirs, 0.7)], provenClaim: falseClaimOf(checked), stated: true, verified: true, candidate: theirs, statedKc: theirs.kc, trust: checked.trust, how: `verifier:${by}+claim`, reasoning });
      if (!r && reading) { v.lateCls = reading; v.wms = wms; } // still reading: it names the model when it lands (lateMatch)
    }
    // A verified wrong claim no catalogued model names (answer.unsupported): refuted as a stated false belief, with its candidate id.
    if (value === 'incorrect' && falseClaimOf(checked) && claimOf(cls, text) && card.target?.kc) { const c = candidateOf(card.target.kc, claimOf(cls, text)); return is('belief', 'wrong_model', { wrongModelHits: [{ id: c.id, p: 0.8 }], provenClaim: true, stated: true, verified: true, candidate: c, statedKc: c.kc, trust: checked.trust, how: 'verifier:claim', reasoning }); }
    return is(type, value, { ...extra, byValue: (extra.wrongModelHits || []).length > 0, trust: checked.trust, lean: leanOf(checked), how: `verifier:${by}`, reasoning, ...(checked.verdict === 'incorrect' ? { point: pointOf(s, card, checked), verifiedWrong: true } : {}) });
  }
  /** An uncertain verdict's leaning: the last decisive step of the verifier chain (1 or 0), else null. */
  const leanOf = checked => { const step = [...(checked?.provenance?.chain || [])].reverse().find(x => typeof x.ok === 'boolean'); return step ? Number(step.ok) : null; };
  /** A prediction said aloud for an element's checkpoint, checked against the element's own truth: { value, outcome, diff, wrongModel }, or null. */
  function spokenPrediction(card, text) {
    const task = card.show?.task, entry = task && REGISTRY[card.show.kind];
    if (!entry || !['predict', 'teach'].includes(task.mode) || task.prediction || !task.checkpoints?.length) return null;
    if (numbersOf(text).length && !answersCase(text, null, card)) return null; // a line about a case of its own is no prediction for this one
    const cp = task.checkpoints[0], got = predictionFrom(text, cp.predict, entry.engine.parse);
    if (!got.parsed || cp.predict.some(n => got.values[n] == null)) return null; // not a prediction for every name: the words decide
    const truth = truthAt(entry, card.show.state, cp);
    if (!truth) return null;
    const diff = diffValues(got.values, truth, cp.predict), outcome = diff.filter(d => d.match).length / diff.length;
    const sig = card.expect.find(b => b.wrongModel && b.pageState?.equals && Object.entries(b.pageState.equals).every(([n, v]) => got.values[n] != null && same(got.values[n], v)));
    return { value: outcome === 1 ? 'correct' : sig ? 'wrong_model' : 'incorrect', outcome, diff, wrongModel: sig?.wrongModel ?? null, checkpoint: 0 };
  }
  /** A verifier's result as the policy's verdict: [value, { wrongModelHits }] (slip and missing piece read from the learner's state). */
  function valueOf(s, card, checked, type = 'answer') {
    const hits = checked.wrongModelHits || [];
    let value = checked.verdict === 'incorrect' ? (hits.some(h => h.p >= 0.3) ? 'wrong_model' : type === 'partial' ? 'partial' : 'incorrect') : checked.verdict;
    if (value === 'incorrect') {
      const ctx = contextFor(s, card.target?.kc);
      if (ctx.st?.source === 'observed' && predicted(ctx.st, itemById(ctx.cm, card.item.id)) >= 0.75) value = 'slip';
      else if (ctx.prereqs.some(p => p.state?.source === 'observed' && (p.state.theta ?? 0) < -0.5)) value = 'missing_piece';
    }
    return [value, { wrongModelHits: hits }];
  }
  /**
   * A verdict that landed after the move went out (binding rule 2): recorded as evidence and on state().last; when it says
   * they were right, it goes on the card that answered them (card.updated), so the voice can say so.
   */
  async function attach(sessionId, card, response, v, checked) {
    if (!S().peek(sessionId) || !checked) return;
    if (v.value === 'unverified' && !['answer', 'partial'].includes((await Promise.resolve(v.lateCls).catch(() => null))?.kind)) return; // read late: evidence only if it was an attempt (decisive11b)
    const known = v.stated || diagnosed.has(response.id); // the belief in this line is already recorded (said as a belief, or read late)
    if (checked.verdict === 'incorrect') Object.assign(v, { verifiedWrong: true, trust: checked.trust }); // a reading landing after this names it, sure or not
    // A wrong answer the verifier didn't name goes through the matching too (§13 rule 3): the reading names it, sure or not
    // (the verifier settled that it is wrong): the quick reading, else the late one if it is back.
    const named = !known && checked.verdict === 'incorrect' && !(checked.wrongModelHits || []).some(h => h.p >= 0.5) ? v.cls ?? (v.lateCls ? await within(v.lateCls, 0) : null) : null;
    const s = S().peek(sessionId), scope = scopeOf(s), [value0, { wrongModelHits }] = valueOf(s, card, checked, v.utterance === 'partial' ? 'partial' : 'answer');
    const fromReading = named?.wrongModelId && !named.agrees ? (v.wms || []).find(w => w.id === named.wrongModelId) : null;
    const hit = known ? null : fromReading ? { id: fromReading.id, p: v.short ? 0.5 : named.beliefSure ? 0.75 : 0.6 } : [...(wrongModelHits || [])].filter(h => h.p >= 0.5).sort((a, b) => b.p - a.p)[0]; // a bare value: a hypothesis
    const value = fromReading ? 'wrong_model' : value0;
    const claim = !known && !hit && !v.short && checked.verdict === 'incorrect' && card.target?.kc ? (named?.contradicts && !named.agrees && ownClaim(named.claim, response.text) ? candidateOf(card.target.kc, named.claim) : falseClaimOf(checked) && claimOf(v.cls, response.text) ? candidateOf(card.target.kc, claimOf(v.cls, response.text)) : null) : null;
    const proven = !!claim && (falseClaimOf(checked) || provenFalse(s, claim.id)), claimHitNow = claim ? (proven ? { id: claim.id, p: 0.8 } : { id: claim.id, p: 0.8, unverified: true }) : null;
    if (claim && falseClaimOf(checked)) { setClaim(s, claim.id, true, claim.claim); pairCase(s, claim.id, claim.claim, claim.kc); } // the calibrated judge found a wrong claim in their answer
    else if (claim && !proven) judgeClaim(s, claim, { kcs: [card.target.kc], family: 'E5', regime: 'R1', rank: 5, wrongModelHits: [{ id: claim.id, p: 0.8 }], claim: claim.claim, source: 'engine', responseId: response.id, sessionId: s.id, cardId: card.id, helpLevel: card.helpLevel ?? 0 });
    const o = observation(s, card, { ...v, value, trust: checked.trust, lean: leanOf(checked), stated: false, wrongModelHits: known ? [] : claim ? (proven ? [claimHitNow] : []) : hit ? [hit] : wrongModelHits, page: false }, response, card.arcAfter);
    if (o) observe(scope, o);
    const st = stateOf(s), cur = getCard(scope, st.cardId);
    if (st.last?.cardId === card.id) saveState({ ...st, last: { ...st.last, late: { verdict: value, trust: checked.trust, how: `verifier:${checked.provenance?.by ?? '?'}` } } });
    if (cur && cur.respondsTo === response.id && ['correct', 'valid_nonstandard'].includes(value)) {
      const grown = { ...cur, verdict: { ...(cur.verdict || {}), value, trust: checked.trust, late: true } }, out = pageCard(fullCard(grown));
      putCard(scope, grown);
      S().emit(sessionId, 'card.updated', { cardId: cur.id, card: out, text: safe(() => agent.actorCard?.(out) ?? null, null) });
      return;
    }
    if (!hit && !claim) return;
    mark(response.id);
    if (claim) remember(s, claim.kc, response.text, claim.id, claim.claim);
    revise(sessionId, card, response, { value: 'wrong_model', utterance: claim ? 'belief' : v.utterance, wrongModelHits: hit ? [hit] : [claimHitNow], byValue: !claim && (!fromReading || !!v.short), candidate: claim, stated: !!claim, verified: true, trust: checked.trust, point: pointOf(s, card, checked), reasoning: v.reasoning, how: claim ? 'verifier:claim:late' : `verifier:${checked.provenance?.by ?? '?'}:late` });
  }
  /** Their reply to a course case gave the course's account after all (the judge landed late): said on the card that answered it. */
  function accountLate(sessionId, responseId, j) {
    const s = S().peek(sessionId), cur = s && getCard(scopeOf(s), stateOf(s).cardId);
    if (!cur || cur.respondsTo !== responseId) return;
    const grown = { ...cur, verdict: { ...(cur.verdict || {}), value: 'correct', trust: j.trust, late: true } }, out = pageCard(fullCard(grown));
    putCard(scopeOf(s), grown);
    S().emit(sessionId, 'card.updated', { cardId: cur.id, card: out, text: safe(() => agent.actorCard?.(out) ?? null, null) });
  }
  /**
   * The light reading, landed after the quick path: the same matching as the quick path (a catalogued belief the line states,
   * else a claim of their own that contradicts the idea). A match is recorded at once (rank 5, its id in wrongModelHits) and
   * repaired now (revise). Nothing found: the move stands.
   */
  function lateMatch(sessionId, card, response, v, cls) {
    const s = S().peek(sessionId), text = String(response.text ?? '').trim();
    if (!s || !cls || !card.target?.kc || diagnosed.has(response.id)) return;
    const sure = cls.beliefSure || v.verifiedWrong || v.short; // the verifier settled that the answer is wrong, or a value: the reading's best match names it
    const named = cls.wrongModelId && sure && !cls.agrees ? (v.wms || []).find(w => w.id === cls.wrongModelId) : null, own = named?.candidate ? { id: named.id, claim: named.belief, kc: named.kc } : null, stated = own ? null : named; // a rewording of a claim of theirs: that candidate, unverified until judged
    const flagged = !v.short && !named && cls.contradicts && sure && !cls.agrees && ownClaim(cls.claim, text) ? candidateOf(card.target.kc, cls.claim) : null, claim = own ?? (flagged && claimJudged(s, flagged.id) !== false ? flagged : null);
    if (!stated && !claim) return;
    if (v.short) { // a bare value: a hypothesis, tested by the separating probe (never a repair, never their belief)
      if (!stated) return;
      mark(response.id);
      return revise(sessionId, card, response, { ...v, question: false, request: null, value: 'wrong_model', utterance: 'answer', stated: false, byValue: true, wrongModelHits: [{ id: stated.id, p: 0.5 }], how: 'detector:value:late', late: null, lateCls: null });
    }
    // A right answer's reason (decisive8): the verdict stays, the reason's match rides on it, recorded as a belief (rank 5).
    if (['correct', 'valid_nonstandard'].includes(v.value)) {
      const hit = stated ? { id: stated.id, p: cls.beliefSure ? 0.75 : 0.6 } : claimHit(s, claim, cls.beliefSure ? 0.75 : 0.6), lateR = { ...v, question: false, request: null, reason: true, reasoning: true, wrongModelHits: [hit], candidate: claim, how: `${v.how}+reason:late`, late: null, lateCls: null };
      mark(response.id);
      const o = observation(s, card, { ...lateR, value: 'wrong_model', stated: true, verified: false, statedKc: stated?.kc ?? claim.kc }, response, card.arcAfter);
      if (o && claim && !provenFalse(s, claim.id)) judgeClaim(s, claim, o); else if (o) observe(scopeOf(s), o);
      remember(s, card.target.kc, text, hit.id, claim?.claim ?? null);
      return revise(sessionId, card, response, lateR);
    }
    // A belief is as sure as its match (rule 7), not as the verdict on the answer it came with.
    const lateV = { ...v, question: false, request: null, value: 'wrong_model', utterance: v.verifiedWrong ? v.utterance ?? 'answer' : 'belief', verified: !!v.verifiedWrong, trust: v.verifiedWrong ? v.trust : null, wrongModelHits: [stated ? { id: stated.id, p: cls.beliefSure ? 0.75 : 0.6 } : claimHit(s, claim, cls.beliefSure ? 0.75 : 0.6)], stated: true, statedKc: stated?.kc ?? claim.kc, candidate: claim, detector: true, how: claim ? 'detector:claim:late' : 'detector:model:late', reasoning: cls.reasoning ?? v.reasoning, late: null, lateCls: null };
    mark(response.id);
    const o = observation(s, card, { ...lateV, verified: false }, response, card.arcAfter); // the diagnosis, rank 5 with its hit: the attempt itself is recorded already
    if (o && claim && !provenFalse(s, claim.id)) judgeClaim(s, claim, o); // a claim only the reading flagged: recorded once judged false
    else if (o) observe(scopeOf(s), o);
    remember(s, card.target.kc, text, lateV.wrongModelHits[0].id, claim?.claim ?? null);
    revise(sessionId, card, response, lateV);
  }
  /**
   * A late verdict or reading revises the move (§13 binding rule 2): the wrong model it found is repaired now, by its kind,
   * when the learner has said nothing since and the board still answers this line (the card it answered, or the move made on
   * it, unless that move is already a repair). The arc rides on the new card, as on any other.
   */
  function revise(sessionId, card, response, lateV) {
    const s = S().peek(sessionId);
    if (!s || !card.arcAfter?.kc || latest.get(sessionId) !== response.id) return false;
    const cur = getCard(scopeOf(s), stateOf(s).cardId);
    if (!cur || (cur.id !== card.id && cur.respondsTo !== response.id) || (cur.id !== card.id && ACT[cur.act]?.move === 'repair')) return false;
    const arc = { ...(cur.id === card.id ? card.arcAfter : cur.arcAfter ?? card.arcAfter), lastAnswer: clip(String(response.text ?? ''), 200) };
    const d = safe(() => decide(lateV, arc, contextFor(s, arc.kc, { card, answered: answeredOf(s, card, lateV, response.text) })), null);
    const wm = d?.wrongModel ?? lateV.candidate?.id ?? lateV.wrongModelHits?.[0]?.id ?? null;
    const made = d?.act && safe(() => cardFor(s, d, { prev: card, verdict: { ...lateV, value: lateV.stated && !lateV.verified ? null : d.suspected && lateV.value === 'wrong_model' ? 'incorrect' : lateV.value, wrongModel: wm, suspected: !!d.suspected, errorKind: d.errorKind ?? null, claim: lateV.candidate?.claim ?? null, trust: trustOf(lateV), p: pOf(lateV, wm), late: true, confirm: ['correct', 'valid_nonstandard'].includes(lateV.value) ? confirmOf(scopeOf(s), card) : null }, goal: goalOf(s, card.goalId) }), null);
    if (!made) return false;
    if (!issue(S().peek(sessionId), { ...made, goalId: card.goalId, goalTitle: card.goalTitle }, { respondsTo: response.id, revision: true })) return false; // nothing new to say: the card stands
    const now = stateOf(S().peek(sessionId));
    saveState({ ...now, last: { ...now.last, revised: { act: made.act, wrongModel: wm, errorKind: d.errorKind ?? null, how: lateV.how } } });
    return true;
  }

  /** The verdict as a learner observation (spec §3, §10), or null when it isn't evidence (uncertain, a request, a question, page work). */
  function observation(s, card, v, response, arc) {
    if (v.stated && !v.verified && card.target?.kc) return v.wrongModelHits?.length ? { kcs: [...new Set([card.target.kc, v.statedKc].filter(Boolean))], family: 'E5', regime: 'R1', rank: 5, wrongModelHits: v.wrongModelHits, ...(v.candidate ? { claim: v.candidate.claim } : {}), source: 'engine', responseId: response.id, sessionId: s.id, cardId: card.id, helpLevel: card.helpLevel ?? 0 } : null; // a stated belief: suspected, never a θ verdict (an uncatalogued claim: its late verdict is the evidence)
    if (v.element && card.target?.kc) return { kcs: [card.target.kc], family: 'E4', regime: 'R1', rank: 2, outcome: v.element.outcome, trust: 1, wrongModelHits: v.wrongModelHits || [], enacted: 'responding', source: 'engine', responseId: response.id, sessionId: s.id, cardId: card.id, itemId: card.item?.id ?? `${card.id}:cp0`, helpLevel: card.helpLevel ?? 0, latencyMs: response.latencyMs ?? null, hedges: response.hedges?.length ? response.hedges : [], taughtBy: arc?.taught ? { ...arc.taught, cardId: arc.taughtCard ?? null } : null };
    if (!card.item || !card.target?.kc || ['pending', 'request', 'question', 'answered', 'no_attempt', 'partial', 'unverified', 'tentative_claim'].includes(v.value) || v.page) return null;
    if (v.verified && v.candidate) v = { ...v, value: 'incorrect' }; // a verified wrong claim: an incorrect attempt, with its candidate hit
    const base = { kcs: [card.target.kc], source: 'engine', responseId: response.id, sessionId: s.id, cardId: card.id, itemId: card.item.id, helpLevel: card.helpLevel ?? 0 };
    if (v.value === 'claims_understanding') return { ...base, family: 'E10', regime: 'R1', rank: 5, confidence: 1 };
    const assisted = (card.helpLevel ?? 0) > 0 || ['tell_step', 'worked_solution', 'flag', 'locate', 'pump', 'general_hint', 'specific_hint', 'explain_reasoning', 'request_attempt'].includes(card.act);
    return {
      ...base, family: card.item.family || 'E3', regime: card.item.regime || 'R1', rank: assisted ? 4 : (arc?.used || []).filter(x => x === card.item.id).length > 1 ? 3 : 2,
      // Every attempt is recorded at once (spec §10): with the verdict's trust (exact or executed ≈ 1, a judge its calibrated agreement, uncertain 0.3 with the verifier's leaning).
      outcome: v.value === 'uncertain' ? v.lean ?? 0.5 : ['correct', 'valid_nonstandard'].includes(v.value) ? 1 : 0, trust: v.value === 'uncertain' ? 0.3 : v.trust ?? 1, ...(['correct', 'valid_nonstandard'].includes(v.value) ? { reasoningShown: !!v.reasoning && !v.hedged && !v.reason } : {}),
      assistance: Math.min(1, (card.helpLevel ?? 0) / 4), wrongModelHits: v.wrongModelHits || [],
      latencyMs: response.latencyMs ?? null, hedges: response.hedges?.length ? response.hedges : [], ...(/^(yes|no|true|false)$/i.test(card.expect?.find(b => b.kind === 'correct')?.literal || '') ? { options: 2 } : {}),
      taughtBy: arc?.taught ? { ...arc.taught, cardId: arc.taughtCard ?? null } : null, ...(arc?.readPortion && card.act === 'after_reading' ? { portionId: arc.readPortion } : {}),
    };
  }

  /**
   * A finalized answer (the plan_turn job). The hold rule; a reading's done or skip; the verdict (literal at once, else
   * verified while the voice says the card's neutral); the observation; the policy; then the next card: the one prepared
   * for that branch, else built now from the course model, else (no course model) the writer, behind the watchdog.
   * Anything that throws ends in the safe move.
   */
  /**
   * Never silent (a hard invariant, decisive7): after the turn, a learner line with no card answering it gets one. Exempt: a
   * hold, noise, a real question (the voice answers it and hands the card back), a question or the prequestion while they
   * read, the writer still on it (behind its watchdog), and a newer line. The move: the open question again, more simply;
   * else, with no question open, the next step.
   */
  async function turn(s0, response) {
    const r = await turnBody(s0, response);
    try {
      const s = S().peek(s0.id), text = String(response?.text ?? '').trim();
      const cur = s && response?.id && latest.get(s.id) === response.id ? getCard(scopeOf(s), stateOf(s).cardId) : null;
      const exempt = !cur || cur.respondsTo === response.id || r?.stale || ['hold', 'prequestion'].includes(r?.kind) || r?.next === 'writer' || !text || NOISE.test(text)
        || (QUESTION.test(text.replace(GREETING, '').trim()) && !TENTATIVE.test(text)) || GREETING.test(text) || REQUEST_FORM.test(text) || (cur.wait === 'reading' && cur.show?.kind === 'reading' && !ACK.test(text))
        || META.test(text) || cur.act === 'reask' || cur.act === 'guide'; // guide mode: the tutor answers every line itself // lost, frustrated or asking: the voice orients them; and never a re-ask on a re-ask (12 Oct)
      if (!exempt) {
        if (cur.ask && cur.act !== 'reask') issue(s, reaskOf(cur), { respondsTo: response.id });
        else finishTurn(s, cur, { value: cur.ask ? 'stuck' : 'answered', utterance: cur.ask ? 'stuck' : 'answer', how: 'never-silent' }, response, Date.now(), null); // asked twice: the next step (a hint, or the repair due)
        const st = stateOf(S().peek(s.id)); saveState({ ...st, last: { ...(st.last || {}), neverSilent: true } });
      }
    } catch (error) { console.error(`[engine] never-silent guard failed: ${error.message}`); }
    return r;
  }
  /** The open question again, more simply: the same case and branches, no verdict, no new content. */
  function reaskOf(cur) {
    const simpler = cur.item ? 'Just your best guess: what do you get for the question on the page?' : cur.show?.task ? 'Just your best guess: what happens on the page?' : cur.handBack && cur.handBack !== cur.ask ? cur.handBack : 'In a few words: what do you think?';
    const { id, n, issuedAt, respondsTo, scope, rowVersion, cacheKey, preparedFor, ...rest } = cur;
    return { ...rest, move: 'elicit', act: 'reask', say: '', ask: simpler, neutral: 'Go on.', handBack: simpler, verdict: null, intention: 'Never silent: their line left the question open; it again, more simply', why: 'never silent: no move answered their line, so the open question again, more simply', source: 'safe' };
  }
  async function turnBody(s0, response) {
    const s = S().peek(s0.id), scope = scopeOf(s), st = stateOf(s), card = getCard(scope, st.cardId);
    if (!card || !response) return null;
    latest.set(s.id, response.id);
    const text = String(response.text ?? '').trim(), t0 = Date.now();
    const note = last => saveState({ ...stateOf(S().peek(s.id)), last: { cardId: card.id, answer: clip(text, 300), ms: Date.now() - t0, ...last } });
    try {
      if (card.act === 'guide') return await guideTurn(s, card, response, t0); // guide mode: the tutor answers; answers to its question checked behind
      // A reading: "done" or "skip" starts the after-move; a question or a term is the voice's; the prequestion's answer is kept.
      if (card.wait === 'reading' && card.show?.kind === 'reading') {
        let attempted = false;
        if (!(DONE.test(text) || /\b(skip (?:it|this)|done reading|finished reading|i read it)\b/i.test(text))) {
          if (lexicon(text, response).claims) { const v = await verdictOf(s, card, response, stateOf(s)); return finishTurn(s, card, v, response, t0, null); } // "I already know this": one quick check confirms it, and the section is skipped
          if (card.ask && !stateOf(s).arc?.prequestionAnswer && !QUESTION.test(text)) { saveState({ ...stateOf(s), arc: { ...(stateOf(s).arc || {}), prequestionAnswer: clip(text, 200) } }); note({ kind: 'prequestion', utterance: 'answer', how: 'words', next: 'none' }); return { kind: 'prequestion', next: 'none' }; }
          // While reading: a question or chat is the voice's, and the card stands. Starting to work (an attempt, a claim) or asking
          // for something else ends the reading: the after-move starts (reading.md §7.5, "triggered by the learner").
          const lex = lexicon(text, response), working = valuesOf(text).size > 0; // a value said is work, even as a question ("so it's -1?")
          const cls = working || lex.request || lex.claims || lex.question || CHAT.test(text) ? null : await classify(s, card, response, actorLast(s));
          const moves = working || lex.request || lex.claims || (cls && ['answer', 'partial', 'claims', 'request'].includes(cls.kind));
          if (!moves) { note({ kind: 'question', verdict: 'question', utterance: lex.question ? 'question' : cls?.kind ?? 'chat', how: cls ? 'model' : 'words', next: 'none' }); return { kind: 'question', next: 'none' }; }
          attempted = working || ['answer', 'partial'].includes(cls?.kind);
          if (lex.request && !['skip', 'read'].includes(lex.request)) { const v = await verdictOf(s, card, response, stateOf(s)); return finishTurn(s, card, v, response, t0, null); }
          if (lex.request === 'read') { note({ kind: 'question', verdict: 'question', utterance: 'chat', how: 'words', next: 'none' }); return { kind: 'question', next: 'none' }; } // "ok, I'll read it first": they are reading
        }
        const branch = card.expect.find(b => b.kind === (/skip/i.test(text) ? 'skip' : 'done')) || card.expect.find(b => b.kind === 'done');
        safe(() => L().expose?.(scope, { kcs: [card.target?.kc ?? card.target?.topicId].filter(Boolean), portionId: card.show.portion.id, readingEvent: { reading: { activeMs: Date.now() - Date.parse(card.issuedAt), expectedMs: (card.show.portion.level?.minutes || 2) * 60_000 } }, sessionId: s.id, cardId: card.id }));
        // Their own answer ends the reading: it is the consolidation (reading.md §7.5), never asked again.
        const ended = attempted && card.arcAfter ? { ...card, arcAfter: { ...card.arcAfter, slots: (card.arcAfter.slots || []).filter(x => x !== 'after') } } : card;
        return finishTurn(s, ended, { value: 'answered', utterance: attempted ? 'answer' : 'chat', how: attempted ? 'words' : 'exact', branch, spoken: true }, response, t0, !attempted && branch?.then?.cardId && !stateOf(s).arc?.prequestionAnswer ? getCard(scope, branch.then.cardId) : null);
      }
      // An intro question (their aim, where they are in the lectures) needs no model: any line that isn't a greeting, a question or
      // a request is their answer, and the next card goes out at once (the classifier read "Prelim 1 on Oct 15" as chat).
      if (card.intro?.kind === 'get_to_know') {
        // Lost twice during the intake (12 Oct quick runs: "what's going on?" got the lecture question three times): start
        // from the beginning and teach; what's still unknown is asked later, at a natural pause.
        if (META.test(text) && !valuesOf(text).size) {
          const lost = (stateOf(s).introLost || 0) + 1;
          saveState({ ...stateOf(s), introLost: lost });
          if (lost >= 2) return finishTurn(S().peek(s.id), card, { value: 'answered', utterance: 'answer', how: 'lost-twice' }, { ...response, text: 'start from the beginning' }, t0, null);
        }
        const rest = text.replace(GREETING, '').trim(), lex = lexicon(text, response);
        if (rest && !CHAT.test(text) && !QUESTION.test(rest) && !REQUEST_FORM.test(text) && !lex.question && !lex.request && !lex.kindAsked) return finishTurn(s, card, { value: 'answered', utterance: 'answer', how: 'words' }, response, t0, null);
      }
      // The hold rule: a line that isn't an answer yet changes nothing while the card's question is open.
      if (card.ask && HOLD.test(text) && !(st.page?.[card.id] && card.show?.task) && card.show?.task?.mode !== 'draw') { note({ kind: 'hold', utterance: 'hold', how: 'exact', branchId: null, next: 'none' }); return { branchId: null, kind: 'hold', utterance: 'hold', how: 'exact', ms: 0, next: 'none' }; }
      // The writer path (no course model): a second line while the writer is still on the last one takes its move now, a reading
      // from the notes (finishTurn), before any model call: a classifier wait here lets the voice draw out again (§13 rule 1).
      if (!card.arcAfter?.kc && !card.intro && st.writing?.cardId === card.id) { const lex = lexicon(text, response); if (!(lex.request || lex.kindAsked || lex.question || CHAT.test(text))) return finishTurn(s, card, { value: 'answered', utterance: 'answer', how: 'words' }, response, t0, null); }
      let v = await verdictOf(s, card, response, st);
      // The arc's last move (its summary, or no slot left) waits a little for a reading still on its way: an arc never closes
      // over a belief just said (§13). With an item, the verifier's own path decides; the reading is attached as usual.
      if (v.lateCls) v.lateCls.then(cls => lateMatch(s.id, card, response, v, cls)).catch(error => console.error(`[engine] late match failed: ${error.message}`));
      // A card issued while this answer was being read stands only if it answers this line; one answering an older line is
      // replaced by this line's move (the newest card always answers the newest line).
      const meanwhile = stateOf(S().peek(s.id)).cardId !== card.id ? getCard(scope, stateOf(S().peek(s.id)).cardId) : null;
      if (meanwhile && meanwhile.respondsTo === response.id) return { kind: v.value, how: v.how, ms: Date.now() - t0, next: 'none', stale: true };
      if (latest.get(s.id) !== response.id) return { kind: v.value, how: v.how, ms: Date.now() - t0, next: 'none', stale: true }; // a newer line is being answered
      if (v.request === 'topic') { const moved = safe(() => topicSwitch(S().peek(s.id), v.topicRequest, 'answer', response.id), null); note({ kind: 'topic_request', verdict: 'request', how: v.how, next: moved?.repeated ? 'none' : 'topic' }); return { kind: 'topic_request', how: v.how, ms: Date.now() - t0, next: moved?.repeated ? 'none' : 'topic', topic: v.topicRequest }; }
      if (v.value === 'question') { note({ kind: 'question', verdict: 'question', utterance: v.utterance, how: v.how, next: 'none' }); return { kind: 'question', utterance: v.utterance, how: v.how, ms: Date.now() - t0, next: 'none' }; }
      const prepared = v.spoken && !v.request && v.branch?.then?.cardId ? getCard(scope, v.branch.then.cardId) : v.detector ? getCard(scope, card.detect?.find(x => x.wrongModel === v.wrongModelHits[0]?.id)?.cardId) : null;
      const result = finishTurn(s, card, v, response, t0, prepared);
      if (v.late) v.late.then(checked => attach(s.id, card, response, v, checked)).catch(() => {});
      return result;
    } catch (error) {
      console.error(`[engine] turn failed: ${error.stack || error.message}`);
      const now = S().peek(s.id);
      if (stateOf(now).cardId === card.id) issue(now, safeCard(now, card, `The engine failed on this answer (${clip(error.message, 120)}): a safe move.`), { respondsTo: response.id });
      return { kind: 'error', next: 'safe', ms: Date.now() - t0 };
    }
  }

  /** After the verdict: the intro, or the writer (no course model), or the observation, the policy and the next card. */
  function finishTurn(s, card, v, response, t0, prepared) {
    const scope = scopeOf(s), st = stateOf(s), text = String(response.text ?? '');
    if (v.element) saveState({ ...stateOf(s), spokenChecks: { ...(stateOf(s).spokenChecks || {}), [card.id]: response.id } });
    const last = extra => ({ cardId: card.id, answer: clip(text, 300), kind: v.value, verdict: v.value, utterance: v.utterance ?? null, candidate: v.candidate?.claim ?? null, trust: v.trust ?? null, how: v.how, branchId: v.branch?.id ?? null, ms: Date.now() - t0, ...extra });
    if (card.intro) {
      const o = card.intro.kind === 'diagnose' && card.item ? observation(s, card, v, response, st.arc) : null;
      if (o) observe(scope, o);
      saveState({ ...stateOf(s), last: last({ next: 'intro' }) });
      const res = introTurn(S().peek(s.id), card, text, response.id);
      return { kind: v.value, how: v.how, ms: Date.now() - t0, ...res };
    }
    if (!card.arcAfter?.kc) { // no course model behind this card: the writer writes the next one, behind the watchdog
      // The notes path closes its goal on evidence too, so the walk goes on through the lectures: NOTES_RIGHT right answers on
      // the section, else NOTES_MAX content lines on it; then the next section opens (from its course model once that is built).
      const goal = goalOf(s, card.goalId), content = !['question', 'request', 'chat'].includes(v.value);
      if (goal && content && currentGoal(s.agenda)?.id === goal.id) {
        const was = stateOf(s).notes?.goalId === goal.id ? stateOf(s).notes : { goalId: goal.id, lines: 0, right: 0 };
        const tally = { goalId: goal.id, lines: was.lines + 1, right: was.right + (['correct', 'valid_nonstandard'].includes(v.value) ? 1 : 0) };
        saveState({ ...stateOf(s), notes: tally });
        if (tally.right >= NOTES_RIGHT || tally.lines >= NOTES_MAX) {
          const moved = !!S().advance(s.id, goal.id, tally.right >= NOTES_RIGHT ? `Answered ${tally.right} right on it, from the notes.` : 'Moved on after a good look at it, from the notes; still to check.');
          const next = moved ? opening(S().peek(s.id)) : null;
          if (next) {
            issue(S().peek(s.id), next, { respondsTo: response.id });
            saveState({ ...stateOf(S().peek(s.id)), last: last({ next: 'goal' }) });
            return { kind: v.value, how: v.how, ms: Date.now() - t0, next: 'goal', goalMoved: true };
          }
        }
      }
      // A second line while the writer is still on the last one: its move now, a reading from the notes (or the safe move), never
      // the neutral line a second time (§13 rule 1). The writer's late card for the earlier line is then stale and dropped.
      if (stateOf(s).writing?.cardId === card.id && !['question', 'request'].includes(v.value)) {
        const now = S().peek(s.id), move = notesCard(now, card, text, 'The writer was still on their last line: a reading from the notes, not a second draw-out.') ?? safeCard(now, card, 'The writer was still on their last line: a safe move, not a second draw-out.', text);
        issue(now, { ...move, goalId: move.goalId ?? card.goalId, goalTitle: move.goalTitle ?? card.goalTitle }, { respondsTo: response.id });
        saveState({ ...stateOf(S().peek(s.id)), last: last({ next: 'notes' }) });
        return { kind: v.value, how: v.how, ms: Date.now() - t0, next: 'notes' };
      }
      // Never dead air on slow work: the writer's card (a few seconds on the Fast tier) goes out when it comes; if it isn't in by
      // WATCHDOG_MS, a reading from the notes (else the safe move) stands in, and the writer's card still takes its place (11 Oct:
      // a stand-in on every line, then the writer's card 2 s later, was two cards per answer).
      saveState({ ...stateOf(S().peek(s.id)), writing: { cardId: stateOf(S().peek(s.id)).cardId, responseId: response.id }, last: last({ next: 'writer' }) });
      jobs.enqueue({ scope, type: 'director_card', idempotencyKey: `answer:${response.id}`, payload: { sessionId: s.id, kind: 'answer', afterCardId: card.id, standIn: stateOf(S().peek(s.id)).cardId !== card.id ? stateOf(S().peek(s.id)).cardId : null, answer: clip(text, 600), asked: clip(actorLast(s) || '', 600), verdict: v.value, trust: typeof v.trust === 'number' ? v.trust : null, responseId: response.id }, priority: 48 });
      jobs.enqueue({ scope, type: 'director_watchdog', idempotencyKey: `watchdog:${response.id}`, payload: { sessionId: s.id, afterCardId: card.id, responseId: response.id, answer: clip(text, 300) }, priority: 47, availableAt: clock.now() + WATCHDOG_MS });
      return { kind: v.value, how: v.how, ms: Date.now() - t0, next: 'writer' };
    }
    const live = stateOf(s).arc?.kc === card.arcAfter.kc ? stateOf(s).arc : {};
    const arc = { ...card.arcAfter, lastAnswer: clip(text, 200), summarized: card.arcAfter.summarized || card.act === 'summary', taughtCard: live.taughtCard ?? card.arcAfter.taughtCard ?? null, prequestionAnswer: live.prequestionAnswer ?? card.arcAfter.prequestionAnswer ?? null };
    if (v.page) flushHeld(s, card.id); // the page's own row for this attempt, keyed to this line
    // The held update (rule 6) goes in once the explanation comes; else this answer's own observation.
    const obs = observation(s, card, v, response, arc), ctx = contextFor(s, arc.kc, { card, answered: answeredOf(s, card, v, text) });
    // The answer to "why does that work?" is its own E5 observation on the attempt it explains: judged by the calibrated
    // criteria in the background (trust = their agreement), else a light reading at trust 0.3 (spec §10, §13 rule 6).
    if (card.explains && card.target?.kc && !['question', 'request'].includes(v.value)) {
      const e5 = { kcs: [card.target.kc], family: 'E5', regime: 'R4', rank: 2, outcome: v.value === 'stuck' || v.stated ? 0 : v.reasoning ? 1 : 0.5, trust: 0.3, wrongModelHits: v.stated ? v.wrongModelHits : [], source: 'engine', responseId: response.id, sessionId: s.id, cardId: card.id, itemId: card.explains === card.target.kc ? null : card.explains, explains: card.respondsTo ?? null, helpLevel: card.helpLevel ?? 0 };
      if (v.value === 'stuck' || v.stated) observe(scope, e5);
      else if (v.caseJudging) v.caseJudging.then(j => { observe(scope, j ? { ...e5, ...j } : e5); if (j?.outcome === 1 && v.caseReply) accountLate(s.id, response.id, j); }, () => observe(scope, e5)); // judged in the turn: recorded once, when it lands
      else jobs.enqueue({ scope, type: 'director_explanation', idempotencyKey: `explain:${response.id}`, payload: { e5, text: clip(text, 1500) }, priority: 30 });
    }
    const d = v.request === 'kind' && SLOTS[v.kindAsked] ? { ...next({ ...arc, sessionKind: v.kindAsked, slots: [...SLOTS[v.kindAsked]] }, ctx), rule: 3, helpLevel: arc.help?.level ?? 0 } : decide(v, arc, ctx);
    const unproven = v.candidate && (v.wrongModelHits || []).some(h => h.unverified && h.id === v.candidate.id);
    if (v.candidate && v.provenClaim) { setClaim(s, v.candidate.id, true, v.candidate.claim); pairCase(s, v.candidate.id, v.candidate.claim, v.candidate.kc); } // the calibrated judge found it wrong in their answer
    if (unproven) { // recorded once the judge finds the claim false: the attempt itself (if any) now, without the hit
      const held = obs?.rank === 5 ? obs : { kcs: [card.target.kc], family: 'E5', regime: 'R1', rank: 5, wrongModelHits: [{ id: v.candidate.id, p: 0.75 }], claim: v.candidate.claim, source: 'engine', responseId: response.id, sessionId: s.id, cardId: card.id, helpLevel: card.helpLevel ?? 0 };
      judgeClaim(s, v.candidate, held);
      if (obs && obs.rank !== 5) observe(scope, { ...obs, wrongModelHits: (obs.wrongModelHits || []).filter(h => h.id !== v.candidate.id) });
    } else if (obs) observe(scope, obs);
    if ((v.stated || (v.reason && !v.lateCls)) && card.target?.kc) { remember(s, card.target.kc, text, v.wrongModelHits?.[0]?.id, v.candidate?.claim ?? null); mark(response.id); } // a marker's hypothesis on a reason: the late reading still decides
    { const wid = v.stated ? v.wrongModelHits?.[0]?.id : null, cat = wid && !String(wid).startsWith('cand:') ? ctx.wrongModel?.(wid) : null; if (cat && !(ctx.slice?.problems || []).some(p => predOf(p, wid)) && (cat.kc ?? card.target?.kc)) pairCase(s, wid, cat.belief, cat.kc ?? card.target.kc); } // no computed cases: a course case paired by the judge // before the card: a candidate is stated by its claim
    const arcOver = !d.act && [5, 13].includes(d.rule);
    if (!d.act && !arcOver) { saveState({ ...stateOf(s), last: last({ rule: d.rule, next: 'none' }) }); return { kind: v.value, how: v.how, ms: Date.now() - t0, next: 'none', rule: d.rule }; }
    let nextCard = prepared && prepared.preparedFor?.rule === d.rule && prepared.preparedFor?.act === d.act && !!prepared.preparedFor?.unattributed === !!d.unattributed && bandOf(prepared.verdict) === bandOf({ trust: trustOf(v) }) && !(d.act === 'contrast' && !prepared.preparedFor?.branchId) ? fullCard(prepared) : null, via = nextCard ? 'prepared' : 'engine';
    if (!nextCard && d.act) nextCard = cardFor(s, d, { prev: card, verdict: { ...v, value: (v.stated && !v.verified) || ['request', 'answered', 'question', 'unverified', 'tentative_claim'].includes(v.value) ? null : d.suspected && v.value === 'wrong_model' ? 'incorrect' : v.value, wrongModel: d.wrongModel ?? v.candidate?.id ?? v.wrongModelHits?.[0]?.id ?? null, suspected: !!d.suspected, confirm: ['correct', 'valid_nonstandard'].includes(v.value) ? confirmOf(scope, card) : null, errorKind: d.errorKind ?? null, claim: v.candidate?.claim ?? null, trust: trustOf(v), p: pOf(v, d.wrongModel ?? v.candidate?.id), point: v.point ?? null }, goal: goalOf(s, card.goalId) });
    const open = openModel(d.arc ?? arc, ctx);
    if (nextCard && (arc.cards ?? 0) >= (arc.crunch ? (open ? ARC_MAX : ARC_CRUNCH) : open ? ARC_MAX_OPEN : ARC_MAX) && !['summary', 'after_reading'].includes(nextCard.act)) nextCard = null; // a reading always gets its one consolidation // enough on this target: move on (an open wrong model makes it next session's first target)
    let moved = false;
    if (!nextCard) {
      // The arc is over: tested unaided closes the goal; otherwise it stays a gap, chosen again by need.
      const goal = goalOf(s, card.goalId);
      saveState({ ...stateOf(s), arc: { ...arc, done: true }, closedKcs: [...new Set([...(stateOf(s).closedKcs || []), arc.kc])] });
      moved = goal ? !!S().advance(s.id, goal.id, arc.tested ? `Tested unaided${arc.summarized ? ' and summed up' : ''}: ${clip(card.target?.statement, 120)}` : `Moved on; still a gap: ${clip(card.target?.statement, 120)}`) : false;
      nextCard = opening(S().peek(s.id)); via = 'goal';
      // Nothing left to open: never silent on a content line; a check on what they just did.
      if (!nextCard && !['question', 'request'].includes(v.value)) { nextCard = safe(() => cardFor(S().peek(s.id), { ...d, act: 'generative_check', rule: 12, arc: { ...arc, done: false } }, { prev: card, goal: goalOf(s, card.goalId) }), null); via = 'check'; }
      // The arc closed on a right answer or summary the voice hasn't confirmed (decisive12: a correct summary got the next arc's
      // opener with no word on it): confirmed first, specifically, in the course's words, as strong as its trust.
      const closing = nextCard && !v.spoken ? closingConfirm({ value: v.value, trust: trustOf(v) }, ctx.kc) : '';
      if (closing) nextCard = { ...nextCard, say: `${closing} ${nextCard.say || ''}`.trim(), verdict: { ...(nextCard.verdict || {}), value: v.value, utterance: v.utterance ?? 'answer', trust: trustOf(v) } };
    }
    if (nextCard) issue(S().peek(s.id), { ...nextCard, goalId: nextCard.goalId ?? card.goalId, goalTitle: nextCard.goalTitle ?? card.goalTitle }, { respondsTo: response.id });
    saveState({ ...stateOf(S().peek(s.id)), last: last({ wrongModel: d.wrongModel ?? v.candidate?.id ?? v.wrongModelHits?.[0]?.id ?? null, suspected: !!d.suspected, hypotheses: d.hypotheses ?? null, errorKind: d.errorKind ?? null, rule: d.rule, move: nextCard?.move ?? null, act: nextCard?.act ?? null, helpLevel: nextCard?.helpLevel ?? null, next: via }) });
    return { branchId: v.branch?.id ?? null, kind: v.value, how: v.how, ms: Date.now() - t0, next: via, goalMoved: moved, rule: d.rule };
  }

  /** The course section a learner names as where they are ("we just did pointers", "lecture 5"), else null (the start). */
  function lectureOf(s, text) {
    const view = K().view(scopeOf(s), s.pinnedKnowledgeManifestId);
    // "Lecture 1 done", "finished lecture 5": the next one (12 Oct: a learner past lecture 1 was started on it); "on lecture 5" is 5.
    const said = Number(/\b(?:lecture|lec|week|chapter|unit|section)\s*(\d{1,3})\b/i.exec(text)?.[1]), past = said && /\b(done|finished|through|completed|covered|already know|know (?:it|that|lecture))\b/i.test(text);
    const n = past ? said + 1 : said, roots = view.topics.filter(t => !t.parentTopicId || !view.topics.some(p => p.topicId === t.parentTopicId));
    // "From the beginning", "I know nothing": the start (12 Oct quick runs: "start from the beginning" matched the arrays lecture).
    if (!n && /\b(beginning|start|scratch|first lecture|know nothing|nothing yet|haven'?t started|new to)\b/i.test(text)) return null;
    if (!n) return matchTopic(view, text)?.topicId ?? null; // a number first: "lecture 5, types in C" is lecture 5, not "Pointer Types"
    // Lecture n is the unit its lecture notes begin, by the outline's lectures ("Lecture 5: Types"), else the first unit after it
    // (a lecture with no unit of its own), else the n-th unit.
    const num = l => Number(/\d+/.exec(l)?.[0]), units = safe(() => app.services.modules.ensure(scopeOf(s)).filter(m => m.kind === 'unit' && m.lectures?.length), []);
    const unit = units.find(m => num(m.lectures[0]) === n) ?? units.find(m => num(m.lectures[0]) > n);
    return unit?.topicId ?? roots[n - 1]?.topicId ?? null;
  }
  /** An answer to an intro card: recorded, then the intro's next card; a goal with nothing left (or a declined check) is done. */
  function introTurn(s, card, text, respondsTo = null) {
    const st = stateOf(s), it = { asked: [], units: {}, items: [], ...st.intro }, kind = card.intro.kind, declined = kind === 'diagnose' && /\b(skip|stop|no more|enough)\b/i.test(text);
    if (kind === 'get_to_know') it.asked = [...new Set([...it.asked, card.intro.key])];
    if (kind === 'get_to_know' && card.intro.key === 'lectures') safe(() => S().setLectureFrom(s.id, lectureOf(s, text))); // the agenda walks the lectures from there
    // "Prelim 1 on Oct 15, and we just finished lecture 5": where they are, said with their aim, isn't asked again.
    else if (kind === 'get_to_know' && /\b(?:lecture|lec)\s*\d/i.test(text)) { const at = lectureOf(s, text); if (at) { safe(() => S().setLectureFrom(s.id, at)); it.asked = [...new Set([...it.asked, 'lectures'])]; } }
    if (kind === 'diagnose') { if (card.intro.unitId) it.units = { ...it.units, [card.intro.unitId]: declined ? 'declined' : 'answered' }; if (card.item) it.items = [...it.items, card.item.id]; }
    saveState({ ...st, intro: it });
    const goal = goalOf(s, card.goalId), on = !!goal && currentGoal(s.agenda)?.id === goal.id;
    let nextCard = on && !declined ? safe(() => introCard(S().peek(s.id), goal), null) : null, moved = false;
    if (!nextCard && on) { moved = !!S().advance(s.id, goal.id, declined ? 'They wanted to skip the rest of the check.' : null); nextCard = moved ? opening(S().peek(s.id)) : null; }
    if (nextCard) issue(S().peek(s.id), { ...nextCard, goalId: nextCard.goalId ?? goal?.id, goalTitle: nextCard.goalTitle ?? goal?.title }, { respondsTo });
    return { next: !nextCard ? 'none' : moved ? 'goal' : 'intro', goalMoved: moved };
  }

  // ---------- the writer: cards nothing prepared (no course model yet), streamed, behind the watchdog ----------
  const fallbackOf = b => standIn(fromDraft(b));
  /** A drafted board as the card's show: an element built by the elements maker (in time, else its stand-in), notes quoted, the rest checked. */
  async function boardOf(s, b, { build = true } = {}) {
    if (!b) return null;
    if (b.kind === 'element') {
      if (!b.element || !build) return fallbackOf(b);
      try { const making = app.services.elements.build(s, { request: b.element.request, kind: b.element.kind }), e = await (typeof build === 'number' ? within(making, build) : making); return e ? { kind: 'element', element: { kind: e.kind, spec: e.spec, title: e.title, summary: e.summary } } : fallbackOf(b); } catch { return fallbackOf(b); }
    }
    if (b.kind === 'notes') { const e = b.notesQuery && safe(() => K().retrieve(scopeOf(s), s.pinnedKnowledgeManifestId, { topicIds: [], objectiveVersionIds: [], anchorIds: [], query: b.notesQuery, relationTypes: [], reason: 'card notes', maxTokens: 1500 }).excerpts[0], null); return e ? { kind: 'notes', query: b.notesQuery, quote: clip(e.text, 600), lecture: safe(() => K().sourceTitle(scopeOf(s), e.sourceVersionId), null) } : fallbackOf(b); }
    const { board, problem } = checkBoard(fromDraft(b));
    if (problem && b.kind === 'diagram') console.warn(`[engine] a ${b.diagramType} board did not draw: ${clip(problem, 200)}`);
    return board || fallbackOf(b);
  }
  /** A written card's expected answer checked by the light model (and a C program it prints, run in the sandbox): ok | wrong | unverified. */
  async function verifyBranch(s, ask, expected, say, key) {
    const r = await within(call(x => app.providers.directorWriter.verify(x), { work: workIdentity({ scope: scopeOf(s), idempotencyKey: `verify:${key}`, input: { ask, expected }, clock }), question: ask, expected, reply: '', context: say }, { valueSchema: VERIFIED, what: 'answer check' }), 10_000).catch(() => null);
    if (!r || r.outcome !== 'ok') return 'unverified';
    let verdict = r.value.agrees === 'yes' ? 'ok' : r.value.agrees === 'no' ? 'wrong' : 'unverified';
    const want = [...valuesOf(expected)];
    if (r.value.c && want.length) { const ran = await within(runC({ source: r.value.c }).catch(() => null), 8000).catch(() => null); if (ran?.ok) verdict = want.some(x => valuesOf(ran.stdout).has(x)) ? 'ok' : 'wrong'; }
    return verdict;
  }
  /** The writer's draft as card v2: its board resolved; a wrong expected answer withheld from the branches; the rest checked. */
  async function draftCard(s, draft, after, goal) {
    const right = draft.expect.find(b => b.kind === 'correct');
    const checked = right?.literal && draft.ask ? await verifyBranch(s, draft.ask, right.literal, draft.say, `${after.id}:${right.literal}`) : null;
    const show = draft.element ? await boardOf(s, { kind: 'element', element: draft.element, title: draft.board?.title || 'On the page', content: draft.board?.content ?? null, diagramType: draft.board?.diagramType ?? null, diagramData: draft.board?.diagramData ?? null }, { build: 25_000 }) : await boardOf(s, draft.board);
    const card = { move: draft.move, act: draft.act, helpLevel: draft.helpLevel, target: after.target ?? fallbackTarget(s, goal), intention: draft.intention, verdict: null, wait: draft.wait, say: draft.say, ask: draft.ask, neutral: draft.neutral, handBack: draft.handBack, show,
      expect: draft.expect.filter(b => !(b === right && checked === 'wrong')).map(b => ({ kind: b.kind, when: b.when, literal: b.literal, reply: b.reply, then: { ask: b.thenAsk, cardId: null } })), persona: null,
      withheld: { answer: draft.withheldAnswer ?? right?.literal ?? null, solution: null }, item: null, why: `No course model is built for this course yet, so the writer wrote this from the notes; its expected answer: ${checked ?? 'none to check'}.`, source: 'writer', goalId: after.goalId, goalTitle: after.goalTitle, arcAfter: null };
    return finish(card, after);
  }
  jobs.register('director_card', async ({ sessionId, afterCardId, answer = null, asked = null, verdict = null, trust = null, responseId = null, standIn = null }, ctx) => {
    const s = S().peek(sessionId), scope = s && scopeOf(s), at0 = standIn ?? afterCardId; // the quick move already out for this line: the writer's card takes its place
    const anchor = id => !!id && (id === at0 || getCard(scope, id)?.lateFor === afterCardId); // the card it answers, or the watchdog's stand-in for it
    if (!s || s.status !== 'active' || !anchor(stateOf(s).cardId)) return { state: 'stale' };
    const after = getCard(scope, afterCardId), goal = goalOf(s, after?.goalId);
    if (!after) return { state: 'stale' };
    const found = safe(() => K().retrieve(scope, s.pinnedKnowledgeManifestId, { topicIds: goal?.topicIds || [], objectiveVersionIds: [], anchorIds: [], query: `${goal?.title || ''} ${answer || ''}`, relationTypes: [], reason: 'writer', maxTokens: 2500 }), { excerpts: [] });
    const material = safe(() => K().passages(scope, s.pinnedKnowledgeManifestId, found.excerpts.map(e => e.anchorId), { maxTokens: 2500 }), []).map(p => ({ lecture: p.lecture, section: p.section, text: p.blocks.map(b => b.text).join('\n\n') }));
    const input = { goal: goal && { title: goal.title, mode: goal.mode, doneWhen: goal.doneWhen }, material, dialogue: safe(() => S().dialogue(sessionId).slice(-6).map(d => `${d.speaker}: ${clip(d.text, 300)}`), []), after: { act: after.act, ask: after.ask, asked, helpLevel: after.helpLevel, verdict, trust, answer } };
    const live = () => (responseId && latest.has(sessionId) && latest.get(sessionId) !== responseId ? null : stateOf(S().peek(sessionId)).cardId); // a newer line: this card answers nothing now
    let core = null;
    // The core goes out as soon as say, ask, neutral and the first branch are in; the rest follows as card.updated.
    const onText = onFields([{ when: p => typeof p.say === 'string' && 'ask' in p && typeof p.neutral === 'string' && branchDone(p.expect?.[0]), run: p => ctx.commit(() => {
      if (!anchor(live())) return;
      const c = checkCard(keepRule7({ move: p.move || 'elicit', act: p.act || 'writer', helpLevel: p.helpLevel ?? after.helpLevel ?? 0, target: after.target, intention: p.intention || 'The next move', verdict: null, wait: p.wait || 'reasoning', say: p.say, ask: p.ask, neutral: p.neutral, handBack: p.handBack || p.ask || 'Your turn.', show: null, expect: [], persona: null, withheld: {}, item: null, why: 'Written by the writer (no course model yet); the rest of the card follows.', source: 'writer', goalId: after.goalId, goalTitle: after.goalTitle, partial: true, arcAfter: null }));
      if (!c.problems.some(x => /gives away/.test(x))) core = issue(S().peek(sessionId), c.card, { respondsTo: responseId });
    }) }]);
    const r = await call(x => app.providers.directorWriter.card(x), { work: workIdentity({ scope, idempotencyKey: `card:${ctx.job.id}`, input: { afterCardId, answer }, clock }), deep: false, onText, ...input }, { valueSchema: CARD_DRAFT, what: 'move card' });
    if (r.outcome !== 'ok') { // a failed model call: the safe move, never silence
      ctx.commit(() => { const now = S().peek(sessionId); if (!core && !standIn && live() === afterCardId) issue(now, safeCard(now, after, 'The writer failed: a safe move.', answer), { respondsTo: responseId }); }); // a quick move is already out: it stands
      return { state: 'failed_safe' };
    }
    const card = await draftCard(S().peek(sessionId), r.value, after, goal);
    ctx.commit(() => {
      const now = S().peek(sessionId), at = stateOf(now).cardId;
      if (core && at === core.id) { const grown = { ...core, ...card, id: core.id, n: core.n, issuedAt: core.issuedAt, partial: false }; putCard(scope, grown); const out = pageCard(fullCard(grown)); S().emit(sessionId, 'card.updated', { cardId: grown.id, card: out, text: safe(() => agent.actorCard?.(out) ?? null, null) }); return; }
      if (anchor(at) && anchor(live())) issue(now, card, { respondsTo: responseId });
    });
    return { resultRefs: [] };
  }, { maxAttempts: 1 });
  // A candidate claim judged by the calibrated narrow judge against the KC's idea (§13: refute only a belief verified false).
  jobs.register('director_claim', async ({ sessionId, id, claim, kc, held = null }) => {
    const s = S().peek(sessionId);
    if (!s) return { state: 'stale' };
    const scope = scopeOf(s), slice = sliceOf(scope, kc), ex = slice?.explanation || {};
    const reference = [slice?.kc?.statement, ex.plain, ex.mechanism, ex.precise].filter(Boolean).join(' ');
    const out = await Promise.resolve().then(() => U().judge?.('answer.unsupported', [{ id, question: `Is this statement about the following idea correct? ${slice?.kc?.statement ?? ''}`.trim(), reference, answer: claim }])).catch(() => null);
    const v = Array.isArray(out) ? out.find(x => x.id === id) : null, verdict = v?.ok === false ? true : v?.ok === true ? false : null; // a fault criterion: ok false = the claim is wrong
    setClaim(s, id, verdict);
    if (verdict === true && held) observe(scope, held);
    if (verdict === true) pairCase(s, id, claim, kc);
    if (verdict !== true) { const st = stateOf(S().peek(sessionId)); saveState({ ...st, said: (st.said || []).filter(x => x.id !== id) }); } // judged supported, or not judged: never re-matched
    return { resultRefs: [] };
  }, { maxAttempts: 1 });
  /**
   * The sentence of a paired case that the belief can't account for (decisive11b), as the case states it: a verbatim substring of
   * the case text, a statement of what happens (never a setup instruction or a tutor note), else null.
   */
  async function quoteOf(s, c, belief) {
    const text = clip(c.text, 900), work = workIdentity({ scope: scopeOf(s), idempotencyKey: `quote:${s.id}:${c.id}:${hashOf(belief)}`, input: { case: c.id, belief }, clock });
    const r = await Promise.resolve().then(() => call(x => app.providers.directorWriter.quote(x), { work, title: c.title, case: text, belief }, { valueSchema: QUOTED, what: 'case quote' })).then(x => (x?.outcome === 'ok' ? x.value.quote : null), () => null);
    const q = String(r ?? '').replace(/\s+/g, ' ').trim().replace(/^["“‘']+|["”’']+$/g, '').trim(), body = q.replace(/[.!?…]+$/, '');
    return body.split(' ').length >= 4 && text.includes(body) && !imperative(body) && !TUTOR_NOTE.test(body) ? body : null;
  }
  /**
   * Course cases on the belief's own subject (decisive11b: a membrane belief was paired with ammonia spreading in a room): the
   * KC's, then its topic's other KCs', that share a word of what the belief says beyond its KC (its words not in the KC's
   * statement or explanation: "membrane", "cell", never "molecule"), most shared first, the KC's own first on ties; four.
   */
  function subjectCases(scope, kc, belief) {
    const cm = cmOf(scope), sl = sliceOf(scope, kc), ex = sl?.explanation || {}, topic = sl?.kc?.topicId ?? cm?.kcs?.find(k => k.id === kc)?.topicId, seen = new Set();
    const has = (set, w) => [...set].some(x => x === w || (x.length >= 3 && sameWord(x, w))), kcWords = words([sl?.kc?.statement, ex.plain, ex.mechanism, ex.precise].filter(Boolean).join(' '));
    const own = [...words(belief)].filter(w => !has(kcWords, w)), kcs = [kc, ...(cm?.kcs || []).filter(k => k.topicId === topic && k.id !== kc).map(k => k.id)];
    return kcs.flatMap((id, i) => casesFor(scope, id).map(c => ({ c, i }))).filter(({ c }) => !seen.has(c.id) && seen.add(c.id))
      .map(({ c, i }) => { const w = words(`${c.title || ''} ${c.text}`); return { c, i, n: own.filter(x => has(w, x)).length }; })
      .filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 4).map(x => x.c);
  }
  jobs.register('director_pair', async ({ sessionId, id, belief, kc }) => {
    const s = S().peek(sessionId);
    if (!s) return { state: 'stale' };
    const cases = subjectCases(scopeOf(s), kc, belief);
    const out = cases.length ? await Promise.resolve().then(() => U().judge?.('answer.unsupported', cases.map(c => ({ id: c.id, question: `${c.title ? `${c.title}. ` : ''}${clip(c.text, 900)} Does the following hold in this case?`, reference: clip(c.outcome, 900), answer: belief })))).catch(() => null) : null;
    const hit = Array.isArray(out) ? cases.find(c => out.find(v => v.id === c.id)?.ok === false) : null; // a fault criterion: ok false = the belief is wrong on this case
    const quote = hit ? await quoteOf(s, hit, belief) : null; // rule 8's other side: without it, no pairing
    const st = stateOf(S().peek(sessionId));
    saveState({ ...st, pairs: { ...(st.pairs || {}), [id]: hit && quote ? { caseId: hit.id, title: hit.title, text: clip(hit.text, 900), outcome: clip(hit.outcome, 600), item: !!hit.item, quote } : false } });
    return { resultRefs: [] };
  }, { maxAttempts: 1 });
  // The watchdog (spec §18b): an answer still without its next card after WATCHDOG_MS gets the safe move.
  jobs.register('director_watchdog', async ({ sessionId, afterCardId, responseId = null, answer = null }, ctx) => {
    ctx.commit(() => { const s = S().peek(sessionId); if (s?.status === 'active' && stateOf(s).cardId === afterCardId && !(responseId && latest.has(sessionId) && latest.get(sessionId) !== responseId)) { const prev = getCard(scopeOf(s), afterCardId), late = notesCard(s, prev, answer, 'The writer was late: a reading from the notes, its card after.') ?? safeCard(s, prev, 'The next move was late: a safe move.', answer); issue(s, { ...late, goalId: late.goalId ?? prev?.goalId, goalTitle: late.goalTitle ?? prev?.goalTitle, lateFor: afterCardId }, { respondsTo: responseId }); } }); // never for a line a newer one followed
    return { resultRefs: [] };
  }, { maxAttempts: 1 });
  // A page result on a card they said they were done with (a construction checked): that is their answer.
  jobs.register('director_page', async ({ sessionId, cardId }) => {
    const s = S().peek(sessionId);
    if (!s || s.status !== 'active' || stateOf(s).cardId !== cardId) return { state: 'stale' };
    const card = getCard(scopeOf(s), cardId), page = stateOf(s).page?.[cardId];
    if (!card || !page) return { state: 'stale' };
    finishTurn(s, card, { value: page.value, trust: 1, wrongModelHits: page.wrongModel ? [{ id: page.wrongModel, p: 0.9 }] : [], byValue: !!page.wrongModel, reasoning: false, hedged: false, how: 'page', page: true }, { id: `page:${cardId}`, text: '(their work on the page)' }, Date.now(), null);
    return { resultRefs: [] };
  }, { maxAttempts: 1 });

  // A drawing scored per rubric element by the calibrated narrow judge (understanding.judge, `drawing.shows`): met only on a
  // yes; a no, an element not judged, or one the reader was unsure of is unmet. Not calibrated: no verdict, no credit.
  jobs.register('director_drawing', async ({ reading, rubric, task, ...o }) => {
    const verdicts = await Promise.resolve().then(() => U().judge?.('drawing.shows', rubric.map((element, i) => ({ id: String(i), task, element, drawing: reading })))).catch(() => null);
    if (!Array.isArray(verdicts)) return { state: 'discussion_only' };
    const met = rubric.filter((_, i) => verdicts.find(v => v.id === String(i))?.ok === true).length;
    const s = S().peek(o.sessionId), c = s && o.cardId ? getCard(scopeOf(s), o.cardId) : null;
    if (s) observe(scopeOf(s), { ...o, outcome: met / rubric.length, criteria: { met, total: rubric.length }, helpLevel: c?.helpLevel ?? 0, itemId: null });
    return { resultRefs: [] };
  }, { maxAttempts: 1 });

  // An explanation judged on the calibrated criteria: it says why (answer.mechanism) and claims nothing wrong (answer.unsupported).
  /** A page row held for the spoken line (HELD_MS): one attempt, one row, keyed to the line that says it when there is one. */
  function hold(s, row) {
    const st = stateOf(S().peek(s.id)), held = { ...(st.held || {}) }, list = [...(held[row.cardId] || []), row];
    saveState({ ...st, held: { ...held, [row.cardId]: list } });
    jobs.enqueue({ scope: scopeOf(s), type: 'director_held', idempotencyKey: `held:${row.cardId}:${list.length}`, payload: { sessionId: s.id, cardId: row.cardId }, priority: 30, availableAt: clock.now() + HELD_MS });
  }
  function claimHeld(s, cardId, responseId) {
    const st = stateOf(S().peek(s.id)), list = st.held?.[cardId];
    if (list?.some(o => !o.responseId)) saveState({ ...st, held: { ...st.held, [cardId]: list.map((o, i) => (i === list.findIndex(x => !x.responseId) ? { ...o, responseId } : o)) } });
  }
  function flushHeld(s, cardId) {
    const st = stateOf(S().peek(s.id)), list = st.held?.[cardId];
    if (!list?.length) return;
    saveState({ ...st, held: { ...st.held, [cardId]: [] } });
    for (const o of list) observe(scopeOf(s), o);
  }
  jobs.register('director_held', async ({ sessionId, cardId }) => { const s = S().peek(sessionId); if (!s) return { state: 'stale' }; flushHeld(s, cardId); return { resultRefs: [] }; }, { maxAttempts: 1 });
  /**
   * An explanation judged by the calibrated criteria (answer.mechanism, and answer.unsupported as a fault), against an item's key
   * and the KC's mechanism, or against a course case's own text (decisive11b: a reply to "How does your idea fit that?").
   * → { outcome, trust }; null when the judge is unavailable or uncalibrated; false when there is nothing to judge against.
   */
  async function judgeReply(s, kc, id, text) {
    const scope = scopeOf(s), item = itemById(cmOf(scope), id), c = item ? null : caseOf(s, id), slice = sliceOf(scope, kc), idea = !item && !c && id === kc ? slice?.kc : null; // a summary explains the KC itself
    if (!item && !c && !idea) return false;
    const reference = item ? [item.answer, slice?.explanation?.mechanism || slice?.kc?.statement].filter(Boolean).join(' — ') : c ? c.text : [idea.statement, slice?.explanation?.mechanism || slice?.explanation?.plain].filter(Boolean).join(' — ');
    const one = [{ id: '1', question: item ? `${item.prompt}\nWhy does that answer work?` : c ? `${learnerText(c.text)}\nHow does the student's idea fit this case?` : "Sum up today's idea in two sentences, in your own words.", reference: clip(reference, 1500), answer: text }];
    const [why, wrong] = await Promise.all(['answer.mechanism', 'answer.unsupported'].map(cr => Promise.resolve().then(() => U().judge?.(cr, one)).catch(() => null)));
    const a = why?.[0], b = wrong?.[0];
    return a?.ok == null || b?.ok == null ? null : { outcome: a.ok && b.ok ? 1 : b.ok === false ? 0 : 0.5, trust: Math.min(a.trust ?? 0.9, b.trust ?? 0.9) };
  }
  jobs.register('director_explanation', async ({ e5, text }) => {
    const s = S().peek(e5.sessionId), j = s ? await judgeReply(s, e5.kcs[0], e5.itemId, text) : false;
    if (j === false) return { state: 'stale' };
    observe(scopeOf(s), j ? { ...e5, ...j } : e5); // not calibrated or unavailable: the light reading
    return j ? { resultRefs: [] } : { state: 'light_reading' };
  }, { maxAttempts: 1 });

  // ---------- off the card: a change of topic, think ----------
  /** A topic switch: an open goal its words name becomes current, else a new goal; its card 1 at once, no model call. Gives { say, card }. */
  function topicSwitch(s0, to, via, respondsTo = null) {
    const topics = studyOf(scopeOf(s0));
    if (topics) return studySwitch(s0, topics, to, respondsTo); // an exam with a study guide moves within it, never to an old section
    const key = [...words(to)].sort().join(' '), last = stateOf(s0).lastTopic, cur = currentGoal(s0.agenda);
    if (last && last.key === key && cur?.id === last.goalId) return { say: `Already on "${cur.title}".`, card: current(s0), repeated: true };
    const { say, moved } = S().changeTopic(s0.id, to);
    if (moved === false) return { say, card: null, repeated: true }; // not a place in their course: nothing changes
    const first = opening(S().peek(s0.id)), s = S().peek(s0.id), goal = currentGoal(s.agenda), card = first ? issue(s, first, { respondsTo }) : null;
    saveState({ ...stateOf(s), lastTopic: { key, goalId: goal?.id ?? null, at: clock.iso(), via } });
    return { say, card: card && pageCard(fullCard(card)) };
  }
  /** The study-guide topic their words name ("lab 5 loops", "minifloats", "lecture 16"): by title, else by the guide's own text, else by lecture. */
  function studyTopicFor(s, topics, to) {
    const byTitle = topicOfWords(topics, to);
    if (byTitle >= 0) return byTitle;
    const hit = searchSources(sourcesOf(scopeOf(s)).filter(x => x.source.startsWith('study guide')), to, { max: 1 })[0];
    const title = hit && topics.find(t => hit.text.includes(`## ${t.title}`) || hit.text.startsWith(t.title));
    if (title) return title.n;
    const lecture = String(to).match(/lecture\s*(\d+)/i)?.[1];
    return lecture ? topicOfLecture(topics, lecture) : -1;
  }
  function studySwitch(s0, topics, to, respondsTo) {
    const n = studyTopicFor(s0, topics, to);
    if (n < 0) return { say: `No study-guide topic matches "${clip(to, 80)}". The topics: ${topics.map(t => `${t.n + 1}. ${t.title}`).join('; ')}. Pick the closest (change_topic with its title), or teach it here with look_up.`, card: null, repeated: true };
    if (stateOf(s0).guide?.study?.n === n) return { say: `Already on topic ${n + 1}: ${topics[n].title}.`, card: current(s0), repeated: true };
    let goal = currentGoal(s0.agenda);
    if (!goal) { opening(s0); goal = currentGoal(S().peek(s0.id).agenda); }
    const c = goal && studyCard(S().peek(s0.id), goal, n), card = c ? issue(S().peek(s0.id), c, { respondsTo }) : null;
    return { say: card ? `Now on topic ${n + 1} of ${topics.length}: ${topics[n].title}. Its notes and the real problems on it are in your context.` : 'Could not open that topic: go on here.', card: card && pageCard(fullCard(card)) };
  }
  function changeTopic(principal, sessionId, body) {
    validate(TOPIC_BODY, body);
    const s0 = S().get(principal, sessionId);
    if (s0.status === 'ended') fail('invalid_input', 'This session has ended.');
    const { say, card } = topicSwitch(s0, body.to.trim(), 'actor');
    return { say, card, text: card && safe(() => agent.actorCard?.(card) ?? null, null) };
  }
  /** What the learner's page holds now, as text for think (the question, a source, a reading), at most ~2,500 characters. */
  const pageText = show => !show ? null : clip(show.kind === 'reading' ? `${show.portion.purpose}\n${show.portion.body.map(b => b.text).join('\n')}` : show.content ?? show.quote ?? show.task?.ask ?? show.title ?? null, 2500) || null;
  /** Guide mode's page as text for think: the problem they're on in full, and what the tutor has written. */
  function guidePage(s) {
    const st = s && stateOf(s), q = st?.guide?.questions?.find(x => x.id === st.guideActive);
    return clip([q ? `The problem on the page (${q.source || q.id}):\n${q.prompt || q.spoken}` : null, ...(st?.guideWritten || []).slice(-3).map(w => `Written on the page${w.title ? ` ("${w.title}")` : ''}:\n${w.content}`)].filter(Boolean).join('\n\n'), 4000) || null;
  }
  /** POST /sessions/{id}/think: a hard or off-card question; the answer follows as thought.ready. */
  function think(principal, sessionId, body) {
    validate(THINK_BODY, body);
    const s = S().get(principal, sessionId);
    if (s.status === 'ended') fail('invalid_input', 'This session has ended.');
    const thinkId = newId('think'), kind = /^\s*draw\b/i.test(body.question) ? 'drawing' : 'think';
    jobs.enqueue({ scope: scopeOf(s), type: 'director_think', idempotencyKey: thinkId, payload: { sessionId: s.id, thinkId, question: body.question.trim() }, priority: 49 });
    return { thinkId, etaMs: etaOf(kind), making: { kind, label: kind === 'drawing' ? `Drawing: ${atWord(body.question.trim().replace(/^\s*draw:?\s*/i, ''), 70)}` : 'Thinking it through' } };
  }
  jobs.register('director_think', async ({ sessionId, thinkId, question }) => {
    const s = S().peek(sessionId), scope = scopeOf(s), km = s.pinnedKnowledgeManifestId;
    const found = safe(() => K().retrieve(scope, km, { topicIds: [], objectiveVersionIds: [], anchorIds: [], query: question, relationTypes: [], reason: 'think', maxTokens: 3000 }), { excerpts: [] });
    const material = safe(() => K().passages(scope, km, found.excerpts.map(e => e.anchorId), { maxTokens: 2500 }), []).map(p => ({ lecture: p.lecture, section: p.section, text: p.blocks.map(b => b.text).join('\n\n') }));
    const card = getCard(scope, stateOf(s).cardId), slice = card?.target?.kc ? sliceOf(scope, card.target.kc) : null;
    // The course model's understanding of what is in play; never the withheld answer of an open question.
    const g = card?.act === 'guide' ? stateOf(s).guide : null; // guide mode: the section's ideas, as the course model has them
    const understanding = slice ? { idea: slice.kc.statement, plain: slice.explanation?.plain ?? null, mechanism: clip(slice.explanation?.mechanism, 900) || null }
      : g ? { idea: `${g.title}: ${g.story?.about ?? ''}`, plain: clip(g.ideas.map(i => `${i.title}: ${i.plain}`).join(' '), 1200), mechanism: null } : null;
    const t0 = Date.now();
    let early = null, switched = false;
    const onText = onFields([
      { when: p => p.topicRequest || typeof p.say === 'string', run: p => { if (p.topicRequest) { switched = true; safe(() => topicSwitch(S().peek(sessionId), p.topicRequest, 'think')); } } },
      // A drawing's plan, once its draft is whole (the field after element): the page shows it as an outline while it is built.
      { when: p => p.board?.title && 'zone' in p.board, run: p => progress(sessionId, thinkId, { stage: 'Drawing it', title: p.board.title, outline: clip(p.board.element?.request || p.board.content || '', 400) || null }) },
      { when: p => typeof p.say === 'string', run: p => { early = { lecture: p.lecture ?? null }; S().emit(sessionId, 'thought.ready', { thinkId, question, say: p.say, board: null, boardWhy: null, lecture: early.lecture, ms: Date.now() - t0, partial: true }); } },
    ]);
    const r = await call(x => app.providers.directorWriter.think(x), {
      work: workIdentity({ scope, idempotencyKey: `think:${thinkId}`, input: { question }, clock }), question, course: db.get('exams', scope.examId, scope)?.title ?? null, material, questions: [], onText,
      understanding, page: card?.act === 'guide' ? guidePage(S().peek(sessionId)) : pageText(card?.show), ...(card?.act === 'guide' ? { rules: 'Guide mode: "page" is what is on their page now (the problem they are on, in full, and what the tutor wrote). If they asked to see something, your board may be a diagram or a visual (an element) of it, nothing else: never a problem, a question, a quiz or a verdict on their answer. Never say something is on the page unless your board draws it; never say you are switching topics; never say their notes lack the problem on the page (it is given).' } : {}), now: card ? { intention: card.intention, ask: card.ask, answerStillOpen: (card.helpLevel ?? 0) < 3 && !!card.item } : null,
    }, { valueSchema: THOUGHT, what: 'thought' });
    const thought = r.outcome === 'ok' ? r.value : { say: "I couldn't think that through properly just now. Let's keep going, and I'll come back to it.", board: null, boardWhy: '', lecture: null };
    if (!switched && thought.topicRequest && card?.act !== 'guide') { switched = true; safe(() => topicSwitch(S().peek(sessionId), thought.topicRequest, 'think')); }
    // Guide mode: think answers in words only; the guide's boards and the checked problems are the page (12 Oct quick runs: a think
    // board wrote its own problem and a "conditional verdict" beside the checked one).
    // Guide mode: a drawing they asked for (a diagram, an element) may go up; never a problem, a question or a verdict (12 Oct:
    // a think board wrote its own problem and a "conditional verdict" beside the checked one; with none at all, "draw it" failed).
    const drawn = await boardOf(s, thought.board, { build: 25_000 }), board = card?.act !== 'guide' ? drawn : drawn && ['diagram', 'element', 'zone'].includes(drawn.kind) ? drawn : null; // 13 Oct: a code panel they asked for was dropped
    took(/^\s*draw\b/i.test(question) ? 'drawing' : 'think', Date.now() - t0);
    if (!early) S().emit(sessionId, 'thought.ready', { thinkId, question, say: thought.say, board, boardWhy: thought.boardWhy, lecture: thought.lecture, ms: Date.now() - t0 });
    else if (board || thought.lecture !== early.lecture) S().emit(sessionId, 'thought.updated', { thinkId, board, boardWhy: thought.boardWhy, lecture: thought.lecture, ms: Date.now() - t0 });
    return { resultRefs: [] };
  }, { maxAttempts: 1 });

  // ---------- evidence from the page ----------
  /** POST /sessions/{id}/evidence: element and reading events → observations and exposures; a page result they're waiting on moves the session. */
  function evidence(principal, sessionId, body) {
    validate(EVIDENCE, body);
    const s = S().get(principal, sessionId), scope = scopeOf(s), st = stateOf(s);
    const got = fromEvents(body.events, { cardOf: id => getCard(scope, id), sessionId: s.id });
    let observed = 0, exposed = 0;
    for (const o of got.observations) {
      const c = o.cardId && getCard(scope, o.cardId), row = { ...o, helpLevel: c?.helpLevel ?? 0, itemId: c?.item?.id ?? null, taughtBy: st.arc?.taught ? { ...st.arc.taught, cardId: st.arc.taughtCard ?? null } : null };
      if (o.family === 'E4' && st.spokenChecks?.[o.cardId]) continue;
      // A prediction on the page of the card in play is often said aloud at the same moment (decisive8: the page's row went in
      // first, with no response id, and the spoken attempt counted as unobserved): held briefly for that line, else recorded as is.
      if (o.family === 'E4' && o.cardId && o.cardId === st.cardId && ['predict', 'teach'].includes(c?.show?.task?.mode)) { hold(s, row); observed++; continue; }
      if (observe(scope, row)) observed++;
    }
    for (const x of got.exposures) if (safe(() => L().expose?.(scope, x), null)) exposed++;
    for (const j of got.judging) jobs.enqueue({ scope, type: 'director_drawing', idempotencyKey: `drawing:${j.cardId}:${hashOf(j.reading)}`, payload: { ...j, taughtBy: st.arc?.taught ? { ...st.arc.taught, cardId: st.arc.taughtCard ?? null } : null }, priority: 20 });
    if (Object.keys(got.outcomes).length || Object.keys(got.enacted).length) {
      saveState({ ...stateOf(s), page: { ...(stateOf(s).page || {}), ...got.outcomes }, enacted: { ...(stateOf(s).enacted || {}), ...got.enacted } });
      const cur = getCard(scope, stateOf(s).cardId);
      if (cur && got.outcomes[cur.id] && cur.show?.task?.mode === 'construct' && stateOf(s).last?.kind === 'hold') jobs.enqueue({ scope, type: 'director_page', idempotencyKey: `page:${cur.id}`, payload: { sessionId: s.id, cardId: cur.id }, priority: 50 });
    }
    return { accepted: body.events.length - got.ignored, observed, exposed, ignored: got.ignored };
  }

  const publicState = ({ scope, rowVersion, ...st }) => st;
  app.services.director = { start, turn, think, changeTopic, guide: guideAction, current, evidence, state: s => publicState(stateOf(s)) };
}
