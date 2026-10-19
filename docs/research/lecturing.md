# Lecturing: how to teach a whole topic, especially mathematics and proof

Research brief for Plato's lesson mode (the "lecturing face"). Plato is a strong reasoning model teaching beside a shared page. It writes slides, diagrams, LaTeX, interactive figures and proof-writing regions on the page and talks in the chat log next to it. The current test course is Cornell CS 2800 (logic, sets, proof techniques, induction, relations, functions, cardinality). Compiled 2026-10-15.

This brief avoids repeating its siblings. It points to them where they already cover something:
- `tutoring-evidence.md`: the help ladder, contingency, the assistance dilemma, LLM tutor studies, study and learning modes.
- `deep-understanding.md`: conceptual change, ICAP, productive failure, concreteness fading, analogy, contrasting cases.
- `reading.md`: reading portions, inserted questions, AI-written text.
- `voice-and-multimedia.md`: Mayer's principles, pointing, drawing as you explain.

Confidence tags follow `tutoring-evidence.md`:
- **[V]** checked this pass against the primary text or abstract.
- **[S]** taken from a published summary or secondary write-up.
- **[K]** established literature cited from background knowledge; check exact figures before quoting them.

---

## 0. The short version: what great lecturers know, for Plato to draw on

Plato runs on a high-reasoning model, so this section is not a script. It sets out what the student wants from a lesson and what skilled lecturers and the research know, so the model can judge each moment for itself. A few firm lines appear at the end. Each one answers a specific failure that the evidence documents.

### 0.1 What the student wants from lesson mode

- **To be taught a topic, not quizzed through it.** The student asked for a mode that is "way more verbose about a certain topic and is willing to break it down and teach it to you." Short Socratic turns work for small problems. A new topic in discrete math needs exposition: definitions, the ideas behind them, worked proofs, and the reasons for each step.
- **To end up able to do the exam's work.** In CS 2800 that work is reading a definition precisely, recognising which proof technique a statement calls for, and writing a correct proof. A lesson succeeds when the student can do these things on a new statement, not when the explanation reads well.
- **To have the important things on the page.** Earlier sessions established this: "don't speak it at me, write it down." The page is what the student studies from later.
- **Not to be nagged.** The student asked for no pings while they think, and for questions only when checking would actually help.

### 0.2 What makes an explanation teach

**Explanations fail more often than teachers expect.** Wittwer and Renkl's (2008) review of instructional explanations, and their 2010 meta-analysis, found small and variable effects. Explanations work when four things hold:
- they fit what this learner already knows;
- they centre on concepts and principles, not procedures alone;
- they support the learner's own thinking rather than replacing it;
- the learner then *uses* them on something.

An explanation that is fluent but unused is the expensive kind of nothing (§1.1).

**The expert's sense of clarity is not evidence.** The curse of knowledge is strong and hard to debias (Hinds 1999).

The sharpest demonstration is Lew et al. (2016). An award-winning professor gave a lecture proof that researchers and a second instructor judged clear. Six students then watched it twice and missed nearly every point he considered central. Two things went wrong:
- His key ideas were spoken, not written. Students' notes copied only the board.
- He used informal idioms ("make it small", "your toolbox") that carried a precise meaning to him and a vague one to them.

Feynman's famous lectures had the same problem: faculty loved them while enrolled students dreaded the course (§2.1).

For Plato the lesson is that the method and the "why" belong on the page, in words. Informal shorthand must be defined the first time it is used.

**Clarity is a set of concrete behaviours, not a tone.** Teacher clarity has one of the more robust links to learning (Titsworth et al. 2015 meta-analyses: moderate cognitive effects, larger affective ones). In practice it means:
- saying where the lesson is going;
- defining terms before using them;
- one idea at a time;
- examples tied explicitly to the idea;
- marking transitions ("that was the definition; now the first proof that uses it");
- recapping at the end of each segment.

Rosenshine's principles from the classroom-process research say the same:
- open with a short review;
- present new material in small steps, with practice after each;
- model with worked examples;
- check understanding often;
- aim for a high success rate (§1.2).

**Order ideas for learning, not for logic.** A textbook goes definition, theorem, proof. Great explainers often reverse that order:
- Sanderson: "Never start with definitions… definitions should be seen as an ending point." "Concrete before abstract. Open with the key exercise."
- Tao: rigour should "destroy bad intuition while clarifying and elevating good intuition," not replace intuition.
- Concreteness fading (`deep-understanding.md` §6.1) is the evidence-based version of this ordering.

A strong lesson usually moves in this order:
1. A motivating question or puzzle.
2. Small concrete cases.
3. The pattern the cases show.
4. The formal definition as the precise statement of that pattern.
5. Its consequences.

The student then sees the definition as an answer, not as an arbitrary rule.

**Build the idea; don't list facts.** The typical LLM failure is a bulleted inventory: "Key properties of equivalence relations: 1. … 2. … 3. …". A lecture is an argument. Each segment should answer a question the previous one raised. The student should be able to say why the next thing is coming.

