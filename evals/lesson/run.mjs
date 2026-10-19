// Lesson-face eval: Plato teaches a simulated novice a topic over several turns; an Opus judge audits the whole lesson (chat +
// page) for false claims, omissions and missed student errors (backend/lessons/smoke-lesson.mjs).
// node run.mjs <topic-regex> <chapters comma list, or - for the course's own material> <out.json> [turns]
// COURSE_DIR: the course taught (its study guide, brief and sources); BOOK_DIR: where the judge's chapters are ("lecture NN …").
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const L = '/Users/orionhoch/Desktop/study/Luna-Study';
const { lessonCheck } = await import(`${L}/backend/lessons/smoke-lesson.mjs`);
const { loadStudy } = await import(`${L}/backend/lessons/study.mjs`);
const G = process.env.COURSE_DIR || `${L}/data/study-guides/exam_9brmxohvc0CEQDkt`, BOOK = process.env.BOOK_DIR || G;
const [topicRe, chapters, out, turnsArg] = process.argv.slice(2);
const n = loadStudy(G).findIndex(t => new RegExp(topicRe, 'i').test(t.title));
const groundTruth = chapters && chapters !== '-' ? chapters.split(',').map(c => { const f = readdirSync(`${BOOK}/sources`).find(x => x.startsWith(`lecture ${c.padStart(2, '0')} `)); return `=== ${f}\n${readFileSync(`${BOOK}/sources/${f}`, 'utf8')}`; }).join('\n\n') : null;
const r = await lessonCheck(G, n, { turns: Number(turnsArg || 6), groundTruth, review: process.env.REVIEW !== '0', ...(G.includes('exam_9brmxohvc0CEQDkt') ? { course: 'Cornell CS 2800 (discrete mathematics)', known: 'earlier topics: logic, sets, proofs, induction, graphs, roughly' } : {}) });
writeFileSync(out, JSON.stringify(r, null, 2));
const v = r.verdict;
console.log(r.topic, JSON.stringify(v.scores || {}), 'false:', (v.false_or_misleading || []).length, 'omit:', (v.omissions || []).length, 'missed:', (v.student_errors_missed || []).length);
