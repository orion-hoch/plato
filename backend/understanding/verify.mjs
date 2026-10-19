import { runJs } from '../run/index.mjs';
import { runCheck as runMachineCheck } from '../questions/exam.mjs';
import { VERIFY_VERSIONS } from '../providers/prompts/understanding.mjs';
import { PANEL } from './adapters.mjs';
import { casEqual } from './cas.mjs';

// Verifiers (docs/system-spec.md §9): how an answer is checked, chosen by the course's adapter. `run` verifiers execute
// a program (model-written code runs only in the sandbox: runJs and runC are separate processes under sandbox-exec; the
// RISC-V interpreter is a bounded data VM); `judge` answers that cannot be computed are solved blind by the light model
// and compared against the rubric (understanding/study.mjs batches those). A check, as the stages write it:
//   { by: 'js' | 'c' | 'riscv' | 'judge', code, expect, compare: 'exact' | 'numeric', tolerance }

export const VERIFIERS = {
  js: { run: true, describe: 'js: a complete JavaScript program for Node (no imports, no files, no network) that computes the answer and prints it with console.log; expect is exactly what it prints. For arithmetic, algebra, matrices, probability, bit patterns, schedules and tables, numbers with units.' },
  c: { run: true, describe: 'c: a complete C program (#include <stdio.h>, int main) that prints the answer; expect is exactly what it prints. Only when the behaviour of C itself is the question.' },
  riscv: { run: true, describe: 'riscv: RISC-V (RV64) assembly run on a small simulator (integer instructions and the usual pseudo-instructions, at most 200 steps; set inputs with li, put data in memory with stores); expect names the registers holding the answer at the end, like "a0=-2, a1=3".' },
  judge: { run: false, describe: 'judge: the answer cannot be computed; code is empty, expect is the reference answer, and the item\'s rubric lists what a correct answer must contain. An independent solver answers it blind and a grader compares.' },
};
export const VERIFIER_IDS = Object.keys(VERIFIERS);

/** What went wrong in a failed program: its error line (and the code line node quotes above it), not the stack. */
const errorOf = stderr => { const lines = String(stderr).split('\n'), at = lines.findIndex(l => /^\w*(Error|Exception)\b/.test(l)); return at < 0 ? String(stderr).trim().slice(-300) : [lines[at], ...lines.slice(Math.max(0, at - 4), at).filter(l => l.trim() && !/^file:|^node:/.test(l.trim()))].join(' | ').slice(0, 400); };
const words = text => String(text ?? '').toLowerCase().replace(/[−–]/g, '-').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?|[a-z]+/g) || [];
const isNumber = t => /^-?\d/.test(t);
/** Does `got` give the same answer as `expected`? exact: the same text (spacing aside); numeric: the same tokens, numbers within tolerance (relative, at least absolute 1e-9). */
export function same(got, expected, { compare = 'exact', tolerance = null } = {}) {
  const norm = t => String(t ?? '').replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim();
  if (compare === 'exact') return norm(got) === norm(expected) || norm(got).toLowerCase() === norm(expected).toLowerCase();
  const a = words(got), b = words(expected), tol = tolerance ?? 1e-6;
  return a.length === b.length && a.every((t, i) => isNumber(t) && isNumber(b[i]) ? Math.abs(Number(t) - Number(b[i])) <= Math.max(1e-9, tol * Math.max(1, Math.abs(Number(b[i])))) : t === b[i]);
}
/** A free-form answer against a computed one: the numbers in order (when the computed one has any), else the words. ponytail: format-tolerant, not a parser; the judge settles what this misses. */
export const sameAnswer = (got, expected) => {
  const nums = t => words(t).filter(isNumber).map(Number), e = nums(expected);
  if (e.length) { const g = nums(got); return g.length >= e.length && e.every((x, i) => Math.abs(g.at(i - e.length) - x) <= 1e-6 * Math.max(1, Math.abs(x))) || same(got, expected, { compare: 'numeric' }); }
  return same(got, expected) || words(got).join(' ').includes(words(expected).join(' '));
};

/** Run one `run` check: { ok: true | false | null (cannot run here), output, note }. A judge check is not run here. */
export async function runCheck(check) {
  if (!check || !VERIFIERS[check.by]?.run) return { ok: null, output: null, note: 'judged, not run' };
  try {
    if (check.by === 'js') {
      const ran = await runJs({ source: check.code });
      if (!ran.ok) return { ok: false, ran: false, output: ran.stdout, note: ran.timedOut ? 'the program did not finish in time' : `the program failed: ${errorOf(ran.stderr)}` };
      const ok = same(ran.stdout, check.expect, check);
      return { ok, ran: true, output: ran.stdout.trim(), note: ok ? 'it prints the expected answer' : `it prints ${JSON.stringify(ran.stdout.trim().slice(0, 300))}, not ${JSON.stringify(String(check.expect).slice(0, 300))}` };
    }
    // ran: the check ran to the end and printed something to compare (a failure to compile, finish or trace is no evidence).
    if (check.by === 'c') { const r = await runMachineCheck({ kind: 'c', code: check.code, stdin: '', expectOutput: check.expect }); return { ...r, ran: r.ok === true || /\bprints\b/.test(r.note ?? ''), output: null }; }
    const expectRegisters = [...String(check.expect).matchAll(/([a-z]+\d*)\s*=\s*(-?(?:0x[\da-f]+|0b[01]+|\d+))/gi)].map(m => ({ name: m[1], value: m[2] }));
    if (!expectRegisters.length) return { ok: false, output: null, note: 'a riscv check needs expect like "a0=-2"' };
    const r = await runMachineCheck({ kind: 'riscv', code: check.code, initRegisters: [], initMemory: [], expectRegisters });
    return { ...r, ran: r.ok === true || /\bends with\b/.test(r.note ?? ''), output: null };
  } catch (error) { return { ok: null, output: null, note: `could not run: ${error.message}` }; }
}

// ---------- task families and executable wrong models: one sandboxed program per batch ----------

const HARNESS = `const lcg = seed => { let a = Math.imul(seed, 0x9e3779b9) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }; // mulberry32
const randOf = r => ({ next: r, int: (a, b) => a + Math.floor(r() * (b - a + 1)), pick: xs => xs[Math.floor(r() * xs.length)], real: (a, b, dp = 2) => Number((a + r() * (b - a)).toFixed(dp)), bool: () => r() < 0.5,
  shuffle: xs => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } });
const show = v => typeof v === 'string' ? v : JSON.stringify(v);`;
const fn = code => `(${String(code).trim().replace(/;\s*$/, '')})`;

/**
 * Generate and solve instances of each family, and answer each one with every wrong-model rule that applies to it.
 * families: [{ id, generate, solve }]; rules: [{ wrongModelId, familyId, code }]; seeds: numbers.
 * → { rows: [{ familyId, seed, input, answer, wrong: { [wrongModelId]: answer }, error? }], error? }
 */
