# Luna Study — Teacher Architecture Design

2026-10-04

> The backend described in sections 3, 5, 9 and 12 has been replaced by [architecture.md](architecture.md). The learner model (6), teaching model (7), conversation quality rules (8) and evaluation plan (11) still apply.

## 1. Purpose and principles

Luna should teach like a strong human tutor. It knows the whole course and knows this student, so it can move a learner from a rough grasp of an idea to using it flexibly under exam conditions. It should never leave a topic untaught and never recite half-remembered material.

**The core problem.** Take messy student input (notes, slides, problem sets, past exams, voice) and turn it into an understanding that is:

- **complete** (no blindspots)
- **faithful** (no invented or misremembered facts)
- **teachable** (condensed, connected, adjustable to the person)

Then deliver it in conversation that feels alive rather than scripted.

**Principles**

1. **Separate grounding from generation.** Faithfulness is enforced while knowledge is built and checked after it is spoken, never by forcing quotes into the teacher's mouth. The teacher is free to choose its words, examples and order.
2. **One voice, many workers.** One large-model teacher holds the conversation. Background agents prepare knowledge, model the learner and check facts. They write to shared state; they never talk to the student or block the teacher.
3. **Understanding is continuous.** No visible levels or tiers. An ability estimate per concept moves smoothly, and the teacher's next move follows it.
4. **Exam-shaped goals.** What "done" means for each concept comes from what the exam actually demands, read from past exams, problem sets and the syllabus.
5. **Breadth first, then depth.** Every concept gets touched early, and depth goes where importance and weakness meet.
6. **The person shapes the teaching.** How this student thinks, what has worked for them, and what they keep getting wrong are first-class data.
7. **Measured, not assumed.** Every quality claim in this document has a test in section 11. A change that does not move a metric does not ship.
8. **Fewer moving parts.** One store, one teacher, a small fixed set of agents. Nothing in the live voice path that can be moved out of it.

## 2. What exists today

The prototype runs and 904 of 905 unit tests pass. Its engineering effort went into voice latency and guardrails, while the parts that decide *what* is learned are thin. Findings come from a read-through of `server/` and `src/` on 2026-10-04.

| Area | Current behavior | Consequence |
| --- | --- | --- |
| Synthesis | Map step keeps about 20% of each 18,000-character chunk as excerpts; merge sees only topic titles; output is 3 to 6 flat topics with summaries under 300 characters (`server/indexing.mjs`, `server/api.mjs`) | Blindspots by construction; no hierarchy, no concepts, no links between ideas |
| Coverage | Checks that every chunk is processed, never that every chunk lands in a topic; `docs/indexing.md` says it does not prove completeness | No way to know what was left out |
| Source types | Syllabus, lecture, problem set and past exam are all treated the same | No signal for importance or for what the exam demands |
| Three indexing paths | Chunked API path, single-shot Codex CLI path, single-shot raw fetch path, with conflicting prompts (3 to 8 topics versus 3 to 6) | Behavior depends on configuration; up to 500,000 characters in one call |
| Retrieval | Keyword overlap, top 4 passages, an external classifier with an 850 ms deadline, no embeddings (`server/material-retrieval.mjs`) | Misses passages phrased differently from the question |
| Questions | 3 slots per topic (easy, medium, hard), no question types, answers never checked against sources, in memory with a 30 minute lifetime (`server/question-bank.mjs`) | Narrow practice; possible wrong answers; lost on restart |
| Sequencing | The tutor model picks from a question list in its context; no prerequisites, spacing or weakness targeting | Order depends on the model's mood, not the student's needs |
| Mastery | Points per topic; mastered = 3 hard questions right first time; no forgetting; help still earns points; progress resets on re-index (`server/mastery.mjs`) | Progress number does not track real understanding |
| Grading | Two model calls must agree; returns only a verdict; misconceptions never recorded | Nothing learned about *why* the student is wrong |
| Tutor context | 14 KB system prompt every turn (5.5 KB of it whiteboard rules), unbounded verbatim conversation memory, up to 12 KB of question bank | Expensive, noisy, and the important parts compete for attention |
| Grounding | Prompt instructions only; nothing checks what the tutor says | Plausible-sounding errors can reach the student |
| Interface | Voice only, no text input, user transcript discarded, one caption line, no plan, nothing exportable, board keeps only its latest version | The student cannot see, revisit or steer what was generated |
| Mosaic | Bound to voice volume and file-drop count only (`src/VoiceCanvas.jsx`) | A beautiful surface with no meaning behind it |
| Plumbing | 4 providers, 22 environment variables, 6 call sites to the TypeSafe classifier, `server/live-voice.mjs` is one 1,263-line function with about 60 shared variables | Hard to change safely |

**Worth keeping:** the tool-calling loop in `server/openai-luna.mjs`, the whiteboard block schema in `shared/board-parts.mjs`, the speech-to-text and text-to-speech adapters, the streaming-to-speech pipeline, the atomic-write discipline, and the habit of measuring (the `benchmarks/` folder).

## 3. System architecture

The system has three layers around one shared store: background agents that build course knowledge, the store itself, and a live session where one teacher talks while helpers work beside it.

```text
┌─ Background: build the course knowledge ───────────────────────────────────┐
│  Sources ──▶ Librarian ──▶ Checker + auditor ──▶ Examiner                  │
│  (by role)   (concepts,    (accuracy,            (exam targets)            │
│               briefs)       coverage)                                      │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │ writes concepts, briefs, targets
┌─ Shared store: one SQLite file ─▼──────────────────────────────────────────┐
│  Knowledge                 Conversation              Learner               │◀─┐
│  concepts, briefs, edges   turns, threads, inbox     ability, mistakes,    │  │
│                                                      profile               │  │
└──────────────────────────────▲──────────────────────────┬──────────────────┘  │
          replies, intent readings│                        │ per-turn view      │
┌─ Live session ─────────────────┼────────────────────────▼──────────────────┐  │
│  Student ◀──────────▶ TEACHER (largest model) ◀── Context compiler         │  │
│  types or speaks      streams replies             builds each turn         │  │
│                                                                            │  │
│  Helpers read the store and post notes to the inbox; never block teacher:  │  │
│  Learner modeler · Fact-checker · Problem smith · Summarizer ──────────────┼──┘
└────────────────────────────────────────────────────────────────────────────┘
```

Knowledge flows down from the material into the store. Each turn, the compiler builds the teacher's view from the store. Helpers turn the conversation back into learner data and inbox notes, so the next turn is better informed without anyone interrupting the teacher.

## 4. Data model

One SQLite file (`node:sqlite`, built into Node 24) replaces the split between browser IndexedDB, server JSON files and in-memory maps. Every agent reads and writes this store; nothing important lives only in a process.

The store has three layers. The **knowledge layer** describes the course. The **learner layer** describes this student. The **conversation layer** keeps a session coherent and fresh.

