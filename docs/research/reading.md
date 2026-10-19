# Learning from reading: when a tutor should hand the learner a text, and how to use it well

Research brief for Plato, 8 Oct 2026. It answers the complaint that the tutor is "afraid of giving the user things to read". The design leaned on questioning: invariant 1 said every tutor turn ends "with a demand to produce something" (system-spec §6.1, since revised), and [Understanding] Moment 1.3 says "*Never* read the notes aloud or paraphrase them as the explanation". This brief asks what the evidence says about learning *from reading*, and turns it into a **reading mode** for a voice-plus-page tutor that teaches any course.

It does not repeat the other briefs. Where they already cover a finding (VanLehn 2007 in [Tutoring §1.3]; prequestions in [Understanding §3.3]; signaling in [Voice §1.2]; Reisman in [Generality §2]), this brief cites them and adds only what bears on reading.

Evidence labels: **[MA]** meta-analysis or systematic review; **[RCT]** randomized experiment(s); **[obs]** observational or descriptive; **[weak]** small, lab-only, or inconsistent. Verification: "[V abstract]" checked against the abstract or publisher page; "[V full text]" against the full text; "[V secondary]" against a secondary summary or search snippet; "[cited]" from memory or another review, not checked here.

## Contents
0. The short version
1. When reading teaches as well as dialogue, or better
2. Text design for learning
3. Activities around reading
4. Reading across multiple documents
5. Reading in tutoring and course practice
6. AI-written explanatory text
7. Design rules for Plato's reading mode
8. Schema: a reading portion in the course model
9. Eval checks
10. Where the evidence is weak
References

---

## 0. The short version

