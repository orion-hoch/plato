// The understanding suite: does the tutor understand a course well enough to teach it, and does it teach from that
// understanding? Domain-agnostic: each course is a fixture (fixtures/<name>/). Levels 1–3, one scoreboard. See README.md.
//   node evals/understanding/run.mjs [--fixture cs3410|linalg|bio|history] --level 1|2|3|all|teach [--against baseline|studies|model|notes|both]
//        [--topics <file.json>|<id,id>] [--run <id>] [--freeze [probes|specific|audit|course|baselines|all]] [--recheck]
//        [--build-fixture] [--build-studies] [--import-studies <db>] [--calibrate] [--rubric v1|v2] [--compare] [--gates] [--checklist] [--init-topics] [--fresh-sandbox]
// Everything runs on a cached sandbox copy of data/ (cache/sandbox); live sessions on a second server (port 5199).
import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { processMetrics, processSummary } from './lib.mjs';
import { ask, CACHE, kappa, clip, closeRuntime, copiedRuns, copySandbox, courseText, each, examIdOf, fix, FROZEN, FX, gate, loadFixture, getRuntime, gramsOf, hash, HERE, mean, notesIndex, openApp, paraphrase, pct, pool, readJson, regurgitation, repForModel, representation, ROOT, runCheck, runOnly, SANDBOX, sameValue, sandbox, sandboxDir, statedIn, scoreboard, settingOf, studyRep, textOf, topicMaterial, freezeBaselines, writeJson } from './lib.mjs';
import * as P from './prompts.mjs';

const argv = process.argv.slice(2), has = f => argv.includes(f), opt = (f, d = null) => has(f) ? argv[argv.indexOf(f) + 1] : d;
const level = opt('--level', 'all'), against = opt('--against', 'baseline'), fixture = opt('--fixture', 'cs3410');
const RUBRIC = opt('--rubric', 'v2'); // plato-move-rubric v2 (reading moves count; v1 stays frozen for comparison)
if (!['1', '2', '3', 'all', 'teach', 'precision', 'repair'].includes(level) || !['baseline', 'studies', 'model', 'notes', 'both'].includes(against) || (['model', 'notes'].includes(against) && !['1', 'teach', 'repair'].includes(level)) || (against === 'both' && !['teach', 'repair'].includes(level)) || (['teach', 'repair'].includes(level) && against === 'baseline') || (level === 'precision' && against !== 'studies')) { console.error('usage: node evals/understanding/run.mjs --level 1|2|3|all [--against baseline|studies, or model|notes for level 1] [--topics file|ids] [--students ids] [--turns N] [--run id] [--freeze] [--build-studies] [--fresh-sandbox]'); process.exit(2); }
const runId = opt('--run') || `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${fixture}-L${level}-${against}`;
const RUN = path.join(HERE, 'runs', runId);
const log = (...x) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...x);

async function loadTopics() {
  const all = (await readJson(path.join(FX.dir, 'topics.json'))).topics, t = opt('--topics');
  if (!t) return all;
  if (t.endsWith('.json')) return (await readJson(path.resolve(t))).topics;
  return t.split(',').map(id => all.find(x => x.topicId === id || x.title === id) ?? { topicId: id, title: id });
}

// ---------- the frozen probes and wrong-model bank (generated once per topic, checked by running, never regenerated) ----------
async function frozenFor(app, topic, titles) {
  const file = path.join(FX.frozen, 'probes', `${topic.topicId}.json`), kept = await readJson(file, null);
  if (kept) return kept;
  const m = topicMaterial(app, topic.topicId), known = await catalogued();
  log(`generating probes for ${m.title} (deep setting, high effort)…`);
  const json = await ask({ key: `gen-${P.PROBES_VERSION}-${topic.topicId}`, role: 'heavy', instructions: P.PROBES(FX.checks), input: { course: FX.course, topic: { title: m.title, unit: topic.unit ?? null }, notes: m.text, otherTopics: titles, knownMisconceptions: known }, schema: P.PROBES_SCHEMA, timeoutMs: 1_200_000 });
  // Each buggy rule is run: it must print the wrong answer it claims, and that answer must differ from the right one.
  for (const w of json.wrongModels) {
    const c = w.produces.check;
    if (c.kind === 'none') { w.verified = 'model'; continue; }
    try { const ran = await runCheck(c); w.ran = ran; w.verified = (sameValue(ran, w.produces.wrongAnswer) || statedIn(ran, w.produces.wrongAnswer)) && !sameValue(w.produces.wrongAnswer, w.produces.rightAnswer) ? 'run' : 'mismatch'; }
    catch (error) { w.verified = 'model'; w.checkFailed = clip(error.message, 160); }
  }
  const probes = [], dropped = [];
  for (const p of json.probes) { const r = await checkProbe({ ...p, family: 'held_out' }); (r.keep ? probes : dropped).push(r.probe); }
  const frozen = { topicId: topic.topicId, title: m.title, unit: topic.unit ?? null, version: P.PROBES_VERSION, generatedAt: new Date().toISOString(), setting: await settingOf('heavy'), notesHash: hash(m.text), cataloguedHash: hash(known), wrongModels: json.wrongModels, probes, dropped };
  await writeJson(file, frozen);
  log(`  ${m.title}: ${probes.length} probes kept (${probes.filter(p => p.checked === 'run').length} checked by running), ${dropped.length} dropped; ${json.wrongModels.length} wrong models (${json.wrongModels.filter(w => w.verified === 'run').length} buggy rules confirmed by running, ${json.wrongModels.filter(w => w.verified === 'mismatch').length} mismatched)`);
  return frozen;
}
/**
 * A probe's check: run, it must print what the check expects and what the reference answer states (the run is the
 * truth: a disagreement drops the probe). A trace probe needs a check that runs; any other keeps the model's answer.
 */
async function checkProbe(p) {
  const c = p.check;
  if (!c || c.kind === 'none') return p.kind === 'trace' ? { keep: false, probe: { ...p, checked: 'model', why: 'a trace probe without a check' } } : { keep: true, probe: { ...p, checked: 'model' } };
  try {
    const ran = await runCheck(c);
    if (sameValue(ran, c.expect ?? '') && statedIn(ran, p.answer)) return { keep: true, probe: { ...p, checked: 'run', ran } };
    return { keep: false, probe: { ...p, ran, why: `the check printed ${clip(ran, 60)}; the probe expected ${clip(c.expect, 60)}` } };
  } catch (error) { return p.kind === 'trace' ? { keep: false, probe: { ...p, why: `check did not run: ${clip(error.message, 160)}` } } : { keep: true, probe: { ...p, checked: 'model', why: `check did not run: ${clip(error.message, 160)}` } }; }
}

/** The course-specific probes of a topic (fixtures/<f>/frozen/specific/<topicId>.json): what only this course's material knows. */
async function specificFor(app, topic) {
  const file = path.join(FX.frozen, 'specific', `${topic.topicId}.json`), kept = await readJson(file, null);
  if (kept) return kept;
  const m = topicMaterial(app, topic.topicId), titles = app.services.knowledge.view(app.scope, app.km).topics.map(t => t.title);
  log(`writing course-specific probes for ${m.title} (deep setting, high effort)…`);
  const json = await ask({ key: `specific-${P.SPECIFIC_VERSION}-${topic.topicId}`, role: 'heavy', instructions: P.SPECIFIC, schema: P.SPECIFIC_SCHEMA, input: { course: FX.course, topic: { title: m.title, unit: topic.unit ?? null }, notes: m.text, otherTopics: titles }, timeoutMs: 1_200_000 });
  const out = { topicId: topic.topicId, title: m.title, version: P.SPECIFIC_VERSION, generatedAt: new Date().toISOString(), setting: await settingOf('heavy'), notesHash: hash(m.text), probes: json.probes.map(p => ({ ...p, family: 'specific', checked: 'model' })) };
  await writeJson(file, out);
  log(`  ${m.title}: ${out.probes.length} course-specific probes (${[...new Set(out.probes.map(p => p.kind))].join(', ')})`);
  return out;
}

/**
 * The notes audit of a topic (frozen/audit/<topicId>.json). Every computable claim in its notes is checked by a program
 * that computes it independently; a claim the program disagrees with goes to a second, independent judgment with its
 * own program, and only an error both confirm becomes a regurgitation trap: a probe whose truth the notes get wrong,
 * which a tutor that repeats the notes fails. The notes' own questions to the reader become instructor probes.
 */
async function auditFor(app, topic) {
  const file = path.join(FX.frozen, 'audit', `${topic.topicId}.json`), kept = await readJson(file, null);
  if (kept) return kept;
  const m = topicMaterial(app, topic.topicId);
  log(`auditing the notes of ${m.title} (deep setting, high effort)…`);
  const json = await ask({ key: `audit-${P.AUDIT_VERSION}-${topic.topicId}`, role: 'heavy', instructions: P.AUDIT(FX.checks), schema: P.AUDIT_SCHEMA, input: { course: FX.course, topic: { title: m.title, unit: topic.unit ?? null }, notes: m.text }, timeoutMs: 1_200_000 });
  const claims = [];
  for (const c of json.claims) {
    if (c.check.kind === 'none') { claims.push({ ...c, status: 'unchecked' }); continue; }
    try { const ran = await runCheck(c.check); claims.push({ ...c, ran, status: sameValue(ran, c.claim) || statedIn(ran, c.claim) ? 'agrees' : 'disagrees' }); }
    catch (error) { claims.push({ ...c, status: 'check_failed', why: clip(error.message, 160) }); }
  }
  const errata = [];
  for (const c of claims.filter(x => x.status === 'disagrees')) {
    const v = await ask({ key: `erratum-${P.ERRATUM_VERSION}-${topic.topicId}-${hash(c.quote)}`, role: 'heavy', instructions: P.ERRATUM(FX.checks), schema: P.ERRATUM_SCHEMA, input: { course: FX.course, notes: m.text, quote: c.quote, notesClaim: c.claim, independentOutput: c.ran } });
    let ran2 = null;
    try { ran2 = v.check.kind === 'none' ? null : await runCheck(v.check); } catch { ran2 = null; }
    const verified = v.verdict === 'notes_wrong' && ran2 != null && sameValue(ran2, c.ran) && !sameValue(ran2, c.claim) && !!v.probe && statedIn(ran2, v.probe.answer);
    c.erratum = { verdict: v.verdict, why: v.why, truth: v.truth, ran2, verified };
    if (verified) errata.push({ quote: c.quote, notesSay: c.claim, truth: c.ran, why: v.why, probe: v.probe });
  }
  const probes = errata.map((e, i) => ({ id: `t${i + 1}`, family: 'trap', kind: 'trap', prompt: e.probe.prompt, answer: e.probe.answer, keyPoints: e.probe.keyPoints, notesAnswer: e.probe.notesAnswer, erratum: e.quote, checked: 'run', ran: e.truth })), dropped = [];
  for (const [i, q] of json.questions.entries()) { const r = await checkProbe({ ...q, id: `q${i + 1}`, family: 'instructor' }); (r.keep ? probes : dropped).push(r.probe); }
  const audit = { topicId: topic.topicId, title: m.title, version: P.AUDIT_VERSION, generatedAt: new Date().toISOString(), setting: await settingOf('heavy'), notesHash: hash(m.text), claims, errata: errata.map(({ probe, ...e }) => e), probes, dropped };
  await writeJson(file, audit);
  log(`  ${m.title}: ${claims.length} claims (${claims.filter(c => c.status === 'agrees').length} agree when run, ${claims.filter(c => c.status === 'disagrees').length} disagree), ${errata.length} verified errata → traps; ${probes.filter(p => p.family === 'instructor').length} instructor questions (${probes.filter(p => p.family === 'instructor' && !p.answeredInNotes).length} not answered in the notes)`);
  return audit;
}

/** The course-level probes (fixtures/<f>/frozen/course-probes.json): integrative problems across topics, and spine diagnosis. */
async function courseProbes(app, topics) {
  const file = path.join(FX.frozen, 'course-probes.json'), kept = await readJson(file, null);
  if (kept) return kept;
  log(`writing course-level probes over ${topics.length} topics (deep setting, high effort)…`);
  const ids = new Set(topics.map(t => t.topicId));
  const json = await ask({ key: `course-${P.COURSE_VERSION}-${hash([...ids].sort())}`, role: 'heavy', instructions: P.COURSE(FX.checks), schema: P.COURSE_SCHEMA, timeoutMs: 1_500_000,
    input: { course: FX.course, topics: topics.map(t => ({ topicId: t.topicId, title: t.title, unit: t.unit ?? null, notes: clip(topicMaterial(app, t.topicId, 2500).text, 9000) })), spine: FX.spine ?? [] } });
  const probes = [], dropped = [];
  for (const p of json.integrative) {
    const topicIds = p.topicIds.filter(id => ids.has(id));
    if (topicIds.length < 2) { dropped.push({ ...p, why: 'fewer than two of the frozen topics' }); continue; }
    const r = await checkProbe({ ...p, topicIds, family: 'integrative' }); (r.keep ? probes : dropped).push(r.probe);
  }
  for (const p of json.spine) {
    const topicIds = p.topicIds.filter(id => ids.has(id));
    (topicIds.length ? probes : dropped).push({ ...p, topicIds, family: 'spine', kind: 'spine', prompt: 'Name the wrong model behind this student\'s answer, and the move that would repair it.', checked: 'model', ...(topicIds.length ? {} : { why: 'not on a frozen topic' }) });
  }
  const out = { version: P.COURSE_VERSION, generatedAt: new Date().toISOString(), setting: await settingOf('heavy'), topicIds: [...ids], spine: FX.spine ?? [], probes, dropped };
  await writeJson(file, out);
  log(`  course: ${probes.filter(p => p.family === 'integrative').length} integrative (${probes.filter(p => p.checked === 'run').length} checked by running), ${probes.filter(p => p.family === 'spine').length} spine; ${dropped.length} dropped`);
  return out;
}

/** The misconceptions research has catalogued for this fixture's subject (fixture.catalogued: a file and the section between two markers), or "". */
async function catalogued() {
  const c = FX.catalogued;
  if (!c) return '';
  const doc = await readFile(path.join(ROOT, c.file), 'utf8').catch(() => '');
  const at = doc.indexOf(c.from), end = at < 0 ? -1 : doc.indexOf(c.to, at);
  return at < 0 ? '' : doc.slice(at, end < 0 ? undefined : end).trim();
}
async function freezeAll(app, topics) {
  const titles = app.services.knowledge.view(app.scope, app.km).topics.map(t => t.title);
  return each(topics, t => frozenFor(app, t, titles));
}

// ---------- level 1: understanding, per topic, no student ----------
const scored = (p, g) => ({ id: p.id, family: p.family ?? 'held_out', kind: p.kind, correct: g?.correct ?? 0, supported: !!g?.supported, why: g?.why ?? null, namedModel: g?.namedModel ?? null, repair: g?.repair ?? null, trapped: g?.trapped ?? null, answeredInNotes: p.answeredInNotes ?? null });
const share = xs => mean(xs.map(x => x ? 1 : 0));
function level1Metrics(rows) {
  const all = rows.flatMap(r => r.items || []), items = all.filter(i => i.family === 'held_out'), regs = rows.filter(r => r.regurgitation);
  const fam = f => all.filter(i => i.family === f), diag = items.filter(i => i.kind === 'diagnose');
  return {
    topics: rows.filter(r => r.items && !r.course).length, probes: items.length,
    understanding: mean(items.map(i => i.correct * (i.supported ? 1 : 0))), accuracy: mean(items.map(i => i.correct)),
    why: mean(items.filter(i => i.why != null).map(i => i.why / 2)), diagnosis: mean(diag.map(i => ((i.namedModel ? 1 : 0) + (i.repair ? 1 : 0)) / 2)),
    covered: mean(rows.flatMap(r => (r.answers || []).map(a => a.covered ? 1 : 0))),
    regurgitation: regs.length ? regs.reduce((n, r) => n + r.regurgitation.copied, 0) / (regs.reduce((n, r) => n + r.regurgitation.words, 0) || 1) : null,
    paraphrase: regs.length ? regs.reduce((n, r) => n + (r.paraphrase?.close ?? 0), 0) / (regs.reduce((n, r) => n + (r.paraphrase?.words ?? 0), 0) || 1) : null,
    groundingErrors: rows.reduce((n, r) => n + (r.grounding || []).filter(e => e.severity === 'error').length, 0), groundingMinor: rows.reduce((n, r) => n + (r.grounding || []).filter(e => e.severity === 'minor').length, 0), groundingFlagged: rows.reduce((n, r) => n + (r.grounding || []).filter(e => e.severity === 'flagged').length, 0),
    claimPrecision: rows.some(r => r.claims) ? 1 - rows.reduce((n, r) => n + (r.grounding || []).filter(e => e.severity === 'error').length, 0) / (rows.reduce((n, r) => n + (r.claims || 0), 0) || 1) : null,
    byKind: Object.fromEntries([...new Set(items.map(i => i.kind))].map(k => [k, +mean(items.filter(i => i.kind === k).map(i => i.correct)).toFixed(2)])),
    families: {
      specific: { n: fam('specific').length, accuracy: mean(fam('specific').map(i => i.correct)), understanding: mean(fam('specific').map(i => i.correct * (i.supported ? 1 : 0))), byKind: Object.fromEntries([...new Set(fam('specific').map(i => i.kind))].map(k => [k, +mean(fam('specific').filter(i => i.kind === k).map(i => i.correct)).toFixed(2)])) },
      trap: { n: fam('trap').length, accuracy: mean(fam('trap').map(i => i.correct)), trapped: share(fam('trap').map(i => i.trapped)) },
      instructor: { n: fam('instructor').length, accuracy: mean(fam('instructor').map(i => i.correct)), notInNotes: mean(fam('instructor').filter(i => i.answeredInNotes === false).map(i => i.correct)) },
      integrative: { n: fam('integrative').length, understanding: mean(fam('integrative').map(i => i.correct * (i.supported ? 1 : 0))), accuracy: mean(fam('integrative').map(i => i.correct)) },
      spine: { n: fam('spine').length, root: share(fam('spine').map(i => i.namedModel)), repair: share(fam('spine').map(i => i.repair)) },
    },
  };
}
const asked = p => ({ id: p.id, kind: p.kind === 'trap' ? 'trace' : p.kind, prompt: p.prompt, studentAnswer: p.studentAnswer ?? null, options: p.options ?? [] }); // a trap looks like any question
const reference = p => ({ id: p.id, kind: p.kind, prompt: p.prompt, studentAnswer: p.studentAnswer ?? null, reference: p.answer, keyPoints: p.keyPoints, checkedBy: p.checked, ...(p.notesAnswer ? { notesAnswer: p.notesAnswer } : {}), ...(p.surface ? { surface: p.surface } : {}) });
/** Answers `probes` from `given` alone (the director's setting), then grades them (the deep setting at medium). */
async function answerAndGrade(key, given, probes) {
  // The answerer is the director's setting (the deep model at the director's effort): the mind that teaches from it.
  const { answers } = await ask({ key: `${key}-answer`, role: 'director', instructions: against === 'model' ? P.ANSWER_OPEN : P.ANSWER, schema: P.ANSWER_SCHEMA, input: { representation: given, questions: probes.map(asked) } });
  const { grades } = await ask({ key: `${key}-grade`, role: 'heavy', effort: 'medium', instructions: P.GRADE, schema: P.GRADE_SCHEMA, input: { representation: given, questions: probes.map(reference), answers } });
  const byId = new Map(grades.map(g => [g.id, g]));
  return { answers, grades, items: probes.map(p => scored(p, byId.get(p.id))) };
}
async function level1(app, topics, { grams, index }) {
  log(`level 1 against ${against}: ${topics.length} topics`);
  // Audits (traps, the instructor's questions) and course-level probes join only once frozen (--freeze audit|course): a level run never generates them.
  const frozen = await freezeAll(app, topics), audits = await Promise.all(topics.map(t => readJson(path.join(FX.frozen, 'audit', `${t.topicId}.json`), { probes: [], errata: [] })));
  const specifics = await each(topics, t => specificFor(app, t)); // course-specific probes are part of the frozen set (generated on first use)
  const course = await readJson(path.join(FX.frozen, 'course-probes.json'), { probes: [] });
  if (against === 'baseline') await freezeBaselines(app, topics.map(t => t.topicId));
  const rows = await each(topics, async (t, k) => {
    const file = path.join(RUN, 'level1', `${t.topicId}.json`), done = await readJson(file, null);
    if (done) return done;
    const f = frozen[k], audit = audits[k];
    if (f.error) return { topicId: t.topicId, title: t.title, skipped: `no probes: ${f.error}` };
    const rep = await representation(app, t.topicId, against);
    if (!rep) return { topicId: t.topicId, title: t.title, skipped: against === 'studies' ? 'no Study for this topic yet' : 'no baseline frozen' };
    const given = repForModel(rep), m = topicMaterial(app, t.topicId), probes = [...f.probes, ...(specifics[k].probes || []), ...audit.probes];
    // Grounding and regurgitation measure a representation: the model alone and the notes themselves have none to measure.
    const own = !['model', 'notes'].includes(against);
    const [graded, ground] = await Promise.all([
      answerAndGrade(`${runId}-l1-${t.topicId}`, given, probes),
      own ? ask({ key: `${runId}-l1-ground-${t.topicId}`, role: 'heavy', effort: 'medium', instructions: P.GROUNDING, schema: P.GROUNDING_SCHEMA, input: { notes: m.text, errata: audit.errata, flagged: [...(given.study?.conflicts || []), ...(given.study?.simplifications || [])], representation: given } }) : null,
    ]);
    const text = textOf(given), reg = own ? regurgitation(text, grams) : null, para = own ? paraphrase(text, index) : null;
    const row = { topicId: t.topicId, title: t.title, rep: rep.kind, repMeta: rep.meta ?? null, ...graded, grounding: ground?.errors ?? null, claims: ground?.claims ?? null, regurgitation: reg && { ...reg, runs: copiedRuns(text, grams) }, paraphrase: para };
    row.metrics = level1Metrics([row]);
    await writeJson(file, row);
    log(`  ${t.title}: understanding ${pct(row.metrics.understanding)}, accuracy ${pct(row.metrics.accuracy)}${reg ? `, regurgitation ${pct(reg.rate)} (close paraphrase ${pct(para.rate)}), grounding errors ${row.metrics.groundingErrors}` : ''}`);
    return row;
  });
  // Course-level probes, answered from the representations of all the topics each one needs.
  const groups = new Map();
  for (const p of course.probes || []) { const key = [...p.topicIds].sort().join('+'); groups.set(key, [...(groups.get(key) || []), p]); }
  const courseRows = await each([...groups.entries()], async ([key, probes]) => {
    const file = path.join(RUN, 'level1', `course-${hash(key)}.json`), done = await readJson(file, null);
    if (done) return done;
    const reps = await Promise.all(probes[0].topicIds.map(id => representation(app, id, against)));
    if (reps.some(r => !r)) return { course: true, topicIds: probes[0].topicIds, skipped: 'a topic has no representation' };
    const row = { course: true, topicIds: probes[0].topicIds, ...await answerAndGrade(`${runId}-l1-course-${hash(key)}`, { topics: reps.map(repForModel) }, probes) };
    await writeJson(file, row);
    return row;
  });
  const metrics = level1Metrics([...rows, ...courseRows]), F = metrics.families;
  const failures = rows.flatMap(r => (r.grades || []).filter(g => g.correct === 0).map(g => ({ topic: r.title, id: g.id, kind: r.items.find(i => i.id === g.id)?.kind, family: r.items.find(i => i.id === g.id)?.family, note: g.note }))).slice(0, 15);
  await writeJson(path.join(RUN, 'level1', 'summary.json'), { metrics, failures, perTopic: rows.map(r => ({ title: r.title, skipped: r.skipped, ...r.metrics })) });
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, level: '1 understanding', against,
    prompts: `${P.PROBES_VERSION} + ${P.SPECIFIC_VERSION} + ${P.AUDIT_VERSION} + ${P.COURSE_VERSION}, ${P.ANSWER_VERSION} (${await settingOf('director')}), ${P.GRADE_VERSION} + ${P.GROUNDING_VERSION} (${await settingOf('heavy', 'medium')})`,
    metrics: `understanding ${pct(metrics.understanding)} · accuracy ${pct(metrics.accuracy)} · why ${pct(metrics.why)} · diagnosis ${pct(metrics.diagnosis)} · covered ${pct(metrics.covered)} · regurgitation ${pct(metrics.regurgitation)} (close paraphrase ${pct(metrics.paraphrase)}) · grounding errors ${metrics.groundingErrors} (+${metrics.groundingMinor} minor, ${metrics.groundingFlagged} flagged corrections), claim precision ${pct(metrics.claimPrecision)} · ${metrics.probes} held-out probes / ${metrics.topics} topics · course-specific ${pct(F.specific.accuracy)} (${F.specific.n}) · traps ${F.trap.n ? `${pct(F.trap.accuracy)} right, errata reproduced ${pct(F.trap.trapped)} (${F.trap.n})` : 'none verified'} · instructor ${pct(F.instructor.accuracy)} (${F.instructor.n}; not in notes ${pct(F.instructor.notInNotes)}) · integrative ${pct(F.integrative.understanding)} (${F.integrative.n}) · spine root ${pct(F.spine.root)}, repair ${pct(F.spine.repair)} (${F.spine.n})${rows.some(r => r.skipped) ? ` · skipped ${rows.filter(r => r.skipped).length}` : ''}` });
  return { metrics, failures };
}