```sql
-- Knowledge layer
sources(id, test_id, name, role, fingerprint, added_at)
  -- role: syllabus | lecture | notes | textbook | problem_set | solutions | past_exam | other
chunks(id, source_id, ord, heading_path, text, embedding BLOB, coverage)
  -- coverage: covered | noncontent | gap
concepts(id, test_id, parent_id, kind, title, brief JSON, importance REAL,
         exam_target JSON, embedding BLOB, lineage_key)
  -- kind: course | topic | concept
concept_chunks(concept_id, chunk_id, role)
  -- role: defines | explains | example | exercise | exam_item | mentions
edges(from_id, to_id, kind, note)
  -- kind: prerequisite | contrasts_with | generalizes | applies_in | often_confused_with | same_idea_different_notation
items(id, concept_ids JSON, move, difficulty REAL, prompt, solution, rubric,
      verified, source_chunk_ids JSON, embedding BLOB, times_used)

-- Learner layer
learner_concept(student_id, concept_id, ability REAL, uncertainty REAL,
                half_life_days REAL, last_practiced, last_seen)
observations(id, session_id, concept_id, item_id, move, difficulty REAL,
             outcome REAL, assistance REAL, evidence, created_at)
misconceptions(id, student_id, concept_id, statement, evidence, status, first_seen, last_seen)
  -- status: suspected | confirmed | addressed | resolved
explanations(id, student_id, concept_id, kind, summary, embedding BLOB, landed REAL, used_at)
  -- kind: analogy | worked_example | picture | derivation | story | contrast | real_world_case
profile(student_id, data JSON, updated_at)

-- Conversation layer
sessions(id, test_id, started_at, ended_at, goals JSON, summary, mood_arc)
turns(id, session_id, role, text, board JSON, intent JSON, heard_chars, created_at)
open_threads(id, student_id, session_id, kind, text, status, created_at)
  -- kind: student_question | deferred_tangent | promise | curiosity
inbox(id, session_id, from_agent, priority, text, created_at, consumed_at, expires_after_turns)
```

**Design choices that matter**

- **Briefs are JSON, not prose blobs.** They have fixed fields (section 5) so the context compiler can include only what a turn needs, such as the intuition and common mistakes but not the derivation.
- **Edges carry the teaching links.** `contrasts_with` and `often_confused_with` drive comparison questions. `applies_in` drives transfer problems. `same_idea_different_notation` catches the same idea taught twice under different names across sources, a common source of student confusion.
- **`lineage_key` keeps progress across re-indexing.** When material changes, new concepts are matched to old ones by embedding similarity and shared chunks. Learner state carries over on a match above 0.85 cosine similarity, and is flagged for review between 0.70 and 0.85.
- **Observations are the only truth about the learner.** Ability, misconceptions and profile are all derived from them and can be rebuilt. That makes model changes testable: replay old observations through a new estimator.
- **`explanations` and `open_threads` exist for conversation quality.** The first stops the teacher repeating an analogy that already failed and lets it reuse one that worked. The second keeps promises like "we'll come back to that" from being forgotten (section 8).
- **Vectors are stored as Float32 blobs** and searched with a plain cosine loop in JavaScript. A course has a few thousand chunks, so this takes milliseconds. Add a vector index only if a course passes about 50,000 chunks.

## 5. Knowledge layer

The knowledge layer turns raw material into a concept map with rich, checked briefs, and proves its coverage. It runs in the background with the largest model and many parallel context windows. It reruns only on what changed.

### 5.1 Ingestion

- **Source role.** Each file gets a role (section 4). A small model proposes it from the name and the first pages, and the student can change it with one click in the Library. Role drives importance and the Examiner.
- **Structure-aware chunks.** Split on headings, slides, problem numbers and page breaks into chunks of about 1,500 tokens. Each chunk keeps its heading path ("Lecture 7 > Eigenvalues > Diagonalization"). This replaces the two existing chunkers.
- **Keep equations and tables.** DOCX goes through mammoth's HTML output rather than raw text, so tables and equations survive. Scanned PDFs and diagrams go page by page to the vision model, and their text is tagged as model-derived.
- **Embed every chunk** once, at ingestion.

### 5.2 The Librarian (four passes)

1. **Extract (parallel).** Each window holds about 30,000 tokens of consecutive chunks, a small overlap, and the syllabus outline if one exists. The model lists every concept the window teaches, with draft fields and the chunk IDs it used. Windows run in parallel.
2. **Merge.** Group candidates by embedding similarity. For each group above a similarity threshold, the model decides: same concept, related but distinct (an edge), or unrelated. This is where "the same idea under two names" is caught.
3. **Structure.** The model reads the merged concept list (titles plus one-line definitions, which fits in one window) and builds topics, prerequisites and the other edge types.
4. **Write briefs (parallel).** For each concept, the model reads the full text of every linked chunk plus its neighbors' one-liners, and writes the final brief.

**Brief fields.** The brief is a teacher's prep sheet, written in plain language, not a summary of the slides.

| Field | Holds |
| --- | --- |
| `plain` | What it is, in one or two sentences a smart friend would say |
| `intuition` | Why it is true or why it works; the mental picture that makes it click |
| `precise` | The formal statement, in the course's own notation |
| `course_framing` | How this course presents it: conventions, sign choices, the professor's favorite example |
| `examples` | The best worked examples in the material, summarized, with chunk pointers |
| `mistakes` | Common errors and the confusion behind each one |
| `boundaries` | When it does not apply, edge cases, conditions; essential for transfer |
| `connections` | Each edge, with one sentence on how the ideas relate |
| `exam_signals` | How it has been tested (from the Examiner) |
| `conflicts` | Places where sources disagree or notation changes |
| `support` | Claim to chunk-ID mapping; used only by checkers, never shown to the teacher |

### 5.3 Checking briefs: precision

A checker reads each brief next to its linked chunks and labels every claim as one of three kinds:

- **Course-supported.** The material backs it.
- **General knowledge.** Not in the material, but standard and correct. This is allowed, and it is where good teaching analogies and context come from.
- **Unsupported or contradicted.** Rewritten or removed.

This gives the teacher freedom while keeping the course's own facts and conventions exact.

### 5.4 Coverage auditor: recall

- For each content chunk, take the highest cosine similarity between the chunk and any brief claim.
- Chunks below a calibrated threshold are **candidate gaps**.
- For each candidate, the auditor model sees the chunk and its three nearest concepts, then decides:
    - attach it to a concept and extend that brief
    - create a new concept
    - mark it as non-content (administrative text, filler)
- **Coverage** = characters in covered chunks / characters in content chunks. Target: at least 98%. Anything left is shown to the student as a named blindspot, never silently dropped.

Precision (5.3) and recall (5.4) are measured on every indexing run and stored with it.

### 5.5 Importance

Importance for each concept is a weighted sum of signals, normalized to 0 to 1:

- appears on a past exam (strongest)
- appears in problem sets
- named in the syllabus or learning objectives
- repeated across sources
- number of concepts that depend on it
- student says "the professor said this will be on the test" (a manual boost through conversation or the Library)

The weights are a starting guess. Section 11.2 tunes them against real exams.

