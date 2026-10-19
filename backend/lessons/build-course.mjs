// The course builder (15 Oct, the user: "make Plato a true teaching harness … that allows for users to input material and
// study"): what was done by hand for CS 2800, for any course. Their files become sources (sources/*.md: look_up and read
// search them), then Claude agents on the user's own login, headless like the anatomy builder, write the course's part of
// Plato's brief (brief.md) and its study guide, a unit a file in the format backend/lessons/study.mjs reads, with the
// figures worth building (figures-wanted.json). Progress in <dir>/build.json.
import { agent as runAgent } from '../agents.mjs';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildKits } from './kits.mjs';
import { openPdf, parseRegions } from '../knowledge/formats.mjs';
import { loadStudy } from './study.mjs';
import { lessonCheck } from './smoke-lesson.mjs';

const clean = t => String(t).replace(/\f/g, '\n\n').replace(/[\x00-\x08\x0b\x0e-\x1f\x7f]/g, '').replace(/\n{4,}/g, '\n\n\n');
const slug = name => String(name).replace(/\.[a-z0-9]+$/i, '').replace(/[^\w .()'-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'source';

/** A file's text, page-marked when it has pages: Markdown and text as they are, a PDF page by page, Word and slides by their
 *  parsers; null for what has no text layer (an image). */
export async function textOf(filename, bytes, format = {}) {
  const ext = path.extname(filename).toLowerCase();
  if (['.md', '.markdown', '.txt', '.csv', '.tex'].includes(ext)) return clean(bytes.toString('utf8'));
  if (ext === '.pdf') {
    const pdf = await openPdf(bytes, { maxPages: 1000 }), pages = [];
    try { for (let n = 1; n <= pdf.pages; n++) pages.push(`[page ${n}]\n${await pdf.text(n)}`); } finally { pdf.close(); }
    return clean(pages.join('\n\n'));
  }
  if (['.docx', '.pptx'].includes(ext)) {
    const regions = await parseRegions({ extractor: ext.slice(1), ...format }, bytes);
    return clean(regions.map(r => r.text).filter(Boolean).join('\n\n'));
  }
  return null;
}

/** Writes a source for look_up and read: <dir>/sources/<its name>.md. */
export function addSource(dir, filename, text) {
  mkdirSync(path.join(dir, 'sources'), { recursive: true });
  writeFileSync(path.join(dir, 'sources', sourceName(filename)), text);
}
/** The name an uploaded file has in sources/. */
export const sourceName = filename => `${slug(filename)}.md`;

// What the student says a file is (19 Oct, the user: a very recent exam "supposed to be similar … how would I let the system
// know that it's important"): ./notes.json, { "<source name>": { file, note, model } }, written as they add it (server/index.mjs).
// `model`: the closest thing to their exam, which their practice exams are made on.
export const notesOf = dir => readJson(path.join(dir, 'notes.json')) || {};
export function saveNote(dir, filename, note, model) {
  const notes = notesOf(dir);
  notes[sourceName(filename)] = { file: filename, note: String(note || '').trim().slice(0, 600), model: Boolean(model), at: new Date().toISOString() };
  mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, 'notes.json'), JSON.stringify(notes, null, 2));
  briefNotes(dir);
}
const noteText = (name, n) => `${n.file || name} (read "${name.replace(/\.md$/, '')}")${n.model ? ', the closest to their exam' : ''}${n.note ? `: "${n.note}"` : ''}`;
/** Their notes at the top of Plato's brief, in their own words (a block of its own, rewritten whenever a note changes). */
export function briefNotes(dir) {
  const file = path.join(dir, 'brief.md');
  if (!existsSync(file)) return;
  const notes = Object.entries(notesOf(dir)).filter(([, n]) => n.note || n.model), brief = readFileSync(file, 'utf8').replace(/<!-- their notes -->[\s\S]*?<!-- \/their notes -->\n*/, '');
  const block = notes.length ? `<!-- their notes -->\nWhat they told you about their material (their own words; weigh it above everything else, and model your problems on anything marked closest to their exam):\n${notes.map(([name, n]) => `- ${noteText(name, n)}`).join('\n')}\n<!-- /their notes -->\n\n` : '';
  if (block + brief !== readFileSync(file, 'utf8')) writeFileSync(file, block + brief);
}

