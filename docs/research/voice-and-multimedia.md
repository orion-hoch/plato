# Voice and multimedia: how Plato's speech, page and interaction work together

Research brief for Plato (director decides each move, actor performs it in voice over a shared page). Topic: how speech, visuals and interaction should combine, and what spoken-tutoring research says. Compiled 2026-10-08.

For each finding: **Claim**, **Evidence** (with citations and links), **Design rule** for Plato. Sections 9 and 10 turn the rules into stage directions for the actor and the page, and into eval checks.

Confidence tags (same as the sibling briefs):
- **[V]** checked this pass against the primary text or abstract.
- **[S]** taken from a published summary or secondary write-up. Check the primary source before quoting numbers.
- **[K]** established literature cited from background knowledge. The finding is standard, but check exact figures.

Status: complete (2026-10-08). Search note: the web-search budget was used up, so sources were found through ERIC, Europe PMC, the ACL Anthology, Springer pages and the Noetel et al. preprint. Abstracts were read rather than full PDFs, except where noted.

---

## 0. Summary of rules

1. **Voice explains; the page persists.** Narrate graphics; don't caption them.
   - Modality effect: d = 0.38, or 0.20 after bias correction.
   - Code, numbers, the exact question and key terms (2–3 words, on the diagram) are written.
   - Long speech is transient and loses the modality advantage.
2. **Never read the page aloud.** Adding audio to visible text gives g ≈ −0.04, and verbatim captions over diagrams pull the eyes off the graphic. Plato's chat log must not act as a live verbatim caption.
3. **Show it as you say it; put labels on the thing.** Temporal contiguity g = 0.78; spatial contiguity g = 0.63. Nothing on the page that the move doesn't use; persistent clutter costs most (g = 0.43).
4. **Build new structural diagrams step by step, in sync with speech.**
   - Watching an instructor draw beat static diagrams (d ≈ 0.35–0.58), for novices.
   - Then have the student **explain** the build. That was the strongest condition.
5. **Point specifically and early.**
   - Specific deictic pointing is the active ingredient of agent gesture (Li et al. 2019). General pointing did nothing.
   - Bind every "this" to an element-level anchor, 0–300 ms before the word.
   - Use two-point links for mappings. Make the student point too: producing gestures beats observing them.
6. **Segment: one idea per 2–4 sentences, then hand back with a generative prompt** (segmenting g = 0.34–0.41). Name the parts before a many-part process (pre-training).
7. **Hold silence after a question.** Teachers wait about 1 s; 3–5 s improves answers (Rowe, Tobin).
   - Plato waits ≥3 s on recall and ≥8–10 s on reasoning, and stays silent with a still page during work.
   - It never takes the turn on "um" or "so…", and leaves 1–2 s before judging.
   - A single content-free check comes only after a long, inactive silence.
8. **Certainty is a second axis next to correctness.**
   - Adapting to uncertainty raised learning in ITSPOKE (p = .001), but only with accurate detection.
   - Unsure + right → confirm and give or ask why. Sure + wrong → vivid contrast. Unsure + wrong → hint ladder.
   - Fuse hedges, fillers, latency, page behaviour and correctness against the student's own baseline, and validate the detector.
9. **Let confusion run while the student is still making progress.** Step in on frustration, stagnation, off-target confusion or boredom, then name the snag and give a transfer item. Boredom is the worst state.
10. **Feedback: verdict first, one *why* aimed at the spot, hand back.**
    - Elaborated feedback g = 0.49 vs right/wrong 0.05.
    - Let the sandbox or stepper verify.
    - Praise is rare and about the process; no person praise and no comparisons.
    - Never mark wrong on a shaky transcript.

The 22 stage directions are in §9 and the 24 eval checks in §10. The weak spots are in §11.

---

## 1. Mayer's multimedia principles: evidence, boundaries, and what each means for voice plus page

### 1.0 The frame and how big the effects really are

