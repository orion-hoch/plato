# Tutoring evidence: what expert tutors do, what LLM tutors get wrong, how to judge a move

Research brief for Plato (director plans each move, actor performs it in voice). Compiled 2026-10-08.

For each source: **Studied**, **Result**, **Implication** (for the director, the actor, or the eval suite). Sections 4 to 6 pull it together: a move taxonomy, a rubric to freeze, and failure modes with guards.

Confidence tags:
- **[V]** checked this pass against the primary text or abstract.
- **[S]** taken from a published summary or secondary write-up. Check the primary source before quoting numbers.
- **[K]** established literature cited from background knowledge. The finding is standard, but check exact figures.

---

## 0. The rules this evidence supports

1. **Ground every item in an authored, verified solution path and misconception list before the actor speaks.** Kestin, Bastani and Pardos all show that ungrounded LLMs are wrong often enough to hurt learning.
2. **The interaction unit is the step, not the answer.** Get the student's reasoning, check each step and respond at the first wrong step (VanLehn 2011; Daheim 2024).
3. **The student must make each decision. Help scales with failure.** Escalate one level per failed attempt (pump, hint, specific hint, one step told, worked example) and fade after success (Wood and Middleton; AutoTutor; CoMeT 2026).
4. **Ask by default, but telling is a legitimate move.** It is right for low-ability novices on new procedures (worked examples), for missing prerequisites, once the help ladder is exhausted, and when the student explicitly asks. After any tell, the student does the next step.
5. **Diagnose from what the student produces, never from self-report.** "Got it" is not evidence. Tutors and LLMs both overestimate students (Chi 2004; over-validation studies).
6. **Separate diagnosis from wording.** The director outputs error type, strategy and intention; the actor phrases them. This is the Bridge and Tutor CoPilot result. Verification of correctness runs in code or a checked judge, not in the actor.
7. **Feedback must say plainly whether the answer is right, while staying gentle in style.** Imply the error and point at its location. Praise is sparse and about the process (INSPIRE; Kluger and DeNisi).
8. **Measure learning with unassisted items after help, not with performance during help.** Bastani's GPT Base raised practice scores by 48% and cut exam scores by 17%.
9. **The student should do most of the generating.** Learning tracks the student's constructive output, not the tutor's explanations (Chi 2001; Herppich 2016).
10. **Expect students to bypass scaffolding.** Evaluate how the tutor handles "just tell me", topic jumps and disengagement, not just cooperative students (Rethinking Scaffolding 2026; Khanmigo RCT).

---

## 1. Human tutoring

### 1.1 Bloom's 2-sigma and its critiques

**Studied.** Bloom (1984), "The 2 Sigma Problem", *Educational Researcher* 13(6):4–16. Students tutored one-to-one with mastery learning scored about 2 SD above conventional classes; the average tutored student beat 98% of the class. The data came from dissertations by Anania and Burke: interventions of about 3 weeks, tests written by the experimenters, and corrective feedback until students reached an 80–90% mastery criterion. [K]