const FORMAT = `Exact unit file format (a parser reads it; keep these markers exactly):
\`\`\`
# Unit: <unit title>
Lectures: <comma-separated parts of the material it covers, each starting with its number if it has one ("11 Binary Relations, 12 Equivalence Classes", "Week 3 Slides")>
Formats: <one paragraph: every way this unit is asked about in their exams, homework or practice (true/false, compute, prove, explain, write code, draw…), from the real problems where there are any>

## <Topic title>

**Idea**
<plain-words explanation, 1–2 short paragraphs: what it is and why it matters>

**Rules**
<the definitions, theorems, formulas or facts EXACTLY as their material states them (with its numbering), bullet list>

**How to**
<numbered procedure(s); for a proof or derivation, the skeleton as their course writes it>

**Why**
<first principles, a picture or intuition, connections to other topics, exam twists>

**Worked example**
<one fully worked example at exam level, every step with its reason; a proof written exactly as a grader wants it>

**Traps**
<bullets: the real mistakes students make and what is wrong with each>

**Try**
- Q: <question>
  A: <full answer>
- Q: ...
  A: ...

**Real problems**
- <file name in ./sources/, without .md>: <problem number or name>
<one line each for the real exam, homework or practice problems in their material that test this topic; or "none">

**Also in the notes**
<the exercises or sections of their material for this topic, by number or name, one line each>
\`\`\`
Rules for writing it: 6–10 topics per unit (## headings, in plain words with no $math$: they show as buttons in the course tree) in the order the material teaches them, every block in every topic (Real problems may be "none"), 2–4 Try items mixing the ways the Formats line names. Math in $...$ and $$...$$ (KaTeX: no \\newcommand), code in fenced blocks, tables in markdown pipes, no HTML, no emoji, never the middle dot character. Use the material's own notation and conventions.`;

const BRIEF_EXAMPLE = `You are Plato, a one-on-one tutor. Your student is taking <course, school, term> from <the main material>. <Where they are: exams behind and ahead, with dates and scope when known>. <What matters most in this subject, e.g. "This is a proof course: the skill that matters most is writing correct, complete proofs in the course's style.">

What you have:
- Their study guide: <N> topics in <M> units (<unit names>). The topic you are on arrives as context ("STUDY GUIDE TOPIC …") with its rules exactly as their material states them, a worked example, traps and tries; when you move on, the next one arrives.
- look_up and read: their material (<what it is: the textbook's chapters, slides, past exams…>) and the study guide. Use them to quote the course's own words and find problems like the real ones.

How their exams ask:
- <every kind of question, from the real problems>

Their page for this course: <which of your page tools fit its work and how: the writing space with the section layout its proofs, essays, lab reports or derivations use; the code editor (it runs C and RISC-V; other languages go in markdown code blocks); diagrams; LaTeX>

<Any subject-specific craft worth a short paragraph: what graders look for in a proof, how code is judged, units and sig figs… (what a grader looks for, never predictions of points)>`;

const PLAN = about => `You plan a study guide for one student's course. You run headless: nobody will answer a question, so decide and do it.

Their material is in ./sources/ (one file per thing they uploaded; long files are page-marked "[page N]"). What they told us about the course and their goal: ${about || '(nothing: infer it from the material)'}

1. Survey the material: list ./sources, read each file's start and its table of contents if it has one, grep for chapter or section headings. Work out what the course covers, in what order, which parts are exams or problem sets (with or without solutions), and what the student's goal is.
2. Write ./plan.json: {"course": "<name>", "goal": "<what they're preparing for, scope, date if known>", "units": [{"file": "01-<slug>.md", "title": "<unit title>", "covers": "<exactly which sources and which chapters/sections/pages>", "focus": "<what matters most in it, the real problems that test it>"}], "gaps": ["<what their material lacks for their goal, one line each: no past exams, exercises without solutions, unreadable pages, a chapter in scope that is missing>"]}. 3–8 units of 6–10 topics' worth each, in teaching order, covering everything in scope; nothing in scope left out.
3. Write ./brief.md: the course's part of the tutor's brief, in this shape (fill every <…> from the material; no placeholders left):
${BRIEF_EXAMPLE}

Reply with one line: the units' titles.`;