### 5.6 The Examiner

**For every past-exam and problem-set item, the Examiner records:**

- which concepts it uses
- the kind of thinking it demands (recall, explain, apply, combine, transfer)
- its difficulty on the shared ability scale
- its format (multiple choice, short answer, computation, proof, essay)
- the expected time

**These roll up into an `exam_target` per concept:**

- the ability it must reach
- the formats to practice
- the concepts it is usually combined with

Without past exams, targets come from problem sets, the syllabus's learning objectives and the existing quiz, test and final slider. They are then marked low-confidence, and the teacher is told to ask the student what the exam looks like.

### 5.7 Updates

- **When a file is added,** only its chunks are processed. Concepts it touches are re-merged and their briefs rewritten, and learner state carries over by `lineage_key`.
- **The live session gets an inbox note** ("new: Lecture 9 adds three concepts on Markov chains; nothing you've taught changed"). The teacher can mention it naturally instead of the session restarting.

**Cost.** Roughly 2.5 times the input size in large-model tokens per full index: one read in pass 1, one read in pass 4, plus outputs and checks. A 500,000-character course is about 125,000 input tokens, so about 310,000 tokens per full build. Incremental updates cost a fraction of that.

## 6. Learner model

The learner model is a set of beliefs about this student, each with a confidence level, built only from observations. It has four parts: an ability estimate per concept, misconceptions, a personal profile, and a memory of which explanations worked.

### 6.1 Ability per concept

Ability (θ) and item difficulty (d) sit on one shared scale, the logit scale used in test theory. The probability that the student succeeds at a move of difficulty d on concept c is:

```
P(success) = σ(θ_c − d) = 1 / (1 + e^−(θ_c − d))
```

After each observation with outcome o (0 to 1, partial credit allowed) and assistance a (0 for none, 1 for a full walk-through):

```
w   = (1 − a)  if o ≥ P      (help discounts success)
      1        if o < P      (failure is never discounted)
θ_c ← θ_c + k · w · (o − P)
k   = k₀ · σ_c² / (σ_c² + s²)
```

Uncertainty shrinks with every observation and grows with time away:

```
after evidence:  σ_c² ← σ_c² · s² / (σ_c² + s²)
over time:       σ_c² ← σ_c² + τ · Δt_days
```

What this gives:

- **Help counts as weaker evidence.** It is not a separate rule. A success with help moves the estimate less; a failure is never discounted.
- **Uncertain concepts move fast; well-known ones move slowly.** One lucky answer cannot fake mastery.
- **Untouched concepts have high uncertainty,** which is what pulls the scheduler toward breadth (section 7.4).

### 6.2 Forgetting

Each concept has a half-life h in days. The predicted chance of recall after Δt days without practice is 2^(−Δt / h). A successful retrieval after a gap of at least h/2 doubles h. A failure halves it, with a floor of 1 day. The scheduler uses this to bring concepts back just before they fade. The estimate in 6.1 is the ability right after practice; the effective ability today subtracts the expected forgetting.

### 6.3 Evidence from the whole conversation

Scored questions are not the only evidence. The learner modeler (section 9) also logs:

- **Unprompted correct explanations,** at half weight.
- **The student's own questions.** A sharp question is positive evidence; a question that reveals a missing prerequisite is negative evidence on that prerequisite.
- **Combined items,** which update every concept involved, weighted by how central each was to the solution.
- **Prerequisite effects.** When an error is traced to a prerequisite, the prerequisite takes the update, not the concept being practiced.

### 6.4 Misconceptions

A misconception is a specific false belief written as a sentence, for example: "thinks the determinant of a sum is the sum of determinants." It is not a vague "weak on determinants."

| Status | Entered when |
| --- | --- |
| suspected | One observation suggests it |
| confirmed | A second, independent observation shows it |
| addressed | The teacher has worked on it directly |
| resolved | The student succeeds on a probe built to expose it, at least a day later |

Confirmed misconceptions get priority in the teacher's inbox. The problem smith can build items that look tempting under the wrong belief.

### 6.5 Profile

Every profile field stores a value, a confidence and the observations behind it. The teacher can then tell a firm belief from a guess, and the modeler can revise.

| Field | Example | Used for |
| --- | --- | --- |
| Background | Second-year biology major; took AP Calculus | Pitching explanations; choosing examples |
| Interests | Climbing, music production | Real-world cases that mean something to them |
| Representation that works | Pictures before symbols; examples before definitions | Choosing how to open a new idea |
| Pace and turn length | Prefers short exchanges; loses the thread past 3 steps | Turn length; how much to put on the board |
| Fluency profile | Strong at algebra, weak at setting problems up | Where to scaffold and where to step back |
| Confidence calibration | Usually says "sure" when wrong | How often to ask "how confident are you?"; probing |
| Emotional pattern | Gets short when stuck; perks up after a quick win | When to slow down, encourage or switch |
| Register | Casual, likes dry humor | The teacher's voice |
| Session goals | "I just need to pass" or "I want to really get it" | Depth and how fast to push |
| Student vocabulary | Calls eigenvectors "the stretchy directions" | Reusing their words, then linking to course terms |
| Logistics | Exam 2026-10-15; studies 40 minutes at night | The plan |

The profile is learned mostly from behavior, not a questionnaire. What a student says they prefer is recorded as a weak prior and confirmed or overturned by what actually works.

### 6.6 Explanation memory

Every time the teacher explains something, the modeler records the kind (analogy, worked example, picture, derivation, story, contrast, real-world case), a one-line summary and an embedding. It then sets a `landed` score from what happened next on that concept.

Two uses:

1. **Never repeat a failed explanation.** The teacher sees "tried the water-tank analogy for this; it did not land."
2. **Transfer what works.** For a new concept, the nearest explanations that landed for *this* student suggest an approach, such as "picture-first worked well on the last two related concepts."

### 6.7 Cold start

The first session opens with a short conversation, not a form:

- what the class is
- when the exam is
- how they feel about it
- what they already find easy or hard

Then comes a **breadth sweep:** about ten quick adaptive questions, each chosen where uncertainty is highest and spread across topics. It is framed as "let me get a feel for where you are" and gives a usable map in about ten minutes.

## 7. Teaching model

The student never sees a level. Code decides *what* to work on next (scheduler); the teacher decides *how* (moves), aiming each move just above the current ability estimate. Progress feels like a conversation getting gradually harder and wider, not like passing gates.

### 7.1 Teaching moves

Moves are the teacher's vocabulary. Each has a typical difficulty offset relative to the concept's base difficulty, which the problem smith and the observed outcomes refine over time.