export async function runFamilies(families, rules = [], seeds = [1, 2, 3, 4, 5, 6]) {
  if (!families.length) return { rows: [] };
  const program = `${HARNESS}
const families = {${families.map(f => `${JSON.stringify(f.id)}: { generate: ${fn(f.generate)}, solve: ${fn(f.solve)} }`).join(',\n')}};
const rules = [${rules.map(r => `[${JSON.stringify(r.wrongModelId)}, ${JSON.stringify(r.familyId)}, ${fn(r.code)}]`).join(',\n')}];
const seeds = ${JSON.stringify(seeds)}, rows = [];
for (const [familyId, f] of Object.entries(families)) for (const seed of seeds) {
  const row = { familyId, seed, wrong: {} };
  try { row.input = f.generate(randOf(lcg(seed + familyId.length * 7919))); row.answer = show(f.solve(JSON.parse(JSON.stringify(row.input)))); }
  catch (e) { row.error = String(e && e.message || e); rows.push(row); continue; }
  for (const [wid, fid, rule] of rules) if (fid === familyId) { try { row.wrong[wid] = show(rule(JSON.parse(JSON.stringify(row.input)))); } catch (e) { row.wrong[wid] = 'ERROR: ' + String(e && e.message || e); } }
  rows.push(row);
}
console.log(JSON.stringify(rows));`;
  try {
    const ran = await runJs({ source: program, ms: 8_000 });
    if (!ran.ok) return { rows: [], error: ran.timedOut ? 'the families did not finish in time' : errorOf(ran.stderr) || 'the families failed' };
    return { rows: JSON.parse(ran.stdout.trim().split('\n').at(-1)) };
  } catch (error) { return { rows: [], error: error.message }; }
}

/** A family's prompt with an instance's values in its {slots}. */
export const render = (template, input) => String(template).replace(/\{(\w+)\}/g, (all, k) => input && k in input ? (typeof input[k] === 'string' ? input[k] : JSON.stringify(input[k])) : all);

// ---------- the stable API (the course-model stages and evals/understanding share it) ----------

/**
 * Check one answer. With `program`: run it with the `kind` verifier (js | c | riscv) and compare what it prints (for
 * riscv, the registers) with `expected`. Without: compare `answer` with `expected` by value (`compare: 'numeric'` for
 * numbers within `tolerance`, else exact text, else the numbers in order). → { ok: true | false | null, output, note }.
 */
export async function verify({ kind = 'js', program = '', answer = null, expected, compare = 'exact', tolerance = null }) {
  if (program) return runCheck({ by: kind, code: program, expect: expected, compare, tolerance });
  const ok = compare === 'numeric' ? same(answer, expected, { compare, tolerance }) : same(answer, expected) || sameAnswer(answer, expected);
  return { ok, output: answer, note: ok ? 'the same answer' : 'a different answer' };
}

/**
 * Judge answers that cannot be computed, against a reference and a rubric, with the light model (the studyWriter's
 * `agree` stage): items [{ id, question?, answer, reference, rubric? }], { providers } (app.providers or
 * createLiveProviders(…)). → [{ id, ok: true | false | null, why }].
 */
export async function judge(items, { providers }) {
  if (!items.length) return [];
  const r = await Promise.resolve().then(() => providers.studyWriter.agree({ items: items.map(x => ({ id: x.id, question: x.question ?? '', reference: x.reference, rubric: x.rubric ?? [], candidate: x.answer })) })).catch(() => null);
  const verdicts = r?.outcome === 'ok' && Array.isArray(r.value?.items) ? r.value.items : [];
  return items.map(x => { const v = verdicts.find(y => y.id === x.id); return { id: x.id, ok: typeof v?.agree === 'boolean' ? v.agree : null, why: v?.why ?? (r?.outcome === 'ok' ? 'not compared' : 'the judge was unavailable') }; });
}

// ---------- the verifier chain for an attempt (spec §9): parse → exact/equivalence → machine → constraints → sources → judge ----------

/** The verifier families (domain-generality §7.2). Which a course can use comes from the item's adapter. */
export const VERIFIER_FAMILIES = {
  V1: 'exact and normalized (case, spacing, numeric tolerance)', V2: 'execution (programs, tests, simulators)', V3: 'symbolic algebra (plain, spoken or LaTeX expressions: computer algebra, then numeric identity tests)',
  V4: 'numeric with units', V5: 'ordering against a dependency DAG', V6: 'constraints (code predicates, else narrow calibrated judge questions)',
  V7: 'source grounding (quotes and claims against the materials)', V8: 'rubric judge (calibrated criteria only)', V9: 'expert-panel distribution (independent panelists from distinct stances; a verdict only on clear consensus, never at trust above 0.7)',
  V10: 'speech and production (target forms, grammar, agreement, vocabulary, register, task; typed or written text only: no form verdict on a transcript without recognizer confidence)',
};
/** The chain each regime runs, in order; it stops at the first decisive verdict. */
export const CHAINS = { R1: ['V1', 'V3', 'V4', 'V2', 'V10', 'V8'], R2: ['V1', 'V2', 'V3', 'V4', 'V5', 'V10', 'V8'], R3: ['V6', 'V10', 'V8'], R4: ['V7', 'V6', 'V10', 'V8'], R5: ['V7', 'V9'] };
/** The chain for an item: its adapter's verifiers (V1 always); with no adapter every one but V10, which reads a learned language and runs only where an adapter names it. */
export const chainFor = (regime, adapterVerifiers = null) => (CHAINS[regime] || CHAINS.R4).filter(v => adapterVerifiers ? adapterVerifiers.includes(v) || v === 'V1' : v !== 'V10');

/** The numbers in a text (a minus sign of any kind; 0x and 0b literals as their values). */
const numbersOf = text => [...String(text ?? '').replace(/[−–]/g, '-').matchAll(/-?(?:0x[\da-f]+|0b[01]+|\d+(?:\.\d+)?(?:e-?\d+)?)/gi)].map(m => { const t = m[0], neg = t.startsWith('-'), b = neg ? t.slice(1) : t; const v = /^0x/i.test(b) ? parseInt(b.slice(2), 16) : /^0b/i.test(b) ? parseInt(b.slice(2), 2) : Number(b); return neg ? -v : v; });
/** A learner's final answer: a line marked "answer:" or "final:", else the last line after "=", else the whole text. ponytail: a cue reader, not a parser; what it cannot read goes to the judge. */
// (No "= x" rule: answers such as "3z = 3; z = 3" contain "=" themselves; the self-tests caught that.)
const finalLine = text => { const t = String(text ?? '').trim(), marked = /(?:^|\n)\s*(?:final answer|answer|final)\s*[:=]\s*([\s\S]+)$/i.exec(t); return marked ? marked[1].trim() : t; };