// What extraction loses (17 Oct: annotated discussion PDFs came through as 3 KB of typed text; the handwritten solutions were
// the point): each PDF's original is kept, and an agent reads its pages as images where the text is thin or garbled.
const ORIGINALS = `Each PDF source's original is in ./originals/ under its upload name (./sources/ has its extracted text). Where a source's text is thin for its pages, garbled (math, tables, figures) or misses what matters (handwritten annotations or solutions, a scanned page), open the original with Read, a few pages at a time (pages: "1-4"), and read it as images.`;

const WRITE = (unit, plan) => `You write ONE unit of a study guide that an AI tutor (Plato) teaches a student from. You run headless: nobody will answer a question, so decide and do it. The topic it is on reaches Plato in full (except the answers to the Try questions); it teaches, writes on the student's page (markdown with $LaTeX$) and practises from it. The student wants to be thoroughly prepared, so the guide must be precise, complete for its scope, and use the material's own definitions.

The course: ${plan.course}. Their goal: ${plan.goal}.
Your unit: "${unit.title}". It covers: ${unit.covers}. Focus: ${unit.focus}.
The other units (for context, not yours to write): ${plan.units.filter(u => u.file !== unit.file).map(u => u.title).join('; ')}.

Their material is in ./sources/ (long files page-marked "[page N]"). ${ORIGINALS} Read EVERY part of the material your unit covers, in full, including its exercises, and any exams or problem sets that test it. Extracted text can mangle math: reconstruct it carefully.

${FORMAT}

CORRECTNESS IS EVERYTHING: re-check every computation, value, count and proof step; prefer the material's own examples; when a fact could be wrong, verify it (python3 or node in ./scratch/). Where the material is silent and you add a standard definition, say so in the text. Aim for 30–80 KB.

Write the unit to ./drafts/${unit.file}. Then write ./drafts/${unit.file.replace(/\.md$/, '.figures.json')}: a JSON array of 2–3 interactive figures worth building for this unit's hardest ideas, each {"topic": "<exactly one of your ## topic titles>", "idea": "<what it must show, with TRUE concrete values, what the student manipulates, and the readout>", "object": "<a physical machine or scene it could be>"}.

Reply with one line: your topic titles.`;

// A second reader (15 Oct, docs/harness-generalization.md: "every course tests itself"): a fresh agent, not the author, checks
// the draft against the material before Plato teaches from it, fixes it in place, and names its riskiest topic.
const AUDIT = (unit, plan) => `You audit ONE unit of a study guide that an AI tutor (Plato) teaches a student from, before the student ever sees it. You run headless: nobody will answer a question, so decide and do it. You did not write it: read it as a skeptical expert grader would.

The course: ${plan.course}. Their goal: ${plan.goal}.
The unit: ./drafts/${unit.file}, "${unit.title}". It covers: ${unit.covers}.

1. Read the unit in full, and the parts of ./sources/ it covers (long files are page-marked "[page N]"). ${ORIGINALS}
2. Check: every definition and convention against the material's own; every worked example, Try answer, value and count, recomputed (python3 or node in ./scratch/), never eyeballed; every proof step follows and every theorem carries its conditions; nothing central to its scope is missing (a definition, theorem, technique or trap the material stresses, a kind of question its exams or problem sets ask).
3. Fix what is actually wrong or missing, in place in ./drafts/${unit.file} (Edit). Keep its format exactly: the "## " topic headings, the block labels and the Try items as they are. Don't rewrite or restyle what is right.
4. Write ./audit/${unit.file.replace(/\.md$/, '.json')}: {"fixes": [{"topic": "<topic title>", "what": "<what was wrong or missing>", "fix": "<what you changed>"}], "unverified": ["<what you could not check against the material>"], "riskiest": {"topic": "<exactly one of its ## topic titles>", "why": "<what a tutor is most likely to get wrong or leave out there>", "risk": <1-10>}}.

Reply with one line: how many fixes.`;

