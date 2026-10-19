# Personalization: what works, and how Plato should infer "how this student learns best"

Research brief for Plato (Luna-Study), 2026-10-08.

**Scope:**
- which differences between learners are worth adapting to;
- how to infer them from a voice dialogue;
- how the director should act on them;
- how to test that it does.

This brief builds on `docs/history/teacher-architecture.md` §6 (learner model) and §7 (teaching model). Where it confirms, refines or contradicts those sections, it says so (summary in §7 below). Reference links are inline and collected at the end.

---

## 0. The rules on one page

1. **Adapt to the student's state, not to a "style".** No study has shown that matching instruction to a self-reported learning style (visual, auditory and so on) improves learning: the required interaction has essentially never been found ([Pashler et al. 2008](https://digitalcommons.usf.edu/psy_facpub/1765/)). Some differences between students are real and worth adapting to:
   - prior knowledge per concept;
   - specific misconceptions;
   - learning rate;
   - confidence calibration;
   - motivation and affect;
   - goals and time available.

   For Plato, "how this student learns best" means two things: what this student knows now, believes wrongly and can handle next; and what has measurably worked for them on this kind of content.
2. **Choose explain-first or try-first per concept, per moment.** The choice depends on prior knowledge relative to the task and on the material's element interactivity (how many elements must be held in mind at once):
   - worked examples for novices, faded as competence grows;
   - plain problems, with no examples, for the competent;
   - "productive failure" try-first only when prerequisites are in place and the problem is accessible.
3. **Learn which representations work from outcomes; don't ask.**
   - Score each explanation by the residual (outcome minus prediction) on later unassisted probes.
   - After a failure, diagnose it before switching representation. Never repeat the same explanation.
   - Always bridge back to the representation the exam uses.
4. **Treat calibration as a first-class trait.**
   - Elicit confidence on a subset of items and store the bias.
   - Treat "I get it" as calibration data, not as evidence of knowledge.
   - High-confidence errors get an explicit contrast and a delayed re-probe.
5. **Personalize the route, never the destination.**
   - Exam targets stay fixed.
   - Most work sits at roughly 0.6–0.85 predicted success.
   - Help discounts credit.
   - Student satisfaction is not a learning metric.
6. **Support motivation through competence, autonomy and relatedness:**
   - early wins that are earned, not easy;
   - meaningful but bounded choices (2–4 options that are equally good for learning);
   - progress shown as can-do goals;
   - feedback about the task and the process, not about the person.
