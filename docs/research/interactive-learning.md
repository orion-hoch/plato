# Interactive elements and generative activities: domain-general patterns, the evidence, and one element schema for Plato's page

Research brief for Plato, an AI voice tutor with a shared page, meant for **any course**. Question: which interactive representations (simulators, manipulatives, visualizers, maps) and which generative activities (predicting, building, comparing, teaching, drawing) build real understanding, and how should a voice tutor run them? Part I gives seven domain-general patterns with equivalent elements for math, physics, chemistry and biology, economics, and history and literature. Part II holds the evidence, worked on the current test case, Cornell CS 3410 (systems). Part III is the CS 3410 catalogue and three scripted episodes. Part IV is the general element schema the page should implement once, for any subject.

## Contents
- 0. The short version
- **Part I. Seven domain-general patterns** (A engagement ladder · B runnable model · C predict–observe–explain · D construct/build · E compare and contrast · F learning by teaching · G drawing to learn)
- **Part II. Evidence by source, worked on CS 3410**: 1 program and notional-machine visualization · 2 simulators and manipulatives · 3 activity formats · 4 learning by teaching · 5 generative drawing and mapping · 6 explorable explanations
- **Part III. The CS 3410 test case**: 7 catalogue of elements (today versus new) · 8 three scripted mini-episodes
- **Part IV. The general element schema** (9)

