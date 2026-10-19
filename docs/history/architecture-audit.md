# Plato architecture audit: what calls which model, what is dead, and how to consolidate

Prepared 2026-10-08 for the consolidation the user asked for ("after you have come into a complete understanding of the best mix of sub agent calls … condense the code base and make it as good as possible"). Read-only: no code or data was changed.

**Snapshot.** Line numbers are as of 2026-10-08 00:45 EDT. The experiments that pick the agent mix are still running, and `docs/engine-experiments.md` does not exist yet. While this was written, `backend/director/*`, `backend/session/{index,agent}.mjs`, `backend/http/index.mjs`, `src/main.jsx`, `src/tutor-bridge.js` and `src/backend-client.js` were being edited: a `change_topic` actor tool landed at 00:33–00:35. Line numbers in those files can drift by a few lines.

**How it was measured.**
- An import graph from the real entry points: `server/index.mjs`, and `index.html` → `src/main.jsx`. Tests, evals, scripts and the three demo pages are separate roots.
- Every `jobs.register`/`enqueue`, `app.services.*` method, HTTP route and client API method, cross-referenced.
- Row counts from `data/backend.db`, opened read-only.
- Prompt sizes, measured by importing the prompt modules.
- The four eval runs in `evals/runs/2026-10-08T*`. These numbers are provisional.

---

## Summary

- **Size.** About 29.5k lines of app code (30.5k with evals): backend 11.0k, mocks 0.8k, `src` 14.5k (JS and CSS), shared 1.4k, server, scripts and public JS 1.2k, migrations 0.4k. Only **22.4k** of it is reachable from the running app.
- **35 distinct model calls on 6 runtime lanes** (§1). The reply path has no reserved capacity:
  - The lanes are FIFO. Answer classification shares the light lane with PDF page transcription. A handed-in drawing's reading shares the heavy lane with every background Astra job.
  - Reply-path jobs share the 8 job workers with jobs that run for minutes.
- **Almost every student utterance also costs a heavy-lane assessment call.** `assess_response` ran 306 jobs for 330 responses in the DB. This holds in cards mode too, where the director has already classified the answer.
- **Cards versus classic so far** (one run per scenario per mode, provisional):

  | | Classic | Cards |
  | --- | --- | --- |
  | Context the actor receives | 38–48k chars | 6–8k chars |
  | Judge score | 2 and 3 | 3 and 4 |
  | Median time to the next card | — | 18–26 s |
  | Median think | — | 11–20 s |
  | Branch match rate | — | 0.33–0.44 |

- **The two designs overlap and conflict:**
  - two "where in the lesson" pointers;
  - two student models;
  - two goal-completion rules.

  In cards mode the intro goals (get to know, diagnose, plan) can never complete. `[Time check]` notes also reach an actor that has no tool to act on them.
- **A card-board bug shows how fragile the board contract is.** Card check boards rendered empty: the director sends `board.check` (`backend/director/index.mjs:232`), but the page read `board.input`. It was fixed while this was written: `src/main.jsx:541` now reads `board.check || board.input`.
- **Questions reach the page by tangled routes.** Four call sites reserve a question for the page, and there are three ways to put a graded question up.
- **Safe to delete now:** about 6.4k lines plus 47 MB of unused assets. That covers orphaned old-UI components, the mosaic lab, demo pages, test-only voice clients, course-mosaic art, playground instrumentation in the live page, and dead CSS.
- **Removable if cards wins:** about 2.1k more lines: the classic planner, briefs, the 18-tool agent prompt, and the speaker/text/server-voice transports. This needs your decision.
- **Duplication:**
  - 8 word tokenizers with 6 different stop lists;
  - boards validated in 3 places with 2 schemas;
  - the card text rendered twice;
  - the client tools implemented twice (the page, and the eval stand-in);
  - 5 copies of `safe()` (70 uses in `session/index.mjs` alone);
  - 22 model and runtime env knobs spread over 3 layers.
- **God modules.** `backend/session/index.mjs` (1,993 lines) splits into 12 files, and about 1.3k lines remain if cards wins. `src/main.jsx` (1,029) splits into 10 modules.
- **Target design:**
  - roles: actor, director (teaching brain), deep reasoner, four specialists;
  - one `fanout()` runner with deadlines, partial results, fallbacks and priority lanes;
  - one learner event queue, with an estimate for every concept, interpolated when unseen.
- **Estimate after consolidation:** about **20.9k lines (−29%)**, or about 19.4k if the flat-mosaic fallback goes too.

---

## 1. Model-call inventory

### 1.1 Lanes

Every model call ends up in `runtime.ask` (`server/runtime.mjs:135-171`): one turn on an ephemeral thread of a shared `codex app-server`, with a default timeout of 240 s. Each lane is a FIFO limiter (`server/runtime.mjs:31-39`). The gateway aliases roles: `astra`→heavy, `plato`→light, `speaker`→teacher, `planner`→planner (`backend/providers/contracts.mjs:66,82`).

| Lane | Model (knob) | Default effort (knob) | Max in flight | Used by |
| --- | --- | --- | --- | --- |
| heavy | `PLATO_HEAVY` = gpt-6-astra | `PLATO_HEAVY_EFFORT` high (code and `.env.example`; **your local `.env` sets medium**) | 8 | every `astra` call: build, validators, learner, questions, lessons, modules, plan, attach, director refinements, drawing reads |
| light | `PLATO_LIGHT` = gpt-6-luna | `PLATO_LIGHT_EFFORT` low | 6 | page transcription, region extraction, director classify, course-art classifier, eval student/actor |
| planner | `PLATO_PLANNER` ‖ `PLATO_HEAVY` | `PLATO_PLANNER_EFFORT` low | 4 | classic planner, the director's reply-path card, think |
| elements | `PLATO_ELEMENTS` ‖ `PLATO_HEAVY` | `PLATO_ELEMENTS_EFFORT` low | 2 | elements maker |
| exam | `PLATO_HEAVY` | `PLATO_EXAM_EFFORT` high | 3 | exam author |
| teacher | `PLATO_TEACHER` (code default gpt-6-astra; `.env` gpt-6-luna) | `PLATO_TEACHER_EFFORT` low (`.env` medium) | 4 | speaker only (no live caller, §3.3) |
| *(ElevenLabs)* | `PLATO_AGENT_LLM` = gpt-6-sol | `PLATO_AGENT_EFFORT` none | — | the voice agent (`scripts/setup-tutor-agent.mjs:38-48`) |

### 1.2 Every call

Effort "lane" means the call passes none, so it gets the lane's default. Latency sources are cited, and "runs" means the 2026-10-08 eval runs (stand-in actor; provisional).

**A. The live conversation**