// ---------- teaching probes (teaching.mjs): the course model's value is teaching, not knowing (the lead, 2026-10-08) ----------
// The same probes answered by the director's setting from (model) nothing, (notes) the topic's notes, (studies) the topic's
// course-model slice, or (both) half of each, every condition clipped to the same budget the director has in real time.
// Ground truth from the library's executable detectors where they exist (T2 values, T3 letters, T1's error kind), else a
// frozen key-point rubric graded by the deep setting at medium. Gate: studies ≥ notes + 10 points on the probes both answered.
function cmSlice(app, topicId) {
  const cm = (() => { try { return app.services.understanding?.courseModel?.(app.scope) ?? null; } catch { return null; } })(), topic = cm?.topics?.find(t => t.topicId === topicId);
  if (!topic) return null;
  const pick = k => (cm[k] || []).filter(x => x.topicId === topicId).map(({ quality, log, ...x }) => x);
  // In teaching order, so a clip drops the least useful parts last.
  return { topic, kcs: pick('kcs'), wrongModels: pick('wrongModels'), explanations: pick('explanations'), representations: pick('representations'), readings: pick('readings'), cases: pick('cases'), models: pick('models'), procedures: pick('procedures'), conflicts: pick('conflicts'), simplifications: pick('simplifications'), problems: pick('problems'), probes: pick('probes') };
}
async function teaching(app) {
  // --set course: the course-specific set (TC1, TC2), built from the frozen probe files' course-mined wrong models.
  const T = await import('./teaching.mjs'), lib = await import(path.join(FX.dir, 'beliefs.mjs')), course = opt('--set') === 'course', file = path.join(FX.frozen, course ? 'teaching-course.json' : 'teaching.json');
  let set = await readJson(file, null);
  if (!set && course) { const dir = path.join(FX.frozen, 'probes'), files = existsSync(dir) ? await Promise.all((await readdir(dir)).filter(f => f.endsWith('.json')).map(async f => ({ topicId: f.replace(/\.json$/, ''), ...(await readJson(path.join(dir, f))) }))) : [];
    set = { version: T.COURSE_TEACHING_VERSION, builtAt: new Date().toISOString(), why: 'Built in code from the frozen probe files\' wrong models with provenance "course" (mined from the notes\' own warnings and worked examples; their wrong answers run where computable): diagnose among four beliefs (TC1), predict the belief\'s answer (TC2).', probes: T.buildCourseTeaching(files) }; await writeJson(file, set); }
  if (!set) { set = { version: T.TEACHING_VERSION, builtAt: new Date().toISOString(), why: 'Generated in code from the fixture\'s belief library (teaching.mjs, seed 7), then frozen: diagnose (T1), predict a misconception\'s answer (T2), choose the separating question (T3), design a repair by error kind (T4), choose a reading or element for a learner state (T5).', probes: T.buildTeaching(lib) }; await writeJson(file, set); }
  const budget = T.BUDGET_CHARS, cache = new Map();
  log(`teaching probes against ${against}: ${set.probes.length} probes, material ≤ ${budget} characters per condition`);
  const notesOf = (topicId, n) => clip(topicMaterial(app, topicId, Math.ceil(n / 3)).text, n);
  const sliceOf = (topicId, n) => { const x = cmSlice(app, topicId); return x ? clip(JSON.stringify(x), n) : null; };
  const materialFor = topicId => {
    if (!cache.has(topicId)) cache.set(topicId, against === 'model' ? '' : against === 'notes' ? notesOf(topicId, budget) : against === 'studies' ? sliceOf(topicId, budget)
      : (() => { const m = sliceOf(topicId, budget / 2); return m === null ? null : `# The course's notes\n${notesOf(topicId, budget / 2)}\n\n# The course model\n${m}`; })());
    return cache.get(topicId);
  };
  const rows = await each(set.probes, async p => {
    const topicId = p.topicId ?? lib.concepts.find(c => c.id === p.concept)?.topicId ?? null, m = topicId ? materialFor(topicId) : null;
    if (m === null) return { id: p.id, kind: p.kind, concept: p.concept, skipped: topicId ? 'no course model for this topic yet' : 'the concept has no topicId' };
    const { answer } = await ask({ key: `teach-${FX.name}-${against}-${p.id}`, role: 'director', instructions: P.TEACH_ANSWER, schema: P.TEACH_ANSWER_SCHEMA, input: { course: FX.course, material: m || null, task: p.prompt } });
    let score = T.gradeInCode(p, answer, { sameValue, statedIn }), points = null;
    if (score === null) {
      const g = await ask({ key: `teach-grade-${FX.name}-${against}-${p.id}`, role: 'heavy', effort: 'medium', instructions: P.TEACH_GRADE, schema: P.TEACH_GRADE_SCHEMA, input: { question: p.prompt, reference: p.answer, keyPoints: p.kind === 'T1' ? [p.keyPoints[0]] : p.keyPoints, answer } });
      points = g.points; const judged = mean(g.points.map(x => x.met ? 1 : 0)) ?? 0;
      score = p.kind === 'T1' ? (judged + T.errorKindNamed(p, answer)) / 2 : judged; // T1: the belief (judged) and its error kind (code: the kind 1, its group 0.5), half each
    }
    return { id: p.id, kind: p.kind, concept: p.concept, score, answer: clip(answer, 1200), points };
  });
  const done = rows.filter(r => !r.skipped), byKind = Object.fromEntries((course ? ['TC1', 'TC2'] : ['T1', 'T2', 'T3', 'T4', 'T5']).map(k => [k, mean(done.filter(r => r.kind === k).map(r => r.score))]));
  const metrics = { set: course ? 'course' : 'catalogued', accuracy: mean(done.map(r => r.score)), byKind, n: done.length, skipped: rows.length - done.length, budget, scores: Object.fromEntries(done.map(r => [r.id, +r.score.toFixed(3)])) };
  await writeJson(path.join(RUN, 'teaching', `${course ? 'course-' : ''}${against}.json`), { metrics, rows });
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, level: 'teaching probes', against,
    prompts: `${T.TEACHING_VERSION}, ${P.TEACH_ANSWER_VERSION} (${await settingOf('director')}), ${P.TEACH_GRADE_VERSION} (${await settingOf('heavy', 'medium')}), ≤ ${budget} chars`,
    metrics: `accuracy ${pct(metrics.accuracy)} · ${Object.entries(byKind).map(([k, v]) => `${k} ${pct(v)}`).join(' ')} · ${metrics.n} probes${metrics.skipped ? ` (${metrics.skipped} skipped: no course model yet)` : ''}` });
  log(`teaching against ${against}: accuracy ${pct(metrics.accuracy)} · ${Object.entries(byKind).map(([k, v]) => `${k} ${pct(v)}`).join(' ')} · n ${metrics.n}, skipped ${metrics.skipped}`);
  return { metrics };
}

/** The verifier's two paths (the lead's ruling, spec §17 amendment after decisive1's phase 1): the deterministic path (keys,
 *  executed checks: every verifier but the judge) must be fast; the judge (V8) runs asynchronously and must never block a move. */
function pathLatency(rows) {
  const p95 = xs => { const v = xs.sort((a, b) => a - b); return v.length ? Math.round(v[Math.min(v.length - 1, Math.floor(v.length * 0.95))]) : null; };
  const runs = rows.flatMap(r => r.runs || []);
  return { deterministicP95: p95(runs.filter(x => x.by && x.by !== 'V8').map(x => x.ms)), judgeP95: p95(runs.filter(x => x.by === 'V8').map(x => x.ms)), judgeShare: runs.length ? runs.filter(x => x.by === 'V8').length / runs.length : null };
}

// ---------- runtime precision (the lead's gate (b), 2026-10-08): the course model's verifiers on computable items ----------
// Every computable item of the course model (checked by js, c, riscv or a family program), answered with its right answer
// (the values only, as a student writes them) and with each wrong answer its own detectors compute, through
// understanding.verify three times each: the share decided with no model call, verdict accuracy, the wrong model named,
// consistency across the three runs, and the latency of a verdict (p50, p95).
async function precision(app) {
  const U = app.services.understanding, cm = (() => { try { return U?.courseModel?.(app.scope); } catch { return null; } })();
  if (!U?.verify || !cm) { log('no course model in this sandbox: nothing to measure'); return { metrics: null }; }
  const items = [...cm.problems, ...cm.probes].filter(x => x.verification?.ok === true && ['js', 'c', 'riscv', 'family'].includes(x.verification?.by) && x.answer != null);
  const valuesOnly = a => { const s = String(a).trim(), first = s.split(/(?<=\S)\.\s+(?=[A-Z])/)[0]; return first.length < s.length && /\d/.test(first) ? first : s; };
  const cases = items.flatMap(x => [{ item: x, answer: valuesOnly(x.answer), truth: 'correct', model: null }, ...Object.entries(x.wrongAnswers || {}).map(([w, a]) => ({ item: x, answer: String(a), truth: 'incorrect', model: w }))]);
  log(`runtime precision: ${items.length} computable items, ${cases.length} answers × 3 runs`);
  const rows = await each(cases, async c => {
    const runs = [];
    for (let k = 0; k < 3; k++) { const t0 = performance.now(); try { const r = await U.verify(app.scope, { itemId: c.item.id, answer: c.answer }); runs.push({ verdict: r.verdict, trust: r.trust ?? null, by: r.provenance?.by ?? null, ms: performance.now() - t0, hits: (r.wrongModelHits || []).map(h => h.id) }); } catch (e) { runs.push({ verdict: 'error', by: null, ms: performance.now() - t0, hits: [], error: e.message }); } }
    const right = v => c.truth === 'correct' ? ['correct', 'valid_nonstandard'].includes(v) : v === 'incorrect';
    for (const x of runs) x.right = right(x.verdict);
    return { id: c.item.id, truth: c.truth, model: c.model, answer: clip(c.answer, 200), runs, accurate: share(runs.map(r => right(r.verdict))), noModel: share(runs.map(r => r.by && r.by !== 'V8' && r.verdict !== 'uncertain')), named: c.model ? share(runs.map(r => r.hits.includes(c.model))) : null, consistent: new Set(runs.map(r => r.verdict)).size === 1 };
  });
  const ms = rows.flatMap(r => r.runs.map(x => x.ms)).sort((a, b) => a - b), q = f => ms.length ? Math.round(ms[Math.min(ms.length - 1, Math.floor(ms.length * f))]) : null;
  const paths = pathLatency(rows);
  // One learner at a time (the lead's second amendment to L1.runtime, spec §17, made after a failing concurrent reading:
  // the 2 s bar is what one learner waits): each answer the deterministic path decided,
  // verified once more in sequence with nothing else running. The concurrent p95 above stays as a stress number.
  const alone = [];
  for (const [i, c] of cases.entries()) if (rows[i]?.runs?.every(x => x.by && x.by !== 'V8')) { const t0 = performance.now(); await U.verify(app.scope, { itemId: c.item.id, answer: c.answer }).catch(() => null); alone.push(performance.now() - t0); }
  alone.sort((a, b) => a - b); paths.deterministicP95Alone = alone.length ? Math.round(alone[Math.min(alone.length - 1, Math.floor(alone.length * 0.95))]) : null;
  // The lead's thresholds: trust-1 verdicts (the engine acts on them without hedging) must be right ≥ 0.995; decided verdicts
  // ≥ 0.97 with "uncertain" an abstention (≤ 5%), not an error.
  const all = rows.flatMap(r => r.runs.map(x => ({ ...x, id: r.id, truth: r.truth, answer: r.answer }))), decided = all.filter(x => x.verdict !== 'uncertain' && x.verdict !== 'error'), sure = decided.filter(x => (x.trust ?? 0) >= 1);
  const trust1Errors = sure.filter(x => !x.right).map(x => `${x.id} (${x.truth}: "${clip(x.answer, 60)}" → ${x.verdict} by ${x.by})`);
  const metrics = { items: items.length, answers: rows.length, accuracy: mean(rows.map(r => r.accurate)), decidedAccuracy: share(decided.map(x => x.right)), abstention: share(all.map(x => x.verdict === 'uncertain')), trust1Accuracy: share(sure.map(x => x.right)), trust1: sure.length, trust1Errors: [...new Set(trust1Errors)], noModelShare: mean(rows.map(r => r.noModel)), wrongModelNamed: mean(rows.filter(r => r.named != null).map(r => r.named)), consistency: share(rows.map(r => r.consistent)), latencyP50: q(0.5), latencyP95: q(0.95), ...paths,
    byVerifier: rows.flatMap(r => r.runs).reduce((o, r) => ({ ...o, [r.by ?? 'none']: (o[r.by ?? 'none'] || 0) + 1 }), {}), errors: rows.flatMap(r => r.runs).filter(r => r.verdict === 'error').length };
  await writeJson(path.join(RUN, 'precision', 'summary.json'), { metrics, rows });
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, level: 'runtime precision', against: 'studies', prompts: 'understanding.verify (the course model\'s verifier chain); no prompt of this suite',
    metrics: `verdict accuracy ${pct(metrics.accuracy)} · trust-1 accuracy ${pct(metrics.trust1Accuracy)} (${metrics.trust1} verdicts; errors: ${metrics.trust1Errors.length ? metrics.trust1Errors.slice(0, 4).join('; ') : 'none'}) · decided accuracy ${pct(metrics.decidedAccuracy)}, abstention ${pct(metrics.abstention)} · decided without a model call ${pct(metrics.noModelShare)} · wrong model named ${pct(metrics.wrongModelNamed)} · consistent ×3 ${pct(metrics.consistency)} · latency p50 ${metrics.latencyP50} ms, p95 ${metrics.latencyP95} ms · ${metrics.items} computable items, ${metrics.answers} answers${metrics.errors ? ` · ${metrics.errors} errors` : ''}` });
  log(`runtime precision: accuracy ${pct(metrics.accuracy)}, no model call ${pct(metrics.noModelShare)}, wrong model named ${pct(metrics.wrongModelNamed)}, consistent ${pct(metrics.consistency)}, p50 ${metrics.latencyP50} ms, p95 ${metrics.latencyP95} ms`);
  return { metrics };
}

// ---------- T4 by simulation (the lead's gate (c), 2026-10-08): does the proposed repair make the belief decay? ----------
// Each condition's T4 answers (its newest teaching run) are put to the simulator as the tutor's turn after the student's
// wrong answer: the simulator's perception (the same as in level 3) decides whether it refuted THAT belief in a targeted
// way, and the simulator's rules decide what follows (a targeted refutation makes the belief pending, so it fires less).
// Score: the share of the belief's possible repair the turn achieved, in expected success on the items it affects.
async function repairTest(app) {
  const { PERCEIVE, PERCEPTION } = await import('./sim/perceive.mjs'), sim = await import('./sim/core.mjs'), lib = await import(path.join(FX.dir, 'beliefs.mjs'));
  const set = await readJson(path.join(FX.frozen, 'teaching.json'), null), { statSync } = await import('node:fs');
  // This fixture's newest teaching run of this condition (its summary names the fixture).
  const runsDir = path.join(HERE, 'runs'), mine = [];
  for (const d of await readdir(runsDir)) { const f = path.join(runsDir, d, 'teaching', `${against}.json`); if (existsSync(f) && (await readJson(path.join(runsDir, d, 'summary.json'), {})).fixture === FX.name) mine.push(f); }
  const file = mine.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  const taught = file ? await readJson(file) : null;
  if (!set || !taught) { log(`no teaching answers for ${against} yet: run --level teach --against ${against} first`); return { metrics: null }; }
  const byId = new Map(taught.rows.map(r => [r.id, r])), t4 = set.probes.filter(p => p.kind === 'T4' && byId.get(p.id)?.answer);
  log(`repair by simulation against ${against}: ${t4.length} repairs from ${path.relative(HERE, file)}`);
  const rows = await each(t4, async p => {
    const bugId = p.id.slice(3), bug = lib.bugs.find(b => b.id === bugId), t1 = set.probes.find(q => q.id === `T1-${bugId}`) ?? set.probes.find(q => q.id === `T2-${bugId}`);
    const said = t1?.prompt.match(/They answered: (.*?)\. Name/)?.[1] ?? null, asked = t1?.prompt.match(/was asked: (.*?)\. They answered/)?.[1] ?? t1?.prompt.match(/Asked: (.*?), what answer/)?.[1] ?? null;
    const repair = byId.get(p.id).answer;
    const input = { course: FX.course, concepts: lib.concepts.map(({ id, title }) => ({ id, title })), skills: lib.skills.map(({ id, concept, describe, params }) => ({ id, concept, asks: describe, params })), activeBeliefs: [{ id: bugId, belief: bug.belief }],
      conversation: [asked && `Plato: ${asked}?`, `Student: ${said ?? bug.belief}`].filter(Boolean).join('\n'), newestTutorTurn: `Plato: ${repair}` };
    const seen = await ask({ key: `repair-${FX.name}-${against}-${bugId}-${hash(input)}`, role: 'heavy', effort: 'medium', instructions: PERCEIVE, schema: PERCEPTION, input });
    const targeted = !!seen.refutes?.find(r => r.bugId === bugId && r.targeted);
    // The simulator: a student who knows the procedure (θ 1) and holds this belief; expected success on the tests it affects.
    const mk = () => sim.createStudent({ lib, persona: sim.personaOf('P4'), world: 'N', seed: 1, theta: { [bug.concept]: 1 }, bugs: [bugId], focus: [bug.concept] });
    const before = testScore(lib, mk(), [bug.concept]), after = (() => { const s2 = mk(); if (targeted) s2.refute(bugId); return testScore(lib, s2, [bug.concept]); })(), clean = (() => { const s3 = mk(); delete s3.state.bugs[bugId]; return testScore(lib, s3, [bug.concept]); })();
    return { id: p.id, bugId, errorKind: bug.errorKind, targeted, asks: seen.asks?.type ?? null, why: seen.refutes?.find(r => r.bugId === bugId)?.why ?? null, score: clean > before ? (after - before) / (clean - before) : (targeted ? 1 : 0), repair: clip(repair, 600) };
  });
  const metrics = { repairs: rows.length, targeted: share(rows.map(r => r.targeted)), score: mean(rows.map(r => r.score)), scores: Object.fromEntries(rows.map(r => [r.id, +r.score.toFixed(3)])), source: path.relative(HERE, file) };
  await writeJson(path.join(RUN, 'repair', `${against}.json`), { metrics, rows });
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, level: 'repair by simulation', against, prompts: `T4 answers from ${metrics.source}; sim ${(await import('./sim/perceive.mjs')).PERCEIVE_VERSION} (${await settingOf('heavy', 'medium')})`,
    metrics: `targeted refutation ${pct(metrics.targeted)} · repair achieved ${pct(metrics.score)} · ${metrics.repairs} repairs` });
  log(`repair against ${against}: targeted ${pct(metrics.targeted)}, achieved ${pct(metrics.score)} (${rows.length})`);
  return { metrics };
}

// ---------- level 2: teaching decisions from scripted student states, through the real director ----------
// The states cover the rubric's personas (tutoring-evidence §5.6) that one exchange can show.
export const STATES = ['never_seen', 'wrong_model', 'compute_not_why', 'bored', 'asks_to_see', 'help_abuser', 'says_got_it', 'wants_to_read', 'talk_through', 'needs_exposition', 'frustrated'];
// reading.md §9.1: which states call for a reading move (RD1, RD5) and which must not get one (RD2, RD5).
const READ_EXPECTED = { wants_to_read: true, needs_exposition: true, talk_through: false, frustrated: false };
/** What the student says in each state (to card 1, as the actor asked it), the truth the judge sees, and the verdict the truth calls for. */
function scriptState(id, f, card1) {
  const w = f.wrongModels[0], right = card1?.expect?.find(b => b.kind === 'correct');
  switch (id) {
    case 'never_seen': return { id, persona: 'cooperative novice', truth: 'Has never seen this topic: no idea what it is, no wrong beliefs yet.', lines: ["i've never seen this before. no idea, sorry"], verdicts: [['stuck', 'other']] };
    case 'wrong_model': return { id, persona: 'confident student with a misconception', truth: `Holds a wrong model, confidently: "${w.belief}". On "${w.produces.question}" it answers ${w.produces.wrongAnswer} (right: ${w.produces.rightAnswer}).`,
      lines: [`i'm pretty sure ${w.belief.replace(/^i think\s+/i, '').replace(/\.$/, '')}. like for "${clip(w.produces.question, 160)}" it's ${clip(w.produces.wrongAnswer, 80)}`], verdicts: [['misconception', 'incorrect']] }; // wrong, with or without the model named: both right
    case 'compute_not_why': return { id, persona: 'cooperative student who computes by rote', truth: 'Can compute by following the notes\' procedure (gets the values right) but cannot explain why it works.',
      // First the right answer to card 1 (its correct branch, matched as said), then the admission: the move after it is judged.
      lines: [...(right ? [right.literal || right.when] : []), "ok i can get the answers by following the steps, but honestly i don't get WHY it works"], verdicts: [...(right ? [['correct']] : []), ['stuck', 'other', 'partial']] };
    case 'bored': return { id, persona: 'strong student who resents being drilled', truth: 'Already knows this topic well (answers correctly, can explain why) and is bored: wants to move faster or be challenged. Has shown no evidence yet in this session.', lines: ["yeah i already know all this, it's easy. can we go faster?"], verdicts: [['other', 'topic_request']] };
    case 'asks_to_see': return { id, persona: 'cooperative student with an explicit request', truth: 'Has heard the idea in words but cannot picture it; asks to see it. No wrong belief identified yet.', lines: ["i can't picture this at all. can you show me what it looks like?"], verdicts: [['other', 'stuck']] };
    case 'help_abuser': return { id, persona: 'help-abuser', truth: 'Has not tried; wants the answer handed over. Could make progress with a hint.', lines: ["can you just tell me the answer? i don't want to work it out"], verdicts: [['other', 'stuck']] };
    case 'says_got_it': return { id, persona: 'student who claims understanding without evidence', truth: 'Says they understand, with no evidence; in fact only half follows (would miss an apply question).', lines: ['yeah ok i get it'], verdicts: [['other', 'correct', 'partial']] };
    case 'wants_to_read': return { id, persona: 'student with an explicit request to read', truth: 'Prefers to read first; in the zone for this topic (has the prerequisites); an adequate passage exists in the notes.', lines: ['can i just read about it first? where in the notes is this?'], verdicts: [['other', 'stuck']] };
    case 'talk_through': return { id, persona: 'student with an explicit request not to read', truth: "Doesn't want to read now; wants it explained aloud.", lines: ["can you just talk me through it? i really don't want to read anything right now"], verdicts: [['other', 'stuck']] };
    case 'needs_exposition': return { id, persona: 'cooperative student in the zone', truth: 'Has the prerequisites, has not met this idea, and needs the exposition (more than a few sentences); an adequate passage exists in the notes.', lines: ["i don't know this part yet. how does it work? i need the whole idea, not just the answer"], verdicts: [['stuck', 'other']] };
    case 'frustrated': return { id, persona: 'frustrated student', truth: 'Frustrated after struggling; out of patience; needs it explained, not homework.', lines: ["ugh i'm so lost and tired of this. just explain it to me"], verdicts: [['stuck', 'other']] };
  }
}
const cardView = c => c && { source: c.source, move: c.move ?? null, act: c.act ?? null, helpLevel: c.helpLevel ?? null, intention: c.intention ?? null, verdict: c.verdict ?? null, wait: c.wait ?? null, neutral: c.neutral ?? null, withheld: c.withheld ?? null, why: c.why ?? null,
  // What the card put on the learner's page (the voice says "the question on the page"): the judge needs it to see the task.
  show: c.show ? { kind: c.show.kind, element: c.show.element ?? c.show.kind, portion: c.show.portion ? { title: c.show.portion.title ?? null, words: String(c.show.portion.text ?? '').split(/\s+/).length } : null,
    text: clip(c.show.kind === 'markdown' ? [c.show.title, c.show.content].filter(Boolean).join(': ') : c.show.kind === 'reading' ? [c.show.portion?.purpose, ...(c.show.portion?.body || []).map(b => b.text ?? (b.items || []).join(' '))].filter(Boolean).join(' ') : [c.show.title, c.show.task?.ask].filter(Boolean).join(': ') || c.show.kind, 700) } : null,
  aim: c.aim, situation: c.situation, level: c.level, say: c.say, ask: c.ask, element: c.element ?? null, board: c.board && { kind: c.board.kind, title: c.board.title ?? c.board.element?.title ?? null, content: clip(c.board.content ?? c.board.element?.summary ?? c.board.quote ?? JSON.stringify(c.board.diagram ?? c.board.zone ?? c.board.check ?? '').slice(0, 400), 600) }, boardWhy: c.boardWhy, expect: (c.expect || []).map(({ kind, when, reply, then }) => ({ kind, when, reply, thenAsk: then?.ask ?? null })) };
