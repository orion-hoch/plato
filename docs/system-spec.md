# Plato: a general system for learning and teaching

Design of record, written 8 Oct 2026. It replaces `docs/history/teacher-architecture.md` and the earlier draft of this file.

> **Status against the code (checked 11 Oct 2026).** Most of this design is built: the course model (§7, `backend/understanding/study.mjs`), repair by kind (§8, `director/policy.mjs`), the verifier chain (§9), the θ/σ learner (§10, `learner/v2.mjs`), arcs and the move policy (§12–13), card v2 (§15, `shared/cards.mjs`) and the element registry (§15b). Where the code differs:
> - **Session flow (§10, §11, §13).** The learner's decisions of 10 Oct replace the cold start and need-based picking. The intro is a greeting and at most 2 questions, with no diagnostic block. A normal session walks the course in lecture order from where the learner is. Ranking by need applies only to a topic the learner picks, to review and to exam practice. A section teaches first. A test comes only once predicted success reaches 0.7 (`READY`, `policy.mjs`). There is no study schedule.
> - **Adapters and verifiers (§9).** A1–A5 exist (`understanding/adapters.mjs`). V3 is real symbolic algebra: mathjs in a worker thread proves equality, then seeded numeric identity tests decide; it reads plain, spoken and LaTeX notation. V9's panel is a model panel, not human experts: five stances per adapter, one call each, a verdict only on a consensus of at least 80%, at trust 0.6–0.7. V10 checks production (target forms, grammar, vocabulary, register, the task) in typed or written text. No audio reaches the backend, so there is no pronunciation scoring. The page sends no recognizer confidence, so on a transcript only content findings are verdicts, and form findings become "say it again, or type it". Only the js, c and riscv runners execute. Judge calibration (§9's gold set) is unconfirmed, and V9 and V10 are uncalibrated.
> - **Learner model (§10).** Item difficulty comes from level and family; it is not learned. There are no hierarchical priors. "Learning from learners" (§7 stage 12) stops at candidate wrong models (`cand:`): there is no KC split or merge and no repair ranking.
> - **Element registry (§15b).** It is a flat module per kind (validate, init, step, passes, …), not `engine: {…}`. `stepper` is `trace.mjs`, and `figure` and `scene3d` are extra kinds.
> - **Page (§18b).** Answers can be given on choice, order and pair tiles (`src/inputs/AnswerInput.jsx`), besides speech, typing and ink.
> - **Runtime (§16).** Model roles and lanes are in `server/runtime.mjs`. See the README's Models section.
> - **Evaluation and plan (§17–18).** There is no held-out law fixture. Phases P1–P5 and much of P7 are built.

Plato must teach **any** course, for **any** learner. Nothing in the core may depend on one subject. Each subject enters through exactly two doors:
- the **course model**, which Plato builds automatically from the course's own materials;
- a **domain adapter**, which says how answers are checked and what can be drawn.

Evidence comes from the briefs in `docs/research/`, cited as:
- [Understanding]: `deep-understanding.md`
- [Tutoring]: `tutoring-evidence.md`
- [Personalization]: `personalization.md`
- [Decomposition]: `course-decomposition.md`
- [Voice]: `voice-and-multimedia.md`
- [Interactive]: `interactive-learning.md`
- [Generality]: `domain-generality.md`
- [Reading]: `reading.md`

---

## What it's like

A learner opens a course: any course, built from whatever they dropped in (notes, slides, a textbook, problem sets, past exams). Plato has already studied it: what matters, how the ideas work, where people go wrong, and how the course tests understanding.
- **The first session** is a short conversation about goals and background, then a handful of questions chosen to find out quickly what they already understand. Their map of the course fills in.
- **Each session has a stated goal,** chosen by need: "Today: why demand curves slope down. Everything about markets rests on it, and two of your answers suggest it's shaky."
- **What happens next depends on what they think.** A prediction to commit to. Or a two-minute reading from their own textbook, with a question to read for, while Plato stays quiet. Or a worked example to study, a simulation to run, two cases to compare.
- **Wrong answers are diagnosed, not just marked:** "walk me through that". The repair fits the kind of error: a case where their model breaks, a short refutation reading, or a classmate to convince.
- **What gets credit** is what they can do later, unaided, on problems they haven't seen.

The same engine teaches a proof, a trace of machine code, a primary-source argument or a diagnosis. Only the course model and the answer-checking adapter differ.

---

## Part I. A working theory of learning and teaching

The rest of the system is derived from six primitives: knowledge, learner state, evidence, moves, policy, invariants. Every component in Part II implements one of them.

### 1. Knowledge: what is learned

Every course, in every subject, is built from **knowledge components (KCs)**. There are four kinds of content, plus two meta-kinds [Decomposition §3; Generality §6.1]. The kind decides how a KC is learned and how it is shown to be learned.

| Kind | What it is | Examples across subjects | How it is learned | How it is evidenced |
|---|---|---|---|---|
| **Fact** | A stated association: a term, a convention, a constant, notation | Register names; Avogadro's number; the date of a treaty; a word's meaning | Encoding with meaning, then retrieval spaced over time | Unaided recall under varied cues, after a delay |
| **Concept** | A category with boundaries | A stack frame; a monopoly; an ionic bond; a tort; a fallacy | Varied examples, near-miss non-examples, contrasting cases, mixed practice [Understanding §6] | Classifying new instances, including near misses |
| **Procedure** | A multi-step skill | Converting bases; integrating by parts; balancing an equation; conjugating a verb | Worked examples with named subgoals, faded to practice, with step-level feedback; assembly tasks (Parsons, proof blocks) [Understanding §3; Tutoring §1.2] | Correct steps on new instances, then speed |
| **Principle** | A causal or structural explanation that makes predictions | Why two's complement addition works; Newton's laws; natural selection; comparative advantage | The learner's model drawn out, used to predict, confronted with evidence, rebuilt, then self-explained; several analogies, each with where it breaks [Understanding §1–2] | Predicting new cases, explaining why, finding errors, transfer |
| **Strategy** (meta) | Knowing *which* procedure or principle to use, and monitoring progress | Choosing a proof method; planning an essay; differential diagnosis; a debugging strategy | Modelling with a think-aloud, a named strategy, prompted self-monitoring, faded scaffolds | Only on *unfamiliar* problems |
| **Epistemic practice** (meta) | How claims are justified in this field | Proof standards; sourcing and corroboration; evaluating a model; precedent and distinction; close reading with textual evidence | Explicit heuristics practised on document or case sets; argument maps with feedback; asking for the counterargument | Critique, perspective and argument on new material |

Above single KCs, five structures matter in every subject:

- **Runnable models.** A cluster of principles the learner must be able to *run* in their head: a state, plus rules for how it changes. They come in five forms:
  1. machines (a CPU, an algorithm, a circuit);
  2. physical and causal models (forces, supply and demand, a metabolic pathway);
  3. formal structures (definitions and their consequences, a proof's dependency graph);
  4. scripts (a medical illness script; a legal rule with its elements and exceptions; a genre's structure);
  5. interpretive frames (a theoretical lens, a historical context). These generate questions and expectations, not unique predictions.

  Understanding a subject largely means running its models correctly [Decomposition §6.1; Generality §6.1].
- **Cases.** A library of instances (worked problems, patients, precedents, documents, texts, designs), each tagged with the concepts it shows and linked to others as analogous, distinguishable or contrasting. In open-ended fields, cases carry knowledge that rules can't [Generality §1.3].
- **Representations.** Notations and visual forms. Translating between them is a skill in its own right.
- **Integration.** Combining KCs; *discrimination* (knowing which applies) [Understanding §4]; and multiple perspectives (the same case through two frames).
- **The spine.** A few enduring understandings, each a full sentence that could be wrong. Some are **threshold concepts**: troublesome, transformative and integrative [Understanding §8; Decomposition §5].

**Every item declares its correctness regime.** Structure belongs to individual tasks, not to subjects: a history course has one-answer dates and arguable essays, and a systems course has exact traces and "why" answers [Generality §1.1]. **The regime, not the subject, decides how an answer is checked.**

| Regime | Meaning | Examples | Checked by |
|---|---|---|---|
| **R1 Unique** | One right answer | A number, a date, a register value | Exact, or numeric with tolerance |
| **R2 Equivalent forms** | Many forms, one meaning | Algebraic expressions; any valid order of proof lines; any program that passes the tests | Symbolic algebra, execution, dependency graphs |
| **R3 Constraints** | Any answer that meets the requirements | A circuit design; a database schema; an answer that covers every element of a legal rule | Constraint checks |
| **R4 Defensible range** | Judged by the discipline's criteria; several strong answers exist | Interpretations; historical arguments | Facts and sources checked first, then a calibrated rubric |
| **R5 Expert disagreement** | Judgement where experts legitimately differ | How a close legal case comes out; how likely a diagnosis is | Comparison with a distribution of expert answers |

### 2. Learner state: what the tutor must know

For each KC and spine idea, the tutor holds a belief about six things:

| Dimension | Meaning | Why it matters |
|---|---|---|
| **Strength** θ, with uncertainty σ | How likely the learner is to succeed at a given difficulty | Pitches the next item; sets explain-first versus try-first |
| **Operative model** | Which model the learner actually runs: the correct one, a specific wrong one, or fragments | Decides diagnosis and repair |
| **Fluency** | Speed and automaticity | Frees working memory for higher-level thinking |
| **Flexibility** | Which representations and contexts they've succeeded in | Transfer |
| **Durability** | A forgetting half-life | When to bring it back |
| **Calibration** | Confidence against accuracy | When to trust what they say about themselves (rarely) |

At the learner level, the tutor also tracks:
- learning rate;
- background;
- **what works for this learner**: the measured effect of each kind of move and representation;
- affect pattern;
- self-efficacy;
- goals;
- help-seeking.

These are the only legitimate meanings of "how this person learns best". Learning styles are not among them [Personalization §1].

### 3. Evidence: how the tutor observes

The learner's understanding is hidden. All the tutor sees is what the learner produces: answers and their steps, explanations, predictions, drawings, code, questions, hesitations, requests.

**Evidence is ranked by what it can prove:**
1. unaided, new surface, after a delay;
2. unaided, new, immediate;
3. unaided, familiar;
4. with help;
5. self-report, which proves essentially nothing [Personalization §2.4].

**Interpretation is the hard part.** Each observation is read against the course model:
- which KCs it bears on;
- which model produced it (the correct one, or which wrong one);
- at which step it went wrong.

A language model labels; code keeps score [Personalization §3]. Verdicts are checked by the item's verifier before they're believed or spoken.

**Ten families of performance show understanding in every subject** [Generality §6.2]. Each subject names them its own way (a trace, a proof check, a source critique, a differential diagnosis). The engine reasons only about the families.

| E1 Recall | E2 Discriminate | E3 Execute | E4 Predict | E5 Explain or justify |
|---|---|---|---|---|
| **E6 Evaluate or critique** | **E7 Transfer or integrate** | **E8 Generate or compose** | **E9 Perspective** | **E10 Calibration** |

Four rules hold in every subject:
1. **An item counts as evidence only if** someone without the knowledge would probably fail it. For diagnosis, each wrong model must predict a different answer.
2. **Weight = diagnosticity × independence × conditions.** The conditions are: unaided, delayed, new surface.
3. **Strategies and epistemic practices show only on unfamiliar material** (E6–E9).
4. **Delayed evidence can reverse immediate evidence.** Structured reflection did worse at once and better a week later. So a move is judged by delayed transfer per unit of the learner's time, never by success within the session.

### 4. Moves: what the tutor can do

Ten families of move, each with its mechanism and when it is right [Tutoring §4; Understanding §12]:

| Family | Mechanism | Right when |
|---|---|---|
| **Probe** (request an attempt, open probe, separating question, confidence check) | Gains information about the hidden state | The operative model is uncertain; before any help |
| **Elicit** (predict, explain why, compare, generate, teach back) | Generative processing: the learner builds the knowledge (ICAP) | After a reading, an explanation or a demonstration. A reading turn's demand is its purpose; questions are never a reflex. |
| **Read** (a portion of the course's own materials, or a short explainer Plato writes, at the learner's own pace, with a purpose) | Sustained, self-paced processing; time for ideas to sink in; well-matched reading teaches about as well as tutorial dialogue [Tutoring §1.3] | First contact with material at the learner's level; after an attempt, to read the full explanation; consolidation; notation and conventions; whenever the learner wants to study quietly [Reading] |
| **Present** (worked example, explanation, analogy with an explicit mapping, a demonstration on the runnable model) | Supplies a better model, or lowers cognitive load | Low prior knowledge; or right after a struggle ("a time for telling") |
| **Repair** (run their model to a checkable contradiction; refutation; teach a new frame) | Conceptual change | A wrong model has been diagnosed. The repair depends on the kind of error (§8). |
| **Scaffold** (help ladder H0–H4, contingent) | Keeps the struggle productive while the learner keeps agency | Stuck; one level per failure, back down after success |
| **Feedback** (verify, locate, elaborate) | Error correction | After a verified verdict |
| **Practice** (retrieval, spaced, interleaved, varied, integrative) | Durability, discrimination, transfer | Consolidation; due items; confusable pairs |
| **Metacognitive** (confidence calibration, summaries, choosing strategies) | Self-regulation | Regularly, sparingly; whenever the learner says "I get it" |
| **Affect and agency** (bounded choice, encouragement by attribution, a change of pace) | Motivation | Frustration, boredom, pushback |

### 5. Policy: how the tutor decides

Teaching is **control of a hidden state under uncertainty**. The state is the learner's understanding. Observations are noisy. Moves change the state with uncertain effects. The objective is durable, transferable, unaided competence on the course's targets, per unit of the learner's time and effort.

**The learning-dynamics model** is the system's central object. For a learner L, a KC k of kind κ, a state s and a move m, it holds an expected gain Δ(m | κ, s, L) and a cost c(m) (time, load, affect).
- **Priors come from research.** For example:
  - worked examples gain a lot for low-θ procedures and lose for high θ (expertise reversal);
  - trying first gains for principles at moderate gaps, provided the explanation follows;
  - refutation works on false beliefs;
  - running the learner's model to a contradiction, then offering a better one, works on flawed models;
  - spaced retrieval buys durability; interleaving buys discrimination.
- **Posteriors are learned:** per learner (that's personalization) and across learners (that's how the system improves).
- **One prior serves every subject.** Learning per practice opportunity is strikingly similar across math, science and language (27 datasets) [Generality]. Adapters change only the *emphasis* of move families for each kind of knowledge (§9).
- **One model, three uses:**
  1. The **policy** uses it to choose moves.
  2. The **simulator** samples from randomized versions of it to test the policy honestly (§17).
  3. The **improvement loop** updates it from real outcomes.

Control runs at five timescales, with one controller each:

| Timescale | Controller | Decides |
|---|---|---|
| Seconds | Stage | Turn-taking, wait time, pointing, what is said and what is shown [Voice] |
| Minutes | Move policy | The next move: a first-match procedure (§13) over verified verdicts |
| A session | Arc planner | The understanding target and a short plan of moves toward it, replanned every turn |
| Days | Consolidation | What comes back for retrieval, by half-life; mastery checks on later days |
| The course | Target selector | What to work on next, by need and leverage: spine and threshold ideas first, then prerequisites, then gaps |

**Diagnosis is active inference.** When the operative model is uncertain, the best next move is often a question. The question is chosen to maximize expected information about which model the learner holds: each hypothesis predicts a different answer. When a domain's wrong models are computable, these predictions are exact (§9). A probe is worth asking when its answer would change the next teaching decision.

### 6. Invariants: what is never traded away

1. **The learner does the thinking.** Learning comes from the learner's own processing: reading with a purpose, working problems, explaining, predicting, building. Questions serve that processing and are never a reflex. A reading portion, or quiet time to work, is as legitimate as a question. What's ruled out is the learner sitting passive while Plato talks.
2. **Verdicts are verified before they're spoken.** This uses the domain verifier, or a calibrated judge. Language models accept 69–71% of invalid solutions [Tutoring §2.8].
3. **No unearned answers.** Help is contingent. Graded work is never solved for the learner.
4. **Grounded in the course.** Its scope, notation and conventions are respected. Where the materials are wrong or simplified, that is recorded and raised gently, never silently fixed.
5. **Targets are fixed.** Personalization changes the route, never the destination.
6. **Judged by delayed, unaided performance on new problems.** Help during practice can raise practice scores while lowering exam scores [Tutoring §2.2].
7. **Epistemic honesty.** Plato says how an item works when it matters: "this has one answer", or "historians disagree here, and here's how you'd argue it". It never presents an arguable judgement (R4 or R5) as fact, or a fact (R1) as opinion. It never cites an authority that hasn't been verified [Generality §6.4].

---

## Part II. The system

```
 any course's materials ─► COURSE MODEL (built in the background, per course)
                            KCs by kind · runnable models · spine & thresholds · dependencies
                            assessment model · wrong models · probes per facet · problems (verified)
                            representations · procedures (steps recovered) · conflicts with the materials
                                         │                    ▲ refine from learner data
                                         ▼                    │
 LEARNER MODEL ◄── evidence ── TEACHING ENGINE ──► move card ──► STAGE (voice + page)
 state per KC and spine idea    target · arc · move          ▲     show · run · draw · build
 move-effect posteriors         (learning-dynamics model)    │
                                         ▲                    └── learner speaks · types · writes · taps · runs
                                         │
                               DOMAIN ADAPTER (per subject): verifiers · representations · problem forms ·
                                                             how misconceptions are encoded · facets emphasis
```

### 7. Course model: how any course is consumed

**The rule of authority.** The course's materials decide scope, notation, conventions and emphasis. Expertise (the model's knowledge, checked by verifiers) decides mechanism and correctness. Every claim is labelled course-supported, general knowledge (allowed), or contradicted (fixed or dropped). Disagreements with the materials become `conflicts` or `simplifications` the tutor can raise.

**What it holds,** for any course:

```ts
CourseModel {
  sources: [{ id, role: 'notes' | 'slides' | 'textbook' | 'assignment' | 'exam' | 'solutions' | 'reference' | 'document' | 'case', ... }]
  adapters: AdapterId[]                       // a course binds several; each item routes by its regime (§9)
  assessment: { forms, targets: [{ kc, family /* E1–E10 */, level, conditions }], confidence }
  spine: [{ id, understanding /* a full sentence that can be wrong */, threshold, evidence, kcs }]
  kcs: [{ id, kind: 'fact' | 'concept' | 'procedure' | 'principle' | 'strategy' | 'epistemic', statement, prerequisites, interactivity, spine }]
  models: [{ id, form: 'machine' | 'causal' | 'formal' | 'script' | 'frame', state, rules, representation, notice, kcs }]
  cases: [{ id, kind, text | ref, kcs, links: [{ to, relation: 'analogous' | 'distinguishable' | 'contrasting' }] }]
  procedures: [{ id, steps: Dag<{ action, decision, cue, standard, why }> }]
  wrongModels: [WrongModel]
  probes: [{ id, kc, family, regime: 'R1' | 'R2' | 'R3' | 'R4' | 'R5', form, prompt, verifierChain }]   // evidence first
  problems: [Problem]                         // steps (a DAG), regime, verified answers, wrong-model answers
  representations: [{ kind, spec, notice, bestFor, fadesTo, translations }]
  explanations: [{ kc, plain, precise, mechanism, analogies: [{ mapping, breaksWhere }], workedExamples }]
  readings: [ReadingPortion]                  // [Reading §8]: built and verified at course-build time, cached, served many times
  conflicts: [{ where, materialsSay, truth, verifiedBy }], simplifications: [...]
  quality: GateReport
}

WrongModel {
  id, kc, belief, errorKind: 'F1'..'F12' /* §8: the repair follows from the kind */, plausibleBecause,
  source: 'catalogued' | 'course_warning' | 'learner_data' | 'inferred', prior,
  detector:                                    // [Generality §7.4]
    | { type: 'execute', fn }                  // answers any instance the way the belief would (procedures, computation)
    | { type: 'constraint', violates }         // a specific violated requirement (designs, schemas, legal elements)
    | { type: 'pattern', battery, fingerprint }// a wrong model identified by a pattern of answers across several probes
    | { type: 'rubric', description, positives, negatives, judge }   // misreadings, oversimplifications, epistemic missteps
    | { type: 'marker', cues, then: 'rubric' } // a cheap prefilter
  separatingProbe, repair, recheck
}

ReadingPortion {
  id, kcs: [{ kc, role: 'teaches' | 'assumes' | 'refutes' }], spine?,
  kind: 'exposition' | 'worked_example' | 'refutation' | 'case' | 'primary_source' | 'document_set' | 'notation',
  origin: 'materials' | 'materials_glossed' | 'explainer', sources: [{ sourceId, locator, verbatim }],
  purpose /* spoken by Plato and shown as the title, in the same words */, body: Block[] /* every sentence has an anchor */,
  keyAnchors, segments: [{ from, to, words, boundaryPrompt? /* at most one, skippable */ }], glosses, sourceCards?,
  level: { cohesion: 'high' | 'terse', words, minutes, density }, variants?: { novice?, review? },
  prequestions /* 0–3 */, after: [{ form: 'return_to_prequestion' | 'explain_back' | 'predict_new_case' | 'classify'
         | 'paired_problem' | 'claim_with_evidence' | 'summary', prompt, ideaUnits?, newSurface }],
  refutes?: { wrongModel, beliefAsLearnersSayIt, whyPlausible, correction, mechanism, contrastCase, courseRef },
  workedExample?: { subgoals, pairedProblem }, verification: { claims, executed, gate }, stats?
}

Artefact { id, learner, kind: 'draft' | 'proof' | 'program' | 'work-up' | 'map', versions: [...], feedback: [...] }   // long work, versioned
```

**How it is built: backward design, with verification at every stage** [Decomposition §10]:

| # | Stage | Produces |
|---|---|---|
| 1 | Inventory | Every source read, with its role, notation, emphasis, built-in exercises, worked examples and warnings |
| 2 | Assessment model | What performance the course demands, mined from exams, assignments and objectives |
| 3 | Spine and targets | Enduring understandings as sentences that can be wrong; threshold ideas; targets per KC |
| 4 | Evidence first | Probes for every facet, each with a checker from the domain adapter |
| 5 | Wrong models | From catalogues for the domain, the materials' own warnings, and inference. Each gets a signature and a separating probe. |
| 6 | Procedures | Steps recovered: several independent drafts merged, then a **literal executor** (a model constrained to the written steps) runs fresh instances. Wherever it gets stuck, a step is missing. |
| 7 | Runnable models and representations | State, rules, visuals and what to notice; the materials compared with verification, giving conflicts |
| 8 | Explanations and readings last | Plain, precise, mechanism, analogies with their limits, faded worked examples. **Reading portions:** the best passages of the materials, chosen and sized; where the materials are terse or wrong, a short explainer Plato writes, faithful to them and framed as a refutation when a known wrong model is involved. |
| 9 | Links and integration | Typed links with evidence; integrative problems |
| 10 | **Gate: understanding, not restatement** | **Verifier self-tests:** for every item, the correct answer in several phrasings (concise, verbose, with units or in words, a different equivalent form) is accepted. Each wrong model's answer is rejected, with that model named. An item that fails its self-test never yields a full-trust verdict. Also: execution or verification of every answer; fresh instances solved by the literal executor; every wrong model fires its own distinct signature; every facet covered; the generative layer present and verified; a skeptical-TA review; fidelity to the materials |
| 11 | **What the course model must prove** | Measured 8 Oct: frontier models already know the standard material *and* its standard teaching knowledge (catalogued misconceptions, separating questions, repairs): about 77–89% unaided. So the course model's value isn't knowing more. It must prove four things. **(a) Grounding, non-inferior:** on what *this* course says and uses (notation, examples, conventions), at most 2 points below the raw materials, so the source passages stay attached and never get paraphrased away. **(b) Runtime precision:** the share of verdicts made by exact detectors and verifiers with no model call; verdict accuracy; consistency across repeated runs; diagnosis latency. **(c) Prevalence, from learners:** which misconceptions *this course's* students actually hold, and how often. Probes can't measure this: measured 8 Oct, a frontier model executes any stated belief and works backwards from an answer to its belief, so diagnosis and repair probes saturate at about 100%. It's learned from real learners' wrong answers (stage 12), and it improves priors, separating probes and repairs over time. **(d) Outcomes:** an engine with the course model teaches at least as well as the same engine with only the materials and diagnoses better, by the §17 decision rule. Beating the materials on gain is the aim, proven with real learners. |
| 12 | Learning from learners (continuous) | Recurring wrong answers that match no wrong model become candidate models; learning curves split or merge KCs; repairs are ranked |

### 8. Repair by kind of error (all subjects)

Every wrong model in every course is one of twelve kinds, in four groups. **The repair is chosen by kind, never by subject** [Generality §6.3].

| Group | Kind | Looks like | Repair |
|---|---|---|---|
| **Performance** | F1 Slip | Right model, isolated execution error | Point to where; the learner fixes it |
| | F2 Fragile | Right only in the familiar form; can't tell when it applies | Vary the surface; discrimination practice; interleave |
| | F3 Control failure | No plan, no monitoring, stops too early, goes down a dead end | Model the strategy; prompts ("what are you doing, and why?"); structured reflection |
| **Content** | F4 Missing piece | A gap, or a prerequisite not held | A detour with a first-step check, then return |
| | F5 False belief | One wrong proposition | Refutation: state it, say it's wrong and why it seemed right, give what's true, grounded in the materials |
| | F6 Buggy procedure | A systematic, rule-like error | Contrast the step with the correct one; a worked example of that step |
| | F7 Flawed model | A coherent wrong model; a consistent pattern across probes | Run it to a contradiction the learner can check; build the replacement together; compare the two |
| | F8 Category mistake | The idea filed under the wrong kind of thing (a process seen as a substance) | Teach the new frame explicitly; apply it to this case and two more |
| **Reasoning** | F9 Oversimplification | Single cause, linear, static, universal | A counter-case; several analogies; revisit cases through other concepts |
| | F10 Misreading | Misrepresents the text, source, problem or data | "Show me where it says that"; re-read with a focus |
| | F11 Epistemic misstep | Proof by example; trusting a source naively; "it's all just opinion"; a claim without a warrant; seeing only one side; a made-up authority | Make the field's standard of evidence explicit; argument mapping; ask for the counterargument |
| **Self** | F12 Illusion of competence | "I get it", then fails | A generative check; show the learner their own calibration record |

### 9. Domain adapters: the only subject-specific code

**The core is written once. Adapters are small libraries chosen per item, not per course** [Generality §7]. A course binds several. Each item routes by its regime and answer format.

| Fixed core (never branches on subject) | Varies per domain family (the adapter) |
|---|---|
| Target selection, arcs, move policy, help ladder | **Verifiers:** how an answer, a step or an artefact is checked |
| Move families; the learning-dynamics model | **Move-emphasis priors** for each kind of knowledge |
| Learner model, evidence weighting | **Misconception detectors** (the five detector types in §7) |
| Course-model pipeline, gate, ablation | **Facet map:** the domain's names for E1–E10 |
| Card schema, voice, stage directions, element patterns | **Problem templates and generators** |
| Eval harness | **Element kinds** for the page |
| Invariants 1–7 | **Epistemic profile:** what counts as a warrant, which sources have authority, what experts may disagree about, citation rules |
| | **Notation parsers:** math input, units, code, word forms |

**The verifier chain.** Each attempt runs through its item's chain, which stops at the first decisive verdict:
1. parse and normalize;
2. an exact or equivalence check;
3. the domain machine (execution, symbolic algebra, units, a dependency graph);
4. constraints;
5. a check against the sources;
6. a calibrated judge.

Every verdict carries a trust weight. Executed and symbolic verdicts weigh about 1. A judge's verdict weighs whatever agreement it has measured on that criterion. **An uncertain verdict becomes a neutral question to the learner, never a guess.** Ten verifier families (V1–V10) cover exact match, execution, symbolic algebra, units, ordering, constraints, sources, rubrics, expert panels and speech [Generality §7.2].

**Calibrating the judges** (shared infrastructure for every subject) [Generality §7.2]:
1. **Split the rubric** into narrow yes/no criteria.
2. **Build a gold set:** 60–100 answers per criterion, real or deliberately altered, labelled by two experts.
3. **Pass bar:** a criterion passes when the judge agrees with the experts at least as well as they agree with each other, and κ ≥ 0.6.
4. **Anchor the judgement:** anchored examples at each level, and pairwise comparison against them.
5. **Bias probes:** answer order, padding, a confident tone, paraphrase, and Plato's own text passed back as the learner's. Each must flip fewer than 5% of verdicts.
6. **Gate items on how varied their answers are:** items whose answers vary too much for reliable automatic grading are flagged.
7. **Keep the judge separate** from the tutor's plan.
8. **Re-run on any change.**

A criterion that fails stays **discussion-only**: Plato talks about it but never issues a verdict on it.

**Adapter families,** in build order:

| # | Family | Covers | Main verifiers |
|---|---|---|---|
| A1 | Computational | Programming, systems, logic, databases | Execution, ordering, exact (the C and RISC-V runners exist) |
| A2 | Formal-quantitative | Math, physics, chemistry, statistics, quantitative economics | Symbolic algebra, units, ordering; a judge restricted to proof qualities |
| A3 | Textual-argumentative | History, literature, philosophy, social science, essays anywhere | Sources, constraints, rubric judge |
| A4 | Case reasoning | Law, medicine, business cases, design reviews | Citations, elements, expert panels, rubric judge |
| A5 | Language use | Second languages, oral presentation | Exact match, speech with confidence gating, task rubrics |

**The generality rule:** adding a domain requires **zero changes to the core**. A core change made "for this subject" is a leak in the abstraction and must be generalized before it merges.

### 10. Learner model

The schema is in [Personalization §5], generalized to the KC kinds and spine ideas of §1. The update rules:
- **No evidence is dropped.** Every verdict's trust weights its evidence: executed or exact verdicts count fully; judge verdicts count at their calibrated agreement; `uncertain` counts weakly, never zero. A follow-up that resolves the verdict adds the resolution as its own observation. (The first decisive test lost every correct answer to `uncertain` and to held updates, so the learner model saw only failures.)
- **Strength:** P = σ(θ − d), with a guessing floor for closed items. Help discounts credit for success; failure is never discounted. σ shrinks with evidence and grows with time. Priors are hierarchical: learner, cluster, KC.
- **Steps:** each checked step of a procedure is an observation on its subgoal (step-level tutoring).
- **Wrong models:** a belief p, with states suspected, confirmed (two independent items), addressed, and resolved (only after a check on a later day).
- **Calibration:** bias and resolution, from occasional confidence questions and from hedges and latency in speech.
- **What works:** the move-effect posterior per learner, by kind of move and representation. These are residuals on later unaided probes.
- **Reading is exposure, not evidence** [Reading §7.6]. Reading a portion marks the KC as presented and changes no θ. Credit comes from the after-move: with the text closed and a new surface it ranks as unaided; with the text consulted it ranks as helped. Questions, glosses and look-backs while reading raise σ on that KC, and never lower θ by themselves.
- **Reading skill** is a learner trait (speed, and comprehension of in-zone portions). Low skill means shorter, more cohesive portions and audio on request, never less text.
- **Forgetting:** a half-life per KC. A success after a gap of at least half a half-life doubles it; a failure halves it.
- **Cold start:** a short intake (goals, background, self-ratings), then about ten first-step probes chosen for maximum information, starting with the spine.
- **Open learner model:** the learner sees their own map, as can-do statements, the wrong models being worked on, their calibration record, and what's due.

### 11. Target selection: by need, not by schedule

```
priority(k) = leverage(k) · gap(k) · ready(k)  +  β·σ(k)  +  γ·due(k)  +  μ·openWrongModel(k)  −  δ·recent(k)
leverage    1 + threshold + spine weight + 0.1·dependents        gap    max(0, target − effective strength)
ready       how ready its prerequisites are (0..1)                σ, due, recent    from the learner model
```

- The learner's request always wins.
- No dates, quotas or urgency.
- The chosen target is stated to the learner in one sentence, with its reason.

### 12. Arcs

An arc has an understanding target, taken from the course model's facets. Its route is a short plan of 3–7 moves, chosen by the learning-dynamics model for this KC kind and this learner's state. It is replanned after every turn. It ends with the target tested unaided, then the learner's own summary.

### 13. Move policy (first match wins)

1. **Verify** the last turn. Its verdict is one of: correct; valid but non-standard; slip; wrong model (which one); missing piece; no attempt; not an answer yet; a request.
2. **Not an answer yet** ("give me a second"): hold. Nothing replaced, no evidence.
3. **A request or a change of goal:** honour it within the invariants, then hand the work back.
4. **No attempt yet:** ask for one.
5. **Correct, with the reasoning shown:** verify and extend. Check once for shallowness on new or threshold KCs, or where a known wrong model would give the same answer.
6. **Correct without reasoning, or with low confidence:** ask why. **Record the attempt now** as evidence on the answer, marked `reasoningShown: false` and weighted lower. The explanation then becomes its own observation (E5). Evidence is never held back waiting for a follow-up.
7. **Slip:** an indirect flag, then point to where.
8. **Wrong model:** if it's uncertain which one, ask the most informative separating question. Then repair by kind (§8), then re-test on a matching item, unaided. Schedule a check on a later day.
9. **Missing piece:** detour to it, then return.
10. **Stuck:** one step up the help ladder (H0 pump, H1 general hint, H2 specific hint, H3 tell one step, H4 worked solution followed by a matching item done alone). After any told step, hand the work back.
11. **Two failures at the same level:** switch representation or step down. Aim for 0.8 predicted success.
12. **"I get it":** a generative check.
13. **Otherwise:** the arc's next move, aimed at about 0.7 predicted success, or the learner's measured band. That move is often a **reading portion**: Plato is quiet while the learner reads, answers questions on demand, and follows with a light consolidation, not an interrogation.

**Lessons from the first decisive test** (8 Oct). The engine with the course model lost to the engine with only the notes, on delayed gain (0.12 against 0.33) and on diagnosis. The transcripts showed the cause: draw-out turns in place of teaching. These rules are binding:
1. **Draw out at most once per answer.** After one "walk me through it", the next move teaches: a repair by error kind, a hint up the ladder, a worked step, or a reading. A second draw-out on the same answer is never allowed.
2. **Never block a teaching move on verification.** A literal or detector match uses the card prepared before the learner answered. Otherwise the engine issues its move within the quick path, from the utterance type plus a light match of the claim against the KC's wrong models, and attaches the verdict when it lands. A slow verifier never leaves the learner hearing only draw-outs.
3. **A stated belief is a diagnosis opportunity.** Content claims ("overflow means a carry out of the top bit") go straight to wrong-model matching: the marker prefilter, then the rubric detector. A match triggers the repair for its error kind (§8).
4. **A false belief gets a direct refutation.** "Not quite: …", then why it seemed right, then what's true, then a check on a new case. Elicitation is not the repair.
5. **Never affirm an unverified claim.** Agreement with anything the learner asserts requires a verdict. So does presupposition: "Why does that work?" implies it does. A draw-out on an unverified answer is neutral ("How did you get 1012?").
7. **Verdict strength follows trust** (invariant: epistemic honesty; added after the second decisive run's phase 1, where the judge wrongly rejected a correct "sp=0xfd0, s4=0" 3 times out of 3 at trust 0.9). A plain verdict ("Yes", "Not quite") is given only at trust ≥ 0.95. Between 0.6 and 0.95, a hedged verdict plus a targeted check: "I get something different for s4: walk me through it." Below 0.6, no verdict. `checkCard` enforces this on `say`, and `actorCard` on the Verdict line.
8. **Close the contrast** (added after the second decisive test's first stage: course model on cs3410, 1 targeted refutation in 67 repair turns and 0 bugs repaired; notes only, 13 in 25 and 2 repaired). A counter-case isn't a repair until the learner *sees* their belief fail. When they answer it by the belief, the next move shows both results side by side: what the belief gives and what is true, computed by the course model's runnable model or the element's engine, ideally on the page. It names why they differ, and only then asks a fresh check. A counter-case left for the learner to resolve repairs nothing: whoever holds the belief computes by it. The simulator credits a belief's setback only when its failure is demonstrated (§6.2, unchanged). Both results are **computed, never generated**: the belief's from the course model's verified predictions (`predictedWrongAnswers`) or the learner's own answer, the truth from the key. An uncatalogued belief gets its contrast from the learner's own answer to a case, and is catalogued with verified predictions once learners show it (stage 12).
9. **Deny nothing they haven't shown; revoice what they have** (from the sixth decisive run's first stage). No negated clause about a belief, in any form ("not Y", "Y does not", "rather than Y", "instead of Y", "isn't Y"), unless that wrong model is sure for this learner (confirmed, or p ≥ 0.75 with no rival within 0.2). The "because" of an unattributed contrast gives the true reason in positive form. An unproven claim of theirs is named back as a question in their own words ("So you're saying every crossing costs the cell energy?"). That is revoicing: it diagnoses without refuting, and it counts as that answer's one draw-out. Then a case.
6. **Elements must carry a task.** An element shown only for viewing earns nothing and is a wasted move. The engine assigns predict, change or construct whenever the KC has a runnable element.

**Long exposition goes on the page** [Reading §7.1]. When the learner needs an explanation longer than about four spoken sentences, and the material is within their zone (prerequisites ≥ 0.7 covered, predicted success ≥ 0.6), Plato serves a reading portion instead of saying it:
1. the course's own passage, first;
2. else a course passage with marked glosses;
3. else a verified explainer.

Plato talks instead when:
- it fits in a few sentences;
- the learner is out of zone;
- a flawed model must be run to a contradiction (that happens in dialogue; the right model can then be read);
- the learner is frustrated;
- the learner asks to be talked through it.

When both routes are reasonable, Plato offers a bounded choice ("read it, or shall I walk you through it?"). The outcome feeds the what-works posterior.

**Explain first or try first** is decided per KC from θ − d, interactivity, kind (principles favour trying first) and the learner's order posterior.

**Mastery** requires an unaided generative success and a success on a new surface on a later day. Threshold ideas need two structurally different transfers on different days.

### 14. Kinds of session (the engine recognizes which one the learner wants)

| Kind | How it runs |
|---|---|
| **Learn** | Prequestions, then the arc, then the target tested unaided, then the learner's summary |
| **Repair** | Separating question, repair by kind, re-test, a check scheduled for a later day |
| **Consolidate** | Spaced "why" retrieval on new surfaces, interleaved with confusable partners |
| **Exam practice** | Integrative problems in the course's assessment forms, checked step by step; mistakes go to Repair |
| **New material** | Prequestions before reading, reading with something to look for, explain it back, link to the spine, flag gaps and conflicts |
| **Study by reading** | One or more reading portions at the learner's pace. Plato is quiet but present: it answers questions and points when asked. Each portion ends with a short consolidation ("what's the idea you'd tell a friend?" or one prediction on a new case). |

**Expected reading share** (starting bands for the evals, not quotas) [Reading §7.7]:

| Session kind | Share of time reading |
|---|---|
| Study by reading | 60–80% |
| Learn / New material | 25–50% |
| Repair | 10–25% |
| Exam practice | ≤ 20% |
| Consolidate | ≤ 10% |

**The rhythm** is read, produce, talk only where what they produce shows a gap, read on. Three failure modes are watched:
- **interrogation:** more than two tutor questions after a portion;
- **lecturing by voice:** more than about 80 spoken words of exposition when a suitable portion exists;
- **homework dumps:** portions with no consolidation.
| **Problem help** | Find the KCs, diagnose, teach with *matching* problems and the help ladder. Graded work is never solved. |

### 15. Stage: voice and page

**Who does what.** The engine decides the verdict, the kind and step of the error, the move, the help level and the content. The voice phrases it and manages the conversation. The page shows, computes and captures. The **page's engines, never a model, compute truth**: register values, a graph's shape, an equilibrium, which claims survive when a source is removed.

**Move card**, for every subject:

```ts
Card { target, move, helpLevel, intention, verdict?, say /* ≤ ~4 sentences, one idea */, ask /* generative, the last sentence */,
       wait: 'recall' | 'reasoning' | 'work' | 'reading',             // how long to stay silent (rules 12–14 below); reading = until they say they're done
       show?: ElementSpec,                                           // see the element schema below
       expect: [{ when, literal?, wrongModel?, pageState?, kind, reply, then }], neutral, handBack,
       persona?: { name, misconception, lines, acceptWhen, probes, transferItem },   // scripted "teach the classmate"
       withheld: { answer?, solution? } /* never sent to the voice below H3 */, why /* cites learner evidence */ }
```

**Verdicts are safe under latency and mishearing.**
- The voice gives a verdict only on a literal match. Otherwise it replies neutrally to draw the learner out ("walk me through that").
- If correctness depends on exact tokens (numbers, symbols, names), the answer goes on the page, or the voice echoes it back ("I heard −5"). Speech recognition errors must never become wrong verdicts [Voice §3.3].

**Stage directions.** The full set of 22 is in [Voice §9], each with its evidence. The core:
1. **Say the meaning; show the thing.** Anything exact (numbers, code, formulas, the question itself) lives on the page. Never read visible text aloud.
2. **Show it as you say it,** within about half a second. Draw new structures step by step with a visible pen; show known ones whole. Labels sit on the thing they label.
3. **Every "this" gets a point:** at an element-level anchor (a cell, a line, a bit, a node), landing just before the word. If no anchor can be bound, name the thing fully instead.
4. **Name the parts first** before a process with many parts.
5. **One idea at a time.** At most about 4 sentences, then hand back with a generative question as the last sentence.
6. **Hold the silence.** About 3 s after a recall question, 8–10 s after a reasoning question, open-ended during work. Never take the turn on "um" or a trailing "because…".
7. **Hear certainty as well as correctness.** Unsure but right: confirm, then ask why. Sure but wrong: a clear verdict and a contrast shown on the page. The voice reports hedges and latency; the engine decides.
8. **Feedback** is the verdict first, then at most two sentences of why, pointed at the error, then hand back. Praise only the specific process, and rarely.
9. **Let productive confusion run,** and step in on frustration, stagnation or boredom.
10. **Make the learner point, draw and explain,** on a scaffold.

**Interactive elements: one schema for every subject** [Interactive Part IV]:

```ts
ElementSpec {
  kind,                       // engine: stepper | sim | graph | geometry | curves | circuit | proof | fbd | pathway | timeline | argmap | sorter | canvas | …
  state, views: string[],     // linked representations of ONE state
  controls: { live, locked }, // focused constraint: only the relevant controls are live
  anchors: string[],          // addressable parts for pointing (cells, lines, nodes)
  task: { mode: 'predict' | 'change' | 'construct' | 'compare' | 'explain' | 'teach' | 'draw',
          ask, checkpoints?, target?, rubric?, pair?, persona? },
  signatures: [{ when /* page state or words */, wrongModel, reply }],
  level, moment: 'first_contact' | 'repair' | 'consolidation' | 'transfer', concepts: KcId[]
}
Engine { validate(spec), run(spec) | step(state, action), check(state, target) → { pass, firstFailure }, diff(student, truth), brief(state) }
```

- **One evidence vocabulary for every element:** `shown`, `predicted`, `revealed`, `changed`, `constructed`, `explained`, `taught`, `drawn`, `signature`, `enacted_level`, `time`, `hints`.
- **Credit comes from the level the learner actually reached.** Watching earns nothing. Responding earns a little. Constructing, explaining and teaching earn the most. Students often don't work at the level they're assigned, so the page logs what they did.

**The seven patterns, available in every subject:**
1. **Engagement ladder:** every element carries a task.
2. **Manipulate a runnable model,** in guided experiments where the model is the referee.
3. **Predict, observe, explain:** the default wrapper for anything with an outcome.
4. **Construct:** the engine checks the artifact and reports only the first failure.
5. **Compare** two cases that differ in one feature, before telling.
6. **Teach a classmate,** "Theo", who holds one catalogued wrong model. His lines and what counts as convincing him are scripted on the card, because an LLM playing a novice drifts into expert answers.
7. **Draw from memory,** scored against a rubric.

**Build order for the page:**
1. The task layer (checkpoints, `diff`, evidence events) on the engines that exist today: the code stepper and the circuit.
2. Compare as a layout.
3. The persona as card fields.
4. Drawing rubrics.
5. New engines, ordered by how many subjects they serve: `graph`, then `timeline`, `argmap` and `sorter`, then `curves`, `sim`, `pathway`.

**The conversation log (decided by the user, 8 Oct).** Each of Plato's lines appears in the log only after he finishes saying it, so it never acts as a redundant caption while he explains [Voice §1.3]. The full log is a minimal panel the learner can open, close and scroll back through.

**Reading on the page** [Reading §7.3–7.5]. A reading portion fills the page as a clean document: headings, figures, code, math. Its title is its purpose, in the words Plato just spoke.

| | What happens |
|---|---|
| **Before** | Plato frames it in at most three sentences (why now, about how long, what to read for, and that one question comes after), plus 0–3 prequestions. He never reads it aloud or summarizes it first. |
| **During** | `wait: 'reading'`: no timer, no check-ins. Plato answers questions in at most two sentences, pointing at the line, then stops. The learner can mark the text. Audio is available on request: the one exception to never reading on-screen text aloud, for access. |
| **After** | Triggered by the learner, never by a timer. One light consolidation chosen by the portion's `after` field: return to the prequestion, predict a new case, classify, the paired problem, or a claim with evidence. Retrieval comes first, then a look back. Plato never re-teaches what the learner just showed they understood. |

### 15b. The element toolkit, inside the teaching engine

Elements are not decoration the voice can call up. They are **how most moves are carried out**, chosen by the engine as part of the move.

**One registry, shared by the engine and the page** (`shared/elements/registry.mjs`):

```ts
ElementKind {
  kind,                    // stepper | circuit | memory | numberline | graph | proofblocks | tracetable | timeline | argmap | sorter |
                           // curves | sim | pathway | canvas | reading | compare (a layout of two instances)
  adapters: AdapterId[],   // which domain families use it
  modes: Mode[],           // which of predict | change | construct | compare | explain | teach | draw it supports
  engine: { validate(spec), run(spec) | step(state, action), check(state, target), diff(learner, truth), brief(state) },
  anchors(state),          // addressable parts for point_to
  notice: string[], translations: Kind[], reveals: WrongModelId[]   // what an expert looks at; linked representations; visible wrong models
}
```

**How the engine uses it.** Each move family maps to element modes. The course model's `representations` say which kinds suit each KC and for what moment:

| Move | Element and task the engine builds |
|---|---|
| Probe or elicit a prediction | The KC's runnable element, `mode: 'predict'`, with checkpoints. The learner commits, then the engine reveals. |
| Present or demonstrate | A guided `change` experiment with only the relevant controls live, or a stepwise build, or a reading |
| Repair a flawed model | **Run the learner's own model on the page:** their prediction (the wrong model's answer) shown against the engine's truth, then "what did your version assume?" |
| Compare | A `compare` layout: two instances that differ in one feature, with linked stepping |
| Construct | A builder kind (circuit, proof blocks, argument map, timeline, curves). The engine's `check` returns the first failure only. |
| Teach a classmate | The persona on the card, plus an element showing the classmate's attempt |
| Draw from memory | A canvas with a rubric, scored by the drawing reader; the reference is shown beside it afterwards |
| Read | The reading view (§15) |
| Practice and exam items | Whatever element the item's answer format needs: a trace table, stepper checkpoints, a sorter |

**Choosing among elements** follows the learning-dynamics model, like any other choice:
- the KC's `bestFor` (first contact, repair, transfer);
- **the engagement ladder:** viewing, then responding, then changing, then constructing, then presenting, climbing from first contact to transfer and dropping a rung on failure;
- this learner's measured response to each representation.

**Evidence.** Element events (`predicted`, `revealed`, `constructed`, `drawn`, `taught`, `signature`, `enacted_level`) reach the engine through `/evidence`. They become learner observations, weighted by the level the learner **actually** reached: watching earns nothing; constructing, explaining and teaching earn the most.

**The engine computes truth.** Register values, a graph, an equilibrium, which claims survive when a source is removed: all come from the element's engine, never from a model.

**The first set to build:**
- **Existing engines, given the task layer:** stepper (C and RISC-V traces), circuit.
- **Then, in order of how many subjects they serve:**
  1. graph (functions, data), number line and memory diagram;
  2. proof blocks and trace table;
  3. timeline, argument map and sorter;
  4. curves, sim and pathway.

Adding a kind means one registry entry plus one engine. Nothing in the engine changes.

### 16. Runtime

| Path | Budget | What runs |
|---|---|---|
| Instant | < 1.5 s | The voice from the card; literal and signature matches; prepared follow-ups |
| Quick | 1–4 s | The domain verifier, then the light judge; ladder steps from the course model |
| Deep, streamed | First part in about 6–13 s | Moves nothing prepared for; `think` |
| Background | Minutes | Course models, problem forging, speculation, learner-model upkeep, evals |

Follow-ups for the likely branches (correct, and each wrong model) are prepared before the learner answers. The four model roles and their separate lanes are unchanged.

### 17. Evaluation: proving it works, for any subject

Everything runs in the sandbox with a local voice stand-in. ElevenLabs is never called.

| Level | Tests | Key metrics |
|---|---|---|
| 1. Course model | Frozen held-out probes; the ablation (model alone, model with materials, model with course model); gate reports | Advantage over the materials alone on course-specific and teaching probes; generative-layer completeness; conflicts found |
| 2. Decisions | `plato-move-rubric v1` [Tutoring §5]: gates for correct, no unearned reveal, grounded; ten dimensions; the judge calibrated to κ ≥ 0.6 | Gate failure rates; engine scored apart from voice |
| 3. Sessions | Simulated learners whose beliefs live in code (executable or rubric-signature wrong models, from an **independent** library); personas; randomized learning-dynamics **worlds**, including a null world | Unassisted delayed gain; success against how much was told; generation ratio; surrender under pressure; verdict accuracy |
| 4. Personalization | The swap test: flip one learner trait and only the matching behaviour should change. Ablations: fixed, θ-only, full. | Sensitivity and specificity; full beats θ-only only where the trait is real |
| 5. Generality | All of the above on **at least three contrasting courses**: a programming or systems course, a math course, and a conceptual or interpretive one [Generality] | No metric collapses on any subject; adapter coverage |
| 5b. Stage process checks | The 24 automatic checks in [Voice §10]. They need logs: estimated word timings, anchors resolved by `point_to`, page events, and ASR confidence. | Read-aloud ≈ 0; deictic binding ≥ 95%; no cut-ins within 1 s of a filler; wait-time violations = 0; no wrong verdicts from low-confidence transcripts |
| 5c. Reading | The 31 checks in [Reading §9]: reading neither avoided nor overused; the right passage (fit, verified, faithful); conduct (purpose stated, silence held, at most two questions after); reading that leads to learning (after-move and delayed results against voice-only routes) | Share bands per session kind; interrogation and lecture-by-voice rates ≈ 0; reading routes no worse than voice routes on delayed probes |
| 6. Real use | Real sessions, checks on later days, the learner's judgement, actual exam results | Delayed unaided success |

**Every metric is reported separately for each domain type, never only in aggregate.** The flagship cross-subject tutor evaluations report only aggregates, which hides collapse [Generality §5.2]. **No collapse:** for every metric, the worst course scores at least 0.8 × the best, unless a measured ceiling explains the gap (for example, how well experts agree with each other).

**Validation courses** [Generality §8]:
- **Development set:**
  - CS 3410 (computational);
  - linear algebra (formal-quantitative);
  - a biology chapter (science models, mostly not computable);
  - a history unit with primary sources (textual-argumentative: R4, sourcing, argument).
- **Held-out:** a case-reasoning course, such as first-year Torts or Contracts from an open casebook. Its adapter is written only after the core is frozen, and it must work with zero core changes.
- **Later, for human pilots:** courses with external measures of learning, such as mechanics with the Force Concept Inventory, or history with the History Assessments of Thinking.

**Success, per phase:**
- **Course model:** the gate passes everywhere. Grounding is non-inferior to the materials. A majority of verdicts on computable items come from exact detectors or verifiers. Runtime precision meets L1.runtime: trust-1 accuracy ≥ 0.995; decided accuracy ≥ 0.97 with ≤ 5% abstentions; ≥ 80% no-model on computable items; consistency ≥ 0.99; p95 ≤ 2 s on the deterministic path (keys and executed checks), measured as one learner sees it: each answer verified alone, in sequence (*second amendment, 8 Oct, after a failing reading:* the precision harness verifies 495 answers at once on one event loop, so its p95 measured queueing that never happens for one learner. Bio, under the same harness, read 23 ms, and the steps alone took 11 ms. The concurrent figure stays in the record as a stress number). The judge path never blocks a move (rule 2), and its p95 is ≤ 60 s. *Amended 8 Oct after phase 1 of the second decisive run, before any pair result:* the original single bar (verifier p95 ≤ 2 s) was written when a move waited on its verifier, and rule 2 since made verification asynchronous. What the learner feels is now its own criterion (decision rule, item 3). In sessions it passes the decision rule below.
- **Judges:** core criteria calibrated.
- **Simulated learners:** a planted wrong model is found within 3 probes at least 85% of the time when it is executable, and at least 70% when it is rubric-based. No spurious gains in the null world.
- **Expert transcript review:** at most 1 harmful error per 10 sessions.
- **Human pilot:** no harm anywhere, and d ≥ 0.3 in at least 3 of 4 courses.

**The decision rule for going live** (pre-registered 8 Oct, before the run). Paired sessions: the same engine with the course model against only the materials, on one harness, run from one code snapshot, in worlds A, B, C and N, balanced.
1. **Gain, non-inferior:** pooled across worlds (bootstrap within world), the lower 95% bound of Δ delayed gain is above −0.05, and in no world does Δ's 95% interval lie entirely below 0. Per-world non-inferiority isn't required: at about 36 pairs per world (half-width ≈ 0.08) it would fail an equal engine almost always.
2. **Diagnosis, superior:** with a planted wrong model, Δ found-within-3 has its lower bound above 0, and probes to diagnosis are fewer. False diagnoses (acting on a wrong model the learner doesn't hold), measured the same way in both arms, are at most 5 points above the materials arm.
3. **Safety:** level-2 G1 = 0. No wrong verdict spoken in sessions, whether it validates a wrong answer or rejects a right one, and whether or not a card backed it. L1.runtime on the fixtures used. **What the learner feels:** the median time from an answer to a substantive move is at most 1 s above the materials arm's (p95 reported).
4. **The binding rules hold:** at most one draw-out per answer, and ≥ 95% of attempts recorded as observations.
5. **Breadth:** after a pass on a computational and a science fixture, one confirmation pair on an argument-based fixture (history) before going live. Code changed after the snapshot needs a level-2 run and an L3 smoke before it goes live.

The loop: every change runs the suite. A gate regression blocks it. Gains count only when they hold across seeds and subjects. Real outcomes update the learning-dynamics model.

### 18. Build plan to a working general system

| Phase | Builds | Gate |
|---|---|---|
| **P1 Course model, general** | §7 pipeline; adapter interface; adapters A1, A2 and A3, plus the shared judge-calibration harness | Gate and ablation pass on all four development courses |
| **P2 Evals, multi-subject** | §17 levels 1–5, stratified by domain type; independent wrong-model library (all five detector types); worlds; swap test | Stable across reruns; judges calibrated per criterion |
| **P3 Learner model v2** | §10, including move-effect posteriors | Model recovery on simulated learners: interval coverage ≈ 80%, few false confirmations |
| **P4 Teaching engine** | §5, §11–14: learning-dynamics model, information-seeking probes, arcs, policy, cards with help levels and withheld answers, verifier before verdict | Rubric gates; swap-test sensitivity; gain over θ-only |
| **P5 Stage and toolkit** | Voice prompt v2 with stage directions; the reading view; the log panel; the element registry and task layer (§15b), the existing engines first, then new kinds in order of reach; the engine choosing elements per move | Stage checks; latency budgets; every move family carried out with an element in at least two subjects |
| **P7 Refined application** | The quality bar (§18b): every user journey works end to end; polish; resilience; performance; QA in a real browser; a local-actor development mode that tests the full UI without ElevenLabs | §18b checklist all green |
| **P6 Real use** | Return to real courses, starting with CS 3410; calibrate the simulator and judge on real sessions | Delayed unaided success on real exams |

Order: P1 and P2 now, in parallel. P3 and P4 when P1's schema settles. P5 alongside P4. **Freeze the core**, then build the held-out course's adapter with zero core changes. P6 only after that.

### 18b. Quality bar for a real application

Plato ships only when all of these hold:

| Area | Bar |
|---|---|
| **Journeys** | Each of these works end to end with no dead ends: create a course; add files (any supported type, several at once); watch the build progress with plain-language status, including provisional courses and retry; the first session (intake and diagnostic); learning sessions of every kind; readings; elements; problem help; the learner's map; coming back the next day (resume, due items). |
| **Polish** | The minimal two-column layout (page left, Plato's log right) with the stone frame. Loading, empty and error states for everything, in plain language. Typography and motion that read calmly. Phone layout. Keyboard access, focus states and reduced motion respected. No unspoken text on screen, and no answer fields or buttons. |
| **Resilience** | Survives server restarts and the Mac sleeping: durable jobs resume, sessions resume where they were, the page reconnects without losing work. A failed model call never leaves silence or a broken card: there is always a neutral line and a safe move. No data loss: migrations are backed up first. |
| **Performance** | The latency budgets of §16 at p50 and p95. Readings and elements render within half a second of being mentioned. Background work never delays the reply path. |
| **Correctness** | Eval gates green (§17), stratified by domain type. No verdict without a verifier or a calibrated judge. Epistemic honesty checks pass. |
| **QA** | An automated end-to-end run per development course, using the local actor. A visual pass in a real browser (Chrome, against the local server) at desktop and phone widths. The page is light-only by design; dark mode only if the user asks for it. A short real-voice check only with the user's go-ahead (ElevenLabs credits). |
| **Development mode** | A local-actor mode (text in, optional browser speech out), so the full UI is tested without ElevenLabs. It's for development only and never shown to learners. |

### 19. Open questions
- **How far simulated learners can be trusted,** especially for rubric-based wrong models. They are checked against real transcripts, and real delayed outcomes decide.
- **Criteria that can't be calibrated** stay discussion-only, and the generality claim then honestly shrinks to "general where verifiable" [Generality §8.3].
- **The learning-dynamics priors** for move emphasis in subjects with thin research. They are updated by data.
- **Cold start** for a course with no exams or assignments: the assessment model is low-confidence, and the tutor says so.

*CS 3410 case study, used as one test fixture: `docs/teaching-design.md`.*
