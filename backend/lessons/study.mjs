// A study guide written for one exam (<data>/study-guides/<examId>/*.md, one unit per file): its topics, in order, each taught
// as a section guide (docs/teaching-guide-spec.md). A tight, exam-scoped walk instead of every section of the course (13 Oct,
// the user: "make me a complete study guide … a coherent study program").
//
// A unit file: `# Unit: <title>`, then `Lectures: 02 Numbers, 06 Float`, then `## <Topic>` with bold blocks **Idea**, **Rules**,
// **How to**, **Worked example**, **Traps**, **Try** (`- Q: …` / `  A: …`), **Practice prelim**, **Quiz**.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const BLOCK = /^\*\*(Idea|Rules|How to|Why|Worked example|Traps|Try|Real problems|Practice prelim|Quiz|Lab|Also in the notes)\*\*[ \t]*(?:[—:–-][ \t]*)?/gm;

/** The topics of an exam's study guide, in order, or null when it has none. */
export function loadStudy(dir) {
  let files;
  try { files = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'brief.md').sort(); } catch { return null; } // the brief is Plato's, not a unit
  const topics = [];
  for (const file of files) {
    const text = readFileSync(path.join(dir, file), 'utf8');
    const unit = text.match(/^#\s+Unit:\s*(.+)$/m)?.[1]?.trim() || file.replace(/\.md$/, '');
    const lectures = (text.match(/^Lectures:\s*(.+)$/m)?.[1] || '').split(',').map(x => x.trim()).filter(Boolean);
    const formats = text.match(/^Formats:\s*(.+)$/m)?.[1]?.trim() || ''; // how this unit's exams ask (the practice prelim, quizzes, labs)
    for (const part of text.split(/^##\s+/m).slice(1)) {
      const title = part.split('\n')[0].trim(), body = part.slice(part.indexOf('\n') + 1), marks = [...body.matchAll(BLOCK)], blocks = {};
      marks.forEach((m, i) => { blocks[m[1]] = body.slice(m.index + m[0].length, marks[i + 1]?.index ?? body.length).trim(); });
      const tries = [...(blocks.Try || '').matchAll(/^\s*-\s*Q(?:\s*\([^)]*\))?:\s*([\s\S]*?)\n\s*A:\s*([\s\S]*?)(?=\n\s*-\s*Q(?:\s*\([^)]*\))?:|$)/gm)].map(m => ({ q: m[1].trim(), a: m[2].trim() }));
      topics.push({ n: topics.length, unit, file, lectures, formats, title, blocks, tries, problems: problemsOf(blocks['Practice prelim']) });
    }
  }
  return topics.length ? topics : null;
}

// The practice-prelim problems a topic lists: "Problem 6 (a)–(d), Problem 12" or "4 (printf formats), 13, 26a"; "none …" is none,
// and nothing in parentheses counts (part labels, patch numbers, problems it only supports).
function problemsOf(text = '') {
  const t = String(text).trim();
  if (!t || /^none\b/i.test(t)) return [];
  let flat = t, prev;
  do { prev = flat; flat = flat.replace(/\([^()]*\)/g, ' '); } while (flat !== prev);
  return [...new Set([...flat.matchAll(/(?:^|[,;]\s*|\band\s+|Problems?\s+)(\d{1,2})[a-z]?\b/gi)].map(m => Number(m[1])))];
}

