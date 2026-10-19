# How Plato should understand and teach a course

> **Status (11 Oct 2026): reference.** This analysis became the course model in `system-spec.md` §7 (the `studies` table). It is domain-general now, not CS 3410-specific. §2.7 ("cards recite notes") and the schedule removal describe 8 Oct and are no longer true or are finished.

An analysis written on 8 Oct 2026, grounded in a full read of the CS 3410 notes: all 19 lectures, exported read-only from the course's stored files. The research briefs landing in `docs/research/` will confirm or refine the design rules marked **(R)**.

## The short version

- **A good tutor holds models, not more facts.** It doesn't need to know more facts than the notes. It needs the *models* the facts come from, how students go wrong, and what to do next for this student.
- **Today's knowledge is accurate but it's a fact sheet.** The Two's Complement module lists the −2ⁿ⁻¹ weight, the range, "all ones is −1", and three misconceptions with corrections. It doesn't say why two's complement addition works, how to tell which wrong model a student holds, or how to move them out of it. Cards then recite the facts ("Say: In your Arrays and Pointers lecture: …") and ask a recall question.
- **A course is a spine of a few ideas, not a list of topics.** CS 3410 has seven. Its threshold concept, "everything is bits; meaning comes from interpretation", appears in at least seven lectures, and a student who lacks it makes what look like different mistakes in six topics.
- **The notes and the model each have authority over different things.** The notes decide scope, notation, conventions and emphasis. The model's expertise decides mechanism and correctness. The Study reconciles the two explicitly: it supplies what the notes skip and catches what they get wrong. I found four real errors in these notes, verified by running code.
- **Personalization means adapting to what this student actually does.** That covers what they know, which wrong models they hold, what has actually worked for them, and how well they judge their own understanding. It does not mean a self-reported "learning style".
- **How we'll know it works:**
  - On probes it never saw, the tutor with Studies beats the same model given just the notes.
  - It never repeats the notes' errors.
  - Simulated students with hidden wrong models actually learn.

---

## 1. What understanding means

We build for this definition and test against it. A student understands an idea when they can:

1. **Predict** what happens in a case they haven't seen.
2. **Explain why**, in terms of a mechanism, not a rule.
3. **Spot an error**, including their own, and say what's wrong with it.
4. **Translate between representations**: bits ↔ value ↔ a position on the number wheel ↔ a circuit ↔ C ↔ assembly.
5. **Know the boundaries**, where the rule stops holding: overflow, INT_MIN, rounding, alignment.
6. **Connect it** to what it rests on and what it enables.
7. **Do the procedure fluently**, and know *which* procedure applies.

On its own, recall ("what's the range of 4-bit two's complement?") tests none of these. Multiple choice tests recognition. The exception is when every distractor is the exact answer a specific wrong model produces; then the question diagnoses. That's the only kind of multiple choice Plato should ask.

---

## 2. What reading CS 3410 end to end showed

### 2.1 The course is a spine