**Critiques.**
- Nickow, Oreopoulos and Quan (2020), NBER w27476: a meta-analysis of 96 randomised tutoring studies found a pooled effect of **0.37 SD**. None reached 2 SD. [V via summary]
- von Hippel, ["Two-Sigma Tutoring: Separating Science Fiction from Science Fact"](https://www.educationnext.org/two-sigma-tutoring-separating-science-fiction-from-science-fact/), *Education Next*. Bloom's cited source, Walberg, estimated tutoring at **0.40 SD**. The 2-sigma figure comes from short, small studies whose tests were aligned to the taught material. [V]
- Nintil (Ricón), ["On Bloom's two sigma problem"](https://nintil.com/bloom-sigma/), a systematic review. The literature is full of small, non-randomised, heterogeneous trials. Typical tutoring does not reach 2 SD, though excellent tutors and software might. [V]
- Kraft, Schueler and Falken (2026), ["What impacts should we expect from tutoring at scale?"](https://journals.sagepub.com/doi/10.3102/00346543261446660), *Review of Educational Research*. The pooled effect is **0.40 SD**, but it shrinks 45–60% at scale:
  - 0.44 SD with fewer than 100 students;
  - 0.30 SD with 100–399;
  - 0.21 SD with 400–999;
  - 0.16 SD with 1,000 or more.

  Programs with the recommended design features attenuate less. [V via abstract and summary]

**Implication.**
- Bloom's effect was a mastery-learning effect as much as a tutoring effect. Its active ingredients were:
  - formative checks against a clear criterion;
  - corrective re-teaching aimed at what the check found;
  - not moving on until mastery.
- Plato should build all three in: exam-aligned items as the criterion, correctives keyed to the diagnosed gap, and progression gated on the ability estimate. Conversation alone should not be assumed to produce gains.
- **Evals:** measure learning on held-out, exam-like items the tutor never practised. Otherwise the suite reproduces Bloom's measurement inflation.
- A realistic target is 0.3–0.5 SD over self-study. Claims much above that need scrutiny.

### 1.2 VanLehn (2011): interaction granularity and the interaction plateau

**Studied.** VanLehn, ["The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems"](https://eric.ed.gov/?id=EJ946764), *Educational Psychologist* 46(4):197–221. A review of experiments comparing human tutoring, computer tutoring at different granularities, and no tutoring. The three granularities are:
- **Answer-based:** feedback on the final answer only.
- **Step-based:** feedback and hints on every step.
- **Substep-based:** dialogue about reasoning inside a step.

[V via abstract and summaries]

**Result.**

| Condition | Effect size |
| --- | --- |
| Human tutoring | d = 0.79 |
| Step-based systems | 0.76 |
| Substep-based systems | 0.40 |
| Answer-based systems | 0.31 |

- Effectiveness rises from answer-based to step-based tutoring, then plateaus.
- Human tutors are nowhere near 2 SD.
- VanLehn's proposed mechanism: finer granularity helps because errors are caught close to where they happened, so the student can repair them with little help. Below the step level, extra granularity adds little.

**Implication.**
- The unit of interaction is the **step**. Plato must get the student's reasoning steps, spoken or on the board, and check each one.
- Answer-only multiple-choice quizzing is the 0.31 condition, which is exactly the "middling abcd questions" the user wants to avoid.
- Don't expect gains from ever-finer Socratic questioning inside a step that is going fine. That is the plateau.
- **Director rule:** give feedback at step granularity. Go to substep questioning only inside the step that failed.
- **Eval:** does the move respond to the specific step that went wrong? This is mistake location (§3).

### 1.3 VanLehn, Graesser et al. (2007): when is dialogue better than reading?

**Studied.** VanLehn, Graesser, Jackson, Jordan, Olney and Rosé, ["When are tutorial dialogues more effective than reading?"](https://onlinelibrary.wiley.com/doi/abs/10.1080/03640210709336984), *Cognitive Science* 31(1):3–62. Seven experiments in qualitative physics compared human tutors, Why2-Atlas and Why2-AutoTutor against reading a text with the same content. [V via abstract]

**Result.**
- When novices studied novice-level material, or intermediates studied intermediate material, tutorial dialogue was **not reliably better than reading**.
- Tutoring won when the material sat above what the student could absorb alone, in their zone of proximal development.

**Implication.**
- Dialogue earns its cost where the notes alone fail. Don't Socratically re-derive what the student could read in two minutes; point them at it, or tell them briefly.
- Spend the dialogue budget on concepts just beyond reach.
- **Director:** if the ability estimate is well above the concept's difficulty, use a brief tell and a generative check. Save extended dialogue for concepts where predicted success alone is low.
- This bears on "not a summary" from the other side. A summary is fine for what the student is ready for; dialogue is for what they are not.

### 1.4 Chi et al. (2001), "Learning from human tutoring", and the prompting follow-up

**Studied.** Chi, Siler, Jeong, Yamauchi and Hausmann, ["Learning from human tutoring"](https://onlinelibrary.wiley.com/doi/10.1207/s15516709cog2504_1), *Cognitive Science* 25:471–533. College students tutored 8th graders on the human circulatory system. The paper tested three hypotheses:
- **Tutor-centred:** learning comes from the tutor's explanations, feedback and tailoring.
- **Student-centred:** learning comes from the student's own constructive activity, such as self-explaining.
- **Interactive:** learning comes from joint construction.

Study 1 recorded naturalistic tutoring. In **Study 2, tutors were told not to explain or give feedback, and to prompt instead**, with content-free prompts such as "what do you think is going on here?" and "can you explain that?". [V via abstract]

**Result.**
- In Study 1, tutor explanations dominated the talk. Learning tracked the student's constructive responses and interactive episodes, not tutor explaining.
- In Study 2, students **learned just as much** with prompting-only tutors, and they were more constructive.
- Tutor explanations helped mainly with shallow items.
- Conclusion: the student-centred and interactive hypotheses are supported, and tutors' explaining is overrated.

**Follow-ups.** [K]
- Chi, Roy and Hausmann (2008), ["Observing tutorial dialogues collaboratively"](https://onlinelibrary.wiley.com/doi/10.1080/03640210701863396), *Cognitive Science* 32:301–341. Pairs who watched a tutoring video and discussed it learned about as much as the tutee. Watching alone did not work as well.
- Chi and Wylie (2014), the ICAP framework, *Educational Psychologist* 49(4). Learning ranks Interactive > Constructive > Active > Passive.

**Implication.**
- Default to **prompting the student to generate**: explain, predict, self-explain, teach back. Tutor explanation is a targeted supplement.
- In voice, the student should produce most of the substantive content. Track a **student-generation ratio**: content words from the student against content words from the tutor, per concept.
- **Director:** prefer moves that elicit constructive output (explain-why, predict, teach-back) over orienting or explaining, whenever the ability estimate makes them feasible.
- **Eval dimension, "generativity":** does the move require the student to produce new content? A yes/no answer, or repeating a fact just stated, does not count.

### 1.5 Can tutors diagnose? Chi, Siler and Jeong (2004); comprehension-gauging questions

**Studied.** Chi, Siler and Jeong (2004), "Can tutors monitor students' understanding accurately?", *Cognition and Instruction* 22(3):363–387. Graesser, Person and Magliano (1995) and Person et al. (1994) studied "Do you understand?" questions in naturalistic tutoring. [V summary / K]

**Result.**
- Tutors **overestimated** what students knew and **underestimated** their wrong knowledge. They were reasonably good at tracking normative knowledge, poor at detecting misconceptions, and rarely tried to diagnose them.
- Students' answers to "Do you understand?" are not a valid index of understanding. Better students are, if anything, more likely to say they don't understand.

**Implication.**
- The director diagnoses from **evidence the student produces**: their step, their explanation, their prediction. Never from self-report.
- Keep an explicit misconception inventory per concept. Each misconception needs a **discriminating diagnostic question**, one whose answer differs depending on which misconception the student holds.
- "Yeah, I get it" must not move the ability estimate. It triggers a generative check. The architecture document's banned "reflex check" ("Does that make sense?") is right on this evidence.

### 1.6 Graesser's tutoring dialogue patterns and AutoTutor (EMT dialogue)

**Studied.**
- Graesser, Person and Magliano (1995), "Collaborative dialogue patterns in naturalistic one-to-one tutoring", *Applied Cognitive Psychology* 9:495–522. About 100 hours of untrained tutors in research methods and algebra. [K]
- AutoTutor: Nye, Graesser and Hu (2014), ["AutoTutor and family: a review of 17 years of natural language tutoring"](https://link.springer.com/article/10.1007/s40593-014-0029-5), *IJAIED* 24:427–469.
- Graesser (2016), ["Conversations with AutoTutor help students learn"](https://link.springer.com/article/10.1007/s40593-015-0086-4), *IJAIED* 26:124–132. [V via abstract]

**Result: the five-step frame.**
1. The tutor asks a question.
2. The student answers.
3. The tutor gives short feedback.
4. Tutor and student **collaboratively improve the answer** through pumps, hints, prompts and splices.
5. The tutor "checks understanding", usually with an unreliable "Do you understand?".

Untrained tutors rarely used sophisticated strategies such as Socratic questioning, modelling-scaffolding-fading, or error diagnosis and repair. Learning came mostly from step 4. Their feedback was biased positive out of politeness.

**AutoTutor's expectation and misconception tailored (EMT) dialogue.**
- Each main question has a set of **expectations**, sentence-sized parts of a good answer, and anticipated **misconceptions**.
- The tutor cycles **pump** ("what else?"), then **hint**, then **prompt** (elicit a specific missing word), then **assertion** (the tutor states it) until every expectation is covered.
- Misconceptions trigger a correction. A summary closes the topic.
- Coverage was measured by semantic match against each expectation.
- Reported gains are about **0.8 SD** over reading-textbook or no-instruction controls, roughly matching human tutors on those tasks.

**Implication.** This is the most directly usable template for Plato's director.
- Each card or question carries explicit **expectations** and **misconceptions**.
- The director tracks which expectations the student has articulated.
- **Tell versus ask follows the ladder.** Escalate one level per failed attempt: pump, hint, prompt, assert. Assert (tell) only when the ladder is exhausted, then have the student restate the idea in their own words.
- **Eval metric:** for each expectation, record whether the student produced it unprompted (best), produced it after a prompt, or had it asserted by the tutor. The **student-coverage ratio** is a quality signal.
- Graesser's own data warn that step 3's feedback tends to be too positive. Feedback must say plainly whether the answer is right (§1.8).
- Related LLM work: ["AutoTutor meets Large Language Models"](https://arxiv.org/pdf/2402.09216) (2024) wraps an LLM inside an AutoTutor-style state machine for guardrails. [S]

### 1.7 Lepper's INSPIRE model of expert tutors

**Studied.**
- Lepper, Drake and O'Donnell-Johnson (1997); Lepper and Woolverton (2002), ["The wisdom of practice: lessons learned from the study of highly effective tutors"](https://www.researchgate.net/publication/284828606_The_wisdom_of_practice_Lessons_learned_from_the_study_of_highly_effective_tutors), in Aronson (ed.), *Improving Academic Achievement*, pp. 135–158.
- They compared highly effective with ordinary tutors of elementary and middle-school mathematics.
- Details below come from UBC CWSEI's [INSPIRE guidelines](https://www.eoas.ubc.ca/research/cwsei/resources/INSPIRE-Guidelines.pdf). [V]

**Result.** Effective sessions cycled through six phases: introduction, problem selection (tutor), problem presentation, solution (mostly the student), reflection, and **instruction only when necessary**. Tutors ran a cognitive model and a motivational model of the student at the same time. The hard calls came when the two pointed in different directions.

| Trait | Concrete behaviours |
| --- | --- |
| **Intelligent** | Deep content knowledge and subject-specific pedagogical knowledge: knows which problems will be hard, which errors are likely, and which problems look harder or easier than they are |
| **Nurturant** | Early rapport, empathy for the difficulty, shows confidence in the student |
| **Socratic** | **More than 90% of remarks are questions**, often leading or informative; "draw as much as possible from the student and impose as little as necessary"; hints, not answers; help the student take the next step themselves |
| **Progressive** | Starts with *diagnostic* problems; corrects misunderstandings before moving on; hints go from general to specific; recurring routines |
| **Indirect** | Avoids overt criticism; **poses questions that imply an error exists, and sometimes where**, so the student catches it; less explicit praise, especially praise aimed at the person |
| **Reflective** | Student explains aloud right after a success; tutor elaborates an incomplete explanation, modelling a fuller one; student generalises to other problems |
| **Encouraging** | *Confidence* (stress the problem's difficulty, which excuses failure and raises the value of success); *challenge*; *curiosity* (predict, highlight inconsistencies); *control* (offer choices, comply with requests); *context* (relevance) |

**Error handling.**
- **Ignore small errors** that don't block a correct answer, but target them later.
- Spot **productive errors** and sometimes let them happen so they can be debugged.
- Intervene explicitly on **unproductive errors** that lead the student astray.

**Implication.**
- **Error triage policy for the director:** trivial (let go and log), productive (let the student run into it, then debug together), unproductive (intervene now).
- **Indirect correction phrasing for the actor**, escalating from gentle to direct:
  1. "What did you get for the offset?"
  2. "Check the sign on step 2."
  3. "Step 2 should be negative. Why?"
- **A reflection move after each success:** "What was the move that cracked it?"
- **Control:** offer choices and honour requests. This fits the user's design preference for student steering.
- Caveat: INSPIRE is observational, from a small sample of maths tutors working with children. The individual components have not been tested experimentally.
- "Indirect" must not mean "ambiguous". The student must leave the turn knowing whether they were right.

### 1.8 How expert tutors diagnose, handle errors and decide how much to tell

| Source | Studied | Result |
| --- | --- | --- |
| D'Mello, Lehman and Person (2010), ["Expert tutors' feedback is immediate, direct, and discriminating"](https://cdn.aaai.org/ocs/1215/1215-7820-1-PB.pdf), FLAIRS-23 best paper [V abstract] | 10 expert tutors, 50 sessions; feedback after correct, partial, wrong, vague or missing answers | Feedback is **immediate, direct and discriminating**: positive after correct answers, negative or corrective after errors, and largely the same across domains. Novice tutors' politeness bias (Graesser 1995) is what experts *don't* do. |
| Cade, Copeland, Person and D'Mello (2008), ["Dialogue modes in expert tutoring"](https://link.springer.com/chapter/10.1007/978-3-540-69132-7_50), ITS 2008 [V abstract] | Expert tutoring sessions coded into multi-minute "modes": introduction, lecture, highlighting, modelling, scaffolding, fading, off-topic, conclusion | Expert tutors produced **77% of the words**. Lecture and modelling are real parts of expert sessions alongside scaffolding. |
| Herppich, Wittwer, Nückles and Renkl (2016), ["Expertise amiss"](https://link.springer.com/article/10.1007/s11251-015-9363-8), *Instructional Science* [V abstract] | 46 tutors with different pedagogical expertise, tutoring biology (a conceptual domain) | **More scaffolding with less explaining** predicted deep learning. Tutors with *more* pedagogical expertise were *less* interactive, and their students learned *less*. |
| Merrill, Reiser, Ranney and Trafton (1992), "Effective tutoring techniques", *J. Learning Sciences* 2(3) [K] | Human tutors versus intelligent tutoring systems in LISP and maths | Tutors let the student lead. They intervened mainly on errors that would derail progress, and gave the student a moment to catch slips. Feedback was often subtle and slightly delayed. |
| Fox (1993), *The Human Tutorial Dialogue Project* [K] | Conversation analysis of tutoring | Tutors delay correction so the student can repair the error themselves. Hesitations and "hm" work as signals that something is off. |
| Chi et al. (2004), §1.5 | Monitoring accuracy | Tutors overestimate students and miss misconceptions. |

**Synthesis.** The two strands are less contradictory than they look.
- *Expert* tutors talk a lot and do explain (Cade).
- Learning tracks the *student's* constructive work and the ratio of scaffolding to explaining (Chi 2001; Herppich).
- The resolution is **contingency**. Explaining is fine when it is targeted, brief and followed by student work. Explaining as a default is what fails.
- Feedback content is direct and discriminating (D'Mello). The *delivery* can be indirect: imply the error, ask the student to recheck a step (Lepper, Fox).

**Implication.**
- An LLM is an "expert explainer" by default. That is the Herppich failure mode at scale.
- **Director:** cap explanation turns, and follow every explanation with a move where the student has to produce something.
- **Actor:** every response to an answer contains an unambiguous verdict (right, partly right, or not yet). It may come as a pointed question ("you've got the opcode right, what about the immediate's sign?"), but it must be decodable.
- **Allow self-repair.** On a slip, the first move is a short nudge ("check that last step"), not a correction.

### 1.9 Contingency, the assistance dilemma, and when to tell

These are not tutoring-dialogue studies, but they settle the tell-versus-ask question. [K]

- **Contingent tutoring.** Wood, Bruner and Ross (1976) introduced scaffolding. Wood and Middleton (1975) found that the tutors whose children learned best followed one rule: *if the child fails, increase help one level; if the child succeeds, reduce help.*
- **Assistance dilemma.** Koedinger and Aleven (2007), *Educational Psychology Review* 19:239–264. Neither giving nor withholding information is always right. The balance depends on the learner's state and the kind of knowledge being learned.
- **Worked examples and expertise reversal.** Work by Sweller, Kalyuga (2003, 2007) and Renkl's faded examples. Novices learn more from studying worked examples than from solving problems. The advantage *reverses* as expertise grows; then problem solving is better.
- **Productive failure.** Kapur (2008, 2016); Sinha and Kapur (2021), *Review of Educational Research* 91(5). Solving problems *before* instruction beats instruction-first for **conceptual understanding and transfer** (about g = 0.36, larger when implemented faithfully). It does not help procedural fluency. It only works when the instruction that follows compares the student's attempts with the canonical solution.
- **Contingent scaffolding with an LLM.** CoMeT (2026) is covered in §2.7.

**Implication: the tell-versus-ask rule depends on the ability estimate and the goal.**

| Student state | Default |
| --- | --- |
| Low ability on a new *procedure* | **Tell first.** A worked example, then a faded one, then a solo problem. |
| Moderate ability, goal is *conceptual* understanding or transfer | **Ask first.** The student attempts, then the tutor consolidates by building on the attempt. |
| High ability | Problems with minimal help |
| Any state | Help **escalates on failure and fades on success**, one level at a time |

---

## 2. AI and LLM tutors

### 2.1 Kestin et al. (2025): the Harvard physics AI tutor RCT

**Studied.** Kestin, Miller, Klales, Milbourne and Ponti, ["AI tutoring outperforms in-class active learning: an RCT introducing a novel research-based design in an authentic educational setting"](https://www.nature.com/articles/s41598-025-97652-6), *Scientific Reports* 15:17458 (June 2025).
- A crossover RCT with **194** students in Harvard's introductory physics course (PS2).
- Two lessons, on surface tension and fluid flow.
- Students did one lesson at home with a GPT-4 tutor ("PS2 Pal") and the other in class. The class lesson was *active learning* run by experienced instructors: peer instruction, small groups and instructor feedback. The conditions swapped the next week.

[V abstract; design details S via [Barris review](https://barrisreview.com/blog/harvard-ai-tutor-rct/), [Harvard Gazette](https://news.harvard.edu/gazette/story/2024/09/professor-tailored-ai-tutor-to-physics-course-engagement-doubled/), [ETC review](https://etcjournal.com/2025/11/10/review-of-kestin-et-al-s-june-2025-harvard-study-on-ai-tutoring/)]

**Design.** The system prompt encoded active-learning practice:
- facilitate active learning and don't hand over solutions;
- manage cognitive load: one step at a time, brief responses;
- promote a growth mindset and use encouraging language;
- scaffold, and give accurate feedback tailored to the student's specific error;
- let the student set the pace.

Most importantly, **each problem's prompt contained an instructor-written, step-by-step solution** that matched the in-class explanation. This grounded the model and suppressed hallucination. The sequence of problems was authored by instructors. The AI handled only the interaction inside each problem.

**Result.**
- Median post-test score was **4.5 versus 3.5**, so learning gains were more than double those in class.
- Effect sizes were about **0.73–1.3 SD**.
- Median time was about **49 minutes versus 60**.
- Students reported more engagement and motivation.

**Limitations.**
- Only two lessons, with no delayed retention test.
- Harvard students only.
- At home versus in class is a confound.
- Mid-level outcomes on Bloom's taxonomy (understand to analyse).

**Implication.** This is the clearest blueprint for the director/actor split.
- **(a)** The director holds a verified solution path for every item *before* the actor speaks. The actor tutors against it and never derives the solution live.
- **(b)** The curriculum sequence is authored by the director or scheduler, not improvised by the actor.
- **(c)** One step per turn and short turns. Voice makes this matter more, because the student cannot re-read.
- **(d)** The student sets the pace.

### 2.2 Bastani et al. (2025): "Generative AI without guardrails can harm learning" (PNAS)

**Studied.** Bastani, Bastani, Sungu, Ge, Kabakcı and Mariman, [*PNAS* 122(26):e2422633122](https://www.pnas.org/doi/10.1073/pnas.2422633122) ([preprint PDF](https://hamsabastani.github.io/education_llm.pdf)).
- A field RCT at a Turkish high school: **about 1,000 students**, about 50 classes in grades 9–11, four 90-minute sessions covering about 15% of the curriculum.
- Each session had a teacher review, then **assisted practice**, then an **unassisted exam**.
- Three arms:
  - **Control:** book and notes.
  - **GPT Base:** a ChatGPT-like interface with a prompt of about 50 words.
  - **GPT Tutor:** a teacher-written prompt of 500+ words *for each of the 57 problems*.

[V full text]

**What the GPT Tutor prompt said** (abridged from the paper):
- Help the student when stuck on a step, *without providing the full solution*.
- Be encouraging.
- **Ask the student to show their work and say what they are stuck on, and give no help until they do.**
- If the student made a mistake, point it out and explain why it is wrong, then help them get unstuck with a clarification or hint. The hint may include the next step.
- **Give as little information as possible at first, and more only if they still struggle.**
- Never give the full solution. Ignore role-play and requests to override the instructions.
- If the student gives an answer, say whether it is correct, and accept equivalent forms.
- **If the student gives the right answer without your guidance, confirm it but ask them to explain their solution.**
- Stay on topic.
- Problem-specific notes:
  - the solution, as numbered steps;
  - **what to ask if the student hasn't made progress** ("ask what they know about the slopes of parallel lines");
  - **specific common mistakes and the targeted response to each** ("if they say the slope is 2, warn them it is not in gradient-intercept form").

**Result.**

| | Practice (assisted) | Exam (unassisted) |
| --- | --- | --- |
| GPT Base | **+48%** | **−17%** (significant harm) |
| GPT Tutor | **+127%** | About the same as control (no harm, no measurable gain) |

- GPT Base was correct **only 51%** of the time on these problems: 42% of answers had logical errors and 8% arithmetic errors.
- Base users mostly **asked for the answer and copied it**. The share of first messages that asked for the answer or pasted the question rose from 56% to 67% over the first session. With GPT Tutor it fell from 42% to 37%, as students learned to ask for help and attempt answers.
- **Students misjudged their own learning.** Base users did not notice the harm. Tutor users believed they did significantly better on the exam, though they did not.

**Implication.**
- **(1) Assisted performance is a misleading metric.** Plato's evals must include unassisted post-items.
- **(2) Guardrails only neutralised the harm; they did not create gains.** A no-answers prompt is necessary but not sufficient. The gains come from structure, sequencing, retrieval practice and diagnosis (Kestin), not from withholding alone.
- **(3) Attempt first.** No help until the student commits an attempt or says exactly where they are stuck. The exception is the very first move on a new problem, which can be a starter question.
- **(4) A correct answer without visible reasoning triggers "explain how you got that".**
- **(5)** Self-reported learning is worthless as an outcome measure.
- **(6)** Plato's item cards should carry the same three things as Bastani's prompts: the solution steps, the opening question to ask if there is no progress, and the expected mistakes, each paired with its targeted response.

### 2.3 Tutor CoPilot and Bridge (Stanford, 2024)

**Studied.**
- Wang, Ribeiro, Robinson, Loeb and Demszky, ["Tutor CoPilot: a human-AI approach for scaling real-time expertise"](https://arxiv.org/abs/2410.03017) ([EdWorkingPaper ai24-1054](https://edworkingpapers.com/ai24-1054)). An RCT with **900 tutors and 1,800 K-12 students** from historically under-served communities, in live online maths tutoring. The CoPilot suggested expert-like responses to human tutors in real time.
- It builds on **Bridge**: Wang, Zhang, Robinson, Loeb and Demszky, ["Bridging the novice-expert gap via models of decision-making"](https://arxiv.org/abs/2310.10648), NAACL 2024. Using cognitive task analysis, experts were found to decide three things before replying to a mistake:
  - **(A)** what the student's error is;
  - **(B)** a remediation strategy, such as simplifying the problem, asking a question, giving a hint, explaining the concept or giving a worked example;
  - **(C)** an intention, such as getting the student to elaborate, correcting the mistake, or motivating.

  Bridge has 700 real tutoring conversations annotated with these decisions.

[V abstracts]

**Result.**
- **Bridge:** GPT-4 responses conditioned on the expert's decisions were **preferred 76% more often** than unconditioned ones. *Random* decisions cut quality by 97%.
- **Tutor CoPilot:** students were **+4 percentage points** more likely to master topics (p < 0.01), **+9 points** for students of lower-rated tutors.
- Tutors with the CoPilot asked more guiding questions and gave away answers less often.
- Cost was about $20 per tutor per year.

**Implication.** This is the most direct evidence for Plato's director/actor split.
- Making diagnosis, strategy and intention explicit *before* writing the utterance improves quality a lot.
- The decisions must fit the context. A plausible-looking but wrong strategy is worse than none.
- **Director output schema:** `error` (type and step), `strategy`, `intention`. The actor turns these into speech.
- **Evals:** judge each field on its own: was the diagnosis right, did the strategy fit the state, did the actor carry out the intention? Then the utterance can be blamed on the right component.

### 2.4 Google LearnLM: principles, pedagogy benchmarks and the classroom RCT

**Studied.**
- **"Towards Responsible Development of Generative AI for Education"**, Jurenka et al. ([arXiv 2407.12687](https://arxiv.org/pdf/2407.12687), 2024). Participatory design with learners and educators, a fine-tuned LearnLM-Tutor, and a suite of human and automatic pedagogy evaluations. [S]
- **["LearnLM: Improving Gemini for Learning"](https://arxiv.org/html/2412.16429v1)** (Dec 2024). Recasts pedagogy as **"pedagogical instruction following"**: system instructions state which pedagogical behaviours are wanted, rather than baking in one fixed pedagogy.
  - 49 scenarios, each with a subject, learning goal, learner persona, grounding material and system instructions.
  - **168 pedagogy experts role-played learners**, and 228 experts rated the conversations.
  - The rubric covered cognitive load, active learning, metacognition, curiosity and adaptivity.
  - LearnLM was preferred by **31% over GPT-4o, 11% over Claude 3.5 Sonnet and 13% over Gemini 1.5 Pro**.

  [V]
- **Google's five learning-science principles:** inspire active learning, manage cognitive load, adapt to the learner, stimulate curiosity, deepen metacognition. [V]
- **["Evaluating Gemini in an arena for learning"](https://arxiv.org/abs/2505.24477)** (May 2025). 189 educators role-played; 206 experts judged blind, multi-turn, pairwise comparisons. Gemini 2.5 Pro won **73.2%** of match-ups against Claude 3.7 Sonnet, GPT-4o and o3, and led on all five principles. [V]
- **["AI tutoring can safely and effectively support students: an exploratory RCT in UK classrooms"](https://arxiv.org/abs/2512.23633)** (Dec 2025), with Eedi.
  - 165 students in 5 secondary schools.
  - LearnLM drafted each message and expert tutors edited it until they would send it themselves.
  - **76.4% of drafts were approved with zero or minimal edits** (one or two characters).
  - AI-assisted students were **5.5 percentage points more likely to solve novel problems** on later topics (66.2% versus 60.7%) than students with human tutors alone.
  - Tutors said LearnLM was strong at Socratic questioning, and some learned techniques from it.

  [V]

**Implication.**
- **Eval template:** scenario = (goal, persona, grounding notes, director instruction) + a simulated learner + a rubric on the five principles + blind pairwise preference. Plato's suite can copy this with simulated CS 3410 students who hold real misconceptions.
- **The director's instruction to the actor *is* the "pedagogical instruction".** Measure instruction adherence as its own metric: did the actor do what the director asked?
- **A cheap offline quality metric:** "Would an expert tutor send this message unedited?" The UK RCT's 76% is a reference point.
- The five principles map onto rubric dimensions D3, D7, D8 and D9 in §5.

### 2.5 Khanmigo evaluations

**Studied and result.**
- **Khan Academy, ["How Khan Academy is building a better AI tutor"](https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings/) (2025).** [V]
  - Their three core metrics are **response latency**, **next-item correctness** (independent success on the next problem after tutoring) and **cognitive engagement** (is the student reasoning or just receiving).
  - They ran about 20 product tests over 15 million tutoring threads.
  - One change **cut answer-giving by 50%**.
  - They run a **separate system that verifies calculations and checks mathematical expressions in real time**.
  - Adding the student's **learning history** (recent attempts, skill levels, prerequisite progress) improved next-item correctness by **6.1%**.
  - Passing the full session log as plain text raised cognitive engagement by 5.09%.
- **Oreopoulos and Low, NBER w35620 (Aug 2026, not peer reviewed).** A cluster RCT in 18 Tennessee middle schools over 2024–26, with 6,902 student-terms. [S via [summary](https://www.winssolutions.org/khanmigo-ai-tutoring-two-year-trial/); check the primary source]
  - Khanmigo raised maths achievement by **1.26 percentile ranks per term**, about 0.06 SD per year. Year 1 was about 0.02 SD (not significant); year 2 was 0.084 SD.
  - Students messaged Khanmigo in only **17% of sessions where they made errors**. Only **14.5% of messages contained maths questions or reasoning**.
  - The gains look like those from Khan practice without AI. The authors conclude the constraint is **engagement, not model capability**.
- **Smaller studies.** In one with 69 undergraduate physics students, all conditions gained but Khanmigo showed no significant advantage ([J. Teaching and Learning 2025](https://jtl.uwindsor.ca/index.php/jtl/article/view/10052)). [S]

**Implication.**
- **A tutor that waits to be asked will rarely be asked.** Plato is voice-first and leads the session, so the director should start remediation when it sees an error rather than waiting for a help request.
- **Next-item correctness on an unassisted item is the right online metric.** Log it for every concept.
- **Learning history in context helps.** This supports Plato's learner model.
- **Check computations in code.** Number-base conversions, two's complement, RISC-V encodings, cache arithmetic and timing should be verified by a deterministic checker, never by the actor.
- **Latency matters.** Khan and StudentBench (§2.9) both tie speed to engagement. Keep the actor fast and do the director's slow thinking ahead of time.

### 2.6 OpenAI study mode, Claude learning mode, Gemini Guided Learning

**Studied and result.**
- **OpenAI [study mode](https://openai.com/index/chatgpt-study-mode/) (29 July 2025).** [V via coverage: [CNBC](https://www.cnbc.com/2025/07/29/openai-announces-new-study-mode-product-for-students-.html), [EdWeek](https://www.edweek.org/technology/what-teachers-should-know-about-chatgpts-new-study-mode-feature/2025/07)]
  - Custom system instructions written with teachers, scientists and pedagogy experts (40+ institutions).
  - Behaviours: interactive prompts (Socratic questions, hints, self-reflection), scaffolded responses in small chunks, personalisation to skill level (from questions and memory), and knowledge checks (quizzes and open questions with feedback).
  - The student can **switch it off at any time**. OpenAI said building it from system instructions allows fast iteration but can be inconsistent.
- **Anthropic.** [V via coverage: [Engadget](https://www.engadget.com/ai/claudes-new-learning-mode-will-prompt-students-to-answer-questions-on-their-own-172057828.html), [Anthropic report](https://www.anthropic.com/news/anthropic-education-report-how-university-students-use-claude)]
  - **Learning mode** launched with Claude for Education on 2 April 2025. It uses Socratic questions ("how would you approach this?", "what evidence supports your conclusion?") instead of answers.
  - In August 2025 it was extended to all Claude.ai users and to Claude Code as "Learning" and "Explanatory" output styles. The Learning style leaves `TODO(human)` gaps for the user to write.
  - The **Anthropic Education Report** (April 2025) analysed 574,740 student conversations. **47% were "direct"**, seeking answers or content with little engagement. Claude was often doing higher-order cognitive work such as *creating* and *analysing*, which raises concerns about students outsourcing their thinking.
- **Google Gemini Guided Learning** (Aug 2025) is built on LearnLM (§2.4). [K]
- **Outcome evidence for these modes is thin.** One preprint RCT with 90 tenth-graders found Study Mode's Socratic dialogue beat argument-driven inquiry and a control on argumentation and critical thinking ([ResearchGate](https://www.researchgate.net/publication/398686102_Socratic_AI_in_K-12_Science_Classrooms_Effects_on_Critical_Thinking_Motivation_and_Self-Regulation_in_a_Randomized_Controlled_Trial)). [S]

**Implication.**
- All three are **prompt-level and can be toggled off**: no persistent model of the student, no plan, and the student can leave at will.
- Their shared vocabulary is now table stakes: guiding questions, small chunks, knowledge checks, calibrating to level.
- Plato has to do better on four fronts:
  - **(a)** grounding in the student's own notes;
  - **(b)** step-level diagnosis checked against a reference;
  - **(c)** a persistent learner model and plan;
  - **(d)** a director that can hold a structure, such as attempt-first, while still honouring explicit requests (Lepper's "control").
- Anthropic's "direct conversation" share is a warning. Many students will try to turn Plato into an answer engine, and evals must include that persona.

### 2.7 Socratic LLM tutoring: what the studies show

| Source | Studied | Result |
| --- | --- | --- |
| Randomised study of Socratic versus non-Socratic AI ([ResearchGate 2024](https://www.researchgate.net/publication/386547103_The_Impact_of_Large_Language_Models_on_Students_A_Randomised_Study_of_Socratic_vs_Non-Socratic_AI_and_the_Role_of_Step-by-Step_Reasoning_Statements_and_Declarations)) [S] | 122 students aged 14–16 | Step-by-step reasoning statements gave **higher accuracy**. Socratic AI gave **more engagement but no significant learning gain**, and more students found it less helpful. |
| **CoMeT**, ["Adaptive scaffolding needs contingency"](https://arxiv.org/abs/2609.22993) (2026) [V abstract] | 131 participants on Python tasks. Three tutors: contingent (support **rises when the learner fails at a decision point and fades once they take it up**), an unrestricted assistant, and a **question-only** tutor | The contingent tutor matched the question-only tutor's metacognitive demand **with less frustration**. It gave away the full answer in **1 session in 16**, against **1 in 6 for the question-only tutor**. Pure questioning *caves* under pressure. Key principle: keep *what the learner must decide* fixed while varying *how much the system helps*. |
| **TreeInstruct**, ["Instruct, Not Assist"](https://aclanthology.org/2024.findings-emnlp.553/) (EMNLP Findings 2024) [V abstract] | Socratic code debugging, including a new 150-problem multi-bug set | Plans over a **state space of the student's misunderstandings**, estimates conceptual and syntactic knowledge, builds a question tree, and **re-plans as the student's state changes**. State of the art on single-bug and multi-bug debugging. |
| ["Hey Chat, can you teach me?"](https://arxiv.org/abs/2606.11744) (2026) [V abstract, simulated students] | Prerequisite knowledge graph; an RL policy picks **which node to teach next and how many turns to spend**; the LLM runs the Socratic exchange | Beat heuristic baselines, frontier general models and specialised Socratic models on mastery rate and turns needed. "**Explicit curriculum structure delivers gains that scaling the underlying model does not.**" |
| SocraticLM (Liu et al., NeurIPS 2024) [K] | A Socratic teaching dataset with simulated student cognitive states | Fine-tuning on structured Socratic dialogues beats prompted GPT-4 on its teaching metrics. |
| MathTutorBench (§3.3) | Long-dialogue tutoring | "Simpler questioning strategies begin to fail" as dialogues get longer. |

**Implication.**
- **Pure Socratic questioning is not a strategy.** It frustrates students, and when they push, it collapses into giving the answer.
- Use **contingent scaffolding**:
  - The student makes each *decision*: what to try, which concept applies, what the next step is.
  - The amount of *help* responds to failure. The tutor can explain properly once the student has committed an attempt.
- **The director plans at two levels:**
  - across concepts: which node, and for how long (Hey Chat; Plato's scheduler);
  - inside a problem: the open misconceptions, re-planned after each turn (TreeInstruct).
- **Evals: a "help abuse" persona.** It demands the answer three times. Pass means the tutor escalates help in steps and never jumps from a hint to the full solution. Fail means caving on the first push, or stonewalling.

### 2.8 LLM tutors giving answers away, hallucinating and over-praising

| Failure | Source | Finding |
| --- | --- | --- |
| **Answer leakage** | [MathDial](https://aclanthology.org/2023.findings-emnlp.372/) (Macina et al., EMNLP Findings 2023) [V abstract] | LLMs "generate factually incorrect feedback or reveal solutions to students too early." Teachers in the 3k dialogues used Focus, Probing, Telling and Generic moves. The evaluation weighs **student success against how much the tutor told**. |
| | [MRBench](https://aclanthology.org/2025.naacl-long.57/) (§3.2) [V] | **GPT-4 revealed the answer in about 47% of responses**, the worst of the models tested. |
| | [Dinucu-Jianu et al. 2025](https://arxiv.org/abs/2505.15607) [V abstract] | Strong solvers (Qwen2.5-72B, DeepSeek V3) reach high student solve rates **with high leakage**. Their default is to answer. |
| **Hallucinated or wrong content** | Bastani 2025 (§2.2) | GPT-4 correct only 51% on high-school maths problems |
| | Pardos and Bhandari (2024), [*PLOS ONE* 19(5):e0304013](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0304013) [V abstract] | ChatGPT-written hints produced **the same learning gains as human-written hints** (N = 274). But **32% failed quality checks**. **Self-consistency** (sample several, keep the majority) cut that to about 0% in algebra and 13% in statistics. |
| **Can't find the error** | Daheim et al. (2024), ["Stepwise verification and remediation of student reasoning errors"](https://aclanthology.org/2024.emnlp-main.478/), EMNLP [V abstract] | LLMs solve problems well but **struggle to locate the student's error** and tailor feedback to it. A **verify-then-generate** pipeline, which first locates and explains the error and then writes the reply, gave more targeted, less hallucinated feedback than generating directly. |
| | ["LLMs cannot spot math errors, even when allowed to peek into the solution"](https://arxiv.org/pdf/2509.01395) (2025) [S title and abstract] | Error localisation stays weak even with the reference solution in context. |
| **Over-validation (sycophancy)** | ["Confirming correct, missing the rest"](https://arxiv.org/abs/2605.16207) (2026) [V abstract] | 7 LLM feedback agents and 10,836 solution-feedback pairs in propositional logic. Near-ceiling on optimal solutions, but systematic **over-validation of invalid solutions** (Gemini and DeepSeek 69–71%). There was also **over-rejection of valid but non-standard solutions** (13–17% for those two models). Agents "often praised solutions without identifying errors or giving actionable guidance". The failures persisted with more context ("architectural, not informational"). Recommendation: **symbolic or knowledge-graph diagnosis plus LLM dialogue**. |
| | ["Sycophancy is an educational safety risk"](https://arxiv.org/abs/2605.14604) (2026) [S] | When the student *states* a wrong answer, the LLM's accuracy can drop by **up to 15 points**, and stating the right one raises it by the same. This **widens gaps**: it helps students who already know and misleads those who don't. |
| **Over-praise** | Same paper; MRBench "tutor tone"; [The 74](https://www.the74million.org/article/ai-tutors-are-praising-instead-of-teaching-heres-why-thats-hurting-students/); ["Sycophantic praise"](https://arxiv.org/pdf/2606.07441) (2026) [S] | Agents praise solutions **without finding the error or giving next steps**, even when told to acknowledge what is right *and then* address errors. Human research backs this up: Kluger and DeNisi (1996) found feedback aimed at the self rather than the task often *lowers* performance, and Mueller and Dweck (1998) found praise for intelligence hurts persistence. [K] |
| **Not adapting** | Borchers and Shou, ["Can LLMs match tutoring system adaptivity?"](https://arxiv.org/abs/2504.05570) (2025) [V abstract] | **Removing the student's error and knowledge components from the prompt barely changed** the responses of Llama3-8B, Llama3-70B or GPT-4o. Only Llama3-70B responded measurably to student errors. GPT-4o was **too prescriptive**. |
| **Substitution versus complement** | Lehmann, Cornelius and Sting (2025), ["AI meets the classroom"](https://arxiv.org/abs/2409.09047) [V abstract] | Using LLMs to *substitute* (generate solutions) increases the volume of topics covered but **decreases understanding**. Using them to *complement* (ask for explanations) increases understanding. LLMs **widen the gap** between low and high prior knowledge. |

**Implication.**
- **The actor never judges correctness by itself.** The director runs a **verifier** before choosing the move:
  - computations go to code;
  - reasoning goes to an LLM judge that has the reference solution and misconception list, using several samples or self-consistency.
- **Ask for the diagnosis "blind".** Classify the student's step against the reference *before* the model sees the student's confident framing or its own earlier praise.
- **Allow alternative correct solutions explicitly**, to avoid over-rejection: "valid, non-standard" is its own verdict.
- **Adaptivity test for evals:** run the same move request with and without the student-state card. If the output barely changes, the director is not using the state.
- **Praise rule:** acknowledge *specific correct steps*. No evaluative adjectives unless the work is unusual. Never praise an answer the verifier hasn't passed.

### 2.9 LLM tutors with a student model or a separate pedagogical planner (2024–2026)

| Work | Architecture | Result |
| --- | --- | --- |
| Scarlatos et al. (2025), ["Training LLM-based tutors to improve student learning outcomes in dialogues"](https://arxiv.org/abs/2503.06424) [V abstract] | Candidate tutor turns are scored by **(a) a student simulator that predicts whether the student's next answer will be correct** (dialogue knowledge tracing, LLMKT) and **(b) a GPT-4o pedagogy rubric**. Then DPO on Llama 3.1 8B. | Higher predicted student correctness while keeping GPT-4o-level pedagogy |
| Dinucu-Jianu, Macina, Daheim, Hakimi, Gurevych and Sachan (2025), ["From problem-solving to teaching problem-solving"](https://arxiv.org/abs/2505.15607), EMNLP oral [V abstract] | Online RL against a simulated student. Reward = student solve success + **leakage penalty** + pedagogy judges, with a tunable trade-off. Optional **thinking tags expose the teaching plan before the reply**. | A 7B tutor reaches LearnLM level and keeps its reasoning ability |
| TreeInstruct (2024), Hey Chat (2026), CoMeT (2026) | Planning over the student's misconception state; a knowledge-graph curriculum policy; contingent escalation (§2.7) | Each beat flat prompting |
| ["Confirming correct, missing the rest"](https://arxiv.org/abs/2605.16207) (2026) | Recommends a hybrid: symbolic diagnosis, LLM dialogue | n/a (position based on results) |
| Khan Academy (2025) | Learning history plus a separate calculation verifier | +6.1% next-item correctness |
| ["Interpretable difficulty-aware knowledge tracing in tutor-student dialogues"](https://arxiv.org/abs/2605.01097) (2026); [DeepTutor](https://arxiv.org/abs/2604.26962) (2026); ["The path to conversational AI tutors"](https://arxiv.org/abs/2602.19303) (2026) [S titles and abstracts] | Knowledge tracing on dialogue turns; agentic personalised tutoring; a survey combining tutoring best practice with targeted technologies | The field is converging on explicit student state plus planning |
| [StudentBench](https://arxiv.org/abs/2609.28470) (2026) [V abstract] | 2,383 participants on GRE prep, comparing several AI tutors, expert human tutors and no tutoring | The best AI was **statistically equivalent to expert human tutoring** and ahead in 5 of 7 domains, at about **918× lower cost per point gained**. In quantitative sessions, **faster responses led to more engagement, which led to better practice accuracy, which led to larger gains**. |

**Implication.** The field is converging on four parts, which Plato's director/actor split already has:
1. an **explicit student state**: ability per concept plus misconceptions;
2. a **planner** that picks what to teach and for how long;
3. a **constrained utterance generator**, the actor;
4. a **verifier**.

What to add from this evidence:
- **(a)** As a tie-breaker between candidate moves, the director can use **predicted student success on the next probe** (Scarlatos). Plato's ability-and-difficulty model already gives this.
- **(b)** Log the director's plan or reasoning for each move, as Dinucu-Jianu's thinking tags do, so evals can tell a bad decision from a bad realisation.
- **(c)** Keep the actor fast. Latency is part of pedagogy (StudentBench, Khan).

### 2.10 Further field evidence

- **Nigeria, World Bank.** De Simone et al. (2025), ["From chalkboards to chatbots"](https://ideas.repec.org/p/wbk/wbrwps/11125.html), WPS 11125. A 6-week after-school English programme: students worked in pairs on GPT-4 **under teacher supervision**, with prompts designed to promote reasoning. Result: **+0.31 SD**. [V summary]
- **["Rethinking scaffolding in LLM tutors"](https://arxiv.org/abs/2606.15766) (2026).** 9,490 conversations across 9 datasets. [V abstract]
  - Benchmarks assume heavy scaffolding *and* students who follow it.
  - In real deployments, uptake drops. Students **bypass the scaffolding to pursue their own learning goals**, often for legitimate reasons.
  - Recommendation: evaluate how tutors handle **student-driven** interaction.

**Implication.**
- **Evals need non-compliant personas:**
  - "just tell me";
  - "I only care about the exam format";
  - a student who changes topic halfway;
  - a student who gives one-word answers.
- Grade **graceful adaptation**: renegotiate the goal, offer a choice, compress the scaffold. Do not reward rigidly re-imposing the plan.

---

## 3. Benchmarks and rubrics for judging tutoring quality

### 3.1 MathDial (Macina et al., EMNLP Findings 2023)

**Studied.** [MathDial](https://aclanthology.org/2023.findings-emnlp.372/) is **3k one-to-one dialogues** grounded in multi-step maths word problems. Human teachers tutored an **LLM-simulated student that held a misconception** taken from a real wrong solution. Each teacher move is labelled with one of four categories:
- **Focus:** direct attention to a part of the problem.
- **Probing:** ask a question that makes the student reason.
- **Telling:** reveal a step or the answer.
- **Generic:** rapport and filler.

[V abstract]

**Result.**
- Models fine-tuned on MathDial were better tutors than larger prompted models.
- The interactive evaluation plots **student solve success against how much the tutor told**.

**Implication.**
- Plato's multi-turn evals should report this **success-versus-telling frontier**, not just success. A tutor that "succeeds" by telling everything is the GPT Base condition (§2.2).
- The four move labels are a cheap first-pass tag for the actor's turns. A target profile for remediation turns is mostly Focus and Probing, with Telling only after the escalation ladder runs out.

### 3.2 Maurya et al. (2025): the "unifying" tutor-evaluation taxonomy and MRBench

**Studied.** Maurya, Srivatsa, Petukhova and Kochmar, ["Unifying AI tutor evaluation: an evaluation taxonomy for pedagogical ability assessment of LLM-powered AI tutors"](https://aclanthology.org/2025.naacl-long.57/), NAACL 2025 ([arXiv](https://arxiv.org/html/2412.09416v1), [code and data](https://github.com/kaushal0494/UnifyingAITutorEvaluation)). The task is judging a **single tutor response to a student's mistake** in a maths dialogue. [V]

**The 8 dimensions.**

| # | Dimension | Question | Labels |
| --- | --- | --- | --- |
| 1 | Mistake identification | Has the tutor identified a mistake in the student's response? | Yes / To some extent / No |
| 2 | Mistake location | Does the response point accurately to a genuine mistake and where it is? | Yes / To some extent / No |
| 3 | Revealing the answer | Does the tutor reveal the final answer (and is it correct)? | Yes, correct / Yes, incorrect / No (**No** is desired) |
| 4 | Providing guidance | Does the tutor offer correct, relevant guidance (explanation, elaboration, hint, example)? | Yes / To some extent / No |
| 5 | Actionability | Is it clear what the student should do next? | Yes / To some extent / No |
| 6 | Coherence | Is the response logically consistent with the student's previous turn? | Yes / To some extent / No |
| 7 | Tutor tone | | Encouraging / Neutral / Offensive |
| 8 | Human-likeness | Does it sound natural rather than robotic? | Yes / To some extent / No |

**MRBench.**
- 192 dialogues (60 from Bridge, 132 from MathDial), giving **1,596 responses** from 7 LLMs (GPT-4, Gemini, Claude Sonnet, Mistral, Llama-3.1-405B and 8B, Phi-3) plus novice and expert humans.
- Human inter-annotator agreement: Cohen's κ = 0.71.

**Result.**
- **GPT-4 revealed the answer about 47% of the time**, the worst of the models.
- **Novice humans scored about 1.7% on actionability; experts about 76%.**
- **Prometheus2, used as an LLM judge, correlated *negatively* with human labels** on most dimensions.

**Implication.**
- These 8 dimensions, with **categorical three-level labels**, are a sound skeleton for a per-move rubric. §5 adopts them, adds the state-dependent dimensions they lack, and adds gates.
- **Never trust an off-the-shelf LLM judge without calibrating it on human labels.**
- The taxonomy judges a single response in isolation. It does not ask whether the move *fit the student's state*: telling can be right for a novice. Plato's rubric has to add that (§5, D2).

### 3.3 BEA 2025 shared task and MathTutorBench

**BEA 2025 shared task.** Kochmar et al., ["Findings of the BEA 2025 shared task on pedagogical ability assessment of AI-powered tutors"](https://aclanthology.org/2025.bea-1.77/). [V abstract]
- An extended MRBench (about 300 development and 191 test dialogues).
- Five tracks: mistake identification, mistake location, providing guidance, actionability, and tutor identity.
- More than 50 teams took part.
- **The best macro-F1 on the four pedagogical tracks ranged from 58.3 (providing guidance) to 71.8.** Tutor identity reached about 97.

**Implication.** Even tuned automatic judges are mediocre at "is this guidance good?". Plato's judge for that dimension needs:
- the reference solution and misconception list in context;
- anchored examples;
- a periodic human audit.

**MathTutorBench.** Macina et al. 2025, [arXiv 2502.18940](https://arxiv.org/abs/2502.18940). [V abstract; task list K]
- It tests three groups of skills:
  - **expertise:** solving problems;
  - **student understanding:** judging whether a student's solution is correct, locating the mistake, correcting it;
  - **pedagogy:** generating scaffolding and following pedagogical instructions.

  The pedagogy tasks are scored by a **Pedagogical Reward Model** trained to tell expert teacher turns from novice ones, which it does with high accuracy.
- **Subject expertise does not turn into teaching.** Models trade solving ability against pedagogy.
- **Tutoring gets harder in longer dialogues.**

**Implication.**
- A model's solving accuracy on CS 3410 says little about its tutoring.
- Test multi-turn sessions of realistic length (20–40 turns), not only single turns.
- A pairwise "expert versus candidate" reward model is a useful second judge.

### 3.4 Other rubrics worth borrowing

| Source | What to borrow |
| --- | --- |
| LearnLM rubric and arena (§2.4) | Five principles as rubric categories; **blind, pairwise, multi-turn** comparisons by experts role-playing learners; scenario specs (goal, persona, grounding, instruction) |
| Bridge / Tutor CoPilot (§2.3) | Judge **error, strategy and intention** separately from wording |
| AutoTutor (§1.6) | Per-expectation coverage: student-produced, prompted, or asserted |
| Khan Academy (§2.5) | Online metrics: **next-item correctness**, cognitive engagement, latency, answer-giving rate |
| Bastani (§2.2) | **Unassisted** exam after assisted practice; first-message categories (asks for answer, pastes question, shows work) |
| Scarlatos 2025 (§2.9) | Predicted correctness of the student's next answer as an outcome score for a move |
| CoMeT (§2.7) | Answers surrendered per session under pressure; learner frustration; delegation |
| Rethinking Scaffolding (§2.10) | Student uptake of scaffolds; how the tutor handles student-driven turns |
| Newer frameworks: [TEACH-AI](https://arxiv.org/abs/2512.04107), [AITutor-EvalKit](https://arxiv.org/abs/2512.03688) (EACL 2026 demo), [reward modelling for mistake remediation](https://arxiv.org/abs/2603.24375), [ELBench](https://arxiv.org/abs/2608.09548) [S titles and abstracts] | Tooling and extra dimensions. Review before building our own judge harness. |

**Lessons for Plato's eval suite.**
1. **Use categorical labels with written anchors**, not 1–10 scores. MRBench reached κ = 0.71 with three-level labels.
2. **Give the judge the reference solution, the expected misconceptions and the student-state card.** Judges fail at mistake identification without them (Daheim; "peek into the solution").
3. **Calibrate every LLM judge** against 30–50 human-labelled moves per dimension, and report agreement before trusting it. Prometheus2's negative correlation and the BEA ceilings are the warning.
4. **Separate decision quality (director) from realisation quality (actor).**
5. **Use outcome metrics as well as per-move metrics:**
   - unassisted post-item success;
   - the success-versus-telling frontier;
   - turns to mastery;
   - student-generation ratio;
   - answer surrender under pressure.
6. **Include adversarial and non-compliant personas** (§2.10), not just cooperative simulated students.

---

## 4. Taxonomy of tutoring moves, and when each is right

The moves fall into seven families. The "Plato 7.1" column maps each to the move list in `docs/history/teacher-architecture.md` §7.1. A dash means that list has no equivalent yet. **Bold** marks gaps worth adding to the director's vocabulary.

### 4.1 Diagnose

| Move | What it sounds like | Right when | Wrong when | Evidence | Plato 7.1 |
| --- | --- | --- | --- | --- | --- |
| **Request attempt** | "Talk me through what you'd do first." | Start of a problem; the student asks for help without having tried | The student has already shown work | Bastani prompt; INSPIRE (solution phase is the student's) | — |
| **Open diagnostic probe** | "How did you get 0x1F?" | After a wrong or unexplained answer, before any correction | A trivial slip the student will catch with a nudge | Chi 2004; Lepper "Progressive" | in "Moving left" |
| **Discriminating question** | A question whose answer differs by misconception: "If the immediate is 0xFFF, what value goes into the register?" | Two or more candidate misconceptions fit the evidence | No misconceptions are known for the concept | AutoTutor misconceptions; TreeInstruct | — |
| **Confidence check** | "How sure are you, 1 to 5?" | Right answers where luck is possible; calibrating the ability estimate | Every turn: it becomes a tic | Metacognition principle (LearnLM) | — |

### 4.2 Elicit and construct (student generates)

| Move | What it sounds like | Right when | Wrong when | Evidence | Plato 7.1 |
| --- | --- | --- | --- | --- | --- |
| **Pump** | "What else happens in that stage?" | Partial answer, with some expectations still uncovered | The student is stuck and has nothing more to give | AutoTutor | — |
| **Prompt** (fill a specific gap) | "...and the sign bit gets...?" | A pump failed; one specific piece is missing | Overused, it becomes fill-in-the-blank with no thinking | AutoTutor | — |
| Explain why / self-explanation prompt | "Why does sign-extension preserve the value?" | After a correct step, to deepen it; moderate or higher ability | The student lacks the pieces, so it guarantees failure | Chi 2001; ICAP | Explain why |
| **Predict** | "Before we run it, what will x5 hold?" | Before a demonstration or worked example; to provoke curiosity or conflict | | INSPIRE curiosity; Chi | — |
| Teach-back | "Explain caching to a friend who missed lecture." | Near mastery, to consolidate and expose gaps | Low ability: it's just a failure | ICAP; Chi | Teach back |
| **Reflect / generalise** | "What was the key move in that one? Where else would it work?" | **Right after a success** | Mid-struggle | INSPIRE "Reflective" | — |
| **Compare and contrast** | "How is a write-back cache different from write-through on this trace?" | Two confusable concepts; transfer goal | | Contrasting cases [K] | Combine (partial) |

### 4.3 Feedback

| Move | What it sounds like | Right when | Wrong when | Evidence | Plato 7.1 |
| --- | --- | --- | --- | --- | --- |
| **Verify and extend** | "Yes, 12. Now what if the offset were negative?" | A correct answer with visible reasoning | The answer is right but the reasoning is unseen: ask for the explanation first | D'Mello 2010; Bastani | — |
| **Indirect error flag** | "Check your step 2." | First response to a likely slip, so the student can repair it | A misconception (the nudge won't fix it); a repeated error | Lepper "Indirect"; Fox; Merrill | — |
| **Locate error** | "The shift amount is where it goes off." | The flag failed, or the error is conceptual | Before giving the student a chance to self-repair a slip | MRBench "mistake location"; VanLehn step granularity | — |
| **Elaborated corrective** | Brief why-it's-wrong, plus the principle | A misconception was confirmed by the diagnosis | A slip | Kluger and DeNisi; Shute 2008 [K] | — |
| **Let it go (log it)** | (no comment; revisit later) | A trivial error that doesn't block the goal | It will compound into later steps | INSPIRE | — |

### 4.4 Help ladder (contingent; one step per failed attempt, fades on success)

| Level | Move | Example | Evidence |
| --- | --- | --- | --- |
| H0 | Pump or wait | "Keep going, what's next?" | AutoTutor |
| H1 | **General hint** (strategy or concept pointer) | "Think about what the load does with the upper bits." | INSPIRE "general to specific"; Bastani "as little as possible" |
| H2 | **Specific hint** (focus) | "The byte is 0x80. Is its top bit set?" | MathDial "Focus" |
| H3 | **Bottom-out step** (tell one step) | "So lb sign-extends and you get 0xFFFFFF80. What's the next step?" | Bastani ("the hint can include the next step") |
| H4 | **Worked solution** (assert), then an isomorphic problem | Full walkthrough, then "your turn on this one" | AutoTutor assertion; worked-example effect |

**Rule:** after any told step (H3 or H4), the very next move hands the work back to the student. The told step counts as weak evidence for the ability estimate.

### 4.5 Instruct (tutor-led, legitimately)

| Move | Right when | Wrong when | Evidence | Plato 7.1 |
| --- | --- | --- | --- | --- |
| Orient (brief explanation) | New concept with low ability; a missing prerequisite; the student asks for an explanation | The student could reach it with one prompt; an explanation is already in progress | VanLehn 2007; expertise reversal | Orient |
| Worked example with think-aloud and prediction | New procedure, low ability | Ability is already moderate (expertise reversal) | Sweller, Kalyuga | Worked example |
| Faded example | Moving from low to moderate ability on a procedure | | Renkl | Faded example |
| **Representation switch** | Stuck at the same difficulty after 2 failures | First failure | INSPIRE "Intelligent" (analogies, visual models) | Sideways rule |
| **Cognitive conflict / contrast** | A misconception is confirmed: set up a case where the student's model predicts wrongly | No misconception has been diagnosed | INSPIRE ("highlight inconsistencies"); productive failure | — |
| **Consolidate after struggle** | After a productive-failure attempt: compare the student's attempt with the canonical solution | | Sinha and Kapur 2021 | — |

### 4.6 Practice and assessment

| Move | Right when | Plato 7.1 |
| --- | --- | --- |
| Generative check (never "make sense?") | After any explanation; after "I get it" | Check |
| Solo problem | Ability near the item's difficulty (predicted success about 70%) | Solo problem |
| Variation / transfer | Two successes in a row | Variation, Transfer |
| Spot the error | Moderate or higher ability; a known misconception to inoculate against | Spot the error |
| Interleaved review | Concept due by the forgetting model | Scheduler |

### 4.7 Session, affect and agency

| Move | Right when | Evidence |
| --- | --- | --- |
| **Goal set / renegotiate** | Session start; the student pushes back on the plan | Lepper "control"; Rethinking Scaffolding |
| **Offer choice** | Several reasonable next steps ("one more like this, or try the exam version?") | INSPIRE "control" |
| **Attributional encouragement** ("this one trips most people") | After a failure on a hard item | INSPIRE "confidence" |
| **Comply with an explicit request** | "Just show me": give a worked example of an *isomorphic* problem or the next step, then hand back. In exam-cram mode, telling more is fine. | INSPIRE "control"; CoMeT |
| **Pace change / break** | Frustration signals; repeated failures; long session | INSPIRE "nurturant" |
| **Student summary** | End of a segment: the student summarises, the tutor fills gaps | INSPIRE "reflective"; AutoTutor summary |

### 4.8 Decision procedure for the director (in order; first match wins)

1. **Verify first.** Classify the student's last contribution against the reference, using the code verifier where possible: *correct*, *valid but non-standard*, *slip*, *misconception (which one)*, *missing prerequisite*, *no attempt*, *off-task or request*.
2. **Explicit request or goal change.** Honour it within the constraints: renegotiate, comply partially, then hand back.
3. **No attempt yet.** Request an attempt, or ask the problem's planned *starter question*. Don't help yet.
4. **Correct with visible reasoning.** Verify and extend. After two in a row, move harder or reflect.
5. **Correct without reasoning, or low confidence.** Ask for the explanation (Bastani). Hold the ability update until the explanation comes.
6. **Slip.** Indirect flag. If it is repeated, locate the error.
7. **Misconception.** Discriminating question if the cause is uncertain. Then cognitive conflict. Then the student restates the correct model. Log it and schedule an inoculating spot-the-error item later.
8. **Missing prerequisite.** Short detour: orient or worked example on the prerequisite, then return to the original step.
9. **Stuck.** Climb the help ladder one level (H0 to H4). Never skip more than one level unless the student asks or frustration is high.
10. **Two failures at the same level.** Switch representation or step down in difficulty. Raise the target success rate to about 80%.
11. **"I get it" with no evidence.** Generative check.
12. **Otherwise** follow the scheduler's plan, aiming at about 70% predicted success.

---

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

## 6. Failure modes of LLM tutors and how to guard against each

| # | Failure | Why LLMs do it | Evidence | Guard (director / actor) | Eval check |
| --- | --- | --- | --- | --- | --- |
| 1 | **Answer leakage / over-telling** | Trained to be helpful and complete | MRBench (GPT-4 47%); MathDial; Dinucu-Jianu; Bastani | Director owns the help level; the actor gets only the information that level allows. The reference answer is *withheld from the actor's context* until H3/H4. | G2; O2; O4 |
| 2 | **Caving under pressure** (gives up the answer when pushed, or under role-play or "my teacher said it's fine") | Instruction-following and sycophancy | CoMeT (question-only tutor caved 1 in 6); Bastani prompt had to forbid overrides | An explicit-request policy in the *director*: escalate one level per request, offer an isomorphic worked example, hand back. The actor can't jump levels. | O4 with the help-abuse persona |
| 3 | **Rigid Socratic stonewalling** | Over-correcting for #1 | CoMeT (frustration); Socratic RCT (less helpful, no gain); Rethinking Scaffolding | Contingent ladder with a guaranteed H4; after 2 failures, switch representation or step down. Honour explicit requests (Lepper "control"). | D3 = 0 for no escalation; frustration markers (O8) |
| 4 | **Hallucinated content / wrong solutions** | Generating rather than retrieving; arithmetic | Bastani (51% correct); Pardos (32% hint failures) | Authored reference solutions per item (Kestin); a code verifier for computations (Khan); self-consistency for generated hints (Pardos); grounding in the course notes | G1, G3 |
| 5 | **Over-validation** (accepts wrong work) | Sycophancy; anchoring on the student's confident claim | "Confirming correct" (69–71%); sycophancy 15 points | **Blind verdict:** verify the step against the reference before generating any reply; the verdict is a structured field the actor must honour | O5; G1 |
| 6 | **Over-rejection** (marks valid non-standard work wrong) | Matching to one reference path | "Confirming correct" | Item cards list accepted alternatives; verdict category "valid, non-standard"; check equivalence in code where possible (Bastani: "accept equivalent answers") | O5 |
| 7 | **Can't locate the error / generic feedback** | Solving ≠ diagnosing | Daheim 2024; MathTutorBench; "peek into solution" | Verify-then-generate: the director locates the first wrong step before choosing a move; misconception inventory per concept | D1; D5 |
| 8 | **Reflex praise / over-praise** | Preference training rewards affirmation | "Sycophantic praise"; Graesser politeness bias; Kluger and DeNisi | Praise only verified, specific work; banned-pattern lint (architecture §8.5); attributional encouragement in place of evaluative adjectives | D6; lint rate |
| 9 | **Not adapting to student state** | State in the prompt is ignored; generic best response | Borchers and Shou 2025 | The director decides with explicit state fields, and the move must cite them ("ability low, misconception M2 open"); the actor receives the decision, not the raw state | O6 ablation |
| 10 | **Lecturing / over-explaining** | Long, complete answers are the default | Herppich 2016; Chi 2001 | Word budget per move (D8); every explanation is followed by a student-generative move; explanation is a deliberate move choice, not filler | D4, D8; O3 |
| 11 | **Accepting self-reports** ("yeah got it") | Takes the user at their word | Chi 2004; Graesser 1995 | Self-report never updates the ability estimate; it triggers a generative check | D2 |
| 12 | **Illusion of learning** (high assisted success, low independent success) | Help stays too high; no fading | Bastani (+48% practice, −17% exam; students didn't notice) | Fade help on success; interleave unassisted items; never count assisted success as full evidence (architecture §6.1 already weights help as weak evidence) | O1, O7 |
| 13 | **Student bypass / disengagement** | Students use AI as an answer engine, or don't use it | Khanmigo RCT (17% of error sessions); Anthropic report (47% direct); Rethinking Scaffolding | The tutor leads in voice; it starts remediation when it detects an error; goals are visible and negotiable; adapts the scaffold rather than abandoning or forcing it | Non-compliant personas; D9 |
| 14 | **Long-dialogue drift** (loses the plan, repeats strategies) | Context length; no explicit plan state | MathTutorBench; Hey Chat | The director holds plan state outside the transcript: open expectations, help level, misconceptions; re-plans each turn (TreeInstruct) | Sessions of 20–40 turns in evals |
| 15 | **Cognitive overload in voice** | Text-style answers spoken aloud | Kestin (one step at a time); LearnLM cognitive load principle | One idea per turn; notation goes on the board, not in speech | D8 |
| 16 | **Widening gaps** (helps strong students, misleads weak ones) | Sycophancy plus substitution use | Lehmann 2025; sycophancy study | Stricter verification and more scaffolding at low ability; low-ability persona weighted heavily in evals | Results by persona ability |
| 17 | **Evaluator failure** (the judge is wrong) | LLM judges are weak at pedagogy | Prometheus2 negative correlation (MRBench); BEA guidance F1 58 | Calibrate on human labels; give the judge the reference and state; categorical anchors; periodic human audit | Judge κ report |

---

## 7. Open questions to settle with Plato's own data

- **Productive failure versus worked examples for CS 3410.** Which concepts are mainly procedural (encoding, conversions), and which conceptual (pipelining hazards, caching policy)? §1.9 says their defaults differ. A small A/B on two concepts would settle it.
- **Indirect versus direct correction in voice.** Lepper's indirect style was observed with children face to face. In voice, a subtle hint may simply go unnoticed. Measure self-repair rate after an indirect flag.
- **Word budgets.** The 60 and 120 word anchors in D8 are a starting point. Tune them against the student-generation ratio and next-item correctness.
- **Check Oreopoulos and Low (NBER w35620) against the primary paper** before quoting its numbers. The figures here came from a secondary summary.
