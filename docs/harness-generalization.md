# Plato as a publishable teaching harness: making any course work with near-zero testing

15 Oct 2026. Where we are: a user uploads material; the harness builds sources, a study guide and a course brief
(`backend/lessons/build-course.mjs`); Opus teaches through tools and faces; a colleague model checks every board
(`backend/session/review.mjs`). Tested on two hand-built courses (CS 3410, CS 2800) and one auto-built one (counting).
Lesson evals: accuracy 8–9, completeness 7–9, teaching 9.

"Near-zero testing" can't mean that nobody tests. It means **the harness tests each course itself**, and every quality
risk has a check that runs without a developer. The ideas below are ordered by how much they buy toward that.

---

## 1. The harness tests every course it builds (highest leverage)

Each new course runs today's manual loop (build, lesson eval, read the judge, fix) automatically.

1. **An independent audit of the guide.** After the writers finish, a separate auditor agent, with the sources and
   `compute`, checks each unit:
   - definitions match the material word for word;
   - every Try answer and worked example is recomputed;
   - every proof step follows.

   It fixes what is wrong in place and logs what it changed. The writers already self-check, but a fresh reader
   catches what an author can't. Cost: about one agent per unit.
2. **A built-in smoke lesson.** `evals/lesson/run.mjs` becomes a library the builder calls:
   - 2–3 simulated lessons on the unit topics the planner marks hardest, each judged against the sources.
   - Judge findings go back automatically as fixes to the guide (a wrong Try answer, a missing condition), or as a
     "Known pitfalls" paragraph in `brief.md`.
3. **A readiness report the user can see.** `build.json` gains a small report: units, topics, audit fixes, smoke
   lesson scores, and anything the harness couldn't verify ("no past exams found: practice comes from the chapter
   exercises"). It's shown on the course chooser. Saying what was checked is the publishable version of "trust me".
4. **Checks during sessions, beyond boards.** The colleague check covers slides today. Extend it to:
   - the verdicts Plato gives on the student's answers;
   - **Proof check** grades. A wrong "full marks" is worse than a wrong slide.

   Keep it in the background and quiet; block only when a verdict is about to go out, which is a few seconds at most.
5. **A fixed regression benchmark for the harness itself.** Three reference courses that differ on purpose: a proof
   course (2800), a programming course, and a reading/essay course. Prompt or tool changes run the benchmark: about
   10 judged lessons, scores compared with the last run. This replaces ad-hoc testing for us; users never run it.

## 2. One pipeline, one provider (needed before publishing)

6. **The study guide is the single source of truth.** Two pipelines run side by side today:
   - the Claude-built study guide, which Plato actually teaches from;
   - the Codex course-model build, which takes hours on the heavy lane, and which a session still waits for before
     it can start.

   Let a session start as soon as sources exist (Plato teaches from the material with `look_up`/`read` while the
   guide builds; that already works). Make the Codex knowledge build optional. This removes the second provider and
   the hours-long wait.
7. **Provider abstraction for the brain.** Today it is the user's local `claude` login. Publishing needs:
   - an Anthropic API key mode (Agent SDK or the Messages API with the same tool schema);
   - per-role model choice: Opus to teach, Sonnet to check and build, Haiku for small jobs;
   - a per-course cost meter.

   The system prompt is now static per course (faces live in it), so prompt caching works.
8. **Usage-limit resilience everywhere.** Builds already resume. Do the same for the live turn: on a usage limit, say
   so in one line, fall back to a smaller model and tell the student. Never stall silently.

## 3. Domain generality without per-domain code

9. **The planner writes the discipline profile; code adds none.** The planner already writes `brief.md`. Have it also
   choose:
   - the work zones the course needs: a proof space, a code editor (which language), a sections space for essays or
     lab reports, LaTeX steps;
   - the question formats its exams use;
   - what "correct" means: exact values, proofs, code that runs, argued essays.

   This goes in `plan.json` → `profile`. Plato's tools stay the same; the brief says which ones matter here.