| Move | What it looks like | Offset |
| --- | --- | --- |
| Orient | Plain-language explanation in the student's terms, often with a picture | −2.0 |
| Check | Quick recall or recognition: "what does the determinant tell you about invertibility?" | −1.5 |
| Worked example | Teacher solves one, thinking aloud, student predicts the next step | −1.0 |
| Faded example | Half-solved problem; student finishes it | −0.5 |
| Solo problem | Standard problem, no scaffolding | 0.0 |
| Variation | Same idea, different surface: new numbers, wording, context or representation | +0.5 |
| Explain why | "Why does this step work?" or "what would break if...?" | +0.5 |
| Spot the error | A plausible wrong solution, often built from a known misconception | +0.75 |
| Combine | Needs this concept plus a linked one | +1.0 |
| Transfer | Unfamiliar context where the student must recognize the concept applies | +1.5 |
| Teach back | Student explains the idea as if to a classmate; the teacher asks naive questions | +1.5 |

### 7.2 Choosing the next move

- **Target zone.** Pick the move and difficulty where predicted success is about 70%. That is challenging but reachable. Use about 80% for a student whose profile shows frustration patterns, and about 60% when they are on a streak and enjoying it.
- **Moving right.** Two good outcomes in a row move one step harder, usually with a new surface or a new representation so it feels fresh, not repetitive.
- **Moving left.** A failure first gets a diagnosis question ("walk me through how you got there"), then a step back aimed at the specific gap. A misconception gets a direct contrast; a missing prerequisite gets a short detour.
- **Sideways.** If the student is stuck at the same difficulty, change representation (picture, numbers, story, analogy) rather than difficulty. Explanation memory (6.6) says which representation to try.
- **The teacher can override.** The ladder is advice. The teacher sees the estimate and the target and may decide that a story or a tangent is the right move now.

### 7.3 Goals the student sees

The Examiner's targets become **can-do statements** in the student's language, for example:

- "Find eigenvalues of a 3×3 matrix without help, in under 5 minutes"
- "Explain why diagonalization fails when eigenvectors are not independent"
- "Recognize a Markov chain problem when it is described in words"

Each goal is met when the effective ability on that concept reaches its target with low uncertainty. The UI shows goals and progress toward them, never a level number.

### 7.4 Scheduler (code, not a model)

The scheduler ranks concepts for the next focus:

```
priority_c = I_c · max(0, T_c − θ_eff_c) · R_c  +  β·σ_c  +  γ·due_c  −  δ·recent_c

I_c       importance (5.5)
T_c       exam target ability (5.6)
θ_eff_c   effective ability today, after forgetting (6.2)
R_c       prerequisites ready, 0 to 1
σ_c       uncertainty
due_c     how overdue for review
recent_c  how recently it was the focus
```

- **R** falls toward 0 when a prerequisite is far below its own target, so the scheduler fixes the foundation first.
- **β σ** (uncertainty) dominates early, which forces a breadth-first survey.
- **γ due** brings back fading concepts (6.2).
- **δ recent** stops the same concept from being picked twice in a row, which gives natural interleaving.

The teacher receives the top three candidates with a one-line reason each, picks one, and can ignore them when the student asks for something specific. **Student intent always wins** over the scheduler.

### 7.5 Session shape

A default session arc, which the teacher bends as needed:

1. **Warm-up (2 to 4 minutes).** One or two quick retrievals of due concepts from earlier sessions.
2. **Main focus (most of the session).** One or two concepts from the scheduler, moving along the move continuum.
3. **Interleave.** One older concept mixed in mid-session, preferably one linked to the focus.
4. **Connect.** One combine or transfer question tying today's concept to another.
5. **Close.** The student summarizes what they learned in a sentence or two (teach-back lite). The teacher names one thing to come back to. That becomes an open thread.

### 7.6 Putting separate concepts together

Synthesis across concepts is planned, not left to chance:

- **Bridge questions** come from edges: "How is a Markov chain's steady state related to an eigenvector?" These use `applies_in`, `generalizes` and `same_idea_different_notation`.
- **Contrast pairs** come from `contrasts_with` and `often_confused_with`, and from close-but-distinct embeddings: "When do you use a t-test instead of a z-test, and why does it matter?"
- **Concept tours.** Before a final, the teacher walks a path through the concept graph, asking the student to narrate how each idea leads to the next.
- **The board as a map.** For synthesis, the whiteboard shows a small piece of the concept graph, with the student filling in the links.
- **Mixed exam sets.** Near the exam, the problem smith builds unlabeled sets where the student must first recognize which concept applies. Recognizing the concept is a major part of exam skill, and topic-by-topic drill never trains it.

### 7.7 The study plan

The plan is the scheduler run forward to the exam date, using the student's available time and the forgetting model.

| Phase | Share of time | Focus |
| --- | --- | --- |
| Survey | First ~20% | Touch every concept at least once; close all blindspots |
| Build | Next ~45% | Depth on high-importance concepts; fix confirmed misconceptions |
| Mix | Next ~25% | Interleaved, combined and transfer work in exam formats |
| Final review | Last ~10% | Due concepts, weakest high-importance goals, one full timed practice |

The plan is recomputed after every session and shown as a short list of goals per day, not as a schedule of topics.

## 8. Conversation quality

The teacher should sound like a sharp, warm grad TA who knows this course and this student. That takes four things: reading what the student actually means, building on their thinking instead of replacing it, keeping the conversation from going stale, and explaining precisely in plain human language. Each has a mechanism in the data and a test in section 11.

### 8.1 Reading what the student wants

Every teacher turn returns a structured reading of the student's last turn alongside its reply. This replaces the six separate TypeSafe classifier calls.

| Dimension | Values (examples) |
| --- | --- |
| Act | answer attempt, question, request, thinking aloud, meta, social, off-topic |
| Request type | explain again, show me, let me try, skip, slow down, harder, quiz me, how am I doing |
| Target | which concept or item it is about, or "unclear" |
| Understanding signal | confident and right, confident and wrong, unsure and right, lost |
| Affect | engaged, tired, frustrated, anxious, bored, playful |
| Deadline or logistics | a new exam date, time available today |

The rules that make this human:

- **Act on the most likely reading.** Ask a short clarifying question only when two readings would lead to different actions. "Wait, which part?" is fine; a menu of options is not.
- **Read under the surface.** "Yeah I get it" right after visible confusion gets a light check ("cool, so what would happen if...?"), not acceptance. "Can we move on" is respected and logged: the concept stays on the scheduler's list.
- **Name what they want when it's different from the plan.** If the student wants to cram the night before, the teacher adapts to that goal instead of following the long-term plan.
- **Track the student's own words.** Terms, nicknames and pictures the student invents ("the stretchy direction" for an eigenvector) are stored in the profile as student vocabulary. The teacher reuses them, then connects them to the course term.

### 8.2 Building on the student's thinking

This is what "bouncing off understanding" means in practice:

- **Start from their attempt.** Find what is right in a wrong answer and build from there: "your first step is exactly right, the trouble starts when..." Do not discard it and give a model answer.
- **Ask before telling.** When the student is close, a question that lets them find the error teaches more than a correction. When they are lost, tell them clearly. Profile and affect decide which.
- **Extend partial ideas.** "You said it's like stretching. Push that further: what gets stretched, and by how much?"
- **Ask real questions.** Some questions have no single expected answer ("what do you think happens if the matrix isn't square?"). The teacher follows the answer wherever it goes, within the session goal.
- **Callbacks.** Refer to earlier moments, using explanation memory and open threads ("remember the climbing-rope tension problem? Same structure"). Continuity across sessions is what makes it feel like one relationship rather than many chats.
- **Keep promises.** Anything the teacher defers ("good question, let's come back to that") becomes an open thread. The context compiler surfaces open threads when they become relevant, or at the end of a session.

