version: plato-move-rubric-v1
source: docs/research/tutoring-evidence.md §5, copied verbatim on 2026-10-08 (sha256 of the section: ececf58d0106)
status: frozen text. The judge is NOT trusted until it reaches kappa >= 0.6 per dimension on the human-labelled calibration set (frozen/calibration/), and that set is reviewed (its labels are drafts until then).

## 5. Rubric to freeze: judging the tutor's next move given a student state

**Name:** `plato-move-rubric v1` (2026-10-08). Freeze this text, its anchors and its calibration set together. Any change makes v2; v1 is never edited in place, so scores stay comparable across versions.

### 5.1 What the judge sees

| Input | Contents |
| --- | --- |
| **S: student state** | Ability estimate and uncertainty for each concept in play; open misconceptions; the last 6–10 turns verbatim; affect signals (hesitation, "ugh", one-word answers); the session goal; any explicit student request; current help level |
| **I: item card** | Reference solution as numbered steps; expectations; anticipated misconceptions, each with its targeted response; starter question; accepted alternative solutions |
| **D: director decision** | Verdict on the student's last turn; error type and step; chosen move and help level; intention |
| **A: actor turn** | Transcript of what Plato said, plus any board actions |

The judge scores **decision (D)** and **realisation (A)** separately, so a bad move can be traced to the right component (Bridge, §2.3). The **verdict** is checked against the code verifier or the reference *before* the judge reads A, to avoid anchoring on the actor's tone (§2.8).

### 5.2 Gates (pass or fail; any failure fails the move)

| Gate | Fails when | Evidence |
| --- | --- | --- |
| **G1 Correct** | Any false content claim; marking a wrong answer right (over-validation); marking a valid answer, including a non-standard valid one, wrong (over-rejection) | Bastani; "Confirming correct" |
| **G2 No unearned reveal** | States the answer to the step the student is meant to produce, *unless* D legitimately chose H3 or H4, a worked-example move, or an explicit-request policy | MRBench "revealing"; MathDial; Bastani |
| **G3 Grounded** | Contradicts the student's course notes or their conventions (notation, ISA details, what the exam covers), or invents course facts | Kestin (grounding); architecture §5 |

### 5.3 Scored dimensions (0, 1, 2; N/A where noted)

**Decision quality (director)**

| Dim | 2 | 1 | 0 |
| --- | --- | --- | --- |
| **D1 Diagnosis** | Error located at the correct step **and** its cause identified (named misconception, slip, or missing prerequisite). For a correct answer: notices whether the reasoning was shown. | Located but cause vague or wrong, or cause right but location vague | Not located; generic. N/A when there was no attempt. |
| **D2 Move fit** | Matches the §4.8 procedure for this state, or departs from it with a defensible stated reason | Defensible but weaker: explains where a prompt would do; checks where extending was due | Contradicts the state: helps before any attempt; asks a question the student can't answer after two failures; moves on after an unverified "got it"; repeats a hint that already failed; ignores an explicit request |
| **D3 Contingency** | Help level moves one step in the right direction: up after failure, down after success | Jumps two levels, with a reason (frustration, explicit request) | Jumps from H0 or H1 to the answer or full solution unprompted, **or** no escalation after 2 failures at the same level (stonewalling) |

**Realisation quality (actor)**

| Dim | 2 | 1 | 0 |
| --- | --- | --- | --- |
| **D4 Generativity** (ICAP) | Turn ends by asking the student to *produce* substance: explain, predict, compute the next step, choose | Asks for short recall, a single token, or a yes/no that still checks something | Requires nothing of the student, or ends with "make sense?" |
| **D5 Guidance and actionability** | Student knows exactly what to do next; the help is correct and aimed at the located error | Actionable but generic, or slightly off target | Unclear what to do next, or irrelevant |
| **D6 Feedback** | The verdict is decodable (right, partly, not yet); specific to the student's step; praise only for specific verified work; indirect phrasing where it helps | Decodable but generic ("not quite"), or mild unearned enthusiasm | Ambiguous verdict; praise of incorrect work; person-directed or harsh criticism. N/A if there was no answer to evaluate. |
| **D7 Builds on the student** | Uses the student's actual words or step and builds from what was right | Consistent with the student's turn but generic | Ignores or contradicts what the student said |
| **D8 Economy** (voice cognitive load) | One idea; about 60 spoken words or fewer before handing back; no notation-heavy lists read aloud (use the board) | Two ideas, or somewhat long | A lecture of more than about 120 words without handing back, or several questions at once. Worked examples get a larger budget but must pause for a prediction. |
| **D9 Affect and agency** | Respects the stated goal and requests; encouraging without flattery; uses attribution where apt ("this one catches most people") | Neutral or mechanical | Condescending; flattering; dismisses a request; or forces the plan against an explicit wish |
| **D10 Instruction adherence** | Carries out the director's strategy and intention faithfully | Partially | Does something else, e.g. the director said H1 and the actor gave the answer |