**Theory.** The cognitive theory of multimedia learning (Mayer) and cognitive load theory (Sweller) say much the same thing. There are two channels: pictures go through the eyes and speech through the ears. Each channel has a small working-memory capacity. Learning needs active selecting, organising and integrating. Design principles do one of three jobs: cut extraneous processing (coherence, signaling, redundancy, contiguity), manage essential processing (segmenting, pre-training, modality), or foster generative processing (personalization, voice, embodiment, generative activity). [V: Mayer 2021, [doi:10.1016/j.jarmac.2021.03.007](https://doi.org/10.1016/j.jarmac.2021.03.007), abstract; Mayer & Fiorella chapter listing, via OpenAlex]

**Effect sizes: use the meta-analyses, not Mayer's lab medians.** Noetel et al. (2022), ["Multimedia design for learning: an overview of reviews with meta-meta-analysis"](https://doi.org/10.3102/00346543211052329), *Review of Educational Research* ([preprint](https://doi.org/10.31234/osf.io/pynzr)), covered 29 reviews, 1,189 studies and about 78k participants. [V, full preprint read]
- Mean effect of a design principle on learning: **g = 0.38** (k = 808). Retention and transfer were almost identical (0.42 and 0.43).
- The authors note that Mayer's narrative reviews reported d > 1.0. Their verdict: "educators should have more conservative expectations."
- **Design matters most when material is complex and pacing is set by the system:**
  - complex material: g = 0.70; simple material: g = 0.20;
  - system-paced (a lecture): g = 0.41; learner-paced (a website): g = 0.27.
- **Prior knowledge was *not* a robust moderator across reviews.** The expertise-reversal effect is real in some individual studies but did not replicate at meta level.

**What this means for Plato.** A voice tutor is system-paced: speech flows and the student cannot re-read it. CS 3410 content has high element interactivity (a stack frame, a datapath, two's-complement arithmetic). Plato sits exactly where these principles matter most. Expect gains of a few tenths of an SD from each principle. They do not add up to miracles.

### 1.1 Coherence: cut what does not serve the goal

**Claim.** People learn better when extraneous words, pictures and sounds are left out. This includes "seductive details", which are interesting but irrelevant.

**Evidence.**
- Sundararajan & Adesope (2020), ["Keep it coherent: a meta-analysis of the seductive details effect"](https://eric.ed.gov/?id=EJ1263249), *Ed Psych Review*. Removing seductive details gives **g = 0.33** (k = 68). [V abstract; numbers via Noetel]
- The cost is larger when the seductive detail is **persistent on screen (g = 0.43) than when it is transient (g = 0.12, not significant).** [V via Noetel]
- Decorative animation does nothing: g = −0.05 (Höffler & Leutner 2007, via Noetel). [V]
- Classic studies: adding interesting video clips or text, or background music, hurt transfer (Mayer, Heiser & Lonn 2001; Moreno & Mayer 2000). [K]

**Boundary.** Emotional-design touches can help when they carry meaning: pleasant colours and anthropomorphic features gave g = 0.35 (Brom et al. 2018, via Noetel). Coherence bans *irrelevant* material, not warmth.

**Design rule.**
- **Each item on the page must be referenced by the current move or the student's current task.** Remove or fade anything else, such as finished items, earlier boards and decoration.
- The page is persistent, so clutter there costs more than an aside in speech.
- Cut spoken fun facts, history and analogies that don't map onto the concept. An analogy has to earn its place by being the explanation.
- Crop note excerpts to the lines that matter.

### 1.2 Signaling: cue what matters and how it is organised

**Claim.** Cues that guide attention to the essential material, or show its structure, improve learning. Cues include highlighting, arrows, colour coding, spoken emphasis, headings, "first / second" and pointer words.

**Evidence.**
- Schneider, Beege, Nebel & Rey (2018), meta-analysis, *Educational Research Review*: **g = 0.43 on learning** (k = 209). Signaling also lowered cognitive load (g = 0.25) and increased learning-relevant fixations (g = 0.39). [V via Noetel]
- Alpizar et al. (2020) and Richter, Scheiter & Eitel (2016) are consistent. Richter's meta-analysis found that only learners with **low** prior knowledge benefited from text–picture integration signals. [Alpizar: K; Richter's meta-analysis: V, as reported in Richter et al. 2018]
- Richter, Scheiter & Eitel (2018), [field study](https://eric.ed.gov/?id=EJ1178409): integration signals (colour coding, deictic references) helped low-prior-knowledge 8th graders and **hurt high-prior-knowledge ones**. [V]
- Mautone & Mayer (2001), ["Signaling as a cognitive guide"](https://eric.ed.gov/?id=EJ638750): headings plus *pointer words* ("because of this", "as a result"), including in spoken lessons, raised transfer in 3 of 3 experiments. [V abstract]

**Boundary.** Signals add most when the display is complex and the learner is new to it. For a student who already knows the representation, dense integration signals can become noise. This is a study-level finding that did not hold up at meta level, so treat it as a fade rule, not a hard rule.

**Design rule.**
- Every spoken reference to a specific part of the page comes with a visual signal on that part (see §2).
- Speech carries the structure: "Two things happen. First… Second…", "so", "because". The page carries the location.
- Keep colour codes consistent across representations. For example, `x` gets the same colour in the C source, its stack slot and the `lw` that loads it.
- Fade integration signals as the learner model shows fluency with a representation.

### 1.3 Redundancy: don't read the page aloud

**Claim (Mayer).** People learn better from graphics plus narration than from graphics plus narration plus the same words printed on screen. The printed words compete with the graphic for the eyes.

**Evidence (more nuanced than the slogan).**
- Adesope & Nesbit (2012), ["Verbal redundancy in multimedia learning environments: a meta-analysis"](https://doi.org/10.1037/a0026147), *JEP*, 57 studies. [V abstract]
  - Spoken+written did **not** beat written-only.
  - Spoken+written **did** beat spoken-only, but only for low-prior-knowledge learners, system-paced materials and **picture-free** materials.
  - **Showing key terms extracted from the narration beat showing verbatim text,** and accounted for much of the benefit.
  - Via Noetel: adding text to audio gives g = +0.29; adding audio to text gives g = −0.04.
- Mayer & Johnson (2008), ["Revising the redundancy principle"](https://doi.org/10.1037/0022-0663.100.2.380). **Two or three printed words** that repeat the narration's main event, placed next to the matching part of the diagram, improved retention (d = 0.47 and 0.70) and did not hurt transfer. [V]
- Eye-tracking reviews: when on-screen text and images appear together, learners read the text at the expense of the image (Alemdag & Cagiltay 2018, via Noetel). [V]
- The classic redundancy harm (Mayer, Heiser & Lonn 2001; Kalyuga, Chandler & Sweller) appears when a **full verbatim** caption accompanies an animation with narration. [K]

**Boundary.**
- Redundancy hurts most with a graphic, system pacing and long verbatim text.
- It is neutral or helpful with no graphic, short key terms, second-language learners, or learner control.

**Design rule.**
- **Plato never reads more than a few words of visible text aloud.** It points at the text and adds what the text doesn't say: the why, the link, the question.
- The page labels the diagram with key terms of 2–3 words, placed on the element. It does not caption Plato's sentences.
- **Plato's chat log is a redundancy risk.** The user's UI shows Plato's lines in a log on the right. A verbatim line appearing *while* Plato talks over a diagram is the classic redundant-caption condition. Two options:
  - write the log line when the utterance ends, as a persistent record that counters transient speech;
  - log a condensed key-terms version and keep the log visually quiet while a diagram is being explained.
- When there is **no** graphic, for example a definition or a rule, a short written version next to the spoken one helps (the picture-free result).

### 1.4 Spatial contiguity: put related words and pictures together

**Claim.** Learning improves when printed words sit next to the part of the graphic they describe, rather than in a legend or elsewhere on the page.

**Evidence.**
- Schroeder & Cenkci (2018), [meta-analysis](https://eric.ed.gov/?id=EJ1186641), 58 comparisons: **g = 0.63**, with benefits across most moderators. [V]
- Ginns (2006), [spatial and temporal contiguity meta-analysis](https://eric.ed.gov/?id=EJ747512), 50 studies: the effects are larger for complex material. Pooled contiguity: g = 0.74. [V; number via Noetel]
- Eye-tracking confirms the mechanism: more integrative transitions between text and picture. [V via Noetel]

**Design rule.**
- Annotations, values and labels go **on or beside** their referent: the register value next to the register, the address next to the box, the comment next to the line.
- When two representations must be mapped onto each other, put them side by side, line-aligned, with linking highlights. Examples: C next to its RISC-V, and a pointer variable next to the memory column.
- Never put information the student must combine with a diagram into the chat log or a different panel.

### 1.5 Temporal contiguity: speak about it while showing it

**Claim.** Narration and the matching graphic should happen at the same time, not one after the other.

**Evidence.**
- Ginns (2006): **g = 0.78** for temporal contiguity (k = 13). [V via Noetel]
- Mayer & Anderson (1991, 1992): concurrent narration and animation beat narration-before or narration-after on transfer. [K]
- Mayer, Moreno, Boire & Vagge (1999): alternating **small** chunks did about as well as concurrent presentation, while large blocks hurt. [K] The tolerance is at the level of a chunk, not an exact timestamp.

**Design rule.**
- A board item appears or is highlighted **as** Plato starts talking about it. It does not appear seconds earlier with Plato silent, and it is not explained before it appears.
- Use a sync tolerance of roughly half a second for highlights, and a sentence for whole items. Gesture–speech timing in humans has the gesture start at or slightly before the word it refers to (§2.4).
- If the page render is slow, hold the speech. Don't talk to an empty page.

### 1.6 Segmenting: learner-paced, meaningful chunks

**Claim.** A complex lesson works better broken into meaningful segments, with a pause or student action between them, than as one continuous stream.

**Evidence.**
- Rey et al. (2019), ["A meta-analysis of the segmenting effect"](https://doi.org/10.1007/s10648-018-9456-4), 56 investigations and 88 comparisons. [V abstract]
  - Small-to-medium effects on retention and transfer: **g = 0.34 overall** (k = 123, via Noetel).
  - Lower cognitive load (g = 0.23) and longer learning time.
  - Segments chosen by the designer did better (g = 0.41) than segmentation left to learners (g = 0.20) (Noetel's reading).
  - High-prior-knowledge learners benefited *more* on retention.
- Mayer & Chandler (2001), ["When learning is just a click away"](https://eric.ed.gov/?id=EJ638751): even a modest amount of learner control over pacing improved deep understanding. [V]
- **Transient information effect.** Leahy & Sweller (2011), [*Applied Cognitive Psychology*](https://doi.org/10.1002/acp.1787): a long spoken passage **reversed** the modality effect. Written text beat audio because the long spoken passage couldn't be held in working memory. Shortening the audio restored the modality advantage. [V]
- Chen, Allen, Waterman & Sweller (2026), [*Ed Psych Review*](https://eric.ed.gov/?id=EJ1510257), link this to cognitive offloading: making information persistent removes the transience cost. [V abstract]

**Design rule.**
- **One idea per segment.** A segment is usually one build step on the page plus two to four spoken sentences, about 10–25 s. The figure is a heuristic: no study fixes a length for tutoring speech.
- End each segment by handing the turn back with a generative prompt ("what goes in this slot?"), not "does that make sense?". Or end it with a visible step on the page.
- The director decides segment boundaries; designer segmentation beat learner segmentation.
- The student can always say "wait", "again" or "go on", and the actor obeys at once.
- **Anything the student must hold in mind is written, not only spoken:** numbers, addresses, code, the exact question.

### 1.7 Pre-training: names and parts first

**Claim.** People learn a process better when they already know the names and characteristics of its parts.

**Evidence.**
- Mayer, Mathias & Wetzell (2002), *JEP: Applied* 8(3): 147–154. Learning the names and behaviours of brake-system parts first improved transfer from a fast narrated animation. Mayer reports a median d of about 0.8 across 5 experiments, but that is a lab median and inflated (§1.0). [K]
- Mayer, Mautone & Prothero (2002), [geology game](https://eric.ed.gov/?id=EJ644674): pictorial pre-training on the features improved performance. Verbal strategy statements did not. [V]
- Pollock, Chandler & Sweller (2002): the "isolated–interacting elements" approach helps novices. [K]
- No meta-analysis exists. The evidence is moderate and comes mostly from one lab. The benefit appears for low-prior-knowledge learners and fast, system-paced lessons.

**Design rule.**
- Before a process that has many interacting parts, give one short "meet the parts" segment. Examples: the calling convention (`ra`, `sp`, `a0–a7`, `s0–s11`, caller- and callee-saved), the single-cycle datapath, a stack frame.
  - It shows a labelled diagram, built part by part.
  - It has one quick retrieval check on the names, such as "which register holds the return address?".
- Skip it when the learner model already shows the names are known.
- Pre-training is not a lecture. It is the vocabulary layer, and it should take 30–60 s.

### 1.8 Modality: narrate graphics instead of captioning them

**Claim.** Graphics plus *spoken* words beat graphics plus *printed* words.

**Evidence.**
- Ginns (2005), ["Meta-analysis of the modality effect"](https://eric.ed.gov/?id=EJ723937), 43 effects: d = 0.72. The effect was moderated by element interactivity, being larger for complex material, and by pacing, being larger when system-paced. [V abstract; d via Reinwein abstract]
- Reinwein (2012), ["Does the modality effect exist?"](https://doi.org/10.1007/s10936-011-9180-4), 86 effects: **d = 0.38, and d = 0.20 after trim-and-fill correction for publication bias.** [V]
- The effect is reversed in some learner-paced, naturalistic settings (e.g. [Witteman & Segers 2010](https://doi.org/10.1111/j.1365-2729.2009.00335.x); Tabbers et al. 2004 [K]).
- It is reversed for long auditory text (the transient information effect; Leahy & Sweller 2011). [V]

**Design rule.**
- **Explanation is spoken; reference material is written.** Plato *says* the explanation of a diagram. It does not write paragraphs on the page.
- The page holds what must persist or be re-read: code, numbers, addresses, definitions, the exact problem statement, and the student's own work.
- Long spoken passages lose the modality advantage. If an explanation needs more than about 3 sentences, segment it (§1.6) or move its structure onto the page as a few key terms.

### 1.9 Personalization: conversational, polite, about the learner

**Claim.** A conversational style (first and second person, direct address, polite wording) helps compared with a formal style.

**Evidence.**
- Ginns, Martin & Marsh (2013), ["Designing instructional text in a conversational style: a meta-analysis"](https://doi.org/10.1007/s10648-013-9228-0). [V abstract]
  - Retention **d = 0.30**, transfer **d = 0.54**.
  - Self-reported friendliness d = 0.46 and effective cognitive processing d = 0.62.
  - The clearest boundary: **small, non-significant effects in studies longer than 35 min.**
  - Pooled learning effect g = 0.33 (via Noetel).
- Wang, Johnson, Mayer et al. (2008), "The politeness effect", *IJHCS*. Polite phrasing of tutor suggestions ("you might want to…", "let's…") improved learning over direct commands, more so for students who wanted help. [K]

**Boundary.** The effect is novelty-sensitive and fades in long sessions. It is about *style*, not chit-chat. Chatty filler is a coherence violation.

**Design rule.**
- Use "I", "you" and "we". Refer to the student's own artefacts: "your diagram", "your answer of −5", "the line you wrote".
- Hints and corrections are framed politely and collaboratively ("let's look at the top bit") without hedging the correctness verdict (§7).
- Personalization lives in references to the learner's work and goals, not in small talk.

### 1.10 Voice: a natural human-sounding voice

**Claim.** People learn better from a human-sounding, standard-accent voice than from a machine voice or a strongly accented one.

**Evidence.**
- Mayer, Sobko & Mautone (2003), ["Social cues in multimedia learning: role of speaker's voice"](https://doi.org/10.1037/0022-0663.95.2.419). Transfer was better with a standard accent than a foreign accent, and with a human voice than an old synthesized one. [V]
- Mayer & DaPra (2012): the embodiment effect appeared only with a human voice. [V]
- **Modern TTS removes most of the gap.** Craig & Schroeder (2017), *Computers & Education* 114, found a modern engine as good as a human voice [K]. Craig & Schroeder (2019), ["Text-to-speech software and learning"](https://eric.ed.gov/?id=EJ1225297): a modern TTS engine did not differ from a recorded human voice on perceptions, learning or efficiency, while an older engine did worse. [V]

**Design rule.**
- Neural TTS of ElevenLabs quality is fine. Keep one consistent, clear, warm voice.
- Prosody should carry structure: stress on the key term, a pause before the question.
- Avoid speed-ups. Evidence on speech rate is thin, but the transient-information argument says don't compress technical speech.
- Voice quality is no longer a lever. Content and timing are.

### 1.11 Image principle: a face on screen doesn't help

**Claim.** Adding the speaker's static image or face doesn't improve learning. Mayer (2021) puts it as "do not display static instructor's face".

**Evidence.**
- Wang, Li, Mayer & Liu (2018), [*JEP*](https://eric.ed.gov/?id=EJ1168616): adding a **static** agent didn't improve performance. Adding a **gesturing** agent did: transfer ds 0.72–1.02, with much more fixation time on the target material. [V]
- Pedagogical agents overall give **g = 0.19** (Schroeder, Adesope & Gilbert 2013, [meta-analysis](https://eric.ed.gov/?id=EJ1076333), 43 studies), with larger effects in K-12 than post-secondary. [V]
- 3D agents show no benefit (Castro-Alonso et al. 2021, via Noetel). [V]
- Johnson, Ozogul & Reisslein (2015), [*JCAL*](https://eric.ed.gov/?id=EJ1053181): an agent's image helped low-prior-knowledge learners and **hurt high-prior-knowledge** ones. [V]

**Design rule.** No avatar or face for Plato. The screen goes to content. Plato's "body" on the page is its pointer (§1.12, §2).

### 1.12 Embodiment and gesture: the active ingredient is specific pointing

**Claim.** Agents or instructors who use human-like gestures improve learning. The effective part is **specific deictic pointing** at the element being talked about.

**Evidence.**
- Mayer & DaPra (2012), ["An embodiment effect…"](https://doi.org/10.1037/a0028616), 3 experiments. A human-voiced agent with gestures, gaze and facial expression beat a non-gesturing one on transfer. [V]
- Davis (2018), [meta-analysis of agent gesturing](https://doi.org/10.1016/j.edurev.2018.05.002), 20 experiments, N = 3,841: near transfer **g = 0.39**, retention **g = 0.28**, persona g = 0.44, cognitive load only g = 0.13. [V]
- **Li, Wang, Mayer & Liu (2019), ["Getting the point"](https://eric.ed.gov/?id=EJ1232776).** [V]
  - Four conditions: an agent pointing at the *specific* component being named, an agent pointing in the *general* direction of the diagram, non-pointing (beat) gestures, and no gestures.
  - **Only specific pointing** increased attention to the target (fixation time and count). It also improved retention and transfer, immediately and after a week.
  - The authors' conclusion: specific pointing "is an active ingredient".
- Pi, Hong & Yang (2017), [*BJET*](https://eric.ed.gov/?id=EJ1143150): an instructor's pointing gestures beat non-human cues and no cues in video lectures, by directing attention to the relevant slide content. [V]

**Design rule.** Plato points precisely and in time with its speech. "Look at the diagram" with no target is the "general pointing" condition, which did nothing. Rules in §2.

### 1.13 Watching a diagram being drawn vs a static diagram (Fiorella & Mayer)

**Claim (dynamic drawing principle).** People learn more when the instructor draws the diagram while explaining than when the same explanation refers to an already-drawn diagram (Mayer, Fiorella & Stull 2020, ["Five ways…"](https://eric.ed.gov/?id=EJ1256250)). [V]

**Evidence.**
- **Fiorella & Mayer (2016), ["Effects of observing the instructor draw diagrams…"](https://doi.org/10.1037/edu0000065), *JEP* 108(4), a Doppler-effect video.** [V abstract]
  - Exp 1, full body visible: drawing beat static diagrams on transfer for **low-prior-knowledge learners (d = 0.58)** but not high-prior-knowledge ones (d = −0.24).
  - Exp 2, only the hand visible: drawing beat static (d = 0.35) regardless of prior knowledge.
  - **Exp 3, diagrams drawn without the hand visible: no benefit (d = −0.16).**
  - Exp 4: hand only was marginally better than full body (d = 0.36).
- Fiorella, Stull, Kuhlmann & Mayer (2019), ["Instructor presence in video lectures"](https://eric.ed.gov/?id=EJ1230834), a kidney lesson. [V]
  - Dynamic drawings with the instructor *not* visible beat static drawings (d = 0.54).
  - Eye contact through a transparent whiteboard helped (d = 0.54).
  - Simply seeing the instructor added nothing.
- Fiorella, Stull, Kuhlmann & Mayer (2020), ["Fostering generative learning from video lessons"](https://eric.ed.gov/?id=EJ1259094), N = 196. [V]
  - **Explaining after each part** beat drawing and re-watching.
  - Explaining was most effective after *instructor-generated* (dynamic) visuals (ds > 1.0) than after static ones (ds < 0.5).
  - Learner drawing after a diagram-heavy lesson was the weaker strategy.
- Related: meaningful animation gives g = 0.40 vs decorative animation −0.05 (Höffler & Leutner 2007, via Noetel). [V]

**Mechanism.** Progressive drawing applies temporal contiguity (each stroke arrives with its words), segmenting (one part at a time) and signaling (the moving pen is the cue), plus a social cue. The hand result is mixed: the 2016 Exp 3 showed no benefit without the hand, while the 2019 study found a benefit without the instructor visible. The safe reading is that a **visible moving drawing tip** probably matters, and a body or face does not.

**Boundary.**
- The benefit is clearest for novices.
- It costs time.
- All the evidence comes from one research group, a few short science lessons and immediate tests. This is moderate evidence, not a meta-analytic effect.

**Design rule.**
- **Build structural diagrams step by step, in sync with speech**, with a visible pen or cursor tip leading each stroke. This applies to stack frames, memory layouts, datapaths, circuits and pointer diagrams.
- Draw element by element. Each element gets a short spoken clause, so the drawing does not have to be animated stroke by stroke in real time.
- **Show complete, static diagrams** when the diagram is reference material the student already knows, or when it is shown for retrieval ("here's the frame you built yesterday; what changes now?").
- After a build, ask the student to **explain** it: "tell me what each slot is for". That was the strongest condition. Don't ask them to redraw it.

### 1.14 Learner-generated drawing and explaining (generative activity)

**Claim.** Asking students to generate (summarize, explain, draw, self-test, teach) improves transfer. Drawing helps when it is supported and is paired with explaining.

**Evidence.**
- Fiorella & Mayer (2016), ["Eight ways to promote generative learning"](https://doi.org/10.1007/s10648-015-9348-9), *Ed Psych Review*. [V abstract]
  - The eight strategies are summarizing, mapping, drawing, imagining, self-testing, self-explaining, teaching and enacting.
  - Their tabulated median effects are mostly around d = 0.4–0.8, with drawing about 0.4. [K for the numbers]
- Schwamborn et al. (2010), ["Drawing as a generative activity and drawing as a prognostic activity"](https://eric.ed.gov/?id=EJ906635). [V]
  - Drawing during reading improved transfer (d = 0.91).
  - **Drawing accuracy predicted learning outcomes (r = 0.57 for transfer).** Drawings are diagnostic.
- Fiorella & Kuhlmann (2020), ["Creating drawings enhances learning by teaching"](https://eric.ed.gov/?id=EJ1249841): drawing **while explaining aloud** beat explaining only (d = 0.99) and drawing only (d = 0.65), because it produced more elaborated explanations. [V]
- Lawson & Mayer (2021), ["Benefits of writing an explanation during pauses"](https://eric.ed.gov/?id=EJ1319446): generating explanations at segment breaks improved *delayed* (not immediate) tests. [V]
- Learner drawing needs support, such as partial drawings or templates, or students produce poor drawings (Van Meter & Garner 2005; Schmeck et al. 2014). [K]

**Design rule.**
- For spatial or structural knowledge, ask the student to draw *and talk*. Examples: memory boxes for `int *p = &a[1]`, a stack frame before and after `jal`, a two-gate circuit.
- Give a scaffold: an empty frame, labelled addresses, a partially drawn diagram.
- Treat the drawing as **assessment**. Its accuracy is a prognostic signal, so the director reads it.
- Don't ask a student to redraw what Plato just drew. Ask them to explain it, or to draw the *next state*.

---

## 2. Pointing and deixis: talking about a shared page

### 2.1 Pointing focuses joint attention and replaces location talk

**Claim.** When people share a visual space, pointing focuses attention faster than words do. Speakers then drop location descriptions. Pointing combined with a short verbal description resolves a reference best.

**Evidence.**
- Bangerter (2004), ["Using pointing and describing to achieve joint focus of attention in dialogue"](https://doi.org/10.1111/j.0956-7976.2004.00694.x), *Psychological Science*. When pairs could point, they relied on pointing and used fewer location descriptions, especially when close to the target. [V]
- Louwerse & Bangerter (2010), ["Effects of ambiguous gestures and language on the time course of reference resolution"](https://doi.org/10.1111/j.1551-6709.2010.01135.x), *Cognitive Science*. [V]
  - In eye tracking, even ambiguous pointing drew attention and sped up target identification.
  - Identification was **best when pointing and a verbal location description were combined.**
  - This held with **animated gestures and synthesized speech**, not only human video.
- Shared-workspace studies in CSCW give background [K]:
  - Clark & Krych (2004), *JML*: speakers watch the addressee's actions in a shared workspace and repair mid-utterance.
  - Kraut, Fussell & Siegel (2003) and Gergle, Kraut & Fussell (2004): a shared view lets partners use "this one" and finish faster with fewer words.

**Design rule.** A voice tutor with a shared page should talk the way people talk over a shared workspace:
- short deictic phrases ("this byte") plus a pointer;
- a brief description where it disambiguates ("this byte, the top one");
- watching the student's own marks on the page as the grounding signal.

### 2.2 Pointing while teaching improves learning, and specificity is what matters

**Evidence.**
- **Li, Wang, Mayer & Liu (2019)** ([ERIC](https://eric.ed.gov/?id=EJ1232776)), covered in §1.12. Pointing at the *specific* named component improved attention, retention and transfer, including at one week. General-direction pointing and beat gestures did not. [V]
- Pi, Hong & Yang (2017), [*BJET*](https://eric.ed.gov/?id=EJ1143150): an instructor's pointing gestures beat non-human cues and no cues, especially on dense slides. [V]
- Davis (2018), meta-analysis of agent gesturing: near transfer g = 0.39, retention g = 0.28. Effects were stronger when the agent's gestures served a signaling function (g = 0.28, k = 7, via Noetel). [V]
- Hostetter (2011), ["When do gestures communicate? A meta-analysis"](https://eric.ed.gov/?id=EJ916552), *Psych Bulletin*, 63 samples. [V]
  - Gestures give a **moderate** benefit to comprehension (d ≈ 0.6 [K for the number]).
  - The benefit is larger when gestures are **not fully redundant with speech**, when they depict motor actions, and for children.
- Dargue, Sweller & Jones (2019), ["When our hands help us understand"](https://doi.org/10.1037/bul0000202), *Psych Bulletin*, 83 samples: a moderate benefit. [V]
  - **Producing** gestures helped comprehension more than **observing** them.
- Alibali et al. (2014), ["How teachers link ideas in mathematics instruction using speech and gesture"](https://eric.ed.gov/?id=EJ1024930), *Cognition and Instruction*. [V]
  - Teachers express most **links between representations** multimodally, with speech plus pointing or depictive gestures.
  - They do this more for new material than review.
- Singer & Goldin-Meadow (2005) ([doi](https://doi.org/10.1111/j.0956-7976.2005.00786.x)) and Cook, Duffy & Fenn (2013) ([doi](https://doi.org/10.1111/cdev.12097)): teacher gesture helps learning and consolidation of math concepts, especially when it carries a second strategy. [V] These are child studies, so their transfer to university CS is unproven.
- Jarodzka et al. (2013), ["Learning to see"](https://eric.ed.gov/?id=EJ1003567): overlaying an expert's gaze (dot or spotlight) on video with the expert's narration guided attention and improved later unsupported performance. [V] This is pointing by gaze overlay.
- Prior knowledge: Johnson, Ozogul & Reisslein (2015) found signaling raised low-prior-knowledge learners to the level of high-prior-knowledge ones [V]. Richter et al. (2018) found dense integration signals hurt high-prior-knowledge learners [V].

**Strength of evidence.**
- *Signaling* in general is meta-analytic and robust: g ≈ 0.4.
- *Pointing specifically* rests on several RCTs plus Davis's small meta-analysis.
- Direct tests of a **disembodied pointer** (a cursor or hand icon, with no agent body) in **live tutoring** are scarce. Jarodzka's gaze overlay and Louwerse & Bangerter's animated gestures are the closest.
- Treat "specific beats general" as established and "hand-shaped pointer beats plain highlight" as plausible but unproven.

### 2.3 Timing pointing to speech

**Claim.** In natural speech, a pointing or iconic gesture starts **at or slightly before** the word it goes with, and stays on it through the phrase. Pointing that lags the word leaves the listener searching.

**Evidence.**
- McNeill (1992) and Morrel-Samuels & Krauss (1992): the gesture stroke tends to precede or co-occur with its "lexical affiliate". [K]
- Kappagantula et al. (2020), [*IEEE TLT*](https://eric.ed.gov/?id=EJ1248034): deictic gestures for an animated agent, generated automatically from keywords in the speech, were rated as well-timed as hand-scripted ones (N = 100). [V] This makes pointing from speech timestamps feasible.

**Design rule.**
- Fire the pointer **≈0–300 ms before the TTS reaches the referring word**, using word-level timestamps from the TTS stream.
- Hold it through the clause, then let it fade. Leave a light persistent highlight while that element remains the topic.
- If timestamps aren't available, point at the start of the sentence that names the element.

### 2.4 Design rules for how Plato points

1. **No unresolved deixis.** Every "this / here / that one / these bits" in Plato's speech is bound to a pointer event on a specific, addressable element. If the actor can't bind it, it says the full name instead ("the `lw` on line 3").
   - This needs page items with **addressable parts**: lines, tokens, bits, cells, rows, wires, and a register-table row.
   - The director's card lists the part IDs that the move may point at.
2. **Point specifically.** Point at the bit, the cell, the line or the token, never at "the diagram". General pointing did nothing in Li et al. (2019).
3. **Point and name.** Pair the pointer with a short verbal anchor ("this byte, the low one"). Pointing plus description beat either alone (Louwerse & Bangerter 2010).
4. **Use linking gestures for mappings.** When connecting two representations, point at A, then at B, or draw a connector, while saying the link: "this `x`… lives here, at `sp+8`". Teachers do this for new material (Alibali et al. 2014).
5. **Trace motion that speech can't carry.** Gestures help most when they add to speech (Hostetter 2011). Animate a token along a path: a value moving from memory to a register, the PC advancing, a carry rippling. This shows where and in what order, which words describe badly.
6. **Prefer a moving pointer with a human feel to a static arrow.** Use a pen tip or hand cursor travelling to the target. Human pointing beat non-human cues (Pi et al. 2017), and the visible hand mattered in drawing (Fiorella & Mayer 2016). This is plausible, not proven, for disembodied pointers, so A/B test it.
7. **Make the student point too.** Ask for deictic answers: "circle the sign bit", "tap the line where `ra` gets overwritten", "draw an arrow from `p` to what it points at". Producing gestures beat observing them (Dargue et al. 2019). These answers are fast, unambiguous for the director to grade, and robust to speech-recognition errors (§3.3).
8. **Fade signals with fluency.** For representations the student already reads fluently, point less and stop colour-linking. Dense signals can hurt high-prior-knowledge learners in some studies.
9. **Don't point while the student is working**, unless they ask or are stuck. A moving pointer pulls attention. During think time, the page stays still (§5).

---

## 3. Spoken dialogue tutoring: ITSPOKE, AutoTutor, spoken vs typed, ASR errors

### 3.1 ITSPOKE in one paragraph

ITSPOKE (Litman, Forbes-Riley et al., Pittsburgh) is a speech version of the Why2-Atlas qualitative-physics tutor.
- The student types an essay. ITSPOKE then runs a **system-initiative spoken dialogue** to fix misconceptions and draw out a fuller explanation, and the student revises the essay.
- The pipeline:
  - speech recognition (Sphinx2, later PocketSphinx);
  - semantic correctness classification;
  - separate binary detectors for uncertainty and disengagement, built on **prosodic, lexical and contextual features**;
  - Cepstral TTS, with each tutor turn also shown in a web interface.
- [V: Litman & Forbes-Riley 2005, [Interspeech PDF](https://people.cs.pitt.edu/~litman/p1427.pdf); Forbes-Riley & Litman 2014, [SIGDIAL W14-4324](https://aclanthology.org/W14-4324.pdf)]

### 3.2 Spoken versus typed tutoring

**Claim.** Speaking doesn't by itself make tutoring teach better. It changes the *shape* of the dialogue and its efficiency, and the content still dominates.

**Evidence.**
- **Human tutors.** Rosé, Litman et al. (2003), ["A comparison of tutor and student behavior in speech versus text based tutoring"](https://aclanthology.org/W03-0205.pdf). [V]
  - Spoken sessions had **more and shorter turns and more words in total**.
  - Students finished the same problems in **160 vs 371 minutes** (t(30) = 8.99, p < .01).
  - The ratio of student to tutor words didn't differ.
- Litman, Rosé, Forbes-Riley, VanLehn, Bhembe & Silliman (2006), "Spoken versus typed human and computer dialogue tutoring", *IJAIED* 16: 145–170. [K/S, check primary]
  - With human tutors, spoken tutoring was more efficient and showed larger gains than typed.
  - With the computer tutor (ITSPOKE vs typed Why2-Atlas), learning did **not** differ significantly.
- **AutoTutor.** D'Mello, Dowell & Graesser (2011), ["Does it really matter whether students' contributions are spoken versus typed…?"](https://eric.ed.gov/?id=EJ919598), *JEP: Applied*. [V]
  - A human wizard transcribed speech, removing ASR errors.
  - **Learning was equivalent** for spoken and typed input, and both beat a no-intervention control.
  - Session ratings didn't differ.
  - **Highly motivated learners reported lower cognitive load and learned more when typing.**
  - Earlier comparisons were confounded by ASR "with substantial error rates that were detected by learners".
- **AutoTutor's medium studies.** Nye, Graesser & Hu (2014), ["AutoTutor and family: a review of 17 years"](https://eric.ed.gov/?id=EJ1042132), report the importance "of content over surface features such as voices and persona of animated agents". [V] Graesser et al. (2003) compared print, speech, talking head, and head plus print and speech, and found that the dialogue content, not the medium, drove learning. [K]

**Design rule.**
- Voice buys **tempo and naturalness**: more exchanges per minute and easier elaboration. It does not buy learning by itself. The learning comes from *what each exchange asks the student to do*.
- Use speech for **explanations, reasons and predictions**, where talking is cheaper than typing and invites self-explanation.
- Use the **page** for **precise tokens**: numbers, hex, code and register names. The student writes, types or taps them.
- Let a student who prefers to write or type do so. Some learners, especially reflective and motivated ones, do better typing.

### 3.3 Speech-recognition errors

**Evidence.**
- Litman & Forbes-Riley (2005), ["Speech recognition performance and learning in spoken dialogue tutoring"](https://people.cs.pitt.edu/~litman/p1427.pdf), Interspeech. [V]
  - They used many ASR error measures: rejections and misrecognitions, word- and sentence-level, transcription and semantic.
  - **None correlated negatively with learning.**
  - **Some error types correlated negatively with dialogue efficiency.**
- ASR errors correlate negatively with **user satisfaction** in spoken dialogue systems, including tutors (Walker et al. 2000; Pon-Barry et al. 2004, cited in Forbes-Riley & Litman 2011, [W11-2024](https://aclanthology.org/W11-2024.pdf)). [V citing]
- **Misclassifying the user's state** is the bigger risk.
  - ITSPOKE's uncertainty adaptation improved learning when a hidden human labelled uncertainty, but **not** when the system labelled it automatically.
  - "Only a small proportion of users' actual uncertainty was being accurately classified" (Forbes-Riley & Litman 2011a, as summarised in [W11-2024](https://aclanthology.org/W11-2024.pdf)). [V]
  - Misclassified turns raised the chance of negative performance trajectories afterwards. [V]
- Learners notice ASR errors (D'Mello et al. 2011). [V]

**CS 3410 specifics** (inference, not from studies). The vocabulary is hostile to ASR:
- `a0` vs "a zero", `t0` vs "tea zero";
- hex (`0xFFFF_FFFE`), signed numbers ("minus three" vs "three"), "lw" vs "lou";
- C punctuation (`*p++`, `&a[1]`).

One misheard token can flip a correct answer to "wrong". A false negative verdict on a correct answer is the most damaging feedback error: it attacks the student's confidence and their trust in the tutor.

**Design rule.**
- Grade **meaning**, not exact wording. Tolerate disfluency.
- **When correctness depends on an exact token, get the token on the page.**
  - Ask for it written or typed, or show "I heard: −5" next to the question.
  - Only echo it aloud for confirmation when ASR confidence is low *and* the answer would be graded wrong.
- **Never deliver a negative verdict based on a low-confidence transcript.** Ask the student to repeat it or write it.
- Log ASR confidence and the n-best list for each student turn so evals can audit "wrong because misheard".

### 3.4 AutoTutor with speech, and affect-sensitive AutoTutor

- AutoTutor is a talking-head agent whose speech is produced by TTS. It runs **expectation–misconception tailored dialogue**: a main question, then pumps, hints, prompts, assertions and a summary. It produced learning gains across domains such as computer literacy, physics and critical thinking. [V: Nye et al. 2014]
- Spoken-input versions used ASR or a wizard (§3.2).
- Affect-sensitive versions added empathetic, motivational responses. Nye et al. report benefits from "adapting to the affect of low-knowledge learners". [V]
- D'Mello et al. (2010), "A time for emoting", found a supportive tutor helped low-knowledge learners mainly later in learning, and wasn't helpful early or for higher-knowledge learners. [K, check primary]

**Design rule.** Affect support is a **targeted** move for low-knowledge, struggling learners. It is not a default tone. Content and contingency come first.

---

## 4. Uncertainty and confusion in voice: signals, detection, responses

### 4.1 Signals available from speech and transcripts

| Signal | Where | What it indicates | Evidence | Reliability and caveats |
|---|---|---|---|---|
| **Hedges and epistemic markers** ("I think", "maybe", "probably", "I guess", "is it…?") | transcript | low feeling-of-knowing (FOK) | Smith & Clark 1993 [K]; part of ITSPOKE lexical features [V] | Cheap. Some speakers hedge by habit, so read against the student's own baseline. |
| **Answer phrased as a question, or rising final intonation** | prosody (ASR may add "?") | low FOK | Smith & Clark 1993; Brennan & Williams 1995 (listeners use it to judge another's knowing) [K] | **Uptalk** is also a floor-holding or politeness habit for many US speakers. Weak alone. |
| **Fillers** ("uh" = short delay, "um" = long delay), lengthening, restarts, self-repairs | transcript plus timing | the speaker announces a delay and often **wants to keep the floor** | Clark & Fox Tree 2002, [*Cognition*](https://doi.org/10.1016/s0010-0277(02)00017-3) [V] | A filler followed by a pause is **not** a turn end (§5). |
| **Response latency** (question end to answer onset) | timing | long: low FOK, or working; very short and wrong: guessing or disengagement | Smith & Clark 1993 [K]; engagement tracing by response time (Beck 2005) [K] | Depends on the task. Normalise by item type and the student's baseline. |
| **Prosody** (pitch, intensity, speaking rate, pauses at breath-group and turn level) | audio | uncertainty vs certainty | Liscombe, Hirschberg & Venditti 2005, ["Detecting certainness in spoken tutorial dialogues"](https://www.isca-archive.org/interspeech_2005/liscombe05_interspeech.html): **76.4% accuracy**, a 15.8% relative gain over baseline [V]; Pon-Barry 2013 thesis on prosody and certainty ([ERIC](https://eric.ed.gov/?id=ED552273)) [V] | Needs audio features. ElevenLabs may expose only text and timing, so check what the agent platform passes through. |
| **Dialogue context** (correctness, hints used, answer length, turn count) | dialogue log | confusion, frustration, boredom, flow | D'Mello et al. 2008, ["Automatic detection of learner's affect from conversational cues"](https://doi.org/10.1007/s11257-007-9037-6): each state vs neutral **68–78%** (chance 50%); 5-way 42% (chance 20%) [V] | Moderate accuracy. Useful as a prior. |
| **Explicit statements** ("wait, what?", "I'm lost", "I don't know") | transcript | confusion or impasse | — | Reliable but late, and some students never say it. |
| **Page behaviour** (idle pen, repeated erasing, undo loops, writing then deleting an answer) | page events | struggle or impasse | Bosch & D'Mello 2017, novice programmers: confusion and frustration **followed errors and preceded hint use** ([ERIC](https://eric.ed.gov/?id=EJ1126594)) [V] | Plato's page is a richer channel than voice alone. Log it. |
| **Disengagement cues** (flat monotone, sarcasm, off-task sounds, needless repetition, minimal answers) | audio and transcript | disengagement | ITSPOKE DISE labels (Forbes-Riley & Litman 2012, [W12-1630](https://aclanthology.org/W12-1630.pdf)) [V] | Human labellers agree only moderately: κ = 0.55 for disengagement and **0.62 for uncertainty**, vs 0.85 for correctness [V]. |

**Takeaway.**
- No single cue is reliable, and even trained humans agree only moderately on uncertainty.
- Combine cues: lexical, timing, prosody, correctness and page behaviour.
- Compare each student to their **own** baseline.
- Treat the result as a probability that the director weighs, not a switch the actor flips.

### 4.2 What responding to uncertainty does to learning

**Evidence.**
- **ITSPOKE uncertainty adaptation (Forbes-Riley & Litman 2011b, wizarded).** [V via W12-1630]
  - Uncertainty and incorrectness are both treated as **impasses**.
  - Uncertain answers, *even correct ones*, get explicit (in)correctness feedback ("Right"), a restatement of the correct answer, and then either a brief explanation of the reasoning (a "bottom out") or a remediation subdialogue that walks through the reasoning.
  - Result: **significantly higher learning gain than no adaptation (p = .001).**
- **Fully automated version (2011a).** No benefit, because automatic detection missed most real uncertainty. [V via W11-2024]
- **Automated disengagement plus uncertainty adaptation (Forbes-Riley & Litman 2014, [W14-4324](https://aclanthology.org/W14-4324.pdf)).** Task success improved over a non-adaptive control **only for male users**. Adapting to two states was no better than adapting to one. [V]
- **Disengagement adaptation (2012, wizarded, [W12-1630](https://aclanthology.org/W12-1630.pdf)).** [V]
  - Incorrect and disengaged: "productive interaction feedback", then an **easier fill-in-the-blank** version of the question.
  - Correct and disengaged: feedback, then a **progress report** graph.
  - Results: more motivation for users who got the adaptation most, the negative correlations of disengagement with learning and satisfaction were broken, less uncertainty, and less continued disengagement. Overall learning did not rise further.
- **Perceiving how much the student knows matters.** How accurately the system perceives the student's FOK predicts learning (Forbes-Riley & Litman 2009, [W09-3940](https://aclanthology.org/W09-3940.pdf)). [V]
- **Learning happens at impasses.** VanLehn et al. (2003), ["Why do only some events cause learning during human tutoring?"](https://eric.ed.gov/?id=EJ675271): when students were not at an impasse, explanations rarely produced learning; at an impasse, they sometimes did. [V] Uncertainty marks an impasse.
- **Feedback on low-confidence correct answers.** Butler, Karpicke & Roediger (2008), ["Correcting a metacognitive error"](https://doi.org/10.1037/0278-7393.34.4.918): feedback **doubled retention of correct but low-confidence answers**. [V]
- **High-confidence errors are hypercorrected.** Butterfield & Metcalfe (2001), [*JEP:LMC*](https://doi.org/10.1037//0278-7393.27.6.1491): errors made with high confidence were the *most* likely to be fixed after corrective feedback. [V]

**Design rule: certainty is a second axis next to correctness.**

| | Certain | Uncertain |
|---|---|---|
| **Correct** | Confirm in a word and move on, or raise difficulty. Don't over-explain. | **Confirm explicitly and close the gap.** Either one sentence of *why*, or ask "why does that work?". If the student can say why, the uncertainty is resolved. (ITSPOKE adaptation; Butler et al. 2008) |
| **Incorrect** | **Hypercorrection moment.** Give a clear verdict, contrast the student's model with the correct one *on the page* (run it, show it), then give a near-transfer item. | **Impasse.** Start the hint ladder at the student's level. Don't just tell. Watch for frustration (§6). |

- **Asymmetric errors.** A false "uncertain" costs one extra sentence or a "why?", which is cheap. A false "incorrect" verdict is expensive. So the uncertain-correct response should stay light. The heavy remediation is for incorrect answers.
- **Detection lives in the director.** The actor passes up raw features: latency in ms, hedge and filler tokens, self-repairs, prosody if available, and page events. The director combines them with correctness and the student's baseline.
- **Elicit when unsure.** When the signals are ambiguous and the item matters, ask for the reasoning ("talk me through it") rather than "how confident are you?". Reasoning is generative *and* diagnostic. Ask for an explicit confidence rating only occasionally, for calibration.
- **Validate before trusting.** Before using automatic uncertainty labels for heavy adaptation, measure their agreement with human labels on Plato's own transcripts. ITSPOKE's gains disappeared when detection was poor.
- **Disengagement.**
  - If wrong and disengaged: one line to re-engage, then an **easier fill-in-the-blank** version of the question.
  - If right and disengaged: show progress on the page and raise the challenge.

---

## 5. Wait time, think time and silence

### 5.1 Classroom wait time (Rowe, Tobin, Stahl)

**Claim.** Teachers leave about 1 s after a question, and about 1 s after a student's answer before reacting. Stretching both pauses to **3–5 s** improves the quantity and quality of student thinking.

**Evidence.**
- Rowe (1972/1974), ["Wait-time and rewards as instructional variables"](https://eric.ed.gov/?id=ED061103). Elementary science teachers waited on average **1 s** for a response and commented on the answer within **0.9 s**. [V]
- With both waits extended to 3–5 s, the following increased:
  - the length of responses;
  - unsolicited appropriate responses;
  - student confidence;
  - speculative responses;
  - evidence–inference statements;
  - student questions;
  - responses from "slow" students.
- At the same time, failures to respond went down, teacher questioning became more flexible, and teachers' expectations of "slow" students changed. [V]
- Rowe (1987), ["Wait time: slowing down may be a way of speeding up"](https://eric.ed.gov/?id=EJ351827). [V]
- Tobin (1986), [*AERJ*](https://eric.ed.gov/?id=EJ351719): teachers trained to keep a **3–5 s** average wait time in maths and language arts had higher achievement and better discourse. [V]
- Tobin (1987), ["The role of wait time in higher cognitive level learning"](https://eric.ed.gov/?id=EJ371356), *RER*: wait time of 3 s or more fosters higher-level learning by giving both teacher and student time to think. [V]
- Stahl (1994), ["Using 'think-time' and 'wait-time' skillfully"](https://eric.ed.gov/?id=ED370885), coined "think time". Positive effects appear "after at least three seconds of uninterrupted silence". He names 8 kinds of silence, including:
  - post-question wait time;
  - **pause time within a student's response**;
  - **wait time after a student's response**;
  - **student task-completion work time**;
  - an "impact pause" after an important statement. [V]
- **Critique.** Ingram & Elliott (2016), [*Cambridge J. Education*](https://eric.ed.gov/?id=EJ1089516), take a conversation-analysis view. Longer wait time changes classroom interaction norms in mixed ways, and "maintaining extended wait times may not be desirable". The context of the question matters. [V]

**Evidence quality.** Mostly correlational and quasi-experimental classroom studies from the 1970s and 80s, mostly K-12, with whole-class questioning. The direction is consistent. No study tests wait time for a 1:1 voice AI tutor with university students. The 3–5 s figure is for *recall-level classroom questions*. Reasoning tasks need far longer.

### 5.2 Why voice agents rush: conversational norms

- Stivers et al. (2009), ["Universals and cultural variation in turn-taking in conversation"](https://doi.org/10.1073/pnas.0903616106), *PNAS*: across 10 languages, speakers **minimise silence between turns and avoid overlap**. Average gaps in all languages fall within 250 ms of the cross-language mean [V]. Typical gaps are about 0–200 ms [K].
- Long gaps before a response are heard as **trouble or a dispreferred answer**. Listeners begin to read silence as trouble at around 0.6–0.7 s, and Jefferson proposed about 1 s as a "standard maximum". (Roberts, Francis & Morgan 2006; Kendrick & Torreira 2015; Jefferson 1989) [K]
- "Um" and "uh" announce a delay and are used **to keep the floor** (Clark & Fox Tree 2002). [V]
- Spoken dialogue systems that end the turn on silence alone cut users off. Pauses *within* a turn are often longer than gaps *between* turns, so better endpointing uses prosodic and syntactic completeness (Skantze 2021, review, *Computer Speech & Language*). [K]

**The tension.** Conversation pushes Plato to fill silence within a second. Pedagogy says that after a real question **the silence belongs to the student**. A voice tutor has to break conversational habit on purpose and make the silence feel intended, not like a dropped call.

### 5.3 Talking while working: think-aloud is safe, explaining helps

Fox, Ericsson & Best (2011), ["Do procedures for verbal reporting of thinking have to be reactive?"](https://doi.org/10.1037/a0021663), *Psych Bulletin*, 94 studies. [V]
- **Thinking aloud doesn't change accuracy** (r = −.03), but it makes tasks take longer.
- **Explaining or describing does change performance, for the better.**

So inviting "talk me through it as you go" is harmless and gives Plato data. Asking for explanations helps learning (the self-explanation effect).

### 5.4 Design rules for silence

1. **End the turn on the question, then stop.** The question is the last sentence. Nothing follows it, not "take your time" and not a second question. Ask one question at a time.
2. **Wait time I, after Plato asks.** No re-asking, rephrasing, hinting or encouragement before:
   - **≥3 s** for recall or recognition ("which register holds the return address?");
   - **≥8–10 s** for a reasoning or prediction question;
   - **open-ended work time** for a computation or construction task (decode this hex, fill in this frame, trace this loop) while the page shows activity.

   These numbers start from Rowe and Tobin, scaled up by inference for harder items. Tune them per student from the learner model's latency baseline.
3. **Wait time II, after the student answers.** Leave about **1–2 s** before evaluating. It gives the student room to self-correct or add to the answer.
   - Never jump in after a turn that ends in a filler ("um…"), a conjunction ("so…", "because…"), "wait" or a trailing pitch. Treat those as **not finished**.
   - Configure end-of-turn detection to use these cues, not silence alone.
4. **Silent work is not a gap.** While the student is writing or drawing (page events arriving):
   - Plato says nothing.
   - The page stays still: no pointer moves, no new items.
   - The director may think in the background.
5. **Silence escalation ladder.** Applies when there is no speech *and* no page activity:
   - **About 15–20 s** on a reasoning item: one light, content-free check, such as "Still thinking, or want a nudge?", or an invitation to think aloud.
   - **About 30–45 s more**: offer the first hint rung, pointing at where to look.
   - **Never** more than one check per silence. Never narrate the wait ("I'll give you some time…").
   - The timings are heuristics to calibrate in evals and with the student's baseline. No study gives them.
6. **Plato's own thinking time is different.** After the *student* speaks, dead air reads as trouble after about 1 s.
   - If the director needs more than about 1.5 s (`think()`), the actor says a short holding line or makes a visible page action. For example, "Let me look at what you wrote", with the pointer moving to the student's work.
   - Visible action on the page buys silence without words.
7. **Impact pause.** After a key statement, such as the punchline of a derivation, pause about 1 s before the next sentence. Stahl recommends this. The evidence is weak, but it costs nothing.
8. **Invite think-aloud on hard items.** Say "Talk me through it as you go" once at the start of a multi-step task. Don't demand it, since it slows the student. It turns silence into signal (§4).

---

## 6. Affect: productive confusion vs boredom and frustration

### 6.1 Evidence

- **Dynamics model.** D'Mello & Graesser (2012), ["Dynamics of affective states during complex learning"](https://eric.ed.gov/?id=EJ950444). [V]
  - Engagement turns to **confusion** at an impasse.
  - If the impasse is resolved, the learner returns to engagement.
  - If it isn't, confusion becomes **frustration**, and lasting frustration becomes **boredom**.
  - In 32–35 min AutoTutor sessions, the time series showed confusion–engagement, confusion–frustration and frustration–boredom oscillations.
- **Correlations with learning.** Craig, Graesser, Sullins & Gholson (2004), ["Affect and learning…AutoTutor"](https://eric.ed.gov/?id=EJ719229): confusion and flow correlated **positively** with learning, boredom **negatively**. [V]
- **Persistence.** D'Mello & Graesser (2011), ["The half-life of cognitive-affective states"](https://doi.org/10.1080/02699931.2011.613668): boredom, engagement/flow and confusion are **persistent**; delight and surprise are fleeting; frustration is in between. [V]
- **Boredom is the worst state.** Baker, D'Mello, Rodrigo & Graesser (2010), "Better to be frustrated than bored", *IJHCS*: boredom is persistent, goes with poorer learning and gaming the system, and is worse than frustration. [K]
- **Confusion helps only when it is resolved.**
  - Lehman et al. (2013), ["Inducing and tracking confusion with contradictions"](https://eric.ed.gov/?id=EJ1190004): contradictions staged between agents induced confusion. Contradictions **alone** didn't raise learning. **When confusion was successfully induced,** learners with contradictions learned more than controls. [V]
  - D'Mello, Lehman, Pekrun & Graesser (2014), "Confusion can be beneficial for learning", *L&I*: same conclusion, provided confusion is resolved and scaffolded. [K]
  - Lehman, D'Mello & Graesser (2012): help learners manage confusion "productively instead of being hopelessly confused". [V]
- **Novice programmers.** Bosch & D'Mello (2017), [*IJAIED*](https://eric.ed.gov/?id=EJ1126594), Python. [V]
  - The common states were engagement, confusion, frustration, boredom and curiosity.
  - **Confusion and frustration followed errors and preceded hint use.**
  - Boredom (r = −.15) and frustration (r = −.22) correlated negatively with learning.
  - Back-and-forth transitions between confusion and frustration correlated positively (r ≈ .10), as did boredom → engagement (r = .28).
- Lee et al. (2011), novice Java programmers: **prolonged** confusion was associated with lower achievement; resolved confusion was not. [K]
- **Struggle before instruction can pay off.** Sinha & Kapur (2021), ["When problem solving followed by instruction works"](https://eric.ed.gov/?id=EJ1308129), *RER*, 53 studies: solving problems *before* instruction beat instruction-first, **g = 0.36**, and g = 0.37–0.58 with high-fidelity productive-failure design. The effect reversed for young children and domain-general skills. [V]
- **Learning happens at impasses** (VanLehn et al. 2003). [V]
- **How much to help remains open.** Koedinger & Aleven (2007), ["Exploring the assistance dilemma"](https://eric.ed.gov/?id=EJ785065): when to give and when to withhold help is "a fundamental open problem". [V]

### 6.2 Design rules: when to let confusion run, when to step in

**Let it run while it is productive.** Signs:
- the student is making new attempts (page events, new partial answers);
- they are reasoning aloud or self-correcting;
- their latency is long but their output is changing;
- the confusion is about the **target idea**, such as why the top bit weighs −8.

During this time, Plato stays quiet or gives at most a "keep going" backchannel.

**Step in promptly when any of these holds.**
1. **Frustration:** the same error repeated, negative self-talk ("I'm just bad at this"), sighs, giving up, a rising pitch of irritation.
2. **Stagnation:** no new attempt for about 30–60 s on a step (heuristic; see §5.4).
3. **Confusion about something off-target.** A missing prerequisite, unfamiliar notation, or a misheard question is unproductive struggle. Fix it at once with a direct tell.
4. **Boredom or disengagement:** minimal answers, flat voice, off-task talk. Change the activity, raise the challenge or the relevance, or hand control to the student. Do *not* add entertainment, which breaks coherence.

**How to step in.**
- Make the smallest contingent move first: **point at where to look** (§2) or ask a narrower question.
- Then follow the hint ladder from the sibling brief.
- For low-knowledge learners, a short normalising line is allowed ("this one trips everybody up"). Skip it for strong students.

**Close the loop.** After resolution:
- **name what the confusion was** ("so the snag was treating the top bit as a sign flag, but it's a weight");
- give a near-transfer item while it is fresh.

Confusion without resolution is just a bad experience.

**Induce confusion deliberately, but rarely.**
- Use prediction and contradiction: "predict what this prints", then run it in the C sandbox, or "your rule says X; what about this case?".
- Only do it when the prerequisites are in place.
- Always follow it with resolution and explanation (productive failure needs the instruction phase).

---

## 7. Feedback and praise

### 7.1 Evidence

- **Kluger & DeNisi (1996),** *Psych Bulletin* 119: 254–284, a meta-analysis of feedback interventions. [K; mechanism also via Shute]
  - Mean effect d ≈ 0.41, but **over a third of effects were negative**.
  - Feedback that pulls attention to the **self** (praise, criticism of the person) weakens or reverses the effect.
  - Feedback about the task and how to do it right strengthens it.
- **Hattie & Timperley (2007),** ["The power of feedback"](https://eric.ed.gov/?id=EJ782448), *RER*: feedback is powerful but variable. [V abstract]
  - It answers three questions: *Where am I going? How am I going? Where to next?*
  - It works at four levels: task, process, self-regulation and self.
  - **Self-level feedback (praise) is the least effective.** [K for the level details]
- **Wisniewski, Zierer & Hattie (2020),** ["The power of feedback revisited"](https://doi.org/10.3389/fpsyg.2019.03087), 435 studies: **d = 0.48**, highly heterogeneous. Effects are moderated by **information content**, with high-information feedback the most effective. [V; "high-information" number K]
- **Van der Kleij, Feskens & Eggen (2015),** [computer-based feedback meta-analysis](https://eric.ed.gov/?id=EJ1081708), *RER*. [V]
  - **Elaborated feedback g = 0.49** > knowledge of correct response 0.32 > right/wrong only **0.05**.
  - Elaborated feedback's advantage was largest for **higher-order** outcomes.
  - Delayed timing was associated with smaller effects. The trend favoured immediate feedback for lower-order outcomes and delayed for higher-order, but the interaction was not significant.
- **Kulik & Kulik (1988),** ["Timing of feedback and verbal learning"](https://eric.ed.gov/?id=EJ375720): in applied classroom studies **immediate** feedback was better; in lab studies of learning test content, delayed was better. [V]
- **Shute (2008),** ["Focus on formative feedback"](https://eric.ed.gov/?id=EJ787077), *RER*; guideline tables read in the [ETS report version](https://files.eric.ed.gov/fulltext/EJ1111586.pdf). [V]
  - **Do:**
    - focus on the task, not the learner;
    - give **elaborated** feedback (what, how, why) in **manageable units**;
    - be specific and clear;
    - keep it "as simple as possible but no simpler";
    - reduce uncertainty about the gap to the goal;
    - promote a learning-goal orientation;
    - give feedback **after** the learner has attempted a solution.
  - **Avoid:**
    - normative comparisons and overall grades;
    - discouraging feedback;
    - **praise "sparingly, if at all"**;
    - **"try to avoid delivering feedback orally"**, which is less neutral (from Kluger & DeNisi);
    - **interrupting a learner who is actively engaged**;
    - **progressive hints that always end in the answer**;
    - text-only feedback;
    - extensive error diagnosis.
  - **Timing:**
    - immediate feedback for difficult new tasks, for procedural and conceptual retention, and for low achievers;
    - delayed feedback for simple tasks, for transfer, and for high achievers.
  - **Learner:**
    - low achievers get directive or corrective feedback, scaffolding, and the correct response plus elaboration;
    - high achievers get facilitative feedback (hints, cues), and verification may be enough.
- **Praise.**
  - Mueller & Dweck (1998), ["Praise for intelligence can undermine…"](https://doi.org/10.1037//0022-3514.75.1.33). Fifth graders praised for intelligence, compared with those praised for effort, afterwards:
    - preferred performance goals;
    - persisted less after failure, enjoyed the task less and performed worse;
    - saw intelligence as fixed. [V]
  - **Replication caveat.** Li & Bates (2019), [*JEP: General*](https://doi.org/10.1037/xge0000669), n = 624. A close replication found no effect on Mueller & Dweck's 8 motivation and attribution measures, and two further studies were null. [V] The *person vs process* effect is fragile, and it has barely been tested with university students.
  - Henderlong & Lepper (2002), [*Psych Bulletin* review](https://doi.org/10.1037/0033-2909.128.5.774). Praise helps motivation when it is **sincere**, attributes success to **controllable causes**, supports **autonomy**, avoids **social comparison**, and conveys **attainable standards**. [V]
- **Confidence and feedback** (§4.2): high-confidence errors are hypercorrected, and feedback doubles retention of low-confidence correct answers. [V]

### 7.2 Design rules for feedback and praise

1. **Verdict first, plainly, in a few words.** Say "Yes, that's it." or "Not quite." before anything else. Don't make the student decode a hedged verdict.
2. **Then one unit of elaboration: the why, aimed at the spot.**
   - Point at the exact token, bit or line (§2) and say *why* it's right or wrong in at most 1–2 sentences.
   - Then hand back with a question or task.
   - Right/wrong alone does almost nothing (g ≈ 0.05).
3. **Let the artefact give the verdict where possible.**
   - Run the code in the C sandbox, step the RISC-V stepper, compute the value on the page.
   - The tool supplies the neutral, objective verification. Plato's voice supplies the explanation.
   - This answers Shute's "avoid oral feedback" and limits LLM grading errors.
4. **Feedback goes to the task and process, never the person.** No "you're smart" or "you're a natural". No "most students get this" (normative). No grades.
5. **Timing follows the learner and the task.**
   - For a **new or difficult** procedure, or a struggling learner, give step-level feedback immediately.
   - For a **fluent** learner or a **transfer** problem, let them finish and self-check first ("check it against the range of a 4-bit signed number"), then give feedback.
   - Never interrupt active work to correct an early step unless the error will make the rest of the work pointless.
6. **No answers before attempts. Hints don't automatically bottom out.** The student makes the final step, even after the strongest hint (sibling brief, help ladder).
7. **Use praise rarely, specifically, and only for process.**
   - Name the move that worked: "checking the sign bit first is exactly what caught that".
   - Generic praise ("great job!") on every turn is noise and draws attention to the self.
   - Process-vs-person evidence in adults is weak, but nothing supports person praise, and self-focused feedback can hurt. Process praise is the safe default.
8. **Use confidence.**
   - Confidently wrong: make the contrast vivid and concrete, because this is the best moment to fix a misconception.
   - Unsure but right: confirm and add one sentence of why.
9. **Use a warm style without a soft verdict.**
   - Use a polite, collaborative frame ("let's check the top bit").
   - Keep the correctness unambiguous.

---

## 8. Design rules by dimension (quick reference)

The hooks refer to today's actor tools and card fields (`board`, `say`, `ask`, `point`, `point_to`, `think`, `collect_page_work`).

| Dimension | Rule | Evidence anchor |
|---|---|---|
| **What Plato says vs what the page shows** | Speech carries explanation, reasons, links, structure words ("first", "so", "because") and the verdict. The page carries what must persist: code, numbers, addresses, definitions, the exact question, key-term labels (2–3 words) on the diagram, and the student's own work. Plato doesn't read the page aloud. The chat log is not a live verbatim caption over diagrams. | Modality, redundancy, transient information (§1.3, §1.6, §1.8) |
| **When a visual appears** | At the moment Plato first speaks about it (±0.5 s), never seconds before in silence and never after the explanation. Remove or fade items when the move is done. | Temporal contiguity, coherence (§1.1, §1.5) |
| **When it is drawn step by step** | Build progressively, element by element with a visible pen tip and a clause of speech per element, when the diagram is **structural and new to this student** (frame, memory layout, datapath, circuit, pointer diagram). Show it whole when it is known reference material or a retrieval cue. After a build, ask the student to explain it, not redraw it. | Dynamic drawing (§1.13), pre-training (§1.7), generative activity (§1.14) |
| **How Plato points** | Point at specific, addressable anchors (bit, cell, line, token, row, wire), never "the diagram". Every spoken deictic is bound to a pointer. The pointer lands 0–300 ms before the referring word and holds through the clause. Use two-point linking for mappings, and traced motion for data or control flow. Fade pointing for fluent students. Ask the student to point too. | Li et al. 2019; Louwerse & Bangerter 2010; Alibali et al. 2014; Dargue et al. 2019 (§2) |
| **Pacing and segmenting** | One idea per segment: 2–4 sentences (about 10–25 s), then hand the turn back with a generative prompt or a visible step. The director sets segment boundaries. "Wait", "again" and "go on" are obeyed at once. Pre-train part names before many-part processes. | Segmenting (§1.6), pre-training (§1.7) |
| **How long it stays silent** | End the turn on the question and stay silent: ≥3 s for recall, ≥8–10 s for reasoning, open-ended work time while the page is active. Leave 1–2 s after a complete answer before judging. Never take the turn on a filler or a trailing clause. Silence ladder: one content-free check after about 15–20 s with no activity, then the first hint rung after about 30–45 s more. On Plato's side, no dead air longer than about 1.5 s after the student speaks. | Rowe, Tobin, Stahl, Clark & Fox Tree, Stivers (§5) |
| **Detecting and responding to uncertainty** | Combine hedges, fillers, latency against the student's baseline, rising pitch (weak), self-repairs, page behaviour and correctness. The director decides. Respond on two axes: unsure + right → confirm with one line of why, or ask why; sure + wrong → vivid contrast on the page; unsure + wrong → hint ladder. Validate the detector against human labels before relying on it heavily. | ITSPOKE (§4.2); Butler et al. 2008; Butterfield & Metcalfe 2001 |
| **Feedback and praise** | Verdict first (a few words), then one why aimed at the spot, then hand back. Let the sandbox or stepper verify where possible. Use immediate step feedback for new or hard material and novices; for fluent students, let them finish and self-check. Praise is rare, specific and about the process. No person praise, no comparisons, never interrupt engaged work. | Shute 2008; Van der Kleij 2015; Kluger & DeNisi 1996; Mueller & Dweck 1998 with caveat (§7) |

---

## 9. Stage directions for the actor and the page

These are crisp rules for the actor prompt and the page runtime. Each cites its evidence and, where useful, a hook in the card or tools.

1. **Say the meaning; show the thing.**
   - Explanations, reasons and links are spoken.
   - Code, numbers, addresses, definitions and the exact problem live on the page.
   - Any question that contains a number, hex, code or more than one clause is **written on the page**, and Plato says the short form.
   - *Modality and transient information: Ginns 2005; Reinwein 2012; Leahy & Sweller 2011.*
2. **Never read the page aloud.**
   - Speak at most about 3 words of any visible text, and only as an anchor for pointing ("this `lw`…").
   - Everything else Plato says adds meaning the page doesn't have.
   - *Redundancy: Adesope & Nesbit 2012; Mayer & Johnson 2008.*
3. **Show it as you say it.**
   - A board item appears, or its highlight starts, within about 0.5 s of its first mention.
   - Never talk over an empty or still-loading page. Wait for the render.
   - *Temporal contiguity g = 0.78: Ginns 2006.*
4. **Build what's new; show whole what's known.**
   - The first time *this student* meets a structural diagram, it is drawn element by element with a visible pen tip, one spoken clause per element.
   - Diagrams the student already knows appear complete.
   - *Fiorella & Mayer 2016; Fiorella et al. 2019, 2020.*
5. **Labels go on the thing.**
   - Values, notes and key terms sit on or beside their referent.
   - Two representations being mapped sit side by side and line-aligned, such as C next to its assembly, or variables next to the memory column.
   - *Spatial contiguity g = 0.63: Schroeder & Cenkci 2018.*
6. **Only what this move uses.**
   - No decoration, no avatar face, no fun-fact panels.
   - Fade finished items.
   - Plato's only "body" on screen is its pointer and pen.
   - *Coherence: persistent seductive details g = 0.43, Sundararajan & Adesope 2020; image principle, Wang et al. 2018.*
7. **Every "this" gets a point, and the point is specific and early.**
   - Each spoken deictic ("this", "here", "that bit", "these two") triggers `point_to` on an **element-level anchor**: a bit, cell, line, token or row.
   - The pointer lands 0–300 ms before the word and holds through the clause.
   - If the actor can't bind an anchor, it names the thing fully instead ("the `lw` on line 3").
   - *Li et al. 2019; Louwerse & Bangerter 2010; gesture–speech timing.*
8. **Link with two points; trace what moves.**
   - When relating two representations, point at A, then B, or draw the connector, during the linking sentence.
   - When data or control moves, animate its path rather than describing the route.
   - *Alibali et al. 2014; Hostetter 2011, where gestures help most when not redundant with speech; meaningful animation g = 0.40.*
9. **Name the parts first.**
   - Before a process with many parts (the calling convention, the datapath, a stack frame), give a labelled "meet the parts" segment of 60 s or less with one quick check.
   - Skip it if the learner model shows the names are known.
   - *Pre-training: Mayer, Mathias & Wetzell 2002.*
10. **One idea per breath.**
    - Speak at most about 4 sentences (about 25 s) continuously, then hand the turn back with a *generative* prompt ("what goes in this slot?") or a visible step.
    - Never close with "make sense?".
    - "Wait", "again" and "go on" are obeyed at once.
    - *Segmenting g = 0.34–0.41: Rey et al. 2019; transient information.*
11. **End on the question, then be silent.**
    - One question per turn, as the last sentence, with nothing after it.
    - *Rowe 1974; turn-taking norms.*
12. **Hold the silence.**
    - After asking, say nothing for at least **3 s** on recall and **8–10 s** on reasoning.
    - On work tasks, allow open-ended time while the page shows activity.
    - Inside that window, no rephrasing, hints or "take your time".
    - *Rowe 1972/1974; Tobin 1986, 1987; Stahl 1994.*
13. **Don't take the turn early.**
    - A student turn that ends in "um", "uh", "so…", "because…", "wait" or a trailing clause isn't finished.
    - After a complete answer, leave about 1–2 s before judging.
    - *Clark & Fox Tree 2002; wait time II.*
14. **Silent work belongs to the student.**
    - While the student writes or draws, Plato is silent and the page is still.
    - With no speech and no page activity for about 15–20 s, one content-free check ("still thinking, or want a nudge?").
    - About 30–45 s later, the first hint rung, given by pointing at where to look.
    - At most one check per silence.
    - *Shute 2008, guideline 15: don't interrupt an engaged learner. The timings are heuristics to calibrate.*
15. **No dead air on Plato's side.**
    - If Plato's reply needs more than about 1.5 s (`think`), use a short holding line or a visible page action, such as the pointer moving to the student's work.
    - *Stivers et al. 2009: conversational gaps are short, and long ones signal trouble.*
16. **Hear certainty, not just correctness.**
    - Unsure + right: confirm explicitly, then one line of why, or ask "why does that work?".
    - Sure + wrong: give a clear verdict and a vivid contrast **shown on the page**.
    - Unsure + wrong: start the hint ladder at the student's level.
    - The actor reports latency, hedges, fillers and repairs. The director decides.
    - *ITSPOKE, Forbes-Riley & Litman 2011; Butler et al. 2008; Butterfield & Metcalfe 2001.*
17. **Verdict, why, hand back.**
    - "Not quite" or "Yes": the verdict comes first and is unambiguous.
    - Then at most 2 sentences of why, aimed at the error's location with the pointer.
    - Then a question or task.
    - Let the C sandbox or RISC-V stepper supply the verification when it can.
    - *Elaborated feedback g = 0.49 vs right/wrong 0.05, Van der Kleij et al. 2015; Shute 2008.*
18. **Feedback timing follows the learner.**
    - New, hard material or a struggling student: immediate, step-level feedback.
    - A fluent student or a transfer problem: let them finish and self-check, then give feedback.
    - *Shute 2008, Tables 4–5; Kulik & Kulik 1988.*
19. **Praise the move, not the mind, and rarely.**
    - Only specific process praise ("checking the range first caught it").
    - Never "smart", "natural" or "genius", no stream of "great job!", no "most students…".
    - *Kluger & DeNisi 1996; Mueller & Dweck 1998, with the Li & Bates 2019 caveat; Henderlong & Lepper 2002.*
20. **Never mark wrong on a shaky transcript.**
    - When correctness depends on exact tokens (numbers, hex, register names, code), the answer goes on the page, or the actor echoes "I heard −5".
    - With low ASR confidence, ask again rather than judge.
    - *Litman & Forbes-Riley 2005; state misclassification undoes adaptation, Forbes-Riley & Litman 2011a.*
21. **Let productive confusion run, and close it.**
    - Stay quiet while the student is still making attempts.
    - Step in on frustration, stagnation, off-target confusion (a prerequisite or notation) or boredom.
    - After resolution, name what the snag was and give a near-transfer item.
    - *D'Mello & Graesser 2012; Lehman et al. 2013; Bosch & D'Mello 2017; Sinha & Kapur 2021.*
22. **Make the student point, draw and explain.**
    - Prefer answers given by circling, tapping or drawing on a scaffold (an empty frame, labelled boxes), with the student explaining while drawing.
    - Treat the drawing as evidence for the director.
    - *Dargue et al. 2019; Fiorella & Kuhlmann 2020; Schwamborn et al. 2010.*

---

## 10. What the evals should measure

**Logging prerequisites.** Most checks are automatic if the session log has timestamps for each of these:
- TTS word timings;
- `point_to` events with the resolved **anchor id** and its granularity;
- board item render and highlight events;
- student page events (strokes, typing, erasing);
- VAD speech start and end;
- ASR text, confidence and n-best list;
- card metadata: item type (recall, reasoning or work), first exposure of a diagram, and whether the move maps two representations.

Under the no-ElevenLabs rule, the local stand-in actor must emit **estimated word timings**, for example at about 150 wpm. The simulated student must produce **hedges, fillers, latencies, trailing clauses and silent-work periods** on cue.

| # | Check (stage direction) | Metric | How | Target |
|---|---|---|---|---|
| E1 | Persistence (1) | % of Plato questions containing a number, hex, code or ≥2 clauses whose text is visible on the page when asked | auto: regex + page state | ≥95% |
| E2 | **Read-aloud** (2) | % of Plato utterances sharing a ≥5-word contiguous n-gram with visible page text (normalised; code tokens excluded) | auto | ≈0% |
| E3 | Show–say sync (3) | lag between item render or highlight and first spoken mention; % with lag above 1 s; talking over an empty or loading page | auto | median under 0.5 s; empty-page talk = 0 |
| E4 | Build vs whole (4) | for first-exposure structural items: built in ≥3 synced steps? for known items: shown whole? | auto + judge | ≥90% correct choice |
| E5 | Contiguity (5) | annotation-to-anchor distance; for mapping moves, are both representations visible at once? | auto (layout) | ≥95% |
| E6 | Coherence (6) | % of items on the page during a move that are never spoken about or pointed at; count of decorative items | auto | under 10%; 0 decorative |
| E7 | **Deixis binding** (7) | % of spoken deictics with a `point_to` within ±1 s; % of `point_to` targets that are element-level vs whole-item | auto (+ judge for spatial "it") | ≥95% bound; ≥90% element-level |
| E8 | Point timing (7) | pointer onset minus referring-word onset | auto | median −150 ms; 90% within [−500, +200] ms |
| E9 | Linking and tracing (8) | in mapping moves, both representations pointed at during the linking sentence; in flow moves, a traced path | auto + judge | ≥80% |
| E10 | Pre-training (9) | in many-part process moves at first exposure, parts named and shown before the process explanation; skipped when known | judge | ≥80% |
| E11 | **Monologue length** (10) | seconds and sentences of continuous Plato speech; % of turns over 25 s or 4 sentences; % of segments ending in a generative prompt vs "make sense?" or "any questions?" | auto + lexicon | under 10% long; "make sense?" ≈ 0 |
| E12 | Question placement (11) | % of question turns where the question is the last sentence; % of turns with ≥2 questions | auto | ≥95%; under 5% |
| E13 | **Wait time I** (12) | time from end of Plato's question to Plato's next speech when the student hasn't spoken; re-asks or hints inside the window | auto by item type | 0 violations under 3 s (recall) or 8 s (reasoning) |
| E14 | **Cut-ins** (13) | % of Plato turn-starts within 1 s of a student segment ending in a filler, conjunction, "wait" or trailing clause; overlap with student speech | auto | under 2% |
| E15 | Silent work (14) | Plato utterances and pointer moves while the page is active; time to the first check during inactive silence; checks per silence | auto | 0 during activity; ≤1 check per silence |
| E16 | Dead air (15) | % of student turn-ends followed by more than 2 s with no Plato speech and no page action (excluding intended wait time) | auto | under 5% |
| E17 | **Certainty-aware response** (16) | on scripted uncertain-correct turns: explicit confirmation plus a why, or a why-question? on confident errors: explicit verdict plus a contrast on the page? Also detector precision and recall against human labels on real transcripts | judge + labels | ≥80% move compliance; report detector κ |
| E18 | Feedback form (17) | verdict in the first sentence (judge); elaboration present (judge); `point_to` at the error location (auto); ≤3 sentences before hand-back (auto); tool-verified when a tool exists (auto) | mixed | ≥90% each |
| E19 | Feedback timing (18) | interruptions of active student work with corrections; immediate step feedback in novice and new-material moves | auto + card tags | 0 interruptions unless the error blocks the work |
| E20 | **Praise audit** (19) | person or ability praise lexicon ("smart", "genius", "natural", "gifted", "brilliant"); generic praise per correct answer; normative comparisons ("most students…") | auto (lexicon) | 0; under 20%; 0 |
| E21 | ASR safety (20) | negative verdicts issued on low-confidence or unconfirmed exact-token answers; audited "wrong because misheard" rate | auto + audit | 0 |
| E22 | Confusion handling (21) | in scripted impasse runs: time to intervene; intervention when frustration markers are present; a resolution line naming the snag; a near-transfer item after | judge + auto | ≥80% |
| E23 | Student generative modes (22) | % of moves taking deictic or drawing answers; drawing tasks given with a scaffold | auto | track the trend; scaffold ≥90% |
| E24 | Chat-log redundancy (§1.3) | verbatim Plato lines shown in the log *during* a diagram explanation (if the log stays verbatim) | auto | 0 during builds; A/B the log variants |

The outcome measures (learning on held-out items, delayed retention) are in the sibling brief. These checks are **process** checks: they test whether the stage directions are followed, not whether learning happened. Validate a subset against learning outcomes once Plato has real users.

---

## 11. Where the evidence is weak, and what to A/B

- **No direct evidence for this system.** No RCT tests an LLM voice tutor with a shared, pointable page.
  - The multimedia evidence comes mostly from short lab lessons (often under 35 min) with immediate tests, many from one lab (Mayer and colleagues).
  - Meta-analytic effects are a third to a half of Mayer's lab medians (Noetel 2022).
  - The modality effect shrinks to d = 0.20 after bias correction (Reinwein 2012).
  - Personalization effects vanish in lessons longer than 35 min (Ginns 2013).
- **Disembodied pointers.** "Specific pointing beats general" is solid. "A hand or pen cursor beats a plain highlight" is untested for live tutoring. A/B the pointer style: moving pen tip vs highlight only.
- **Dynamic drawing.** Few studies from one group, with mixed findings on whether the hand must be visible and benefits mainly for novices. It costs time. A/B progressive build vs complete diagram on first exposure, on held-out transfer items.
- **Chat log.** The redundancy risk is specific to Plato's UI. A/B a live verbatim log, a log written after each utterance ends, and a key-terms-only log.
- **Wait-time numbers.** They come from 1970s–80s K-12 classroom studies, not from 1:1 voice tutoring with university students. Treat the 3 s, 8–10 s and 15–20 s thresholds as starting points and tune them per student from latency baselines.
- **Uncertainty detection.**
  - ITSPOKE's gains depended on human-accurate detection and disappeared with poor automatic detection.
  - The automated benefit appeared only for male users.
  - Modern ASR plus LLM detection of uncertainty from transcripts has not been validated for tutoring. Measure agreement with human labels before relying on it heavily, and keep the uncertain-correct response cheap so that false alarms are harmless.
  - Check whether the voice platform exposes prosody or audio features at all. If it passes only text and timing, use hedges, fillers, latency and page behaviour.
- **Praise.** Mueller & Dweck's process-vs-person effect has failed close replications (Li & Bates 2019) and is from children. The safe default of sparse, process-focused praise rests more on Kluger & DeNisi and Shute than on mindset studies.
- **Spoken vs typed.** Neither modality is better for learning. Speech's value is tempo and natural elaboration, and its costs are transience and ASR errors. Highly motivated learners may do better typing (D'Mello et al. 2011), so offer both.
- **Confusion timing.** Every "how long to let confusion run" number here is a heuristic. The literature gives only directions: resolved confusion is good, prolonged confusion is bad, boredom is worst.

---

## Key sources (most load-bearing)

**Multimedia**
- Noetel et al. 2022, *RER*, meta-meta-analysis: [doi](https://doi.org/10.3102/00346543211052329), [preprint](https://doi.org/10.31234/osf.io/pynzr)
- Mayer 2021, *JARMAC*, video principles: [doi](https://doi.org/10.1016/j.jarmac.2021.03.007)
- Mayer, Fiorella & Stull 2020, *ETR&D*: [ERIC](https://eric.ed.gov/?id=EJ1256250)
- Adesope & Nesbit 2012, redundancy: [doi](https://doi.org/10.1037/a0026147)
- Mayer & Johnson 2008, redundancy revised: [doi](https://doi.org/10.1037/0022-0663.100.2.380)
- Ginns 2005, modality: [ERIC](https://eric.ed.gov/?id=EJ723937)
- Reinwein 2012, modality: [doi](https://doi.org/10.1007/s10936-011-9180-4)
- Leahy & Sweller 2011, transient information: [doi](https://doi.org/10.1002/acp.1787)
- Ginns 2006, contiguity: [ERIC](https://eric.ed.gov/?id=EJ747512)
- Schroeder & Cenkci 2018, spatial contiguity: [ERIC](https://eric.ed.gov/?id=EJ1186641)
- Rey et al. 2019, segmenting: [doi](https://doi.org/10.1007/s10648-018-9456-4)
- Ginns, Martin & Marsh 2013, personalization: [doi](https://doi.org/10.1007/s10648-013-9228-0)
- Sundararajan & Adesope 2020, coherence: [ERIC](https://eric.ed.gov/?id=EJ1263249)
- Mayer, Sobko & Mautone 2003, voice: [doi](https://doi.org/10.1037/0022-0663.95.2.419)
- Craig & Schroeder 2019, TTS: [ERIC](https://eric.ed.gov/?id=EJ1225297)

**Embodiment, drawing and gesture**
- Mayer & DaPra 2012: [doi](https://doi.org/10.1037/a0028616)
- Davis 2018: [doi](https://doi.org/10.1016/j.edurev.2018.05.002)
- Wang et al. 2018: [ERIC](https://eric.ed.gov/?id=EJ1168616)
- Li et al. 2019: [ERIC](https://eric.ed.gov/?id=EJ1232776)
- Pi et al. 2017: [ERIC](https://eric.ed.gov/?id=EJ1143150)
- Fiorella & Mayer 2016, drawing: [doi](https://doi.org/10.1037/edu0000065)
- Fiorella et al. 2019: [ERIC](https://eric.ed.gov/?id=EJ1230834)
- Fiorella et al. 2020: [ERIC](https://eric.ed.gov/?id=EJ1259094)
- Fiorella & Kuhlmann 2020: [ERIC](https://eric.ed.gov/?id=EJ1249841)
- Schwamborn et al. 2010: [ERIC](https://eric.ed.gov/?id=EJ906635)
- Fiorella & Mayer 2016, eight generative strategies: [doi](https://doi.org/10.1007/s10648-015-9348-9)

**Pointing and deixis**
- Bangerter 2004: [doi](https://doi.org/10.1111/j.0956-7976.2004.00694.x)
- Louwerse & Bangerter 2010: [doi](https://doi.org/10.1111/j.1551-6709.2010.01135.x)
- Hostetter 2011: [ERIC](https://eric.ed.gov/?id=EJ916552)
- Dargue et al. 2019: [doi](https://doi.org/10.1037/bul0000202)
- Alibali et al. 2014: [ERIC](https://eric.ed.gov/?id=EJ1024930)
- Jarodzka et al. 2013: [ERIC](https://eric.ed.gov/?id=EJ1003567)
- Kappagantula et al. 2020: [ERIC](https://eric.ed.gov/?id=EJ1248034)

**Spoken tutoring**
- Rosé et al. 2003: [ACL](https://aclanthology.org/W03-0205.pdf)
- Litman & Forbes-Riley 2005, ASR and learning: [PDF](https://people.cs.pitt.edu/~litman/p1427.pdf)
- Forbes-Riley & Litman 2009, FOAK: [ACL](https://aclanthology.org/W09-3940.pdf)
- Forbes-Riley & Litman 2011, misclassification: [ACL](https://aclanthology.org/W11-2024.pdf)
- Forbes-Riley & Litman 2012, multiple affective states: [ACL](https://aclanthology.org/W12-1630.pdf)
- Forbes-Riley & Litman 2014, automated adaptation and gender: [ACL](https://aclanthology.org/W14-4324.pdf)
- Forbes-Riley & Litman 2013, *IJAIED*, disengagement: [ERIC](https://eric.ed.gov/?id=EJ1189987)
- Liscombe et al. 2005: [ISCA](https://www.isca-archive.org/interspeech_2005/liscombe05_interspeech.html)
- D'Mello, Dowell & Graesser 2011: [ERIC](https://eric.ed.gov/?id=EJ919598)
- D'Mello et al. 2008, affect from dialogue: [doi](https://doi.org/10.1007/s11257-007-9037-6)
- Nye, Graesser & Hu 2014: [ERIC](https://eric.ed.gov/?id=EJ1042132)
- Clark & Fox Tree 2002: [doi](https://doi.org/10.1016/s0010-0277(02)00017-3)

**Wait time and turn-taking**
- Rowe 1972: [ERIC](https://eric.ed.gov/?id=ED061103)
- Rowe 1987: [ERIC](https://eric.ed.gov/?id=EJ351827)
- Tobin 1986: [ERIC](https://eric.ed.gov/?id=EJ351719)
- Tobin 1987: [ERIC](https://eric.ed.gov/?id=EJ371356)
- Stahl 1994: [ERIC](https://eric.ed.gov/?id=ED370885)
- Ingram & Elliott 2016: [ERIC](https://eric.ed.gov/?id=EJ1089516)
- Stivers et al. 2009: [doi](https://doi.org/10.1073/pnas.0903616106)
- Fox, Ericsson & Best 2011: [doi](https://doi.org/10.1037/a0021663)

**Affect**
- D'Mello & Graesser 2012: [ERIC](https://eric.ed.gov/?id=EJ950444)
- D'Mello & Graesser 2011: [doi](https://doi.org/10.1080/02699931.2011.613668)
- Craig et al. 2004: [ERIC](https://eric.ed.gov/?id=EJ719229)
- Lehman et al. 2013: [ERIC](https://eric.ed.gov/?id=EJ1190004)
- Bosch & D'Mello 2017: [ERIC](https://eric.ed.gov/?id=EJ1126594)
- Sinha & Kapur 2021: [ERIC](https://eric.ed.gov/?id=EJ1308129)
- VanLehn et al. 2003: [ERIC](https://eric.ed.gov/?id=EJ675271)
- Koedinger & Aleven 2007: [ERIC](https://eric.ed.gov/?id=EJ785065)

**Feedback and praise**
- Shute 2008: [ERIC](https://eric.ed.gov/?id=EJ787077), [ETS full text](https://files.eric.ed.gov/fulltext/EJ1111586.pdf)
- Hattie & Timperley 2007: [ERIC](https://eric.ed.gov/?id=EJ782448)
- Wisniewski et al. 2020: [doi](https://doi.org/10.3389/fpsyg.2019.03087)
- Van der Kleij et al. 2015: [ERIC](https://eric.ed.gov/?id=EJ1081708)
- Kulik & Kulik 1988: [ERIC](https://eric.ed.gov/?id=EJ375720)
- Mueller & Dweck 1998: [doi](https://doi.org/10.1037//0022-3514.75.1.33)
- Li & Bates 2019: [doi](https://doi.org/10.1037/xge0000669)
- Henderlong & Lepper 2002: [doi](https://doi.org/10.1037/0033-2909.128.5.774)
- Butterfield & Metcalfe 2001: [doi](https://doi.org/10.1037//0278-7393.27.6.1491)
- Butler, Karpicke & Roediger 2008: [doi](https://doi.org/10.1037/0278-7393.34.4.918)
- Kluger & DeNisi 1996, *Psych Bulletin* 119: 254–284 [K]