| | Enduring understanding | Where it carries the course |
|---|---|---|
| E1 | **Everything is bits; meaning is interpretation.** The same bits are an unsigned number, a signed number, a float's fields, a char, an address or an instruction, depending on who reads them. | L2 ("the mapping… is arbitrary"), L4 ("everything is bits"), L6 ("in the eye of the beholder", `memcpy` reinterpretation), L7, L8 ("pointers are just bits", said three times), L12 ("a plain ol' number… means something to our circuit"), L14, L16, L17, L18 |
| E2 | **Fixed width means modular arithmetic.** Overflow wraps. Two's complement is a labelling of residues mod 2ⁿ, which is why addition "just works". Truncation keeps the low bits. | L2, L4 (255 + 1 = 0), L10 (the n-bit adder drops its last carry), L16 (truncation, extension), L17 (shifts) |
| E3 | **Memory is one big byte array.** An address is an index into it; a type says how many bytes to read and how to read them. | L8 (`uint8_t mem[SIZE]`), L9 (stack, heap, segments), L7 (padding), L14 (endianness), L16 (load/store widths and offsets), L19 (frames and alignment) |
| E4 | **The abstraction ladder.** Build it, then "forget how it works internally"; each level gives the next its parts. | L1, L10 ("we *earn* the right to use it"), L11, L12, L14 (assembly's two interpretations) |
| E5 | **State and time.** Combinational logic is a pure function. State changes on clock edges. A design is state plus a function from old state to new. The clock period bounds the logic. | L11, L12 (the program counter), L13 (stages, pipelining) |
| E6 | **Conventions are human agreements.** Calling conventions, the ABI, IEEE 754, endianness and register names were chosen, not forced. Knowing which parts were chosen and which parts were forced is a sign of understanding. | L14, L19 ("nothing sacred about the standardized RISC-V calling convention") |
| E7 | **Translating between levels, with the course's own methods.** | L14 ("translate it into pseudocode first"), L18 (simplify C while keeping it valid C: for → while → goto → pointer increments → register map), L10 (sum-of-products recipe), L11 ("assume and confirm" for feedback circuits) |

A topic Study that doesn't know which spine ideas it serves can't make the connections that build transferable understanding. For example:
- L4's 255 + 1 = 0 *is* L10's dropped carry-out.
- L8's pointer scaling *is* why L16's `p[1]` is `sw …, 4(x3)`.
- L8's struct alignment is the same idea as L19's 16-byte stack alignment.

### 2.2 The threshold concept, and why diagnosis has to work across topics

E1 shows up as a pair of operations almost everywhere:
- `%d` / `%u`;
- `int8_t` / `uint8_t`;
- sign extension / zero extension;
- `lb` / `lbu`;
- `sra` / `srl`;
- `blt` / `bltu`;
- `memcpy` versus a cast.

A student whose model is "a bit pattern has one true value" gets each of these wrong in a different-looking way. A tutor that treats topics separately patches six symptoms. A good tutor recognizes one root, repairs it once with contrasting cases, then revisits the topics. Diagnosis therefore has to look across topics.

### 2.3 The instructor already teaches well. Use it, don't flatten it.

The notes are not a textbook dump. They use the moves research favours **(R)**:
- **Predict first.** L6 opens with a program and "see if you can predict what the last line… will print", and only explains it at the end. L4 asks what `0b10000111` prints as `int8_t`.
- **Broken-implementation narratives.** L19 builds the calling convention from four failures in a row: two call sites need a return address, a nested call overwrites `ra` ("Do you see the problem?"), `sp` has to be restored, and "what is `a5` here?". L9 does the same with returning a pointer to a local.
- **Comprehension checks and "try it" prompts.** These are the instructor's own probes: L2's conversion check; L6's `e = −3` with `1111` and converting −5.125; L10's NAND from relays, NOT from NAND, xnor, a mux, a full adder from half adders; L17's "why is there no arithmetic left shift?" and the `0x34ff` trace; L18's `count_eq`; L19's `nth`.
- **Named methods.** "Translate to pseudocode first", "simplify C step by step while keeping it valid C", sum-of-products, "assume and confirm".
- **Tools for running and seeing.** float.exposed, Nandgame, the in-browser RISC-V simulator. Plato already has equivalents: a C sandbox and a RISC-V zone that steps through code and shows registers and memory.

Turning this into statements to recite throws away the best teaching in the material.

### 2.4 What the notes skip

The notes compress, as experts do. A teacher has to supply these:
- **Why two's complement addition works.** The adder computes (a + b) mod 2ⁿ, and signed values are just a different labelling of the same residues. Sign-magnitude labels them unevenly, which is why it needs extra circuitry. The notes say "you'll have to trust us".
- **Why `~x + 1 = −x`.** Flipping every bit is subtracting from all-ones, so `~x = (2ⁿ − 1) − x`, and `~x + 1 = 2ⁿ − x ≡ −x`. The notes check it by brute force, "even if you don't want to try doing the math".
- **Why sign extension preserves the value.** The new top bit weighs −2ⁿ, and the old top bit flips from −2ⁿ⁻¹ to +2ⁿ⁻¹. The net change is zero.
- **Why the float exponent is biased.** It makes non-negative float bit patterns order like integers. The leading 1 is implicit because it's a free bit of precision.
- **Why 0.1 has no exact binary form.** It's a repeating fraction in base 2. Without this, `0.1 + 0.2 == 0.3` failing is just a fact.
- **Why there's no arithmetic left shift.** L17 asks this and never answers it. Shifting left fills from the bottom, so signed and unsigned give the same bits.
- **Why `srai` isn't signed division.** It rounds toward −∞, not toward zero.
- **INT_MIN is its own negation.** In 8 bits, `−(−128) = −128`, because +128 doesn't fit. Verified in C.

### 2.5 What the notes get wrong (verified)

| Where | What the notes say | What's true |
|---|---|---|
| L19, prologue/epilogue sketch | The epilogue "restores" with `sd ra, 0(sp)` and `sd sX, Y(sp)` | It must be `ld`. A store there overwrites the saved values instead of restoring them. |
| L16, "Translating from C" | Signed `p[1] = p[0] / 2` becomes `lw; srai; sw` | Wrong for negative odd values: C gives −3 / 2 = −1, the shift gives −2 (checked in C). gcc adds the sign bit before shifting. |
| L6, the opening example | `(1+y) − (1+x)` prints 0 because x and y are near the bottom of float's exponent range | 1e-8 is nowhere near the bottom. The real reason is precision: the gap between floats at 1.0 is 2⁻²³ ≈ 1.19e-7, so adding anything under half of that (5.96e-8) to 1.0f rounds back to 1.0 (checked in C). |
| L18, `accum` | `int A_i = A;`, and the function never returns `sum` | It should be `int* A_i`, and the function should end with `return sum;`. |

**Why this matters twice:**
- A summarizer teaches these errors. A tutor that understands the material catches them, tells the student "the notes' sketch says `sd` here, it should be `ld`", and keeps the student's trust.
- Errors are the cleanest test of regurgitation there is. If Plato ever says `sd ra` restores the return address, it's reciting.

### 2.6 What signals importance, and what's missing

**Available:**
- the instructor's emphasis: "absolutely critical to recognize the subtle difference between assigning to `*ptr` and assigning to `ptr`", "the most important thing to take away", "the hardest aspect", "moral of the story";
- repetition across lectures;
- built-in exercises;
- worked examples;
- warnings and tips.

**Missing:** past prelims and psets. The course has 19 lecture notes and nothing else. Past exams are the single best evidence of what matters and how it's tested (the problem style, the traps, which spine ideas get combined). Without them, Plato has to infer the exam's shape. **This is the most valuable thing you can add** (§8).

### 2.7 What Plato holds today, and why better facts won't fix it

**What it holds now:**
- **Modules** are accurate summaries in the notes' words (the module writer's prompt literally asks for "as the notes state it").
- **Misconceptions** come with *corrections*: "the leading bit has weight −2ⁿ⁻¹". Research on conceptual change says stating the correct fact rarely dislodges a wrong model **(R)**. The student has to see their model fail, and see a better one succeed.
- **Lessons** word key points "as your notes word them".
- **Cards** recite: "Say: In your Arrays and Pointers lecture: Array elements occupy adjacent memory locations…", then ask a recall question.