| # | Call | Adapter → caller | Lane · effort · timeout | Path | Latency | In → out |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Voice agent, classic | `scripts/setup-tutor-agent.mjs:22,41-53`; prompt `backend/session/agent.mjs:153` (16.3k chars), 18 tools `:260` (11.9k chars of JSON) | ElevenLabs · gpt-6-sol · reasoning none | reply | ~1–2 s (`README.md:7`) | conversation, course brief (~17k chars, `CONTRACTS.md:290`) and plan briefs as context → speech and client tool calls (`src/main.jsx:233-457`) |
| 2 | Voice agent, cards (actor) | `setup-tutor-agent.mjs:23`; `ACTOR_PROMPT agent.mjs:449` (3.8k), `ACTOR_TOOLS :489` (think, change_topic, 4 page tools) | same | reply | runs 2.8 s median (light model stand-in, not gpt-6-sol) | cards (≤900 chars) and `[Thought]` lines → speech, think, change_topic |
| 3 | Classic planner | `providers/codex/session.mjs:38-46` → `session/index.mjs:1152` (job `plan_turn`, prio 50) | planner · low (`PLATO_PLANNER_EFFORT`, read twice: `live.mjs:22` and the lane) · 240 s | after the reply: the brief lands for a later turn | 5–10 s (`docs/director-actor.md:10`) | `compactPlanRequest` (`codex/session.mjs:12-36`): 12 dialogue lines × 600 chars, evidence, agenda, lesson steps, offered questions, facts, 4 interpretations → `PLAN_OUTPUT` (`session/schemas.mjs:16`) → `planBrief` (`agent.mjs:124`) |
| 4 | Speaker (text and server-voice transports) | `codex/session.mjs:117-155` → `session/index.mjs:1340`; also `providers/elevenlabs/voice.mjs:16` | teacher · `PLATO_TEACHER_EFFORT` · 240 s, streamed | reply, transport `default` only | — | `speakerInput` (`codex/session.mjs:52`) → semantic units. The browser never uses it (§3.3). |
| 5 | Director card for an answer no branch prepared | `codex/director.mjs:11` (deep=false) → `director/index.mjs:285` (job `director_card` kind answer, prio 48, enqueued `:187`) | planner · low (`PLATO_DIRECTOR_EFFORT`) · 120 s | reply | "~5 s+" (`CONTRACTS.md:337`); **runs: 18.1 s and 25.6 s median** | goal, lesson step and ladder, ≤12 module concepts, mistakes, the session's student model, the last 4 lines, the answer and what the actor asked, ≤6 bank questions (`director/index.mjs:277`) → `CARD_DRAFT` (`cards.mjs:29`); an element board then waits ≤25 s (`director/index.mjs:220`) |
| 6 | Director refinement (speculation) | same adapter, deep=true → job kind refine, prio 30 (`:99`), ≤2 per session | heavy · high (`PLATO_DIRECTOR_DEEP_EFFORT`) · 600 s | background | — | same in → `CARD_DRAFT`; misconception follow-ups are cached across sessions |
| 7 | Director classify | `codex/director.mjs:12` → `director/index.mjs:162` (inside `plan_turn`) | light · low (hardcoded) · 20 s | reply | 1–2 s (`CONTRACTS.md:337`); runs 2.1–2.2 s | the card's ask, branches `{id, kind, when}`, the answer, what the actor said → `{branchId, confident}` |
| 8 | Director think | `codex/director.mjs:13` → `director/index.mjs:343` (job `director_think`, prio 49; `POST /think`) | planner · low (`PLATO_DIRECTOR_EFFORT`) · 60 s | reply (the actor holds) | 3–10 s (`director-actor.md:50`); **runs: 11.4 s and 19.7 s** | question, ≤2,500 tokens of passages from lexical retrieval, lesson key points, the card's aim and ask → `THOUGHT {say, board, lecture}`; an element board waits ≤25 s |
| 9 | Drawing read (words) | `codex/drawing.mjs:29` → `session/index.mjs:489` (`POST /drawings`) | heavy · low (hardcoded) · 60 s | reply for hand-ins; **a glance fires 1.5 s after every pause in writing** (`main.jsx:47,679-695`) | — | PNG and the question's wording → transcription, LaTeX, confidence |
| 10 | Drawing shapes | `codex/drawing.mjs:37` → `session/index.mjs:521` (`POST /shapes`, drawing-like ink only) | heavy · low · 120 s | background | 27–39 s, 9–13 s to first token (`drawing-shape-detection.md:9`) | PNG and ≤400 numbered strokes → items by stroke id |
| 11 | Elements maker | `codex/elements.mjs:11` → `elements/index.mjs:42` (`POST /elements` = create_element; director boards via `elements.build`, `director/index.mjs:219`) | elements · low · 45 s, plus one repair within 55 s (`elements/index.mjs:36,70-75`) | reply-adjacent (the page gives up at 60 s) | — | request, kind, topic, recent dialogue, ≤2,000 tokens of grounding → `{kind, title, summary, spec}`, checked by `shared/elements` |

**B. Prepared ahead (the deep reasoner)**

| # | Call | Adapter → caller | Lane · effort · timeout | Path | Latency | In → out |
| --- | --- | --- | --- | --- | --- | --- |
| 12 | Lesson writer (+1 repair) | `codex/lessons.mjs:9` → `lessons/index.mjs:351,355` (job `prepare_lesson`, prio 46/44/40/10) | heavy · high (`PLATO_LESSON_EFFORT`) · 600 s | background; the instant lesson (20–100 ms, `CONTRACTS.md:277`) stands in | minutes, not measured | goal, its topics with mastery, ~6,000 tokens of passages, 3 interpretations, ≤8 bank rungs, past-exam problems, the student's approach → `LESSON_DRAFT` (`lessons/index.mjs:24`) |
| 13 | Module writer (+1 repair) | `codex/modules.mjs:11` → `modules/writer.mjs:113` (job `build_modules`, ≤4 per exam, prio 8) | heavy · high (`PLATO_MODULE_EFFORT`) · 900 s | background | 57 s (3 nodes) to 190 s (12 nodes); whole course ~42 min serial, 11–13 min with 4 at once (`CONTRACTS.md:261`) | one unit and its nodes, ≤40k chars of excerpts → `MODULE_DRAFT` |
| 14 | Exam author: plan | `codex/exam.mjs:28` → `questions/exam.mjs:50` (job `author_exam_question`, prio 5 pool, 45 asked, 2 from the course) | exam · high (`PLATO_EXAM_EFFORT`) · 900 s | background | "a few minutes" for the whole problem (`README.md:30`); 1 h budget (`questions/index.mjs:21`) | unit objectives, ≤8,000 tokens of excerpts, ≤40 claims, existing problems, ≤3 past exams → `EXAM_PLAN` |
| 15 | Exam author: write (+ repair) | `exam.mjs:29` → `questions/exam.mjs:51,54` | same | background | ″ | plan and course → `EXAM_DRAFT` (`questions/records.mjs:140`) |
| 16 | Exam author: independent solve | `exam.mjs:30` → `questions/exam.mjs:136` (once per review, 2 reviews at most) | same | background | ″ | the problem as the student sees it → `EXAM_SOLUTION` |
| 17 | Exam author: compare | `exam.mjs:31` → `questions/exam.mjs:147` | same | background | ″ | reference, solver's work, machine-check results → `EXAM_VERDICT` (agree, problem, steps). RISC-V and C checks run locally (`questions/exam.mjs:173-197`). In all, 4–7 calls plus 2 validators per problem. |
| 18 | Study planner | `codex/plan.mjs:12` → `plan/index.mjs:295` (job `build_study_plan`, prio 30, throttled `:221`) | heavy · high (`PLATO_PLAN_EFFORT`) · 900 s | background; the baseline is instant | — | baseline days, topics with mastery, objectives, the student's words → `PLAN_DRAFT` |
| 19 | Material attacher (ingest) | `codex/ingest.mjs:11` → `ingest/index.mjs:96` (job `attach_material`, prio 7; one call per ≤60k chars, in parallel) | heavy · high (`PLATO_ATTACH_EFFORT`) · 900 s | background | "within minutes" (`README.md:31`) | the file's segments and the module catalog → `ATTACH_DRAFT` |

**C. Questions**

| # | Call | Adapter → caller | Lane · effort · timeout | Path | In → out |
| --- | --- | --- | --- | --- | --- |
| 20 | Question generator | `codex/questions.mjs:13` → `questions/index.mjs:181` (jobs `refill_question` prio 10–23; `generate_custom_question` 50/45) | heavy · lane · 240 s | background | topic, objectives, difficulty, ≤3,000 tokens of excerpts, ≤30 claims → `DRAFT_SCHEMA` (`records.mjs:44`) |
| 21 | Question validators ×2 (answerability, math) | `codex/validator.mjs:13` → `questions/index.mjs:270-279`, **one after the other** | heavy · medium (hardcoded) · 300 s | background | candidate and evidence → verdict |
| 22 | Rendering validation | `questions/index.mjs:492-512` | heavy · medium | none (only test A12 calls it) | paraphrase → verdict |

**D. The learner model**

| # | Call | Adapter → caller | Lane · effort | Path | In → out |
| --- | --- | --- | --- | --- | --- |
| 23 | Local assessor (grader) | `codex/learner.mjs:13` → `learner/assessment.mjs:237` (job `assess_answer`, prio 20), and `:300` for exam parts that can't be graded exactly | heavy · lane · 240 s | background | question, rubric, objectives, the delivered prompt and assistance, answer, excerpts → findings. Skipped for choice, multi-select, order, match and number (`assessment.mjs:71-88`). |
| 24 | Learner assessor (estimator) | `codex/learner.mjs:27` → `assessment.mjs:347` (job `update_learner` prio 15; **`assess_response` prio 10 on every ordinary utterance**, `:197-200`) | heavy · lane · 240 s | background | findings, interactions, prior evidence, projection, diagnoses, facts, policy → estimate, diagnoses, profile changes, semantic change |
| 25 | Personal reviser | `codex/learner.mjs:40` → `learner/personal.mjs:309` (job `reconsider_personal`, prio 30; batches of up to 20 changes, 2 s apart) | heavy · lane · 240 s | background | changes, evidence, nearby topics and edges, base interpretations, earlier explanations → `REVISER_OUTPUT` |
| 26 | Personal validators | `codex/validator.mjs:13` → `personal.mjs:220,347,353`, one after the other | heavy · medium · 300 s | background | 1–3 responsibilities per explanation or edge |

**E. Knowledge build (per upload)**