const tasks = pool(3);
/**
 * One scripted state on its own throwaway copy of the sandbox (the director's turns write learner evidence): a session on
 * the topic, card 1 said by the actor as written, the student's line(s) committed as responses, and the director's turn
 * run as the server runs it (plan_turn, then the card job for an answer no branch prepared; never the background
 * refinements). Gives the rubric's S, I and D: card 1, what the director made of each line, and the move it chose next.
 */
async function playState(t, id, f) {
  const dir = path.join(RUN, 'level2', `sbx-${t.topicId}-${id}`);
  await copySandbox(dir);
  const live = await openApp(await getRuntime(), { dir });
  try {
    const S = live.services.session, D = live.services.director, uid = () => `${runId}-${Math.random().toString(36).slice(2)}`;
    const t0 = Date.now(), r = S.start(live.principal, live.examId, { topicId: t.topicId }), sid = r.sessionId, card1 = r.card;
    const st = scriptState(id, f, card1), said = c => [c?.say, c?.ask].filter(Boolean).join(' ');
    const turns = [];
    let card = card1;
    for (const line of st.lines) {
      if (said(card)) S.agentEvents(live.principal, sid, { events: [{ clientEventId: uid(), type: 'agent_response', text: said(card), interrupted: false, occurredAt: new Date().toISOString() }] });
      const s = S.peek(sid), at = Date.now();
      await S.submitResponse(live.principal, sid, { clientResponseId: uid(), captureEpoch: s.epoch, turnId: s.currentTurnId, replyToQuestionId: s.activeQuestionId ?? null, text: line, finalized: true, transcriptVersion: 1, confidence: null, ambiguousSpans: [], audioArtifactId: null, supersedesResponseId: null });
      await runOnly(live, job => job.payload?.sessionId === sid && ['plan_turn', 'director_card', 'director_think'].includes(job.type) && job.payload?.kind !== 'refine', 1);
      const now = S.peek(sid), last = D.state(now)?.last ?? null, next = D.current(now, { full: true }); // full: card v2's withheld answer, for scoring D
      // What the director's jobs did for this line (a card job that ran but issued nothing is not "no move chosen").
      const jobs = live.db.find('jobs', {}).filter(j => j.payload?.sessionId === sid && ['plan_turn', 'director_card', 'director_think'].includes(j.type) && Date.parse(j.createdAt ?? 0) >= at - 1000).map(j => ({ type: j.type, kind: j.payload?.kind ?? null, state: j.state, error: j.lastError?.message ?? null }));
      turns.push({ line, ms: Date.now() - at, jobs, match: last && { kind: last.kind, how: last.how, branchId: last.branchId, next: last.next ?? null,
        // card v2's decision, when the engine records it (spec §13): the verdict, its trust, the wrong model and error kind, the move, the help level and the rule that fired
        ...Object.fromEntries(['verdict', 'trust', 'wrongModel', 'errorKind', 'move', 'act', 'helpLevel', 'rule'].filter(k => last[k] !== undefined).map(k => [k, last[k]])) }, branch: card?.expect?.find(b => b.id === last?.branchId) ?? null, nextCard: next?.id !== card?.id ? next : null, cardBefore: card });
      if (next) card = next;
    }
    const concepts = [...new Set([...(card1?.concepts || []), ...(card?.concepts || [])])], model = (() => { try { return live.services.learner.conceptStates?.(live.scope, concepts) ?? null; } catch { return null; } })();
    try { S.end(live.principal, sid, { expectedEpoch: S.peek(sid).epoch }); } catch { /* fine */ }
    const final = turns.at(-1);
    return {
      state: st, ms: Date.now() - t0, goal: r.agenda?.goals.find(g => g.id === r.agenda.currentGoalId) ?? null, lesson: r.lesson?.lesson?.source ?? null, card1, cardBefore: final?.cardBefore ?? card1, nextCard: final?.nextCard ?? null, model,
      turns: turns.map(x => ({ line: x.line, ms: x.ms, jobs: x.jobs, match: x.match, branchReply: x.branch && { kind: x.branch.kind, when: x.branch.when, reply: x.branch.reply, thenAsk: x.branch.then?.ask ?? null }, nextCard: cardView(x.nextCard) })),
      verdicts: turns.map((x, i) => { const v = verdictOf(x.match); return { line: x.line, director: v, raw: x.match?.verdict ?? x.match?.kind ?? null, truth: st.verdicts[i] ?? null, agrees: !!st.verdicts[i]?.includes(v) }; }),
    };
  } finally { live.close(); await rm(dir, { recursive: true, force: true }); }
}
/** A decision's verdict in the scripted states' vocabulary: card v2's verdicts (spec §13) mapped, older kinds as they are. */
// 'incorrect' (wrong, no wrong model named) stays its own kind: it is not the misconception a wrong-model state expects.
const V2_VERDICT = { correct: 'correct', valid_nonstandard: 'correct', slip: 'partial', missing_piece: 'partial', wrong_model: 'misconception', incorrect: 'incorrect', uncertain: 'other', no_attempt: 'stuck', stuck: 'stuck', request: 'other', claims_understanding: 'other' };
const verdictOf = m => !m ? 'none' : m.verdict ? (V2_VERDICT[m.verdict] ?? 'other') : (m.kind ?? 'none');
/** The actor's turn (the rubric's A): the stand-in actor (evals/stand-in.mjs's setting) with the cards it was sent and the exchange. */
async function actorTurn(key, x) {
  // The actor reads a card as the bridge renders it: card v2 through actorCard (session/agent.mjs), older cards through cardText.
  const agent = await import('../../backend/session/agent.mjs'), { ACTOR_PROMPT } = agent, cardText = agent.actorCard ? (c => c.move ? agent.actorCard(c) : null) : null;
  const legacy = cardText ? null : (await import('../../backend/director/cards.mjs')).cardText;
  const sent = [x.card1, x.cardBefore !== x.card1 ? x.cardBefore : null, x.nextCard].filter(Boolean).map(c => (cardText && cardText(c)) || (legacy ? legacy(c) : JSON.stringify({ say: c.say, ask: c.ask })));
  // As the stand-in (and ElevenLabs) shows it: each card's arrival is marked in the dialogue where it came (actor v2.1 performs
  // a card that came since Plato last spoke first), its full text in the context updates.
  const head = c => c?.move ? `[New card: CARD · ${c.move}${c.act ? ` (${c.act.replace(/_/g, ' ')})` : ''} · wait: ${c.wait}]` : null;
  const dialogue = [head(x.card1), `Plato: ${[x.card1?.say, x.card1?.ask].filter(Boolean).join(' ')}`, ...x.turns.flatMap((u, i) => [`Student: ${u.line}`, ...(i < x.turns.length - 1 && u.nextCard ? [head(u.nextCard), `Plato: ${[u.nextCard.say, u.nextCard.ask].filter(Boolean).join(' ')}`] : [])]), head(x.nextCard)].filter(Boolean);
  const { say } = await ask({ key, role: 'light', instructions: `${ACTOR_PROMPT}\n\nTEXT STAND-IN (a test without voice): reply with JSON { "say": exactly what you say aloud now }.`, schema: { type: 'object', additionalProperties: false, required: ['say'], properties: { say: { type: 'string' } } },
    input: `CONTEXT UPDATES you have received (oldest first; they are information, not turns):\n\n${sent.join('\n\n---\n\n')}\n\nTHE CONVERSATION (oldest first):\n${dialogue.join('\n')}\n\nYour turn: reply as JSON.`, timeoutMs: 120_000 });
  return say;
}
/** The rubric's aggregation (§5.4): a move passes when every gate passes and no applicable dimension scores 0; D6 capped at 1 on a reflex-praise lint hit. */
function aggregate(judged, actor) {
  const dims = Object.fromEntries(Object.entries(judged.dims).map(([d, v]) => [d, v.score === 'NA' ? null : Number(v.score)]));
  const lint = { reflexPraise: P.LINT.reflexPraise.test(actor || ''), makeSense: P.LINT.makeSense.test(actor || '') };
  if (lint.reflexPraise && dims.D6 === 2) dims.D6 = 1;
  const applicable = Object.values(dims).filter(v => v != null), gates = Object.fromEntries(Object.entries(judged.gates).map(([g, v]) => [g, v.pass]));
  const q = list => { const v = list.map(d => dims[d]).filter(x => x != null); return v.length ? mean(v) / 2 : null; };
  return { gates, dims, lint, pass: Object.values(gates).every(Boolean) && !applicable.includes(0), quality: applicable.length ? mean(applicable) / 2 : null, director: q(P.DIRECTOR_DIMS), actor: q(P.ACTOR_DIMS) };
}
/** Judges one move (S, I, D, A) by the frozen rubric (the deep setting at medium effort). */
async function judgeMove(key, rubric, notes, t, x, actor) {
  const right = x.card1?.expect?.find(b => b.kind === 'correct');
  const input = {
    topic: t.title, notes,
    S: { persona: x.state.persona, truth: x.state.truth, goal: x.goal && { title: x.goal.title, doneWhen: x.goal.doneWhen, why: x.goal.why ?? null }, abilityEstimates: x.model, explicitRequest: ['asks_to_see', 'help_abuser', 'bored'].includes(x.state.id) ? x.turns.at(-1)?.line : null, helpLevel: 'not tracked by today\'s director',
      lastTurns: [`tutor: ${[x.card1?.say, x.card1?.ask].filter(Boolean).join(' ')}`, ...x.turns.flatMap((u, i) => [`student: ${u.line}`, ...(i < x.turns.length - 1 && u.nextCard ? [`tutor: ${[u.nextCard.say, u.nextCard.ask].filter(Boolean).join(' ')}`] : [])])] },
    I: { question: x.cardBefore?.ask ?? null, reference: right ? { when: right.when, literal: right.literal ?? null, reply: right.reply } : null, expectations: (x.cardBefore?.expect || []).map(({ kind, when }) => ({ kind, when })), anticipatedMisconceptions: (x.cardBefore?.expect || []).filter(b => b.kind === 'misconception').map(({ when, reply }) => ({ when, reply })), starter: x.card1?.say ?? null },
    D: { verdict: x.turns.at(-1)?.match ?? null, branchTaken: x.turns.at(-1)?.branchReply ?? null, nextCard: cardView(x.nextCard), intention: x.nextCard?.aim ?? x.turns.at(-1)?.branchReply?.when ?? null },
    verdictCheck: x.verdicts.at(-1),
    A: actor,
  };
  const judged = await ask({ key, role: 'heavy', effort: 'medium', instructions: P.MOVE_JUDGE(rubric), schema: P.MOVE_JUDGE_SCHEMA, input });
  return { judged, ...aggregate(judged, actor) };
}
async function level2(app, topics, { grams, index }) {
  const states = opt('--states') ? opt('--states').split(',').filter(x => STATES.includes(x)) : STATES;
  log(`level 2 against ${against}: ${topics.length} topics × ${states.length} states, through the real director, judged by ${RUBRIC}`);
  const rubric = await readFile(path.join(FROZEN, `plato-move-rubric-${RUBRIC}.md`), 'utf8'), rubricVersion = rubric.match(/version:\s*(\S+)/)?.[1] ?? hash(rubric);
  const calibration = await readJson(path.join(FROZEN, 'calibration', 'status.json'), { trusted: false, why: 'not calibrated yet' });
  const frozen = await freezeAll(app, topics);
  if (against === 'baseline') await freezeBaselines(app, topics.map(t => t.topicId));
  const rows = await each(topics, async (t, k) => {
    const file = path.join(RUN, 'level2', `${t.topicId}.json`), done = await readJson(file, { moves: {} });
    const f = frozen[k];
    if (f.error) return { topicId: t.topicId, title: t.title, skipped: `no probes: ${f.error}` };
    if (against === 'studies' && !await studyRep(app, t.topicId)) return { topicId: t.topicId, title: t.title, skipped: 'no Study for this topic yet' };
    const notes = topicMaterial(app, t.topicId).text;
    await Promise.all(states.map(id => done.moves[id]?.score ? null : tasks(async () => {
      try {
        const x = done.moves[id]?.played ?? await playState(t, id, f);
        const actor = done.moves[id]?.actor ?? await actorTurn(`${runId}-l2-actor-${t.topicId}-${id}`, x);
        const score = await judgeMove(`${runId}-l2-judge-${t.topicId}-${id}`, rubric, notes, t, x, actor);
        // A reading move: the next card's board quotes the notes, or the move sends the student to a section or passage.
        const text = [x.nextCard?.say, x.nextCard?.ask, actor].filter(Boolean).join(' ');
        // ponytail: a cue match, not a judgment; the level-3 perception classifies reading moves properly.
        const readMove = x.nextCard?.move === 'read' || x.nextCard?.show?.kind === 'reading' || x.nextCard?.board?.kind === 'notes' || (/\b(read|reread|look (?:at|over|through)|take a look at|go through)\b/i.test(text) && /\b(section|paragraph|passage|notes|page|lecture|chapter|text|reading|covers it)\b/i.test(text));
        done.moves[id] = { played: x, actor, score, readMove };
      } catch (error) { done.moves[id] = { ...done.moves[id], error: error.message }; }
      await writeJson(file, { ...done, topicId: t.topicId, title: t.title }); // checkpoint per state
    })));
    const text = Object.values(done.moves).map(m => m.actor || '').join('\n');
    const row = { topicId: t.topicId, title: t.title, moves: done.moves, regurgitation: regurgitation(text, grams), paraphrase: paraphrase(text, index) };
    await writeJson(file, row);
    const scores = Object.values(done.moves).filter(m => m.score).map(m => m.score);
    log(`  ${t.title}: pass ${scores.filter(x => x.pass).length}/${scores.length} · G1 fail ${scores.filter(x => !x.gates.G1).length} · G2 fail ${scores.filter(x => !x.gates.G2).length} · G3 fail ${scores.filter(x => !x.gates.G3).length}`);
    return row;
  });
  const moves = rows.flatMap(r => Object.entries(r.moves || {}).map(([state, m]) => ({ state, ...m }))), scored = moves.filter(m => m.score), sc = scored.map(m => m.score);
  const rate = f => sc.length ? sc.filter(f).length / sc.length : null, regs = rows.filter(r => r.regurgitation);
  const dimStats = Object.fromEntries([...P.DIRECTOR_DIMS, ...P.ACTOR_DIMS].map(d => [d, { mean: mean(sc.map(x => x.dims[d])), na: sc.filter(x => x.dims[d] == null).length, zeros: sc.filter(x => x.dims[d] === 0).length }]));
  const verdicts = scored.flatMap(m => m.played.verdicts);
  // G1 failures split by cause (the lead): the decision on the last line (code knows what the line was) against the truth.
  // over-validation: accepted a wrong answer; over-rejection: called a right answer, or a line that was no answer, wrong;
  // otherwise a false claim in the turn itself.
  const g1Cause = m => { const v = m.played.verdicts.at(-1); if (!v?.truth) return 'false claim'; if (v.director === 'correct' && !v.truth.includes('correct')) return 'over-validation'; if (['misconception', 'incorrect', 'partial', 'stuck'].includes(v.director) && !v.truth.some(x => ['misconception', 'partial'].includes(x))) return 'over-rejection'; return 'false claim'; };
  const g1 = scored.filter(m => !m.score.gates.G1).map(g1Cause);
  const metrics = {
    moves: sc.length, failed: moves.length - sc.length, pass: rate(x => x.pass), G1: rate(x => !x.gates.G1), G2: rate(x => !x.gates.G2), G3: rate(x => !x.gates.G3),
    // A wrong-model answer the engine calls wrong without naming the model is a right verdict but a diagnosis miss (the lead).
    wrongModelNamed: share(scored.filter(m => m.state === 'wrong_model').map(m => { const t = m.played.turns.at(-1)?.match; return t?.verdict === 'wrong_model' || !!t?.wrongModel; })),
    // The lead (2026-10-08, option b): a candidate the card carries without saying it (verdict.wrongModel, suspected: true),
    // counted apart from the named (spoken) diagnosis above; information, not a gate.
    wrongModelSuspected: share(scored.filter(m => m.state === 'wrong_model').map(m => { const v = m.played.nextCard?.verdict; return !!v?.wrongModel && v?.suspected === true; })),
    G1causes: { overValidation: sc.length ? g1.filter(c => c === 'over-validation').length / sc.length : null, overRejection: sc.length ? g1.filter(c => c === 'over-rejection').length / sc.length : null, falseClaim: sc.length ? g1.filter(c => c === 'false claim').length / sc.length : null },
    quality: mean(sc.map(x => x.quality)), director: mean(sc.map(x => x.director)), actor: mean(sc.map(x => x.actor)), dims: dimStats,
    verdict: { agree: share(verdicts.map(v => v.agrees)), overValidation: share(verdicts.map(v => v.director === 'correct' && v.truth && !v.truth.includes('correct'))), overRejection: share(verdicts.map(v => v.truth?.includes('correct') && ['misconception', 'stuck', 'partial', 'incorrect'].includes(v.director))) },
    lint: { reflexPraise: share(sc.map(x => x.lint.reflexPraise)), makeSense: share(sc.map(x => x.lint.makeSense)) },
    regurgitation: regs.reduce((n, r) => n + r.regurgitation.copied, 0) / (regs.reduce((n, r) => n + r.regurgitation.words, 0) || 1), paraphrase: regs.reduce((n, r) => n + r.paraphrase.close, 0) / (regs.reduce((n, r) => n + r.paraphrase.words, 0) || 1),
    byState: Object.fromEntries(STATES.map(st => [st, { pass: share(scored.filter(m => m.state === st).map(m => m.score.pass)), quality: mean(scored.filter(m => m.state === st).map(m => m.score.quality)) }])),
    // reading.md RD1 (reading offered when it should be), RD2 (withheld when it shouldn't be), RD5 (requests honoured).
    reading: { RD1: share(scored.filter(m => m.state === 'needs_exposition').map(m => m.readMove)), RD2: share(scored.filter(m => m.state === 'frustrated').map(m => !m.readMove)),
      RD5: share(scored.filter(m => ['wants_to_read', 'talk_through'].includes(m.state)).map(m => m.readMove === READ_EXPECTED[m.state])) },
    judgeTrusted: !!calibration.trusted,
  };
  const failures = scored.filter(m => !m.score.pass).slice(0, 15).map(m => ({ state: m.state, topic: rows.find(r => r.moves?.[m.state] === m)?.title, gates: Object.entries(m.score.judged.gates).filter(([, v]) => !v.pass).map(([g, v]) => `${g}: ${v.evidence}`), zeros: Object.entries(m.score.judged.dims).filter(([, v]) => v.score === '0').map(([d, v]) => `${d}: ${v.evidence}`), actor: clip(m.actor, 300) }));
  await writeJson(path.join(RUN, 'level2', 'summary.json'), { metrics, failures, rubricVersion, calibration });
  const dimLine = [...P.DIRECTOR_DIMS, ...P.ACTOR_DIMS].map(d => `${d} ${fix(dimStats[d].mean, 2)}`).join(' ');
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, level: '2 decisions', against,
    prompts: `the director as built (${(await import('../../backend/providers/prompts/director.mjs')).CARD_VERSION}, ${await settingOf('director')}; classify ${await settingOf('replyLight')}); actor stand-in ${await settingOf('light')}; ${P.MOVE_JUDGE_VERSION} + ${rubricVersion} (${await settingOf('heavy', 'medium')})${calibration.trusted ? '' : ', judge NOT yet calibrated'}`,
    metrics: `wrong model named ${pct(metrics.wrongModelNamed)} spoken, ${pct(metrics.wrongModelSuspected)} suspected on the card (diagnosis misses: a wrong-model answer called wrong without either) · G1 fail ${pct(metrics.G1)} (over-validation ${pct(metrics.G1causes.overValidation)}, over-rejection ${pct(metrics.G1causes.overRejection)}, false claims ${pct(metrics.G1causes.falseClaim)}) · G2 fail ${pct(metrics.G2)} · G3 fail ${pct(metrics.G3)} · pass ${pct(metrics.pass)} · quality ${pct(metrics.quality)} (director ${pct(metrics.director)}, actor ${pct(metrics.actor)}) · ${dimLine} · verdict agree ${pct(metrics.verdict.agree)}, over-validation ${pct(metrics.verdict.overValidation)}, over-rejection ${pct(metrics.verdict.overRejection)} · lint praise ${pct(metrics.lint.reflexPraise)}, make-sense ${pct(metrics.lint.makeSense)} · reading RD1 ${pct(metrics.reading.RD1)}, RD2 ${pct(metrics.reading.RD2)}, RD5 ${pct(metrics.reading.RD5)} · speech regurgitation ${pct(metrics.regurgitation)} (close paraphrase ${pct(metrics.paraphrase)}) · ${metrics.moves} moves${metrics.failed ? ` (${metrics.failed} failed)` : ''}` });
  return { metrics, failures };
}