// Material added after the guide was written (a new week's notes, a past exam): folded into the guide, not left only to search.
const UPDATE = (added, notes = {}) => `New material was added to this course after its study guide was written: ${added.map(f => `./sources/${f}`).join(', ')}. You run headless: nobody will answer a question, so decide and do it.
${added.some(f => notes[f]) ? `\nWhat the student said about them: ${added.filter(f => notes[f]).map(f => noteText(f, notes[f])).join('; ')}. Take that as true. A file closest to their exam sets how their exam asks: rewrite the brief's lines on the exam's format, question types, points and length to match it, and add its problems as Real problems lines first.\n` : ''}

Read the new files in full. Read ./plan.json and ./brief.md, and skim the unit files the plan lists (their ## topic headings and Real problems). Then:
- New ground that no unit covers (a new chapter or topic area): add units for it to the "units" of ./plan.json, in the same shape, with new file names numbered after the last. They are written after you; don't write them yourself.
- More on what existing units cover (examples, past exams or problem sets, solutions, a correction, a different convention): edit those unit files in place, keeping their format exactly: Real problems lines for new exams and problem sets, fixed definitions, new traps or tries. Recompute anything you change (python3 or node in ./scratch/).
- Not course content: nothing.
Update ./brief.md too if it changes what they are preparing for (a new exam, its date or scope) or what their material includes.

Reply with one line: what you changed.`;

// After a test lesson: what the judge found goes back into the course, the guide's errors fixed and the tutor's slips noted.
const SMOKE_FIX = (topic, file, verdict) => `A test lesson was taught from the study guide topic "${topic}" (in ./${file}) to a simulated student, and an expert judge audited it against the course material. You run headless: nobody will answer a question, so decide and do it. The judge's findings:
${JSON.stringify({ false_or_misleading: verdict.false_or_misleading, omissions: verdict.omissions, student_errors_missed: verdict.student_errors_missed, guide_problems: verdict.guide_problems }, null, 1).slice(0, 12000)}

For each finding, decide, checking it against ./sources/ (recompute values with python3 or node in ./scratch/):
- Caused by the guide (an error in it, a missing condition, a central idea the topic lacks, a misleading example): fix the topic in ./${file} in place (Edit), keeping its format exactly.
- A teaching habit, not the guide (rushed, skipped a check, accepted a wrong answer): one short line for the tutor under a "## Known pitfalls" heading at the end of ./brief.md (add the heading if it is missing; at most 6 lines under it in all; merge with a similar line).
- The judge is wrong: nothing.
Write ./audit/fix-${slug(topic).replace(/\s+/g, '-').toLowerCase()}.json: {"guide_fixes": ["…"], "pitfalls": ["…"], "dismissed": ["…"]}.

Reply with one line: what you changed.`;