**What's missing** isn't accuracy. It's:
- the mechanisms;
- the cross-topic spine;
- wrong models with the answers they produce;
- questions that separate one wrong model from another;
- repairs that work;
- representations chosen for what they make visible;
- routes that branch on the learner;
- an audit of the notes.

---

## 3. What it takes to teach one idea: two's complement, worked in full

This is what a Study should hold. It's what a strong TA carries in their head.

**What matters, and why.** This is E2 at its sharpest and the first place E1 bites. Everything signed later depends on it: overflow, `lb`/`lbu`, `sra`/`srl`, `blt`/`bltu`, sign extension.

**The model, three ways, and why they're the same:**
1. **Weighted bits.** The top bit weighs −2ⁿ⁻¹. So `1101` = −8 + 4 + 1 = −3.
2. **Modular.** An n-bit register holds a number mod 2ⁿ. A pattern whose unsigned value u is at least 2ⁿ⁻¹ means u − 2ⁿ. So `1101` = 13 − 16 = −3. The two views agree because u − 2ⁿ = (the low bits) + 2ⁿ⁻¹ − 2ⁿ = (the low bits) − 2ⁿ⁻¹.
3. **The wheel.** The 16 four-bit patterns sit around a circle, and adding moves clockwise. Unsigned and signed are two sets of labels on the *same* positions. Overflow means crossing the seam: between `1111` and `0000` for unsigned, between `0111` and `1000` for signed.

