import { s } from '../core/shape.mjs';
import { ELEMENT_EVENTS, LEVELS } from '../../shared/cards.mjs';

// POST /v1/sessions/{id}/evidence (spec §15, §15b; interactive-learning.md §9.3; reading.md §8): what the learner did on the
// page, turned into learner observations (elements) and exposures (readings). Pure: the director stores nothing here
// but the page's last outcome per card, which its next turn reads. Watching earns nothing; credit is weighted by the
// level the learner actually reached (`enacted`, weighted by the learner model).

export const EVIDENCE = s.object({ events: s.array(s.json(), { min: 1, max: 100 }) });
const rankOf = (helpLevel, hinted) => hinted || helpLevel >= 2 ? 4 : 2; // spec §3: with help, else unaided on a new instance (an element task is a fresh one)
const higher = (a, b) => LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b;
const share = diff => Array.isArray(diff) && diff.length ? diff.filter(d => d?.match).length / diff.length : null;

/**
 * Events → { observations, exposures, outcomes, enacted, judging (drawings to score), ignored }. `cardOf(id)` gives the card an event belongs to (its target
 * names the KC when the event names none). A reveal and a signature on the same checkpoint make one observation; hints
 * and time in the batch count as help for what follows them. Unknown types are ignored, never fatal.
 * `outcomes`: per card, the page's last verdict ({ value: 'correct' | 'incorrect' | 'wrong_model', wrongModel?, firstFailure?, at }).
 */
export function fromEvents(events, { cardOf, sessionId }) {
  const observations = [], exposures = [], outcomes = {}, enacted = {}, judging = [];
  let ignored = 0, hints = 0;
  const pending = new Map(); // element:checkpoint → observation waiting for its signature
  for (const e of events) {
    if (!e || typeof e !== 'object' || (!ELEMENT_EVENTS.includes(e.type) && e.type !== 'reading')) { ignored++; continue; }
    const card = e.cardId ? cardOf(e.cardId) : null, target = card?.target || {};
    const kcs = (Array.isArray(e.concepts) && e.concepts.length ? e.concepts : [target.kc || target.topicId]).filter(x => typeof x === 'string');
    if (e.type === 'reading') {
      if (typeof e.portion === 'string' || typeof e.portion?.id === 'string') exposures.push({ kcs, portionId: e.portion?.id ?? e.portion, readingEvent: e, sessionId });
      else ignored++;
      continue;
    }
    const key = `${e.element ?? e.cardId}:${e.checkpoint ?? ''}`, level = LEVELS.includes(e.level) ? e.level : null;
    if (e.type === 'hints' || e.type === 'time') { hints += Number(e.hints) || (e.type === 'hints' ? 1 : 0); continue; }
    if (e.type === 'enacted_level' || e.type === 'shown') { if (level) enacted[e.element ?? e.cardId] = higher(level, enacted[e.element ?? e.cardId] || 'viewing'); continue; }
    if (!kcs.length) { ignored++; continue; }
    const base = (family, enactedLevel, outcome, extra = {}) => ({
      kcs, family, regime: 'R1', rank: rankOf(card?.helpLevel ?? 0, hints > 0), outcome, assistance: Math.min(1, (card?.helpLevel ?? 0) / 4 + 0.25 * hints),
      wrongModelHits: [], enacted: higher(enactedLevel, enacted[e.element ?? e.cardId] || 'viewing'), source: 'element', responseId: null, sessionId, cardId: e.cardId ?? null, kind: e.kind ?? null, ...extra,
    });
    if (e.type === 'revealed') {
      if (e.by === 'model' || e.by === 'persona') { ignored++; continue; } // their earlier answer replayed (already counted), or the classmate's attempt
      const outcome = typeof e.match === 'boolean' ? Number(e.match) : share(e.diff);
      if (outcome === null) { ignored++; continue; }
      const o = base('E4', 'responding', outcome);
      pending.set(key, o); observations.push(o);
      if (e.cardId) outcomes[e.cardId] = { value: outcome === 1 ? 'correct' : 'incorrect', diff: e.diff ?? null, at: e.at ?? null };
    } else if (e.type === 'signature') {
      if (typeof e.wrongModel !== 'string') { ignored++; continue; }
      const hit = { id: e.wrongModel, p: 0.9 }, o = pending.get(key);
      if (o) { o.outcome = 0; o.wrongModelHits.push(hit); } else observations.push(base('E4', 'responding', 0, { wrongModelHits: [hit] }));
      if (e.cardId) outcomes[e.cardId] = { value: 'wrong_model', wrongModel: e.wrongModel, at: e.at ?? null };
    } else if (e.type === 'constructed') {
      const pass = e.check?.pass;
      if (typeof pass !== 'boolean') { ignored++; continue; }
      observations.push(base('E8', 'constructing', Number(pass), { steps: pass ? [] : [{ ok: false, at: e.check.firstFailure ?? null }], attempts: Number(e.attempts) || 1 }));
      if (e.cardId) outcomes[e.cardId] = { value: pass ? 'correct' : 'incorrect', firstFailure: e.check.firstFailure ?? null, at: e.at ?? null };
    } else if (e.type === 'drawn' || e.type === 'taught') {
      const score = typeof e.score === 'number' ? e.score : e.criteria && typeof e.criteria.met === 'number' && e.criteria.total ? e.criteria.met / e.criteria.total : null;
      if (score === null && e.type === 'drawn' && typeof e.reading === 'string' && e.reading.trim() && Array.isArray(e.rubric) && e.rubric.length) { judging.push({ ...base('E8', 'constructing', null), reading: e.reading.slice(0, 4000), rubric: e.rubric.slice(0, 12).map(String), task: card?.show?.task?.ask ?? card?.ask ?? '' }); continue; } // scored by the calibrated judge in the background
      if (score === null) { ignored++; continue; }
      observations.push(base(e.type === 'drawn' ? 'E8' : 'E5', e.type === 'drawn' ? 'constructing' : 'presenting', Math.max(0, Math.min(1, score))));
    } else if (e.type === 'predicted' || e.type === 'changed' || e.type === 'explained') {
      // A prediction is credited at its reveal; a change earns nothing alone; an explanation is judged when it is said.
      enacted[e.element ?? e.cardId] = higher(e.type === 'changed' ? 'changing' : 'responding', enacted[e.element ?? e.cardId] || 'viewing');
    }
  }
  return { observations, exposures, outcomes, enacted, judging, ignored };
}