### 8.3 Keeping it fresh

Stale conversation has known causes. Each one has a countermeasure.

| Cause | Countermeasure |
| --- | --- |
| Same openers, praise and transitions | The compiler lists the teacher's last ~20 openers and feedback phrases with the instruction not to reuse them; the lint in 8.5 tracks repetition |
| Same rhythm every turn (explain, then ask) | Moves vary by design (7.1); turn length varies with pace; sometimes the student leads ("want to try one, or see one first?") |
| Same explanation again | Explanation memory blocks repeats of failed explanations |
| Re-explaining what they know | Ability estimates and the session summary tell the teacher what is already solid |
| Long monologues | Hard cap on spoken turn length (about 60 words in voice unless the student asked for a full explanation); the board carries detail |
| Drill with no point | Each focus is tied to a visible goal; connect moves show why ideas matter |
| No curiosity | Curiosity open threads let the teacher follow a student's interest when it links to the course; tangent budget is about 10% of session time |

### 8.4 Explaining with precision, like a person

The teacher's persona instructions carry these rules, together with **worked examples of good tutoring exchanges**. Examples shape style far more than rules do. Build a set of 20 to 30 short real-tutor-style exchanges across subjects and keep them in the cached prefix.

1. **Start from what they know.** Use prerequisite estimates and background from the profile.
2. **Concrete, then general, then the name.** Show a specific case, draw out the pattern, then give the official term and notation.
3. **One idea per turn.** Use one term at a time, define it once in plain words, then use it consistently in the course's notation.
4. **Prefer real examples to analogies.** A real case from the subject itself usually beats a metaphor.
5. **Analogies only when they hold.** An analogy must map every part that matters to something real, and the teacher says where it breaks ("this works until the matrix has repeated eigenvalues"). Draw analogies from the student's interests and background, not stock imagery.
6. **Numbers and specifics over adjectives.** Say "the error doubles when the step size doubles", not "the error grows significantly."
7. **Be honest about uncertainty.** "I'm not sure your notes define it that way, let me check" (then use `open_source`). Never bluff course-specific facts.
8. **Say plainly when an answer is wrong.** Kind, specific, no padding.
9. **Quote the material when it helps,** such as a definition the professor phrased carefully. Quoting is a tool, never a requirement.

**Voice-specific rules.**

- Spoken replies use short sentences, no lists or markdown, and math said aloud naturally ("x squared plus one"). Symbols go on the board.
- After an interruption, the teacher is told exactly how much of its reply was actually played (caption timing already tracks this). It never assumes the student heard the rest.

### 8.5 Banned patterns

These mark text as machine-written and erode trust. They are listed in the persona instructions with a rewritten example for each, checked by a deterministic lint after every turn, and scored in evaluation (11.4).

| Pattern | Example | Instead |
| --- | --- | --- |
| Contrast reveal | "It's not just a formula, it's a way of seeing" | State the claim directly |
| Reflex praise | "Great question!", "Absolutely!", "You're so close!" when they aren't | Specific acknowledgment, or none |
| Empty metaphor | "Eigenvectors are the DNA of a matrix" | A real example, or an analogy whose parts map (8.4 rule 5) |
| Stock vocabulary | delve, dive in, unpack, journey, landscape, tapestry, navigate, at its core, in the realm of | Plain verbs |
| Rule of three | "fast, flexible, and powerful" | Only the item that matters |
| Reflex recap | "To recap..." or "In summary..." every turn | Recap only at the end of a segment, by the student when possible |
| Reflex check | "Does that make sense?" | A question that tests understanding |
| Hedge filler | "It's important to note that..." | Say the thing |
| Echoing the question | "So you're asking about eigenvalues..." | Answer |
| Inflated emotion | "What a fantastic insight!" for a routine answer | Proportional response |
| Dash and colon theatrics | Chains of em dashes; "Here's the thing:" | Plain sentences |

**Enforcement.**

- Speech streams to the student, so the lint cannot block in voice mode.
- On a hit, the lint posts an inbox note for the next turn ("you used a contrast reveal; avoid") and logs a metric.
- Text mode can block and regenerate when a hit is severe.
- The pattern list grows from evaluation findings.

## 9. Context management and agents

The teacher never sees an ever-growing chat log. Every turn is a fresh request built by the context compiler from the store, with a stable cached prefix. A two-hour session therefore reads as clearly to the model as a two-minute one. Background agents work in their own context windows and reach the teacher only through the store and the inbox.

### 9.1 The context compiler

Plain code, run at the start of each turn. It reads a consistent snapshot of the store and fills fixed slots, in this order, so the stable part is cached by the provider:

| Slot | Budget (tokens) | Changes | Cached |
| --- | --- | --- | --- |
| Persona, teaching rules, banned patterns, 20 to 30 example exchanges | 4,000 | Never | Yes |
| Board schema (as a tool schema, not prose) | 800 | Never | Yes |
| Course outline: every concept as one line with goal progress | 1,500 | Per session | Yes |
| Learner profile and student vocabulary | 800 | Per session | Yes |
| Session goals and scheduler's top 3 candidates with reasons | 300 | Every few turns | No |
| Briefs for the focus concept and its 1 to 3 neighbors (selected fields) | 2,000 to 4,000 | When focus shifts | No |
| Misconceptions and explanation memory for the focus | 400 | When focus shifts | No |
| Open threads relevant now | 200 | Every few turns | No |
| Session summary of older turns | 800 | Every ~10 turns | No |
| Last ~8 turns verbatim, with how much of the last reply was heard | 3,000 | Every turn | No |
| Recently used openers and feedback phrases | 150 | Every turn | No |
| Inbox notes (at most 3, by priority) | 500 | Every turn | No |

The total is about 15,000 tokens, of which about 7,000 are cached. Brief fields are chosen by move: an orient move gets `plain`, `intuition` and `examples`; a spot-the-error move gets `mistakes` and `boundaries`.

### 9.2 Agents

| Agent | Model | When it runs | Reads | Writes |
| --- | --- | --- | --- | --- |
| Teacher | Largest | Every student turn, streaming | Compiled view | Reply, board, intent reading, tool calls |
| Librarian | Largest | Material added or changed | Chunks | Concepts, briefs, edges |
| Brief checker | Large | After each brief | Brief and its chunks | Claim labels, fixes |
| Coverage auditor | Small, escalating to large | After each Librarian run | Chunk and brief embeddings | Coverage status, gap decisions |
| Examiner | Largest | Exams or problem sets added | Exam items, concepts | Exam targets, item analysis |
| Problem smith | Largest | Teacher calls `pose_problem`, or prefetch | Brief, exam target, misconceptions, profile | Items with solution and rubric |
| Learner modeler | Large | Every ~3 turns and at session end | Recent turns, items, current estimates | Observations, misconceptions, profile, explanation scores, inbox notes |
| Fact-checker | Small, escalating to large | After each teacher turn | The reply and relevant chunks | Inbox correction if a course claim is contradicted |
| Summarizer | Small | Every ~10 turns | Older turns | Session summary |
| Style lint | Code, not a model | After each teacher turn | The reply | Inbox note, metric |