/** Exact, apart from case, spacing, surrounding quotes and a final full stop. */
const loose = t => String(t ?? '').replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim().replace(/^["'“”‘’]+|["'“”‘’.!]+$/g, '').trim().toLowerCase();
/** The answer without a spoken lead-in ("so I think it's …", "the answer is …"). */
const bare = t => loose(finalLine(t)).replace(/^(?:(?:so|well|um|uh|okay|ok|i think|i guess|i'd say|maybe)\s*,?\s+)*(?:the answer is|the answer's|it's|it is|that's|that is|i get|i got)\s+/, '');
const sameLoose = (a, b) => loose(a) !== '' && loose(b) !== '' && (loose(a) === loose(b) || bare(a) === loose(b));
/** "Not 108", "I don't think it's 108": a value said only to deny it is never read as the answer. */
const negated = t => /\b(?:not|never|nor)\b|n't\b|\bcannot\b/i.test(String(t ?? ''));

/** Separators inside brackets stay put: "(1,0); 10" has two parts, not three. */
const maskBrackets = t => { let d = 0; return [...String(t)].map(ch => { if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d = Math.max(0, d - 1); return d && ch === ',' ? '\u0001' : d && ch === ';' ? '\u0002' : ch; }).join(''); };
const unmask = t => t.replace(/\u0001/g, ',').replace(/\u0002/g, ';');
/** A key with parts ("1000; -8; 8"): its parts, split on ";" (a comma inside a part stays, as in a list of values). */
const partsOf = value => /[{}]/.test(String(value)) ? [String(value).trim()] : maskBrackets(value).split(/\s*;\s*/).map(x => unmask(x).trim()).filter(Boolean); // code keeps its own semicolons
const eqNums = (a, b, tol = 1e-6) => a.length === b.length && a.length > 0 && a.every((x, i) => Math.abs(x - b[i]) <= Math.max(1e-9, tol * Math.max(1, Math.abs(b[i]))));
/**
 * A learner's answer split into k parts: by ";", by labels ("a)", "(b)", "part 2:"), by lines, by "," or by "and" (never
 * inside brackets). → { exact: every distinct reading with exactly k parts, fewer: the fullest reading with fewer }.
 */
function learnerParts(text, k) {
  const t = maskBrackets(String(finalLine(text) ?? '').trim());
  const tries = [/\s*;\s*/, /\s+(?=[A-Za-z0-9]{1,3}\s*:\s)/, /(?:^|\s)(?:\(?[a-h]\)|\(?[1-9]\)|part\s*\d+\s*[:.)]|[a-h]\s*[:.]|[1-9]\.)\s*/i, /\n+/, /\s*,\s*/, /\s*(?:,\s*)?\band\b\s*/i, /\s*(?:;|,|\band\b)\s*/i]
    .map(re => t.split(re).map(x => unmask(x).replace(/\s+and$/i, '').replace(/[;,.]\s*$/, '').trim()).filter(Boolean));
  return { exact: [...new Map(tries.filter(xs => xs.length === k).map(xs => [JSON.stringify(xs), xs])).values()], fewer: tries.filter(xs => xs.length < k && xs.length > 0).sort((a, b) => b.length - a.length)[0] ?? null };
}
const isWord = ch => /[a-z0-9]/i.test(ch ?? '');
/** Every part present as a whole token run, in order, with nothing between but labels ("a)", "2.", "part 3:"), "and" and separators. */
function containsParts(text, parts) {
  const t = loose(finalLine(text)); let at = 0, rest = '';
  for (const p of parts.map(loose)) {
    if (!p) return false;
    let i = t.indexOf(p, at);
    while (i >= 0 && ((isWord(p[0]) && isWord(t[i - 1])) || (isWord(p.at(-1)) && isWord(t[i + p.length])))) i = t.indexOf(p, i + 1);
    if (i < 0) return false;
    rest += ` ${t.slice(at, i)} `; at = i + p.length;
  }
  return `${rest} ${t.slice(at)}`.replace(/\(?\b[a-h1-9]\)|\b[a-h1-9][.:](?=\s|$)|\bpart\s*\d+\s*[:.)]?|\band\b/gi, '').replace(/[\s,;:.()-]/g, '') === '';
}
const samePart = (got, want) => same(got, want) || sameLoose(got, want) || (numbersOf(want).length && !(negated(got) && !negated(want)) ? eqNums(numbersOf(got), numbersOf(want)) : false) || same(String(got).toLowerCase().replace(/^(?:it is|its|the answer is)\s+/, ''), String(want).toLowerCase());
/** Each part of a multi-part key checked on its own: a verdict per part (correct, incorrect, missing). */
function checkParts(item, answer, parts, top) {
  const { exact, fewer } = learnerParts(answer, parts.length), read = xs => parts.map((want, i) => xs[i] === undefined ? 'missing' : samePart(xs[i], want) ? 'correct' : 'incorrect');
  // Right under any reading (the readers disagree on a part with its own commas or labels), or every part there verbatim.
  if (exact.some(xs => read(xs).every(v => v === 'correct')) || containsParts(answer, parts)) return { ok: true, trust: top, decisive: true, note: 'every part matches the key', parts: parts.map(() => 'correct') };
  const wrong = Object.entries(item.wrongAnswers || {}).find(([, a]) => { const ws = partsOf(a); return ws.length === parts.length && (exact.some(xs => ws.every((w, i) => samePart(xs[i], w))) || containsParts(answer, ws)); });
  if (wrong) return { ok: false, trust: top, decisive: true, note: `the parts ${wrong[0]} predicts`, wrongModel: wrong[0], parts: exact[0] ? read(exact[0]) : parts.map(() => 'incorrect') };
  if (!exact.length) {
    if (!fewer) return { ok: null, trust: 0, decisive: false, note: `could not find the ${parts.length} parts of the answer; checking further`, parts: parts.map(() => 'missing') };
    const verdicts = read(fewer);
    // What is there is right and the rest is missing: ask for it. A wrong piece in a short reading may be a misreading: the judge.
    return verdicts.includes('incorrect') ? { ok: null, trust: 0, decisive: false, note: 'some parts could not be read; checking further', parts: verdicts }
      : { ok: null, trust: 0, decisive: true, elicit: true, note: `part ${verdicts.indexOf('missing') + 1} is missing: ask for it`, parts: verdicts };
  }
  // A concise answer that differs from the key is incorrect below trust 1; a long one goes on to the judge.
  const verdicts = read(exact[0]), concise = loose(finalLine(answer)).length <= 1.5 * loose(parts.join('; ')).length + 20;
  return concise ? { ok: false, trust: 0.85, decisive: true, note: `part ${verdicts.findIndex(v => v !== 'correct') + 1} differs from the key`, parts: verdicts }
    : { ok: null, trust: 0, decisive: false, note: 'a long answer whose parts differ from the key; checking further', parts: verdicts };
}

/**
 * A verifier self-test (spec §7 stage 10): the key in several phrasings must be accepted, each wrong model's answer
 * rejected with that model named, and a verbose correct answer never rejected at trust 1. Pure: no model call.
 * → { pass, failures: [string] }.
 */
export async function selfTestItem(item) {
  const key = item.key; if (!key?.value) return { pass: null, failures: [] };
  const failures = [], run = async a => { for (const v of ['V1', 'V3', 'V4']) { const r = await STEPS[v]({ ...item, selfTest: null }, a); if (r?.decisive) return r; } return null; };
  // Multi-part phrasings only where they stay unambiguous: no "," join when a part has its own commas, no "and" join when a
  // part says "and", no letter labels when the parts carry their own ("A: …").
  const parts = partsOf(key.value), labelled = parts.every(x => /^[A-Za-z0-9]{1,3}\s*[:)]/.test(x));
  const multi = parts.length > 1 ? [...(parts.some(x => x.includes(',')) ? [] : [parts.join(', ')]), ...(parts.some(x => /\band\b/i.test(x)) ? [] : [parts.join(' and ')]), ...(labelled ? [] : [parts.map((x, i) => `${'abcdefgh'[i]}) ${x}`).join(' ')]), parts.join('\n')] : [];
  for (const a of [key.value, ` ${key.value}.`, String(key.value).replace(/-/g, '−'), `Answer: ${key.value}`, ...multi, ...(key.equivalents || [])]) { const r = await run(a); if (!r?.ok) failures.push(`the key phrased "${a}" is not accepted`); }
  for (const [w, a] of Object.entries(item.wrongAnswers || {})) { const r = await run(a); if (r?.ok !== false || (r.wrongModel && r.wrongModel !== w)) failures.push(`${w}'s answer "${a}" is not rejected as ${w}`); }
  const verbose = await run(`${key.value}. ${String(item.answer ?? '').slice(0, 400)}`);
  if (verbose?.ok === false && verbose.trust === 1) failures.push('a verbose correct answer is rejected at trust 1');
  return { pass: !failures.length, failures };
}