**How to read this brief**
- **Evidence grades.** **Strong**: meta-analyses or many replicated controlled studies, including classroom ones. **Moderate**: one meta-analysis, or several controlled experiments with known limits. **Weak**: small or single studies, quasi-experiments, surveys of opinion, or design argument.
- **†** marks a detail given from memory of the literature that I could not re-check while writing (the session's web-search budget was used up by sibling agents; I verified titles, venues and DOIs, and abstracts where available, through the OpenAlex, Crossref, ERIC and arXiv APIs). Check † items before quoting exact numbers.
- **Engagement levels** follow Naps et al. (2002): *no viewing, viewing, responding* (answer questions about the visual), *changing* (alter inputs or the program and watch), *constructing* (build the visual or the execution yourself), *presenting* (explain it to an audience). Myller et al. (2009) insert *controlled viewing* (stepping, rewinding) between viewing and responding †. These map onto ICAP (Chi & Wylie 2014; see `deep-understanding.md` §2.2): viewing is passive, controlled viewing and responding are mostly active, constructing is constructive, and presenting to a partner who answers back is interactive.
- **Today / new.** "Today" means the page already has it (`backend/session/agent.mjs` `DIAGRAM_DATA`; `shared/elements/{trace,circuit,figure}.mjs`; `src/elements/CodeZone.jsx`, `LatexZone.jsx`). Plato's turn structure is the director's move card (Board, Say, Ask, If-branches; `docs/director-actor.md`), so every design below is written as what goes on the card and what the page logs as evidence.
- Siblings: `course-decomposition.md` §6 covers notional machines, Lister/BRACElet, Parsons and subgoal labels as *Study content*; `deep-understanding.md` covers conceptual change, ICAP, worked examples and productive failure. This brief covers the *interactive and generative side*: what the student does with the page, and how a voice tutor runs it.

## 0. The short version
1. **What the learner does with an element is the active ingredient, not what it shows.** Passive animations, demonstrations and lecture graphs teach little (Naps et al. 2002; Hundhausen et al. 2002; Crouch et al. 2004; Cohn et al. 2001). Every element Plato shows carries a task, and the page logs the engagement level the student *actually* reached, because assigned levels often aren't enacted (Laakso et al. 2009). Mastery is credited only from enacted levels at or above responding.
2. **Seven patterns cover it, in any subject** (Part I): the engagement ladder; manipulating a runnable model; predict–observe–explain; construct/build; compare and contrast; learning by teaching; drawing to learn.
3. **Make the page the referee.** Each subject has something computable: an interpreter, an expression evaluator, a market solver, a pathway state machine, support propagation over an argument map. Ground truth comes from that engine, never from the model's text, and Plato asks the question the engine settles.
4. **Predict before every reveal** (Crouch et al. 2004; Brod 2021). Commitment creates the surprise that makes the correction stick; the explanation afterwards is where the model changes.
5. **Construction plus an automatic check** (Parsons and proof blocks, circuits, free-body diagrams, timelines, argument maps) is efficient practice; return only the first failure, and build distractors from known misconceptions so a wrong choice is a diagnosis. Don't force a standard construction as ritual (Heckler 2010; Kuo et al. 2017).
6. **Contrast one feature at a time, then tell** (Schwartz & Bransford 1998; Rittle-Johnson & Star 2007). Pair wrong with right for novices (Durkin & Rittle-Johnson 2012); interleave confusable items so the student practises choosing (Rohrer et al. 2020: d = 0.83).
7. **Have the student teach Theo**, a classmate Plato voices who holds one scripted misconception, asks "why", and then solves a new item by applying the student's explanation literally (Kobayashi 2019; Okita & Schwartz 2013; Chase et al. 2009). Script his lines and acceptance criteria on the card, because LLM pupils drift into expertise (Jin et al. 2024).
8. **Draw from memory, explain while drawing, then compare with the reference** (Fiorella & Zhang 2018; Fiorella & Kuhlmann 2020; Blunt & Karpicke 2014). Drawing accuracy predicts later transfer, so the drawing is evidence (Schwamborn et al. 2010).
9. **Explorables work through their ingredients** (a question, a prediction, focused controls, an open end), not through interactivity itself; the genre has little direct evidence (Hohman et al. 2020).
10. **One schema** (Part IV): state, controls, task (predict / change / construct / compare / explain / teach / draw), evidence events, tutor use. The page implements the task layer once; each subject adds an engine. Start with the task layer on the two runnable elements that already exist.
11. **CS 3410 test case** (Part III): 14 elements (1 exists, 5 partly exist, 8 are new, including a two's-complement wheel, a float bit flipper, a live memory diagram, a stack-frame builder and a runaway mode for the stepper) and three scripted episodes.

---

# Part I. Seven domain-general patterns (the core)

Plato is a tutor for any course; CS 3410 is one test case. Across all the evidence in Part II, interactive elements and generative activities teach through **seven recurring patterns**. None of them belongs to a subject. Each is a way of making the learner's model **do visible work on the page, where the page can check it**. Part IV turns them into one element schema the page implements once.

| # | Pattern | What the learner does | Active ingredient (evidence) | Boundary condition | Best moment |
|---|---|---|---|---|---|
| A | Engagement ladder | something *with* the element: respond, change, construct, present | doing, not seeing (Naps 2002; Hundhausen 2002; Crouch 2004) | the level that counts is the one *enacted*, not assigned (Laakso 2009) | always |
| B | Manipulate a runnable model | runs experiments on a model whose rules the page computes | guided experiments with the model as referee (Mayer 2004; Alfieri 2011; Finkelstein 2005) | unguided exploration underperforms (de Jong & van Joolingen 1998) | first contact, repair |
| C | Predict–observe–explain | commits to a prediction, sees the result, explains the gap | committed prediction → surprise → attention (Crouch 2004; Brod 2021) | the prediction must be committed and specific; the explanation is where change happens | first contact, repair |
| D | Construct / build | builds the artifact (proof, diagram, circuit, map, timeline) and the page checks it | generation plus immediate verification (Parsons; Proof Blocks; argument mapping) | forcing a standard construction can crowd out insight (Heckler 2010; Kuo et al. 2017); fade for experts | consolidation |
| E | Compare and contrast | works two aligned cases that differ in one feature, names the difference | comparison before telling (Schwartz & Bransford 1998; Rittle-Johnson & Star 2007; Alfieri et al. 2013) | comparing methods needs enough prior knowledge (Rittle-Johnson et al. 2009) | repair, preparation, discrimination |
| F | Learning by teaching | explains to a pupil who asks "why" and then performs what it was taught | explaining, with recursive feedback (Kobayashi 2019; Okita & Schwartz 2013; Chase et al. 2009) | knowledge-telling (Roscoe & Chi 2007); an LLM pupil drifts to expert | consolidation, transfer |
| G | Drawing to learn | draws the model from memory, ideally while explaining | generation plus organization (Fiorella & Zhang 2018; Fiorella & Kuhlmann 2020; Blunt & Karpicke 2014) | versus a provided illustration the benefit is mixed; needs guidance; costs time | consolidation, retrieval |

**Voice protocol shared by all seven.** One sentence of ask, then silence (`skip_turn`) while the student works; never read the element's content aloud; `point_to` the part that matters; "done" is *said*, then `collect_page_work`; respond to the **first** error only, as a question about it; always end with an explanation demand ("why that and not…?"). All input is direct manipulation of the element, voice, typing-anywhere or ink: **no answer fields, submit, verify or confidence buttons** (the user's UI rule, `plato-ui-preferences`).

**The "runnable model" idea, generalized.** Every subject has something the page can *compute*, which makes it the referee instead of Plato. In CS it is an interpreter. In math, an expression evaluator or geometry engine. In physics, a small numerical integrator or circuit solver. In chemistry and biology, a pathway or mechanism state machine with conservation checks. In economics, a supply–demand solver. In history and literature there is no simulator, but there is still something computable: **support propagation over an argument map** (remove a source and see which claims lose support), **temporal constraints over a timeline**, and **source metadata** (author, date, audience) for sourcing and corroboration. A causal concept map that answers queries by propagating influence, as Betty's Brain does for ecosystems (§4.1), is runnable in any domain.

## A. The engagement ladder
**Rule.** Every element shown carries a task; the page logs the level the student *actually* reached; mastery is credited only from enacted levels at or above *responding*; within a topic the director climbs the ladder from first contact to transfer and drops a rung on failure. Passive display alone is allowed only as the reveal after a failed prediction. Evidence: §1.1. A non-CS confirmation: in economics lectures, adding graphs that students only watched produced *lower* gains one year and no difference the next (Cohn, Cohn, Balch & Bradley 2001, *J. Economic Education* 32(4), [ERIC EJ670540](https://eric.ed.gov/?id=EJ670540)); passive physics demonstrations taught nothing (Crouch et al. 2004).

| Level | Math | Physics | Chemistry / Biology | Economics | History / Literature | CS 3410 (test case) |
|---|---|---|---|---|---|---|
| Viewing (never alone) | graph of *f* shown | projectile animation plays | glycolysis animation plays | supply–demand graph shown | timeline shown | stepper auto-plays |
| Responding | "If *a* doubles, where does the vertex go?" | "Which path will the ball take?" | "Which step makes the ATP?" | "What happens to price and quantity?" | "Which source was written first, and does it matter?" | "What's in `a0` after line 4?" |
| Changing | drag the *a, h, k* sliders | change launch angle and mass | add an inhibitor; raise substrate | shift supply; add a tax wedge | toggle a source off in the argument map; filter the timeline | edit the code, rerun |
| Constructing | order proof blocks; build the transformation | draw the free-body diagram | push the arrows; assemble the pathway | build the diagram for a scenario | build the timeline or argument map; sort evidence | build the circuit; be the CPU |
| Presenting | explain to Theo why the graph moved | explain to Theo why no forward force is needed | explain to Theo where the energy goes | explain tax incidence to Theo | defend an interpretation to Theo, with evidence | teach Theo the calling convention |

## B. Manipulate a runnable model
**Rule.** A simulation or manipulative is a referee for predictions and a space for *focused* experiments, never a toy to explore alone. Each card has a question the model can settle, a committed prediction, a **focused constraint** (only the relevant controls are live), **linked views** (one change updates every representation; Moyer-Packenham & Westenskow's "simultaneous linking"), and a rule the student must state at the end and then test on a new setting. Ground truth is computed by the page, never written by the model. Evidence: §2.0 (guided versus pure discovery; PhET; manipulatives).

| Domain | Element | Engine (what computes truth) | Learner does | Evidence |
|---|---|---|---|---|
| Math | function graph with parameter sliders; geometry canvas (drag, reflect, rotate, dilate with coordinates updating) | expression evaluator; geometry engine | finds the rule for how *a, h, k* move the graph; finds a transformation sequence | parameters explored, stated rule, rule tested on a new function. Dynamic geometry: Chan & Leung (2014), *J. Educ. Computing Research* 51(3), [ERIC EJ1076468](https://eric.ed.gov/?id=EJ1076468), SMD 1.02, but only 9 quasi-experiments (n = 587): weak |
| Physics | slider simulation (projectile, circuit, spring) | small ODE integrator; circuit solver | varies one quantity at a time; states the relationship | experiments run (one variable at a time or many), prediction errors. PhET: Wieman, Adams & Perkins (2008), *Science* 322, [doi:10.1126/science.1161948](https://doi.org/10.1126/science.1161948); Finkelstein et al. (2005); 31-study review: Banda & Nzabahimana (2021) |
| Chemistry / Biology | pathway or mechanism stepper (metabolite pools, enzyme steps); equilibrium or kinetics sliders; genetic cross | state machine with mass, charge and energy bookkeeping | steps the pathway; adds an inhibitor and predicts flux; shifts conditions (Le Chatelier) | per-step predictions, which intermediate they lose track of. Animations of molecular processes are common (McClean et al. 2005, *Cell Biology Education* 4, [ERIC EJ846414](https://eric.ed.gov/?id=EJ846414)); controlled evidence for *interactive* pathway steppers is weak |
| Economics | shiftable supply and demand curves with tax wedges, ceilings and floors; surplus areas computed | linear market solver | shifts a curve for a scenario; reads off equilibrium, surplus, deadweight loss | shift direction chosen, shift versus movement confusions. Market experiments in class beat lecture sections (Emerson & Taylor 2004, *Southern Economic Journal* 70(3), [doi:10.2307/4135338](https://doi.org/10.2307/4135338); 2007, [ERIC EJ767253](https://eric.ed.gov/?id=EJ767253)) |
| History / Literature | argument map with support propagation; timeline with a "what was known by then" filter; causal map that answers "what if" by propagation | graph propagation; date constraints; source metadata | removes a source and sees which claims fall; moves an event and sees what can no longer have caused what | claims the student defends after a source is removed; anachronisms caught |
| CS 3410 | RISC-V stepper, C sandbox, circuit, float bit flipper, two's-complement wheel | RV64 interpreter, compiler sandbox, gate evaluator | predicts and steps; flips bits; toggles switches | §1–§2 |

## C. Predict–observe–explain
**Rule.** The default wrapper for every element with an outcome. *Predict*: one question, a committed and specific answer (spoken, typed anywhere, sketched, or set directly on the element). *Observe*: the student triggers the reveal; Plato is silent while it happens. *Explain*: on a mismatch, "What did your version assume that the model didn't?"; on a match, "Why that and not the other?" so a lucky guess isn't credited. Confidence comes from the student's words. Evidence: §3.1, plus Kim, Reinecke & Hullman (2017), CHI, [doi:10.1145/3025453.3025592](https://doi.org/10.1145/3025453.3025592): **drawing your prediction of a data trend before seeing it** improves recall and comprehension, which carries POE to any subject with data.

| Domain | Predict | Observe | Explain |
|---|---|---|---|
| Math | sketch *f(x − 2)* over *f*; guess whether a conjecture holds at n = 5 | the graph or computation appears | "It moved right. Why, when you subtracted?" |
| Physics | where the ball lands if the mass doubles | the simulation runs | "What does mass cancel out of?" (interactive lecture demonstrations, Sokoloff & Thornton †) |
| Chemistry / Biology | the equilibrium shift when product is added; the pathway's flux when an enzyme is inhibited | the stepper or sliders run | "Which step became the bottleneck?" |
| Economics | draw the new equilibrium after a subsidy ("you draw it") | the solver shifts the curve | "Who captures the subsidy, and why?" |
| History / Literature | predict how an author will describe an event, from their position; predict a character's choice | the source or passage is revealed | "What in the author's situation explains the gap?" |
| CS 3410 | registers or memory after a step | the stepper steps | "What did your model assume about `*`?" |

## D. Construct / build
**Rule.** The student builds the artifact; the page checks it automatically wherever it can and returns only the **first** failure; distractors are built from known misconceptions so that a wrong choice is a diagnosis. Offer standard constructions as tools, not rituals: prompting novices to draw a standard force diagram first increased procedure use and *reduced* conceptual shortcuts, and narrowed what they counted as good problem solving (Heckler 2010 †; replicated by Kuo, Hallinen & Conlin 2017, *IJSE* 39(1), [ERIC EJ1142774](https://eric.ed.gov/?id=EJ1142774)). Fade construction support as expertise grows. Evidence: §3.2–3.5, §5.

| Domain | Element | Page's check | Evidence |
|---|---|---|---|
| Math | **proof blocks** (Parsons problems for proofs, with distractor steps); transformation builder; faded worked examples with step explanations | the proof's dependency graph (each step's premises come earlier); the shape lands on the target | Poulsen, Viswanathan, Herman & West (2022), ITiCSE, [doi:10.1145/3502718.3524774](https://doi.org/10.1145/3502718.3524774); Poulsen et al. (2023), SIGCSE, [doi:10.1145/3545945.3569797](https://doi.org/10.1145/3545945.3569797), more efficient than writing proofs †. Explaining steps in a Cognitive Tutor improved transfer (Aleven & Koedinger 2002, *Cognitive Science* 26(2), [doi:10.1207/s15516709cog2602_1](https://doi.org/10.1207/s15516709cog2602_1)) |
| Physics | free-body diagram builder (vectors on a dot) | net force consistent with the stated motion; no "force of motion" | students who drew correct diagrams solved more problems (Rosengrant, Van Heuvelen & Etkina 2009, *PR ST PER* 5, [doi:10.1103/PhysRevSTPER.5.010108](https://doi.org/10.1103/PhysRevSTPER.5.010108) †) |
| Chemistry / Biology | arrow-pushing mechanism where **the page derives the product the student's arrows imply**; pathway assembly (order steps, place ATP/NADH yields) | atom and charge conservation; the implied product versus the expected; the pathway table | many organic students add arrows *after* drawing products or abandon the convention (Grove, Cooper & Rush 2012, *J. Chem. Educ.* 89(7), [ERIC EJ1001175](https://eric.ed.gov/?id=EJ1001175)). Computing the product from the arrows makes them generative instead of decoration |
| Economics | diagram builder: place and shift curves, mark the new equilibrium, shade surplus and deadweight loss | the solver's equilibrium and areas | — (design argument from B and C) |
| History / Literature | **timeline** builder; **argument map** (claim, reasons, objections, rebuttals); **evidence sorter** (cards into supports / undermines / irrelevant, with sourcing tags) | date order and overlaps; partial match to a reference map plus support propagation; sorting versus an expert key | argument mapping improved critical thinking and argument analysis over controls (Dwyer, Hogan & Stewart 2012, *Metacognition & Learning* 7, [ERIC EJ984318](https://eric.ed.gov/?id=EJ984318)); explicit sourcing, corroboration and contextualization with multiple documents (Nokes, Dole & Hacker 2007, *J. Educ. Psych.* 99(3), [ERIC EJ772019](https://eric.ed.gov/?id=EJ772019); Reisman 2012, "Reading like a historian", main effects on historical thinking, factual knowledge and reading, [ERIC EJ963241](https://eric.ed.gov/?id=EJ963241)); arguing from multiple sources builds deeper understanding than narrating or summarizing (Wiley & Voss 1999, *J. Educ. Psych.* 91(2), [doi:10.1037/0022-0663.91.2.301](https://doi.org/10.1037/0022-0663.91.2.301); Bråten & Strømsø 2010, [ERIC EJ877197](https://eric.ed.gov/?id=EJ877197)) |
| CS 3410 | Parsons for prologues; circuit build; trace table; "you're the CPU" | interpreter / exhaustive truth table | §1.4, §2.3, §3.2, §3.4 |

## E. Compare and contrast
**Rule.** Two linked panes that differ in **exactly one relevant feature**. The student predicts or works both, names the difference *and why it matters*, and says what's the same. Plato states the principle only afterwards ("a time for telling"), then tests it on a third case. Pair an incorrect example with a correct one for novices (Durkin & Rittle-Johnson 2012); compare *methods* only once the student can do one of them (Rittle-Johnson, Star & Durkin 2009). For discriminating confusable ideas, **interleave** contrast items across sessions and ask "which kind is this?" before solving (Rohrer). Evidence: §3.6–3.8.

| Domain | Pair (one difference) | The idea it isolates |
|---|---|---|
| Math | two solution methods for one equation (Rittle-Johnson & Star 2007); *f(x) + 2* versus *f(x + 2)* on linked graphs; a valid proof versus one with a hidden division by zero | method flexibility; inside versus outside the function; what a proof step may assume |
| Physics | an elevator accelerating upward versus moving upward at constant speed (two free-body diagrams); a ball at the top of its flight versus at rest | net force tracks acceleration, not velocity |
| Chemistry / Biology | SN1 versus SN2 on the same substrate; competitive versus noncompetitive inhibition on linked rate plots; mitosis versus meiosis steppers side by side | mechanism determines kinetics and stereochemistry; where the inhibitor binds; what pairing does |
| Economics | a shift of demand versus a movement along it; a tax on buyers versus on sellers; a ceiling above versus below equilibrium | what moves a curve; incidence doesn't depend on who pays; when a ceiling binds |
| History / Literature | two accounts of the same event by differently placed authors (perspective comparison, corroboration); the same scene from two narrators; two translations; two critics' readings | sourcing and point of view; narration shapes meaning |
| CS 3410 | `*ptr = 20` versus `ptr = &y`; `lb` versus `lbu`; D latch versus flip-flop; `sub` with versus without saving `ra` | §3.7 table |

## F. Learning by teaching: Theo, the classmate with a bug
**Rule.** After the student holds the model, Plato voices a classmate, Theo, who holds **one** catalogued misconception, shows his worked attempt on the page, asks "why/how" follow-ups, changes his mind only when the student's explanation contains the causal element the card names, and then **solves a new item by applying the student's explanation literally** (recursive feedback). The episode ends with Plato stating the principle and an isomorphic item for the student alone. The director scripts Theo's lines and acceptance criteria on the card so Theo cannot drift into expertise. Full protocol and evidence: §4.6.

| Domain | Theo's misconception | What the student must do | Theo's transfer item |
|---|---|---|---|
| Math | *(a + b)² = a² + b²*; *f(x + 2)* shifts right; a proof that uses its conclusion | show a counterexample; explain with the area model or the graph | expand *(x − 3)²*; sketch *f(x − 1)* |
| Physics | a moving object needs a force in its direction of motion (impetus); at the top of a throw, acceleration is zero | use the simulation's force and velocity vectors; link force to *change* in velocity | the free-body diagram for a puck gliding on ice |
| Chemistry / Biology | breaking bonds releases energy; plants get their mass from the soil; organisms evolve because they need to | track energy in bond formation; trace carbon from CO₂; explain selection on variation | the energy diagram for combustion; the mass of a growing tree |
| Economics | a price rise *shifts* demand left; a tax on sellers is paid by sellers | distinguish movement from shift on the curves; show the wedge's incidence with the solver | rent ceiling: shortage or surplus? |
| History / Literature | a primary source is reliable because it's primary; a single-cause story; judging the past by present norms; "the narrator is the author" | source the document (who, when, why, for whom); corroborate; contextualize | evaluate a second source; read another narrator |
| CS 3410 | the top bit is just a minus sign; `ptr =` writes the target; a function that calls another needn't save `ra` | §8 episodes | §8 episodes |

## G. Drawing to learn
**Rule.** Draw from memory, with guidance matched to the learner (a partial drawing for novices, a blank page for experts), explaining while drawing; then Plato places the reference beside it and asks about the first missing or wrong element. The rubric score of the drawing is evidence, since drawing accuracy predicts later transfer (Schwamborn et al. 2010). End sessions with a retrieval-based concept map of how today's ideas connect. Evidence: §5.

| Domain | Draw from memory | Rubric's key elements |
|---|---|---|
| Math | sketch *f′* from the graph of *f*; a diagram for a word problem; the region of integration | sign of *f′* where *f* rises or falls; zeros at extrema; the right bounds |
| Physics | free-body, motion and energy bar diagrams; a ray diagram | forces as interactions with named agents; acceleration direction; conservation |
| Chemistry / Biology | the mechanism; the organelle process; the pathway map | electron flow source to sink; inputs, outputs and locations; regulated steps |
| Economics | the graph after a policy; the circular flow | correct curve shifted, direction, new equilibrium, areas |
| History / Literature | a timeline; a causal map of a war's origins; a character map; the argument structure of an essay | order and overlap; causes linked with mechanisms (not just "led to"); claims linked to evidence |
| CS 3410 | memory boxes, stack frames, latch wire values, the float's fields | §5.3 |

---

# Part II. The evidence by source, worked on the CS 3410 test case

The sections below hold the detailed evidence behind Part I. The "Plato design" blocks in them are written for the CS 3410 test case; their general forms are the patterns above and the schema in Part IV.

## 1. Program and notional-machine visualization

The unifying finding: **a visualization teaches through what the learner does with it, not through what it shows.** Every design here therefore pairs an element with a task, and logs whether the task was actually done.

### 1.1 The engagement taxonomy, and why "active" must be checked, not assumed
**Evidence. Moderate** (many small experiments, two meta-reviews, consistent direction; the original effect sizes are small and heterogeneous).
- Naps et al. (2002), ITiCSE working group, [doi:10.1145/782941.782998](https://doi.org/10.1145/782941.782998): visualization "no matter how well it is designed, is of little educational value unless it engages learners in an active learning activity." Proposes the six-level engagement taxonomy and the hypothesis that higher levels give better learning.
- Hundhausen, Douglas & Stasko (2002), *J. Visual Languages & Computing* 13(3), [doi:10.1006/jvlc.2002.0237](https://doi.org/10.1006/jvlc.2002.0237): meta-study of 24 controlled experiments on algorithm visualization. The best predictor of a significant result was *how* students used the visualization (constructing, predicting, answering), not its graphical quality; studies grounded in cognitive-constructivist designs succeeded most often †.
- Urquiza-Fuentes & Velázquez-Iturbide (2009), *ACM TOCE* 9(2), [doi:10.1145/1538234.1538236](https://doi.org/10.1145/1538234.1538236): of 18 program/algorithm visualization systems with 33 evaluations, half were only usability-tested. Successful learning evaluations clustered at the responding, changing and constructing levels.
- Byrne, Catrambone & Stasko (1999), *Computers & Education* 33(4), [doi:10.1016/S0360-1315(99)00023-8](https://doi.org/10.1016/S0360-1315(99)00023-8): learners who **predicted** the algorithm's next step did better on hard transfer questions, with or without the animation; the animation's own contribution was small †. Prediction, not pictures, carried the effect.
- Grissom, McNally & Naps (2003), SoftVis †: learning rose with engagement level (no viewing < viewing < responding).
- Laakso, Myller & Korhonen (2009), [OpenAlex record](https://openalex.org/works?search=Comparing%20Learning%20Performance%20of%20Students%20Using%20Algorithm%20Visualizations%20Collaboratively%20on%20Different%20Engagement%20Levels): randomized groups assigned to different engagement levels showed **no** post-test difference, because screen and voice recordings showed many students did not actually work at their assigned level. Regrouping by *observed* behaviour produced significant differences. **The lesson for Plato: an engagement level is something the student does, so it has to be observed and logged, not designed in and assumed.**
- Kehoe, Stasko & Taylor (2001), *IJHCS* 54(2), [doi:10.1006/ijhc.2000.0409](https://doi.org/10.1006/ijhc.2000.0409): in open, homework-style use, animations helped mostly by making the algorithm approachable and prompting questions †.

**Plato design: the engagement contract (applies to every element in this brief).**
- Every board element on a card carries `task` (what the student must do with it), `level` (the Naps level that task reaches), and `evidence` (what the page records). A card that shows an element with no task is allowed only for a *repair* that immediately follows a failed prediction ("here is what actually happened").
- The page logs the **enacted** level, not the intended one: `predicted_before_step` (bool), `edits_made` (count and what), `constructed_cells` (which cells the student set), `explained` (transcript span). The director credits mastery only from enacted levels ≥ responding.
- Stepping is **gated** at checkpoints: at a checkpoint the Step control is disabled until the student commits a prediction (types values, sets cells, or says it and the actor records it via the card's If-branch). Without the gate, students step through and "watch" (Laakso et al. 2009).
- Voice rule: at a checkpoint Plato says one short line ("Before you step, what's in x after line 9?"), then `skip_turn` silence while they work. It never narrates the animation; the student's prediction is the turn.

### 1.2 Python Tutor and its memory diagrams
**What it is.** Guo (2013), SIGCSE, [doi:10.1145/2445196.2445368](https://doi.org/10.1145/2445196.2445368): a web tool that runs code and draws every step as *frames* (variables in each active call, left) and *objects* (heap data, right) with pointer arrows, with forward and **backward** stepping and embeddable links. It now supports C and C++ ([pythontutor.com](https://pythontutor.com/)), drawing stack frames, heap blocks and pointer arrows, with uninitialised values shown as garbage.

**Evidence. Weak for learning gains; strong for adoption.** Python Tutor is the most-used program visualizer, but there are few controlled studies of it. Karnalim & Ayub (2017), [doi:10.22219/kinetik.v2i4.442](https://doi.org/10.22219/kinetik.v2i4.442), is a 53-student perception survey. The nearest controlled evidence on "always-on" runtime visualization is null for learning: in a within-subjects CS1 study (N = 237), a live-programming environment that visualizes runtime values made some tracing tasks faster but **did not change learning outcomes** (Huang et al. 2022, SIGCSE, [doi:10.1145/3478431.3499305](https://doi.org/10.1145/3478431.3499305)). Read together with §1.1: a correct diagram shown for free does the student's tracing for them.

**Plato design.**
- *Borrow*: the frames-left / heap-right layout, arrows for pointers, back-stepping (essential for repair: "go back to just before line 9"), and showing uninitialised values as `?` rather than 0.
- *Change*: (1) **gate** the diagram behind predictions (§1.1); (2) give pointers **two faces**, because CS 3410 teaches both: a toggle between *address view* (the pointer cell holds `0x…6bbc`, and the target cell shows its address) and *arrow view* (the same cell draws an arrow). The notes insist on both: "pointers are just bits" and "pointers as references" (L08). Switching faces is itself a task: "Turn arrows off. Which number in ptr's box tells you it points at x?"
- Engagement: viewing → responding (gated predictions) → changing (student edits the code in a work zone and reruns).
- When: first contact with frames and pointers; repair after a wrong prediction (rewind to the step before the error).

### 1.3 Jeliot: animating expression evaluation
**What it is.** Jeliot 3 (Moreno, Myller, Sutinen & Ben-Ari 2004, AVI, [doi:10.1145/989863.989928](https://doi.org/10.1145/989863.989928)) animates Java execution automatically, including an "evaluation area" where each sub-expression is computed in turn. Myller (2007), *ENTCS* 178, [doi:10.1016/j.entcs.2007.01.034](https://doi.org/10.1016/j.entcs.2007.01.034), added automatically generated **prediction questions** during the animation ("what value will this variable get?") on the grounds that answering questions is what makes visualization work.

**Evidence. Weak to moderate.** Ben-Bassat Levy, Ben-Ari & Uronen (2003), *Computers & Education* 40(1), [doi:10.1016/S0360-1315(02)00076-3](https://doi.org/10.1016/S0360-1315(02)00076-3): a year-long high-school study in which the animation group improved more than controls, mostly the **middle-ability students**; strong students did not need it and weak students could not use it, the benefit appeared only after weeks of use, and students gained a shared **vocabulary** for talking about execution †. Moreno et al. and Myller et al. (2009, *ACM TOCE* 9(1)) reported that collaborative use at higher engagement levels produced more discussion †.

**Plato design: the address-arithmetic strip.** Jeliot's evaluation area is exactly what pointer arithmetic needs. For `*(courses + 5)` (L08) the strip shows, one reveal per student answer: `courses` → `0x…b90`; `+ 5` → "5 elements × 4 bytes = 20" → `0x…ba4`; `*` → "load 4 bytes there" → `3110`. Plato reveals a stage only after the student says it. Evidence: the stage at which they fail (adds 5 not 20 = no element scaling; stops at the address = no dereference). Use at first contact with pointer arithmetic and as a repair for `p + 1` misconceptions; the same strip serves RISC-V `ld t0, 32(a0)` (base + offset → address → 8 bytes).

### 1.4 UUhistle and visual program simulation (Sorva)
**What it is.** In *visual program simulation* (VPS) the learner, not the computer, executes the program: they drag values into variables, create and discard frames, and evaluate expressions by manipulating the diagram, and the system checks each step. Sorva's UUhistle (Sorva & Sirkiä 2010, Koli Calling †) implements it for Python.

**Evidence. Weak quantitative, useful qualitative.**
- Sorva, Lönnberg & Malmi (2013), *Computer Science Education* 23(3), [doi:10.1080/08993408.2013.807962](https://doi.org/10.1080/08993408.2013.807962): interviews found six ways learners experience VPS. Some did not attribute any meaning to the visual elements, and some did not connect the simulated concepts to programming practice. VPS works only when the learner sees the diagram *as* the program's state.
- Sorva, Karavirta & Malmi (2013), *ACM TOCE* 13(4), [doi:10.1145/2490822](https://doi.org/10.1145/2490822): a review of 40-odd generic program-visualization systems; most are short-lived prototypes supporting controlled viewing; evaluations are few and mixed. It proposes a two-dimensional engagement taxonomy (direct engagement × *content ownership*: whether the program is given, the learner's own, or learner-modified) †.
- Sorva (2013), *ACM TOCE* 13(2), [doi:10.1145/2483710.2483713](https://doi.org/10.1145/2483710.2483713): the notional machine should be an explicit learning objective; many misconceptions are wrong notional machines.
- Related controlled evidence that *being* the machine helps: PLTutor (Nelson, Xie & Ko 2017, ICER, [doi:10.1145/3105726.3106178](https://doi.org/10.1145/3105726.3106178)) taught each language construct as causal steps from code token to machine-state change, stepping through many examples; in a small block-randomized study, learning gains on the SCS1 were 60% higher than Codecademy's (3.89 vs 2.42 of 27), and only for PLTutor did gains predict midterm grades.

**Plato design: "You're the CPU" mode.** The stepper's diagram becomes editable. At each step Plato says only "Line 9. You're the machine: change what changes," and stays quiet. The student sets cells or registers (types a value, drags an arrow, or for RISC-V edits the register row); the page diffs their state against the simulator's. Evidence per step: `correct`, `cells_wrong`, `extra_cells_changed`. The error pattern is diagnostic: writing 41 into `ptr`'s box instead of `x`'s is the `*ptr =` / `ptr =` confusion; changing `ra` on `ret` is a misunderstanding of `jalr x0`. Sorva's caveat becomes a rule: on first use Plato asks the student to name what two elements stand for ("what is this box, and what made its arrow?"), and moves on only if they tie it to a line of code.
- Engagement: constructing (the student produces each next state).
- When: consolidation after first contact, and as the strongest repair for a flawed model: the student's own wrong step is the conflict. Too heavy for first contact with a novice (they need a worked trace first; `deep-understanding.md` §3.1).

### 1.5 Memory diagrams for C pointers
**Evidence. Moderate that drawing memory helps tracing; weak on specific diagram designs.**
- Hertz & Jump (2013), SIGCSE, [doi:10.1145/2445196.2445364](https://doi.org/10.1145/2445196.2445364): courses organized around *program memory traces* (students trace code by updating a drawn model of memory, stack and heap) produced significantly better grades, lower drop and fail rates, and better programming ability than prior offerings (quasi-experimental).
- Xie, Nelson & Ko (2018), SIGCSE, [doi:10.1145/3159450.3159527](https://doi.org/10.1145/3159450.3159527): a 5–10 minute explicit tracing strategy (go line by line, keep an external memory table) raised tracing scores 15% in a block-randomized experiment (n = 24) and midterm scores 7%.
- Cunningham, Blanchard, Ericson & Guzdial (2017), ICER, [doi:10.1145/3105726.3106190](https://doi.org/10.1145/3105726.3106190): students who sketch a trace succeed more; **incomplete** sketches do no better than none.
- Holliday & Luginbuhl (2004), SIGCSE, [doi:10.1145/1028174.971373](https://doi.org/10.1145/1028174.971373): ability to *construct* memory diagrams correlated with understanding, so diagram construction doubles as assessment.
- Ma, Ferguson, Roper & Wood (2011), *Computer Science Education* 21(1), [doi:10.1080/08993408.2011.554722](https://doi.org/10.1080/08993408.2011.554722): many novices hold non-viable models of value versus reference assignment, and those who do perform worse; a teaching model combining **cognitive conflict with visualization** improved engagement and models.
- Pointer difficulty is real and specific: Craig & Petersen (2016), [doi:10.1145/2843043.2843348](https://doi.org/10.1145/2843043.2843348), built a taxonomy of pointer concepts and ranked their difficulty from lab submissions; Kaczmarczyk et al. (2010), [doi:10.1145/1734263.1734299](https://doi.org/10.1145/1734263.1734299), found memory-model misconceptions among the four major themes in CS1 interviews. Early C visualizers drew an explicit memory map with pointer and variable addresses (VINCE: Rowe & Thorburn 2000, *BJET*, [doi:10.1111/1467-8535.00168](https://doi.org/10.1111/1467-8535.00168); SeeC, Heinsen Egan 2015 thesis, built on Clang so the C semantics are the compiler's own).
- Dickson, Brown & Becker (2020), ITiCSE, [doi:10.1145/3341525.3387404](https://doi.org/10.1145/3341525.3387404): keep the *notional machine* distinct from the tool that draws it, and name it, so it survives when the tool is gone (on the prelim, it is a pencil drawing).

**Plato design: the live memory diagram (new; the `memory` diagram and C `trace` exist but are static or model-authored).**
- **Model**: CS 3410's own, `uint8_t mem[SIZE]` (L08): rows are addresses in hex (course style, `…6bb8`, `…6bbc`), each variable labelled, `int` 4 bytes, pointers 8 bytes, with a **byte view** for L16's little-endian `sw`/`lb` examples and a **variable view** for C.
- **Ground truth**: today the C `trace` steps are written by the model and checked only for shape (`shared/elements/trace.mjs`: "ponytail: C steps are the model's own"). For pointer lessons a wrong diagram teaches the wrong model, so: run the snippet in the C sandbox with the course's own instrumentation (it already prints `x`, `y` and `ptr` with `%p` at points 0–3), and reject a model-authored trace whose values disagree with the printed run. Upgrade path, if needed: a small C-subset interpreter (as the RISC-V trace already has).
- **Task ladder** on the same diagram: (1) *responding*: gated predictions at checkpoints; (2) *constructing*: "You're the CPU" (§1.4); (3) *changing*: the student edits the code in a C work zone so the diagram ends in a target state ("make `y` end at 20 without writing `y =`"); (4) *presenting*: the student explains a finished diagram to Theo, Plato's confused classmate (§4.6).
- **Evidence logged**: per checkpoint, predicted versus actual cells; error signatures mapped to misconceptions (`ptr` cell changed by `*ptr =`; `x` changed by `ptr = &y`; pointer drawn as holding the *value* 34 rather than an address; `sizeof` of a pointer given as 4).
- **When**: first contact (worked trace with predictions), repair (rewind to the mispredicted step, then contrast), consolidation (constructing), transfer (new structures: `swap(int* x, int* y)`, `int**`, `p->x`, an array passed as `int*`).
- **Voice**: Plato never reads addresses aloud in full; it says "the box ending in b-c" and uses `point_to`. It narrates causes, not states ("line 9 writes *through* ptr").

---

## 2. Simulators and manipulatives for systems topics

### 2.0 What the general evidence says about simulators and manipulatives
**Evidence. Strong that guided use beats unguided use; moderate that simulations and virtual manipulatives help at all.**
- Pure discovery underperforms: Mayer (2004), *American Psychologist* 59(1), [doi:10.1037/0003-066X.59.1.14](https://doi.org/10.1037/0003-066X.59.1.14), "guided discovery was more effective than pure discovery in helping students learn and transfer." Alfieri, Brooks, Aldrich & Tenenbaum (2011), *J. Educ. Psych.* 103(1), [doi:10.1037/a0021017](https://doi.org/10.1037/a0021017), meta-analysis: unassisted discovery was worse than explicit instruction, while *enhanced* discovery (feedback, worked examples, scaffolds, elicited explanations) beat other methods †(d ≈ −0.38 and +0.30).
- Simulation-based discovery: de Jong & van Joolingen (1998), *Review of Educational Research* 68(2), [doi:10.3102/00346543068002179](https://doi.org/10.3102/00346543068002179): learners struggle to form hypotheses, design informative experiments and interpret data, so a simulation needs instructional support to teach. D'Angelo et al. (2014), SRI meta-analysis "Simulations for STEM learning" †: simulations beat no-simulation instruction, and simulations with added scaffolds beat bare ones.
- Virtual beat physical in one well-known case: Finkelstein et al. (2005), *Phys. Rev. ST PER* 1, [doi:10.1103/PhysRevSTPER.1.010103](https://doi.org/10.1103/PhysRevSTPER.1.010103): students using the PhET circuit simulation outperformed those using real bulbs and wires on a conceptual survey, *and* at building and explaining a real circuit. The simulation made the invisible (electron flow) visible and removed noise. de Jong, Linn & Zacharia (2013), *Science* 340, [doi:10.1126/science.1230579](https://doi.org/10.1126/science.1230579): virtual and physical labs each have affordances; combine them.
- Manipulatives: Carbonneau, Marley & Selig (2013), *J. Educ. Psych.* 105(2), [doi:10.1037/a0031084](https://doi.org/10.1037/a0031084): 55 studies, small-to-moderate effects over symbols-only instruction, larger for retention than for transfer, moderated by how much instruction accompanies them. Moyer-Packenham & Westenskow (2013/2015), [doi:10.4018/978-1-4666-8847-6.ch009](https://doi.org/10.4018/978-1-4666-8847-6.ch009): virtual manipulatives give moderate effects; their helpful affordances are **simultaneous linking** (one action updates several linked representations), **efficient precision**, **focused constraint** (only the relevant thing can be changed), **creative variation**, and motivation.
- Design frame: PhET's *implicit scaffolding* (Podolefsky, Moore & Perkins 2013, [arXiv:1306.6544](https://doi.org/10.48550/arXiv.1306.6544)): steer exploration through affordances, constraints, cueing and feedback, rather than instructions.

**What this means for Plato.** A simulator is a referee for predictions and a space for focused experiments, not a toy to explore alone. Every simulator card has: (1) a **question** the simulator can settle; (2) a **prediction** committed first; (3) a **constraint** (only the relevant controls are live); (4) **linked views** (bits ↔ value ↔ picture update together); (5) an **explain** step after the run. Plato's job in voice is to pose the question, wait, and ask for the explanation; the simulator gives the verdict.

### 2.1 Float bit flipper (float.exposed style)
**What exists.** [float.exposed](https://float.exposed/) (Bartosz Ciechanowski): click any bit of a half, float or double; see sign, exponent and significand fields, the value in base 2 and base 10, the exact stored value, and the gaps to the neighbouring representable values. **CS 3410 itself sends students there** (L06: "click the bits to flip them and make any value you want"; it uses it to check 8.25 and −5.125 conversions).

**Evidence. Weak for the tool (no learning studies found); moderate for the need.** Dinda & Hetland (2018), IPDPS, [doi:10.1109/IPDPS.2018.00068](https://doi.org/10.1109/IPDPS.2018.00068): developers from academia, national labs and industry did "only slightly better than chance" at identifying key unusual behaviours of IEEE floating point. The benefit of the bit flipper rests on the manipulative evidence above (linked representations, focused constraint).

**Plato design (new element; today only the static `bits` diagram exists).**
- Element: 32 clickable bits grouped s | e (8) | g (23), using the course's own symbols ($s$, $e$, $g$, $(-1)^s \times 1.g \times 2^{e-127}$); live readouts of $e$ as unsigned and as $e - 127$; the value in binary scientific notation and in decimal; the **gap to the next float**; and a case badge (normal / denormal / ±0 / ±∞ / NaN). Optional constraint: lock fields so only the one under study is live.
- Tasks, in increasing engagement:
  1. *Responding (POE)*: "The value is 1.0. Predict what happens if you flip the lowest significand bit. Now the same flip at 1024." (Gap grows with the exponent: the precision is relative.)
  2. *Constructing*: "Make 8.25." "Make −5.125." (L06's own examples.) The page checks the pattern exactly. Evidence: final pattern, number of flips, and which field was wrong first (wrong bias, forgot the implicit 1, wrote the integer part into $g$).
  3. *Changing / hunting*: "Find the smallest positive normal float." "Make infinity. Now make a NaN. What's the one difference?"
  4. *Explaining (repair of L06's opening example)*: "Why does `(1 + y) − (1 + x)` print 0?" The student reads the gap at 1.0 off the flipper (2⁻²³ ≈ 1.19e−7) and explains the rounding. This corrects the notes' own explanation (`teaching-design.md` §2.5).
- Voice: Plato never recites bit strings. It says "the exponent field" and `point_to`s it; the student's turn is the pattern on the page.
- When: consolidation (after the worked 8.25 conversion), repair (the "floats are exact" or "0.1 is stored exactly" model), transfer (half precision: same task with 5 exponent bits).

### 2.2 Two's-complement number wheel
**Evidence. Weak for the specific manipulative (design argument; no controlled study found); moderate for the need.** Herman, Zilles & Loui (2011), *Computer Science Education* 21(3), [doi:10.1080/08993408.2011.611712](https://doi.org/10.1080/08993408.2011.611712): students who had *passed* a computer organization course still held "surprising misconceptions about positional notations, two's complement representation, and overflow." The wheel is the modular view in `teaching-design.md` §3: unsigned and signed are two label sets on the same positions, adding moves clockwise, and overflow is crossing a seam.

**Plato design (new).**
- Element: a ring of 2ⁿ positions (n = 4 default; 3, 6 and 8 available), each holding its bit pattern. Two label rings: unsigned (outer) and two's complement (inner), each hideable. A draggable hand. Seams marked when the student asks to see them: unsigned between `1111` and `0000`, signed between `0111` and `1000`. Dragging the hand k clicks (or saying "add three") shows the adder's bits beside it (carry-out dropped, as L04 says).
- Tasks: *constructing*: the inner ring starts **blank** and the student drags signed labels onto positions; *responding*: "Start at `1101`. Add `0011` by moving the hand. Where do you land, and what does each ring call it?"; *changing*: switch to 6 bits and find −5 (L02's `111011` example).
- Evidence: the label each position gets (the label set is the student's model, written down: sign-magnitude labels run *backwards* from `1000`, which shows instantly as `1001` = −1 instead of −7), where the student places the seam, and the explanation of why one adder serves both rings.
- When: first contact for students who know unsigned binary; repair for "the top bit is a minus sign" (Episode A, §8.1); consolidation for overflow (crossing the seam).

### 2.3 Circuit sandbox (Logisim, Nandgame, CircuitVerse)
**What exists elsewhere.** Logisim (Burch 2002 †) and its fork Logisim-evolution are the standard drag-and-wire teaching simulators; CircuitVerse is a browser-based equivalent †. [Nandgame](https://www.nandgame.com/) ("build a computer from scratch") gives a sequence of levels from NAND up through adders, an ALU, latches, registers and a CPU, each checked against a hidden test set †; **CS 3410 recommends it** (L10: "Try using Nandgame to build the circuits we already made"; L11 uses it to show that combinational circuits keep no memory). nand2tetris (Schocken, Nisan & Armoni 2009, SIGCSE, [doi:10.1145/1508865.1509021](https://doi.org/10.1145/1508865.1509021)) is the course-length version.

**Evidence. Weak for learning gains specific to these tools (descriptive reports and surveys)**, e.g., Al-Busaidi (2013) on Logisim, [doi:10.24200/tjer.vol11iss1pp69-76](https://doi.org/10.24200/tjer.vol11iss1pp69-76). The strongest indirect evidence is Finkelstein et al. (2005) above. The misconceptions to target are documented: Herman, Zilles & Loui (2011, online; *IEEE Trans. Educ.* 2012), [doi:10.1109/TE.2011.2140372](https://doi.org/10.1109/TE.2011.2140372), catalogue **16 misconceptions about state** in sequential circuits; Herman, Loui, Kaczmarczyk & Zilles (2012), *ACM TOCE* 12(1), [doi:10.1145/2133797.2133800](https://doi.org/10.1145/2133797.2133800), describe Boolean-logic difficulties; the Digital Logic Concept Inventory (Herman, Loui & Zilles 2010, [doi:10.1145/1734263.1734298](https://doi.org/10.1145/1734263.1734298)) builds items from them.

**Plato design (today: the `circuit` element; students toggle switches on circuits the model lays out).**
- Add a **build mode**: a palette (the course's inventory: NAND first, then whatever the student has "unlocked", Nandgame-style), wires drawn by tapping two pins, and a check that runs when the student says they're done (`collect_page_work`): it evaluates every input combination and returns the first failing row. Construction is the step from *changing* to *constructing*.
- Tasks: (1) *POE on a given circuit*: "Both switches off. Predict the lamp, then flip A." (2) *Fill the truth table by experiment* (the `truth_table` diagram with blank output cells the student fills, then checked against the circuit). (3) *Build*: "NOT from one NAND" (L10), "a half adder", then L10's own challenge: "a full adder from two half adders and some other logic". (4) *Break it*: "Make the SR latch misbehave" (S = R = 1). (5) *Explain the feedback*: "Why does Q hold when S and R go back to 0?"
- Evidence: the student's circuit (verified exhaustively), the first failing input row, number of attempts, toggles before a prediction (a student who toggles everything before predicting is exploring, not predicting; log it).
- When: first contact (gates: POE + truth table), consolidation (build), transfer (build an unseen function from its truth table by sum-of-products, then simplify).

### 2.4 Timing diagram you can edit
**Evidence. Weak (design argument from the state misconceptions above).** Herman et al. (2011) found students confuse when outputs change (level versus edge), and treat state as if it updated instantly with inputs †.

**Plato design (new; today `waveform` is a static drawing).** The page draws `clk` and `D`; the student **draws Q** cycle by cycle (tap to toggle each half-cycle). The page checks against a simulation of the same circuit (the circuit element already simulates `dlatch` and `dff`). The key task is a **contrasting case**: the same `D` and `clk` drive a D latch and a D flip-flop; the student draws both Q traces, then explains where they differ (the latch is transparent while `clk` is high; the flip-flop samples only at the rising edge, L11). Evidence: the drawn Q per half-cycle, compared cell by cell; the error type (transparent-latch behaviour drawn for a flip-flop is the commonest). When: repair and consolidation for L11.

### 2.5 Assembly simulators (Venus, RARS, Ripes, the course's own)
**What exists.** Venus (UC Berkeley CS 61C; [github.com/kvakil/venus](https://github.com/kvakil/venus)): web-based RISC-V simulator with single-step **with undo**, breakpoints, and a memory view. RARS ([github.com/TheThirdOne/rars](https://github.com/TheThirdOne/rars)): the RISC-V successor of MARS (Vollmar & Sanderson 2006, SIGCSE †), with breakpoints, register and memory views and pseudo-instruction-to-machine-code display. Ripes (Petersen 2021, WCAE, [doi:10.1109/WCAE53984.2021.9707149](https://doi.org/10.1109/WCAE53984.2021.9707149)): a visual microarchitecture simulator, from single-cycle to 5-stage pipeline, with cache simulation. WebRISC-V (Giorgi & Mariotti 2019, [doi:10.1145/3338698.3338894](https://doi.org/10.1145/3338698.3338894)): browser-based pipeline view. **CS 3410 has its own in-browser simulator** with Run and Step showing registers (L15, L16, L18).

**Evidence. Weak.** Surveys compare features, not learning (Nikolić et al. 2009, *IEEE Trans. Educ.* 52(4), [doi:10.1109/TE.2008.930097](https://doi.org/10.1109/TE.2008.930097)). The best learning study is qualitative: Yehezkel, Ben-Ari & Dreyfus (2007), *Computer Science Education* 17(1), [doi:10.1080/08993400601165545](https://doi.org/10.1080/08993400601165545): the EasyCPU visualization "facilitated the use of improved study methods and enabled the construction of a viable mental model of the computer." The engagement findings in §1.1 apply directly: a stepper used only for viewing is a slow way to watch.

**Plato design (today: `trace` for RISC-V, computed by a small RV64 interpreter, and a RISC-V work zone with Run/Step/Reset).** Four additions:
1. **Prediction checkpoints** on chosen instructions (gated stepping, §1.1). The card names the checkpoint and the registers or memory cells to predict.
2. **"You're the CPU"** (§1.4): the register row is editable at a checkpoint; the page diffs it against the interpreter.
3. **Frames, not just cells**: label the stack region each `addi sp, sp, -k` creates ("sub's frame"), and the slot `0(sp)` with what was saved there (`ra`), so the stack becomes a picture of the call chain.
4. **Runaway mode**: today `run()` rejects a program that exceeds 200 instructions. The calling-convention bug the course teaches (L19: `sub` calls `add` without saving `ra`, "creating an infinite loop") is therefore unshowable. Allow a spec flag `expect_loop: true` that stops at the cap and reports "still running: `ret` in sub keeps jumping to itself." (Episode C, §8.3.)
- When: first contact (worked trace with checkpoints), repair (rewind to the step where the prediction diverged), consolidation (CPU mode), transfer (the student writes the function in the work zone; Plato steps *their* code).

---

## 3. Activity formats

### 3.1 Predict–Observe–Explain (POE)
**What it is.** Commit to a prediction, observe the real outcome, explain any gap (White & Gunstone 1992, *Probing Understanding* †). In programming it is the first two steps of PRIMM (Predict, Run, Investigate, Modify, Make).

**Evidence. Strong for prediction before a demonstration; moderate for POE as a full routine.**
- Crouch, Fagen, Callan & Mazur (2004), *Am. J. Physics* 72(6), [doi:10.1119/1.1707018](https://doi.org/10.1119/1.1707018): students who passively watched classroom demonstrations understood the concepts "no better than students who do not see the demonstration at all"; students who **predicted the outcome first** understood significantly more.
- Brod (2021), *Psychonomic Bulletin & Review* 28, [doi:10.3758/s13423-021-01904-1](https://doi.org/10.3758/s13423-021-01904-1): prediction works beyond plain retrieval because it creates **surprise** at unexpected outcomes, which focuses attention on the correct answer and strengthens its encoding. So the prediction has to be committed and specific, and the reveal has to follow at once.
- Sentance, Waite & Kallia (2019), *Computer Science Education* 29(2–3), [doi:10.1080/08993408.2019.1608781](https://doi.org/10.1080/08993408.2019.1608781): PRIMM in 13 schools (493 students aged 11–14) beat a control group on the post-test (quasi-experimental).
- Byrne et al. (1999) (§1.1): prediction carried the benefit of algorithm animations.

**Plato design. POE is the default wrapper for every simulator and stepper card.**
- **P**: Plato poses one question the element can settle, in one sentence, and stops. The student commits by voice, by typing, or by setting the element (cells, bits, a drawn Q trace). The page stores `prediction`; `confidence` comes from the student's own words (hedges such as "I think", or a spoken "how sure?" when it matters), never from a button. Confidence matters: a confident wrong prediction is the case where surprise is largest, and the error most needs a delayed re-check (`deep-understanding.md` §1.5).
- **O**: the student presses Run or Step themselves (ownership), or the page reveals.
- **E**: if prediction ≠ outcome, Plato asks "What did your version assume that the machine didn't?" and waits. If they match, it asks for the reason once, briefly ("Why 41 and not 34?"), so a lucky guess is not credited.
- Evidence: prediction, confidence, outcome, explanation (transcript), and an error-signature tag from the card's If-branches.
- When: first contact (prediction from intuition, then the reveal), repair (the main tool), transfer (predict on a variant before running).
- Voice note: in a voice session the reveal is visual, so Plato must not talk over it. It says nothing between the student pressing Run and the result appearing, then asks the E question.

### 3.2 Parsons problems
**Evidence. Moderate.** (Summarized in `course-decomposition.md` §6.3; the key studies are re-checked here.)
- Parsons & Haden (2006), ACE: the original puzzles, with distractor lines built from common errors.
- Ericson, Margulieux & Rick (2017), Koli Calling, [doi:10.1145/3141880.3141895](https://doi.org/10.1145/3141880.3141895): 2D Parsons problems with distractors took significantly less time than fixing or writing equivalent code, with no difference in learning one week later.
- Ericson, Foley & Rick (2018), ICER, [doi:10.1145/3230977.3231000](https://doi.org/10.1145/3230977.3231000): **adaptive** Parsons problems (made easier within a problem when the learner struggles, and harder or easier across problems) were more efficient than and as effective as writing code.
- Weinman, Fox & Hearst (2021), CHI, [doi:10.1145/3411764.3445228](https://doi.org/10.1145/3411764.3445228): **faded** Parsons problems (rearrange lines *and* fill in blanked parts) beat code writing and code tracing for learning programming patterns in a 237-student classroom study, and were preferred.
- Ericson et al. (2022–2023) ITiCSE working groups: a systematic review and multi-institutional studies, [doi:10.1145/3587103.3594211](https://doi.org/10.1145/3587103.3594211).

**Plato design (new element: a drag-to-order block list with optional blanks).**
- Best fit in CS 3410: **function prologues and epilogues** (L19), **loops in assembly** (L18), and **bit-packing sequences** (L07: shift, mask, combine). Distractors are paired misconceptions: `sd ra, 0(sp)` placed *before* `addi sp, sp, -16`; `ld ra, 0(sp)` versus L19's own typo `sd ra, 0(sp)` in the epilogue; `addi sp, sp, 16` versus `addi sp, sp, -16` at the end; `lw` versus `lwu` for an `unsigned`.
- Faded variant for consolidation: `addi sp, sp, ___` (the student must compute the frame size, rounded up to 16, L19's alignment rule).
- Voice: "Put these in order so sub still returns to main. One block doesn't belong." Then silence. On "done", `collect_page_work`. Plato responds to the *first* misplaced block only, as a question ("What's in `0(sp)` at the moment this line runs?").
- After ordering, the student presses Run: the ordered code goes to the RISC-V stepper, so the verdict comes from the machine, not from Plato.
- Evidence: final order, which distractor was chosen (diagnosis), number of moves, time.
- Engagement: responding/constructing (low cost). When: consolidation of a procedure after a worked example; adaptive mode when the student is stuck writing from scratch (Hou, Ericson & Wang 2022 used Parsons problems as on-demand scaffolds for write-code problems †).

### 3.3 Explain in plain English, and reading code before writing it
**Evidence. Moderate (correlational and longitudinal, replicated; a few experiments).**
- Lister et al. (2004), ITiCSE working group, [doi:10.1145/1041624.1041673](https://doi.org/10.1145/1041624.1041673): many students across seven countries could not predict the output of short code or choose the right completion of near-complete code at the end of CS1.
- Lopez, Whalley, Robbins & Lister (2008), ICER, [doi:10.1145/1404520.1404531](https://doi.org/10.1145/1404520.1404531): tracing and explain-in-plain-English (EiPE) performance correlated with code writing; a path model put "explain in English", Parsons puzzles and tracing iterative code as intermediate levels between knowing constructs and writing. Venables, Tan & Lister (2009), ICER, [doi:10.1145/1584322.1584336](https://doi.org/10.1145/1584322.1584336), broadly replicated it (the two question types explained 46% of writing variance in Lopez et al.).
- Whalley et al. (2006), ACE: using SOLO, students tend to explain code line by line (*multistructural*) where experts give its purpose (*relational*). Murphy, McCauley & Fitzgerald (2012), SIGCSE, [doi:10.1145/2157136.2157249](https://doi.org/10.1145/2157136.2157249): replication; EiPE answers expose "fragile knowledge" later into the term than instructors expect.
- Lister (2011), ACE: neo-Piagetian stages explain why novices who cannot yet trace reliably make little use of diagrams and code unsystematically.
- Reading-first works when taught explicitly: PLTutor (§1.4); Xie et al. (2019), *Computer Science Education* 29(2–3), [doi:10.1080/08993408.2019.1565235](https://doi.org/10.1080/08993408.2019.1565235), theory of instruction with four skills taught in order (tracing, writing syntax, comprehending templates, writing with templates) improved completion, error rates and explanations.
- Grading: Smith & Zilles (2024), ITiCSE, [doi:10.1145/3649217.3653582](https://doi.org/10.1145/3649217.3653582): **code-generation-based grading**: an LLM writes code from the student's plain-English explanation and the code is run against tests; moderate agreement with human graders, mainly too lenient with explanations that were vague.

**Plato design.**
- Task: a short snippet on the page (C or RISC-V), and one spoken ask: "In one sentence, what does this compute? Not line by line." Example from L16/L17: `slli t0, a1, 3; add t0, a0, t0; ld a0, 0(t0)`. Relational answer: "returns `a[i]` for 8-byte elements"; multistructural: "shifts a1 by 3, adds a0, loads."
- Check, two ways: (1) the director classifies the answer as relational, multistructural or wrong against the card's stored answers (`course-decomposition.md` §6.2); (2) Smith & Zilles's check: generate code from the student's sentence, run it and the original on the same inputs in the sandbox, and compare. A vague sentence produces code that fails some test, which Plato can turn into a question ("Your version also works when i is negative. Does theirs?").
- Response to a multistructural answer: "That's what each line does. If this were a C function, what would its name be?"
- Engagement: constructing (and, if said to the classmate persona, presenting). When: consolidation after tracing is reliable; transfer (EiPE on code they have never seen, e.g., a loop from L18).
- Ordering rule: do not ask a student to write a construct they cannot yet trace and explain. Tracing (§3.4) → EiPE → Parsons (§3.2) → write.

### 3.4 Tracing tables
**Evidence. Moderate** (Xie et al. 2018 experiment; Cunningham et al. 2017 replication; Hertz & Jump 2013 quasi-experiment; §1.5). Students who sketch traces succeed more often, incomplete sketches don't help (Cunningham et al. 2017), and annotation level relates to reasoning level (Whalley, Prasad & Kumar 2007, ACE, "Decoding doodles").

**Plato design (new element: a trace table work zone).**
- Columns are the watched variables or registers (from the card); one row per executed line; the student fills cells; the page checks each completed row against the C sandbox or RISC-V interpreter **and marks the first wrong cell only** (one error at a time, so the student keeps doing the tracing).
- Xie et al.'s strategy, said once at first use: "Go line by line. After each line, update the table. Never skip a line in your head."
- Voice: "Fill the table for the loop. Tell me when you're through the second pass." Silence while they work; respond to the first wrong cell with a question about that line.
- Evidence: per-cell correctness, the line where tracing first diverges (diagnostic: e.g., `i` updated before the body; `bne` taken when equal), completeness (a skipped row is the "incomplete sketch" signal).
- Engagement: constructing. When: first contact with loops and pointer code (with heavy support), consolidation, and as the step the student falls back to after an EiPE or Parsons failure.

### 3.5 Subgoal-labelled worked examples
**Evidence. Moderate, with a real boundary.**
- Catrambone (1998), *J. Exp. Psych.: General* 127(4), [doi:10.1037/0096-3445.127.4.355](https://doi.org/10.1037/0096-3445.127.4.355): a label for a group of steps helped learners form subgoals and solve novel problems needing new steps for the same subgoals; abstract labels beat superficial ones.
- Margulieux, Guzdial & Catrambone (2012), ICER, [doi:10.1145/2361276.2361291](https://doi.org/10.1145/2361276.2361291): subgoal-labelled materials improved performance on novel App Inventor tasks. Margulieux & Catrambone (2016), *Learning & Instruction* 42, [doi:10.1016/j.learninstruc.2015.12.002](https://doi.org/10.1016/j.learninstruc.2015.12.002): labels helped in expository text and in worked examples.
- **Boundary 1**: Morrison, Margulieux & Guzdial (2015), ICER, [doi:10.1145/2787622.2787733](https://doi.org/10.1145/2787622.2787733): in a text-language task, gains from *given* labels did not replicate as expected; results depended on other features of the materials.
- **Boundary 2**: Margulieux, Morrison & Decker (2020), *IJ STEM Education* 7, [doi:10.1186/s40594-020-00222-7](https://doi.org/10.1186/s40594-020-00222-7): over a semester (265 students), subgoal instruction improved **quizzes** (within a week) but **not exams**; withdrawal and failure fell.
- **Constructing labels**: Margulieux & Catrambone (2019), *JLS* 28(1), [doi:10.1080/10508406.2018.1491852](https://doi.org/10.1080/10508406.2018.1491852): self-explaining subgoals beat receiving them only when learners got **hints about the subgoals or correct explanations as feedback**.

**Plato design.**
- A worked example on the page with collapsible subgoal bands, using **stable labels** across every example of the procedure. For L19 functions: *Allocate frame → Save `ra` and any `s` registers → Body → (before a call) place arguments, save live `t` registers → Call → (after) restore, read `a0` → Restore saved registers → Free frame → Return*.
- Faded sequence over a session: (1) labels given, the student explains why each band is there; (2) bands drawn but **unlabelled**: the student names each (with hints from the label vocabulary, per Margulieux & Catrambone 2019); (3) labels given, code blank: the student writes each band; (4) a novel function with no scaffold.
- Voice: "This band is new. What job does it do for sub?" The label vocabulary sits in the element as draggable labels (direct manipulation, not buttons), which is the "hint" condition.
- Evidence: label accuracy per band; whether the student reuses labels unprompted on a new function (the transfer signal that quizzes catch and exams miss).
- When: first contact for procedures (L18 loops, L19 calls, L06 float conversion's three steps); consolidation by fading. Because the 2020 result shows quiz-not-exam gains, the director must schedule a **delayed, unscaffolded** retest (§4 of `deep-understanding.md`).

### 3.6 Erroneous examples and error-finding
**Evidence. Moderate; effects are often delayed, and prior knowledge moderates them.**
- Große & Renkl (2007), *Learning & Instruction* 17(6), [doi:10.1016/j.learninstruc.2007.09.008](https://doi.org/10.1016/j.learninstruc.2007.09.008), [ERIC EJ780439](https://eric.ed.gov/?id=EJ780439): mixing correct and incorrect worked solutions improved **far transfer for learners with good prior knowledge**; learners with poor prior knowledge did better with correct examples only. Replicated in a second experiment.
- McLaren, Adams & Mayer (2015), *IJAIED* 25, [ERIC EJ1078813](https://eric.ed.gov/?id=EJ1078813): middle-schoolers who found, explained and fixed errors in web-based decimal problems did no better immediately, but **better a week later** (d = 0.33 on gains, N = 390), replicating Adams et al. (2014). The problem-solving group *liked* its version more.
- McLaren, Adams, Mayer & Forlizzi (2017), *IJGBL* 7(1), [ERIC EJ1119846](https://eric.ed.gov/?id=EJ1119846): **Decimal Point**, a game built around erroneous examples and misconception-targeted mini-games, beat a conventional computer-based version (d = 0.43 immediate, 0.37 delayed), was rated far more enjoyable (d = 0.95), and helped low-prior-knowledge students most.
- Durkin & Rittle-Johnson (2012), *Learning & Instruction* 22(3), [ERIC EJ955374](https://eric.ed.gov/?id=EJ955374): **comparing** an incorrect example with a correct one beat comparing two correct ones, reduced misconceptions, and did *not* depend on prior knowledge. Booth, Lange, Koedinger & Newton (2013), *Learning & Instruction* 25, [ERIC EJ1003563](https://eric.ed.gov/?id=EJ1003563): in the Algebra Cognitive Tutor, incorrect examples with self-explanation prompts especially helped conceptual understanding.
- Null result to respect: van Peppen et al. (2021), *Instructional Science*, [ERIC EJ1316790](https://eric.ed.gov/?id=EJ1316790): no advantage of contrasting correct and erroneous examples for critical-thinking tasks.
- Reconciling: the error must be **flagged as an error and paired with the correct version** for novices (Durkin & Rittle-Johnson), and left for the student to *find* only once they have the model (Große & Renkl).

**Plato design.**
- Element: a code or work card labelled "a classmate's solution" (or, honestly, "your notes' sketch"), with a find-and-fix task. The page lets the student tap the faulty line and type the fix; the fix runs in the sandbox or stepper.
- **CS 3410 has authentic erroneous examples in its own notes** (`teaching-design.md` §2.5): L19's epilogue "restores" with `sd ra, 0(sp)` (must be `ld`); L16 translates signed `/ 2` as `srai` (wrong for negative odd values); L18's `accum` declares `int A_i` for a pointer. These are perfect error-finding items for a student who already has the model, and they double as trust-builders.
- Novice version (low prior knowledge): show the wrong and the right version side by side, error flagged, and ask "What does the wrong one assume?" Expert version: one version, unflagged, "Something here is wrong. Find it, then prove it with a run."
- Error items are generated from the misconception catalogue: each misconception produces a plausible solution that it would write (sign-magnitude decode of `1101` as −5; `ptr = 41` for `*ptr = 41`; non-leaf function without saving `ra`).
- Evidence: found (Y/N), the line chosen, the fix, the explanation of *why* it was wrong (the conceptual part), time to find.
- When: repair (paired version), consolidation and transfer (unflagged). Schedule a delayed re-check, since the gains show up late (McLaren et al. 2015).

### 3.7 Contrasting cases and comparing solutions
**Evidence. Strong for comparison in general; moderated by prior knowledge.**
- Schwartz & Bransford (1998), *Cognition & Instruction* 16(4), [ERIC EJ582423](https://eric.ed.gov/?id=EJ582423): analysing contrasting cases first creates the differentiated knowledge that lets students learn from a later lecture ("a time for telling").
- Schwartz, Chase, Oppezzo & Chin (2011), *J. Educ. Psych.* 103(4), [ERIC EJ952343](https://eric.ed.gov/?id=EJ952343): inventing a formula from contrasting cases *before* being told it matched tell-then-practice on routine problems but produced better grasp of the deep (ratio) structure and more transfer to unrelated topics with the same structure; it helped low and high achievers.
- Rittle-Johnson & Star (2007), *J. Educ. Psych.* 99(3), [ERIC EJ772031](https://eric.ed.gov/?id=EJ772031): comparing solution methods side by side beat studying them one at a time for procedural knowledge and flexibility. Rittle-Johnson & Star (2009), [ERIC EJ861179](https://eric.ed.gov/?id=EJ861179): comparing *methods* on the same problem was best; comparisons help most when examples differ on relevant features.
- Rittle-Johnson, Star & Durkin (2009), [ERIC EJ860917](https://eric.ed.gov/?id=EJ860917): students without the basic method learned more from sequential study or from comparing problem types than from comparing methods. **Comparison needs enough prior knowledge to see what differs.**
- Alfieri, Nokes-Malach & Schunn (2013), *Educational Psychologist* 48(2), [doi:10.1080/00461520.2013.775712](https://doi.org/10.1080/00461520.2013.775712): meta-analysis; case comparison beats single cases or sequential study †(d ≈ 0.50), larger when learners are asked to find similarities and when principles are given *after* the comparison.
- In CS: Patitsas, Craig & Easterbrook (2013), ICER, [doi:10.1145/2493394.2493409](https://doi.org/10.1145/2493394.2493409): comparing algorithms side by side improved learning over sequential presentation †.

**Plato design (new: a two-pane "same but different" layout; any element can be doubled).**
- The two panes differ in **exactly one relevant feature**, and are linked (stepping one steps the other). The student's task: predict both, run both, then state the one difference *and why it matters*. CS 3410 pairs:

| Pair | The one difference | The idea it isolates |
|---|---|---|
| `*ptr = 20;` vs `ptr = &y;` (L08's own program) | write through the pointer vs re-aim it | a pointer is a variable; `*` names the target |
| `lb` vs `lbu` on byte `0x9c` (L16) | sign- vs zero-extension | the same bits, two readings |
| `srai` vs `srli` on −3410 | arithmetic vs logical shift | sign extension in shifts |
| `1101` under sign-magnitude vs two's complement | the top bit's weight (−1× sign vs −8) | why two's complement wins (one adder) |
| D latch vs D flip-flop on the same `D`, `clk` (L11) | level- vs edge-triggered | when state changes |
| `sub` with vs without saving `ra` (L19) | 2 lines | why `ra` needs a stack |
| `blt` vs `bltu` with `a0 = −1, a1 = 1` | signed vs unsigned compare | interpretation lives in the instruction |
| `int courses[7]` vs `int* p` under `sizeof` | array vs pointer | "arrays are *mostly* just pointers" |

- Voice: "Same code, one line different. Predict both, then tell me what the difference does." Plato then asks a similarity question as well ("What's the same in both?"), which Alfieri et al. found helpful, and states the general principle only *after* the student has named the difference (Schwartz's "time for telling").
- Prior-knowledge gate: if the student cannot yet work one case, run it alone first (Rittle-Johnson et al. 2009).
- Evidence: both predictions; the named difference; whether the principle the student states generalizes (Plato tests it on a third case).
- When: repair (the contrast *is* the repair for flawed models), consolidation, and as a pre-lecture "preparation for future learning" activity before reading the notes' section.

### 3.8 Interleaved practice: choosing which procedure applies
**Evidence. Strong in mathematics; moderate generalization.**
- Rohrer & Taylor (2007), *Instructional Science* 35, [ERIC EJ786797](https://eric.ed.gov/?id=EJ786797): mixed practice beat blocked practice on a one-week test.
- Rohrer, Dedrick & Stershic (2015), *J. Educ. Psych.* 107(3), [ERIC EJ1071568](https://eric.ed.gov/?id=EJ1071568): interleaving in real 7th-grade classes over three months. Its stated mechanism: interleaving "requires students to choose a strategy on the basis of the problem itself, as they must do ... on a comprehensive examination."
- Rohrer, Dedrick, Hartwig & Cheung (2020), *J. Educ. Psych.* 112(1), [ERIC ED595322](https://eric.ed.gov/?id=ED595322) (preprint): a **pre-registered cluster RCT** in 54 classes; one month later, interleaved 61% vs blocked 38%, **d = 0.83**.
- Rohrer (2012), *Educational Psychology Review* 24, [ERIC ED536926](https://eric.ed.gov/?id=ED536926): interleaving helps learners **distinguish similar concepts**. Brunmair & Richter (2019), *Psychological Bulletin* 145(11), [doi:10.1037/bul0000209](https://doi.org/10.1037/bul0000209): meta-analysis, overall benefit †(g ≈ 0.42), larger when categories are similar and hard to tell apart, absent or reversed for some materials (e.g., expository text).

**Plato design.**
- Sets of short items mixed **across topics that get confused**, where the first question is always "which kind is this?" before solving. CS 3410 discrimination sets: which load (`lb`/`lbu`/`lw`/`lwu`/`ld`) for a C expression; which register class to use or save (`t`/`s`/`a`/`ra`) for a variable live across a call; signed or unsigned reading for a given bit pattern and instruction; latch or flip-flop for a timing behaviour; normal, denormal, ∞ or NaN for a float pattern.
- Voice: "Before solving: is this a signed or an unsigned problem? How do you know?" Evidence: classification accuracy separately from solution accuracy. A student who solves correctly once told the type but misclassifies has a *discrimination* gap, not a procedure gap; the director should give more contrasts (§3.7), not more practice.
- When: consolidation and transfer, spaced across sessions; never at first contact (blocked practice first while the procedure forms).

---

## 4. Learning by teaching

### 4.1 Teachable agents: Betty's Brain
**What it is.** Students teach "Betty" by building a causal concept map (e.g., of a river ecosystem); Betty answers questions by reasoning over the map *exactly as taught*, takes quizzes graded by a mentor agent, and her mistakes send the student back to the sources to fix the map (Biswas, Leelawong, Schwartz & Vye 2005, *Applied AI* 19(3–4), [doi:10.1080/08839510590910200](https://doi.org/10.1080/08839510590910200); Leelawong & Biswas 2008, *IJAIED* 18 †).

**Evidence. Moderate.** Biswas, Segedy & Bunchongchit (2016), *IJAIED* 26, [ERIC EJ1091349](https://eric.ed.gov/?id=EJ1091349): ten years of classroom studies show the learning-by-teaching frame engages students and helps them learn, **but** many students struggle with the self-regulation it demands (reading, building and checking the map), which led to adaptive scaffolding. The key design features are that the agent's behaviour is a **faithful, inspectable consequence of what the student taught**, and that the student sees the agent perform afterwards.

### 4.2 The protégé effect
**Evidence. Moderate.** Chase, Chin, Oppezzo & Schwartz (2009), *J. Science Education & Technology* 18, [ERIC EJ855299](https://eric.ed.gov/?id=EJ855299): with identical software, students who believed they were teaching their agent spent more time on learning activities and learned more than students who believed they were learning for themselves, **most of all lower-achieving students**. Students treated the agent socially, attributed mental states and responsibility to it, and acknowledged errors more readily. The agent was obviously software; the effect does not depend on deception.

### 4.3 Expecting to teach versus actually explaining
**Evidence. Moderate to strong (one meta-analysis; a run of controlled experiments).**
- Kobayashi (2019), *Japanese Psychological Research* 61(3), [doi:10.1111/jpr.12221](https://doi.org/10.1111/jpr.12221): meta-analysis of 28 studies: preparing to teach, g = 0.35; preparing and then teaching, **g = 0.56**; benefits held for deep learning and after a delay, and were larger when the teaching was **interactive** (and even when interactive teaching was merely expected).
- Fiorella & Mayer (2013), *Contemporary Educational Psychology* 38(4), [doi:10.1016/j.cedpsych.2013.06.001](https://doi.org/10.1016/j.cedpsych.2013.06.001), and (2014), 39(2), [doi:10.1016/j.cedpsych.2014.01.001](https://doi.org/10.1016/j.cedpsych.2014.01.001): expecting to teach improved an immediate test; **actually explaining** (a short video lecture) was what preserved the advantage on a one-week delayed test †. Expectancy organizes study; explaining builds the knowledge.
- Fiorella & Kuhlmann (2020), *J. Educ. Psych.* 112(4), [ERIC EJ1249841](https://eric.ed.gov/?id=EJ1249841): teaching a fictitious peer on video by **explaining and drawing** beat explaining only (d = 0.99) and drawing only (d = 0.65) a week later; all teaching conditions beat restudy (d 0.80–1.46). Drawing made the oral explanations more elaborative. Fiorella (2022), *Applied Cognitive Psychology*, [ERIC EJ1349080](https://eric.ed.gov/?id=EJ1349080): explaining after video pauses beat restudy on transfer (d = 0.47); giving students the lecture's visuals while they explained made explanations more complete but did not improve transfer ("a crutch more than a scaffold").
- Wang, Lin & Chen (2021), *BJEP*, [ERIC EJ1315300](https://eric.ed.gov/?id=EJ1315300): with 597 secondary students, *imagined* teaching improved immediate and delayed comprehension; face-to-face peer teaching improved only immediate comprehension.
- Roscoe & Chi (2007), *Review of Educational Research* 77(4), [ERIC EJ782047](https://eric.ed.gov/?id=EJ782047): tutors learn through **knowledge-building** (monitoring their own understanding, integrating, generating inferences) but show a pervasive **knowledge-telling bias**, reciting rather than reasoning; tutee questions that demand reasoning are what pull tutors into knowledge-building.
- Recursive feedback: Okita & Schwartz (2013), *JLS* 22(3), [doi:10.1080/10508406.2013.807263](https://doi.org/10.1080/10508406.2013.807263), and Okita, Turkay, Kim & Murai (2013), *Computers & Education* 63, [ERIC EJ1007905](https://eric.ed.gov/?id=EJ1007905): tutors who **watched their pupil apply what they taught** to new questions learned more than tutors who taught without seeing that.
- SimStudent: Matsuda et al. (2013), *J. Educ. Psych.* 105(4), [ERIC EJ1054420](https://eric.ed.gov/?id=EJ1054420): in three classroom studies of teaching an algebra-learning agent, tutor learning tracked the **accuracy of the tutor's feedback, the quality of their explanations, and their problem selection**. Shahriar & Matsuda (2021), AIED, [doi:10.1007/978-3-030-78292-4_32](https://doi.org/10.1007/978-3-030-78292-4_32): tutee follow-up questions ("can you clarify what you said?") prompt tutors to explain more deeply †.

### 4.4 Peer instruction: why discussion helps
**Evidence. Strong** (large multi-year datasets; a clean causal test; replicated in computing, including computer architecture).
- Crouch & Mazur (2001), *Am. J. Physics* 69(9), [ERIC EJ652839](https://eric.ed.gov/?id=EJ652839): ten years of Peer Instruction (vote, discuss with neighbours, revote) improved conceptual reasoning and quantitative problem solving.
- Smith, Wood, Adams, Wieman, Knight, Guild & Su (2009), *Science* 323, [doi:10.1126/science.1165919](https://doi.org/10.1126/science.1165919): after discussion, students answered a **new isomorphic question** individually. Gains held, so discussion builds understanding rather than copying, "even when none of the students in a discussion group originally knows the correct answer."
- Smith, Wood, Krauter & Knight (2011), *CBE–Life Sciences Education* 10(1), [ERIC EJ923404](https://eric.ed.gov/?id=EJ923404): **peer discussion followed by instructor explanation** beat either alone, for weak, medium and strong students.
- Computing: Porter, Bailey Lee, Simon & Zingaro (2011), ICER, [doi:10.1145/2016911.2016923](https://doi.org/10.1145/2016911.2016923), replicated the isomorphic-question result; Porter, Bailey Lee & Simon (2013), SIGCSE, [doi:10.1145/2445196.2445250](https://doi.org/10.1145/2445196.2445250), found fail rates roughly halved across four CS courses †(about 61% lower); Lee, Garcia & Porter (2013), *ACM TOCE* 13(3), [doi:10.1145/2499947.2499949](https://doi.org/10.1145/2499947.2499949), built a PI curriculum for **Computer Architecture**.

### 4.5 Agents that hold misconceptions, and LLM tutees
**Evidence. Moderate for designed peer agents; weak and early for LLM tutees.**
- Trialogues: Graesser, Li & Forsyth (2014), [ERIC ED566388](https://eric.ed.gov/?id=ED566388), and Graesser, Forsyth & Lehman (2017), [ERIC ED586945](https://eric.ed.gov/?id=ED586945): systems with a tutor agent *and* a peer agent use designs in which the human student corrects or teaches the peer, or watches the two agents disagree. D'Mello, Lehman, Pekrun & Graesser (2014), *Learning & Instruction* 29, [doi:10.1016/j.learninstruc.2012.05.003](https://doi.org/10.1016/j.learninstruc.2012.05.003): **contradictions between agents induced confusion, and confusion that was resolved improved learning** †(transfer), while unresolved confusion did not.
- Vicarious learning: Chi, Roy & Hausmann (2008), *Cognitive Science* 32(2), [ERIC EJ789293](https://eric.ed.gov/?id=EJ789293): pairs who *collaboratively observed* another student being tutored learned as much as the tutees themselves. Watching a learner's errors get worked on is itself instructive, if the observers talk about it.
- LLM tutees: Jin et al. (2024), CHI, [arXiv:2309.14534](https://arxiv.org/abs/2309.14534): an LLM's broad knowledge makes it a poor tutee, so **AlgoBo** restrains its knowledge with a prompting pipeline, simulates **prescribed misconceptions**, and asks "why" and "how" questions; its questions produced more knowledge-dense conversations (effect size 0.71; 40 novices). Ma et al. (HypoCompass), [arXiv:2310.05292](https://arxiv.org/abs/2310.05292): novices acting as TAs who diagnose an LLM agent's buggy code improved debugging 12% pre to post. Schmucker et al. (Ruffle & Riley), [arXiv:2310.01420](https://arxiv.org/abs/2310.01420): an LLM learning-by-teaching system was rated as more helpful, but post-test scores **did not differ** from simpler chatbots or reading (N = 100). A 2026 preprint documents the core risk: prompted "novice" LLMs **drift to expert-level explanations** mid-dialogue ([arXiv:2603.26142](https://arxiv.org/abs/2603.26142)).
- Weak versus strong companions: Uresti & du Boulay (2004), *IJAIED* 14(2) †: learners teaching a weak companion were not reliably better off than those working with a strong one; motivation and the student's own competence moderated it.

### 4.6 Plato design: Theo, the classmate with a bug
How a voice tutor has the student teach *it*. The pattern is domain-general; the CS 3410 version appears in Episode C (§8.3).

**When.** Consolidation, late repair and transfer: the student must already hold the model, or teaching becomes guessing (the knowledge-telling bias and the prior-knowledge boundary in §3.6). Never at first contact.

**Setup (one line, honest).** "Let me play a classmate, Theo. He's explaining this and he's got something wrong. See if you can straighten him out." The student knows Theo is Plato in a role; Betty's Brain shows that the protégé effect survives an obviously artificial pupil. Optional teaching expectancy at session start: "At the end you'll explain this to Theo" (Kobayashi: expectancy alone helps, interactive teaching helps more).

**What the director puts on the card (so Theo cannot drift, per AlgoBo and the drift preprint).**
- `misconception`: exactly one, from the catalogue (e.g., "two's complement: the top bit is just a minus sign").
- `theo_lines`: Theo's claim, his worked "solution" on the page, and the answers his model gives to likely probes (precomputed: under that model `1101` → −5, `1111` → −7, `1000` → "negative zero").
- `accept_when`: the causal elements a correction must contain before Theo changes his mind (e.g., "the top bit *weighs* −8; the other bits still add"; or a demonstration that his reading breaks the adder). Assertions ("the notes say so"), or the answer without the reason, get a "why?" back.
- `theo_probes`: two "why/how" follow-ups that push the student from telling to building (Roscoe & Chi; Shahriar & Matsuda): "But why would the hardware do it that weird way?" "How do I do −3 + 3 in your way, then?"
- `transfer_item`: a new problem Theo will now attempt **by applying the student's explanation literally** (recursive feedback, Okita & Schwartz).

**The run (voice).**
1. Theo states his claim and does a worked item on the page (the student sees his "work", an erroneous example).
2. Plato goes quiet. The student explains, points and draws on the page, or runs the simulator to prove it. The page records what they touched.
3. Theo pushes back with one probe. If the student's answer meets `accept_when`, Theo updates; if not, Theo restates his view, unconvinced, in a way that shows *which* part he didn't get.
4. **Recursive feedback**: Theo solves `transfer_item` using the student's rule, out loud, step by step. If the rule was incomplete (e.g., "just make the top bit −8" taught without "the others stay positive"), Theo fails *in the way that rule predicts*, and the student has to repair their teaching. This is code-generation-based grading (§3.3) applied to explanations: a rule is tested by executing it.
5. Plato (as itself) closes: one-sentence statement of the principle, then an isomorphic item for the student **alone** (Smith et al. 2009, 2011: discussion, then an individual isomorphic question, then the tutor's explanation).

**Evidence logged.** Located the misconception (Y/N, turns taken); explanation coded as knowledge-building (mechanism, state, counterexample) or knowledge-telling (assertion, rule recitation); used the page as proof (ran the simulator, drew); Theo's transfer item result under the student's rule; the student's own isomorphic item afterwards.

**Variants.**
- *Peer-instruction duet*: the student answers a concept question; Theo answers differently with a plausible reason; they argue; then an isomorphic question alone; then Plato explains.
- *Teach the procedure*: the student dictates the steps (e.g., a function prologue); Theo writes exactly what was dictated into the work zone; Plato runs it. A failing run sends the student to debug their own teaching (Betty's quiz loop).
- *Two classmates disagree* (trialogue confusion, D'Mello et al.): Theo and a second persona give contradicting answers; the student adjudicates using the simulator. Use sparingly and always resolve the confusion in the same episode.

**Guardrails.** Theo holds one misconception, never more; he never corrects himself unprompted; he never mocks; the episode always ends with the correct model stated and tested on the student alone. In voice, every Theo turn is marked ("Theo:"), or voiced differently, so the student never mistakes Theo's claim for Plato's.

---

## 5. Generative drawing and mapping

### 5.1 Drawing to learn
**Evidence. Moderate to strong against weak controls; mixed against strong controls; guidance matters.**
- Van Meter & Garner (2005), *Educational Psychology Review* 17(4), [ERIC EJ732434](https://eric.ed.gov/?id=EJ732434): the founding review; drawing works through selecting, organizing and integrating (Mayer's SOI), and results depend on strategy support.
- Fiorella & Zhang (2018), "Drawing boundary conditions for learning by drawing", *Educational Psychology Review* 30(3), [ERIC EJ1186659](https://eric.ed.gov/?id=EJ1186659): against reading only or text-focused strategies (e.g., summarizing), creating drawings is **consistently** better for comprehension and transfer, at any level of guidance. Against other model-focused strategies (imagining) or **viewing instructor-provided illustrations**, effects are **mixed** and depend on guidance (training, partially provided illustrations).
- Schwamborn, Mayer, Thillmann, Leopold & Leutner (2010), *J. Educ. Psych.* 102(4), [ERIC EJ906635](https://eric.ed.gov/?id=EJ906635): drawing during reading beat reading only (transfer d = 0.91); **drawing accuracy during learning predicted later transfer (r = 0.57)**. Drawing is both generative *and prognostic*: the drawing is evidence.
- Fiorella & Kuhlmann (2020) (§4.3): drawing *while explaining* beat either alone.
- Ainsworth, Prain & Tytler (2011), *Science* 333, [doi:10.1126/science.1204153](https://doi.org/10.1126/science.1204153): drawing as a core practice in science learning (reasoning, representing, communicating). Wammes, Meade & Fernandes (2016), *QJEP* 69(9), [doi:10.1080/17470218.2015.1094494](https://doi.org/10.1080/17470218.2015.1094494): a robust drawing benefit for free recall over writing, not explained by depth of processing, imagery or picture superiority.
- CS: sketching traces predicts success (Cunningham et al. 2017; §1.5); ability to construct memory diagrams correlates with understanding (Holliday & Luginbuhl 2004); students who construct their own rough algorithm visualizations learn about as well as those viewing expert ones (Hundhausen & Douglas 2000, IEEE VL, [doi:10.1109/VL.2000.874346](https://doi.org/10.1109/VL.2000.874346) †).

### 5.2 Concept mapping
**Evidence. Moderate; construct from memory, don't copy.**
- Nesbit & Adesope (2006), *Review of Educational Research* 76(3), [doi:10.3102/00346543076003413](https://doi.org/10.3102/00346543076003413): 55 studies, 5,818 participants: constructing, modifying or studying concept maps was associated with better retention and transfer than many comparison activities, with small to large effects and much heterogeneity. Schroeder, Nesbit, Anguiano & Adesope (2018), *Educational Psychology Review* 30, [doi:10.1007/s10648-017-9403-9](https://doi.org/10.1007/s10648-017-9403-9): constructing maps helped more than studying given maps †.
- Karpicke & Blunt (2011), *Science* 331, [doi:10.1126/science.1199327](https://doi.org/10.1126/science.1199327): **retrieval practice beat elaborative concept mapping** (made with the text available), including on inference questions †. Blunt & Karpicke (2014), *J. Educ. Psych.* 106(3), [ERIC EJ1054476](https://eric.ed.gov/?id=EJ1054476): concept maps built **from memory** (retrieval-based mapping) were as good as written recall and better than restudy. O'Day & Karpicke (2021), [ERIC EJ1303740](https://eric.ed.gov/?id=EJ1303740): adding text-present mapping before retrieval added nothing over retrieval alone. **The active ingredient is retrieval plus organization, not the map format.**

### 5.3 Plato design: draw it, then check it
Today the page reads the student's handwriting and drawings (`backend/session/drawings.mjs`; `docs/drawing-shape-detection.md`). What is new is the protocol:
- **Draw from memory, then compare.** "Draw sub's stack frame right after its prologue. Mark where sp points and what's in each slot." The student draws; `collect_page_work`; the director scores the drawing against a rubric of required elements (for this item: sp at the frame's low end, `ra` at `0(sp)`, the frame 16 bytes, the caller's frame above). Plato then puts the model drawing **beside** the student's and asks one question about the first missing or wrong element. Schwamborn et al.'s prognostic finding means the rubric score is good evidence of understanding.
- **Guidance scales with the learner** (Fiorella & Zhang): novice → partially provided drawing (the frame outline drawn, slots blank); intermediate → labelled axes or boxes only; advanced → blank page.
- **Explain while drawing** (Fiorella & Kuhlmann): "Talk me through it as you draw." The transcript and the drawing are logged together; Plato stays silent unless asked.
- **Retrieval-based concept map at session end** (Blunt & Karpicke): "From memory, connect these five ideas: two's complement, sign extension, `lb`/`lbu`, `sra`, `blt`/`bltu`. Label each link." The director compares the links to the Study's concept graph; missing or wrong links become the next session's first questions.
- CS 3410 drawing items: the memory boxes after each line of L08's `ptr` program; the stack for `main → sub → add`; the SR latch with each wire's value for S = 1, R = 0; the float's three fields for −5.125; the single-cycle datapath path that `add` uses.
- When: consolidation (draw from memory), repair (compare to the model drawing), transfer (draw the state for an unseen program).
- Engagement: constructing (drawing), presenting (explaining it).

---

## 6. Explorable explanations

**The design ideas.**
- Bret Victor, ["Explorable Explanations"](http://worrydream.com/ExplorableExplanations/) (2011): text as "an environment to think in": **reactive documents** (change an assumption, see the consequences), **explorable examples** (manipulate a concrete instance), **contextual information** (check a claim in place). And, importantly: "The author must guide the reader, and provide a structure for the learning experience. Only then can the reader respond."
- Bret Victor, ["Up and Down the Ladder of Abstraction"](http://worrydream.com/LadderOfAbstraction/) (2011) †: understand a system by moving between a concrete instance, stepping it through time, controlling a parameter, and **abstracting over** the parameter (plotting the whole family of behaviours), then back down.
- Nicky Case, ["How I make an explorable explanation"](https://blog.ncase.me/how-i-make-an-explorable-explanation/) (2017): **start with a question** the reader comes to care about; **climb the ladder of abstraction** from a concrete hands-on experience, linking steps with "this happens, therefore that, but…"; **end with open questions** and a sandbox. Hub: [explorabl.es](https://explorabl.es/).

**Evidence. Weak for explorables as a genre; moderate for their ingredients.**
- Hohman, Conlen, Heer & Chau (2020), "Communicating with interactive articles", *Distill*, [doi:10.23915/distill.00028](https://doi.org/10.23915/distill.00028): there is "limited empirical evaluation of the effectiveness of interactive articles"; only a fraction of readers interact with non-static content; "interactivity may be distracting to readers or the functionality may go unused."
- Kim, Reinecke & Hullman (2017), CHI, [doi:10.1145/3025453.3025592](https://doi.org/10.1145/3025453.3025592): having readers **draw their prediction of a data trend before seeing it** improved recall and comprehension. The explorable's strongest proven move is POE.
- Rasch & Schnotz (2009), *Learning & Instruction* 19(5), [ERIC EJ845742](https://eric.ed.gov/?id=EJ845742): interactive pictures helped on one task and not another, and text-plus-pictures was less efficient than text alone. Interactivity is not a free benefit.
- Höffler & Leutner (2007), *Learning & Instruction* 17(6), [doi:10.1016/j.learninstruc.2007.09.013](https://doi.org/10.1016/j.learninstruc.2007.09.013): animations beat static pictures overall, more when the animation *represents* the changing process itself †(d ≈ 0.37).
- PhET simulations (the most-tested explorables): Banda & Nzabahimana (2021), *Phys. Rev. PER* 17, [ERIC EJ1327612](https://eric.ed.gov/?id=EJ1327612): 31 quasi-experimental and experimental studies give "robust evidence" for better conceptual understanding when simulations are integrated into active-learning activities.

**Plato design: the explorable card.**
- Today's `formula` diagram (variables with sliders and a live result; the AMAT example in `DIAGRAM_DATA`) is already a reactive document. The pattern generalizes: a **reactive element with a guiding question, a prediction, and an open question at the end**.
- Run it as Case's arc, in voice: (1) the question ("Why does adding 1e-8 to 1.0f change nothing, but adding it to 0.0f works?"); (2) a prediction; (3) the concrete control (an exponent slider on a float number line showing representable values and the gap between them); (4) climb: "Now drag through several exponents. What happens to the gap each time the exponent goes up by one?" (it doubles); (5) the student states the rule; (6) the open question: "So at what size do whole numbers stop being exact in a float?" (2²⁴).
- CS 3410 explorables: bit width *n* slider over the two's-complement wheel and the range (`INT_MIN`, `INT_MAX` move); the float gap explorer above; a clock-period slider over a timing diagram (setup-time violation appears when the period gets too short); stack-frame size versus alignment (`addi sp, sp, −k` rounded to 16).
- Evidence: the prediction, the parameter values explored (did they explore at all? the NYT finding says many won't, so Plato *asks* them to move the slider to specific values), and the stated rule.
- When: first contact (the question and the concrete instance), consolidation (climbing the ladder), transfer (the open question).

---

# Part III. The CS 3410 test case

## 7. Catalogue: interactive elements and activities for a systems course
Each row is an instance of the general schema (Part IV, `kind` in the last column). "Today" means the page has it now; "partly" means a base exists and the listed additions are new.

| # | Element / activity | Today? | Levels reached | Patterns | CS 3410 tasks | Evidence it emits | Moment | Schema kind |
|---|---|---|---|---|---|---|---|---|
| 1 | **RISC-V stepper with prediction checkpoints** | Partly: `trace` (RV64 interpreter, registers, touched memory, `sp`) and the RISC-V work zone (Run/Step/Reset, changed registers). New: gated checkpoints, "you're the CPU" editing, frame labels, **runaway mode** (`expect_loop`; today a program over 200 steps is rejected) | responding → constructing | B, C, D | loops (L18), loads/stores (L16), calls (L19) | per-checkpoint predicted vs actual registers/cells; CPU-mode diffs | first contact → consolidation | runnable |
| 2 | **Live memory diagram for C pointer code**, with an address-arithmetic strip | Partly: static `memory` diagram; C `trace` steps written by the model. New: computed from the C sandbox's printed run, **address face / arrow face**, byte view, editable cells, Jeliot-style strip for `*(p + i)` | responding → constructing | B, C, D | L08's `ptr` program, swap, arrays as `int*`, `p->x` | cell-level prediction diffs mapped to pointer misconceptions | first contact, repair | runnable |
| 3 | **C work zone** (sandbox) | Today (`CodeZone`, server sandbox). New: plain-English check by generating code from the student's sentence and testing it (Smith & Zilles 2024) | changing, constructing | B, C, D | predict-then-run; fix a broken program; EiPE | runs, edits, output vs prediction | consolidation, transfer | runnable |
| 4 | **Two's-complement number wheel** (drag labels, move the hand, show seams; width slider) | New (today only the static `bits` diagram) | constructing | B, C, E, G | decode/encode, overflow, sign-magnitude contrast | the label set the student builds (their model, written down), seam placement | first contact, repair | runnable |
| 5 | **Float bit flipper** with a gap readout and case badge | New (today only static `bits`) | changing, constructing | B, C | make 8.25 and −5.125 (L06); predict a low-bit flip at 1.0 versus 1024; find the smallest normal | final pattern, flips, first wrong field | consolidation, transfer | runnable |
| 6 | **Circuit sandbox** with build mode and truth-table fill | Partly: `circuit` (switches, gates, latches, `dff`, clock, live wires). New: palette build, exhaustive check on "done", first failing row | changing → constructing | B, C, D | NOT from NAND, half and full adder (L10), SR latch misbehaviour (L11) | circuit built, first failing row, toggles before predicting | first contact → transfer | runnable / construct |
| 7 | **Editable timing diagram** | Partly: static `waveform`. New: the student draws Q per half-cycle; checked against the circuit simulation | constructing | C, D, E | D latch versus D flip-flop on the same inputs | per-half-cycle Q, error type (transparent versus edge) | repair, consolidation | construct |
| 8 | **Stack frame you build by hand** | New: drag `ra`, `s` registers and spilled locals into 8-byte slots; choose the size; checks 16-byte alignment and offsets; emits the prologue and epilogue into the stepper | constructing | D, G | frames for `sub`, `myfunc`, recursive `nth` (L19) | slot layout, size, alignment errors, the run of the generated code | consolidation | construct |
| 9 | **Parsons / faded Parsons blocks** | New | responding → constructing | D | prologue/epilogue order, loops (L18), shift–mask–combine (L07) | order, distractor chosen (diagnosis), moves | consolidation | construct |
| 10 | **Trace table** | New (cells checked against sandbox or interpreter) | constructing | C, D | loops over arrays, pointer walks, string loops | first wrong cell, skipped rows | first contact, fallback rung | construct |
| 11 | **Compare panes** (two linked instances of any element) | New layout over existing elements | responding, constructing | E | the §3.7 pairs | both predictions, named difference, generalization on a third case | repair, discrimination | compare |
| 12 | **Find-the-bug card**, including the notes' own errata (`sd`/`ld` in L19's recap, `srai` for signed `/ 2` in L16, `int A_i` in L18) | New task mode on the code and LaTeX zones | responding → constructing | D, E | find, explain, fix, prove with a run | found, line, fix, explanation, time | repair (paired), transfer (unflagged) | construct |
| 13 | **Theo, the classmate with a bug** | New (actor role and card fields; no new UI) | presenting (interactive) | F | the three episodes below; misconceptions from the catalogue | located, explanation coding, Theo's transfer under the student's rule, solo isomorphic item | consolidation, transfer | persona overlay |
| 14 | **Draw-from-memory canvas** with a reference overlay; **retrieval concept map** | Partly: ink, eraser/clear, handwriting and drawing reading. New: rubric scoring, side-by-side reference, map-versus-concept-graph check | constructing, presenting | G | memory boxes, stack frames, latch wires, float fields; end-of-session map of the "bits are uninterpreted" spine | rubric score (prognostic), missing elements, links present or wrong | consolidation, retrieval | canvas |

Explorable sliders ride on items 4 and 5 (the existing `formula` diagram is already one): an *n*-bit width slider over the wheel's range, and an exponent slider over a float number line showing the gap doubling each binade (§6).

## 8. Three scripted mini-episodes
Conventions: **Board** is what the card puts on the page; PLATO and THEO lines are spoken (short, never reading code aloud); *[page]* is what the student does on the page; *[evidence]* is what the page and director log; *Why* ties the move to the evidence. Each card is one director move.

### 8.1 Episode A: two's complement on the number wheel, repairing "the top bit is a minus sign"
*Learner state:* has read L02; no evidence yet on decoding. *Elements:* `bits` (today), number wheel (new), the adder bits on the wheel.

**A1 · diagnose with a separating question** (`teaching-design.md` §3). Board: `1101` in a 4-bit box.
- PLATO: "One from your Numbers lecture. In four-bit two's complement, what's one-one-zero-one?"
- STUDENT: "Negative five. The first one means negative, and one-zero-one is five."
- PLATO: "And one-one-one-one?" — STUDENT: "Negative seven." — PLATO: "And a one with three zeros?" — STUDENT: "Negative zero? That's weird."
- *[evidence]* W1 (sign-magnitude reading) three times, consistent; confident on the first, unsure on `1000`.
- *Why:* one answer could be a slip; three consistent answers mean a flawed model, which needs a repair the student can watch fail (`deep-understanding.md` §1.2). The unease at "negative zero" is the crack to work on.

**A2 · run the model to a contradiction; the adder is the referee.** Board: column addition `1101 + 0011`, a carry row, an empty result.
- PLATO: "Your lecture says the adder ignores signs: it adds like unsigned and drops the carry out of the top. Under your reading, what's negative five plus three?"
- STUDENT: "Negative two."
- PLATO: "Now be the adder. Add them, drop the carry." *(silence)*
- *[page]* writes `1 0000`, crosses out the 1. *[evidence]* `collect_page_work` → "[Written on the page] 0000".
- PLATO: "The adder says zero; your reading says negative two. The adder is the hardware. What would one-one-zero-one have to be for zero to be right?"
- STUDENT: "If it plus three is zero… negative three."
- *[evidence]* contradiction recognized; −3 derived by the student, not told.
- *Why:* POE with the machine as referee (§3.1); the new value is the student's own inference.

**A3 · build the new labels on the wheel.** Board: the wheel: 16 positions with their patterns, unsigned labels outside, the signed ring blank, a "−3" chip.
- PLATO: "All sixteen patterns on a ring. Outside is the unsigned reading. Put negative three where it belongs on the inside."
- *[page]* drags −3 to `1101`.
- PLATO: "One click clockwise always adds one, in both rings. Fill in the other negatives." *(silence)*
- *[page]* places −2 at `1110`, −1 at `1111`, then −4 down to −8 at `1000`; first put −1 at `1001`, then moved it after noticing `1111` is one click before `0000`.
- STUDENT: "So one-zero-zero-zero is negative eight. There's no negative zero."
- *[evidence]* 8/8 placed, one self-corrected (−1); the label set is now the student's model, on the page.
- *Why:* constructing (§2.2); the wheel makes the modular structure visible.

**A4 · contrast with the old model.** Board: a third ring with the student's original labels (`1001` = −1 … `1111` = −7, `1000` = −0).
- PLATO: "Here's the reading you started with, on the same ring. Go clockwise through the negatives in both. What's different, and why would the adder care?"
- STUDENT: "Yours goes negative eight, seven… up to negative one, then zero. Mine runs the negatives backwards and has two zeros. So in mine, a step forward doesn't add one."
- PLATO: "That's why sign-magnitude needs extra circuitry, the part your lecture asks you to trust. In two's complement, one adder serves both readings."
- *Why:* incorrect-versus-correct pairing (Durkin & Rittle-Johnson 2012); the principle is told only after the student named the difference (Schwartz & Bransford 1998).

**A5 · connect to the notes' rule, then transfer.** Board: `bits` diagram of `1101` with place values −8, 4, 2, 1.
- PLATO: "Your lecture's shortcut: same place values, except the top bit weighs negative eight. Check it on one-one-zero-one."
- STUDENT: "Negative eight plus four plus one. Negative three."
- PLATO: "Six bits. What's one-one-one-zero-one-one?"
- STUDENT: "Negative thirty-two plus sixteen, eight, two, one… negative five."
- PLATO: "Your notes get there another way: it's four less than all ones. Back on the four-bit ring: zero-one-one-one plus one?"
- STUDENT: "One-zero-zero-zero. Negative eight. Seven plus one gave negative eight. It jumped the line between seven and negative eight."
- PLATO: "That jump is signed overflow. We'll come back to it."
- *[evidence]* weight rule applied; 6-bit transfer correct (L02's own example); the overflow seam found unprompted.

**A6 · close, with the boundary of the old idea.**
- PLATO: "So the top bit isn't a minus sign stuck on a number. It's a place worth negative eight. One catch: in floats, the top bit really is just a sign. Floats use sign-magnitude, which is why they have a negative zero."
- *[director]* θ(two's-complement decode) up, σ still wide; W1 was confident, so schedule an unannounced re-probe next session ("what's `1010`?") and interleave it with a float sign-bit item.
- *Why:* repair a misconception by marking where the idea *does* apply rather than eradicating it (knowledge in pieces; `deep-understanding.md` §1.1); confident errors come back without a delayed check.

### 8.2 Episode B: `*ptr = …` versus `ptr = …` with a live memory diagram
*Learner state:* has read L08; can declare and print pointers. *Elements:* live memory diagram (new) bound to L08's program, ground truth from the C sandbox's printed run (addresses below are the notes'; the page uses whatever the run prints); compare panes (new); C work zone (today).

**B1 · predict, with checkpoints.** Board: L08's program (the version with printouts 0–3) beside the memory diagram, address face: `y` at `…6bb8` = 10, `x` at `…6bbc` = 34, `ptr` (8 bytes) holding `…6bbc`.
```c
int x = 34;
int y = 10;
int* ptr = &x;
*ptr = 41;
ptr = &y;
*ptr = 20;
```
- PLATO: "This is the program from your Arrays and Pointers lecture. Before we run it: what will x and y be at printouts one and two?"
- STUDENT: "One: x is 41, y is 10. Two… x is 10? Because ptr points at y now, so x gets y's value?"
- *[evidence]* printout 1 correct; printout 2 matches signature P2 (`ptr = &y` read as copying through the pointer); hedged confidence.

**B2 · "you're the CPU" on the line that re-aims the pointer.** Board: the diagram, editable, in the state after `*ptr = 41` (x = 41).
- PLATO: "Let's test printout two the hard way. You're the machine. The next line is ptr equals address-of y. Change whatever that line changes." *(silence)*
- *[page]* types 10 into `x`'s box. *[evidence]* diff: changed `x` (should not); `ptr` unchanged (should become `…6bb8`).
- PLATO: "The machine changed a different box. Step it and watch which."
- *[page]* steps: `ptr`'s box flips from `…6bbc` to `…6bb8`; `x` stays 41.
- PLATO: "What's in ptr's box now, and what is that number?"
- STUDENT: "Six-b-b-eight. That's y's address. So ptr just points at y. x never changed."
- PLATO: "Which box does any plain assignment change?" — STUDENT: "The one named on the left. Here, ptr."
- *Why:* visual program simulation turns the student's model into an action the page can diff (§1.4); the conflict is the student's own (Ma et al. 2011).

**B3 · contrast panes, then strip the arrows.** Board: two linked diagrams from the same state (ptr → x, x = 41, y = 10); left runs `*ptr = 20;`, right runs `ptr = &y;`.
- PLATO: "Same starting boxes, one line each. Predict both, then give me the difference in one sentence."
- STUDENT: "Left: x becomes 20 and ptr still points at x. Right: only ptr changes, to y's address. Star ptr writes through the arrow; plain ptr moves the arrow."
- *[page]* runs both; both match.
- PLATO: "Turn the arrows off." *(the address face)* "Now how do you know where ptr points?"
- STUDENT: "The number in its box. It's just an address."
- PLATO: "That's your lecture's line: pointers are just bits, and star means go to that address and use what's there."
- *Why:* one-feature contrast (§3.7); the two faces of a pointer (§1.2).

**B4 · finish the program in the real machine.**
- PLATO: "Back to the program. Printout three?" — STUDENT: "x is 41, y is 20, and ptr is y's address."
- *[page]* the C work zone runs it in the sandbox; the output matches (with this run's addresses).

**B5 · transfer: the broken swap from the notes.** Board: L08's `void swap(int x, int y)` and its `main` (a = 34, b = 10) in the C work zone.
- PLATO: "Your notes say this swap doesn't work. Predict what main prints, then make it work."
- STUDENT: "34 10 both times; swap gets copies. It has to take addresses and write through them."
- *[page]* edits to `void swap(int* x, int* y) { int tmp = *x; *x = *y; *y = tmp; }` and `swap(&a, &b);`, runs: `34 10` then `10 34`.
- PLATO: "Inside swap, why star x on the left, not just x?"
- STUDENT: "x is a copy of the address. Assigning x would only move swap's copy of the arrow. Star x changes a itself."
- *[evidence]* transfer correct; explanation is causal (knowledge-building). *[director]* close with one sentence ("plain assignment changes the named box; star sends the write to the box at that address"); schedule `p->x = …` versus `p = …` with structs, and an `int**` swap, interleaved next session.

### 8.3 Episode C: the calling convention; the student finds the bug in Theo's nested call
*Learner state:* has worked through L19's `ra` and stack sections and the prologue/epilogue template (consolidation). *Elements:* RISC-V stepper with checkpoints and runaway mode (partly new), Theo (new persona), RISC-V work zone (today). *Card persona fields:* misconception "`ret` returns to whoever called you" (as if `ret` were a return primitive, not `jalr x0, 0(ra)`); `accept_when`: (1) `call` is `jal ra`, so it overwrites `ra`; (2) `sub`'s `ret` then jumps to its own address; (3) the fix parks `ra` in `sub`'s own frame.

**C1 · Theo presents.** Board: Theo's code (L19's example before stack frames) in the stepper; watched `a0`, `a1`, `ra`, `sp`; `expect_loop` on.
```
add:
  add  a0, a0, a1
  ret
sub:
  not  a1, a1
  addi a1, a1, 1
  call add
  ret
main:
  li   a0, 3
  li   a1, 4
  call sub
```
- PLATO: "Let me play a classmate. Theo wrote sub from your Calling Functions lecture, and he's sure it works. Convince him. The stepper is your evidence."
- THEO: "add leaves the answer in a-zero, so sub calls add and returns. Ret means go back to whoever called you. Done."

**C2 · the student finds it by predicting `ra`.**
- PLATO: "Before arguing: predict what's in ra right after main's call sub, and right after sub's call add. Line numbers are fine." *(silence)*
- STUDENT: "After call sub, ra is the line after it in main. After call add… the line after *that* call. Sub's ret. Oh."
- *[page]* two checkpoints; predictions match the interpreter. *[evidence]* bug located from a prediction, turn 1.

**C3 · teaching Theo, with proof.**
- STUDENT: "Theo, your call add overwrote ra. add returns to your ret, fine, but your ret jumps to ra, and ra is your own ret."
- THEO: "But ret goes back to whoever called sub. That's main."
- STUDENT: "Ret is just jump to whatever's in ra. There's one ra, and your call wrote over main's address."
- THEO: "Prove it."
- *[page]* runs; runaway mode stops at the cap: "Still running at the 200-step cap: `ret` in sub keeps jumping to itself. `a0` = −1."
- THEO: "It even got the right answer, negative one. It just never leaves."
- *[evidence]* explanation contains accept_when (1) and (2): knowledge-building; used the run as proof.
- *Why:* the pupil asks "why" and demands evidence, which pushes the tutor-student from telling to building (Roscoe & Chi 2007; AlgoBo).

**C4 · Theo's half-fix (a discrimination probe).**
- THEO: "Easy fix. I'll copy ra into t-zero before the call and jump back with jr t-zero." *[page]* Theo's version runs and ends correctly.
- THEO: "See? Works."
- STUDENT: "It works because add happens not to touch t-zero. But t registers are temporary. The callee may wreck them. If add ever used t-zero, you'd be looping again."
- THEO: "Then s-zero. Those are saved."
- STUDENT: "Saved by the callee, and for main, that's you. If you use s-zero you have to save main's s-zero first. Somewhere. That's the stack."
- *[evidence]* rejected a working-by-luck fix with the convention's reason; correct use of caller- versus callee-saved.

**C5 · Theo applies the student's rule literally (recursive feedback).**
- THEO: "Fine. Tell me exactly what to write and I'll write exactly that."
- STUDENT: "At the start, store ra at zero of sp. Before ret, load it back."
- *[page]* Theo writes that rule into a deeper program, where `f` and `g` both call (`main → f → g → h`, `h` a leaf):
```
g:
  sd   ra, 0(sp)
  call h
  ld   ra, 0(sp)
  ret
f:
  sd   ra, 0(sp)
  call g
  ld   ra, 0(sp)
  ret
```
- THEO: "Ran it your way." *[page]* runaway mode: "Still running: `ret` in f keeps jumping back into f's epilogue."
- PLATO: *(silent; the student's turn)*
- STUDENT: "They both saved into the same slot. g's save wiped out f's. Each call needs its own space: move sp down first, then store, and put sp back at the end."
- THEO: "How far down?" — STUDENT: "Sixteen. Eight for ra, rounded up for alignment."
- *[page]* Theo adds `addi sp, sp, -16` before and `addi sp, sp, 16` after; it terminates.
- *Why:* the pupil performs what it was taught (Okita & Schwartz 2013); an incomplete rule fails in exactly the way it predicts, so the student repairs their own teaching.

**C6 · the notes' typo.**
- THEO: "For the epilogue I copied the recap in the notes: restore with s-d ra."
- STUDENT: "That's a store. It writes the current ra over the saved one. Restoring is l-d."
- PLATO: "Right. The recap's sketch has s-d there, and it should be l-d. Good catch."
- *[evidence]* erroneous example found and explained (§3.6; `teaching-design.md` §2.5).

**C7 · close, then the student alone.**
- PLATO: "So ra holds one address at a time. A function that calls another parks its ra in its own frame: move sp, store, then undo both before ret. A leaf like add can skip it. Now yours alone: in your notes' myfunc, myvar sits in a-five across call add. What can you say about a-five after the call?"
- STUDENT: "Nothing. a-five is temporary; add can overwrite it. Keep myvar in an s register and save that, or spill it to the frame."
- *[evidence]* isomorphic item correct without Theo. *[director]* update θ for `ra`/stack frames and caller/callee-saved; schedule an interleaved "which registers must this function save?" set (§3.8) next session.

---

# Part IV. The general element schema

## 9. One schema for any subject
Every element in this brief, in every domain, is the same five things: a **state** the page holds, **controls** that change it, a **task** saying what the learner predicts or constructs, the **evidence** it emits, and the **use** the tutor makes of that evidence. The page implements the task layer once; each subject adds only an *engine* (the verifier plug-in that computes truth). This extends the contract the page already has: every `shared/elements/<kind>.mjs` module exports `{ purpose, rules, example, validate }`, the server and page both validate specs, and engines like `trace.run()` and the circuit's `evaluate()` compute state so that "the model never writes a register value." The schema adds the task layer and the evidence vocabulary on top.

### 9.1 The spec
```jsonc
{
  "kind": "stepper",              // engine plug-in: stepper | sim | graph | geometry | curves | circuit | proof | fbd |
                                  // mechanism | pathway | timeline | argmap | sorter | canvas | ...
  "state": { /* engine-specific initial state: code + registers; curve parameters; map nodes and edges; events */ },
  "views": ["code", "registers", "memory"],        // linked representations of ONE state (simultaneous linking)
  "controls": { "live": ["step", "edit:registers"], "locked": ["code"] },   // focused constraint
  "task": {
    "mode": "predict",            // predict | change | construct | compare | explain | teach | draw
    "ask": "Before you step: what's in ra after sub's call add?",          // the one sentence the actor says
    "checkpoints": [{ "at": "line 7", "predict": ["ra"] }],                 // gated reveals (predict mode)
    "target": null,               // construct: a goal state or property the engine's check() tests
    "rubric": null,               // draw / explain: required elements, each a short checkable statement
    "pair": null,                 // compare: { "with": "<element id>", "difference": "one relevant feature" }
    "persona": null               // teach: { "name", "misconception", "lines", "accept_when", "probes", "transfer_item" }
  },
  "signatures": [                 // the card's If-branches, keyed on page state, not just words
    { "when": { "checkpoint": 0, "ra": "unchanged" }, "misconception": "call-does-not-write-ra",
      "reply": "Ask which register jal writes." }
  ],
  "level": "responding",          // intended engagement level; the enacted one is logged separately
  "moment": "repair",             // first_contact | repair | consolidation | transfer
  "concepts": ["ra-single-register", "jal-semantics"]   // what the evidence updates in the learner model
}
```

### 9.2 What each engine must provide
| Function | Purpose | Exists today |
|---|---|---|
| `validate(spec)` | reject a spec the engine cannot run, with a message a model can act on | yes, every element |
| `run(spec)` or `step(state, action)` | compute states; the source of truth for reveals | `trace.run()`, circuit `evaluate()` |
| `check(state, target)` → `{ pass, first_failure }` | grade a construction; return only the first failure | new (circuit truth table, proof dependency graph, timeline order, market equilibrium, map support) |
| `diff(student_state, true_state)` | cell-level comparison for predictions and "be the machine" | new |
| `brief(state)` | a short text of the state for the director | yes, as `onWork({ brief })` in the work zones |

Engines by subject, cheapest first: `graph` (an expression evaluator with sliders; today's `formula` diagram already does this), `timeline`, `argmap` and `sorter` (graph structures, no physics), `curves` (a linear market solver), `stepper` (CS interpreters exist; a pathway is a state machine), `sim` (a small ODE integrator), `fbd` (vector sums), `mechanism` (conservation checks plus authored step sequences, since general chemistry is beyond a small engine).

### 9.3 The evidence vocabulary (identical for every element)
| Event | Fields | Emitted when |
|---|---|---|
| `shown` | element, intended level | the element appears |
| `predicted` | checkpoint, value, the student's words, hedges ("I think") | the student commits, by voice, typing anywhere, ink or setting the element |
| `revealed` | checkpoint, actual, match, diff | the student steps, runs or asks to see |
| `changed` | control, from, to | a live control moves (slider, switch, bit, curve) |
| `constructed` | artifact, `check` result, first failure, attempts | the student says "done" (`collect_page_work`) |
| `explained` | transcript span, coding: relational / multistructural / knowledge-building / telling | after an explain prompt |
| `taught` | persona, criteria met, turns, the persona's transfer result | during a Theo episode |
| `drawn` | rubric hits and misses, score | a drawing is collected |
| `signature` | misconception id, how matched (state or words) | any event matches a card signature |
| `enacted_level` | the highest level actually performed | when the element is retired |
| `time`, `hints` | durations, hints used | continuously |

### 9.4 How the tutor uses it
- **Learner model.** Each event updates θ/σ for the element's `concepts`, weighted by the *enacted* level: viewing counts for nothing; responding a little; constructing, explaining and teaching most. A `signature` raises the belief in that misconception.
- **Next move** (the director, first match wins):
  1. Misconception signature → a repair card: the matching contrast pair (E), "be the machine" (B/D), or a counterexample run (C).
  2. A correct prediction with no reason → "why that and not the other?" before crediting.
  3. A construction fails → a question about the first failure only; on a second failure, drop a rung (Parsons → trace table; free drawing → partial drawing).
  4. Constructing succeeds → climb: a transfer item, then Theo (F), then an unscaffolded item.
  5. A confident error, once repaired → schedule an unannounced delayed re-probe and interleave it with its confusable neighbours.
  6. Nothing was enacted (the student watched) → re-pose the task smaller; never credit.
- **Mastery** is credited only from enacted levels at or above responding, and only after at least one delayed or transfer item succeeds.

### 9.5 The same schema across subjects
| Domain | kind | State | Controls (live) | The learner predicts or constructs | Evidence | Tutor uses it to |
|---|---|---|---|---|---|---|
| CS (test case) | `stepper` | code, registers, memory | step; edit registers at checkpoints | `ra` after each `call` | predicted / revealed diffs; signatures | repair "ret returns to the caller" (Episode C) |
| Math | `graph` | *f(x) = a(x − h)² + k* | sliders *a, h, k*; ink to sketch | sketch *f(x − 2)* first; state the rule for *h* | sketch versus true curve; rule stated; rule tested on a new *f* | repair "subtracting moves it left" with a contrast pair (E) |
| Physics | `fbd` + `sim` | object, situation, motion | place force vectors; run the sim | the forces on a puck gliding on ice | missing or invented forces; net force versus motion | repair impetus via Theo (F) |
| Chemistry / Biology | `pathway` | metabolite pools, enzyme steps | step; add an inhibitor; raise a substrate | which pool grows when enzyme 3 is inhibited | per-step predictions; the step where tracking fails | target the bottleneck idea; then draw the pathway from memory (G) |
| Economics | `curves` | supply, demand, a tax wedge | shift curves; set the tax; ink to draw | draw the new equilibrium after a subsidy, then the solver shows it | shift versus movement errors; incidence explanation | contrast "tax on buyers versus on sellers" (E) |
| History | `argmap` + `sorter` | claim, sources with metadata, support links | sort sources; link evidence; toggle a source off | which claims survive removing the one partisan source | links, sourcing tags, claims defended after removal | teach sourcing and corroboration; Theo's "primary means reliable" (F) |
| Literature | `compare` over two text panes | the same scene from two narrators | highlight, tag evidence, link to a claim | how the narration changes what the reader knows | tagged evidence; interpretation stated with support | build an argument map of the interpretation (D) |

### 9.6 Build order (the lazy path)
1. **The task layer on the two runnable elements that exist** (`trace`, `circuit`): checkpoints with gating, `diff`, and the evidence events. It is subject-free and reaches responding and constructing at once.
2. **Compare** as layout: two element instances with linked stepping.
3. **Persona** as card fields only (`persona` in the spec plus a few lines in the actor prompt); no new UI.
4. **Canvas rubric**: the director scores collected drawings against `rubric` (drawing reading exists) and shows the reference beside them.
5. **New engines in order of reach across subjects**: `graph` (extend `formula`), then `timeline`/`argmap`/`sorter`, then `curves`, `sim`, `pathway`. CS-specific elements (the wheel, the float flipper, the live memory diagram) are thin views over `stepper` and `bits`.
Skipped for now: a general chemistry mechanism engine (authored step sequences with conservation checks are enough), and free-form physics beyond small integrators. Add them when a course needs them.