Eight model-backed agents and one code check. The voice path never waits on any of them.

### 9.3 Teacher tools

- `open_source(query or concept)` searches chunks by embedding similarity and returns passages. Used when the teacher wants exact wording or is unsure of a course-specific detail.
- `pose_problem(concepts, move, difficulty, flavor)` asks the problem smith for a fresh item. It returns a prefetched item at once if one matches.
- `board(blocks)` draws on the whiteboard using the existing block schema.
- `note(kind, text)` records a promise, curiosity or observation; it becomes an open thread or a modeler hint.
- `set_focus(concept)` tells the compiler to switch the brief slot, for example when the student changes topic.

### 9.4 The inbox

The inbox is how separate threads of work merge without interrupting the conversation:

- Notes have a priority, a source agent and an expiry measured in turns.
- The compiler includes at most three per turn: corrections first, then confirmed misconceptions, then everything else.
- A note is marked consumed once shown. The fact-checker re-posts a correction if the teacher has not acted on it within two turns.
- **Note style is instruction plus reason,** for example: "You said the eigenvalues of a triangular matrix are its row sums. They are the diagonal entries (Lecture 6, p. 3). Correct it in passing; the student did not react to it."

### 9.5 Latency with a large teacher

- **Streaming.** Speech starts on the first sentence, as it does today.
- **Prefetch.** While the student is answering, the problem smith prepares the follow-up for each likely outcome (right, partly right, wrong), using the current item and known misconceptions. The teacher's next turn usually finds its item ready.
- **Bridge phrase.** If the teacher has produced no text 1.5 seconds after the student stops, a small model says a short, natural, context-appropriate filler. It is drawn from the freshness list so it is never the same phrase twice.
- **Caching.** The stable prefix in 9.1 cuts time to first token as well as cost.
- **Nothing serial.** Intent reading is part of the teacher's own output, so the 850 ms classifier wait disappears from the critical path.

### 9.6 Failure behavior

Every background agent can fail without stopping the session:

- **No modeler run:** the estimates are a few turns stale.
- **No fact-check:** an error might go uncorrected. It is logged for evaluation.
- **No problem smith:** the teacher writes its own problem, marked unverified. The modeler then gives the result lower weight.
- **Teacher failure:** the only failure the student sees. Retry once, then say so plainly and offer text mode.

### 9.7 Configuration

Four model settings replace the current 22 environment variables' model and transport switches:

- `LUNA_MODEL_LARGE`
- `LUNA_MODEL_SMALL`
- `LUNA_MODEL_EMBED`
- `LUNA_VOICE`: ElevenLabs or provider realtime

The provider key goes in its own variable.

## 10. Interface and mosaic

The mosaic becomes the concept map, and voice becomes one way among several to talk to the same teacher. The student can always see what Luna knows about the course, what it thinks about them, and what is next.

### 10.1 Views

| View | What the student sees | What they can do |
| --- | --- | --- |
| Course board | Test cards with the course mosaic and progress toward goals | Create a test, open one |
| Study (default) | The concept mosaic, the teacher (voice orb plus text), the whiteboard, today's goals | Talk or type, add material, ask for a hint, switch focus by tapping a concept |
| Map | The concept graph: topics, concepts, links, coverage, blindspots | Open a concept's brief; mark importance ("prof said this is on the exam"); start a session on it |
| Plan | Days to the exam with goals per day, recomputed after each session | Change available time or exam date; see why a goal is scheduled |
| Practice | Past items with the student's answers and feedback; a button for a fresh mixed set | Redo an item; export a set as PDF |
| Library | Sources with role, coverage percentage and extracted text | Change role, remove, retry, see which concepts each source feeds |
| Transcript | The full conversation with boards inline, per session | Search, revisit a board, export |

### 10.2 Text and voice together

- **One session engine, two inputs.** A text box is always present. Typing and speaking feed the same session, so a student can type an equation mid-conversation.
- **Microphone on request.** The mic starts when the student taps the orb, not when a test opens.
- **Visible transcript.** The student's own words are shown, not discarded. Captions keep a short scrollback.
- **Board history.** Each problem's board is kept and can be reopened from the transcript.

### 10.3 The mosaic as the concept map

The existing stone renderer (`src/mosaic-stage.mjs`, `src/VoiceCanvas.jsx`) stays. Its data bindings change:

| Visual | Bound to |
| --- | --- |
| A cluster of stones | One concept; clusters group by topic |
| Cluster size | Importance |
| How settled and polished the stones look | Effective ability relative to the goal |
| Shimmer or looseness | Uncertainty (untouched concepts look unsettled) |
| Rough, dark stones | Blindspots: uncovered chunks or concepts not yet started |
| Lines between clusters | Edges; lit when the teacher is connecting two ideas |
| The cluster near the voice orb | The current focus; it drifts toward the orb when focus shifts |
| Stones fading slowly | Forgetting: concepts coming due |

**Intake becomes real.**

- When a file is dropped, stones fly in as today. They then settle into clusters as the Librarian actually extracts concepts.
- The flight and settling are driven by indexing progress events: chunks embedded, concepts extracted, briefs written, coverage checked.
- The student watches their material turn into a map, and any rough stones left over are the blindspots.

**Session shape on the mosaic.** During a session, the stones touched by the conversation brighten. At the end, the map shows what moved today. That gives the student a sense of progress without a single score.

### 10.4 Remove or change

- **Remove** the fake Google account control until real accounts exist.
- **Remove** developer-facing error text. Errors say what the student can do ("voice is unavailable right now, you can keep going by typing").
- **Change** adding material so it no longer wipes the board, guide and progress. Incremental indexing (5.7) and lineage keys (section 4) make that unnecessary.
- **Allow editing** of the exam date and difficulty after creation.

## 11. Evaluation

Success is measured on five levels: the knowledge is complete and correct, the learner model is accurate, the conversation is good, students actually learn, and it runs fast and affordably. Each level has fixed test sets and targets, and every change runs the suite before it ships.

### 11.1 Test material

- **Gold courses.** Three real courses with different shapes, for example a math-heavy course, a reading-heavy course and a mixed science course. Each needs its full materials and at least one past exam. For each course, hand-write a concept list (about 40 to 120 concepts), using the syllabus objectives and textbook index as a starting point. This takes a few hours per course and is the most valuable asset in the project.
- **Planted-content sources.** Copies of the gold materials with three kinds of changes inserted:
    - a distinctive but minor fact in an obscure section (blindspot canary)
    - the same idea under two different names in two sources
    - a notation conflict between sources