const quotesIn = text => [...String(text).matchAll(/["“]([^"”]{12,400})["”]/g)].map(m => m[1]);
const normText = t => String(t ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** A topological order check: `order` (ids) against `dag` ({ id: [ids it must come after] }). */
export const validOrder = (order, dag) => { const at = new Map(order.map((id, i) => [id, i])); return Object.keys(dag).every(id => at.has(id)) && order.every(id => (dag[id] || []).every(before => at.has(before) && at.get(before) < at.get(id))); };
const calibrationOf = (calibration, key) => calibration?.get?.(key) ?? calibration?.[key] ?? null;

const STEPS = {
  // V1 and V4 compare against the item's answer KEY (its canonical value and equivalents), never its explanation, and read
  // the learner's final answer: a match is decisive at trust 1; a concise answer that matches neither the key nor a wrong
  // model is "incorrect" below trust 1; a verbose answer they cannot read safely goes on to the judge. An item whose
  // self-test failed (selfTestItem) gives no trust-1 verdict at all.
  V1: async (item, answer) => {
    const key = item.key; if (!key?.value) return null;
    if ([key.value, ...(key.equivalents || [])].some(v => sameLoose(answer, v) || sameLoose(finalLine(answer), v))) return { ok: true, trust: item.selfTest?.pass === false ? 0.7 : 1, decisive: true, note: 'the answer key' };
    const wrong = Object.entries(item.wrongAnswers || {}).find(([, a]) => sameLoose(answer, a) || sameLoose(finalLine(answer), a));
    return wrong ? { ok: false, trust: item.selfTest?.pass === false ? 0.7 : 1, decisive: true, note: `the answer ${wrong[0]} predicts`, wrongModel: wrong[0] } : { ok: false, trust: 0, decisive: false, note: 'not the key\'s text; checking further' };
  },
  V4: async (item, answer) => {
    const key = item.key; if (!key?.value) return null;
    if (key.form === 'expression') return null; // an expression's numbers in order say nothing of its value ("2x^2+x+1" is not "x^2+2x+1"): V3's
    const top = item.selfTest?.pass === false ? 0.7 : 1, parts = partsOf(key.value);
    if (parts.length > 1) return checkParts(item, answer, parts, top);
    if (!numbersOf(key.value).length) return null;
    if (negated(finalLine(answer)) && !negated(key.value)) return { ok: null, trust: 0, decisive: false, note: 'a value said with a negation; checking further' };
    const got = numbersOf(finalLine(answer)), want = numbersOf(key.value), tol = key.tolerance ?? 1e-6;
    if (eqNums(got, want, tol) || (key.equivalents || []).some(v => eqNums(got, numbersOf(v), tol))) return { ok: true, trust: top, decisive: true, note: 'the same value as the key' };
    const wrong = Object.entries(item.wrongAnswers || {}).find(([, a]) => numbersOf(a).length && eqNums(got, numbersOf(a), tol));
    if (wrong) return { ok: false, trust: top, decisive: true, note: `the value ${wrong[0]} predicts`, wrongModel: wrong[0] };
    // Incorrect only when the answer is exactly as long as the key and shares none of its values in place; anything with extra
    // numbers (context, working) is not read here: the judge, or the learner, settles it.
    return got.length === want.length && got.every((x, i) => Math.abs(x - want[i]) > Math.max(1e-9, tol * Math.max(1, Math.abs(want[i])))) || (got.length === want.length && want.length > 1 && !eqNums(got, want, tol))
      ? { ok: false, trust: 0.85, decisive: true, note: 'a different value from the key' } : { ok: false, trust: 0, decisive: false, note: 'not a single final value to compare; checking further' };
  },
  V2: async (item, answer) => {
    if (!item.tests) return null; // a program that reads the answer (JSON) and prints PASS or FAIL
    const ran = await runJs({ source: `const answer = ${JSON.stringify(answer)};\n${item.tests}` });
    if (!ran.ok) return { ok: null, trust: 0, decisive: false, note: `the tests did not run: ${errorOf(ran.stderr)}` };
    const pass = /\bPASS\b/.test(ran.stdout) && !/\bFAIL\b/.test(ran.stdout);
    return { ok: pass, trust: 1, decisive: true, note: ran.stdout.trim().slice(0, 300) };
  },
  V5: async (item, answer) => item.dag ? (validOrder(Array.isArray(answer) ? answer : String(answer).split(/[\s,]+/).filter(Boolean), item.dag) ? { ok: true, trust: 1, decisive: true, note: 'a valid order' } : { ok: false, trust: 1, decisive: true, note: 'a step comes before one it depends on' }) : null,
  V6: async (item, answer, ctx) => {
    if (!item.constraints?.length) return null;
    const results = [];
    for (const c of item.constraints) {
      if (c.test) { const ran = await runJs({ source: `const answer = ${JSON.stringify(answer)};\nconsole.log((${c.test})(answer) ? 'PASS' : 'FAIL');` }); results.push({ id: c.id, ok: ran.ok ? /PASS/.test(ran.stdout) : null, trust: ran.ok ? 0.9 : 0 }); }
      else { const cal = calibrationOf(ctx.calibration, `${item.id}:${c.id}`) ?? calibrationOf(ctx.calibration, c.id); results.push({ id: c.id, ok: null, trust: cal?.pass ? cal.agreement ?? 0.6 : 0, judge: cal?.pass ? c.text : null }); }
    }
    const judged = results.filter(r => r.judge);
    if (judged.length && ctx.providers) { const verdicts = await judge(judged.map(r => ({ id: r.id, question: `${item.prompt}\nCriterion: ${r.judge}`, answer, reference: item.answer ?? '' })), { providers: ctx.providers }); for (const v of verdicts) Object.assign(results.find(r => r.id === v.id), { ok: v.ok }); }
    const failed = results.filter(r => r.ok === false), open = results.filter(r => r.ok === null);
    if (failed.length) return { ok: false, trust: Math.min(...failed.map(r => r.trust)), decisive: true, note: `misses ${failed.map(r => r.id).join(', ')}`, constraints: results };
    return open.length ? { ok: null, trust: 0, decisive: false, note: `${open.length} constraints are discussion-only (uncalibrated)`, constraints: results } : { ok: true, trust: Math.min(...results.map(r => r.trust)), decisive: true, note: 'meets every constraint', constraints: results };
  },
  V7: async (item, answer, ctx) => {
    const quotes = quotesIn(answer);
    if (!quotes.length || !ctx.passages?.length) return null;
    const text = normText(ctx.passages.flatMap(p => p.blocks.map(b => b.text)).join(' ')), missing = quotes.filter(q => !text.includes(normText(q)));
    return missing.length ? { ok: false, trust: 0.8, decisive: true, note: `quotes what the sources do not say: "${missing[0].slice(0, 120)}"` } : { ok: null, trust: 0, decisive: false, note: 'its quotes are in the sources' };
  },
  // Narrow shared criteria ({ id, question }, evals' criteria.json), each judged by the calibrated narrow judge only when its
  // record says 'verdict'. A "yes" on a fault criterion (answer.unsupported, history.presentism) is a miss.
  V8: async (item, answer, ctx) => {
    const criteria = item.criteria || [];
    if (!criteria.length || !ctx.providers) return null;
    const calibrated = criteria.map(c => ({ ...c, cal: calibrationOf(ctx.calibration, c.id) })).filter(c => c.cal?.pass);
    if (!calibrated.length) return { ok: null, trust: 0, decisive: true, elicit: true, note: 'no calibrated criterion: discussion only, never a verdict' };
    // The criteria are independent calls: judged together, so the wait is the slowest one, not their sum.
    const verdicts = await Promise.all(calibrated.map(async c => { const [v] = await judgeCriterion(c, [{ id: c.id, question: item.prompt, reference: item.answer ?? '', answer }], { providers: ctx.providers }); return { ...v, id: c.id }; }));
    // A judge's trust is its measured agreement on the criterion, never 1: only executed or exact verifiers reach 1.
    const failed = verdicts.filter(v => v.ok === false), trust = Math.min(0.9, ...calibrated.map(c => c.cal.agreement ?? 0.6));
    return verdicts.some(v => v.ok === null) ? { ok: null, trust: 0, decisive: true, elicit: true, note: 'the judge abstained' } : { ok: !failed.length, trust, decisive: true, note: failed.length ? `misses: ${failed.map(f => f.why).join('; ')}` : 'meets the calibrated criteria' };
  },
  V3: async (item, answer) => {
    const key = item.key; if (!key?.value || !(key.form === 'expression' || (key.form === 'text' && /[A-Za-z]/.test(key.value) && /[-+*/^=]/.test(key.value)))) return null;
    const m = await mathOf(), top = item.selfTest?.pass === false ? 0.7 : 1;
    // A key that says it is text is read as algebra only when its symbols are a mathematician's (x, c_1, theta), never words.
    const keys = [key.value, ...(key.equivalents || [])].map(v => exprOf(m, v)).filter(e => e && (key.form === 'expression' || [...e.vars].every(v => v.length <= 3 || GREEK.has(v)))); if (!keys.length) return null;
    const got = exprCandidates(answer).map(c => ({ ...c, e: exprOf(m, c.text) })).find(c => c.e);
    if (!got) return null; // not an expression (words, a verbose answer): the other verifiers read it
    let first = null;
    for (const k of keys) { const r = await sameExpr(m, got.e, k); first ??= r; if (r.same) return { ok: true, trust: r.proved ? top : Math.min(top, 0.95), decisive: true, note: r.proved ? 'equivalent to the key (algebra)' : `equivalent to the key (equal at ${r.points} sampled points)` }; }
    for (const [w, a] of Object.entries(item.wrongAnswers || {})) { const e = exprOf(m, a); if (e && (await sameExpr(m, got.e, e)).same) return { ok: false, trust: Math.min(top, 0.95), decisive: true, note: `equivalent to the answer ${w} predicts`, wrongModel: w }; }
    if (first.positiveOnly) return { ok: null, trust: 0, decisive: false, note: 'equal to the key for positive values only (a domain assumption?); checking further' };
    if (first.constant) return { ok: null, trust: 0, decisive: false, note: 'differs from the key by a constant (an antiderivative\'s + C?); checking further' };
    // A counterexample proves they differ; it is a verdict only when the expression is the whole answer and uses the key's symbols.
    return first.same === false && got.concise && !first.extra ? { ok: false, trust: Math.min(top, 0.95), decisive: true, note: `not equivalent to the key: at ${first.at} it is ${first.got}, the key ${first.want}` }
      : { ok: false, trust: 0, decisive: false, note: 'not shown equivalent to the key; checking further' };
  },
  // V9 (R5, expert disagreement): Script Concordance scoring with a model panel. Each stance judges alone (its own call, its
  // own answer first); credit is the share of the panel reaching the learner's conclusion. A verdict only on clear consensus
  // (≥ 80% of the seated panel), and never above 0.7: a model panel is uncalibrated and its members are correlated.
  V9: async (item, answer, ctx) => {
    if (!ctx.providers?.studyWriter?.panel) return { ok: null, trust: 0, decisive: true, elicit: true, note: 'experts legitimately disagree here and no panel can sit: discuss, no verdict' };
    const stances = ctx.panel?.length ? ctx.panel : PANEL, votes = await panelOf(item, answer, stances, ctx.providers);
    if (!votes) return { ok: null, trust: 0, decisive: true, elicit: true, note: 'the panel was unavailable: discuss, no verdict' };
    const n = stances.length, sure = votes.filter(v => v && v.verdict !== 'cannot_tell' && v.confidence >= 0.5), count = k => sure.filter(v => v.verdict === k).length;
    const within = count('agree') + count('defensible'), against = count('not_defensible');
    const panel = { n, agree: count('agree'), defensible: count('defensible'), notDefensible: against, unsure: n - sure.length, credit: Math.round(100 * count('agree') / n) / 100, positions: votes.map((v, i) => ({ stance: stances[i].id, position: v?.position ?? null, verdict: v?.verdict ?? null })) };
    const split = `${within} of ${n} panelists find it defensible (${panel.agree} reach the same conclusion), ${against} do not${panel.unsure ? `, ${panel.unsure} cannot tell` : ''}`;
    if (within >= 0.8 * n) return { ok: true, trust: within === n ? 0.7 : 0.6, decisive: true, note: `a model panel: ${split}`, panel };
    if (against >= 0.8 * n) return { ok: false, trust: against === n ? 0.7 : 0.6, decisive: true, note: `a model panel: ${split}`, panel };
    return { ok: null, trust: 0, decisive: true, elicit: true, note: `the panel splits (${split}): ask for their reasoning, never a verdict`, panel };
  },
  // V10 (A5): what a learner produced in the language they learn, against the item's targets (its key, constraints and rubric).
  // Only text reaches the backend: typed or written lines, and speech-recognition transcripts. A transcript's spelling and
  // accents are the recognizer's, and it may have heard a form the learner never said, so on speech (or a line whose channel
  // is unknown) only content findings are verdicts (the task not done, a target never attempted); a form verdict needs
  // typed or written text or recognizer confidence ≥ ASR_MIN, and is otherwise an elicitation: say it again, or type it.
  V10: async (item, answer, ctx) => {
    const key = item.key, targets = [...(key?.value ? [key.value] : []), ...(item.constraints || []).map(c => c.text), ...(item.rubric || [])];
    if (!targets.length) return null;
    const written = ['written', 'typed'].includes(ctx.channel ?? (/^\s*\[Written on the page\]/i.test(String(answer)) ? 'written' : null)), heard = written || (ctx.asrConfidence ?? 0) >= ASR_MIN;
    const fold = t => loose(finalLine(t)).normalize('NFD').replace(/\p{M}/gu, '');
    if (key?.value && [key.value, ...(key.equivalents || [])].some(v => fold(answer) === fold(v) || fold(bare(answer)) === fold(v)))
      return heard ? { ok: false, trust: 0.85, decisive: true, note: 'the key\'s words with other accents' } : { ok: null, trust: 0, decisive: true, elicit: true, note: 'the key\'s words, but a transcript cannot show accents: ask them to type it' };
    if (!ctx.providers?.studyWriter?.production) return null;
    const r = await productionOf(item, answer, written ? 'written' : 'speech', ctx.providers);
    if (!r) return { ok: null, trust: 0, decisive: false, note: 'the production check was unavailable; checking further' };
    const production = { language: r.language, task: r.task, targets: r.targets, errors: r.errors.filter(e => written || e.audible) };
    if (r.confidence < 0.6) return { ok: null, trust: 0, decisive: true, elicit: true, note: 'the production check is unsure: ask them to say more, or to type it', production };
    const { errors } = production, missed = r.targets.filter(t => t.verdict === 'missed'), absent = r.targets.filter(t => t.verdict === 'absent');
    const fixes = errors.slice(0, 3).map(e => `"${e.span}" → "${e.correction}" (${e.kind})`).join('; ');
    if (r.task === 'not_done' || absent.length) return { ok: false, trust: 0.6, decisive: true, note: r.task === 'not_done' ? 'it does not do the task' : `it never attempts: ${absent.map(t => t.target).join('; ')}`, production };
    if (!heard) return { ok: null, trust: 0, decisive: true, elicit: true, note: `${missed.length || errors.length ? `the transcript shows ${fixes || 'a missed target'}` : 'the transcript reads right'}, but a transcript is no form evidence without recognizer confidence: ask them to say it again slowly, or to type it`, production };
    // A model analyser, uncalibrated: below any calibrated judge's trust, at the floor where a verdict counts.
    if (missed.length || (!r.targets.length && errors.length)) return { ok: false, trust: 0.65, decisive: true, note: `misses ${missed.map(t => t.target).join('; ') || 'its forms'}${fixes ? `: ${fixes}` : ''}`, production };
    return r.task === 'done' ? { ok: true, trust: 0.65, decisive: true, note: `meets its targets${fixes ? `; other errors: ${fixes}` : ''}`, production } : { ok: null, trust: 0, decisive: false, note: 'the task is only partly done; checking further', production };
  },
};

// ---------- V3's notation and comparison ----------

let mathjs = null;
const mathOf = async () => (mathjs ??= await import('mathjs'));
const FUNCTIONS = new Set(['sqrt', 'cbrt', 'nthRoot', 'exp', 'log', 'log10', 'log2', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'abs']);
const OPERATORS = new Set(['add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus']);
const CONSTANTS = new Set(['pi', 'e', 'i']);
const GREEK = new Set('alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi rho sigma tau upsilon phi varphi chi psi omega'.split(' '));
/** The group after a LaTeX command at i ({…} or one character) → [content, end], or null. */
function braced(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] !== '{') return s[i] ? [s[i], i + 1] : null;
  for (let d = 0, j = i; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) return [s.slice(i + 1, j), j + 1]; }
  return null;
}
/** \frac{a}{b} → ((a)/(b)); \sqrt[n]{x} → nthRoot(x, n); \sqrt{x} → sqrt(x); inner ones first. */
function texCalls(s) {
  const m = /\\(frac|sqrt)(?![A-Za-z])/.exec(s); if (!m) return s;
  let i = m.index + m[0].length, out;
  if (m[1] === 'frac') { const a = braced(s, i), b = a && braced(s, a[1]); if (!b) return s; out = `((${texCalls(a[0])})/(${texCalls(b[0])}))`; i = b[1]; }
  else { let n = null; while (s[i] === ' ') i++; if (s[i] === '[') { const j = s.indexOf(']', i); if (j < 0) return s; n = s.slice(i + 1, j); i = j + 1; } const a = braced(s, i); if (!a) return s; out = n ? `nthRoot(${texCalls(a[0])}, ${texCalls(n)})` : `sqrt(${texCalls(a[0])})`; i = a[1]; }
  return s.slice(0, m.index) + out + texCalls(s.slice(i));
}
// Spoken math as a transcript gives it. ponytail: a word list, not a grammar ("the square root of x plus 1" reads as sqrt(x) + 1).
const SPOKEN = [[/\bto the power of\b|\braised to(?: the)?\b|\bto the\b(?=\s*\d)/gi, '^'], [/\bsquared\b/gi, '^2'], [/\bcubed\b/gi, '^3'], [/\bplus\b/gi, '+'], [/\bminus\b/gi, '-'], [/\btimes\b|\bmultiplied by\b/gi, '*'], [/\bdivided by\b|\bover\b/gi, '/'], [/\b(?:the )?square root of\b/gi, 'sqrt '],
  ...'zero one two three four five six seven eight nine ten'.split(' ').map((w, n) => [new RegExp(`\\b${w}\\b`, 'gi'), String(n)])];