/** The topic a lecture ("02 Numbers", or its number) starts at: the first topic of the unit that has it, else -1. */
export function topicOfLecture(topics, lecture) {
  const n = Number(String(lecture ?? '').match(/\d+/)?.[0]), num = l => Number(l.match(/\d+/)?.[0]);
  if (!Number.isFinite(n)) return -1;
  let at = topics.findIndex(t => t.lectures.some(l => num(l) === n));
  if (at < 0) return -1;
  // Past the unit's topics from its earlier lectures ("02 Numbers" starts after "01 Switches"'s topic), by their names' words.
  const earlier = topics[at].lectures.filter(l => num(l) < n).flatMap(l => l.toLowerCase().replace(/^\d+\s*/, '').match(/[a-z]{4,}/g) || []);
  while (earlier.length && topics[at + 1]?.unit === topics[at].unit && earlier.some(w => topics[at].title.toLowerCase().includes(w))) at++;
  // A later lecture of the unit: the topic named for it ("06 Float" → the float topic); else, when no earlier lecture has topics
  // left past that start ("02 Numbers" after "01 Switches"), the start; else as far into the unit as the lecture is into its
  // lectures ("18 Control Flow", 5th of 6 → about the 7th of 9 topics).
  const lectures = topics[at].lectures, k = lectures.findIndex(l => num(l) === n), unit = topics.filter(t => t.unit === topics[at].unit);
  if (k > 0) {
    const wordsOf = l => l.toLowerCase().replace(/^\d+\s*/, '').match(/[a-z]{4,}/g) || [], has = (t, l) => wordsOf(l).some(w => t.title.toLowerCase().includes(w.replace(/s$/, '')));
    const titled = unit.find(t => has(t, lectures[k]));
    if (titled) return titled.n;
    if (!lectures.slice(0, k).some(l => unit.some(t => t.n >= at && has(t, l)))) return at;
    return unit[Math.floor(k * unit.length / lectures.length)].n;
  }
  return at;
}