- **Simulated students.** Persona cards that a model role-plays: background, interests, true ability per concept, specific planted misconceptions, emotional patterns, and how they talk. Start with 12 personas, including a confident-but-wrong student, an anxious student, a terse student, a curious tangent-chaser, and a crammer the night before.
- **Utterance set.** About 200 real or realistic student turns, each labeled with what the student actually wanted. Include ambiguous, sarcastic, tired and off-topic ones.
- **Held-out exam items.** For each gold course, a set of exam-style items never used during study, for measuring learning.

### 11.2 Knowledge layer tests

- **Concept recall:** share of gold concepts found by the Librarian.
- **Coverage:** share of content characters in covered chunks.
- **Canary detection:** every planted fact appears in a brief and can produce a question.
- **Brief precision:** share of brief claims labeled unsupported or contradicted, audited by a human on a 100-claim sample.
- **Duplicate and notation handling:** planted duplicates are merged or linked; notation conflicts are flagged in `conflicts`.
- **Edge accuracy:** a human judges 50 sampled edges.
- **Importance validity:** hide the real exam, compute importance from everything else, and measure how many concepts on the exam fall in the top third by importance.

### 11.3 Learner model tests

- **Estimation accuracy (simulated):** run the estimator and scheduler against simulated students whose true ability is known. Measure the error between estimated and true ability after 10, 30 and 60 observations.
- **Calibration (real):** group predictions by predicted success (50 to 60%, 60 to 70%, and so on) and compare with actual success. Report the Brier score.
- **Misconception detection:** share of planted misconceptions the modeler confirms, and median turns to detection.
- **Profile recovery:** share of persona traits (representation preference, pace, calibration) the profile captures after two sessions.
- **Scheduler outcomes (simulated):** days until every concept has been touched; share of goals met by exam day under a fixed time budget, compared with a random-order baseline and a topic-order baseline.
- **Replay:** any change to the estimator is run over all stored real observations before it ships, and the predictions are compared.

### 11.4 Conversation quality tests

**Automatic metrics** (on every simulated-student transcript):

- banned-pattern hits per 100 teacher turns
- repetition: share of teacher openers and feedback phrases reused within a session
- student talk share: student words as a share of all words
- turn length: median and 90th percentile of spoken teacher turns
- question depth: share of teacher questions that need reasoning, not yes, no or recall (judged by a small model)
- intent accuracy: the teacher's structured reading against the labeled utterance set
- course-fact error rate: contradicted course claims per 100 turns, from the fact-checker plus a human audit

**Pairwise judging.** For any change to the teacher, run the same simulated sessions on the old and new versions. A judge model compares transcript pairs on these dimensions:

1. Builds on the student's thinking
2. Explains precisely and concretely
3. Sounds like a skilled human tutor
4. Analogies are valid and fit this student
5. Reads what the student wanted
6. Difficulty feels right
7. Feels fresh, not repetitive

Pairwise comparison is far more reliable than absolute scores. Before relying on the judge, check it against your own blind ratings on 50 pairs; require at least 75% agreement.

**Human ratings.** Every two weeks, the builder and two or three classmates read 10 blind transcripts. Some are from real human tutors, if any are available. They rate naturalness and usefulness and answer "would you have guessed this was AI, and why?" The "why" answers feed the banned-pattern list.

### 11.5 Learning outcomes

This is the metric that matters. Everything above serves it.

- **Pre and post test:** held-out exam items before and after a study block. Report the gain per hour of study.
- **Baseline comparison:** the same students study comparable material with notes alone, or with the current prototype. Report the difference in gain.
- **Retention:** retest a subset of items 7 days later.
- **Readiness calibration:** compare predicted goal completion with the actual exam result, when students share it.
- **Engagement:** sessions per week, sessions the student started without a reminder, median session length, and the turn where sessions get abandoned.

### 11.6 Operations

- **Speed:** time from end of student speech to first audio, median and 90th percentile; time from file drop to a first usable map.
- **Cost:** per session-hour and per indexed course.
- **Reliability:** failure rate per agent.

### 11.7 Scorecard

| Metric | Target | Measured on | Cadence |
| --- | --- | --- | --- |
| Concept recall | ≥ 95% | Gold courses | Every indexing change |
| Coverage | ≥ 98% | Gold courses | Every indexing change |
| Canary detection | 100% | Planted sources | Every indexing change |
| Brief claims unsupported or contradicted | ≤ 1% (contradicted: 0) | 100-claim audit | Every indexing change |
| Exam concepts in top third by importance | ≥ 70% | Held-out exams | Monthly |
| Ability estimate error after 30 observations | ≤ 0.5 logits | Simulated students | Every learner-model change |
| Calibration (Brier score) | ≤ 0.20 | Real observations | Weekly |
| Planted misconceptions confirmed | ≥ 80% within 15 turns | Simulated students | Every teacher or modeler change |
| Banned-pattern hits | < 1 per 100 turns | Simulated sessions | Every teacher change |
| Phrase reuse within a session | < 10% | Simulated sessions | Every teacher change |
| Student talk share | ≥ 40% | Simulated and real sessions | Weekly |
| Intent accuracy | ≥ 90% | Labeled utterance set | Every teacher change |
| Course-fact errors | < 0.5 per 100 turns | Fact-checker plus audit | Weekly |
| Pairwise win rate of a new teacher version | > 55% to ship | Simulated sessions | Every teacher change |
| Learning gain versus notes alone | Positive and growing | Pre and post tests | Per study cohort |
| 7-day retention | ≥ 70% of post-test | Retests | Per study cohort |
| Time to first audio | median ≤ 1.5 s, 90th percentile ≤ 2.5 s | Live sessions | Weekly |
| Cost per session-hour | Track; set a ceiling after phase 3 | Usage ledger | Weekly |

The targets are starting points. Tighten them as the baselines come in. Results are stored next to the existing `benchmarks/` folder so every change has a before and after.

## 12. Migration from current code

Keep the transport and rendering pieces that work, replace the learning core, and delete about a third of `server/`. The new server is organized around the store, not around the voice socket.

**Target layout**

```text
server/
  store.mjs          SQLite schema, queries, vector search (cosine loop)
  ingest.mjs         roles, structure-aware chunking, embeddings
  librarian.mjs      extract, merge, structure, brief writing, brief checking
  coverage.mjs       auditor and coverage metrics
  examiner.mjs       exam item analysis and targets
  learner.mjs        ability updates, forgetting, misconceptions, profile, explanation memory
  scheduler.mjs      priority, session candidates, study plan
  smith.mjs          problem generation, verification, prefetch
  compiler.mjs       context slots and budgets
  teacher.mjs        teacher call, tools, structured output, style lint
  agents.mjs         background job queue, inbox
  session.mjs        one session engine for text and voice
  voice.mjs          speech-to-text and text-to-speech adapters, playback tracking
  api.mjs            HTTP routes
  index.mjs          server entry
```