// New testing material (17 Oct, the user: "use this to test how to implement testing material and especially make new material
// where possible"): full practice exams in the exact shape of their real ones, each re-solved blind by a second agent.
const PRACTICE = (plan, name, other, notes = {}) => `You write ONE new practice exam for a student, for an AI tutor (Plato) to drill them with and for the student to take on their own. You run headless: nobody will answer a question, so decide and do it.

The course: ${plan.course}. Their goal: ${plan.goal}.
The study guide's units (being written alongside you; their titles): ${plan.units.map(u => u.title).join('; ')}.
${Object.entries(notes).some(([, n]) => n.model) ? `The student marked this as the closest to their exam; it sets the exam's shape above every other file: ${Object.entries(notes).filter(([, n]) => n.model).map(([f, n]) => `./sources/${f}${n.note ? ` ("${n.note}")` : ''}`).join('; ')}.\n` : ''}
1. Read their real exams, practice exams and graded problem sets in ./sources/ (all of them; ${ORIGINALS}) and note exactly how an exam is built: how many questions, points per question and per part, multi-part (a)-(d) structure, what is asked (derive, compute, explain, a model to set up, a bound), the instructions (notes allowed, tables, exact expressions or numbers), the length and difficulty. Read the units' Formats lines and the goal's scope.
2. Write ./practice/${name}.md: one complete exam in that exact shape for the goal's scope (weighted as the material weights it), with NEW problems: new settings and numbers, never a copy or a light rewording of a problem in ./sources/. Each problem tests what the real exams test, at their difficulty. ${other ? `Another practice exam (./practice/${other}.md) is being written at the same time: make yours cover the scope from different angles and settings.` : ''}
Exact format (a parser and a tutor read it; keep the markers):
\`\`\`
# Practice exam: <title, e.g. "Prelim 2, practice A">
Format: <one line: like which real exam, questions, points, time if known>
Instructions: <the real exam's instructions, adapted>

## Question 1. <short name> (<points> points)
Topics: <the unit title(s) above that it tests, exactly as written>
<the setup, with $math$>

### (a) (<points> points) <what is asked>
**Solution.** <full worked solution as a grader wants it, every step with its reason>
**Answer.** <the final answer, exact and, where a number is natural, also to 4 significant figures>
**Common mistakes.** <1-2 bullets: the likely wrong answers and why they are wrong>
\`\`\`
Math in $...$ and $$...$$ (KaTeX, no \\newcommand), no HTML, no emoji, never the middle dot character.
3. CORRECTNESS IS EVERYTHING: compute every answer (python3 or node in ./scratch/: exact arithmetic, numeric integration, and a Monte Carlo simulation of the setup for every probability, expectation, variance or covariance); a problem whose answer you cannot verify is replaced by one you can.

Reply with one line: the questions' names.`;
const PRACTICE_CHECK = name => `You check ONE practice exam, ./practice/${name}.md, before a student takes it. You did not write it. You run headless: nobody will answer a question, so decide and do it.

For every part: first solve it yourself from the setup and the question alone, without looking at its Solution or Answer (cover them), then compare. Verify independently with python3 or node in ./scratch/: exact computation, numeric integration, and a Monte Carlo simulation of the setup (at least 10^6 draws) for every probability, expectation, variance, covariance or quantile. Also check that each problem is well posed (a valid density, a feasible support, enough information, no ambiguity), new (not a copy of a problem in ./sources/, and not a near-repeat of a setting or question in the other practice exam in ./practice/: if it is, replace yours), within the course's scope, and in the real exams' format. Fix what is wrong in place (Edit), keeping the format exactly; replace a broken problem with a sound one you verify.

Write ./audit/practice-${name}.json: {"parts": <number checked>, "fixes": [{"part": "<1(a)>", "what": "<what was wrong>", "fix": "<what you changed>"}], "simulated": <number of parts confirmed by simulation>}.

Reply with one line: how many fixes.`;