/** Plain, LaTeX or spoken notation as mathjs reads it. */
function plainMath(text) {
  let s = String(text).replace(/\\(?:left|right|displaystyle|q?quad)(?![A-Za-z])|\\[,;:! ]/g, ' ').replace(/\$|\\[()[\]]/g, ' ').replace(/\\[dt]frac(?![A-Za-z])/g, '\\frac')
    .replace(/\\(?:cdot|times|ast)(?![A-Za-z])/g, '*').replace(/\\div(?![A-Za-z])/g, '/').replace(/\\(?:operatorname|mathrm|mathit|text)\s*\{([^{}]*)\}/g, '$1');
  s = texCalls(s).replace(/\\(arcsin|arccos|arctan|ln)(?![A-Za-z])/g, (_, f) => ` ${({ arcsin: 'asin', arccos: 'acos', arctan: 'atan', ln: 'log' })[f]} `).replace(/\\([A-Za-z]+)/g, ' $1 ')
    .replace(/_\{([^{}]*)\}/g, '_$1').replace(/\{/g, '(').replace(/\}/g, ')').replace(/[−–]/g, '-').replace(/[·×]/g, '*').replace(/÷/g, '/').replace(/²/g, '^2').replace(/³/g, '^3').replace(/\bln\b/g, 'log');
  for (const [re, to] of SPOKEN) s = s.replace(re, to);
  // A function written without parentheses takes the next term (sin x, sqrt 2x), and a power on a function is on its value (sin^2 x).
  const fn = [...FUNCTIONS].join('|');
  return s.replace(new RegExp(`(?<![A-Za-z])(${fn})\\s*\\^\\s*(\\d+|\\([^()]*\\))\\s*(?:\\(([^()]*)\\)|([A-Za-z0-9.]+))`, 'g'), (_, f, n, a, b) => `(${f}(${a ?? b}))^${n}`)
    .replace(new RegExp(`(?<![A-Za-z])(${fn})\\s+(?![(^])([A-Za-z0-9.]+(?:\\^[A-Za-z0-9.]+)?)`, 'g'), '$1($2)').trim().replace(/[.,;]+$/, '');
}
/** An expression or equation (plain, LaTeX or spoken) → { node (for an equation: lhs − rhs), rhs, eq, vars }, or null. Only arithmetic, powers and FUNCTIONS. */
function exprOf(m, text) {
  const src = plainMath(text); if (!src || src.length > 300 || /[<>≤≥≠!]/.test(src)) return null;
  const sides = src.split(/=+/).map(x => x.trim()); if (sides.length > 3 || sides.some(x => !x)) return null;
  const parse = x => {
    let node; try { node = m.parse(x); } catch { return null; }
    let ok = true;
    node = node.transform(n => n.isFunctionNode && n.fn?.isSymbolNode && !FUNCTIONS.has(n.fn.name) && n.args.length === 1 ? new m.OperatorNode('*', 'multiply', [new m.SymbolNode(n.fn.name), n.args[0]], true) : n); // x(x+1) is a product
    node.traverse((n, path, parent) => { if (n.isSymbolNode) { if (!(parent?.isFunctionNode && path === 'fn') && (!/^[A-Za-z][A-Za-z0-9_]*$/.test(n.name) || FUNCTIONS.has(n.name))) ok = false; } else if (n.isOperatorNode) { if (!OPERATORS.has(n.fn)) ok = false; } else if (n.isFunctionNode) { if (!n.fn?.isSymbolNode || !FUNCTIONS.has(n.fn.name)) ok = false; } else if (n.isConstantNode) { if (typeof n.value !== 'number') ok = false; } else if (!n.isParenthesisNode) ok = false; });
    return ok ? node.transform(n => n.isSymbolNode && n.name.includes('_') ? new m.SymbolNode(n.name.replace(/_/g, '')) : n) : null; // x_1 and x1 are one name
  };
  const nodes = sides.map(parse); if (nodes.some(x => !x)) return null;
  // "y = …" or a chain "(x+1)^2 = x^2+2x+1": an equation of two sides; the last side is what a chain arrives at.
  const eq = nodes.length === 2, node = eq ? new m.OperatorNode('-', 'subtract', [nodes[0], new m.ParenthesisNode(nodes[1])]) : nodes.at(-1);
  return { node, rhs: nodes.at(-1), eq, vars: varsOf(node) };
}
const varsOf = node => { const out = new Set(); node.traverse((n, path, parent) => { if (n.isSymbolNode && !(parent?.isFunctionNode && path === 'fn') && !CONSTANTS.has(n.name)) out.add(n.name); }); return out; };
/** "xy" read as x·y when x and y are the other side's symbols and xy is not ("2xy" against "2*x*y"). */
const splitNames = (m, node, known) => node.transform(n => n.isSymbolNode && !known.has(n.name) && !CONSTANTS.has(n.name) && !GREEK.has(n.name) && /^[A-Za-z]{2,}$/.test(n.name) && [...n.name].every(c => known.has(c))
  ? [...n.name].map(c => new m.SymbolNode(c)).reduce((a, b) => new m.OperatorNode('*', 'multiply', [a, b], true)) : n);
