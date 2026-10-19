// The tutor judge: scores Plato (only the tutor) in a stand-in run record against the 8 teaching principles of the
// guide-mode redesign (docs/teaching-redesign.md, docs/teaching-guide-spec.md), each 0–2 with a quote-backed reason,
// plus the 3 worst moments; pass/fail is computed from the scores. Also the run's latency: each student line to Plato's
// first reply, and to the next card. One heavy-model call (medium effort) through the Codex runtime, strict JSON.
// node evals/tutor-judge.mjs <evals/runs/<id> | run.json> [...]   → writes judge.json next to each run.json and prints it
import path from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRuntime } from '../server/runtime.mjs';
import { timeline } from './common.mjs';

export const JUDGE_VERSION = 'tutor-judge v4 (2026-10-13: P10 grounded in their course real problems)';

export const PRINCIPLES = [
  'Knows the course as a story: orients the learner, links sections, never opens with off-topic material (the syllabus, another lecture\'s content).',
  'Listens and does what is asked: follows "start from the beginning", "just tell me if I\'m right"; "what\'s going on?" gets an orientation in at most 2 sentences; never repeats the same question.',
  'Explains before checking: questions are optional and purposeful, never forced before teaching; never quizzes on what was not taught.',
  'Honest verdicts: says right or wrong plainly when known; never "yes" to a wrong answer; never asks a right answer "how did you get that"; never hints at an answer that was already right.',
  'Diagnoses only with evidence: no misconception probe or "tell apart" question after a single answer.',
  'Keeps the flow: at most one apology, no narrating its own process ("let me check the course material", "I chose the wrong excerpt"), no repeated identical lines, no unexplained dead air. A wait for something worth making (a new problem, a drawing) is fine when the tutor says what is coming and roughly how long (the page shows a progress bar) and uses the time; silence with no word of what is coming is not.',
  'Uses exam-week time well without dropping explanation: focuses on what the exam needs, keeps readings and explanations.',
  'Remembers the learner within the session: never re-asks what they already said (exam, level, where to start, how they want help).',
  'Shows how it works: procedures, numbers and comparisons are written on the page (worked examples step by step, tables) as they are explained, not only spoken; a request to see, chart or draw something is met in that same reply; examples are built from the session (their numbers, their mistake, the problem on the page).',
  'Grounded in their course: what it teaches and the problems it gives are driven by the real problems they will face (their practice prelim, quizzes, labs, assignments): it brings those up, teaches the technique and theory they need, and practises on problems like them; it never invents course facts that contradict their material.',
];