const practiceLine = (dir, names) => `Practice exams made for this course (new problems in the real exams' format, every answer re-solved and simulated by a second agent; read one by name, e.g. read "practice exam ${names[0]}"): ${names.map(n => `${n} (${(readFileSync(path.join(dir, 'practice', `${n}.md`), 'utf8').match(/^## .+$/gm) || []).map(h => h.replace(/^## /, '')).join('; ')})`).join('. ')}. In Exam drill, set one question at a time as the exam does, its parts in order, and hold the solution until they have answered; never show a whole exam's solutions at once.`;

// Uploaded material is untrusted and these agents run python3 and node unattended: in the OS sandbox (writes only inside the
// course folder, no network), on the student's own provider (backend/agents.mjs).
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const sourceNames = dir => { try { return readdirSync(path.join(dir, 'sources')).filter(f => f.endsWith('.md')).sort(); } catch { return []; } };

/** One headless agent working in `cwd` with file tools (and python3/node for checks). Resolves with its last message. */
const agent = (cwd, brief, options) => runAgent(cwd, brief, 'Begin.', options);

/** What is wrong with a written unit, or null: it parses into topics that each have their teaching blocks and tries. */
function unitProblems(file) {
  if (!existsSync(file)) return 'no file was written';
  const tmp = path.join(path.dirname(file), `.check-${path.basename(file, '.md')}`);
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
  writeFileSync(path.join(tmp, 'unit.md'), readFileSync(file, 'utf8'));
  const topics = loadStudy(tmp) || [];
  rmSync(tmp, { recursive: true, force: true });
  if (topics.length < 3) return `it parses into ${topics.length} topics (each needs a "## " heading)`;
  const thin = topics.filter(t => !t.blocks.Idea || !t.blocks.Rules || !t.blocks['Worked example'] || t.tries.length < 2).map(t => t.title);
  return thin.length ? `these topics lack Idea, Rules, Worked example or two Try items: ${thin.join('; ')}` : null;
}

/**
 * Builds the course's brief and study guide in `dir` (its sources/ already written). `about`: what the student said about the
 * course and their goal. Units are written AT_ONCE at a time; each that fails its check is written once more. → { units, topics }.
 */
// kits: { figureDir, baseUrl } of the server, to build and check the course's own figure kits (./kits.mjs); none without.
export async function buildCourse(dir, { about = '', onStage = () => {}, atOnce = 3, kits = null } = {}) {
  const before = buildState(dir), attempts = (before?.attempts || 0) + 1, known = before?.sources, notes = notesOf(dir);
  const status = s => { writeFileSync(path.join(dir, 'build.json'), JSON.stringify({ sources: known, ...s, attempts, pid: process.pid, at: new Date().toISOString() }, null, 2)); onStage(s); };
  mkdirSync(path.join(dir, 'drafts'), { recursive: true }); mkdirSync(path.join(dir, 'scratch'), { recursive: true });
  // A build that broke off (15 Oct: the plan's usage limit stopped four of five units) resumes: its plan and brief stay,
  // its installed units stay, and only the rest are written.
  let plan = null;
  try { plan = JSON.parse(readFileSync(path.join(dir, 'plan.json'), 'utf8')); } catch { /* none yet */ }
  // A guide written by hand (CS 2800 before 16 Oct) has no plan: its own unit files are the plan, never planned over (16 Oct:
  // a sandbox run planned six new units on top of one).
  if (!plan?.units?.length && hasGuide(dir) && existsSync(path.join(dir, 'brief.md'))) {
    const topics = loadStudy(dir) || [], files = [...new Set(topics.map(t => t.file))];
    plan = { course: about.match(/^Course: (.+?)\.(?: |$)/)?.[1] || 'this course', goal: '', units: files.map(file => ({ file, title: topics.find(t => t.file === file).unit, covers: 'written by hand before the harness', focus: '' })), gaps: [] };
    writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 2));
  }
  if (!plan?.units?.length || !existsSync(path.join(dir, 'brief.md'))) {
    status({ state: 'planning' });
    await agent(dir, PLAN(about));
    briefNotes(dir);
    plan = JSON.parse(readFileSync(path.join(dir, 'plan.json'), 'utf8'));
  }
  if (!plan?.units?.length) throw new Error('the plan has no units');
  // A guide that was finished, and material that came after it: the update agent revises units or plans new ones.
  const added = known ? sourceNames(dir).filter(f => !known.includes(f)) : [];
  if (added.length) {
    status({ state: 'updating', added });
    await agent(dir, UPDATE(added, notes)).catch(() => {}); // a usage limit: the new files are still sources Plato searches
    plan = readJson(path.join(dir, 'plan.json')) || plan;
  }
  const installed = u => existsSync(path.join(dir, u.file));
  mkdirSync(path.join(dir, 'audit'), { recursive: true });
  const done = plan.units.filter(installed).map(u => u.title), failed = [], queue = plan.units.filter(u => !installed(u)), already = done.length;
  let limited = null; // the plan's usage limit: the build pauses (the server resumes it later) instead of failing its units
  status({ state: 'writing', units: plan.units.map(u => u.title), done: [...done] });
  async function worker() {
    for (let unit = queue.shift(); unit; unit = queue.shift()) {
      const draft = path.join(dir, 'drafts', unit.file);
      let problem = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try { await agent(dir, attempt === 1 ? WRITE(unit, plan) : `${WRITE(unit, plan)}\n\nA first attempt at this unit failed its check (${problem}). ./drafts/${unit.file} may hold it: fix it or write it again.`); }
        catch (error) { if (error.limit) { limited = error; queue.length = 0; return; } problem = error.message; continue; }
        problem = unitProblems(draft);
        if (!problem) break;
      }
      if (problem) { failed.push({ unit: unit.title, problem }); continue; }
      // The audit edits the draft; one that breaks its format is undone (the writer's version passed its check).
      const written = readFileSync(draft, 'utf8');
      try { await agent(dir, AUDIT(unit, plan)); } catch { /* a usage limit or a crash: the writer's check stands */ }
      if (unitProblems(draft)) writeFileSync(draft, written);
      renameSync(draft, path.join(dir, unit.file)); // the director picks it up within a minute
      done.push(unit.title);
      status({ state: 'writing', units: plan.units.map(u => u.title), done: [...done], failed });
    }
  }
  // Two new practice exams in the shape of their real ones, each checked blind, written alongside the units (they need the plan
  // and the material, not the guide: 17 Oct, about 30 minutes off a build); a usage limit leaves the course without them.
  // A file marked closest to their exam (notes.json) makes them again on its model, whenever it comes.
  const remodel = added.some(f => notes[f]?.model);
  let practice = remodel ? null : before?.practice || null;
  const practiced = practice || (added.length && !remodel) ? Promise.resolve() : (async () => {
    mkdirSync(path.join(dir, 'practice'), { recursive: true });
    const made = await Promise.all(['practice-a', 'practice-b'].map(async (name, i, all) => {
      try { await agent(dir, PRACTICE(plan, name, all[1 - i], notes)); await agent(dir, PRACTICE_CHECK(name)); return existsSync(path.join(dir, 'practice', `${name}.md`)) ? name : null; } catch { return null; }
    }));
    practice = made.filter(Boolean);
    // Plato hears they exist from the brief (written before them): their names, to read in Exam drill and Practice.
    if (practice.length) writeFileSync(path.join(dir, 'brief.md'), `${readFileSync(path.join(dir, 'brief.md'), 'utf8').replace(/\n*Practice exams made for this course[^\n]*/, '').trimEnd()}\n\n${practiceLine(dir, practice)}\n`);
  })();
  // The course's own figure kits (./kits.mjs), decided and built from the plan and material alongside the units, once.
  const kitted = kits && !existsSync(path.join(dir, 'kits', 'installed.json')) ? buildKits(dir, plan, { agent, ...kits, onStage: st => console.log(`Kits: ${plan.course}: ${st}`) }).catch(error => { console.warn(`Kits: ${error.message}`); return []; }) : Promise.resolve([]);
  let kitsDone = false; void kitted.finally(() => { kitsDone = true; });
  await Promise.all(Array.from({ length: atOnce }, worker));
  if (limited) { await Promise.allSettled([practiced, kitted]); throw limited; }
  if (!practice) status({ state: 'practice', units: plan.units.map(u => u.title), done, failed });
  await practiced;
  if (!kitsDone) status({ state: 'kits', units: plan.units.map(u => u.title), done, failed });
  const madeKits = await kitted;
  // The figures each unit asked for, for scripts/prepare-figures.mjs (or the anatomy tool's ready list).
  const wanted = readdirSync(path.join(dir, 'drafts')).filter(f => f.endsWith('.figures.json')).sort()
    .flatMap(f => { try { return JSON.parse(readFileSync(path.join(dir, 'drafts', f), 'utf8')); } catch { return []; } });
  if (wanted.length) writeFileSync(path.join(dir, 'figures-wanted.json'), JSON.stringify(wanted, null, 2));
  const report = { gaps: plan.gaps || [], ...(failed.length === plan.units.length || (added.length && done.length === already) ? before?.report || {} : await checkLessons(dir, plan, s => status({ state: 'checking', units: plan.units.map(u => u.title), done, failed, ...s }))) };
  const topics = loadStudy(dir)?.length || 0;
  status({ state: failed.length === plan.units.length ? 'failed' : 'done', units: plan.units.map(u => u.title), done, failed, topics, report, practice, kits: madeKits.map(k => k.name), sources: sourceNames(dir) });
  return { units: done.length, topics, failed, report };
}


/**
 * The guide's riskiest topics (by their audits) each taught once to a simulated student and judged; the findings go back into
 * the guide and the brief (SMOKE_FIX). LUNA_SMOKE=0 skips the lessons. → the readiness report's checks.
 */
async function checkLessons(dir, plan, onStage, { lessons = Number(process.env.LUNA_SMOKE ?? 2) } = {}) {
  const audits = plan.units.map(u => ({ unit: u, a: readJson(path.join(dir, 'audit', u.file.replace(/\.md$/, '.json'))) })).filter(x => x.a);
  const auditFixes = audits.reduce((n, x) => n + (x.a.fixes?.length || 0), 0), unverified = audits.flatMap(x => x.a.unverified || []).slice(0, 12);
  const topics = loadStudy(dir) || [], at = title => topics.findIndex(t => t.title.trim().toLowerCase() === String(title || '').trim().toLowerCase());
  const risky = audits.filter(x => at(x.a.riskiest?.topic) >= 0).sort((a, b) => (b.a.riskiest.risk || 0) - (a.a.riskiest.risk || 0)).slice(0, lessons);
  const checked = [];
  for (const { unit, a } of risky) {
    onStage({ checking: a.riskiest.topic });
    try {
      const { verdict } = await lessonCheck(dir, at(a.riskiest.topic), { turns: 5, course: plan.course });
      writeFileSync(path.join(dir, 'audit', `lesson-${unit.file.replace(/\.md$/, '.json')}`), JSON.stringify(verdict, null, 2));
      if (verdict.scores) await agent(dir, SMOKE_FIX(a.riskiest.topic, unit.file, verdict)).catch(() => {});
      checked.push({ topic: a.riskiest.topic, scores: verdict.scores || null, problems: (verdict.false_or_misleading || []).length + (verdict.guide_problems || []).length });
    } catch (error) { checked.push({ topic: a.riskiest.topic, error: String(error.message).slice(0, 200) }); }
  }
  return { auditFixes, audited: audits.length, unverified, lessons: checked };
}

/** The build's state, or null when none was started. */
/** Whether a build should start (or start again): never for a course with a whole guide; again after a failure only once
 *  `retryMs` has passed, at most `tries` times (a usage limit or a crash, not a course that can't be built). */
export function buildDue(dir, { retryMs = 45 * 60_000, tries = 4 } = {}) {
  const st = buildState(dir);
  if (!st) return !hasGuide(dir);
  if (st.state === 'done' && !st.failed?.length) return Boolean(st.sources) && sourceNames(dir).some(f => !st.sources.includes(f)); // new material after it
  // One in progress here is running; one left by a server that stopped resumes now (its agents went with it).
  // ponytail: by pid, so a pid reused after a reboot looks alive until the 3-hour mark.
  if (['planning', 'updating', 'writing', 'practice', 'kits', 'checking'].includes(st.state)) return st.pid !== process.pid || Date.now() - Date.parse(st.at) > 3 * 60 * 60_000;
  if (st.state === 'paused') return Date.now() - Date.parse(st.at) > 30 * 60_000; // a usage limit: tried again in half an hour, never given up
  return (st.attempts || 1) < tries && Date.now() - Date.parse(st.at) > retryMs;
}
export function buildState(dir) { try { return JSON.parse(readFileSync(path.join(dir, 'build.json'), 'utf8')); } catch { return null; } }
/** True when the course already has a study guide (a unit file). */
export const hasGuide = dir => { try { return readdirSync(dir).some(f => /\.md$/.test(f) && f !== 'brief.md' && statSync(path.join(dir, f)).isFile()); } catch { return false; } };
export { agent as courseAgent };