| # | Call | Adapter → caller | Lane · effort · timeout | Parallelism | Latency |
| --- | --- | --- | --- | --- | --- |
| 27 | PDF page transcription | `codex/knowledge.mjs:29` → `knowledge/pages.mjs:27` (inside `extract_source`) | light · medium (hardcoded) · 600 s | ≤`PLATO_PAGE_CONCURRENCY`=4 per job; the light lane caps it at 6 | — |
| 28 | Region extraction (images, scans) | `codex/knowledge.mjs:23` → `knowledge/ingest.mjs:153` | light · medium · 600 s | — | — |
| 29 | Interpret a segment | `codex/knowledge.mjs:40` → `build.mjs:315` | heavy · lane · 600 s | ≤4 per source | — |
| 30 | Merge segments (levels of 12) and repair | `codex/knowledge.mjs:38` → `build.mjs:347,368` | heavy · lane | ≤4 | — |
| 31 | Graph refinement | `codex/knowledge.mjs:39` → `build.mjs:755` (≤2 rounds, `config.mjs:8`) | heavy · lane | — | — |
| 32 | Partition | `codex/knowledge.mjs:48` → `build.mjs:458` (≤3 interpretations each) | heavy · lane | ≤4 | ~300 s per 3 lectures (`config.mjs:31-36`) |
| 33 | Merge partitions | `codex/knowledge.mjs:49` → `build.mjs:471` | heavy · lane | ≤4 | — |
| 34 | Finalize the graph | `codex/knowledge.mjs:50` → `build.mjs:480` | heavy · lane | 1 | ~2 min for 105 topics (`build.mjs:434`) |
| 35 | Knowledge validators: source_fidelity and math_and_reasoning in parallel per source; graph_integrity per round | `codex/validator.mjs:13` → `build.mjs:173` via `:360,482,764,787` | heavy · medium · 300 s | ≤40 anchors per batch, ≤4 batches at once (`build.mjs:165`) | — |

**F. Other**
- **Course-art classifier.** `server/index.mjs:76` (`/api/course-mosaic`), light, 10 s. Nothing in the app calls it: its only caller is the orphaned `src/course-mosaics/assignment.mjs:30`. Dead (§3.2).
- **Evals only:**
  - stand-in actor: `evals/stand-in.mjs:65`, light;
  - simulated student: `evals/common.mjs:87`, light;
  - judge: `evals/common.mjs:256`, heavy, medium effort, 180 s.

### 1.3 What one student turn costs

**Classic:**
1. The voice agent answers (1–2 s).
2. `plan_turn` runs the planner (5–10 s). Its brief steers a later turn.
3. One of these runs: `assess_response` (heavy), or `assess_answer` then `update_learner` (heavy).
4. Sometimes `reconsider_personal` runs, with up to 3 validators.
5. If the student writes, a drawing read runs (heavy) on every pause.
6. If no question is ready, the generator runs with 2 validators.

**Cards:**
1. The voice agent answers from the card.
2. `plan_turn` matches the answer exactly (no call) or classifies it (light, ~2 s).
3. The next card comes from:
   - a prepared card or the lesson's follow-up (no call); or
   - an Astra card (planner lane; 18–26 s in the runs, including up to 25 s for an element).
4. Up to 2 refinements run per issued card (heavy, high).
5. The same `assess_response` and personal pipeline runs as in classic.

### 1.4 Contention and drift (concrete risks)

- **FIFO lanes.** A reply-path call waits behind every background call that entered its lane first (`server/runtime.mjs:31-39`).
  - Classify shares the light lane with page transcription (4 per extract job, 6 in all).
  - A handed-in drawing's reading shares the heavy lane (8) with lessons, up to 4 module writers, assessors, personal revision, validators, the knowledge build and director refinements.
- **One worker pool.** The server runs 8 job workers (`server/index.mjs:35`). They claim by priority (`backend/core/jobs.mjs:49-50`), but a worker stays busy until its job ends, and module, exam and lesson jobs run for minutes. A `plan_turn`, `director_card` or `director_think` job waits for a free worker. None are reserved for the reply path.
- **`assess_response` on every utterance.** It costs a heavy call on most student lines: 306 jobs for 330 responses. `docs/teacher-architecture.md` §9.2 planned the learner modeler "every ~3 turns and at session end".
- **Doc drift:**
  - `README.md:62` says Astra runs at "medium", but the code default is high and the local `.env` sets medium.
  - `README.md:68` names a "Speaker" role that the app no longer uses.
  - `CONTRACTS.md:347` lists director prompts `_v1`; the code has `_v3` (`prompts/director.mjs:5,7`).

---

## 2. Agent roles today vs. the target

### 2.1 Role map

#### Actor (fast voice)
- **Target:** performs one card. Handles chit-chat, silence and "repeat that", picks a branch by meaning, and sends anything off the card to think. No plan and no agenda; a prompt of at most 4k chars and about 6 tools.
- **Where it lives today:**
  - Classic: `AGENT_PROMPT` (`backend/session/agent.mjs:153-253`) and 18 tools (`:260-442`), fed by `courseBrief` (`:39-93`), `lessonBrief` (`:100-114`) and `planBrief` (`:124-150`). The actor leads lessons, moves the agenda, picks boards and asks for questions.
  - Cards: `ACTOR_PROMPT` (`:449`) and `ACTOR_TOOLS` (`:489-503`).
- **Overlaps and conflicts:**
  - Cards tell the actor "(pose it)" (`backend/director/cards.mjs:65`), but `ACTOR_TOOLS` has no `pose_question`; the page poses it itself (`src/main.jsx:539`).
  - `[Time check]` notes (`session/index.mjs:862-873`) are sent for every session (`:1767`), but the cards actor cannot move the agenda.

#### Teaching brain (director)
- **Target:** owns the session's state (goal, lesson point, rung, last branch). Decides each move, moves goals only on evidence, and prepares follow-ups.
- **Where it lives today:** two brains inside the same `plan_turn` job (`session/index.mjs:1136-1171`, which branches at `:1142`):
  - Classic: the planner, plus agenda progress (`progressLesson` and `progressAgenda`, `:827-859`; `metCloses`, `agenda.mjs:79`; `holdBack`, `:85`), plus the actor's `update_agenda` (`session/index.mjs:788-818`).
  - Cards: the director (`backend/director/index.mjs`) and `S().advance`.
- **Overlaps and conflicts:**
  - **Two step pointers.** The agenda's `goal.step` and `goal.lessonId` (`session/index.mjs:794-803,827-836`) versus `director_state.cardId` → `card.lessonAt` (`director/index.mjs:32,105-113`). The director never updates `goal.step`.
  - **Two "goal met" rules.** The planner's `goalProgress` plus `metCloses`, versus `isLastTest` (`director/index.mjs:80`) and the `EXTRA` cap (`:147`).
  - **The intro can't finish in cards mode.** Get to know, diagnose and plan have no lesson, so each gets a `goalCard` (`:62`) with a single "other" branch. Auto-completion (`progressAgenda`, `session/index.mjs:843-859`) runs only on the classic path (`:1169`), so `markIntroDone` never fires.
  - **Preferences never reach the director.** The card input (`director/index.mjs:277`) and the think input (`:343`) carry no profile facts and no "still unknown" list. Classic gets them through ABOUT THE STUDENT in the course brief.

#### Deep reasoner
- **Target:** think (with a deadline), lessons, the exam author, modules and the study plan, behind one deep-task interface on the heavy and exam lanes, with fan-out.
- **Where it lives today:** five separate loops, each with its own retry and repair:
  - `lessons/index.mjs:342-365`
  - `modules/writer.mjs:105-140`
  - `questions/exam.mjs:37-64`
  - `plan/index.mjs:288-311`
  - think, `director/index.mjs:336-352`
- **Overlaps and conflicts:**
  - Two "looks like a past exam" detectors: `lessons/index.mjs:259` and `questions/exam.mjs:27`, with different word lists.
  - The lesson and card writers each describe boards in their own prompt fragment (`prompts/lessons.mjs:8,36`, `prompts/director.mjs:10-27`). Both read the diagram catalog out of the classic `show_visual` tool's description (`prompts/director.mjs:3,27`, `prompts/lessons.mjs:3,8`).

#### Specialist: board and format designer
- **Target:** given a move and a concept, produces a checked board: markdown, diagram, element, zone, question, check or notes.
- **Where it lives today:**
  - the director prompt's BOARDS section (`prompts/director.mjs:10-25`) and `boardOf` (`director/index.mjs:212-238`);
  - the lesson `BOARD` (`lessons/index.mjs:20`) and `checkLesson` (`:56-67`);
  - the elements maker (`elements/index.mjs`);
  - `checkDiagram` (`src/visuals/diagram.mjs:732`);
  - the page tools (`main.jsx:243-252,308-313,356-363`).
- **Overlaps and conflicts:** board validity is decided in 3 places with 2 schemas: the lesson board has 2 kinds, the director's `BOARD_DRAFT` has 7. The check-board bug came from this split (`director/index.mjs:232` versus `main.jsx:541`; fixed during this audit).