1. **Well-matched reading teaches about as well as dialogue.** With content held constant, tutorial dialogue beat studying a text only when the material was above the learner's level (VanLehn et al. 2007). Learning from text peaks for passages neither too easy nor too hard for the reader (Wolfe et al. 1998). Dialogue earns its cost on what is out of reach, on diagnosis and on repair.
2. **Long explanations belong on the page, not in the voice.** Self-paced reading beats listening on inferential comprehension (g = 0.36; Clinton-Lisell 2022), and long speech loses to the same words written (transient information effect). If an explanation needs more than about four spoken sentences, make it a reading portion.
3. **The tutor sets up the reading and checks it; it doesn't re-deliver it.** Course designs built on "read, then be checked" (PSI, JiTT, reading quizzes) work. Re-teaching what was assigned makes students stop reading (Heiner et al. 2014).
4. **Choose the passage by its fit to this learner, not by a readability formula.** Prerequisite coverage ≥ ~0.7, mostly familiar with a few new ideas. High cohesion for anyone new to the idea; a terse text with a gap-filling task only for strong learners reviewing (McNamara's reverse cohesion effect, which is fragile).
5. **Course text first.** Write an explainer only when the materials are terse, wrong, or need a refutation frame. Build it from the course, check it claim by claim, execute what can be executed, measure its level, and cache it.
6. **Refute known misconceptions in writing:** the belief, why it seemed right, the correct mechanism, a case the old idea gets wrong (g = 0.41, no decay over a month; Schroeder & Kucera 2022).
7. **Before:** a spoken purpose, zero to three prequestions on the central ideas, and "one how-question comes after". **During:** silence, no timers, no check-ins; answers on demand in at most two sentences with a point into the text; at most one higher-order prompt at a boundary. **After:** one light consolidation (return to the prequestion, explain it back, or predict a new case), retrieval before look-back, and a delayed check.
8. **More questions are worse, not better.** Dense factual inserted questions narrow learning to what is asked. With few questions, longer texts and free time, studying the text becomes the task (Hamaker 1986). More than two tutor questions after a portion is an interrogation.
9. **Reading is exposure, not evidence.** θ moves only on what the learner produces afterwards. Credit is discounted when they look back. "I read it" and "got it" are calibration data: readers' sense of their own comprehension correlates only about 0.18 with the real thing (Yang et al. 2023).
10. **Balance comes from the policy, not quotas,** with bands for the evals: 60–80% of learner time reading in "Study by reading", 25–50% in new-material sessions, ≤ 10% in consolidation. Watch for three failures: interrogation, lecture by voice, and homework dump.
11. **AI-written passages teach, but must be verified.** LLM explanations beat answer-only conditions (N = 1,200), and an AI-augmented textbook beat a plain one at 3–5 days. But 32% of unverified ChatGPT help failed quality checks, models miss target reading levels, and fluent text inflates felt learning.
12. **In interpretive courses the reading is the discipline.** Use small document sets with source cards around one question, and ask for claims supported by at least two sources (Reisman 2012; Nokes et al. 2007; Barzilai et al. 2018).

Design rules are in §7, the schema in §8, the evals in §9.

---

## 1. When reading teaches as well as dialogue, or better

**Claim.** Reading is not a weak channel. *Mismatched* reading is. Text pitched at the reader's level teaches about as well as tutorial dialogue covering the same content, and it beats speech for long, interconnected material because the reader controls the pace and can look back. Dialogue earns its extra cost when the material sits above what the learner can absorb alone, and for diagnosis and repair.

### 1.1 The match between text and reader decides it

- **VanLehn, Graesser, Jackson, Jordan, Olney & Rosé (2007)**, "When are tutorial dialogues more effective than reading?", *Cognitive Science* 31(1):3–62 (ERIC EJ754602). [RCT ×7; V abstract]
  - Content was held constant across conditions. Human tutors (spoken and typed) and two dialogue systems (Why2-Atlas, Why2-AutoTutor) were compared with **three text-study conditions**, in qualitative physics.
  - When novices studied material written for intermediates, dialogue won, "with large effect sizes".
  - When novices studied novice material, or intermediates studied intermediate material, dialogue was **not reliably better than studying the text**.
  - [Tutoring §1.3] draws the director rule from this (brief tell where θ ≫ d). The reading-mode corollary: for in-zone material, a well-made text is a full substitute for dialogue, and it leaves the dialogue budget for what is out of reach.
- **Wolfe, Schreiner, Rehder, Laham, Foltz, Kintsch & Landauer (1998)**, "Learning from text: Matching readers and texts by latent semantic analysis", *Discourse Processes* 25:309–336 (ERIC EJ589330). [RCT, N = 106; V full text]
  - Participants took knowledge tests on the heart and circulation, read one of four texts ranging from elementary to medical-school level, then were retested.
  - Learning was **non-monotonic in text difficulty**: greatest for texts "neither too easy nor too difficult" for the reader, a **zone of learnability** that shifts upward as prior knowledge grows.
  - Semantic similarity between a reader's pre-essay and the text (LSA) predicted learning as well as the knowledge test did. Assigning texts by either measure "would have increased the amount learned significantly".
  - *For Plato:* pick or write the passage by its distance from the learner's current state (θ on its KCs, and what they have already read), not by a readability formula. A modern embedding distance between the learner's own explanations and the passage is a direct descendant of the LSA match. [weak as an engineering claim; strong as a principle]

### 1.2 Self-pacing, and why long content belongs on the page, not in the voice

- **Clinton-Lisell (2022)**, "Listening ears or reading eyes: A meta-analysis of reading and listening comprehension comparisons", *Review of Educational Research* 92(4):543–582 (ERIC EJ1347325). [MA, 46 studies, N = 4,687; V abstract]
  - Overall, reading and listening did not differ reliably (g = 0.07, p = .23).
  - **Reading beat listening when reading was self-paced** (g = 0.13, p = .049); experimenter-paced reading trended worse (g = −0.32, n.s.).
  - **Reading beat listening on inferential comprehension** (g = 0.36, p = .02) and general comprehension (g = 0.15), not on literal recall (g = −0.01).
- **The transient information effect.** Wong, Leahy, Marcus & Sweller (2012), *Learning and Instruction* (ERIC EJ978021); Leahy & Sweller (2016), *Instructional Science* (ERIC EJ1090365). [RCT; V abstract]
  - The modality effect (narration plus picture beats on-screen text plus picture) holds for **short** segments, then disappears or **reverses** for long ones, because long speech must be held in working memory as it vanishes.
  - Leahy & Sweller (2016): longer audio text was *inferior* to the same text written; the modality advantage appeared only after the audio was shortened further.
- *For Plato:* the voice brief's rule "speech is transient" [Voice §0.1] has a consequence the design has not drawn. Any explanation longer than a few sentences that the learner must hold together (a mechanism, an argument, a derivation, a definition with conditions) is better **written on the page and read** than spoken. A voice-first tutor that delivers every explanation as speech is choosing the transient channel for exactly the content that needs a permanent one.

### 1.3 Reading needs uninterrupted time

- **Foroughi, Werner, Barragán & Boehm-Davis (2015)**, "Interruptions disrupt reading comprehension", *J. Exp. Psych.: General* 144:704–709. [RCT ×3; V abstract]
  - Interruptions while reading **hurt comprehension that required connecting and synthesizing across the passage**, but not recognition of facts from it.
  - A **15-second pause before the interruption** removed the harm: the reader needs time to finish integrating what is in working memory.
  - *For Plato:* never speak over a reading. Embedded prompts go at segment boundaries, after the learner signals they have reached them, not on a timer.
- **Mind wandering.** Feng, D'Mello & Graesser (2013), *Psychonomic Bulletin & Review* 20:586–592 [RCT; V abstract]: mind wandering was *more* frequent with difficult texts than easy ones, and it hurt comprehension more there. D'Mello & Mills (2021), *Language and Linguistics Compass* 15(4) [review; V abstract]: mind wandering is frequent during reading and negatively related to comprehension.
  - *For Plato:* difficulty, not length alone, sets the segment size. A hard passage should be cut shorter, and given a purpose (§3.7) and a boundary prompt (§3.2), which re-anchor attention.
- **Reading on a screen is a metacognitive risk, not a perceptual one.**
  - Delgado, Vargas, Ackerman & Salmerón (2018), "Don't throw away your printed books", *Educational Research Review* 25:23–38. [MA, 54 studies, 171,055 participants; V abstract] Paper beat screen, g = −0.21. The gap **grew under time limits** compared with self-paced reading, and held for informational texts but not narrative ones. Salmerón et al. (2024, *J. Ed. Psych.*; ERIC EJ1409878) found a smaller gap for handheld devices (g ≈ −0.11).
  - Ackerman & Goldsmith (2011), *J. Exp. Psych.: Applied* 17:18–32. [RCT; V abstract] With fixed study time, screen and paper did not differ on 1,000–1,200-word expository texts. With **self-regulated** time, screen readers did worse, with "less accurate prediction of performance and more erratic study-time regulation".
  - *For Plato:* the page is a screen. The fix is not to avoid reading. It is to supply what screen readers under-do: a purpose before, no time pressure, a short check after that recalibrates them (§3.8).
- **Time for ideas to sink in.** Two findings support leaving a gap between reading and the check. Keywords written after a delay track comprehension better than immediate ones, and the better monitoring improves restudy (Thiede et al. 2003; §3.8). Rereading spaced a week apart helps a delayed test where massed rereading does not (Rawson & Kintsch 2005; §3.6). Claims that a short rest after reading consolidates it come mostly from word-list lab studies and are not relied on here. [indirect]

### 1.4 Whole courses built on reading plus a tutor's check work well

- **Keller's Personalized System of Instruction (PSI)**: the course is divided into small written units; students study them **at their own pace**; a proctor (a tutor) gives a short unit test and discusses it; the student must reach mastery before moving on; lectures exist mainly for motivation.
  - Kulik, Kulik & Cohen (1979), *American Psychologist* 34(4):307–318 (ERIC EJ202488). [MA, 75 studies; V abstract] PSI "generally produces superior student achievement, less variation in achievement, and higher student ratings in college courses".
  - Kulik, Kulik & Bangert-Drowns (1990), *Review of Educational Research* 60(2):265–299 (ERIC EJ415887). [MA, 108 evaluations; V abstract] Mastery programs raised exam performance, with **stronger effects for weaker students**. (The often-quoted mean of about half a standard deviation is [cited], not checked here.)
  - Caveat: these are mostly 1970s studies, many short and non-randomized. [MA of older, mixed-quality studies]
  - *For Plato:* the most-replicated college design in which a tutor adds value is **read, then be checked by the tutor, then move on or repair**. It is the opposite of "never let them read". The tutor's work is the check and the repair, not re-delivering the text.

### 1.5 What reading cannot do on its own

- Most readers do not explain the text to themselves unless prompted (Chi et al. 1989, 1994; see §3.3), believe they understood when they didn't (§3.8), and choose rereading over retrieval (§3.6).
- So the evidence does not say "replace dialogue with reading". It says: **let reading carry the exposition, and let the tutor carry the purpose, the check, and the repair.** Dialogue stays the right tool for material beyond the learner's zone, for surfacing and repairing wrong models [Understanding §1], and for checking understanding.

| Reading is the better channel when… | Dialogue is the better channel when… |
|---|---|
| The material is within the learner's zone (θ near d) [VanLehn 2007; Wolfe 1998] | The material is above what they can absorb alone [VanLehn 2007] |
| It is long or interconnected: more than about four sentences that must be held together [transient information] | It is one idea that fits in a spoken turn |
| Understanding needs inference across sentences [Clinton-Lisell 2022] | A wrong model must be activated and run to a contradiction [Understanding §1] |
| The course's own wording, notation or conventions matter | The learner is confused, stuck or frustrated |
| The learner benefits from controlling the pace, looking back, rereading a line | Evidence is needed: diagnosis, a check, a transfer test |
| The source *is* the object of study (a primary document, a poem, a proof, a case) | The learner asked a question that a short spoken answer settles |

---

## 2. Text design for learning

**Claim.** What makes a passage teach is (a) its fit to what the reader already knows, (b) explicit causal connections for novices, (c) visible structure, (d) for known misconceptions, an explicit refutation with a causal explanation, and (e) for procedures, worked examples. Surface readability formulas predict little of this.

### 2.1 Coherence and cohesion, and the reverse cohesion effect

- **McNamara, Kintsch, Songer & Kintsch (1996)**, "Are good texts always better? Interactions of text coherence, background knowledge, and levels of understanding in learning from text", *Cognition and Instruction* 14(1):1–43 (ERIC EJ520492). [RCT ×2, junior-high science; V abstract]
  - Exp. 1: globally coherent and more explanatory text helped.
  - Exp. 2 varied local and global coherence. **Low-knowledge readers benefited from the coherent text; high-knowledge readers benefited from a minimally coherent one.** The poorly written text "forces the knowledgeable readers" to infer the unstated relations, and that compensatory processing deepens understanding. The benefit appeared on situation-model measures (inference, problem-solving, sorting), not on recall.
- **McNamara (2001)**, *Canadian J. Exp. Psych.* 55(1):51–62. [RCT; V abstract] High-knowledge readers benefited from the low-coherence text **only when they read it first**; reading the coherent version first removed the need to use their knowledge. Low-knowledge readers benefited from the high-coherence text in any order, or read twice.
- **O'Reilly & McNamara (2007)**, "Reversing the reverse cohesion effect: Good texts can be better for strategic, high-knowledge readers", *Discourse Processes* 43(2) (ERIC EJ772185). [RCT, N = 143 undergraduates; V abstract] The low-cohesion advantage was **restricted to less-skilled readers with high knowledge**. Skilled, high-knowledge readers did better with the high-cohesion text. For low-knowledge readers, high cohesion helped on bridging-inference questions.
- **Ozuru, Dempsey & McNamara (2009)**, *Learning and Instruction* 19 (ERIC EJ830389). [RCT, college biology; V abstract] High cohesion improved text-based comprehension; skilled readers gained more from it.
- Earlier text-revision studies repaired coherence gaps (the places where a reader must make an unstated inference) and improved recall and comprehension: Britton & Gülgöz (1991), *J. Ed. Psych.* 83; Beck, McKeown, Sinatra & Loxterman (1991), *Reading Research Quarterly* 26. [RCT; cited]
- **Expertise reversal in reading, outside STEM.** Oksa, Kalyuga & Chandler (2010), *Instructional Science* 38 (ERIC EJ880290). [RCT ×3; V abstract] Modern-English explanations integrated line by line into Shakespeare extracts helped novices (lower load, better comprehension) and **hurt Shakespeare experts**, for whom the explanations were redundant.
- *For Plato:*
  - Default to **high cohesion** for any learner who is new to the KC: explicit connectives ("because", "so", "which means"), referents named rather than pronouns, every causal step written out, terms defined where first used. This is the safe default; it helps low-knowledge readers on every measure and skilled readers too.
  - For a learner with **high θ on the prerequisites who is reviewing**, a terser passage (the course's own compact notes) with a demand to fill the gaps ("the notes skip two steps here; find them") turns the reverse cohesion effect into a generative task, rather than hoping the learner does it unprompted.
  - Do not stack explanatory glosses on a primary text for a learner who doesn't need them. Give glosses on demand (asked for aloud, or by a tap if that UI is approved), not inline.

### 2.2 Signaling and structure

- The general signaling evidence (g ≈ 0.43 on learning; Schneider et al. 2018) and pointer words (Mautone & Mayer 2001) are in [Voice §1.2]. What is specific to text:
- **Lorch, Lemarié & Grant (2011)**, *Scientific Studies of Reading* 15 (ERIC EJ922663). [RCT ×4; V abstract] Headings that showed the **hierarchical** organization produced more complete and accurate outlines of the text; headings that showed the **sequential** organization sped up search. Signals carry organization, not just emphasis. The SARA theory (Lemarié, Lorch, Eyrolle & Virbel 2008, *Educational Psychologist* 43; ERIC EJ784019): a signal helps only to the extent that what it marks is **relevant to the reader's goal** and accessible.
- **Advance organizers**: Luiten, Ames & Ackerson (1980), *American Educational Research Journal* 17 (ERIC EJ233231). [MA, 135 studies; V abstract] A **small** facilitative effect on learning and retention, with the effect on retention growing over time. [MA of older studies]
- *For Plato:*
  - Every passage Plato writes or serves has a one-line purpose at the top (§3.7), short headings that mirror the structure of the idea (parts, steps, causes, the claim and its evidence), and a numbered list where the content *is* a list or a sequence.
  - Bold only what the purpose asks the learner to find. Over-signaling is clutter [Voice §1].

### 2.3 Refutation texts for known misconceptions

- **Schroeder & Kucera (2022)**, "Refutation text facilitates learning: A meta-analysis of between-subjects experiments", *Educational Psychology Review* 34:957–987 (PMC8784251). [MA, 44 comparisons, n = 3,869; V full text]
  - **g = 0.41** against other learning conditions; trim-and-fill adjusted g = 0.28 [0.16, 0.39].
  - **No decay with delay** (same day g = 0.39; more than a month later g = 0.56; moderator n.s.).
  - Similar across education levels (postsecondary g = 0.33, k = 30) and domains (science 0.45; mathematics 0.32; social science 0.31).
  - The structure: state a common misconception, explicitly refute it, explain the correct conception.
- **Tippett (2010)**, *International Journal of Science and Mathematics Education* 8:951–970 (ERIC EJ905216). [narrative review of 20 years] Refutation text is "one of the most effective text-based means for modifying readers' misconceptions", more likely than ordinary expository text to produce conceptual change. Guzzetti et al. (1993), *Reading Research Quarterly* 28 (ERIC EJ462258) [MA]: the effective interventions shared one element, **producing conceptual conflict**.
- **Why it works (KReC; Kendeou & O'Brien 2014).** Knowledge revision needs co-activation of the old and new idea, integration of the new one into a causal network, and enough new information that it wins the competition for activation. Kendeou, Walsh, Smith & O'Brien (2014), *Discourse Processes* 51:374–397 [RCT; V abstract]: **refutation plus causal explanation** removed the reading disruption caused by the commonsense belief. Danielson, Sinatra & Kendeou (2016), *Discourse Processes* 53 (ERIC EJ1104292) [RCT, N = 122]: adding an **analogy** to a refutation text increased revision most.
- **Is naming the misconception risky?** The "familiarity backfire" fear is not supported. Swire-Thompson, DeGutis & Lazer (2020), *JARMAC* 9 [review; V abstract]: backfire effects "are not a robust empirical phenomenon". Ecker et al. (2020), *British J. Psych.* [RCT; V abstract]: simple retractions reduced belief with no familiarity backfire; fuller refutations did better after a week.
- **Caveats.** Zengilowski, Schuetze, Nash & Schallert (2021), *Educational Psychologist* 56(3) (ERIC EJ1305850) [critical review]: most studies use one topic, the pretest itself may drive change, and durability beyond an immediate posttest is rarely tested. Refutation text works on **single false beliefs**. A flawed model or category mistake needs more than a paragraph [Understanding §1; system-spec §8].
- *For Plato:* when the learner model holds a *suspected or confirmed* false belief on the KC, the reading portion for that KC should be written in refutation form: the belief in the learner's own terms, a plain "this is not right", **why it seemed right**, the correct idea with its causal mechanism, ideally an analogy or a case that the old idea gets wrong, and a pointer to where the course materials say it. This matches the spec's false-belief repair (§8); the reading version lets the learner take it in at their own pace and reread it.

### 2.4 Worked examples as reading material

- **Barbieri, Miller-Cotto, Clerjuste & Chawla (2023)**, *Educational Psychology Review* 35 (ERIC EJ1364058). [MA, 55 studies, 181 effects; V abstract]
  - Worked examples improved mathematics performance, **g = 0.48**, whether used for initial acquisition or practice.
  - Correct examples alone beat incorrect examples alone or mixed.
  - **Adding self-explanation prompts to worked examples moderated the effect *negatively*.**
- This sits against **Bisra, Liu, Nesbit, Salimi & Winne (2018)**, *Educational Psychology Review* 30:703–725 (ERIC EJ1186664) [MA, 69 effects; V abstract]: self-explanation prompts while studying text, worked examples or problems gave **g = 0.55** overall.
- The reconciliation in the primary studies: prompts help when they are **few, aimed at the principle, and assisted for novices** (Berthold, Eysink & Renkl 2009, *Instructional Science* 37, ERIC EJ844099: assisting prompts beat open prompts for conceptual knowledge), and they **become redundant and harmful as the learner gains competence** unless faded (Nückles, Hübner, Dümer & Renkl 2010, *Instructional Science* 38, ERIC EJ880291: permanent prompts lowered learning by the end of term; adaptively faded prompts did not). [RCT]
- **Example, then problem.** van Gog, Kester & Paas (2011), *Contemporary Educational Psychology* 36 (ERIC EJ927458) [RCT]: worked examples and example–problem pairs beat problem solving alone for novices; problem–example pairs did not.
- *For Plato:* a worked example is the natural reading portion for a procedure KC at low θ. Serve it on the page, with named subgoals [Decomposition §0.9], one principle-focused prompt at most, and a matching problem straight after (the example–problem pair). Fade from full example to completion problem as θ rises [Understanding R3.4].

### 2.5 How long a reading portion should be

There is **no direct trial of optimal passage length** for learning. The rule below is derived; treat its numbers as starting values to tune with Plato's own data.

- **Time.** Adults read non-fiction silently at about **238 words per minute** (Brysbaert 2019, *J. Memory and Language* 109:104047 [MA, 190 studies; V abstract]). Dense technical prose with notation is slower [not measured here]. So 1 minute ≈ 150–250 words of course text.
- **Boundaries matter more than length.** Interruptions mid-passage hurt synthesis unless the reader has a moment to finish (Foroughi et al. 2015). Interpolated questions in online lectures reduced mind wandering and improved learning (Szpunar, Khan & Schacter 2013, *PNAS* 110:6313–6317 [RCT ×2; V abstract]). Difficulty raises mind wandering (Feng et al. 2013).
- **Where the checks go barely matters for durable learning.** Weinstein, Nunes & Karpicke (2016), *J. Exp. Psych.: Applied* 22 [RCT ×3, lab, online and classroom; V abstract]: interspersed questions (every 1–2 slides) beat end-of-section questions on the *initial* test, with **no advantage on the final test** a week or more later. Uner & Roediger (2018), *JARMAC* 7 [RCT; 40-page biology chapter; V secondary]: questions after sections and after the chapter worked equally well (two-day test: 61.5% with questions, 44.8% rereading, 34.2% no review); answering at both points was best.
- **Rule (derived):**
  - For **new, difficult material**: one idea per portion, about **100–400 words** (1–2 minutes), or one worked example.
  - For **material at the learner's level, review, or narrative and primary sources** read with a purpose: up to about **600–1,200 words** (3–6 minutes) per portion, split at the source's own section boundaries.
  - Longer sources (a chapter, a paper, a primary document) are a **sequence of portions**, each with its own boundary moment (§3.2).

### 2.6 Readability matched to the reader, not to a formula

- Classic readability formulas use surface features (word and sentence length) as proxies for comprehension, and have been criticized for decades, especially when used to *write* texts (Benjamin 2012, *Educational Psychology Review* 24:63–88, ERIC EJ955639 [review; V abstract]). Models built on cohesion and other linguistic features predict comprehension better than Flesch–Kincaid (Crossley, Skalicky & Dascalu 2019, *J. Research in Reading* 42, ERIC EJ1232523 [V abstract]).
- But the decisive variable is the **reader's prior knowledge of this content** (Wolfe et al. 1998; McNamara's studies above). A formula cannot see that; the learner model can.
- *For Plato:* the "level" of a passage is defined against the learner, by two things the system already holds:
  1. **Prerequisite coverage:** the share of the passage's prerequisite KCs and terms the learner holds at θ ≥ 0.5. Below about 0.7, either serve a prerequisite portion first or switch to dialogue (VanLehn's out-of-zone case).
  2. **Novelty:** the share of the passage's KCs not yet held. Aim for a passage that is mostly familiar with a few new ideas (Wolfe's zone: neither too easy nor too hard).
  Surface features (sentence length, jargon density) are a secondary check, mainly for tutor-written explainers.