**The mechanism the notes skip.** The adder (L10) computes the sum mod 2ⁿ. Signed values label the same residues, so the mod-2ⁿ sum lands on the right label whenever the true answer fits. That's why one adder serves both. Sign-magnitude labels negatives running backwards and has two zeros, so plain addition lands on the wrong label. That's the extra circuitry L2 asks you to trust.

**Boundaries:**
- The range is asymmetric, so `−(−8) = −8` in 4 bits.
- Signed overflow happens when the operands share a sign and the result's sign differs.
- In C, signed overflow is undefined behavior, but the hardware wraps (L4).
- Sign extension preserves the value; zero extension doesn't (L16).

**Wrong models, and the exact answers each produces:**

| Wrong model | `1101` → | `1000` → | Other telltale |
|---|---|---|---|
| W1: the top bit is just a minus sign (sign-magnitude) | −5 | "−0" | `1111` → −7 |
| W2: read it unsigned | 13 | 8 | — |
| W3: negate by flipping the bits (ones' complement) | — | — | −`0011` → `1100` (= −4) |
| W4: the range is symmetric | — | — | "4 bits go from −7 to 7", or −(−8) = 8 |
| W5: overflow is an error, or the result is clamped | — | — | `0111` + `0001` → "error" or `0111` |
| W6: extend by padding with zeros | — | — | `1101` → `00001101` = 13 |

**A question that separates the models.** "What is `1101` in 4-bit two's complement?" An answer of −3, −5 or 13 tells you which of three models the student holds. Plato can match those exactly, with no model call, and branch at once.

**Repairs that work, because the student sees their model fail:**
- **W1:** "Add `1101 + 0011` in binary, the way the adder does." The bits give `0000` with the carry dropped. Under their reading that's −5 + 3, which should be −2, but the adder says 0. Under the −8 weight it's −3 + 3 = 0. The adder is the referee.
- **W2:** Put the two rings of labels on the wheel. Same position, two names.
- **W3:** Flip `0011` to get `1100`, then add `0011 + 1100`. That's `1111`, which is −1, not 0, so you need the +1.
- **W5:** Run it in the code zone: an `int8_t` at 127 plus 1, and L4's `uint8_t` loop. Watch it wrap.
- **W6:** Compute both extensions of `1101` and their values. Then explain why copying the sign bit preserves the value.

**What to show, and what to notice:**
- **The number wheel.** Notice that one position has two labels, and where each seam is.
- **The place-value table** with −8 over the top bit. Notice that the top bit outweighs all the others combined.
- **A code zone** printing the same bits with `%hhd` and `%hhu`. Notice that it's the same bits read two ways.

**The course's own material to read, and when:**
- L2 "Two's Complement" for the two views. Read it after they've tried the wheel, looking for the sentence that says the same thing.
- L4's `0b10000111` → −121. Use it as a "predict before running" item.

**The route branches on the learner:**
- **Never seen it:** start from the odometer, then the wheel, then the weights. Work `1101` together, then have them predict `1111` and `1000`. Explain why addition works after they've seen `0011 + 1101 = 0000`.
- **Knows unsigned binary well:** start by trying. "If `1111 + 0001` must give `0000`, what should `1111` mean?" They derive −1 and generalize the weight. This is productive failure, with low cost here **(R)**.
- **Holds W1, W2 or W3:** the separating question, then that model's repair.
- **Fluent:** go integrative. `lb` versus `lbu` on `0x9c`; `srai` on −3410 versus C's `/ 2`; why `−INT_MIN = INT_MIN`; why there's no arithmetic left shift.

**Evidence of understanding:**
- They explain why the adder needs no signed mode.
- They decode and encode at any width.
- They predict overflow results.
- They explain why sign extension preserves the value.
- They connect it to `lb`/`lbu`.
- They spot that 4 bits have no −0 and an asymmetric range.

Today's module holds about a fifth of this.

---

## 4. The moves, and when each is right

These are first principles from the course reading. **(R)** marks rules the research briefs will confirm or sharpen.

| Moment | Right move | Wrong move |
|---|---|---|
| First contact, little prior knowledge | A concrete representation, then a worked example with its steps named, then an immediate "you try" on a near variant **(R: worked examples, expertise reversal)** | A definition followed by a recall question |
| First contact, solid prerequisites | A predict-or-try problem before any explanation, then the explanation tied to what they tried **(R: productive failure, "a time for telling")** | A long explanation of what they could have worked out |
| A correct answer | One check that it isn't shallow: "why?", a twist, or a boundary case. Then move on or up a level. | Praise, then the next easy item |
| A wrong answer that reveals a known wrong model | Name nothing yet. Pose the case where their model fails (the adder as referee), let them see it, offer the better model, then have them re-predict **(R: conceptual change, refutation)** | Stating the correct fact |
| A wrong answer, cause unclear | A separating question, so the next answer identifies the model | Guessing which explanation they need |
| Stuck | A graded hint: a pump ("what do you know about the top bit?"), then a hint, then a worked step **(R: AutoTutor, expert tutors)** | Giving the answer |
| Says "got it" | A transfer probe before believing it **(R: illusion of fluency)** | Moving on |
| Already knows it | Skip to integrative or exam-level problems | Making them sit through the basics |
| Asks a question off the plan | Answer it from the model, briefly, then return. If it reveals a gap, that gap may be the real goal. | Ignoring it, or abandoning the thread |

**What to read, and when.** *(Revised 8 Oct after the reading research; see `docs/system-spec.md` §13 and `docs/research/reading.md`.)*
- **Serve the notes as a reading** when they're clear and at the learner's level.
- **Write a faithful explainer** when they're terse or wrong.
- **Never read them aloud.**
- **Long explanations go on the page,** with a purpose and up to three prequestions, followed by one light consolidation.
- **Reading is weak only without a purpose and a check;** it's not weak as a first exposure.

**What to quiz with.** Use generative formats:
- predict;
- explain why;
- trace (registers and memory, step by step);
- translate (C ↔ assembly ↔ bits);
- build (NOT from NAND, xnor by sum-of-products);
- find the bug (the errata make perfect items);
- contrast (`lb` versus `lbu` on the same byte);
- transfer to an unseen setting;
- integrative problems that combine spine ideas.

Use multiple choice only when its distractors are wrong models' answers.

**What to visualize.** One canonical picture per spine idea, each with what to notice:
- **The memory column for E3:** addresses and bytes, with variables as labelled spans and pointers as address values. Used for pointers, arrays, endianness, load/store and frames.
- **The number wheel for E1 and E2.**
- **Bit-field diagrams:** the float's s|e|g fields, R/I instruction formats.
- **Truth table → circuit.**
- **Timing waveforms for E5.**
- **The pipeline chart.**

Better still, have the student draw it ("draw the stack frame after the prologue"). Drawing is generative, and Plato can already read ink.

---

## 5. Making it fit the person

**What not to do.** Matching teaching to a self-reported "visual, auditory or kinesthetic" style doesn't improve learning. This is one of the most-tested negative results in education research **(R)**. So "how you learn best" can't mean that.

**What it can legitimately mean, all inferred from evidence:**
- **What you already know, per concept and per spine idea.** This decides worked example versus problem first, where to start, and how much scaffolding to give. The expertise reversal effect: what helps a novice slows down someone who already knows it **(R)**.
- **Which wrong models you hold**, with the evidence for each. This decides the separating question and the repair.
- **What has actually worked for you.** Track which repairs and representations were followed by success on the next probe: the wheel worked and the algebra didn't, or running code convinced you and reading didn't. Prefer those next time, for related ideas. This is evidence, not self-report.
- **How well you judge yourself (calibration).** Compare your confidence with your accuracy:
  - If you're overconfident, Plato asks for more prediction and transfer checks and lets you see your own errors.
  - If you're underconfident, it points out the specific reasoning you got right.
- **Your goals, background and constraints.** For example, knowing Java references makes pointers a contrast with something familiar ("there's no magic").
- **Pace and affect.** Frustration after repeated misses means a worked step and an easier rung. Boredom means skipping ahead.
- **Stated preferences.** "Explain first" or "let me try first" is honored at the start, then adjusted by evidence for each concept, and Plato says so.

**Diagnosis across topics.** The learner model tracks spine ideas as well as concepts. When errors in several topics point to one root (E1 in `lb`/`lbu`, `srl`/`sra` and `%d`/`%u`), the director names the root and repairs it once.

**Choosing what to work on, by leverage.** No schedule. The next goal is whatever most increases understanding across the course for the effort, in this order:
1. what you asked for;
2. else a weak threshold or spine idea that unlocks several topics;
3. else the weakest prerequisite of what you're working toward;
4. else the next idea you haven't understood, prerequisites first.

---

## 6. How this maps onto Plato

**The course Study (new).** One per course:
- the spine;
- the threshold concepts;
- cross-topic links, each with its reason;
- the course's methods and notional machines;
- canonical visuals;
- importance signals;
- the notes audit (errata);
- integrative problem families.

It's built first, and every topic Study builds on it.

**Topic Studies.** Each holds:
- what matters and why;
- the mechanisms;
- gaps it fills;
- errata;
- wrong models, each with the answers it produces, a separating probe and a repair;
- representations with what to notice;
- reading moves with "look for";
- routes that branch by learner state;
- problems with answers checked by running (C sandbox, RISC-V tracer, arithmetic);
- links to the spine;
- evidence of understanding.

They're built in dependency order. A self-exam checks each one before use (§7).

**The grounding rule changes.**
- *Old rule:* "every claim must come from the notes". That rule forces regurgitation.
- *New rule:*
  - Nothing taught contradicts the notes, unless it's a flagged erratum.
  - Everything taught is in the course's scope.
  - Notation and conventions are the course's.

**Diagnosis is fast because the Study is specific.** Each wrong model lists the exact answers it produces, so most diagnoses are exact matches made with no model call (an answer of −5 to `1101` means W1). The director's deep calls go to preparing repairs and routes ahead of time, not to guessing during the conversation.

**The director becomes a teaching policy over Studies.** At each moment (§4 table) it picks a move kind and content from the Study and the learner model. Cards carry the move. The voice performs it, in its own words, without reciting the notes.

**Using what the page already has:**
- the code zone (C runs, RISC-V steps) for "run it and see";
- notes boards (the actual passage, with a "look for") for reading moves;
- diagrams for the canonical visuals;
- ink for "draw it" and handing in written work.

**What goes:**
- **The schedule.** Removal is in progress.
- **Lessons, once Studies teach.** Their good parts (ladders, test first and scaffold on a miss) move into routes.
- **The module writer's "in the notes' words" instruction.**

---

## 7. How we'll know it works

Each check is one we can rerun and that can't easily be gamed:

1. **Ablations.** The same probes go to the model alone, the model with the notes, the model with today's modules, and the model with Studies. A Study earns its place only by beating "model + notes". Probes must be course-specific (notation, conventions, the course's methods) and pedagogical (diagnose this wrong answer, choose a separating question, design a repair). General knowledge passes without any Study, so it proves nothing.
2. **Regurgitation traps.** These are the four errata in §2.5. Any representation or tutor that reproduces one is reciting.
3. **The instructor's own probes,** frozen with checked answers.
4. **Diagnosis across topics.** A simulated student whose root is "a bit pattern has one value" makes errors in several topics. Did the tutor find the root?
5. **Simulated students with hidden states.**
   - Each has a hidden wrong model and learns only when the move actually addresses it, judged by a separate model that can see the hidden state.
   - Before trusting a simulator, check it: given W1, does it reliably answer −5 to `1101`?
   - The headline number is learning gain on held-out probes.
6. **Personalization.** Simulated students differ in background, in whether they try first or need examples, and in over- or under-confidence. Did Plato's choice of moves differ appropriately between them?
7. **The real check:**
   - your own sessions, through the learner model's evidence;
   - your judgment of the sessions;
   - ideally, how Prelim 1 goes.

---

## 8. What I need from you

- **Past prelims and psets.** The past Prelim 1s on Canvas (the Fall 2024 exam and practice exam, Spring 2025 A and B), plus any psets. Dropping them onto the page is the biggest single improvement to "what matters and how it's tested". Plato files them into topics automatically, and the exam's problem style becomes the target for transfer.
- **Your background.** Which of CS 2110, 2800, a digital logic course or C you've had. The intro asks, but it calibrates the first session.