10. **Work zones for more subjects.**
    - **Code in more languages:** Python (Pyodide, in the browser) and JavaScript, alongside C and RISC-V. `compute`
      gets Python too: most STEM material is Python-minded.
    - **The proof space is already a general sections space.** Present it as "a writing space with sections" and
      ship section layouts beyond proofs: essay (thesis, evidence, analysis, counterargument), lab report, derivation,
      worked problem (given, find, method, answer, check), case brief.
11. **Diagrams for any subject.** Add a general diagram type (Mermaid: flowcharts, state machines, sequences,
    timelines, class diagrams) and a sanitized plain-SVG type. The 14 existing types stay for what they draw
    precisely. Together these cover most subjects without new renderers.
12. **Figures per course.** The figure library is global today (`data/figures/library.json`). Key it by course. After
    a build, have the harness build the top N figures the planner wants. N is small and set by the user's budget;
    the figures are the most expensive output.

## 4. Material in, any shape

13. **Pages with no text layer.** Scanned PDFs and photographed handwriting are read by a vision model page by page
    when a page has no text layer. `formats.mjs` already detects that; route it to the builder.
14. **More kinds of source.** A course website URL (fetch and crawl one level), lecture video transcripts, a Canvas
    export zip, a folder dropped in one go.
15. **Real problems found automatically.** The planner detects past exams, problem sets and solutions, and splits
    them into `problems.json`: each problem with its solution, source, and the topics it tests. That replaces the
    CS 3410-specific "Practice prelim" machinery (`study.mjs`: `LAB_FILES`, `realProblemsText`, the practice-quiz
    format) with one general block, "Real problems". Practice and Exam drill draw from it first.
16. **Incremental rebuilds.** Upload something new after the guide exists, and the planner decides what it changes:
    a new unit, revised units, or only a new source. Only those units are rewritten.

## 5. Remove what is still CS 3410

17. **Rename and generalize** "practice prelim", "weekly quizzes", "labs", "C or RISC-V" in the tool descriptions and
    the director's guide text (`agent.mjs` look_up/write descriptions, `guideText`; director `realOf`, the
    practice-prelim board text). The course brief says what this course has.
18. **CS 3410 becomes an ordinary course.** Its brief moved to `brief.md` today; next is its guide format, which uses
    the same units. Everything course-specific lives in the course's folder; nothing course-specific stays in code.

## 6. The learner, across sessions

19. **Mastery per guide topic** from what they answered (tries, board questions, proof checks), shown in the course
    tree. The Review and Exam drill faces start from what is weakest, and spacing brings topics back.
20. **"Last time" notes.** At the end of a session Plato writes three lines (what was covered, what's shaky, where to
    start). The next session opens with them. One small write per session, and continuity across days for free.

## 7. Safety, for strangers' material

21. **Uploaded material is untrusted.** A PDF can carry instructions ("ignore your brief…").
    - **Plato:** his tools only touch the page, so the main risk is bad teaching. The colleague check and the course
      audit catch some of that.
    - **The builder agents:** they have `Bash(python3/node)` in the course folder, so poisoned material could make
      them run code. Before publishing, either take Bash away from the builder (checks go through `compute`) or run
      it in a container.
    - **`compute`:** it uses a `vm` context, which is not a security boundary. Move it to QuickJS/Pyodide in WASM.
22. **Per-user data isolation and deletion.** The backend already scopes data by tenant and learner. Publishing needs
    real auth instead of the local principal file.

---

## What I'd do first

| Order | Item | Why | Size |
|---|---|---|---|
| 1 | 6. Sessions start from sources; the Codex build becomes optional | Removes hours of waiting and a second provider; everything else assumes it | medium |
| 2 | 1 + 2. Guide audit + smoke lesson inside the build, with the readiness report (3) | The "near-zero testing" core: every course tests itself | medium |
| 3 | 15 + 17. A general "real problems" index; remove the CS 3410-isms | Any course's exams drive practice, not just 3410's | medium |
| 4 | 9 + 10. Profile in the plan; Python in code and compute; section layouts | Programming and essay courses work, not only math | small–medium |
| 5 | 21. Sandbox the builder and compute | Needed before anyone else's files touch it | medium |
| 6 | 5. Three-course regression benchmark | Safe prompt changes without manual testing | small (reuses evals/lesson) |