7. **Model misconceptions as specific, generative bugs.** Each one predicts particular wrong answers. Confirm it with independent evidence, and mark it resolved only after a delayed probe.
8. **The LLM annotates; statistics do the tracing.**
   - The director labels correctness, concepts and misconception matches. Code updates θ/σ.
   - LLM-only learner models are less accurate and less stable than classical tracers ([Hooshyar et al. 2025](https://arxiv.org/abs/2512.23036)).
9. **Cold start:**
   - a short intake for goals, logistics and self-ratings;
   - an adaptive diagnostic using "first step" probes;
   - hierarchical priors, so early evidence moves related concepts too.
10. **Evaluate with simulated students whose beliefs live in code, not in a prompt.** The test of personalization is counterfactual: flip one trait and check that the tutor's behaviour changes on that dimension only. Learning should beat a θ-only ablation where the trait matters, and do no harm where it doesn't.

---

## 1. What "how a person learns best" means in the evidence

### 1.1 The learning-styles hypothesis fails

**The claim.** Each student has a style (visual/auditory/kinesthetic, VARK, Kolb, and so on) and learns better when instruction matches it. This matching is called "meshing".

**What would count as evidence.** [Pashler, McDaniel, Rohrer & Bjork (2008)](https://digitalcommons.usf.edu/psy_facpub/1765/) (*Psychological Science in the Public Interest* 9(3):105–119) set the bar:
1. Classify learners by style.
2. Randomly assign each style group to each instructional method.
3. Test everyone the same way.
4. Find a **crossover interaction**: style A learns best with method A, and style B learns best with method B.

A method that is better for everyone (a main effect) does not support meshing. Pashler et al. found almost no studies with this design that showed the interaction, and several that contradicted it. They concluded there is no adequate evidence base for using learning-style assessments in education.

**Direct tests since then:**
- [Rogowsky, Calhoun & Tallal (2015)](https://eric.ed.gov/?id=EJ1055886) (*J. Educational Psychology* 107:64–78). Adults were classified as auditory or visual by a standardized inventory, then randomly assigned to an audiobook or an e-text. There was no style × mode interaction on comprehension, either immediately or two weeks later.
- [Rogowsky, Calhoun & Tallal (2020)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.00164/full) (*Frontiers in Psychology* 11:164). 118 fifth graders, using Pashler's design: the same null result. "Visual" learners did better in both modes, which is a main effect, not meshing.
- [Knoll, Otani, Skeel & Van Horn (2017)](https://www.semanticscholar.org/paper/Learning-style,-judgements-of-learning,-and-of-and-Knoll-Otani/f42acfc3165727abc334bce29edbb539c0ef269b) (*British J. Psychology* 108:544–563). A verbal or visual preference did not predict recall of words versus pictures. It **did predict judgements of learning**: students *believe* they learn more in their preferred mode. This explains why the myth persists, and why a student's report of "what works for me" is unreliable evidence.
- Reviews:
  - Coffield et al. (2004, Learning and Skills Research Centre) reviewed 71 style models and found weak psychometrics and no instructional payoff.
  - Willingham, Hughes & Dobolyi (2015, *Teaching of Psychology* 42:266–271).
  - [Kirschner & van Merriënboer (2013)](https://research.ou.nl/en/publications/do-learners-really-know-best-urban-legends-in-education/) (*Educational Psychologist* 48:169–183), "Do learners really know best?"

**What *is* true, and gets confused with styles:**
- **The content decides the best representation, for everyone.** Some content is spatial or structural: a pipeline diagram, a cache's sets and ways, a stack frame, a memory map. Everyone learns it better with a diagram. Words plus pictures beat words alone across learners (Mayer's multimedia principle).
- **Prior knowledge changes which format helps** (expertise reversal, §2.1). A labelled, integrated diagram helps a novice and is redundant for an expert. This is a real learner × method interaction, but the learner variable is *knowledge*, which changes within hours. It is not a stable trait.
- **Abilities differ.** Working memory, spatial ability and reading fluency vary. Some effects interact with spatial ability (e.g. Mayer & Sims 1994, *J. Ed. Psych.* 86:389–401: high-spatial learners benefited more from concurrent animation and narration). The evidence for *tutors* adapting to these abilities is thin, and Plato cannot measure them reliably. Don't model them.
- **Preferences matter for motivation, not for encoding.** It is fine to honour a preference where nothing is at stake (§2.5). It is not fine to lock instruction to it.

**Design rules:**
- **R1.1** Plato never asks "are you a visual learner?" and never stores a style. If the student volunteers one:
  - store it under `stated_preferences` as a weak prior, which may break ties between equally good representations;
  - don't comment on learning styles.
- **R1.2** Choose a representation by three things, in this order:
  1. what the content needs: a diagram for structure and space, a trace for procedures, code for code;
  2. the student's prior knowledge;
  3. measured outcomes for this student (§2.3).
- **R1.3** Use speech and the board together for everyone. Plato talks while drawing: that is dual coding. It should be the default for structural content, not something reserved for a "visual" profile.

### 1.2 What varies between learners, and how much is known

| Dimension | Evidence that adapting to it helps | Stable or changing | Inferable from dialogue? | Plato priority |
|---|---|---|---|---|
| Prior knowledge per concept | Very strong: expertise reversal, mastery learning, effect sizes of tutoring systems | Changes within a session | Yes, from answers | Core |
| Specific misconceptions | Strong: bug diagnosis, refutation, AutoTutor's expectation-and-misconception dialogue | Fairly stable; resist change | Yes, from specific wrong answers and explanations | Core |
| Learning rate | Moderate: per-student learning rate improves prediction more than a per-student prior ([Yudelson et al. 2013](https://link.springer.com/chapter/10.1007/978-3-642-39112-5_18)) | Fairly stable trait | Yes, after several concepts | Add |
| Metacognitive calibration | Strong for outcomes: overconfidence leads to underachievement | Fairly stable; trainable | Yes, if confidence is elicited | Add |
| Self-efficacy, affect, engagement | Strong for persistence; moderate for learning | Changes moment to moment | Partly: language, help-seeking, disengagement | Core, for pacing and challenge |
| Interests | Moderate: personalizing the problem context | Stable | Yes: intake and conversation | Light |
| Goals, time, exam | Decides *what* to teach | Changes per session | Yes: ask | Core |
| Stated teach-versus-tutor preference | Weak evidence for the preference itself; matters for engagement | Stated | Ask, then verify | Weak prior |
| Learning style | None | n/a | n/a | Never |

[Bernacki, Greene & Lobczowski (2021)](https://www.semanticscholar.org/paper/A-Systematic-Review-of-Research-on-Personalized-by-Bernacki-Greene/da21ae2510619fc6c9c8d96a6cef86ce60730165) (*Educational Psychology Review* 33:1675–1715) systematically reviewed personalized-learning research. They found it fragmented on *what* is personalized and *why*, and recommend an explicit theory of change for each personalization. The schema in §5 follows that advice: every field names what it changes in the director's behaviour, and why.

---

## 2. What can legitimately be adapted

### 2.1 Prior knowledge: expertise reversal, worked examples, fading, and explain-first versus try-first

**Evidence**

- **Worked-example effect.** Novices learn more from studying worked examples than from solving the equivalent problems. Problem solving by trial and error uses up the working memory that should go to learning the structure ([Atkinson, Derry, Renkl & Wortham 2000](https://doi.org/10.3102/00346543070002181), *Review of Educational Research* 70:181–214).
- **Expertise reversal.** Guidance that helps novices becomes redundant, and then harmful, as knowledge grows. More knowledgeable learners do better with problems than with examples ([Kalyuga 2007](https://link.springer.com/article/10.1007/s10648-007-9054-3), *Educational Psychology Review* 19:509–539; Kalyuga, Ayres, Chandler & Sweller 2003, *Educational Psychologist* 38:23–31).
- **Fading.** A smooth transition beats an abrupt switch: worked steps are removed one at a time until the student solves alone (Renkl & Atkinson 2003, *Educational Psychologist* 38:15–22).
- **Adaptive fading.** [Salden, Aleven, Schwonke & Renkl (2010)](https://link.springer.com/article/10.1007/s11251-009-9107-8) (*Instructional Science* 38:289–307) faded each step type per student once the student's self-explanations of that step were correct. Results on delayed tests: adaptive fading beat fixed fading, which beat plain tutored problem solving, in both a lab and a classroom experiment with the Cognitive Tutor.
- **Rapid diagnosis by "first step".** [Kalyuga & Sweller (2005)](https://link.springer.com/article/10.1007/BF02504800) (*ETR&D*) showed a problem and asked only for the first step:
  - experts name a high-level plan;
  - novices start fiddling with low-level steps.

  The test took a fraction of the time of a full assessment, and was used to route learners to the right level of guidance. It suits voice well: "What's the first thing you'd do?"
- **The assistance dilemma.** [Koedinger & Aleven (2007)](https://link.springer.com/article/10.1007/s10648-007-9049-0) (*Educational Psychology Review* 19:239–264) frame the central open parameter as when to give information and when to withhold it. In Cognitive Tutor experiments, both directions won in different conditions. [McLaren et al. (2014)](https://link.springer.com/chapter/10.1007/978-3-319-07221-0_44) found worked examples about as effective as tutored problems but much more **time-efficient**. That matters when the exam is close.
- **Productive failure: problem solving, then instruction.** [Sinha & Kapur (2021)](https://janfasen.nl/wp-content/uploads/2023/05/Sinha-and-Kapur-PS-I.pdf) (*Review of Educational Research* 91:761–798) meta-analysed 53 studies with 166 comparisons:
  - g = 0.36 in favour of problem solving first, for conceptual understanding and transfer, with no cost to procedural skill;
  - g = 0.37–0.58 when the design followed productive-failure principles faithfully: problems that activate prior knowledge and allow several solution paths, then consolidation that compares the student's attempts with the canonical solution.

  Related: [Schwartz & Bransford (1998)](https://www.semanticscholar.org/paper/A-time-for-telling-Schwartz-Bransford/689d8f118e2ae8d2284d90be8232bb4d2286ba1c) (*Cognition and Instruction* 16:475–522). Analysing contrasting cases *before* a lecture creates "a time for telling" and improved transfer.
- **Boundary condition.** [Ashman, Kalyuga & Sweller (2020)](https://link.springer.com/article/10.1007/s10648-019-09500-5) (*Educational Psychology Review*) found that for **high element interactivity** material, explicit instruction first beat problem solving first on both similar and transfer problems. (Element interactivity means how many elements must be held in mind at once; Sweller 2010, *Educational Psychology Review* 22:123–138.)
- **Reconciliation.** The two literatures agree once the variable is the student's prior knowledge relative to the complexity of the task:
  - try-first works when the student can produce meaningful attempts with what they already know, and the problem is simple enough to explore;
  - explain-first works when a novice would flounder in a tangle of interacting elements.

  Kapur (2016, *Educational Psychologist* 51:289–299) makes the same distinction between "productive" and "unproductive" failure.

**Design rules**

- **R2.1** Add a concept attribute `interactivity` (low, medium or high), set by the Examiner when it indexes the notes. CS 3410 examples:
  - negating in two's complement: low;
  - hex to binary: low;
  - pointer arithmetic: medium;
  - RISC-V calling convention with stack frame and saved registers: high;
  - pipeline hazards with forwarding and stalls: high;
  - cache address breakdown with tag, index and offset under a given geometry: medium to high.
- **R2.2** Decide explain-first versus try-first per concept and per moment:

```
gap = θ_c − d_task                      # student ability relative to the task, in logits
if prereq_ready(c) < 0.6:
    → DETOUR: teach the weakest prerequisite (usually explain-first there)
elif σ_c is large:
    → FIRST-STEP PROBE first (one quick question), then decide
elif gap < −1.5  or  (interactivity(c) == high and gap < −0.5):
    → EXPLAIN-FIRST: worked example where the student predicts the next step, then a faded example
elif gap ≤ +0.5 and interactivity(c) != high
     and goal ∈ {understand, horizon > 2 days} and affect ∉ {frustrated, anxious}:
    → TRY-FIRST: one accessible problem or a contrasting-case pair (2–5 min),
      then consolidate *from their attempt* ("your idea X is the core; here's what it misses")
else:   # gap > +0.5
    → PROBLEM-ONLY: solo problem, variation, transfer, explain-why. No worked examples.
```

  Overrides:
  - "Show me" → explain, and log it as preference evidence.
  - "Let me try" → try, unless gap < −1.5. In that case give a 30-second orientation, then the try.
  - Exam within 48 hours → lean explain-first plus practice, because worked examples are the most time-efficient.
- **R2.3** Fade by evidence, not by the clock. Within a worked example, hand a step type to the student once they have correctly predicted or self-explained it (Salden et al. 2010). Keep a per-concept `fade_level` for worked → faded → solo → variation. This is the move ladder of `history/teacher-architecture.md` §7.1, but advanced by the student's own step predictions.
- **R2.4** Learn the student's response to instruction order slowly. `order_response` is the mean delayed residual after try-first episodes minus the mean after explain-first episodes. It may shift R2.2's thresholds by at most ±0.5 logits, and it is shrunk toward 0 until there are 6 or more episodes of each kind. Interactions between an individual's aptitude and a teaching method are hard to detect from a few episodes, so the state variables (gap and interactivity) carry most of the decision.
- **R2.5** Give help contingently inside a problem. Escalate one level after each failure: pump ("say more") → hint → prompt → partial step → worked step. De-escalate after each success. This is the "contingent shift" of [Wood & Wood (1999)](https://www.sciencedirect.com/science/article/abs/pii/S0360131599000305) (*Computers & Education* 33). A recent LLM implementation, [CoMeT (Hou et al. 2026)](https://arxiv.org/abs/2609.22993), escalates support on failure at decision points and fades it as the learner engages, keeping the thinking demand constant. In a within-subjects study with 131 adults on Python tasks, it gave a complete answer in about 1 in 16 sessions, versus about 1 in 6 for a question-only tutor, and learners reported less frustration.

**Relation to the architecture.** §7.1's offsets already encode the worked → faded → solo → variation ladder, and §7.2 targets about 70% success; both are consistent with this evidence. §7 has two gaps:
- there is no **try-first branch**: the "Orient" move at −2.0 is always explain-first;
- there is no **interactivity gate**.

Add a "Try-first / contrasting cases" move at an offset of about −0.5, with a mandatory consolidation step afterwards.

### 2.2 Pace, mastery, and the right amount of challenge

**Evidence**

- **Mastery learning.** [Kulik, Kulik & Bangert-Drowns (1990)](https://www.semanticscholar.org/paper/a6b6e062d5d4a349b507425c3cb84081972c4781) (*Review of Educational Research* 60:265–299) analysed 108 evaluations:
  - effects of about 0.5 SD on local exams, smaller on standardized tests;
  - effects that lasted;
  - larger gains for lower-aptitude students;
  - but *self-paced* mastery programs lowered course completion in college.

  Bloom's "2 sigma" (1984, *Educational Researcher* 13:4–16) is an optimistic upper bound. [VanLehn (2011)](https://eric.ed.gov/?id=EJ946764) (*Educational Psychologist* 46:197–221) found human tutoring at d ≈ 0.79, step-based tutoring systems at d ≈ 0.76, and answer-based systems at d ≈ 0.31.
- **Mastery thresholds.** Cognitive Tutor moves a student on when P(learned) ≥ 0.95 ([Corbett & Anderson 1994](https://link.springer.com/article/10.1007/BF01099821)). [Pelánek & Řihák (2017)](https://dl.acm.org/doi/10.1145/3079628.3079667) found that the **choice of threshold matters more than the choice of learner model**. The threshold is a design decision to test, not a detail.
- **Optimal difficulty.**
  - [Wilson et al. (2019)](https://www.nature.com/articles/s41467-019-12552-4) (*Nature Communications* 10:4646) derived an optimal training error of about 15.9% (85% accuracy) for gradient-descent learners, and showed it matches some animal-learning data. The derivation is for binary classification learning, not human concept tutoring, so treat it as a heuristic.
  - It is consistent with "desirable difficulties" (Bjork & Bjork 2011) and the "region of proximal learning" (Metcalfe & Kornell 2005, *J. Memory and Language* 52:463–477).
- **Learner control.** Novices are poor at choosing their own path and pace ([Kirschner & van Merriënboer 2013](https://research.ou.nl/en/publications/do-learners-really-know-best-urban-legends-in-education/)), and self-pacing hurt completion (Kulik et al.).

**Design rules**

- **R2.6** A can-do goal is met only when all of these hold:
  - θ_eff ≥ T_c, with σ below a threshold;
  - at least one *unassisted* success on an explain-why, spot-the-error or transfer item;
  - at least one success after a gap of a day or more.

  Correct answers to recognition or yes/no items alone never certify mastery.
- **R2.7** Set the challenge band by context, not by personality:

  | Situation | Target predicted success |
  |---|---|
  | Default | 0.70 (current §7.2) |
  | After two consecutive failures, or affect frustrated or anxious | 0.80–0.85, until two successes |
  | On a streak and engaged | 0.60–0.65 |
  | Warm-up retrieval of due concepts | 0.85–0.90 |
  | Diagnostic items (§3.5) | 0.50–0.60 |

  Learn a slow per-student `challenge_tolerance` from disengagement events plotted against difficulty. The student who frustrates quickly then gets a gentler band *without lowering any target*.
- **R2.8** The student controls tempo; the director controls progression.
  - The student controls turn-level tempo: "slow down", "again", "skip this example".
  - The director controls progression, through the mastery gate and the scheduler.
  - "Can we move on" is honoured and logged, and the concept stays on the schedule (as in §8.1).
- **R2.9** Estimate a per-student learning-rate multiplier λ: the average surprise in θ after teaching moves, compared with the population default (Yudelson et al. 2013). Use λ in three places:
  - the study-plan forecast (how many sessions a goal will take);
  - fading speed;
  - estimates for concepts not yet tested.

### 2.3 Representations and explanations that work for this student

**Evidence**

- **Multiple representations help only under conditions.** [Ainsworth (2006)](https://eric.ed.gov/?id=EJ737858) (*Learning and Instruction* 16:183–198), the DeFT framework: the benefit depends on design, on the function each representation serves, and on the cognitive tasks it imposes. Translating between representations is itself hard.
- **The representation dilemma.** [Rau (2017)](https://link.springer.com/article/10.1007/s10648-016-9365-3) (*Educational Psychology Review* 29:717–761): students must learn content from representations they don't yet understand. They need *representational competencies*: knowing how a diagram maps onto the content, and fluency in reading it. Support for connecting representations matters.
- **Self-judgements of what helped are biased.**
  - By preference (Knoll et al. 2017, above).
  - By fluency: smooth input feels learned ([Koriat & Bjork 2006](https://link.springer.com/article/10.3758/BF03193244); [Deslauriers et al. 2019](https://www.pnas.org/doi/10.1073/pnas.1821936116)).

  So a representation's value must be inferred from **performance**, never from "that made sense".

**Inferring what works, as a refinement of `history/teacher-architecture.md` §6.6 (explanation memory)**

- **Score with residuals, not raw success.** Each recorded explanation gets `landed = mean(o − P)` over the next one or two **unassisted** probes on that concept, where P uses θ as it stood *before* the explanation.
- **Probe in a different representation from the explanation** where possible, so that success reflects understanding rather than a surface match.
- **Watch for the second-explanation confound.** A second explanation tends to look better simply because it comes second: more exposure, and regression to the mean. So:
  - compare explanation *kinds* across concepts in the same family, not within a single repair episode;
  - shrink toward a content prior: what usually works for this concept, from the Examiner's suggestion now and from aggregates if multi-student data ever exists.
- **Diagnose why a representation failed.** The failure type decides the remedy:

| Failure type | Symptom | Remedy |
|---|---|---|
| Misconception | Read the representation correctly, but the underlying belief is wrong | Refutation or contrast (§2.7) |
| Missing prerequisite | Can't use a term or operation the explanation relies on | Detour to the prerequisite |
| Representational competence | Can't read the diagram or notation itself | Teach the representation briefly if it's on the exam (pipeline diagrams, RISC-V assembly, memory tables); otherwise switch |
| Overload | Loses the thread, can't hold the pieces together | Split into parts; worked example; fewer elements on the board |

**CS 3410 representation catalogue.** The Examiner should store these per concept, so the director can choose deliberately:

| Concept | Representations |
|---|---|
| Two's complement | Bit-weight table (−8, 4, 2, 1); modular "number wheel"; algebraic 2ⁿ − x; invert-and-add-one procedure; adder overflow |
| Pointers | Box-and-arrow; address/value memory table; C code; `lw`/`sw` assembly; a gdb-style trace |
| Caches | Address bit-fields (tag \| index \| offset); a sets × ways table; an access trace with hits and misses; a library-shelf analogy |
| Pipelining | Pipeline diagram (instructions × cycles); datapath with pipeline registers; forwarding arrows; laundry analogy |
| Calling convention | Stack-frame diagram; register table (caller- or callee-saved); annotated prologue and epilogue |

**Design rules**

- **R2.10** Replace the profile field "representation that works" with a **posterior per (concept family × representation kind)**:
  - families: number encoding, memory and pointers, datapath and timing, code and procedure, and so on;
  - kinds: diagram, trace, worked code, analogy, algebraic or formal, contrasting cases, story.

  The prior comes from the content default. Update it with residuals. Explore occasionally, for example with Thompson sampling under heavy shrinkage, so a kind that was tried once and was unlucky isn't dropped for good. The director sees a summary such as "trace-first worked on the last two memory concepts (+0.6 logits)": the "transfer what works" use already in §6.6.
- **R2.11** After a failed explanation:
  1. Diagnose first: "Walk me through how you read this."
  2. Classify the failure using the table above.
  3. Change **one** thing (representation, grain size or example) so the outcome can be attributed.
  4. Never repeat the same explanation more loudly.
- **R2.12** Bridge back. If an analogy or an alternative representation worked, finish by mapping it onto the course's canonical representation, the one the exam uses, and probe in that form. An explanation has not "landed" until the student can work in the exam's representation.
- **R2.13** Treat the student's own words (§6.5 vocabulary) as a representation that has already worked: reuse them, then map them to the course terms.

### 2.4 Metacognitive calibration: confidence, accuracy and illusions of fluency

**Evidence**

- **Overconfidence produces underachievement.** [Dunlosky & Rawson (2012)](https://eric.ed.gov/?id=EJ964388) (*Learning and Instruction* 22:271–280). Students who judged wrong answers to be correct stopped studying too early. More accurate self-judgements predicted retention two days later, and this was not explained by feedback, effort or the number of trials.
- **Illusions of competence.** Judgements of learning are inflated when the answer is visible during study; testing and *delayed* judgements cure this:
  - Koriat & Bjork 2005 (*J. Exp. Psych.: Learning, Memory and Cognition* 31:187–194) named it "foresight bias";
  - [Koriat & Bjork 2006](https://link.springer.com/article/10.3758/BF03193244) (*Memory & Cognition*) showed the remedies.

  Nelson & Dunlosky (1991, *Psychological Science* 2:267–270) found that delayed judgements of learning are far more accurate than immediate ones.
- **The illusion of explanatory depth.** [Rozenblit & Keil (2002)](https://onlinelibrary.wiley.com/doi/10.1207/s15516709cog2605_1) (*Cognitive Science* 26:521–562). People overrate their understanding of causal mechanisms; their ratings drop once they try to explain step by step. The effect is strongest for *explanatory* knowledge, which is exactly CS 3410 material: why forwarding fixes this hazard, what happens on a cache miss.
- **Feeling of learning versus learning.** [Deslauriers et al. (2019)](https://www.pnas.org/doi/10.1073/pnas.1821936116) (*PNAS* 116:19251–19257). Physics students in active classes learned more but *felt* they learned less than students in fluent lectures. A tutor that explains smoothly will be rated highly and teach less.
- **Hypercorrection.**
  - Errors made with high confidence are *more* likely to be corrected after feedback, because the surprise focuses attention (Butterfield & Metcalfe 2001, *J. Exp. Psych.: LMC* 27:1491–1494; [2006 follow-up](http://www.columbia.edu/cu/psychology/metcalfe/PDFs/Butterfield_Metcalfe_2006.pdf)).
  - But [Butler, Fazio & Marsh (2011)](https://link.springer.com/article/10.3758/s13423-011-0173-y): the advantage lasts a week, and yet high-confidence errors also tend to *return*. They need a delayed re-probe.
- **Open learner models and self-assessment.** [Long & Aleven (2017)](https://link.springer.com/article/10.1007/s11257-016-9186-6) (*User Modeling and User-Adapted Interaction* 27:55–88) ran two classroom experiments with 302 students. A tutor that asked students to assess themselves before showing its own skill estimates, and shared control over problem selection, improved equation-solving outcomes.

**Design rules**

- **R2.14** Elicit confidence cheaply on about one scored item in three. Do it more often while the calibration estimate is uncertain, and less once it settles: "How sure, one to five?" or "Sure, or guessing?" Also code hedges in the transcript ("I think", "maybe", "is it…?") as a lower-weight confidence signal.
- **R2.15** Store calibration as numbers, not prose:
  - `calibration.bias` = mean(confidence − correctness), with confidence mapped to 0–1;
  - `calibration.resolution`: whether confident answers are more often right (for example the AUC or gamma between confidence and correctness);
  - the count n;
  - optionally, values per concept family.

  Shrink both toward 0 while n is small. This replaces the free-text "usually says 'sure' when wrong" in §6.5.
- **R2.16** Give "I get it" and "makes sense" **zero weight as knowledge evidence**. They are calibration data and the trigger for a check:
  - When bias > +0.15 (overconfident), follow every "got it" with a quick generative check (explain why, predict the next step, spot the error). Where the flow allows, delay it by a turn or two, to use the delayed-judgement effect.
  - When bias < −0.15 (underconfident), name the evidence: "You got the last three right. Your reasoning is sound."
- **R2.17** Never use "does that make sense?" as the check after a worked example or a smooth explanation. Ask a generative question instead.
- **R2.18** Handle high-confidence errors in four steps:
  1. state the student's answer;
  2. show the counterexample or contrast, ideally by running it (trace the bits, step the pipeline);
  3. have them re-derive the answer;
  4. **schedule a delayed re-probe** (a day or more later) on the same item family.

  This agrees with §6.4's rule that a misconception is "resolved" only after a probe at least a day later.
- **R2.19** Train calibration with the open learner model (§3.4). Before showing progress on can-do goals, ask "Which of these do you think you could do right now?" Then reveal the estimate and test one. Track the trend in bias across sessions: better calibration is an outcome in its own right.

### 2.5 Motivation: self-efficacy, interest, autonomy, affect

**Evidence**

- **Self-determination theory.** Intrinsic motivation and well-regulated learning are supported by **autonomy, competence and relatedness**. Sources: Ryan & Deci 2000 (*American Psychologist* 55:68–78); [Ryan & Deci 2020](https://selfdeterminationtheory.org/wp-content/uploads/2020/04/2020_RyanDeci_CEP_PrePrint.pdf) (*Contemporary Educational Psychology* 61:101860).
- **Choice.** [Patall, Cooper & Robinson (2008)](https://eric.ed.gov/?id=EJ787695) (*Psychological Bulletin* 134:270–300) analysed 41 studies. Choice raised intrinsic motivation, effort, task performance and perceived competence. The effect was strongest with **2–4 options**, and for choices that don't bear on instruction. Choices among instructional options, or many successive choices, helped less.
- **Self-efficacy.** Its strongest source is **mastery experience** (Bandura 1977, *Psychological Review* 84:191–215). Wins must be real; a win the student can see is easy does nothing.
- **Feedback.**
  - Kluger & DeNisi (1996, *Psychological Bulletin* 119:254–284): over a third of feedback interventions *reduced* performance, especially feedback that directs attention to the self.
  - Mueller & Dweck (1998, *J. Personality and Social Psychology* 75:33–52): praising intelligence undermined persistence after failure; praising effort or strategy did not.
  - Hattie & Timperley (2007, *Review of Educational Research* 77:81–112): feedback about the task, the process and self-regulation works; feedback about the self does not.
- **Interest-based personalization.**
  - Cordova & Lepper (1996, *J. Ed. Psych.* 88:715–730): personalizing incidental features and offering choice improved motivation and learning.
  - [Walkington (2013)](https://eric.ed.gov/?id=EJ1054444) (*J. Ed. Psych.* 105:932–945): in Cognitive Tutor Algebra, randomly assigned students got story problems rewritten around their interests. Performance improved on easy and hard knowledge components, and students formed better mental models of the problem situation.
  - A [2024 meta-analysis in *Educational Psychology Review*](https://link.springer.com/article/10.1007/s10648-024-09933-7) examines the "personalized learning by interest" effect on interest, cognitive load, retention and transfer.
  - The mechanism is engagement and comprehension of the situation. It is not deeper encoding of the concept.
- **Confusion.** [D'Mello, Lehman, Pekrun & Graesser (2014)](https://myweb.fsu.edu/vshute/pdf/confusion.pdf) (*Learning and Instruction* 29:153–170). Confusion induced by contradictions helps learning **if it is resolved**. Unresolved confusion turns into frustration or boredom, and then disengagement.
- **Gaming the system.** Students who game a tutor's help learn only about two-thirds as much ([Baker, Corbett & Koedinger 2004](https://link.springer.com/chapter/10.1007/978-3-540-30139-4_50)). Help-seeking is itself a skill many students lack (Aleven, Stahl, Schworm, Fischer & Wallace 2003, *Review of Educational Research* 73:277–320).
- **Mindset messaging.** Average effects are small (Sisk et al. 2018, *Psychological Science* 29:549–571), with modest effects for lower-achieving groups (Yeager et al. 2019, *Nature* 573:364–369). Not a lever to build around.

**Design rules**

- **R2.20** Make the quick win real. When self-efficacy looks low ("I'm bad at this", quitting early, long silences), pick an item at about 0.85 predicted success on a concept the student partly knows, then step up. Never use a trivial item (P > 0.95) as a fake win: students notice, and it builds no efficacy.
- **R2.21** Offer bounded choices where every option is good for learning:
  - which of two due concepts comes first;
  - which context to use for a problem (their interests, a game, their own laptop's CPU);
  - board or talk;
  - a break now or in five minutes.

  Never offer "skip this concept" as an option; offer "this now, or right after X".
- **R2.22** Keep feedback about the task and the process: "Your sign extension was right; the shift is where it broke." Never about the person: "you're smart". Praise named strategies the student used: "Checking the sign bit first was the right move."
- **R2.23** Use interests (store two to five) for problem contexts and analogies, mainly for motivation ("why cache locality matters for the game you play"). Only use one when it doesn't add irrelevant detail to work through. CS 3410 content is already concrete, so interests are a seasoning, not a strategy.
- **R2.24** Give confusion a budget. After a contrast or a try-first problem, allow productive struggle for a bounded window: about three student turns, or about two minutes, without progress. Then escalate help along the contingent ladder (R2.5). Shrink the window for students whose profile shows a frustration pattern.
- **R2.25** Handle help abuse by pairing help with practice. Rapid repeated "just tell me" or hint requests without attempts get a worked example, which is fine, followed *immediately* by a similar problem done unassisted. The help itself is not the problem; skipping the unassisted attempt is. Track `help_seeking.rapid_help_rate` as a gaming signal.

### 2.6 Goals, background and logistics

**Evidence.**
- Aligning effort with what will be assessed is the largest single lever for an exam-prep tutor. This is the Examiner's job (§5.6).
- Background predicts prior knowledge only roughly. Prior courses set priors; evidence overrides them.
- Achievement-goal research separates mastery goals from performance goals:
  - mastery-approach goals go with deeper processing;
  - performance-approach goals still predict grades.

  The student's stated goal ("just pass" versus "really get it") is therefore a legitimate input to *depth and breadth*. It is not an input to *accuracy standards*.

**Design rules**

- **R2.26** Store goals with timestamps: exam date, target ("pass", a grade, or "master"), the goal for this session, and minutes per day. A "just pass in 2 days" student gets triage:
  - the high-importance, frequently examined items;
  - explain-first plus practice;
  - honest statements about what won't be covered.

  The goal changes *which* concepts are taught and how deeply. It never lowers the bar for marking a goal met.
- **R2.27** Background sets priors only. Map prior courses and experience to priors on concept clusters, and keep σ large. For example: "took CS 2110, comfortable in Java" → a slight prior on loops, arrays and references; none on pointers, memory layout or assembly.
- **R2.28** The intro session's teach-versus-tutor preference is a weak prior on R2.2's thresholds, shifting them by at most ±0.25 logits. Evidence overrides it. This keeps the user's requirement that "the intro calibrates teach vs tutor" without letting a stated preference fix the pedagogy.

### 2.7 Persistent misconceptions and error patterns

**Evidence**

- **Errors are often systematic.** [Brown & Burton (1978)](https://www.semanticscholar.org/paper/Diagnostic-Models-for-Procedural-Bugs-in-Basic-Brown-Burton/a5ceacbbbf78b1b5ff55be25cb031fac63581359) (*Cognitive Science* 2:155–192, BUGGY) modelled students' subtraction errors as consistent "bugs": small changes to the correct procedure that predict future wrong answers.
- **Bugs can be unstable.** [Repair theory](https://onlinelibrary.wiley.com/doi/abs/10.1207/s15516709cog0404_3) (Brown & VanLehn 1980, *Cognitive Science* 4:379–426) explains many bugs as improvised repairs when a student hits an impasse. They can change between occasions ("bug migration"). **One wrong answer is not a belief.**
- **Misconceptions are knowledge in transition.** [Smith, diSessa & Roschelle (1993)](https://www.sri.com/publication/education-learning-pubs/misconceptions-reconceived-a-constructivist-analysis-of-knowledge-in-transition/) (*J. Learning Sciences* 3:115–163). They are built from pieces that are partly productive, and should be refined and reorganized, not just replaced. This supports §8.2's "start from what's right in the wrong answer".
- **AutoTutor's expectation-and-misconception dialogue** ([Graesser 2016](https://link.springer.com/article/10.1007/s40593-015-0086-4), *IJAIED* 26:124–132; [Nye, Graesser & Hu 2014](https://link.springer.com/article/10.1007/s40593-014-0029-5)).
  - Each question carries a list of expected good answers and a list of anticipated misconceptions.
  - Student turns are matched against both lists semantically.
  - Pump → hint → prompt → assertion cycles draw out the missing expectations, and detected misconceptions are corrected.
  - Reported gains are about 0.8 SD over reading a textbook for the same time.
- **Diagnostic questions.** In the Eedi data (the [NeurIPS 2020 Education Challenge](https://arxiv.org/abs/2007.12061), about 119k students), every wrong option of a multiple-choice question is written to represent a specific misconception. [Pelánek (2018)](https://www.fi.muni.cz/~xpelanek/publications/las18-observational-data.pdf) (Learning@Scale) found **wrong answers more informative than response times** for adaptive learning.
- **Errors return** after correction ([Butler et al. 2011](https://link.springer.com/article/10.3758/s13423-011-0173-y)), so resolution needs a delayed check.

**Design rules**

- **R2.29** Give each misconception record (§6.4) a **signature**: the wrong answers it predicts on which kinds of item. Example: "treats `>>` on a signed int as a logical shift" predicts `0x7FFFFFFF` for `-2 >> 1` (32-bit), where an arithmetic shift gives `-1`. Status moves from *suspected* to *confirmed* only when wrong answers on **two independent items** match the signature. This protects against one-off improvised repairs.
- **R2.30** Seed a misconception library per concept from the notes and the Examiner. Plausible CS 3410 entries:
  - sign extension versus zero extension;
  - arithmetic versus logical shift;
  - pointer arithmetic not scaled by element size;
  - byte order in little-endian memory;
  - "a cache stores single bytes" (it stores blocks);
  - "pipelining makes each instruction faster" (it raises throughput; per-instruction latency doesn't fall);
  - mixing up caller-saved and callee-saved registers;
  - signed versus unsigned overflow;
  - `sizeof` an array versus a pointer.

  The problem smith builds items whose distractors are these signatures (diagnostic questions).
- **R2.31** Remedy by refutation:
  1. elicit the student's prediction under their belief;
  2. run it (trace the bits, step the code) to show where the prediction fails;
  3. explain the correct model *as a refinement* of what was partly right;
  4. contrast the two side by side;
  5. later, give a delayed probe built to trigger the misconception.
- **R2.32** Keep slips apart from misconceptions. Recurring non-conceptual errors (dropping a sign, off-by-one in bit indices, hex-to-binary transcription) go in `slip_patterns`. The test: a slip is self-corrected when the student is asked to "check that"; a misconception isn't. Slips get a checking habit ("check the sign bit last"), not reteaching. They should not lower θ as much as conceptual errors: score o = 0.5 if the student self-corrects on a prompt.

### 2.8 Keeping personalization from becoming pandering

**Evidence**

- [Bastani et al. (2025)](https://www.pnas.org/doi/10.1073/pnas.2422633122) (*PNAS*), with about 1,000 high-school students:
  - unrestricted GPT-4 access raised practice performance by 48%, but cut exam performance by 17% once access was removed;
  - a guarded "tutor" version (hints, not answers) raised practice performance by 127% and largely removed the harm.

  Students use an unguarded AI as a crutch.
- Students' feelings are a poor guide to their learning ([Deslauriers et al. 2019](https://www.pnas.org/doi/10.1073/pnas.1821936116)). Learner control is not reliably good for novices ([Kirschner & van Merriënboer 2013](https://research.ou.nl/en/publications/do-learners-really-know-best-urban-legends-in-education/)).
- [Tutor CoPilot (Wang et al. 2024)](https://arxiv.org/abs/2410.03017), an RCT with 900 tutors and 1,800 students. AI guidance shifted human tutors toward guiding questions and away from giving answers. Topic mastery rose 4 percentage points overall, and 9 points for students of lower-rated tutors.

**Guardrails.** These are hard constraints on the director, independent of any profile field.

- **G1 The destination is fixed.** Exam targets T_c and the mastery criteria (R2.6) never adapt to preferences or affect. Only the route does.
- **G2 Honest credit.** Assisted successes are discounted (§6.1's w = 1 − a). Grading is never softened for rapport.
- **G3 A difficulty floor.**
  - Outside warm-ups, at most 20% of scored items have predicted success above 0.9.
  - Each concept in focus gets at least one generative item (explain-why, spot the error, or transfer) per session.
- **G4 Few full answers.** A full solution comes only after the contingent ladder is exhausted, or inside a worked-example move followed by an unassisted similar problem (R2.25).
- **G5 Preferences shape form; evidence shapes substance.** "I prefer you just explain" may raise the share of explain-first moves within the band. It never removes retrieval checks or generative items.
- **G6 Judge personalization by delayed, unassisted performance**: never by in-session success or by student ratings.

---

## 3. Student modelling

### 3.1 The knowledge-tracing family, and what Plato should use

| Model | How it works | Strengths | Weaknesses for Plato |
|---|---|---|---|
| **BKT** ([Corbett & Anderson 1994](https://link.springer.com/article/10.1007/BF01099821)) | Hidden binary state per skill (known or unknown). Parameters: P(L₀), P(T) for learning, P(G) for guess, P(S) for slip. Mastery at P(L) ≥ 0.95. | Interpretable. Powers Cognitive Tutor. | Binary state; no item difficulty; guess and slip are hard to identify; one skill per step. |
| **Individualized BKT** ([Yudelson, Koedinger & Gordon 2013](https://link.springer.com/chapter/10.1007/978-3-642-39112-5_18)) | Per-student parameters, hierarchical | A per-student *learning rate* helps prediction more than a per-student prior | Needs many students to fit |
| **IRT, AFM, PFA** ([Pavlik, Cen & Koedinger 2009](https://files.eric.ed.gov/fulltext/ED506305.pdf)) | Logistic in ability, difficulty, and counts of past successes and failures | As good as or better than BKT; easy to extend to several skills | Offline fitting |
| **Elo** ([Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf), *Computers & Education* 98:169–179) | Online update θ ← θ + K(o − P) and d ← d − K(o − P), with K decaying | Simple; works from the first answer; used at scale in adaptive practice | Point estimate unless uncertainty is added |
| **Glicko-style Elo** (Glickman 1999, *Applied Statistics* 48:377–394) | Elo plus a variance per player, which grows with time away | A principled uncertainty for each concept | Nothing major |
| **DKT** (Piech et al. 2015, [NeurIPS](https://dl.acm.org/doi/10.5555/2969239.2969296)) | LSTM over interaction sequences | Best on large benchmarks | Needs large data from many students; opaque. [Khajah, Lindsey & Mozer (2016)](https://arxiv.org/abs/1604.02416): BKT extended with forgetting, individual ability and skill discovery matched DKT. |
| **LLM-based tracing in dialogue** ([Scarlatos et al. 2025, LAK](https://arxiv.org/abs/2409.16490)) | GPT-4o annotates each student turn with correctness and knowledge components; tracing models run on the labels. Their LLM-based tracer best predicted correctness in tutoring dialogues. | Works on free dialogue | Labelling noise |
| **LLM as the learner model** ([Hooshyar et al. 2025](https://arxiv.org/abs/2512.23036)) | The LLM predicts correctness and mastery directly | No training needed | DKT reached AUC 0.83; a fine-tuned LLM was about 6% lower, with **unstable and incoherent mastery trajectories across skills** |
| **Language Bottleneck Models** ([Berthon & van der Schaar 2025](https://arxiv.org/abs/2506.16982)) | One LLM writes a *text* summary of the knowledge state; another predicts performance from it | Captures misconceptions in words; accuracy competitive with tracing; sample-efficient | Summaries drift; best as a complement |
| **Difficulty-aware dialogue tracing** ([arXiv 2605.01097](https://arxiv.org/abs/2605.01097), 2026) | An LLM estimates knowledge and the difficulty of each tutor turn; an IRT layer predicts correctness | The same split as Plato: LLM perception, statistical ability scale | New |

[Pelánek (2017)](https://link.springer.com/article/10.1007/s11257-017-9193-2) (*User Modeling and User-Adapted Interaction* 27:313–350) surveys the field. Logistic and Elo-type models are usually as accurate as BKT or better, and easier to extend.

**Plato's current design is the right family.** §6.1 combines a Rasch-style success probability with a Kalman-gain update and a variance that grows with time: a single-student, online Bayesian IRT, essentially Glicko for concepts. It suits sparse data, many concepts, items of known difficulty and a new course with no population data.

**Design rules**

- **R3.1** The LLM annotates and code traces. The director's answer check emits:
  - o ∈ [0, 1];
  - the assistance level a;
  - concept tags with weights;
  - any misconception-signature match;
  - for explanations, a rubric level.

  Code applies the θ/σ update. Free-text notes in the style of Language Bottleneck Models sit beside the numbers, for misconceptions and the profile, but never replace them. This matches the architecture decision that the learner model is "updated from the director's answer checks", with no extra model call per line.
- **R3.2** Add a guessing floor for low-information items. For yes/no and two-option voice checks, use the 3PL form P = g + (1 − g)·σ(θ − d) with g = 0.5 (about 0.25 for four options). A correct "yes" then barely moves θ. Many quick voice checks are effectively yes/no, so without this they inflate θ.
- **R3.3** Use a hierarchical prior: θ_c = μ_student + δ_cluster + ε_c.
  - Early observations update μ (the student's overall level) and the cluster offset, so untested concepts get interpolated estimates, as already decided, with a larger σ.
  - Propagate along prerequisite edges, following knowledge space theory's "surmise" logic as in ALEKS. A success on c is weak positive evidence for c's prerequisites. A failure traced to a prerequisite updates the prerequisite (as in §6.3).
- **R3.4** Add a per-student learning-rate multiplier λ (R2.9) on the expected gain from teaching moves. It is fitted from how θ moves after instruction, and shrunk toward 1.
- **R3.5** Don't build DKT or any trained neural tracer: there is no multi-student data. Revisit only if many students use the same course.
- **R3.6** Treat mastery thresholds and σ cutoffs as tunable parameters, and tune them in simulation (§6). The threshold choice matters more than the model ([Pelánek & Řihák 2017](https://dl.acm.org/doi/10.1145/3079628.3079667)).

### 3.2 Modelling misconceptions, not just mastery

Mastery-only models flatten "doesn't know X yet" and "confidently believes not-X" into the same low θ. They call for different moves: teaching versus refutation. §2.7 covers the evidence. The model side:

- **Belief update.** For misconception m with signature S_m:

  P(m | wrong answer w) ∝ P(w | m) · P(m)

  - P(w | m) is high when w matches S_m's prediction for that item.
  - The prior P(m) comes from how common the misconception is (the Examiner's library), and rises if a related misconception is confirmed.
- **Disconfirming evidence counts.** A correct answer on an item where m would have fired lowers P(m). A misconception that never shows on several opportunities where it should have fired decays from *suspected* back to absent.
- **Status machine.** §6.4 is kept as is (suspected → confirmed → addressed → resolved, with a delayed probe). It is consistent with repair theory (confirmation needs two independent items) and with return after hypercorrection (resolution needs a delayed probe).
- **Explanations count as evidence too.** AutoTutor-style matching applies to free-form explanations: the director tags an explanation turn against the concept's expectations and misconceptions. An explanation that states the misconception ("the cache just keeps the byte you asked for") is strong evidence, stronger than one wrong numeric answer.

### 3.3 Updating the picture from dialogue: which signals are reliable

| Signal | Informs | Reliability | Rule |
|---|---|---|---|
| Unassisted answer to a scored item of known difficulty | θ_c | High | Full update |
| The *specific* wrong answer or wrong step | Misconception, or blame on a prerequisite | High for diagnosis; wrong answers beat response times ([Pelánek 2018](https://www.fi.muni.cz/~xpelanek/publications/las18-observational-data.pdf)) | Update the misconception likelihood; route to the prerequisite |
| First-step answer ([Kalyuga & Sweller 2005](https://link.springer.com/article/10.1007/BF02504800)) | Level of the student's plan for c | Medium-high, and fast | Graded update (o = 1 for a high-level plan, 0.5 for a correct local step, 0 for none) |
| Explanation or teach-back, graded against a rubric | Depth: whether they can explain | Medium (LLM grading noise) | Update θ on explain-level items; set `explain_level` |
| Assisted answer | θ_c (weak) | Low-medium | Discount by w = 1 − a (§6.1) |
| Student's own questions | Deep questions (why, how, what if) are positive evidence; questions that reveal a missing prerequisite are negative evidence on it | Medium. Question quality tracks achievement (Graesser & Person 1994, *AERJ* 31:104–137) | Half-weight evidence (§6.3) |
| Stated confidence, hedges | Calibration | Medium for calibration; low for knowledge | Calibration update only |
| "I get it", "makes sense" | Nothing about knowledge | Low | Triggers a check (R2.16); a calibration datum |
| Response latency, hesitations, fillers (voice) | Uncertainty, load | Low-medium; confounded by speech-recognition timing, thinking style and turn-taking | Tie-breaker only; may prompt "what are you thinking?" |
| Help requests, "just tell me" | Need, affect, possible gaming | Low as a single event; medium as a pattern (rate, timing, before any attempt) | Feeds the gaming signal (R2.25) |
| Affect words, short replies, going off topic | Frustration, boredom, fatigue | Low-medium | Adjust the challenge band (R2.7); offer a break |
| Direct requests ("harder", "slow down", "quiz me") | Immediate control; preference | High for the immediate action; medium as a trait | Act now (within the guardrails); log |
| Self-reported preferences ("I'm visual", "I like examples") | `stated_preferences` | Low ([Knoll et al. 2017](https://www.semanticscholar.org/paper/Learning-style,-judgements-of-learning,-and-of-and-Knoll-Otani/f42acfc3165727abc334bce29edbb539c0ef269b)) | Weak prior only |

**Voice-specific evidence.** [Forbes-Riley & Litman (2011)](https://www.sciencedirect.com/science/article/abs/pii/S0167639311000318) (*Speech Communication* 53:1115–1136) built a spoken physics tutor that detected student uncertainty and responded with extra remedial content. It produced **significantly more learning** than a non-adaptive control. But uncertainty was detected by a human "wizard", and their error analysis shows real-time detection is the hard part. For Plato: adapting to uncertainty is worth doing, and explicit confidence elicitation (R2.14) is a more reliable sensor than prosody or latency.

**Design rules**

- **R3.7** Hysteresis. A profile field changes its *operative* value only after two consistent observations, or one strong one (a direct statement of a goal or a request). Single observations are logged with their evidence (§6.5's value, confidence and observations) but not acted on, except for immediate requests.
- **R3.8** Every profile update rides on the director's per-turn reading of the student (§8.1: act, request, target, understanding signal, affect), plus a `confidence` slot added there. No per-line assessment call.

### 3.4 Open learner model

- **The idea.** Open learner models make the model inspectable, and sometimes negotiable, by the student. That supports reflection, planning, trust, and the chance to contest a wrong estimate. Bull & Kay's SMILI framework (2007, *IJAIED* 17:89–120; [updated 2016](https://eric.ed.gov/?id=EJ1091260)) organizes the design space.
- **The best classroom evidence** for learning gains is [Long & Aleven (2017)](https://link.springer.com/article/10.1007/s11257-016-9186-6): self-assess first, then see the model, plus shared control over problem selection.
- **Rules:**
  - Show can-do goals and progress toward them, never θ numbers (§7.3 already does this).
  - Let the student contest: "I disagree, I can do this" triggers one probe, and the model updates on the result.
  - Ask for a prediction before revealing (R2.19).
  - The open model is also a guard against pandering: the student sees the real distance to the exam target.

### 3.5 Cold start: a short intake, then diagnostic probing

**Evidence**

- **ALEKS.** Its initial assessment is adaptive, typically 20–30 questions. It picks informative items across feasible knowledge states. Because of the "surmise" relations, one answer informs many items: a success on an advanced item implies its prerequisites ([knowledge space theory](https://www.aleks.com/about_aleks/knowledge_space_theory); [Cosyn et al. 2021](https://jmatayoshi.github.io/publications/JMP2021_KST_ALEKS_preprint.pdf)).
- **Computerized adaptive testing.** For estimation, the most informative item has P ≈ 0.5 at the current θ. That differs from the *teaching* target of about 0.7, so a diagnostic phase is a deliberately different mode.
- **First-step probes** diagnose a student's level on a task in seconds (Kalyuga & Sweller 2005).
- **Self-assessments** are biased (§2.4). They are useful as a weak prior and, compared against results, as a free first measure of calibration.

**Design rules**

- **R3.9** Intake: three minutes at most, conversational, extending §6.7. Cover:
  - the exam and its date;
  - the goal ("pass" or "master");
  - time per day;
  - prior courses and experience;
  - which topics feel easy or hard;
  - a 1–5 confidence rating on 4–6 course units: the baseline for calibration;
  - how they like sessions to run, from teach-heavy to try-heavy: a weak prior.

  Never ask about learning style.
- **R3.10** Diagnostic: about 8–12 items in about 10 minutes, as in §6.7.
  - Select items by information × importance, starting at the top of prerequisite chains, so a success implies the prerequisites.
  - Use first-step questions for procedural concepts and one explain-why question.
  - Aim for P ≈ 0.5–0.6.
  - Stop when time is up, or when σ falls below the cutoff on the high-importance concepts.
  - Frame it as "let me get a feel for where you are".
- **R3.11** At the end of the first session, compare self-ratings with diagnostic results to set the initial calibration bias. Tell the student gently: "You rated caches two out of five but got both cache questions. You know more than you think." This is honest feedback, and it starts calibration training.
- **R3.12** Where R2.2's decision is genuinely borderline in session 1, alternate explain-first and try-first. This gives `order_response` its first data. It is exploration where the choice is uncertain anyway, not a "style test".

---

## 4. Adaptive tutoring systems with evidence: what to copy and what not to

### 4.1 Cognitive Tutor / MATHia (Carnegie Learning)

**What it does.**
- **Model tracing:** each student step is matched against production rules, including "buggy" rules, so the tutor gives immediate, specific feedback at the level of a single step.
- **Knowledge tracing** with BKT; students move on at P(L) ≥ 0.95 ([Corbett & Anderson 1994](https://link.springer.com/article/10.1007/BF01099821)).
- **Problem selection** targets unmastered skills.

**Evidence.**
- [Pane, Griffin, McCaffrey & Karam (2014)](https://www.rand.org/pubs/external_publications/EP50410.html) (*Educational Evaluation and Policy Analysis*, RAND). Schools in seven states were randomized in matched pairs. There was no effect in year one, and **+0.21 SD for high-school students in year two**, as schools learned to implement it.
- [VanLehn (2011)](https://eric.ed.gov/?id=EJ946764): step-based tutors d ≈ 0.76 against no tutoring; answer-based tutors d ≈ 0.31.
- [Salden et al. (2010)](https://link.springer.com/article/10.1007/s11251-009-9107-8) *improved* Cognitive Tutor by adding adaptively faded worked examples.

**Copy:**
- step-level diagnosis: ask for the step and the reasoning, not just the final answer;
- buggy rules, which become Plato's misconception signatures;
- mastery gating;
- adaptive fading.

**Don't copy:** a problem-only path for novices (expertise reversal).

### 4.2 ASSISTments (Heffernan, WPI)

**What it does.** Online homework with immediate correctness feedback and on-demand hints, plus reports for teachers. Adaptivity is modest.

**Evidence.** [Roschelle, Feng, Murphy & Mason (2016)](https://files.eric.ed.gov/fulltext/EJ1194398.pdf) (*AERA Open* 2(4)) ran a randomized trial with about 2,800 seventh graders in 43 schools:
- **g = 0.18 overall**;
- **g = 0.29 for students with lower prior achievement**, versus 0.12 for those with higher.

**Lesson.** Immediate feedback plus hints on practice captures much of the gain without elaborate modelling, and the benefit concentrates in weaker students. Plato should get the basics right first: immediate feedback on every attempt and graded hints.

### 4.3 ALEKS (knowledge space theory)

**What it does.**
- Knowledge states are the feasible sets of mastered items, linked by prerequisite ("surmise") relations (Doignon & Falmagne).
- An adaptive initial assessment locates the student's state.
- Instruction is offered on the **outer fringe**: items whose prerequisites are all mastered, meaning "ready to learn".

**Evidence.** [Fang, Ren, Hu & Graesser (2019)](https://eric.ed.gov/?id=EJ1232632) (*Educational Psychology* 39:1278–1292) meta-analysed 15 studies with 24 samples. ALEKS was **as good as, but not better than, traditional classroom instruction**, with larger effects when it was used for shorter periods.

**Copy:**
- the outer-fringe idea, which is Plato's prerequisite-readiness factor R_c in §7.4;
- surmise-based diagnosis, for efficient cold start.

**Caution.** Precise estimation of the knowledge state does not, by itself, produce more learning than good teaching. What is taught at the fringe, and how, matters as much.

### 4.4 Duolingo's half-life regression, and why it suits vocabulary, not concepts

**What it does.** [Settles & Meeder (2016)](https://aclanthology.org/P16-1174/) (ACL) predict recall as p = 2^(−Δ/h), where Δ is the time since last practice and the half-life is h = 2^(Θ·x).
- The features x are counts of past correct and incorrect attempts, plus indicators for each word.
- It was trained on about 13 million practice traces.

**Evidence.**
- It roughly halved recall-prediction error (MAE at least 45% lower than the Leitner system Duolingo was using).
- In an operational experiment over six weeks with about a million students, it **raised daily student engagement by about 12%**, with one daily-retention measure up 9.5%.

Note what was measured: engagement and return rates, not externally assessed learning.

**Why the design suits vocabulary:**
- items are many, small and roughly independent (word ↔ meaning);
- the target behaviour is *recall of a fixed mapping*;
- the main failure is *forgetting*;
- there is large data per item, pooled across millions of users;
- repeating the identical item is legitimate practice.

**Why it doesn't fit conceptual understanding:**
- concepts are few and *interdependent* (prerequisites);
- the target is *transfer and explanation*, not recall;
- failures come from *misconceptions and missing prerequisites* more than decay;
- repeating the same item turns into memorizing its answer.

Half-life regression has no notion of why a student is wrong, or of what a concept depends on.

**Plato.** Keep the §6.2 half-life model for the **retrieval layer**: facts and fluencies that do behave like vocabulary. In CS 3410:
- RISC-V instruction formats and opcodes;
- register roles in the calling convention;
- powers of two and hex digits;
- cache formulas.

Spaced retrieval of these is valuable. Conceptual sequencing should come from θ, prerequisites and misconceptions, not from the half-life model. The "due" term in the §7.4 scheduler already mixes the two appropriately.

### 4.5 AutoTutor (Graesser): conversational precedent

- **What it does.** Expectation-and-misconception dialogue with pump → hint → prompt → assert cycles.
- **Evidence.** About 0.8 SD over reading a textbook for the same time ([Graesser 2016](https://link.springer.com/article/10.1007/s40593-015-0086-4); [Nye, Graesser & Hu 2014](https://link.springer.com/article/10.1007/s40593-014-0029-5)).
- **Copy:** per-question lists of expectations and misconceptions; covering every expectation before moving on; the hint ladder.

An affect-sensitive AutoTutor and the spoken ITSPOKE ([Forbes-Riley & Litman 2011](https://www.sciencedirect.com/science/article/abs/pii/S0167639311000318)) show that adapting to uncertainty and affect can add learning. Reliable detection is the bottleneck.

### 4.6 The LLM era: what the trials show

| Study | Design | Result | Lesson for Plato |
|---|---|---|---|
| [Bastani et al. 2025, *PNAS*](https://www.pnas.org/doi/10.1073/pnas.2422633122) | Field experiment, about 1,000 high-school math students; GPT-4 "Base" versus a guarded "Tutor" | Base: +48% on practice, −17% on the exam once access was removed. Tutor: +127% on practice, harm largely removed | Guardrails against handing out answers are necessary (G1–G6) |
| [Kestin et al. 2025, *Scientific Reports*](https://www.nature.com/articles/s41598-025-97652-6) | Crossover RCT, 194 Harvard physics students; AI tutor versus in-class active learning | Median learning gains **more than doubled**, in 49 minutes versus 60 | The tutor was built on research-based pedagogy: step-by-step scaffolding, solution guidance written in advance, self-pacing. The gains come from structure grounded in correct content, delivered one-to-one |
| [LearnLM / Eedi RCT 2025](https://arxiv.org/abs/2512.23633) | 165 students in 5 UK schools; LearnLM drafted tutor messages under human supervision | Supervisors approved 76.4% of drafts with zero or minimal edits. At least as good as human tutors on every outcome; **66.2% versus 60.7%** solved novel problems on later topics | A pedagogically tuned model plus a diagnostic-question platform (misconception-coded items) works |
| [Tutor CoPilot, Wang et al. 2024](https://arxiv.org/abs/2410.03017) | RCT, 900 human tutors and 1,800 K-12 students | +4 percentage points topic mastery; +9 for lower-rated tutors; more guiding questions, fewer answers given away | Expert-like move selection (the director's job) is where the value is |
| [Leite et al. 2025](https://arxiv.org/abs/2511.04997) (meta-analysis) | U.S. K-12 tutoring systems: 18 studies, 77 effect sizes | g = 0.27. Provision of worked examples was among the key moderators | Effects are real but moderate; worked examples matter |
| [Hooshyar et al. 2025](https://arxiv.org/abs/2512.23036) | LLM versus DKT as the learner model | The LLM was less accurate and its mastery estimates incoherent over time | Keep statistical tracing (R3.1) |
| [CoMeT, Hou et al. 2026](https://arxiv.org/abs/2609.22993) | Within-subjects, 131 adults, Python tasks | Contingent escalation and fading: help when needed, few full answers, less frustration | Contingent help ladder (R2.5) |

**Takeaway.** In the LLM era, the measured gains come from **pedagogical structure**: guardrails, scaffolding, grounding in correct solutions, mastery feedback and expert move selection. The personalization with the strongest evidence is still *adapting to knowledge state and misconceptions*. Adapting to traits beyond those is second-order, and must be judged against a θ-only baseline (§6).

---

## 5. Proposed learner-profile schema

This extends `history/teacher-architecture.md` §6 and does not replace it. Every field keeps §6.5's convention: **a value, a confidence (or n and σ), and the evidence behind it.** Fields marked *(code)* are updated by deterministic code from the director's annotations. Fields marked *(director)* are written by the director's per-turn reading, with hysteresis (R3.7).

```ts
type Evidence = { t: string; session: string; turn: number; kind: string; detail: string };

interface LearnerProfile {
  // ── Knowledge (code) ────────────────────────────────────────────
  concepts: Record<ConceptId, {
    theta: number; sigma: number;          // §6.1: Rasch probability + Kalman gain (Glicko-like)
    half_life_days: number; last_seen: string;   // §6.2: retrieval layer
    explain_level: 0 | 1 | 2 | 3;          // strongest evidence: 0 none, 1 recognize, 2 apply, 3 explain/transfer
    fade_level: 0 | 1 | 2 | 3;             // worked → faded → solo → variation (R2.3)
    evidence: Evidence[];
  }>;
  student_offset: { mu: number; sigma: number };            // hierarchical overall ability (R3.3)
  cluster_offsets: Record<ClusterId, { delta: number; sigma: number }>;
  learning_rate: { lambda: number; n: number };             // R2.9 / R3.4, shrunk toward 1.0

  // ── Misconceptions and slips (director tags; code updates belief) ──
  misconceptions: Array<{
    id: string; concept: ConceptId;
    sentence: string;                       // "treats >> on signed ints as a logical shift"
    signature: Array<{ item_kind: string; predicts: string }>;   // R2.29
    p: number;                              // belief, from §3.2's update
    status: 'suspected' | 'confirmed' | 'addressed' | 'resolved';   // §6.4
    last_probe?: string; evidence: Evidence[];
  }>;
  slip_patterns: Array<{ pattern: string; count: number; self_correct_rate: number }>;   // R2.32

  // ── Calibration (code) ──────────────────────────────────────────
  calibration: {
    bias: number;            // mean(confidence − correct), on 0–1; + means overconfident
    resolution: number;      // AUC of confidence vs correctness
    n: number;
    by_cluster?: Record<ClusterId, { bias: number; n: number }>;
    trend: number;           // change in |bias| per session (R2.19)
  };

  // ── What works for this student (code, from residuals) ─────────
  representation_response: Record<ConceptFamily,
    Record<RepKind, { mean_residual: number; n: number }>>;            // R2.10
  order_response: { try_minus_explain: number; n_try: number; n_explain: number };  // R2.4
  challenge: { band: [number, number]; disengage_events: Evidence[] };        // R2.7
  help_seeking: { hint_rate: number; rapid_help_rate: number; gaming_score: number };   // R2.25

  // ── Motivation and affect (director) ───────────────────────────
  self_efficacy: Record<ClusterId, { level: 'low' | 'mid' | 'high'; confidence: number; evidence: Evidence[] }>;
  affect_pattern: { triggers: string[]; recoveries_that_worked: string[] };   // "short after 2 misses"; "a quick win"
  interests: string[];                                                        // 2–5
  autonomy: { choices_offered: number; choices_taken: number; overrides: Evidence[] };

  // ── Goals and context (director, from intake and conversation) ──
  goals: { exam_date?: string; target: 'pass' | 'grade' | 'master'; grade?: string;
           session_goal?: string; minutes_per_day?: number; updated: string };
  background: { prior_courses: string[]; experience: string[] };     // priors only (R2.27)
  stated_preferences: { teach_vs_try?: number; pace?: string; register?: string;
                        modality?: string };                         // weak priors (R1.1, R2.28)
  vocabulary: Array<{ student_term: string; course_term: string }>;  // §6.5 / R2.13
}
```

### 5.1 Fields: how each is inferred and how the director uses it

| Field | Inferred from | Update rule | Director uses it to… |
|---|---|---|---|
| `concepts[c].theta`, `.sigma` | Scored answers (o, a, d), explanations, questions | §6.1 Kalman/Elo update; 3PL guessing floor for yes/no items (R3.2); variance grows with time | Choose the move and its difficulty in the target band; choose explain-first versus try-first (R2.2); apply the mastery gate (R2.6) |
| `student_offset`, `cluster_offsets` | All answers | Hierarchical update (R3.3) | Estimate untested concepts; set the diagnostic order |
| `learning_rate.lambda` | How θ changes after teaching moves | Running ratio to the expected gain, shrunk toward 1 | Forecast the plan; set fading speed |
| `explain_level` | Explain-why, teach-back and transfer items | Highest level passed unassisted, with decay | Mastery gate; choose the next move type |
| `fade_level` | The student's correct predictions of worked steps | +1 when the step type is predicted correctly; −1 after two failures | Choose worked, faded, solo or variation |
| `misconceptions[]` | Wrong answers matching a signature; explanations that state the belief | Bayesian p; status machine (§6.4, §3.2) | Schedule refutation (R2.31); choose distractor items; schedule delayed probes |
| `slip_patterns[]` | Errors self-corrected on "check that" | Counts | Coach a checking habit; partial credit |
| `calibration.*` | Confidence ratings and hedges against correctness; self-ratings against results | Running means, shrunk | How often to probe after "got it" (R2.16); how often to elicit confidence (R2.14); open-model prediction exercises |
| `representation_response` | Residual (o − P) on the next unassisted probes after an explanation kind | Running mean per family × kind; Thompson-style exploration | Choose a representation for a new or failed explanation (R2.10, R2.11) |
| `order_response` | Delayed residuals after try-first versus explain-first | Means, shrunk until 6 or more of each | Nudge R2.2's thresholds by up to ±0.5 |
| `challenge.band` | Disengagement events against difficulty | Slow adjustment | Set the target success band within limits (R2.7, G3) |
| `help_seeking` | Timing and rate of hint requests relative to attempts | Rolling rates | Pair worked examples with unassisted similar problems (R2.25) |
| `self_efficacy` | Statements, early quitting, success history | Hysteresis | Real quick wins (R2.20); how feedback is framed |
| `affect_pattern` | The director's per-turn affect reading | Pattern after 2 or more occurrences | Pre-empt: shorten the confusion window (R2.24); offer a break |
| `interests` | Intake; mentions in conversation | Append | Problem contexts and analogies (R2.23); bounded choices (R2.21) |
| `autonomy` | Choices offered, taken and overridden | Counts | Keep offering 2–4 option choices; respect overrides within G1–G6 |
| `goals` | Intake; mid-session statements | Overwritten with a timestamp | Scheduler weights; triage mode (R2.26) |
| `background` | Intake | Static | Priors on clusters (R2.27) |
| `stated_preferences` | Self-report | Static unless restated | Weak priors (R1.1, R2.28) |
| `vocabulary` | The student's own terms | Append | Reuse, then map to course terms (R2.13) |

### 5.2 How the director uses the profile each turn

The director runs this at each decision point. It is a policy sketch, not code to paste; the scheduler (§7.4) is unchanged.

1. **Read** the student's last turn (§8.1, plus a `confidence` slot), then update the profile:
   - code updates θ/σ, misconceptions and calibration;
   - the director writes affect and goals, with hysteresis.
2. **Honour immediate requests** ("slow down", "show me", "harder", "skip") within the guardrails G1–G6.
3. **Pick the concept** from the scheduler's top three (unchanged). Confirmed misconceptions and overdue delayed probes take priority.
4. **Pick the instruction mode**: prerequisite detour, first-step probe, explain-first, try-first, or problem-only (R2.2). Then pick the move on the ladder, using `fade_level` (R2.3).
5. **Pick the difficulty** inside the challenge band (R2.7, G3).
6. **Pick the representation** (R1.2, R2.10): content default, then evidence, then stated preference as a tie-breaker. After a failure, diagnose first (R2.11).
7. **Add a probe if due:**
   - confidence elicitation (R2.14);
   - a generative check after "got it" (R2.16);
   - a misconception probe (R2.29–R2.31);
   - an open-model prediction (R2.19).
8. **Write the move card**, including a one-line **why** that cites profile evidence. Example: "explain-first: θ −1.2 versus d +0.3, interactivity high; trace-first worked on the last two memory concepts (+0.6)". The actor performs the card; the next turn's reading closes the loop.

The "why" line makes personalization auditable. In evals (§6) it is checked against the profile that actually existed at that moment.

---

## 6. Evaluation design: did the tutor adapt correctly?

### 6.1 Why simulated students must hold their beliefs in code

Recent work shows that LLM-simulated students are not a reliable stand-in for real ones:
- **Simple prompting simulates students poorly.** Fine-tuning and preference optimization improve it, but it remains limited. Scarlatos, Lee, Woodhead & Lan ([ACL 2026](https://arxiv.org/abs/2601.04025)) measured simulators on linguistic, behavioural and cognitive dimensions.
- **Simulators flip.** An LLM given a misconception persona abandons it at *any* corrective signal, whether or not the feedback addresses the misconception. It behaves like a problem solver, not a student with a belief ([Do, Sonkar & Sachan 2026](https://arxiv.org/abs/2605.12748), with their "Selective Flip Score").
- **Explicit learner states help.** Conditioning on code-defined states narrows the gap with real sessions. [DAS2 (Meng & Lin 2026)](https://arxiv.org/abs/2609.12331) reduced the correctness-rate gap from 0.54 to 0.20 for gaming, and from 0.51 to 0.18 for wheel-spinning.

A prompt-only simulated student would therefore let Plato "fix" misconceptions with any feedback, and make personalization look better than it is.

**Design.**
- The simulated student's knowledge, misconceptions, confidence, affect and help-seeking are a **state machine in code**.
- Code decides the *content* of each answer: right, the wrong answer the misconception predicts, a slip, or "I don't know".
- An LLM only turns that content into natural speech, adding hedges that match the code's confidence.
- A cheap check verifies that the paraphrase kept the content.

This runs in the sandbox, on a `LUNA_DATA_DIR` copy on port 5199, with the text stand-in and **no ElevenLabs sessions**.

### 6.2 The simulator's generative model (ground truth)

```
true θ_c per concept (with prerequisite structure), true λ (learning rate)
P(correct | item) = g + (1−g)·σ(θ_true − d)            # g = guessing floor for 2- and 4-option items
misconceptions m: if the item triggers m, answer = signature(m) with probability p_fire(m)
   p_fire decays only under a TARGETED refutation (R2.31) followed by a correct re-derivation;
   untargeted feedback leaves it unchanged; after a delay of Δ days it can return with probability r
slips: with probability s, flip one bit / sign / index; self-correct when asked "check that"
learning: after move M on concept c, θ_true += λ_true · gain_M(θ_true − d, interactivity_c, rep_kind)
confidence: reported = clip(σ(θ_true − d) + bias_true + noise, 0, 1); "I get it" emitted per bias_true
affect: frustration += on each failure and on confusion past budget_true; −= on success;
        disengages (short replies, "can we stop") above a threshold
help-seeking: requests hints before trying with probability h_true
stated preferences: may be FALSE (e.g. "I'm a visual learner" with zero true rep effect)
forgetting: true half-life per concept
```

**Avoiding circularity.** If `gain_M` simply encoded this brief's theory (expertise reversal and so on), the evaluation would only show that Plato follows the brief. So the response functions are **randomized across simulated populations**:
- **World A (expertise reversal).** Worked examples give large gains at low θ and slightly negative gains at high θ.
- **World B (productive failure).** Try-first beats explain-first at moderate gaps on low-interactivity concepts.
- **World C (representation-sensitive).** For this student only, diagrams add +0.8 logits of gain on memory and pointer concepts; analogies add nothing.
- **World N (null).** Only θ matters. No trait has any causal effect on learning.

The tutor should **detect and exploit structure where the truth contains it, and not invent structure in World N.** This tests the *inference*, separately from whether the pedagogical theory is right. That second question can only be answered with real students.

### 6.3 Personas, and what correct adaptation looks like

Each persona has a **null twin**: the same θ profile with neutral traits.

| Persona | True traits | Correct adaptation (assertions checked in the logs) |
|---|---|---|
| **P1 Anxious novice** | Low θ; bias −0.25 (underconfident); quick to frustrate; small confusion budget | Early moves are explain-first, worked or faded. After two misses the band rises to about 0.8–0.85. The "quick win" sits at P 0.8–0.9, not above 0.95. Feedback is about the process. Success evidence is named |
| **P2 Overconfident and fluent** | Mid θ; bias +0.3; says "I get it" often | Confidence is elicited more often than with the twin. "Got it" → generative check, usually within two turns. Estimated bias converges to within ±0.1 of the truth. High-confidence errors get a contrast *and* a delayed re-probe |
| **P3 Strong and easily bored** | High θ on most clusters | After the first evidence, the worked-example rate is near 0. Faster fading. More transfer, combine and explain-why moves. The diagnostic ends early |
| **P4 Misconception holder** | Two CS 3410 bugs (e.g. logical/arithmetic shift; pointer arithmetic not scaled) | Status reaches *confirmed* within N items where the bug fires, with no confirmation from a single item. Refutation within two turns of confirmation. Not marked *resolved* within the same session. A delayed probe is scheduled. Untargeted feedback is not counted as a fix |
| **P5 Gamer** | Asks for hints before trying (h = 0.6) | The gaming signal rises. Worked examples are followed by unassisted similar problems. The full-answer rate stays under the cap. θ is not inflated by assisted successes |
| **P6 Stated visual (myth control)** | Says "I'm a visual learner"; true representation effect is zero (World N) | The share of diagrams is not significantly different from the null twin's (content-driven). No lock-in on visuals. Plato never talks about learning styles |
| **P7 Representation-sensitive** | World C | After evidence, the share of diagrams on memory concepts rises above the twin's. Residual scores identify the diagram kind. Probes still end in the canonical representation (R2.12) |
| **P8 Crammer** | Exam in 2 days; goal "pass"; mid θ | The plan triages to high-importance exam items. Explain-first plus practice. Honest about coverage. **Mastery criteria unchanged** |
| **P9 Fast learner versus slow learner** | λ = 1.6 versus 0.6, same initial θ | λ is estimated in the right direction within about 2 sessions. The plan forecast and fading speed differ accordingly |

### 6.4 Metrics

**A. Model recovery.** Does Plato's picture converge on the truth?
- RMSE(θ̂, θ_true) over turns.
- **Interval coverage**: how often θ_true falls inside θ̂ ± 1.28σ. It should be about 80%. If it is much lower, σ is overconfident.
- For misconceptions:
  - detection precision and recall;
  - turns to confirmation;
  - false confirmations from one-off slips.
- Error in the estimates of calibration bias and λ.
- **Profile stability**: the number of flips in operative values. It should be low on stationary students and fast when the truth changes, for example when a mid-run event makes the student frustrated.

**B. Is the policy correct? The counterfactual swap test.**
- Run persona pairs that differ in **exactly one** true trait:
  - bias +0.3 versus −0.3;
  - low versus high θ on one cluster;
  - representation effect on versus off;
  - gaming on versus off;
  - λ high versus low;
  - World A versus World B.
- Personalization is *correct* when two things hold:
  1. **Sensitivity**: the behaviour metric tied to that trait differs in the predicted direction. For example, the rate of confidence elicitation is higher for bias +0.3.
  2. **Specificity**: behaviour metrics tied to *other* traits don't change.
- This is the clearest operational meaning of "adapted to this student", and the main test.

**C. Outcomes, with ablations.** Simulated delayed post-test: true θ on exam targets after a simulated gap, including transfer items. Three conditions:
1. **Fixed**: a non-adaptive sequence through the concepts.
2. **θ-only**: Plato with all profile fields frozen at defaults, so only the knowledge state adapts.
3. **Full**: Plato as designed.

Criteria:
- θ-only > fixed in every world;
- full > θ-only for personas whose truth contains the trait;
- full ≈ θ-only (no harm) for the null twins and in World N.

If full never beats θ-only, the extra profile machinery isn't earning its complexity, and should be cut back to knowledge, misconceptions and calibration.

**D. Guards against pandering.**

| Metric | Target |
|---|---|
| Share of scored items with predicted success above 0.9, outside warm-ups | ≤ 20% |
| Full-answer rate | Below cap |
| **False-mastery rate**: goal marked met while θ_true < T | ≈ 0 |
| Generative items per concept per session | ≥ 1 |
| Exam targets T_c | Never changed by preference or affect |
| Share of turns in the 0.6–0.85 band | Reported |

**E. Auditability (secondary, judged by an LLM).**
- Does the move card's "why" cite evidence that actually existed in the profile at that moment?
- Does Plato ever mention learning styles? It should not.

### 6.5 Protocol and practical notes

- **Start small.** First run the **swap test**: 4–6 trait pairs × 3–5 seeds × 2 sessions each. Then the persona assertions. Run the outcome ablations last; they are the most expensive.
- **Run only in the sandbox.** A `LUNA_DATA_DIR` copy on port 5199, with the text stand-in replacing ElevenLabs. Fix the seeds. Report means with bootstrap confidence intervals. Store the logs of move cards and profile snapshots, so the "why" lines and assertions can be checked offline without re-running.
- **Validate the simulator once**, against a handful of real transcripts (the user's own sessions):
  - compare answer length, hedge rate, and correctness against predicted P;
  - run a selective-flip check: misconceptions should persist under untargeted feedback and yield to targeted refutation.
- **Real-student check.** Occasionally, the user runs a session as themselves and compares Plato's profile with their own view of their knowledge (and with exam results later). Self-perception is biased (§2.4), so treat disagreements as prompts to look, not as ground truth.

---

## 7. What this implies for `history/teacher-architecture.md`

Proposals only; this brief changes no other file.

1. **§6.5 profile.** Replace "representation that works" (a global trait) with the per-family residual posterior (R2.10). Replace the prose "confidence calibration" with numeric bias and resolution (R2.15). Add `learning_rate`, `slip_patterns`, `help_seeking` and `order_response`. Make `stated_preferences` weak priors only.
2. **§6.1 ability.** Add a 3PL guessing floor for yes/no and multiple-choice checks (R3.2), and a hierarchical student/cluster prior (R3.3).
3. **§6.4 misconceptions.** Add signatures (R2.29), and confirmation only from two independent items. The delayed resolution probe is kept; it is well supported.
4. **§6.7 cold start.** Add self-ratings for a calibration baseline, first-step probes, surmise-ordered item selection, and P ≈ 0.5–0.6 during the diagnostic (R3.9–R3.12).
5. **§7.1 and §7.2 moves.** Add a **try-first / contrasting-cases** move with mandatory consolidation. Add the concept attribute `interactivity` and the explain-first/try-first rule (R2.2). Advance the fade by the student's step predictions (R2.3). Make the challenge bands contextual (R2.7).
6. **Mastery (§7.3 goals).** A goal requires an unassisted generative success and a success after a day or more (R2.6).
7. **Guardrails G1–G6** become hard constraints in the director prompt and the card validator.
8. **§11 evals.** Add the code-defined simulated students, the swap test and the θ-only ablation (§6 here).

---

## References

**Learning styles and learner control**
- Pashler, McDaniel, Rohrer & Bjork (2008). Learning styles: Concepts and evidence. *Psychological Science in the Public Interest* 9(3):105–119. https://digitalcommons.usf.edu/psy_facpub/1765/
- Rogowsky, Calhoun & Tallal (2015). Matching learning style to instructional method: Effects on comprehension. *J. Educational Psychology* 107:64–78. https://eric.ed.gov/?id=EJ1055886
- Rogowsky, Calhoun & Tallal (2020). Providing instruction based on students' learning style preferences does not improve learning. *Frontiers in Psychology* 11:164. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.00164/full
- Knoll, Otani, Skeel & Van Horn (2017). Learning style, judgements of learning, and learning of verbal and visual information. *British J. Psychology* 108:544–563. https://www.semanticscholar.org/paper/Learning-style,-judgements-of-learning,-and-of-and-Knoll-Otani/f42acfc3165727abc334bce29edbb539c0ef269b
- Kirschner & van Merriënboer (2013). Do learners really know best? Urban legends in education. *Educational Psychologist* 48:169–183. https://research.ou.nl/en/publications/do-learners-really-know-best-urban-legends-in-education/
- Coffield, Moseley, Hall & Ecclestone (2004). *Learning styles and pedagogy in post-16 learning.* Learning and Skills Research Centre.
- Willingham, Hughes & Dobolyi (2015). The scientific status of learning styles theories. *Teaching of Psychology* 42:266–271.
- Mayer & Sims (1994). For whom is a picture worth a thousand words? *J. Educational Psychology* 86:389–401.
- Bernacki, Greene & Lobczowski (2021). A systematic review of research on personalized learning. *Educational Psychology Review* 33:1675–1715. https://www.semanticscholar.org/paper/A-Systematic-Review-of-Research-on-Personalized-by-Bernacki-Greene/da21ae2510619fc6c9c8d96a6cef86ce60730165

**Prior knowledge, worked examples, productive failure, help**
- Atkinson, Derry, Renkl & Wortham (2000). Learning from examples. *Review of Educational Research* 70:181–214. https://doi.org/10.3102/00346543070002181
- Kalyuga (2007). Expertise reversal effect and its implications for learner-tailored instruction. *Educational Psychology Review* 19:509–539. https://link.springer.com/article/10.1007/s10648-007-9054-3
- Kalyuga, Ayres, Chandler & Sweller (2003). The expertise reversal effect. *Educational Psychologist* 38:23–31.
- Kalyuga & Sweller (2005). Rapid dynamic assessment of expertise to improve the efficiency of adaptive e-learning. *ETR&D* 53(3). https://link.springer.com/article/10.1007/BF02504800
- Renkl & Atkinson (2003). Structuring the transition from example study to problem solving. *Educational Psychologist* 38:15–22.
- Salden, Aleven, Schwonke & Renkl (2010). The expertise reversal effect and worked examples in tutored problem solving. *Instructional Science* 38:289–307. https://link.springer.com/article/10.1007/s11251-009-9107-8
- Koedinger & Aleven (2007). Exploring the assistance dilemma in experiments with Cognitive Tutors. *Educational Psychology Review* 19:239–264. https://link.springer.com/article/10.1007/s10648-007-9049-0
- McLaren et al. (2014). Exploring the assistance dilemma: Comparing instructional support in examples and problems. *ITS 2014*. https://link.springer.com/chapter/10.1007/978-3-319-07221-0_44
- Sinha & Kapur (2021). When problem solving followed by instruction works: Evidence for productive failure. *Review of Educational Research* 91:761–798. https://janfasen.nl/wp-content/uploads/2023/05/Sinha-and-Kapur-PS-I.pdf
- Kapur (2016). Examining productive failure, productive success, unproductive failure, and unproductive success in learning. *Educational Psychologist* 51:289–299.
- Ashman, Kalyuga & Sweller (2020). Problem-solving or explicit instruction: Which should go first when element interactivity is high? *Educational Psychology Review* 32:229–247. https://link.springer.com/article/10.1007/s10648-019-09500-5
- Sweller (2010). Element interactivity and intrinsic, extraneous, and germane cognitive load. *Educational Psychology Review* 22:123–138.
- Schwartz & Bransford (1998). A time for telling. *Cognition and Instruction* 16:475–522. https://www.semanticscholar.org/paper/A-time-for-telling-Schwartz-Bransford/689d8f118e2ae8d2284d90be8232bb4d2286ba1c
- Wood & Wood (1999). Help seeking, learning and contingent tutoring. *Computers & Education* 33:153–169. https://www.sciencedirect.com/science/article/abs/pii/S0360131599000305
- Aleven, Stahl, Schworm, Fischer & Wallace (2003). Help seeking and help design in interactive learning environments. *Review of Educational Research* 73:277–320.
- Hou et al. (2026). Adaptive scaffolding needs contingency (CoMeT). arXiv:2609.22993. https://arxiv.org/abs/2609.22993

**Pace, mastery, challenge**
- Kulik, Kulik & Bangert-Drowns (1990). Effectiveness of mastery learning programs: A meta-analysis. *Review of Educational Research* 60:265–299. https://www.semanticscholar.org/paper/a6b6e062d5d4a349b507425c3cb84081972c4781
- Bloom (1984). The 2 sigma problem. *Educational Researcher* 13(6):4–16.
- VanLehn (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. *Educational Psychologist* 46:197–221. https://eric.ed.gov/?id=EJ946764
- Pelánek & Řihák (2017). Experimental analysis of mastery learning criteria. *UMAP 2017*. https://dl.acm.org/doi/10.1145/3079628.3079667
- Wilson, Shenhav, Straccia & Cohen (2019). The Eighty Five Percent Rule for optimal learning. *Nature Communications* 10:4646. https://www.nature.com/articles/s41467-019-12552-4
- Metcalfe & Kornell (2005). A region of proximal learning model of study time allocation. *J. Memory and Language* 52:463–477.
- Bjork & Bjork (2011). Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning. In *Psychology and the Real World*.

**Representations**
- Ainsworth (2006). DeFT: A conceptual framework for considering learning with multiple representations. *Learning and Instruction* 16:183–198. https://eric.ed.gov/?id=EJ737858
- Rau (2017). Conditions for the effectiveness of multiple visual representations in enhancing STEM learning. *Educational Psychology Review* 29:717–761. https://link.springer.com/article/10.1007/s10648-016-9365-3

**Metacognition and calibration**
- Dunlosky & Rawson (2012). Overconfidence produces underachievement. *Learning and Instruction* 22:271–280. https://eric.ed.gov/?id=EJ964388
- Koriat & Bjork (2005). Illusions of competence in monitoring one's knowledge during study. *J. Exp. Psych.: LMC* 31:187–194.
- Koriat & Bjork (2006). Illusions of competence during study can be remedied… *Memory & Cognition* 34:959–972. https://link.springer.com/article/10.3758/BF03193244
- Nelson & Dunlosky (1991). When people's judgments of learning are extremely accurate at predicting subsequent recall: The delayed-JOL effect. *Psychological Science* 2:267–270.
- Rozenblit & Keil (2002). The misunderstood limits of folk science: An illusion of explanatory depth. *Cognitive Science* 26:521–562. https://onlinelibrary.wiley.com/doi/10.1207/s15516709cog2605_1
- Deslauriers, McCarty, Miller, Callaghan & Kestin (2019). Measuring actual learning versus feeling of learning. *PNAS* 116:19251–19257. https://www.pnas.org/doi/10.1073/pnas.1821936116
- Butterfield & Metcalfe (2001). Errors committed with high confidence are hypercorrected. *J. Exp. Psych.: LMC* 27:1491–1494. Related PDF (2006 follow-up): http://www.columbia.edu/cu/psychology/metcalfe/PDFs/Butterfield_Metcalfe_2006.pdf
- Butler, Fazio & Marsh (2011). The hypercorrection effect persists over a week, but high-confidence errors return. *Psychonomic Bulletin & Review* 18:1238–1244. https://link.springer.com/article/10.3758/s13423-011-0173-y
- Long & Aleven (2017). Enhancing learning outcomes through self-regulated learning support with an open learner model. *UMUAI* 27:55–88. https://link.springer.com/article/10.1007/s11257-016-9186-6
- Bull & Kay (2007). Student models that invite the learner in: The SMILI open learner modelling framework. *IJAIED* 17:89–120. Update (2016): https://eric.ed.gov/?id=EJ1091260

**Motivation and affect**
- Ryan & Deci (2000). Self-determination theory and the facilitation of intrinsic motivation. *American Psychologist* 55:68–78.
- Ryan & Deci (2020). Intrinsic and extrinsic motivation from a self-determination theory perspective. *Contemporary Educational Psychology* 61:101860. https://selfdeterminationtheory.org/wp-content/uploads/2020/04/2020_RyanDeci_CEP_PrePrint.pdf
- Patall, Cooper & Robinson (2008). The effects of choice on intrinsic motivation and related outcomes. *Psychological Bulletin* 134:270–300. https://eric.ed.gov/?id=EJ787695
- Bandura (1977). Self-efficacy: Toward a unifying theory of behavioral change. *Psychological Review* 84:191–215.
- Kluger & DeNisi (1996). The effects of feedback interventions on performance. *Psychological Bulletin* 119:254–284.
- Mueller & Dweck (1998). Praise for intelligence can undermine children's motivation and performance. *JPSP* 75:33–52.
- Hattie & Timperley (2007). The power of feedback. *Review of Educational Research* 77:81–112.
- Cordova & Lepper (1996). Intrinsic motivation and the process of learning: Beneficial effects of contextualization, personalization, and choice. *J. Educational Psychology* 88:715–730.
- Walkington (2013). Using adaptive learning technologies to personalize instruction to student interests. *J. Educational Psychology* 105:932–945. https://eric.ed.gov/?id=EJ1054444
- (2024). The personalized learning by interest effect on interest, cognitive load, retention, and transfer: A meta-analysis. *Educational Psychology Review*. https://link.springer.com/article/10.1007/s10648-024-09933-7
- D'Mello, Lehman, Pekrun & Graesser (2014). Confusion can be beneficial for learning. *Learning and Instruction* 29:153–170. https://myweb.fsu.edu/vshute/pdf/confusion.pdf
- Baker, Corbett & Koedinger (2004). Detecting student misuse of intelligent tutoring systems. *ITS 2004*:531–540. https://link.springer.com/chapter/10.1007/978-3-540-30139-4_50
- Sisk et al. (2018). To what extent and under which circumstances are growth mind-sets important to academic achievement? *Psychological Science* 29:549–571.
- Yeager et al. (2019). A national experiment reveals where a growth mindset improves achievement. *Nature* 573:364–369.

**Misconceptions**
- Brown & Burton (1978). Diagnostic models for procedural bugs in basic mathematical skills. *Cognitive Science* 2:155–192. https://www.semanticscholar.org/paper/Diagnostic-Models-for-Procedural-Bugs-in-Basic-Brown-Burton/a5ceacbbbf78b1b5ff55be25cb031fac63581359
- Brown & VanLehn (1980). Repair theory: A generative theory of bugs in procedural skills. *Cognitive Science* 4:379–426. https://onlinelibrary.wiley.com/doi/abs/10.1207/s15516709cog0404_3
- Smith, diSessa & Roschelle (1993). Misconceptions reconceived. *J. Learning Sciences* 3:115–163. https://www.sri.com/publication/education-learning-pubs/misconceptions-reconceived-a-constructivist-analysis-of-knowledge-in-transition/
- Wang et al. (2020). Instructions and guide for Diagnostic Questions: The NeurIPS 2020 Education Challenge. arXiv:2007.12061. https://arxiv.org/abs/2007.12061
- Graesser & Person (1994). Question asking during tutoring. *American Educational Research Journal* 31:104–137.

**Student modelling**
- Corbett & Anderson (1994). Knowledge tracing: Modeling the acquisition of procedural knowledge. *UMUAI* 4:253–278. https://link.springer.com/article/10.1007/BF01099821
- Yudelson, Koedinger & Gordon (2013). Individualized Bayesian knowledge tracing models. *AIED 2013*. https://link.springer.com/chapter/10.1007/978-3-642-39112-5_18
- Pavlik, Cen & Koedinger (2009). Performance factors analysis: A new alternative to knowledge tracing. *AIED 2009*. https://files.eric.ed.gov/fulltext/ED506305.pdf
- Pelánek (2016). Applications of the Elo rating system in adaptive educational systems. *Computers & Education* 98:169–179. https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- Pelánek (2017). Bayesian knowledge tracing, logistic models, and beyond. *UMUAI* 27:313–350. https://link.springer.com/article/10.1007/s11257-017-9193-2
- Pelánek (2018). Exploring the utility of response times and wrong answers for adaptive learning. *L@S 2018*. https://www.fi.muni.cz/~xpelanek/publications/las18-observational-data.pdf
- Glickman (1999). Parameter estimation in large dynamic paired comparison experiments. *Applied Statistics* 48:377–394.
- Piech et al. (2015). Deep knowledge tracing. *NeurIPS*. https://dl.acm.org/doi/10.5555/2969239.2969296
- Khajah, Lindsey & Mozer (2016). How deep is knowledge tracing? *EDM 2016*. https://arxiv.org/abs/1604.02416
- Scarlatos, Baker & Lan (2025). Exploring knowledge tracing in tutor-student dialogues using LLMs. *LAK 2025*. https://arxiv.org/abs/2409.16490
- Hooshyar et al. (2025). Problems with large language models for learner modelling. arXiv:2512.23036. https://arxiv.org/abs/2512.23036
- Berthon & van der Schaar (2025). Language bottleneck models for qualitative knowledge state modeling. arXiv:2506.16982. https://arxiv.org/abs/2506.16982
- (2026). Interpretable difficulty-aware knowledge tracing in tutor-student dialogues. arXiv:2605.01097. https://arxiv.org/abs/2605.01097
- Forbes-Riley & Litman (2011). Benefits and challenges of real-time uncertainty detection and adaptation in a spoken dialogue computer tutor. *Speech Communication* 53:1115–1136. https://www.sciencedirect.com/science/article/abs/pii/S0167639311000318

**Systems**
- Pane, Griffin, McCaffrey & Karam (2014). Effectiveness of Cognitive Tutor Algebra I at scale. *Educational Evaluation and Policy Analysis* 36:127–144. https://www.rand.org/pubs/external_publications/EP50410.html
- Roschelle, Feng, Murphy & Mason (2016). Online mathematics homework increases student achievement. *AERA Open* 2(4). https://files.eric.ed.gov/fulltext/EJ1194398.pdf
- Fang, Ren, Hu & Graesser (2019). A meta-analysis of the effectiveness of ALEKS on learning. *Educational Psychology* 39:1278–1292. https://eric.ed.gov/?id=EJ1232632
- Cosyn, Uzun, Doble & Matayoshi (2021). A practical perspective on knowledge space theory: ALEKS and its data. *J. Mathematical Psychology*. https://jmatayoshi.github.io/publications/JMP2021_KST_ALEKS_preprint.pdf
- ALEKS. Knowledge space theory. https://www.aleks.com/about_aleks/knowledge_space_theory
- Settles & Meeder (2016). A trainable spaced repetition model for language learning. *ACL 2016*. https://aclanthology.org/P16-1174/ (code: https://github.com/duolingo/halflife-regression)
- Graesser (2016). Conversations with AutoTutor help students learn. *IJAIED* 26:124–132. https://link.springer.com/article/10.1007/s40593-015-0086-4
- Nye, Graesser & Hu (2014). AutoTutor and family: A review of 17 years of natural language tutoring. *IJAIED* 24:427–469. https://link.springer.com/article/10.1007/s40593-014-0029-5
- Leite et al. (2025). Do intelligent tutoring systems benefit K-12 students? A meta-analysis. arXiv:2511.04997. https://arxiv.org/abs/2511.04997

**LLM-era tutoring studies**
- Bastani et al. (2025). Generative AI without guardrails can harm learning. *PNAS*. https://www.pnas.org/doi/10.1073/pnas.2422633122
- Kestin, Miller et al. (2025). AI tutoring outperforms in-class active learning. *Scientific Reports*. https://www.nature.com/articles/s41598-025-97652-6
- LearnLM Team (2025). AI tutoring can safely and effectively support students (Eedi RCT). arXiv:2512.23633. https://arxiv.org/abs/2512.23633
- Wang, Ribeiro, Robinson, Loeb & Demszky (2024). Tutor CoPilot: A human-AI approach for scaling real-time expertise. arXiv:2410.03017. https://arxiv.org/abs/2410.03017

**Simulated students for evaluation**
- Scarlatos, Lee, Woodhead & Lan (2026). Simulated students in tutoring dialogues: Substance or illusion? *ACL 2026*. https://arxiv.org/abs/2601.04025
- Do, Sonkar & Sachan (2026). Simulating students or sycophantic problem solving? On misconception faithfulness of LLM simulators. arXiv:2605.12748. https://arxiv.org/abs/2605.12748
- Meng & Lin (2026). Simulating disengaged students to evaluate LLM-based tutors (DAS2). arXiv:2609.12331. https://arxiv.org/abs/2609.12331