---

## 3. Activities around reading

**Claim.** A few well-placed activities turn reading from passive exposure into strong learning: a purpose and one to three prequestions before; silence, with at most one higher-order prompt at a boundary, during; one short generative act after (an explain-back, a prediction on a new case, or a retrieval question), ideally after a short delay. **More questions are not better.** Dense, factual inserted questions narrow attention to what is asked and lower learning of everything else.

### 3.1 Before reading: prequestions and pretests

The general prequestion evidence is in [Understanding §3.3] (2025 meta-analysis: g = 0.66 on prequestioned information, g ≈ 0.01 on the rest). What matters for reading:

- **It works with text, and not only by directing attention.** Richland, Kornell & Kao (2009), *J. Exp. Psych.: Applied* 15 (ERIC EJ859957) [RCT ×5; V abstract]: students answered questions on concepts in an essay about vision before reading it. They beat students given extra reading time, **even on items they had failed on the pretest**, even when the control group saw the tested concepts in bold or italics, and (Exp. 5) even when the control group saw the same questions without answering them.
- **The benefit is specific, and conditional on finding the answer.** Carpenter, Rahman & Perkins (2018), *J. Exp. Psych.: Applied* 24 [classroom RCT; V abstract]: in an introductory psychology course, prequestions improved end-of-class memory **only for the prequestioned material**; a week later they added little beyond end-of-class retrieval practice. St. Hilaire & Carpenter (2020), *J. Exp. Psych.: Applied* 26:705–716 [RCT ×4; V abstract]: the benefit occurred **only when learners discovered the answers** during the lesson.
- **It reduces mind wandering.** Pan, Sana, Schmitt & Bjork (2020), *JARMAC* 9 [RCT ×2, 26-minute online lecture; V abstract]: pretests reduced mind wandering and improved final-test performance, whether given at the start or interspersed.
- **Review.** Pan & Carpenter (2023), *Educational Psychology Review* 35 (ERIC EJ1393374) [review; V abstract]: prequestions "can often enhance learning", with text, video and lectures, but the size varies with procedure and outcome measure.
- **The cost.** Hamaker (1986; §3.2): **factual prequestions lower learning of text material unrelated to them.**
- *For Plato:* before a portion, **one to three prequestions on the ideas the whole passage serves** (the mechanism, the claim, the reason), never on peripheral details. Check that the passage actually answers them. Accept guesses warmly, give no verdict, and **return to them after reading** ("you guessed X; what does the passage say?"), which also closes the loop St. Hilaire & Carpenter found necessary.

### 3.2 During reading: inserted (adjunct) questions, and how many is too many

- **Origin.** Rothkopf (1966), *American Educational Research Journal* 3:241–249: questions inserted in a text shape how readers inspect the rest of it ("mathemagenic" activities). [cited]
- **Hamaker (1986)**, "The effects of adjunct questions on prose learning", *Review of Educational Research* 56(2):212–242 (ERIC EJ351754). [quantitative review of studies 1965–1983; V full text]
  1. Adjunct questions have a strong effect on learning the material they ask about, and a weaker effect on related material. The direct effect is large in practical terms: about a 37% increase over control performance on repeated items.
  2. **Factual prequestions lower learning of unrelated material.** Factual postquestions have no general effect on unrelated material overall, a negative one when study time is fixed, and a positive one when **time is free**.
  3. **Higher-order** adjunct questions (comprehension, application to new examples) have a broader benefit, including on unrelated higher-order test questions. Short-answer questions beat multiple-choice.
  4. **Density matters.** Frase (1968; reported by Hamaker) found that more frequent questions sharpened the split: bigger gains on what was asked, bigger losses on what was not. Across studies, postquestions most helped *unasked* material with **long texts, relatively few questions, and no time limit**. Hamaker's interpretation: under those conditions "learners are likely to adopt studying the text as their primary task, rather than answering the adjunct questions". With many questions, answering them becomes the task.
  - Caveat: the design variables are confounded (text length, question density, time control), and few studies used delayed tests. [review of older lab studies]
- **Placement barely matters for durable learning** (§2.5): Weinstein et al. (2016) found no final-test difference between interspersed and end-of-section questions; Uner & Roediger (2018) found questions after sections and after the whole chapter equally effective at two days.
- *For Plato, the answer to "how many before it becomes an interrogation":*
  - **Zero during a short portion** (under about 300 words). The prequestion and the after-move are enough.
  - **At most one inserted prompt per portion, at its boundary**, never mid-paragraph (Foroughi et al. 2015). It is **higher-order** (why, what would happen if, how does this connect to…), short-answer, and **skippable**.
  - **No timer, no "are you done?"** Time control is the condition under which questions hurt unrelated learning.
  - Across a long reading split into segments, tutor-initiated questions stay at or below one per segment plus the after-move. If the learner spends more time answering than reading, the reading has become a quiz.

### 3.3 Self-explanation while reading

