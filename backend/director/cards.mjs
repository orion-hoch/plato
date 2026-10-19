import { s } from '../core/shape.mjs';
import { BOARD_KINDS, ELEMENT_KINDS, CHECK_KINDS } from '../../shared/boards.mjs';
import { DIAGRAM_TYPES } from '../../src/visuals/diagram.mjs';
import { MOVES, WAITS, BRANCH_KINDS, PLAIN_TRUST, HEDGED_TRUST } from '../../shared/cards.mjs';
import { ACT } from './policy.mjs';
import { words } from '../core/match.mjs';

// Card v2 from a move (docs/system-spec.md §15, §15b): the policy decides, these build the card from the course model's
// own content, with no model call (the instant path, §16). Also: exact matching of an answer against a card's literals,
// and the schemas of the writer (cards for what nothing prepared), the classifier, think and the answer check.

/** A page's text clipped, its paragraphs kept (clip collapses every newline: a board's lines would run together). */
const clipPage = (text, max) => { const t = String(text ?? '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
export const clip = (text, max) => { const t = String(text ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
/** clip for page content (markdown, code, a problem): its line breaks kept (13 Oct: written boards became one run-on paragraph). */
export const cut = (text, max) => { const t = String(text ?? '').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
export const sentencesOf = text => String(text ?? '').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"“(`$−-])/).filter(x => x.trim());
export const firstSentences = (text, n) => sentencesOf(text).slice(0, n).join(' ');
/** A cut at a word, never inside one, with no ellipsis (for a branch's `when`). */
export const atWord = (text, max) => { const t = String(text ?? '').replace(/\s+/g, ' ').trim(); return t.length <= max ? t : t.slice(0, t.lastIndexOf(' ', max)).replace(/[,;:\s]+$/, ''); };
/** Speech of at most `n` sentences and `w` words, cut at a sentence (one idea; long exposition goes on the page). */
const fit = (text, n = 4, w = 85) => { const out = []; for (const x of sentencesOf(text)) { if (out.length >= n || [...out, x].join(' ').split(/\s+/).length > w) break; out.push(x); } return out.join(' ') || atWord(text, 300); };
const voiceSized = text => !!text && text.length <= 170 && sentencesOf(text).length <= 2 && !/```|\$\$|\\\(|\n/.test(text);

// ---------- exact matching: the instant path (numbers in any base, signs said or written; short text literals) ----------
const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
/** Each number a text states, as the forms it may be said in (hex or binary also by value: "0x3F0" is 1008). */
export function numbersOf(text) {
  // Number words count only in a short answer ("minus three", "it's thirteen"): in a sentence, "two's complement" or "this one" are not values.
  const raw = String(text ?? '').toLowerCase().replace(/[−–]/g, '-'), short = raw.split(/\s+/).filter(Boolean).length <= 5;
  const t = (short ? raw.replace(/\b(minus|negative)\s+(?=\d|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)/g, '-').replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b(?!['’])/g, w => NUMBER_WORDS[w]) : raw.replace(/\b(minus|negative)\s+(?=\d)/g, '-'));
  return (t.match(/-?\s?(0x[0-9a-f]+|0b[01]+|\d+(\.\d+)?)/g) || []).map(v => v.replace(/\s/g, '')).map(v => /^-?0[xb]/.test(v) ? [v.replace(/^(-?)0([xb])0*(?=.)/, '$10$2'), String((v.startsWith('-') ? -1 : 1) * parseInt(v.replace(/^-?0[xb]/, ''), v.includes('x') ? 16 : 2))] : [String(Number(v))]);
}
export const valuesOf = text => new Set(numbersOf(text).flat());
const norm = t => String(t ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}'\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
const NEGATED = /\b(not|isn'?t|no|never|wouldn'?t|doesn'?t)\s+$/;
/** Whether a text literal (at most six words) is said in the answer, and not negated just before it. */
function saysText(answer, literal) {
  const a = ` ${norm(answer)} `, l = norm(literal);
  if (!l || l.split(' ').length > 6) return false;
  const at = a.indexOf(` ${l} `);
  return at >= 0 && !NEGATED.test(a.slice(0, at + 1));
}
export const STUCK = /\b(i don'?t know|dunno|no idea|i'?m stuck|i give up|no clue|i'?m lost|haven'?t a clue)\b/i;
/**
 * The branch an answer lands on by its literal (a stated value, or a short phrase), or a stuck branch on "I don't know";
 * else null. Correct branches first; a wrong-model branch whose literal is a correct value is never taken.
 */
// The words a reply may carry around its answer and still be that answer alone ("i think it's 0x1004", "is it 1012?").
const FILLER = new Set("i i'm im i'd i'll think thought guess believe say go going gonna with to it it's its it'd is was be would will that that's the answer my final so um uh hmm well ok okay oh yeah yes right maybe probably pretty sure just like then get got".split(' '));
/** Whether a reply is its literal alone, nothing beside it but filler (decisive8: "If exactly" means their whole reply). */
export function match(card, text) {
  const expect = card.expect || [], said = valuesOf(text);
  if (STUCK.test(text) && !said.size) return expect.find(b => b.kind === 'stuck') || null;
  const want = b => (b.literal ? [...valuesOf(b.literal)] : []);
  // Every number the literal states must be said (in any of its forms); a phrase literal must be said, not negated.
  const fits = b => { if (!b.literal) return false; const nums = numbersOf(b.literal); return nums.length ? nums.every(forms => forms.some(v => said.has(v))) : saysText(text, b.literal); };
  const right = expect.filter(b => ['correct', 'valid_nonstandard'].includes(b.kind)), rightValues = new Set(right.flatMap(want));
  const sameAsRight = b => { const nums = numbersOf(b.literal); return nums.length > 0 && nums.every(forms => forms.some(v => rightValues.has(v))); }; // a card's own slip: never taken
  // A one-word literal ("no", "yes") is an answer only when the line leads with it (decisive13: "…had no freedom at all" took "No").
  const lead = norm(text).split(' ').filter(w => !FILLER.has(w) || ['yes', 'no', 'right'].includes(w))[0];
  const said1 = b => (numbersOf(b.literal).length || norm(b.literal).split(' ').length > 1 || norm(text).split(' ').length <= 3 || lead === norm(b.literal));
  return right.find(b => fits(b) && said1(b)) || expect.filter(b => !right.includes(b) && !sameAsRight(b) && fits(b) && said1(b)).sort((a, b) => want(b).length - want(a).length)[0] || null;
}
export const alone = (text, literal) => { const lit = new Set(norm(literal).split(' ')), said = norm(text).split(' ').filter(Boolean); return said.length > 0 && said.every(w => lit.has(w) || FILLER.has(w)); };
/** What a line gives as its reason beside its answer ("0x1004, since adding 3 adds 3 bytes" → "adding 3 adds 3 bytes"), else null. */
export function reasonPartOf(text, answer = null) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim(), m = /,?\s+(?:because|since|'?cause|cuz|given that)\s+|,\s+(?:so|as)\s+|;\s+/i.exec(t);
  const rest = (m ? t.slice(m.index + m[0].length) : t.split(/\s*[,;:—–]\s+/).filter(x => !(answer && x.includes(answer)) && x.split(' ').length >= 3).join(', ')).replace(/[.!?…]+$/, '').trim();
  return rest.split(/\s+/).length >= 3 ? atWord(rest, 160) : null;
}
/** A short answer the voice can match exactly (a value or a phrase of a few words), else null. */
export const literalOf = answer => { const a = String(answer ?? '').trim(), head = a.split(/[.;:—–]\s|\s[—–]\s|\s(?:because|since)\s/i)[0].trim(); return head.length && head.length <= 40 && head.split(/\s+/).length <= 6 ? head : null; };

// ---------- the element a move runs on (§15b), and its truth from the element's own engine ----------
/**
 * For a kind with a position (a trace), a checkpoint at its last step predicting what that step changes (at most two
 * names), with the engine's own values there as the truth. null for a kind without one, or a run that changes nothing.
 */
export function endCheckpoint(entry, spec) {
  try {
    const E = entry.engine; if (E.next == null) return null;
    let st = E.init(spec), gate = null, before = null;
    for (let i = 0; i < 400; i++) { const keys = E.passes(st, E.next); if (!keys.length) break; gate = keys[0]; before = st; st = E.step(st, E.next); }
    // What the last gated step changes (what was already on the page before it is no prediction).
    const last = E.values(st), prior = before ? E.values(before) : {}, names = Object.keys(last).filter(n => n !== 'line' && String(last[n]) !== String(prior[n])).slice(0, 2);
    return gate && names.length ? { checkpoint: { at: gate, predict: names }, truth: Object.fromEntries(names.map(n => [n, last[n]])) } : null;
  } catch { return null; }
}
/** The element's values right after a checkpoint's gated action, from its own engine (what a prediction there is checked against), or null. */
export function truthAt(entry, state, checkpoint) {
  try {
    const E = entry.engine; let st = E.init(state);
    if (E.next == null) return E.values(E.step(st, checkpoint.at));
    for (let i = 0; i < 2000; i++) { const keys = E.passes(st, E.next); if (!keys.length) return null; st = E.step(st, E.next); if (keys.includes(checkpoint.at)) return E.values(st); }
    return null;
  } catch { return null; }
}
/** An ElementSpec for a representation or an item's element, with its task; checkpoints from the source or the engine. */
export function elementFor(src, { registry, mode, ask, moment, kc, signatures = [], prediction = null, attempt = null, target = null, level = 'responding' }) {
  const entry = src && registry?.[src.kind];
  if (!entry || !src.spec || !entry.modes.includes(mode)) return null;
  let spec;
  try { spec = entry.engine.validate(src.spec); } catch { return null; } // a spec its engine can't run is no element
  const given = src.checkpoints ?? src.task?.checkpoints ?? null, auto = !given && ['predict', 'teach'].includes(mode) ? endCheckpoint(entry, spec) : null;
  const checkpoints = given ?? (auto ? [auto.checkpoint] : []);
  if (['predict', 'teach'].includes(mode) && !checkpoints.length) return null;
  return { spec: { kind: src.kind, state: spec, title: src.title ?? null, task: { mode, ask, checkpoints, target, prediction, attempt }, signatures, level, moment, concepts: kc ? [kc] : [] }, truth: auto?.truth ?? null };
}

// ---------- the parts of a card ----------
const VERDICT_SAY = { correct: "Yes, that's right.", valid_nonstandard: 'That works, in a different form from mine.', wrong_model: 'Not quite.', incorrect: 'Not yet.', missing_piece: 'Not yet.' };
// Rule 7 (§13): verdict strength follows trust. Plain from PLAIN_TRUST (exact, executed, the page); hedged from HEDGED_TRUST (a
// judge, a concise exact mismatch, a detector's match), naming the point when the verifier found which; below, none.
const HEDGED_SAY = { correct: "I think that's right.", valid_nonstandard: 'I think that works, in a different form from mine.', wrong_model: 'I get something different', incorrect: 'I get something different', missing_piece: 'I get something different' };
/** A verdict lead on their answer ("Not yet.") is no denial of a belief: rule 9's filter leaves it. */
export const VERDICT_LEADS = new Set([...Object.values(VERDICT_SAY), "Yes, that is it.", 'Not quite.']);
/** The strength a verdict may be said with: 'plain', 'hedged' or 'none' (spec §13 rule 7). */
export const bandOf = verdict => { const t = typeof verdict?.trust === 'number' ? verdict.trust : null; return t == null ? 'none' : t >= PLAIN_TRUST ? 'plain' : t >= HEDGED_TRUST ? 'hedged' : 'none'; };
const leadOf = verdict => { const band = bandOf(verdict), v = verdict?.value; if (verdict?.account && v === 'correct' && band !== 'none') return band === 'plain' ? "Yes, that's the course's account of that case." : "I think that's the course's account of that case."; if (verdict?.confirm && v === 'correct' && band !== 'none') return band === 'plain' ? `Yes, ${verdict.confirm}.` : `I think ${verdict.confirm} is right.`; if (band === 'plain') return VERDICT_SAY[v] || ''; if (band !== 'hedged' || !HEDGED_SAY[v]) return ''; const h = HEDGED_SAY[v]; return h.endsWith('.') ? h : `${h}${verdict.point ? ` for ${verdict.point}` : ''}.`; };
const NEUTRAL = { E4: 'What makes you expect that?', E5: 'Say a bit more about why.', E6: 'Say a bit more about why.', E9: 'Say a bit more about why.' };
const WAIT_OF = { E1: 'recall', E2: 'reasoning', E3: 'work', E8: 'work' };
const FRAME = {
  first_step: '', predict: 'Try this one with me; a guess is fine.', // after the teaching (teach first, the user 10 Oct) try_first: 'Have a go before I explain; a wrong guess is fine.',
  test: 'Now one on your own, with no help.', retest: 'Same idea, new case.', separating_question: "One more, to pin down how you're thinking about it.",
  retrieval: 'A quick one from before.', interleave: 'Here is a related one: first decide which idea applies.', vary_surface: 'Same idea in a different form.',
  generative_check: "Let's check that with one you haven't seen.", diagnostic: 'A quick check, no pressure.', prequestion: 'Before you read, a quick guess; no right or wrong yet.',
  solo_problem: '', matching: 'Now one like it, on your own.', detour: 'This builds on something earlier, so let me check that first.',
};
/** A statement's core: its first sentence up to any worked example (", so four-bit 1001 means …"), which could give away a new case. */
const core = t => bare(firstSentences(t || '', 1)).split(/,\s+(?:so|for example|e\.g\.)\b|;\s|\s[—–]\s/)[0];
/** The first thing a text says in positive form (rule 9): a hint never denies anything. */
const posCore = t => core(positive(t || ''));
/** At most `max` characters, cut at the last clause boundary (a comma, "and", "but") before it, else at a word. */
/** An arc closed on a right answer or summary (decisive12): confirmed specifically, in the course's words, as strong as its trust; '' else. */
export const closingConfirm = (verdict, kc) => { const band = bandOf(verdict), idea = clause(posCore(kc?.statement || ''), 160); return band === 'none' || !['correct', 'valid_nonstandard'].includes(verdict?.value) ? '' : `${band === 'plain' ? "That's it" : "I think that's it"}${idea ? `: ${lowerFirst(idea)}` : ''}.`; };
const clause = (t, max) => (t.length <= max ? t : (/^(.*\S)(?:,|\s(?:and|but|while|because))\s/.exec(t.slice(0, max))?.[1] ?? atWord(t, max))).replace(/[,;:]+$/, '');
const OWN_VERDICT = new Set(['refutation', 'contrast_step', 'counter_case', 'new_frame', 'run_their_model', 'contrast']); // repairs that say their own verdict
/**
 * §13 rule 9, deny nothing they haven't shown: text in positive form. A clause that negates (", not Y", "Y does not …",
 * "; Y doesn't", "isn't Y", "is not Y", "never …", "rather than Y", "instead of Y") is cut, and a sentence left with nothing
 * (or only its frame, "Think about this:") goes. Kept as written: a sentence inside a protected text (the question on the
 * page, the key, the learner's own words, an opener the engine built for a sure model) and a plain verdict lead ("Not yet.").
 * decisive6: 10 of cs3410's 11 false diagnoses were such clauses ("…; it does not negate the remaining digits").
 */
const NEGATION = /\b(?:not|never|neither|nor|no longer|cannot|(?:is|are|was|were|does|do|did|has|have|had|wo|ca|could|should|would|need)n['’]t)\b/i;
// "X without Y" names Y (decisive11b: "Ammonia without a destination-seeking molecule" told the learner they hold Y): cut when Y
// names a belief not sure for them; kept when it doesn't ("without changing its transport properties") or the model is sure.
const WITHOUT = /,?\s+without\s+[^,;:.!?]*/gi;
const ENDINGS = /^(?:s|es|ed|d|ing|er|ion|ions)$/;
/** One word in two forms ("seek" and "seeking", "move" and "moving"). */
export const sameWord = (a, b) => a === b || [[a, b], [b, a]].some(([x, y]) => y.length > x.length && (y.startsWith(x) && ENDINGS.test(y.slice(x.length)) || x.endsWith('e') && y.startsWith(x.slice(0, -1)) && ENDINGS.test(y.slice(x.length - 1))));
const NO_OR = /\bno\s+(?:[\w-]+\s+){0,3}?or\b/i; // "no sensor or signal": a denial of two
const negated = x => NEGATION.test(x) || NO_OR.test(x);
const CONTRASTING = /\s+(?:rather than|instead of)\s+[^,;:.!?]*/gi;
const FRAMES = /^(?:think about this|focus on (?:this|one|the)|here'?s (?:what'?s true|a step|the idea)|look (?:again|at)|check (?:it|that))/i;
/** Whether a text names one of these beliefs (two of its words, in any form). */
export const namesBelief = (text, unsure = []) => { const w = [...words(text)]; return unsure.some(b => { const bw = [...words(b)]; return w.filter(x => bw.some(y => x.length >= 3 && sameWord(x, y))).length >= 2; }); };
export function positive(t, protect = [], unsure = []) {
  const text = String(t ?? '');
  if (/\n/.test(text)) return text.split(/(\n+)/).map((x, i) => (i % 2 ? x : positive(x, protect, unsure))).join('').replace(/\n{3,}/g, '\n\n').trim(); // line by line: a page's paragraphs are separate
  const names = m => namesBelief(m, unsure);
  const shielded = sentence => { const x = sentence.trim().replace(/[.!?…]+$/, ''); return x.length > 0 && protect.some(p => { const q = String(p ?? '').trim().replace(/[.!?…]+$/, ''); return !!q && (q.includes(x) || (q.length >= 24 && x.includes(q))); }); }; // a long protected text shields the sentence that quotes it
  return sentencesOf(text).map(sentence => {
    if (shielded(sentence) || VERDICT_LEADS.has(sentence.trim())) return sentence;
    const end = /[.!?…]+$/.exec(sentence)?.[0] ?? '', body = sentence.slice(0, sentence.length - end.length).replace(CONTRASTING, '').replace(WITHOUT, m => (names(m) ? '' : m)).replace(/[,;:]+\s*$/, '');
    if (!negated(body)) return body ? `${body}${end}` : '';
    const parts = body.split(/(;\s*|,\s+|:\s+)/), out = [];
    let cut = false;
    for (let i = 0; i < parts.length; i += 2) {
      if (negated(parts[i])) { cut = true; continue; }
      out.push(out.length ? parts[i - 1] ?? ' ' : '', parts[i]);
    }
    const text = out.join('').trim().replace(/[,;:]+$/, '').replace(/^(\S+), (?=\S+ (?:of|for|to|in)\b)/, '$1 '); // "presumptive, evidence of" → "presumptive evidence of"
    if (!text || (cut && FRAMES.test(text) && !/:\s*\S/.test(text))) return ''; // nothing left, or only the frame
    return `${text}${end}`;
  }).filter(Boolean).join(' ').replace(/\s+([,;.!?])/g, '$1').trim();
}
/** An item's key as said aloud: { value, why } ("1012; pointer addition already scales …" → "1012", "pointer addition …"). */
export function keyOf(it) {
  const k = String(it?.key?.value ?? it?.answer ?? '').replace(/\s+/g, ' ').trim();
  if (!k) return null;
  const [head, ...rest] = k.split(/\s*;\s*/);
  if (head.split(/\s+/).length > 6) { // a statement, not a value: it carries its own reason; a tutor's instruction in it is dropped
    const lead = sentencesOf(k).filter(x => !/^(?:do not|don't|never|note|remember|avoid)\b/i.test(x)).slice(0, 3).join(' '); // a multi-part answer whole
    const kept = lead.split(/\s*;\s*/).filter(x => !/^(?:do not|don't|never|note|remember|avoid)\b/i.test(x)).join('; ');
    return { value: atWord(bare(kept || k), 230), why: null };
  }
  const fromAnswer = sentencesOf(it?.answer ?? '').slice(1).join(' '), keyWhy = rest.join('; ');
  const why = keyWhy.split(/\s+/).length >= 4 ? keyWhy : fromAnswer || keyWhy;
  return { value: bare(head), why: why ? atWord(bare(why), 170) : null };
}
/** What a learner said, as their result: the claim before its reason ("a + 3 is 1003, because …" → "a + 3 is 1003"), unhedged. */
export function theirsOf(text) {
  const t = String(text ?? '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().replace(/^(?:(?:so|well|um+|uh+|ok(?:ay)?|yeah|hmm+|i (?:think|thought|guess|believe|get|got)|i still (?:think|believe|say|reckon)|still|(?:i'?m |i am )?(?:pretty |quite |fairly )?sure(?: that)?|maybe|probably|it'?s|it is)[\s,]+)+/i, '');
  return atWord(bare(t.split(/,?\s+(?:because|since)\s+|;\s/i)[0]), 140) || null; // their conclusion stays ("…, so the law can't touch him")
}
/**
 * Rule 8, close the contrast: both results side by side and why they differ. c = { mine, truth, why, from: 'answer' | 'model' }.
 * Their own answer is theirs to hear back ("You said 1003; I get 1012"); the rule is called theirs only on a plain, sure match.
 */
function contrastLine(c, band, theirs, kind) {
  const rule = kind === 'procedure' ? 'rule' : 'idea', short = x => String(x).split(/\s+/).length <= 3, why = c.why ? `, because ${lowerFirst(c.why)}` : '';
  const end = x => String(x).replace(/[.!?…]+$/, '');
  // A prediction on another case is said as a new case, never as their problem (decisive3); on the case they are on, as that case.
  if (c.from === 'model') {
    const where = c.recall ? 'As in the case on the page' : c.same ? 'On this case' : 'Take another case, on the page', fact = short(c.truth) ? `in fact it's ${c.truth}` : `in fact: ${lowerFirst(end(c.truth))}`;
    return short(c.mine) ? `${where}, that ${rule} gives ${end(c.mine)}; ${fact}${why}.` : `${where}: by that ${rule}, ${lowerFirst(end(c.mine))}; ${fact}${why}.`; // one sentence: never cut in half
  }
  if (c.from === 'said') return `You said: ${end(c.mine)}. ${band === 'plain' ? 'What actually holds' : 'As I see it'}: ${end(c.truth)}.`; // their words, then the course's full reason
  if (c.from === 'case') return `You said: ${end(c.mine)}. Here's a case from the course: "${end(c.truth)}."`;
  if (c.from === 'account') return `You said: ${end(c.mine)}. The course's account of that case: "${end(c.truth)}."${c.why ? ` ${end(sentencesOf(c.why)[0])}.` : ''}`; // their reply against the case's own account (decisive11b) // decisive11b: their words and the course's own sentence, quoted; the question is the card's ask, nothing asserted
  if (short(c.mine) && short(c.truth)) return theirs ? `With your ${rule} it's ${c.mine}; it's actually ${c.truth}${why}.` : band === 'plain' ? `You said ${c.mine}; it's ${c.truth}${why}.` : `You said ${c.mine}; I get ${c.truth}${why}.`;
  return `${theirs ? `Your ${rule} gives` : 'You said'}: ${end(c.mine)}. ${band === 'plain' ? 'What actually holds' : 'As I see it'}: ${end(c.truth)}${why}.`;
}
/** A right answer whose stated reason matched a wrong model or a claim (decisive8): its verdict rides on the repair. */
const rightOf = verdict => !!verdict?.reason && ['correct', 'valid_nonstandard'].includes(verdict.value);
/** The answer confirmed, as strong as its trust (rule 7): "0x1004 is right", "I think 0x1004 is right", or '' with no verdict. */
const rightSay = (verdict, band) => { if (band === 'none') return ''; const t = `${band === 'plain' ? '' : 'I think '}${verdict?.confirm ?? 'that'} is right`; return t.charAt(0).toUpperCase() + t.slice(1); };
/**
 * Right answer, wrong reason (decisive8): the answer confirmed and the reason met by rule 8's contrast, in one sentence, never a
 * bare "yes": "0x1004 is right, but adding 3 here moves three ints, 12 bytes; with your idea you'd get 0x0FFB."
 */
function rightLine(c, verdict, band, theirs, kind) {
  const end = x => String(x).replace(/[.!?…]+$/, ''), yes = rightSay(verdict, band);
  const rest = c.from === 'model' && c.same ? `${c.why ? `${lowerFirst(end(c.why))}; ` : ''}with ${theirs ? 'your' : 'that'} ${kind === 'procedure' ? 'rule' : 'idea'} you'd get ${end(c.mine)}.` : contrastLine(c, band, theirs, kind);
  return yes ? `${yes}, but ${lowerFirst(rest)}` : rest.charAt(0).toUpperCase() + rest.slice(1);
}
/**
 * Rule 8 as a check (decisive4): a repair card on a computable belief shows a case. `c` is added after the card's first
 * sentence (the refutation's opener, the frame) and on the page beside what it shows; an element on the page stays.
 */
export function withContrast(card, c, { theirs = false, kind = null } = {}) {
  const line = contrastLine(c, bandOf(card.verdict), theirs, kind), parts = sentencesOf(card.say || '');
  const show = !card.show ? sideBySide(c, theirs, kind) : card.show.kind === 'markdown' ? sideBySide(c, theirs, kind, card.show.content) : card.show;
  return { ...card, say: fit([parts[0], line, ...parts.slice(1)].filter(Boolean).join(' '), 4, 110), show, contrast: { itemId: c.itemId ?? null, from: c.from, truth: c.truth, mine: c.mine, prompt: c.prompt ?? null } };
}
/** The two results on the page, above the new case when that is a question board. */
const sideBySide = (c, theirs, kind, below = null) => ({ kind: 'markdown', title: 'Side by side', content: clipPage([c.prompt ? `**${c.from === 'case' ? 'A case from the course' : c.same || c.from === 'account' ? 'The case' : 'Another case'}:** ${c.prompt}` : '', `**${c.from === 'model' ? `That ${kind === 'procedure' ? 'rule' : 'idea'}` : ['said', 'case', 'account'].includes(c.from) ? 'You said' : theirs ? `Your ${kind === 'procedure' ? 'rule' : 'idea'}` : 'Your answer'}:** ${c.mine}`, `**${c.from === 'case' ? 'What happens there' : c.from === 'account' ? "The course's account" : 'What actually holds'}:** ${c.truth}`, c.why ? `**Why they differ:** ${c.why}` : '', below ? `**A new case.** ${below}` : ''].filter(Boolean).join('\n\n'), 1400) });
const shortKc = kc => atWord(firstSentences(kc?.statement || '', 1).replace(/[.!?]$/, ''), 160);
const bare = t => String(t || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
const lowerFirst = t => t && !/^[A-Z]{2}/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
const quoted = t => `"${atWord(bare(t) || 'something close to that', 140)}"`;
const stepsOf = (item, slice) => item?.steps?.length ? item.steps
  : slice?.explanation?.workedExamples?.find(w => w.problemId === item?.id)?.steps
  || slice?.procedures?.[0]?.subgoals?.flatMap(g => g.steps.map(st => ({ subgoal: g.label, step: st.action, why: st.why }))) || [];
const solutionText = steps => steps.map((x, i) => `${i + 1}. ${x.subgoal ? `**${x.subgoal}.** ` : ''}${x.step}${x.why ? ` (${x.why})` : ''}`).join('\n');
/** An item's show: its element when it has a runnable one, else its question as a board (the question itself lives on the page, §15). */
function itemShow(item, ctx, mode = 'predict') {
  const el = item.element?.spec && elementFor(item.element, { registry: ctx.registry, mode, ask: clip(item.prompt, 300), moment: ctx.moment, kc: item.kc, level: 'responding' });
  return el ? el.spec : { kind: 'markdown', title: 'The question', content: clip(item.prompt, 1400) };
}

/**
 * The card for a move: `d` is the policy's decision ({ act, rule, helpLevel, wrongModel?, errorKind?, hold? }), `ctx`
 * what the engine fetched for it: { kc, slice, st, arc, goal, item, portion, rep, wm, prereqKc, verdict, reason,
 * registry, moment, epistemic, prev, after, prequestionAnswer }. Returns an unchecked card (checkCard follows).
 */
export function buildCard(d, ctx) {
  const { kc, slice, item, portion, verdict, wm } = ctx, act = d.act, info = ACT[act] || { move: 'elicit', wait: 'reasoning' };
  const card = {
    move: info.move, act, helpLevel: d.helpLevel ?? 0, target: kc ? { kc: kc.id, topicId: kc.topicId, statement: kc.statement, kind: kc.kind, spine: ctx.spine ?? null } : ctx.target,
    verdict: verdict ? { value: verdict.value ?? null, utterance: verdict.utterance ?? null, wrongModel: verdict.wrongModel ?? null, errorKind: verdict.errorKind ?? null, trust: typeof verdict.trust === 'number' ? verdict.trust : null, ...(typeof verdict.p === 'number' ? { p: verdict.p } : {}), ...(verdict.suspected ? { suspected: true } : {}), ...(verdict.point ? { point: verdict.point } : {}), ...(verdict.late === true ? { late: true } : {}) } : null,
    wait: info.wait, show: null, expect: [], persona: null, withheld: {}, item: null, intention: '', say: '', ask: null, neutral: '', handBack: '',
  };
  const lead = verdict && !verdict.spoken && !OWN_VERDICT.has(act) ? leadOf(verdict) : '', band = bandOf(verdict);
  const theirs = band === 'plain' && !(typeof verdict?.p === 'number' && verdict.p < 0.75); // say the belief is theirs only when the verdict is plain and its match sure (no presupposition)
  const say = (...parts) => { card.say = fit([lead, ...parts].filter(Boolean).join(' ')); };
  const ask = (q, neutral = 'Walk me through how you got that.', back = null) => { card.ask = q; card.neutral = neutral; card.handBack = back || q; };
  const asItem = (it, frame, { mode = 'predict', withPrompt = true } = {}) => {
    card.item = { id: it.id, family: it.family ?? null, regime: it.regime ?? 'R1', format: it.element?.kind ?? it.form ?? null };
    card.show = itemShow(it, ctx, mode);
    card.wait = act === 'test' || act === 'solo_problem' ? 'work' : WAIT_OF[it.family] || card.wait;
    const lit = literalOf(it.answer), steps = stepsOf(it, slice);
    card.withheld = { answer: it.answer ?? null, solution: steps.length ? solutionText(steps) : null };
    if (lit) card.expect.push({ kind: 'correct', when: lit, literal: lit, reply: 'Yes, that is it.' });
    for (const [w, a] of Object.entries(it.wrongAnswers || {}).slice(0, 3)) { const l = literalOf(a); const m = (slice?.wrongModels || []).find(x => x.id === w); if (l && (!lit || valuesOf(l).size === 0 || ![...valuesOf(l)].some(v => valuesOf(lit).has(v))) && l.toLowerCase() !== lit?.toLowerCase()) card.expect.push({ kind: 'wrong_model', when: atWord(`${l}: ${m?.belief || 'a known mix-up'}`, 60), literal: l, wrongModel: w, reply: 'Not quite.' }); }
    card.expect.push({ kind: 'stuck', when: "stuck, or \"I don't know\"", reply: "That's fine: what's the first thing you'd work out?" });
    say(frame);
    // A long prompt is on the page, but its own question is still said (12 Oct: "the question on the page" left them asking what it was).
    const spoken = withPrompt && voiceSized(it.prompt) ? it.prompt : sentencesOf(String(it.prompt || '')).filter(x => /\?\s*$/.test(x)).find(voiceSized);
    ask(spoken || (it.family === 'E5' ? 'Have a go at the question on the page, and say why.' : 'Have a go at the question on the page: what do you get?'), NEUTRAL[it.family] || 'Walk me through how you got that.', 'Your turn: what do you get?');
  };
  const kcName = shortKc(kc) || ctx.target?.statement || 'this idea';

  switch (act) {
    case 'read': case 'refutation_read': {
      const minutes = Math.max(1, Math.round(portion.level?.minutes ?? (portion.level?.words || 300) / 200)), pre = portion.prequestions?.[0]?.prompt ?? null;
      card.move = d.act === 'refutation_read' ? 'repair' : 'read';
      card.show = { kind: 'reading', portion, highlight: portion.keyAnchors || [] };
      card.wait = 'reading';
      // The frame, said in full (decisive13: purpose 2 of 5, time 2 of 5, prequestion 0 of 5): the purpose, the prequestion, the
      // minutes and the one question after, verbatim on the card, so the voice can't drop them; a lead or reason only if it fits.
      const purpose = /[.!?]$/.test(portion.purpose) ? portion.purpose : `${portion.purpose}.`, frame = [purpose, pre ? `Before you read, think about this: ${/[?]$/.test(pre) ? pre : `${pre}?`}` : '', `It takes about ${minutes} minute${minutes > 1 ? 's' : ''}, and one question comes after.`].filter(Boolean);
      say(ctx.reason || (ctx.first ? `Today: ${kcName}.` : ''), ...frame);
      if (!frame.every(x => card.say.includes(x))) card.say = [lead, ...frame].filter(Boolean).join(' ');
      card.frame = frame; // said in full every time, never dropped as a repeat
      ask(pre, 'Take your time.', 'Tell me when you have read it.');
      card.expect = [
        { kind: 'done', when: 'they say they have read it, or are done', reply: '', then: { cardId: null } },
        { kind: 'question', when: 'a question about the passage', reply: 'Answer in at most two sentences, in the passage\'s words, pointing at the line; then let them read on.' },
        { kind: 'term', when: 'what a word means', reply: 'Give its meaning in one sentence, then let them read on.' },
        { kind: 'skip', when: 'they want to skip it', reply: '', then: { cardId: null } },
      ];
      card.intention = `Sustained, self-paced reading with a purpose on "${kcName}", then one consolidation`;
      break;
    }
    case 'after_reading': {
      const after = ctx.after || portion?.after?.[0] || { form: 'summary', prompt: "What's the idea you'd tell a friend?" };
      const q = ctx.prequestionAnswer ? `Before reading you said "${atWord(ctx.prequestionAnswer, 80)}". What does the passage say?` : after.prompt;
      if (item && ['predict_new_case', 'paired_problem', 'classify'].includes(after.form)) asItem(item, 'Without looking back:');
      else { say(); ask(q, 'Say a bit more.', q); }
      card.intention = `One light consolidation after the reading (${after.form}), retrieval before any look back`;
      break;
    }
    case 'explain': {
      const e = slice?.explanation, rep = ctx.rep;
      say(firstSentences(e?.plain || kc?.statement || '', 3));
      card.show = rep?.board ? { ...rep.board, kind: rep.board.kind || 'markdown' } : e?.precise ? { kind: 'markdown', title: clip(kcName, 80), content: clip(e.precise, 1400) } : null;
      if (item) { const keep = card.say; asItem(item, ''); card.say = fit(`${keep} ${card.say}`.trim()); }
      else ask(ctx.elicit || 'How would you put that idea to a friend, in a sentence or two?', 'Say a bit more about why.');
      card.intention = `A short spoken explanation of "${kcName}", with the thing shown, then a generative check`;
      break;
    }
    case 'worked_example': {
      const steps = stepsOf(item, slice), we = slice?.explanation?.workedExamples?.[0], next = ctx.matching;
      const page = `${we?.problemId && ctx.workedPrompt ? `${ctx.workedPrompt}\n\n` : ''}${solutionText(steps)}${we?.answer ? `\n\nAnswer: ${we.answer}` : ''}`;
      if (next) { // then the matching item, done alone: its answer is evidence like any other (§10)
        asItem(next, '');
        card.show = { kind: 'markdown', title: clip(`Worked example: ${kcName}`, 80), content: clipPage(`${page}\n\n**Now this one on your own.** ${next.prompt}`, 1600) };
        say('Here is a worked example on the page, one step at a time. Read it through, then do the one below it on your own.');
        card.wait = 'work'; card.keepText = [ctx.workedPrompt].filter(Boolean); // the worked question, as written
        card.intention = `A worked example for "${kcName}", then the matching item done alone`;
      } else {
        card.show = { kind: 'markdown', title: clip(`Worked example: ${kcName}`, 80), content: clipPage(page, 1400) };
        say('Here is a worked example on the page, one step at a time. Read it through.');
        ask('Which step would you have found hardest, and what is it for?', 'Say a bit more about why.');
        card.wait = 'reading'; card.explains = item?.id ?? null; // their self-explanation: an E5 observation, judged like any explanation
        card.intention = `A worked example with named subgoals for "${kcName}", self-explained, before a paired problem`;
      }
      break;
    }
    case 'experiment': case 'predict': case 'compare': case 'construct': case 'teach_back': case 'draw': {
      const mode = { experiment: 'change', predict: 'predict', compare: 'compare', construct: 'construct', teach_back: 'teach', draw: 'draw' }[act];
      if (act === 'teach_back' && wm) card.persona = { name: 'Theo', misconception: wm.id, lines: [`I think ${atWord(wm.belief, 160)}.`, ...(wm.plausibleBecause ? [`It makes sense to me because ${atWord(wm.plausibleBecause, 140)}.`] : [])], acceptWhen: `their explanation gives the correct idea: ${atWord(firstSentences(wm.repair, 1), 200)}`, probes: ['Why, though?', 'How do you know?'], transferItem: item?.id ?? null };
      const el = ctx.element;
      if (el && item) { asItem(item, FRAME[act] || ''); card.show = { ...el.spec, task: { ...el.spec.task, ask: clip(item.prompt, 300) } }; } // the element shows it; the item's question is the task
      else if (el) {
        card.show = el.spec;
        const t = el.truth && Object.entries(el.truth);
        if (t?.length) card.expect.push({ kind: 'correct', when: atWord(t.map(([n, v]) => `${n} ${v}`).join(', '), 60), literal: t.map(([, v]) => v).join(' and '), reply: 'Yes, that is it.' });
        card.expect.push({ kind: 'stuck', when: "stuck, or \"I don't know\"", reply: 'Try a first guess; the page will show what really happens.' });
        if (t?.length) card.withheld = { answer: t.map(([n, v]) => `${n} = ${v}`).join(', '), solution: null };
      } else if (item) asItem(item, FRAME[act] || '');
      const asks = { change: 'Change one thing on the page and watch: what rule do you see?', predict: 'What do you predict? Say it before you run it.', compare: 'What is the one difference that matters here, and why?', construct: 'Build it on the page, and tell me when you are done.', teach: `Theo thinks ${atWord(wm?.belief || 'otherwise', 120)}. Can you convince him?`, draw: 'Draw it from memory on the page, and talk me through it.' };
      if (!item) { say(act === 'predict' ? FRAME.predict : act === 'teach_back' ? 'Meet Theo, a classmate who has this mixed up.' : ''); ask(asks[mode], mode === 'predict' ? 'What makes you expect that?' : 'Say a bit more.'); }
      card.wait = mode === 'construct' || mode === 'draw' || mode === 'change' ? 'work' : 'reasoning';
      card.intention = `${{ change: 'A guided experiment on the runnable model', predict: 'Predict, observe, explain', compare: 'Compare two cases that differ in one feature', construct: 'Construct it; the engine reports the first failure', teach: 'Teach a classmate who holds one wrong model', draw: 'Draw from memory against a rubric' }[mode]}: "${kcName}"`;
      break;
    }
    case 'run_their_model': {
      const el = ctx.element;
      card.show = el?.spec ?? (item ? itemShow(item, ctx) : null);
      say('Let me run your version on the page next to what the model does.');
      ask('What did your version assume that the model did not?', 'Say a bit more.');
      card.intention = `Run their own model to a contradiction they can check (F7), then build the replacement: "${kcName}"`;
      break;
    }
    case 'strategy_model': {
      const proc = slice?.procedures?.[0];
      card.show = proc ? { kind: 'markdown', title: clip(proc.title || `The plan: ${kcName}`, 80), content: clip(proc.subgoals.map((g, i) => `${i + 1}. **${g.label}**${g.steps?.[0]?.why ? `: ${g.steps[0].why}` : ''}`).join('\n'), 1400) } : null;
      say('Here is the plan an expert follows, on the page.');
      ask('Which step tells you what to do first, and how do you know?', 'Say a bit more.');
      card.intention = `Model the strategy with named steps (strategy KC "${kcName}")`;
      break;
    }
    case 'argue': case 'evidence_standard': {
      const warrants = ctx.epistemic?.warrants?.length ? ctx.epistemic.warrants.join(', ') : 'evidence you can point to';
      say(act === 'evidence_standard' ? `In this course, a claim like that needs ${warrants}.` : '');
      ask(act === 'evidence_standard' ? 'What evidence would back it up, and what would someone on the other side say?' : 'What is the strongest argument on the other side, and how would you answer it?', 'Say a bit more.');
      card.intention = act === 'argue' ? `Argument with a counterargument (epistemic KC "${kcName}")` : `Make the field's standard of evidence explicit (F11), then ask for the counterargument`;
      break;
    }
    case 'refutation': { // §13 binding rule 4: "Not quite: …", why it seemed right, what's true, then a check on a new case
      const m = wm || {}, truth = core(slice?.explanation?.plain || (kc?.kind !== 'procedure' ? kc?.statement : '') || ''); // a truth, never a procedure's instruction or a tutor's repair note
      const belief = lowerFirst(atWord(bare(firstSentences(m.belief || 'that is how it works', 1)), 130));
      // Rule 7: as strong as the verdict, the belief theirs only when sure. A catalogued belief is known to be false, so a hedge is
      // on whether they hold it; a candidate (their own claim, no catalogued model) is false only as surely as it was judged.
      const cand = !!m.candidate || String(m.id || '').startsWith('cand:');
      const opener = theirs ? `Not quite: it isn't true that ${belief}.` : band === 'plain' ? `Not quite. If you were thinking that ${belief}: that isn't so.` : cand ? (band === 'hedged' ? `I don't think it's true that ${belief}.` : `Let's test the idea that ${belief}.`) : band === 'hedged' ? `If you mean that ${belief}: that isn't so.` : `A common idea is that ${belief}, but it isn't so.`;
      // Rule 8: the first statement carries one computed contrast when the belief is computable (their answer, or the course model's
      // prediction). With no case to show, the belief is not named at all (decisive3/4: naming without a case repairs nothing and
      // gives the diagnosis away): what is true, then a case, whose answer by the belief brings the contrast.
      if (!ctx.contrast) {
        const full = ctx.fullTruth ?? (ctx.said?.(`Here's what's true: ${atWord(truth, 220)}.`) ? null : truth);
        const teach = full ? `Here's what's true: ${atWord(String(full).replace(/[.!?]+$/, ''), 260)}.` : '';
        if (item) { asItem(item, teach ? 'Now try this one.' : ''); card.say = fit(`${teach} ${card.say}`.trim(), 4, 100); }
        else { say(teach); ask('Say what is really going on, in your own words, on an example of your own.', 'Say a bit more.'); }
        card.intention = 'What is true, then a case (no case to show yet, so the belief is not named): their answer by it brings the contrast';
        break;
      }
      const shown = rightOf(verdict) ? rightLine(ctx.contrast, verdict, band, theirs, kc?.kind) : contrastLine(ctx.contrast, band, theirs, kc?.kind);
      const refute = fit([ctx.contrast.from === 'said' || rightOf(verdict) ? '' : opener, shown, !shown && m.plausibleBecause ? `It seems right because ${lowerFirst(clause(core(m.plausibleBecause), 110))}.` : '', !shown && truth ? `Here's what's true: ${atWord(truth, 220)}.` : ''].filter(Boolean).join(' '), 3, 95);
      if (item) { asItem(item, ''); card.say = fit(`${refute} ${card.say}`.trim(), 4, 100); if (ctx.contrast && card.show?.kind === 'markdown') card.show = sideBySide(ctx.contrast, theirs, kc?.kind, card.show.content); }
      else if (ctx.element) { card.say = fit(`${refute} Now a new case, on the page.`, 4, 110); card.show = ctx.element.spec; ask(firstSentences(ctx.element.spec.task?.ask || '', 1) || 'Change one thing on the page and watch: what happens?', 'Say a bit more.'); } // the board as the new case (its full task on the page)
      else { card.say = refute; ask('Say what is really going on, in your own words, on an example of your own.', 'Say a bit more.'); if (ctx.contrast) card.show = sideBySide(ctx.contrast, theirs, kc?.kind); }
      if (!ctx.contrast && (m.repair || '').length > 200 && !item) card.show = { kind: 'markdown', title: clip(`Why "${atWord(m.belief || '', 50)}" doesn't hold`, 80), content: clip(m.repair, 1400) };
      if (shown) { card.contrast = { itemId: ctx.contrast.itemId ?? null, from: ctx.contrast.from, truth: ctx.contrast.truth, mine: ctx.contrast.mine, prompt: ctx.contrast.prompt ?? null }; card.keepText = ctx.contrast.from === 'said' || rightOf(verdict) ? [] : [opener]; } // the opener names a sure model beside its case
      card.intention = 'Direct refutation of one false belief (F5): not quite, why it seemed right, what is true, then a check on a new case';
      break;
    }
    case 'revoice': { // §13 rule 9: their unproven claim named back as a question, in their own words: no "not", no correction
      const q = `So you're saying ${ctx.revoice}?`;
      say(); ask(q, 'Go on.', q); card.revoice = ctx.revoice; card.show = ctx.prev?.show ?? null;
      card.intention = 'Rule 9: their unproven claim named back in their own words, as a question (that answer\'s one draw-out); a case follows';
      break;
    }
    case 'contrast': { // §13 rule 8: they answered by the belief; both results, why they differ, then a fresh case
      const c = ctx.contrast, own = theirs && !d.unattributed, line = rightOf(verdict) ? rightLine(c, verdict, band, own, kc?.kind) : contrastLine(c, band, own, kc?.kind); // a candidate is never named
      if (c.from === 'case') { say(line); card.show = sideBySide(c, own, kc?.kind); ask('How does your idea fit that?', 'Say a bit more.'); } // no calibrated judge says the case contradicts them: ask, never assert (decisive11b)
      else if (item) { asItem(item, 'Now a new case.'); card.say = fit(`${line} ${card.say}`.trim(), 4, 100); card.show = card.show?.kind === 'markdown' ? sideBySide(c, own, kc?.kind, card.show.content) : card.show; }
      else if (ctx.element) { say(line, 'Now a new case, on the page.'); card.show = ctx.element.spec; ask(firstSentences(ctx.element.spec.task?.ask || '', 1) || 'Change one thing on the page and watch: what happens?', 'Say a bit more.'); } // the board as the new case (its full task on the page)
      else { say(line); card.show = sideBySide(c, own, kc?.kind); ask('In your own words: why do the two differ?', 'Say a bit more.'); }
      card.contrast = { itemId: c.itemId ?? null, from: c.from, truth: c.truth, mine: c.mine, prompt: c.prompt ?? null };
      card.intention = d.unattributed ? 'Close the contrast on their own case, naming no belief (a candidate): their answer, the key and the reason, then a case that separates the candidates' : 'Close the contrast (rule 8): both results side by side, why they differ, then a fresh check on a new case';
      break;
    }
    case 'contrast_step': case 'new_frame': case 'counter_case': {
      const m = wm || {};
      const named = !!ctx.contrast; // the belief named only beside a computed case
      if (act === 'contrast_step') { say(!named ? 'Check that step against the rule.' : band === 'plain' ? `Not quite: that step follows ${quoted(firstSentences(m.belief || '', 1))}.` : band === 'hedged' ? `That step looks like it follows ${quoted(firstSentences(m.belief || '', 1))}.` : 'Check that step against the rule.', `The rule: ${core(kc?.statement)}.`); ask('Which of the two matches the rule, and why?', 'Say a bit more.'); }
      else if (act === 'new_frame') { say(`Here's the way to see it: ${core(kc?.statement)}.`, "Let's apply that to this case and two more."); }
      else if (item || ctx.element) { say(named && m.belief ? `${theirs ? 'Your idea is that' : 'If your idea is that'} ${lowerFirst(bare(firstSentences(m.belief, 1)))}${theirs ? '.' : ','} ${theirs ? 'Try' : 'try'} it on this one, and check what it gives.` : 'Try your idea on this one, and check what it gives.'); } // run it to a contradiction (F7), quickly
      else { say(named && m.belief ? `${theirs ? 'Your idea is that' : 'Take the idea that'} ${lowerFirst(bare(firstSentences(m.belief, 1)))}.` : 'Take your idea.', kc?.statement ? `Check it against this: ${core(kc.statement)}.` : ''); ask('Does your idea still hold? Why or why not?', 'Say a bit more.'); } // nothing on the page: never "this one"
      if (item) { const keep = card.say; asItem(item, ''); card.say = fit(`${keep} ${card.say}`.trim(), 4, 95); }
      if (ctx.element) { card.show = ctx.element.spec; if (!item) ask(ctx.element.spec.task?.ask || 'Which of the two fits your idea, and where does it break?', 'Say a bit more.'); }
      card.intention = { contrast_step: 'Contrast their step with the correct one (F6)', new_frame: 'Teach the new frame explicitly, then apply it to this case and two more (F8)', counter_case: 'A counter-case where the simple story fails (F9)' }[act];
      break;
    }
    case 'reread': {
      if (portion) { card.show = { kind: 'reading', portion, highlight: portion.keyAnchors || [] }; say(`Look again: ${/[.!?]$/.test(portion.purpose) ? portion.purpose : `${portion.purpose}.`}`); ask('Show me the line that says it.', 'Take your time.'); card.wait = 'reading'; }
      else { if (item) card.show = itemShow(item, ctx); say('Look at the question again on the page.'); ask('What exactly does it ask for?', 'Say a bit more.'); }
      card.intention = 'Misreading (F10): back to the text, with a focus';
      break;
    }
    case 'strategy_prompt': say('Before you go on.'); ask('What are you doing right now, and why?', 'Say a bit more.'); card.intention = 'Control failure (F3): prompted self-monitoring'; break;
    case 'flag': case 'locate': {
      const steps = stepsOf(item, slice);
      if (item) card.show = ctx.prev?.show ?? itemShow(item, ctx);
      say(act === 'flag' ? 'Check your work on that one; something small slipped.' : steps[0] ? `Go back to this step: ${atWord(steps[0].subgoal || steps[0].step, 120)}.` : 'Go through it one step at a time, and check each step.');
      ask('What do you get now?', 'Walk me through how you got that.');
      if (item) card.item = { id: item.id, family: item.family ?? null, regime: item.regime ?? 'R1', format: item.element?.kind ?? item.form ?? null };
      card.withheld = { answer: item?.answer ?? null, solution: null };
      card.intention = act === 'flag' ? 'A slip: an indirect flag, so they find and fix it' : 'A slip again: point to where it goes wrong';
      break;
    }
    case 'pump': case 'general_hint': case 'specific_hint': case 'tell_step': case 'worked_solution': {
      const steps = stepsOf(item, slice), told = ctx.arc?.help?.told ?? 0, step = steps[Math.min(told, Math.max(0, steps.length - 1))];
      if (item) { card.item = { id: item.id, family: item.family ?? null, regime: item.regime ?? 'R1', format: item.element?.kind ?? item.form ?? null }; card.show = ctx.prev?.show ?? itemShow(item, ctx); }
      card.withheld = { answer: item?.answer ?? null, solution: steps.length ? solutionText(steps) : null };
      if (!item && ctx.prev?.show?.task) { // an element's task, not an item: back to what the page shows
        const cp = ctx.prev.show.task.checkpoints?.[0]; // about the problem on the page or the idea, never a step they didn't show
        const general = `Think about this: ${posCore(slice?.explanation?.plain || kc?.statement || '')}.`; // said once a session: then the page's checkpoint
        say(act === 'pump' ? '' : (act === 'general_hint' && !(cp && ctx.said?.(general))) || !cp ? general : `Look at the page where it stops (${cp.at}): ${cp.predict.join(' and ')} ${cp.predict.length > 1 ? 'are' : 'is'} what to work out.`); ask(ctx.prev.ask || ctx.prev.show.task.ask || 'What do you expect?', 'Keep going.'); card.show = ctx.prev.show;
      }
      else if (act === 'pump') { say(); ask("What's the first thing you'd work out?", 'Keep going.'); }
      else if (act === 'general_hint' && posCore(slice?.explanation?.plain || kc?.statement || '') && !(step && ctx.said?.(`Think about this: ${posCore(slice?.explanation?.plain || kc?.statement || '')}.`))) { say(`Think about this: ${posCore(slice?.explanation?.plain || kc?.statement || '')}.`); ask('With that in mind, what do you get?', 'Walk me through it.'); }
      // A specific hint, or a general hint already said this session: this item's own step instead (never said twice).
      else if (act === 'specific_hint' || act === 'general_hint') { say(step ? `Focus on this step: ${atWord(positive(step.subgoal || step.step) || step.subgoal || step.step, 140).replace(/[.!?]$/, '')}${positive(step.why || '') ? `, because ${lowerFirst(atWord(positive(step.why), 140).replace(/^because\s+/i, '').replace(/[.!?]$/, ''))}` : ''}.` : `Focus on one piece: ${kcName}.`); ask('What does that step give you?', 'Walk me through it.'); }
      else if (act === 'tell_step') { say(step && positive(step.step) ? `Here's a step: ${atWord(positive(step.step), 200)}${/[.!?]$/.test(positive(step.step)) ? '' : '.'}` : `Here's the idea: ${firstSentences(positive(slice?.explanation?.plain || ''), 1)}`); ask("What's the next step?", 'Walk me through it.'); }
      else {
        const how = steps.length ? solutionText(steps) : [slice?.explanation?.mechanism || slice?.explanation?.precise || slice?.explanation?.plain || kc?.statement || ''].join('');
        card.show = { kind: 'markdown', title: clip(`The whole solution: ${kcName}`, 80), content: clip(`${item?.prompt ? `**The question.** ${item.prompt}\n\n` : ''}**How it goes.** ${how}${item?.answer ? `\n\n**Answer:** ${item.answer}` : ''}`, 1400) };
        say('Here is the whole solution on the page. Read it through.');
        ask('Which step would you have missed? Then you get one like it, on your own.', 'Take your time.');
        card.wait = 'reading';
      }
      card.expect = act === 'worked_solution' ? [] : card.expect;
      if (act !== 'worked_solution' && literalOf(item?.answer)) card.expect.push({ kind: 'correct', when: literalOf(item.answer), literal: literalOf(item.answer), reply: 'Yes, that is it.' });
      card.intention = { pump: 'H0: a pump, so they keep the work', general_hint: 'H1: a general hint, the concept to use', specific_hint: 'H2: a specific hint, the step to focus on', tell_step: 'H3: tell one step, then hand the work back', worked_solution: 'H4: the worked solution, then a matching item done alone' }[act];
      break;
    }
    // explain_why (rule 6). After a literal match the voice said the branch's reply, so this card's question is the one draw-out;
    // "Why does that work?" presupposes it does, so only after a plain verdict (rule 5). After any other answer the voice's neutral
    // line already asked for their reasoning (rule 1: once per answer): the verdict, and the turn stays with them, no new question.
    case 'explain_why': if (verdict?.spoken) { say(); ask(band === 'plain' ? 'Why does that work?' : 'Talk me through why you think it holds.', 'Say a bit more.', band === 'plain' ? 'Why is that?' : 'Why do you think it holds?'); } else { say(lead ? '' : 'Go on.'); card.ask = null; card.neutral = 'Go on.'; card.handBack = 'Go on.'; } card.show = ctx.prev?.show ?? null; card.explains = ctx.prev?.item?.id ?? null; card.intention = 'Correct with no reasoning shown: ask why, and hold the update until the explanation comes'; break;
    case 'explain_reasoning': say(); ask('Walk me through how you got that.', 'Go on.'); if (ctx.prev?.item) { card.item = ctx.prev.item; card.show = ctx.prev.show; card.withheld = ctx.prev.withheld || {}; } card.intention = 'The answer could not be verified: draw out their reasoning, no verdict'; break;
    case 'summary': say(); ask("Sum up today's idea in two sentences, in your own words.", 'Say a bit more.'); card.intention = `The learner's own summary of "${kcName}", the arc's last move`; break;
    case 'choice': say("This one's tough; that's normal at this point."); ask('Would you rather read a short explanation, or shall I walk you through it?', 'Either is fine.'); card.expect = [{ kind: 'other', when: 'they want to read', reply: 'Okay.' }, { kind: 'other', when: 'they want to be walked through it', reply: 'Okay.' }]; card.intention = 'Frustration: encouragement by attribution, a bounded choice and a change of pace'; break;
    case 'request_attempt': say(); ask("Talk me through what you'd do first.", 'Go on.'); if (item) { card.item = { id: item.id, family: item.family ?? null, regime: item.regime ?? 'R1', format: null }; card.show = ctx.prev?.show ?? itemShow(item, ctx); card.withheld = { answer: item.answer ?? null, solution: null }; } card.intention = 'No attempt yet: ask for one before any help'; break;
    default: {
      if (!item) { say(ctx.reason || ''); ask(ctx.elicit || `What do you already know about ${kcName}?`, 'Say a bit more.'); card.intention = `Find out where they stand on "${kcName}"`; break; }
      asItem(item, ctx.again ? 'The same question once more.' : [ctx.first && ctx.reason, FRAME[act] ?? ''].filter(Boolean).join(' '));
      card.intention = { first_step: `A first-step item: what their current model does with "${kcName}"`, test: `The target tested unaided on a new surface: "${kcName}"`, retest: 'Re-test the repair on a matching item, unaided', separating_question: 'The most informative separating question between the wrong models still in play', retrieval: 'Spaced retrieval on a new surface', interleave: 'Interleaved with a confusable idea: discrimination', vary_surface: 'Fragile knowledge (F2): the same idea on a new surface', generative_check: 'A generative check, not a self-report', diagnostic: 'Cold start: a maximum-information first-step probe', prequestion: 'A prequestion before the reading', solo_problem: 'A problem at about 0.7 predicted success', matching: 'A matching item done alone, after help', detour: 'A detour to a missing prerequisite, then back', try_first: 'Try first, then a time for telling' }[act] || `Practice on "${kcName}"`;
    }
  }
  if (ctx.first && ctx.reason && !card.say.startsWith(ctx.reason)) card.say = fit(`${ctx.reason} ${card.say}`); // card 1 states the target and why
  // A repair on a right answer's reason (decisive8) still gives the answer's verdict first: never a repair that leaves it unsaid.
  if (rightOf(verdict) && OWN_VERDICT.has(card.act) && rightSay(verdict, band) && !card.say.startsWith(rightSay(verdict, band))) card.say = fit(`${rightSay(verdict, band)}. ${card.say}`, 5, 110);
  return card;
}

// ---------- the writer's schemas (cards nothing prepared; fallback mode before a course model exists) ----------
const strs = (max, n) => s.nullable(s.array(s.string({ max }), { max: n }));
export const BOARD_DRAFT = s.object({
  kind: s.enum(BOARD_KINDS), title: s.string({ min: 1, max: 80 }),
  content: s.nullable(s.string({ max: 4000 })), diagramType: s.nullable(s.enum([...DIAGRAM_TYPES, 'formula'])), diagramData: s.nullable(s.string({ max: 6000 })),
  element: s.nullable(s.object({ kind: s.enum(ELEMENT_KINDS), request: s.string({ min: 1, max: 600 }) })),
  zone: s.nullable(s.object({ kind: s.enum(['code', 'latex', 'proof']), language: s.nullable(s.enum(['c', 'riscv'])), starter: s.nullable(s.string({ max: 4000 })), lines: strs(400, 12), sections: strs(80, 12), task: s.nullable(s.string({ max: 400 })) })),
  questionId: s.nullable(s.string({ max: 200 })),
  check: s.nullable(s.object({ kind: s.enum(CHECK_KINDS), prompt: s.string({ min: 1, max: 400 }), options: strs(200, 8), items: strs(200, 8), left: strs(200, 8), right: strs(200, 8) })),
  notesRef: s.nullable(s.string({ max: 40 })), notesQuery: s.nullable(s.string({ max: 200 })),
});
const CARD_BOARD = s.object({ ...BOARD_DRAFT.props, kind: s.enum(BOARD_KINDS.filter(k => k !== 'element')), element: undefined });
delete CARD_BOARD.props.element;
const BRANCH = s.object({ when: s.string({ min: 1, max: 60 }), literal: s.nullable(s.string({ max: 60 })), kind: s.enum(BRANCH_KINDS.filter(k => !['done', 'question', 'term', 'skip'].includes(k))), reply: s.string({ min: 1, max: 220 }), thenAsk: s.nullable(s.string({ max: 220 })) });
/** The writer's card v2, in the order it streams: what the voice needs first (move … ask, the correct branch), then the rest. */
export const CARD_DRAFT = s.object({
  move: s.enum(MOVES), act: s.string({ min: 1, max: 40 }), helpLevel: s.int({ min: 0, max: 4 }), intention: s.string({ min: 1, max: 200 }), wait: s.enum(WAITS),
  say: s.string({ max: 420 }), ask: s.nullable(s.string({ min: 1, max: 220 })), neutral: s.string({ min: 1, max: 120 }), handBack: s.string({ min: 1, max: 160 }),
  element: s.nullable(s.object({ kind: s.enum(ELEMENT_KINDS), request: s.string({ min: 1, max: 300 }) })),
  expect: s.array(BRANCH, { min: 1, max: 5 }), withheldAnswer: s.nullable(s.string({ max: 300 })),
  board: s.nullable(CARD_BOARD), boardWhy: s.string({ max: 300 }), point: s.array(s.string({ min: 1, max: 80 }), { max: 3 }),
});
/** The correct answer checked by the light model: its own answer, whether they agree, and a C program printing it when it can be computed. */
export const VERIFIED = s.object({ answer: s.string({ max: 200 }), agrees: s.enum(['yes', 'no', 'unsure']), c: s.nullable(s.string({ max: 4000 })) });
/** A practice problem made on request (guide mode's make_problem): the problem as the page shows it, its exact answer, a short worked solution. */
/** A learner's answer to a practice problem against its worked answer (guide mode): right, wrong (and what), or unsure. */
export const CHECKED = s.object({ verdict: s.enum(['right', 'wrong', 'unsure']), wrong: s.string({ max: 300 }) });
export const PROBLEM_DRAFT = s.object({ prompt: s.string({ min: 10, max: 1200 }), answer: s.string({ min: 1, max: 400 }), solution: s.string({ max: 1500 }) });
/** What a line is (v7): an answer or partial work (and to which branch), a question, a request, being stuck, a claim of understanding, chat; and which known wrong belief it states. */
export const CLASSIFIED = s.object({
  topicRequest: s.nullable(s.string({ max: 200 })), kind: s.enum(['answer', 'partial', 'question', 'request', 'stuck', 'claims', 'chat']),
  request: s.nullable(s.enum(['read', 'talk', 'hint', 'answer', 'skip'])), sessionKind: s.nullable(s.enum(['learn', 'repair', 'consolidate', 'exam_practice', 'new_material', 'study_by_reading', 'problem_help'])),
  reasoning: s.bool(), branchId: s.nullable(s.string({ max: 20 })), confident: s.bool(),
  agrees: s.bool(), // decided first: the line states the correct idea, or part of it, and asserts nothing false (then it matches nothing)
  wrongModelId: s.nullable(s.string({ max: 80 })), // the known wrong belief the line states or clearly implies (the rubric detector), else null
  beliefSure: s.bool(), // true only when the line plainly asserts that belief: a label not sure is never acted on (rule 5: no refuting a right answer)
  contradicts: s.bool(), claim: s.nullable(s.string({ max: 200 })), // a claim that contradicts the idea, catalogued or not, restated in one sentence
});
/** A thought: what Plato says, an optional board, the lecture it rests on. */
export const QUOTED = s.object({ quote: s.nullable(s.string({ max: 600 })) });
export const THOUGHT = s.object({ topicRequest: s.nullable(s.string({ max: 200 })), say: s.string({ min: 1, max: 900 }), lecture: s.nullable(s.string({ max: 120 })), board: s.nullable(BOARD_DRAFT), boardWhy: s.string({ max: 300 }) });
/** A streamed branch is complete once all its fields are in. */
export const branchDone = b => !!b && ['when', 'literal', 'kind', 'reply', 'thenAsk'].every(k => k in b);
