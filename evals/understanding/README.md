# The understanding suite

Does the tutor understand a course well enough to teach it, not just summarize it? And does it teach from that
understanding, adapted to the student? Three levels, any course (a **fixture**), one scoreboard
(`scoreboard.md`: a row per run, with the fixture, the prompt versions and the settings, and every metric).

Everything runs in a sandbox: a `VACUUM INTO` copy of `data/` (or of another sandbox), and live sessions on a second
server on port 5199+. `data/` is only read, and ElevenLabs is never called (sessions use `evals/stand-in.mjs`). The
real server on :5188 is never touched.

## Commands

```
node evals/understanding/run.mjs --fixture cs3410 --level 1 --against notes      # or studies | model | baseline (knowledge probes)
node evals/understanding/run.mjs --fixture cs3410 --level teach --against studies # or model | notes | both (teaching probes)
node evals/understanding/run.mjs --fixture cs3410 --level teach --set course --against studies   # course-specific teaching probes
node evals/understanding/run.mjs --fixture cs3410 --level repair --against studies   # T4 repairs run on the simulator
node evals/understanding/run.mjs --fixture cs3410 --level precision --against studies   # the course model's verifiers at runtime
node evals/understanding/run.mjs --fixture cs3410 --level 3 --engine notes ...   # the same engine without the course model
sh evals/understanding/snapshot.sh <name> [dir]   # a code snapshot for a decisive run: run run.mjs from it with UNDERSTANDING_SNAPSHOT=<hash>
# the decisive pair, two stages (the default design): stage 1, then the look; stage 2 (the same command without --stage1) only if inconclusive
node evals/understanding/run.mjs --fixture cs3410 --level 3 --paired --stage1 --worlds A,B,C,N --personas P1,P4 --twins --seeds 1,2,3 --concept tc,ptr --turns 10 --parallel 12 --run <id>-cs3410
node evals/understanding/run.mjs --interim <id> --look stage --planned 16,8   # the 99.9% look (stop NO-GO / stop GO / continue)
# the final analysis of a pair (all gates, the decision rule twice: as pre-registered, and without diagnosis superiority)
node evals/understanding/run.mjs --gates --judge-latency decisive2-precision --pair <id> --run <id>-final-gates
node evals/understanding/run.mjs --fixture cs3410 --level 2 [--rubric v2]        # the director's next move, judged
node evals/understanding/run.mjs --fixture cs3410 --level 3 --personas P4,P1 [--twins] --seeds 1,2,3
node evals/understanding/run.mjs --fixture cs3410 --level 3 --swap bias,theta,rep,gaming,lambda,world --seeds 1,2,3
node evals/understanding/run.mjs --fixture cs3410 --level 3 --condition fixed --personas P1,P4 --twins --seeds 1,2,3
node evals/understanding/run.mjs --calibrate [--rubric v1|v2]                    # the move judge against the labelled move set
node evals/understanding/calibrate.mjs --criteria answer.correct,entail.supports  # narrow-criterion judges: gold sets, bias probes, records
node evals/understanding/calibrate.mjs --judge study-agree-light --criteria answer.correct,answer.mechanism,answer.unsupported
node evals/understanding/run.mjs --compare                                        # every metric by domain type, and the no-collapse check
node evals/understanding/run.mjs --gates                                          # the §17 go/no-go, from the newest result per fixture
node evals/understanding/run.mjs --checklist                                      # the §18b checklist (journeys, resilience, …), with the gates
node evals/understanding/e2e.mjs --fixture bio --files 2                          # one development course end to end (§18b journeys)
node evals/understanding/run.mjs --fixture linalg --freeze [probes|specific|audit|course|baselines]
node evals/understanding/run.mjs --fixture bio --level all
```
Options:
- `--topics <file.json>|<id,id>`: run on a subset of the topics.
- `--run <id>`: names the run. A rerun with the same id reuses every finished topic, state and session, and every cached call.
- `--turns N` (8 by default; level 3 caps it at 12).
- `--parallel N`: level-3 sessions at once, on ports 5199, 5200 and so on (`UNDERSTANDING_PORT` sets the base).
- `--recheck`: re-runs every frozen probe's check, without any model call.
- `--import-studies <db>`: copies Studies built in another sandbox.
- `--build-studies`: builds them here.
- `--build-fixture`: ingests a files fixture through the real upload and knowledge pipeline.
- `--fresh-sandbox`: retakes the sandbox copy.
- `UNDERSTANDING_POOL`: live calls in flight (3 by default).
- **Disk** (the lead's contract): every session copies its sandbox (~75–100 MB) into the system temp folder. The stand-in deletes the one it created once its record is written; level 3 passes `--keep` to it, reads the learner model, then deletes that exact copy; level 2 and e2e delete theirs. `--keep` keeps them. `startSandbox` refuses below 3 GB free (an error, never a result) and levels 2, 3 and e2e refuse to start below 5 GB. Never sweep `plato-eval-*` with a glob: other runs' sandboxes may be in use, and cleaning up older ones is the user's decision.
- The backend is edited by other agents while suites run. When it fails to load (a renamed export mid-edit), a command waits until a fresh process loads it and reruns itself (at most 5 times). A level-3 session whose server never ran is recorded as an error, never as a result, and three in a row stop the run.

## Layout

- `run.mjs`: the levels, the freezers, calibration, the scoreboard.
- `lib.mjs`: fixtures, the sandbox, course material, the representations under test, regurgitation, checks that run code, cached model calls.
- `prompts.mjs`: every level-1 and level-2 prompt, domain-agnostic, each with a version.
- `calibrate.mjs`: the narrow-criterion judge calibration (gold sets, bias probes, records), for this suite's judge and the Study's.
- `teaching.mjs`: the teaching probes, generated in code from a fixture's belief library.
- `e2e.mjs`: one development course through the application's journeys (§18b).
- `fit.mjs`: element fit, offline. Do generated predict elements validate, run and match the key? `render-elements.mjs` screenshots them.
- `use-report.mjs`: element and reading use in live course-model sessions.
- `snapshot.sh`: a hashed code snapshot to run a decisive run from, so other work doesn't confound it.
- `sim/`: the simulated learner.
  - `core.mjs`: the state machine, the worlds and the personas.
  - `student.mjs`: perceive, decide, phrase. The stand-in loads it.
  - `perceive.mjs`: how the simulated student reads a tutor turn (`sim_perceive_v7`), shared with `--level repair`.
  - `fixed.mjs`: the non-adaptive tutor of the ablation.
- `fixtures/<name>/`: one course.
  - `fixture.json`: the course, its source, the check kinds, the catalogued misconceptions, the spine and the simulator.
  - `topics.json`: the frozen topic set.
  - `beliefs.mjs`: the simulated learner's skills and misconceptions.
  - `frozen/`: the generated probes, banks and audits.
- `frozen/`: what is domain-agnostic: `plato-move-rubric-v1.md`, `-v2.md`, `rulings.json`, and `calibration/` (`criteria.json`, `gold/`, `items/`, `records/`, `review.md`, `status.json`).
- `cache/`: the sandboxes, frozen baselines, and every model call keyed by its content (rerunning costs nothing).
- `runs/<id>/`: results per topic, state and session, with a `summary.json` per level.

## Fixtures (the domain-specific parts, all pluggable)

| Fixture | Course | Source | Checks | Simulator |
|---|---|---|---|---|
| `cs3410` | Cornell CS 3410, Prelim 1 (12 topics) | the exam in `data/` | C (`runC`), RISC-V (`trace.mjs`), arithmetic, JS | executable buggy rules (`beliefs.mjs`) |
| `linalg` | Linear algebra, weeks 1–6 (8 topics) | the exam in `data/` | JS, arithmetic | executable buggy rules |
| `bio` | OpenStax *Biology 2e* ch. 5, membranes and transport (CC BY; `fetch.mjs`) | the Study pipeline's sandbox, which built it from `source/` | mostly none (conceptual) | structured beliefs: template answers, LLM phrasing, a checker |
| `history` | *The American Yawp* ch. 15, Reconstruction, with six *Yawp Reader* documents (CC BY-SA 4.0; `fetch.mjs`) | the Study pipeline builds it from `source/` (then `source.sandbox`) | none (interpretive) | rubric, marker and constraint beliefs |

Each fixture has a `domainType`: computational, formal-quantitative, science-model or textual-argumentative. `--compare` reports every
metric by domain type and runs the **no-collapse** check: the worst course scores at least 0.8 × the best, unless a measured
ceiling explains it.

Every belief carries a **detector** (domain-generality §7.4):
- `execute` (CS 3410, linalg): a buggy rule that computes the wrong answer.
- `pattern` (bio): the belief shows as a fingerprint of answers across a battery.
- `rubric`, `marker` and `constraint` (history): a described reasoning flaw with exemplars, cue words, or a missing required part.

Level 3 reports how often a planted belief is **identified within 3 of the tutor's probes**, per detector type (the Phase C targets: execute and pattern ≥ 85%, rubric ≥ 70%).

To add a course:
1. Write `fixture.json` (a source: `{ kind: 'snapshot', examId }` for an exam in `data/`, `{ sandbox, examId }` for one built elsewhere, or `{ kind: 'files', dir }` plus `--build-fixture`).
2. Write `topics.json` (the frozen topic set, the central topics first).
3. Write `beliefs.mjs`, your own library, never taken from a Study. For a computable domain, skills each have `solve`, buggy rules, tests and practice. For a conceptual one, items have a template answer and, per belief, the answer that belief gives.
4. Run `--freeze`.

JS checks run through the shared verifier's sandboxed runner (`backend/run` `runJs`, as `backend/understanding/verify.mjs` does): a separate process under `sandbox-exec`.

## Level 1: understanding, per topic, no student

The representation under test answers frozen probes; nothing else is in its context. The answerer is the director's
setting: the mind that will teach from it.
- **Conditions (the ablation):** `model` (the model alone), `notes` (the topic's notes), `baseline` (today's module; frozen baselines from before v12 also hold the retired lesson), `studies` (the Study).
- **Probe families**, generated once from the notes and frozen (`fixtures/<f>/frozen/`):
  - **held out** (why, predict, trace, interpret, construct, bug, transfer, diagnose, discriminate): a computed answer is checked by running code, and a probe whose check disagrees is dropped.
  - **course-specific** (framing, example, convention, read, gap): what only this course's material knows, including what to read when and what to look for.
  - **audit** (CS 3410 only so far; `--freeze audit`): regurgitation **traps** (the notes' errata, each confirmed by two independent programs) and the **instructor's** own questions.
  - **course-level**: integrative problems across topics, and **spine** diagnosis (the root wrong model is a threshold idea, not the topic's).
- **Metrics:**
  - `understanding`: right and *supported by the representation*.
  - `accuracy`: right, from anywhere.
  - `why`: the mechanism given.
  - `diagnosis`: named the wrong model, and a repair that targets it.
  - `covered`: the answerer found what it needed.
  - course-specific accuracy.
  - traps: errata reproduced, which must be 0.
  - **regurgitation**: the share of the representation's prose words inside 8-word runs copied from the notes.
  - **close paraphrase**: the share of words in sentences where 80% of the content words come from one notes sentence. This is harder to game than n-grams.
  - **grounding errors** (claims that contradict the notes; verified errata excepted) and **claim precision**.

## What the course model must prove (the lead's gates, 2026-10-08)

Frontier models already know standard content and standard teaching knowledge, so the course model is held to:
- **(a) Grounding, non-inferior** (gate L1.courseSpecific): course-specific "what does this course say or use" probes at most 2 points below the notes, with no invented fact.
- **(b) Runtime precision** (`--level precision`, gate L1.runtime): every computable item of the course model, answered right (values only, as a student writes) and with each wrong answer its own detectors compute, through `understanding.verify` three times. Thresholds (the lead): trust-1 verdict accuracy ≥ 0.995 (trust-1 errors listed one by one), accuracy of decided verdicts ≥ 0.97 with `uncertain` an abstention (≤ 5%), decided with no model call ≥ 0.8, consistency ×3 ≥ 0.99; latency, as amended after decisive1's phase 1 (verification became asynchronous: no move waits on it): the deterministic path (keys, executed checks) p95 ≤ 2 s, the judge path (V8) p95 ≤ 60 s and never blocking a move (gate L3.judgeAsync, from the pair's transcripts), and the course model's median answer → substantive move at most 1 s above notes only's (gate L3.answerToMove). Second amendment (spec §17, made after a failing reading, with its reason): the precision run verifies all answers at once on one event loop, a queue no learner meets, so the 2 s bar uses a one-learner pass (each deterministic answer verified once more, in sequence, nothing else running: `deterministicP95Alone`); the all-at-once p95 stays in the record as a stress number. The judge path's p95 is read from the precision run designated before the pair (`--gates --judge-latency <base>` reads `<base>-<fixture>`), not from a later run under the pair's load.
- **(c) Teaching knowledge is retired as a gate** (spec §7 stage 11 (c)): a frontier model executes any stated belief and works backwards from an answer, so probe-based diagnosis and repair tests saturate (CS 3410: the model alone 100% on course-mined misconceptions, every T4 repair a targeted refutation). Which misconceptions this course's students actually hold, and how often, needs learner data. The teaching sets below stay as regression checks.
- **(d) Level-3 outcomes, the decisive gate**: the engine with the course model against `--engine notes` (`LUNA_COURSE_MODEL=off`), at equal latency, paired by session (persona, seed, concept, world) and stratified by world (`--worlds A,B,C,N` runs every session in every world). GO criteria (the lead): delayed gain **non-inferior in every world** (bootstrap 95% CI lower bound of Δ > −0.05; gate L3.nonInferior), **superior diagnosis** (found within 3 probes, Δ CI above 0, and fewer probes; L3.diagnosis), **no G1 failure** (L2.correct, and no over-validation in the sessions), and the **precision gate** met on the fixtures used. `--gates` prints this decision above the full gate table.

## Teaching probes (`--level teach`)

Knowing the subject is not what the course model adds: the notes alone answer ~98% of CS 3410's knowledge probes. So
knowledge is held to **non-inferiority** (gate L1.knowledge: the course model at most 2 points below the notes on held-out
and course-specific probes, with no invented fact), and teaching to **superiority** (gate L1.teaching: ≥ 10 points above
the notes). The teaching probes are generated in code from the fixture's own belief library (`teaching.mjs`), frozen in
`fixtures/<f>/frozen/teaching.json`:
- T1, diagnose a given wrong answer: name the wrong model and its error kind (F1–F12, domain-generality §6.3);
- T2, predict the answer a named misconception gives on a new item;
- T3, choose the separating question among three: computed from the answers each hypothesis gives;
- T4, design a repair that matches the error kind;
- T5, choose a reading or an element, and its task mode, for a stated learner state.
- (T6, the materials' conflicts, joins once a fixture has verified errata.)

The catalogued set above sits at ceiling for a frontier model (CS 3410: the model alone 0.89 on the probes the course model
covers), so it is information, not a gate. The gate uses the **course-specific set** (`--set course`,
`frozen/teaching-course.json`): per wrong model the frozen probe files mined from the notes (provenance `course`, its
wrong answer run where computable), TC1 diagnose among four beliefs and TC2 predict its answer. **T4 by simulation**
(`--level repair`): each condition's T4 answer is the tutor's turn after the student's wrong answer; the simulator's
perception decides whether it refuted that belief in a targeted way, and its rules decide the decay.

Conditions: `model` (nothing), `notes` (the topic's notes), `studies` (the topic's course-model slice), `both` (half of
each), every one clipped to the same 20,000 characters, the director's real-time budget. The answerer is the director's
setting. Ground truth comes from the executable detectors where they exist (T2 values, T3 letters, T1's error kind);
otherwise a frozen key-point rubric is graded by the deep setting at medium. The gate compares the probes both conditions answered.

## Level 2: the director's next move

Each scripted state (never seen it, holds a wrong model, computes but can't say why, bored, asks to see it, help-abuser,
"I get it") runs through the **real director** on its own throwaway copy of the sandbox:
1. A session starts on the topic.
2. The actor says card 1.
3. The student's line is committed.
4. `plan_turn` runs, then the card job when no branch was prepared.

The stand-in actor speaks the result (A). The judge scores S, I, D and A by the frozen **plato-move-rubric v2** (v1 plus
the reading amendment; v1 stays for comparison):
- gates G1 (correct), G2 (no unearned reveal) and G3 (grounded);
- D1–D3, the director's dimensions, scored separately from D4–D10, the actor's;
- the rubric's aggregation, with the reflex-praise lint capping D6.

The code also checks the director's verdict against the truth (over-validation, over-rejection).

Reading moves are checked against reading.md §9: RD1 (offered when the student needs exposition and a passage exists),
RD2 (withheld when they are frustrated) and RD5 (requests to read, or not to read, are honoured).

The judge counts as trusted only once the **calibration set** (`frozen/calibration/items`, 54 moves across three fixtures;
`review.md`) is reviewed by a human expert and every gate and dimension reaches κ ≥ 0.6. The lead reviewed it as an LLM
second labeller, so κ is reported as "provisional (LLM-reviewed)". The lead's anchor rulings (D3, D6, D8, D9) are in the
v2 rubric's text, so the judge reads them; v1 stays frozen without them (`status.json` for v2, `status-v1.json` for v1).

With card v2 the harness reads the engine's own decision (`director.state().last`: verdict, trust, wrong model, error
kind, move, help level, rule) and the full card (`director.current(s, { full: true })`, with its withheld answer).

## Judge calibration for narrow criteria (`calibrate.mjs`, domain-generality §7.2)

1. **Criteria** (`frozen/calibration/criteria.json`) are narrow yes/no questions. Examples: answer.correct, answer.mechanism, answer.unsupported, entail.supports, history.sourcing, history.presentism.
2. **Gold sets** (`frozen/calibration/gold/<family>.json`) are built by controlled perturbation: a base (a checked reference answer, a notes passage, or a document question) and variants whose label on each criterion is known by construction (expert A). A reviewer's labels (`review` per item) are expert B. Their κ is the ceiling.
3. The judge runs k times in shuffled order. Items whose verdicts disagree are flagged.
4. **Bias probes:** padding, confident tone, hedged tone, paraphrase, and self-preference (the tutor's own reference as the learner's answer). Each must flip the verdict on fewer than 5% of items.
5. **Records** (`frozen/calibration/records/<criterion>.<judge>.json`) are what the Study pipeline's judge reads:
   - `status`: `verdict` or `discussion-only`;
   - `provisional`: true until expert–expert agreement is measured;
   - κ, the bias flips, the unstable items, and anchors (labelled exemplars for the judge's prompt).

   A criterion that fails stays discussion-only: the tutor may ask about it, but never issues a verdict on it.
6. **Judges.** `narrow` is this suite's own (the deep setting at medium). `study-agree-light` is the judge the Study's
   build pipeline uses (`verify.mjs` `judge`: the light lane's `cm_agree_v1`, question
   "<prompt>\nCriterion: <question>", rubric [question]). The runtime V8 on learner attempts is `narrow` itself
   (`judgeCriterion` → `studyWriter.narrow`, reading `frozen/calibration/records/*.narrow.json`); its records state the polarity (`ok false = yes` for criteria
   whose "yes" is a fault, such as answer.unsupported). A record certifies one judge only.
7. **Hard gold** (`entail.supports.hard`, family `entailment-hard`): near misses a careless judge accepts (a shifted
   quantifier, a reversed cause, a one-step overreach) and heavy rewordings it rejects.
8. Bias flips count only on stable items (all k runs agree); padding adds no claim on claim-checking criteria.

## Level 3: sessions with simulated students whose beliefs live in code

The student's knowledge (θ per concept), misconceptions (executable buggy rules, or structured beliefs), slips,
confidence bias, learning rate λ, help-seeking, frustration, reading speed, stated preferences (possibly false) and
forgetting are code (`sim/core.mjs`).

**Code decides each answer's content.** An LLM only phrases it, and the phrasing is checked:
- in code, when the value is computed;
- by the light setting, when the belief is conceptual.

**Perception.** The judge's setting, with the hidden beliefs in view, reads what each tutor turn asks and does. A belief
decays only under a **targeted** refutation followed by a correct re-derivation, and it can return after a delay.

**sim_student_v3, a correction made after a result** (the lead, 2026-10-09; both arms): an "I don't know why" line no longer replaces the truth of the answer before it, so a tutor's verdict is checked against the answer it refers to. In decisive11b (P1-s1-ptr-wB) "Your earlier rule was correct", said of a correct rule after the learner's "honestly, i don't know why", was flagged as over-validation because v2 compared it with that later line. The lead ruled it not wrong (`frozen/rulings.json`, beside decisive8's P1-s1-ptr-wN ruled wrong: the test in both is whether the spoken verdict affirmed something false); the gates count an over-validation ruled "not wrong" as none, and the looks count a disputed verdict ruled "wrong" as wrong.

**Hedged verdicts, a measurement correction** (the lead, 2026-10-09, applied from the element recheck on; earlier runs not recounted): rule 7's hedged forms count as spoken verdicts: "I think that's right" (positive), "I get something different" and "that's not what I get" (negative).

**Spoken-verdict idioms, a measurement correction made after a result** (the lead, 2026-10-09): the negative-verdict pattern (`lib.mjs` NEGATIVE) skips "no" followed by an idiom (rush, problem, worries, need, and since decisive12's stage 1 pressure, hurry, shame, harm, stress). decisive12's "No pressure; a guess is fine." before a new probe (card verdict null) had been counted as a wrong verdict; the lead ruled it not a verdict (`frozen/rulings.json`), and the looks and gates skip verdicts ruled "not wrong" or "not a verdict".

**A check of their own idea** (perception sim_perceive_v7, frozen 2026-10-09, prompt and schema hash 31bc8e178622; the lead's rule, the same in
both arms). A tutor turn that restates the learner's own idea back as a question ("So you're saying…?", "You think…?", "Do you
mean…?") is read as the ask `restate`, with `restates: { bugId, faithful }`: which active belief it restates, if any, and
whether it says what they actually said. The learner answers in code (sim/student.mjs):
- a faithful restatement of a belief they hold: "yes, that's what i mean", hedged ("kind of? not totally sure") at the
  persona's rate, i.e. when its confidence in a belief (0.75 + bias + 0.1·noise, as when a belief answers) falls below 0.5;
- one of a belief they don't hold (repaired, or never theirs): "no, i don't think that's it" or unsure, at even odds;
- a distorted one: "no, i mean …" with what they did say (and perception flags the distortion as misattributed).
A faithful revoicing of what they said is expressed, not attributed, so it is never a false diagnosis, and it counts as
identifying the belief it restates. Each reply is logged with `content.revoice` (confirmed, hedged, denied, corrected),
reported per arm. `--hedge-checks` (smokes only) makes every such check answered unsure.

**Worlds** randomize the response functions, so the test checks the tutor's inference, not a theory:
- A: expertise reversal.
- B: productive failure.
- C: diagrams help on memory concepts.
- N: null.
- Reading teaches by how well the text's level matches θ, in a different shape in each world.

**Personas** P1–P9 have null twins.

**Reading** (reading.md §9): time on text at the learner's reading speed; a gain by text-level match, scaled by a reading-benefit trait (0 for reading-poor learners), with a purpose or prequestion bonus; a skim probability; and inflated "got it" after reading. The checks:
- RD3: no lecture by voice, i.e. Plato turns over 80 words;
- RD4: reading's share of time;
- RD8: no homework dump;
- RD6 and RD7: the `readBenefit` and `readSkill` swap pairs.

**Outcomes:**
- **O1, unassisted delayed gain** (the headline): the held-out test's expected success, computed in code, 3 simulated days later minus before.
- O2: told versus solved.
- O3: the student's share of generated words.
- O4: requests before a full answer.
- O5: over-validation and over-rejection.
- O7: the next item after a remediation.
- O8: turns to mastery, and frustration.
- O9: latency. This is the stand-in's, not the product's.
- The reading balance: reading's share of time, reading avoided at first contact, reading overused.
- The **hold check**: "give me a second" must not get a new card.
- Library coverage, and phrasing kept.

**The swap test.** Pairs differ in one true trait. For each, the behaviour tied to the trait must move in the predicted
direction (sensitivity), and the other behaviours must stay put (specificity).

**The ablation.** `--condition fixed` runs a non-adaptive sequence in code; that is the floor. θ-only against full needs
the product's profile switch, which doesn't exist yet (P3). The engine with the course model against the engine with only
the notes is `--engine notes` (it sets `LUNA_COURSE_MODEL=off`).

**The decisive pair's design** (the lead): `--paired` runs both arms of every session in one shared queue, alternating course model and notes only across the slots (each arm writes to `<run>-cm` and `<run>-notes`), so both see the same load and no fast session idles. Two stages: stage 1 (`--stage1`: the first seed, no null twins, every world, persona and concept) with a Haybittle–Peto look at 99.9% (`--interim`): stop NO-GO if the pooled Δ gain's interval lies entirely below −0.05 or an absolute criterion failed (an undisputed wrong verdict spoken, a draw-out violation confirmed by transcript); stop GO only if every criterion passes at 99.9%; else stage 2 adds the rest, and the final rule applies unchanged. A session the harness ends early on an actor incident is rerun with the same pair key in either arm; the decision is also printed with such sessions as they ended (the sensitivity line), and actor incidents are reported per arm. Runs go from a code snapshot (`snapshot.sh`).

**L3.judgeAsync, a measurement correction made after a dry run** (the lead, 2026-10-09): the gate is measured as stated, "no move waited on V8": a first card for a learner's line whose verdict came from V8 at issue (the director's match for that line, `how` "verifier:V8") and that was issued more than 3.5 s after the line. Non-V8 verdicts with trust under 1 (0.85 exact mismatch, 0.75 claims) and late revisions are left out. The earlier proxy (any decided trust < 1 card later than 3.5 s, which under load mostly measured the classifier) is reported beside it.

**Running a pair** (the lead, 2026-10-09): 16 slots at most (`--parallel` per fixture, cs3410 10 + bio 6), with nothing else running alongside; `--slots-file <path>` caps the slots while a run goes on (read before each session starts), and the tail back-off watcher (scratch `backoff.mjs`) lowers the caps by 4 when the actor's 5-minute p95 stays over 25 s for 5 minutes (the stand-in logs each actor call's latency only when `UNDERSTANDING_ACTOR_LOG` is set, which the harness sets). `--gates --pair <id>` pins the decision to that pair's runs (`<id>-<fixture>-cm/-notes`) and its level 2 (`<id>-l2-<fixture>`), so a newer smoke sharing session ids is never paired with it. The decision prints twice, labelled: the rule as pre-registered, and, for the user's pending decision only, the same rule without the diagnosis-superiority criterion. `--hedge-checks` (smokes only) makes the learner answer every check of their idea unsure.

**Process metrics** (lib.mjs `processMetrics`; gate L3.drawOuts): an episode opens at a learner answer and closes at the first substantive tutor turn; draw-outs in between (a pump such as "Go on." or a card's neutral line, after an optional "I heard …" echo) are counted, target ≤ 1; the time from the answer to that move (p50, p95); the share of stated beliefs (the simulated student said one) that the engine matched to a wrong model (a card answering that line names one, or is a repair), and that the perception saw identified; the enacted engagement level of each element.

**Spoken verdicts and false diagnoses** (safety, the lead): every Plato line that opens a sentence with a verdict word ("yes", "right", "exactly", "correct" / "no", "not quite", "not yet", "wrong") is backed when a card answering the student's line carries a decisive verdict of that polarity, or the line exactly matches a literal branch of the card that asked; it is wrong when the simulator's truth about that line disagrees (a wrong answer validated, a right one rejected). Every unbacked verdict is reported; any wrong one fails safety (gate L3.spokenVerdicts). A false diagnosis is a tutor turn that attributes to the student, or repairs, a wrong belief they do not hold and have not expressed; the simulator's perception (v6, the same in both arms) marks it (gate L3.falseDiagnoses: the course model ≤ notes only + 0.05).

**Unsaid replies.** When a late card is voiced while the simulated student is typing, the stand-in drops the student's pre-written line; the student then takes back what deciding it changed (`dropped()` in sim/student.mjs: an answer that would have repaired a pending belief, frustration, the last answer), keeps what it learned from the tutor's turn, and marks the log row `dropped`. Content metrics skip dropped rows. (Before this, the slower arm got extra free draws: in the first decisive pair 42% of the notes arm's decisions and 27% of the course-model arm's were never said; one belief repair came from an unsaid reply.)

**Level 2's diagnosis misses**: a wrong-model answer the engine calls `incorrect` without naming the wrong model is a right verdict (not a G1 failure) but a diagnosis miss (`wrong model named`).

**Level 2's G1** is split by cause: over-validation (a wrong answer accepted), over-rejection (a right answer, or a line that was no answer, called wrong) and false claims.

**Model recovery** (learner v2): after each session, `learner.state` for every KC of the session's topic, read from the
session's own data, against the simulator's θ: RMSE, bias, coverage of θ ± 1.28σ (gate: 0.7–0.9), and false
confirmations in sessions where the student holds no wrong model (gate: 0). It needs sessions on the v12 engine with a
course model in the sandbox; until then it reads null.

**What the page did** (stage's records in the stand-in): elements per move family (`render`, `card`), the element
evidence and the enacted engagement level (`evidence`), reading framed with its purpose and the tutor quiet while it is
read (`reading`; gate 5c.readingFramed), and every `point_to` resolved against the page (`point`; gate 5b.pointing).

## End to end (`e2e.mjs`, spec §18b)

One development course through the journeys, in a sandbox server on port 5210 (sessions on 5211): create the course, add
files, build to published (provisional reviews allowed in the sandbox only), the first session (the intake), a learning
session (reading, elements, problem help), the learner map, a server restart under a live session (it must resume), the
next day (`LUNA_CLOCK_OFFSET_MS=86400000` on the same data), and a failed model lane (`LUNA_FAULTS=director:fail:1`:
every student turn still gets a reply). `--checklist` reads the result next to the gates.

## Settings (no model or effort value is changed anywhere)

| Call | Lane (`server/runtime.mjs`) | Setting |
|---|---|---|
| Probe, audit, course-level generation | `heavy` | the deep setting at its effort (high) |
| Level-1 answerer | `director` | the director setting (the deep model, low) |
| Grader, grounding judge, move judge, simulator perception | `heavy` with `effort: 'medium'` | the deep model at medium, as `evals/common.mjs`'s judge |
| Actor stand-in, simulated student's phrasing and its checks | `light` | the light setting (low) |
| The director, classification | as the product runs them | unchanged |

## Reliability: read before trusting a number

- **Knowledge ceiling.** The model alone answers 99.6% of CS 3410's held-out probes right. On standard material, held-out accuracy cannot separate the representations. Look at `understanding` (supported), course-specific accuracy, traps, and levels 2 and 3.
- **The same family.** Probes, references, answers and grades all come from one model family. A shared blind spot passes unnoticed. Checks that run code anchor what can be computed; the rest leans on the judge.
- **`supported` is generous.** The grader accepts what "follows by reasoning" from the representation, so a strong answerer can reason from a short statement to a full answer.
- **The judges are provisional.** The move judge's κ is against labels reviewed by an LLM second labeller, not a human expert; D8 stays below 0.6. The narrow criteria's gold sets are built by perturbation and may be easier than real answers (hence the hard entailment set).
- **Teaching probes are generic in part.** T4 and T5 have rubric answers that good general pedagogy can reach without the course; T1–T3 are where the course model's misconception knowledge should show.
- **The simulator is a model.**
  - Its response functions are made up on purpose, randomized across worlds. It shows whether the tutor detects structure, not whether a teaching theory is true.
  - The perception (an LLM) decides what counts as a targeted refutation.
  - Library coverage measures how much of the tutor's questioning the library computes. Uncovered questions are still graded in code, but their wording comes from a model.
- **Few sessions.** One seed is an anecdote. Use 3 or more seeds, and read the session transcripts in `evals/runs/<time>-l3-…/`.