**Segment, and match the length to the content.** Learner-paced segments beat continuous exposition (Mayer's segmenting principle; see `voice-and-multimedia.md` §1.6). Students skim long text. In one study, reading speed on textbook passages over 600 words jumped to about 800 words per minute, which is skimming. In a concise textbook that kept passages under 250 words, students read carefully (Gordon, Lysecky & Vahid 2022). Engagement with lecture videos drops after about six minutes (Guo et al. 2014). For a chat message, a single idea fully developed usually fits in a few short paragraphs plus one page write. A lesson is long because it has many such segments, not because each message is long.

**Questions inside exposition keep minds on it.** Short retrieval questions inserted into a lecture halved mind-wandering, from about 40% to about 20%. They also raised final-test scores and lowered anxiety (Szpunar, Khan & Schacter 2013). The kind of question matters too. Materials organised around deep-reasoning questions ("why does the base case matter?", "what would break if f weren't injective?") taught more than the same content as monologue (Craig et al. 2006). Plato can pose such a question rhetorically just before answering it, which costs nothing. It can also stop and hand the question to the student when their answer would reveal something.

### 0.3 Teaching mathematics and proof

**What students find hard is known.** Moore (1994) identified three sources of trouble in the transition to proof:
- concept understanding: knowing what the definition says and having examples of it;
- language and notation;
- getting started.

Students also misuse definitions. They can recite one and still reason from their personal "concept image" instead (Tall & Vinner 1981; Edwards & Ward 2004). Unpacking quantified statements is very hard: in one study only 5–8.5% of attempts succeeded (Selden & Selden 1995). Many students accept examples or authority as proof (Harel & Sowder's empirical and external proof schemes). A good lesson works on each of these deliberately.

**A definition, taught well, usually involves:**
1. **The question it answers.** What situation makes us want this concept? (Why care whether f is injective? So that no information is lost and f can be undone.)
2. **Several small examples, then non-examples that differ in one feature only.** Engelmann's minimal-difference and sameness principles; Watson and Mason's example spaces. For instance:
   - f(x) = 2x on ℤ is injective;
   - f(x) = x² on ℤ is not;
   - f(x) = x² on ℕ is injective;
   - the same rule changes status when the domain changes.

   Draw the arrow diagram for each.
3. **The formal statement, then unpacked part by part.** For each part: what it says in plain words, what each quantifier ranges over, and the order of the quantifiers. Then the negation, because proving "not injective" needs it: ∃ a₁ ≠ a₂ with f(a₁) = f(a₂).
4. **The proof framework the definition gives.** To prove f injective: "Let a₁, a₂ ∈ A with f(a₁) = f(a₂). … Therefore a₁ = a₂." The Seldens call this the *formal-rhetorical* part. It can be written from the logical form of the statement alone, before any insight, and it isolates the *problem-centred* part that needs real thought. Teaching students to write the framework first directly addresses Moore's "getting started" difficulty.
5. **A request for the student to generate an example.** For instance, "an injective function ℕ → ℕ that isn't surjective". Generating examples is both a strong learning activity and a strong diagnostic. A thin example space shows up immediately (Watson & Mason).

**A proof or a proof technique, taught well, usually involves:**
- **Strategy before steps.** Say what the plan is and why it's the natural plan for this statement's form:
  - "the goal is a ∀ … → …, so assume the hypothesis about an arbitrary element";
  - "the statement is about all n ≥ 0 and P(n+1) is built from P(n): induction".

  Mathematicians say they present proofs mainly to convey methods (Weber 2012). Students read proofs as chains of calculations and miss the method (Lew et al. 2016). Write the method on the page.
- **Visible structure.** Show the skeleton first, then fill it in:
  - the framework;
  - labelled parts ("Base case", "Inductive step: assume P(k)… show P(k+1)");
  - the key idea marked as the key idea.

  Leron's structured proofs helped students discuss key ideas (Fuller et al. 2011). Keep each claim near its justification, though; fully hierarchical layouts "jump around" for students.
- **Scratch work, then the final proof.** Real proofs are found from both ends and then reordered (Velleman's scratch-work sections; Fleck's construction-order notes). Show the search, for example "which k makes this work? work backwards from the goal", in a scratch region. Then write the clean proof in logical order, and say explicitly that you reordered it.
- **A generic example alongside the formal proof.** Several mathematicians run a concrete instance next to the proof, doing each step on the example at the same time (Weber 2012; the generic-proof tradition). For induction, run the step from P(3) to P(4) concretely before writing the step from P(k) to P(k+1).
- **The student explains, rather than reading Plato's line-by-line annotations.** Self-explanation training raised proof comprehension by about one standard deviation, and the gain was still there three weeks later (Hodds, Alcock & Inglis 2014). Students were taught to ask of each line "why does this follow, from what?" and to link it to earlier lines, instead of paraphrasing. e-Proofs, which narrated and highlighted every line for the student, matched written proofs at first but led to *worse* retention (Roy, Inglis & Alcock 2017). So annotate the *idea* and the *structure*. For individual inferences, have the student supply some of the "because"s.
- **Know what "understanding a proof" means.** Mejía-Ramos et al. (2012) list seven aspects. This is also a menu for checks, and a mix of local and holistic ones works best:
  - Local:
    - the meaning of the terms;
    - the logical status of each statement (assumption, goal, or derived);
    - the justification of each claim.
  - Holistic:
    - summarising the high-level idea;
    - identifying the modular structure;
    - transferring the method to another statement;
    - illustrating it with an example.
- **Wrong proofs teach.** Use near-miss proofs: induction without a base case, the "all horses are the same colour" proof, "assume P(k+1)", proving the converse, checking three cases and calling it a proof. These target exactly the proof schemes students fall back on. Asking "find the flaw" is a strong check.

**Concreteness fading and analogy apply directly** (`deep-understanding.md` §6). Some fades for this course:
- Equivalence classes: sorting integers into three coloured bins by remainder mod 3, then the partition picture, then [a] = {b : a ~ b}.
- Pigeonhole: socks in drawers, then the general statement, with the real skill made explicit as "what are the pigeons and what are the holes?".
- Countability: listing pairs in a grid by diagonals, then the bijection ℕ → ℕ × ℕ.

Every analogy needs its breaking point named. Dominoes for induction hide that the inductive step is an *implication* proved for an arbitrary k.

### 0.4 Telling, asking, and how much to say

`tutoring-evidence.md` §1.9 and §4 already cover contingency, the assistance dilemma, expertise reversal and productive failure. Three points are new here:
- **Most of a lecture is legitimate telling.** It works when the learner does something with each piece soon after. Prompted self-explanation beat added instructional explanations in example-based learning, because extra explanations reduce the learner's own explaining (Schworm & Renkl 2006). Plato should explain fully, then hand a piece of the thinking back.
- **Decide how much to say from what the learner produces, not from how the explanation feels.** A quick way to probe is to ask for the first step of a new item: "how would you start proving this is an equivalence relation?" (Kalyuga's rapid assessment). Fluent framework-writing means skip ahead. A blank or a recited definition means slow down.
- **Hearing a good tutoring dialogue teaches better than hearing a monologue.** In vicarious-learning studies, the dialogue with a tutee's questions taught more (Craig et al. 2000; Driscoll et al. 2003; Muldner, Lam & Chi 2014). Plato can make the student's likely questions part of the exposition ("You might be wondering why we need reflexivity at all…"). It should not invent student lines in the chat.

### 0.5 LLM-specific risks

- **Verbosity is a default, not a choice.** Models pad even when told to be concise (verbosity compensation; YapBench). LLM tutor replies are longer and more polite than expert tutors' replies. The same comparison found that pressing for reasoning was associated with higher quality, and agentic and polite language with lower quality (Abdulsalam & Aroyehun 2025/26). LLM judges also prefer longer answers (Saito et al. 2023). Plato's evals therefore cannot use "more thorough" as a stand-in for "teaches better".
- **Fluent explanations inflate felt learning** (Kumar et al.; see `reading.md` §6.2). After a long explanation, "I get it" means little.
- **AI help can raise homework and leave exams unchanged.** In a 148-student proof course, an LLM proof-feedback tutor improved homework but not exams. Heavy chatbot use by low-self-efficacy students was linked to lower midterm scores, and their heavy use of the proof-*review* tool to higher final scores (Chen et al. 2025). Feedback on the student's own written proof helps; answers to read do not.

### 0.6 What goes on the page, and what in the chat

The page holds whatever the student will need later:
- definitions and their unpacked parts;
- example and non-example tables;
- diagrams;
- the proof framework;
- the scratch work and the clean proof;
- the one-line statement of the method ("Strategy: pick an arbitrary element, push it through the definitions");
- a short recap at each segment's end.

The chat carries the narration:
- motivation and transitions;
- the "why" told as a story;
- pointers to what's on the page;
- questions.

Lew et al. is the evidence for this split: the ideas that were only spoken were lost.

### 0.7 Firm lines (each answers a documented failure)

1. **Key ideas, methods and definitions of shorthand go on the page, not only in the chat.** Spoken-only ideas were lost even from an excellent lecture (Lew et al. 2016).
2. **No single unbroken wall of text.** Text over about 600 words gets skimmed (Gordon et al. 2022). Model verbosity is the default failure (§3).
3. **No line-by-line narration of a proof in place of the student's own explaining.** It matched reading the plain proof at first and hurt retention (Roy et al. 2017). Self-explanation helped (Hodds et al. 2014).
4. **Don't take "makes sense" or "got it" as evidence.** Covered in the sibling briefs. It matters more here because fluent explanations inflate felt understanding.

### 0.8 A brief-sized distillation (if this goes into `lessonBrief`)

> You're lecturing this topic: take the room you need, across several messages. Start from why the idea is needed and small concrete cases; arrive at the definition as the precise version of what the cases show. Unpack every definition (quantifiers, their order, the negation), show examples and minimal-difference non-examples, and write the proof framework it gives. For proofs, say the plan and why it fits the statement's form, show scratch work then the clean proof, run a concrete instance alongside, and mark the key idea. Everything the student will need later (definitions, methods, frameworks, the key idea in words, recaps) goes on the page; the chat narrates and links. Build each part on the last rather than listing. Define any informal phrase the first time you use it. Now and then hand back a piece of real thinking (an example to generate, a "why does this line follow?", the first step of a new statement) and adapt to what they produce, not to how clear it felt to you.

---

## 1. What makes an explanation or lecture teach

### 1.1 Wittwer & Renkl: why instructional explanations often don't work

- **Wittwer & Renkl (2008)**, "Why instructional explanations often do not work: A framework for understanding the effectiveness of instructional explanations," *Educational Psychologist* 43(1), 49–64. [V citation; K content] Explanations are ubiquitous, yet they frequently show no benefit. The framework names four conditions for an effective explanation:
  1. it is adapted to the learner's prior knowledge;
  2. it focuses on concepts and principles;
  3. it is integrated into the learner's ongoing cognitive activity rather than replacing it;
  4. it is followed by an opportunity to *use* it.

  Citing work attributes failures to recipients' "mental passivity… that leads to shallow processing" (Berthold & Renkl 2010; via [escholarship](https://escholarship.org/content/qt00q0t4h1/qt00q0t4h1_noSplash_0b1d51546bd7f26c1bb86e5bb3df1a4c.pdf), [Springer](https://link.springer.com/doi/10.1007/s10212-010-0049-y)). [S]
- **Wittwer & Renkl (2010)**, "How effective are instructional explanations in example-based learning? A meta-analytic review," *Educational Psychology Review* 22, 393–409. 21 studies and 28 comparisons. Overall benefit was minimal and variable. Explanations helped more for conceptual ("substantive") knowledge than for procedural knowledge. [S, via a teacher-training summary; check the paper for figures]
- **Schworm & Renkl (2006/2007)**, "Learning by solved example problems: Instructional explanations reduce self-explanation activity" ([CogSci PDF](https://escholarship.org/content/qt00q0t4h1/qt00q0t4h1_noSplash_0b1d51546bd7f26c1bb86e5bb3df1a4c.pdf)). 2×2 design, 80 student teachers. Self-explanation prompts had the favourable effects. Adding instructional explanations lowered learners' own explaining. [V abstract]
- **Wittwer, Nückles, Landmann & Renkl (2010)**, *Journal of Educational Psychology* 102, 74–89, "Can tutors be supported in giving effective explanations?" Also Wittwer, Nückles & Renkl (2010), *Educational Psychology Review* 22, 9–23, on diagnosis-based individualisation ([Göttingen list](https://www.uni-goettingen.de/en/research/116760.html)). Explanations adapted to an assessment of the learner's knowledge did better. [S]

**Implication.** Plato's explanations need the learner's next action built in. The fit to prior knowledge comes from evidence the student has produced, not from guessing.

### 1.2 Explicit instruction: Rosenshine, Engelmann, teacher clarity

- **Rosenshine (2012)**, "Principles of Instruction," *American Educator* 36(1) ([summary](https://en.wikipedia.org/wiki/Barak_Rosenshine), [Chartered College](https://my.chartered.college/?p=5329)). [V summaries] The principles draw on three sources: cognitive science, studies of master teachers, and cognitive supports. They are:
  - a daily review;
  - new material in small steps, with practice after each;
  - many questions;
  - modelling with worked examples;
  - guided practice;
  - checking understanding;
  - a high success rate (about 80%);
  - scaffolds for hard tasks;
  - independent practice;
  - weekly and monthly review.

  A TES critique calls the principles underspecified ([TES](https://www.tes.com/magazine/teaching-learning/general/why-rosenshines-principles-arent-all-they-seem)).
  - *For Plato:* the arc of short review, small step, model, check, practice is what a skilled classroom lecturer does. The "small steps" are the segments.
- **Engelmann & Carnine, *Theory of Instruction* (1982/1991): "faultless communication."** Teach a concept with a sequence of examples and non-examples:
  - the *sameness* principle: examples that look very different but share the label;
  - *minimal difference*: an example and a non-example that differ in one feature;
  - *juxtaposition*: show them side by side;
  - consistent wording;
  - an unpredictable order when testing.

  ([Hendrick summary](https://carlhendrick.substack.com/p/the-power-of-examples-and-non-examples), [Barton](https://mrbartonmaths.com/categorical-atoms/)). [S]
  - **Stockard et al. (2018)**, *Review of Educational Research* 88(4), 479–507 ([open access](https://scholarsbank.uoregon.edu/items/9c5db747-52be-4bd8-8771-b05d0f7c0b01/full)). 328 studies over 50 years. Direct Instruction curricula had uniformly positive, "moderate to large" effects. Wikipedia reports about 0.6 SD; not checked against the paper. [V abstract]
  - *For Plato:* this is the most precise craft account of teaching a definition. Use the minimal pairs from §0.3: x² on ℤ against x² on ℕ, a relation that fails only transitivity, a partial order against a total order on the same set.
- **Teacher clarity.**
  - **Titsworth, Mazer, Goodboy, Bolkan & Myers (2015)**, *Communication Education* 64(4), 385–418 (doi:10.1080/03634523.2015.1041998). Two meta-analyses (144 effects, N = 73,281; 46 studies, N = 13,501). Clarity had a moderate effect on cognitive learning and a larger one on affective learning, with heterogeneity left unexplained. The authors urge measuring low-inference *behaviours*. [V abstract] A secondary report gives d = 0.72 for cognitive learning. [S]
  - Hattie's *Visible Learning* lists teacher clarity at d ≈ 0.75 (Fendick 1990). [K]
  - *For Plato:* clarity means observable moves: preview, define before use, one idea at a time, examples linked to the idea, explicit transitions, summaries.
- **Kirschner, Sweller & Clark (2006)**, "Why minimal guidance during instruction does not work," *Educational Psychologist* 41(2). For novices, guided instruction beats discovery. [K] Read it together with productive failure (`deep-understanding.md` §3.2). Try first for *why* ideas; show first for conventions and formats, and proof frameworks are conventions.

### 1.3 Cognitive load, segmenting, pretraining, worked-example fading

These are covered in `voice-and-multimedia.md` §1 and `deep-understanding.md` §3. Only lecture-specific points are added here.
- **Pretraining** (Mayer): teach names and parts before the process. In proof lessons the parts are notation and vocabulary: ∀, ∃, "arbitrary", "WLOG", ⊆ against ∈, [a], f⁻¹(S). Moore's second difficulty, language and notation, is exactly this. [K]
- **Worked-example fading** (Renkl & Atkinson 2003, backward fading). Give a full worked proof, then one with the last step blank, then one with only the framework given, then a solo proof. [K] This fits the proof-writing regions on the page directly: Plato pre-fills the framework and leaves gaps.
- **Expertise reversal** (Kalyuga et al. 2003). The same detailed exposition that helps a novice slows down a student who already has the schema. [K] **Rapid assessment** (Kalyuga & Sweller 2004): ask for the first step of a task to estimate expertise quickly. [K] This is new beyond `tutoring-evidence.md`. It is a cheap probe before deciding how much to lecture.
- **Segment length.**
  - Guo, Kim & Rubin (2014), [L@S paper](https://up.csail.mit.edu/other-pubs/las2014-pguo-engagement.pdf): 6.9 million edX viewing sessions. Shorter videos were much more engaging; summaries put the drop at about 6 minutes. Khan-style tablet drawing beat polished slides. [V paper; the 6-minute figure is S]
  - Gordon, Lysecky & Vahid, "Less is more: Students skim lengthy online textbooks," *IEEE Transactions on Education* 66(2), 2023 (online 2022) ([zyBooks](https://www.zybooks.com/research-items/less-is-more-students-skim-lengthy-online-textbooks/)). Passages over 600 words were read at about 800 words per minute (skimming), against about 200 for short passages. A concise book with passages under 250 words kept careful reading. The authors recommend concise explanations plus active-learning prompts. [V summary]
  - Edgcomb et al. (2015): "Students learn more with less text that covers the same core topics" ([PDF](https://www.zybooks.com/wp-content/uploads/2016/06/Students-Learn-More-with-Less-Text-that-Covers-the-Same-Core-Topics.pdf)). [S]

### 1.4 The curse of knowledge

- **Hinds (1999)**, *Journal of Experimental Psychology: Applied* 5(2), 205–221 (doi:10.1037/1076-898X.5.2.205). Experts underestimated how long novices would take, more than people with intermediate experience did. Debiasing (recalling how they themselves learned, a list of novice difficulties) did not remove the bias ([notes](https://publish.obsidian.md/joelchan-notes/discourse-graph/sources/%40hindsCurseExpertiseEffects1999)). [S]
- **Newton (1990)**, the tapping study: tappers predicted listeners would name 50% of songs; listeners named about 2.5%. [K]
- **Lew et al. (2016)**, the mathematics case, is in §2.1.
- **The implication for an LLM.** Plato's sense that "that was clear" carries no information. Only the student's output does. Debiasing by instruction failed in humans, so the fix is behavioural: produce evidence. The fix is not to tell the model to be clearer.

### 1.5 Advance organizers, signposting, summaries

- **Ausubel (1960)**; **Luiten, Ames & Ackerman (1980)**, *American Educational Research Journal* 17, 211–218: a meta-analysis of advance organizers with small positive average effects on learning and retention. Mahar's 1980–1990 update found effects generally positive and widely varied ([IDEALS](https://www.ideals.illinois.edu/items/20405)). [S]
- *For Plato:* a short opening that names the destination and connects to what the student knows is cheap and modestly useful. Examples:
  - "Today: when two things count as 'the same'. You already know mod arithmetic, and that's the model."
  - Signalling during the lesson ("Part 2: why reflexivity matters") and a two- or three-line recap on the page at each segment's end help organisation (`voice-and-multimedia.md` §1.2).
  - Organizers that are abstract summaries of what comes next help less than ones that hook onto known material. [K]

### 1.6 Checks inside exposition

- **Szpunar, Khan & Schacter (2013)**, *PNAS* 110(16) ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3631699/)). Short tests inserted into an online statistics lecture:
  - halved mind-wandering, from about 40% to about 20%;
  - increased note-taking;
  - improved final-test performance;
  - reduced anxiety about the cumulative test.

  The study used one lecture on one topic. Jing, Szpunar & Schacter (2016) extended it to a 40-minute lecture, with better integration of related information. [V]
- **Craig, Sullins, Witherspoon & Gholson (2006)**, "The deep-level-reasoning-question effect," *Cognition and Instruction* 24, 565–591. College learners gained more when a deep-reasoning question came before each content sentence. Driscoll et al. (2003): overheard dialogue with deep questions produced more relevant recall than monologue. A physics follow-up found the effect *inhibited* learning in high-knowledge learners ([LearnLab](https://learnlab.org/research/wiki/index.php/Vicarious_learning)). [S] This is expertise reversal again: drop the scaffolding for strong students.
- **Pashler et al. (2007)**, IES practice guide *Organizing Instruction and Study to Improve Student Learning*. Recommendations:
  - alternate worked examples with problems;
  - combine abstract and concrete representations;
  - use quizzing;
  - ask deep explanatory questions.

  [K]
- **What a check should look like** is in `deep-understanding.md` §9 and `tutoring-evidence.md` §4.6: generative, never "make sense?". For proofs, use the Mejía-Ramos menu (§2.3).

### 1.7 Concreteness fading, analogy, contrasting cases

These are covered in depth in `deep-understanding.md` §6. One addition for lectures:
- **Richland, Zur & Holyoak (2007)**: in higher-achieving countries teachers kept the analogy's source *visible* next to the target and linked parts with gesture. [K] On Plato's page, keep the concrete instance on screen beside the abstract statement, with arrows or colour linking corresponding parts. Don't replace one with the other.

---

## 2. Teaching mathematics and proof

### 2.1 How lectures in advanced mathematics fail

- **Lew, Fukawa-Connelly, Mejía-Ramos & Weber (2016)**, "Lectures in advanced mathematics: Why students might not understand what the mathematics professor is trying to convey," *Journal for Research in Mathematics Education* 47(2) ([preprint PDF](https://sites.math.rutgers.edu/~jpmejia/files/Lew_JRME.pdf)). [V full text]
  - **Studied.** A real analysis lecture proof by a professor reputed to be outstanding, with high evaluations. The professor was interviewed by video recall about what he meant to convey. Six students watched the lecture, in pairs and then clip by clip, after being given the board text.
  - **Result.** "The students did not comprehend the ideas that the professor thought were central." Two factors are proposed.
    - **Idioms.** He said "small" eight times to mean *arbitrarily* small, and "toolbox" to mean inequality techniques. Students heard "not complicated" and "any technique"; one student thought of Mathematica.
    - **The calculation orientation.** Students treated the algebra as the point and missed the method, consistent with surveys in which most majors think understanding a proof means checking that each line follows.
  - **A further finding.** "The most important ideas… were delivered orally but the participants' notes focused on the formal proof written on the blackboard." Only one of the six students wrote down any oral comment.
  - **Context.** The paper opens with the Feynman Lectures: faculty loved them, while "many of the students dreaded the course" (Goodstein & Neugebauer).
  - **Implication.** This is the strongest single argument for writing the method, the motivation and the meaning of any informal phrase on the page. It also shows why the lecturer's own impression of clarity cannot be trusted.
- **Weber (2012)**, "Mathematicians' perspectives on their pedagogical practice with respect to proof," *International Journal of Mathematical Education in Science and Technology* ([PDF](https://sites.math.rutgers.edu/~jpmejia/files/Weber_(2012IJMEST).pdf)). Nine mathematicians were interviewed. [V full text]
  - They present proofs to convey understanding and illustrate methods, not to convince.
  - They believe students don't appreciate how complex proof reading is, yet rarely teach it.
  - They assess understanding superficially.
  - Their concrete practices: accompany a hard proof with an example "side by side… do the step on the example at the same time"; draw a diagram.
  - *For Plato:* a generic example run in parallel; teach *how to read* a proof, not only the proof itself; check understanding with the Mejía-Ramos dimensions rather than "any questions?".
- **Weber (2004)**, *Journal of Mathematical Behavior* 23(2), 115–133. A case study of the definition–theorem–proof lecture format and the beliefs behind it. [S]

### 2.2 What makes the transition to proof hard

- **Moore (1994)**, "Making the transition to formal proof," *Educational Studies in Mathematics* 27, 249–266 ([Springer](https://link.springer.com/doi/10.1007/BF01273731)). [V abstract] Three major difficulties:
  - (a) concept understanding, framed as concept definition, concept image and concept usage;
  - (b) mathematical language and notation;
  - (c) getting started.

  Students' beliefs about what proof is also shaped their writing. "This abrupt transition to proof is a source of difficulty… even for those who have done superior work."
- **Tall & Vinner (1981)**, "Concept image and concept definition…," *Educational Studies in Mathematics* 12, 151–169 ([WRAP](https://wrap.warwick.ac.uk/id/eprint/507)). [V abstract] The concept image is "the total cognitive structure" associated with a concept: examples, pictures, properties. It can conflict with the formal definition and is what students actually reason from.
  - *For Plato:* build the image deliberately with many varied examples, and make the definition the arbiter. Ask "check it against the definition", not "does it look like one?".
- **Edwards & Ward (2004)**, *American Mathematical Monthly* 111(5), 411–424 ([PDF](https://researchonline.ljmu.ac.uk/id/eprint/28686/1/Surprises%20from%20mathematics%20education%20research%20%20Student%20%20mis%20use%20of%20mathematical%20definitions.pdf)). [S]
  - Mathematical definitions are *stipulated*: they create the concept. Everyday definitions are *extracted*: they report usage.
  - Students could state the definition and still not use it, falling back on their image.
  - *For Plato:* say explicitly that "in math, the definition *is* the concept; anything not in it doesn't count."
- **Selden & Selden (1995)**, "Unpacking the logic of mathematical statements," *Educational Studies in Mathematics* 29. 61 bridge-course students; only 8.5% of attempts to unpack informal calculus statements into logical form succeeded, and 5% for statements taken from texts ([PhilArchive](https://philarchive.org/rec/SELUTL)). [S]
  - **Dawkins & Roh** (2020, *IJRUME* 6(1); 2024, *JRME*) on quantifier interpretation and "unitizing predicates". Students struggle to see that different theorems share one logical form. Conjunctions, negations, auxiliary objects and nested quantifiers make it worse ([Springer](https://link.springer.com/article/10.1007/s10649-021-10127-z)). [S]
  - *For Plato:* unpack every definition's quantifiers on the page and practise negating them. Show the *same* logical form across topics. For example, "injective", "a function is well-defined" and "≤ is antisymmetric" all have the shape ∀x∀y(… → x = y).
- **Harel & Sowder (1998)**: proof schemes, meaning what convinces a student. *External* (authority, the look of a proof), *empirical* (examples), *analytic/deductive* ([summary](https://sites.math.rutgers.edu/~jpmejia/files/Zhen_Mejia_Weber_(2015IJRUME).pdf)). [S]
  - *For Plato:* when a student "proves" by checking cases, the issue is the proof scheme, not the algebra. Contrast checking n = 1, 2, 3 with Euler's n² + n + 41, which is prime for n = 0…39 and fails at 40.

### 2.3 Proof comprehension: a model, and self-explanation

- **Mejía-Ramos, Fuller, Weber, Rhoads & Samkoff (2012)**, "An assessment model for proof comprehension in undergraduate mathematics," *Educational Studies in Mathematics* 79(1), 3–18 (doi:10.1007/s10649-011-9349-7). [S; the dimension list is from secondary sources and memory]
  - Local dimensions:
    - meaning of terms and statements;
    - logical status of statements and the proof framework;
    - justification of claims.
  - Holistic dimensions:
    - summarising via high-level ideas;
    - identifying the modular structure;
    - transferring the general ideas or method;
    - illustrating with examples.
  - They used the model to build the first validated proof-comprehension tests ([Kinnear blog](https://blogs.ed.ac.uk/georgekinnear/2021/03/01/proof-comprehension-questions/); [Davies et al.](https://link.springer.com/article/10.1007/s40753-021-00157-6)).
  - *For Plato:* a ready-made menu of checks after any proof. Examples: "what's the key idea in one sentence?"; "which line uses that f is injective?"; "split this proof into its two parts"; "use the same method to show …"; "try it on f(x) = 3x + 1".
- **Hodds, Alcock & Inglis (2014)**, "Self-explanation training improves proof comprehension," *JRME* 45(1), 62–101 ([REF record](https://results2021.ref.ac.uk/outputs/6d09300c-b693-4a4f-a6c8-2d43a30e27f4?page=1); [lecturer guide](https://www.lboro.ac.uk/media/media/schoolanddepartments/mathematics-education-centre/downloads/SE-booklet-guide.pdf)). [V guide and abstract]
  - A 20-minute booklet taught students to question each statement, relate it to earlier statements and prior knowledge, and tell self-explanation apart from paraphrasing and monitoring.
  - Results: Experiment 1, d ≈ 0.95 on comprehension. Experiment 2 (eye-tracking): more attention moving between lines and longer fixations. Experiment 3: a 15-minute in-lecture version with effects persisting about 3 weeks.
  - **Inglis & Alcock (2012)** eye-tracking: compared with mathematicians, students attend more to the formulae and less to the text, and make fewer eye movements consistent with checking why a claim follows.
  - *For Plato:* teach the reading habit explicitly once ("for each line, ask: why does this follow, and from what?"), then ask for that kind of explanation on a few key lines. Don't paraphrase lines back at the student.
- **Roy, Inglis & Alcock (2017)**, "Multimedia resources designed to support learning from written proofs: an eye-movement study," *Educational Studies in Mathematics* 96(2), 249–266 ([Loughborough](https://repository.lboro.ac.uk/articles/journal_contribution/Multimedia_resources_designed_to_support_learning_from_written_proofs_An_eye-movement_study/9369275/1)). [V abstract]
  - e-Proofs, with line-by-line audio and animated highlighting of logical links, matched textbook proofs immediately but produced *worse* retention.
  - Eye-tracking showed less processing effort when the audio was off.
  - The authors suggest the support disrupted students' own organising of the information.
  - *For Plato:* a direct warning against narrating every inference. Support structure and ideas, and leave the inferences for the student to explain.
- **Structured proofs.**
  - Leron (1983), "Structuring mathematical proofs," *American Mathematical Monthly* 90, 174–185: main ideas at the top level, details nested below.
  - Fuller et al. (2011): readers of structured proofs discussed key ideas better, with slight drops elsewhere. Students complained that the proofs "jumped around" ([summary](https://arxiv.org/pdf/1806.06892)). [S]
  - Lamport's "How to write a proof" (1995) is a rigour-oriented relative ([PDF](https://www.stat.cmu.edu/~brian/rm/764-2016/mathematical%20proofs/lamport-how-to-write.pdf)).
  - *For Plato:* a one-line plan, then the linear proof with labelled parts and a marked key step. That gets most of the benefit without the jumping around.

### 2.4 Proof frameworks and construction order

- **Selden & Selden: formal-rhetorical and problem-centred parts** ([ICERM abstracts](https://icerm.brown.edu/events/awm-anniversary-2011/abstracts/Intersections%20of%20Mathematics%20and%20Math%20Education.pdf); [IJER](https://ijer.inased.org/makale/201)). [S]
  - The formal-rhetorical part is "those aspects of a proof that can be written by examining the logical structure of the statement of a theorem and by unpacking associated definitions". It covers the first and last lines and the strategy.
  - Writing it first exposes "the real problem(s)" to be solved.
  - It comes from Moore-method design experiments with advanced undergraduates and beginning graduate students.
  - The related "proof framework" papers (Selden, Benkhalti & Selden) teach writing the framework first. [K; not located this pass]
- **Fleck, *Discrete Structures* notes: construction order** ([page](https://mfleck.cs.illinois.edu/discrete-structures/construction-order.html)). [V] This is practitioner craft from a CS discrete math course:
  - Proofs are built from both ends: write the assumptions at the top and the goal at the bottom, then close the gap.
  - Show the backward search on scratch paper, then reorder into logical order for the final proof.
  - "CS students tend to copy your behavior." Students "need to give themselves permission to work out of order on the scratch paper" and "need to be clear on the fact that the steps must be rearranged."
- **Velleman, *How to Prove It* (3rd ed., Cambridge 2019).** Detailed "scratch work" sections expose the machinery. Each proof strategy is keyed to the logical form of the goal or a given (→, ∀, ∃, ¬, ∧, ∨, ↔). Givens and goal are tracked explicitly. [K/S] This is the most systematic mapping from "the shape of the statement" to "how the proof starts". It is exactly the formal-rhetorical part, made teachable.
- **Hammack, *Book of Proof* (3rd ed., free: [richardhammack.github.io/BookOfProof](https://richardhammack.github.io/BookOfProof/)).** One chapter per technique (direct, contrapositive, contradiction, existence and non-existence, induction, cardinality). Each technique comes with an outline template ("Proposition: If P then Q. Proof. Suppose P. … Therefore Q. ∎"). [K] The template-per-technique structure maps neatly onto Plato's proof-writing regions.
- **Polya, *How to Solve It* (1945).** Four phases: understand the problem, devise a plan, carry it out, look back. Plus heuristics such as "do you know a related problem?" and "work backwards". [K] "Look back" is the lecture's natural recap: what was the key idea, and where else would it work?

### 2.5 Teaching definitions with examples: example spaces

- **Watson & Mason (2005)**, *Mathematics as a Constructive Activity: Learners Generating Examples* (Erlbaum/Routledge). [S]
  - *Example spaces*: personal, conventional, situated.
  - *Dimensions of possible variation*: what can change while the example stays an example.
  - Richness of a learner's example space indicates understanding. Asking learners to *generate* examples, especially under constraints ("…and another, …and one nobody else would think of"), extends it ([Talbert](https://rtalbert.org/the-power-of-student-generated-examples-in-mathematics); [Sinclair et al. 2011](https://www.academia.edu/79218816/The_structuring_of_personal_example_spaces)).
  - *For Plato:* example-generation prompts make excellent checks after a definition. Examples:
    - "a relation on {1, 2, 3} that's symmetric but not transitive";
    - "a function ℕ → ℕ that's surjective but not injective";
    - "a partial order that isn't total".

    Each targets a dimension of variation.
- **Engelmann minimal pairs** (§1.2) are the teacher-side version of the same idea.
- **Fukawa-Connelly & Newton (2014)** examined the examples enacted while a group definition was taught. [K; not located this pass] Lecturers give examples without making explicit *why* each one meets each clause. Plato should check each clause on the example, out loud and on the page.

### 2.6 Practitioners on explanation

- **Grant Sanderson (3Blue1Brown)**, [FAQ](https://www.3blue1brown.com/faq/). [V]
  - "Concrete before abstract. Give examples before general frameworks. Open with the key exercise; don't put it at the end."
  - "Never start with definitions… topic definitions should not be seen as a starting point, but an ending point. The best order for teaching ideas often differs from their logical order."
  - "Be visual. Always ask what picture… you could use."
  - "Avoid pointless animations. Every movement on the screen should be deliberate."
  - In talks he stresses motivating questions and visuals before formalism ([Stanford Daily](https://www.stanforddaily.com/2020/01/24/3blue1brown-creator-grant-sanderson-15-talks-engaging-with-math-using-stories-and-visuals); JPBM 2023 lecture, summarised by [FAU](https://www.voll-ki.fau.de/en/?p=433)).
- **Terence Tao**, "There's more to mathematics than rigour and proofs" ([blog](https://terrytao.wordpress.com/career-advice/theres-more-to-mathematics-than-rigour-and-proofs/)). [V]
  - Three stages: pre-rigorous, rigorous, post-rigorous.
  - Rigour "should be used to destroy bad intuition while clarifying and elevating good intuition."
  - The ideal is that "every heuristic argument naturally suggests its rigorous counterpart, and vice versa."
  - The move to rigour is "rather traumatic" for many.
  - *For Plato:* a CS 2800 student is entering the rigorous stage. Give the heuristic and the rigorous version together and say how each maps onto the other.
- **The Feynman technique** (practitioner folklore). Explain the idea in plain words, find where the explanation breaks down, go back to the source, simplify. [K] Asking the student to do the plain-language explanation is a self-explanation prompt. Lew et al.'s note on Feynman's own lectures (§2.1) is the caution: clarity to experts is not teaching.

---

## 3. LLM-specific evidence

### 3.1 Verbosity is the default failure

- **Zhang et al. (2025)**, "Demystify verbosity compensation behavior of LLMs" ([ACL Anthology](https://aclanthology.org/2025.uncertainlp-main.14.pdf)). [S]
  - Models answer with more words than needed even when told to be concise.
  - GPT-4 showed verbosity compensation in about 50% of cases.
  - Verbose answers were less accurate: recall dropped 24.72% on Qasper.
- **Borisov et al. (2026)**, "Do chatbot LLMs talk too much? The YapBench benchmark" ([arXiv 2601.00624](https://arxiv.org/abs/2601.00624)). [V abstract]
  - 76 assistant models; an order-of-magnitude spread in excess length on brevity-ideal prompts.
  - Failure modes: "vacuum-filling" and explanation or formatting overhead.
- **Abdulsalam & Aroyehun (2025/26)**, "Large language models approach expert pedagogical quality in math tutoring but differ in instructional and linguistic profiles" ([arXiv 2512.20780](https://arxiv.org/abs/2512.20780)). [V abstract]
  - Seven LLMs responded to the same student errors as expert and novice tutors.
  - Larger LLMs approached expert quality on average. They underused expert discourse moves (pressing for accuracy and reasoning, revoicing), and wrote longer, more polite responses.
  - Pressing and revoicing were associated with higher quality; agentic and polite language with lower quality.
- **Saito et al. (2023)**, "Verbosity bias in preference labeling by LLMs" ([arXiv 2310.10076](https://arxiv.org/abs/2310.10076)). [V summary] GPT-4 as a judge favoured longer answers of similar quality more than humans did.
  - *For Plato's evals:* a judge comparing lesson transcripts will reward length. Score learning outcomes (unassisted post-items) and specific behaviours instead, or control for length.
- **An LLM-as-student study (2026)**, "LLMs as students who think aloud: overly coherent, verbose, and confident" ([arXiv 2602.01015](https://arxiv.org/html/2602.01015v2)). Model-written explanations were much longer and syntactically more elaborate than real learners' think-alouds. [S] This matters because Plato's register drifts away from the student's.

### 3.2 Do LLM explanations teach?

These studies are already in `reading.md` §6 and `tutoring-evidence.md` §2. In short:
- Kumar et al. (RCT, N = 1,200): LLM explanations beat seeing only the answer, most of all when the learner attempted first, and they inflated felt learning.
- Pardos & Bhandari: ChatGPT hints matched human-written hints, but 32% failed quality checks.
- Kestin et al.: a carefully prompted physics AI tutor beat active-learning class.
- Bastani et al.: unguarded GPT-4 harmed exam performance.

New this pass:
- **Chen, …, Koedinger (2025)**, "Generative AI alone may not be enough: Evaluating AI support for learning mathematical proof" ([arXiv 2509.16778](https://arxiv.org/abs/2509.16778)). [V abstract]
  - 148 students in a proof course; LLM-Tutor had a proof-review tutor plus a chatbot, against a control group.
  - Homework improved significantly; exams and time on task did not.
  - Lower-self-efficacy students used the *chatbot* more, which partly explained lower midterm scores. They also used the *proof-review* tutor more, which went with higher final-exam scores.
  - Interviews raised over-reliance concerns.
  - *For Plato:* the valuable mode is feedback on the student's own proof, written in the proof region. Lectures should end in the student writing.
- **Adewumi et al. (2025)**, MEGA ([arXiv 2507.12079](https://arxiv.org/abs/2507.12079)). [V abstract]
  - 60 university students, within-subject. A Socratic, gamified explanation style was preferred over plain step-by-step chain-of-thought explanations, especially on harder MATH problems (47.5% against 26.67% agreement).
  - Preference only, not learning. It is weak evidence that bare step lists are not what students find helpful on hard problems.
- **Leiker et al. (2023)**, AIED, synthetic instructor videos ([arXiv 2304.03784](https://arxiv.org/abs/2304.03784)). N = 83 adults. Learning gains from AI-generated videos were equal to those from traditional videos. [V summary] AI delivery is not itself a deficit; the content design is what matters.
- **Gordon et al. on skimming** (§1.3) applies to LLM walls of text. No study has measured exactly where students stop reading an LLM tutor's reply. [gap]

### 3.3 Product modes and practitioner reports

- **OpenAI study mode, Anthropic learning mode and Gemini Guided Learning** are covered in `tutoring-evidence.md` §2.6. All use "scaffolded responses in small chunks" plus knowledge checks. Outcome evidence is thin.
- **LearnLM principles** ([Google blog](https://blog.google/outreach-initiatives/education/google-learnlm-gemini-generative-ai/); [technical-report notes](https://garyliang.substack.com/p/google-learnlm-technical-paper)). [S]
  - Inspire active learning.
  - Manage cognitive load: present information in multiple modalities, structure it well, and "segment it into manageable chunks".
  - Adapt to the learner, stimulate curiosity, deepen metacognition.
- **Claude Code output styles** ([docs](https://code.claude.com/docs/en/output-styles)). [V]
  - "Explanatory" adds educational "Insights" between tasks.
  - "Learning" also asks the user to write small strategic pieces themselves (`TODO(human)`).
  - The shared design idea: explain, then hand back a real piece of the work.
- **Mollick & Mollick (2023)**, "Assigning AI: Seven approaches for students, with prompts" ([SSRN](https://papers.ssrn.com/abstract=4475995)). Practitioner tutor prompts. The tutor explains and adapts to level, asks guiding questions, and keeps the student "in the loop". Main risk: students accept output uncritically. [S]

### 3.4 Failure modes of long LLM explanations, and the countermeasure in craft terms

| Failure | What it looks like in a CS 2800 lesson | What a good lecturer does instead | Source |
| --- | --- | --- | --- |
| Wall of text | 900 words on equivalence relations in one message | One idea per message; the rest across later segments | Gordon et al.; Guo et al. |
| Listing instead of building | "Properties: 1. reflexive 2. symmetric 3. transitive" | Motivate: "When should 7 and 10 count as 'the same'?" Then each property answers a need | Wittwer & Renkl; Sanderson |
| Definition first | Opens with the ε-like formal statement | Cases first; the definition as the destination | Sanderson; Tao; concreteness fading |
| Spoken-only method | Strategy explained in the chat, clean proof on the page | Strategy line and key idea written on the page | Lew et al. 2016 |
| Undefined idioms | "Just chase the elements", "WLOG", "it's clearly well-defined" | Define the phrase the first time, on the page | Lew et al. 2016 |
| Line-by-line narration | Every inference explained by Plato | Structure and idea from Plato; the student supplies some of the "because"s | Roy et al. 2017; Hodds et al. 2014 |
| No check, or a fake one | "Does that make sense?" | Generate an example; explain a line; give the first step of a new statement | Szpunar; Watson & Mason; Mejía-Ramos |
| Fluency taken as learning | Student says "got it", Plato moves on | Proceed on produced evidence | Kumar et al.; Hinds |
| Calculation focus | Student copies the algebra, misses the method | Name the method; ask for the key idea in one sentence | Lew et al.; Mejía-Ramos (holistic) |
| Over-politeness and padding | "Great question! Let's dive in…" | Plain, warm, direct | Abdulsalam & Aroyehun |

---

## 4. Telling and asking inside a lesson: new beyond `tutoring-evidence.md`

- **Vicarious learning from dialogue.** Muldner, Lam & Chi (2014, *Journal of Educational Psychology*) compared observing tutoring with being tutored. Chi, Roy & Hausmann (2008, *Cognitive Science*): pairs observing tutoring dialogues learned about as much as tutees did. Craig et al. (2000, 2006): overheard dialogue and deep questions beat monologue. [K/S] A lecture can carry dialogue structure: anticipate the student's likely question, state it, answer it. Plato must still not invent student lines in the chat log (UI preference), so these questions belong in Plato's own voice ("A natural worry here is…").
- **Explanations crowd out self-explanation** (Schworm & Renkl, §1.1). So the "hand-back" in a lecture should be a real piece of reasoning, not a comprehension quiz.
- **Rapid first-step assessment** (Kalyuga, §1.3) decides lecture depth cheaply at the start of each new sub-topic.
- **Scaffolding review.** Van de Pol, Volman & Beishuizen (2010, *Educational Psychology Review* 22, 271–296): the defining features of scaffolding are contingency, fading, and transfer of responsibility. Classroom observation found real contingency rare. [K] For a lecture this means each segment should leave more of the work to the student than the previous one. Concretely, across one sub-topic: a full worked proof, then the framework with a gap, then a solo proof in the proof region.
- **High-knowledge learners.** Deep-question scaffolds inhibited high-knowledge learners (§1.6), and expertise reversal predicts the same. When the first-step probe shows the student already has the schema, collapse the lecture into a summary plus a harder item.

---

## 5. Where the evidence is thin, and what to test with Plato's own data

- **Ideal chat-segment length for a text tutor beside a page.** There is no direct study. The anchors are skimming above about 600 words (Gordon) and engagement dropping after about 6 minutes of video (Guo). Test: compare lesson transcripts that keep messages under about 250 words against longer ones, on unassisted post-items.
- **Does line-by-line annotation on the page hurt, as e-Proofs did?** The e-Proof result came from audio plus highlighting. A static, visible annotation that the student can ignore may behave differently. Test: proofs annotated by Plato against proofs where the student must give the "because" for three key lines.
- **How often to check.** Szpunar's design used one quiz per segment of a recorded lecture. For a live tutor, aim for a natural check about once per idea, and log mind-wandering proxies (latency, off-topic replies).
- **Definition-first against cases-first for proof-course students.** The practitioner consensus (Sanderson, Tao) and concreteness fading favour cases first. Some evidence (Kaminski et al. 2008) favours generic instantiations. In CS 2800, where the exam asks for definitions verbatim, a compromise to test is cases briefly, then the exact definition, then unpacking.
- **Verbosity bias in Plato's judge** (Saito). Calibrate `evals/tutor-judge.mjs` against length-matched pairs before trusting its scores of lessons.

---

## Key sources (most load-bearing)

1. Lew, Fukawa-Connelly, Mejía-Ramos & Weber (2016), JRME 47(2). [PDF](https://sites.math.rutgers.edu/~jpmejia/files/Lew_JRME.pdf)
2. Hodds, Alcock & Inglis (2014), JRME 45(1), with the Loughborough [lecturer guide](https://www.lboro.ac.uk/media/media/schoolanddepartments/mathematics-education-centre/downloads/SE-booklet-guide.pdf)
3. Roy, Inglis & Alcock (2017), ESM 96(2). [Loughborough](https://repository.lboro.ac.uk/articles/journal_contribution/Multimedia_resources_designed_to_support_learning_from_written_proofs_An_eye-movement_study/9369275/1)
4. Mejía-Ramos et al. (2012), ESM 79(1). doi:10.1007/s10649-011-9349-7
5. Weber (2012), IJMEST. [PDF](https://sites.math.rutgers.edu/~jpmejia/files/Weber_(2012IJMEST).pdf)
6. Moore (1994), ESM 27. [Springer](https://link.springer.com/doi/10.1007/BF01273731)
7. Tall & Vinner (1981), ESM 12. [WRAP](https://wrap.warwick.ac.uk/id/eprint/507)
8. Wittwer & Renkl (2008), *Educational Psychologist* 43; (2010), *Educational Psychology Review* 22
9. Szpunar, Khan & Schacter (2013), PNAS. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3631699/)
10. Titsworth et al. (2015), *Communication Education* 64(4)
11. Rosenshine (2012), *American Educator*; Stockard et al. (2018), RER. [open access](https://scholarsbank.uoregon.edu/items/9c5db747-52be-4bd8-8771-b05d0f7c0b01/full)
12. Gordon, Lysecky & Vahid (2022/23), *IEEE Transactions on Education*. [zyBooks](https://www.zybooks.com/research-items/less-is-more-students-skim-lengthy-online-textbooks/)
13. Chen et al. (2025), LLM-Tutor for proofs. [arXiv 2509.16778](https://arxiv.org/abs/2509.16778)
14. Abdulsalam & Aroyehun (2025/26). [arXiv 2512.20780](https://arxiv.org/abs/2512.20780)
15. Sanderson, [3Blue1Brown FAQ](https://www.3blue1brown.com/faq/); Tao, [rigour post](https://terrytao.wordpress.com/career-advice/theres-more-to-mathematics-than-rigour-and-proofs/); Fleck, [construction order](https://mfleck.cs.illinois.edu/discrete-structures/construction-order.html)
