// Card v2 (docs/system-spec.md §15, §15b; docs/research/reading.md §8): one teaching move, for any subject. Pure: the
// engine builds and checks cards with it, the page checks what it renders. The voice's text of a card is stage's
// actorCard (backend/session/agent.mjs); it never sees `withheld` or `why`.
//
// Card {
//   id, sessionId, n, issuedAt, goalId, goalTitle, source,                      // bookkeeping
//   move: MOVES, act,                                                           // the family, and the move within it ('separating_question', 'refutation', …)
//   target: { kc, topicId, statement, kind?, spine? }, helpLevel: 0–4 (H0 pump … H4 worked solution), intention,
//   verdict: null | { value: VERDICTS | null, utterance: UTTERANCES, wrongModel?, errorKind?, step?, trust? },  // the engine's verdict on the last turn
//   say /* ≤ ~4 sentences, one idea */, ask /* generative, the last sentence */, wait: WAITS,
//   show: null | ElementSpec | { kind: 'reading', portion: ReadingPortion (inline), highlight: AnchorId[] } | a board (shared/boards.mjs),
//   expect: [{ id, kind: BRANCH_KINDS, when, literal?, wrongModel?, pageState?, reply, then: { cardId, ask } }],
//   neutral /* said on any answer that isn't a literal match, while it is verified */, handBack,
//   persona: null | { name, misconception, lines, acceptWhen, probes, transferItem },
//   withheld: { answer?, solution? } /* never sent to the voice below H3 */, why /* cites learner evidence */,
//   item: null | { id, family, regime, format? }                               // the course-model item asked: what the answer is verified against
// }
import { BOARD_KINDS, checkBoard } from './boards.mjs';
import { REGISTRY, checkElementSpec } from './elements/registry.mjs';

export const MOVES = ['probe', 'elicit', 'read', 'present', 'repair', 'scaffold', 'feedback', 'practice', 'metacognitive', 'affect'];
export const WAITS = ['recall', 'reasoning', 'work', 'reading'];
export const VERDICTS = ['correct', 'valid_nonstandard', 'partial', 'pending', 'slip', 'wrong_model', 'missing_piece', 'incorrect', 'uncertain', 'no_attempt', 'stuck', 'request', 'claims_understanding'];
/** What kind of utterance a line was (step 1 of the policy, before any correctness check), on `verdict.utterance`. */
export const UTTERANCES = ['answer', 'partial', 'belief', 'request', 'claim', 'question', 'stuck', 'hold', 'chat']; // belief: a content claim matched to a known wrong model
export const BRANCH_KINDS = ['correct', 'valid_nonstandard', 'partial', 'wrong_model', 'stuck', 'done', 'question', 'term', 'skip', 'other'];
/** The engagement ladder (docs/research/interactive-learning.md §A): what an element's evidence is weighted by. */
export const LEVELS = ['viewing', 'responding', 'changing', 'constructing', 'presenting'];
/** The evidence vocabulary (interactive-learning.md §9.3), plus the reading event (reading.md §8). */
export const ELEMENT_EVENTS = ['shown', 'predicted', 'revealed', 'changed', 'constructed', 'explained', 'taught', 'drawn', 'signature', 'enacted_level', 'time', 'hints'];

const SAY_SENTENCES = 4, SAY_WORDS = 90; // one idea; longer exposition goes on the page (reading.md §7.1, R1)
const REFLEX = /\b(does (that|this) make sense|got it\??$|any questions|is that clear|you know\?)/i;
const sentences = text => String(text ?? '').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"“(`$−-])/).filter(x => x.trim());
const wordCount = text => (String(text ?? '').match(/\S+/g) || []).length;
const norm = text => String(text ?? '').toLowerCase().replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim();
const text = v => typeof v === 'string' ? v.trim() : '';
/**
 * Verdict strength follows trust (spec §13 rule 7): a plain verdict ("Yes", "Right", "Not quite", "No", "That's wrong")
 * only at trust ≥ PLAIN_TRUST; from HEDGED_TRUST a hedged verdict and a check on the specific point ("I get something
 * different for s4"); below it, no verdict. A sentence that opens with plain verdict words is one.
 */