#### Specialist: verifier
- **Target:** one `verify(candidate, responsibilities)` that runs the responsibilities in parallel.
- **Where it lives today:**
  - the knowledge validators: 6 responsibilities (`prompts/knowledge.mjs:61-68`), one of which, `analogy_suitability`, is never requested;
  - the question validators (sequential) and the personal validators (sequential);
  - the exam author's solve and compare;
  - the deterministic checks: `checkLesson`, the modules `check`, `draftProblems`, `shapeProblems`, and the drawing stroke-id checks (`session/index.mjs:525-533`).
- **Overlaps and conflicts:** the same responsibilities run in parallel in the knowledge build (`build.mjs:360`) but one after another everywhere else.

#### Specialist: classifier
- **Target:** exact first, then a light model with a deadline.
- **Where it lives today:**
  - the director's exact `match` (`cards.mjs:90`) and `classify`;
  - preference parsing by regex: `preferenceKey` (`learner/profile.mjs:13`), `minutesOf` and `approachOf` (`plan/index.mjs:45,55`);
  - the `diagramish` ink gate (`src/inputs/ink.mjs`);
  - the drift guard `checkRendering` (`questions/index.mjs:478`);
  - the course-art classifier (dead).
- **Overlaps and conflicts:** three regex parsers of the same preference text.

#### Specialist: grader
- **Target:** exact first, then the heavy model, with partial credit.
- **Where it lives today:**
  - `gradeStructured` (`assessment.mjs:71`), `sameExact` (`records.mjs:164`) and exam-part grading (`assessment.mjs:284-310`), then `localAssessor`;
  - `learnerAssessor` on every utterance (`assess_response`).
- **Overlaps and conflicts:** in cards mode every answer is judged twice, by classify and by `assess_response`. The branch the classifier picks never reaches assessment, though `director-actor.md:66` says it should.

#### User-info queue and interpolation
- **Target:** one append-only stream of what the student showed and said; reducers for concept state, topic mastery, profile and unknowns; an estimate for every concept, observed or interpolated.
- **Where it lives today:** five stores.
  - `interaction_evidence` (330 rows) → local and learner assessments → `mastery_projections` (per topic, an ordinal estimated by the model).
  - `director_state.model`, per session and per concept: level, misconceptions seen and cleared (`director/index.mjs:124-137`).
  - Profile facts, from `feedback_evidence` and `remember_preference` (`src/tutor-bridge.js:171-187` → `POST /feedback`).
  - Two "still unknown" lists: `profileGaps` (`agent.mjs:14-29`) and `INTRO_ASKS`/`introUnknown` (`session/index.mjs:41,618-622`).
  - Plan inputs, re-parsed from the preference text (`plan/index.mjs:180-191`).
- **Interpolation today: none.**
  - An unassessed topic is "unknown" (`assessment.mjs:67`), and the plan treats it as rank 0 (`plan/index.mjs:31`).
  - Nothing propagates along prerequisite edges.
  - The θ/σ per-concept model with prerequisite effects (`docs/teacher-architecture.md` §6.1–6.3, 6.7) is not built.

### 2.2 Four ways to put a question on the page

| Path | Mode | Reservation | Page | Delivery record |
| --- | --- | --- | --- | --- |
| The planner selects a ready question | classic | `session/index.mjs:1198` | held as `pending` (`tutor-bridge.js:247`) until the actor calls `pose_question` (`main.jsx:317`) | `board_shown` → `agentEvents` (`session/index.mjs:1476`) |
| `request_question` tool, one is ready | classic | `:1549` | held as `requested` (`tutor-bridge.js:194-208`) → `pose_question` | same |
| `request_question` tool, none ready | classic | `requestCustom :1553` → consumer `:1935-1950` reserves at `:1947` | `question.ready` → `requested` → `pose_question` | same |
| A card's question board | cards | `offerQuestion` (`session/index.mjs`, service object, reserve `~:1988`) | the page poses it itself (`main.jsx:539`) | same |

Ungraded checks take three more routes: `ask_input` (`main.jsx:308`); a `show_lesson_board` rung, which also records exposure (`session/index.mjs:800-801`); and a card's check board. One `offerQuestion(session, want)` and one page path would cover all of them (§4, D8).

---

## 3. Dead and obsolete code (with evidence)

**Verdicts:**
- **SAFE:** delete now.
- **DECIDE:** depends on classic versus cards, or on a product choice.
- **KEEP:** leave as is.

Line counts come from the import graph.