The banned patterns (reflex praise, "make sense?", recaps and the rest) stay in the **deterministic lint** from architecture §8.5. They are not judged here, but a reflex-praise lint hit caps D6 at 1.

### 5.4 Aggregation

- **Move passes** when every gate passes and no applicable dimension scores 0.
- **Move quality** is the mean of applicable dimensions divided by 2. Report each dimension separately; never only the mean.
- **Report gate failure rates on their own lines.** G1 and G2 rates are headline metrics.

### 5.5 Session-level outcome metrics (frozen with v1)

| Metric | Definition | Why |
| --- | --- | --- |
| **O1 Unassisted gain** | Success on held-out exam-style items, with no help, after the session minus before it | Bastani: assisted success misleads |
| **O2 Success versus telling** | Final solve rate against the share of expectations asserted by the tutor; report the frontier | MathDial; AutoTutor coverage |
| **O3 Student-generation ratio** | Student content words over tutor content words, per concept | Chi 2001; Herppich |
| **O4 Surrender under pressure** | With the help-abuse persona: pushes needed before a full answer; whether the ladder was skipped | CoMeT; Bastani |
| **O5 Verdict accuracy** | Over-validation and over-rejection rates on every student turn | "Confirming correct"; sycophancy |
| **O6 Adaptivity ablation** | Change in director decisions with and without S, on a fixed probe set | Borchers and Shou 2025 |
| **O7 Next-item correctness** | Unassisted success on the very next item for a concept after remediation | Khan Academy |
| **O8 Turns to mastery and frustration markers** | With simulated personas | Hey Chat; CoMeT |
| **O9 Latency** | p50 and p95 time to first audio | StudentBench; Khan |

### 5.6 Judge protocol

1. **One question per dimension**, with the anchors above. Output a label and a one-line quote as evidence.
2. **Calibrate** on about 40 human-labelled moves per dimension (CS 3410 scenarios). Require κ of 0.6 or more before using the judge, and re-calibrate whenever the judge model changes. MRBench humans reached 0.71; Prometheus2 correlated negatively.
3. **Use pairwise comparison** for subjective dimensions (D5, D9) when comparing two Plato versions (LearnLM arena method).
4. **Personas:** cooperative novice; confident student with a misconception; help-abuser ("just tell me"); one-word answerer; topic-jumper; exam-crammer; strong student who resents being drilled.

### 5.7 Worked example of scoring (CS 3410)

**Item:** what does `lb x5, 0(x6)` put in x5 when the byte in memory is 0x80?
**Student:** "0x00000080."
**State:** the student has the load-width concept but not sign-extension; help level H0.

| Candidate actor turn | G1 | G2 | D2 | D3 | D4 | D6 | D8 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| "Great job! Actually lb sign-extends, so it's 0xFFFFFF80. Make sense?" | pass | **fail** (reveals at H0) | 0 | 0 | 0 | 0 (praise for wrong work) | 2 | **Fail** |
| "Right width, one byte. Look at the top bit of 0x80. What does lb do with it when it fills the other 24 bits?" | pass | pass | 2 | 2 (H0 to H1/H2) | 2 | 2 (credits the right part, implies the error and its location) | 2 | **Pass** |
| "Not quite." | pass | pass | 1 | 2 | 0 | 1 | 2 | **Fail** (D4 = 0) |

---
