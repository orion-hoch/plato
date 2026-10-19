# Domain generality: how learning and teaching differ across subjects, and what one tutor must vary

Research brief for Plato, an AI voice tutor with a shared page that must teach **any** university course from the student's own materials. Compiled 2026-10-08. Cited as [Generality] by `docs/system-spec.md`, whose §9 table ("Domain adapters") this brief is meant to finalize.

**Scope.** How learning and teaching differ by kind of domain, which subject-specific findings change the tutor's moves, what earlier domain-general tutoring architectures abstracted (and where they broke), what LLM-era systems show about generalizing, and from all of that: a domain-general model, a domain-adapter specification, and a validation plan.

**Not repeated here** (see siblings): conceptual change basics, ICAP, worked examples versus productive failure, retrieval and spacing, contrasting cases [Understanding]; tutoring evidence, AutoTutor's EMT loop, LearnLM's pedagogy evaluations, move rubric [Tutoring]; learning styles, knowledge tracing, Cognitive Tutor/ASSISTments/ALEKS outcomes, Duolingo HLR [Personalization]; KLI's KC taxonomy, CTA, UbD, threshold concepts, notional machines, Parsons basics, subgoal labels [Decomposition].

**Confidence tags** (same as siblings):
- **[V]** checked this pass against the primary text, abstract or publisher page.
- **[S]** taken from a published summary or secondary write-up; check the primary before quoting numbers.
- **[K]** established literature cited from background knowledge; the finding is standard, exact figures unchecked.

**Evidence grades:** **Strong** (several meta-analyses or many replicated RCTs), **Moderate** (one meta-analysis or several solid experiments), **Weak** (single studies, quasi-experiments, design argument, expert consensus).