- **Chi, de Leeuw, Chiu & LaVancher (1994)**, "Eliciting self-explanations improves understanding", *Cognitive Science* 18:439–477. [RCT, small; V abstract] Fourteen eighth-graders were asked to self-explain after **each line** of a text on the circulatory system; ten controls read it twice. The prompted group understood more, especially on the hardest questions. Heavy prompting worked here, in a one-text lab session with novices.
- **Bisra et al. (2018)** [MA, g = 0.55; §2.4]: self-explanation prompts help across studying text, worked examples and problems.
- **Training transfers to real courses, mainly for low-knowledge students.** McNamara (2004), *Discourse Processes* 38 (ERIC EJ682769) [RCT; V abstract]: Self-Explanation Reading Training (SERT) improved comprehension of a difficult text only for low-knowledge readers. McNamara (2017), *Discourse Processes* 54 (ERIC EJ1154551) [quasi-experiment, n = 265 in introductory biology; V abstract]: low-knowledge students given SERT **performed as well as high-knowledge students on the course exams**; untrained low-knowledge students did worse. iSTART automated the training (McNamara, O'Reilly, Best & Ozuru 2006, ERIC EJ744665).
- **Limits.** Prompts become redundant and harmful as competence grows unless faded (Nückles et al. 2010); adding prompts to worked examples reduced their effect in the mathematics meta-analysis (Barbieri et al. 2023); assisted prompts beat open ones for novices (Berthold et al. 2009). See §2.4.
- *For Plato:* for low-θ learners on principle KCs, one self-explanation prompt per portion, at its boundary, aimed at the causal link ("why does this step follow?"), with an assisted form available (a sentence to complete). For high-θ learners, none during the reading; the after-move does the work. Fade per learner as their unprompted explain-backs improve.

### 3.4 Elaborative interrogation

- Covered in [Understanding §5] (Dunlosky et al. 2013: moderate utility; the best evidence is for factual statements and learners with some prior knowledge). For reading, it is the natural prompt for **fact-dense passages**: "why would that be true?" about one stated fact. Use it sparingly on the one fact that carries the rest.

### 3.5 After reading: summaries and explain-back

- **Summarizing** is rated low utility by Dunlosky et al. (2013), *Psychological Science in the Public Interest* 14(1), mainly because the benefit depends on training and on summary quality. Writing about material read does improve comprehension of it (Graham & Hebert 2011, *Harvard Educational Review* 81(4):710–744, ERIC EJ961480 [MA, school students; V abstract]). Fiorella & Mayer (2016), *Educational Psychology Review* 28:717–741 (ERIC EJ1120458) include summarizing among eight generative strategies, with training and length as boundary conditions. [review; mixed]
- **Explaining aloud after reading favours transfer.** Lachner, Ly & Nückles (2018), *J. Experimental Education* 86 (ERIC EJ1177046) [RCT, N = 48; V abstract]: after a hypertext on combustion engines, **oral** explanations to a fictitious peer triggered more elaboration and better **transfer**; **written** explanations produced better-organized content and better **conceptual knowledge**. Lachner, Hoogerheide, van Gog & Renkl (2022), *Educational Psychology Review* 34:575–607 (ERIC EJ1334744) [review]: explaining to an absent audience helps under some conditions, and several studies have failed to replicate it; the active ingredient is generative processing, not the audience.
- *For Plato:* the voice makes the explain-back cheap and natural. After a portion: **"Tell me in a sentence or two how [the idea] works."** For a long sequence of portions, a short written summary or an outline on the page. Score the explain-back against the portion's key ideas (§7.5), and treat a good one as evidence.

### 3.6 Highlighting, rereading, and the illusion of fluency

- **Dunlosky et al. (2013)** rate both highlighting and rereading **low utility**.
- **Highlighting.** Ponce, Mayer & Méndez (2022), *Educational Psychology Review* 34:989–1024 (ERIC EJ1334669) [MA, 36 articles, 85 effects; V abstract]: **learner-generated** highlighting improved memory (0.36) but **not comprehension** (0.20, n.s.), and helped college students (0.39) but not school students (0.24); **instructor-provided** highlighting improved **both memory and comprehension (0.44)**.
- **Rereading.** Callender & McDaniel (2009), *Contemporary Educational Psychology* 34 (ERIC EJ819481) [RCT ×4; V abstract]: with textbook chapters and a *Scientific American* article, immediate rereading gave "little or no benefit" on educationally relevant tests. Rawson & Kintsch (2005), *J. Ed. Psych.* 97 (ERIC EJ688037) [RCT, N = 423; V abstract]: **massed** rereading helped only an immediate test; rereading **spaced a week apart** helped a test two days later.
- **The illusion.** Roediger & Karpicke (2006), *Psychological Science* 17:249–255 [RCT; V abstract]: with prose passages, restudying beat testing at 5 minutes, but testing beat restudying at 2 days and 1 week, **"even though repeated studying increased students' confidence"**. Karpicke, Butler & Roediger (2009), *Memory* 17:471–479 [survey, N = 177; V abstract]: most students reread; few self-test.
- *For Plato:*
  - **Plato pre-highlights** the few sentences the purpose points to (instructor-provided highlighting has the evidence). It does not ask the learner to highlight as a study method. A learner's highlight is still useful **as a signal** ("this line confused me", "this answers the prequestion").
  - Rereading is the learner's right on demand, never a scheduled review move. Review is retrieval [Understanding §4]. If a passage is to be seen again, space it.
  - A fluent read is not evidence of learning (§7.6).

### 3.7 Reading with a purpose

- **Purpose shapes what is learned.** Pichert & Anderson (1977), *J. Ed. Psych.* 69 (ERIC EJ174708) [RCT; V abstract]: readers given a perspective learned and recalled, a week later, the ideas significant to that perspective. van den Broek, Lorch, Linderholm & Gustafson (2001), *Memory & Cognition* 29:1081–1087 [RCT, N = 82; V abstract]: a **study goal** produced more coherence-building (explanatory and predictive) inferences than an entertainment goal, and better memory. Goals set the reader's **standard of coherence**.
- **Relevance instructions.** McCrudden & Schraw (2007), *Educational Psychology Review* 19:113–139 (ERIC EJ784919) [review; V abstract]: instructions that mark which segments matter, or set a perspective or purpose, direct attention to those segments and improve their learning. The trade-off is Hamaker's: narrow, factual targets cost the untargeted material.
- *For Plato:* every portion opens with **one sentence of purpose, framed at the level of understanding** ("read this to find out why the same adder works for signed and unsigned numbers"), not a scavenger hunt for a term, unless the term is the goal. The purpose is the reading's "look for" [system-spec §14, *New material*].

### 3.8 Comprehension monitoring and calibration

- **Readers cannot tell what they understood.** Yang, Zhao, Yuan, Luo & Shanks (2023), *Review of Educational Research* 93(2):143–194 (ERIC EJ1370019) [MA, 115 studies, 15,889 participants; V abstract]: the mean correlation between judged and actual comprehension across texts was **0.18**. Glenberg, Wilkinson & Epstein (1982), *Memory & Cognition* 10 [cited]: readers rated their comprehension high while missing contradictions in the text. Glenberg & Epstein (1987), *Memory & Cognition* 15 (report version ERIC ED266439) [V abstract of the report]: confidence tracked readers' view of themselves as experts in the domain, not what they had understood from the text, and expertise was *inversely* related to calibration.
- **What fixes it.** Yang et al. (2023): delayed summary writing and delayed keyword generation improve accuracy, and combinations add up. Prinz, Golke & Wittwer (2020), *Educational Psychology Review* 32:917–949 (ERIC EJ1273932) [MA, 28 effects, 2,236 participants; V abstract]: interventions that make readers use situation-model cues improved relative accuracy (g = 0.46), with **telling readers in advance to expect a comprehension test** "particularly effective", and a small direct benefit to comprehension. Thiede, Anderson & Therriault (2003), *J. Ed. Psych.* 95 (ERIC EJ662401) [RCT; V abstract]: writing five keywords **after a delay** made monitoring more accurate, which improved restudy choices and learning.
- *For Plato:*
  - Say up front that a short "how" or "why" question follows the reading (comprehension-test expectancy), as part of the purpose line.
  - Put the after-move a little later where possible (after the next portion, or at the start of the next turn), because delayed generation calibrates better than immediate.
  - "I read it" and "that makes sense" are not evidence [system-spec §3].

---

## 4. Reading across multiple documents and sources

**Claim.** In the interpretive subjects (history, law, literature, policy, much of the social sciences), and in any subject where claims conflict, the reading *is* the discipline. Learning there means building a model of what each source says, who says it and why, and how the sources relate. That can be taught, with medium to large effects, and it is taught by giving learners several short, partly conflicting documents with a task, not one smoothed-over summary. [Generality §2] covers the domain differences; this section covers the reading mechanics.

- **The documents model.** Skilled multiple-text readers build two linked representations: an integrated model of the situation, and an **intertext model** of the sources (who said what, when, with what authority, agreeing or conflicting with whom) (Perfetti, Rouet & Britt 1999 [cited]; Bråten, Britt, Strømsø & Rouet 2011, *Educational Psychologist* 46:48–70, ERIC EJ912527 [review; V abstract], which adds that epistemic beliefs, such as "knowledge is certain and simple", shape how readers integrate).
- **Attending to sources predicts deep comprehension.** Strømsø, Bråten & Britt (2010), *Learning and Instruction* 20 (ERIC EJ872940) [correlational; V abstract]: with multiple texts on the causes and remedies of climate change, **memory for sources predicted both within-text and across-text inference**, controlling for prior knowledge and interest. Wiley, Goldman, Graesser & Sanchez (2009), *American Educational Research Journal* 46 (ERIC EJ883301) [2 experiments; V abstract]: source evaluation predicted learning from an Internet inquiry; a source-evaluation unit (SEEK) improved both reliability judgments and learning from a later inquiry task.
- **Multiple texts teach content better than a textbook, and the heuristics transfer.** Nokes, Dole & Hacker (2007), *J. Ed. Psych.* 99 (ERIC EJ772019) [classroom RCT, 8 classes, 246 students; V abstract]: students who read **multiple texts** learned **more history content** and used sourcing and corroboration more than students reading the traditional textbook, with or without explicit heuristic instruction.
- **Reading Like a Historian.** Reisman (2012), *Cognition and Instruction* 30(1):86–112, and *J. Curriculum Studies* 44 (ERIC EJ963241) [quasi-experiment, five San Francisco high schools, six months; V abstract]: a document-based curriculum produced main effects on **historical thinking, factual knowledge, general reasoning and reading comprehension**. Its "Document-Based Lesson" is a repeatable sequence: background, a central historical question, a few short adapted documents read with sourcing, contextualization, corroboration and close reading, then discussion. The documents are **excerpted and simplified** for struggling readers while keeping their voice. (Sourcing as a named heuristic comes from Wineburg 1991, *J. Ed. Psych.* 83:73–87 [cited].)
- **Science too.** Goldman, Greenleaf et al. (2019), *American Educational Research Journal* 56 (ERIC EJ1222462) [cluster RCT, one semester, ninth-grade biology; V abstract]: text-based investigation across multiple sources to build explanatory models improved comprehension and application to phenomena not covered in instruction.
- **Reviews.** Barzilai, Zohar & Mor-Hagani (2018), *Educational Psychology Review* 30 (ERIC EJ1186639) [systematic review, grade 5 to university; V abstract]: integration "can be successfully taught, with medium to large effect sizes", through explicit instruction, modeling, graphic organizers, discussion, and summarizing and annotating single texts. Brante & Strømsø (2018), *Educational Psychology Review* 30 (ERIC EJ1186634) [review of 18 interventions; V abstract]: **multiple, partly conflicting documents** and inquiry tasks were common features of successful sourcing interventions.
- *For Plato:*
  - In an interpretive course, the natural reading portion is a **document set**: two to four short excerpts (each 100–400 words) from the course's own sources, around one question that the sources answer differently.
  - Each excerpt carries its **source card** (author, date, genre, purpose, audience) on the page, because the source is part of the content.
  - The task is the question, and the evidence board or argument map from [Interactive §0.5] is where the learner builds the answer. The after-move is a claim with evidence from at least two documents, checked by the rubric judge [system-spec §9].
  - Sourcing, corroboration and contextualization are **named moves** the tutor can prompt one at a time ("before you trust this, who wrote it and when?"), and fade.
  - In STEM courses, a smaller version applies wherever the course's sources disagree or simplify (a lecture note against the textbook against the ISA manual). The course model's `conflicts` and `simplifications` [system-spec §7] are ready-made two-document readings.

---

## 5. Reading in tutoring and course practice

**Claim.** Good tutoring and good courses have always been built around reading. The tutor's job is to set up the reading, check it, and build on it, **not to re-deliver it**. When teachers re-teach everything that was assigned, students stop reading.

### 5.1 What tutoring studies and tutorial traditions show

- **The classic tutoring studies were reading-centred.** In Chi, Siler, Jeong, Yamauchi & Hausmann (2001), *Cognitive Science* 25:471–533 (the study [Tutoring §1.4] uses for "students learn from their own construction"), sessions were organized around a textbook passage on the circulatory system [cited]. When tutors were told to stop explaining and only prompt, students learned as much, partly through "their greater effort to take control of their own learning **by reading more**. What they learned from reading was limited, however, by their reading abilities." [V abstract] The lesson for Plato is the opposite of a tutor that explains everything: when the tutor talks less, the learner reads more, and the tutor's prompts are what make the reading count.
- **Reciprocal teaching: dialogue interleaved with reading.** Palincsar & Brown's procedure alternates short segments of text with four strategies done aloud (questioning, summarizing, clarifying, predicting), modeled by the teacher and handed over to the learner. Rosenshine & Meister (1994), *Review of Educational Research* 64(4):479–530 (ERIC EJ500529) [review of 16 studies; V abstract]: median effect **0.32 on standardized** comprehension tests and **0.88 on experimenter-made** tests. [mostly school-age readers]
- **Discussion about text.** Murphy, Wilkinson, Soter, Hennessey & Alexander (2009), *J. Ed. Psych.* 101:740–764 (ERIC EJ861185) [MA; V abstract]: several discussion approaches raised student talk, cut teacher talk and substantially improved text comprehension; few raised literal or inferential comprehension on other measures, or critical thinking and reasoning. [mostly grades 4–6]
- **The Oxford tutorial.** The student reads and writes before the tutorial; the hour is spent on the student's reading and writing. Ashwin (2005), *Higher Education* 50 (ERIC EJ733454) [interviews, 28 students]: students' conceptions ranged from "the tutor explains what I didn't know" to "we exchange views and both reach a new understanding", and their view of the preparatory reading varied with it. [qualitative only]
- **PSI** (§1.4): self-paced written units, a tutor's unit check, mastery before moving on.
- **Caveat.** Direct observational studies of how *expert* tutors assign and use reading are scarce. The expert-tutoring literature [Tutoring §1] codes dialogue moves, not reading assignments. The case here rests on tutoring experiments built around texts, on reading-centred course designs, and on the reading research itself. [weak, indirect]

### 5.2 Read-before-class designs: flipped classrooms and just-in-time teaching

- **Flipped classrooms.** Låg & Sæle (2019), *AERA Open* 5(3) (ERIC EJ1229661) [MA, k = 272; V abstract]: g = 0.35 on learning, **0.24 in adequately powered studies**; pass rates and satisfaction also slightly better, and likely inflated by publication bias; "some support" that **testing student preparation** increases the benefit. van Alten, Phielix, Janssen & Kester (2019), *Educational Research Review* 28 [MA, 114 studies; V abstract]: a small positive effect on learning, none on satisfaction, and larger effects **when quizzes were added** and when face-to-face time was not cut. Most pre-class material in these studies is video, not text, so they bear on "prepare, then be checked, then apply", not on reading as such.
- **Just-in-Time Teaching** (Novak, Patterson, Gavrin & Christian 1999): short "warm-up" questions on the reading are due hours before class; the instructor reads the answers and builds the class on the difficulties they reveal (Marrs & Novak 2004, *Cell Biology Education* 3:49–61, ERIC EJ822680). Sayer, Marshman & Singh (2016), *Phys. Rev. PER* 12 (ERIC EJ1122467): in upper-division quantum mechanics, performance rose from the pre-lecture reading quizzes to clicker questions after lectures targeted at the difficulties the reading quizzes had exposed. [mostly descriptive and quasi-experimental; weak causal evidence]
- *For Plato:* JiTT is exactly the loop Plato can run alone. The reading's prequestions and after-move are the warm-up; their answers go to the learner model; the dialogue that follows is aimed at what the reading did **not** deliver.

### 5.3 Getting people to read, and reading quizzes

- **Compliance is low by default.** Burchfield & Sappington (2000), *Teaching of Psychology* 27 (ERIC EJ613785) [survey, 1981–1997]: compliance with assigned reading declined sharply over the period, and rose with course level. Heiner, Banet & Wieman (2014), *American Journal of Physics* 82:989–996 [V full text]: prior studies found **70–80% of students do not read** the textbook before class.
- **Targeted reading plus a short quiz fixes it.** Heiner et al. (2014) [two large courses, physics and biology; descriptive, with logs checking self-reports]: with **short, targeted readings**, explicit guidance on what to focus on and what to skip, and a **5–10 question** online quiz (mostly basic and comprehension items, one or two harder, some pointing at specific figures), **80% read regularly**. Their best practices include "the questions should be easy if one read and hard if one did not", and: **"Refer to things from their pre-reading—but do not re-teach them. (If you re-teach it all, the students will quickly stop reading.)"**
- **Annotation as evidence.** Miller, Lukoff, King & Mazur (2018), *Frontiers in Education* 3:8 [observational, flipped introductory physics; V full text]: with chapter readings on a social annotation platform graded automatically for timeliness, quantity, quality and distribution, about 90–95% completed nearly all readings. **Time spent reading did not predict exam performance; spreading the reading over more sittings did** (+0.41 SD per SD of sessions, controlling for time).
- *For Plato:*
  - The after-move should behave like a good reading quiz: **easy if you read with understanding, hard if you skimmed**, aimed at the purpose, not at trivia.
  - When the learner has read, Plato **builds on the reading and does not re-explain it.** It refers to it ("the passage's second paragraph says X; so what happens when…?") and teaches only what the after-move shows was missed.
  - Long readings can be spread across sessions (the Perusall finding), each portion with its own purpose.

---

## 6. AI-written explanatory text

**Claim.** LLM-written explanations can teach. In several experiments they matched human-written help and beat answer-only conditions, and an AI-augmented textbook beat a plain digital textbook. But they are wrong often enough to need verification, they miss target reading levels unless measured, and their fluency inflates learners' sense of understanding. Course fidelity has to be engineered, claim by claim.

### 6.1 Evidence that LLM-written explanations teach

- **Kumar, Rothschild, Goldstein & Hofman (2023/2025)**, "Math education with large language models: Peril or promise?" [pre-registered RCT, N = 1,200; V full text]: on new test problems, **LLM explanations improved learning relative to seeing only the correct answers**. The benefit was largest when people **attempted the problem first**, but held even when they saw the explanation first. Learners adopted the strategies shown. Exposure to the explanations also **increased how much people felt they learned and lowered the perceived difficulty** of the test.
- **Pardos & Bhandari (2024)**, *PLOS ONE* 19(5):e0304013 (PMC11125466) [RCT, N = 274; V abstract]: ChatGPT-written help produced learning gains not significantly different from human-tutor-written help across four mathematics areas. But **32% of the generated help failed quality checks**, reduced to about 0% (algebra) and 13% (statistics) by **self-consistency** (sampling several solutions and keeping the agreed one). Their earlier study (2023, arXiv 2302.06871 [RCT, N = 77]) found human-written hints significantly better than ChatGPT's.
- **Leinonen et al. (2023)**, ITiCSE (arXiv 2304.03938) [comparison, n ≈ 1,000 students; V abstract]: LLM code explanations were rated **more accurate and easier to understand** than student-written ones. (Ratings, not learning outcomes.)
- **Google LearnLM team (2025)**, "Towards an AI-augmented textbook" (arXiv 2509.13348; Google Research blog) [RCT, N = 60, ages 15–18, 40 minutes; V abstract and blog]: an OpenStax chapter transformed into **personalized text (by grade level and interests) with embedded questions, section quizzes, narrated slides, an audio dialogue lesson and a mind map** beat a standard digital reader: about 9% higher immediately and **11 points higher on a retention test 3–5 days later (78% vs 67%)**. Expert ratings of accuracy, coverage and pedagogy across ten source chapters averaged ≥ 0.85. [small, single-session, the package confounds many features]

### 6.2 Risks

- **Errors.** Unverified generation fails often (Pardos & Bhandari: 32% before self-consistency). [Tutoring §2] covers LLM tutor error rates.
- **Missed reading level.** Rooein, Cercas Curry & Hovy (2023), arXiv 2312.02065 [V abstract]: LLMs "have set readability ranges and do not adapt well to different audiences, even when prompted". So the level of a generated explainer must be **measured** after generation, not assumed from the prompt.
- **Grounding versus preference.** Levonian et al. (2023), arXiv 2310.03184 [survey experiment; V abstract]: answers retrieved from an open math textbook were preferred over ungrounded ones, **but not when "too grounded"** in the textbook's wording. Faithful does not mean quoted.
- **Fluency without depth, and inflated self-assessment.** Stadler, Bannert & Sailer (2024), *Computers in Human Behavior* 160:108386 [RCT, N = 91 university students; V abstract]: students researching with ChatGPT rather than Google had **lower cognitive load but lower-quality reasoning and argumentation**. Fernandes et al. (2025), *Computers in Human Behavior* 175:108779 [experiment; V secondary]: AI help raised LSAT performance but inflated self-assessment of performance. Kumar et al. (above): explanations raised *felt* learning.
- *For Plato:* AI-written passages make §3.8 (calibration) more urgent, not less. Every tutor-written explainer gets the same after-move as any reading, and "that was clear" is never evidence.

### 6.3 Making tutor-written passages faithful to the course

The course model's **rule of authority** [system-spec §7] already says the course decides scope, notation, conventions and emphasis, and expertise (checked by verifiers) decides correctness, with each claim labelled course-supported, general knowledge, or contradicted. For reading portions that becomes a pipeline:

1. **Course text first.** If a passage in the course's own materials meets the need (level, length, coherence; §7.2), serve it, verbatim, with its source reference. A tutor-written explainer is for when the course text is missing, too terse (slide fragments), too far above the learner, or needs a refutation frame.
2. **Retrieve, then write.** The explainer is generated from the retrieved course passages and the course model's entries for the KC (statement, mechanism, notation, wrong models, worked examples), in the course's notation and terms.
3. **Claim-level check.** Split the draft into atomic claims (the FActScore approach; Min et al. 2023, EMNLP) and check that each one is **attributable** to a course source or to verified general knowledge (the AIS standard; Rashkin et al. 2023, *Computational Linguistics* 49(4)). Label each claim `course` / `general` / `conflict`, and drop or flag anything unsupported.
4. **Execute what can be executed.** Every number, trace, derivation or code fragment in the passage is run through the domain verifier [system-spec §9]; worked solutions use self-consistency (Pardos & Bhandari 2024).
5. **Measure the level.** Check prerequisite coverage against the learner model and surface features against the target (§2.6), and regenerate if off-target (Rooein et al. 2023).
6. **Cite on the page.** The passage shows small links back to the course pages it draws on, so the learner can see where it comes from and Plato can say "your notes put it this way".
7. **Cache and reuse.** A verified explainer is stored in the course model as a reading portion (§8) and reused, rather than regenerated per learner. Personalization (§7.2) changes the selection, the purpose line and the glosses, not the verified core.

---

## 7. Design rules for Plato's reading mode

The spec now has a **Read** move family, a "Study by reading" session kind, `wait: 'reading'` on the card and a `readings` field in the course model (system-spec §4, §7, §13, §14, §15). These rules say how to run them. Numbers marked *(start)* are starting values to tune on Plato's own data.

### 7.1 When to assign reading, and when to talk

**Rule R1. Long exposition goes on the page.** If what the learner needs next is an explanation longer than about four spoken sentences (≈ 80 words) *(start)*, and the material is within their zone, Plato serves or writes a reading portion instead of saying it [§1.2 transient information; §1.1 VanLehn; Clinton-Lisell]. Speech frames the reading; the page carries it.

| Assign a reading portion when the next step is exposition **and**… | Talk instead when… |
|---|---|
| The learner is in the zone: prerequisite coverage ≥ 0.7 and predicted after-move success ≥ ~0.6 *(start)* [Wolfe; VanLehn] | Out of zone: coverage < 0.7 or θ far below d. Serve a prerequisite portion first, or teach in dialogue with scaffolds [VanLehn] |
| The content is long or interconnected, or needs inference across sentences | It fits in two to four spoken sentences: say it |
| The course's own wording, notation or convention matters | The operative model is unknown: probe first [system-spec §5] |
| The source is the object of study (a primary document, a case, a proof, a poem, a data table) | A flawed model must be run to a contradiction: do that in dialogue, then the right model can be a reading [§2.3] |
| Right after a try-first attempt, to read the full explanation ("a time for telling", in text) | The learner is frustrated or stuck in unproductive confusion [Voice §6] |
| A false belief is suspected or confirmed: a refutation portion [§2.3] | The learner asks to be talked through it (honour it; offer the text afterwards) |
| A procedure at low θ: a worked example paired with a problem [§2.4] | No page is available (voice-only): short spoken segments, then hand back |
| The learner asks to read, or chooses "Study by reading" | θ well above d: a brief spoken tell plus a generative check [Tutoring §1.3] |

- **Personalization.** The per-learner "what works" posterior [system-spec §2, §10] includes *Read* versus *Present-by-voice* per KC kind, scored by residuals on later unaided probes [Personalization §0.3]. A stated preference from the intro session sets the prior and is honoured as a bounded choice ("want to read it, or shall I walk you through it?"), but outcomes decide the default. This is preference plus measured effect, not a "reading learner" style [Personalization §1].
- **Reading skill** is a learner-level trait (speed against the ~238 wpm norm and their own history; comprehension of in-zone portions). Chi et al. (2001) found that what students learned from reading was limited by their reading ability. Low reading skill means shorter, higher-cohesion portions, more glosses, and offering learner-controlled audio, not abandoning text.

### 7.2 Choosing or writing the passage

**Source priority** (the rule of authority, system-spec §7):
1. **The course's own passage, verbatim**, with its reference, when it covers the purpose and fits the learner's level and the length budget.
2. **A course excerpt with glosses**: when a term or a step is missing, add an on-demand gloss or one bridging sentence, visibly marked as Plato's.
3. **A tutor-written explainer**, built and verified by the §6.3 pipeline and cached, when the materials are slide fragments, too terse for this learner (low cohesion and low θ), wrong or simplified (a `conflict`), or when a refutation frame is needed.
4. **Never** free general-knowledge text detached from the course. (A real session failed this way: Plato "summarized the readings" from general knowledge.)

**Length** [§2.5]: new, difficult material: one idea, ~100–400 words (1–2 min). In-zone, review, narrative or primary sources read with a purpose: up to ~600–1,200 words (3–6 min), split at the source's own sections. Longer readings become a sequence of portions. Shorter on a phone [Salmerón 2024] and later in a session.

**Level** [§2.1, §2.6]: high cohesion by default for anyone new to the KC: connectives written out, referents named, each causal step stated, terms defined where first used. For a high-θ learner reviewing, the course's terse version plus a gap-filling purpose ("the notes skip two steps here; find them"). Glosses on demand, never stacked inline for someone who doesn't need them [Oksa et al. 2010].

**Structure** [§2.2]: the purpose as the title (in the words Plato spoke), headings that mirror the idea's structure, numbered lists for real sequences, a figure where the content is spatial, and Plato's highlight on the few key sentences the purpose points to [Ponce et al. 2022].

**Form by KC kind** (system-spec §1):

| KC kind | Reading form | Paired with |
|---|---|---|
| Fact | Short: the fact with its meaning and one reason it holds | Spaced retrieval later; reading is for encoding, not for durability |
| Concept | Definition, two varied examples, one near-miss non-example | Classify a new instance, including a near miss |
| Procedure | Worked example with named subgoals | The paired problem straight after [van Gog 2011] |
| Principle | Mechanism text with explicit causal links, ideally a figure; a prediction asked before reading | One prediction on a new case, or a "why" explain-back |
| Runnable model | Short text beside the runnable element: read, then run it | Predict, then run [Interactive §0.4] |
| Strategy / epistemic | A worked case of the expert move (sourcing a document, distinguishing a precedent) | Apply the move to a new case |
| Interpretive question | A document set: 2–4 excerpts with source cards [§4] | Claim with evidence from at least two sources |

**Refutation framing** [§2.3]. When the learner model holds a suspected or confirmed wrong model on the KC:
- **False belief:** a refutation portion with the belief in the learner's own terms, a plain "this isn't right", why it seemed right, the correct idea with its mechanism, a case the old idea gets wrong (with an analogy if one maps well), and where the course says it.
- **Flawed model:** the contradiction is run in dialogue first; then a reading of the right model, side by side with theirs.
- **Category mistake:** a reading that names the new frame explicitly and applies it to this case and two more.

**Surface personalization** (interests, examples from the learner's field) may change the examples, never the verified core or the target [Understanding §0.10; Personalization §0.5].

### 7.3 Before reading

1. **Frame it in at most three spoken sentences:** why this now (tied to the session goal), roughly how long ("about two minutes"), what to read for (the purpose, at the level of understanding), and that one "how" or "why" question comes after. The last part is the comprehension-test expectancy that improves calibration [Prinz et al. 2020].
2. **Zero to three prequestions** on the central ideas [§3.1]. For principles, a prediction is the best prequestion. Answers are spoken or written anywhere; no verdict. Skip them when reviewing or when the purpose is itself the question.
3. **Show the passage. Don't read it aloud, and don't pre-summarize it** (redundancy [Voice §0.2]; telling the answer first wastes the prequestion).
4. The purpose shown as the passage's title uses the words Plato just said. No separate unspoken instruction line (the user rejected unspoken on-screen text).

### 7.4 During reading

1. **Silence.** `wait: 'reading'`: no timer, no check-ins, no "are you still there?" (the user rejected these; interruptions harm synthesis [Foroughi 2015]). Plato speaks only when the learner speaks or acts.
2. **Questions on demand.** Answer in at most two sentences, in the passage's terms, pointing at the line [Voice §2]; then stop. If the next paragraph answers it, say so and let them read on. If the question reveals a wrong model, note it for the after-move rather than starting a repair mid-reading.
3. **Terms.** "What's a ___?" gets the course glossary's gloss. A tap-to-gloss affordance would be new UI; ask the user before adding it.
4. **At most one embedded prompt per portion, at a boundary, higher-order and skippable** [§3.2]. None for portions under ~300 words *(start)*. For a low-θ learner on a principle, it is a self-explanation prompt with an assisted form; it fades as their unprompted explain-backs improve [Nückles 2010].
5. **Ink.** The learner can mark the passage with the existing pen (circle, underline). A mark is a signal ("this line confused me"), raised after the reading, not during it.
6. **Audio only on request.** If the learner asks, Plato reads the portion aloud paragraph by paragraph, pausable, at their pace. This is the accessibility exception to "never read visible text aloud" [Clinton-Lisell 2022: both modes needed for access; self-pacing is what matters].
7. **Log** time per segment, look-backs, questions, gloss requests and ink, as light signals (§7.6).

### 7.5 After reading

1. **Triggered by the learner** (they say they're done, ask something, or start working), never by a timer.
2. **One light consolidation move**, chosen by the portion's `after` field:
   - if prequestions were asked: **return to them** first ("you guessed X; what does the passage say?");
   - principle or runnable model: **one prediction on a new case**, or a short "why" explain-back;
   - concept: classify a new instance, including a near miss;
   - procedure: the paired problem;
   - interpretive: a claim with evidence from at least two documents;
   - a long sequence of portions: "what would you tell a friend this was about?" in a sentence or two [§3.5].
3. **Retrieval first, then look back.** When the evidence matters (a mastery check), ask for the answer from memory first, then let them check the text. That gives clean evidence and adds the testing effect [§3.6].
4. **Feedback** [system-spec §15]: a verified verdict. If correct, confirm briefly and link to the spine. If partial, **point back to the line** ("look at the third paragraph again: what happens to the carry?"), a targeted re-read rather than a re-teach. If a wrong model shows, repair by kind in dialogue.
5. **Never** a battery of comprehension questions (more than two tutor questions after a portion, counting the return to the prequestion, is an interrogation), never "did that make sense?", and **never re-explain a passage the learner has just shown they understood** [Heiner et al. 2014: "if you re-teach it all, the students will quickly stop reading"].
6. **Schedule the delayed check.** A new-surface item on the portion's KC comes back later in the session or next session [§3.8 delayed generation; Understanding §4].

### 7.6 How reading counts as evidence

| Event | What it shows | Update (system-spec §3, §10) |
|---|---|---|
| Portion served, read to the end, time on text | Exposure only | **No change to θ.** Mark the KC `presented: read`, so the policy knows the explanation was given. The learning-dynamics model's expected gain from reading is a prediction for the after-move to test, not credit. |
| Prequestion answers | Prior state, unaided, before instruction | Ordinary evidence for θ and for wrong-model hypotheses (signature matches). No affective penalty. |
| A question asked while reading | A gap at that anchor, and active monitoring | A weak signal on the anchored KC; repeated questions on one KC raise its σ. |
| Gloss request | Possible prerequisite gap on that term | A weak signal on the term's KC. |
| Dwell and look-backs on a segment | Difficulty there | Raises σ on that segment's KC; never lowers θ alone. |
| Finished far faster than expected (< ~30% of expected time *(start)*) | Skimming | No credit until the after-move; make the next portion shorter, with a narrower purpose. |
| Embedded prompt answer (text visible) | Performance with help | Evidence rank 4 (with help). |
| After-move, text closed, new surface | Understanding | Rank 2 (unaided, new, immediate). Explain-backs are scored on the portion's idea units and checked against wrong-model signatures by the calibrated judge. |
| After-move, text closed, same example as the passage | Recall of the passage | Rank 3 (familiar). |
| After-move with the text consulted | Performance with help | Rank 4. |
| Later-day new-surface check | Durable understanding | Rank 1; required for mastery. |
| "I read it", "got it", "makes sense" | Nothing about knowledge | Calibration data only [§3.8]. |

- **What works.** Residuals on later unaided probes after Read routes versus Present-by-voice and Elicit routes update the per-learner, per-KC-kind posterior. Flip it per learner only on evidence, never on self-report.
- **The reading-skill trait** (§7.1) updates from reading speed and from after-move success on in-zone portions.

### 7.7 Balancing reading and dialogue over a session

There are no quotas; the balance falls out of R1 and the move policy. But the evals need expected bands *(start)*:

| Session kind | Share of learner time spent reading | Shape |
|---|---|---|
| Study by reading | 60–80% | Portion, consolidation, portion; Plato speaks mostly between portions |
| New material / Learn | 25–50% | Prequestions, portion, after-move, dialogue only on the gaps it shows, next portion |
| Repair | 10–25% | Contradiction in dialogue, then a short refutation portion (≤ 2 min), then re-test |
| Exam practice | ≤ 20% | Worked-example readings after failures (H4) and notation look-ups |
| Consolidate | ≤ 10% | Retrieval on new surfaces, not rereading [§3.6] |

- **Rhythm:** read, produce, talk only where the production shows a gap, read on. Never two portions in a row without an after-move, except inside one segmented reading.
- **Three failure modes to watch:**
  - *Interrogation:* more than two tutor questions after a portion, more than four in all (prequestions, the boundary prompt and the after-move), or more question time than reading time in a reading session.
  - *Lecture by voice:* more than ~80 words of spoken exposition when an adequate portion exists.
  - *Homework dump:* portion after portion with no consolidation, or none of the reading checked.
- **Bounded choice** when both routes are reasonable ("read it or talk it through?"), with the outcome recorded to the what-works posterior [Personalization §0.6].

### 7.8 Spec edits this implies (for the design of record)

- §4, the **Elicit** row still says "every turn ends with one". That conflicts with the revised invariant 1 and the Read row. Suggested: "after a reading, an explanation or a demonstration; a reading turn's demand is its purpose".
- §7 `readings`: extend toward the schema in §8 below (at minimum: segments with anchors, key anchors, glosses, idea units for the after-move, claim-level verification labels, and level as prerequisite coverage plus cohesion).
- §10 learner model: add the exposure-versus-evidence rule, look-back-aware credit, and the reading-skill trait (§7.6).
- §15 `wait: 'reading'`: state "no timer, no check-ins; learner-initiated audio allowed".
- [Understanding] Moment 1.3 and `teaching-design.md` ("never paraphrase the notes as the explanation"; "reading is weak as first exposure"): replace with "serve the notes as a reading when they are clear and at the learner's level; write a faithful explainer when they are terse; never read them aloud; reading is weak only without a purpose and a check".

---

## 8. Schema: a reading portion in the course model

This extends the spec's `readings` entry (system-spec §7) rather than adding a parallel structure. It keeps the spec's fields, with four changes: `source` becomes `origin` (adding `materials_glossed`); `ref` and `text` become `sources` and `body`; `refutes` becomes an object holding the refutation's parts; and `after` becomes a list. An empty `after` list replaces `'none'`, and is allowed only when the next card is itself a generative use of the reading, such as the paired problem. Portions are built and verified at course-build time (stage 8), cached, and served many times; personalization changes which portion is chosen and how it is framed, not the verified text.

```ts
ReadingPortion {
  id: string
  kcs: [{ kc: KcId, role: 'teaches' | 'assumes' | 'refutes' }]     // 'assumes' feeds the fit check (prerequisite coverage)
  spine?: SpineId[]
  kind: 'exposition' | 'worked_example' | 'refutation' | 'case' | 'primary_source' | 'document_set' | 'notation'
  origin: 'materials' | 'materials_glossed' | 'explainer'           // §7.2 source priority
  sources: [{ sourceId, locator: string /* page, slide, section, lines */, verbatim: boolean }]

  purpose: string            // spoken by Plato and shown as the title, in the same words: "Read to find out why …"
  body: Block[]              // heading | para | list | code | math | figure | table | quote; every block and sentence has an anchor id for pointing
  keyAnchors: AnchorId[]     // the sentences Plato highlights: what the purpose points at
  segments: [{ from: AnchorId, to: AnchorId, words: number, boundaryPrompt?: Prompt }]   // one or more; at most one prompt per segment
  glosses: [{ term, anchor: AnchorId, text, kc?: KcId }]            // served on request, never inline by default
  sourceCards?: [{ anchor: AnchorId, author, date, genre, purpose, audience }]   // document sets and primary sources

  level: {
    cohesion: 'high' | 'terse'                 // terse portions carry a gap-filling purpose (§2.1)
    words: number, minutes: number              // minutes ≈ words / 200, slower for dense notation (§2.5)
    density: 'prose' | 'mixed' | 'notation'
  }
  variants?: { novice?: PortionId, review?: PortionId }   // the high-cohesion and terse versions of the same idea

  prequestions: [{ prompt, kind: 'predict' | 'explain' | 'recall', answerAnchor: AnchorId,
                   signatures?: WrongModelId[] }]          // 0–3, central ideas only; answerAnchor proves the passage answers it
  after: [{ form: 'return_to_prequestion' | 'explain_back' | 'predict_new_case' | 'classify' | 'paired_problem'
                | 'claim_with_evidence' | 'summary',
            prompt, ideaUnits?: string[],                  // rubric for explain-backs and summaries
            probeId?: ProbeId, problemId?: ProblemId, newSurface: boolean }]
  refutes?: { wrongModel: WrongModelId, beliefAsLearnersSayIt, whyPlausible, correction, mechanism,
              contrastCase, analogy?: { mapping, breaksWhere }, courseRef: SourceRef }
  workedExample?: { subgoals: string[], pairedProblem: ProblemId }

  verification: {
    claims: [{ anchor: AnchorId, label: 'course' | 'general' | 'conflict', support: SourceRef[] | VerifierRunId }]
    executed: boolean                          // every number, trace, derivation and code fragment run by the domain verifier
    surface: { meanSentenceWords: number, rareWordRate: number }
    gate: 'pass' | 'fail', reviewedBy?: 'skeptical_ta' | 'human'
  }
  stats?: { served: number, medianMinutes: number, afterPassRate: number, unaidedResidual: number }  // stage 12, learned from use
}

Prompt { text, form: 'why' | 'what_if' | 'connect' | 'self_explain', assisted?: string /* a sentence to complete */, skippable: true }
```

**Serving it on a card** (system-spec §15):

```ts
Card { move: 'read', target, intention,
       say: /* ≤ 3 sentences: why now, about how long, the purpose, "one how-question after" */,
       ask: /* the first prequestion, or the purpose itself */,
       show: { kind: 'reading', portion: PortionId, highlight: keyAnchors },
       wait: 'reading',                                   // no timer, no check-ins
       expect: [ { when: 'done',      then: /* the prepared after-card */ },
                 { when: 'question',  reply: /* ≤ 2 sentences + point_to(anchor) */, then: 'resume' },
                 { when: 'term',      reply: /* gloss */, then: 'resume' },
                 { when: 'skip',      then: /* after-card anyway; no credit for unread segments */ } ],
       why: /* learner evidence: θ, coverage, open wrong model, what-works posterior */ }
```

**What each serve logs**, for the learner model and the evals:

```ts
ReadingEvent {
  portion, learner, session, card,
  framing:  { purposeSaid: boolean, minutesSaid: boolean, expectancySaid: boolean, prequestions: number },
  reading:  { activeMs, expectedMs, segmentsReached, lookBacks: [{ anchor, ms }], questions: [{ anchor, text }],
              glosses: AnchorId[], ink: AnchorId[], audioRequested: boolean, tutorWordsDuring: number },
  embedded: [{ segment, response?, skipped: boolean }],
  after:    { form, response, verdict, textClosed: boolean, lookedBack: boolean, delayMs,
              ideaUnitsHit: string[], wrongModelHit?: WrongModelId },
  updates:  [{ kc, evidenceRank: 1 | 2 | 3 | 4 | 5, dTheta, dSigma }]     // §7.6
}
```

**Two filled examples** (abridged):

```yaml
# CS 3410 (principle, threshold idea), course notes are slide fragments → explainer, refutation framed
id: rd-twos-complement-one-adder
kcs: [{kc: twos-complement-weight, role: teaches}, {kc: binary-addition, role: assumes}, {kc: sign-magnitude-belief, role: refutes}]
kind: refutation
origin: explainer
sources: [{sourceId: L03-notes, locator: "slides 14-19", verbatim: false}]
purpose: "Read to find out why one adder gives the right answer whether we call the bits signed or unsigned."
level: {cohesion: high, words: 320, minutes: 2, density: mixed}
prequestions:
  - {kind: predict, prompt: "In 4 bits the adder computes 0110 + 1001 = 1111. Is that sum right if you read all three as unsigned? As signed?", answerAnchor: p3s2}   # 6 + 9 = 15; 6 + (−7) = −1: right both times
refutes: {wrongModel: top-bit-is-a-sign-flag,
          beliefAsLearnersSayIt: "the top bit just says minus, and the rest is the size",
          whyPlausible: "that is how we write negative numbers by hand",
          correction: "in two's complement the top bit has weight −2^(n−1); it is a value, not a flag",
          contrastCase: "under the flag model 1001 is −1, so 1001 + 0001 should be 0, but the adder outputs 1010, which that model reads as −2; with weights, 1001 is −7 and 1010 is −6, exactly −7 + 1"}
after:
  - {form: return_to_prequestion}
  - {form: predict_new_case, prompt: "8 bits: the adder adds 11111101 and 00000010. What does it output, and why is that right read as unsigned and as signed?", newSurface: true}   # 11111111: 253 + 2 = 255; −3 + 2 = −1
---
# History (interpretive), a document set from the course reader
id: rd-versailles-peace
kind: document_set
origin: materials
purpose: "Read the three excerpts to decide why the 1919 settlement failed to keep the peace, and who blamed what."
segments: three excerpts, 150–300 words each, each with a source card (author, date, genre, purpose, audience)
prequestions: [{kind: explain, prompt: "Before reading: what's your best guess at the main cause?"}]
after: [{form: claim_with_evidence, prompt: "Make a claim and support it with two of the documents; say where they disagree.", ideaUnits: [sourcing, corroboration, contextualization]}]
```

---

## 9. Eval checks: is reading used well?

These slot into the levels of system-spec §17. Everything runs in the sandbox with the local voice stand-in, never ElevenLabs. Thresholds are *(start)* values. Every metric is reported per domain type (computational, formal-quantitative, science-model, textual-argumentative; system-spec §17), never only in aggregate.

**Simulated learners need a reading model** (level 3), or reading can't win or lose in simulation. In each randomized world, a learner's gain from a portion depends on:
- the fit: prerequisite coverage, and novelty inside the zone [Wolfe 1998];
- cohesion × prior knowledge [McNamara 1996];
- a purpose or prequestion bonus that is specific to what was asked [§3.1];
- a skim probability;
- a reading-skill trait;
- an inflated self-report after reading [§3.8].

Worlds include a **null world** (reading teaches nothing) and **reading-poor learners** (low skill, or low benefit from reading), so the policy must learn when *not* to assign reading.

### 9.1 Neither avoided nor overused (levels 2–4)

| ID | Check | Measure | Pass *(start)* |
|---|---|---|---|
| RD1 | **Reading offered when it should be** | Scripted states: in zone, exposition > 4 sentences needed, adequate portion exists → move = Read | ≥ 80% |
| RD2 | **Reading withheld when it shouldn't be** | Out of zone, operative model unknown, learner frustrated, or "just explain it" → move ≠ Read | ≥ 90% |
| RD3 | **No lecture by voice** | Tutor turns with > 80 words of spoken exposition when an adequate portion existed | ≤ 5% of turns |
| RD4 | **Session shape within bands** | Share of learner time reading, per session kind (§7.7) | Inside band in ≥ 80% of sessions; flag both tails |
| RD5 | **Requests honoured** | "Can I just read about it?" → a portion within the turn; "talk me through it" → spoken | 100% |
| RD6 | **Swap test: reading benefit** | Flip a simulated learner's reading-benefit trait; only the reading share and route should change | Sensitivity ≥ 0.8, specificity ≥ 0.8 [Personalization §0.10] |
| RD7 | **Swap test: reading skill** | Low-skill learner → shorter, higher-cohesion portions with more glosses, not fewer portions | Mean portion length drops ≥ 30%; reading share drops ≤ 10 points |
| RD8 | **No homework dump** | Consecutive portions with no after-move, outside one segmented reading | 0 |

### 9.2 The right passage (level 1, course model gate)

| ID | Check | Measure | Pass *(start)* |
|---|---|---|---|
| RD9 | **Fit** | Prerequisite coverage of served portions for the learner; words against the length band for the KC's difficulty | Coverage ≥ 0.7 in ≥ 90% of serves; length in band ≥ 85% |
| RD10 | **Purpose quality** | Judge: is the purpose at the level of understanding, and answerable from the passage? | ≥ 90% |
| RD11 | **Prequestions answerable** | Each `answerAnchor` exists, and a judge confirms it answers the question | 100% |
| RD12 | **Source priority** | Explainers served when an adequate course passage existed (a recorded reason is required) | ≤ 10% without a reason |
| RD13 | **Faithfulness** | Atomic claims in explainers labelled `course` or `general` with support; executable content run by the verifier; notation matches the course glossary | ≥ 98% of claims supported; 100% executed; 0 unflagged `conflict` claims |
| RD14 | **Refutation framing when it should be** | Portions served on a KC with a suspected or confirmed false belief that use the refutation form with all parts present | ≥ 90% |
| RD15 | **Level of generated text** | Measured surface features and cohesion against the target for the learner's θ | ≥ 85% in range after at most one regeneration |
| RD16 | **Ablation** | Probes answered from served portions versus from raw materials (the stage-11 ablation applied to readings) | Portions beat raw excerpts on teaching probes |

### 9.3 Conduct around the reading (level 5b, stage process checks)

| ID | Check | Measure | Pass *(start)* |
|---|---|---|---|
| RD17 | **Silence held** | Tutor words during `wait: 'reading'` other than replies to the learner and at most one boundary prompt; any timed check-in | 0 unprompted words; 0 check-ins |
| RD18 | **No read-aloud** | Overlap between tutor speech and the visible passage, unless the learner asked for audio | ≈ 0 |
| RD19 | **Inserted prompts sparse and higher-order** | Prompts per portion; prompts in portions < 300 words; judge rating of prompt level | ≤ 1; 0; ≥ 90% higher-order |
| RD20 | **On-demand answers stay short** | Words per reply to a mid-reading question; reply points into the passage; reading resumes | ≤ 2 sentences; point bound ≥ 95%; no new tutor question |
| RD21 | **Not an interrogation** | Tutor-initiated questions per portion: before, during and after | ≤ 2 after reading; ≤ 4 in all; typical 1 + 0 + 1 |
| RD22 | **Prequestions closed** | Prequestions returned to after reading | ≥ 90% |
| RD23 | **No re-teach** | After a passed after-move, overlap between the tutor's next turn and the passage's content | Below a threshold set from human-rated examples |
| RD24 | **No "make sense?"** | Content-free comprehension checks after reading | 0 |

### 9.4 Reading leads to learning (levels 3, 4 and 6)

| ID | Check | Measure | Pass *(start)* |
|---|---|---|---|
| RD25 | **Exposure is not credit** | Simulated learner reads with no after-move, or says "got it" → θ unchanged | 100% |
| RD26 | **Look-backs discount credit** | Same after-move answer, text closed versus consulted → credit differs per §7.6 | 100% |
| RD27 | **Reading-first is non-inferior where it should be** | Simulated, and later within-learner live A/B on matched in-zone KCs: Read-first versus dialogue-first; delayed unaided new-surface performance | Non-inferior within 0.1 SD, with less tutor talk, and equal or less learner time |
| RD28 | **And not used where it fails** | Out-of-zone KCs and the null world: the policy routes to dialogue or prerequisites | No loss against the dialogue-only policy; no spurious gains in the null world |
| RD29 | **The after-move discriminates** | After-move pass rate for skimmers (< 30% of expected time) versus full readers ("easy if you read, hard if you didn't") | Pass rate gap ≥ 30 points |
| RD30 | **Calibration improves** | Confidence–accuracy gap after reading, with and without the expectancy line and a delayed after-move (ablation) | Gap smaller with them |
| RD31 | **Real use** | Share of served portions read to the end with active time ≥ 50% of expected; after-move pass rate; later-day unaided success on read KCs versus talked KCs | Tracked per domain type; reading must not trail dialogue on later-day success for in-zone KCs |

---

## 10. Where the evidence is weak, and what to test

- **No study tests a voice tutor that assigns reading.** The case rests on dialogue-versus-text trials (VanLehn 2007), listening-versus-reading meta-analyses (Clinton-Lisell 2022), the transient information effect, and course designs like PSI and JiTT. RD27 is the test that matters.
- **VanLehn et al. (2007)** is one domain (qualitative physics) with carefully written texts. Plato's portions are often course notes, which are terser.
- **Passage length and question density** have no modern trial. Hamaker's (1986) data are 1965–1983 lab studies with confounded design variables. The length bands and "≤ 1 prompt per portion" are inferences. A/B: 0 versus 1 boundary prompt; 300- versus 800-word portions for in-zone material.
- **The reverse cohesion effect** is fragile: it depends on reading skill (O'Reilly & McNamara 2007) and appears mainly on deep measures. Default to high cohesion; treat the terse-text-plus-gap-task variant as an experiment.
- **Self-explanation prompts** conflict: g = 0.55 overall (Bisra 2018), but a negative moderator with worked examples (Barbieri 2023). One prompt, faded, is the cautious middle.
- **Refutation texts:** single-topic studies, testing confounds, short delays (Zengilowski et al. 2021), though Schroeder & Kucera (2022) found no decay over a month. Their reach to flawed models and category mistakes is not established.
- **Flipped-classroom** meta-analyses are mostly about video, show publication bias, and shrink in powered studies (g ≈ 0.24).
- **PSI** evidence is old and mixed in quality.
- **LLM-written text:** the learning trials are short, single-session and often in mathematics; the AI-textbook RCT had N = 60 and a bundle of features. Error rates vary by model and domain, so Plato must measure its own (RD13).
- **Reading on screen** costs a little (g ≈ −0.1 to −0.2), mostly through over-confidence and time pressure. Watch for it in RD30 and RD31.
- **Expert tutors' use of reading** has no direct observational evidence (§5.1).
- **Interpretive subjects:** the document-set evidence is mostly secondary school (Reisman, Nokes, READI). University-level evidence is thinner. Validate on the history unit and the held-out case-reasoning course [system-spec §17].

---

## References

The load-bearing sources, grouped by section. Identifiers: DOI, ERIC number (eric.ed.gov/?id=…), PMC or arXiv.

**§1 Reading versus dialogue, pace, time**
- VanLehn, Graesser, Jackson, Jordan, Olney & Rosé (2007). When are tutorial dialogues more effective than reading? *Cognitive Science* 31(1):3–62. doi:10.1080/03640210709336984; ERIC EJ754602.
- Wolfe, Schreiner, Rehder, Laham, Foltz, Kintsch & Landauer (1998). Learning from text: Matching readers and texts by latent semantic analysis. *Discourse Processes* 25:309–336. ERIC EJ589330.
- Clinton-Lisell (2022). Listening ears or reading eyes. *Review of Educational Research* 92(4):543–582. doi:10.3102/00346543211060871; ERIC EJ1347325.
- Wong, Leahy, Marcus & Sweller (2012). *Learning and Instruction*, ERIC EJ978021. Leahy & Sweller (2016). *Instructional Science*, ERIC EJ1090365.
- Foroughi, Werner, Barragán & Boehm-Davis (2015). Interruptions disrupt reading comprehension. *J. Exp. Psych.: General*. doi:10.1037/xge0000074.
- Feng, D'Mello & Graesser (2013). Mind wandering while reading easy and difficult texts. *Psychonomic Bulletin & Review*. doi:10.3758/s13423-012-0367-y.
- Delgado, Vargas, Ackerman & Salmerón (2018). Don't throw away your printed books. *Educational Research Review* 25. sciencedirect pii S1747938X18300101.
- Ackerman & Goldsmith (2011). Metacognitive regulation of text learning: On screen versus on paper. *J. Exp. Psych.: Applied*. doi:10.1037/a0022086.
- Kulik, Kulik & Cohen (1979). Keller's personalized system of instruction. *American Psychologist* 34(4):307–318. ERIC EJ202488. Kulik, Kulik & Bangert-Drowns (1990). *Review of Educational Research* 60(2):265–299. doi:10.3102/00346543060002265.

**§2 Text design**
- McNamara, Kintsch, Songer & Kintsch (1996). Are good texts always better? *Cognition and Instruction* 14(1). doi:10.1207/s1532690xci1401_1. McNamara (2001), *Canadian J. Exp. Psych.* 55(1):51–62, doi:10.1037/h0087352. O'Reilly & McNamara (2007), *Discourse Processes*, ERIC EJ772185. Ozuru, Dempsey & McNamara (2009), *Learning and Instruction*, ERIC EJ830389.
- Oksa, Kalyuga & Chandler (2010). Expertise reversal effect in using explanatory notes for readers of Shakespearean text. *Instructional Science*. ERIC EJ880290.
- Lorch, Lemarié & Grant (2011). Signaling hierarchical and sequential organization in expository text. *Scientific Studies of Reading*. ERIC EJ922663. Luiten, Ames & Ackerson (1980), advance organizers, ERIC EJ233231.
- Schroeder & Kucera (2022). Refutation text facilitates learning. *Educational Psychology Review* 34. doi:10.1007/s10648-021-09656-z; PMC8784251. Tippett (2010), ERIC EJ905216. Guzzetti et al. (1993), ERIC EJ462258. Zengilowski et al. (2021), ERIC EJ1305850.
- Kendeou, Walsh, Smith & O'Brien (2014). Knowledge revision processes in refutation texts. *Discourse Processes* 51:374–397. doi:10.1080/0163853X.2014.913961. Danielson, Sinatra & Kendeou (2016), ERIC EJ1104292.
- Swire-Thompson, DeGutis & Lazer (2020). Searching for the backfire effect. *JARMAC*. doi:10.1016/j.jarmac.2020.06.006. Ecker et al. (2020), *British J. Psych.*, doi:10.1111/bjop.12383.
- Barbieri, Miller-Cotto, Clerjuste & Chawla (2023). Worked examples effect on mathematics performance. *Educational Psychology Review*. ERIC EJ1364058. Bisra, Liu, Nesbit, Salimi & Winne (2018), Inducing self-explanation, ERIC EJ1186664. Berthold, Eysink & Renkl (2009), ERIC EJ844099. Nückles, Hübner, Dümer & Renkl (2010), ERIC EJ880291. van Gog, Kester & Paas (2011), ERIC EJ927458.
- Brysbaert (2019). How many words do we read per minute? *J. Memory and Language* 109. Benjamin (2012), ERIC EJ955639. Crossley, Skalicky & Dascalu (2019), ERIC EJ1232523.

**§3 Activities around reading**
- Richland, Kornell & Kao (2009), ERIC EJ859957. Carpenter, Rahman & Perkins (2018), doi:10.1037/xap0000145. St. Hilaire & Carpenter (2020), doi:10.1037/xap0000296. Pan, Sana, Schmitt & Bjork (2020), *JARMAC*, pii S2211368120300577. Pan & Carpenter (2023), ERIC EJ1393374.
- Hamaker (1986). The effects of adjunct questions on prose learning. *Review of Educational Research* 56(2):212–242. doi:10.3102/00346543056002212; ERIC EJ351754.
- Weinstein, Nunes & Karpicke (2016), doi:10.1037/xap0000071. Uner & Roediger (2018), doi:10.1016/j.jarmac.2017.09.002. Szpunar, Khan & Schacter (2013), doi:10.1073/pnas.1221764110.
- Chi, Bassok, Lewis, Reimann & Glaser (1989). Self-explanations: How students study and use examples in learning to solve problems. *Cognitive Science* 13:145–182. Chi, de Leeuw, Chiu & LaVancher (1994). Eliciting self-explanations improves understanding. *Cognitive Science* 18:439–477. McNamara (2004), SERT, ERIC EJ682769. McNamara (2017), ERIC EJ1154551.
- Dunlosky, Rawson, Marsh, Nathan & Willingham (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest* 14(1). doi:10.1177/1529100612453266.
- Graham & Hebert (2011), ERIC EJ961480. Fiorella & Mayer (2016), ERIC EJ1120458. Lachner, Ly & Nückles (2018), ERIC EJ1177046. Lachner, Hoogerheide, van Gog & Renkl (2022), ERIC EJ1334744.
- Ponce, Mayer & Méndez (2022), highlighting meta-analysis, ERIC EJ1334669. Callender & McDaniel (2009), ERIC EJ819481. Rawson & Kintsch (2005), ERIC EJ688037. Roediger & Karpicke (2006), doi:10.1111/j.1467-9280.2006.01693.x. Karpicke, Butler & Roediger (2009), doi:10.1080/09658210802647009.
- Pichert & Anderson (1977), ERIC EJ174708. van den Broek, Lorch, Linderholm & Gustafson (2001), doi:10.3758/bf03206376. McCrudden & Schraw (2007), ERIC EJ784919.
- Yang, Zhao, Yuan, Luo & Shanks (2023), metacomprehension meta-analysis, ERIC EJ1370019. Prinz, Golke & Wittwer (2020), ERIC EJ1273932. Thiede, Anderson & Therriault (2003), ERIC EJ662401. Glenberg & Epstein (1987), Inexpert calibration of comprehension, *Memory & Cognition* 15; report ERIC ED266439.

**§4 Multiple documents**
- Bråten, Britt, Strømsø & Rouet (2011), ERIC EJ912527. Strømsø, Bråten & Britt (2010), ERIC EJ872940. Wiley, Goldman, Graesser & Sanchez (2009), ERIC EJ883301.
- Nokes, Dole & Hacker (2007), ERIC EJ772019. Reisman (2012), *Cognition and Instruction* 30(1), doi:10.1080/07370008.2011.634081, and ERIC EJ963241. Goldman et al. (2019), Project READI, ERIC EJ1222462.
- Barzilai, Zohar & Mor-Hagani (2018), ERIC EJ1186639. Brante & Strømsø (2018), ERIC EJ1186634.

**§5 Tutoring and course practice**
- Chi, Siler, Jeong, Yamauchi & Hausmann (2001). Learning from human tutoring. *Cognitive Science* 25:471–533. doi:10.1207/s15516709cog2504_1.
- Rosenshine & Meister (1994). Reciprocal teaching. *Review of Educational Research* 64(4). doi:10.3102/00346543064004479. Murphy et al. (2009), ERIC EJ861185. Ashwin (2005), ERIC EJ733454.
- Låg & Sæle (2019), doi:10.1177/2332858419870489. van Alten, Phielix, Janssen & Kester (2019), *Educational Research Review* 28, pii S1747938X18305694. Marrs & Novak (2004), ERIC EJ822680. Sayer, Marshman & Singh (2016), ERIC EJ1122467.
- Heiner, Banet & Wieman (2014). Preparing students for class. *American Journal of Physics* 82:989–996. doi:10.1119/1.4895008. Burchfield & Sappington (2000), ERIC EJ613785. Miller, Lukoff, King & Mazur (2018), doi:10.3389/feduc.2018.00008.

**§6 AI-written text**
- Kumar, Rothschild, Goldstein & Hofman. Math education with large language models: Peril or promise? doi:10.1007/978-3-031-98459-4_5; SSRN 4641653.
- Pardos & Bhandari (2024), *PLOS ONE*, doi:10.1371/journal.pone.0304013; (2023) arXiv 2302.06871. Leinonen et al. (2023), doi:10.1145/3587102.3588785. Google LearnLM team (2025), Towards an AI-augmented textbook, arXiv 2509.13348.
- Rooein, Cercas Curry & Hovy (2023), arXiv 2312.02065. Levonian et al. (2023), arXiv 2310.03184. Stadler, Bannert & Sailer (2024), doi:10.1016/j.chb.2024.108386. Fernandes et al. (2025), doi:10.1016/j.chb.2025.108779.
- Min et al. (2023), FActScore, arXiv 2305.14251. Rashkin et al. (2023), Measuring attribution in natural language generation models, *Computational Linguistics* 49(4).