const JUDGE = `You review a tutoring session between an AI voice tutor (Plato) and a student, for the tutor's developers. Judge ONLY the tutor.
Score each principle 0, 1 or 2:
- 2 = held throughout;
- 1 = mostly held, one clear lapse;
- 0 = violated more than once, or once badly (the kind of thing that makes a student give up).
Each reason is one line and quotes the tutor's (or the page's) exact words that justify the score, with the time stamp.
If the session gave no occasion to test a principle (e.g. no answer was ever given, for honest verdicts), set occasion to false, score 2 and say "no occasion".
Be strict: a real student with an exam in days was failed by this tutor before, by being quizzed before being taught, getting the same question five
times, getting a hint after a correct answer, hearing apologies and "I'll check the course material", and seeing the syllabus and another lecture's
excerpt when they asked to start from the beginning.
Then name the 3 worst moments of the session (fewer only if there are fewer than 3 bad moments): the time stamp, the exact quote, and why it is bad.
Lines like "> context", "> card", "> tool" are what the tutor was sent or did, not what the student heard; judge what the student experienced, using
those lines to understand why. Boards ("> board") are what the student saw on the page.

The principles:
${PRINCIPLES.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['principles', 'worst', 'summary'],
  properties: {
    principles: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'score', 'occasion', 'reason'],
      properties: { id: { type: 'integer', enum: PRINCIPLES.map((_, i) => i + 1) }, score: { type: 'integer', enum: [0, 1, 2] }, occasion: { type: 'boolean' }, reason: { type: 'string' } } } },
    worst: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['at', 'quote', 'why'], properties: { at: { type: 'string' }, quote: { type: 'string' }, why: { type: 'string' } } } },
    summary: { type: 'string' },
  },
};

// Pass: no principle at 0 and at least 12 of 16. ponytail: a fixed bar; tune once there are scored good sessions to compare.
const passes = scores => scores.every(s => s > 0) && scores.reduce((a, b) => a + b, 0) >= Math.ceil(scores.length * 1.5); // 12 of 16, 14 of 18

const pct = (list, p) => { const s = list.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
/** Each student line → Plato's first reply line before their next line, and → the next card.issued (also before it). */
export function latency(record) {
  const ev = [...record.events].sort((a, b) => a.at - b.at), students = ev.filter(e => e.kind === 'student');
  const cards = ev.filter(e => e.kind === 'server' && e.type === 'card.issued');
  const rows = students.map((s, i) => {
    const until = students[i + 1]?.at ?? Infinity, reply = ev.find(e => e.kind === 'plato' && e.at > s.at && e.at < until), card = cards.find(c => c.at > s.at && c.at < until);
    return { student: s.text, firstReplyMs: reply ? reply.at - s.at : null, nextCardMs: card ? card.at - s.at : null };
  });
  const stats = key => { const v = rows.map(r => r[key]); return { n: v.filter(x => x != null).length, p50: pct(v, 0.5), p95: pct(v, 0.95) }; };
  return { firstReply: stats('firstReplyMs'), nextCard: stats('nextCardMs'), rows };
}

/** Judges one run record (run.json's contents). */
export async function judgeRun(runtime, record) {
  const s = record.scenario || {};
  // A run where the student never got a turn has nothing to judge: a failed run, never a pass.
  if (!record.turns?.length) return { version: JUDGE_VERSION, scenario: s.slug ?? null, total: 0, pass: false, principles: PRINCIPLES.map((name, i) => ({ name, id: i + 1, score: 0, occasion: false, reason: 'no session' })), worst: [], summary: `Not judged: no turns${record.incident ? ` (${record.incident.slice(0, 200)})` : ''}.`, latency: latency(record) };
  const input = `Course: CS 3410 (Cornell), Prelim 1 on Thursday 15 Oct 2026. Session date: ${record.startedAt}.${record.course?.lectures?.length ? `\nThe course's lectures, in order: ${record.course.lectures.join('; ')}.` : ''}
The simulated student's brief (what they want; for your understanding only): ${s.persona || '(none)'}
${record.incident ? `The run ended with an incident: ${record.incident}\n` : ''}
The session (time stamps from the start):
${timeline(record.events, record.t0)}`;
  const { json } = await runtime.ask({ role: 'heavy', effort: 'medium', timeoutMs: 300_000, instructions: JUDGE, schema: SCHEMA, input });
  const principles = PRINCIPLES.map((name, i) => ({ name, ...(json.principles.find(p => p.id === i + 1) || { id: i + 1, score: 0, occasion: true, reason: '(missing from the judgment)' }) }));
  const scores = principles.map(p => p.score);
  return { version: JUDGE_VERSION, scenario: s.slug ?? null, total: scores.reduce((a, b) => a + b, 0), pass: passes(scores) && !record.incident, principles, worst: json.worst.slice(0, 3), summary: json.summary, latency: latency(record) };
}

const runFile = async arg => (await stat(arg)).isDirectory() ? path.join(arg, 'run.json') : arg;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('usage: node evals/tutor-judge.mjs <evals/runs/<id> | run.json> [...]'); process.exit(2); }
  const runtime = createRuntime();
  try {
    for (const arg of args) {
      const file = await runFile(arg), result = await judgeRun(runtime, JSON.parse(await readFile(file, 'utf8')));
      await writeFile(path.join(path.dirname(file), 'judge.json'), JSON.stringify(result, null, 2));
      const ms = x => x == null ? '-' : `${(x / 1000).toFixed(1)} s`;
      console.log(`\n${path.dirname(file)} · ${result.version}\n${result.pass ? 'PASS' : 'FAIL'} ${result.total}/${result.principles.length * 2} · first reply p50 ${ms(result.latency.firstReply.p50)} p95 ${ms(result.latency.firstReply.p95)} · next card p50 ${ms(result.latency.nextCard.p50)} p95 ${ms(result.latency.nextCard.p95)} (${result.latency.nextCard.n} cards)`);
      for (const p of result.principles) console.log(`  ${p.id}. ${p.score}${p.occasion ? '' : '*'}  ${p.reason}`);
      console.log('worst:'); for (const w of result.worst) console.log(`  ${w.at} "${w.quote}": ${w.why}`);
      console.log(`summary: ${result.summary}`);
    }
  } finally { await runtime.close(); }
}
