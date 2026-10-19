# Course decomposition: how experts turn a course into teachable understanding

Research brief for Plato's backend **Study**: the per-topic document the backend writes after "studying" a student's course files (notes, slides, psets, past exams). The brief asks what such a document must contain so that a tutor can teach from it, and how an LLM can produce one that reflects understanding rather than restating the notes.

Test course: Cornell CS 3410, Fall 2026 (lectures 01–19: switches, numbers, C, types, floats, bit packing, arrays and pointers, the heap, gates, state, the CPU, RISC-V, memory, logic, control flow, calling conventions).

Written 2026-10-08. Sources are cited inline as (Author Year). Full references are at the end. Where a claim is my own inference rather than a finding, it is labelled **[inference]**.

---

## 0. The short version: twelve rules for a Study

1. **A Study holds pedagogical content knowledge, not content.** Its required fields are the ones the notes do not contain: representations ranked by usefulness, predictable misconceptions with the wrong answers they produce, sequencing, and evidence of understanding (Shulman 1986, 1987; Sadler et al. 2013).
2. **Assume the notes skip steps, and assume the model does too.** Experts leave out roughly 50–70% of the decisions and knowledge a novice needs (Sullivan et al. 2014; Clark et al. 2008). Recover the missing steps with a cognitive-task-analysis loop: sample several independent procedures, merge them, then have a literal executor run the merged steps on fresh instances. Wherever the executor has to guess, a step is missing.
3. **Type every knowledge component (KC)** as a fact, a concept or category, a procedure or rule, or a principle with a rationale. The type decides how to teach it: retrieval and spacing for facts; varied examples and non-examples for categories; worked, then faded, examples for procedures; self-explanation and dialogue for principles (Koedinger, Corbett & Perfetti 2012).
4. **Write evidence first** (backward design). Write the probes for each facet of understanding before writing any explanation (Wiggins & McTighe 2005).
5. **Enduring understandings are full sentences that can be wrong.** "Two's complement" is a topic. "The MSB of an n-bit two's-complement number has weight −2^(n−1), which is why one adder serves signed and unsigned addition" is an understanding.
6. **Every misconception carries its signature wrong answer.** It also needs a probe where only that misconception produces that answer, a source (a catalogued study, the course's own warnings, or an inference), and a repair. The signature answer is what makes the misconception diagnosable.
7. **Probe with unfamiliar forms.** Procedural fluency hides misconceptions. Students who can convert between bases still fail to compare numbers across bases (Herman, Zilles & Loui 2011). Comparing, ranking, interpreting, predicting and explaining expose what drilling hides.
8. **Name the notional machine** for each topic: the abstract machine whose state the student must track. Give its state variables and its update rules, and say what the best visual is and what to notice in it (du Boulay 1986; Sorva 2013; Fincher et al. 2020).
9. **Keep a ladder of tasks:** trace, then explain in plain English, then write or design. Tracing and explaining predict writing (Lopez et al. 2008). Parsons problems and subgoal-labelled worked examples are efficient intermediate rungs (Ericson et al. 2017; Margulieux et al. 2012, 2016).
10. **Mark threshold concepts and integrative tasks.** Threshold concepts are those that are troublesome, transformative and integrative (Meyer & Land 2003). Integrative tasks combine several KCs, such as a stack-frame question that needs pointer arithmetic, sign extension and the calling convention at once.
11. **Ground every claim and execute every answer.** LLMs label KCs well; human experts preferred the LLM's label in about two-thirds of disagreements (Moore et al. 2024). They are much weaker at predicting which wrong answers real students give (Feng et al. 2024) and at acting as weak students (Scarlatos et al. 2026). So the Study must check its computed answers with code (Python, a C compiler, a RISC-V simulator), and tag each misconception with its provenance.
12. **Test the Study for understanding, not restatement.** Generate novel instances and verify them by execution. Have a constrained model follow only the Study's steps and check that it succeeds. Run each "buggy rule" and confirm it produces the claimed wrong answer. Check that every facet has a probe. Measure how much of the text is copied from the source and how much is generative.

---

## 1. Pedagogical content knowledge (Shulman)

**Idea.** Shulman (1986) separated three kinds of teacher knowledge: subject-matter content knowledge, curricular knowledge, and *pedagogical content knowledge* (PCK). PCK is "the most useful forms of representation of those ideas, the most powerful analogies, illustrations, examples, explanations, and demonstrations — in a word, the ways of representing and formulating the subject that make it comprehensible to others." It also includes "an understanding of what makes the learning of specific topics easy or difficult: the conceptions and preconceptions that students … bring with them." Shulman (1987) then described *pedagogical reasoning*: comprehension leads to transformation (preparation, representation, selection, and adaptation to these students), then instruction, evaluation, reflection, and a new comprehension. **The transformation step is exactly the job of the Study.**

**Evidence.**
- In the COACTIV study of German secondary mathematics teachers, PCK predicted students' learning gains and instructional quality far better than content knowledge alone. Its effect ran partly through "cognitive activation" in lessons (Baumert et al. 2010).
- Sadler et al. (2013) tested middle-school physical-science teachers and their students on the same items. Student gains were largest when the teacher could identify both the correct answer *and the most common wrong answer*. On items with strong misconceptions, knowing the content alone was not enough.
- Expert-designed topic knowledge can be badly miscalibrated about difficulty (Nathan & Petrosino 2003; see §2). In CS, a Delphi panel rated number representation the *easiest* digital-logic topic, but concept-inventory data showed 40–50% of students fail its conceptual items (Goldman et al. 2008; Herman, Zilles & Loui 2011).

**Design rules for the Study.**
- The required fields are the PCK fields: `representations` (each with when it is best, and when it misleads), `misconceptions` (each with its wrong answer, probe and repair), `sequencing` (what must come first, and why), `difficulty_drivers` (why the topic is hard), and `evidence` (probes). Content (definitions and facts) is needed but is the cheapest part. If a Study could have been written without knowing anything about learners, it is a summary.
- Every representation needs a **"what to notice"** line. A memory diagram is useless unless the Study says what the student should look at, such as "the arrow ends at the first byte of the element, and each `+1` moves by `sizeof(T)` bytes."
- Sadler's result is the strongest argument for rule 6: knowing *which wrong answer is common* is the specific teacher knowledge that predicts gains.

---

## 2. The expert blind spot and cognitive task analysis

**Idea.** Experts' knowledge becomes compiled and automatic, so they no longer perceive the intermediate steps and decisions a novice needs. They also mis-predict what novices find hard.
- Nathan & Petrosino (2003) studied 48 preservice teachers. Those with more advanced mathematics held a "symbol-precedence" view: they ranked symbolic equations as easier than story problems. Actual student performance shows the opposite (Koedinger & Nathan 2004).
- Cognitive task analysis (CTA) is the family of methods that recovers this missing knowledge (Clark & Estes 1996; Clark et al. 2008; Feldon 2007).

**Evidence.**
- Sullivan et al. (2014) videotaped expert surgeons teaching a cricothyrotomy and compared the teaching against a gold-standard CTA built from three other surgeons. The teachers **omitted 71% of clinical-knowledge steps, 51% of action steps and 73% of decision steps**. They described "how to do it" for only 13% of action steps.
- Clark et al. (2008) summarise the general finding as experts leaving out up to about 70% of what novices need.
- Pooling several experts recovers far more of the procedure than any single expert (Chao & Salvendy 1994). This is why CTA interviews several experts and merges their accounts.
- A meta-analysis of CTA-based training found large gains over the training it replaced (Tofel-Grehl & Feldon 2013).
- CTA output has a typical shape: **action steps, decision steps (if/then with the cue that triggers each branch), conditions, standards (how you know a step is done right), and the concepts, processes and principles behind them** (Clark et al. 2008).

**What this means for Plato.** Plato faces a double blind spot:
1. The course notes were written by an expert. CS 3410's notes say "the stack pointer should be aligned to 16 bytes" and give the prologue template. They do not say how to *decide* which registers a given function must save. That decision depends on which values are live across each call: a decision step with a cue.
2. The LLM is itself an expert with automated knowledge. Asked to explain, it compresses steps the way the notes do.

**Design rules for the Study.**
- **Store procedures in CTA form.** Each step has an `action`, an optional `decision` with its `cue`, a `standard` (how to check it), and a `why` (the principle). For example: "Decision: does this value need to survive the `call`? Cue: it is read after the call returns. If yes, keep it in an `s` register (save it in the prologue) or spill it to the frame."
- **Recover missing steps with the multi-expert, literal-executor loop.**
  1. Generate the procedure N times (N = 3–5) with independent samples or prompts. These are the "several experts."
  2. Take the union of their steps and dedupe it into a gold list.
  3. Have a deliberately literal executor (a small model, or the same model told "use only these steps, and say STUCK when a step does not tell you what to do") solve 3–5 fresh instances.
  4. Every STUCK or guess marks a missing decision or cue. Add it and repeat until the executor solves every instance and the answers match the computed ground truth.
- **Mine the course's own materials for the novice's view.** Past exams show which steps are graded. Solution rubrics show the partial-credit decomposition. Discussion-section worksheets often state the steps the lecture skipped.
- **Prefer the student's difficulty data over the model's guess** where it exists. The Delphi-versus-reality gap above shows that experts, including the model, misjudge difficulty. Treat the model's difficulty ratings as priors to be updated by Plato's learner data.

---

## 3. The Knowledge-Learning-Instruction framework (Koedinger, Corbett & Perfetti 2012)

**Idea.** KLI links three kinds of events:
- **Instructional events** cause unobservable *learning events*.
- Learning events change *knowledge components* (KCs).
- KCs cause performance in observable *assessment events*.

A KC is "an acquired unit of cognitive function or structure that can be inferred from performance on a set of related tasks." KLI classifies KCs by four properties: whether the **application condition** is constant or variable, whether the **response** is constant or variable, whether the relationship is **verbal or non-verbal**, and whether it has a **rationale**. That gives these categories (KLI Table 3):

| Condition | Response | Verbal? | Rationale? | Label | CS 3410 example |
|---|---|---|---|---|---|
| constant | constant | non-verbal | no | association | `0xF` ↔ `1111` |
| constant | constant | verbal | no | fact | "`sp` must be a multiple of 16 on function entry" |
| variable | constant | non-verbal | no | category | Recognising a register as caller-saved (`t*`, `a*`) |
| variable | constant | verbal | no | concept | "Is this sum an overflow?" for any pair of operands |
| variable | variable | non-verbal | no | production / skill | Convert any n-bit pattern to its signed value |
| variable | variable | verbal | no | rule / plan | "To negate: flip the bits, add 1" |
| variable | variable | verbal | **yes** | principle / model | "The MSB has weight −2^(n−1), so `~x + 1 = −x` because `x + ~x = −1`" |

**Learning processes.**
- *Memory and fluency building*: non-verbal strengthening and chunking.
- *Induction and refinement*: generalisation, discrimination, categorisation, schema induction.
- *Understanding and sense-making*: explicit, verbally mediated reasoning.

The **asymmetry hypothesis** says the simplest facts mostly need memory and fluency. Rules mostly need induction; sense-making "may not be" needed for them. Principles benefit from all three.

**Matching instruction to KC type** (KLI §4):
- Simple constant-constant KCs and non-verbal categories: recall and testing, spacing, tutored practice, optimised scheduling.
- Complex variable-variable KCs: comparison and blocking, and more worked-example study.
- Integrated KCs to be learned in both procedural and declarative form: prompted self-explanation.
- KCs with rationales: argumentation and instructional dialogue.

The authors note that without the taxonomy these recommendations look contradictory ("education wars": worked examples versus testing, blocking versus spacing). KLI also notes that **integrative KCs** (tasks needing several KCs combined) are harder than their parts suggest.

**Evidence.** KC models are validated by how well they predict student performance. The usual tools are learning curves and the Additive Factors Model in DataShop; a better KC model yields smoother learning curves and lower prediction error (Stamper & Koedinger 2011). The same metric is used to judge LLM-discovered KC models (§8).

**Design rules for the Study.**
- **Every KC gets a `kc_type`** from the table above and a `teach_mode` derived from it:
  - fact → retrieval and spacing;
  - category or concept → varied examples, non-examples and contrast pairs;
  - procedure → a worked example, then faded steps, then practice with feedback;
  - principle → a self-explanation prompt and a dialogue.

  The tutor reads `teach_mode`, so a fact is never "Socratically discovered" and a principle is never merely drilled.
- **A KC must be testable.** If you cannot write a task whose success or failure depends on that KC, it is not a KC. Write at least two items per KC with different surface forms, so the Study can separate the KC from the item.
- **Make the grain size explicit.** Split a KC when students could plausibly know one half and not the other. Example: *interpret* a two's-complement pattern versus *negate* one. Herman et al. (2011) show students conflate the representation with the operation. Interviewees thought the "two's complement operation" was how you read a number, so they "decoded" `0100101` as 91 instead of 37.
- **List integrative tasks** separately, with their component KCs. For example, "read `lb` of a negative byte from a stack slot" needs base+offset addressing, byte layout and sign extension.

---

## 4. Understanding by Design (Wiggins & McTighe)

**Idea.** Backward design has three stages:
1. **Desired results.** These are established goals; *enduring understandings* phrased as "students will understand *that* …"; *essential questions*; the knowledge and skills; and *predictable misunderstandings*.
2. **Acceptable evidence.** Performance tasks (framed with GRASPS: goal, role, audience, situation, product, standards) and other evidence.
3. **The learning plan**, which the authors' WHERETO checklist structures.

Understanding is shown through **six facets**:
- *Explanation*: justified accounts of why and how.
- *Interpretation*: meaning-making and translation.
- *Application*: using knowledge in new contexts.
- *Perspective*: seeing alternative points of view.
- *Empathy*: getting inside another's view.
- *Self-knowledge*: knowing the limits of one's own understanding.

The "twin sins" of design are **coverage** (marching through content) and **activity** (hands-on without a target). Understanding has to be *uncovered* because it is often counter-intuitive and prone to misunderstanding (Wiggins & McTighe 2005).

**Evidence.** UbD is a design framework rather than an experimentally validated intervention, so its strength is conceptual fit. Its central move, defining evidence before instruction, matches what concept-inventory research found empirically (§5): procedural exam items let misconceptions survive, and conceptual items expose them.

**Design rules for the Study.**
- **`enduring_understandings`**: 1–3 per topic. Each is a *full declarative sentence* that is transferable, non-obvious and capable of being misunderstood. Test it: if a student who memorised the notes could still get this wrong, it is an understanding; if it is a definition, it belongs under `facts`.
- **`essential_questions`**: 2–4 per topic. Make them open-ended and recurring across topics where possible. Example: "What do these bits mean, and who decides?" recurs in integers, floats, pointers, instructions and bit-packed structs.
- **`evidence` keyed by facet.** At least one probe each for explanation, interpretation, application and perspective. **Empathy** in a tutoring setting becomes "diagnose a classmate's wrong answer": "A classmate says `0xFF` as a signed byte is −127. What rule are they using, and where does it break?" This doubles as a misconception probe. **Self-knowledge** becomes a confidence rating before the answer, used to detect overconfidence on threshold concepts.
- **Write the evidence before the explanation** in the pipeline (§10, stage 4 before stage 5). This keeps explanations from drifting toward whatever is easy to say.
- **Map `predictable_misunderstandings` straight onto `misconceptions`** (rule 6).

---

## 5. Threshold concepts and concept inventories

### 5.1 Threshold concepts

**Idea.** Meyer & Land (2003, 2005) describe *threshold concepts* as portals to a new way of thinking in a discipline. They are:
- **transformative**: they change how the learner sees the subject;
- **irreversible**: once understood, they are unlikely to be unlearned;
- **integrative**: they reveal hidden connections;
- **bounded**: they mark out a conceptual space;
- **troublesome**.

Learners spend time in a *liminal* state, where they oscillate and mimic the right language without the understanding. Perkins (1999, 2006) lists the kinds of troublesome knowledge: ritual, inert, conceptually difficult, alien (counter-intuitive), and tacit; Meyer & Land added troublesome language.

**Evidence in computing.**
- Boustedt et al. (2007) and Zander et al. (2008) found evidence for abstraction and object orientation as threshold concepts, using interviews across several institutions.
- Sorva (2013) argues that the notional machine, the runtime dynamics of programs, has threshold character.
- Kyriakou, Gogoulou & Grigoriadou (2025) propose *main memory in program execution* as a threshold concept, based on students' written explanations and group discussions.
- In digital logic, *state* behaves like a liminal concept. Interviewees used **on average four different, often contradictory definitions of state**, and only the two students with consistent definitions held the correct one (Herman, Zilles & Loui 2012).

**Candidate thresholds for CS 3410** **[inference, consistent with the above]**:
1. **Bits have no meaning without an interpretation.** The same 32 bits can be an `int`, an `unsigned`, a `float`, an address or an instruction. Integers, floats, bit packing, pointers and instruction encoding all rest on this.
2. **Memory is one flat byte array, and everything lives at an address.** This covers variables, arrays, the stack, the heap and code.
3. **State plus the clock.** A sequential circuit's behaviour depends on stored bits that change only at clock edges.
4. **A function call is a software contract enforced by convention, not by hardware.** Nothing stops a callee from clobbering `s0`. The convention is what makes separately written functions compose.

**Design rules for the Study.**
- Add a `threshold` flag and a `liminal_signs` field. Liminal signs are the symptoms of mimicry, such as using the right words with inconsistent answers across contexts, or switching definitions (Herman 2012). The tutor should then probe the *same idea in a second context* rather than accept the student's fluent language.
- `troublesome_because` should use Perkins' types, because each needs a different remedy:
  - *alien* or counter-intuitive ("adding two positives gave a negative") → a prediction followed by the surprise;
  - *tacit* (alignment, implicit sign extension) → make it explicit with a worked example;
  - *ritual* ("flip and add one") → attach a rationale;
  - *inert* (can state "callee-saved" but never uses it) → an application task.

### 5.2 Concept inventories, and what they found about this course's topics

**Idea.** A concept inventory (CI) is a short multiple-choice test whose distractors are *real misconceptions* found through interviews. It tests critical concepts rather than procedures (Herman, Loui & Zilles 2010). The physics Force Concept Inventory is the model.

**The method is directly reusable by Plato:**
1. Run a Delphi survey of instructors to choose the important and difficult concepts (Goldman et al. 2008, 2010).
2. Run think-aloud interviews with B and C students, who are more likely to hold misconceptions.
3. Code the interviews with grounded theory.
4. Turn the misconceptions into distractors.
5. Allow write-in answers to find new misconceptions. **10% of students wrote in "0 states"** for a three-flip-flop circuit, a misconception the interviews had missed.
6. Validate with item-response curves, distractor-by-quintile analysis and expert review.

The Digital Logic Concept Inventory (DLCI) has 19 items in four areas: number representations; combinational logic; medium-scale-integration (MSI) components such as multiplexers; and state and sequential logic (Herman, Loui & Zilles 2010; Herman et al. 2014). The CS1 inventories FCS1 and SCS1 (Tew & Guzdial 2011; Parker, Guzdial & Engleman 2016) do the same for introductory programming.

**Catalogued findings that apply to CS 3410 Prelim 1:**

*Number representations* (Herman, Zilles & Loui 2011, from 26 interviews and about 700 DLCI takers at six institutions):
- **Unchanging weights.** Students treat hex places as decimal places, so `2B₁₆` becomes "20 + 11 = 31." About 15% of students chose both answers that reflect this.
- **Bigger base means bigger number.** "A one in base 16 is obviously bigger than a one in base 2." About 25% chose both such answers. Fewer than 50% could compare `2.7₁₆` with `2.7₁₀`.
- **Pattern over position.** "`1.0101₂` = `1.5₁₀` because `0101` is 5."
- **The ones place given weight r¹ instead of r⁰.**
- **Borrowing `1` instead of `10₂`** in binary subtraction.
- **Treating the MSB as only a sign bit.** Students dropped the MSB when adding and inferred the sign of the result separately.
- **Confusing the representation with the operation.** Students "decode" a pattern by applying flip-and-add-one, so `0100101` reads as 91 instead of 37. Only **36% and 46%** correctly interpreted the sums on two DLCI items.
- **Wrong purpose.** Students said two's complement exists "because it has one zero" or "because it represents more numbers than unsigned." Only **60%** identified the real reason: one adder handles signed and unsigned addition, which simplifies subtraction hardware.
- **Aliasing representations.** Students add two's-complement numbers as if they were sign-magnitude.
- **Fixed width ignored.** Students interpret the sum with more bits than the operands had (`111 + 111 = 1110` in a 3-bit system).
- **Two half-definitions of overflow pitted against each other**: "a carry-out of 1" (true only for unsigned) versus "pos + pos = neg" (true only for two's complement). Students thought a carry-out of 1 "must be stored somewhere" yet a carry-out of 0 could be ignored. Only **44%** correctly identified which of two two's-complement additions overflowed.
- The authors' causal story: instruction taught overflow *before* fixed-width registers, and taught the three signed encodings *together*. Students therefore learned two's complement only by contrast ("the one with one zero"), never as a weighted positional code.
- **Procedural skill masks the misconceptions.** Every interviewee could add. The misconceptions appeared only in compare, rank and interpret tasks.

*Combinational logic* (Herman et al. 2012, TOCE; Herman, Loui & Zilles 2010):
- "If A then B" is translated as `A AND B` (9 subjects).
- The biconditional is reduced to one direction; only 3 subjects translated it correctly.
- "Not both" (NAND) is reduced to NOR.
- NAND and XOR are conflated.
- Negated variables that are "non-essential" are omitted. In the DLCI sandwich item, "bacon by itself" became just `b` instead of `b·¬l·¬t`.
- "Proof by incomplete enumeration": checking a few rows of a truth table instead of all of them.
- Programming habits interfere with Boolean notation.
- Students pick a strategy from surface features of the problem.

*State and sequential circuits* (Herman, Zilles & Loui 2012; 16 misconceptions):
- **Location misconceptions.** Students say state is the outputs (the most common), all the information in the circuit, or the value of any single signal ("this is the one state, that's a zero state").
- **Encoding misconceptions.** Students think the number of states grows *linearly* (25% on the alpha DLCI) or *quadratically* (12%) with the number of flip-flops, rather than as 2^m. Some confuse the states possible *over time* with the state *at an instant* ("with two flip-flops … four potentially, but at any given time, only two"), or think inputs and outputs count toward the state.
- **Treating sequential circuits as combinational.** Seven subjects pattern-matched a timing diagram, ignoring the clock's synchronising role.
- **Timing diagram as the key surface feature.** Students ignored the circuit diagram, which held the answer.
- **Attributing volition to signals** ("it changes out of its own volition").
- **Unstable definitions**, discussed above.
- On DLCI items 18 and 19 ("how many states can T be in over time?" and "how many is it in at one instant?"), **79% and 62%** answered correctly.

**Design rules for the Study.**
- **Each misconception record has**:
  - `name`;
  - `belief`, the student's rule stated in the student's own terms;
  - `signature_wrong_answer` on a canonical probe;
  - `diagnostic_probe`, an item where this belief and the correct model give different answers *and* no other catalogued belief gives the same wrong answer;
  - `prevalence` (with source);
  - `origin`, such as an instruction-order artefact, interference from everyday language, or overgeneralisation from earlier examples;
  - `repair`;
  - `provenance`: `catalogued` (with citation), `course` (warned against in the course's own notes), `exam` (seen in rubrics), or `inferred`.
- **Prefer catalogued and course provenance.** LLM-inferred misconceptions are plausible but often not what students do (§8). Weight them lower until learner data confirms them.
- **Write CI-style items, not procedure items, as the main evidence.** Compare, rank, interpret, "which of these overflow?" and "how many states over time versus now?" are what reveal the misconception. Instruction-order lessons belong in `sequencing`: teach fixed width before overflow, and teach two's complement as a weighted code before contrasting it with other encodings.
- **Keep an `other` option** with free text in Plato's diagnostic items. Repeated write-ins are how the DLCI found new misconceptions.

---

## 6. CS-specific findings

### 6.1 Notional machines (du Boulay; Sorva; Fincher et al.)

**Idea.** du Boulay (1986; du Boulay, O'Shea & Monk 1981) named the *notional machine*: "the general properties of the machine that one is learning to control," an idealised computer whose workings should be made visible (the "glass box"). Sorva (2013) defines it as an abstract computer for executing programs of a particular kind, pitched at the level of abstraction the learner needs. He argues that many novice misconceptions are wrong notional machines, and that instructors should make the notional machine an *explicit learning objective*. The ITiCSE working group (Fincher et al. 2020) adds two points:
- A notional machine is a pedagogical device with a *focus*. It decides which part of execution is made salient: it trains *attention* (what to look at, what to ignore).
- Instructors often use several notional machines in sequence.

**Evidence.**
- Visualisation helps only when learners actively engage with it: predicting, responding, changing or constructing. Passive viewing does little. This comes from the engagement taxonomy (Naps et al. 2002) and a meta-study of algorithm visualisation, which found that *what learners do* with the visual matters more than how it looks (Hundhausen, Douglas & Stasko 2002).
- Kaczmarczyk et al. (2010) found the largest theme in CS1 misconceptions was "students misunderstand the relationship between language elements and underlying memory usage." That is a notional-machine failure.

**CS 3410's own notional machines.** These come from the lecture notes, and the Study should use them rather than the model's defaults:

| Topic | Course's machine | State variables | Update rules |
|---|---|---|---|
| Integers (L02, L04) | n place-value boxes; the MSB weight becomes −2^(n−1) | n bits, plus the chosen interpretation | Add as unsigned and drop the carry-out of bit n−1 (L04: "the computer just drops that bit") |
| Memory and pointers (L08) | `uint8_t mem[SIZE]`: "an address works like an index into this metaphorical array of bytes" | the byte array; each variable's base index | `&x` gives the index; `*p` reads or writes `sizeof(T)` bytes at `p`; `p + n` adds `n·sizeof(T)` |
| Stack and heap (L09, L19) | regions of the same `mem`. The heap starts low and grows up; the stack starts high and grows down | `sp`, frames, heap blocks | A call allocates a frame (`addi sp, sp, −k`); a return frees it. A frame's data is dead after return |
| CPU (L12–L14) | register file (32 × 64-bit, `x0` = 0), PC, memory | registers, PC, memory | Fetch at PC, execute, then PC += 4 or jump |
| Combinational logic (L10) | a pure function of the inputs, described by a truth table | inputs → outputs | No memory |
| Sequential logic (L11) | flip-flops updated on the rising edge, plus combinational next-state logic | m flip-flop bits = one state of 2^m | On each rising edge, state := f(state, inputs) |

**Design rules for the Study.**
- **`notional_machine` is a required field**, with `state_variables`, `update_rules` (one per operation), `abstracts_away` (what it deliberately hides) and `next_machine` (what it is later refined into). One chain of refinement: C variables → the `mem` byte array → registers plus memory → the datapath.
- **`visual` has a `what_to_notice` list and an `active_task`.** The active task is a prediction the student commits to *before* the visual reveals the next state. A memory diagram with no task is a passive view.
- **Use the course's machine, notation and simplifications.** CS 3410 does not use `fp` (L19: "you do not need to know about it for this class"), so a Study that teaches frames relative to `fp` is wrong *for this course*. Where the course simplifies, record the simplification in `course_simplifications` so the tutor neither contradicts the course nor repeats a simplification as a universal truth. Examples: "arrays are mostly just pointers"; `main`'s frame being omitted in L19.

### 6.2 Tracing, explaining and neo-Piagetian stages (Lister; the BRACElet project)

**Evidence.**
- The ITiCSE 2004 multinational study found many end-of-CS1 students could not reliably predict the output of short code, or choose the right completion of nearly complete code (Lister et al. 2004).
- The BRACElet studies followed this up. Tracing and explaining together accounted for about 46% of the variance in code-writing scores (Lopez et al. 2008). Students below a tracing threshold rarely wrote code well, but tracing alone was not enough (Venables, Tan & Lister 2009).
- Using the SOLO taxonomy, educators explained small programs *relationally* ("it finds the largest element"), while students tended to explain them *multistructurally*, line by line: "not seeing the forest for the trees" (Whalley et al. 2006; Lister et al. 2006).
- "Explain in plain English" (EiPE) questions correlate with code writing (Murphy, McCauley & Fitzgerald 2012). They can now be autograded by having an LLM generate code from the student's explanation and running unit tests on it (Smith & Zilles 2024).
- Lister (2011) recast this as neo-Piagetian stages:
  - *Sensorimotor*: cannot trace reliably.
  - *Preoperational*: can trace concrete values but reasons about purpose only by induction from input/output pairs (Teague & Lister 2014).
  - *Concrete operational*: reasons abstractly about code (conservation, reversibility, transitivity) in familiar settings.
  - *Formal operational*: reasons hypothetically and in the abstract.

**Design rules for the Study.**
- **Every procedural topic has a task ladder:**
  1. `trace`: predict a register, memory cell or output after the code runs.
  2. `explain`: say what the code does in one relational sentence.
  3. `parsons`.
  4. `write` or `design`.

  The ladder is part of `evidence`. The tutor climbs it and drops back a rung on failure.
- **Write EiPE items with a SOLO rubric.** Store `relational_answer` (the purpose) and `multistructural_answer` (the line-by-line paraphrase), so the tutor can tell "accurate but preoperational" from "understands." For example, `slli t0, a1, 3; add t0, a0, t0; ld a0, 0(t0)` has the relational answer "returns `a[i]` for an array of 8-byte elements." The multistructural answer is "shifts a1 left by 3, adds a0, loads."
- **Stage diagnosis maps to a move:**
  - cannot trace → step through the notional machine together;
  - traces but explains line by line → name the subgoal (§6.4) and ask for the purpose;
  - explains but cannot write → Parsons, then a faded example.

### 6.3 Parsons problems

**Evidence.**
- Parsons problems (Parsons & Haden 2006) ask students to put given code lines in order, sometimes with distractor lines included.
- As exam items, Parsons scores correlated with code-writing scores, and they were easier to grade and isolated logic from syntax (Denny, Luxton-Reilly & Simon 2008).
- Solving two-dimensional Parsons problems with distractors took significantly less time than fixing or writing the equivalent code, with no significant difference in learning on a one-week retention test (Ericson, Margulieux & Rick 2017).
- Adaptive Parsons problems, which simplify when a student struggles, were more efficient and imposed lower cognitive load than writing the equivalent code (Haynes & Ericson 2021).
- Reviews: Du, Luxton-Reilly & Denny (2020); Ericson et al. (2022).

**Design rules for the Study.**
- **Every procedure gets a `parsons` item. Its distractors are misconception signatures**, each paired with the correct line it imitates. Assembly is ideal for this:
  - `sd ra, 0(sp)` placed *before* `addi sp, sp, -16`;
  - `addi sp, sp, 16` placed before `ld ra, 0(sp)`;
  - `lw` paired with `lwu` for an `unsigned`;
  - `ld t0, 4(a0)` paired with `ld t0, 32(a0)` for `p[4]` on an 8-byte type.
- Choosing a distractor gives a diagnosis, and the cost to the student is lower than writing the code from scratch.

### 6.4 Subgoal labels (Catrambone; Margulieux, Guzdial and colleagues)

**Evidence.**
- Subgoal labels group the steps of a worked example under a meaningful name ("Allocate the frame"). This helps learners form the procedure's structure and transfer it to problems whose steps differ (Catrambone 1998).
- In programming, subgoal-labelled instructional material improved problem-solving and transfer in App Inventor, and the effect persisted after a week (Margulieux, Guzdial & Catrambone 2012). It also helped with text-based languages (Morrison, Margulieux & Guzdial 2015). It worked in both expository text and worked examples (Margulieux & Catrambone 2016), and it reduced withdrawal and failure rates in CS1 (Margulieux, Morrison & Decker 2020).
- Having learners construct their own subgoal labels, with suitable guidance, can match or beat giving them the labels (Margulieux & Catrambone 2019).

**Design rules for the Study.**
- **Chunk every procedure into subgoals with short, stable labels**, and reuse the same labels in every example of that procedure so they become a schema. For the RISC-V function template: *Allocate frame → Save `ra` and the `s` registers you'll use → Body → [Before each call: place arguments, save live temporaries] → Call → [After: restore temporaries, use `a0`] → Restore saved registers → Free frame → Return.*
- Subgoals are the CTA decision structure (§2) made teachable. Each subgoal holds its decision steps and cues.
- **Ask for self-labelling as practice.** Show a chunk of code and ask "which subgoal is this?" The answer exposes whether the student sees the structure.

### 6.5 Catalogued misconceptions for the CS 3410 Prelim 1 topics

Provenance tags:
- **C**: catalogued in a peer-reviewed study.
- **N**: the course's own notes warn against it.
- **P**: practitioner or teaching report.
- **I**: inferred. Verify with learner data before relying on it.

The evidence is strongest for number representation, Boolean logic and state, thanks to the DLCI programme. It is moderate for memory and pointers, and **thin for assembly and calling conventions**: I found no concept-inventory-grade study of RISC-V or MIPS calling-convention misconceptions. Plato's own learner data will be the main source there.

**Numbers and integer width** (Herman, Zilles & Loui 2011, except where tagged)

| Belief | Signature wrong answer | Diagnostic probe | Tag |
|---|---|---|---|
| The MSB is just a sign, and the rest is the magnitude | `1011` (4-bit) = −3 | Interpret `1011` as 4-bit two's complement | C |
| Flip-and-add-one is how you *read* a number | `0100101` (7-bit) = 91 | Interpret a *positive* pattern | C |
| Unchanging weights (hex places act like decimal places) | `2B₁₆` = 31 | Compare `2B₁₆` with `31₁₀` | C |
| A bigger base means a bigger number | `2.7₁₆` > `2.7₁₀` regardless of digits | Rank `1.1₂`, `1.4₁₀`, `1.5₁₆` | C |
| Overflow means a carry-out of 1 | `0111 + 0001` is "no overflow" in 4-bit two's complement | "Which of these 4-bit signed sums overflow?" | C |
| The carry-out is kept somewhere | `1111 + 0001` = `10000` in a 4-bit register | Give the register's contents | C |
| Two's complement exists "for one zero" or "more values" | Says it represents more values than unsigned | "Why do computers use it?" | C |
| Truncation always preserves the value | Truncating `0x80000000000000ab` to 32 bits "is still negative" | L16 truncation examples | N |
| Extension never changes the value | Zero-extending `0xffffffab` "is still −85" | `lb` versus `lbu` of byte `0x9c` | N |
| Signed overflow in C wraps like unsigned | "`INT_MAX + 1 == INT_MIN` is guaranteed" | L04: signed overflow is undefined behaviour; unsigned wraps | N |

**Floating point.** I found no concept inventory. The sources are the course notes (L06) and expert teaching commentary (de Dinechin 2005; Goldberg 1991).
- "Floats are fuzzy or non-deterministic," "a float stands for an interval," and "every float operation has rounding error." These are expert-identified misconceptions (P). In fact, IEEE-754 operations are correctly rounded and many are exact.
- `0.1 + 0.2 == 0.3` is true (N, L06).
- Forgetting the bias (e − 127) or the implicit leading 1 when decoding; treating a denormal as having the implicit 1 (N, L06 special cases) (I).
- `1.0 + x − 1.0 == x` for small x. This is absorption, L06's closing example (N).
- 0/0 and 5/0 are both errors. In fact the first is NaN and the second is ∞ (N).

**C memory, pointers and arrays**

| Belief | Signature wrong answer | Probe | Tag |
|---|---|---|---|
| `p + 1` adds one byte | `int* p = 0x1000; p + 1` → `0x1001` | Give the address of `p + 3` for `int*`, `char*` and `double*` | N (L08 states the rule); I (the error) |
| Assigning to `ptr` changes the pointee, or `*ptr = v` re-aims the pointer | After `ptr = &y`, "x changed" | L08's four-print program: predict each line | N ("absolutely critical") |
| Pass-by-value swap works | `swap(a, b)` swaps | Predict the output of the by-value swap | N |
| An array knows its length; `sizeof` inside a callee gives the array's size | `sizeof(vals)` in `sum_n` = 28 | `sizeof` in `main` versus in the callee | N (no length stored); I (the `sizeof` form) |
| Arrays *are* pointers | `int a[7]; a = other;` compiles | "What can you do with `p` that you can't do with `a`?" | P; N simplifies this |
| A local outlives its function | Returning `&local` works | L09's `create_exp` | N |
| Declaring a pointer allocates the pointee | `int* p; *p = 5;` is fine | Spot the bug | C (Kaczmarczyk et al. 2010: "uninstantiated memory allocation," in Java) |
| Variables share or link values; `a = b` makes `a` follow `b` | Changing `b` later changes `a` | Trace | C (du Boulay 1986; Sorva 2013 catalogue) |
| Strings carry their length | Forgetting `'\0'` is harmless | L08's manual initialiser | N |
| Pointer bugs show up immediately | — | — | C (Adcock et al. 2007: most student pointer errors would go unnoticed, or show up only much later, without instrumentation). This is *why* feedback is scarce |

**Assembly and RISC-V memory access** (mostly N and I)
- **Offsets are in elements, not bytes.** Writes `lw x8, 1(x3)` for `p[1]`. L16 shows that the offset is 4. Assembly does no scaling.
- **Load width and signedness don't matter.** Uses `lw` for an `unsigned int`, or `lbu` for a `signed char`. L16: `lb` of byte `0x9c` gives −100.
- **Byte order is big-endian, or ignored.** After `sw 0x49c`, says the byte at `a` is `0x00` rather than `0x9c` (L16, N).
- **Register names are variables.** Thinks `a5` "belongs to" a C variable across calls (I).
- **`srai` by 1 equals C `/ 2`.** True for non-negative values only: C division truncates toward 0, and arithmetic shift rounds toward −∞. This is an expert simplification in L16's example (I; check by compiling, since GCC emits a correction sequence for signed `/ 2`).

**The calling convention and stack frames**

| Belief | Signature wrong behaviour | Probe | Tag |
|---|---|---|---|
| `ra` survives nested calls | A non-leaf function without `sd ra` loops forever, or returns to the wrong place | L19's `sub` calling `add`: "what happens at `sub`'s `ret`?" | N (L19 builds this exact bug) |
| A value in an `a` or `t` register survives a call because "the callee doesn't touch it" | Works today, breaks when the callee changes | "Is `a5` still 341 after `call add`?" | N (L19 "what is a5 here?"); P (JHU CSF notes) |
| "Callee-saved" means the caller saves it (the names are inverted) | Caller pushes `s0` around a call; callee clobbers `s0` | "Who must restore `s1`?" | I |
| The stack grows up, or frame offsets are negative from `sp` | `sd ra, -8(sp)` after `addi sp, sp, -16` | Draw the frame | N (grows down; positive offsets from `sp`) |
| Frame size is arbitrary | `addi sp, sp, -12` | "Smallest legal frame for `ra` + 2 `s` registers?" (32) | N (16-byte alignment) |
| Prologue and epilogue order doesn't matter | `ld ra` after `addi sp, sp, 16` | Parsons with an order distractor | I |
| Recursive calls share one frame | Predicts `nth`'s `n` "is overwritten" | Trace `nth(&node4, 2)` | C (progmiscon `RecursiveActivationsShareFrame`); N ("recursive calls work exactly the same") |
| `main` needs no frame | Ports L19's `main` verbatim. Its own `ra` (back to the C runtime) is lost | "Why can L19 omit it?" | N (simplification) |
| Arguments 9 and later are at negative offsets | `ld t0, -8(sp)` | "Where is the 9th argument at entry?" (`0(sp)`) | N |

**Digital logic, state and timing** (Herman et al. 2010, 2012, TOCE 2012). These are covered in detail in §5.2:
- if-then becomes AND; NAND becomes NOR; NAND and XOR are conflated;
- negated variables are dropped;
- incomplete enumeration of truth-table rows;
- state is the outputs, or the value of one signal;
- the number of states is linear in the number of flip-flops;
- states over time are confused with the state now;
- a sequential circuit is treated as combinational (ignoring the clock);
- the timing diagram is the "key" surface feature.

Course-specific additions:
- A **D latch is transparent while the clock is high**, but a **flip-flop samples only at the edge**. Students conflate the two (L11 spec; I).
- In an SR latch, S = R = 1 is "just another state" (L11 avoids it as outside the spec; I).
- Timing: an output changes the instant an input changes, ignoring propagation delay; and "the clock period can be anything" (I. The DLCI's three timing-diagram items cover the edge-versus-level part).

### 6.6 How architecture courses are taught: abstraction layers and the bottom-up versus top-down debate

**Positions.**
- *Motivated bottom-up* (Patt & Patel): show the big picture, then build from transistors to gates to latches to memory to a von Neumann machine (LC-3) to assembly to C.
- *Build-every-layer* (Nisan & Schocken's nand2tetris): from NAND to a working computer and software stack.
- *Programmer's perspective* (Bryant & O'Hallaron 2001): teach what programmers can see and use (data representation, machine-level code, the memory hierarchy, linking). Most students will not design hardware.
- Patterson & Hennessy's textbook is organised around the *hardware/software interface*: the ISA in the middle.

I found **no controlled study comparing learning outcomes** between these orders. The debate rests on arguments about motivation and transfer.

**What the evidence does say about order** comes at a finer grain. Teaching overflow before fixed-width registers, and the three signed encodings together, produced specific misconceptions (Herman, Zilles & Loui 2011).

**CS 3410 Fall 2026's order** is a sandwich [inference from the lecture list]:
1. Representation and C, as a programmer sees them (L02–L09).
2. Hardware from gates up to a processor (L10–L13).
3. The ISA and assembly, where the two halves meet (L14–L19).

The integrative understanding the course wants sits at the *seams*:
- Two's complement (L02) is cashed out in the n-bit adder (L10), in `lb` versus `lbu` (L16), and in `blt` versus `bltu` (L18).
- `mem[SIZE]` (L08) becomes `ld`/`sd` with byte offsets (L16) and the stack frame (L19).
- Flip-flops (L11) become the register file and PC (L12).

**Design rules for the Study.**
- Each topic records its `layer` and a `cross_links` list: the same idea at other layers, with a **bridge probe** for each. Examples: "Which branch does the compiler emit for `if (x < y)` with `int` versus `unsigned`?"; "Write the C for these three instructions"; "Which flip-flops hold the PC?"
- Bridge probes are among the best evidence of *integrative* understanding (KLI §3; Meyer & Land's "integrative" property).
- Respect the course's order in `prerequisites`. Where the research identifies an order effect, record it in `sequencing` with its citation.

---

## 7. Assessing understanding beyond multiple choice

**Why plain multiple choice is not enough.** Recognising an answer is easier than producing one, and guessing inflates scores. Most importantly, *familiar procedural items let misconceptions survive*. Herman's interviewees all added correctly, yet most could not interpret their own sums.

Concept inventories fix part of this by using misconception distractors. But by design they test concepts rather than problem solving or design, and the DLCI's expert reviewers named exactly that limit (Herman, Loui & Zilles 2010).

**Forms with evidence behind them:**
- **Two-tier and three-tier diagnostic items.** Tier 1 is the answer, tier 2 the *reason* (chosen from misconception-based reasons), and tier 3 a *confidence* rating. Tier 2 catches right-for-the-wrong-reason answers. Tier 3 separates a misconception (wrong and confident) from missing knowledge (wrong and unsure) (Treagust 1988; Peşman & Eryılmaz 2010).
- **Predict–observe–explain (POE) and interviews about instances** (White & Gunstone 1992). The student commits to a prediction, observes, then reconciles the two. In CS 3410 the "observe" step is free: compile and run the C, or step through the RISC-V simulator the notes link to.
- **Tracing and prediction** (§6.2): predict a register, a memory byte or an output.
- **Explain in plain English**, graded with SOLO (relational versus multistructural). It can be autograded by turning the explanation into code and testing it (Smith & Zilles 2024).
- **Parsons problems** with misconception distractors (§6.3).
- **Spot-the-bug and diagnose-a-classmate.** These are the "empathy" facet, and they double as misconception probes.
- **Design questions** with a rubric. These are open-ended: design an FSM from a specification; choose an encoding; argue a trade-off in the calling convention. They test the application and perspective facets.
- **Parameterised generators with executable checkers.** PrairieLearn-style randomised variants give many instances of the same item. This defeats memorising specific items and gives repeated measures of a KC (West, Herman & Zilles 2015).

**Exam-style problems in architecture courses** (from CS 3410's lecture exercises and the standard set in Patterson & Hennessy and in Bryant & O'Hallaron). Each maps to KCs and facets:

| Problem type | KCs it integrates | Facet |
|---|---|---|
| Interpret or compare bit patterns across bases and encodings | Positional weights, two's complement, width | Interpretation |
| Which sums overflow (signed versus unsigned)? | Fixed width, the overflow rule for each interpretation | Application |
| Float encode or decode; "why is `0.1+0.2 != 0.3`?" | Sign, exponent bias, significand, rounding | Explanation |
| Masks and shifts (bit packing) | Shifts, AND/OR masks, sign versus logical shift | Application |
| Predict the output of C with pointers; draw the memory diagram | `&`, `*`, pointer arithmetic, frames | Interpretation |
| Truth table → sum of products → gates; "what does this circuit compute?" | Boolean algebra, universal gates | Application / explanation |
| FSM from an English spec; how many flip-flops; next-state table | State encoding (2^m), transitions | Application / design |
| Timing diagram; critical path; maximum clock frequency | Edge-triggered update, propagation delay | Interpretation |
| C → RISC-V; RISC-V → C (EiPE) | Load/store width, offsets, branches | Explanation / application |
| Draw the stack frame at a point; find the calling-convention bug | Prologue/epilogue, saved registers, `ra` | Explanation / empathy |

**Design rules for the Study.** Each probe is a record with these fields:
- `facet`;
- `kc_ids`;
- `form` (trace, EiPE, Parsons, two-tier, compare, design, bug-find, diagnose-a-classmate, bridge);
- `stem`;
- `generator`, which produces parameterised instances;
- `checker`, executable code that computes the correct answer;
- `misconception_map`, from each wrong answer to a misconception id;
- `rubric` for open responses, with SOLO levels and must-mention points;
- `difficulty_prior`.

The **main evidence of understanding should be compare, interpret, predict, explain and bridge items.** Drill items (convert this, negate this) are fluency practice, not evidence of understanding.

---

## 8. AI and LLMs: extracting the decomposition from course materials

### 8.1 Knowledge-component extraction and tagging

**Evidence.**
- **Moore, Schmucker, Mitchell & Stamper (2024).** GPT-4 generated KCs for multiple-choice questions in chemistry and e-learning. The best strategy (a "simulated textbook" prompt) matched the expert KC for **56% (chemistry) and 35% (e-learning)** of questions, and did better within its top 5 suggestions. Where the LLM's KC and the human's differed, three domain experts **preferred the LLM's label in 57 of 87 cases** (about two-thirds; binomial p = 0.017). An ontology-induction clustering grouped the 80 chemistry questions into 42 KCs (the experts had 40), with about 65% of question pairs grouped correctly. *Measured by* exact match with the expert KC, expert preference, and pairwise grouping accuracy.
- **KCluster (Wei, Carvalho & Stamper 2025).** An LLM-induced measure of question similarity, followed by clustering, produced KC models that *predicted student performance better than the best expert-designed models*, with descriptive labels. *Measured by* Additive Factors Model fit and learning curves on real student data.
- **Programming KCs.** KC-Finder (Shi et al. 2023) learns KCs from student code submissions. Later work uses LLMs to label correctness per KC in open-ended code (2026).

**What works.** LLMs produce *readable, plausible KC labels* and *similarity judgements* at scale. Their labels are often preferred over expert labels.

**What fails.** Exact agreement with an expert KC model is modest. The only validation that matters, fit to learning data, needs real student responses.

**Design rule.** Let the LLM propose KCs with explicit types (KLI). Treat the KC model as a *hypothesis* that Plato's learner data refines: split a KC whose learning curve is not smooth, and merge two KCs that always co-vary. Store `kc_model_version`.

### 8.2 Concept maps and knowledge graphs from course materials

**Evidence.**
- LLM-based extraction of concepts and relations from course text is rated well against NLP baselines and by experts (e.g., *Leveraging LLMs for Automated Extraction and Structuring of Educational Concepts and Relationships*, MAKE 2025).
- But **relations, especially prerequisite relations, are where quality drops.** InstructKG (AlRabah et al. 2026) argues that LLM extraction *without instructor-grounded signals* gives surface-level graphs. It improves alignment with the instructor's intended progression by using the *temporal order of lectures* and where concepts are defined versus merely used.
- Evidence-linked approaches tie every edge to a supporting text span and provenance. One reported **93% grounded coverage and 86.2% accuracy on human-validated skill edges** (*Building Evidence-Linked Curriculum Knowledge Graphs for Academic Pathway Planning*, 2026).
- *Measured by* expert ratings, precision against hand-built maps, and human validation of edges.

**What fails.** Edges of the "related to" kind that carry no teaching meaning. Prerequisites that reflect the model's general knowledge rather than this course. Granularity that drifts between nodes. Edges with no supporting evidence.

**Design rule.** Every edge in the Study has a **type** (`prerequisite`, `uses`, `refines` (one notional machine refining another), `contrasts_with`, or `same_idea_other_layer`) and **evidence**: the lecture index where each end is introduced, plus a quoted span where the later topic actually *uses* the earlier one. An edge with no evidence span is kept only as `inferred`. Course order is a strong prior for prerequisites but is not proof.

### 8.3 Misconception banks and distractors

**Evidence.**
- **Feng et al. (2024)**: LLMs generate mathematically valid distractors, but they are **"less adept at anticipating common errors or misconceptions among real students."**
- **Overgenerate-and-rank (Scarlatos et al. 2024)**: generating many candidates and ranking them with a model trained on *which distractors real students pick* improved alignment with human-authored distractors. Teacher-written distractors were still better.
- **DiVERT (Fernandez et al. 2024)**: learns explicit *textual error descriptions* as an intermediate step. A 7B open model beat GPT-4o-based approaches, and educators rated its error labels comparable to human-written ones.
- **Zengaffinen et al. (2026)**: analysed how LLMs reason when generating distractors. In math, good runs follow a misconception-based process: "recover the correct solution, articulate student errors, simulate them, and select plausible candidates." *Giving the model the correct solution improved alignment with human distractors by 6.4%.* The failures were wrong solutions, and *discarding plausible candidates during selection*. In science, models fell back on surface semantic similarity.
- *Measured by* overlap with human-authored distractors and with real students' selection rates.
- The classic alternative is to represent each misconception as an executable *buggy procedure* that generates the wrong answer (Brown & Burton 1978).

**Design rules.**
1. **Seed the bank from the literature and the course first** (§6.5, provenance C, N or P), and only then from model inference (I).
2. **Make every procedural misconception an executable buggy rule.** Write a Python function that reproduces the student's mistaken procedure, such as `sign_magnitude_read(bits)`, `scale_by_one(p, n)` or `carry_out_overflow(a, b)`. The Study then *runs* it to get the signature wrong answer. Two benefits: the wrong answer is exactly what the belief produces, and the pipeline can check *diagnosticity* (no two misconceptions give the same answer on the diagnostic probe, and neither gives the correct one).
3. **Always generate distractors after computing the correct answer with code.**
4. **Rank inferred misconceptions with Plato's own learner data** as it accumulates: which wrong answers students actually give, and which free-text "other" answers recur.

### 8.4 LLMs as simulated students

**Evidence.**
- **Generative Students (Lu & Wang 2024)** prompted personas with sampled mastered, confused and unknown KCs. Over 20 MCQs, 45 generated students and 100 real students, the simulated responses correlated with real response patterns well enough to *flag poorly designed items*.
- A review (2025) and **Scarlatos et al. (2026)** found that simulated students are rarely validated. Simple prompting performs poorly on linguistic, behavioural and cognitive fidelity metrics; fine-tuning and preference optimisation help but remain limited.
- LLMs **misjudge item difficulty and perform well even when told to simulate struggling students** (*Can LLMs Estimate Student Struggles?*, 2025). They write above the language level of novices, and they have trouble reproducing *low-knowledge* students' misconceptions.

**Design rules.**
- Use simulated students for **item quality checks**: ambiguity (do two "correct" personas disagree?), distractor pull (does a persona holding misconception X pick the X distractor?), and the CTA literal-executor role (§2).
- **Do not** use them to estimate difficulty, to prove a misconception exists, or as evidence that teaching works.
- When a misconception must be simulated, **run the buggy rule** (code) rather than asking a persona to "be confused."

### 8.5 What works and what fails, overall

| Task | LLM reliability | How it was measured | Plato's safeguard |
|---|---|---|---|
| Extract concepts and terms from notes | High | Expert rating | Quote spans |
| Write KC labels | High; often preferred over experts | Expert preference | KLI type; testable-KC rule |
| Group items into KCs | Moderate to high | Grouping accuracy; AFM fit | Refine with learner data |
| Prerequisite edges | Moderate; surface-level without course signals | Expert validation | Typed edges with evidence spans and lecture order |
| Compute answers (two's complement, offsets, frames) | Error-prone in long chains | — | **Execute**: Python, C compiler, RISC-V simulator |
| Name misconceptions | Plausible; recall of catalogued ones is good | — | Provenance tags |
| Predict which wrong answers real students give | **Weak** | Overlap with real distractors and choices | Literature and course first; executable buggy rules; learner data |
| Act as a weak student | **Weak** | Fidelity metrics | Buggy rules; item QA only |
| Explain fluently | High, but with the expert blind spot | — | CTA loop; literal executor; subgoal labels |

---

## 9. Recommended Study schema

One Study per **topic**. A topic is about one lecture's worth of material, holding 4–10 KCs. The Study extends the brief in `history/teacher-architecture.md` §5.2 rather than replacing it; the mapping is given after the schema. Fields marked ★ are the ones a summary would lack. They are what makes a Study a Study.

```yaml
study:
  id, course_id, topic, layer            # layer: representation | C | memory | logic | state | cpu | isa | assembly
  lectures: [L02, L04, L16]              # where it is taught (course order = a prerequisite prior)
  kc_model_version, built_from: [source_ids], verified: {at, gate_results}

  # ── Stage 1: desired results (UbD) ───────────────────────────────────────────
  enduring_understandings:     # ★ 1–3 full declarative sentences; transferable; can be misunderstood
    - {id, statement, why_non_obvious, support: [chunk_ids] | general_knowledge}
  essential_questions:         # ★ 2–4; open; mark which recur across topics
    - {q, scope: overarching | topical}
  threshold:                   # ★
    is_threshold: bool
    troublesome_because: [alien | tacit | ritual | inert | conceptually_difficult | language]
    liminal_signs: [ ... ]     # how mimicry shows up (right words, inconsistent answers across contexts)

  # ── Knowledge (KLI) ──────────────────────────────────────────────────────────
  kcs:
    - id, statement
      kc_type: fact | association | category | concept | procedure | rule | principle   # ★
      rationale: "..."        # required when kc_type = principle
      teach_mode: retrieval_spacing | examples_and_nonexamples | worked_then_faded | self_explain_and_dialogue  # derived from kc_type
      prereq_kcs: [ ... ], probe_ids: [ >=2, different surface forms ]
  procedures:                  # ★ CTA form, subgoal-labelled
    - id, kc_ids, course_template: "quoted from the notes"
      subgoals:
        - label: "Allocate frame"
          steps: [{action, decision?, cue?, standard, why}]
      executor_check: {instances: n, stuck_points_found: [...], passed: bool}
  notional_machine:            # ★
    name, state_variables: [...], update_rules: [{operation, effect}]
    abstracts_away: [...], next_machine: topic_id
    course_simplifications: [{claim, where, actually, matters_when}]
  representations:             # ★ (PCK)
    - {kind, best_for, misleads_when, what_to_notice: [...], active_task, provenance: course | general}
  misconceptions:              # ★
    - id, name, belief: "student's own rule"
      signature_wrong_answer, diagnostic_probe_id
      buggy_rule: "python: f(input) -> wrong answer"     # for procedural misconceptions
      discriminates_from: [misconception_ids]            # verified by running the buggy rules
      prevalence: {value, source}, origin: instruction_order | language | overgeneralisation | interference | unknown
      repair: {move: contrast | predict_then_observe | rationale | bridge, contrast_case}
      provenance: catalogued | course | practitioner | inferred, citation
  difficulty_drivers: [ ... ]  # ★ why the topic is hard, in one line each
  sequencing: {teach_first: [...], order_effects: [{claim, citation}]}
  cross_links:                 # ★ typed edges with evidence
    - {to, kind: prerequisite | uses | refines | contrasts_with | same_idea_other_layer, evidence_span, bridge_probe_id}
  integrative_tasks: [{description, kc_ids, probe_id}]

  # ── Stage 2: evidence (written BEFORE explanations) ──────────────────────────
  probes:                      # ★
    - id, facet: explanation | interpretation | application | perspective | empathy | self_knowledge
      form: trace | compare | two_tier | eipe | parsons | write | design | bug_find | diagnose_classmate | bridge
      kc_ids, stem, generator: "code", checker: "code"
      misconception_map: {wrong_answer_or_pattern: misconception_id}
      rubric: {relational_answer, multistructural_answer, must_mention: [...]}
      ladder_rung: trace | explain | parsons | write | design
      difficulty_prior, provenance: past_exam | pset | notes_exercise | generated
  task_ladder: [probe_ids in order]

  # ── Stage 3: teaching material (written LAST) ────────────────────────────────
  explain:
    plain, intuition, precise                 # precise = the course's notation
    worked_examples: [{subgoal_labelled, faded_version, source}]
    analogies: [{analogy, breaks_where}]      # every analogy states where it fails
  exam_signals: {...}                         # from the Examiner

  # ── Quality (filled by the verification gate) ────────────────────────────────
  quality: {executor_pass_rate, diagnosticity_ok, facet_coverage, checker_runs_ok,
            unsupported_claims, copy_ratio, generative_verified_count, open_issues}
```

**Mapping to the existing brief fields** (`history/teacher-architecture.md` §5.2):

| Brief field | Study field |
|---|---|
| `plain`, `intuition`, `precise` | `explain.*` |
| `course_framing` | `notional_machine.course_simplifications`, `procedures[].course_template`, notation inside `precise` |
| `examples` | `explain.worked_examples` (now subgoal-labelled, with a faded version) |
| `mistakes` | `misconceptions` (now with signature answer, diagnostic probe, buggy rule and provenance) |
| `boundaries` | `representations[].misleads_when`, `analogies[].breaks_where`, `course_simplifications` |
| `connections` | `cross_links` (typed, with evidence span and bridge probe) |
| `exam_signals` | `exam_signals` (unchanged) |
| `conflicts` | `course_simplifications` plus notes errors found by execution |
| `support` | the `support` and `evidence_span` fields throughout |

**New in the Study:** `enduring_understandings`, `essential_questions`, `threshold`, `kcs[].kc_type` and `teach_mode`, `procedures` in CTA form, `notional_machine`, `representations[].what_to_notice`, `probes` keyed by facet with generators and checkers, `task_ladder`, `integrative_tasks`, and `quality`.

The existing `items` table can hold probes if it gains `facet`, `form`, `generator`, `checker` and `misconception_map`. The existing `edges.kind` list gains `refines` and `same_idea_other_layer`.

---

## 10. A staged pipeline an LLM can run over the course materials

The order follows backward design: **results, then evidence, then misconceptions and procedures, then explanation last.** Stages 3–8 run in parallel per topic. Every stage writes into the store; no stage passes prose to another.

| # | Stage | Input | Output | Checks |
|---|---|---|---|---|
| 0 | **Ingest** (existing §5.1) | Files | Chunks with role and heading path | — |
| 1 | **Inventory and segment** (the Librarian, extended) | All chunks, in lecture order | Topics; candidate KCs with `kc_type`; lecture index per KC | Every KC passes the testable-KC rule (can a task depend on it?); grain-size split where students could know half |
| 2 | **Mine the evidence the course already has** (the Examiner) | Past exams, psets, notes exercises ("comprehension check", "try it out") | Items mapped to KCs, forms and facets; the course's partial-credit structure; difficulty priors | Each item is reproduced and solved by a checker (code) |
| 3 | **Desired results** | Topic chunks plus Stage 2 items | `enduring_understandings`, `essential_questions`, `threshold` | An understanding is a full sentence, not a definition; it is something a note-memoriser could still get wrong; at least one understanding is tested by a Stage 2 item |
| 4 | **Evidence first** | Stages 1–3 | `probes` covering every facet and the `task_ladder`, each with a `generator` and `checker` | Checkers *execute* (Python; C via a compiler; RISC-V via a simulator); at least one bridge probe per cross-link |
| 5 | **Misconceptions** | (a) A local seed library of catalogued misconceptions with citations (§6.5 as data); (b) scan the notes for warnings ("warning", "be careful", "absolutely critical", "don't", "bad things will happen"); (c) exam rubrics; (d) then model inference | `misconceptions` with `buggy_rule`s; probes' `misconception_map`; distractors | Each buggy rule *runs* and produces its signature answer on its diagnostic probe. That answer differs from the correct answer and from every other buggy rule's answer (else find a new probe, cf. `1100` in §11.1). Provenance is tagged. Inferred items get a low prior |
| 6 | **Recover expert steps (CTA)** | Procedures and course templates | `procedures` in action/decision/cue/standard/why form, chunked into subgoals | Multi-sample union (N = 3–5). Then the **literal executor** solves 3–5 fresh generator instances using only the written steps and says STUCK when a step does not say what to do. Loop until it passes and every answer matches the checker |
| 7 | **Notional machine and representations** | Notes plus procedures | `notional_machine`; `representations` with `what_to_notice` and `active_task`; `course_simplifications` | Simulate the machine on a probe and compare with the checker. *Diff the notes against execution*: run the notes' own examples and flag disagreements as `conflicts` (§11.3 finds two) |
| 8 | **Explanations last** | Everything above | `explain.*` with subgoal-labelled and faded worked examples; analogies with `breaks_where` | Precision check (existing §5.3): course-supported, general knowledge, or unsupported |
| 9 | **Cross-links and integrative tasks** | All topics' Studies | Typed `cross_links` with evidence spans; `integrative_tasks` | No edge without an evidence span unless tagged `inferred`; course order agrees with `prerequisite` edges |
| 10 | **Verification gate** (understanding versus restatement) | The Study | `quality` | See below |
| 11 | **Learner-data refinement** (continuous) | Observations | Updated prevalence, new misconceptions, KC split or merge, difficulty | Learning-curve fit; recurring "other" answers |

**Stage 10: tests that the Study reflects understanding rather than restatement.**
1. **Execution.** Every checker runs. Every worked example is re-derived by code, and every number in the Study is recomputed.
2. **Novel instances.** For each procedure, the generator makes 10 instances that do not appear in the sources. The literal executor, following only the Study's steps, must get all of them right.
3. **Diagnosticity.** Each buggy rule produces its signature answer, which is distinct from the correct answer and from the other buggy rules' answers.
4. **Facet coverage.** There is at least one probe each for explanation, interpretation, application, perspective, and empathy (diagnose-a-classmate), plus at least one bridge probe and one CI-style compare or interpret item.
5. **Generative content.** Measure copy overlap (n-gram or embedding) between the `explain` fields and the source chunks. High overlap is fine for `precise` (it *should* use the course's notation). But the Study fails if the generative fields (signature answers, decision cues, `what_to_notice`, novel probe instances, bridge probes) are missing or unverified. Restatement shows up as an empty or tautological generative layer, not as copied wording.
6. **Skeptical-TA review.** A second model with a different prompt, given only the Study, must (a) list three questions a struggling student would ask that the Study cannot answer, and (b) find a step where a novice would stall. Each finding goes back to Stage 6 or 8.
7. **Fidelity to the course.** The Study never silently "fixes" the notes. Disagreements found by execution go to `conflicts` or `course_simplifications`, so the tutor can address them gently.

**Model use** [inference]: stages 3–8 need the strongest model. The literal executor in stages 6 and 10 should be *weaker, or constrained to use only the given steps*, because a strong model fills gaps from its own expertise, which is exactly the blind spot under test. Code execution is not optional at stages 2, 4, 5, 7 and 10.

---

## 11. Worked examples: what an excellent Study contains for three CS 3410 topics

These use the course's own notation and examples (Fall 2026 lecture notes). Every number below was recomputed by script: the two's-complement values, overflow sets, addresses and byte orders, and the call trace, which was run on a small RV64-subset interpreter. Provenance tags as in §6.5: **C** catalogued, **N** course notes, **P** practitioner, **I** inferred.

### 11.1 Two's complement (L02; cashed out in L04, L10, L16 and L18)

**Enduring understandings**
1. *An n-bit pattern has no value until an interpretation is chosen. In two's complement, every place keeps its unsigned weight except the MSB, whose weight is −2^(n−1).* (L02's "negate the place value of the most significant bit.")
2. *When the MSB is 1, the signed and unsigned values of the same pattern differ by exactly 2^n. So an adder that adds as unsigned and drops the carry-out computes both correctly, modulo 2^n. That, not "having one zero," is why hardware uses two's complement.*
3. *Width is part of the number. Results keep n bits, so overflow depends on the interpretation: unsigned overflow means passing 1…1 → 0…0, and signed overflow means passing 01…1 → 10…0. Widening a signed value must copy the sign bit to keep its value.*

**Essential questions:** "What do these bits mean, and who decides?" (overarching: it recurs in floats, pointers, instruction encodings and bit packing). "Why can one adder serve both signed and unsigned numbers?" "What happens to the bits that don't fit?"

**Threshold:** yes; this is the first instance of "bits have no meaning without an interpretation." It is troublesome because:
- it is *alien*: positive plus positive gives a negative, and −(−8) = −8 in 4 bits;
- it is *ritual*: "flip and add one" is taught without its rationale;
- it is *tacit*: the fixed width and the silently dropped carry go unstated;
- it is *conceptually difficult*: one pattern has two readings.

*Liminal signs:* the student can negate but misreads a positive pattern; calls the MSB "the sign bit" and stops there; gives two overflow definitions that contradict each other.

**KCs**

| KC | Type | Teach mode |
|---|---|---|
| Place values, with the MSB weight −2^(n−1) | principle (rationale: L02's negated MSB) | self-explanation and dialogue |
| Read an n-bit pattern as a signed value | procedure | worked, then faded |
| Negate with `~x + 1` (rationale: `x + ~x` = all ones = −1) | rule with rationale | worked example plus "why" prompt |
| Range [−2^(n−1), 2^(n−1)−1]; all-zeros = 0, all-ones = −1, 10…0 = INT_MIN | fact | retrieval and spacing |
| "Did this addition overflow?" for each interpretation | concept (variable condition, yes/no response) | varied examples and non-examples |
| Sign- versus zero-extension; truncation (L16) | rule with rationale | worked example plus contrast pair (`lb`/`lbu`) |
| C: unsigned arithmetic wraps; signed overflow is undefined (L04) | fact | retrieval |

**Expert steps made explicit (CTA).** The notes give the definitions and three examples. They leave these decisions implicit.

*Subgoal "Read a pattern":*
1. **Fix the width n.** Cue: the type (`int8_t`, `int`) or register width. The same bits change value with width: `1011` is −5 in 4 bits and 11 in 8 bits.
2. **Check the MSB.** If it is 0, read the pattern as unsigned. Done.
3. **If the MSB is 1**, compute value = −2^(n−1) + (unsigned value of the low n−1 bits), or equivalently the unsigned value − 2^n. Shortcut from L02: all-ones is −1, so count down from there.
4. **Check the standard:** a negative result must lie in [−2^(n−1), −1].

*Subgoal "Decide overflow":*
1. **Choose the interpretation** (unsigned or signed). Cue: the type or the instruction (`bltu` versus `blt`).
2. **Unsigned:** overflow if and only if the carry-out of bit n−1 is 1.
3. **Signed:** overflow if and only if both operands have the same sign and the result's sign differs.
4. **Why:** each rule detects crossing *that interpretation's* seam on the wheel.

*Notes blind spot:* the signed-overflow rule is not in the CS 3410 notes. L04 covers unsigned wraparound and says signed overflow is undefined in C. Tag the rule as general knowledge and check `exam_signals` for whether it is tested.

**Notional machine.** The course's two views are "the MSB has negative place value" and "negative numbers grow up from the bottom." Add one general-knowledge view, the **wheel**: 2^n patterns fixed on a circle (an odometer). Unsigned labels go outside and signed labels inside. Addition walks clockwise; the carry-out is dropped.
- *State:* n bits, plus the reader's chosen interpretation.
- *Update rules:* add = unsigned add mod 2^n; negate = `~x + 1`; extend = copy the MSB (signed) or 0 (unsigned); truncate = keep the low bits.

**Best visual: the 4-bit wheel.** *What to notice:*
1. The patterns never move; only the labels differ.
2. Where the MSB is 1, the inside and outside labels differ by exactly 16.
3. The unsigned seam lies between `1111` and `0000`, and the signed seam between `0111` and `1000`. Overflow means crossing *your* interpretation's seam.
4. Negation is a reflection, and `0000` and `1000` map to themselves. That is why −(−8) = −8.

*Active task (predict before the reveal):* "We will add `0110 + 0011` by walking the wheel. Does it cross the unsigned seam? The signed seam?" The answer is `1001`: no unsigned overflow (6 + 3 = 9), but signed overflow (the result reads −7).

A second visual: the place-value table with the MSB column labelled −8, or −128 for 8 bits.

**Misconceptions**

| Misconception (student's rule) | Signature wrong answer | Diagnostic probe | Buggy rule | Tag |
|---|---|---|---|---|
| The MSB is only a sign; the rest is the magnitude | `1011` = **−3** (correct −5) | Read 4-bit `1011` | `sm(bits)` | C |
| Flip-and-add-one is how you *read* any pattern | 7-bit `0100101` = **91** (correct 37) | A *positive* pattern. On negative patterns this rule can look right | `flip_add_one_read` | C |
| Overflow means a carry-out of 1, even for signed | For {`0111+0001`, `1111+0001`, `1000+1000`, `0110+0011`} picks **{b, c}** (correct {a, c, d}) | The four-sum set | `carry_out_overflow` | C |
| Only pos + pos = neg counts | Picks **{a, d}**, missing c (neg + neg = pos) | The same set | `pos_pos_only` | I (partial version of a C rule) |
| Sign-magnitude addition used on two's-complement patterns | `1101 + 0010` = **`1011`** (correct `1111` = −1) | That sum | `sm_add` | C (aliasing) |
| The width grows to hold the carry | `1111 + 0001` = **`10000`** in a 4-bit register | Give the register contents | `unbounded_add` | C |
| It exists "for one zero" or "to represent more numbers" | "More values than unsigned" | Two-tier "why?" item | — | C (only 60% chose the real reason) |
| Negation always works | 4-bit `−(1000)` = **+8** | Negate `1000` | — | I |
| Extension or truncation never changes the value | `lbu` of `0x9c` = **−100**, or `lb` = **156** | L16's `sw 0x49c` / `lb` example | `zero_extend_signed` | N |

**The diagnosticity lesson** that Stage 5 must catch: `1100` is *non-diagnostic* for the sign-magnitude misconception. Sign-magnitude and two's complement both read it as −4. A probe built on `1100` would wrongly score that student as understanding.

**Probes by facet**
- *Interpretation:* "The 8-bit pattern `0xF6` is what as a `uint8_t`? As an `int8_t`?" (246 and −10.)
- *Application:* "In 6-bit two's complement, compute `011010 + 001011`. Does it overflow as signed? As unsigned?" (The result is `100101`. Signed: 26 + 11 overflows and reads −27. Unsigned: 37, no overflow.)
- *Explanation (EiPE-style):* "Using place values, explain why the same adder gives the right signed answer for `1101 + 0010`." Must mention: the patterns differ from their unsigned values by 2^n, and dropping the carry is mod 2^n.
- *Perspective:* "Give one thing sign-magnitude makes easy and one it makes hard. Why did hardware choose two's complement?"
- *Empathy (diagnose a classmate):* "A classmate says `1011` is −3. What rule are they using? Find a 4-bit pattern where their rule gives the right answer anyway." (`1100`, or any pattern with MSB 0.)
- *Self-knowledge:* a confidence rating (1–5) before the overflow-set item. A confident wrong answer means a misconception; an unsure one means a gap.
- *Bridge (to L18):* "For `a = −1`, `b = 1` in 64-bit registers, is `blt a, b` taken? `bltu a, b`?" (`blt` yes; `bltu` no, because −1 reads as 2^64 − 1.)
- *Bridge (to L16):* "`addi x11, x0, 0x49C; sw x11, 0(x5); lb x12, 0(x5)`: what is `x12`?" (−100, from the low byte `0x9c`, little-endian, sign-extended.)

**Task ladder:** read a pattern → compare across encodings (CI-style) → the overflow set → explain → the two bridges.

**Sequencing:**
- Anchor on the weighted-code view *before* contrasting with sign-magnitude. L02 introduces sign-magnitude first. Herman et al. (2011) link teaching the encodings together to aliasing and to the "one zero" belief.
- Tie overflow to fixed width (L04) every time.

**Note for probe authors:** do not use `int8_t x = 127; x + 1` to illustrate undefined behaviour. Integer promotion makes `x + 1` an `int`, which equals 128. Use `int` and `INT_MAX`.

### 11.2 Pointer arithmetic and array layout (L08; links to L07, L09, L16 and L19)

**Enduring understandings**
1. *Memory is one big byte array (`uint8_t mem[SIZE]`). A pointer is just an index into it: 64 bits, like any other value. The pointer's type changes only how many bytes `*p` reads and how far `p + 1` moves.*
2. *Array elements sit back to back, so `&a[i]` = base + i·sizeof(T). `a[i]` means `*(a + i)`, and C's pointer `+` already multiplies by sizeof(T). That is why assembly, which does not, must scale the index itself.*
3. *An array name stands for the address of its first element, and nothing records the length. When an array is passed to a function, only the 8-byte address travels.*

**Essential questions:** "How does the machine find `a[i]`?" "If every pointer is 64 bits, what does a pointer's type change?" "Where does this data live, and for how long?"

**Threshold:** yes. "Memory is a byte array, and everything lives at an address" (Kyriakou et al. 2025; Kaczmarczyk et al. 2010, theme T1). It is troublesome because:
- it is *tacit*: the scaling happens invisibly in C;
- it is *alien*: `idx[arr]` works;
- the *language* misleads: "arrays are mostly just pointers," and `*` appears in both declarations and dereferences.

*Liminal signs:* writes correct C indexing but miscomputes addresses; draws arrows without byte addresses.

**KCs**

| KC | Type | Teach mode |
|---|---|---|
| `&x` gives the address; `*p` reads or writes the pointee | rule | worked, then faded |
| Assigning `*p = v` versus `p = q` | category (discriminate the two) | contrast pairs (L08's four-print program) |
| sizeof on RV64: `char` 1, `int` 4, `long`, `double` and pointers 8 | fact | retrieval |
| `&a[i]` = base + i·sizeof(T); `a[i]` ≡ `*(a + i)` | principle | self-explanation |
| `p + n` moves n·sizeof(*p) bytes; `q − p` counts elements | rule with rationale ("stays pointing to the first byte of an element") | worked example plus "why" prompt |
| The array name gives the first element's address; no length is stored; the array decays when passed | concept | examples and non-examples (`sizeof` in `main` versus in the callee) |
| Little-endian byte order (L14, L16) | rule | worked example |
| Assembly scales by hand: `slli` by log2(size), then `add`, then load | procedure (bridge) | worked, then faded; Parsons |

**Expert steps made explicit (CTA): "Find the address and value of an access like `a[i]` or `*(p + i)`."**
1. **Find the base.** *Decision:* is the name an array in scope, or a pointer variable? *Cue:* the declaration. For an array, the base is the array's address. For a pointer, the base is the *contents* of the pointer variable, which is itself stored at some other address.
2. **Find T and sizeof(T)** on RV64. For a struct, sum the fields plus padding (L07 notes that compilers pad).
3. **Address** = base + i·sizeof(T). C does this multiply for you. In assembly, you write `slli`.
4. **Read sizeof(T) bytes**, little-endian, and interpret them per T (sign-extend if signed: `lw` versus `lwu`).
5. **Standard:** you must know from *elsewhere* that 0 ≤ i < length. Nothing in memory marks the end.

*Notes blind spots that the Study makes explicit:* step 1's decision (the pointer variable has its own address, which L08 shows but never uses as a step), and step 5's "nothing marks the end."

**Notional machine:** the course's `uint8_t mem[SIZE]`.
- *State:* the byte array, and each variable's base index.
- *Update rules:* as in §6.1.
- *Next machine:* registers plus `ld`/`sd` with byte offsets (L16), then the stack frame (L19).

**Best visual: a byte-strip memory map of L08's array.** It shows `int courses[7] = {1110, 1111, 2110, 2112, 2800, 3110, 3410}` at the address L08 printed, `0x1555d56b90`:
- bytes grouped in fours;
- indices 0–6 above, addresses `…6b90, …6b94, …, …6ba8` below;
- one zoomed element showing that 1110 = `0x456` is stored as bytes `56 04 00 00`;
- an 8-byte box for a pointer `p` holding `0x1555d56b90`.

*What to notice:*
1. Arrows land on the *first byte* of an element.
2. `+1` jumps 4 bytes for `int*`, 1 for `char*`, and 8 for `long*`, `double*` or `int**`.
3. Nothing marks the end. `…6bac` is simply whatever comes next.
4. Inside `sum_n`, only the 8-byte `vals` exists; there is no length.
5. The lowest address holds the *least* significant byte.

*Active task:* "Before the reveal, mark where `courses + 5` points and what `*(courses + 5)` reads." (`0x1555d56ba4`, which holds 3110.)

**Misconceptions**

| Misconception | Signature wrong answer | Diagnostic probe | Tag |
|---|---|---|---|
| `p + 1` adds one byte | `courses + 1` = **`…6b91`** (correct `…6b94`) | The address of `p + 3` for `int*` versus `char*` | N rule; I error |
| `p + 1` adds the pointer size (8) | **`…6b98`** | The same probe; separable from the above | I |
| `p = &y` changes what `x` holds | In L08's four-print program, line 2 shows **x = 10** (correct: x = 41, y = 10) | Predict all four lines | N ("absolutely critical") |
| The array knows its length | `sizeof(vals)` in `sum_n` = **28** (correct 8; 28 only in `main`) | `sizeof` in both places | N; I (form) |
| Array index = byte offset in assembly | `p[1]` → **`lw x8, 1(x3)`** (correct `4(x3)`) | C → RISC-V for `p[1]` and `q[3]` with `long* q` (`24(a0)`) | N (L16); I |
| `int` habit: always scale by 4 | `q[3]` for `long*` → **`12(a0)`** | The same | I |
| Big-endian reading | The byte at `&courses[0]` = **`0x00`** (correct `0x56`) | "Which byte is at the lowest address?" | N |
| Pointer difference counts bytes | `&courses[5] − &courses[1]` = **16** (correct 4) | That expression | I |
| Declaring a pointer allocates its target | `int* p; *p = 5;` is "fine" | Spot the bug | C (Kaczmarczyk et al. 2010, Java form) |
| Pass-by-value swap swaps | Prints **10 34** | L08's broken `swap` | N |
| A local outlives its function | L09's `create_exp` "returns the values" | Predict | N |

**Probes by facet**
- *Interpretation (trace):* "Give the address and value of `*(courses + 5)`. What is `courses + 7`, and is it safe to dereference?" (`…6ba4` and 3110; `…6bac`, and no.)
- *Explanation:* "Why does C make `p + 1` move by `sizeof(*p)` instead of 1?" (It keeps the pointer on the first byte of an element: L08.)
- *Application (bridge, write):* "Translate `long get(long* a, long i) { return a[i]; }`." Answer: `slli t0, a1, 3; add t0, a0, t0; ld a0, 0(t0); ret`. Use it as a Parsons item with distractors `slli t0, a1, 2`, `lw a0, 0(t0)` and a missing `slli`.
- *EiPE:* "`int n = 0; for (char* c = s; *c; c++) n++;` What does this compute?" Relational: the string's length. Multistructural: "loops through `c` and increments `n`."
- *Perspective:* "An `int*` and a `char*` hold the same 64-bit address. What is the same and what differs?"
- *Empathy:* "A classmate prints `sizeof(vals)` inside `sum_n` expecting 7. What do they believe, and what prints?" (8.)
- *Two-tier:* "`courses + 1` versus `(char*)courses + 1`", with a reason tier.

**Course simplification to record.** "Arrays are mostly just pointers" (L08) is true for indexing and for passing to functions. It is false for `sizeof` (28 versus 8), for assignment (`courses = …` does not compile), and for `&courses + 1` (which advances by 28 bytes). The tutor should not contradict the course. It should bring up the difference only when the student relies on it.

**Cross-links:**
- L16: `p[1]` → `sw x8, 4(x3)`.
- L09: `malloc(COUNT * sizeof(float))`; locals die when the frame is freed.
- L19: a frame is a region of `mem` addressed from `sp`.
- L07: struct padding.

### 11.3 The RISC-V calling convention and stack frames (L19; links to L08, L09, L16 and L18)

**Enduring understandings**
1. *A calling convention is a contract, not a hardware feature.* The hardware provides only `jal` and `jalr`. Where arguments go and which registers survive a call are agreements, and they are what let separately written functions, and C linked with assembly, compose (L19: "nothing sacred").
2. *`ra` holds exactly one return address.* So any function that makes a call must first save its own `ra` somewhere private: its stack frame. The stack exists because active calls nest, and recursion is just nesting.
3. *Every register belongs either to the callee to restore (`s0–s11`, `sp`) or to the caller to protect (`a0–a7`, `t0–t6`, `ra`).* At each call, for each value, you must decide whether it needs to survive, and put it where the contract guarantees it will.

**Essential questions:** "What must two functions agree on to call each other?" "Where does a function's private data live, and why there?" "After a `call`, which of my registers can I still trust?"

**Threshold:** yes; "a function call is a contract." It is troublesome because:
- it is *tacit*: the convention exists nowhere in the code;
- the *language* misleads: "caller-saved" and "callee-saved" describe who is responsible, and students read them backwards;
- it is *alien*: a missing `sd ra` produces an infinite loop, not an error.

*Liminal signs:* copies the prologue template correctly but cannot say *which* registers a given function must save; fixes bugs by saving everything.

**KCs**

| KC | Type | Teach mode |
|---|---|---|
| `jal ra, f` sets `ra` = PC + 4 and jumps; `ret` = `jalr x0, 0(ra)` | rule | worked example |
| Register roles (`a*`, `t*`, `ra` caller-saved; `s*`, `sp` callee-saved) | category | examples and non-examples; retrieval |
| Frame size = the smallest multiple of 16 ≥ bytes needed | rule | worked example |
| Prologue and epilogue order; positive offsets from the new `sp` | procedure | subgoal-labelled worked example, then faded; Parsons |
| *Which* registers to save, decided by what is live across a call | principle (rationale: the contract) | self-explanation and dialogue |
| Arguments 1–8 in `a0–a7`; argument 9+ at `0(sp)` at entry; return value in `a0` | fact | retrieval |
| A leaf function may skip the frame | concept | contrast pair (`add` versus `sub`) |
| A recursive call is an ordinary call: one frame per activation | principle | trace (`nth`) |

**Expert steps made explicit (CTA): "Write a function that follows the convention."** L19 gives the template. The decisions are the missing expert knowledge.

1. **Plan the frame**
   - *Decision 1: does the body contain any call?* Cue: `call` or `jal ra` anywhere, including recursion and `printf`. If yes, save `ra`. If no, it is a leaf and may skip the frame.
   - *Decision 2: which values must survive a call?* Cue: computed before the call and read after it. For each such value, either keep it in an `s` register (and save that register) or spill it to a frame slot around the call.
   - *Decision 3: which `s` registers will the body write?* Save every one of them.
   - *Decision 4 (not in the notes):* a local whose address is taken (`&x` passed to a callee) must live in a frame slot, because registers have no address.
   - *Size* = 8 × (slots), rounded up to 16. *Offsets:* `ra` at `0(sp)` (the course's convention), then the `s` registers at 8, 16, and so on.
2. **Prologue:** `addi sp, sp, −size`, then `sd ra, 0(sp)`, then `sd sK, off(sp)`. *Standard:* `sp` is a multiple of 16, and every slot lies within [0, size).
3. **Before each call:** place the arguments in `a0…`; save any live `t` or `a` values. **Call. After:** the result is in `a0`; restore the saved temporaries.
4. **Epilogue:** `ld sK`, `ld ra`, then `addi sp, sp, +size` (the *same* constant), then `ret`. *Standard:* every register is reloaded from the slot it was saved to, and `sp` equals its value at entry.

*Worked application:* for `int f(int x) { int r = g(x); return g(r) + x; }`, x is live across both calls (Decision 2), so it goes in `s0`. Since f calls, it saves `ra` (Decision 1). That is 2 slots → 16 bytes:

```
f:
  addi sp, sp, -16     # Allocate frame
  sd   ra, 0(sp)       # Save ra (f makes calls)
  sd   s0, 8(sp)       # Save s0 (we will use it)
  mv   s0, a0          # x must survive both calls
  call g               # a0 = g(x) = r
  call g               # a0 = g(r)
  add  a0, a0, s0      # g(r) + x
  ld   s0, 8(sp)       # Restore
  ld   ra, 0(sp)
  addi sp, sp, 16      # Free frame (same constant)
  ret
```

**Notional machine:** the register file (`ra`, `sp`, `a0`, `s*`) plus the stack region of `mem` at high addresses, growing down. A frame is [sp, sp + size) after the prologue. Frames stack downward, one per *active* call. There is no frame pointer in CS 3410. *Next machine:* none on the prelim; later, exceptions and debugging use `fp`.

**Best visual: a stack diagram plus a register panel, stepped instruction by instruction.** This is L19's `sub` → `add` example, laid out at concrete addresses (`add` at `0x1000`, `sub` at `0x1018`, `main`'s `jal ra, sub` at `0x1040`, initial `sp = 0x7ff0`). It was verified on an interpreter:

| After | `ra` | `sp` | Memory written | Note |
|---|---|---|---|---|
| `main: jal ra, sub` | `0x1044` | `0x7ff0` | — | |
| `sub: addi sp, sp, -16` | `0x1044` | `0x7fe0` | — | |
| `sub: sd ra, 0(sp)` | | | `mem[0x7fe0] = 0x1044` | sub's ticket home |
| `sub: jal ra, add` | **`0x102c`** | `0x7fe0` | — | `ra` overwritten |
| `add: addi`, `sd ra` | | `0x7fd0` | `mem[0x7fd0] = 0x102c` | (leaf: optional) |
| `add: add a0, a0, a1` | | | | `a0 = 3 + (−4) = −1` |
| `add: ld ra; addi; ret` | `0x102c` | `0x7fe0` | | back in `sub` |
| `sub: ld ra, 0(sp)` | **`0x1044`** | | | the saved copy restores it |
| `sub: addi; ret` | | `0x7ff0` | | back in `main`, `a0 = −1` |

*What to notice:*
1. `sp` moves only in the prologue and epilogue, by matching amounts.
2. Each frame stores the `ra` value *at entry*, which is its caller's resume point.
3. After the inner `jal`, the saved slot is the only way home.
4. Offsets are positive from the new `sp`.
5. The callee-saved `s` registers (none here; `s4` in L19's `myfunc`) hold the caller's values again by `ret`.

*Active task:* the student fills in the `ra`, `sp` and memory columns before each reveal.

**Misconceptions.** Catalogued evidence here is thin (see §6.5). Most entries come from the notes, which construct two of these bugs on purpose, from practitioner reports, or by inference. Learner data should re-rank them.

| Misconception | Signature wrong answer or behaviour | Diagnostic probe | Tag |
|---|---|---|---|
| `ra` survives a nested call | Predicts that L19's frameless `sub` "returns to main". Actually, `call add` sets `ra` to `sub`'s own `ret`, so `ret` jumps to itself forever (verified) | "Where does `sub`'s `ret` jump?" | N |
| A value in an `a` or `t` register survives a call | "`a5` is still 341 after `call add`" (L19's `myfunc`) | "Is it guaranteed? What if `add` changes?" | N; P (JHU CSF tips) |
| The names are backwards: the caller saves `s` registers | "`myfunc`'s caller must save `s4`" | "Who restores `s4`, and where?" (`myfunc`, in its epilogue) | I |
| Offsets are negative after allocation | `sd ra, -8(sp)` after `addi sp, sp, -16` | Draw the frame; Parsons distractor | I (N states positive offsets) |
| Any frame size works | `ra` + `s0` + `s1` → **`addi sp, sp, -24`** (correct −32) | "Smallest legal frame?" | N rule (16-byte alignment); I error |
| Epilogue order doesn't matter | `addi sp, sp, 16` before `ld ra, 0(sp)` loads the caller's slot | Parsons with an order distractor | I |
| Recursive calls share a frame | Predicts `nth(&node4, 2)` breaks because "`n` is overwritten." It returns **4**, with three `nth` frames active at the base case | Draw the stack at `n == 0` | C (progmiscon); N |
| `main` needs no frame | Ports L19's `main` verbatim; `main`'s own return address is lost | "Why could L19 skip it?" | N (simplification) |

**Probes by facet**
- *Interpretation (trace):* fill in the table above. Then: "after `sub`'s `jal ra, add`, what are `ra`, `sp` and `mem[sp]`?" (`0x102c`, `0x7fe0` and `0x1044`.)
- *Explanation:* "Why must `sub` save `ra` but `add` need not?"
- *Application (write):* `f` above, from its C, with no template given. Grade with a checker: assemble and run against a C harness (L19's "Try It Out" linking method).
- *Parsons:* `f`'s lines plus the distractors `sd ra, -8(sp)`, `addi sp, sp, -12`, `mv t0, a0` (in place of `s0`), and `ld ra` placed after the `addi`.
- *Perspective:* "Why does the convention have *both* caller-saved and callee-saved registers? What would a leaf-heavy program prefer?"
- *Empathy (bug-find):* "A classmate's `sub` never returns. Explain exactly what happens, instruction by instruction."
- *Bridge (L08, L16):* port `nth` to assembly. `list->value` is `ld a0, 8(a0)` and `list->next` is `ld a0, 0(a0)`, because `next` is at offset 0 and `value` at offset 8. Then draw the stack at the base case.
- *Self-knowledge:* "Which registers are you sure survive a `call`?" with a confidence rating.

**Notes conflicts found by execution** (record them in `conflicts`; the tutor raises them gently):
1. L19's recap sketch writes the epilogue with `sd ra, 0(sp)` and `sd sX, Y(sp)` labelled "restore," and the sketch has no `ret`. Taken literally, it would never restore anything. The body text correctly uses `ld`.
2. L19 omits `main`'s frame "for simplicity." A real `main` that calls must save `ra`.
3. L16's translation of `p[1] = p[0] / 2` with `srai` differs from C for negative odd `p[0]`. C gives −3 / 2 = −1, but the arithmetic shift gives −2.

Item 3 belongs to the pointer and memory Study. It shows the Stage 7 diff working outside this topic.

---

## 12. Risks, open questions, and what not to trust

- **Catalogued misconceptions are uneven.** Number representation, Boolean logic and state are well studied (the DLCI). Floating point, assembly and calling conventions have no concept-inventory-grade catalogue that I found. For those, Plato's own diagnostic data (wrong answers plus free-text "other") is the only path to prevalence. Build the logging before trusting `prevalence`.
- **Expert labels are not ground truth for difficulty.** Remember the Delphi panel that rated number representation easiest. So the model's `difficulty_prior` must be updated from observations, with a learning-curve check on KC splits (KLI; KCluster).
- **The literal executor is the key safeguard and the least proven.** It operationalises CTA's multi-expert comparison. I found no published evaluation of an LLM "literal executor" for recovering missing steps [inference]. Measure it: seed a Study with a known-missing step and check that the executor reports STUCK.
- **Simulated students** are acceptable for item quality checks and for the literal-executor role, not for estimating difficulty or proving that a misconception exists (§8.4).
- **Course fidelity versus correctness.** The Study must keep the course's notation and simplifications and still record where execution disagrees (§11.3). The tutor needs a policy on raising these. I suggest raising one only when the student's work depends on it.
- **Cost.** Stages 4–7 and 10 add code execution and several model calls per topic beyond the Librarian's ~2.5× input. For 19 lectures (about 20–25 topics) this is still a one-time, parallel background build [inference]. It should not be cut silently. Any downgrade (fewer samples in Stage 6, no simulator) is a design decision to raise with the user.

---

## References

- Adcock, B., Bucci, P., Heym, W. D., Hollingsworth, J. E., Long, T., & Weide, B. W. (2007). Which pointer errors do students make? *SIGCSE '07*, 9–13. https://dl.acm.org/doi/10.1145/1227310.1227317
- AlRabah, A., Kargupta, P., Han, J., & Alawini, A. (2026). Instructor-aligned knowledge graphs for personalized learning (InstructKG). arXiv:2602.17111. https://arxiv.org/abs/2602.17111
- Baumert, J., Kunter, M., Blum, W., et al. (2010). Teachers' mathematical knowledge, cognitive activation in the classroom, and student progress. *American Educational Research Journal*, 47(1), 133–180.
- Boustedt, J., Eckerdal, A., McCartney, R., Moström, J. E., Ratcliffe, M., Sanders, K., & Zander, C. (2007). Threshold concepts in computer science: Do they exist and are they useful? *SIGCSE '07*, 504–508.
- Brown, J. S., & Burton, R. R. (1978). Diagnostic models for procedural bugs in basic mathematical skills. *Cognitive Science*, 2(2), 155–192.
- Bryant, R. E., & O'Hallaron, D. R. (2001). Introducing computer systems from a programmer's perspective. *SIGCSE '01*. https://dl.acm.org/doi/abs/10.1145/364447.364549
- Building evidence-linked curriculum knowledge graphs for academic pathway planning (2026). Springer LNCS. https://link.springer.com/chapter/10.1007/978-3-032-29744-0_32
- Can LLMs estimate student struggles? Human-AI difficulty alignment with proficiency simulation for item difficulty prediction (2025). arXiv:2512.18880. https://arxiv.org/abs/2512.18880
- Catrambone, R. (1998). The subgoal learning model: Creating better examples so that students can solve novel problems. *Journal of Experimental Psychology: General*, 127(4), 355–376.
- Chao, C.-J., & Salvendy, G. (1994). Percentage of procedural knowledge acquired as a function of the number of experts from whom knowledge is acquired. *International Journal of Human-Computer Interaction*, 6(3), 221–233.
- Clark, R. E., & Estes, F. (1996). Cognitive task analysis for training. *International Journal of Educational Research*, 25(5), 403–417.
- Clark, R. E., Feldon, D. F., van Merriënboer, J. J. G., Yates, K. A., & Early, S. (2008). Cognitive task analysis. In *Handbook of Research on Educational Communications and Technology* (3rd ed.), 577–593.
- Cornell CS 3410 Fall 2026 lecture notes: numbers, C intro, arrays & pointers, heap, RISC-V memory, calling conventions. https://www.cs.cornell.edu/courses/cs3410/2026fa/
- de Dinechin, F. (2005). Computing with floating point: It's not dark magic, it's science. CERN Computing Seminar. http://cern.ch/Computing.Seminars/2005/0111/slides.pdf
- Denny, P., Luxton-Reilly, A., & Simon, B. (2008). Evaluating a new exam question: Parsons problems. *ICER '08*, 113–124.
- Du, Y., Luxton-Reilly, A., & Denny, P. (2020). A review of research on Parsons problems. *ACE '20*, 195–202.
- du Boulay, B. (1986). Some difficulties of learning to program. *Journal of Educational Computing Research*, 2(1), 57–73.
- du Boulay, B., O'Shea, T., & Monk, J. (1981). The black box inside the glass box: Presenting computing concepts to novices. *International Journal of Man-Machine Studies*, 14(3), 237–249.
- Ericson, B. J., Margulieux, L. E., & Rick, J. (2017). Solving Parsons problems versus fixing and writing code. *Koli Calling '17*. https://dl.acm.org/doi/10.1145/3141880.3141895
- Ericson, B. J., Denny, P., Prather, J., et al. (2022). Parsons problems and beyond: Systematic literature review and empirical study designs. *ITiCSE-WGR '22*.
- Feldon, D. F. (2007). The implications of research on expertise for curriculum and pedagogy. *Educational Psychology Review*, 19(2), 91–110.
- Feng, W., Lee, J., McNichols, H., Scarlatos, A., Smith, D., Woodhead, S., Ornelas, N., & Lan, A. (2024). Exploring automated distractor generation for math multiple-choice questions via large language models. *Findings of NAACL 2024*, 3067–3082. https://aclanthology.org/2024.findings-naacl.193/
- Fernandez, N., Scarlatos, A., Feng, W., Woodhead, S., & Lan, A. (2024). DiVERT: Distractor generation with variational errors represented as text for math multiple-choice questions. *EMNLP 2024*. https://arxiv.org/abs/2406.19356
- Fincher, S., Jeuring, J., Miller, C. S., Donaldson, P., du Boulay, B., Hauswirth, M., Hellas, A., Hermans, F., Lewis, C., Mühling, A., et al. (2020). Notional machines in computing education: The education of attention. *ITiCSE-WGR '20*, 21–50.
- Goldberg, D. (1991). What every computer scientist should know about floating-point arithmetic. *ACM Computing Surveys*, 23(1), 5–48.
- Goldman, K., Gross, P., Heeren, C., Herman, G., Kaczmarczyk, L., Loui, M. C., & Zilles, C. (2008). Identifying important and difficult concepts in introductory computing courses using a Delphi process. *SIGCSE '08*, 256–260. (And 2010: Setting the scope of concept inventories for introductory computing subjects. *ACM TOCE*, 10(2).)
- Guo, P. J. (2013). Online Python Tutor: Embeddable web-based program visualization for CS education. *SIGCSE '13*.
- Haynes, C. C., & Ericson, B. J. (2021). Problem-solving efficiency and cognitive load for adaptive Parsons problems vs. writing the equivalent code. *CHI '21*. https://dl.acm.org/doi/fullHtml/10.1145/3411764.3445292
- Herman, G. L., Loui, M. C., & Zilles, C. (2010). Creating the digital logic concept inventory. *SIGCSE '10*, 102–106. https://zilles.cs.illinois.edu/papers/2010-SIGCSE-Creating-DLCI.pdf
- Herman, G. L., Zilles, C., & Loui, M. C. (2011). How do students misunderstand number representations? *Computer Science Education*, 21(3), 289–312. https://zilles.cs.illinois.edu/papers/2011-CSE-Number-misconceptions.pdf
- Herman, G. L., Zilles, C., & Loui, M. C. (2012). Flip-flops in students' conceptions of state. *IEEE Transactions on Education*, 55(1), 88–98. https://zilles.web.engr.illinois.edu/papers/2012-ToE-State-misconceptions.pdf
- Herman, G. L., Loui, M. C., Kaczmarczyk, L., & Zilles, C. (2012). Describing the what and why of students' difficulties in Boolean logic. *ACM TOCE*, 12(1), Article 3. http://publish.illinois.edu/glherman/files/2016/03/2012-TOCE-Boolean-misconceptions.pdf
- Herman, G. L., Zilles, C., & Loui, M. C. (2014). A psychometric evaluation of the digital logic concept inventory. *Computer Science Education*, 24(4). http://publish.illinois.edu/glherman/files/2016/03/2014-CSE-DLCI-Validation.pdf
- Hundhausen, C. D., Douglas, S. A., & Stasko, J. T. (2002). A meta-study of algorithm visualization effectiveness. *Journal of Visual Languages & Computing*, 13(3), 259–290.
- Kaczmarczyk, L. C., Petrick, E. R., East, J. P., & Herman, G. L. (2010). Identifying student misconceptions of programming. *SIGCSE '10*, 107–111. http://publish.illinois.edu/glherman/files/2016/03/2010-SIGCSE-Programming-Misconceptions.pdf
- Koedinger, K. R., Corbett, A. T., & Perfetti, C. (2012). The Knowledge-Learning-Instruction framework: Bridging the science-practice chasm to enhance robust student learning. *Cognitive Science*, 36(5), 757–798. https://pact.cs.cmu.edu/pubs/KLI-KoedingerCorbettPerfetti2012-pre.pdf
- Koedinger, K. R., & Nathan, M. J. (2004). The real story behind story problems: Effects of representations on quantitative reasoning. *Journal of the Learning Sciences*, 13(2), 129–164.
- Kyriakou, Gogoulou, & Grigoriadou (2025). Main memory in program execution: Threshold concept in CS. *SN Computer Science*. https://link.springer.com/article/10.1007/s42979-025-03971-w
- Lister, R. (2011). Concrete and other neo-Piagetian forms of reasoning in the novice programmer. *ACE '11*, 9–18.
- Lister, R., Adams, E. S., Fitzgerald, S., et al. (2004). A multi-national study of reading and tracing skills in novice programmers. *ITiCSE-WGR '04*. https://dl.acm.org/doi/10.1145/1041624.1041673
- Lister, R., Simon, B., Thompson, E., Whalley, J. L., & Prasad, C. (2006). Not seeing the forest for the trees: Novice programmers and the SOLO taxonomy. *ITiCSE '06*. https://dl.acm.org/doi/10.1145/1140123.1140157
- Lopez, M., Whalley, J., Robbins, P., & Lister, R. (2008). Relationships between reading, tracing and writing skills in introductory programming. *ICER '08*, 101–112.
- Lu, X., & Wang, X. (2024). Generative students: Using LLM-simulated student profiles to support question item evaluation. *L@S '24*. https://par.nsf.gov/biblio/10519692
- Margulieux, L. E., & Catrambone, R. (2016). Improving problem solving with subgoal labels in expository text and worked examples. *Learning and Instruction*, 42, 58–71.
- Margulieux, L. E., & Catrambone, R. (2019). Finding the best types of guidance for constructing self-explanations of subgoals in programming. *Journal of the Learning Sciences*, 28(1), 108–151.
- Margulieux, L. E., Guzdial, M., & Catrambone, R. (2012). Subgoal-labeled instructional material improves performance and transfer in learning to develop mobile applications. *ICER '12*, 71–78.
- Margulieux, L. E., Morrison, B. B., & Decker, A. (2020). Reducing withdrawal and failure rates in introductory programming with subgoal labeled worked examples. *International Journal of STEM Education*, 7, 19.
- Meyer, J. H. F., & Land, R. (2003). Threshold concepts and troublesome knowledge: Linkages to ways of thinking and practising within the disciplines. ETL Project Occasional Report 4. (And 2005, *Higher Education*, 49, 373–388.)
- Moore, S., Schmucker, R., Mitchell, T., & Stamper, J. (2024). Automated generation and tagging of knowledge components from multiple-choice questions. *L@S '24*. https://stevenjamesmoore.com/assets/papers/las24_full_moore.pdf
- Morrison, B. B., Margulieux, L. E., & Guzdial, M. (2015). Subgoals, context, and worked examples in learning computing problem solving. *ICER '15*, 21–29.
- Murphy, L., McCauley, R., & Fitzgerald, S. (2012). 'Explain in plain English' questions: Implications for teaching. *SIGCSE '12*, 385–390.
- Naps, T. L., Rößling, G., Almstrum, V., et al. (2002). Exploring the role of visualization and engagement in computer science education. *ITiCSE-WGR '02* (SIGCSE Bulletin, 35(2)).
- Nathan, M. J., & Petrosino, A. (2003). Expert blind spot among preservice teachers. *American Educational Research Journal*, 40(4), 905–928. https://journals.sagepub.com/doi/10.3102/00028312040004905
- Parker, M. C., Guzdial, M., & Engleman, S. (2016). Replication, validation, and use of a language independent CS1 knowledge assessment. *ICER '16*.
- Parsons, D., & Haden, P. (2006). Parson's programming puzzles: A fun and effective learning tool for first programming courses. *ACE '06*, 157–163.
- Patt, Y. N., & Patel, S. J. (2004/2019). *Introduction to Computing Systems: From Bits & Gates to C & Beyond.* McGraw-Hill.
- Perkins, D. (1999). The many faces of constructivism. *Educational Leadership*, 57(3), 6–11. (The source of the "troublesome knowledge" categories.)
- Perkins, D. (2006). Constructivism and troublesome knowledge. In J. H. F. Meyer & R. Land (Eds.), *Overcoming Barriers to Student Understanding: Threshold Concepts and Troublesome Knowledge*. Routledge. (Adds tacit knowledge.)
- Peşman, H., & Eryılmaz, A. (2010). Development of a three-tier test to assess misconceptions about simple electric circuits. *Journal of Educational Research*, 103(3), 208–222.
- progmiscon.org: a curated catalogue of programming-language misconceptions (e.g., `RecursiveActivationsShareFrame`). https://progmiscon.org/misconceptions/Java/RecursiveActivationsShareFrame/
- Sadler, P. M., Sonnert, G., Coyle, H. P., Cook-Smith, N., & Miller, J. L. (2013). The influence of teachers' knowledge on student learning in middle school physical science classrooms. *American Educational Research Journal*, 50(5), 1020–1049.
- Scarlatos, A., Feng, W., Smith, D., Woodhead, S., & Lan, A. (2024). Improving automated distractor generation for math multiple-choice questions with overgenerate-and-rank. *BEA @ NAACL 2024*. https://arxiv.org/abs/2405.05144
- Scarlatos, A., Lee, J., Woodhead, S., & Lan, A. (2026). Simulated students in tutoring dialogues: Substance or illusion? *ACL 2026*. https://arxiv.org/abs/2601.04025
- Shi, Y., Schmucker, R., Chi, M., Barnes, T., & Price, T. (2023). KC-Finder: Automated knowledge component discovery for programming problems. *EDM 2023*. https://par.nsf.gov/biblio/10525860
- Shulman, L. S. (1986). Those who understand: Knowledge growth in teaching. *Educational Researcher*, 15(2), 4–14.
- Shulman, L. S. (1987). Knowledge and teaching: Foundations of the new reform. *Harvard Educational Review*, 57(1), 1–22.
- Simulating students with large language models: A review of architecture, mechanisms, and role modelling in education with generative AI (2025). arXiv:2511.06078.
- Smith, D. H., & Zilles, C. (2024). Code generation based grading: Evaluating an auto-grading mechanism for "explain-in-plain-English" questions. *ITiCSE '24*. https://zilles.cs.illinois.edu/papers/smith_eipe_cgbg_ITiCSE_2024.pdf
- Sorva, J. (2012). *Visual Program Simulation in Introductory Programming Education.* Doctoral dissertation, Aalto University. (Appendix: a catalogue of novice misconceptions.)
- Sorva, J. (2013). Notional machines and introductory programming education. *ACM TOCE*, 13(2), Article 8. https://dl.acm.org/doi/10.1145/2483710.2483713
- Stamper, J. C., & Koedinger, K. R. (2011). Human-machine student model discovery and improvement using DataShop. *AIED 2011*, 353–360.
- Sullivan, M. E., Yates, K. A., Inaba, K., Lam, L., & Clark, R. E. (2014). The use of cognitive task analysis to reveal the instructional limitations of experts in the teaching of procedural skills. *Academic Medicine*, 89(5), 811–816. https://pubmed.ncbi.nlm.nih.gov/24667500/
- Teague, D., & Lister, R. (2014). Blinded by their plight: Tracing and the preoperational programmer. *PPIG 2014*.
- Tew, A. E., & Guzdial, M. (2011). The FCS1: A language independent assessment of CS1 knowledge. *SIGCSE '11*, 111–116.
- Tofel-Grehl, C., & Feldon, D. F. (2013). Cognitive task analysis–based training: A meta-analysis of studies. *Journal of Cognitive Engineering and Decision Making*, 7(3), 293–304.
- Treagust, D. F. (1988). Development and use of diagnostic tests to evaluate students' misconceptions in science. *International Journal of Science Education*, 10(2), 159–169.
- Venables, A., Tan, G., & Lister, R. (2009). A closer look at tracing, explaining and code writing skills in the novice programmer. *ICER '09*, 117–128.
- Wei, Y., Carvalho, P., & Stamper, J. (2025). KCluster: An LLM-based clustering approach to knowledge component discovery. *EDM 2025*. https://arxiv.org/abs/2505.06469
- West, M., Herman, G. L., & Zilles, C. (2015). PrairieLearn: Mastery-based online problem solving with adaptive scoring and recommendations driven by machine learning. *ASEE Annual Conference*.
- Whalley, J. L., Lister, R., Thompson, E., Clear, T., Robbins, P., Kumar, P. K. A., & Prasad, C. (2006). An Australasian study of reading and comprehension skills in novice programmers, using the Bloom and SOLO taxonomies. *ACE '06*.
- White, R., & Gunstone, R. (1992). *Probing Understanding.* Falmer Press.
- Wiggins, G., & McTighe, J. (2005). *Understanding by Design* (expanded 2nd ed.). ASCD.
- Zander, C., Boustedt, J., Eckerdal, A., McCartney, R., Moström, J. E., Ratcliffe, M., & Sanders, K. (2008). Threshold concepts in computer science: A multi-national empirical investigation. In *Threshold Concepts within the Disciplines*, Sense Publishers.
- Zengaffinen, Opedal, Rooein, Aditya Srivatsa, Sonkar, & Sachan (2026). Can LLMs model incorrect student reasoning? A case study on distractor generation for multiple-choice questions. *Findings of EMNLP 2026*. https://arxiv.org/abs/2603.15547