| # | Item | Evidence | Lines | Verdict |
| --- | --- | --- | --- | --- |
| 3.1a | Old Plato UI components and their CSS: `CreateTest`, `DitherImage`, `HintButton` + hint-state + hint.css, `LearningTrace`, `Library`, `MasteryArc`, `ParticleIntake` + particle-dynamics, `PracticeTrail`, `ProgressPanel` + progress-panel.css, `SessionPaused`, `TeacherSkins` + teacher-skins.css, `TopicTree`, `UsageDebug`, imports.js, prepare-materials, pdf-text, study-navigation, voice-preview.css, image-materials.css | No importer from `src/main.jsx` | 1,226 | SAFE |
| 3.1b | `src/mosaic-lab/*` (8 files) and `src/mosaic-motion.mjs` | No importer | 861 | SAFE |
| 3.1c | Course-mosaic UI: `src/course-mosaics/{CourseCanvas,Gallery,TestCard,useCourseAssignments}.jsx`, gallery.css, test-cards.css | No importer | 439 | SAFE |
| 3.1d | Old socket voice client: `src/live-voice.js`, caption-timing, voice-activity, `public/live-mic-worklet.js` | No importer; the worklet is only named in live-voice.js:106 | 490 | SAFE |
| 3.2a | GPT-Live WebRTC client: `src/playground-voice.js`, `public/voice-session.js` | Only tests import them; the app uses `src/eleven-voice.js` | 647 (+599 test lines) | SAFE |
| 3.2b | Playground instrumentation in the live page: `recordPlaygroundVoice` (`main.jsx:9,206,214,216`) | It writes to an in-memory store that only demoFetch's `/api/debug/*` routes read (`playground-services.mjs:66-96`); nothing calls them. It also pulls `study.js` and `board-demo-data.mjs` into the bundle. | 260 (+148 test) | SAFE |
| 3.2c | Demo pages `board-demo.html`, `quality-demo.html`, `mosaic-presence-preview.html`, with `BoardDemo`, `QualityDemo`, `Whiteboard`, `TeachingScene`, `TeachingLayouts`, `mosaic-presence-preview`, scene-camera, scene-label-layout, selection-contour, 6 CSS files, and `shared/{equation-chain,flow-layout,teaching-layouts}.mjs` | Only reachable from the demo HTML files | 1,048 | SAFE |
| 3.2d | Old whiteboard "zones" in `shared/board-parts.mjs` and `shared/retained-scene.mjs` | `board-rich-text.mjs:1` imports only `renderZonedMath`; the zone machinery serves the demos and orphans | ~210 (keep a ~15-line KaTeX helper) | SAFE, with the demos |
| 3.2e | Course artwork: `/api/course-mosaic` (`server/index.mjs:66-80`, one model call), `shared/course-mosaic-catalog.mjs`, `scripts/export-course-mosaics.mjs`, `src/course-mosaics/{courses,humanities,renderer,sciences}.mjs`, **`public/course-mosaics/` (43 MB)** | No caller in the app; copied into every `dist` (51 MB) | 916 | SAFE |
| 3.2f | `public/skins/` (1.1 MB), `public/study-hero*.png` (3.1 MB) | Referenced only by the orphan `TeacherSkins.jsx:21` and `archive/` | assets | SAFE |
| 3.2g | `src/progress-data.mjs`, `src/image-imports.mjs`, `src/material-dedup.mjs`, `src/course-mosaics/assignment.mjs` | Only tests import them | 186 (+ their tests) | SAFE |
| 3.3 | **Old speaker path and non-agent transports:**<br>• `SPEAKER` (`prompts/session.mjs:4,47-56`)<br>• `createTextSpeaker`, `speakerInput`, `createUnitSplitter` (`codex/session.mjs:48-155`)<br>• `providers/elevenlabs/voice.mjs`, `server/speech-stream.mjs`, `shared/speech-alignment.mjs`<br>• `http/voice-socket.mjs` (`server/index.mjs:11,112`), and the teacher lane (`runtime.mjs:18`)<br>• in `session/index.mjs`: `speak`/`handleOutputEvent` (`:1331-1394`), planner waits and microturns (`:1752-1794`, skipped for agent sessions at `:1769`), voice ingress and provider callbacks (`:1796-1866`)<br>• routes `voice-events` and `voice/callbacks` (`http/index.mjs:116-120`)<br>• `.env.example` knobs `PLATO_VAD_SILENCE_SECONDS` and `ELEVENLABS_REALTIME_MODEL_ID` (read only at `elevenlabs/voice.mjs:59`) | • Every browser session starts with transport `agent` (`tutor-bridge.js:213`): 130 of 145 sessions in the DB; the other 15 predate the field.<br>• `default` is used only by tests and `evals/voice-live.mjs`.<br>• `textVoice` (`live.mjs:38`) is never read. | ~720 | DECIDE. Tests A08, A09, A10, A18 and A20 (and parts of A12 and http-mvp) encode spec §5.4/§7 delivery semantics through it. |
| 3.4 | Vault remnants | No code mentions "vault"; `data/vault/` does not exist. `README.md:25-29` still promises "an Obsidian vault in `data/vault/<course>/`". You asked for the vault's removal on 10-07. | docs | SAFE: fix the README |
| 3.5 | Equation-sheet remnants: `GET`/`PATCH`/`DELETE /equations` (`http/index.mjs:86,88-89`); `list`, `patch` and `remove` (`equations/index.mjs:20-51`) | The UI was removed at your request. The client only POSTs (`backend-client.js:81`, from `save_equation`, `main.jsx:366`, and a card's `saveEquation`). `briefLines` (`equations/index.mjs:54`) is read only by the classic course brief (`session/index.mjs:1412`), so **in cards mode saved formulas are written and never read**. | ~40 | Routes: SAFE. The feature: DECIDE (keep, and give formulas to the director, or drop). `src/equations/Palette.jsx` is the LaTeX zone's palette: KEEP, and move it beside `LatexZone`. |
| 3.6 | Flat mosaic, `VoiceCanvas` | SphereCanvas's WebGL2 fallback (`SphereCanvas.jsx:44,191`) and the `?flat` view (`main.jsx:26`); pulls in 10 `mosaic-*` modules | ~1,500 (+253 test) | DECIDE |
| 3.7 | Diagram types | All 15 render (`src/visuals/diagram.mjs:714`). `plot` is an alias of chart-line, and `bars` overlaps chart-bar. Evals and stored lessons so far used only table, memory and truth_table, but waveform, pipeline and kmap are CS 3410 essentials. | — | KEEP. Optionally drop `plot` and `bars` from the prompts and keep them as input aliases. |
| 3.8 | Client tools | Every defined tool has a handler: 20 in `main.jsx:233-457` (18 classic, plus `change_topic` and `think`). | — | DECIDE (§6.5): if cards wins, 9 become internal board renderers and 5 go entirely (`show_lesson_board`, `update_agenda`, `request_question`, `open_module`, `read_source`). |
| 3.9 | Text transport | `createTextSpeaker` is the no-ElevenLabs fallback (`live.mjs:23`). The page never uses it: text-only conversations go through ElevenLabs text mode (`server/index.mjs:38-50`). | (in 3.3) | DECIDE, with 3.3 |
| 3.10 | Dead jobs and validators: `validate_candidate` (`knowledge/build.mjs:896`) and `build_context` (`session/index.mjs:1890`) are registered but never enqueued; `analogy_suitability` (`prompts/knowledge.mjs:64`) is never requested | grep finds no `enqueue` or request | ~25 | SAFE |
| 3.10 | Tables nobody reads | `tombstones` is written (`exams.mjs`) and never read (0 rows). `assessment_policies` is written once and read only to avoid re-inserting it. `teaching_plans` (529 rows) and `context_packets` (388) are classic-only. | — | Stop writing `tombstones` (SAFE); the classic tables go with 3.3 (DECIDE). Keep the tables in the DB; no destructive migration. |
| 3.10 | Unused services and methods:<br>• `modules.centerOf`, `modules.moduleText` (`modules/index.mjs:242`)<br>• `director.state`, `director.cardText` (`director/index.mjs:353`)<br>• `learner.policy`, `learner.reconcile`<br>• `questions.validateRendering` (tests only)<br>• `TutorBridge.topicLabel` (`tutor-bridge.js:425`)<br>• client API: `deleteExam`, `retrySource`, `switchTopic`, `sessionFeedback`, `interrupt`, `resume`, `voiceEvents` (`backend-client.js:36,41,71-74,108`)<br>• `deleteFocus`, used only by the orphan ProgressPanel | No callers | ~60 | SAFE. Keep the spec routes behind them (`DELETE /exams`, retry) unless you decide otherwise. |
| 3.11 | CSS for removed UI: `src/style.css` | **Byte-identical to `archive/plato-ui-2026-10-05/src/style.css`.** 84 of its 98 classes match nothing in the app (`topbar`, `google-button`, `test-board`, `create-dialog`, `calendar-*`, `library-*`, `difficulty-*`, `board-*`, …). The live rules are the `.study-screen`, `.voice-stage`, `.orb-button`, `.voice-canvas` and `.voice-visual` ones (lines 6, 10-11, 17-22, 30, 35, 39, 46, 49, 51-53). The other app CSS is clean: its few unmatched classes are built at runtime (`is-${state}`, `tok-*`, `katex-display`). | ~40 long lines (22.5k chars) | SAFE: move the live rules into `talk-screen.css` and drop the file |
| 3.12 | Broken config: `vite.config.js:7-17` (pages mode) | It needs `scripts/setup-eleven-agent.mjs` and `eleven-public-agent.json`; neither exists. `shared/content-policy.mjs` exists only for it. | ~30 | DECIDE (fix or remove the static-host build) |
| 3.13 | Doc drift | `README.md:25-29,62,66-68`; `CONTRACTS.md:347`; `.env.example` (PLATO_TEACHER, the voice knobs for the dead path) | docs | SAFE: fix during the consolidation |

**Not in the app.** `voice-lab/` (802 lines of code, with its own server and npm scripts) is a separate research tool. KEEP it, but consider moving it out of the repo. `archive/` (67 MB) is already out of the build.

---

## 4. Duplication and inconsistent patterns: one helper each

**D1 · Text that reaches the actor is composed in three layers, with three dedupe rules.**
- **Server events:** `agent.context` (`session/index.mjs:600,1036`), `agent.brief` (`:1448`), agenda notes (`:783`, a 10 s gap at `:776-785`), `lesson.ready` (`:1916-1924`), `question.ready` and `question.failed` (`:1573,1945`), `material.attached` (`:1911`), `adoption.newTopicTitles` (`:1034`), `card.issued` (`director/index.mjs:112`), `thought.ready`.
- **Composed by the bridge:** `lessonLine` (`tutor-bridge.js:19`), `[A question is ready]` (`:270`), `[Couldn't make that question]`, and news (`:126`). Two paths announce new topics: the topic poll (`:117-124`) and the `adoption` event; `news()` dedupes them by title. The bridge also suppresses notes that repeat a recent update (`SAID_MS`, 15 s, `:15,235-241`).
- **Composed by the page:** `[Student's page]`, `[Written on the page]`, `[Answered on the board]`, `[Focus changed]`, `[New material]`, `[On the page now]`, `[Visual skipped]`, `[Couldn't make that visual]`, `[Couldn't think it through]`, and the PDF outline briefings.
- **Five transports on the page:** `context`/`contextNow` (`main.jsx:489-501`), `toAgent` (`:478`), `tellSoon`/`flush` (`:485-486`), `later` (`:503`), and `brief()` replay (`:130-141`, `tutor-bridge.js:336`).

→ **Proposal: one inbox** (`teacher-architecture.md` §9.4). One server event, `actor.note {text, kind, priority, expiresAfterTurns}`, built from one `shared/notes.mjs` of line formats. One page `ActorChannel` with `note(text)`, `turn(text)`, `card(card)` and `replay()`, which only batches and sends. About 60 lines replace about 150.

**D2 · "Find a topic by words": 8 tokenizers, 6 stop lists, 3 stemming rules.**
- **Tokenizers:**
  - `session/index.mjs:37-39`, and `tokens` at `:1454`
  - `modules/index.mjs:14-16`
  - `lessons/index.mjs:34-35`
  - `elements/index.mjs:21-22`
  - `ingest/index.mjs:24-25`
  - `director/index.mjs:23`
  - `knowledge/read.mjs:7`
  - `questions/exam.mjs:29` (words over 3 letters)
- **Matchers built on them:**
  - `matchGoal`, `matchTopic`, `seriesTopics`, `partOf` (`session/index.mjs:700-740`) and `examUnit` (`:1559`)
  - the modules `match` (`modules/index.mjs:167`) and the question → concept match (`:146`)
  - ingest's `closest` (`ingest/index.mjs:27`)
  - the director's `about` (`director/index.mjs:50`)
  - the notes-strength check (`elements/index.mjs:86`)
  - query hits in retrieval (`knowledge/read.mjs:83-88`)
- **Related duplicates:**
  - "looks like an exam": `lessons/index.mjs:259` and `questions/exam.mjs:27`;
  - "file name → lecture title": `modules/outline.mjs:17`, `knowledge/read.mjs:105`, `elements/index.mjs:90`.

→ **`shared/text-match.mjs`**: `words(text)`, `overlap(a, b)`, `rank(query, items, fields, {min})`, `looksLikeExam(text)`, `lectureTitle(filename)`. About 60 lines.

Retrieval is lexical today. Your design (`teacher-architecture.md` §5, §9.3) planned embeddings, and this module is the seam where they would plug in. I am not proposing to add them or to rule them out.

**D3 · Validators, boards and answer inputs.**
- **Validator styles.** There are two: the schema DSL in `core/shape.mjs`, for request bodies and model output, and the imperative checks in `shared/elements/check.mjs`, for diagrams and elements. Keep both.
- **Boards are validated three times, with two schemas:**
  - lessons: `BOARD` and `checkLesson` (`lessons/index.mjs:20,56-67`);
  - the director: `BOARD_DRAFT` (`cards.mjs:19`), `boardOf` and `fallbackOf` (`director/index.mjs:194-238`);
  - the page tools: `show_visual`, `ask_input` and `open_workspace` (`main.jsx:243-252,308-313,356-363`).
- **Answer inputs are handled in five places:**
  - `inputOf` and `inputProblems` (`questions/records.mjs`);
  - `normalizeSpec` (`src/inputs/answer.mjs`);
  - `checkStructured` (`session/index.mjs:890-899`);
  - `gradeStructured` (`assessment.mjs:71`);
  - `sameExact` (`records.mjs:164`).
- **The card is rendered twice:** `cardText` in `cards.mjs:60`, and again in `tutor-bridge.js:25`, because the start result's card 1 has no text.
- **The diagram catalog** that both prompts use is read out of the classic `show_visual` tool's description.

→ **Proposal:**
- `shared/board.mjs`: `BOARD_KINDS`, `BOARD_DRAFT`, `checkBoard(draft, {build})` (returns the board or its stand-in), and `DIAGRAM_DOC`.
- `shared/answer-input.mjs`: the kinds, `normalizeSpec`, `checkStructured`, `gradeExact`.
- The server sends `cardText` in the start result.

Bugs like the check-board one (fixed during this audit) can't recur once one function owns the board shape.

**D4 · `safe()` and silent catches.**
- 5 copies: `session/index.mjs:251`, `director/index.mjs:28`, `lessons/index.mjs:205`, `modules/index.mjs:21`, `plan/index.mjs:165`.
- 104 uses, 70 of them in `session/index.mjs`, plus 47 bare `catch {}` in the backend.
- Failures vanish: a lesson that failed to load reads as "no lesson".

→ **One `quietly(fn, fallback, label)`** in `core/util.mjs` that logs under `BACKEND_DEBUG` and counts failures. Use it only at true best-effort edges.

**D5 · Lane and effort plumbing.** Three layers:
- lanes from env (`runtime.mjs:15-29`);
- role aliases (`contracts.mjs:66,82`);
- 14 adapter files under `providers/codex/` (535 lines, mostly one-line wrappers that set effort and timeout), wired to env in `live.mjs:20-41`.

The adapters hardcode some efforts: validators medium, drawing low, extraction medium, classify low. `PLATO_PLANNER_EFFORT` is read twice. In all there are **22 model and runtime knobs**: `PLATO_{TEACHER,HEAVY,LIGHT,PLANNER,ELEMENTS}` and their `_EFFORT`s, `PLATO_{EXAM,PLAN,LESSON,DIRECTOR,DIRECTOR_DEEP,MODULE,ATTACH}_EFFORT`, `PLATO_AGENT_LLM`, `PLATO_AGENT_EFFORT`, `PLATO_PAGE_CONCURRENCY`, `PLATO_WORKERS` and `PLATO_TUTOR_MODE`.

→ **`backend/models/tasks.mjs`.**
- One table, `task → {lane, effort, timeoutMs, path: reply|background, schema, prompt}`.
- One `ask(task, input, {ctx, signal})` that builds the WorkIdentity, validates, and maps failures to retryable `AppError`s. Today 30 `call(…)` sites and 24 `workIdentity(…)` sites repeat this.
- Mocks keyed by task name.

Every effort stays where you set it; only the plumbing collapses. Going down to the 4 knobs of `teacher-architecture.md` §9.7 is a separate decision.

**D6 · Draft → check → one repair → fallback, written five times:**
- `lessons/index.mjs:351-358`
- `modules/writer.mjs:113-121`
- `elements/index.mjs:70-75`
- `questions/exam.mjs:51-58`
- `knowledge/build.mjs:363-375`

→ `draft({write, check, repairs: 1, keepBest})`, about 20 lines in `models/`.

**D7 · Parallelism and deadlines, hand-rolled each time:**
- `mapLimit` (`build.mjs:11-15`)
- an inline pool (`pages.mjs:44-46`)
- `Promise.all` (`ingest/index.mjs:96`)
- `Promise.race` timeouts (`director/index.mjs:220`, `formats.mjs:215`, `tutor-bridge.js:199,399`)
- `AbortSignal.timeout` (`elements/index.mjs:67`)
- validators that could run in parallel but run one after another (`questions/index.mjs:270`, `personal.mjs:136`)

→ `core/fanout.mjs` (§6.3).

**D8 · Question offers.** Four reserve sites (`session/index.mjs:1198,1549,1947`, and `offerQuestion` in the service object) and two release-on-replace rules (`:1247,:1570`).

→ One `offerQuestion(session, {questionId | topicId, format, difficulty, about})`, returning `{question} | {generating} | {busy}`.

**D9 · The client tools are implemented twice:** in `main.jsx:233-457`, and again in `evals/stand-in.mjs:87-218` ("Tools run the way src/main.jsx runs them").

→ `src/app/tools.js`, built over a small page interface (show, ask, work, notes, point, send) and imported by both. The evals then test the page's own code.

**D10 · Small repeats:**
- `clip` ×9: cards, director, plan, lessons, `modules/outline` (exported), agent, tutor-bridge, CodeZone, `shared/elements/check`.
- `scopeOf` ×4.
- unit, subtree and expand helpers: `session/index.mjs:334-345`, `questions/index.mjs:63-69`, `lessons/index.mjs:138`, and plan.

→ `core/util.mjs` gets `clip`; `knowledge/tree.mjs` gets the course-tree helpers.

---

## 5. God modules: split plans (no code moved yet)

### 5.1 `backend/session/index.mjs` (1,993 lines; 70 `safe()` calls)

| New file | From (lines) | Owns | ~Lines | If cards wins |
| --- | --- | --- | --- | --- |
| `session/state.mjs` | 53-99, 1868-1885 | `txn`, `serverEvent`, `pushLive`, `consumer`, load and save, turns, event stream, subscribe, trace | 120 | keep |
| `session/ledger.mjs` | 101-166, 1454-1525, 1577-1608 | delivery ledger, `dialogueOf`, assistance, `promptLedger`, `agentEvents`, `recordPlayback`, `finishTurn` | 230 | keep; hint matching goes (−20) |
| `session/epochs.mjs` | 168-233, 1610-1750 | `bumpEpoch`, resume records, interrupt, switchTopic, disconnect, resume, end, feedback | 230 | keep `bumpEpoch`, end and resume records (~90); interrupt, switchTopic and resume are DECIDE (§3.3) |
| `learner/progress.mjs` (move) | 235-327 | `examFor`, `gapsFor`, `topicProjection`, `progress` | 95 | keep. It is the learner's view, so it belongs in learner. |
| `session/focus.mjs` | 329-456 | focus sections, `focusAgendas`, `focusStartTopic` | 130 | keep |
| `session/drawings.mjs` | 458-534 | `pngOf`, `drawings`, `drawingShapes` | 80 | keep |
| `session/start.mjs` | 536-613 | `startResult`, `lessonView`, `start` | 80 | keep; drop `agent.context` (−3) |
| `session/agenda-live.mjs` (merge into `agenda.mjs`) | 615-877 | `buildAgenda`, intro goals, diagnose picks, `topicGoal`, matchers (also used by the new `changeTopic`), `moveAgenda`, `agendaUpdated`, `agendaAction`, lesson and agenda progress, `timeCheck` | 265 | keep building, moving, matching and `timeCheck`; port `progressAgenda`'s auto-completion to the director; drop `agendaAction`'s done, skip and step (~45) |
| `session/responses.mjs` | 879-986 | `submitResponse`, `checkStructured`, `commitResponse` | 110 | keep |
| `session/adoption.mjs` | 1011-1049 | `safeBoundary`, `adoptIfReady`, `adoptNewMaterial` | 40 | keep |
| `session/classic.mjs` | 988-1010, 1051-1327, 1398-1452, 1533-1564 | planner request, validation and fallback; plan activation; context packets; course brief and plan briefs; `request_question` | 520 | **delete** |
| `session/speaker.mjs` | 1329-1394, 1752-1866 | `speak`, `handleOutputEvent`, planner waits, voice ingress, provider callbacks | 200 | **delete** (with §3.3) |
| `session/index.mjs` | 1-52, 1887-1993 | installation: wiring, job registration, consumers, the service object | 160 | keep |

If cards wins: about **1.3k lines in 10 files**, none over 270.

### 5.2 `src/main.jsx` (1,029 lines)

| New file | From (lines) | Owns | ~Lines |
| --- | --- | --- | --- |
| `src/main.jsx` | 1029 | `createRoot` only | 3 |
| `src/app/App.jsx` | 1-125, 943-1027 | state, constants and render | 210 |
| `src/app/voice.js` (`useVoiceSession`) | 127-229 | `brief`, `connect`, `again`, reconnect/rest/wait, `onEvent`/`onLine`/`onClose` | 105 |
| `src/app/channel.js` (`ActorChannel`, D1) | 473-506 | `said`, `toAgent`, `tellSoon`/`flush`, `context`/`contextNow`, `later` | 40 |
| `src/app/tools.js` (D9) | 231-457 | the client tools over a page interface; shared with `evals/stand-in.mjs` | 230 (−60 if cards wins) |
| `src/app/cards.js` | 507-552 | `cardIssued`, `thoughtReady`, `thought`, `boardSoon`, `boardNow`, `quoteNotes` | 50 |
| `src/app/page.js` | 459-472, 553-572 | `show`, `showElement`, `quote`, `tell`, `answered`, `answerAsk`, `openDraft` | 40 |
| `src/app/handin.js` | 573-736 | handing in ink and zone work: `commit`, zones, exam parts, `send`, glances, shapes | 165 |
| `src/app/intake.js` | 738-800 | files: `take`, `choose`, `putAway`, `name`, `point`, `runC` | 65 |
| `src/app/input.js` (`useGlobalInput`) | 802-942 | drag, drop, paste, press, type-anywhere, keyboard inset, listeners | 140 |

The other files over 450 lines are cohesive, and their hot spots are elsewhere:
- `src/sphere/sphere-motion.mjs` (887 lines) is one animation model. Leave it.
- `src/visuals/diagram.mjs` (735 lines) is one renderer per diagram type. Move it, with `formula.mjs`, to `shared/visuals/`, because the backend imports it (`backend/lessons/index.mjs:6`, `backend/director/index.mjs:5`, `backend/director/cards.mjs:2`).
- `backend/knowledge/build.mjs` (906 lines) can split by stage: `interpret.mjs` (263-415), `graph.mjs` (417-733) and `publish.mjs` (735-907). That is a move, not a rewrite.

---

## 6. Target structure, assuming the director/actor design wins

### 6.1 Directory layout

```
backend/
  app.mjs                      composition root
  core/                        db, jobs, events, blobs, scope, shape, errors
    util.mjs                   + clip, quietly (D4, D10)
    fanout.mjs                 NEW: parallel sub-calls with deadlines, partial results, fallbacks (§6.3)
  models/                      NEW, replaces providers/codex/*, providers/live.mjs and the lane config
    tasks.mjs                  one row per call: lane, effort knob, timeout, reply|background, schema, prompt (D5)
    runtime.mjs                moved from server/; lanes become priority-aware (reply before background)
    ask.mjs                    ask(task, input, {ctx, signal}), draft({write, check, repairs}) (D6)
    prompts/                   moved from providers/prompts, one file per role
    mock.mjs                   task-keyed mocks (replaces providers/mock/*)
  knowledge/                   upload → pages → interpret → graph → publish; read (retrieve, passages); tree.mjs
    attach.mjs                 was backend/ingest
    modules/                   was backend/modules (outline, writer, text)
  learner/
    events.mjs                 NEW: the learner event queue (§6.4)
    estimate.mjs               NEW: concept state, interpolation, unknowns
    grade.mjs                  exact first, then the local assessor (was part of assessment.mjs)
    mastery.mjs                topic projections, batched (was the rest of assessment.mjs)
    profile.mjs, personal.mjs, progress.mjs (moved from session)
  teaching/
    director/                  turn.mjs (match, classify, next card), cards.mjs, speculate.mjs, think.mjs,
                               actor.mjs (ACTOR_PROMPT, ACTOR_TOOLS)
    lessons.mjs                was backend/lessons
    questions/                 bank, offer.mjs (D8), exam author
    plan.mjs                   study plan
    agenda.mjs                 pure agenda plus the live parts from the session
    boards.mjs                 the board specialist: checkBoard and the elements maker
  session/                     state, ledger, epochs, focus, drawings, start, responses, adoption, index (§5.1)
  http/                        routes (trimmed), sse
  run/                         C sandbox
shared/
  board.mjs                    board kinds, BOARD_DRAFT, checkBoard, DIAGRAM_DOC (D3)
  answer-input.mjs             input kinds, normalizeSpec, checkStructured, gradeExact (D3)
  notes.mjs                    the bracketed context lines Plato hears (D1)
  text-match.mjs               words, rank, looksLikeExam, lectureTitle (D2)
  visuals/                     diagram.mjs and formula.mjs, moved from src/visuals
  elements/                    circuit, trace, scene3d, figure (unchanged)
  board-rich-text.mjs          markdown, code and math for the page
src/
  main.jsx  app/ (§5.2)  page/ (BoardStage, inputs, elements, zones incl. Palette, visual renderers)
  sphere/  course-tree/  eleven-voice.js  backend-client.js  tutor-bridge.js (slimmed: events in, no text composing)
server/index.mjs               static files, voice token, backend
scripts/setup-tutor-agent.mjs  one agent (the actor)
```

### 6.2 Agent roles

| Role | Model · lane | Path | Owns | Code |
| --- | --- | --- | --- | --- |
| **Actor** | ElevenLabs, gpt-6-sol, no reasoning | reply | speaking the card, conversation, picking a branch by meaning, think, change_topic, the page tools | `teaching/director/actor.mjs`, `src/app/tools.js` |
| **Director** (teaching brain) | code first. On the reply path: Plato classify (light, reserved) and an Astra card (planner, low). Ahead of time: Astra high (heavy). | reply, with a 4 s budget to the first card | session state (goal, point, rung); next card; goals move on evidence, the intro included; question offers; time checks | `teaching/director/*` |
| **Deep reasoner** | Astra high on the heavy and exam lanes; think on the planner lane at low effort, with a deadline | background; think on the reply path | lessons, modules, exam problems, the study plan, think | `teaching/lessons.mjs`, `knowledge/modules`, `teaching/questions/exam.mjs`, `teaching/plan.mjs`, `teaching/director/think.mjs` |
| **Board designer** | `checkBoard` in code; the elements lane (Astra low) for interactive elements | reply-capped (25 s, late results allowed) and background | turning a move into a valid board, or its stand-in | `shared/board.mjs`, `teaching/boards.mjs` |
| **Verifier** | Astra medium | background | knowledge, question and personal validators; exam solve and compare; deterministic checks | `models/tasks.mjs` (verify), via `fanout` |
| **Classifier** | exact first, then Plato low | reply | branch match, the drawing gate, preference parsing, drift guard | `teaching/director/turn.mjs`, `shared/text-match.mjs` |
| **Grader** | exact first, then Astra | background | findings with partial credit | `learner/grade.mjs` |
| **Learner modeler** | code reducers; Astra estimator batched every ~3 answers or at session end | background | concept state, topic mastery, profile, unknowns, interpolation | `learner/events.mjs`, `learner/estimate.mjs`, `learner/mastery.mjs` |
| **Readers** | Astra low (drawings, shapes); Plato medium (PDF pages) | hand-in reply path, and background | ink to words, ink to structure, pages to markdown | `session/drawings.mjs`, `knowledge/pages.mjs` |

### 6.3 The fan-out/fan-in runner (`backend/core/fanout.mjs`, ~90 lines)

**Semantics:**
- Named sub-calls run in parallel, each with its own deadline and fallback.
- The step returns when every sub-call has settled or the step's deadline passes, with whatever is in. Each result is ok, fallback, failed or late. The step never throws.
- A late result is not lost: `onLate(name, value)` receives it (for example, an element board that arrives after its card goes out as `card.updated`).
- A parent `signal` cancels everything, for example when the student answers before speculation finishes.

**Concurrency:**
- `limit` caps how many run at once, which replaces `mapLimit`.
- Sub-calls go through `models/ask`, whose lanes become priority-aware: reply-path calls go first.
- Reply-path work runs outside the 8-worker job queue, as `elements.build` and `drawings` already do. Only background work stays a durable job. This removes the worker starvation in §1.4.

```js
// Sketch. tasks: { name: { run: signal => Promise, fallback?: error => value, standIn?: value } }
export async function fanout(tasks, { deadlineMs = Infinity, signal, onLate = () => {} } = {}) {
  const t0 = Date.now(), out = {}; let closed = false;
  const settle = (name, entry) => closed ? entry.status === 'ok' && onLate(name, entry.value) : (out[name] = entry);
  const runs = Object.entries(tasks).map(([name, t]) => Promise.resolve().then(() => t.run(signal))
    .then(value => settle(name, { status: 'ok', value, ms: Date.now() - t0 }),
          async error => settle(name, { status: t.fallback ? 'fallback' : 'failed', value: t.fallback ? await t.fallback(error) : null, error, ms: Date.now() - t0 })));
  const deadline = Number.isFinite(deadlineMs) ? new Promise(r => setTimeout(r, deadlineMs).unref?.()) : new Promise(() => {});
  await Promise.race([Promise.all(runs), deadline]);
  closed = true;
  for (const [name, t] of Object.entries(tasks)) out[name] ??= { status: 'late', value: t.standIn ?? null, ms: Date.now() - t0 };
  return out;
}
```

| Caller | Fan-out | Deadline | Fan-in and fallback | Replaces |
| --- | --- | --- | --- | --- |
| **Director, answer turn** | exact match → classify (light, 3 s), alongside: prepared card, lesson follow-up, Astra card (planner, 12 s), element board (elements, 25 s) | 4 s to the first card | The best card in hand at 4 s: prepared, else the lesson's follow-up, else a holding line plus think. An Astra card that lands before the student answers replaces it. A late element arrives as `card.updated`. | today's serial `director_card` job (18–26 s in the runs) |
| **Speculation** | follow-ups for the correct, top-misconception and stuck branches (heavy, high) | until the student answers (signal) | cached per concept and misconception; stale results dropped | `speculate()` with the in-flight count (`director/index.mjs:87-103`) |
| **Think** | passages (local), concepts (local), say plus board (planner, 8 s), element (25 s, may be late) | 8 s for the words | the words go out at 8 s even without a board; the board follows | the `director_think` job (11–20 s in the runs) |
| **Lessons** | one sub-call per topic of a series goal (heavy, ≤4), alongside bank and past-exam rungs (local) | the job's lease | compose, then `checkLesson`, then `draft()`'s one repair; the instant lesson stands in | `prepare_lesson` |
| **Exam author** | after the writer: machine checks (local) alongside the independent solve (exam lane), optionally a second solve for self-consistency, then compare | 15 min | as today; the repair round re-runs the same step | today these run one after another (`questions/exam.mjs:133-147`) |
| **Verifiers** | responsibilities in parallel | the job | the worst disposition wins (as `build.mjs:166` does today) | `questions/index.mjs:270`, `personal.mjs:136` |
| **Knowledge build** | segments, merges, partitions, validator batches (`limit: 4`) | the job | as today | `mapLimit`, the pool in `pages.mjs` |

### 6.4 The learner info queue and its interpolation

```
learner_events  (append-only; one small migration; existing tables stay)
  { id, scope, at, sessionId, kind: answer | utterance | preference | goal | focus | time,
    conceptIds, topicIds, outcome 0..1 | null, assistance 0..1, how: exact | classify | grader | stated,
    branchKind, misconception, text }

writers   session.commitResponse (answer, utterance) · director.turn (branch kind, concepts, misconception)
          learner.recordFeedback (preference, goal) · agenda (minutes on a goal) · focus sections (focus)

reducers  concepts → per concept { level or θ, uncertainty, misconceptions suspected → confirmed → resolved, lastSeen }
                     (replaces director_state.model, which today is lost with the session)
          topics   → mastery projection: today's learner assessor, run batched (every ~3 answers on a topic,
                     or at session end) instead of on every utterance (§1.4)
          profile  → facts as today, plus one unknowns() list (replaces profileGaps and introUnknown)

estimate(scope, conceptOrTopic) → { value, uncertainty, source: observed | interpolated | prior }
  observed      from the reducers
  interpolated  a weighted mean of neighbours' observed values over prerequisite and supports edges
                (and the diagnose sweep's unit result), shrunk toward the prior; high uncertainty
  prior         the course prior, adjusted by the stated background

consumers director card and think inputs (concept states, top misconceptions, preferences, unknowns: none reach it today)
          · plan baseline weights · question choice · lessons
          The UI shows observed values only: an interpolated value stays "not assessed" (no guessed mastery on screen).
```

This is the shape `docs/teacher-architecture.md` §6 already describes: evidence from the whole conversation, prerequisite effects, the misconception lifecycle and the cold start. The open choice is the update rule:
- keep the model-estimated ordinal (today), or
- adopt §6.1's θ/σ formula in code.

The queue works with either.

### 6.5 What gets deleted

**Phase 0: safe now, no decision needed.** About −6.4k lines, −803 test lines, and −47 MB of assets:
- everything in §3.1, §3.2 and §3.11;
- the dead jobs, validators and services in §3.10;
- the equation routes in §3.5;
- the README and CONTRACTS drift.

The check-board bug (§2.1) was already fixed during this audit; D3 removes the cause.

**Phase 1: helpers, behaviour-neutral.** About −0.5k lines net:
- D1–D10;
- the split in §5;
- `models/tasks.mjs`;
- `fanout`, replacing `mapLimit`.

**Phase 2: once the experiments choose cards.** About −2.1k lines, from:
- `session/classic.mjs` and `speaker.mjs` (§5.1);
- the classic part of `agent.mjs`: `courseBrief`, `lessonBrief`, `planBrief`, `AGENT_PROMPT` and `AGENT_CLIENT_TOOLS` (`:31-442`). Inline the 4 page tools `ACTOR_TOOLS` borrows;
- `codex/session.mjs`, `prompts/session.mjs` and `session/context.mjs`;
- `elevenlabs/voice.mjs`, `speech-stream.mjs`, `speech-alignment.mjs` and `voice-socket.mjs`;
- the plan, voice, interrupt, resume and switch-topic schemas, and their routes;
- the classic client tools and the bridge's brief and agenda paths;
- the "Plato Tutor" classic ElevenLabs agent. Redeploying with `scripts/setup-tutor-agent.mjs` is a deploy, not a test.

Phase 2 also adds things back:
- **Port into the director:** intro auto-completion, time checks and preferences.
- **Tests:** convert 3 acceptance tests to cards (card match and follow-up, think, intro completion). This respects your few-tests rule, but today no test touches the director at all.

**Phase 3: the learner queue and interpolation.** About +0.3k lines:
- §6.4;
- batching `assess_response`;
- priority lanes and the reply path moved out of the job queue.

### 6.6 Line-count estimate

| Area | Now | After | Main changes |
| --- | --- | --- | --- |
| backend (no tests, no mocks) | 11,026 | ~9,100 | −1,580 classic/speaker; −610 adapters and helpers; −70 dead; +300 fanout, learner queue and director ports |
| backend mocks | 829 | ~630 | task-keyed; no planner or speaker mocks |
| migrations | 414 | ~430 | + `learner_events` |
| src JS and CSS | 14,491 | ~9,000 | −5,300 orphans, demos, test-only, course art, playground, dead CSS; −200 classic client paths and duplicates |
| shared | 1,447 | ~1,200 | −450 demos, zones, catalog; +230 board, text-match, answer-input, notes |
| server, scripts, public JS | 1,248 | ~540 | −speech-stream, course art, export script, test-only voice clients |
| **App total** | **29,455** | **~20,900 (−29%)** | ~19,400 if the flat-mosaic fallback (§3.6) goes too |
| evals | 1,015 | ~890 | the stand-in imports the page's tools (D9) |
| tests (backend + UI) | 7,235 | ~5,800 | −803 orphan tests; −~900 classic and speaker acceptance tests; +~300 cards acceptance tests |

Biggest files after the work: `knowledge/build.mjs`, split in three; `sphere-motion.mjs` (887, left alone); `src/visuals/diagram.mjs` (735, moved to `shared/`). No session file over ~270 lines, and no page module over ~230.

### 6.7 Decisions needed from you before Phase 2 and 3

1. **Classic or cards.** The experiments are still running. Everything in Phase 2 depends on this.
2. **The `default` transport.** Keep the server-side ElevenLabs voice, the text speaker and the spec §7 barge-in, resume and switch-topic routes with their tests (A08–A20), or retire them with classic.
3. **The flat mosaic.** Keep `VoiceCanvas` as the WebGL2 fallback (~1.5k lines), or require WebGL2.
4. **The PDF head start.** Keep the browser-side outline (`src/study-material*.mjs`, `outlineBriefing`) that lets Plato start on a PDF before the course publishes.
5. **The learner update rule.** Keep the model-estimated ordinal, or adopt `teacher-architecture.md` §6.1's θ/σ. Interpolation works either way.
6. **Model knobs.** Keep all 22, or collapse them to the 4 of `teacher-architecture.md` §9.7. No model or effort changes without your say.
7. **The equation sheet.** Keep saving formulas and give them to the director, or drop the feature.
8. **Reply-path capacity.** Use priority lanes and run reply-path work outside the job queue (recommended), or reserve 2 job workers for reply-path job types.