_Status: complete (2026-10-08). Web search was unavailable for this pass (the session's search budget was spent), so sources were checked through the ERIC, Crossref, arXiv, PubMed and Semantic Scholar APIs and publisher or arXiv pages; the tags say what was checked._

## Contents
0. The short version
1. Kinds of domain: well-structured, ill-structured, and what lies between
2. Correctness, misconceptions and argument in ill-structured domains
3. Subject-specific evidence that changes the teaching moves
4. Domain-general tutoring architectures: what they abstracted, where they broke
5. LLM-era generalization: what transfers between subjects and what breaks
6. Deliverable 1: a domain-general model of learning and teaching
7. Deliverable 2: the domain adapter specification
8. Deliverable 3: validation plan
9. Open questions and risks
References

---

## 0. The short version

1. **Domain type belongs to items, not courses.**
   - Route every probe and problem by its **epistemic regime**:
     - R1, a unique answer;
     - R2, an equivalence class;
     - R3, a constraint set;
     - R4, a defensible range;
     - R5, an expert distribution.
   - A course binds several adapters: a history course has R1 dates and R4 essays, and a systems course has R1 traces and R4 "why" answers (§1.1, §6.1c).
2. **Generality is limited by verification.**
   - Every general tutor so far fixed its pedagogy and pushed assessment into domain pieces: Cognitive Tutor, CTAT, constraint-based tutors, AutoTutor, ASSISTments, GIFT. Each broke where its assessment format couldn't express what good work is in the new domain (§4.7).
   - LLMs don't remove this. In TutorGym they were at chance labelling incorrect steps. Legal hallucination runs at 58–88%. LLM grading degrades on interpretive courses (§5).
   - The adapter is the domain's conscience; the LLM is the author and the conversationalist.
3. **What is learned.**
   - Keep the four KC kinds (fact, concept, procedure, principle) and add two meta-kinds: **strategy** (control, monitoring) and **epistemic practice** (how claims are warranted in this field).
   - Add **cases** as a structure.
   - Read "runnable model" broadly: machines, physical and causal models, formal structures, scripts (illness scripts; legal rules with their elements) and interpretive frames (§6.1).
4. **How understanding shows.**
   - Ten performance families, E1–E10: recall, discriminate, execute, predict, explain, critique, transfer, generate, perspective, calibration. Each domain instantiates them.
   - Strategy and practice show only on **unfamiliar** material.
   - **Delayed evidence can reverse immediate evidence.** Structured reflection in diagnosis was worse at once and better a week later, so in-session success must not decide which moves "work" (§6.2).
5. **What goes wrong.**
   - Twelve error kinds in four groups, each with its repair. Three are new and cross-domain:
     - **reduction**: single cause, linear, static, universal;
     - **misreading**;
     - **epistemic missteps**: proof by example, source naivety, absolutism or multiplism, claims without a warrant, myside bias, fabricated authority.
   - Repair goes by error kind, never by subject (§6.3, §2.2).
6. **Moves.**
   - The move families are fixed; per-family emphasis priors vary (§6.4, §7.7).
   - The subject findings that most change moves:
     - **math**: compare methods; Schoenfeld's control questions; a proof ladder (validate, self-explain, Proof Blocks, write);
     - **science**: modelling cycles; diagnosis from a *pattern* of answers across a battery;
     - **languages**: spaced drills for items only; communicative tasks for use; **prompts over recasts**;
     - **writing**: SRSD strategy instruction; product goals; non-directive feedback on drafts; never grammar in isolation (−0.32);
     - **professional reasoning**: illness scripts and rules with their elements as runnable models; **perturb-the-case** problems; structured reflection; mixed practice; no bias-name training;
     - **history and argument**: explicit sourcing, contextualization and corroboration with document sets; argument maps **with feedback**.
7. **The adapter has eight parts and the core has everything else.**
   - The eight parts: verifiers; move-emphasis priors; misconception detectors; facet map; problem templates and generators; page element kinds; an **epistemic profile** (warrants, authority, what experts may disagree about, citation rules); notation parsers.
   - Adding a domain must need **zero core changes** (§7.1, §7.10).
8. **Ten verifier families** (V1–V10), with a judge-calibration protocol:
   - decompose into narrow criteria;
   - label 60–100 answers per criterion with two experts;
   - pass a criterion when agreement is at least expert–expert and κ ≥ 0.6;
   - place answers by pairwise comparison with anchors;
   - run bias probes;
   - gate items by answer-space entropy;
   - **turn uncertainty into an elicitation, never a verdict**;
   - use prediction-powered inference for metrics.

   Criteria that fail stay discussion-only (§7.2).
9. **Misconceptions are a tagged union.**
   - The types: `execute` (a buggy rule), `constraint`, `pattern` (a fingerprint over a probe battery), `rubric` (a signature with exemplars), plus a cheap `marker` prefilter.
   - Each must fire distinctly on its separating probe, or be merged (§7.4).
10. **New invariant: epistemic honesty.** Never state an R4 or R5 judgement as a fact, or an R1 fact as an opinion. Never cite an authority that hasn't been verified (§6.4).
11. **Validation.**
    - **Courses:** four contrasting courses plus the CS 3410 fixture:
      - mechanics, measured by the FCI;
      - proof-based discrete math, by validated proof-comprehension tests;
      - a history survey with primary sources, by HATs and blind-scored essays on unseen document sets;
      - a **held-out** case-reasoning course (1L Torts or Contracts, or clinical reasoning), built only after the core is frozen.
    - **Success:**
      - judges calibrated;
      - **no collapse** (the worst course at least 0.8 × the best);
      - no harm in any course, and d ≥ 0.3 in at least 3 of 4;
      - the held-out course working with zero core diffs.
    - The flagship cross-subject LLM-tutor evaluations (LearnLM) report only aggregates, so Plato must **stratify by domain type** (§8, §5.2).

**Amendments this brief proposes to `system-spec.md`:**
- **§1:** add the strategy and epistemic-practice kinds, the cases structure, and a `regime` on every probe and problem; store analogies as a *list*, each with where it breaks.
- **§6:** add invariant 7, epistemic honesty.
- **§7:** replace `WrongModel.signature` with the detector union (§7.4); allow `Problem.steps` to be a DAG.
- **§9:** replace the two-column table with §7.1 (fixed versus varying) and §7.9 (five adapter families; the judge-calibration harness as shared infrastructure).
- **§14:** add a versioned **artefact** object (drafts, proofs, work-ups).
- **§17 level 5:** stratify every metric by domain type, add the "no collapse" rule, and keep a held-out domain.
- **§19:** the open question on judge calibration is answered by §7.2.

## 1. Kinds of domain: well-structured, ill-structured, and what lies between

### 1.1 Structure belongs to tasks, not to subjects
- **Simon (1973)**, "The structure of ill structured problems" (*Artificial Intelligence* 4), [doi:10.1016/0004-3702(73)90011-8](https://doi.org/10.1016/0004-3702(73)90011-8). A problem is well-structured when there is a definite test for a solution and a representable problem space. Most real problems are ill-structured, and solvers make them tractable by imposing structure piece by piece. [V title; content K]
- **Jonassen (2000)**, "Toward a design theory of problem solving" (*ETR&D* 48(4), ERIC EJ620216). Problems vary in **structuredness, domain specificity (abstractness) and complexity**. His typology runs from logical and algorithmic problems through story problems, rule-using, decision-making, troubleshooting, diagnosis-solution, strategic performance, case analysis and design, to dilemmas. Each type "engages different cognitive, affective, and conative process and therefore necessitates different instructional support". [V abstract; the eleven types K]
- **Lynch, Ashley, Pinkwart & Aleven (2009)**, "Concepts, structures, and goals: Redefining ill-definedness" (*IJAIED* 19, EJ902551). "Problems and domains are ill-defined when essential concepts, relations, or criteria are un- or underspecified, open-textured, or intractable, requiring a solver to 'recharacterize' them." The pedagogical goal is to teach learners to handle that ambiguity, not to hide it. [V]
- **Mitrovic & Weerasinghe (2009)**, AIED, [doi:10.3233/978-1-60750-028-5-375](https://doi.org/10.3233/978-1-60750-028-5-375). Ill-definedness has two separate dimensions, the **domain** (its declarative theory) and the **instructional task**: "It is possible to have a well-defined domain and still have ill-defined instructional tasks in the same domain." Database design inside relational theory is their example. [V]
- **Bratt (2009)**, *IJAIED* (EJ913337). Military simulator instructors teach a **well-defined core** (procedures checkable in the simulator) and an **ill-defined periphery**: context, hypothetical variants, critical factors. A tutor needs both. [V]

**Implication.** "Domain type" is a property of each KC and each problem form, not of a course. A systems course has ill-defined items ("argue for a calling convention", "explain why"), and a history course has well-defined ones (a date, a treaty's terms). **The adapter is therefore selected per problem form, through its verification mode. The course-level profile is only a default mix.** The two-column table in `system-spec.md` §9 is the right picture of the extremes, but the system must route each item, not each course. [inference]

### 1.2 What differs between disciplines, besides content
- **Goldman et al. (2016)**, "Disciplinary literacies and learning to read for understanding" (*Educational Psychologist* 51(2), EJ1100583). Project READI analysed expert–novice differences in **literature, science and history**. The discipline-specific knowledge clustered into **five core constructs** shared across the three:
  1. epistemology;
  2. inquiry practices and strategies of reasoning;
  3. overarching concepts, themes and frameworks;
  4. forms of information representation and types of texts;
  5. discourse and language structures.

  The goals follow from "discipline-specific criteria for evidence-based knowledge claims". [V]
- **Shanahan & Shanahan (2008)**, *Harvard Educational Review* 78(1) (EJ791477). Experts in mathematics, chemistry and history read their texts "quite differently" and recommend different comprehension strategies. In their protocols historians sourced documents first, chemists translated between representations, and mathematicians reread for precision. [V abstract; the details K]
- **Chi, Feltovich & Glaser (1981)**, *Cognitive Science* 5, [doi:10.1207/s15516709cog0502_2](https://doi.org/10.1207/s15516709cog0502_2). Physics experts sort problems by the **principle** that solves them; novices sort by **surface features** (inclined planes, springs). [V]

**Implication.** Goldman's five constructs are a domain-general *schema* whose *values* are domain-specific. That is the shape the adapter needs: the same slots everywhere (what counts as evidence, how experts read, which frameworks organize the field, which representations and genres, how claims are phrased) with different contents per discipline (§7).

### 1.3 Cognitive Flexibility Theory (Spiro, Feltovich, Coulson)
**Claim.** Advanced learning in ill-structured domains fails in a characteristic way: oversimplification.
- **Spiro, Coulson, Feltovich & Anderson (1988)**, Tech. Report 441 (ERIC ED302821; reprinted 2013 in *Theoretical Models and Processes of Reading*). Advanced knowledge acquisition "is different in many important ways from introductory learning". Its goals "are often at odds with the goals and tactics of introductory instruction". Research in biomedical cognition found "a substantial incidence of misconception attributable to various forms of oversimplification". CFT prescribes:
  - multiple mental and pedagogical representations;
  - multiple alternative linkages among knowledge elements;
  - **schema assembly** in the situation, as opposed to retrieving prepackaged schemas;
  - the **centrality of "cases of application"**;
  - participatory learning with tutorial guidance.

  [V]
- **Mechanism ("criss-crossing the landscape").** The same case is revisited for different purposes and under different conceptual lenses, and the same concept is traced across many cases. The aim is to see how a concept's application varies, not to extract one rule. [K]
- **Multiple analogies.** Spiro, Feltovich, Coulson & Anderson (1989), [doi:10.1017/cbo9780511529863.023](https://doi.org/10.1017/cbo9780511529863.023). A single analogy for a complex concept induces misconceptions. Several analogies, each correcting the others' misleading features, are the antidote. [V title; content K]
- **Reductive bias.** Feltovich, Hoffman, Woods & Roesler (2004), "Keeping it too simple" (*IEEE Intelligent Systems*), [doi:10.1109/mis.2004.14](https://doi.org/10.1109/mis.2004.14). Learners and practitioners drift toward the simpler pole of a set of dimensions:
  - discrete over continuous;
  - static over dynamic;
  - sequential over simultaneous;
  - mechanistic over organic;
  - separable over interactive;
  - universal over conditional;
  - regular over irregular;
  - linear over nonlinear;
  - homogeneous over heterogeneous;
  - single over multiple representations;
  - surface over deep.

  [K: the list is from memory of the Feltovich papers]
- **Evidence.** Jacobson & Spiro (1995), *J. Educational Computing Research* 12(4) (EJ510379; ED355508), with 34 undergraduates. The control treatment scored higher on **factual memory**; the CFT hypertext, which presented material "in multiple contexts to highlight different facets", gave **superior transfer**. [V]
- **Grade: weak to moderate.** The studies are small, mostly from the hypertext era, confound several features at once, and have few independent replications. CFT is better treated as a well-argued design theory, consistent with the stronger evidence on comparing cases (Gentner-style analogical encoding, [Understanding §6]), than as a tested intervention. [assessment]

**Implications for Plato.**
1. In ill-structured topics, **cases are the unit of instruction**. The course model needs a **case library** (each case tagged by which concepts it instantiates and *how differently*), and the move "revisit case X through concept Y" (§6.4).
2. **One explanation or analogy is a risk, not a kindness, at the advanced stage.** The course model stores 2–3 analogies per principle, each with where it breaks. (`system-spec.md` already stores `analogy: { mapping, breaksWhere }`; make it a list.)
3. **Reductive biases are a domain-general family of wrong models.** Single cause, linear, static, universal and separable are detectable as rubric signatures in *any* subject, from history ("the war happened because of X") to biology ("the gene for X") and economics ("raising prices always lowers demand") (§2.2).

### 1.4 The well-structured toolkit reaches into ill-structured domains
- **Rourke & Sweller (2009)**, *Learning and Instruction* 19 (EJ826508). The worked-example effect held for an ill-defined visual task: learning to **recognise designers' styles**. [V]
- **Kyun, Kalyuga & Sweller (2013)**, *J. Experimental Education* 81 (EJ1011878). Three experiments with university EFL students learning to answer **English-literature essay questions**. Studying **model answers** before answering similar questions beat answering conventional questions, and "the effectiveness of worked examples increased with decreasing student knowledge", which is expertise reversal again. [V]

**Implication.** The KC-kind → move mapping (`system-spec.md` §1) survives the move to ill-structured content. What changes is the *form* of the move: a worked example becomes a model essay, an annotated reading or an expert's think-aloud on a source. What also changes is *how the student's attempt is checked*. The teaching logic stays fixed while its instantiation and its verifier vary, which is the main design claim of this brief. [inference]

### 1.5 How earlier tutors handled ill-defined tasks
- **Model tracing** (Cognitive Tutor) needs a complete model of correct and buggy *paths*, so it fits procedures with enumerable steps.
- **Constraint-based modelling (CBM).** Ohlsson's idea, built at scale by Mitrovic's group: Mitrovic, Martin & Suraweera (2007), "Intelligent tutors for all: the constraint-based approach", *IEEE Intelligent Systems*, [doi:10.1109/mis.2007.74](https://doi.org/10.1109/mis.2007.74).
  - CBM checks the **solution state** against constraints. Each constraint is a pair: a *relevance condition* and a *satisfaction condition* ("if the query uses GROUP BY, every non-aggregated SELECT column must appear in it").
  - Any solution that violates no constraint is accepted, so many correct designs are allowed, and the tutor needs no model of the path.
  - Used for SQL, database design, UML and similar tasks. [V title; content K]
- **Le & Menzel (2009)**, *IJAIED* (EJ913340). Logic programming with several valid strategies: **weighted constraints** let the tutor *hypothesise the student's intended strategy* before diagnosing errors against it. [V]
- **Fournier-Viger, Nkambou & Mephu Nguifo (2010)**, "Building intelligent tutoring systems for ill-defined domains", [doi:10.1007/978-3-642-14363-2_5](https://doi.org/10.1007/978-3-642-14363-2_5). They survey model tracing, constraint-based modelling, expert-system approaches, and partial task models mined from learner data, and argue for hybrids. [V title; content K]
- **Weerasinghe, Mitrovic & Martin (2009)**, *IJAIED* (EJ913338). One dialogue model supported both well- and ill-defined tasks in a Wizard-of-Oz study, and tutors mostly agreed with its interventions. [V]

**Implication.** Constraints are the missing middle between "execute and compare" and "ask a rubric judge". Many ill-defined tasks still have **checkable necessary conditions**:
- a legal answer must address every element of the rule;
- a historical argument must cite at least two sources and handle the strongest counter-evidence;
- a proof must use the hypothesis it's given;
- a design must meet its stated requirements.

Each constraint is checked by code where possible and by a narrow yes/no judge question otherwise. Narrow questions are far easier to calibrate than a holistic grade (§7.2). [inference, consistent with CBM]

## 2. Correctness, misconceptions and argument in ill-structured domains

### 2.1 What "correct" means when experts disagree
- **The criteria are open-textured** (Lynch et al. 2009, §1.1). Argument quality has "no unequivocal ground truth" and "multiple valid assessments may exist": Romberg, Maurer, Wachsmuth & Lapesa (2025), "Towards a perspectivist turn in argument quality assessment", [arXiv:2502.14501](https://arxiv.org/abs/2502.14501). [V]
- **Epistemic stance is itself learned.** Kuhn, Cheney & Weinstock (2000), *Cognitive Development* 15, [doi:10.1016/S0885-2014(00)00030-7](https://doi.org/10.1016/S0885-2014(00)00030-7). Epistemological understanding develops through three stances:
  - **absolutist**: knowledge is certain, and claims are facts to be copied;
  - **multiplist**: claims are opinions, all equally valid;
  - **evaluativist**: claims are judgments, to be weighed by criteria and evidence.

  Progress is uneven across domains, and judgments of taste reach evaluativism later than judgments of truth. [V citation; content K]
- In ill-structured subjects, **both absolutism ("there is one right reading and the tutor has it") and multiplism ("any interpretation is fine") are errors.** The target is evaluativism: a claim is better or worse by the discipline's criteria.
- **Stoel, van Drie & van Boxtel (2017)**, *J. Educational Psychology* 109 (EJ1136550), a randomized trial with N = 95 11th graders. Explicit teaching of causal-reasoning strategies, second-order concepts and their epistemological basis raised strategy and second-order knowledge (sr² = .09), the value students placed on **criterialist** beliefs (.04) and interest (.02). It did **not** improve the overall quality of written causal explanations, except one criterion, "use of second-order language and causal connections" (.06). [V]

**Implication: the verdict space must be richer than right or wrong.** For an open item, a verdict combines four checks:
1. **Facts**: checked against the sources or the record.
2. **Evidence use**: each piece cited actually says what is claimed.
3. **Criteria**: the discipline's quality dimensions, scored.
4. **Range**: where the answer sits relative to anchored expert answers. These can be several defensible positions, not one key.

The tutor says "defensible, and here is its weakest link", not "correct". Stoel's null result on writing quality is also a warning. Teaching the vocabulary of good reasoning moves the vocabulary first; the performance moves more slowly. Mastery must be judged on the performance (§7.5). [inference]

### 2.2 What a "misconception" is in an ill-structured domain
**History.**
- **Wineburg (1991)**, *J. Educational Psychology* 83 (EJ436869). Eight historians and eight able high-school seniors thought aloud over documents about the Battle of Lexington. Historians used three heuristics:
  - **sourcing**: read who wrote it, when and why before reading the text;
  - **corroboration**: check documents against each other;
  - **contextualization**: place the event in its time and place.

  Students read documents as **information rather than as evidence**, and ranked the textbook as most trustworthy. [V abstract; the heuristics K, widely reproduced]
- **Presentism.** Viewing the past through present-day norms is the "psychological default". Historical thinking is in that sense "unnatural": Wineburg (2001), *Historical Thinking and Other Unnatural Acts* (ED457103). [V book; phrasing K]
- **Second-order concepts.** Lee & Ashby's progression of students' ideas about evidence and accounts runs from the past as given, to information, to testimony, to "scissors and paste", to evidence interpreted in context (Lee & Ashby 2000, *Knowing, Teaching and Learning History*). [K]
- **Single-cause thinking.** Novices give one-cause or "one thing after another" narratives. Causal reasoning needs second-order distinctions: long- versus short-term causes, structural versus intentional causes, necessary versus sufficient causes, and how causes interact (Stoel et al. 2017). [V for Stoel's framing; typology K]
- **Teaching evidence.**
  - Reisman (2012), "Reading Like a Historian", *Cognition and Instruction* 30(1), [doi:10.1080/07370008.2011.634081](https://doi.org/10.1080/07370008.2011.634081). A document-based curriculum ran for six months, quasi-experimentally, in five urban high schools (about 236 11th graders). It improved historical thinking, factual knowledge and reading comprehension over comparison classes. [V citation; details K]
  - De La Paz & Felton (2010), *Contemporary Ed. Psych.* 35 (EJ890836). Historical-reasoning strategies plus a prewriting strategy, N = 160 11th graders, produced longer, more historically accurate and more persuasive essays, with more elaborated claims and rebuttals. The **control group read the same documents and got feedback on essays on the same topics**. [V]
  - Grade: **moderate**. Mostly quasi-experiments with secondary students.

**Literature.**
- **Peskin (1998)**, *Cognition and Instruction* 16 (EJ574160). Experts (PhD candidates) reading poems used knowledge of genre and convention and "productive interpretive strategies". For novices, difficulty in making sense of the text "diminished appreciation". [V]
- **Rainey (2017)**, *Reading Research Quarterly* 52 (EJ1124451). Ten literary scholars thinking aloud showed literary reading to be "fundamentally social and problem-based", with six shared practices. As I recall them: seeking patterns, identifying strangeness, articulating a puzzle, considering possibilities, considering contexts, making a claim. [V abstract; the six names K]
- The two classic novice stances mirror Kuhn's. The **hidden-meaning** stance is absolutist: the author buried one meaning and the teacher knows it. The **anything-goes** stance is multiplist. A third failure is **summary instead of analysis**: retelling the plot, which is Bereiter and Scardamalia's knowledge-telling (§3.5). [K; inference]

**A domain-general catalogue of misconception families for ill-structured content.** Each family is stored as a *rubric signature* with exemplars and a separating probe (§7.4). Families 1–2 are checkable against sources; 3–12 need a calibrated judge.

| # | Family | Signature in the answer | Separating probe | Seen in |
|---|---|---|---|---|
| 1 | Factual error | A checkable claim that is false | Ask for the source | All subjects |
| 2 | **Misreading** | Attributes to a text what it doesn't say; literal where figurative, or the reverse | "Show me the line" | Literature, history, law (holdings), philosophy |
| 3 | **Source naivety** | Treats a document as neutral information; no author, date or purpose | "Who wrote this, when, for whom? Would that change your reading?" | History, journalism, science reports |
| 4 | **Presentism or anachronism** | Judges actors by today's norms or knowledge they could not have had | "What could someone in 1775 have known about this?" | History, literature, law (old precedents) |
| 5 | **Single cause or other reduction** | One factor, a linear chain, universal claims, static description (Feltovich's dimensions) | "If X hadn't happened, would Y still have occurred?" | History, biology, economics, medicine |
| 6 | **Overgeneralization** | A rule drawn from one case; the scope of a framework ignored | A boundary case where the rule fails | All subjects |
| 7 | **Claim without warrant** | Evidence placed next to a claim with no stated link; conclusory statements | "Why does that show it?" | All argument genres; "conclusory" is the law-school term |
| 8 | **Myside bias** | Counter-evidence ignored or dismissed (§2.3) | "What's the strongest point against you?" | All subjects |
| 9 | **Absolutist or multiplist stance** | "The answer is X, period" / "it's just opinion" | "Could a careful reader disagree? On what grounds?" | Literature, history, ethics, law |
| 10 | **Framework misapplied** | A theory or rule applied where its conditions don't hold; an element of a test skipped | "Which conditions must hold for this test? Do they here?" | Law, economics, medicine, statistics |
| 11 | **Telling, not transforming** | Summary or list where analysis is asked for | "So what? What does that show?" | Essays in every subject |
| 12 | **Premature closure** | Settles on the first hypothesis; contrary data unexplained | "What else could explain these findings?" | Medicine, debugging, history |

### 2.3 Argumentation-based learning and how argument quality is assessed
**Structure.** Toulmin (1958), *The Uses of Argument*, breaks an argument into **claim**, **data** (grounds), **warrant** (why the data support the claim), **backing**, **qualifier** and **rebuttal**. [K]

**What novices do.**
- Kuhn (1991), *The Skills of Argument*. Many adults confuse **explanation with evidence**, generate few counterarguments, and cannot say what evidence would prove them wrong. [K]
- Myside bias:
  - Wolfe & Britt (2008), *Thinking & Reasoning* 14, [doi:10.1080/13546780701527674](https://doi.org/10.1080/13546780701527674). [V citation]
  - Wolfe, Britt & Butler (2009), *Written Communication* 26 (EJ833731). Rebutting other-side information raised readers' ratings of argument quality. A brief written tutorial on argument schema improved undergraduate essays, with more precise claims, more elaborated reasons and **less myside bias**. [V]

**Teaching evidence.**
- **Osborne, Erduran & Simon (2004)**, *JRST* 41 (EJ760078). Over two years, nine-plus argumentation lessons in junior-high science. They built Toulmin-based analytic tools in which **rebuttals mark the higher levels** of argument quality. [V; level scheme K]
- **Erduran, Simon & Osborne (2004)**, *Science Education* 88 (EJ759893). The TAP methodology, and the practical difficulty of telling data from warrants from backings in real talk. [V; difficulty K]
- **Sampson & Clark (2008)**, *Science Education* 92 (EJ790461). A review of frameworks for assessing student arguments along three foci: **structure, justification and content**. Structure-only Toulmin coding can rate a well-formed but scientifically wrong argument highly. [V foci; critique K]
- **Asterhan & Schwarz (2016)**, *Educational Psychologist* 51 (EJ1100579). Despite consensus that argumentation improves subject-matter learning, "causal evidence is not abundant", and definitions and methods vary widely. [V]
- **Wecker & Fischer (2014)**, *Computers & Education* 75, [doi:10.1016/j.compedu.2014.02.016](https://doi.org/10.1016/j.compedu.2014.02.016). A meta-analysis of argumentation in computer-supported collaborative learning: no reliable average effect of argumentation on **domain-specific knowledge**, although argumentation skills improved. [citation V; result K, check before quoting]
- **Abrami et al. (2015)**, *Review of Educational Research* 85, [doi:10.3102/0034654314551063](https://doi.org/10.3102/0034654314551063). Across 341 effect sizes, critical-thinking instruction gave **g+ = 0.30**, in generic and content-specific forms and in all disciplines. **Dialogue, authentic problems and mentoring** had positive effects. [V] Grade: **strong** that critical thinking can be taught, and moderate on which components matter.

**Argument mapping.**
- van Gelder, Bissett & Cumming (2004), *Canadian J. Exp. Psych.* 58, [doi:10.1037/h0085794](https://doi.org/10.1037/h0085794). One-semester courses built on the Reason!Able mapping software showed large gains on the California Critical Thinking Skills Test, reported at around 0.8 SD. [V citation; size K]
- Alvarez Ortiz (2007), a meta-analysis done as a Melbourne MA thesis, found larger gains for mapping-intensive courses than for other critical-thinking courses. [S; unpublished]
- Harrell (2011), *HERD* 30 (EJ923818). A quasi-experiment with 269 introductory-philosophy students: argument diagramming improved argument analysis for **low and intermediate achievers, not high**. [V]
- Dwyer, Hogan & Stewart (2012), *Metacognition and Learning* 7 (EJ984318). A course with argument mapping built in, N = 74, raised Halpern critical-thinking scores against a no-instruction control. [V]
- Dwyer et al. (2013) (EJ997893). Reading and building maps improved immediate recall of arguments over outlining or summarizing. [V]
- **Cullen, Fan, van der Brugge & Elga (2018)**, *npj Science of Learning* 3, [doi:10.1038/s41539-018-0038-5](https://doi.org/10.1038/s41539-018-0038-5). A 12-week Princeton seminar: argument visualization of philosophy texts, weekly problem sets, **individualized feedback every week**. LSAT Logical Reasoning gains were **d = 0.71** over controls, and blind-scored final essays **d = 0.87**. [V]
- Grade: **moderate** for argument-analysis skill, and **weak** for transfer to domain knowledge. The active ingredient is probably *practice with feedback on explicit structure*, not the map as such.

**Assessing argument quality automatically.**
- **Wachsmuth et al. (2017)**, EACL. A taxonomy of 15 dimensions under three aspects:
  - **logical cogency**: acceptable, relevant, sufficient premises;
  - **rhetorical effectiveness**;
  - **dialectical reasonableness**: how well it holds up against objections.

  [K]
- **Mirzakhmedova et al. (2024)**, [arXiv:2404.09696](https://arxiv.org/abs/2404.09696). LLM annotations on that taxonomy were consistent, with "moderately high agreement with human experts across most of the quality dimensions". Adding LLMs as extra annotators raised overall agreement. [V]
- **Toledo et al. (2019)**, [arXiv:1909.01007](https://arxiv.org/abs/1909.01007). With 6.3k arguments and 14k pairs, **pairwise** judgments of which argument is better were "surprisingly consistent" despite the subjectivity. [V] Comparative judgment is more reliable than absolute scoring, as in essay assessment (Pollitt 2012). [K]

**Implications for Plato.**
1. **An argument verifier is a pipeline, not a grade.**
   1. Parse the answer into claims, reasons, evidence, warrants and rebuttals, as an argument map on the page.
   2. Check each evidence item against the sources: quote match, then an entailment check.
   3. Check each warrant against the discipline's acceptable warrant types (§7).
   4. The dialectical check: does the answer meet the **strongest counterargument stored in the course model**?
   5. Place the answer by **pairwise comparison against anchored exemplars**, not by an absolute score.

   The verdict is the **weakest link**, and the next move targets it.
2. **Argument mapping is a page element for every subject that argues.** Its evidence is moderate, and it gives the voice something to point at. The student builds the map and Plato asks about the weakest edge. That is the Cullen recipe: explicit structure plus feedback on it.
3. **Do not expect argumentation to teach content by itself** (Wecker & Fischer; Asterhan & Schwarz). Pair it with content checks: facts, misreadings, framework conditions.
4. **Teach the epistemic criteria explicitly, but judge mastery on performance**, since Stoel et al. moved knowledge and beliefs, not essays.

## 3. Subject-specific evidence that changes the teaching moves

Each subsection gives the evidence, then **what changes for Plato** compared with the generic policy in `system-spec.md` §13.

### 3.1 Mathematics
**Problem solving: Schoenfeld.** *Mathematical Problem Solving* (1985) and "Learning to think mathematically" (1992; reprinted in *J. Education* 196(2), 2016, [doi:10.1177/002205741619600202](https://doi.org/10.1177/002205741619600202)). Performance depends on four things:
1. **resources**: facts and procedures;
2. **heuristics**: Pólya-style strategies;
3. **control**: monitoring and allocating effort;
4. **beliefs**: about mathematics and about oneself.

Novices fail mainly on **control**: they pick an approach within seconds and pursue it to the end of the time without checking, a "wild goose chase". They also hold corrosive **beliefs**: problems have one method; real understanding is for geniuses; a problem not solved in about five minutes is unsolvable; proofs are irrelevant to discovery. Schoenfeld's course interrupted work with three questions, "What exactly are you doing? Why? How does it help?", and students' control improved. [K; long-standing and widely reproduced, but no large RCT]

**Procedural versus conceptual knowledge (Rittle-Johnson).**
- **Rittle-Johnson, Siegler & Alibali (2001)**, *J. Educational Psychology* 93 (EJ638748). With decimal fractions, the two kinds of knowledge develop **iteratively**, and improved **problem representation** is one mechanism linking them. [V]
- **Rittle-Johnson, Schneider & Star (2015)**, *Educational Psychology Review* 27, [doi:10.1007/s10648-015-9302-x](https://doi.org/10.1007/s10648-015-9302-x). The relations are **bidirectional**: procedures support concepts and concepts support procedures. "Concepts first" is not a law. [V title; K content]
- **Rittle-Johnson & Star (2007)**, *J. Educational Psychology* 99 (EJ772031). 70 seventh graders randomized: **comparing two solution methods side by side** beat studying them one at a time on procedural knowledge and **flexibility**, with comparable conceptual gains. [V]
- What to measure: a procedure applied in an **unfamiliar form**; a choice between methods (flexibility); explaining why a step is valid (conceptual). A correct answer on a familiar item measures none of these.

**Proof comprehension and proof writing.**
- **Selden & Selden (2003)**, *JRME* 34 (EJ667036). Undergraduates judging whether arguments proved a theorem attended to **surface features**, and their ability to tell proofs from non-proofs was "very limited". [V]
- **Weber (2001)**, *ESM* 48, [doi:10.1023/A:1015535614355](https://doi.org/10.1023/A:1015535614355). Students who knew the relevant facts and theorems still failed to construct proofs because they lacked **strategic knowledge**: which theorems matter, when to unpack definitions, when to use syntactic manipulation. [V title; K content]
- **Mejía-Ramos, Fuller, Weber, Rhoads & Samkoff (2012)**, *ESM* 79, [doi:10.1007/s10649-011-9349-7](https://doi.org/10.1007/s10649-011-9349-7). An assessment model of proof comprehension with seven facets. [V title; K list]
  - **Local:**
    1. the meaning of terms and statements;
    2. the logical status of statements and the proof framework;
    3. the justification of claims.
  - **Holistic:**
    4. summarizing via high-level ideas;
    5. identifying the modular structure;
    6. transferring the ideas or method to another context;
    7. illustrating with examples.
- **Hodds, Alcock & Inglis (2014)**, *JRME* 45 (EJ1028348). A self-explanation training booklet improved proof comprehension, **d = 0.95**, and a **15-minute** in-lecture version had effects that persisted. Eye-tracking showed more movement between lines, which is attention to logical relations. [V] Grade: **moderate** (three experiments, one lab).
- **Proof Blocks (Poulsen, West et al.).**
  - Parsons problems for proofs: drag pre-written lines into a valid order. The instructor specifies the **dependency DAG**, so *any* valid order is accepted ([arXiv:2106.11032](https://arxiv.org/abs/2106.11032); ITiCSE 2022). [V]
  - An RCT with **332** discrete-math students on induction: Proof Blocks learners gained as much as students writing proofs from scratch, "in far less time on task" ([arXiv:2211.09609](https://arxiv.org/abs/2211.09609)). [V]
  - The DAG-based partial-credit grader has since been used for code Parsons problems, network-protocol packet ordering and **physics solution steps** ([arXiv:2204.04196](https://arxiv.org/abs/2204.04196)). [V]

**What changes for Plato in mathematics.**
1. **Metacognitive control is a KC of its own.** At intervals during long problems, Schoenfeld's three questions become a scheduled move. A plan with no checking step is flagged. Measure by asking for the plan *before* the work.
2. **Beliefs are diagnosable wrong models.** "Five-minute" giving-up, and "there's one method", have signatures in behaviour: giving up early, and inability to name a second method.
3. **Comparison of methods is the default consolidation move.** Show two correct solutions, ask which is better here and why. Add a third, incorrect one for error-finding.
4. **Proof courses get their own facet set** (Mejía-Ramos's seven) and a ladder: validate a proof, then self-explain it line by line, then Proof Blocks, then write. This mirrors the programming ladder of trace, explain, Parsons, write ([Decomposition §6]), and the shared shape is a domain-general pattern (§3.7).
5. **Verification:**
   - computations, by CAS: SymPy equivalence, plus random-point numeric checks for robustness;
   - proof orderings, by DAG;
   - free-form proofs, by a judge restricted to the seven facets and **local step validity**, with a formal checker (Lean) only for courses that use one.

### 3.2 Science
The siblings cover synthetic models, knowledge in pieces, Chi's three kinds of conceptual change and ontology training ([Understanding §1]). This section adds what changes the **diagnosis and the move set**.

- **Framework theory** (Vosniadou & Skopeliti 2014, *Science & Education* 23, EJ1040092). Learners hold a naive framework theory, "relatively coherent". Learning science requires "fundamental **ontological, epistemological, and representational** changes". Fragmentation and synthetic conceptions arise as learners **assimilate scientific information into the incompatible framework**. [V]
  - **Diagnosis consequence.** Vosniadou's method infers the model from the **pattern of answers across a battery of generative questions**, not from any one answer. A single wrong answer can't tell a synthetic model from a fragment. [K; method standard in this literature]
- **Direct versus emergent processes.**
  - Chi (2005), *JLS* 14 (EJ724968). Misconceptions about **emergent** processes (diffusion, heat flow, natural selection, electric current) are robust because students interpret them with a **direct-causal schema**. That works for sequential processes such as blood circulation, the moon's phases or mitosis, and fails for emergent ones. [V]
  - Chi, Roscoe, Slotta, Roy & Chase (2012), *Cognitive Science* 36 (EJ990900). The characteristic signature: explanations invoke "controlling agents with intentional goals", like the giraffe stretching its neck. [V]
  - The schema mismatch recurs well beyond science:
    - economics: "someone sets the price";
    - history: structural versus intentional causes, Stoel's distinction in §2.2;
    - CS: emergent system behaviour, such as caches and scheduling.

    It is a **cross-domain category mistake** detectable by language markers: agentive verbs, "wants to", "in order to", a central controller. [inference]
- **Modelling-based instruction.**
  - Hestenes (1987), *Am. J. Physics* 55, [doi:10.1119/1.15129](https://doi.org/10.1119/1.15129). "Mathematical modeling of the physical world should be the central theme of physics instruction", because essential factual and procedural modelling knowledge is "not explicitly formulated and taught". [V]
  - Wells, Hestenes & Swackhamer (1995), *Am. J. Physics* 63, [doi:10.1119/1.17849](https://doi.org/10.1119/1.17849). Content organized around **a small set of basic models**, taught in **modelling cycles**: develop, evaluate, apply. "Much larger gains" than alternatives. Effectiveness "depends heavily on the pedagogical expertise of the teacher". [V]
  - Hake (1998), *Am. J. Physics* 66, [doi:10.1119/1.18809](https://doi.org/10.1119/1.18809), 62 courses, N = 6,542. Interactive-engagement courses averaged **normalized FCI gain ⟨g⟩ = 0.48 ± 0.14** against **0.23 ± 0.04** for traditional courses. [V] Grade: **strong** for interactive engagement in general (Freeman et al. 2014, *PNAS*, meta-analysis of STEM active learning [K]). Moderate for modelling instruction specifically (Brewe et al. 2010, *PRST-PER* 6, [doi:10.1103/PhysRevSTPER.6.010106](https://doi.org/10.1103/PhysRevSTPER.6.010106), university Modeling Instruction [V citation]).
  - Schwarz et al. (2009), *JRST* 46 (EJ850692). The practice of modelling is constructing, using, evaluating and revising models. Its **metaknowledge** is that models are tools for predicting and explaining, and that "models change as understanding improves". Students moved from "models as correct or incorrect" to models as explanatory tools. [V]
  - Windschitl, Thompson & Braaten (2008), *Science Education* 92 (EJ809101). The textbook "scientific method" tests predictions rather than ideas and lacks epistemic framing. **Model-based inquiry** treats ideas as testable, revisable, explanatory models. [V]
- **Problem categorization** (Chi et al. 1981, §1.2). Sorting problems by principle is itself a probe of expertise.

**What changes for Plato in science.**
1. **Diagnose models by batteries, not single items.** A `WrongModel` in science carries a **response-pattern signature over 3–5 generative probes** (§7.4). The director asks the battery before concluding which model the student holds.
2. **The student's model is an object on the page.** It is drawn, run, tested against a phenomenon and revised (a modelling cycle). That is the science form of `system-spec.md` §1's "runnable models".
3. **Teach the emergent schema as a frame**, cross-domain, when agentive language appears in an emergent topic (Slotta & Chi 2006 [Understanding §1.2]).
4. **Metamodelling is a facet:** "What does this model leave out? When would it fail?"
5. **Problem sorting** ("Which of these three are solved by the same principle?") is a cheap expertise probe for any quantitative science.
6. **Verification:** numeric with **units and dimensional analysis**; symbolic for derivations; qualitative predictions against stored outcomes; ranking tasks scored exactly.

### 3.3 Programming (beyond what the siblings hold)
[Decomposition §6] and [Interactive §3] cover notional machines, tracing, explain-in-plain-English, adaptive and faded Parsons problems, subgoal labels, PLTutor and Xie et al.'s four-skill sequence. Three points add to them here.
- **The ladder generalizes.** The sequence trace, then explain, then arrange (Parsons), then write has close analogues elsewhere:
  - mathematics: validate a proof, then self-explain it, then Proof Blocks, then write;
  - writing: evaluate a model text, then annotate it, then sentence-combine or reorder paragraphs, then draft;
  - history: source a document, then corroborate, then order the evidence into an argument map, then write the essay;
  - medicine: read the illness script, then compare scripts, then complete a partial case, then work up the full case.

  This is **comprehension before production, with an assembly rung between**. It should be a domain-general ladder in the move library (§6.4), with the adapter supplying the rung forms. [inference; the programming rungs are moderate evidence (Lopez et al. 2008, Ericson et al.), and Proof Blocks shows the assembly rung transfers to proofs]
- **DAG-verified ordering is a reusable verifier.** One component (Poulsen et al., §3.1) grades code Parsons problems, proof blocks, protocol steps and physics solution steps.
- **Execution beats judgment wherever it exists.** Smith & Zilles's code-generation-based grading of explain-in-English answers ([Interactive §3.3]) is a template for *turning a judge question into an execution question*: generate an artefact from the student's words, then run it. The same move works for a student's symbolic model (simulate it), a student's rule statement in law (apply it to fact patterns with known outcomes) and a student's grammar rule in a language (generate sentences, check them). [inference]

### 3.4 Languages: why vocabulary suits drills and communicative competence doesn't
- **Spacing works for L2 items.** Kim & Webb (2022), *Language Learning* 72, [doi:10.1111/lang.12479](https://doi.org/10.1111/lang.12479), a meta-analysis of 48 experiments (N = 3,411):
  - spacing had a **medium-to-large** effect;
  - longer spacing beat shorter spacing on **delayed** tests;
  - equal and expanding schedules were equivalent;
  - the effect varied with the **learning target**, the type of practice and the activity type.

  [V] Duolingo-style half-life models fit this part ([Personalization §4.4]).
- **Communicative competence is not a list of items.** Canale & Swain (1980), *Applied Linguistics* 1, [doi:10.1093/applin/I.1.1](https://doi.org/10.1093/applin/I.1.1), name its components: **grammatical, sociolinguistic and strategic** competence (discourse competence was added by Canale in 1983). [V citation; components K]
  - Sociolinguistic appropriateness and strategic repair are **context-dependent, variable-condition, variable-response** KCs: in KLI's terms, rules and principles applied in real time.
  - Retrieval of form–meaning pairs doesn't exercise them.
- **Skill acquisition theory** (DeKeyser). Declarative knowledge becomes proceduralized and automatized only through **meaningful** practice of the target behaviour. Practice is skill-specific: comprehension practice builds comprehension, production practice builds production. **Transfer-appropriate processing** (Lightbown 2008) says that what is retrieved later is what was processed in practice. Mechanical drills, which can be completed without attending to meaning, do not build fluent meaningful use (Wong & VanPatten 2003). [K]
- **Nation's four strands** (2007), *Innovation in Language Learning and Teaching* 1, [doi:10.2167/illt039.0](https://doi.org/10.2167/illt039.0). Balance roughly equal time across:
  - meaning-focused input;
  - meaning-focused output;
  - **language-focused learning**, which is where item drills belong;
  - **fluency development**: familiar material under time pressure.

  [V citation; strand content K]
- **Explicit instruction helps, with measurement caveats.**
  - Norris & Ortega (2000), *Language Learning* 50 (EJ611436): focused L2 instruction gives large gains, and explicit beats implicit. [V] Their outcome measures were biased toward explicit, controlled tests. [K]
  - Spada & Tomita (2010), *Language Learning* 60, [doi:10.1111/j.1467-9922.2010.00562.x](https://doi.org/10.1111/j.1467-9922.2010.00562.x), 41 studies: explicit beat implicit for both simple and complex features, and contributed to **spontaneous use** as well as controlled knowledge. [V]
- **Interaction and feedback.**
  - Lyster & Saito (2010), *SSLA* 32 (EJ892626), 15 classroom studies, N = 827. Oral corrective feedback had **significant and durable** effects. **Prompts** (which push the learner to self-repair) beat **recasts** (where the tutor reformulates). Effects were largest on **free constructed responses**. [V]
- **Conversational agents and task-based teaching.**
  - Bibauw, Van den Noortgate, François & Desmet (2022), *Language Learning & Technology* 26, 17 studies, k = 100 effect sizes. Practice with a conversational agent gave **d = 0.58** on L2 proficiency. Form-focused, goal-oriented, system-guided interactions with **corrective feedback** worked best. [V]
  - Bryfonski & McKay (2019), *Language Teaching Research* 23, [doi:10.1177/1362168817744389](https://doi.org/10.1177/1362168817744389), 52 studies of programme-level task-based language teaching: **d = 0.93**. [V]
  - Grade: **moderate**. The meta-analyses are heterogeneous and many studies are short.

**What changes for Plato in languages.**
1. **The course model splits KCs by strand.** Item KCs (vocabulary, morphology tables, collocations) go to spaced retrieval with half-life scheduling. **Use KCs** (requesting, narrating in the past, repairing a breakdown, register) go to **communicative tasks** with a goal, a gap and an outcome. Fluency goes to timed re-use of known material.
2. **The help ladder inverts for form errors in speech.** Correct with **prompts first** (elicit self-repair: "Again? *Ayer yo…*"), then recasts. A recast goes unnoticed if overused. Don't interrupt meaning-focused turns for every error; log errors and choose one to address.
3. **Voice is native here.** A voice tutor *is* a dialogue-based CALL system, the d = 0.58 family. But speech recognition errors on learner speech are a verification risk (§7.2).
4. **Mastery evidence for use KCs is spontaneous production in a task**, scored by a rubric for task completion, accuracy, complexity and fluency. Recognition is not evidence.
5. **Verification:** exact or edit-distance matching with lemma and morphology analysis for items; grammar checking, morphological analysers and a judge for free production; pronunciation scoring only with a calibrated ASR confidence.

### 3.5 Writing
- **What works.** Graham & Perin (2007), *J. Educational Psychology* 99 (EJ772018), 123 documents and 154 effect sizes on writing quality, grades 4–12:

  | Intervention | Effect size |
  |---|---|
  | **Strategy instruction** | 0.82 |
  | Summarization | 0.82 |
  | Peer assistance | 0.75 |
  | **Setting product goals** | 0.70 |
  | Word processing | 0.55 |
  | Sentence combining | 0.50 |
  | Inquiry | 0.32 |
  | Prewriting | 0.32 |
  | Process approach | 0.32 |
  | Study of models | 0.25 |
  | **Grammar instruction** | **−0.32** |

  [V] Grade: **strong** for school-age writers. Inferences about undergraduates are extrapolations.
- **Self-regulated strategy development (SRSD)** (Harris & Graham). Six stages:
  1. develop background knowledge;
  2. discuss the strategy;
  3. **model** it with a think-aloud;
  4. memorize it;
  5. **support** it, with scaffolds fading;
  6. independent performance.

  Self-regulation (goal-setting, self-monitoring, self-instruction, self-reinforcement) is taught alongside the writing strategy. SRSD is the largest-effect writing intervention, with effects around 1 SD in the Graham–Harris meta-analyses and large effects in later special-education meta-analyses (e.g. Losinski et al. 2014, EJ1087296). [V for the later meta-analyses; the stages and pooled sizes K]
- **Feedback on drafts.**
  - Graham, Hebert & Harris (2015), *Elementary School Journal* 115 (EJ1068976). Feedback from **adults 0.87, self 0.62, peers 0.58, computers 0.38**. Teacher progress-monitoring and the 6+1 Trait model alone did *not* improve writing. [V]
  - Cho & MacArthur (2010), *Learning and Instruction* 20 (EJ878565). Feedback from **multiple peers** beat a single expert's. **Non-directive** feedback predicted **complex repairs**, which predicted quality gains. [V]
  - Fleckenstein, Liebenow & Meyer (2023), *Frontiers in AI*, [doi:10.3389/frai.2023.1162454](https://doi.org/10.3389/frai.2023.1162454). Automated writing feedback, 20 studies, N = 2,828: **g = 0.55**, with large heterogeneity. [V]
  - LLM feedback:
    - Steiss et al. (2024), *Learning and Instruction* 91, [doi:10.1016/j.learninstruc.2024.101894](https://doi.org/10.1016/j.learninstruc.2024.101894). Trained human raters' feedback on secondary history essays was of higher quality than ChatGPT's on most criteria, but the differences were mostly modest. [K; check numbers]
    - Meyer et al. (2024), *Computers & Education: AI* 6, [doi:10.1016/j.caeai.2023.100199](https://doi.org/10.1016/j.caeai.2023.100199). An RCT in which LLM-generated feedback on EFL argumentative essays **improved revisions**, motivation and positive emotions over no feedback. [K]
- **What novices get wrong.**
  - Sommers (1980/1982, ED220839): student writers revise **locally** (words), while experienced writers revise **globally** (argument, structure) under a codified theory of revision. [V abstract]
  - Bereiter & Scardamalia (1987): novices "**tell**" what they know in the order it comes to mind; experts **transform** knowledge to meet rhetorical goals. [K]
  - Both are diagnosable from a draft and its revision history.

**What changes for Plato in writing.**
1. **The unit is the draft, and the evidence is the revision.** The tutor reads a draft, gives **one or two** high-priority, **non-directive** comments (questions, reader reactions), and judges learning by what the *next* draft changes. Global changes count more than local ones.
2. **Strategy instruction is the main move**, in SRSD form: model with a think-aloud, have the student name the strategy, scaffold, fade. A strategy is a procedure-kind KC with a mnemonic: plan, organize, write and say more is the classic SRSD planning strategy. [K]
3. **Never teach grammar in isolation.** Teach sentence-combining in context instead (the −0.32 against +0.50).
4. **Goals before drafting.** Product goals ("include two counterarguments and rebut one") are cheap and effective (0.70), and they double as **constraints for verification** (§7.2).
5. **Verification:** a rubric judge per trait plus constraint checks (§7.2). Writing is the domain where an uncalibrated LLM judge is most tempting and most dangerous: fluent prose is easy to over-rate.

### 3.6 Professional reasoning: medicine and law
**Medicine: illness scripts, encapsulation, reflection.**
- **Charlin, Boshuizen, Custers & Feltovich (2007)**, *Medical Education* 41, [doi:10.1111/j.1365-2923.2007.02924.x](https://doi.org/10.1111/j.1365-2923.2007.02924.x). Clinicians reason with **illness scripts**: goal-directed knowledge structures that generate expectations about features to look for, used to classify the case and act. [V]
  - The classic script has three parts (Feltovich & Barrows 1984 [K]):
    - **enabling conditions**: who gets it, risk factors;
    - **fault**: the pathophysiology;
    - **consequences**: signs and symptoms over time.
- **Schmidt & Rikers (2007)**, *Medical Education* 41, [doi:10.1111/j.1365-2923.2007.02915.x](https://doi.org/10.1111/j.1365-2923.2007.02915.x). Through clinical experience, biomedical knowledge becomes **encapsulated** into higher-level concepts and then **integrated into illness scripts**. "To facilitate the development of expertise… teach the basic sciences in a clinical context, and introduce patient [problems early]". [V]
- **Mamede, Schmidt & Penaforte (2008)**, *Medical Education* 42, 42 internal-medicine residents. Reflective reasoning didn't help simple cases but **improved accuracy on complex cases** (interaction F(1,41) = 4.48). [V]
- **Mamede, van Gog et al. (2012)**, *Medical Education* 46, N = 46 Year-4 students. Structured reflection (list findings for and against each hypothesis, then the alternatives) was **worse on the immediate test (0.48 versus 0.62)** but **better a week later (0.66 versus 0.48–0.52)**. Delayed scores *rose* only in the reflection condition. [V] This is a textbook desirable difficulty: **immediate performance misranked the methods**.
- **Norman et al. (2017)**, *Academic Medicine* 92, [doi:10.1097/ACM.0000000000001421](https://doi.org/10.1097/ACM.0000000000001421). Diagnostic errors arise in both fast and slow reasoning. "Educational strategies directed at the recognition of biases are **ineffective** in reducing errors; conversely, strategies focused on the **reorganization of knowledge** to reduce errors have small but consistent benefits." [V]
- **Mixed practice.** Hatala, Brooks & Norman (2003), *Advances in Health Sciences Education* 8, [doi:10.1023/A:1022687404380](https://doi.org/10.1023/A:1022687404380). ECG categories practised **mixed, with contrasts between categories**, beat blocked practice on new ECGs. [V citation; result K]
- **Illness-script teaching.** Moghadami et al. (2021), *BMC Medical Education* 21 (PMID 33531017), an RCT with N = 100: illness-script teaching beat signs-and-symptoms teaching on a knowledge test and a **Script Concordance Test**. [V]
- **Assessing judgement under uncertainty.** The **Script Concordance Test** (Charlin; AMEE Guide 75, Lubarsky et al. 2013, [doi:10.3109/0142159X.2013.760036](https://doi.org/10.3109/0142159X.2013.760036)). An item gives a hypothesis and a new finding; the examinee rates how the finding changes its likelihood. **Credit is proportional to the share of an expert panel giving the same answer**: an aggregate scoring that accepts legitimate expert variation. [V citation; scoring K] The method has published critiques of validity and gaming. [K]
- **Key-features problems** (Page & Bordage 1995, *Academic Medicine* 70, [doi:10.1097/00001888-199502000-00012](https://doi.org/10.1097/00001888-199502000-00012)). Score only the critical decisions in a case, not every step. [V citation; K content]
- **Case-based learning**, from the BEME review (Thistlethwaite et al. 2012, *Medical Teacher* 34, PMID 22578051): "many claims are made… very little evidence is quoted". Students like it; effects on learning are thinly evidenced. [V] Grade: **weak**.
- **An ITS precedent.** SlideTutor (dermatopathology; Crowley's group) traced diagnostic actions against expert diagnostic algorithms with "limited enforcement". Students "approach the optimal solution path" over tutoring, more slowly in larger subdomains (Payne et al. 2009, PMID 19782544). Immediate feedback raised learning gains and metacognitive accuracy (El Saadawi et al. 2010, PMID 19434508). Showing **diagnostic decision paths with alternatives** improved confidence calibration (Feyzi-Behnagh et al. 2014, PMID 24532850). [V]

**Law: the case method, argument with precedents, feedback.**
- **The case-dialogue method** (Langdell; the Carnegie report, Sullivan et al. 2007, *Educating Lawyers*). It is effective at teaching **legal analysis**: extracting rules from appellate opinions, reasoning by analogy, distinguishing cases. Its gaps are practice skills, professional identity and **formative feedback**, which is typically one exam at the end of the term. [K]
- **CATO** (Aleven 2003, *Artificial Intelligence* 150, [doi:10.1016/S0004-3702(03)00105-X](https://doi.org/10.1016/S0004-3702(03)00105-X)). It models arguments from **precedents described by factors** (trade-secrets law), including how lawyers argue "the significance of differences between cases". In a real legal-writing course, CATO's example-based instruction matched "the best traditional legal writing instruction" on basic argumentation skills, "however, a more 'integrated' approach appears to be needed" for **transfer to more complex contexts**. [V]
- **LARGO** (Pinkwart, Ashley, Lynch & Aleven 2009, *IJAIED* 19). Students diagram Supreme Court oral arguments: the test proposed, a judge's hypothetical, the response. The diagram is checked by **graph rules** (structural constraints) plus **collaborative filtering** of the text. The benefits were concentrated in **lower-aptitude** students (by LSAT). [V citation; result K]
- **Feedback.** Schwarcz & Farganis (2017), *J. Legal Education* 67(1), [doi:10.2139/ssrn.2772393](https://doi.org/10.2139/ssrn.2772393). A natural experiment at Minnesota: first-years who happened to get **individualized feedback** on practice work in one course scored higher on exams in their *other* courses, with larger benefits for weaker-credentialed students. [K; check effect sizes]
- **LLMs and law exams.** Choi, Hickman, Monahan & Schwarcz (2023), [doi:10.2139/ssrn.4335905](https://doi.org/10.2139/ssrn.4335905). ChatGPT averaged **C+** across four Minnesota law exams, graded blind: 95 multiple-choice and 12 essay questions. [V] Law is also where **fabricated authority** is most dangerous (§5.2).

**What changes for Plato in professional reasoning.**
1. **The runnable model is a script.** In medicine it is the illness script (enabling conditions, fault, consequences); in law it is the **rule with its elements, exceptions and policy**. The course model stores scripts and rules as structured objects, so that a case can be generated from a script and a fact pattern from a rule. The **problem generator is "perturb the case"**: change one finding or one fact and ask what changes. This is the Script Concordance Test and the law-school hypothetical in one form, and it is the professional version of predict–observe–explain.
2. **Compare scripts, mix the practice.** The core consolidation move is a contrast between confusable diagnoses (or between a case and its distinguishable precedent), with mixed and interleaved practice (Hatala; [Understanding §4]).
3. **Structured reflection is a move.** Findings for, findings against, the alternatives, the decision. It is slow, worse immediately and better a week later, so the learner model must **not** score it by immediate success (Mamede 2012).
4. **Don't teach bias names.** Teach knowledge reorganization (Norman 2017).
5. **Verification:**
   - the factual layer, checked against sources and, for law, **citation existence and holding checks**;
   - the decision layer, scored by an **expert-panel distribution** where legitimate variation exists (Script Concordance Test style; §7.2);
   - the analysis layer, checked by element-coverage constraints (each rule element is addressed and applied to the specific facts) plus a judge on the quality of the analogy and distinction.

### 3.7 Cross-subject patterns
| Pattern | Programming | Mathematics | Science | Languages | Writing | History and literature | Medicine and law |
|---|---|---|---|---|---|---|---|
| **The runnable model** | Notional machine | Definitions and structures; a proof's logic | Physical or causal model; emergent schema | The grammar in use; pragmatics | Reader model, genre schema | Causal account; interpretive frame; source context | Illness script; rule with elements and policy |
| **Comprehension → assembly → production** | Trace → EiPE → Parsons → write | Validate → self-explain → Proof Blocks → prove | Predict → explain → order model steps → model | Input → noticing → guided output → free output | Evaluate a model text → annotate → combine or reorder → draft | Source → corroborate → map the argument → essay | Read the script → compare → partial case → full work-up |
| **Signature error kind** | Executable buggy rule | Buggy procedure; control and belief failures | Synthetic model; direct-causal schema | Interlanguage form errors; avoidance | Knowledge-telling; local-only revision | Source naivety, presentism, single cause | Premature closure; missing element; fabricated authority |
| **Best-evidenced extra move** | Tracing before writing; Parsons | Compare methods; self-explain proofs | Modelling cycles; interactive engagement | Prompts over recasts; tasks; spaced items | SRSD; product goals; feedback on drafts | Explicit heuristics (sourcing and the like) with document sets | Structured reflection; mixed practice; feedback on practice exams |
| **Primary verifier** | Execution | CAS, numeric, DAG; a judge for proofs | Units and numeric; exact for qualitative predictions | Morphology and edit distance; a judge for production | Trait rubric plus constraints | Source entailment plus a rubric with ranges | Source checks, element constraints, panel distribution |

## 4. Domain-general tutoring architectures: what they abstracted, and where they broke

### 4.1 GIFT (US Army's Generalized Intelligent Framework for Tutoring)
**What it is.** An open-source, service-oriented framework for adding tutoring to existing training applications (Sottilare, Brawner, Goldberg & Holden; see the 2017 chapter, [doi:10.1201/9781315583655-20](https://doi.org/10.1201/9781315583655-20)). The technical primer is Ragusa, Hoffman & Leonard, "Unwrapping GIFT" ([CEUR Vol-1009](http://ceur-ws.org/Vol-1009/0702.pdf)). [V, from the primer]
- **Modules:**
  - the **domain module**: "performs performance assessment, based on domain-expert authored rules, carries out domain specific implementations of pedagogical actions based on **domain-independent pedagogical requests**";
  - the **pedagogical module**: "responsible for making domain-independent pedagogical decisions, using an internal pedagogical model based on learner state";
  - the **learner module**: cognitive and affective state from assessments, sensors, surveys and long-term traits;
  - the **sensor module**;
  - the tutor–user interface.
- **The domain knowledge file (DKF)** is XML with a **task, concept, condition** hierarchy.
  - Each condition points to a Java class that turns the training application's state into an assessment level, one of only **unknown, below, at or above expectation**.
  - The DKF also maps learner-state **transitions** to named **instructional strategies**: feedback, scenario adaptation, or a request for assessment.
  - New domains "typically require DKF authoring as a primary task", and sometimes "new custom java coding". [V]
- **Pedagogy.** Two models:
  - a **micro** model: DKF state transitions to strategies;
  - a **macro** model: learner-state attributes become **metadata queries** over the course's content, so the domain module can "present content based on the learner state and pedagogy recommendations". [V]
  - Later versions organize macro-adaptation around Merrill's Component Display Theory quadrants (rules, examples, recall, practice; the "eMAP"). [K]
- **Evidence.** Mostly case studies of individual GIFT-based tutors (marksmanship, land navigation, medical and cultural training, programming). GIFT is "largely an R&D tool". [V for the quote] There is no evidence that the *generic* pedagogy outperforms domain-specific tutors. Grade: **weak** as evidence for generality.

**What it gets right, and what to avoid.**
- *Right:* the **interface split**. Pedagogy asks for "an example of concept C at difficulty d" or "feedback on condition X". The domain side decides what that means and **does the assessing**. Plato's split of engine, adapter and course model is the same, and it is correct.
- *Avoid:*
  1. a **four-level performance state** (below, at, above) with no model of *which* wrong model the learner holds, which cannot drive misconception-specific repair;
  2. **one generic pedagogy** (Component Display Theory quadrants) applied to every KC kind, with no knowledge-kind → move mapping (KLI says this is wrong; §4.5);
  3. **hand-authored, code-heavy domain files** as the price of a new domain.

  Plato's course model is generated, and its adapter is a small library, not per-course code.

### 4.2 CTAT and example-tracing tutors
- **Aleven, McLaren, Sewall & Koedinger (2009)**, *IJAIED* 19 (EJ902546). Example-tracing tutors evaluate student steps by "flexibly comparing [them] against generalized examples of problem-solving behavior". An author **demonstrates** solutions in a drag-and-drop interface, and the demonstrations form a **behavior graph**: correct and buggy paths, several strategies, generalized by formulas and ordering constraints. No programming is needed. Development cost was **4–8 times lower** than for model-tracing tutors. [V]
- **Aleven et al. (2016)**, *IJAIED* 26 (EJ1091177). By 2016 CTAT tutors had served about **44,000 students** and made up **40% of DataShop's datasets**. 18 tutors across math, science, languages and other domains were "effective… often with large pre/post effect sizes". The **limit**: "example-tracing tutors can only handle problems with no more than a moderately-branching solution space". [V]
- **SimStudent** (Matsuda, Cohen & Koedinger 2015, *IJAIED* 25, EJ1049511). A machine-learning agent **induces production rules** from an author's demonstrations and feedback. "Authoring by tutoring" gave more accurate expert models than authoring by demonstration. [V] SimStudent's successors (the Apprentice Learner architecture, AI2T) aim to make "teach the system, and it tutors" practical. [K]

**Lesson for Plato.**
1. A **solution graph with marked buggy edges** is the most reliable verifier for multi-step, moderately branching problems in any domain. Plato's `Problem.steps` should allow a DAG, as Proof Blocks does (§3.1), not just a sequence.
2. The LLM now plays the *author*: it demonstrates and generalizes. But CTAT's authoring checks still apply: every path is executed, and buggy edges are justified (`system-spec.md` §7, gate).
3. Where the solution space branches too much (essays, designs, open proofs), switch from tracing to **constraints** (§1.5) or a **judge** (§7.2). Don't force a graph.

### 4.3 AutoTutor across domains
AutoTutor's expectation and misconception-tailored dialogue (EMT) is summarized in [Tutoring §1.6]. Here the question is what crossed domains.
- **Domains.** Computer literacy, Newtonian physics (Why/AutoTutor), research methods and scientific reasoning (Operation ARIES, a game; Forsyth et al. 2013, *JEDM*, EJ1115374), adult reading comprehension (the CSAL trialogues), and electronics (ElectronixTutor). Learning gains were about 0.8 SD over reading controls (Nye, Graesser & Hu 2014), "on par with novice and expert human tutors" (Graesser 2016, *IJAIED* 26, EJ1091170). [V]
- **The fixed part:**
  - the dialogue manager (pump, hint, prompt, assertion, summary);
  - the expectation-coverage logic;
  - **trialogues** with two agents (Graesser 2016).
- **The domain part:** the **curriculum script**: main questions, expectations, misconceptions, hints and prompts with their expected answers, and summaries. Scripts were hand-authored with AutoTutor's Script Authoring Tool. [K]
- **Where it broke: answer assessment.** Cai, Gong, Qiu & Hu (2016), IVA (ED617867), analysed 3,358 answers to 49 questions. "Semantic matching works well for some questions but poor for others", and the variation is **predictable by "question uncertainty"**: the entropy of the clusters that student answers fall into. They proposed **iterative script authoring**: revise questions and ideal answers until answers cluster. [V] AutoTutor was also never strong at quantitative, multi-step derivations. Why2-Atlas paired dialogue with a separate physics-reasoning back end for exactly that reason. [K]
- **Integration across tutors.** ElectronixTutor (Graesser, Hu, Nye, VanLehn et al. 2018, *IJ STEM Education* 5, EJ1181935) combined AutoTutor, Dragoon, LearnForm, ASSISTments and BEETLE-II. The glue was **a common set of KCs that every resource contributes evidence to**, one student model over them, and a recommender for "a small set of sensible next steps". [V]
- **The LLM version.** "AutoTutor meets LLMs" (Pal Chowdhury, Zouhar & Sachan 2024, [arXiv:2402.09216](https://arxiv.org/abs/2402.09216)) keeps a **hand-built finite-state pedagogy** and lets the LLM fill in the state contents for math word problems (MWPTutor), arguing that "the overall pedagogical design still needs to be handcrafted". [V]

**Lessons for Plato.**
1. **Measure each question's answer-space entropy before trusting its judge.** A question with diffuse answer clusters gets more anchors, a rewrite, or a lower trust weight (§7.2). This is the AutoTutor finding turned into a calibration rule.
2. **The KC space is the integration bus.** Every verifier, element and problem form reports evidence against the same KC IDs. That is ElectronixTutor's lesson and KLI's.
3. **The EMT script is domain-general**, and it is the right default for *principle* KCs in any domain. Expectations play the part of the parts of a good answer, and misconceptions the part of wrong models. LLMs can now draft the script (§5.1). The domain-specific part shrinks to verifying coverage of each expectation.

### 4.4 ASSISTments
- **Heffernan & Heffernan (2014)**, *IJAIED* 24 (EJ1042147). The name blends "assistance" and "assessment". Teachers write or select items, each with an answer, **hints, scaffolding questions** and solutions, bundle them, and get reports. The platform runs **minimally invasive randomized experiments** inside normal use. "While originally focused on mathematics, the platform now has content from many other subjects… [but] it is mostly used by math teachers." [V]
- **Open responses** came later, with NLP scoring of math explanations (Baral et al. 2021, ED615565; Botelho et al. 2023, *JCAL*, EJ1378575). [V]
- Effects are in [Personalization §4.2]: g = 0.18, larger for lower achievers.

**What it abstracted.** ASSISTments is **content-agnostic and pedagogy-thin**: items, hints and mastery rules ("three in a row") are generic, and verification is by **answer format** (numeric, algebraic, multiple choice, text). **Lesson.** A thin generic shell with good item-level feedback and **built-in A/B infrastructure** produces real gains and keeps learning *about* teaching. Its weakness for generality is the same as its strength: it can only check what fits a closed answer format. Its reach beyond mathematics stayed small. [inference from the quote]

### 4.5 KLI as a cross-domain theory
[Decomposition §3] covers the KC taxonomy and the kind → instruction mapping. Three findings test it *across* domains.
- **Koedinger, Booth & Klahr (2013)**, *Science* 342, [doi:10.1126/science.1238056](https://doi.org/10.1126/science.1238056). The instructional design space is combinatorially huge: about 15 dimensions with several options each give trillions of combinations. Which option is optimal **depends on the kind of KC**, which is why "worked examples versus testing" and "spacing versus blocking" disputes persist. It argues for many in-vivo experiments. [V citation; content K]
- **The boundary case in languages.** Wylie, Koedinger & Mitamura (2009), CogSci, "Is self-explanation always better?". Prompted self-explanation, which helps in geometry, gave **no benefit** for adult learners of English articles and **cost time**, so practice alone was more efficient. A follow-up tested *adaptive* prompting (Wylie et al. 2011, AIED, [doi:10.1007/978-3-642-21869-9_110](https://doi.org/10.1007/978-3-642-21869-9_110)). [K; check that paper's result before quoting] The reading: article choice is mostly a **non-verbal category** KC (KLI's "variable condition, constant response, non-verbal"), and the asymmetry hypothesis predicts that verbal sense-making adds little to such KCs. So the cross-domain rule is **"match the move to the KC kind", not "always self-explain"**.
- **Koedinger, Carvalho, Liu & McLaughlin (2023)**, *PNAS* 120 (preprint [doi:10.31234/osf.io/pxsfh](https://doi.org/10.31234/osf.io/pxsfh)). 1.3 million observations across **27 datasets in math, science and language**, from elementary school to college. Initial correctness after instruction averaged about **65%** and varied a lot between students (about 55% in the lower half, 75% in the upper half). The **learning rate per practice opportunity was "astonishingly similar"**: about **+0.1 log-odds, roughly 2.5% accuracy, per opportunity**. [V] Grade: **strong** (large and multi-domain, though limited to tutored practice with feedback).
  - **Implication.** In tutored practice with feedback, the dynamics of learning look *domain-general*. Differences between students and domains are mostly in **starting points and in the KC model**, not in how fast learning happens per well-designed opportunity. Plato can share one learning-dynamics prior across subjects (`system-spec.md` §5) and spend its domain effort on getting the KCs and verifiers right.

### 4.6 Learning engineering: data-driven refinement of KC models
- **DataShop and learning curves.** For each hypothesized KC, plot the error rate against the opportunity count across students. A good KC gives a smooth declining curve. A **flat or bumpy** curve means the KC label lumps together things that are learned separately, or splits one thing in two. [K; standard practice]
- **The additive factors model (AFM)** is logistic regression with a student proficiency, a KC easiness and a KC learning rate, fitted per KC. **Learning Factors Analysis** searches over splits and merges of KCs to improve fit (Cen, Koedinger & Junker 2006, ITS, [doi:10.1007/11774303_17](https://doi.org/10.1007/11774303_17)). [V citation; K content]
- **Closing the loop.** Koedinger, Stamper, McLaughlin & Nixon (2013), AIED, [doi:10.1007/978-3-642-39112-5_43](https://doi.org/10.1007/978-3-642-39112-5_43). A data-discovered refinement of a geometry-area KC model (a hidden planning KC) led to a **redesigned tutor** that isolated practice on that KC. In a classroom experiment the redesigned tutor gave more efficient learning on the targeted skill. [V citation; K result, check the numbers] Liu & Koedinger (2017, *JEDM*) automated the discovery step. [K]
- **Learning engineering** (Goodell & Kolodner, eds., 2022, *Learning Engineering Toolkit*) is the iterative loop: hypothesize the KC model, instrument the work, fit curves, redesign, A/B test. [K]

**What this gives Plato across domains.** A domain-*independent* way to check a domain-*specific* KC model, and the only one with a track record:
1. Log every verified attempt against KC IDs, then fit AFM per course.
2. Flag KCs with flat or erratic curves.
3. Have the deep model propose splits or merges, citing the items involved.
4. Re-fit, keep the better model (by cross-validated likelihood), and redesign items for any newly isolated KC.

`system-spec.md` §7 stage 12 ("learning curves split or merge KCs") is this. **It works the same in every subject, given verified attempts.** That is one more reason the per-domain verifier is the critical component.

### 4.7 Summary: what each generalization strategy abstracted

| System | Fixed across domains | Supplied per domain | Breaks when |
|---|---|---|---|
| **Cognitive Tutor** (model tracing) | Model-tracing engine, knowledge tracing, mastery | Production rules including buggy ones (very expensive) | The solution path isn't enumerable; authoring cost |
| **CTAT example tracing** | Tracing engine, hints, tutor shell | Interface plus demonstrated behavior graphs | Branching is more than moderate |
| **Constraint-based tutors** | Constraint checker, feedback on violations | Constraint sets | Constraints can't express quality (essays, interpretations) |
| **AutoTutor** | EMT dialogue manager, trialogues | Curriculum scripts | Semantic matching is unreliable on diffuse questions; multi-step quantitative work |
| **ASSISTments** | Item, hint and scaffold shell; mastery rules; experiments | Items in closed formats | Open-ended work (now partly handled by NLP scoring) |
| **GIFT** | Pedagogical module, learner module, interfaces | DKF plus Java conditions per training application | Coarse state, generic pedagogy, authoring burden |
| **KLI and DataShop** | Theory: KC kind → instruction; AFM and curves | The KC model per course | No verified, KC-tagged attempt data |
| **Plato (proposed)** | Engine, learner model, move library, dialogue, stage | Course model (generated) plus adapter (small library: verifiers, representations, forms, signatures, facets, emphasis) | §9 lists the risks |

**The pattern.** Every successful general system **fixed the pedagogy-and-dialogue machinery and pushed assessment into domain-specific pieces**. Each one broke where its assessment representation (rules, graphs, constraints, semantic match, answer formats) could not express what counts as good work in the new domain. **Generality is limited by verification.** Plato's adapter design should start there.

## 5. LLM-era generalization: what transfers between subjects and what breaks

### 5.1 Building the domain model automatically
- **Tutoring scripts from a lesson text.** Ruffle&Riley, Schmucker, Xia, Azaria & Mitchell ([arXiv:2310.01420](https://arxiv.org/abs/2310.01420); AIED 2024, [arXiv:2404.17460](https://arxiv.org/abs/2404.17460)).
  - The system **induces an AutoTutor-style script** (questions, expectations, misconceptions) from a lesson text. Two LLM agents run it in a learning-by-teaching format: the learner teaches "Ruffle" while "Riley" the professor helps.
  - Two online studies on **biology**, N = 200, against QA chatbots and reading. Users reported more engagement and understanding and took longer, but there were **no significant differences in short-term learning gains** over reading. [V]
  - Lesson: automatic script induction works mechanically. **Structure alone does not produce gains.** Gains need what the successful trials had: verified diagnostic content, practice on the student's actual errors, and outcomes measured on transfer.
- **Synthetic dialogues from textbooks.** Book2Dial (Wang et al. 2024, [arXiv:2403.03307](https://arxiv.org/abs/2403.03307)) generated teacher–student dialogues grounded in textbooks from several domains. The best method "still suffers from **hallucinations** and tends to reiterate information". [V] TutorEval/TutorChat (Chevalier et al. 2024, [arXiv:2402.11111](https://arxiv.org/abs/2402.11111)) has expert-written questions about **long STEM textbook chapters**. Fine-tuning on generic dialogue data did poorly; textbook-grounded synthetic dialogues helped. [V]
- **Knowledge-component discovery.**
  - KCluster (Wei, Carvalho & Stamper 2025, [arXiv:2505.06469](https://arxiv.org/abs/2505.06469)): an LLM-induced question-similarity metric plus clustering produced KC models that **predicted student performance better than the best expert models** on three datasets. [V]
  - Wang, Lin & Koedinger (2025, [arXiv:2511.09935](https://arxiv.org/abs/2511.09935)), on 646 multiple-choice questions: plain LLM labelling did **worse** than the expert model (RMSE .4285 versus .4206) and **over-generated** KCs (569 versus 101). Merging labels by embedding similarity (cosine 0.8) cut the count to 428 and improved RMSE to .4259. [V]
  - Duan et al. (2026, [arXiv:2602.17542](https://arxiv.org/abs/2602.17542)): LLM **KC-level correctness labels** on student code gave learning curves "more consistent with cognitive theory" and better AFM fit, with substantial agreement with experts. [V]
  - Lesson: KC models can be bootstrapped by LLMs in any domain. **Their validity is established only by learner data** (AFM and curves, §4.6), and the typical LLM error is **too many, too fine** KCs.
- **LLMs as tutors inside real tutoring systems.** TutorGym (Weitekamp, Siddiqui & MacLellan 2025, [arXiv:2505.01563](https://arxiv.org/abs/2505.01563)) placed LLMs in **223 tutor domains** from CTAT, Apprentice and OATutor. As tutors, "none did better than chance at labeling incorrect actions", and their suggested next steps were correct only **~52–70%** of the time. As *simulated students* trained in context, they produced "remarkably human-like learning curves". [V] This is the strongest single piece of evidence that **step verification must come from outside the LLM**, in every domain.

### 5.2 Cross-domain evaluations of LLM tutors
- **LearnLM.**
  - The tech report ([arXiv:2412.16429](https://arxiv.org/abs/2412.16429)) evaluated "a diverse bank of 49 scenarios across core academic subjects", plus a medical-education feasibility study. Its definition of pedagogical instruction following: "we contextualize training and evaluation examples with system-level instructions that describe desired pedagogical behavior". **Results are aggregated; there is no breakdown by subject.** [V via the HTML]
  - The earlier report (Jurenka et al. 2024, [arXiv:2407.12687](https://arxiv.org/abs/2407.12687)) let learners choose maths, CS, biology, chemistry, literature, history or other subjects. Again there is **no breakdown by subject**. [V via the HTML]
  - The 2025 learning arena ([arXiv:2505.24477](https://arxiv.org/abs/2505.24477)) drew educators from English, mathematics, history, chemistry, music, IT, engineering and second-language teaching. It also reported only **aggregate** win rates. [V via the HTML]
  - **Implication.** The flagship cross-subject evaluations *sample* subjects but don't *test* generalization: a model could fail badly on interpretive subjects and still win on average. Plato's validation must **stratify by domain type** and require no collapse in any stratum (§8).
- **TutorBench** (Srinivasa et al. 2025, [arXiv:2510.02663](https://arxiv.org/abs/2510.02663)): 1,490 expert-curated high-school and AP samples covering adaptive explanation, feedback on student work and hints, each with **sample-specific rubrics** judged by an LLM. **No frontier model scored above 56%**, and all were below 60% on the rubric criteria for diagnosing and guiding. [V]
- **Pedagogical knowledge transfers.** The Pedagogy Benchmark (Lelièvre et al. 2025, [arXiv:2506.18710](https://arxiv.org/abs/2506.18710)) uses teacher-exam questions on **cross-domain pedagogical knowledge**. Accuracy across 97 models ranged from **28% to 89%**. [V] Frontier models *know* general pedagogy; the gap is in *applying* it to a specific student's work (TutorBench, TutorGym).
- **Grading reliability falls as content becomes interpretive.** Golchin, Garuda, Impey & Wenger (2024, [arXiv:2406.11102](https://arxiv.org/abs/2406.11102)) graded MOOC writing in Introductory Astronomy, Astrobiology, and History and Philosophy of Astronomy. GPT-4 with instructor answers and rubrics matched instructors better than peer grading did. But "the most difficult course to grade is the History and Philosophy of Astronomy. Both LLMs and peer graders struggle", because "courses requiring reasoning/imaginative skills… [are] more challenging". [V]
- **Writing feedback.** LLM feedback improves revision against no feedback (Meyer et al. 2024) but is somewhat below trained humans in quality (Steiss et al. 2024) (§3.5).
- **Fabricated authority.**
  - Dahl, Magesh, Suzgun & Ho (2024, [arXiv:2401.01301](https://arxiv.org/abs/2401.01301)): on verifiable questions about federal cases, legal hallucination rates ran from **58% (GPT-4) to 88% (Llama 2)**. Models often **failed to correct a user's false legal premise** and did not know when they were hallucinating. [V]
  - Magesh et al. (2024, [arXiv:2405.20362](https://arxiv.org/abs/2405.20362)): commercial RAG legal research tools still hallucinated **17–33%** of the time. [V]
  - The same failure appears wherever claims rest on citable sources: history (invented quotes), literature (lines not in the text) and medicine (guidelines).
- **Argument annotation** by LLMs reaches moderately high agreement with experts on most quality dimensions (Mirzakhmedova et al. 2024, §2.3). Of the open-ended judging tasks, it is one of the more tractable.

### 5.3 What transfers, and what breaks
| Layer | Transfers across subjects? | Evidence |
|---|---|---|
| **General pedagogy** (move families, help ladder, elicit before telling, EMT dialogue, feedback principles) | **Yes**, given a kind → move mapping | KLI; AutoTutor across domains; LearnLM principles; the Pedagogy Benchmark top scores |
| **Learning dynamics** (practice → improvement) | **Mostly**: similar per-opportunity learning rates across math, science and language | Koedinger et al. 2023 *PNAS* (§4.5) |
| **Learner modelling statistics** (θ/σ, AFM, BKT) | **Yes**, given verified, KC-tagged evidence | DataShop across domains |
| **KC discovery** | **Partly**: LLMs bootstrap it, data validates it | KCluster; Wang et al. 2025 |
| **Dialogue and voice** | **Yes**, except language learning, where speech *is* the content and recognition errors are verdict errors | Bibauw et al. 2022 (§3.4) |
| **Verification of correctness** | **No**: execution, CAS, units, DAGs, source checks and calibrated judges are different machines | TutorGym (chance-level error labelling); legal hallucination; Golchin; [Tutoring §2.8] |
| **Diagnosis of misconceptions** | **No**: executable rules in computable domains; batteries for science models; rubric signatures for interpretation | §2.2, §3.2, §7.4 |
| **Epistemic norms** (what counts as evidence; can experts disagree?) | **No** | Goldman et al. 2016; Kuhn et al. 2000 |
| **Representations and problem forms** | **No**, but drawn from a shared family of patterns | §3.7 |
| **Session timescale** (one problem; a draft over days; a case; a conversation) | **Partly** | Writing and language need multi-session artefacts; medicine needs case flow |

**Bottom line.** One engine can teach every subject if three things are true:
1. it **never trusts its own verdict** where a domain verifier or a calibrated judge should rule;
2. it **knows the epistemic regime** of each item: one right answer, an equivalence class, a constraint set, a defensible range, or an expert distribution;
3. its evaluation is **stratified by domain type**.

The LLM is the general-purpose *author and conversationalist*. The adapter is the domain's *conscience*.

## 6. Deliverable 1: a domain-general model of learning and teaching

This model refines `system-spec.md` Part I, and Part I stays the frame. Where this section **adds** to it, the change is marked **[amend §n]** with its evidence. The test of each primitive: the engine's decisions may depend on **kind, structure, regime, facet and learner state**, never on the *name* of the subject.

### 6.1 What is learned
**(a) Knowledge kinds.** Part I has four; keep them and add two meta-kinds.

| Kind | Definition | Cross-domain examples | Status |
|---|---|---|---|
| Fact | Constant condition, constant response | Vocabulary; notation; a date; a drug class | Part I |
| Concept | Category with boundaries | A fallacy; an ionic bond; a tort; an emergent process | Part I |
| Procedure | Multi-step skill (condition → action) | Base conversion; integration by parts; conjugation; balancing equations | Part I |
| Principle | Causal or structural regularity with a rationale | Newton's laws; comparative advantage; why ~x+1 = −x | Part I |
| **Strategy (control)** | Knowledge of *which* procedure or principle to use, plus monitoring of progress | Schoenfeld's control; Weber's strategic knowledge for proofs; SRSD planning; differential diagnosis; debugging strategy | **[amend §1]**: Schoenfeld 1985/1992; Weber 2001; Graham & Perin 2007 (strategy instruction 0.82); Mamede 2012 |
| **Epistemic practice** | How claims are made and warranted in the field: what counts as evidence, which arguments are acceptable, how disagreement is handled | Sourcing and corroboration (history); proof standards (math); model evaluation (science); precedent and distinction (law); close reading with textual evidence (literature) | **[amend §1]**: Goldman et al. 2016; Wineburg 1991; Schwarz et al. 2009; Kuhn et al. 2000; Stoel et al. 2017 |

Strategies and practices are **not** reducible to principles about content. They are evidenced only in **unfamiliar** tasks: an unseen problem, a new document set, a novel case. They are taught by **explicit modelling plus coached practice** (cognitive apprenticeship; SRSD), not by explanation alone (§6.4).

**(b) Structures above KCs.** Part I has runnable models, representations, integration and spine. Keep all four, broaden models, and add cases.
- **Runnable models.** The definition in Part I (state plus update rules) holds across domains, with five recurring forms:
  1. **machines**: notional machines, circuits, algorithms;
  2. **physical and causal models**: forces, metabolic pathways, supply and demand;
  3. **formal structures**: definitions and their consequences, a proof's dependency graph;
  4. **scripts**: illness scripts (enabling conditions, fault, consequences); legal rules with elements, exceptions and policy; genre schemas in writing;
  5. **interpretive frames**: a theoretical lens, a historical context model.

  The fifth form is only *partly* runnable. It generates *questions and expectations* about a text, not unique predictions. **[amend §1]**: Charlin et al. 2007; Hestenes 1987; §3.6.
- **Cases. [amend §1, new structure].** A library of instances (worked problems, patients, precedents, documents, texts, designs), each tagged with the concepts it instantiates and *how*, and linked to other cases as *analogous, distinguishable* or *contrasting*. In ill-structured domains, cases carry the knowledge that rules cannot. Evidence: Spiro et al. 1988; Gentner, Loewenstein & Thompson 2003 [Understanding §6]; CATO's factor-based precedents (Aleven 2003); illness scripts.
- **Representations.** Unchanged. Translation between them is a skill (Ainsworth 2006 [Understanding §7]).
- **Integration.** Unchanged (links, discrimination, assembly), plus **multiple perspectives** for ill-structured topics: the same case seen through two frames (CFT).

**(c) The epistemic regime of each item. [amend §1, new attribute].** Every probe and problem declares how correctness works for it. **The regime, not the subject, selects the verifier.**

| Regime | Meaning | Examples | Verifier family (§7.2) |
|---|---|---|---|
| **R1 unique** | One right answer | A numeric result; a date; a register value | Exact, numeric with tolerance |
| **R2 equivalence class** | Many forms, one meaning | Algebraic expressions; any valid order of proof lines; any program passing the tests; translations | CAS, execution, DAG, semantic equivalence |
| **R3 constraint set** | Any solution meeting the requirements | A database schema; a circuit design; an essay meeting product goals; a legal answer covering every element | Constraint checks (code where possible, narrow judge questions otherwise) |
| **R4 defensible range** | Graded by disciplinary criteria; several strong answers exist | Interpretations; historical arguments; policy arguments | Facts and sources checked, then an argument pipeline, then a calibrated rubric with anchored range |
| **R5 expert distribution** | Judgement under uncertainty; experts legitimately differ | The likelihood of a diagnosis given a new finding; how a close case will come out | Panel-distribution scoring, Script Concordance Test style |

### 6.2 How understanding is evidenced
**Understanding is shown by performance:** the learner does something with the knowledge that they could not do without it, on a task they have not seen, unaided, after a delay (Part I §3). Across domains, the evidence comes from ten **performance families**. Each domain renames and instantiates them; the engine reasons only about the families.

| # | Family | What it proves | Programming | Mathematics | Science | History and literature | Law and medicine | Languages and writing |
|---|---|---|---|---|---|---|---|---|
| E1 | Recall | Item retained (weak alone) | Syntax | Definitions | Constants, terms | Dates, actors | Elements, drug classes | Vocabulary |
| E2 | Discriminate | Concept boundaries | Which construct fits | Which theorem applies | Which principle (problem sorting) | Primary or secondary source | Which tort; which diagnosis | Which tense or register |
| E3 | Execute | Procedure on a new instance | Write a function | Compute, solve | Solve with units | Build a timeline | Apply the rule to facts | Conjugate in context |
| E4 | **Predict** | The model runs | Trace output | Predict a property | POE on a phenomenon | Predict an actor's response from context | Predict the course or holding; perturb the case | Predict a reader's reaction |
| E5 | **Explain or justify** | Principle and warrant | Explain in plain English | Why each step is valid | Mechanism | Causal explanation with evidence | Reasoning from precedent or pathophysiology | Why this word or structure |
| E6 | **Evaluate or critique** | Standards held | Debug | Validate a proof; find the error | Critique an experiment or model | Source critique; evaluate an interpretation | Find the missed element; reflect on a diagnosis | Revise a draft; peer review |
| E7 | **Transfer or integrate** | Flexible, combined use | New domain or several KCs | Proof by an unfamiliar method | New context | Same concept, new period | New fact pattern; atypical case | New genre or situation |
| E8 | **Generate or compose** | Full construction | Program | Proof | Model | Essay, argument | Work-up; memo | Spontaneous speech; draft |
| E9 | **Perspective** | Alternatives held | Compare designs | Compare methods | Compare models | Argue the other side; a second frame | Opposing counsel; the differential | Another audience |
| E10 | **Calibration** | Self-knowledge | Confidence against result, in every subject | | | | | |

**Rules that hold in every subject:**
1. An item is evidence only if a learner **lacking** the knowledge would probably fail it, and, for diagnosis, if each wrong model predicts a **different** outcome. This is the separating-probe rule ([Decomposition §0 rule 6]).
2. **Weight = diagnosticity × independence × conditions** (unaided, delayed, new surface).
3. **Strategy and practice KCs need E6–E9 on unfamiliar material.** Content KCs are evidenced by E2–E5.
4. **Delayed evidence can reverse immediate evidence.** Structured reflection was worse immediately and better a week later (Mamede 2012). Related dissociations: CFT-style instruction lost on factual memory but won on transfer (Jacobson & Spiro 1995), and Proof Blocks matched proof-writing on learning in far less time (Poulsen 2022). So moves are judged by delayed transfer per unit of the learner's time. The learner model must not let in-session success decide which moves "work".

### 6.3 What goes wrong
`system-spec.md` §8 has seven error kinds. Across domains the evidence supports **twelve**, in four groups. Every wrong model in every course is one of these, and the **repair is chosen by kind, not by subject**.

| Group | Kind | Signature | Repair family | Source |
|---|---|---|---|---|
| **Performance** | F1 Slip | Right model, isolated execution error | Locate; the learner fixes it | Part I |
| | F2 Fragile or inert | Right only in the familiar surface; can't tell when it applies | Vary the surface; discrimination practice; interleave | Chi et al. 1981; Part I |
| | F3 Control failure | No plan, no monitoring, premature closure, wild goose chase | Strategy modelling plus prompts ("What are you doing? Why?"); structured reflection | Schoenfeld; Mamede |
| **Content** | F4 Missing piece | A gap or missing prerequisite | Detour, first-step check, return | Part I |
| | F5 False belief | One wrong proposition | Refutation | [Understanding §1] |
| | F6 **Buggy procedure** | A systematic, rule-like error; *executable* | Contrast the step with the correct one; worked example of the step | BUGGY/repair theory [K]; Cognitive Tutor |
| | F7 Flawed or synthetic model | A coherent wrong model; a consistent pattern across probes | Run it to a checkable contradiction; build the replacement; compare | Vosniadou; [Understanding §1] |
| | F8 Category mistake | Wrong ontological frame (direct versus emergent; substance versus process) | Teach the frame, then re-apply it to this case and two more | Chi 2005; Chi et al. 2012 |
| **Reasoning** | F9 **Reduction** | Single cause, linear, static, universal, separable | Counter-case; multiple analogies; criss-cross cases | Spiro et al. 1988; Feltovich et al. 2004 |
| | F10 **Misreading** | Misrepresents the text, source, problem statement or data | "Show me where it says that"; re-read with a focus | Wineburg 1991; Peskin 1998 |
| | F11 **Epistemic misstep** | Wrong standard of evidence: proof by example; source naivety; absolutism or multiplism; claim without warrant; myside bias; fabricated authority | Make the discipline's standard explicit; argument mapping; ask for the counterargument | Kuhn 1991; Kuhn et al. 2000; Wolfe & Britt 2008; Wineburg 1991 |
| **Self** | F12 Illusion of competence | "I get it", then fails | A generative check; show the calibration record | [Personalization §2.4] |

### 6.4 Which moves work for which kind of knowledge
The **move families** of Part I §4 are fixed. Kind and structure set their **emphasis**, which becomes the priors of the learning-dynamics model.

| Knowledge | Emphasised moves | Avoid | Evidence grade |
|---|---|---|---|
| **Fact** | Retrieval, spaced with longer gaps for delayed tests; interleave confusables; elaborate with meaning | Socratic "discovery" | Strong (Kim & Webb 2022 for L2; [Understanding §4]) |
| **Concept** | Varied examples and **near-miss non-examples**; contrasting cases; **mixed practice** | Single prototypes; blocked practice only | Strong to moderate (Hatala 2003; [Understanding §6]) |
| **Procedure** | Worked example, then faded steps, then practice with step feedback; subgoal labels; the **assembly rung** (Parsons, Proof Blocks); compare methods | Problem-only practice for novices | Strong (expertise reversal holds even for essays: Kyun et al. 2013) |
| **Principle** | Predict before telling; self-explanation; refutation; **several** analogies with their limits; try first, then a "time for telling" | Telling alone; a single analogy | Moderate to strong ([Understanding §1–3]; Spiro et al. 1989) |
| **Strategy** | **Modelling with a think-aloud**, a named strategy, prompted self-monitoring, faded scaffolds (SRSD); structured reflection | Leaving strategy implicit | Strong for writing (0.82); moderate elsewhere |
| **Epistemic practice** | Explicit heuristics with document or case sets (sourcing, corroboration, contextualization); argument maps **with feedback**; dialogue that asks for the counterargument; rubric criteria shown to the learner | Assuming it emerges from content study; neutral "all views are valid" | Moderate (De La Paz & Felton 2010; Reisman 2012; Cullen et al. 2018; Abrami et al. 2015) |
| **Runnable model** | Build, run, test, revise (modelling cycles); predict–observe–explain on the model; run the learner's own model to a contradiction | Static diagrams only | Moderate to strong (Hake 1998; Wells et al. 1995) |
| **Cases** | Compare two cases (analogical encoding); revisit a case through a new concept (criss-cross); "perturb the case" hypotheticals; mixed practice across categories | One canonical case per concept | Moderate (Gentner et al. 2003); weak for CFT specifically |
| **Representations** | Translate between them; concreteness fading; link the representations explicitly | Many unlinked representations | Moderate ([Understanding §6–7]) |
| **Integration and fluency** | Interleaved and integrative tasks; timed re-use of known material (fluency); communicative tasks (languages) | Isolated drills as the only practice | Moderate (Nation 2007; Bryfonski & McKay 2019) |

**Invariants unchanged across all subjects** (Part I §6): the learner does the thinking; verdicts are verified before they're spoken; help is contingent; the course is the ground; targets are fixed; success is delayed, unaided performance on new problems. This brief adds one invariant:

7. **[amend §6] Epistemic honesty.** The tutor states the item's regime when it matters ("this has one answer", "historians disagree here, and here's how you'd argue it"). It never presents an R4 or R5 judgement as an R1 fact, and never presents an R1 fact as opinion. This guards against both absolutism and multiplism (Kuhn et al. 2000) and against hallucinated authority (§5.2).

## 7. Deliverable 2: the domain adapter specification

### 7.1 What stays fixed and what varies
**Principle: the core is written once, and the adapter is a small library chosen per item, not per course.** One course binds several adapters. CS 3410 uses the computational adapter for traces and the textual adapter for "explain why". A history course uses the textual adapter for essays and exact matching for dates. Routing goes by the item's **regime** (§6.1c) and **answer format**.

| Fixed core (never branches on subject) | Varies per domain family (the adapter) |
|---|---|
| Target selection, arcs, move policy, help ladder H0–H4 | **Verifiers**: how an answer, a step or an artefact is checked (§7.2) |
| Move families and the kind → emphasis logic; the learning-dynamics model | **Move-emphasis priors** per kind within the family (§7.7) |
| Learner model (θ/σ per KC, wrong-model posteriors, AFM refits, calibration, half-lives) | **Misconception detectors**: how a wrong model is encoded and matched (§7.4) |
| Evidence weighting (unaided, delayed, new surface) | **Facet map**: domain names for the performance families E1–E10 (§7.5) |
| Course-model pipeline stages 1–12, the gate and the ablation | **Problem-form templates and generators** (§7.6) |
| Card schema, voice, stage directions, element *patterns* (predict, change, build, compare, teach) | **Representation kinds**: page elements, what to notice, translations, verifier hooks (§7.3) |
| Eval harness levels 1–6 | **Epistemic profile**: warrant types, source authority, disagreement policy, citation rules (§7.8) |
| Invariants 1–7 | **Notation parsers and normalizers**: math input, units, code, morphology |

### 7.2 Verifiers, and how to calibrate the judges
**Verifier chain.** For each attempt the core calls the item's chain and stops at the first **decisive** verdict:
1. parse and normalize;
2. exact or equivalence check;
3. the domain machine (execution, CAS, units, DAG);
4. constraints;
5. the source-grounding check;
6. the calibrated judge.

Each verdict carries **provenance and a trust weight**. Executed and symbolic verdicts weigh about 1.0. A judge verdict is weighted by its measured agreement on that criterion. An undecided verdict gives the voice a **neutral elicitation**, never a guess (`system-spec.md` §15, "verdicts are safe under latency").

| ID | Verifier | Regimes | How | Failure modes and guards |
|---|---|---|---|---|
| V1 | **Exact and normalized** | R1 | Normalize (case, whitespace, Unicode, accent policy); numeric tolerance (relative and absolute; significant-figures policy) | Formatting false negatives: log near-misses as "format" not "wrong" |
| V2 | **Execution** | R2, R3 | Run code against tests; **property-based tests with random inputs**; differential testing against a reference; simulators (RISC-V, circuits, ODEs); SQL result sets over generated databases; *generate-then-execute* for prose explanations (Smith & Zilles) | Sandboxed with timeouts; tests that are too weak (add mutation testing of the reference) |
| V3 | **Symbolic** | R2 | Parse the learner's notation (LaTeX or ASCII) into an AST, then CAS equivalence (`simplify(a−b)=0`) **plus randomized numeric identity tests** at several points; equivalence up to a constant for antiderivatives; **step check**: each step preserves equivalence or follows a licensed rule | CAS false negatives (branch cuts, assumptions): domain-aware sampling; a disagreement goes to a judge with both forms shown |
| V4 | **Numeric with units** | R1, R2 | Parse quantity and unit (a units library such as `pint`); **dimensional analysis first**, since a dimension error is its own diagnosis; convert, then apply tolerance; check sign conventions and vector components | Unit-less answers: ask for units rather than marking wrong |
| V5 | **Ordering (DAG)** | R2 | Accept any topological order of the dependency DAG; partial credit by edit distance to the nearest valid order (Poulsen et al.); distractor blocks map to wrong models | DAG authoring errors: the literal executor validates the DAG |
| V6 | **Constraints** | R3, R4 | (relevance, satisfaction) pairs, as in CBM. Each is a code predicate where possible, otherwise **one narrow yes/no judge question** (e.g. "Does the answer state the duty element *and* apply it to these facts?") | Over-strict constraints reject valid novel solutions: log constraint-only failures for review |
| V7 | **Source grounding** | R1, R4 | Quote match (exact or fuzzy) against the course's passages; attribution entailment ("does passage P support claim C?"); **citation existence and holding check** (law), document-in-set check (history); applies to **the tutor's own claims too** | Paraphrase misses: the entailment judge has its own calibration set |
| V8 | **Rubric judge** | R4 (and E5/E6 answers in any domain) | An analytic rubric decomposed into per-criterion questions; anchored exemplars at each level; **pairwise placement against anchors** for holistic bands; outputs per-criterion scores, the **weakest link**, a confidence and an abstain flag | All the judge biases below: calibrate per criterion |
| V9 | **Panel distribution** | R5 | Each item stores an expert-panel answer distribution; credit equals the share of the panel giving the learner's answer (Script Concordance Test scoring) | No human panel: a model panel is low-trust and labelled; correlated samples overstate consensus |
| V10 | **Speech and production** | Language use | ASR with word confidence; forced alignment for pronunciation; morphological analyser; grammar checker; a task-completion rubric | **No form verdict below the ASR confidence threshold**: ask to repeat, or to type |

**Judge calibration protocol** (V7 entailment, V8 rubric, V6 narrow questions, V9 model panels). This answers `system-spec.md` §19's open question, "how to calibrate a rubric judge for interpretive subjects without many human labels".
1. **Decompose before calibrating.** Calibrate many narrow criteria, not one holistic grade. Narrow binary questions agree better and fail more visibly (LLM-Rubric, Hashemi et al. 2024, [arXiv:2501.00274](https://arxiv.org/abs/2501.00274), combined per-question LLM distributions with a small calibration network and halved error against an uncalibrated baseline [V]). The same logic underlies CBM constraints (§1.5).
2. **A gold set per rubric family, per course family.** 60–100 answers per criterion:
   - real ones where they exist;
   - otherwise realistic answers *plus controlled perturbations* (insert a misreading, delete the counterargument, add an unsupported claim, swap a cause).

   Two or more domain experts label them. **Measure expert–expert agreement first** (QWK or Krippendorff's α): it is the ceiling and the target. Zheng et al. (2023, [arXiv:2306.05685](https://arxiv.org/abs/2306.05685)) found strong LLM judges matched human preferences at about the human–human level, over 80%. [V] The judge passes a criterion when its agreement with the expert consensus is **≥ the expert–expert agreement, and κ ≥ 0.6** (`system-spec.md` §17). Expect some criteria to fail. Those stay **"discussion-only"**: the tutor asks about them but never issues verdicts on them.
3. **Anchors in the prompt.** For each criterion, exemplars at each level, including near-misses. For holistic placement, use **pairwise comparison against anchors**, which is more reliable than absolute scores (Toledo et al. 2019; comparative judgement).
4. **Bias probes, required.** Each must change the score in fewer than 5% of cases:
   - **position** swap;
   - **length padding** (verbosity bias);
   - **confident or hedged tone**: sycophancy toward confident learners;
   - **paraphrase invariance**;
   - **self-preference**: the tutor's own explanation pasted back as the learner's answer;
   - dialect and second-language fairness.

   The position, verbosity and self-enhancement biases are documented in Zheng et al. 2023. [V]
5. **Per-item reliability gate.** Cluster sampled answers to each open question. **High answer-space entropy predicts poor automatic assessment** (Cai et al. 2016, §4.3). High-entropy items get more anchors, a rewritten prompt, or discussion-only status.
6. **Uncertainty drives behaviour, not just a score.** The judge returns a distribution (or k self-consistent samples). If uncertain, the move is **elicitation** ("Walk me through why the source supports that"), and the evidence enters the learner model with low weight. **The voice never states an uncertain verdict.**
7. **Role separation.** The judge sees the rubric, the anchors and the sources, never the tutor's plan or opinion as ground truth. It runs on a separate lane from the actor (the Bridge and Tutor CoPilot lesson, [Tutoring §0 rule 6]).
8. **Drift and honest metrics.** Re-run the gold set on any model or prompt change. Estimate population metrics (e.g. "the share of essays at band 3 or above") with **prediction-powered inference**: many judge labels plus a small human-labelled sample give valid confidence intervals (Angelopoulos et al. 2023, [arXiv:2301.09633](https://arxiv.org/abs/2301.09633)). [V]
9. **Severity across courses.** When several judges or human raters score the same family, estimate rater severity with many-facet Rasch measurement (Linacre; Eckes), so that "band 3" means the same everywhere. [K]
10. **Learning from disagreement.** Expert review of a sample of judge–learner disputes ("I think my reading is valid") goes back into the anchors. Some R4 items will turn out to be R5. Re-label their regime rather than forcing a key.

**Expected reliability by regime** (planning assumptions to be measured):
- R1–R2: about 100%, by construction.
- R3: constraints are high; narrow judge questions above κ = 0.7.
- R4: per-criterion κ of 0.6–0.8, with holistic scores lower. The Golchin et al. course in history and philosophy is the warning.
- R5: unknown until a panel exists.

### 7.3 The representation library
`system-spec.md` §15 defines one `Element` schema with five learner actions (predict, change, construct, compare, explain). The adapter registers **element kinds**. Each kind declares:

```ts
ElementKind {
  kind,                          // 'memory-diagram' | 'free-body' | 'argument-map' | 'illness-script' | ...
  state, render, controls,       // how it is drawn and manipulated on the page
  actions: LearnerAction[],      // which of predict/change/construct/compare/explain it supports
  notice: string[],              // what an expert attends to (the "what to notice" field)
  translations: ElementKind[],   // representations it should be explicitly linked to [Understanding §7]
  check?: VerifierRef,           // how a learner-built instance is verified (e.g. vector sum of a free-body diagram)
  reveals?: WrongModelRef[]      // wrong models that show up visibly in learner-built instances
}
```

| Family | Element kinds (first set) | Verifier hooks |
|---|---|---|
| **Computational** | Memory or box diagram; trace table; code zone with run; circuit sandbox; timing diagram; register file; Parsons blocks | Execution; per-cell trace check; truth tables |
| **Formal-quantitative** | Editable equation; function graph; number line; area model; free-body diagram; energy bar chart; motion graphs; vector diagram; proof-block DAG; proof outline (local and holistic); units pad | CAS; units; vector sums; DAG |
| **Science-model** | Model builder (entities, interactions, rules); stepped simulation; particle view (macro, particle, symbolic); pathway stepper; phylogenetic tree; data plot with fit | Simulation against the stored outcome; constraint checks on the model structure |
| **Textual-argumentative** | **Source card** (author, date, audience, purpose, reliability); **timeline**; **causal map** (multi-factor, weighted links); **argument map** (claim, reasons, evidence, objections; Toulmin slots); annotated text (highlight, gloss, margin note); **comparison table** (two readings or frames side by side) | V7 on every evidence node; V6 structure constraints (every claim has a reason; an objection exists); V8 on warrants |
| **Case-reasoning** | **Illness-script card** (enabling conditions, fault, consequences); problem-representation line with semantic qualifiers; **differential table** (findings × hypotheses, for or against); **issue tree** / IRAC outline; **rule-elements checklist**; fact-pattern matrix (factors × cases, as in CATO); case-comparison table (analogous or distinguishable) | Element coverage (V6); citation check (V7); panel distribution for "how likely or how will it come out" (V9) |
| **Language-use** | Glossed sentence; conjugation or declension table; dialogue role-play card (goal, gap, roles); audio record and playback with waveform; pronunciation contour; vocabulary card with spaced schedule | V1 or V10; morphology; task rubric |
| **Writing** | Draft with comment anchors; **reverse outline**; thesis and goal checklist (product goals as constraints); revision diff view (global or local) | V6 goals; V8 traits; the revision diff classifies global versus local changes |

### 7.4 How misconceptions are encoded
One `WrongModel` record for every domain. The **detector** is a tagged union. This replaces the binary `signature: Executable | RubricSignature` in `system-spec.md` §7.

```ts
WrongModel {
  id, kc, belief, errorKind: 'F1'..'F12',            // §6.3: the repair family follows from errorKind
  plausibleBecause, source: 'catalogued' | 'course_warning' | 'learner_data' | 'inferred', prior,
  detector:
    | { type: 'execute',   fn }                       // answers any instance as the belief would (buggy rule; BUGGY tradition)
    | { type: 'constraint', violates: ConstraintId[] } // shows up as a specific violated constraint (designs, schemas, legal elements)
    | { type: 'pattern',   battery: ProbeId[], fingerprint: Answer[] }   // a synthetic model, identified by a pattern of answers (Vosniadou)
    | { type: 'rubric',    description, positives: Exemplar[], negatives: Exemplar[], judge: CalibrationRef }  // misreadings, reductions, epistemic missteps
    | { type: 'marker',    cues: string[], then: 'rubric' }                // cheap prefilter (agentive verbs in an emergent topic; "it's just opinion")
  separatingProbe: ProbeId,     // the probe on which this model's predicted answer differs from the correct one and every rival's
  repair: MoveTemplate[], recheck: ProbeId[]
}
```

**Which detector, by family:**
- **execute**: computational and formal-quantitative procedures (sign extension, unscaled pointer arithmetic, distributing exponents over addition, unit-less substitution, `*goed` overgeneralization).
- **pattern**: science models and threshold concepts. Infer the posterior over models from the battery's likelihoods; one answer never settles it.
- **constraint**: design and structured artefacts (an entity–relationship schema; an IRAC answer that skips an element; an essay missing a required counterargument).
- **rubric** with **marker** prefilter: textual and case families (source naivety, presentism, single cause, misreading, claim without warrant, premature closure).

**Gate** (extends `system-spec.md` §7 stage 10):
- `execute` and `pattern` detectors must *produce* their signature on the separating probe, distinct from every rival's.
- `rubric` detectors must reach per-criterion calibration (§7.2) on their exemplars.
- A detector that can't be separated is **merged** with its rival or dropped.

The **independent evaluation library** (`system-spec.md` §17) uses the same union, so simulated learners of rubric-signature kinds produce text written to show the signature. Those are harder to make honest; see §9.

### 7.5 Facets of understanding
The engine reasons over E1–E10 (§6.2). The adapter supplies a **facet map**: the domain's own named facets, each mapped to E-families and given a default problem form. The domain names appear on the learner's map and in the tutor's language; the E-families drive the policy.

| Family | Domain facet set (source) | Map to E |
|---|---|---|
| Proof-based math | Mejía-Ramos et al. 2012: meaning of terms; logical status and framework; justification of claims; summarizing high-level ideas; modular structure; transfer of the method; illustrating with examples | E1, E2, E5, E5, E6, E7, E4 |
| Physics and chemistry | Problem categorization by principle; qualitative prediction; quantitative solution with units; model evaluation (where it fails); experiment design (Chi et al. 1981; Schwarz et al. 2009) | E2, E4, E3, E6, E8 |
| History | Seixas & Morton's "Big Six": significance, evidence, continuity and change, cause and consequence, historical perspectives, the ethical dimension [K]; plus Wineburg's sourcing, contextualization and corroboration | E9, E6, E4, E5, E9, E9 |
| Literature | Rainey's practices: seek patterns; identify strangeness; articulate a puzzle; consider possibilities; consider contexts; make a claim [K] | E2, E6, E5, E9, E7, E8 |
| Law | Issue spotting; rule statement; application to the facts; counter-analysis; conclusion with its strength; policy | E2, E1, E3, E9, E10, E5 |
| Medicine | Problem representation; hypothesis generation; data interpretation; differential with justification; management; reflection (structured) | E2, E4, E5, E9, E3, E6 |
| Programming | Trace; explain in plain English; Parsons; write; debug (Xie et al. 2019; [Decomposition §6]) | E4, E5, E3, E8, E6 |
| Languages | Recognize; recall; use in a controlled task; spontaneous use in a communicative task; fluency under time; repair a breakdown (Nation 2007; Canale & Swain 1980) | E1, E1, E3, E8, E3, E6 |
| Writing | Plan to goals; draft; revise globally; evaluate a model text; self-regulate | E8, E8, E6, E6, E10 |

The UbD six facets ([Decomposition §4]) remain the **cross-walk for course authors**: explain = E5, interpret = E5 and E9, apply = E3 and E7, perspective = E9, empathy = E6 applied to a classmate's wrong model, self-knowledge = E10.

### 7.6 Problem forms
The **families** are fixed: they are the E-families. The adapter supplies **templates**: `{ family, regime, prompt pattern, generator, verifier chain, wrong-model hooks, element }`.

| Family | Computational | Formal-quantitative | Science-model | Textual-argumentative | Case-reasoning | Language-use |
|---|---|---|---|---|---|---|
| E2 discriminate | Which construct or instruction applies | Which theorem or method applies; sort problems by principle | Which principle; which model applies | Primary or secondary source; which frame fits | Which tort or diagnosis; key features | Which form or register |
| E3 execute | Write a function | Compute or solve; parametrized instance generator | Solve with units | Build a timeline; extract a claim | Apply a rule to a short fact pattern | Controlled production (cloze, transformation) |
| E4 predict | Trace and predict output | Predict a property; is this conjecture true? | Predict–observe–explain on a simulation | "How would X have responded, given…?" | **Perturb the case** (Script Concordance Test, hypothetical) | Predict meaning from context |
| E5 explain | Explain in plain English | Self-explain proof lines | Explain the mechanism | Causal explanation with sources | Justify with precedent or pathophysiology | Explain a choice of form |
| E6 critique | Debug; find the bug | Validate a proof; find the error in a worked solution | Critique an experiment or model | Source critique; evaluate an interpretation | Find the missed element; reflect on a wrong diagnosis | Correct an erroneous sentence; revise a draft |
| E7 transfer or integrate | Combine KCs in a new program | Unfamiliar method; mixed set | New context; mixed principles | Same concept, new period or text | Atypical case; new jurisdiction | A new situation or genre |
| E8 generate | Write a program | Write a proof (Proof Blocks first) | Build a model | Write an argumentative essay from a document set | A full work-up or issue-spotter answer | Spontaneous conversation; a written task |
| E9 perspective | Compare two designs | Compare two solution methods | Compare two models | Argue the other side; read through a second frame | Opposing counsel; the strongest alternative diagnosis | Re-say it for another audience |

**Generators** are the adapter's main code:
- parametrized instances (computational, quantitative);
- **perturbation of a stored case or document set** (case and textual families);
- the learner's own confusions (any family).

Every generated item passes the gate's verification before use, as `system-spec.md` §7 already requires.

### 7.7 Teaching-move emphasis
These are **priors** for the learning-dynamics model (`system-spec.md` §5). They are multipliers on the prior expected gain of each move family for KCs in this family, and are updated by data. ↑↑ strong emphasis, ↑ some, 0 neutral, ↓ de-emphasised.

| Move | Computational | Formal-quant. | Science-model | Textual-arg. | Case-reasoning | Language-use | Writing |
|---|---|---|---|---|---|---|---|
| Worked example, then fade | ↑↑ | ↑↑ | ↑ | ↑ (model texts) | ↑ (expert work-up) | ↑ | ↑ (mentor text, SRSD modelling) |
| Predict–observe–explain or run the model | ↑↑ | ↑ | ↑↑ | ↑ (counterfactuals) | ↑↑ (perturb the case) | 0 | 0 |
| Compare cases or methods | ↑ | ↑↑ | ↑ | ↑↑ | ↑↑ | ↑ | ↑ |
| Refute; run to contradiction | ↑ | ↑ | ↑↑ | ↑ | ↑ | 0 | 0 |
| Strategy modelling with think-aloud and prompted monitoring | ↑ | ↑↑ (control) | ↑ | ↑↑ (heuristics) | ↑↑ (structured reflection) | ↑ | ↑↑ (SRSD) |
| Argument dialogue or argument map | 0 | ↑ (proof critique) | ↑ | ↑↑ | ↑↑ | 0 | ↑↑ |
| Spaced retrieval of items | ↑ | ↑ | ↑ | ↑ | ↑ | ↑↑ | 0 |
| Interleaved or mixed practice | ↑ | ↑↑ | ↑ | ↑ | ↑↑ | ↑ | 0 |
| Communicative task with corrective prompts | 0 | 0 | 0 | 0 | ↑ (role-play) | ↑↑ | 0 |
| Feedback on a draft, then revise | ↑ (code review) | ↑ (proof drafts) | ↑ | ↑↑ | ↑↑ | ↑ | ↑↑ |
| Isolated rule instruction (grammar-style) | 0 | 0 | 0 | 0 | 0 | ↑ (explicit, in context) | **↓** (−0.32) |

### 7.8 The epistemic profile (new adapter part)
This is the smallest part of the adapter and the one most often missing. Without it, a general tutor defaults to one epistemology everywhere (§2).

```ts
EpistemicProfile {
  warrants: WarrantType[],       // e.g. math: proof, counterexample; history: corroborated sources, context; law: statute, precedent,
                                 // policy; medicine: pathophysiology, epidemiology, guideline; science: data and model fit
  authority: { course: 'scope+notation+emphasis', field: SourceRole[] },   // what outranks what for truth (see system-spec §7)
  disagreement: 'none' | 'methods' | 'interpretations' | 'judgement',    // what experts may legitimately disagree about (sets R4/R5)
  citation: { tutorMustGround: true, verifyExistence: boolean },          // law, history: verify every cited authority (V7)
  stanceTargets: 'evaluativist',                                          // Kuhn: never absolutist on R4, never multiplist on R1
  reading: string[]                                                       // expert reading moves to model (Shanahan & Shanahan; Wineburg)
}
```

### 7.9 Adapter families to build, and in what order
| # | Family | Covers | Main verifiers | New engineering |
|---|---|---|---|---|
| A1 | **Computational** | Programming, systems, digital logic, databases | V2, V5, V1 | Exists (C and RISC-V runners); add property tests and Parsons DAGs |
| A2 | **Formal-quantitative** | Math, physics, chemistry, statistics, quantitative economics | V3, V4, V5; V8 restricted to proof facets | CAS and units service; proof-block DAGs; buggy-rule library for algebra |
| A3 | **Textual-argumentative** | History, literature, philosophy, social science, essays anywhere | V7, V6, V8 | Source-grounding service; argument-map pipeline; judge-calibration harness (shared with every family) |
| A4 | **Case-reasoning** | Medicine, law, business cases, design reviews | V7 (citations), V6 (elements), V9, V8 | Script and rule objects; perturbation generator; panel store |
| A5 | **Language-use** | Second-language courses; also oral presentation | V1, V10, V8 (task rubrics) | ASR-confidence gating; morphology; dialogue-task cards |

`system-spec.md` §9 names the first three ("programming and systems", "math", "a rubric-judge adapter"). This brief splits the third: the **judge-calibration harness is shared infrastructure**, used by every family for E5, E6 and E9 answers, and the **textual-argumentative adapter** adds source grounding and argument structure on top of it. **A4 is the held-out generality test** (§8).

### 7.10 Adding a domain: the checklist, and the rule that proves generality
1. Pick the family, or families, from §7.9. A new family is justified only if its **verification** differs from every existing family's.
2. Fill the epistemic profile (§7.8) and the facet map (§7.5).
3. Register element kinds (§7.3), problem templates with generators (§7.6), and detector types (§7.4).
4. Seed the move-emphasis priors (§7.7).
5. Calibrate judges for the family's criteria (§7.2), with 60–100 expert labels per criterion.
6. Run the course-model gate and the ablation on a real course.

**The generality rule: adding a domain must require zero changes to the core.** A core change made "for this subject" is a bug in the core's abstraction and must be generalized before it merges. Track adapter size and authoring hours per family as the cost of generality.

## 8. Deliverable 3: validation plan

**The claim to test:** one engine, with a course model built from the materials plus an adapter, teaches courses of different **domain types** about equally well. "About equally" means no metric collapses in any domain type, and an untouched domain type works with no core changes.

### 8.1 The courses
They are chosen to span all five regimes (§6.1c), four of the five adapter families (A5 comes with the stretch course C5), four different epistemologies (empirical model, deductive proof, interpretation of sources, authority and precedent), and to have **an external instrument or a credible blind-grading protocol**.

| # | Course (suggested sources) | Domain type | Regimes | Adapters | External measure of learning | Seed wrong models from |
|---|---|---|---|---|---|---|
| **C0** | **CS 3410** (existing fixture; regression only) | Computational systems | R1–R3 | A1, plus the judge for "why" items | Past prelims, blind-graded | [Decomposition §6.5] |
| **C1** | **Calculus-based mechanics** (an open course with exams and solutions, e.g. MIT OCW 8.01) | Quantitative science with conceptual change | R1, R2; R4 for explanations | A2, plus the science-model elements | **Force Concept Inventory** (Hestenes, Wells & Swackhamer 1992, [doi:10.1119/1.2343497](https://doi.org/10.1119/1.2343497)), normalized gain against Hake's 0.23 (traditional) and 0.48 (interactive-engagement) benchmarks; course-style problems | Force and motion misconceptions (FCI taxonomy); Chi's direct/emergent schemas for energy and heat |
| **C2** | **Proof-based discrete math** (e.g. MIT OCW 6.042J/6.1200J *Mathematics for Computer Science*: free text, problem sets, exams with solutions) | Formal and deductive | R2 (proof order, CAS), R3, R4 (proof quality) | A2 (Proof Blocks, CAS), plus the judge restricted to proof facets | **Validated proof-comprehension tests** (Mejía-Ramos, Lew, de la Torre & Weber 2017, [doi:10.1080/14794802.2017.1325776](https://doi.org/10.1080/14794802.2017.1325776)); blind-graded proofs on unseen theorems | Proof by example; converse errors; induction-step misuse; Selden & Selden's surface validation; Schoenfeld's control failures |
| **C3** | **History survey with a primary-source reader** (any university survey whose documents are available) | Interpretive and argumentative | R1 (facts); R4 dominant | A3 | **History Assessments of Thinking**, as a floor (Smith, Breakstone & Wineburg 2018, *Cognition and Instruction*, [doi:10.1080/07370008.2018.1499646](https://doi.org/10.1080/07370008.2018.1499646)); **document-based essays on unseen document sets**, blind-scored by two historians (sourcing, contextualization, corroboration, argument, accuracy) | §2.2 catalogue: source naivety, presentism, single cause, misreading, claim without warrant, myside bias |
| **C4** | **Held out: first-year Torts or Contracts** (an open casebook such as CALI eLangdell or H2O; law schools' public exam archives with model answers). Alternative if a medical-education partner exists: a clinical-reasoning or pathophysiology block | Case reasoning with authority | R3 (elements), R4 (analysis), R5 (close calls) | A4, built **after** the core is frozen | **Blind-graded issue-spotter hypotheticals** using the instructors' own rubrics. Medical alternative: Script Concordance Test plus key-feature cases | Missing element; conclusory analysis; rule stated but not applied; fabricated authority; premature closure |
| C5 | *Stretch, later:* elementary Spanish | Language use (voice-native) | R1, R2, R4 | A5 | Blind oral-proficiency ratings; spontaneous-production rubric | Overgeneralization; L1 transfer; avoidance |

**Why these four.** C1 against C2 separates empirical *models* from deductive *proof* inside STEM. C3 is the domain type where generic LLM grading is weakest (Golchin et al. 2024) and where the epistemic regime differs most. C4 tests generality the honest way: **held out**. Its adapter is written only after the core is frozen on C0–C3, and the core may not change for it.

### 8.2 Phases and what counts as success
Thresholds are pre-registered. "No collapse" means that for every metric, **the worst course scores at least 0.8 × the best course**, unless the shortfall is explained by a measured ceiling, such as expert–expert agreement in C3.

| Phase | What runs | Success |
|---|---|---|
| **A. Course model** | `system-spec.md` §7 pipeline on each course; the seven gate checks; the ablation (model + course model against model + raw materials) on course-specific and teaching probes | Gate passes in every course. **Ablation advantage ≥ 10 points in every course**, with general-knowledge probes excluded. 100% of R1–R2 answers machine-verified. ≥ 95% of quotes and citations verified by V7, and **zero unverifiable citations** in C3 and C4. Each spine topic has ≥ 3 wrong models with provenance, each separable by its probe. |
| **B. Verifiers and judges** | The §7.2 protocol per rubric criterion: gold sets labelled by two experts per course, bias probes, perturbation sets | Every **core** criterion (those the tutor issues verdicts on) reaches agreement ≥ expert–expert agreement and κ ≥ 0.6. False accepts on the perturbation set: **≤ 2%** for R1–R3, **≤ 10%** for R4 criteria. Bias probes flip < 5%. Abstention ≤ 25%; above that the domain is under-instrumented and the gap is reported. |
| **C. Simulated learners** | The independent wrong-model library (executable, pattern and rubric kinds); personas; randomized learning-dynamics worlds including a null world (`system-spec.md` §17 levels 3–4) | Planted wrong model identified within 3 probes: **≥ 85%** for execute and pattern kinds, **≥ 70%** for rubric kinds. Move-rubric gate pass rate ≥ 95% per course. Expectations asserted by the tutor rather than produced by the learner ≤ 30%. No spurious gains in the null world. The swap test is specific in every course. No collapse across courses. |
| **D. Expert transcript review** | Two blind domain experts per course; 20 sessions per course (simulated, then real); [Tutoring §5] rubric plus a **domain-fidelity** sheet: correctness, discipline-appropriate warrants, **epistemic honesty** (invariant 7), no fabricated sources | Harmful errors (a wrong verdict stated, a false claim taught, a fabricated source) **≤ 1 per 10 sessions** per course. Epistemic-honesty violations ≤ 5% of turns. Experts would send the tutor's turn unedited **≥ 75%** of the time (the LearnLM–Eedi trial approved 76.4% of drafts; [Tutoring §2.4]). |
| **E. Human learning pilot** | Per course, about 40 consenting students, randomized 1:1. **Control**: the same base model, the same materials, told to tutor well (a pedagogical-instruction baseline, LearnLM-style), with no course model and no adapter. Three 45-minute sessions over two weeks; a delayed (one-week) unaided transfer test on the external measure (§8.1) | (1) **No harm anywhere**: the lower 90% CI bound of d exceeds −0.2 in every course. (2) **d ≥ 0.3 in at least 3 of 4 courses.** (3) **No collapse**: the smallest course effect is at least half the largest. (4) **Held-out C4** meets (1) and has a point estimate d ≥ 0.2. Power is honest: 40 per course detects about d = 0.9 at 80%. The pilot detects *direction and collapse*. A hierarchical model pooled across courses estimates the common effect and the variation between domains. The confirmatory study comes after. |
| **F. Cost of generality** | Build C4's adapter and course model after freezing the core | **Zero core diffs.** Adapter size and expert hours recorded. Calibration labels ≤ about 8 expert-hours per rubric family. Materials to gate pass in ≤ 1 day of machine time. |

### 8.3 What would falsify the generality claim, and what to do then
- **The judge can't reach calibration on C3's or C4's core criteria.** Then Plato must not issue verdicts there. It falls back to discussion-only moves plus source-verified facts, and says so. The generality claim shrinks to "general where verifiable", reported honestly.
- **Effects are positive in C1 and C2 but null or negative in C3.** Then the engine's moves are STEM-shaped. Inspect the move-emphasis priors (§7.7) and the facet map, and check whether Socratic neutrality drifted into multiplism or premature verdicts drifted into absolutism (invariant 7).
- **C4 needs core changes.** Then the abstraction leaked. Generalize the change, rerun C0–C3 for regressions, then rerun C4 with a *different* held-out course (the medical alternative).
- **Simulated-learner results disagree with the human pilot** in one domain type. Then the rubric-signature simulators are not honest for that type. Recalibrate them on the pilot transcripts before using them for development there.

### 8.4 Where this sits in the build plan
- `system-spec.md` §18 P1–P2 (course model, evals) run on **C0–C3**, giving Phases A–C.
- P3–P5 freeze the core.
- **C4 enters only after the freeze**, for Phase F, then Phases A–D.
- Phase E (humans) belongs to P6. The return to CS 3410 for real use comes *after* the four-course pilot, as the user directed (memory: general system first).

## 9. Open questions and risks
1. **Honest simulated learners for rubric-signature misconceptions.** An executable wrong model is honest by construction; a "presentist" simulated student is an LLM performing presentism. Mitigation:
   - seed the simulators with human-written exemplars;
   - check the simulator's outputs with the *calibrated* signature detector, so the tutor's detector is never the grader of its own test;
   - recalibrate on real transcripts (Phase E).

   Until then, treat the C3 and C4 simulated-learner results as provisional.
2. **Expert distributions (R5) without experts.** Several samples from one model are correlated and overstate consensus. Start R5 items as low-trust, and prefer human panels. A course's own past exams and model answers can seed small panels, for example several instructors' published answers to the same hypothetical.
3. **The course's thesis against the field.** In interpretive courses the instructor may argue a contested position. The rule of authority says the course decides *scope and emphasis*. The tutor presents the course's argument as the course's ("this course argues…; other historians argue…") and grades the learner on argument quality, not on agreement with the instructor. Where the course's own assessment rewards its thesis, the exam model (`system-spec.md` §7) records that, and Plato says so openly.
4. **Thin evidence where we lean hardest outside STEM:**
   - CFT interventions (weak);
   - argumentation as a way to learn content (weak; Wecker & Fischer);
   - case-based learning in medicine (weak; BEME);
   - law-school pedagogy (mostly natural experiments);
   - writing meta-analyses from school-age students applied to undergraduates (extrapolation).

   The move-emphasis priors in §7.7 for these families are therefore **weakly held**, and real outcomes should move them quickly.
5. **Regime labels can be wrong.** Some "R4" items have a key (the instructor grades one reading as right); some "R1" items are contested (a disputed date or attribution). Judge–learner disputes and expert review feed regime relabelling (§7.2 step 10).
6. **Voice-specific costs vary by domain.**
   - Math notation spoken aloud is ambiguous, so equations belong on the page.
   - Long sources must be on the page, never read aloud ([Voice]).
   - In languages, recognition errors *are* verdict errors, hence the ASR-confidence gate.
   - Interpretive discussions are long-turn and suit voice; proofs and code are page-bound.
7. **Artefacts that span sessions.** Drafts, problem sets and case work-ups persist and are compared across versions, because the evidence in writing is the *revision* (§3.5). The session model in `system-spec.md` §14 needs an "artefact" object with version history. This is a small core addition, and domain-general.
8. **Professional-domain safety.** Medical and legal courses are for learning, not advice. The epistemic profile carries a scope statement, and the tutor redirects personal medical or legal questions.
9. **Latency of judges.** Narrow criteria, the verifier chain (judges only when earlier checks can't decide) and the neutral first reply keep judge latency off the critical path (`system-spec.md` §15–16).
10. **Unknown: does LLM pedagogical skill vary by subject?** Published evaluations aggregate across subjects (§5.2). Plato's stratified Phase D is, as far as I found, among the first checks of this. Expect surprises, especially in C3 and C4.

---

## References
Grouped by section. Tags as in the header. ERIC IDs (EJ/ED) link to `https://eric.ed.gov/?id=<ID>`.

**Kinds of domain (§1).**
- Simon, H. A. (1973). The structure of ill structured problems. *Artificial Intelligence* 4. doi:10.1016/0004-3702(73)90011-8
- Jonassen, D. H. (2000). Toward a design theory of problem solving. *ETR&D* 48(4). EJ620216
- Lynch, C., Ashley, K. D., Pinkwart, N., & Aleven, V. (2009). Concepts, structures, and goals: Redefining ill-definedness. *IJAIED* 19. EJ902551
- Mitrovic, A., & Weerasinghe, A. (2009). Revisiting ill-definedness and the consequences for ITSs. AIED 2009. doi:10.3233/978-1-60750-028-5-375
- Bratt, E. O. (2009). Intelligent tutoring for ill-defined domains in military simulation-based training. *IJAIED* 19. EJ913337
- Goldman, S. R., Britt, M. A., Brown, W., Cribb, G., et al. (2016). Disciplinary literacies and learning to read for understanding. *Educational Psychologist* 51(2). EJ1100583
- Shanahan, T., & Shanahan, C. (2008). Teaching disciplinary literacy to adolescents. *Harvard Educational Review* 78(1). EJ791477
- Chi, M. T. H., Feltovich, P. J., & Glaser, R. (1981). Categorization and representation of physics problems by experts and novices. *Cognitive Science* 5. doi:10.1207/s15516709cog0502_2
- Spiro, R. J., Coulson, R. L., Feltovich, P. J., & Anderson, D. K. (1988). Cognitive flexibility theory: Advanced knowledge acquisition in ill-structured domains. Tech. Rep. 441. ED302821
- Spiro, R. J., Feltovich, P. J., Coulson, R. L., & Anderson, D. K. (1989). Multiple analogies for complex concepts. In *Similarity and Analogical Reasoning*. doi:10.1017/cbo9780511529863.023
- Feltovich, P. J., Hoffman, R. R., Woods, D., & Roesler, A. (2004). Keeping it too simple: How the reductive tendency affects cognitive engineering. *IEEE Intelligent Systems* 19(6). doi:10.1109/mis.2004.14
- Jacobson, M. J., & Spiro, R. J. (1995). Hypertext learning environments, cognitive flexibility, and the transfer of complex knowledge. *J. Educational Computing Research* 12(4). EJ510379
- Rourke, A., & Sweller, J. (2009). The worked-example effect using ill-defined problems. *Learning and Instruction* 19. EJ826508
- Kyun, S., Kalyuga, S., & Sweller, J. (2013). The effect of worked examples when learning to write essays in English literature. *J. Experimental Education* 81. EJ1011878
- Mitrovic, A., Martin, B., & Suraweera, P. (2007). Intelligent tutors for all: The constraint-based approach. *IEEE Intelligent Systems* 22(4). doi:10.1109/mis.2007.74
- Le, N.-T., & Menzel, W. (2009). Using weighted constraints to diagnose errors in logic programming. *IJAIED* 19. EJ913340
- Fournier-Viger, P., Nkambou, R., & Mephu Nguifo, E. (2010). Building intelligent tutoring systems for ill-defined domains. doi:10.1007/978-3-642-14363-2_5
- Weerasinghe, A., Mitrovic, A., & Martin, B. (2009). Towards individualized dialogue support for ill-defined domains. *IJAIED* 19. EJ913338

**Correctness, misconceptions, argument (§2).**
- Romberg, J., Maurer, M., Wachsmuth, H., & Lapesa, G. (2025). Towards a perspectivist turn in argument quality assessment. arXiv:2502.14501
- Kuhn, D., Cheney, R., & Weinstock, M. (2000). The development of epistemological understanding. *Cognitive Development* 15. doi:10.1016/S0885-2014(00)00030-7
- Kuhn, D. (1991). *The Skills of Argument*. Cambridge UP. [K]
- Stoel, G. L., van Drie, J. P., & van Boxtel, C. A. M. (2017). Effects of explicit teaching… on students' ability to reason causally in history. *J. Educational Psychology* 109. EJ1136550
- Wineburg, S. (1991). Historical problem solving. *J. Educational Psychology* 83. EJ436869
- Wineburg, S. (2001). *Historical Thinking and Other Unnatural Acts*. ED457103
- Lee, P., & Ashby, R. (2000). Progression in historical understanding among students ages 7–14. In *Knowing, Teaching, and Learning History*. [K]
- Reisman, A. (2012). Reading like a historian. *Cognition and Instruction* 30(1). doi:10.1080/07370008.2011.634081
- De La Paz, S., & Felton, M. K. (2010). Reading and writing from multiple source documents in history. *Contemporary Educational Psychology* 35. EJ890836
- Peskin, J. (1998). Constructing meaning when reading poetry: An expert–novice study. *Cognition and Instruction* 16. EJ574160
- Rainey, E. C. (2017). Disciplinary literacy in English language arts. *Reading Research Quarterly* 52. EJ1124451
- Toulmin, S. (1958). *The Uses of Argument*. Cambridge UP. [K]
- Osborne, J., Erduran, S., & Simon, S. (2004). Enhancing the quality of argumentation in school science. *JRST* 41. EJ760078
- Erduran, S., Simon, S., & Osborne, J. (2004). TAPping into argumentation. *Science Education* 88. EJ759893
- Sampson, V., & Clark, D. B. (2008). Assessment of the ways students generate arguments in science education. *Science Education* 92. EJ790461
- Asterhan, C. S. C., & Schwarz, B. B. (2016). Argumentation for learning. *Educational Psychologist* 51. EJ1100579
- Wecker, C., & Fischer, F. (2014). Where is the evidence? A meta-analysis on the role of argumentation for the acquisition of domain-specific knowledge in CSCL. *Computers & Education* 75. doi:10.1016/j.compedu.2014.02.016
- Wolfe, C. R., & Britt, M. A. (2008). The locus of the myside bias in written argumentation. *Thinking & Reasoning* 14. doi:10.1080/13546780701527674
- Wolfe, C. R., Britt, M. A., & Butler, J. A. (2009). Argumentation schema and the myside bias in written argumentation. *Written Communication* 26. EJ833731
- Abrami, P. C., et al. (2015). Strategies for teaching students to think critically: A meta-analysis. *RER* 85. doi:10.3102/0034654314551063
- van Gelder, T., Bissett, M., & Cumming, G. (2004). Cultivating expertise in informal reasoning. *Canadian J. Experimental Psychology* 58. doi:10.1037/h0085794
- Harrell, M. (2011). Argument diagramming and critical thinking in introductory philosophy. *HERD* 30. EJ923818
- Dwyer, C. P., Hogan, M. J., & Stewart, I. (2012). An evaluation of argument mapping… *Metacognition and Learning* 7. EJ984318; (2013) *Thinking Skills and Creativity*. EJ997893
- Cullen, S., Fan, J., van der Brugge, E., & Elga, A. (2018). Improving analytical reasoning and argument understanding. *npj Science of Learning* 3. doi:10.1038/s41539-018-0038-5
- Wachsmuth, H., et al. (2017). Computational argumentation quality assessment in natural language. EACL. [K]
- Mirzakhmedova, N., Gohsen, M., Chang, C. H., & Stein, B. (2024). Are large language models reliable argument quality annotators? arXiv:2404.09696
- Toledo, A., et al. (2019). Automatic argument quality assessment: New datasets and methods. arXiv:1909.01007

**Subject-specific (§3).**
- Schoenfeld, A. H. (1985). *Mathematical Problem Solving*. Academic Press. [K]; (1992/2016) Learning to think mathematically. *J. Education* 196(2). doi:10.1177/002205741619600202
- Rittle-Johnson, B., Siegler, R. S., & Alibali, M. W. (2001). *J. Educational Psychology* 93. EJ638748
- Rittle-Johnson, B., Schneider, M., & Star, J. R. (2015). Not a one-way street. *Educational Psychology Review* 27. doi:10.1007/s10648-015-9302-x
- Rittle-Johnson, B., & Star, J. R. (2007). Does comparing solution methods facilitate conceptual and procedural knowledge? *J. Educational Psychology* 99. EJ772031
- Selden, A., & Selden, J. (2003). Validations of proofs considered as texts. *JRME* 34. EJ667036
- Weber, K. (2001). Student difficulty in constructing proofs. *ESM* 48. doi:10.1023/A:1015535614355
- Mejía-Ramos, J. P., Fuller, E., Weber, K., Rhoads, K., & Samkoff, A. (2012). An assessment model for proof comprehension. *ESM* 79. doi:10.1007/s10649-011-9349-7
- Mejía-Ramos, J. P., Lew, K., de la Torre, J., & Weber, K. (2017). Developing and validating proof comprehension tests. *Research in Mathematics Education* 19. doi:10.1080/14794802.2017.1325776
- Hodds, M., Alcock, L., & Inglis, M. (2014). Self-explanation training improves proof comprehension. *JRME* 45. EJ1028348
- Poulsen, S., Viswanathan, M., Herman, G. L., & West, M. (2022). Proof Blocks. ITiCSE. doi:10.1145/3502718.3524774; arXiv:2106.11032. Poulsen, Gertner, Cosman & West (2022). arXiv:2211.09609. Poulsen, Kulkarni, Herman & West (2022). arXiv:2204.04196
- Vosniadou, S., & Skopeliti, I. (2014). Conceptual change from the framework theory side of the fence. *Science & Education* 23. EJ1040092
- Chi, M. T. H. (2005). Commonsense conceptions of emergent processes. *J. Learning Sciences* 14. EJ724968
- Chi, M. T. H., Roscoe, R. D., Slotta, J. D., Roy, M., & Chase, C. C. (2012). Misconceived causal explanations for emergent processes. *Cognitive Science* 36. EJ990900
- Slotta, J. D., & Chi, M. T. H. (2006). Helping students understand challenging topics in science through ontology training. *Cognition and Instruction* 24. EJ736290
- Hestenes, D. (1987). Toward a modeling theory of physics instruction. *Am. J. Physics* 55. doi:10.1119/1.15129
- Wells, M., Hestenes, D., & Swackhamer, G. (1995). A modeling method for high school physics instruction. *Am. J. Physics* 63. doi:10.1119/1.17849
- Hake, R. R. (1998). Interactive-engagement versus traditional methods. *Am. J. Physics* 66. doi:10.1119/1.18809
- Brewe, E., et al. (2010). Toward equity through participation in Modeling Instruction. *PRST-PER* 6. doi:10.1103/PhysRevSTPER.6.010106
- Schwarz, C. V., et al. (2009). Developing a learning progression for scientific modeling. *JRST* 46. EJ850692
- Windschitl, M., Thompson, J., & Braaten, M. (2008). Beyond the scientific method. *Science Education* 92. EJ809101
- Kim, S. K., & Webb, S. (2022). The effects of spaced practice on second language learning: A meta-analysis. *Language Learning* 72. doi:10.1111/lang.12479
- Canale, M., & Swain, M. (1980). Theoretical bases of communicative approaches. *Applied Linguistics* 1. doi:10.1093/applin/I.1.1
- Nation, P. (2007). The four strands. *Innovation in Language Learning and Teaching* 1. doi:10.2167/illt039.0
- Norris, J. M., & Ortega, L. (2000). Effectiveness of L2 instruction. *Language Learning* 50. EJ611436
- Spada, N., & Tomita, Y. (2010). Interactions between type of instruction and type of language feature. *Language Learning* 60. doi:10.1111/j.1467-9922.2010.00562.x
- Lyster, R., & Saito, K. (2010). Oral feedback in classroom SLA: A meta-analysis. *SSLA* 32. EJ892626
- Bibauw, S., Van den Noortgate, W., François, T., & Desmet, P. (2022). Dialogue systems for language learning: A meta-analysis. *Language Learning & Technology* 26.
- Bryfonski, L., & McKay, T. H. (2019). TBLT implementation and evaluation: A meta-analysis. *Language Teaching Research* 23. doi:10.1177/1362168817744389
- DeKeyser, R. (2007). Skill acquisition theory. In *Theories in SLA*. [K]; Lightbown, P. M. (2008). Transfer appropriate processing. [K]; Wong, W., & VanPatten, B. (2003). The evidence is IN: Drills are OUT. *Foreign Language Annals* 36. [K]
- Graham, S., & Perin, D. (2007). A meta-analysis of writing instruction for adolescent students. *J. Educational Psychology* 99. EJ772018
- Graham, S., Hebert, M., & Harris, K. R. (2015). Formative assessment and writing: A meta-analysis. *Elementary School Journal* 115. EJ1068976
- Losinski, M., et al. (2014). SRSD for students with EBD: A meta-analysis. *Behavioral Disorders*. EJ1087296
- Cho, K., & MacArthur, C. (2010). Student revision with peer and expert reviewing. *Learning and Instruction* 20. EJ878565
- Fleckenstein, J., Liebenow, L. W., & Meyer, J. (2023). Automated feedback and writing: A multi-level meta-analysis. *Frontiers in AI* 6. doi:10.3389/frai.2023.1162454
- Steiss, J., et al. (2024). Comparing the quality of human and ChatGPT feedback of students' writing. *Learning and Instruction* 91. doi:10.1016/j.learninstruc.2024.101894
- Meyer, J., et al. (2024). Using LLMs to bring evidence-based feedback into the classroom. *Computers & Education: AI* 6. doi:10.1016/j.caeai.2023.100199
- Sommers, N. (1980/1982). Revision strategies of student writers and experienced adult writers. ED220839
- Bereiter, C., & Scardamalia, M. (1987). *The Psychology of Written Composition*. Erlbaum. [K]
- Charlin, B., Boshuizen, H. P. A., Custers, E. J., & Feltovich, P. J. (2007). Scripts and clinical reasoning. *Medical Education* 41. doi:10.1111/j.1365-2923.2007.02924.x
- Schmidt, H. G., & Rikers, R. M. J. P. (2007). How expertise develops in medicine. *Medical Education* 41. doi:10.1111/j.1365-2923.2007.02915.x
- Mamede, S., Schmidt, H. G., & Penaforte, J. C. (2008). Effects of reflective practice on the accuracy of medical diagnoses. *Medical Education* 42. doi:10.1111/j.1365-2923.2008.03030.x
- Mamede, S., van Gog, T., Moura, A. S., et al. (2012). Reflection as a strategy to foster medical students' acquisition of diagnostic competence. *Medical Education* 46. doi:10.1111/j.1365-2923.2012.04217.x
- Norman, G. R., et al. (2017). The causes of errors in clinical reasoning. *Academic Medicine* 92. doi:10.1097/ACM.0000000000001421
- Hatala, R. M., Brooks, L. R., & Norman, G. R. (2003). Practice makes perfect: mixed practice in ECG interpretation. *AHSE* 8. doi:10.1023/A:1022687404380
- Moghadami, M., et al. (2021). Teaching clinical reasoning by illness script method: an RCT. *BMC Medical Education* 21. PMID 33531017
- Lubarsky, S., et al. (2013). Script concordance testing: AMEE Guide No. 75. *Medical Teacher* 35. doi:10.3109/0142159X.2013.760036
- Page, G., & Bordage, G. (1995). The Medical Council of Canada's key features project. *Academic Medicine* 70. doi:10.1097/00001888-199502000-00012
- Thistlethwaite, J. E., et al. (2012). The effectiveness of case-based learning in health professional education: BEME Guide 23. *Medical Teacher* 34. PMID 22578051
- Payne, V. L., et al. (2009). Limited-enforcement ITS in dermatopathology. *AI in Medicine*. PMID 19782544; El Saadawi, G. M., et al. (2010). *AHSE*. PMID 19434508; Feyzi-Behnagh, R., et al. (2014). *Instructional Science*. PMID 24532850
- Sullivan, W. M., et al. (2007). *Educating Lawyers* (Carnegie Foundation). [K]
- Aleven, V. (2003). Using background knowledge in case-based legal reasoning (CATO). *Artificial Intelligence* 150. doi:10.1016/S0004-3702(03)00105-X
- Pinkwart, N., Ashley, K., Lynch, C., & Aleven, V. (2009). Evaluating an ITS for making legal arguments with hypotheticals (LARGO). *IJAIED* 19. doi:10.3233/IRG-2009-19(4)05
- Schwarcz, D., & Farganis, D. (2017). The impact of individualized feedback on law student performance. *J. Legal Education* 67(1). doi:10.2139/ssrn.2772393
- Choi, J. H., Hickman, K. E., Monahan, A., & Schwarcz, D. (2023). ChatGPT goes to law school. *J. Legal Education*. doi:10.2139/ssrn.4335905

**Architectures (§4).**
- Sottilare, R., Brawner, K., Goldberg, B., & Holden, H. (2017). The Generalized Intelligent Framework for Tutoring (GIFT). doi:10.1201/9781315583655-20
- Ragusa, C., Hoffman, M., & Leonard, J. (2013). Unwrapping GIFT: A primer on developing with the Generalized Intelligent Framework for Tutoring. CEUR Vol-1009, http://ceur-ws.org/Vol-1009/0702.pdf
- Aleven, V., McLaren, B. M., Sewall, J., & Koedinger, K. R. (2009). A new paradigm for ITS: Example-tracing tutors. *IJAIED* 19. EJ902546
- Aleven, V., McLaren, B. M., Sewall, J., van Velsen, M., et al. (2016). Example-tracing tutors: Intelligent tutor development for non-programmers. *IJAIED* 26. EJ1091177
- Matsuda, N., Cohen, W. W., & Koedinger, K. R. (2015). Teaching the teacher: Tutoring SimStudent. *IJAIED* 25. EJ1049511
- Graesser, A. C. (2016). Conversations with AutoTutor help students learn. *IJAIED* 26. EJ1091170
- Cai, Z., Gong, Y., Qiu, Q., Hu, X., et al. (2016). Making AutoTutor agents smarter. IVA 2016. ED617867
- Forsyth, C. M., et al. (2013). Operation ARIES!… *JEDM*. EJ1115374
- Graesser, A. C., Hu, X., Nye, B. D., VanLehn, K., et al. (2018). ElectronixTutor. *International Journal of STEM Education* 5. EJ1181935
- Pal Chowdhury, S., Zouhar, V., & Sachan, M. (2024). AutoTutor meets large language models. arXiv:2402.09216
- Heffernan, N. T., & Heffernan, C. L. (2014). The ASSISTments ecosystem. *IJAIED* 24. EJ1042147
- Baral, S., et al. (2021). Improving automated scoring of student open responses in mathematics. EDM. ED615565; Botelho, A., et al. (2023). *JCAL*. EJ1378575
- Koedinger, K. R., Booth, J. L., & Klahr, D. (2013). Instructional complexity and the science to constrain it. *Science* 342. doi:10.1126/science.1238056
- Wylie, R., Koedinger, K. R., & Mitamura, T. (2009). Is self-explanation always better? The effects of adding self-explanation prompts to an English grammar tutor. CogSci 2009. [K]; Wylie, R., et al. (2011). AIED. doi:10.1007/978-3-642-21869-9_110
- Koedinger, K. R., Carvalho, P. F., Liu, R., & McLaughlin, E. A. (2023). An astonishing regularity in student learning rate. *PNAS* 120(13). Preprint doi:10.31234/osf.io/pxsfh
- Cen, H., Koedinger, K., & Junker, B. (2006). Learning factors analysis. ITS 2006. doi:10.1007/11774303_17
- Koedinger, K. R., Stamper, J. C., McLaughlin, E. A., & Nixon, T. (2013). Using data-driven discovery of better student models to improve student learning. AIED. doi:10.1007/978-3-642-39112-5_43
- Goodell, J., & Kolodner, J. (Eds.) (2022). *Learning Engineering Toolkit*. Routledge. [K]

**LLM era (§5).**
- Schmucker, R., Xia, M., Azaria, A., & Mitchell, T. (2023/2024). Ruffle&Riley. arXiv:2310.01420; arXiv:2404.17460
- Wang, J., Macina, J., Daheim, N., Pal Chowdhury, S., & Sachan, M. (2024). Book2Dial. arXiv:2403.03307
- Chevalier, A., et al. (2024). Language models as science tutors (TutorEval/TutorChat). arXiv:2402.11111
- Wei, Y., Carvalho, P., & Stamper, J. (2025). KCluster. arXiv:2505.06469
- Wang, C., Lin, J., & Koedinger, K. R. (2025). Leveraging LLMs for identifying knowledge components. arXiv:2511.09935
- Duan, Z., et al. (2026). Using LLMs for KC-level correctness labeling in open-ended coding problems. arXiv:2602.17542
- Weitekamp, D., Siddiqui, M. N., & MacLellan, C. J. (2025). TutorGym. arXiv:2505.01563
- LearnLM Team (2024). LearnLM: Improving Gemini for learning. arXiv:2412.16429; Jurenka, I., et al. (2024). arXiv:2407.12687; LearnLM Team (2025). Evaluating Gemini in an arena for learning. arXiv:2505.24477
- Srinivasa, R. S., et al. (2025). TutorBench. arXiv:2510.02663
- Lelièvre, M., et al. (2025). Benchmarking the pedagogical knowledge of LLMs. arXiv:2506.18710
- Golchin, S., Garuda, N., Impey, C., & Wenger, M. (2024). Grading massive open online courses using LLMs. arXiv:2406.11102
- Dahl, M., Magesh, V., Suzgun, M., & Ho, D. E. (2024). Large legal fictions. arXiv:2401.01301
- Magesh, V., et al. (2024). Hallucination-free? Assessing the reliability of leading AI legal research tools. arXiv:2405.20362
- Taneja, K., et al. (2024). Jill Watson: A virtual teaching assistant powered by ChatGPT. arXiv:2405.11070

**Calibration (§7).**
- Zheng, L., et al. (2023). Judging LLM-as-a-judge with MT-Bench and Chatbot Arena. arXiv:2306.05685
- Hashemi, H., Eisner, J., Rosset, C., & Van Durme, B. (2024). LLM-Rubric. arXiv:2501.00274
- Angelopoulos, A. N., Bates, S., Fannjiang, C., Jordan, M. I., & Zrnic, T. (2023). Prediction-powered inference. arXiv:2301.09633 (*Science* 382)
- Linacre, J. M. (1989). *Many-Facet Rasch Measurement*; Eckes, T. (2011). *Introduction to Many-Facet Rasch Measurement*. [K]
- Pollitt, A. (2012). The method of adaptive comparative judgement. *Assessment in Education* 19. [K]

**Validation instruments (§8).**
- Hestenes, D., Wells, M., & Swackhamer, G. (1992). Force Concept Inventory. *The Physics Teacher* 30. doi:10.1119/1.2343497
- Smith, M., Breakstone, J., & Wineburg, S. (2018/2019). History assessments of thinking: A validity study. *Cognition and Instruction*. doi:10.1080/07370008.2018.1499646
- Kestin, G., Miller, K., et al. (2024/2025). AI tutoring outperforms in-class active learning. Preprint doi:10.21203/rs.3.rs-4243877/v1 (*Scientific Reports* 2025)