const lcg = seed => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
/**
 * Numeric identity tests: both sides at 10 seeded random points with every variable positive, then 10 with mixed signs.
 * ratio: equations agree up to a constant factor. → { same: true | false | null, at, got, want, constant, positiveOnly, points }.
 */
function numericSame(a, b, vars, ratio) {
  const fa = a.compile(), fb = b.compile(), next = lcg(7919), value = (f, scope) => { try { const v = f.evaluate(scope), re = typeof v === 'number' ? v : v?.re, im = typeof v === 'number' ? 0 : v?.im; return Number.isFinite(re) && Number.isFinite(im) ? [re, im] : null; } catch { return null; } };
  const close = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1]) <= 1e-8 * Math.max(1, Math.hypot(...x), Math.hypot(...y)), show = x => Number((x[1] ? Math.hypot(...x) : x[0]).toPrecision(6));
  const run = positive => {
    const out = { valid: 0, bad: null, diffs: [] }; let k = null;
    for (let t = 0; t < (vars.length ? 10 : 1); t++) {
      const scope = Object.fromEntries(vars.map(v => [v, positive ? 0.5 + 2 * next() : (next() < 0.5 ? -1 : 1) * (0.3 + 2.2 * next())])), x = value(fa, scope), y0 = value(fb, scope);
      if (!x || !y0) continue;
      if (ratio && k === null && Math.hypot(...y0) > 1e-9) k = x[0] / y0[0];
      const y = ratio && k !== null ? [y0[0] * k, y0[1] * k] : y0;
      out.valid++; out.diffs.push(x[0] - y[0]);
      if (!close(x, y) && !out.bad) out.bad = { at: vars.map(v => `${v} = ${Number(scope[v].toFixed(3))}`).join(', ') || 'any value', got: show(x), want: show(y) };
    }
    return out;
  };
  const P = run(true);
  if (P.valid < (vars.length ? 4 : 1)) return { same: null };
  if (P.bad) return { same: false, ...P.bad, constant: !ratio && P.diffs.every(d => Math.abs(d - P.diffs[0]) <= 1e-8 * Math.max(1, Math.abs(d))) };
  return run(false).bad ? { same: null, positiveOnly: true } : { same: true, points: P.valid };
}
/** Is `a` (the learner's) the same expression or equation as `b`? Computer algebra proves equality; numeric identity tests decide otherwise. */
async function sameExpr(m, a, b) {
  if (b.eq && !a.eq) return { same: null }; // the key is an equation and the answer is not (a learner's equation for an expression key: what it arrives at)
  const x0 = a.eq && !b.eq ? a.rhs : a.node, known = varsOf(b.node), x = splitNames(m, x0, known), y = splitNames(m, b.node, varsOf(x)), vars = [...new Set([...varsOf(x), ...varsOf(y)])];
  const extra = [...varsOf(x)].some(v => !varsOf(y).has(v)), num = numericSame(x, y, vars, b.eq);
  if (num.same === false) return { ...num, extra };
  if (!b.eq && await casEqual(x.toString(), y.toString())) return { same: true, proved: true };
  return { ...num, extra };
}
/** Where the expression is in an answer: LaTeX a drawing's reading gives, the marked final answer, the last line of work. concise: the whole answer. */
function exprCandidates(text) {
  const t = String(text ?? ''), tex = /\(as LaTeX: ([\s\S]+)\)\s*$/.exec(t)?.[1];
  const body = t.replace(/\(as LaTeX: [\s\S]+\)\s*$/, '').replace(/^\s*\[Written on the page\]\s*/i, '').replace(/^[^\n:=]{1,40}:\s*\n/, ''), lines = body.split('\n').map(x => x.trim()).filter(Boolean);
  const lead = x => x.replace(/^(?:(?:so|well|um|uh|okay|ok|i think|i guess|i'd say|maybe)\s*,?\s+)*(?:the answer is|the answer's|it's|it is|that's|that is|i get|i got|i have)\s+/i, '');
  return [tex && { text: tex, concise: lines.length <= 1 }, { text: lead(finalLine(body)), concise: lines.length <= 1 }, lines.length > 1 && { text: lead(lines.at(-1)), concise: false }].filter(c => c?.text);
}

// ---------- V9 and V10: model calls, one per (verifier, item, answer), kept while they run and after ----------

const ASR_MIN = 0.85; // the recognizer confidence a spoken form verdict needs (domain-generality §7.2); none reaches the backend today
const kept = new Map(), KEPT = 300;
/** As the director keeps its readings: a promise per key (a failed one, null, is not kept). */
function once(key, make) {
  if (!kept.has(key)) {
    const p = make(); kept.set(key, p); if (kept.size > KEPT) kept.delete(kept.keys().next().value);
    p.then(v => { if (!v && kept.get(key) === p) kept.delete(key); });
  }
  return kept.get(key);
}
const ask = (fn, input) => Promise.resolve().then(() => fn(input)).then(r => r?.outcome === 'ok' ? r.value : null, () => null);
/** The panel's votes on one answer, one call per stance (never one call for all: a single sample overstates consensus). → [vote | null] or null. */
const panelOf = (item, answer, stances, providers) => once(JSON.stringify(['V9', VERIFY_VERSIONS.panel, item.id ?? null, item.prompt ?? '', stances.map(x => x.id), String(answer).trim()]), async () => {
  const votes = await Promise.all(stances.map(stance => ask(providers.studyWriter.panel, { stance, items: [{ id: 'a', question: item.prompt ?? '', criteria: item.rubric || [], answer: String(answer) }] }).then(v => v?.verdicts?.find(x => x.id === 'a') ?? null)));
  return votes.some(Boolean) ? votes : null;
});
/** The production analysis of one answer on its channel ('written' | 'speech'). → { language, targets, errors, task, confidence } or null. */
const productionOf = (item, answer, channel, providers) => once(JSON.stringify(['V10', VERIFY_VERSIONS.production, item.id ?? null, item.prompt ?? '', channel, String(answer).trim()]), async () => {
  const v = await ask(providers.studyWriter.production, { items: [{ id: 'a', task: item.prompt ?? '', key: item.key?.value ? [item.key.value, ...(item.key.equivalents || [])] : [], targets: [...(item.constraints || []).map(c => c.text), ...(item.rubric || [])], reference: item.answer ?? null, channel, production: String(answer) }] });
  return v?.items?.find(x => x.id === 'a') ?? null;
});

/**
 * Check one learner attempt through its item's chain. item: { id, prompt, regime, answer?, computed?, tests?, dag?,
 * constraints?: [{ id, text, test? }], rubric? }; ctx: { providers?, calibration? (Map or object: criterion → { pass,
 * agreement }), passages?, adapterVerifiers?, panel? (V9's stances), channel? ('speech' | 'typed' | 'written'),
 * asrConfidence? }. → { ok: true | false | null, trust, by, elicit, note, chain }. An undecided verdict (ok null) means
 * elicit: ask the learner, never guess.
 */
export async function verifyAttempt(item, answer, ctx = {}) {
  const steps = [];
  for (const v of chainFor(item.regime, ctx.adapterVerifiers)) {
    const r = await STEPS[v]?.(item, answer, ctx);
    if (!r) continue;
    steps.push({ by: v, ok: r.ok, note: r.note, ...(r.wrongModel ? { wrongModel: r.wrongModel } : {}), ...(r.parts ? { parts: r.parts } : {}), ...(r.panel ? { panel: r.panel } : {}), ...(r.production ? { production: r.production } : {}) });
    if (r.decisive) return { ok: r.ok, trust: r.ok === null ? 0 : r.trust, by: v, elicit: r.ok === null, note: r.note, chain: steps };
  }
  return { ok: null, trust: 0, by: null, elicit: true, note: 'no verifier could decide: ask, never guess', chain: steps };
}

/** Criteria whose "yes" is a fault (evals' calibration treats them the same way). */
export const FAULT_CRITERIA = new Set(['answer.unsupported', 'history.presentism']);
/**
 * The runtime judge (V8): the narrow yes/no criterion judge evals calibrated (byte-identical prompt, the deep setting at
 * medium). criterion: { id, question }; items: [{ id, question?, reference?, answer }] (for an entailment criterion,
 * `claim` and `passage`). → [{ id, ok (true: the criterion is met and, for a fault criterion, the fault is absent), verdict, confidence, why }].
 */
export async function judgeCriterion(criterion, items, { providers }) {
  if (!items.length) return [];
  const r = await Promise.resolve().then(() => providers.studyWriter.narrow({ criterion, items })).catch(() => null); // unavailable: no verdict, never a guess
  const verdicts = r?.outcome === 'ok' ? r.value.verdicts : [];
  return items.map(x => { const v = verdicts.find(y => y.id === x.id); if (!v) return { id: x.id, ok: null, verdict: null, confidence: 0, why: r?.outcome === 'ok' ? 'not judged' : 'the judge was unavailable' };
    const yes = v.verdict === 'yes'; return { id: x.id, ok: FAULT_CRITERIA.has(criterion.id) ? !yes : yes, verdict: v.verdict, confidence: v.confidence, why: `${criterion.id}: ${v.verdict}` }; });
}
