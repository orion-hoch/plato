// The harness's own regression check (docs/harness-generalization.md item 5): each reference course's topics (benchmark.json)
// taught to a simulated student and judged against the course's material (backend/lessons/smoke-lesson.mjs), two at a time;
// the scores beside the last run's. For changes to Plato's prompts or tools, instead of testing by hand.
// node evals/benchmark.mjs [tag] [turns]   → evals/benchmark/<tag>.json
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { lessonCheck } from '../backend/lessons/smoke-lesson.mjs';
import { loadStudy } from '../backend/lessons/study.mjs';

const here = path.dirname(new URL(import.meta.url).pathname), root = path.resolve(here, '..');
const [tag = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'), turns = '6'] = process.argv.slice(2);
const { courses } = JSON.parse(readFileSync(path.join(here, 'benchmark.json'), 'utf8'));
const out = path.join(here, 'benchmark'), prior = readdirSync(out).filter(f => f.endsWith('.json')).sort((a, b) => statSync(path.join(out, b)).mtimeMs - statSync(path.join(out, a)).mtimeMs)[0];
const before = prior ? JSON.parse(readFileSync(path.join(out, prior), 'utf8')) : [];

const jobs = courses.flatMap(c => c.topics.map(re => ({ ...c, re })));
const results = [];
async function worker() {
  for (let job = jobs.shift(); job; job = jobs.shift()) {
    const dir = path.resolve(root, job.dir), n = (loadStudy(dir) || []).findIndex(t => new RegExp(job.re, 'i').test(t.title));
    if (n < 0) { results.push({ course: job.course, topic: job.re, error: 'no such topic' }); continue; }
    try {
      const r = await lessonCheck(dir, n, { turns: Number(turns), course: job.course, known: job.known }), v = r.verdict;
      results.push({ course: job.course, topic: r.topic, scores: v.scores || null, false: (v.false_or_misleading || []).length, omissions: (v.omissions || []).length, missed: (v.student_errors_missed || []).length, flagged: r.flagged.length, summary: v.summary || v.raw?.slice(0, 300) });
    } catch (error) { results.push({ course: job.course, topic: job.re, error: String(error.message).slice(0, 200) }); }
    console.log(`${results.length}: ${results.at(-1).topic}`, JSON.stringify(results.at(-1).scores || results.at(-1).error));
  }
}
await Promise.all([worker(), worker()]);
writeFileSync(path.join(out, `${tag}.json`), JSON.stringify(results, null, 2));
const was = topic => before.find(b => b.topic === topic)?.scores;
const delta = (now, then) => now == null ? '?' : then == null ? `${now}` : `${now}${now === then ? '' : ` (${now > then ? '+' : ''}${now - then})`}`;
console.log(`\n${tag}${prior ? ` against ${prior}` : ''}:\ncourse | topic | accuracy | completeness | teaching | false/omit/missed`);
for (const r of results) console.log(`${r.course.split(' (')[0]} | ${r.topic} | ${r.error || [delta(r.scores?.accuracy, was(r.topic)?.accuracy), delta(r.scores?.completeness_so_far, was(r.topic)?.completeness_so_far), delta(r.scores?.teaching, was(r.topic)?.teaching), `${r.false}/${r.omissions}/${r.missed}`].join(' | ')}`);