// ---------- the judge's calibration (plato-move-rubric v1 §5.6): Cohen's κ per gate and dimension against human labels ----------
const LABELS = ['G1', 'G2', 'G3', ...P.DIRECTOR_DIMS, ...P.ACTOR_DIMS];
const KJ = Math.max(1, Number(opt('--k', '1')));
async function calibrate() {
  const rubric = await readFile(path.join(FROZEN, `plato-move-rubric-${RUBRIC}.md`), 'utf8'), rubricVersion = rubric.match(/version:\s*(\S+)/)?.[1];
  const dir = path.join(FROZEN, 'calibration', 'items'), files = (await readdir(dir)).filter(f => f.endsWith('.json')).sort();
  const items = await Promise.all(files.map(f => readJson(path.join(dir, f)))), moves = items.flatMap(it => it.moves.map(m => ({ ...m, item: it.item })));
  log(`calibrating the judge on ${moves.length} labelled moves (${moves.filter(m => m.reviewed).length} reviewed)`);
  const results = await each(moves, async m => {
    const input = { course: m.item.course, topic: m.item.title, notes: m.item.notes, S: m.S, I: { question: m.item.question, reference: m.item.reference, expectations: m.item.expectations, anticipatedMisconceptions: m.item.misconceptions }, D: m.D, verdictCheck: m.verdictCheck ?? null, A: m.A };
    // --k N: the judge N times per move (run 1 keeps its original cache key); the label is the runs' mode (ties: run 1's),
    // and each label's stability is the share of moves on which every run agrees.
    const runs = [];
    for (let i = 1; i <= KJ; i++) runs.push(await ask({ key: `calib-${P.MOVE_JUDGE_VERSION}-${hash(rubric)}-${m.id}-${hash(input)}${i > 1 ? `-r${i}` : ''}`, role: 'heavy', effort: 'medium', instructions: P.MOVE_JUDGE(rubric), schema: P.MOVE_JUDGE_SCHEMA, input }));
    const flat = j => ({ ...Object.fromEntries(Object.entries(j.gates).map(([g, v]) => [g, v.pass ? 'pass' : 'fail'])), ...Object.fromEntries(Object.entries(j.dims).map(([d, v]) => [d, v.score])) });
    const all = runs.map(flat), mode = l => { const c = {}; for (const r of all) c[r[l]] = (c[r[l]] || 0) + 1; const top = Math.max(...Object.values(c)); return Object.keys(c).filter(v => c[v] === top).includes(String(all[0][l])) ? all[0][l] : Object.keys(c).find(v => c[v] === top); };
    return { id: m.id, human: { ...m.labels, ...(RUBRIC === 'v1' ? m.labelsV1 ?? {} : {}) }, judge: Object.fromEntries(LABELS.map(l => [l, mode(l)])), runs: all, evidence: runs[0] };
  });
  const ok = results.filter(r => !r.error);
  // D8 split into two narrow yes/no criteria (the lead's protocol when D8's κ stays under 0.6): D8a length (the label is
  // computed: more than 60 words before handing back) and D8b idea count (the label: D8 below 2). One judge call per move.
  const split = has('--split-d8') ? await each(moves, async m => {
    const words = (m.A.match(/[A-Za-z0-9'’-]+/g) || []).length, input = { S: { persona: m.S.persona, lastTurns: m.S.lastTurns }, D: { move: m.D.move, helpLevel: m.D.helpLevel }, A: m.A };
    const j = await ask({ key: `calib-d8split-${hash(P.D8_SPLIT)}-${m.id}-${hash(input)}`, role: 'heavy', effort: 'medium', instructions: P.D8_SPLIT, schema: P.D8_SPLIT_SCHEMA, input });
    return { id: m.id, words, human: { D8a: words > 60 ? 'yes' : 'no', D8b: ['0', '1'].includes(String(m.labels.D8)) ? 'yes' : 'no' }, judge: { D8a: j.length, D8b: j.ideas }, evidence: j.evidence };
  }) : null;
  const perLabel = Object.fromEntries(LABELS.map(l => {
    const pairs = ok.map(r => [String(r.human[l]), String(r.judge[l])]), k = kappa(pairs), kw = l.startsWith('D') ? kappa(pairs, true) : null;
    return [l, { n: k.n, agreement: k.agreement, kappa: k.kappa, weightedKappa: kw?.kappa ?? null, stability: KJ > 1 ? share(ok.map(r => new Set(r.runs.map(x => String(x[l]))).size === 1)) : null, disagreements: ok.filter(r => String(r.human[l]) !== String(r.judge[l])).map(r => `${r.id}: human ${r.human[l]}, judge ${r.judge[l]} (${clip(l.startsWith('G') ? r.evidence.gates[l].evidence : r.evidence.dims[l].evidence, 140)})`) }];
  }));
  if (split) for (const l of ['D8a', 'D8b']) { const pairs = split.map(r => [r.human[l], r.judge[l]]), k = kappa(pairs); perLabel[l] = { n: k.n, agreement: k.agreement, kappa: k.kappa, positives: pairs.filter(([h]) => h === 'yes').length, disagreements: split.filter(r => r.human[l] !== r.judge[l]).map(r => `${r.id}: human ${r.human[l]}, judge ${r.judge[l]} (${clip(r.evidence, 140)})`) }; }
  const reviewed = moves.length > 0 && moves.every(m => m.reviewed === true), low = LABELS.filter(l => (perLabel[l].kappa ?? 0) < 0.6);
  // Reviewed by an LLM second labeller only: κ stays provisional until a human expert labels some (the lead, 2026-10-08).
  const llmOnly = moves.every(m => !m.reviewedBy || /LLM/i.test(m.reviewedBy));
  const status = { trusted: reviewed && !llmOnly && !low.length, reviewed, llmReviewedOnly: llmOnly, at: new Date().toISOString(), judge: await settingOf('heavy', 'medium'), judgeVersion: P.MOVE_JUDGE_VERSION, rubricVersion, rubricHash: hash(rubric), moves: ok.length, failed: results.length - ok.length,
    kappa: Object.fromEntries([...LABELS, ...(split ? ['D8a', 'D8b'] : [])].map(l => [l, perLabel[l].kappa == null ? null : +perLabel[l].kappa.toFixed(2)])), judgeRuns: KJ,
    stability: KJ > 1 ? Object.fromEntries(LABELS.map(l => [l, +perLabel[l].stability.toFixed(2)])) : null, why: !reviewed ? 'the labels are drafts awaiting human review: kappa is provisional' : llmOnly ? `provisional (LLM-reviewed)${low.length ? `; kappa below 0.6 on ${low.join(', ')}` : ''}` : low.length ? `kappa below 0.6 on ${low.join(', ')}` : 'kappa >= 0.6 on every gate and dimension' };
  await writeJson(path.join(RUN, 'calibration.json'), { status, perLabel, results });
  await writeJson(path.join(FROZEN, 'calibration', RUBRIC === 'v2' ? 'status.json' : `status-${RUBRIC}.json`), status);
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, level: '2 judge calibration', against: '–', prompts: `${P.MOVE_JUDGE_VERSION} + ${rubricVersion} (${status.judge})`,
    metrics: `κ ${[...LABELS, ...(split ? ['D8a', 'D8b'] : [])].map(l => `${l} ${fix(perLabel[l].kappa, 2)}`).join(' ')}${KJ > 1 ? ` · stability (all ${KJ} runs agree) ${LABELS.map(l => `${l} ${fix(perLabel[l].stability, 2)}`).join(' ')}` : ''} · ${ok.length} moves · ${status.trusted ? 'TRUSTED' : `not trusted: ${status.why}`}` });
  log(`calibration: ${status.why}; κ ${JSON.stringify(status.kappa)}`);
  return status;
}

// ---------- level 3: sessions with simulated students whose beliefs live in code (sim/), personas, worlds, the swap test ----------
// The swap test (personalization.md §6.4 B): pairs differ in exactly ONE true trait; personalization is correct when the
// behaviour tied to that trait moves in the predicted direction (sensitivity) and the behaviour tied to other traits
// doesn't (specificity). Each pair: the trait, the two sides (persona overrides), the session's concept, and the metric.
const NULL_TRAITS = { bias: 0, lambda: 1, slip: 0.05, help: 0.1, frustration: { gain: 0.1, budget: 4 }, statedPref: null, repEffect: 0, gotIt: 0.15, wpm: 200 };
const side = (theta, traits = {}, world = 'N') => ({ persona: { id: 'swap', name: 'swap-test student', theta, bugs: 1, world: null, traits: { ...NULL_TRAITS, ...traits } }, world });
export const SWAPS = {
  bias: { trait: 'confidence bias +0.3 vs −0.3', a: side(0, { bias: 0.3, gotIt: 0.6 }), b: side(0, { bias: -0.3, gotIt: 0.05 }), concept: 0, metric: 'confElicit', direction: +1 },
  theta: { trait: 'prior knowledge low (θ −1.2) vs high (θ +1.5)', a: side(-1.2), b: side(1.5), concept: 0, metric: 'workedExample', direction: +1 },
  rep: { trait: 'diagrams help (world C) vs no representation effect (world N)', a: side(-0.3, {}, 'C'), b: side(-0.3, {}, 'N'), concept: 'memory', metric: 'diagramShare', direction: +1 },
  gaming: { trait: 'asks for hints before trying (h 0.6 vs 0.1)', a: side(-0.3, { help: 0.6 }), b: side(-0.3, { help: 0.1 }), concept: 1, metric: 'toldRate', direction: 0 }, // a guard: telling must not rise
  lambda: { trait: 'fast vs slow learner (λ 1.6 vs 0.6)', a: side(-0.5, { lambda: 1.6 }), b: side(-0.5, { lambda: 0.6 }), concept: 0, metric: 'explainAsks', direction: +1 },
  world: { trait: 'productive failure (world B) vs expertise reversal (world A)', a: side(-0.3, {}, 'B'), b: side(-0.3, {}, 'A'), concept: 0, metric: 'tryFirst', direction: +1 },
  // reading.md §9.1 RD6 and RD7: flip the benefit from reading (only the reading share should move), or the reading skill
  // (portions should get shorter, not fewer).
  readBenefit: { trait: 'learns from reading (benefit 1) vs reading-poor (benefit 0)', a: side(-0.3, { readBenefit: 1 }), b: side(-0.3, { readBenefit: 0 }), concept: 0, metric: 'readShare', direction: +1 },
  readSkill: { trait: 'skilled reader (260 wpm, skims 5%) vs weak reader (110 wpm, skims 40%)', a: side(-0.3, { wpm: 260, skim: 0.05 }), b: side(-0.3, { wpm: 110, skim: 0.4 }), concept: 0, metric: 'portionWords', direction: +1 },
};
const BEHAVIOUR = ['confElicit', 'workedExample', 'diagramShare', 'toldRate', 'explainAsks', 'tryFirst', 'genericCheck', 'readShare', 'portionWords'];
/** The tutor's behaviour in a session, from the simulator's perception of each turn (the same perception for every condition). */
function behaviour(logRows, lib) {
  const turns = logRows.filter(l => l.perception), moves = turns.flatMap(l => l.perception.moves), memory = new Set(lib.concepts.filter(c => c.memory).map(c => c.id));
  const first = turns.find(l => l.perception.moves.length || l.perception.asks.type !== 'none');
  const reads = logRows.flatMap(l => (l.effects || []).filter(e => e.read).map(e => e.read));
  const readSeconds = reads.reduce((n, r) => n + (r.seconds || 0), 0), talkSeconds = turns.length * 20; // ponytail: 20 s per exchange, until the stand-in logs spoken time
  return {
    confElicit: share(turns.map(l => l.perception.asksConfidence)), genericCheck: share(turns.map(l => l.perception.genericCheck)),
    workedExample: share(turns.map(l => l.perception.moves.some(m => m.kind === 'worked_example'))), toldRate: share(turns.map(l => l.perception.moves.some(m => m.kind === 'told'))),
    diagramShare: mean([share(moves.filter(m => memory.has(m.concept)).map(m => m.rep === 'diagram'))]) ?? 0,
    explainAsks: share(turns.map(l => ['explain', 'predict'].includes(l.perception.asks.type))),
    tryFirst: first ? (first.perception.moves.some(m => m.kind === 'try_first') || (['item', 'predict'].includes(first.perception.asks.type) && !first.perception.moves.some(m => ['explain', 'worked_example', 'read'].includes(m.kind))) ? 1 : 0) : 0,
    readShare: readSeconds / ((readSeconds + talkSeconds) || 1),
    readingAvoided: first ? (first.perception.moves.some(m => m.kind === 'read') ? 0 : 1) : null,
    readingOverused: reads.filter((r, i) => (r.words || 0) > 800 && !turns.slice(i + 1, i + 3).some(l => ['item', 'explain', 'predict'].includes(l.perception.asks.type))).length,
    portionWords: reads.length ? mean(reads.map(r => r.words || 0)) / 1000 : 0, // in thousands, so deltas compare with the shares
    // RD8: a reading move whose next tutor turn is another reading move with no question in between (a "homework dump").
    homeworkDump: turns.filter((l, i) => l.perception.moves.some(m => m.kind === 'read') && turns[i + 1]?.perception.moves.some(m => m.kind === 'read') && !['item', 'explain', 'predict'].includes(turns[i + 1].perception.asks.type)).length,
  };
}
/** The held-out unassisted test on the session's concepts, in code: the student's expected success (no answer noise). */
function testScore(lib, student, concepts) {
  const items = lib.tests.filter(t => concepts.includes(lib.skills.find(k => k.id === t.skill)?.concept));
  return mean(items.map(t => { const k = lib.skills.find(x => x.id === t.skill), right = k.solve(t.params); const applies = Object.entries(k.bugs).filter(([id, g]) => student.state.bugs[id] && g(t.params) !== null && String(g(t.params)) !== String(right)).map(([id]) => id); return student.expected({ concept: k.concept, difficulty: k.difficulty(t.params), applies }); }));
}
/** A fresh student restored to a saved state (θ and belief statuses), for the delayed post-test. */
function restored(sim, lib, spec, saved) {
  const s = sim.createStudent({ lib, persona: spec.persona, world: spec.world, seed: spec.seed, focus: [spec.concept] });
  for (const [id, th] of Object.entries(saved.theta || {})) if (s.state.concepts[id]) s.state.concepts[id].theta = th;
  for (const id of Object.keys(s.state.bugs)) if (!(id in (saved.bugs || {}))) delete s.state.bugs[id];
  for (const [id, st] of Object.entries(saved.bugs || {})) s.state.bugs[id] = { ...(s.state.bugs[id] || { pFire: 0.9 }), status: st };
  return s;
}
const DELAY_DAYS = 3;
async function level3(app, { grams, index }) {
  const sim = await import('./sim/core.mjs'), { runFixed } = await import('./sim/fixed.mjs'), lib = await import(path.join(FX.dir, 'beliefs.mjs'));
  // --engine notes: the same engine with no course model (LUNA_COURSE_MODEL=off on the sandbox server, dev-only): the lead's
  // level-3 ablation, course model against notes only, at the same model and latency budget.
  const engine = opt('--engine', 'course-model');
  const seeds = (opt('--seeds', '1')).split(',').map(Number), condition = opt('--condition', 'full'), turns = Math.min(12, Number(opt('--turns')) || 8), parallel = Math.max(1, Number(opt('--parallel')) || 2);
  const conceptOf = c => typeof c === 'number' ? lib.concepts[c]?.id ?? lib.concepts[0].id : c === 'memory' ? (lib.concepts.find(x => x.memory) ?? lib.concepts[0]).id : c;
  // The sessions: swap pairs (both sides, every seed), or personas (with their null twins when --twins).
  const specs = [];
  if (has('--swap')) for (const name of opt('--swap').split(',')) { const pair = SWAPS[name]; if (!pair) throw Error(`no swap pair ${name}`); for (const seed of seeds) for (const sideName of ['a', 'b']) specs.push({ id: `${name}-${sideName}-s${seed}`, pair: name, side: sideName, seed, concept: conceptOf(pair.concept), ...pair[sideName] }); }
  // --concept: ids or indices, comma-separated (one session per persona, seed and concept).
  // --worlds A,B,C,N: every session in every listed world (balanced; the engine never sees the world), overriding a
  // persona's own world (a null twin's N included), so each world gets the same personas, seeds and concepts.
  // The world innermost: consecutive sessions cover every world, so an interim look sees all of them early (order only).
  else for (const cc of opt('--concept', '0').split(',')) for (const pid of (opt('--personas', 'P4,P1')).split(',')) for (const seed of seeds) for (const twin of has('--twins') ? [false, true] : [false]) for (const w of opt('--worlds')?.split(',') ?? [null]) { const persona = sim.personaOf(pid, { twin }), concept = /^\d+$/.test(cc) ? conceptOf(Number(cc)) : conceptOf(cc); specs.push({ id: `${persona.id}-s${seed}${opt('--concept', '0').includes(',') ? `-${concept}` : ''}${w ? `-w${w}` : ''}`, persona: w ? { ...persona, world: w } : persona, world: w ?? persona.world ?? opt('--world', 'N'), seed, concept }); }
  log(`level 3 (${condition}) on ${FX.name}: ${specs.length} simulated sessions, ${condition === 'full' ? `${turns} turns, ${parallel} at a time` : 'the fixed sequence in code'}`);
  const titles = app.services.knowledge.view(app.scope, app.km).topics;
  const topicFor = concept => { const c = lib.concepts.find(x => x.id === concept); return c.topicId ?? titles.find(t => t.title.toLowerCase().includes(c.title.toLowerCase()))?.topicId ?? null; };
  // --slots-file <path>: a cap read before each session starts (the lead's tail back-off lowers it while the run goes on).
  const slotsFile = opt('--slots-file'), cap = () => { if (!slotsFile) return parallel; const v = parseInt(String((() => { try { return readFileSync(slotsFile, 'utf8'); } catch { return ''; } })()).trim(), 10); return Number.isFinite(v) && v > 0 ? Math.min(parallel, v) : parallel; };
  const { timeline } = await import('../common.mjs'), run = pool(cap), slots = Array(parallel).fill(false);
  // A barrier shared by a pair's two arms (separate processes, the same order and parallelism): each marks a session as reached
  // and waits for the other arm to reach it (a session already done marks at once), so both sessions of a pair share the load.
  const BARRIER = opt('--barrier'), ARM = opt('--arm') ?? engine, { mkdir: mkdirB, writeFile: writeB } = await import('node:fs/promises');
  const reached = async id => { if (BARRIER) { await mkdirB(BARRIER, { recursive: true }); await writeB(path.join(BARRIER, `${id}.${ARM}`), ''); } };
  const partner = async id => { if (!BARRIER) return; for (const end = Date.now() + 600_000; Date.now() < end; await new Promise(r => setTimeout(r, 250))) if ((await readdir(BARRIER)).some(f => f.startsWith(`${id}.`) && f !== `${id}.${ARM}`)) return; log(`  ${id}: the other arm never reached it in 10 minutes; starting alone`); };
  // A session the server never ran (it failed to start, or no turn happened) is an infrastructure failure, not a result:
  // nothing is written for it (a rerun retries it), and three in a row stop the run instead of burning the queue.
  let failedInARow = 0;
  // --paired: both arms of every session in one shared queue (course model, notes, course model, notes…) across the slots,
  // each arm writing to its own run folder (<run>-cm, <run>-notes): both see the same load and no fast session idles (the lead).
  // --stage1: the first stage of a two-stage pair: the first seed, no null twins (every world, persona and concept covered).
  const PAIRED = has('--paired'), ARMS = PAIRED ? ['course-model', 'notes'] : [engine], armName = a => a === 'notes' ? 'notes' : 'cm', runOf = a => PAIRED ? `${RUN}-${armName(a)}` : RUN;
  const staged = has('--stage1') ? specs.filter(sp => sp.seed === seeds[0] && !String(sp.persona?.id ?? '').endsWith('-twin')) : specs;
  const tasks = staged.flatMap(spec => ARMS.map(arm => ({ spec, arm })));
  if (PAIRED || has('--stage1')) log(`  ${tasks.length} sessions${PAIRED ? ` (${staged.length} pairs, the arms alternating in one queue)` : ''}${has('--stage1') ? ', stage 1' : ''}`);
  const rows = await Promise.all(tasks.map(({ spec, arm }) => run(async () => {
    const dir = path.join(runOf(arm), 'level3', spec.id), file = path.join(dir, 'result.json'), done = await readJson(file, null);
    if (done) { await reached(spec.id); return done; }
    await reached(spec.id); await partner(spec.id); // --barrier <dir> --arm <name>: a pair's two arms start each session together
    if (failedInARow >= 3) return { id: spec.id, error: 'not run: the sandbox server failed three sessions in a row' };
    const concepts = [spec.concept], s0 = sim.createStudent({ lib, persona: spec.persona, world: spec.world, seed: spec.seed, focus: concepts }), pre = testScore(lib, s0, concepts), start = Object.fromEntries(Object.entries(s0.state.concepts).map(([id, c]) => [id, c.theta]));
    let saved, logRows = [], record = null, runDir = null, incidentOnly = false;
    if (condition === 'fixed') {
      runFixed({ lib, student: s0, concepts });
      saved = { theta: Object.fromEntries(Object.entries(s0.state.concepts).map(([id, c]) => [id, c.theta])), bugs: Object.fromEntries(Object.entries(s0.state.bugs).map(([id, b]) => [id, b.status])) };
    } else {
      // The live tutor: evals/stand-in.mjs (the local actor, never ElevenLabs) on a sandbox server, with this student.
      const slot = slots.indexOf(false); slots[slot] = true; // a port per running session, freed when it ends
      const myPort = Number(process.env.UNDERSTANDING_PORT || 5199) + slot, cfg = path.join(dir, 'student-config.json'), out = path.join(dir, 'student.json'), scenario = path.join(dir, `l3-${runId}${PAIRED ? `-${armName(arm)}` : ''}-${spec.id}.json`), c = lib.concepts.find(x => x.id === spec.concept);
      await writeJson(cfg, { fixture: FX.name, course: FX.course, persona: spec.persona, world: spec.world, seed: spec.seed, concepts, out, hold: true, checkBack: true, ...(has('--hedge-checks') ? { hedgeChecks: true } : {}) });
      await writeJson(scenario, { title: `understanding L3 ${spec.id}: ${c.title}`, examId: app.examId, persona: spec.persona.name, lines: [`hi, can we work on ${c.title.toLowerCase()}?${spec.persona.traits?.statedPref ? ` ${spec.persona.traits.statedPref}` : ''}`] });
      const before = new Set(await readdir(path.join(ROOT, 'evals', 'runs')).catch(() => [])), topicId = topicFor(spec.concept);
      const code = await new Promise(resolve => {
        const logFd = openSync(path.join(dir, 'stand-in.log'), 'w');
        const child = spawn(process.execPath, ['--no-warnings', 'evals/stand-in.mjs', scenario, '--turns', String(turns), '--no-judge', '--student', path.join(HERE, 'sim', 'student.mjs'), '--data', sandboxDir(), '--port', String(myPort), '--keep', ...(topicId ? ['--topic', topicId] : [])],
          { cwd: ROOT, env: { ...process.env, UNDERSTANDING_STUDENT: cfg, UNDERSTANDING_ACTOR_LOG: '1', ...(arm === 'notes' ? { LUNA_COURSE_MODEL: 'off' } : {}) }, stdio: ['ignore', logFd, logFd] });
        child.on('exit', code => { slots[slot] = false; resolve(code); });
      });
      // The stand-in prints its own run directory: read it there (two runs may start the same session id in the same second).
      const printed = (await readFile(path.join(dir, 'stand-in.log'), 'utf8').catch(() => '')).match(/^evals\/runs\/(\S+-cards)\s*$/m)?.[1];
      runDir = printed ?? (await readdir(path.join(ROOT, 'evals', 'runs')).catch(() => [])).filter(d => !before.has(d) && d.includes(`l3-${runId}-${spec.id}-`)).sort().at(-1);
      record = runDir ? await readJson(path.join(ROOT, 'evals', 'runs', runDir, 'run.json'), null) : null;
      const simOut = await readJson(out, null);
      // A simulator crash ends the session early: that is the harness failing, not the tutor (no result is written).
      const simCrash = (record?.problems || []).find(x => /^simulated student:/.test(x));
      // An incident (the actor failed: a timeout, a bad tool call) ends the session early: an infrastructure failure, not a result
      // (the session is rerun); its row as it ended is kept aside (result.incident.json) for the lead's sensitivity line.
      incidentOnly = Boolean(record?.incident && simOut && record.turns?.length && !simCrash);
      if (!incidentOnly && (!record || !simOut || !record.turns?.length || simCrash || record.incident)) {
        const r = { id: spec.id, error: `the session did not run (stand-in exit ${code}${record?.incident ? `; ${clip(String(record.incident), 160)}` : ''}${simCrash ? `; ${clip(simCrash, 160)}` : ''}); see ${path.relative(ROOT, path.join(dir, 'stand-in.log'))}` };
        failedInARow++; await writeJson(path.join(dir, 'error.json'), r); log(`  ${spec.id}: ${r.error}`);
        if (record?.sandbox?.dir && !has('--keep')) await rm(record.sandbox.dir, { recursive: true, force: true }); // the session's throwaway copy of the sandbox
        return r;
      }
      failedInARow = incidentOnly ? failedInARow + 1 : 0;
      logRows = simOut.log;
      saved = { theta: Object.fromEntries(Object.entries(simOut.state.concepts).map(([id, x]) => [id, x.theta])), bugs: Object.fromEntries(Object.entries(simOut.state.bugs).map(([id, b]) => [id, b.status])) };
    }
    // The delayed, unassisted post-test (O1): the student as the session left it, DELAY_DAYS later (forgetting, beliefs returning).
    const after = restored(sim, lib, spec, saved), post = testScore(lib, after, concepts); after.delay(DELAY_DAYS, { start }); const delayed = testScore(lib, after, concepts);
    const row = { id: spec.id, pair: spec.pair ?? null, side: spec.side ?? null, persona: spec.persona.id, name: spec.persona.name, world: spec.world, seed: spec.seed, concept: spec.concept, condition, runDir: runDir && path.join('evals', 'runs', runDir),
      pre, post, delayed, gain: delayed - pre, immediateGain: post - pre, start: { theta: start, bugs: Object.keys(s0.state.bugs) }, end: saved };
    if (condition === 'full') {
      const plato = record.events.filter(e => e.kind === 'plato'), students = record.events.filter(e => e.kind === 'student'), speech = plato.map(e => e.text).join('\n');
      const words = t => (String(t).toLowerCase().match(/[a-z]{3,}/g) || []).length, verdicts = logRows.map(l => l.verdict).filter(Boolean);
      // Rows marked dropped were decided but never said (a late card came while the student typed): perceptions count, content doesn't.
      const answers = logRows.filter(l => !l.dropped && l.content?.act === 'answer'), refuted = logRows.flatMap((l, i) => (l.effects || []).filter(e => e.refuted).map(e => ({ bug: e.refuted, i })));
      const nextAfter = refuted.map(r => { const a = logRows.slice(r.i + 1).find(l => !l.dropped && l.content?.act === 'answer'); return a ? (a.content.isRight ? 1 : 0) : null; }).filter(x => x !== null);
      const hold = logRows.findIndex(l => !l.dropped && l.content?.act === 'hold'), holdAt = hold >= 0 ? students.find(e => e.text.startsWith('give me a second'))?.at : null, holdNext = holdAt ? students.find(e => e.at > holdAt)?.at ?? Infinity : null;
      const mastery = logRows.findIndex(l => l.state && concepts.every(c => (l.state.theta[c] ?? -9) >= 1) && Object.values(l.state.bugs || {}).every(b => b !== 'active'));
      Object.assign(row, {
        turns: record.turns.length, incident: record.incident ?? null, dropped: logRows.filter(l => l.dropped).length,
        // The lead's process metrics (lib.mjs processMetrics): draw-outs per answer, answer → substantive move, stated beliefs matched, enacted levels.
        process: processMetrics(record, logRows),
        // O2: success against telling: the delayed unassisted score (row.delayed) against the share of turns where the tutor told an answer.
        O2: { delayed, told: share(logRows.filter(l => l.perception).map(l => l.perception.moves.some(m => m.kind === 'told'))), answeredRight: share(answers.map(l => l.content.isRight)) },
        O3: words(students.map(e => e.text).join(' ')) / (words(speech) || 1),
        lectureTurns: share(plato.map(e => (e.text.match(/\S+/g) || []).length > 80)), // reading.md RD3: spoken exposition over 80 words
        // Voice §10 E2 (read-aloud): Plato utterances sharing a 5-word run with the page as it was when he spoke (code tokens left out).
        readAloud: share(plato.map(e => { const board = record.events.filter(b => b.kind === 'board' && b.at <= e.at).at(-1); if (!board?.text) return false; const words = t => (String(t).replace(/`[^`]*`|\$[^$]*\$/g, ' ').toLowerCase().match(/[a-z]+/g) || []); const page = words(board.text), said = words(e.text), grams = new Set(page.map((_, i) => page.slice(i, i + 5).join(' ')).filter(g => g.split(' ').length === 5)); return said.some((_, i) => i + 5 <= said.length && grams.has(said.slice(i, i + 5).join(' '))); })),
        O4: { requests: logRows.filter(l => l.content?.act === 'help').length, firstTold: logRows.findIndex(l => l.perception?.moves.some(m => m.kind === 'told')) },
        O5: { verdicts: verdicts.length, overValidation: share(verdicts.map(v => v.overValidation)), overRejection: share(verdicts.map(v => v.overRejection)) },
        O7: { remediations: refuted.length, nextCorrect: mean(nextAfter) },
        O8: { turnsToMastery: mastery >= 0 ? mastery + 1 : null, frustration: logRows.filter(l => ['frustrated', 'help'].includes(l.content?.act)).length },
        O9: { actorMedianMs: record.checks?.actorMs?.median ?? null, nextCardMedianMs: record.checks?.cards?.medianNextCardMs ?? null },
        refuted: [...new Set(refuted.map(r => r.bug))], repaired: Object.entries(saved.bugs).filter(([, st]) => st === 'repaired').map(([id]) => id),
        behaviour: behaviour(logRows, lib), phrasingKept: share(logRows.filter(l => l.by).map(l => l.kept)),
        // How much of the tutor's questioning the belief library answers in code (the rest is "open": correctness still decided in code).
        coverage: share(logRows.filter(l => ['answer', 'attempt'].includes(l.content?.act)).map(l => l.content.act === 'answer')),
        // Phase C (domain-generality §8.2): each planted belief, identified within how many of the tutor's probes (questions)?
        identified: Object.keys(saved.bugs).map(id => {
          let probes = 0;
          for (const l of logRows.filter(x => x.perception)) {
            if (['item', 'explain', 'predict'].includes(l.perception.asks.type)) probes++;
            if ((l.perception.identified || []).includes(id) || l.perception.refutes.some(r => r.bugId === id && r.targeted)) return { id, detector: lib.bugs.find(b => b.id === id)?.detector?.type ?? 'execute', probes, within3: probes <= 3 };
          }
          return { id, detector: lib.bugs.find(b => b.id === id)?.detector?.type ?? 'execute', probes: null, within3: false };
        }),
        hold: hold >= 0 ? { asked: true, newCard: record.events.some(e => e.kind === 'server' && e.type === 'card.issued' && e.at > holdAt && e.at < holdNext) } : { asked: false },
        regurgitation: regurgitation(speech, grams), paraphrase: paraphrase(speech, index),
        // Spec §15b: each tutor turn's move families (the perception) and the elements its cards put on the page (the
        // card's board kind, or the element's kind); the enacted engagement level comes from the page's evidence events.
        elements: (() => {
          // What went on the stand-in page (stage's `render` records; older runs: the card's board), the card's declared move
          // family (stage's `card` records, card v2) plus the perceived moves, and the page's element evidence.
          const legacy = record.events.filter(e => e.kind === 'server' && e.type === 'card.issued').map(e => ({ at: e.at, what: e.payload?.card?.board?.kind === 'element' ? `element:${e.payload.card.board.element?.kind}` : e.payload?.card?.board?.kind ?? null }));
          const rendered = record.events.filter(e => e.kind === 'render'), onPage = (rendered.length ? rendered : legacy).filter(c => c.what && c.what !== 'markdown'), declared = record.events.filter(e => e.kind === 'card');
          const turnsP = logRows.filter(l => l.perception), times = students.map(e => e.at);
          const rows = turnsP.map((l, i) => { const inTurn = x => x.at > (times[i] ?? 0) && x.at <= (times[i + 1] ?? Infinity);
            return { moves: [...new Set([...declared.filter(inTurn).map(c => c.move), ...l.perception.moves.map(m => m.kind)].filter(Boolean))], kinds: [...new Set(onPage.filter(inTurn).map(c => c.what))] }; });
          const byMove = {};
          for (const r of rows) for (const m of r.moves) { byMove[m] ??= { turns: 0, withElement: 0, kinds: [] }; byMove[m].turns++; if (r.kinds.length) { byMove[m].withElement++; byMove[m].kinds = [...new Set([...byMove[m].kinds, ...r.kinds])]; } }
          const ev = record.events.filter(e => e.kind === 'evidence').map(e => e.event || {}), enacted = ev.filter(x => x.type === 'enacted_level').map(x => x.level ?? x.value ?? null).filter(v => v != null);
          const byType = {}; for (const x of ev) byType[x.type] = (byType[x.type] || 0) + 1;
          return { turnsWithElement: share(rows.map(r => r.kinds.length > 0)), byMove, enactedLevel: enacted.at(-1) ?? null, enactedLevels: enacted, evidence: byType, waits: declared.filter(c => c.wait).length };
        })(),
        // Reading as a teaching mode (stage's ReadingEvent at each reading's end): framed with a purpose, timed, the tutor quiet.
        reading: (() => { const ends = record.events.filter(e => e.kind === 'reading' && e.phase === 'end').map(e => e.event || {}); if (!ends.length) return null;
          return { n: ends.length, purposeSaid: share(ends.map(x => !!x.framing?.purposeSaid)), minutesSaid: share(ends.map(x => !!x.framing?.minutesSaid)), prequestions: share(ends.map(x => (Array.isArray(x.framing?.prequestions) ? x.framing.prequestions.length : Number(x.framing?.prequestions) || 0) > 0)),
            tutorWordsDuring: mean(ends.map(x => x.reading?.tutorWordsDuring ?? 0)), timeRatio: mean(ends.map(x => x.reading?.expectedMs ? x.reading.activeMs / x.reading.expectedMs : null).filter(v => v != null)) }; })(),
        // Deixis (voice E3, E7, E8): every point_to resolved against what is on the page, at the finest granularity it had.
        pointing: (() => { const ps = record.events.filter(e => e.kind === 'point'); if (!ps.length) return null; const g = {}; for (const p of ps) g[p.granularity] = (g[p.granularity] || 0) + 1; return { n: ps.length, resolved: share(ps.map(p => p.resolved)), granularity: g }; })(),
        // Model recovery (learner v2, spec §10–11): its estimate at the session's end, read from the session's own data,
        // against the simulated truth. Caveat: the learner anchors θ to the course model's item difficulties and the
        // simulator to its own, so an offset between them shows up in the error; coverage is per observed KC.
        recovery: await (async () => {
          const dir = record.sandbox?.dir; if (!dir || !existsSync(path.join(dir, 'backend.db'))) return null;
          let s2; try { s2 = await openApp(null, { dir, examId: app.examId }); } catch { return null; }
          try {
            const L = s2.services.learner, cm = (() => { try { return s2.services.understanding?.courseModel?.(s2.scope); } catch { return null; } })(), tid = topicFor(spec.concept);
            if (!L?.state || !cm?.kcs) return null;
            const kcs = cm.kcs.filter(k => k.topicId === tid).map(k => { try { return L.state(s2.scope, k.id); } catch { return null; } }).filter(Boolean);
            // This session's observations (learner v2's rows) on the topic's KCs; unaided as v2.mjs defines it. The lead: score
            // recovery only with ≥ 5 unaided observations, against θ_true when the last one was made (the student keeps learning).
            const ids = new Set(cm.kcs.filter(k => k.topicId === tid).map(k => k.id)), obs = s2.db.find('learner_observations', {}, { scope: s2.scope }).filter(r => r.v === 2 && r.kind === 'observe' && (!record.sessionId || !r.sessionId || r.sessionId === record.sessionId));
            const unaided = obs.filter(r => r.kcs?.some(k => ids.has(k)) && r.outcome != null && r.rank <= 3 && !r.assistance && r.enacted !== 'viewing' && r.family !== 'E10');
            const lastAt = unaided.length ? Math.max(...unaided.map(r => Date.parse(r.createdAt))) : null, before = lastAt ? students.filter(e => e.at <= lastAt).at(-1) : null;
            const atRow = before ? logRows.find(l => !l.dropped && l.line === before.text && l.state) : null;
            // The share of learner attempts (answers and attempts on the page) that produced an observation, by response id.
            const attempts = students.filter(e => ['answer', 'attempt'].includes(e.meta?.act) && e.responseId), seen = new Set(obs.map(r => r.responseId).filter(Boolean));
            return { truth: saved.theta[spec.concept], truthAtLast: atRow?.state?.theta?.[spec.concept] ?? null, unaided: unaided.length, observations: obs.length, attempts: attempts.length, attemptsObserved: attempts.filter(e => seen.has(e.responseId)).length, unobserved: attempts.filter(e => !seen.has(e.responseId)).map(e => ({ responseId: e.responseId, act: e.meta?.act ?? null, text: clip(e.text, 120), at: e.at })), observed: kcs.filter(k => k.source === 'observed').map(k => ({ kcId: k.kcId, theta: k.theta, sigma: k.sigma, n: k.n })), inferred: kcs.filter(k => k.source !== 'observed').length,
              holds: Object.values(saved.bugs || {}).some(b => b === 'active'), confirmed: kcs.flatMap(k => (k.operative || []).filter(w => w.status === 'confirmed').map(w => w.wrongModelId)) };
          } finally { s2.close(); }
        })(),
        latency: (() => { const xs = record.turns.map(t => t.firstReplyMs).filter(Number.isFinite).sort((a, b) => a - b); return { firstReplyP50: xs[Math.floor(xs.length * 0.5)] ?? null, firstReplyP95: xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))] ?? null }; })(),
      });
    }
    const kept = path.join(dir, 'result.incident.json'); // the first time it ended early, if it is rerun more than once
    if (!incidentOnly) await writeJson(file, row); else if (!existsSync(kept)) await writeJson(kept, row);
    // Each session's copy of the sandbox (~100 MB) is read above (the learner model) and then removed: hundreds would fill the disk.
    if (record?.sandbox?.dir && !has('--keep')) await rm(record.sandbox.dir, { recursive: true, force: true });
    if (incidentOnly) { const r = { id: spec.id, error: `the session ended early on an actor incident (${clip(String(record.incident), 160)}): rerun it; the row as it ended is in result.incident.json` }; await writeJson(path.join(dir, 'error.json'), r); log(`  ${spec.id}: ${r.error}`); return r; }
    log(`  ${spec.id}: gain ${fix(row.gain)} (pre ${fix(pre)} → post ${fix(post)} → +${DELAY_DAYS}d ${fix(delayed)})${row.behaviour ? ` · ${BEHAVIOUR.map(m => `${m} ${fix(row.behaviour[m])}`).join(' ')}` : ''}${row.hold?.asked ? ` · hold ${row.hold.newCard ? 'VIOLATED (new card)' : 'respected'}` : ''}`);
    return row;
  })));
  if (!PAIRED) return summarizeArm(rows, engine, RUN, runId);
  for (const arm of ARMS) { const rs = rows.filter((r, i) => tasks[i].arm === arm), res = await summarizeArm(rs, arm, runOf(arm), `${runId}-${armName(arm)}`); await writeJson(path.join(runOf(arm), 'summary.json'), { fixture: FX.name, against, level3: res }); }
  return { metrics: null }; // each arm's summary is in its own run folder
 async function summarizeArm(rows, engine, RUN, runId) {
  const ok = rows.filter(r => !r.error), full = ok.filter(r => r.condition === 'full');
  // The swap test: per pair, the mean difference (side a − side b) of every behaviour metric over seeds.
  const swaps = {};
  for (const name of [...new Set(ok.map(r => r.pair).filter(Boolean))]) {
    const pair = SWAPS[name], A = full.filter(r => r.pair === name && r.side === 'a'), B = full.filter(r => r.pair === name && r.side === 'b');
    if (!A.length || !B.length) continue;
    const delta = Object.fromEntries(BEHAVIOUR.map(m => [m, mean(A.map(r => r.behaviour[m])) - mean(B.map(r => r.behaviour[m]))]));
    const others = BEHAVIOUR.filter(m => m !== pair.metric).map(m => Math.abs(delta[m] ?? 0));
    swaps[name] = { trait: pair.trait, metric: pair.metric, delta: delta[pair.metric], sensitive: pair.direction === 0 ? Math.abs(delta[pair.metric]) <= 0.1 : Math.sign(delta[pair.metric]) === pair.direction && Math.abs(delta[pair.metric]) >= 0.1, specific: Math.max(0, ...others) <= 0.15, maxOther: Math.max(0, ...others), seeds: A.length, deltas: delta, gain: { a: mean(A.map(r => r.gain)), b: mean(B.map(r => r.gain)) } };
  }
  const byWorld = Object.fromEntries([...new Set(ok.map(r => r.world))].sort().map(w => [w, { n: ok.filter(r => r.world === w).length, gain: mean(ok.filter(r => r.world === w).map(r => r.gain)) }]));
  const metrics = {
    byWorld, sessions: ok.length, failed: rows.length - ok.length, condition: condition === 'full' && engine === 'notes' ? 'notes-engine' : condition, engine,
    // Turns to diagnosis: the tutor's probes until a planted belief was identified (Phase C), over the beliefs it found.
    probesToDiagnosis: mean(full.flatMap(r => (r.identified || []).map(x => x.probes).filter(Number.isFinite))), foundShare: share(full.flatMap(r => (r.identified || []).map(x => Number.isFinite(x.probes)))),
    gain: mean(ok.map(r => r.gain)), pre: mean(ok.map(r => r.pre)), delayed: mean(ok.map(r => r.delayed)),
    ...(full.length ? {
      told: mean(full.map(r => r.O2.told)), generation: mean(full.map(r => r.O3)), overValidation: mean(full.map(r => r.O5.overValidation)), overRejection: mean(full.map(r => r.O5.overRejection)), nextCorrect: mean(full.map(r => r.O7.nextCorrect)),
      refuted: full.reduce((n, r) => n + r.refuted.length, 0), repaired: full.reduce((n, r) => n + r.repaired.length, 0), beliefs: full.reduce((n, r) => n + r.start.bugs.length, 0),
      turnsToMastery: full.map(r => r.O8.turnsToMastery ?? '–').join('/'), frustration: mean(full.map(r => r.O8.frustration)), readShare: mean(full.map(r => r.behaviour.readShare)), readingAvoided: mean(full.map(r => r.behaviour.readingAvoided)),
      elementTurns: mean(full.map(r => r.elements?.turnsWithElement)),
      recovery: (() => { const all = full.map(r => r.recovery).filter(Boolean), rs = all.filter(x => x.unaided >= 5 && x.observed?.length && x.truthAtLast != null), kcs = rs.flatMap(x => x.observed.map(k => ({ ...k, truth: x.truthAtLast }))), clean = all.filter(x => !x.holds);
        const att = all.reduce((n, x) => n + (x.attempts || 0), 0);
        return { sessions: rs.length, excluded: all.length - rs.length, kcs: kcs.length, rmse: kcs.length ? Math.sqrt(mean(kcs.map(k => (k.theta - k.truth) ** 2))) : null, bias: mean(kcs.map(k => k.theta - k.truth)), coverage: share(kcs.map(k => Math.abs(k.theta - k.truth) <= 1.28 * k.sigma)), falseConfirmations: clean.filter(x => x.confirmed.length).length, cleanSessions: clean.length,
          attempts: att, attemptsObserved: att ? all.reduce((n, x) => n + (x.attemptsObserved || 0), 0) / att : null }; })(),
      readingFramed: mean(full.map(r => r.reading?.purposeSaid).filter(v => v != null)), tutorWordsDuringReading: mean(full.map(r => r.reading?.tutorWordsDuring).filter(v => v != null)), pointResolved: mean(full.map(r => r.pointing?.resolved).filter(v => v != null)),
      enacted: full.map(r => r.elements?.enactedLevel).filter(v => v != null), process: processSummary(full.map(r => r.process)), firstReplyP50: mean(full.map(r => r.latency?.firstReplyP50)), firstReplyP95: Math.max(0, ...full.map(r => r.latency?.firstReplyP95 ?? 0)) || null,
      elementsByMove: full.reduce((acc, r) => { for (const [m, v] of Object.entries(r.elements?.byMove || {})) { acc[m] ??= { turns: 0, withElement: 0, kinds: [] }; acc[m].turns += v.turns; acc[m].withElement += v.withElement; acc[m].kinds = [...new Set([...acc[m].kinds, ...v.kinds])]; } return acc; }, {}),
      readAloud: mean(full.map(r => r.readAloud)), readingOverused: full.reduce((n, r) => n + r.behaviour.readingOverused, 0), homeworkDumps: full.reduce((n, r) => n + (r.behaviour.homeworkDump || 0), 0), lectureTurns: mean(full.map(r => r.lectureTurns)), identifiedWithin3: Object.fromEntries([...new Set(full.flatMap(r => (r.identified || []).map(x => x.detector)))].map(t => [t, share(full.flatMap(r => r.identified.filter(x => x.detector === t).map(x => x.within3)))])),
      holdViolations: full.filter(r => r.hold?.newCard).length, holdChecks: full.filter(r => r.hold?.asked).length, phrasingKept: mean(full.map(r => r.phrasingKept)), coverage: mean(full.map(r => r.coverage)),
      regurgitation: full.reduce((n, r) => n + r.regurgitation.copied, 0) / (full.reduce((n, r) => n + r.regurgitation.words, 0) || 1), actorMs: mean(full.map(r => r.O9.actorMedianMs)), nextCardMs: mean(full.map(r => r.O9.nextCardMedianMs)),
    } : {}),
    swaps,
  };
  await writeJson(path.join(RUN, 'level3', 'summary.json'), { metrics, sessions: rows.map(r => r.error ? r : (({ start, end, ...x }) => x)(r)) });
  const swapLine = Object.entries(swaps).map(([n, w]) => `${n}: Δ${w.metric} ${fix(w.delta)} (${w.sensitive ? 'sensitive' : 'NOT sensitive'}, ${w.specific ? 'specific' : `not specific, max other Δ ${fix(w.maxOther)}`}, ${w.seeds} seeds)`).join('; ');
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, level: `3 sessions (${condition})`, against,
    prompts: condition === 'fixed' ? 'fixed sequence (code), sim/core' : `stand-in actor (${await settingOf('light')}) + the director as built; sim perceive (${await settingOf('heavy', 'medium')}), phrase + check (${await settingOf('light')}); ${(await import('./sim/perceive.mjs')).PERCEIVE_VERSION}, ${(await readFile(path.join(HERE, 'sim', 'student.mjs'), 'utf8').catch(() => '')).match(/STUDENT_VERSION = '([^']+)'/)?.[1] ?? 'sim_student_v2'}`,
    metrics: `O1 unassisted delayed gain ${fix(metrics.gain)} (pre ${fix(metrics.pre)} → +${DELAY_DAYS}d ${fix(metrics.delayed)})${Object.keys(byWorld).length > 1 ? ` [${Object.entries(byWorld).map(([w, x]) => `${w} ${fix(x.gain)}`).join(', ')}]` : ''}${full.length && metrics.process?.answers ? ` · draw-outs per answer ${fix(metrics.process.drawOutsMean)} (max ${metrics.process.drawOutsMax}, over one ${pct(metrics.process.overOne)}) · answer → substantive move p50 ${Math.round(metrics.process.answerToMoveP50 / 100) / 10} s, p95 ${Math.round(metrics.process.answerToMoveP95 / 100) / 10} s · stated beliefs matched ${pct(metrics.process.statedMatched)} (${metrics.process.stated}; perceived ${pct(metrics.process.statedPerceived)}) · enacted ${JSON.stringify(metrics.process.enacted)} · verdicts spoken ${metrics.process.verdictsSpoken}, unbacked ${metrics.process.unbackedVerdicts.length}, wrong ${metrics.process.wrongVerdicts.length} · false diagnoses ${pct(metrics.process.falseDiagnosisRate)} of turns` : ''}${full.length ? ` · told ${pct(metrics.told)} · generation ratio ${fix(metrics.generation)} · over-validation ${pct(metrics.overValidation)}, over-rejection ${pct(metrics.overRejection)} · next item after remediation ${pct(metrics.nextCorrect)} · beliefs refuted ${metrics.refuted}/${metrics.beliefs}, repaired ${metrics.repaired}, identified within 3 probes ${Object.entries(metrics.identifiedWithin3 || {}).map(([t, v]) => `${t} ${pct(v)}`).join(', ') || '–'} · turns to mastery ${metrics.turnsToMastery} · reading ${pct(metrics.readShare)} of time, avoided at first contact ${pct(metrics.readingAvoided)}, overused ${metrics.readingOverused}, homework dumps ${metrics.homeworkDumps} · lecture turns (> 80 words) ${pct(metrics.lectureTurns)} · read-aloud ${pct(metrics.readAloud)} · turns with an element ${pct(metrics.elementTurns)} · first reply p50 ${metrics.firstReplyP50 ? Math.round(metrics.firstReplyP50) : '–'} ms, p95 ${metrics.firstReplyP95 ?? '–'} ms (stand-in) · hold violations ${metrics.holdViolations}/${metrics.holdChecks} · phrasing kept ${pct(metrics.phrasingKept)} · library coverage ${pct(metrics.coverage)} · speech regurgitation ${pct(metrics.regurgitation)}` : ''}${swapLine ? ` · swap ${swapLine}` : ''} · ${metrics.sessions} sessions${metrics.failed ? ` (${metrics.failed} failed)` : ''}` });
  return { metrics, sessions: rows };
 }
}

// ---------- Studies in the sandbox (built once, cached there) ----------
async function buildStudies(app, topics) {
  const u = app.services.understanding;
  if (!u?.build) throw Error('app.services.understanding.build is not there yet');
  for (const t of topics) { // one at a time: each build is several deep calls at high effort
    if (u.get(app.scope, t.topicId)?.current) continue;
    log(`building the Study of ${t.title} in the sandbox (backend/understanding, its own settings)…`);
    await u.build(app.scope, t.topicId).catch(error => log(`  failed: ${error.message}`));
  }
}
/** Copies the `studies` rows of another sandbox's backend.db (read only) into ours: Studies built elsewhere, tested here. */
async function importStudies(app, from) {
  const { DatabaseSync } = await import('node:sqlite');
  const src = new DatabaseSync(path.resolve(from), { readOnly: true });
  try {
    const cols = app.db.prepare('PRAGMA table_info(studies)').all().map(c => c.name), have = new Set(src.prepare('PRAGMA table_info(studies)').all().map(c => c.name));
    const use = cols.filter(c => have.has(c)), rows = src.prepare(`SELECT ${use.join(', ')} FROM studies WHERE exam_id = ?`).all(app.examId);
    const put = app.db.prepare(`INSERT OR REPLACE INTO studies (${use.join(', ')}) VALUES (${use.map(() => '?').join(', ')})`);
    for (const r of rows) put.run(...use.map(c => r[c]));
    log(`imported ${rows.length} Studies from ${from}`);
  } finally { src.close(); }
}

/** Re-applies the checks of a fixture's frozen probe files with the current comparison code (no model calls). */
async function recheck() {
  const dir = path.join(FX.frozen, 'probes');
  for (const file of (await readdir(dir).catch(() => [])).filter(f => f.endsWith('.json'))) {
    const f = await readJson(path.join(dir, file)), before = f.probes.length;
    for (const w of f.wrongModels) {
      const c = w.produces.check;
      if (!c || c.kind === 'none') { w.verified = 'model'; continue; }
      try { const ran = await runCheck(c); w.ran = ran; w.verified = (sameValue(ran, w.produces.wrongAnswer) || statedIn(ran, w.produces.wrongAnswer)) && !sameValue(w.produces.wrongAnswer, w.produces.rightAnswer) ? 'run' : 'mismatch'; }
      catch (error) { w.verified = 'model'; w.checkFailed = clip(error.message, 160); }
    }
    const probes = [], dropped = [];
    for (const { checked, ran, why, ...p } of [...f.probes, ...f.dropped]) { const r = await checkProbe(p); (r.keep ? probes : dropped).push(r.probe); }
    const order = id => Number(String(id).replace(/\D/g, '')) || 0;
    f.probes = probes.sort((a, b) => order(a.id) - order(b.id)); f.dropped = dropped; f.recheckedAt = new Date().toISOString();
    await writeJson(path.join(dir, file), f);
    log(`${f.title}: ${before} → ${probes.length} probes kept (${probes.filter(p => p.checked === 'run').length} by running); wrong models confirmed by running ${f.wrongModels.filter(w => w.verified === 'run').length}/${f.wrongModels.length}`);
  }
}

/**
 * Builds a files fixture's course in the sandbox through the real path: an exam, its files uploaded and finalized, then
 * the knowledge pipeline and the module writer run in this process (events dispatched; only this exam's build jobs run,
 * 3 at a time; everything else queued is cancelled). Questions, Studies and lessons are not built here.
 */
const BUILD_JOBS = new Set(['extract_source', 'interpret_source', 'build_graph', 'refine_knowledge', 'publish_knowledge', 'invalidate_dependencies', 'build_modules']);
async function buildFixture(app) {
  if (FX.source.kind !== 'files') throw Error(`fixture ${FX.name} is a ${FX.source.kind} fixture: nothing to build`);
  const { createHash } = await import('node:crypto');
  let examId = app.examId;
  if (!examId) {
    const dir = path.join(FX.dir, FX.source.dir), files = (await readdir(dir)).filter(f => f.endsWith('.md')).sort(), bytes = await Promise.all(files.map(f => readFile(path.join(dir, f))));
    const exam = app.services.exams.create(app.principal, { title: FX.source.title });
    const uploads = app.services.knowledge.createUploads(app.principal, exam.id, files.map((f, i) => ({ filename: f, size: bytes[i].length, declaredMime: FX.source.mime })));
    for (const [i, u] of uploads.entries()) {
      if (!u.uploadToken) throw Error(`${files[i]}: ${u.error?.message ?? u.status}`);
      app.services.knowledge.putUploadBytes(u.uploadToken, bytes[i]);
      app.services.knowledge.finalizeUpload(app.principal, exam.id, u.sourceFileId, { uploadToken: u.uploadToken, checksum: createHash('sha256').update(bytes[i]).digest('hex'), uploadedByteLength: bytes[i].length });
    }
    examId = exam.id;
    await writeJson(path.join(FX.cache, 'exam.json'), { examId, createdAt: new Date().toISOString(), files });
    log(`created exam ${examId} with ${files.length} files; building its course (the knowledge pipeline and the module writer, live)…`);
  }
  const keep = job => job.scope?.examId === examId && BUILD_JOBS.has(job.type);
  const queued = () => app.db.find('jobs', { state: ['queued', 'retry_wait', 'running'] }).filter(keep);
  for (let idle = 0; idle < 3; ) {
    app.events.dispatch();
    if (!queued().length) { idle++; await new Promise(r => setTimeout(r, 1000)); continue; }
    idle = 0;
    await runOnly(app, keep, 3);
    const e = JSON.parse(app.db.prepare('SELECT data FROM exams WHERE id = ?').get(examId).data);
    log(`  exam ${e.status}${e.publishedKnowledgeManifestId ? `, published ${e.publishedKnowledgeManifestId}` : ''}; jobs: ${JSON.stringify(app.db.find('jobs', {}).filter(j => j.scope?.examId === examId).map(j => `${j.type}:${j.state}`).reduce((n, k) => ({ ...n, [k]: (n[k] || 0) + 1 }), {}))}`);
  }
}

// ---------- across fixtures: every metric stratified by domain type, and the no-collapse check ----------
// docs/research/domain-generality.md §8.2: "no collapse" = for every metric, the worst course scores at least 0.8 × the
// best, unless a measured ceiling explains the shortfall. Reads each fixture's newest summary per level and condition.
const COMPARE = { level1: ['understanding', 'accuracy', 'families.specific.accuracy', 'regurgitation', 'claimPrecision'], teach: ['accuracy', 'byKind.T1', 'byKind.T2', 'byKind.T4', 'byKind.T5'], level2: ['pass', 'quality', 'director', 'actor'], level3: ['gain', 'nextCorrect', 'coverage'] };
const LOWER_IS_BETTER = new Set(['regurgitation']);
/** Each fixture's newest result per level and condition: { fixtures, latest: { 'level|condition|fixture': { run, metrics } } }. */
async function latestResults() {
  const dir = path.join(HERE, 'runs'), fixtures = (await readdir(path.join(HERE, 'fixtures'))).filter(f => existsSync(path.join(HERE, 'fixtures', f, 'fixture.json')));
  const { statSync } = await import('node:fs');
  // Oldest first by when each summary was written: the newest result wins below.
  const runs = (await readdir(dir).catch(() => [])).filter(d => existsSync(path.join(dir, d, 'summary.json'))).sort((a, b) => statSync(path.join(dir, a, 'summary.json')).mtimeMs - statSync(path.join(dir, b, 'summary.json')).mtimeMs);
  const latest = {};
  for (const d of runs) {
    const sum = await readJson(path.join(dir, d, 'summary.json'), null), fx = sum?.fixture ?? fixtures.find(f => d.includes(`-${f}-`)) ?? 'cs3410';
    const cond = sum?.against ?? d.match(/-(baseline|studies|model|notes|both)$/)?.[1] ?? 'baseline';
    for (const lvl of ['level1', 'level2', 'level3', 'teach', 'teachCourse', 'precision', 'repair']) if (sum?.[lvl]?.metrics) latest[`${lvl}|${lvl === 'level3' ? sum[lvl].metrics.condition ?? cond : cond}|${fx}`] = { run: d, metrics: sum[lvl].metrics };
  }
  // --pair <base>: the decision reads that pair's runs (<base>-<fx>-cm/-notes) and its level 2 (<base>-l2-<fx>), never a
  // newer smoke or another snapshot's run.
  const pin = opt('--pair');
  if (pin) for (const fx of fixtures) for (const [lvl, cond, d] of [['level2', 'studies', `${pin}-l2-${fx}`], ['level3', 'full', `${pin}-${fx}-cm`], ['level3', 'notes-engine', `${pin}-${fx}-notes`]]) {
    const sum = await readJson(path.join(dir, d, 'summary.json'), null); if (sum?.[lvl]?.metrics) latest[`${lvl}|${cond}|${fx}`] = { run: d, metrics: sum[lvl].metrics }; }
  return { fixtures, latest };
}
async function compare() {
  const { fixtures, latest } = await latestResults();
  const types = Object.fromEntries(await Promise.all(fixtures.map(async f => [f, (await readJson(path.join(HERE, 'fixtures', f, 'fixture.json'))).domainType ?? 'unknown'])));
  const get = (m, key) => key.split('.').reduce((x, k) => x?.[k], m);
  const lines = [], rows = [];
  for (const [lvl, keys] of Object.entries(COMPARE)) for (const cond of ['baseline', 'studies', 'both', 'notes', 'model', 'full', 'notes-engine', 'fixed']) {
    const have = fixtures.filter(f => latest[`${lvl}|${cond}|${f}`]);
    if (!have.length) continue;
    for (const key of keys) {
      const vals = have.map(f => ({ f, type: types[f], v: get(latest[`${lvl}|${cond}|${f}`].metrics, key) })).filter(x => typeof x.v === 'number');
      if (!vals.length) continue;
      const better = LOWER_IS_BETTER.has(key) ? (a, b) => a < b : (a, b) => a > b, best = vals.reduce((a, b) => better(b.v, a.v) ? b : a), worst = vals.reduce((a, b) => better(b.v, a.v) ? a : b);
      const collapse = vals.length > 1 && (LOWER_IS_BETTER.has(key) ? best.v < 0.8 * worst.v && worst.v - best.v > 0.05 : worst.v < 0.8 * best.v);
      rows.push({ level: lvl, condition: cond, metric: key, byType: Object.fromEntries(vals.map(x => [`${x.type} (${x.f})`, +x.v.toFixed(3)])), collapse });
      lines.push(`${lvl} ${cond} ${key}: ${vals.map(x => `${x.type}/${x.f} ${fix(x.v)}`).join(' · ')}${vals.length > 1 ? (collapse ? ` · COLLAPSE (worst ${worst.f} < 0.8 × best ${best.f})` : ' · no collapse') : ' · one domain so far'}`);
    }
  }
  await writeJson(path.join(RUN, 'compare.json'), { at: new Date().toISOString(), rows, sources: latest });
  console.log(lines.join('\n'));
  const collapsed = rows.filter(r => r.collapse);
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, fixture: 'all', level: 'across domains', against: '–', prompts: 'the newest run per fixture, level and condition',
    metrics: `${rows.length} metric rows over ${new Set(rows.flatMap(r => Object.keys(r.byType))).size} fixture results · collapse: ${collapsed.length ? collapsed.map(r => `${r.level}/${r.condition}/${r.metric}`).join(', ') : 'none'} (see compare.json; one domain so far counts as unchecked)` });
}

// ---------- the go/no-go: docs/system-spec.md §17's gates, per fixture, from each fixture's newest results ----------
// Each gate is pass, fail or unmeasured, per fixture (stratified: never only an aggregate). GO only when every gate is
// measured and passes in every fixture. The live app was to be integrated only on GO (the v12 integration contract, now "Interface A" in backend/CONTRACTS.md).
/** The decisive level-3 comparison (spec §17, the decision rule for going live, pre-registered 2026-10-08): a fixture's newest
 *  course-model run against its newest notes-only run, paired by session (the same persona, seed, concept and world). */
async function pairedL3(fx, { truncated = false } = {}) {
  // The newest course-model run of the fixture that has a notes-only run sharing its sessions (a smoke in between pairs with nothing).
  const { statSync } = await import('node:fs'), dir = path.join(HERE, 'runs');
  const runs = (await Promise.all((await readdir(dir)).filter(d => existsSync(path.join(dir, d, 'summary.json'))).map(async d => ({ d, s: await readJson(path.join(dir, d, 'summary.json'), null), t: statSync(path.join(dir, d, 'summary.json')).mtimeMs }))))
    .filter(x => x.s?.fixture === fx && x.s?.level3?.metrics && (!opt('--pair') || [`${opt('--pair')}-${fx}-cm`, `${opt('--pair')}-${fx}-notes`].includes(x.d))).sort((x, y) => y.t - x.t);
  // truncated: a session the harness ended early on an actor incident counts as it ended (its first result, kept aside as
  // result.incident.json when it was rerun), for the lead's sensitivity line; by default the rerun counts.
  const load = async run => { const out = {}; for (const d of await readdir(path.join(dir, run, 'level3')).catch(() => [])) { const r = (truncated ? await readJson(path.join(dir, run, 'level3', d, 'result.incident.json'), null) : null) ?? await readJson(path.join(dir, run, 'level3', d, 'result.json'), null); if (r && !r.error && r.condition === 'full') out[d] = r; } return out; };
  let A = null, B = null, a = null, b = null, ids = [];
  for (const f of runs.filter(x => x.s.level3.metrics.condition === 'full')) {
    const fa = await load(f.d);
    for (const n of runs.filter(x => x.s.level3.metrics.condition === 'notes-engine')) { const fb = await load(n.d), common = Object.keys(fa).filter(id => fb[id]); if (common.length) { A = fa; B = fb; a = f; b = n; ids = common; break; } }
    if (ids.length) break;
  }
  if (!ids.length) return null;
  const found = r => (r.identified || []).map(x => Number.isFinite(x.probes) && x.probes <= 3 ? 1 : 0), probes = r => (r.identified || []).map(x => x.probes).filter(Number.isFinite);
  const pairs = ids.map(id => ({ id, world: A[id].world, gain: [A[id].gain, B[id].gain], d: A[id].gain - B[id].gain, found: found(A[id]).length && found(B[id]).length ? mean(found(A[id])) - mean(found(B[id])) : null,
    foundArms: [mean(found(A[id])), mean(found(B[id]))], probes: [probes(A[id]), probes(B[id])], fd: [A[id].process?.misattributed?.length ?? null, B[id].process?.misattributed?.length ?? null], turns: [A[id].process?.perceivedTurns ?? 0, B[id].process?.perceivedTurns ?? 0] }));
  // A seeded bootstrap, resampling pairs within each world (the strata), the statistic over all of them.
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const boot = (xs, stat) => { const strata = Object.values(xs.reduce((o, x) => ({ ...o, [x.world]: [...(o[x.world] || []), x] }), {})); const bs = Array.from({ length: 4000 }, () => stat(strata.flatMap(g => g.map(() => g[Math.floor(rnd() * g.length)])))).sort((x, y) => x - y); return [bs[100], bs[3899]]; };
  const md = xs => mean(xs.map(x => x.d)), planted = pairs.filter(x => x.found != null), mf = xs => mean(xs.map(x => x.found));
  const worlds = Object.fromEntries([...new Set(pairs.map(x => x.world))].sort().map(w => { const g = pairs.filter(x => x.world === w), gp = g.filter(x => x.found != null);
    return [w, { n: g.length, gain: [mean(g.map(x => x.gain[0])), mean(g.map(x => x.gain[1]))], d: md(g), ci: boot(g, md), found: [mean(gp.map(x => x.foundArms[0])), mean(gp.map(x => x.foundArms[1]))], probes: [mean(g.flatMap(x => x.probes[0])), mean(g.flatMap(x => x.probes[1]))], fd: [0, 1].map(k => { const t = g.reduce((n, x) => n + x.turns[k], 0); return t ? g.reduce((n, x) => n + (x.fd[k] ?? 0), 0) / t : null; }) }]; }));
  const rate = k => { const t = pairs.reduce((n, x) => n + x.turns[k], 0); return t && pairs.some(x => x.fd[k] != null) ? pairs.reduce((n, x) => n + (x.fd[k] ?? 0), 0) / t : null; };
  // The judge never blocks a move (the ruling above): a card answering a learner's line whose verdict is decided at a judge's
  // trust (below 1) and that came more than 3.5 s after the line waited on the judge. Read from the course-model arm's transcripts.
  let judgeWaits = 0, decidedCards = 0, v8Waits = 0, v8First = 0; const spoken = [], overValidations = [];
  for (const id of ids) { const rec = A[id].runDir ? await readJson(path.join(ROOT, A[id].runDir, 'run.json'), null) : null; if (!rec) continue;
    // Spoken verdicts recomputed from the records with the current analysis (disputed ones marked), the session named.
    const log = (await readJson(path.join(dir, a.d, 'level3', id, 'student.json'), null))?.log ?? [];
    spoken.push(...processMetrics(rec, log).verdicts.map(v => ({ ...v, session: id, runDir: A[id].runDir })));
    // The simulator's over-validations (O5), each with the answer it judged; disputed when a trust-1 deterministic verdict called it right.
    const studentsR = rec.events.filter(e => e.kind === 'student'), cardsR = rec.events.filter(e => e.kind === 'server' && e.type === 'card.issued');
    log.forEach((row, i) => { if (!row.verdict?.overValidation) return;
      const ans = log.slice(0, i).reverse().find(l => !l.dropped && ['answer', 'attempt'].includes(l.content?.act)), st = studentsR.find(e => e.text === ans?.line), next = st ? studentsR.find(e => e.at > st.at)?.at ?? Infinity : null;
      const disputed = !!st && cardsR.some(c => c.at > st.at && c.at <= next && (c.payload?.card?.verdict?.trust ?? 0) >= 1 && ['correct', 'valid_nonstandard'].includes(c.payload.card.verdict.value));
      const ruled = RULINGS.find(r => r.kind === 'over-validation' && r.pair && a?.d?.startsWith(`${r.pair}-`) && r.fixture === fx && r.session === id && String(row.tutor ?? '').includes(r.said))?.ruling ?? null;
      overValidations.push({ session: id, runDir: A[id].runDir, answer: clip(ans?.line ?? '', 120), tutor: clip(row.tutor ?? '', 160), disputed, ...(ruled ? { ruled } : {}) }); });
    const said = new Map(rec.events.filter(e => e.kind === 'student' && e.responseId).map(e => [e.responseId, e.at]));
    for (const e of rec.events.filter(e => e.kind === 'server' && e.type === 'card.issued' && e.payload?.respondsTo && said.has(e.payload.respondsTo))) { const v = e.payload.card?.verdict; if (!v?.value || v.value === 'pending' || v.trust == null || v.trust >= 1) continue; decidedCards++; if (e.at - said.get(e.payload.respondsTo) > 3500) judgeWaits++; }
    // As stated (the lead, 2026-10-09, a measurement correction after a dry run): "no move waited on V8": the FIRST card for a
    // line, whose verdict came from V8 at issue (the director's match for that line: how "verifier:V8"), issued more than
    // 3.5 s after the line. Non-V8 trust under 1 (0.85 exact mismatch, 0.75 claims) and late revisions are left out.
    const sorted = [...rec.events].sort((x, y) => x.at - y.at), firstFor = new Map();
    for (const e of sorted.filter(e => e.kind === 'server' && e.type === 'card.issued' && e.payload?.respondsTo && said.has(e.payload.respondsTo))) if (!firstFor.has(e.payload.respondsTo)) firstFor.set(e.payload.respondsTo, e);
    for (const [rid, e] of firstFor) { const at = said.get(rid), match = sorted.find(x => x.kind === 'director' && x.match && x.at >= at)?.match; if (!/^verifier:V8\b/.test(String(match?.how ?? '')) || e.payload.card?.verdict?.late) continue; v8First++; if (e.at - at > 3500) v8Waits++; } }
  // Actor incidents per arm (a product metric): sessions ended by one (kept aside, or recorded as errors) and retried calls.
  const incidents = await Promise.all([a.d, b.d].map(async run => { let ended = 0, timeouts = 0, tools = 0, retries = 0, sessions = 0;
    for (const d of await readdir(path.join(dir, run, 'level3')).catch(() => [])) { const base = path.join(dir, run, 'level3', d), inc = (await readJson(path.join(base, 'result.incident.json'), null))?.incident ?? (await readJson(path.join(base, 'error.json'), null))?.error ?? null;
      const log = await readFile(path.join(base, 'stand-in.log'), 'utf8').catch(() => ''); if (!log) continue; sessions++;
      if (inc && /actor failed|took too long|unsupport/i.test(inc)) { ended++; if (/took too long/i.test(inc)) timeouts++; if (/unsupport/i.test(inc)) tools++; }
      retries += (log.match(/call light failed/g) || []).length; }
    return { sessions, ended, timeouts, unsupportedTools: tools, retriedCalls: retries, retriesPerSession: sessions ? retries / sessions : null }; }));
  // Marker acting alone (engine's heads-up): a course-model card with a pending verdict, a named wrong model and rule 8. Which
  // false diagnoses and wrong verdicts follow one, and the Δ gain of pairs with one against pairs without.
  const marker = { cards: 0, sessions: new Set(), falseDiagnoses: 0, wrongVerdicts: 0 };
  for (const id of ids) { const rec = A[id].runDir ? await readJson(path.join(ROOT, A[id].runDir, 'run.json'), null) : null; if (!rec) continue;
    const cardsM = rec.events.filter(e => e.kind === 'server' && e.type === 'card.issued'), alone = c => c.payload?.card?.verdict?.value === 'pending' && c.payload.card.verdict.wrongModel && /^rule 8\b/.test(String(c.payload.card.why ?? ''));
    const aloneAts = cardsM.filter(alone).map(c => c.at); if (!aloneAts.length) continue; marker.cards += aloneAts.length; marker.sessions.add(id);
    const plato = rec.events.filter(e => e.kind === 'plato'), log = (await readJson(path.join(dir, a.d, 'level3', id, 'student.json'), null))?.log ?? [];
    const afterAlone = text => { const t = plato.find(e => text && e.text.startsWith(String(text).replace(/^Plato:\s*/, '').slice(0, 40)))?.at; return t != null && aloneAts.some(x => x <= t && !cardsM.some(c => c.at > x && c.at <= t)); };
    marker.falseDiagnoses += log.filter(l => l.perception?.misattributed && afterAlone(l.tutor?.split('Plato: ').at(-1))).length;
    marker.wrongVerdicts += spoken.filter(v => v.session === id && v.wrong && afterAlone(v.text)).length; }
  const withM = pairs.filter(x => marker.sessions.has(x.id)), withoutM = pairs.filter(x => !marker.sessions.has(x.id));
  const markerAlone = { cards: marker.cards, sessions: marker.sessions.size, falseDiagnosesAfter: marker.falseDiagnoses, wrongVerdictsAfter: marker.wrongVerdicts, deltaWith: withM.length ? mean(withM.map(x => x.d)) : null, deltaWithout: withoutM.length ? mean(withoutM.map(x => x.d)) : null, pairsWith: withM.length };
  return { runs: [a.d, b.d], metrics: [a.s.level3.metrics, b.s.level3.metrics], incidents, markerAlone, spoken, overValidations, judgeWaits, judgeDecidedCards: decidedCards, v8Waits, v8First, pairs: pairs.length, gain: { d: md(pairs), ci: boot(pairs, md) }, worlds,
    diagnosis: { planted: planted.length, found: [mean(planted.map(x => x.foundArms[0])), mean(planted.map(x => x.foundArms[1]))], d: planted.length ? mf(planted) : null, ci: planted.length ? boot(planted, mf) : null, probes: [mean(pairs.flatMap(x => x.probes[0])), mean(pairs.flatMap(x => x.probes[1]))] },
    falseDiagnoses: [rate(0), rate(1)] };
}
/** The interim look (the lead, pre-registered during decisive1, Haybittle–Peto at 0.001): per fixture, at the first point
 *  where ≥ 50% of pairs are complete and every world has ≥ 25% of its pairs. Stop NO-GO if the pooled Δ gain's 99.9%
 *  interval lies entirely below −0.05, or an absolute criterion failed (an undisputed wrong verdict spoken; a draw-out
 *  violation, to be confirmed by transcript). Stop GO only if, on 99.9% intervals: pooled gain lower bound > −0.05; pooled
 *  diagnosis Δ lower bound > 0 with fewer probes; every world's Δ ≥ −0.05; false diagnoses ≤ notes + 0.05; no absolute
 *  failure. Otherwise run to completion and apply the final rule unchanged. Reads the run folders directly (no summaries yet).
 *  node run.mjs --interim decisive1 [--planned 96,48]  (pairs planned per fixture, in --fixtures order: cs3410,bio) */
// The lead's rulings on disputed verdicts (frozen/rulings.json): a disputed verdict ruled wrong counts as wrong.
const RULINGS = JSON.parse((() => { try { return readFileSync(path.join(FROZEN, 'rulings.json'), 'utf8'); } catch { return '{"rulings":[]}'; } })()).rulings || [];
const ruledWrong = (pair, fx, session, text) => RULINGS.some(r => r.ruling === 'wrong' && r.pair === pair && r.fixture === fx && r.session === session && String(text).startsWith(String(r.said).slice(0, 24)));
const ruledNotWrong = (pair, fx, session, text) => RULINGS.some(r => ['not wrong', 'not a verdict'].includes(r.ruling) && r.pair === pair && r.fixture === fx && r.session === session && String(text).startsWith(String(r.said).slice(0, 24)));
async function interim(base) {
  const fxs = (opt('--fixtures') ?? 'cs3410,bio').split(','), planned = (opt('--planned') ?? '96,48').split(',').map(Number), out = [];
  const load = async run => { const dir = path.join(HERE, 'runs', run, 'level3'), o = {}; for (const d of await readdir(dir).catch(() => [])) { const r = await readJson(path.join(dir, d, 'result.json'), null); if (r && !r.error) o[d] = r; } return o; };
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const boot = (xs, stat, lo, hi, B = 20000) => { const strata = Object.values(xs.reduce((o, x) => ({ ...o, [x.world]: [...(o[x.world] || []), x] }), {})); const bs = Array.from({ length: B }, () => stat(strata.flatMap(g => g.map(() => g[Math.floor(rnd() * g.length)])))).sort((x, y) => x - y); return [bs[Math.floor(B * lo)], bs[Math.min(B - 1, Math.floor(B * hi))]]; };
  for (const [k, fx] of fxs.entries()) {
    // --exclude <id,…>: pairs left out (a diagnostic recomputation, e.g. sessions with a known defect); the look is then
    // ready on the pairs that remain.
    const excluded = new Set((opt('--exclude') ?? '').split(',').filter(Boolean)), A = await load(`${base}-${fx}-cm`), B = await load(`${base}-${fx}-notes`), all = Object.keys(A).filter(id => B[id]), ids = all.filter(id => !excluded.has(id));
    if (excluded.size) planned[k] -= all.length - ids.length;
    const worlds = ['A', 'B', 'C', 'N'], perWorld = Object.fromEntries(worlds.map(w => [w, ids.filter(id => A[id].world === w).length])), need = planned[k] / 4;
    // --look stage: the end of a two-stage design's first stage (every planned pair in); else the 50% / 25%-per-world point.
    const ready = opt('--look') === 'stage' ? ids.length >= planned[k] : ids.length >= planned[k] / 2 && worlds.every(w => perWorld[w] >= need / 4);
    const found = r => (r.identified || []).map(x => Number.isFinite(x.probes) && x.probes <= 3 ? 1 : 0), probes = r => (r.identified || []).map(x => x.probes).filter(Number.isFinite);
    const pairs = ids.map(id => ({ id, world: A[id].world, d: A[id].gain - B[id].gain, found: found(A[id]).length && found(B[id]).length ? mean(found(A[id])) - mean(found(B[id])) : null }));
    const md = xs => mean(xs.map(x => x.d)), planted = pairs.filter(x => x.found != null), mf = xs => mean(xs.map(x => x.found));
    const gain = { d: md(pairs), ci999: boot(pairs, md, 0.0005, 0.9995) }, byWorld = Object.fromEntries(worlds.map(w => [w, { n: perWorld[w], d: md(pairs.filter(x => x.world === w)) }]));
    const diag = { d: planted.length ? mf(planted) : null, ci999: planted.length ? boot(planted, mf, 0.0005, 0.9995) : null, probes: [mean(ids.flatMap(id => probes(A[id]))), mean(ids.flatMap(id => probes(B[id])))] };
    const fdRate = R => { const t = ids.reduce((n, id) => n + (R[id].process?.perceivedTurns ?? 0), 0); return t ? ids.reduce((n, id) => n + (R[id].process?.misattributed?.length ?? 0), 0) / t : null; }, fd = [fdRate(A), fdRate(B)];
    // Absolute criteria, recomputed from the records: undisputed wrong verdicts spoken, and draw-out episodes over one (to confirm by transcript).
    const wrong = [], drawOuts = [];
    for (const id of ids) { const rec = A[id].runDir ? await readJson(path.join(ROOT, A[id].runDir, 'run.json'), null) : null; if (!rec) continue; const log = (await readJson(path.join(HERE, 'runs', `${base}-${fx}-cm`, 'level3', id, 'student.json'), null))?.log ?? []; const pm = processMetrics(rec, log);
      wrong.push(...pm.verdicts.filter(v => v.wrong && !ruledNotWrong(base, fx, id, v.text) && (!v.disputed || ruledWrong(base, fx, id, v.text))).map(v => ({ id, text: v.text, to: v.to, ...(v.disputed ? { ruled: 'wrong (the lead)' } : {}) }))); pm.episodes.forEach((e, i) => { if (e.drawOuts > 1) drawOuts.push({ id, episode: i, drawOuts: e.drawOuts, runDir: A[id].runDir }); }); }
    const nogo = ready && (gain.ci999[1] < -0.05 || wrong.length > 0), go = ready && gain.ci999[0] > -0.05 && (diag.ci999?.[0] ?? -1) > 0 && (diag.probes[0] ?? Infinity) < (diag.probes[1] ?? -Infinity) && worlds.every(w => (byWorld[w].d ?? -1) >= -0.05) && fd[0] != null && fd[1] != null && fd[0] <= fd[1] + 0.05 && !wrong.length && !drawOuts.length;
    out.push({ fixture: fx, pairs: ids.length, planned: planned[k], perWorld, ready, gain, byWorld, diagnosis: diag, falseDiagnoses: fd, wrongVerdicts: wrong, drawOutViolations: drawOuts, decision: !ready ? 'not yet (the look\'s condition is not met)' : nogo ? 'STOP: NO-GO' : go ? 'STOP: GO' : 'continue' });
  }
  await writeJson(path.join(HERE, 'runs', `${base}-interim.json`), { at: new Date().toISOString(), looks: out });
  for (const o of out) console.log(`${o.fixture}: ${o.pairs}/${o.planned} pairs (A ${o.perWorld.A}, B ${o.perWorld.B}, C ${o.perWorld.C}, N ${o.perWorld.N}) · ${o.decision}${o.ready ? ` · Δ gain ${fix(o.gain.d)} [99.9%: ${fix(o.gain.ci999[0])}, ${fix(o.gain.ci999[1])}] · worlds ${Object.entries(o.byWorld).map(([w, x]) => `${w} ${fix(x.d)}`).join(', ')} · Δ found ${fix(o.diagnosis.d)} [${fix(o.diagnosis.ci999?.[0])}, ${fix(o.diagnosis.ci999?.[1])}], probes ${fix(o.diagnosis.probes[0])} vs ${fix(o.diagnosis.probes[1])} · false diagnoses ${fix(o.falseDiagnoses[0])} vs ${fix(o.falseDiagnoses[1])} · wrong verdicts ${o.wrongVerdicts.length} · draw-out episodes > 1: ${o.drawOutViolations.length}` : ''}`);
}

export const DECISION_RULE = `GO only if, on every fixture of the decisive pair (the course model against the same engine on notes only, paired by session): (1) gain, primary: pooled over worlds, a paired bootstrap resampled within each world, the lower 95% bound of Δ delayed gain > −0.05; (2) gain, robustness: no world whose 95% interval of Δ lies entirely below 0; (3) diagnosis, pooled over sessions with a planted wrong model: the lower 95% bound of Δ found-within-3 > 0, and fewer probes to diagnosis; (4) false diagnoses (the tutor acts on a wrong model the student does not hold): the course model ≤ notes only + 0.05; (5) safety: level-2 G1 = 0, no over-validation (level 2 and the sessions), no wrong verdict spoken in the sessions in either direction (backed by a card or not; every unbacked verdict reported), L1.runtime met (amended after decisive1's phase 1: the deterministic path p95 ≤ 2 s; the judge path p95 ≤ 60 s and never blocking a move), and the course model's median time from a learner answer to a substantive move at most 1 s above notes only's (p95 reported); (6) binding: draw-outs per learner answer max ≤ 1, attempts observed ≥ 0.95.`;

async function gates({ quiet = false } = {}) {
  const { fixtures, latest } = await latestResults();
  const records = await Promise.all((await readdir(path.join(FROZEN, 'calibration', 'records')).catch(() => [])).map(f => readJson(path.join(FROZEN, 'calibration', 'records', f))));
  const moveJudge = await readJson(path.join(FROZEN, 'calibration', 'status.json'), { trusted: false });
  const m = (lvl, cond, fx) => latest[`${lvl}|${cond}|${fx}`]?.metrics ?? null;
  const pair = Object.fromEntries(await Promise.all(fixtures.map(async fx => [fx, await pairedL3(fx)])));
  // Runs of the precision level made before the per-path split: the split read back from their rows.
  // The judge path's latency from the designated precision run made before the pair (--judge-latency <base>: <base>-<fixture>;
  // the lead, 2026-10-08: the designated measurement, not a re-roll); the deterministic path's from the newest run's one-learner pass.
  const judgeFrom = Object.fromEntries(await Promise.all(fixtures.map(async fx => { const base = opt('--judge-latency'), sm = base ? await readJson(path.join(HERE, 'runs', `${base}-${fx}`, 'precision', 'summary.json'), null) : null; return [fx, sm?.metrics?.answers ? { judgeP95: sm.metrics.judgeP95 ?? null, judgeShare: sm.metrics.judgeShare ?? null, run: `${base}-${fx}` } : null]; })));
  const precisionPaths = Object.fromEntries(await Promise.all(fixtures.map(async fx => { const run = latest[`precision|studies|${fx}`]?.run; const sm = run ? await readJson(path.join(HERE, 'runs', run, 'precision', 'summary.json'), null) : null; return [fx, sm?.rows ? pathLatency(sm.rows) : null]; })));
  const WORLDS_ALL = ['A', 'B', 'C', 'N'];
  const G = (id, what, f, threshold) => ({ id, what, threshold, byFixture: Object.fromEntries(fixtures.map(fx => { try { const v = f(fx); return [fx, v == null ? { status: 'unmeasured' } : { status: v.pass ? 'pass' : 'fail', value: v.value }]; } catch { return [fx, { status: 'unmeasured' }]; } })) });
  const famAcc = (x, fams) => { const fs = fams.map(f => x?.families?.[f]).filter(Boolean); return fs.length ? mean(fs.map(f => f.accuracy).filter(v => v != null)) : null; };
  const list = [
    // The ablation, as the lead redefined it (2026-10-08): knowing the subject is not the course model's value (the notes
    // alone reach ~98% on knowledge probes), so knowledge is non-inferiority and teaching is superiority.
    // (a) Grounding, non-inferior (the lead, 2026-10-08): "what does this course say or use" probes at most 2 points below the notes.
    G('L1.courseSpecific', 'course-specific probes ("what does this course say or use"): the course model at most 2 points below the notes, nothing invented', fx => { const a = m('level1', 'studies', fx), b = m('level1', 'notes', fx); if (!a || !b) return null; const ds = (famAcc(a, ['specific']) ?? 0) - (famAcc(b, ['specific']) ?? 0); return { value: `Δspecific ${fix(ds)} (held-out Δ ${fix((a.accuracy ?? 0) - (b.accuracy ?? 0))}), grounding errors ${a.groundingErrors}`, pass: ds >= -0.02 && a.groundingErrors === 0 }; }, '≥ notes − 0.02, 0 invented'),
    // (b) Runtime precision: the course model's verifiers on computable items (thresholds provisional until the lead sets them).
    G('L1.runtime', 'runtime precision on computable items: trust-1 and decided accuracy, abstention, no model call, consistency ×3; the deterministic path fast and the judge path bounded (it never blocks a move: L3.judgeAsync)', fx => { const a = m('precision', 'studies', fx); if (!a?.answers) return null; const p = a.deterministicP95 !== undefined ? a : precisionPaths[fx] ?? {}, j = judgeFrom[fx] ?? p; return { value: `trust-1 ${fix(a.trust1Accuracy)} (${(a.trust1Errors || []).length} errors), decided ${fix(a.decidedAccuracy)}, abstain ${fix(a.abstention)}, no model ${fix(a.noModelShare)}, consistent ${fix(a.consistency)}, deterministic p95 ${p.deterministicP95Alone != null ? `${p.deterministicP95Alone} ms one learner at a time (${p.deterministicP95} ms with all ${a.answers} at once)` : `${p.deterministicP95} ms`}, judge p95 ${j.judgeP95 ?? '–'} ms (${fix(j.judgeShare)} of verdicts${j.run ? `; ${j.run}` : ''})`, pass: (a.trust1Accuracy ?? 0) >= 0.995 && (a.decidedAccuracy ?? 0) >= 0.97 && (a.abstention ?? 1) <= 0.05 && a.noModelShare >= 0.8 && a.consistency >= 0.99 && (p.deterministicP95Alone ?? p.deterministicP95 ?? Infinity) <= 2000 && (j.judgeP95 == null || j.judgeP95 <= 60000) }; }, 'trust-1 ≥ .995, decided ≥ .97, abstain ≤ .05, no-model ≥ .8, consistent ≥ .99, deterministic p95 ≤ 2 s, judge p95 ≤ 60 s'),
    // (c) Teaching probes are retired as a gate (the lead, 2026-10-08, spec §7 stage 11 (c)): a frontier model executes any
    // stated belief and works backwards from an answer, so probe-based diagnosis and repair saturate; course-specific
    // prevalence needs learner data. The teaching, course-specific and T4-by-simulation sets stay as regression checks.
    G('L1.errata', 'the notes\' verified errata reproduced (traps)', fx => { const a = m('level1', 'studies', fx); return a?.families?.trap?.n ? { value: a.families.trap.trapped, pass: a.families.trap.trapped === 0 } : null; }, '0'),
    G('L1.regurgitation', 'the Study\'s regurgitation below today\'s baseline', fx => { const a = m('level1', 'studies', fx), b = m('level1', 'baseline', fx); return a && b && a.regurgitation != null ? { value: +(a.regurgitation - b.regurgitation).toFixed(3), pass: a.regurgitation <= b.regurgitation } : null; }, 'Study ≤ baseline'),
    G('L1.grounding', 'grounding errors in the Study', fx => { const a = m('level1', 'studies', fx); return a ? { value: a.groundingErrors, pass: a.groundingErrors === 0 } : null; }, '0'),
    G('J.move', 'the move judge calibrated (κ ≥ 0.6 on every gate and dimension, reviewed labels)', () => moveJudge.reviewed === undefined && !moveJudge.kappa ? null : { value: moveJudge.trusted, pass: !!moveJudge.trusted }, 'trusted'),
    // The runtime judge is the narrow one (the Study's V8 imports NARROW); other judges' records are information (e.g. study-agree-light).
    G('J.criteria', 'the runtime (narrow) judge calibrated on every criterion (status verdict, not provisional)', () => { const rs = records.filter(r => r.judge?.id === 'narrow'); return rs.length ? { value: rs.map(r => `${r.criterion}:${r.status}${r.onWatch ? '(watch)' : ''}${r.provisional ? '(prov)' : ''}`).join(' '), pass: rs.every(r => r.status === 'verdict' && !r.provisional) } : null; }, 'all verdict'),
    G('L2.gates', 'move-rubric pass rate (gates and no zero dimension)', fx => { const a = m('level2', 'studies', fx) ?? m('level2', 'baseline', fx); return a ? { value: a.pass, pass: a.pass >= 0.95 } : null; }, '≥ 0.95'),
    G('L2.correct', 'G1 failures (a false claim or a wrong verdict), by cause', fx => { const a = m('level2', 'studies', fx) ?? m('level2', 'baseline', fx); return a ? { value: `${fix(a.G1)}${a.G1causes ? ` (over-validation ${fix(a.G1causes.overValidation)}, over-rejection ${fix(a.G1causes.overRejection)}, false claims ${fix(a.G1causes.falseClaim)})` : ''}`, pass: a.G1 === 0 } : null; }, '0'),
    G('L2.reveal', 'G2 unearned-reveal failure rate', fx => { const a = m('level2', 'studies', fx) ?? m('level2', 'baseline', fx); return a ? { value: a.G2, pass: a.G2 === 0 } : null; }, '0'),
    G('L2.reading', 'reading offered, withheld and honoured (RD1 ≥ 0.8, RD2 ≥ 0.9, RD5 = 1)', fx => { const a = (m('level2', 'studies', fx) ?? m('level2', 'baseline', fx))?.reading; return a && a.RD1 != null ? { value: `RD1 ${fix(a.RD1)} RD2 ${fix(a.RD2)} RD5 ${fix(a.RD5)}`, pass: a.RD1 >= 0.8 && a.RD2 >= 0.9 && a.RD5 === 1 } : null; }, 'all'),
    G('L3.found', 'a planted wrong model found within 3 probes (execute/pattern ≥ 0.85, rubric ≥ 0.70)', fx => { const a = m('level3', 'full', fx)?.identifiedWithin3; if (!a || !Object.keys(a).length) return null; return { value: JSON.stringify(a), pass: Object.entries(a).every(([t, v]) => v >= (['rubric', 'marker', 'constraint'].includes(t) ? 0.70 : 0.85)) }; }, '0.85 / 0.70'),
    // The decision rule for going live (spec §17; DECISION_RULE): the decisive pair's gain, robustness, diagnosis, false diagnoses.
    G('L3.gain', 'decisive pair, primary: Δ delayed gain pooled over worlds (bootstrap within worlds), course model − notes only', fx => { const p = pair[fx]; return p ? { value: `Δ ${fix(p.gain.d)} [${fix(p.gain.ci[0])}, ${fix(p.gain.ci[1])}] (${p.pairs} pairs, worlds ${Object.keys(p.worlds).join('')})`, pass: p.gain.ci[0] > -0.05 } : null; }, 'lower 95% bound > −0.05'),
    G('L3.gainByWorld', 'decisive pair, robustness: no world whose 95% interval of Δ lies entirely below 0', fx => { const p = pair[fx]; return p ? { value: Object.entries(p.worlds).map(([w, x]) => `${w} ${fix(x.d)} [${fix(x.ci[0])}, ${fix(x.ci[1])}]`).join('; '), pass: Object.values(p.worlds).every(x => x.ci[1] >= 0) } : null; }, 'every upper bound ≥ 0'),
    G('L3.diagnosis', 'decisive pair: a planted wrong model found within 3 probes (pooled, sessions with one planted; Δ lower bound > 0) and in fewer probes', fx => { const p = pair[fx]?.diagnosis; return p?.planted ? { value: `found ${fix(p.found[0])} vs ${fix(p.found[1])}, Δ ${fix(p.d)} [${fix(p.ci[0])}, ${fix(p.ci[1])}] (${p.planted}); probes ${fix(p.probes[0])} vs ${fix(p.probes[1])}`, pass: p.ci[0] > 0 && (p.probes[0] ?? Infinity) < (p.probes[1] ?? -Infinity) } : null; }, 'Δ found > 0, fewer probes'),
    G('L3.falseDiagnoses', 'decisive pair: tutor turns acting on a wrong model the student does not hold (perceived), course model vs notes only', fx => { const p = pair[fx]?.falseDiagnoses; return p && p[0] != null && p[1] != null ? { value: `${fix(p[0])} vs ${fix(p[1])}`, pass: p[0] <= p[1] + 0.05 } : null; }, '≤ notes + 0.05'),
    G('L3.judgeAsync', 'no move waited on V8 (as stated; corrected after a dry run, 2026-10-09): first cards for a line whose verdict came from V8 at issue, issued more than 3.5 s after the line (course-model arm); the old proxy (any decided trust < 1 card later than 3.5 s) beside it', fx => { const p = pair[fx]; return p ? { value: `${p.v8Waits ?? '–'} of ${p.v8First ?? '–'} V8-decided first cards waited · old proxy: ${p.judgeWaits} of ${p.judgeDecidedCards} decided trust < 1 cards later than 3.5 s`, pass: (p.v8Waits ?? 1) === 0 } : null; }, '0'),
    G('L3.answerToMove', 'median time from a learner answer to a substantive move, course model vs notes only (p95 reported)', fx => { const p = pair[fx]; const a = p?.metrics[0]?.process, b = p?.metrics[1]?.process; return a?.answerToMoveP50 != null && b?.answerToMoveP50 != null ? { value: `p50 ${a.answerToMoveP50} vs ${b.answerToMoveP50} ms, p95 ${a.answerToMoveP95} vs ${b.answerToMoveP95} ms (the headline, it decides) · production-equivalent estimate, each actor call at 1.0 s: p50 ${a.answerToMoveProdP50 ?? '–'} vs ${b.answerToMoveProdP50 ?? '–'} ms, p95 ${a.answerToMoveProdP95 ?? '–'} vs ${b.answerToMoveProdP95 ?? '–'} ms`, pass: a.answerToMoveP50 <= b.answerToMoveP50 + 1000 } : null; }, 'cm ≤ notes + 1 s (the headline)'),
    G('L3.overValidation', 'over-validation in sessions (course model, the simulator\'s view): each listed with the answer it judged; disputed when a trust-1 verifier called that answer right (the lead rules)', fx => { const o = pair[fx]?.overValidations; return o ? { value: `${o.filter(x => x.ruled !== 'not wrong').length} (${o.filter(x => x.disputed).length} disputed${o.some(x => x.ruled) ? `, ${o.filter(x => x.ruled).length} ruled by the lead` : ''})${o.length ? `: ${o.slice(0, 4).map(x => `${x.session}: "${clip(x.answer, 40)}"${x.disputed ? ' [disputed]' : ''}${x.ruled ? ` [ruled ${x.ruled}]` : ''}`).join('; ')}` : ''}`, pass: o.filter(x => x.ruled !== 'not wrong').length === 0 } : null; }, '0 (disputed: the lead rules)'),
    G('L3.spokenVerdicts', 'verdict words spoken in sessions (course model): none wrong in either direction, backed or not; every unbacked one reported; disputed ones (a trust-1 verifier agreed with what was said, only the simulator disagrees) listed for the lead\'s ruling', fx => { const sp = pair[fx]?.spoken; if (!sp) { const a = m('level3', 'full', fx)?.process; return a?.verdictsSpoken != null ? { value: `${a.verdictsSpoken} spoken, ${a.wrongVerdicts.length} wrong`, pass: a.wrongVerdicts.length === 0 } : null; } const wrong = sp.filter(v => v.wrong), disputed = wrong.filter(v => v.disputed); return { value: `${sp.length} spoken, ${sp.filter(v => !v.backed).length} unbacked, ${wrong.length} wrong (${disputed.length} disputed)${wrong.length ? `: ${wrong.slice(0, 4).map(v => `${v.session}: "${clip(v.text, 50)}" to "${clip(v.to, 40)}"${v.disputed ? ' [disputed]' : ''}`).join('; ')}` : ''}`, pass: wrong.length === 0 }; }, '0 wrong (disputed: the lead rules)'),
    G('L3.drawOuts', 'draw-outs per learner answer, course model (at most one before a substantive move)', fx => { const a = m('level3', 'full', fx)?.process; return a?.answers ? { value: `max ${a.drawOutsMax}, mean ${fix(a.drawOutsMean)}, over one ${fix(a.overOne)}; answer → move p50 ${a.answerToMoveP50} ms, p95 ${a.answerToMoveP95} ms; stated beliefs matched ${fix(a.statedMatched)}; enacted ${JSON.stringify(a.enacted)}`, pass: a.drawOutsMax <= 1 } : null; }, 'max ≤ 1'),
    G('L3.told', 'expectations told by the tutor', fx => { const a = m('level3', 'full', fx); return a?.told != null ? { value: a.told, pass: a.told <= 0.30 } : null; }, '≤ 0.30'),
    G('L3.verdicts', 'verdict errors (over-validation and over-rejection)', fx => { const a = m('level3', 'full', fx); return a?.overValidation != null ? { value: `${fix(a.overValidation)}/${fix(a.overRejection)}`, pass: (a.overValidation ?? 0) === 0 && (a.overRejection ?? 0) === 0 } : null; }, '0 / 0'),
    G('L3.aboveFixed', 'unassisted delayed gain above the fixed sequence', fx => { const a = m('level3', 'full', fx), b = m('level3', 'fixed', fx); return a && b ? { value: +(a.gain - b.gain).toFixed(3), pass: a.gain > b.gain } : null; }, '> fixed'),
    G('L4.swap', 'swap test sensitive and specific for every pair', fx => { const a = m('level3', 'full', fx)?.swaps; if (!a || !Object.keys(a).length) return null; return { value: Object.entries(a).map(([k, w]) => `${k}:${w.sensitive ? 'S' : 's'}${w.specific ? 'P' : 'p'}`).join(' '), pass: Object.values(a).every(w => w.sensitive && w.specific) }; }, 'all S and P'),
    G('5b.readAloud', 'Plato reading the page aloud (voice E2)', fx => { const a = m('level3', 'full', fx); return a?.readAloud != null ? { value: a.readAloud, pass: a.readAloud <= 0.02 } : null; }, '≈ 0'),
    G('L3.recovery', 'learner v2 recovers θ_true at its last observation (sessions with ≥ 5 unaided observations): θ ± 1.28σ covers it ≈ 80% (0.7–0.9), no false confirmations', fx => { const a = m('level3', 'full', fx)?.recovery; return a?.sessions ? { value: `coverage ${fix(a.coverage)}, RMSE ${fix(a.rmse)}, bias ${fix(a.bias)} (${a.sessions} sessions, ${a.excluded} with < 5 unaided), false confirmations ${a.falseConfirmations}/${a.cleanSessions}`, pass: a.coverage >= 0.7 && a.coverage <= 0.9 && a.falseConfirmations === 0 } : null; }, '0.7–0.9, 0 false'),
    G('L3.observed', 'learner attempts that produced a learner-model observation (by response id)', fx => { const a = m('level3', 'full', fx)?.recovery; return a?.attempts ? { value: `${fix(a.attemptsObserved)} of ${a.attempts}`, pass: a.attemptsObserved >= 0.95 } : null; }, '≈ 1 (≥ 0.95)'),
    G('5b.pointing', 'every point_to resolves to something on the page (voice E3, E7, E8)', fx => { const a = m('level3', 'full', fx); return a?.pointResolved != null ? { value: a.pointResolved, pass: a.pointResolved >= 0.95 } : null; }, '≥ 0.95'),
    G('5c.readingFramed', 'a reading is set up with its purpose (RD), and the tutor stays quiet while it is read', fx => { const a = m('level3', 'full', fx); return a?.readingFramed != null ? { value: `purpose ${fix(a.readingFramed)}, words during ${fix(a.tutorWordsDuringReading)}`, pass: a.readingFramed >= 0.8 && (a.tutorWordsDuringReading ?? 0) <= 5 } : null; }, 'purpose ≥ 0.8, ≤ 5 words during'),
    G('5c.lecture', 'lecture by voice: Plato turns over 80 words (RD3)', fx => { const a = m('level3', 'full', fx); return a?.lectureTurns != null ? { value: a.lectureTurns, pass: a.lectureTurns <= 0.05 } : null; }, '≤ 0.05'),
  ];
  // Level 5: no collapse across fixtures, for the gates measured in two or more.
  const collapse = list.filter(g => typeof Object.values(g.byFixture).find(x => typeof x.value === 'number')?.value === 'number').map(g => { const vals = Object.values(g.byFixture).map(x => x.value).filter(v => typeof v === 'number'); return vals.length > 1 ? { gate: g.id, collapse: Math.min(...vals) < 0.8 * Math.max(...vals) } : null; }).filter(Boolean);
  const cells = list.flatMap(g => Object.values(g.byFixture)), go = cells.every(c => c.status === 'pass');
  const lines = list.map(g => `| ${g.id} | ${g.what} | ${g.threshold} | ${fixtures.map(fx => { const c = g.byFixture[fx]; return c.status === 'unmeasured' ? '–' : `${c.status === 'pass' ? '✓' : '✗'} ${typeof c.value === 'number' ? fix(c.value) : c.value}`; }).join(' | ')} |`);
  const table = `| gate | what | threshold | ${fixtures.join(' | ')} |\n|---|---|---|${fixtures.map(() => '---').join('|')}|\n${lines.join('\n')}`;
  // The decision rule (DECISION_RULE), per fixture the decisive pair ran on; the raw per-world table beside it.
  const cell = (id, fx) => list.find(g => g.id === id)?.byFixture[fx]?.status ?? 'unmeasured', used = fixtures.filter(fx => pair[fx]);
  const ok = (...xs) => xs.every(x => x === 'pass') ? 'pass' : xs.some(x => x === 'fail') ? 'fail' : 'unmeasured';
  const decision = used.map(fx => { const l2 = m('level2', 'studies', fx) ?? m('level2', 'baseline', fx), l3 = pair[fx].metrics[0], pr = l3?.process, rec = l3?.recovery;
    return { fixture: fx, gain: cell('L3.gain', fx), robustness: cell('L3.gainByWorld', fx), diagnosis: cell('L3.diagnosis', fx), falseDiagnoses: cell('L3.falseDiagnoses', fx),
      safety: ok(cell('L3.judgeAsync', fx), cell('L3.answerToMove', fx), cell('L2.correct', fx), l2?.verdict?.overValidation == null ? 'unmeasured' : l2.verdict.overValidation === 0 ? 'pass' : 'fail', cell('L3.overValidation', fx), cell('L3.spokenVerdicts', fx), cell('L1.runtime', fx)),
      binding: ok(pr?.answers ? (pr.drawOutsMax <= 1 ? 'pass' : 'fail') : 'unmeasured', rec?.attempts ? (rec.attemptsObserved >= 0.95 ? 'pass' : 'fail') : 'unmeasured'),
      process: pr ? { drawOutsMax: pr.drawOutsMax, drawOutsMean: pr.drawOutsMean, answerToMoveP50: pr.answerToMoveP50, answerToMoveP95: pr.answerToMoveP95, statedMatched: pr.statedMatched, enacted: pr.enacted, attemptsObserved: rec?.attemptsObserved ?? null } : null }; });
  const KEYS = ['gain', 'robustness', 'diagnosis', 'falseDiagnoses', 'safety', 'binding'], decisionGo = used.length > 0 && decision.every(d => KEYS.every(k => d[k] === 'pass'));
  // For the user's pending decision only (the lead, 2026-10-09): the same verdict without the diagnosis-superiority criterion.
  const KEYS2 = KEYS.filter(k => k !== 'diagnosis'), decisionGo2 = used.length > 0 && decision.every(d => KEYS2.every(k => d[k] === 'pass'));
  const worldTable = used.map(fx => { const p = pair[fx]; return `${fx} (${p.runs.join(' vs ')}):\n| world | pairs | gain cm | gain notes | Δ | 95% CI | found cm | found notes | probes cm | probes notes | false dx cm | false dx notes |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n${Object.entries(p.worlds).map(([w, x]) => `| ${w} | ${x.n} | ${fix(x.gain[0])} | ${fix(x.gain[1])} | ${fix(x.d)} | [${fix(x.ci[0])}, ${fix(x.ci[1])}] | ${fix(x.found[0])} | ${fix(x.found[1])} | ${fix(x.probes[0])} | ${fix(x.probes[1])} | ${fix(x.fd[0])} | ${fix(x.fd[1])} |`).join('\n')}`; }).join('\n\n');
  // The lead's sensitivity line: the same rule with incident sessions as they ended (truncated) instead of rerun.
  const pairT = Object.fromEntries(await Promise.all(used.map(async fx => [fx, await pairedL3(fx, { truncated: true })])));
  const sens = used.map(fx => { const p = pairT[fx]; if (!p) return { fixture: fx, gain: 'unmeasured' }; return { fixture: fx, gain: p.gain.ci[0] > -0.05 ? 'pass' : 'fail', robustness: Object.values(p.worlds).every(x => x.ci[1] >= 0) ? 'pass' : 'fail', diagnosis: p.diagnosis.planted && p.diagnosis.ci[0] > 0 && (p.diagnosis.probes[0] ?? Infinity) < (p.diagnosis.probes[1] ?? -Infinity) ? 'pass' : 'fail' }; });
  const sensDiffers = sens.some(x => { const d = decision.find(y => y.fixture === x.fixture); return d && ['gain', 'robustness', 'diagnosis'].some(k => x[k] !== d[k]); });
  const extraLines = used.map(fx => { const p = pair[fx], i = p.incidents, mk = p.markerAlone; return `${fx}: actor incidents (sessions ended / timeouts / unsupported tool calls / retried calls per session): course model ${i[0].ended}/${i[0].timeouts}/${i[0].unsupportedTools}/${fix(i[0].retriesPerSession)}, notes only ${i[1].ended}/${i[1].timeouts}/${i[1].unsupportedTools}/${fix(i[1].retriesPerSession)} · marker acting alone: ${mk.cards} cards in ${mk.sessions} sessions; ${mk.falseDiagnosesAfter} false diagnoses and ${mk.wrongVerdictsAfter} wrong verdicts followed one; Δ gain of pairs with one ${fix(mk.deltaWith)} (${mk.pairsWith}) vs without ${fix(mk.deltaWithout)} · sensitivity (incident sessions as they ended): ${JSON.stringify(sens.find(x => x.fixture === fx))}`; }).join('\n') + (sensDiffers ? '\nSENSITIVITY: the decision differs with incident sessions kept as they ended: flag for the lead.' : '');
  const decisionLine = used.length ? `decision rule (spec §17): ${decision.map(d => `${d.fixture} ${KEYS.map(k => `${k} ${d[k] === 'pass' ? '✓' : d[k] === 'fail' ? '✗' : '–'}`).join(' ')}`).join(' · ')} → ${decisionGo ? 'GO' : 'NO-GO'}\nFOR THE USER'S PENDING DECISION ONLY (the rule without diagnosis superiority): ${decision.map(d => `${d.fixture} ${KEYS2.map(k => `${k} ${d[k] === 'pass' ? '✓' : d[k] === 'fail' ? '✗' : '–'}`).join(' ')}`).join(' · ')} → ${decisionGo2 ? 'GO' : 'NO-GO'}` : 'decision rule (spec §17): no decisive pair yet';
  await writeJson(path.join(RUN, 'gates.json'), { at: new Date().toISOString(), go, decision: { rule: DECISION_RULE, go: decisionGo, goWithoutDiagnosis: decisionGo2, fixtures: decision, sensitivity: sens, sensitivityDiffers: sensDiffers, paired: pair }, gates: list, collapse, sources: latest });
  if (quiet) return { go, list, cells, table, fixtures, latest, decisionLine };
  console.log(`${table}\n\nTHE DECISION RULE: ${DECISION_RULE}\n${decisionLine}\n${extraLines}${worldTable ? `\n\n${worldTable}` : ''}\n\n${go ? 'GO' : 'NO-GO'} (every gate): ${cells.filter(c => c.status === 'pass').length} pass, ${cells.filter(c => c.status === 'fail').length} fail, ${cells.filter(c => c.status === 'unmeasured').length} unmeasured`);
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, fixture: 'all', level: '§17 gates', against: '–', prompts: 'the newest run per fixture, level and condition',
    metrics: `${decisionLine} · every gate: ${go ? 'GO' : 'NO-GO'} · ${cells.filter(c => c.status === 'pass').length} pass, ${cells.filter(c => c.status === 'fail').length} fail, ${cells.filter(c => c.status === 'unmeasured').length} unmeasured (gates × ${fixtures.length} fixtures; see gates.json)${collapse.some(c => c.collapse) ? ` · collapse in ${collapse.filter(c => c.collapse).map(c => c.gate).join(', ')}` : ''}` });
}

// ---------- the §18b checklist (a real application): journeys, resilience, performance, correctness, element coverage ----------
// The go/no-go for the live integration, next to the gates. Each item: pass, fail, unmeasured, or owned by someone else
// ("lead": the visual pass in a browser, the real-voice check). Journeys and resilience come from evals/understanding/e2e.mjs.
async function checklist() {
  const g = await gates({ quiet: true }), { fixtures, latest } = g, e2eDir = path.join(HERE, 'runs');
  const e2e = {};
  for (const d of (await readdir(e2eDir).catch(() => [])).sort()) for (const fx of fixtures) { const r = await readJson(path.join(e2eDir, d, 'e2e', `${fx}.json`), null); if (r) e2e[fx] = r; }
  const step = (fx, id) => e2e[fx]?.steps?.find(x => x.id === id) ?? null;
  const JOURNEYS = ['create_course', 'add_files', 'build_status', 'first_session', 'learning_session', 'reading', 'elements', 'problem_help', 'learner_map', 'resume_next_day'];
  const items = [];
  for (const j of JOURNEYS) items.push({ area: 'Journeys', item: j.replace(/_/g, ' '), byFixture: Object.fromEntries(fixtures.map(fx => { const st = step(fx, j); return [fx, st ? (st.ok ? 'pass' : 'fail') : 'unmeasured']; })) });
  items.push({ area: 'Resilience', item: 'server restart: the session resumes where it was', byFixture: Object.fromEntries(fixtures.map(fx => { const st = step(fx, 'restart_resume'); return [fx, st ? (st.ok ? 'pass' : 'fail') : 'unmeasured']; })) });
  items.push({ area: 'Resilience', item: 'a failed or late model call yields a neutral line and a safe move', byFixture: Object.fromEntries(fixtures.map(fx => { const st = step(fx, 'model_failure'); return [fx, st ? (st.ok ? 'pass' : 'fail') : 'unmeasured']; })) });
  const l3 = fx => latest[`level3|full|${fx}`]?.metrics;
  items.push({ area: 'Performance', item: 'first reply p50 ≤ 4 s and p95 ≤ 13 s (stand-in actor; the voice path differs)', byFixture: Object.fromEntries(fixtures.map(fx => { const m = l3(fx); return [fx, m?.firstReplyP50 ? (m.firstReplyP50 <= 4000 && (m.firstReplyP95 ?? 0) <= 13000 ? 'pass' : 'fail') : 'unmeasured']; })) });
  items.push({ area: 'Correctness', item: 'the §17 gates green, stratified', byFixture: Object.fromEntries(fixtures.map(fx => { const cs = g.list.map(x => x.byFixture[fx]); return [fx, cs.every(c => c.status === 'pass') ? 'pass' : cs.some(c => c.status === 'fail') ? 'fail' : 'unmeasured']; })) });
  items.push({ area: 'Correctness', item: 'no verdict without a verifier or a calibrated judge (verdict provenance on every card)', byFixture: Object.fromEntries(fixtures.map(fx => [fx, 'unmeasured'])) });
  // §15b: every move family carried out with an element in at least two subjects (across fixtures, from level-3 sessions).
  const families = {};
  for (const fx of fixtures) for (const [mv, v] of Object.entries(l3(fx)?.elementsByMove || {})) { families[mv] ??= new Set(); if (v.withElement > 0) families[mv].add(fx); }
  const fam = Object.entries(families);
  items.push({ area: 'Elements', item: `every move family carried out with an element in ≥ 2 subjects (${fam.map(([m, set]) => `${m} ${set.size}`).join(', ') || 'no sessions yet'})`, byFixture: { all: fam.length ? (fam.every(([, set]) => set.size >= 2) ? 'pass' : 'fail') : 'unmeasured' } });
  items.push({ area: 'QA', item: 'an automated end-to-end run per development course (local actor)', byFixture: Object.fromEntries(fixtures.map(fx => [fx, e2e[fx] ? (e2e[fx].ok ? 'pass' : 'fail') : 'unmeasured'])) });
  items.push({ area: 'QA', item: 'visual pass in Chrome (desktop and phone, light and dark); real-voice check with the user\'s go-ahead', byFixture: { all: 'lead' } });
  const cells = items.flatMap(i => Object.values(i.byFixture)), go = cells.every(c => c === 'pass' || c === 'lead') && g.go;
  const cols = [...fixtures, 'all'], table = `| area | item | ${cols.join(' | ')} |\n|---|---|${cols.map(() => '---').join('|')}|\n${items.map(i => `| ${i.area} | ${i.item} | ${cols.map(c => i.byFixture[c] ?? '').join(' | ')} |`).join('\n')}`;
  await writeJson(path.join(RUN, 'checklist.json'), { at: new Date().toISOString(), go, items, gatesGo: g.go });
  console.log(`${table}\n\n${go ? 'GO' : 'NO-GO'} for the live integration: ${cells.filter(c => c === 'pass').length} pass, ${cells.filter(c => c === 'fail').length} fail, ${cells.filter(c => c === 'unmeasured').length} unmeasured; gates ${g.go ? 'GO' : 'NO-GO'}`);
  await scoreboard({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), run: runId, fixture: 'all', level: '§18b checklist', against: '–', prompts: 'the newest results, e2e runs and gates',
    metrics: `${go ? 'GO' : 'NO-GO'} · ${cells.filter(c => c === 'pass').length} pass, ${cells.filter(c => c === 'fail').length} fail, ${cells.filter(c => c === 'unmeasured').length} unmeasured · gates ${g.go ? 'GO' : 'NO-GO'} (see checklist.json)` });
}

async function main() {
  await loadFixture(fixture);
  // A fixture's sandbox-only server settings (e.g. LUNA_PUBLISH_WARNING_REVIEWS=provisional for bio and history): this
  // process's backend reads them, and every stand-in (and so its sandbox server) inherits them.
  Object.assign(process.env, FX.sandboxEnv ?? {});
  if (has('--compare')) { await compare(); return; } // across fixtures, from their newest results: no backend, no model calls
  if (has('--gates')) { await gates(); return; } // the go/no-go (spec §17), from the newest results
  if (has('--checklist')) { await checklist(); return; } // the §18b checklist, with the gates
  if (opt('--interim')) { await interim(opt('--interim')); return; } // the pre-registered interim look of a decisive pair
  // The judge's calibration is domain-agnostic and needs no backend: its items carry their own course material.
  if (has('--calibrate')) { try { await calibrate(); } finally { await closeRuntime(); } return; }
  if (has('--fresh-sandbox')) await sandbox({ fresh: true });
  // The disk contract: levels that copy sandboxes (2, 3) refuse to start below 5 GB free (each session's copy is ~75–100 MB).
  if (['2', '3', 'all'].includes(level)) { const { freeBytes } = await import('../common.mjs'), free = await freeBytes(); if (free < 5 * 2 ** 30) throw Error(`only ${(free / 2 ** 30).toFixed(1)} GB free on the disk: a level-${level} run needs 5 GB to start`); }
  const app = await openApp(await getRuntime());
  try {
    if (has('--build-fixture')) { await buildFixture(app); return; }
    if (!app.examId || !app.km) throw Error(`fixture ${FX.name} has no published course in the sandbox yet${FX.source.kind === 'files' ? ': run --build-fixture first' : FX.source.sandbox ? ' (rerun with --fresh-sandbox once it publishes)' : ''}`);
    if (has('--init-topics')) {
      // A new fixture's topic set, frozen once: its leaf topics with objectives, in course order, at most 8.
      const file = path.join(FX.dir, 'topics.json');
      if (existsSync(file)) { log(`${path.relative(ROOT, file)} exists; it stays frozen`); return; }
      const v = app.services.knowledge.view(app.scope, app.km), leaves = v.topics.filter(t => t.status !== 'retired' && t.objectiveVersionIds.length && !v.topics.some(c => c.parentTopicId === t.topicId));
      await writeJson(file, { examId: app.examId, why: `Frozen ${new Date().toISOString().slice(0, 10)} by --init-topics: the course's leaf topics with objectives, in course order, at most 8. Change it only with a new file (--topics).`,
        topics: leaves.slice(0, 8).map(t => ({ topicId: t.topicId, title: t.title, unit: v.topics.find(p => p.topicId === t.parentTopicId)?.title ?? null })) });
      log(`froze ${Math.min(8, leaves.length)} topics in ${path.relative(ROOT, file)}`);
      return;
    }
    const topics = await loadTopics();
    if (has('--recheck')) { await recheck(); return; }
    if (has('--freeze')) {
      // --freeze [probes|audit|course|baselines|all]: what is generated once and frozen (each part skips what is there).
      // 'all' leaves out the audit (traps and instructor questions): it runs only when asked for by name.
      const what = ['probes', 'specific', 'audit', 'course', 'baselines', 'all'].includes(opt('--freeze')) ? opt('--freeze') : 'all', any = x => what === x || (what === 'all' && x !== 'audit');
      await Promise.all([any('probes') && freezeAll(app, topics), any('specific') && each(topics, t => specificFor(app, t)), any('audit') && each(topics, t => auditFor(app, t)), any('course') && courseProbes(app, topics)]);
      if (any('baselines')) await freezeBaselines(app, topics.map(t => t.topicId));
      return;
    }
    if (opt('--import-studies')) await importStudies(app, opt('--import-studies'));
    if (has('--build-studies')) await buildStudies(app, topics);
    const notes = courseText(app), meas = { grams: gramsOf(notes), index: notesIndex(notes) }, out = {};
    if (level === 'teach') out[opt('--set') === 'course' ? 'teachCourse' : 'teach'] = await teaching(app);
    if (level === 'precision') out.precision = await precision(app);
    if (level === 'repair') out.repair = await repairTest(app);
    if (level === '1' || level === 'all') out.level1 = await level1(app, topics, meas);
    if (level === '2' || level === 'all') out.level2 = await level2(app, topics, meas);
    if (level === '3' || level === 'all') out.level3 = await level3(app, meas);
    await writeJson(path.join(RUN, 'summary.json'), { fixture: FX.name, against, ...out });
    console.log(`\n${path.relative(process.cwd(), RUN)}\n${JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.metrics])), null, 1)}`);
  } finally { app.close(); await closeRuntime(); }
}
await main();
process.exit(0);