/** The topic whose title best fits their words ("two's complement", "endianness"), else -1. */
export function topicOfWords(topics, words) {
  const want = new Set(String(words || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []), stem = w => w.replace(/(ing|ion|s)$/, '');
  if (!want.size) return -1;
  const score = t => [...want].filter(w => t.title.toLowerCase().includes(stem(w))).length / Math.max(1, want.size);
  const best = topics.map(t => ({ t, v: score(t) })).sort((a, b) => b.v - a.v)[0];
  return best && best.v >= 0.5 ? best.t.n : -1;
}

/** The topic as the voice's text: everything but the tries' answers and the problem lists (those come as questions). */
export function studyText(topics, n) {
  const t = topics[n], b = t.blocks;
  return [
    `STUDY GUIDE: topic ${n + 1} of ${topics.length}, ${t.unit}: ${t.title}`,
    topics[n - 1] ? `Before this: ${topics[n - 1].title}.` : 'This is the first topic.', topics[n + 1] ? `Next: ${topics[n + 1].title}.` : 'This is the last topic.',
    ...['Idea', 'Rules', 'How to', 'Why', 'Worked example', 'Traps', 'Also in the notes', 'Real problems', 'Practice prelim', 'Quiz', 'Lab'].filter(k => b[k]).map(k => `${k.toUpperCase()}:\n${b[k]}`),
    t.formats ? `HOW THIS UNIT IS ASKED ON THEIR EXAMS (vary your questions across these): ${t.formats}` : null,
    `ALL TOPICS (you are on ${n + 1}):\n${topics.map(x => `${x.n + 1}. ${x.title}`).join('\n')}`,
  ].filter(Boolean).join('\n\n');
}

// ---------- look_up: the tutor's search over the exam's own material (13 Oct, the user: "provide them the tools and the context") ----------
// <dir>/sources/* (lecture notes, the practice prelim, quizzes, labs, assignments) and the study guide itself, as sections, by words.
export function loadSources(dir) {
  const sections = [];
  const add = (source, text) => {
    // A short file (a lab worksheet, a lab's page) stays whole: one look_up gives all of it.
    if (String(text).length <= 4600 && !/^study guide/.test(source)) { const t = String(text).trim(); if (t.length > 40) sections.push({ source, text: t, lower: t.toLowerCase(), whole: true }); return; }
    // Sections at headings, quiz questions ("Q3 …") or problem rules (---); long ones in ~1,800-character pieces.
    const parts = String(text).split(/\n(?=#{1,4}\s|Q\d+(?:\.\d+)?\s|---\n)/);
    for (const part of parts) for (let i = 0; i < part.length; i += 1800) { const t = part.slice(i, i + 1800).trim(); if (t.length > 40) sections.push({ source, text: t, lower: t.toLowerCase() }); }
  };
  try {
    for (const f of readdirSync(path.join(dir, 'sources')).sort()) {
      const text = readFileSync(path.join(dir, 'sources', f), 'utf8'), weeks = text.split(/^(?=# Practice quiz: Week \d+)/m);
      // The quizzes, week by week: each question's section carries its week ("Week 5 quiz"), so "week 5 flip flop" finds it.
      if (weeks.length > 1) for (const w of weeks) { const n = w.match(/^# Practice quiz: Week (\d+)/)?.[1]; if (n) add(`Week ${n} quiz`, w); }
      // The practice prelim, problem by problem: each problem with its solution, whole (one look_up gives both).
      else if (/prelim/.test(f) && text.includes('\n---\n')) for (const p of text.split(/\n-{3,}\n/)) { const t = p.trim(); if (t.length > 40) sections.push({ source: 'practice-prelim', text: t, lower: t.toLowerCase(), whole: true }); }
      else add(f.replace(/\.(md|txt)$/, ''), text);
    }
  } catch { /* no sources */ }
  try { for (const f of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) add(`study guide ${f.replace(/\.md$/, '')}`, readFileSync(path.join(dir, f), 'utf8')); } catch { /* no guide */ }
  // Practice exams the harness made (build-course.mjs PRACTICE), question by question, each whole with its solutions.
  try { for (const f of readdirSync(path.join(dir, 'practice')).filter(f => f.endsWith('.md')).sort()) for (const q of readFileSync(path.join(dir, 'practice', f), 'utf8').split(/\n(?=## )/).slice(1)) sections.push({ source: `practice exam ${f.replace(/\.md$/, '')}`, text: q.trim(), lower: q.toLowerCase(), whole: true }); } catch { /* none made */ }
  return sections;
}
const STOP = new Set('the a an and or of to in on for with what how is are be it this that their them they show find give me from about can you any all some questions question solution solutions answer answers exact actual'.split(' '));
/** The best few sections for their words ("practice prelim problem 6", "week 3 quiz flip flop", "lab 5 loops"), most relevant first. */
// A lab or assignment named in words ("Lab 5", "lab 3.5", "A2"): its own files, by name.
const LAB_FILES = { 'lab 1': /^labs-c$/, 'lab 2': /^(lab2-|labs-minifloat)/, 'lab 3.5': /^(lab35-|labs-gdb)/, 'lab 3': /^(lab3-|labs-huffman)/, 'lab 4': /^(lab4-|labs-cpusim)/, 'lab 5': /^(lab5-|labs-asm)/,
  a1: /^assignments-printf/, a2: /^assignments-minifloat/, a3: /^assignments-huffman/, a4: /^assignments-cpusim/, a5: /^assignments-asm/ };
export function namedFiles(text) {
  const low = String(text || '').toLowerCase().replace(/lab\s*3\.5/g, 'lab 3.5').replace(/lab\s*(\d)/g, 'lab $1');
  return Object.entries(LAB_FILES).filter(([k]) => k.startsWith('lab') ? new RegExp(`\\b${k.replace('.', '\\.')}(?![.\\d])`).test(low) : new RegExp(`\\b${k}\\b`).test(low)).map(([, re]) => re);
}
export function searchSources(sections, query, { max = 3, chars = 1800 } = {}) {
  const named = namedFiles(query);
  if (named.length) { const own = sections.filter(s => named.some(re => re.test(s.source))); if (own.length) sections = own; } // "lab 5 loops": within Lab 5's files
  const q = String(query || '').toLowerCase(), words = (q.match(/[a-z0-9']+/g) || []).filter(w => !STOP.has(w) && (w.length > 2 || /\d/.test(w)));
  if (!words.length) return [];
  const want = { prelim: /prelim/.test(q), quiz: /quiz|week\s*\d/.test(q), lab: /\blab/.test(q), assignment: /\bassign|\ba\d\b|homework/.test(q), lecture: /lecture|notes/.test(q), guide: /guide/.test(q) };
  const score = s => {
    let n = words.reduce((k, w) => k + (s.lower.includes(w) ? (w.length > 5 ? 2 : 1) : 0), 0);
    const src = s.source.toLowerCase();
    const week = q.match(/week\s*(\d+)/)?.[1]; if (week) n += src === `week ${week} quiz` ? 6 : src.endsWith('quiz') ? -3 : 0; // that week's quiz
    if (want.prelim && src.includes('prelim')) n += 3; if (want.quiz && src.includes('quiz')) n += 3; if (want.lab && src.startsWith('lab')) n += 3;
    if (want.assignment && src.startsWith('assign')) n += 3; if (want.lecture && src.startsWith('lecture')) n += 3; if (want.guide && src.startsWith('study')) n += 3;
    const num = q.match(/(?:problem|q|question)\s*(\d+)/)?.[1]; if (num && new RegExp(`(^|\\n)#*\\s*(${num}\\.|problem ${num}\\b|q${num}\\b)`, 'i').test(s.text)) n += 6;
    return n;
  };
  return sections.map(s => ({ s, n: score(s) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, max).map(({ s }) => ({ source: s.source, text: s.text.slice(0, s.whole ? Math.max(chars, 5000) : chars) }));
}

// ---------- what they'll be asked: a topic's real problems, as text for the voice (13 Oct, the user: "use the lab materials and
// practice questions to guide what it has to teach") ----------
/** The quiz questions a topic's Quiz line names ("Week 2 Q1.1–Q1.4; Week 3 Q11.1"), each whole (all its parts), from the quizzes file. */
export function quizQuestions(dir, line, { max = 4, chars = 900 } = {}) {
  let text;
  try { text = readFileSync(path.join(dir, 'sources', 'practice-quizzes.md'), 'utf8'); } catch { return []; }
  const weeks = new Map([...text.split(/^(?=# Practice quiz: Week \d+)/m)].map(w => [Number(w.match(/^# Practice quiz: Week (\d+)/)?.[1]), w]).filter(([k]) => k));
  const out = [], seen = new Set();
  for (const m of String(line || '').matchAll(/Week\s*(\d+)\s*([\s\S]*?)(?=Week\s*\d|;|$)/gi)) { // each week's own questions, up to the next week
    const week = weeks.get(Number(m[1]));
    if (!week) continue;
    const lines = week.split('\n');
    for (const q of [...new Set([...m[2].matchAll(/Q(\d+)/g)].map(x => Number(x[1])))]) {
      const key = `${m[1]}:${q}`;
      if (seen.has(key) || out.length >= max) continue;
      const start = lines.findIndex(l => new RegExp(`^\\s*Q${q}(\\s|$)`).test(l));
      if (start < 0) continue;
      const end = lines.findIndex((l, i) => i > start && /^\s*Q\d+(\s|$)/.test(l) && !new RegExp(`^\\s*Q${q}(\\s|$|\\.)`).test(l));
      seen.add(key);
      out.push({ source: `Week ${m[1]} quiz, Q${q}`, text: lines.slice(start, end < 0 ? undefined : end).join('\n').slice(0, chars) });
    }
  }
  return out;
}

/** The topic's real problems as one text: those its Real problems block cites from their material (any course), and CS 3410's
 *  practice-prelim problems with their solutions, quiz questions (unanswered: solve them), lab and assignment parts. */
export function realProblemsText(dir, topic, { prelim = () => null, sections = [] } = {}) {
  const parts = [];
  // "- past-exam 2019 Prelim 1: Problem 3": the problem from that file, found by its number or name (with its solution when the
  // file has it next to it). Only the file named: a guessed match from elsewhere would teach the wrong problem.
  for (const line of String(topic.blocks['Real problems'] || '').split('\n').map(x => x.replace(/^\s*[-*]\s*/, '').trim()).filter(x => x && !/^none\b/i.test(x)).slice(0, 3)) {
    const [name, what = ''] = line.split(/:\s+(.+)/), own = sections.filter(s => s.source.toLowerCase() === name.trim().toLowerCase().replace(/\.(md|txt)$/, ''));
    const hit = own.length && searchSources(own, what || line, { max: 1, chars: 1600 })[0];
    if (hit) parts.push(`[${hit.source}${what ? `, ${what}` : ''}]\n${hit.text}`);
  }
  for (const num of topic.problems.slice(0, 2)) {
    const p = prelim(num);
    if (p) parts.push(`[Practice prelim problem ${num}]\n${String(p.markdown).slice(0, 1100)}\nOfficial solution: ${String(p.solution).slice(0, 700)}`);
  }
  for (const q of quizQuestions(dir, topic.blocks.Quiz)) parts.push(`[${q.source}] (no answer key: work it out)\n${q.text}`);
  const lab = String(topic.blocks.Lab || '').trim();
  if (lab && !/^none\b/i.test(lab)) {
    // The labs and assignments it names ("Lab 4 worksheet Q1", "A2 rounding"), searched within their own files; else any lab's.
    const FILES = { 'lab 1': /^labs-c$/, 'lab 2': /^(lab2-|labs-minifloat)/, 'lab 3.5': /^(lab35-|labs-gdb)/, 'lab 3': /^(lab3-|labs-huffman)/, 'lab 4': /^(lab4-|labs-cpusim)/, 'lab 5': /^(lab5-|labs-asm)/,
      a1: /^assignments-printf/, a2: /^assignments-minifloat/, a3: /^assignments-huffman/, a4: /^assignments-cpusim/, a5: /^assignments-asm/ };
    const low = lab.toLowerCase().replace(/lab\s*3\.5/g, 'lab 3.5'), named = Object.entries(FILES).filter(([k]) => k.startsWith('lab') ? new RegExp(`\\b${k.replace('.', '\\.')}(?![.\\d])`).test(low) : new RegExp(`\\b${k}\\b`).test(low)).map(([, re]) => re);
    const pool = sections.filter(s => named.length ? named.some(re => re.test(s.source)) : /^(lab|assign)/i.test(s.source));
    for (const f of searchSources(pool, lab, { max: 2, chars: 800 })) parts.push(`[${f.source}]\n${f.text}`);
  }
  return parts.length ? `WHAT THEY'LL BE ASKED: the real problems on this topic from their own material (exams, problem sets, quizzes, labs, assignments). Let these drive what you teach and the problems you give.\n\n${parts.join('\n\n---\n\n')}` : '';
}

/** A whole source, part by part (read: 15 Oct, a definition word for word, a chapter's exercises): the file of the course's
 *  material (sources/, or a study-guide unit) whose name best fits `name`, in ~7,000-character parts cut at paragraphs.
 *  → { source, part, parts, text } or { names } when nothing fits (the names there are). */
export function readSource(dir, name, part = 1) {
  const files = [];
  try { for (const f of readdirSync(path.join(dir, 'sources'))) files.push({ name: f.replace(/\.(md|txt)$/, ''), file: path.join(dir, 'sources', f) }); } catch { /* none */ }
  try { for (const f of readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'brief.md')) files.push({ name: `study guide ${f.replace(/\.md$/, '')}`, file: path.join(dir, f) }); } catch { /* none */ }
  try { for (const f of readdirSync(path.join(dir, 'practice')).filter(f => f.endsWith('.md'))) files.push({ name: `practice exam ${f.replace(/\.md$/, '')}`, file: path.join(dir, 'practice', f) }); } catch { /* none made */ }
  const words = s => String(s).toLowerCase().match(/[a-z]+|\d+/g) || [], want = words(name).filter(w => !STOP.has(w));
  const score = f => { const have = words(f.name); return want.reduce((n, w) => n + (have.includes(w) || have.includes(String(Number(w))) ? (/\d/.test(w) ? 3 : 1) : 0), 0); };
  const best = files.map(f => ({ f, v: score(f) })).sort((a, b) => b.v - a.v)[0];
  if (!best || best.v === 0) return { names: files.map(f => f.name) };
  const text = readFileSync(best.f.file, 'utf8'), parts = [];
  for (let at = 0; at < text.length;) {
    let end = Math.min(text.length, at + 7000);
    if (end < text.length) { const cut = text.lastIndexOf('\n\n', end); if (cut > at + 3000) end = cut; }
    parts.push(text.slice(at, end).trim()); at = end;
  }
  const k = Math.min(Math.max(1, Number(part) || 1), parts.length);
  return { source: best.f.name, part: k, parts: parts.length, text: parts[k - 1] };
}