export const PLAIN_TRUST = 0.95, HEDGED_TRUST = 0.6;
const PLAIN_ONE = "(?:yes|yep|yeah|correct|exactly|right|perfect|no|nope|wrong|incorrect|not yet|that(?:'s| is) it|that(?:'s| is) exactly(?: it| right)?)(?=\\s*[,.!:;—–]|\\s*$)";
const PLAIN_MANY = "(?:not quite|spot on|well done|nice work|good job|you(?:'re| are) right|you got it|that(?:'s| is) (?:right|correct|wrong|incorrect|not (?:right|correct|it|quite(?: it| right)?)))(?=[\\s,.!:;—–]|$)";
const PLAIN = new RegExp(`(?:^|[.!?]\\s+)(${PLAIN_ONE}|${PLAIN_MANY})`, 'i');
const apos = t => String(t ?? '').replace(/[’‘]/g, "'");
/** The plain verdict words a text opens a sentence with ("Not quite"), or null. */
export const plainVerdict = t => PLAIN.exec(apos(t))?.[1] ?? null;
/** The text without its plain verdict openers: "Not quite: it isn't true that …" → "It isn't true that …". */
export function withoutPlainVerdict(t) {
  let out = apos(t);
  for (let i = 0; i < 4 && PLAIN.test(out); i++) out = out.replace(PLAIN, (whole, words) => whole.slice(0, whole.length - words.length)).replace(/(^|[.!?]\s+)[\s,.!:;—–-]+/, '$1');
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\s+/g, ' ').trim();
}

/** Whether `needle` (a literal or a withheld answer) occurs whole in `hay`. A single digit is skipped: "2" is in too much speech. */
export const occurs = (hay, needle) => { const n = norm(needle); if (/^\d$/.test(n)) return false; return n.length >= 1 && new RegExp(`(^|[^\\w-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w])`).test(norm(hay)); };

/** A show checked: { show, problem }: a reading (its portion inline), an element (the registry's checkElementSpec), or a board. */
export function checkShow(show) {
  if (show == null) return { show: null, problem: null };
  if (typeof show !== 'object' || typeof show.kind !== 'string') return { show: null, problem: 'show needs a kind' };
  try {
    if (show.kind === 'reading') { const portion = REGISTRY.reading.engine.validate(show.portion); return { show: { kind: 'reading', portion, highlight: Array.isArray(show.highlight) ? show.highlight.filter(a => typeof a === 'string') : portion.keyAnchors }, problem: null }; }
    if (BOARD_KINDS.includes(show.kind)) { const { board, problem } = checkBoard(show); return { show: board, problem }; }
    return { show: checkElementSpec(show), problem: null };
  } catch (error) { return { show: null, problem: error.message }; }
}

/**
 * A card checked for the voice and the page: { card, problems }. `card` is normalized (strings trimmed, branch ids and
 * thens filled, a show that fails its check dropped); `problems` say what is wrong, for the engine to repair or fall back
 * on. Below H3 no voice field may carry a correct literal or the withheld answer (an unearned reveal, rubric gate G2).
 */