| Today | Action | Into |
| --- | --- | --- |
| `openai-luna.mjs` tool loop, streaming, usage reporting | Keep, slim down | `teacher.mjs` |
| `shared/board-parts.mjs`, `whiteboard.mjs`, `tutor-output.mjs` | Keep; turn the 5.5 KB prose rules into a tool schema | `teacher.mjs` |
| `speech-stream.mjs`, the ElevenLabs parts of `live-voice.mjs`, caption timing | Keep | `voice.mjs` |
| `usage-ledger.mjs`, `usage-pricing.mjs`, `diagnostics.mjs` | Keep; move storage to SQLite | `store.mjs` |
| `material-images.mjs`, `material-image-api.mjs` | Keep | `ingest.mjs` |
| `indexing.mjs`, `index-citations.mjs`, the organize code in `api.mjs`, `codex.mjs` | Replace | `librarian.mjs`, `coverage.mjs` |
| `material-retrieval.mjs` | Replace with embedding search | `store.mjs`, the `open_source` tool |
| `question-bank.mjs`, `question-identity.mjs` | Replace | `smith.mjs` |
| `mastery.mjs`, `grade-citations.mjs`, `practice-trail.mjs`, `hint-policy.mjs` | Replace | `learner.mjs`, `scheduler.mjs`; hints become an ordinary teacher request |
| `tutor-context.mjs`, `luna-fast.mjs`, `tutor-turn-task.mjs` | Replace | `compiler.mjs`, `teacher.mjs` |
| `session-history.mjs`, `onboarding.mjs`, `tutor-session-timing.mjs` | Replace | `session.mjs`, `learner.mjs` |
| `live-voice.mjs` (1,263 lines) | Split, then delete | `session.mjs`, `voice.mjs` |
| `jev.mjs`, `jev-intent.mjs`, `jev-tutor-intent.mjs`, `jev-course.mjs`, `board-routing-context.mjs` | Delete; the teacher's structured output covers intent and board decisions; course artwork classification uses the small model | none |
| `learning-trace.mjs`, the planner, the `exec` voice transport, `canvas-select`, unused server messages, `buildDemoGuide` | Delete | none |
| `gpt-live-transport.mjs` | Delete unless the voice comparison favors it; keep `voice-lab/` as a separate experiment | none |
| `benchmarks/baselines/` copies of old server code | Archive outside the repo | none |

**Front end.**

- **Keep** the mosaic renderer, course mosaics, whiteboard renderer, captions and Library.
- **Replace** IndexedDB state with server reads, keeping a browser cache only for offline viewing.
- **Add** the text input, Map, Plan, Practice and Transcript views.

**Tests.**

- **Keep** tests for the parts that stay.
- **Delete** tests for deleted modules along with the modules.
- **Add** the evaluation suite from section 11 as `evals/`, separate from unit tests because it calls live models.

**Data.** Existing IndexedDB tests and `data/*.json` can be imported once into SQLite: materials, mastery as initial observations, and session history. Mastery has no concept-level detail, so it becomes a weak prior per topic rather than ability estimates.

## 13. Build phases

Each phase ends at a gate defined by section 11 metrics, not by a date. The knowledge layer comes first because every later phase inherits its quality. Text mode comes before voice so teaching quality can be judged without latency noise.

| Phase | Build | Gate to move on |
| --- | --- | --- |
| 0. Foundation | `store.mjs`, `ingest.mjs` with roles, chunking and embeddings; pick 3 gold courses and write their concept lists; `evals/` harness skeleton | Gold sets exist; all 3 courses ingested with embeddings |
| 1. Knowledge | Librarian, brief checker, coverage auditor, Examiner; read-only Map view and blindspot list | Concept recall ≥ 95%, coverage ≥ 98%, canaries 100%, 0 contradicted claims; you read 20 briefs and would teach from them |
| 2. Learner and scheduler | `learner.mjs`, `scheduler.mjs`, simulated-student harness, Plan view | Estimate error ≤ 0.5 logits after 30 observations; scheduler beats both baselines on goals met |
| 3. Teacher in text | Compiler, teacher, learner modeler, summarizer, style lint, problem smith (no prefetch); Study view with text input, Practice and Transcript views | Intent ≥ 90%; banned patterns < 1 per 100 turns; misconceptions ≥ 80% within 15 turns; new teacher beats the current prototype pairwise > 55% |
| 4. Voice and live helpers | `voice.mjs`, `session.mjs` voice path, prefetch, bridge phrase, fact-checker | Time to first audio median ≤ 1.5 s, 90th percentile ≤ 2.5 s; course-fact errors < 0.5 per 100 turns |
| 5. Mosaic and cleanup | Mosaic bound to the map (10.3); deletions from section 12; data import; first learning study | Old modules gone; pre and post test shows a positive gain versus notes alone |

**Rules for the whole build**

- Every phase leaves the app runnable. The old voice tutor stays available until phase 4 replaces it.
- No agent ships without its metric in the suite.
- Prompts live in their own files under `server/prompts/`, versioned, so pairwise comparisons can name exactly what changed.
- The first concrete step is phase 0 on one real course folder, because brief quality decides whether everything after it works.

## 14. Risks and open questions

The biggest risk is brief quality. Everything downstream inherits it, which is why phase 1 ends with a human review gate.

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Briefs read like slide summaries, not teaching notes | The teacher's explanations will be flat | Example briefs written by hand for 5 concepts as a style target; pairwise judging of brief versions |
| Large-model latency in voice | Pauses kill the feeling of a conversation | Prefetch, caching, bridge phrase; measure; fall back to a faster model for the teacher only if the median exceeds 1.5 s after tuning |
| Cost of a large model every turn | Long sessions get expensive | Caching about half of each prompt; small models for background checks; track cost per session-hour from day one |
| The ability scale is mis-set at first | Difficulty feels wrong in early sessions | Breadth sweep at cold start; high initial uncertainty so early evidence moves estimates quickly; replay tests |
| Simulated students are too easy or too polite | Evals overstate quality | Personas with real quirks; mix in real transcripts; human ratings as the final check |
| Judge model shares the teacher's blind spots | Pairwise wins that humans would not agree with | Check judge against human ratings; use a different model family as judge when possible |
| Fact-checker misses errors or over-flags | Wrong content stays, or the teacher gets noisy corrections | Human audit sample weekly; tune escalation threshold |
| Profile feels invasive | Students may dislike being modeled | Profile visible and editable in a settings panel; plain-language explanation of what is stored |
| Scope creep from eight agents | The rebuild never finishes | Strict phase gates; each agent ships only when its metric is in place |

**Open questions**

- Which large model is the teacher? Run the section 11.4 pairwise suite across two or three candidates before committing, and include latency.
- Keep ElevenLabs for voice, or use a provider's realtime voice? The existing `voice-lab/` comparison is the place to decide.
- One student or many? Single-user local first is assumed. Accounts and hosting change the store (Postgres with a vector extension) and add authentication; defer until learning gains are shown.
- Which three gold courses, and who writes their concept lists?
- Should students see their misconceptions and ability estimates directly, or only goals? Proposal: goals by default, details on request.