Then 7 (API-key provider), 12 (per-course figures), 13–14 (more inputs), 19–20 (learner continuity).

---

## Built (15 Oct, evening)

CS 3410 and CS 2800 stay as they are: everything below is either general (shared prompts and tools) or switched on per new
course.

| Item | What was built | Where |
|---|---|---|
| 7 (one provider) | `LUNA_MODELS=claude`: every backend model call runs through the `claude` CLI (structured output via `--json-schema`, images, streaming). Same interface as the Codex runtime. | `server/claude-runtime.mjs` |
| 6 (sessions start from sources) | `LUNA_KNOWLEDGE=guide`: a new course publishes its topics from its own folder (its files at once, then its plan's units, then each unit's topics as they are written). It has no knowledge build, course model, modules, question bank or personal view. A session opens about a minute after the upload. | `backend/lessons/guide-manifest.mjs`, guards in `knowledge/build.mjs`, `understanding`, `modules`, `questions`, `learner` |
| 1 (guide audit) | Each drafted unit is checked by a second agent against the material (definitions, recomputed answers, proof steps, coverage), fixed in place, its riskiest topic named. An audit that breaks the format is undone. | `build-course.mjs` `AUDIT` |
| 2 (smoke lesson) | The lesson eval is now a library. The build teaches the 2 riskiest topics to a simulated student; the judge's findings go back into the guide or a "Known pitfalls" list in `brief.md`. `LUNA_SMOKE=0` skips this. | `backend/lessons/smoke-lesson.mjs`, `build-course.mjs` `checkLessons`, `SMOKE_FIX` |
| 3 (readiness report) | `build.json` `report`: units audited, fixes, test lessons and scores, gaps in the material (from the planner). Shown under each course in the chooser. | `GET /v1/exams` `guide`, `CourseTree.jsx` `readiness` |
| 4 (checks beyond boards) | Plato's verdicts on their work (answers, proof grades) are checked in the background; a misjudgment comes back as a quiet note. | `review.mjs` `reviewVerdict`, `/dev/check`, `local-actor.js` `check` |
| 5 (benchmark) | Reference courses in `evals/benchmark.json`; `node evals/benchmark.mjs <tag>` runs their lessons and prints scores beside the last run's. Still needs an essay or reading course. | `evals/benchmark.mjs` |
| 9–10 (profile, layouts) | The brief now has a "Their page for this course" section (which tools fit). The writing space offers essay, lab report, derivation, worked problem and case brief layouts. | `build-course.mjs`, `ProofZone.jsx` |
| 15, 17 (real problems, CS 3410-isms) | The guide format has a **Real problems** block citing exact source files; the director pulls those problems in word for word. The tool descriptions and the study card no longer assume a practice prelim (the card told Plato "after the tries, move_on"). | `study.mjs` `realProblemsText`, `agent.mjs` |
| 16 (incremental) | Material added after the guide was written: an update agent revises units or plans new ones, which are then written and audited. | `build-course.mjs` `UPDATE` |
| 21 (sandboxing) | `compute` runs under Node's permission model (no files, no child processes). Builder agents' commands run in Claude Code's OS sandbox (writes only in the course folder). | `compute.mjs`, `build-course.mjs` `SANDBOX` |
| Resilience | A build left by a stopped server resumes on the next start, not 3 hours later. | `buildDue` |

Still open: Python in `compute` (needs Pyodide, a new dependency), an Anthropic API-key mode, per-course figures, OCR for
scanned pages, URL and transcript inputs, mastery per guide topic, "last time" notes.
