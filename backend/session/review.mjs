// A colleague's check of what Plato just put on the page (15 Oct lesson evals: a board said "P(21) is false" when 21 = 4×3 + 9×1
// is reachable, and his own compute tool sat unused). In the background, never in his way: a board is read by a second model
// against the topic's own rules; a real error comes back to him as a quiet note to fix on his next turn.
import { ask as askModel } from '../agents.mjs';

const BRIEF = `You check one board (slide) a tutor just wrote on a student's whiteboard, for errors only. Work every claim, number, count, example and proof step out yourself. Report only what is actually wrong or materially misleading: a false statement, a wrong value, a claim missing a condition it needs (finite, non-empty, a convention), a step that does not follow. Not style, not omissions, not things done differently from how you would. The course's definitions and conventions (when given) are the standard.
Reply with exactly OK when there is nothing wrong. Otherwise one line per error: what it says, why it is wrong, and the correct version. Nothing else. Never write the middle dot character; write multiplication as ×.`;

/** The board's errors as lines, or null when it is right (or the check couldn't run). */
export function reviewBoard({ title = '', text = '', course = '' }, { model = process.env.LUNA_CHECK_MODEL || 'sonnet', timeoutMs = 120_000 } = {}) {
  if (String(text).trim().length < 60) return Promise.resolve(null); // a heading or a one-liner: nothing to check
  return ask(BRIEF, `${course ? `THE COURSE'S DEFINITIONS AND CONVENTIONS FOR THIS TOPIC:\n${String(course).slice(0, 6000)}\n\n` : ''}THE BOARD:\n${title ? `${title}\n` : ''}${text}`, { model, timeoutMs });
}

/** One tool-less call on the student's provider (backend/agents.mjs): its reply text; rejects when it fails or runs past `timeoutMs`. */
export const claude = (system, input, { model = 'opus', timeoutMs = 600_000 } = {}) => askModel(system, input, { model, timeoutMs, lane: 'check' });

/** One check: its reply, or null for OK (or when it couldn't run). */
const ask = (system, input, options) => claude(system, input, options).then(said => !said || /^ok\b[.!]?$/i.test(said) ? null : said.slice(0, 1500), () => null);

// His verdicts on their work (15 Oct, docs/harness-generalization.md item 4): a wrong "that's right" or "full marks" teaches
// them the mistake, so the exchange is read like a board, in the background, and only a real misjudgment comes back.
const VERDICT = `You check one exchange between a tutor and a student, for one thing only: when the tutor's reply judges the student's own work (says an answer is right, wrong or partly right, accepts or rejects a step, or grades a proof or an essay), is that judgment correct? Work the student's work out yourself. Reply with exactly OK when the reply judges nothing, or judges correctly, or the misjudgment is trivial. Otherwise one or two lines: what the tutor said, why it is wrong (what is actually right or wrong in the student's work), and the correct verdict. Nothing else. The course's definitions and conventions (when given) are the standard. Never write the middle dot character; write multiplication as ×.`;

/** The tutor's misjudgment of the student's work in `exchange` (the last lines of the conversation, his reply last), or null. */
export function reviewVerdict({ exchange = '', course = '' }, { model = process.env.LUNA_CHECK_MODEL || 'sonnet', timeoutMs = 120_000 } = {}) {
  if (String(exchange).trim().length < 40) return Promise.resolve(null);
  return ask(VERDICT, `${course ? `THE COURSE'S DEFINITIONS AND CONVENTIONS FOR THIS TOPIC:\n${String(course).slice(0, 6000)}\n\n` : ''}THE EXCHANGE (oldest first; the tutor's reply is last):\n${String(exchange).slice(-8000)}`, { model, timeoutMs });
}

/** The note Plato gets when a colleague thinks he misjudged their work. */
export const verdictNote = errors => `[Note] A colleague read your last verdict on their work and thinks it is wrong: ${errors}\nIf they are right, tell them plainly in your next reply, in one line, and give the correct verdict with its working on the page. If you are sure you were right, check it once more (compute) and go on.`;

/** The note Plato gets for a board with errors. */
export const reviewNote = (title, errors) => `[Note] A colleague checked your board "${String(title || 'untitled').slice(0, 80)}" and found: ${errors}\nIf they are right, correct it in your next reply: say plainly what was wrong and put the corrected version on the page, titled "Correction: <the board's title>" so the old board is plainly superseded. If you are sure the board is right, check it once more (compute) and go on.`;