export function checkCard(card) {
  const problems = [], c = { ...card };
  if (!MOVES.includes(c.move)) problems.push(`move must be one of ${MOVES.join(', ')}`);
  if (!WAITS.includes(c.wait)) problems.push(`wait must be one of ${WAITS.join(', ')}`);
  if (!Number.isInteger(c.helpLevel) || c.helpLevel < 0 || c.helpLevel > 4) problems.push('helpLevel must be 0 to 4 (H0–H4)');
  for (const k of ['say', 'intention', 'neutral', 'handBack', 'why']) c[k] = text(c[k]);
  c.ask = text(c.ask) || null;
  if (!c.intention) problems.push('no intention');
  if (!c.why) problems.push('no why: cite the learner evidence (or say the course model is not built)');
  if (c.ask && !c.neutral) problems.push('an ask needs a neutral line for answers that are not a literal match');
  if (sentences(c.say).length > SAY_SENTENCES || wordCount(c.say) > SAY_WORDS) problems.push(`say is ${wordCount(c.say)} words in ${sentences(c.say).length} sentences: one idea, at most ${SAY_SENTENCES} sentences; longer exposition goes on the page`);
  if (c.ask && sentences(c.ask).length > 2) problems.push('ask is more than two sentences: context goes in say or on the page');
  for (const k of ['ask', 'handBack']) if (REFLEX.test(c[k] || '')) problems.push(`${k} is a reflex check ("does that make sense?"): ask for something they produce`);
  const target = c.target || {};
  if (!text(target.statement)) problems.push('target needs a statement');
  // Rule 7: the say's verdict as strong as the verdict's trust; the neutral line is said before any verdict, so it has none.
  const trust = typeof c.verdict?.trust === 'number' ? c.verdict.trust : 0, plain = plainVerdict(c.say);
  if (plain && trust < PLAIN_TRUST) problems.push(`say opens with a plain verdict ("${plain}") at trust ${trust}: hedge it from ${HEDGED_TRUST}, else no verdict (rule 7)`);
  if (plainVerdict(c.neutral)) problems.push(`the neutral line has a verdict ("${plainVerdict(c.neutral)}"): it is said before any verdict`);

  const ids = new Set();
  c.expect = (Array.isArray(c.expect) ? c.expect : []).map((b, i) => {
    const id = text(b.id) && !ids.has(b.id) ? b.id : `b${i + 1}`;
    ids.add(id);
    if (!BRANCH_KINDS.includes(b.kind)) problems.push(`branch ${id}: kind must be one of ${BRANCH_KINDS.join(', ')}`);
    if (!text(b.when)) problems.push(`branch ${id} has no when`);
    if (!text(b.reply) && !['done', 'skip'].includes(b.kind) && !b.then?.cardId) problems.push(`branch ${id} has no reply and nothing next`);
    return { ...b, id, when: text(b.when), literal: text(b.literal) || null, wrongModel: b.wrongModel ?? null, pageState: b.pageState ?? null, reply: text(b.reply), then: { cardId: b.then?.cardId ?? null, ask: text(b.then?.ask) || null } };
  });
  const right = c.expect.filter(b => ['correct', 'valid_nonstandard'].includes(b.kind) && b.literal).map(b => norm(b.literal));
  for (const b of c.expect) if (!['correct', 'valid_nonstandard'].includes(b.kind) && b.literal && right.includes(norm(b.literal))) problems.push(`branch ${b.id} (${b.kind}) has a correct answer as its literal`);

  c.withheld = { answer: text(c.withheld?.answer) || null, solution: text(c.withheld?.solution) || null };
  if (c.helpLevel < 3) {
    const choice = / or /i.test(c.ask || ''); // a multiple-choice ask names its answer among the options: that is no reveal
    const voiced = [['say', c.say], ...(choice ? [] : [['ask', c.ask]]), ['neutral', c.neutral], ['handBack', c.handBack], ...c.expect.filter(b => !['correct', 'valid_nonstandard'].includes(b.kind)).map(b => [`branch ${b.id}'s reply`, `${b.reply} ${b.then.ask || ''}`])];
    for (const secret of new Set([...right, norm(c.withheld.answer)].filter(Boolean))) for (const [where, said] of voiced) if (said && occurs(said, secret)) problems.push(`${where} gives away the answer "${secret}" below H3`);
  }
  if (c.persona != null) {
    const p = c.persona;
    if (!text(p.name) || !text(p.misconception) || !Array.isArray(p.lines) || !p.lines.length || !text(p.acceptWhen)) { problems.push('a persona needs a name, its misconception, scripted lines and acceptWhen'); c.persona = null; }
  } else c.persona = null;

  const shown = checkShow(c.show);
  if (shown.problem) problems.push(`show: ${shown.problem}`);
  c.show = shown.show;
  if (c.show?.kind === 'reading' && !norm(`${c.say} ${c.ask || ''}`).includes(norm(c.show.portion.purpose))) problems.push('a reading\'s purpose is said in the same words as its title');
  if (c.show?.kind === 'reading' && c.wait !== 'reading') problems.push('a reading card waits for reading');
  return { card: c, problems };
}

/** The card as the page and the voice get it: everything but what is withheld and the engine's own bookkeeping. */
export const pageCard = ({ withheld, scope, rowVersion, cacheKey, ...card }) => card;
