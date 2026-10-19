# Tutor modes: one Plato, several faces, and seamless switching between them

Research for Plato, 15 Oct 2026. The question: how to give Plato several **faces** (lecturer, problem coach, Socratic questioner, proof critic, examiner, reviewer) and make moving between them seamless. The setup this targets is Plato as it is today:
- one Claude Opus call per turn through `claude -p`;
- a system prompt made of the course brief, `TEACHING_BRIEF` and the tool list (`backend/session/agent.mjs`);
- context updates and the recent dialogue in the input (`backend/session/claude-actor.mjs`);
- replies in three parts: `@@PLAN`, `@@SAY`, `@@TOOLS`;
- `lesson` as the one mode so far. `src/local-actor.js` holds its topic, and `actorPrompt` appends `lessonBrief(topic)` to the system prompt while it is on.

**The framing the user set (15 Oct):** "don't shoehorn the LLM". Plato runs on a high-reasoning model. The job is to give it resources and a clear picture of what the student wants, not to script it. So the faces below are **craft knowledge the model can put on at will and blend**, and the model judges when to switch. Firm lines appear only where evidence shows a failure that needs one, and section 0.6 lists all three.

Evidence tags, as in `tutoring-evidence.md`:
- **[V]** checked against the paper or page (often just the abstract);
- **[S]** from secondary coverage or search snippets;
- **[K]** from background knowledge, not re-checked in this pass.

Related docs: `tutoring-evidence.md` (§1.6–1.9 tutoring patterns; §2.4–2.9 LLM tutors), `personalization.md` (explain-first vs try-first, learner control), `interactive-learning.md` ("Theo, the classmate with a bug"), `../director-actor.md` (why one mind should hold the plan).

---

## 0. The short version

### 0.1 What the evidence says, in seven lines

1. **Expert human tutors work in sustained modes**: introduction, lecture, modelling, scaffolding, fading, highlighting, conclusion. Lecture and scaffolding dominate (Cade et al. 2008, §2.1). Sessions that went well and sessions that went less well differ in their "mode architecture" (Morrison et al. 2015). So faces are real, and the order they come in matters.
2. **Different roles do different jobs.** In Baylor's agent studies, an *expert* agent raised information acquisition, a *motivator* raised self-efficacy, and a *mentor* that combined both did best overall. In one study, **two separate agents beat one combined agent** (the "split-persona effect", preliminary; §2.2). Function matters more than appearance: agent image and voice did not affect learning.
3. **Every major product ships modes, and each one is a prompt, not a separate model.** ChatGPT study mode, Claude's learning style, Gemini Guided Learning and Khanmigo's activities are all system instructions. Users toggle them, and in-mode moves are left to the model: study mode's prompt says "switch or end activities once they've done their job" (§1).
4. **A tutor that waits to be asked is rarely asked.** Khanmigo students messaged in only 17% of sessions where they made errors (`tutoring-evidence` §2.5). Real students also **bypass imposed scaffolds** for legitimate reasons ("Rethinking scaffolding", §2.10 there). So the *model* should switch faces proactively, and the *student* must be able to override at any moment.
5. **Learner control over everything does nothing for learning on average** (g ≈ 0.05; Karich et al. 2014). **Shared control**, where the system proposes and the learner picks, beats full system control in a classroom RCT (Long and Aleven 2016). Choice raises motivation (Patall et al. 2008). So Plato should offer a switch with a reason and let the student take it or not, and should always honour an explicit request.
6. **Routers and per-mode sub-agents are a poor fit here.** MAIC's hidden "manager agent", which picks who speaks, is "below optimal" against expert labels (§3.1). Anthropic's own guidance is to route only when the categories are distinct and handled better separately, and otherwise to start simple. The faces share almost all their state (the problem, the page, the student's last answer), so splitting them into separate agents would cut exactly what makes a switch seamless.
7. **Hidden modes cause mode errors.** Raskin: make a mode visible or remove it. LLMs also drift from a persona over a long dialogue (Li et al. 2024), and they get lost in multi-turn conversations after an early wrong turn (Laban et al. 2025). So the current face should be **restated near the end of each turn's input**, where the model reads it last, and **shown to the student** as a chip.

### 0.2 The faces

The faces are not exclusive inside a turn. A coach can give a three-line mini-explanation, and a lecturer asks check questions. A face sets Plato's **default rhythm, length and page use** until its job is done. Plato stays **one identity with one voice** throughout. The only exception is the optional classmate, which is deliberately a different character.

| Face | Its job | Entered when | Left when | Core moves | On the page | Length and pace |
|---|---|---|---|---|---|---|
| **Lecturer** (today's lesson mode) | Build a new idea properly | "Teach me X"; the topic is new to them; they're lost; a gap shows that a hint can't fix | The worked example is done and they're ready to try ("now you try one"), or they say they've got it | Why the idea exists; the course's definitions unpacked; examples next to near-misses; one picture or small case; a worked example at exam level; the traps; a check-in every slide or two | Slides: title, a few points, a diagram; the worked example step by step | Long, over several replies; the student reads more than they type |
| **Coach** (default) | Get them through a problem with as little help as they need | After a worked example; "help me with this problem"; any practice problem | The problem is solved (then reflect and pick the next); a gap shows that needs the Lecturer; or they want a drill | Let them try first; a verdict on every answer; contingent help that goes nudge → hint → prompt → show, one level per miss and fading on success; "what cracked it?" after a success | The problem with its numbers; their work; on a miss, the correct working written out | Short turns, one question at a time |
| **Questioner** (Socratic) | Deepen a concept they half-have: why it works, when it breaks | They can do the procedure but not explain it; "why?" questions; transfer and edge cases | They've articulated the key ideas, or two failed probes in a row. Then explain (Lecturer), don't keep asking | Questions that imply where the gap is; predict-then-check; contrast cases; "what would change if…"; a summary to close | The contrast cases; their predictions next to the outcomes | Short, but time-boxed: a few exchanges, not an interrogation |
| **Critic** (proof and written-answer grader) | Judge written work the way the course's grader would, then help repair it | They submit a proof or long answer, or ask "is this right?"; the proof space is open | It's graded and they've fixed it, or they've chosen to move on | Check every line before saying anything; a plain verdict per part; partial credit as the course gives it; the one most important fix first; accept valid non-standard proofs | Their proof annotated line by line, a rubric with points, a corrected line where needed | Medium; written more than chatted |
| **Examiner** (quizmaster, exam drill) | Retrieval under exam conditions; find what isn't solid | "Quiz me"; near the exam; after a topic is learned; to check readiness | The set is done, or a pattern of misses shows (then Coach or Lecturer on it) | Exam-style questions, mixed across topics; no hints during an item; feedback after each item or after the set; a running tally; misses queued for review | Question cards, a score tally, a list of misses | Brisk; Plato says very little between items |
| **Reviewer** (summarizer, closer) | Consolidate and plan | End of a topic or session; "where are we?"; coming back after a break; before the exam | Done in one or two replies | What they can now do (from evidence, not from "I get it"); what's still shaky; the key formulas and traps; what next | A one-sheet: the rules, worked-example skeletons, traps, open items | One or two replies |
| *Classmate "Theo"* (optional, later; `interactive-learning.md` §13) | Learning by teaching: the student explains to a peer who has a specific bug | Consolidation, once the student is reliable | Theo is convinced, or it stalls | Theo holds a real misconception and only accepts a correct explanation | Theo's buggy work | Short, playful, a few turns |

**The default.** With no evidence either way, Plato is the Coach. On new material it starts as the Lecturer (explain-first, as `personalization.md` §2.1 and the 12 Oct decision say). Close to an exam, the Examiner and Reviewer get more of the session.

### 0.3 Switching: signals, who decides, how it sounds

**Signals that suggest a switch.** These are things for the model to weigh, not rules.

| Signal | Suggests | Who sees it |
|---|---|---|
| An explicit request ("just explain it", "quiz me", "check my proof", "where are we?") | That face, at once | The model, from the text, or the student via the chip |
| A wrong answer revealing a *missing concept* (not a slip); the same error twice; "I have no idea where to start" | Coach → Lecturer (a short or full explanation) | The model |
| A worked example finished and acknowledged | Lecturer → Coach ("now you try one") | The model |
| Two or three clean, unassisted solves on a skill | Coach → Examiner (mixed items), or move on | The model, with mastery facts in context if available |
| Correct procedure but a shaky "why", or the student asks "why" | Coach → Questioner, briefly | The model |
| A proof or long answer written in the page space | → Critic | The model (`collect_page_work`) |
| Frustration ("ugh", "this is pointless"), very short answers, repeated "idk" | Less questioning: show more (Lecturer) or step back (Reviewer) | The model |
| Time: end of session, a long gap, the exam within days | Reviewer; Examiner weighted up | Code puts the facts (exam date, time) in context; the model decides |

**Who decides.**
- **The model decides**, through a tool call, because it is the only part of the system that reads the conversation well. No router and no classifier.
- **The student can override at any moment**, by saying so or with the chip. An explicit request always wins, though Plato may say in one line what it would have done (Lepper's "control" in `tutoring-evidence` §1.7; study mode and Guided Learning are both student-toggled).
- **At natural boundaries, Plato may offer two choices** instead of switching silently: "Want another like this, or a mixed set like the prelim?" This is shared control, the version of learner control with evidence behind it.
- **Code never switches faces.** It only supplies facts: exam date, problems done, mastery estimates when they exist.

**How a switch sounds.** Human tutors mark mode shifts with short discourse markers ("OK, so…", "now…", "let's…"), and the tutoring-dialogue work (Kim et al. 2000) treats those markers as what keeps dialogue from sounding stilted. A seamless switch has three parts:

1. **Name the turn, in one clause:** "Let me step back and show this properly."
2. **Give the reason in their terms:** "…because the exponent bias is what's tripping you, not the arithmetic."
3. **Bridge with the same object:** the same problem, numbers, diagram or proof line. Example: "We'll use your 6.0 × −1.5 as the example." Then: "Your turn: same format, −2.75."

Things that make a switch jarring:
- a new example out of nowhere;
- a change of voice or tone that reads like a different bot;
- an announcement with no reason ("Entering quiz mode!");
- abandoning a question they were halfway through;
- switching back within a turn or two (thrash).

Micro-blends need no announcement, for example a two-sentence explanation inside coaching.

**What carries across a switch.** The new face inherits:
- the **current problem** (its id, numbers and their latest attempt);
- **what is on the page** (the board titles, and the proof space if open);
- the **reason for the switch**;
- for the Lecturer, **how far the lesson got** (what has been covered and what the student has shown).

Most of this is already in Plato's context (dialogue, context updates, the `@@PLAN` line). The one thing missing is a **handoff note**: one sentence the model writes when it switches ("they decode fine but set the exponent one too low; resume on 6.0 × −1.5"). It is kept with the face and restated each turn until the next switch.

**What the student sees.**
- A **face chip** next to the chat or page title: `Lesson · Floating point`, `Practice`, `Exam drill 3/8`, `Proof check`, `Review`.
- Tapping it opens the faces with one line each. Picking one sends a context update ("[The student switched to Exam drill]") that the model acts on next turn.
- The `@@PLAN` note already shows above each message, and on a switch it names the move.
- No mode-entry buttons in the conversation itself; the chip is the only control. This respects the 15 Oct UI note: no student lines, no entry buttons.

### 0.4 Implementing it in Plato (the light version)

1. **Put every face in the static system prompt, and stop changing the system prompt per mode.**
   - Replace the conditional `lessonBrief(topic)` append with a short `FACES` section in `TEACHING_BRIEF`. Each face gets four to six lines of craft: job, moves, page, length. The current `lessonBrief` text becomes the Lecturer's entry.
   - Why: the system prompt becomes byte-identical on every turn, so it is cacheable. It also lets the model see every face at once, which it needs in order to blend them and to know what it could switch to.
   - Size: about 2.5–3.5k characters. Khan's warning that long prompts get parts ignored applies to rules, not to short craft notes, and Opus handles this size easily.
2. **Generalize the `lesson` tool into `face({ face, topic?, note })`.** `face` is one of `lecture | coach | question | critic | exam | review`; `note` is the handoff sentence. `local-actor.js` already keeps `lesson.topic` in sessionStorage; it would keep `{ face, topic, note, since }` instead. Keep `lesson` as an alias, so `lesson({topic})` = `face({face:'lecture', topic})`, until replays show nothing calls it.
3. **Restate the current face at the end of the input**, right before "Your turn" (the 14 Oct lesson was that the reply's form goes last, where it is read last). For example: `YOU ARE IN: Coach on "float encoding" for 4 turns. Your note: they decode fine but set the exponent one too low; resume on 6.0 × −1.5. Its length: short turns, one question at a time.` One line of state is cheaper and more reliable than a swapped prompt, and it counters persona drift.
4. **The chip in the UI** reads the same `{face, topic}` state. Picking a face writes a context update. Typed requests need no extra machinery: the model hears them.
5. **No router, no per-face sub-agents, no state machine.**
   - A separate model call is justified for exactly one job: **verification in the Critic and Examiner faces**. That means a deterministic check for numbers (as now) and, only if replays show sycophantic grading, a blind "check this proof against the claim" call before the verdict (Khan's math agent; verify-then-generate, `tutoring-evidence` §2.8).
   - Build that only after a replay shows the failure.
6. **Log face changes** (`from`, `to`, `who` = model or student, `note`) in the transcript. Then the one full replay ("build then diagnose") can read:
   - time spent in each face;
   - switches per ten turns;
   - thrash (A → B → A within three turns);
   - the share of switches the student started;
   - whether the bridge kept the same object.

**Prompt-caching note.** `claude -p` adds its own cache breakpoints. Anthropic's cache is an exact prefix match over tools, then system, then messages, with a 5-minute default TTL ([docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)). Today the system prompt changes whenever lesson mode toggles, and the whole input is one fresh user message each turn, so at best the system prompt is cached. Making it static is the cheap win. Check `usage.cache_read_input_tokens` in the stream-json `result` event to confirm hits before and after the change.

### 0.5 Risks and the light guard for each

| Risk | Guard |
|---|---|
| **Thrash** (switching back and forth) | One craft line: "a face lasts until its job is done"; the logged thrash metric; no hard minimum dwell |
| **One face contradicting another** (Lecturer says "I'll tell you", Questioner then withholds) | A single identity and voice; faces described as defaults, not personalities; the handoff note says why |
| **The model forgets which face it's in** | The face line at the end of the input every turn; the chip |
| **The student doesn't know the face** (a hidden mode) | The chip, plus a one-clause announcement on a real switch |
| **Over-lecturing** (an LLM's default; Herppich's "expertise amiss") | The Lecturer's entry says to check in every slide or two and hand over with "now you try one" |
| **Socratic stonewalling and caving** (CoMeT: question-only tutors gave the answer in 1 of 6 sessions) | The Questioner is time-boxed and escalates to explaining after two failed probes; contingent help lives in the Coach |
| **Sycophantic grading in the Critic** | Check before the verdict; a plain verdict per part; "valid but non-standard" as its own verdict |
| **The Examiner feels like interrogation** (the 12 Oct failure) | Entered by request, or offered as a choice, not imposed; brisk; feedback after the set; leaves on a pattern of misses |

### 0.6 The only firm lines

Everything else is craft the model may use or blend. These three hold every turn, because each guards against a documented failure.
1. **The student's explicit request for a face wins.** Ground: learner-control and agency evidence; "Rethinking scaffolding" on student-driven bypass.
2. **The current face is always visible to the student and restated to the model.** Ground: mode errors (Raskin); persona drift (Li et al. 2024).
3. **Every answer judged in any face gets a plain verdict, and never one unchecked.** Ground: `tutoring-evidence` §1.8 and §2.8 on over-praise and over-validation.

---

## 1. Multi-mode tutors and assistants in practice

### 1.1 ChatGPT study mode (OpenAI, July 2025)
- **What.** Custom system instructions written with teachers and learning scientists. The student turns it on and off from the composer. The extracted prompt ([Simon Willison, 29 Jul 2025](https://simonwillison.net/2025/Jul/29/openai-introducing-study-mode/)) [V] says:
  - "Be an approachable-yet-dynamic teacher";
  - learn the student's goals and level first, and default to 10th grade if unknown;
  - "DO NOT DO THE USER'S WORK FOR THEM";
  - vary explanations, questions and activities, "like roleplaying, practice rounds, or asking the user to teach _you_";
  - "Keep the session moving: always know the next step, and **switch or end activities once they've done their job**";
  - "be brief — don't ever send essay-length responses."
- **How the mode is decided.** Two levels:
  - The *student* picks the outer mode: study mode on or off.
  - The *model* picks the inner activities (explain, practice round, role-play, teach-back) by judgement. There is no state, router or activity registry.
- **For Plato.** This is the "faces as craft" design in production. Study mode's one-line-per-activity style shows how short the face entries can be. Its weakness, a single fixed length ("never essay-length"), is exactly what Plato's lesson mode had to override. So each face should state its own length.

### 1.2 Claude learning mode and output styles (Anthropic)
- **Learning mode** (Claude for Education, April 2025) uses Socratic questions instead of answers. Claude Code's output styles have a **Learning** style that leaves `TODO(human)` gaps for the user to fill, and an **Explanatory** style that adds "Insights" ([Claude Code docs: output styles](https://code.claude.com/docs/en/output-styles)) [V].
- **How it is built.** "Output styles directly modify Claude Code's system prompt". The built-in styles' instructions are **added to the end of the system prompt**, and a style is read at session start, so it changes after `/clear` or in a new session [V]. A style is a *session-level* persona, not a per-turn switch.
- **Claude Code's plan mode** is a closer analogue for per-turn switching [S: [ClaudeLog](https://claudelog.com/mechanics/plan-mode), [OpenReplay](https://blog.openreplay.com/plan-mode-claude-code-complex-tasks/)]:
  - the user toggles it with Shift+Tab or `/plan`;
  - it shows as a persistent indicator;
  - the mode change reaches the model as a message in the conversation, not a new system prompt;
  - the model asks to leave through a tool (`ExitPlanMode`) that the user approves.

  That is the same shape as section 0.4: a visible chip, a state line in the conversation, and a tool to switch.
- **The Anthropic Education Report** found 47% of student conversations were "direct" answer-seeking ([report](https://www.anthropic.com/news/anthropic-education-report-how-university-students-use-claude)) [V]. Students left alone pull the tutor toward answering. That is a reason the model, not only the student, must be able to put on a more active face.

### 1.3 Gemini Guided Learning (Google, 2025) and LearnLM
- **Guided Learning** is a mode the user selects under Tools in the Gemini app. In it, Gemini lays out a study plan, walks through it step by step, asks probing questions, checks understanding after explaining, pulls in diagrams and video, and closes a topic with a recap ([Google blog](https://blog.google/products/gemini/guided-learning-google-gemini/)) [V]. Students can go back to direct answers [S: [Maginative](https://www.maginative.com/article/google-launches-guided-learning-for-gemini-joining-the-ai-tutor-arms-race/)].
- **The LearnLM report** ([arXiv 2412.16429](https://arxiv.org/html/2412.16429v3)) [V] treats pedagogy as **"pedagogical instruction following"**:
  - each training conversation begins with a system instruction describing the wanted behaviour, such as a persona ("a knowledgeable writing coach"), a conditional ("if the user has answered 3 questions correctly, move to the next topic"), a hard constraint ("do not reveal the answer") or a soft guideline ("use a motivating tone");
  - system instructions "take precedence over any subsequent instructions provided by the user";
  - evaluations ran at least 10 turns;
  - RL beat SFT for following subtle instructions "in the context of long conversations".
- **For Plato.** Google's bet is that a strong model plus a *described* pedagogy beats a fixed one, and the report shows that adherence over long dialogues is the hard part. Plato's equivalent is the per-turn face line (section 0.4 step 3), which keeps the instruction close to where the model reads last.

### 1.4 Khanmigo (Khan Academy)
- **Activities as separate prompts.** Khanmigo exposes a menu of **activities**: Tutor Me (Math and Science; Humanities), Practice My Knowledge (rounds of ten questions), Debate, Chat with a Historical Figure, Craft a Story, writing and college coaches, and others ([AVID Open Access list](https://avidopenaccess.org/resource/ed-tip-khanmigo-a-personal-tutor-and-teaching-assistant/)) [S]. "All of the activities… are created by using prompts", and the team found that "the longer a prompt got… the more likely it was that parts of the prompt would be ignored" ([Khan blog, 7-step approach](https://blog.khanacademy.org/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo)) [S]. Each prompt is scoped "to do only what we intend it to do".
- **How the mode is decided.** The student or teacher picks the activity from the menu. Inside it, the model decides.
- **The 2025 learnings** ([Khan blog](https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings/)) [V]:
  - The one separate component is a **math agent** that "verifies calculations… behind the scenes", with a pre-check that skips it when it isn't needed.
  - Limiting that agent to checking the student's work, not solving the remaining steps, **cut answer give-aways by 50%**.
  - Learning history in context added **+6.1% next-item correctness**.
  - Passing the session log as plain text instead of JSON raised cognitive engagement by 5.09%.
- **The engagement problem.** Students rarely invoke the tutor themselves: 17% of error sessions in the NBER trial (`tutoring-evidence` §2.5) [S].
- **For Plato.**
  - Khan's "separate activities" design suits a menu product where students start a fresh thread per activity. It costs continuity, because a new activity is a new conversation. Plato's faces share one conversation and page, so they belong in one prompt.
  - Khan's prompt-length warning is real for long rule lists. Keep face entries to a few lines.
  - The verifier is the right *kind* of separate component: a checker, not a persona.
  - Plain-text context works better than JSON, which Plato already does.

### 1.5 Duolingo Max: Explain My Answer, Roleplay, Video Call
- **Explain My Answer** is a button after an exercise that opens a chat about why the answer was right or wrong. **Roleplay** uses scenarios written by human experts, who also "tell the AI where to take the conversation", followed by feedback on accuracy and complexity. **Video Call with Lily** is an open conversation that usually starts from what the learner just studied ([Duolingo blog](https://blog.duolingo.com/duolingo-max), [TechRadar](https://www.techradar.com/news/duolingos-new-gpt-4-ai-will-happily-explain-why-your-spanish-is-wrong)) [S].
- **Design lessons from Lily** (Pendomonium 2024 talk, [deck](https://pendo.io/pendomonium/wp-content/themes/pendomonium-tailpress-22/resources/pdf/How%20Duolingo%20built%20a%20conversational%20AI_Zan%20Gilani_PNDM2024.pdf)) [S]:
  - authenticity;
  - "not breaking the character's metaphor";
  - stress-free practice;
  - memory of what the learner likes to talk about.
- **How the mode is decided.** Each feature is entered from its own UI entry point, a button or a call. The modes are separate *features* with separate characters (Duo, Lily).
- **For Plato.** Duolingo's modes are distinct because their *tasks* are distinct: explain one item, act out a scene, chat freely. Their consistency rule, never break the character, is the argument for Plato keeping one voice across its faces. A different character (Theo) should appear only when the task is genuinely different (learning by teaching).

### 1.6 Synthesis Tutor and Socratic by Google
- **Synthesis Tutor** (ages 5–11 maths) presents itself as a conversational "video call" tutor. Reviews say it adapts to response time and hesitation, and answers errors with a guiding question rather than the answer ([Unite.AI review](https://www.unite.ai/synthesis-tutor-review), [Neil Squire](https://www.neilsquire.ca/synthesis-tutor-an-intelligent-math-tutoring-app/)) [S, mostly marketing]. Lessons are authored, with the AI inside them. There are no user-facing modes.
- **Socratic by Google** (2019–2024) [K]: the student photographs a question, the app classifies it and routes it to explainers, videos and step-by-step solutions. This is a router to *content*, not to tutoring behaviour, and it had no dialogue state.
- **For Plato.** Neither is a model for face switching. Synthesis is evidence that hesitation and timing are usable signals.

### 1.7 Carnegie Learning MATHia and the Cognitive Tutor: modes as a fading sequence
- MATHia has **Concept Builder** workspaces (explore tools, animations, classification, worked examples; a fixed number of problems) followed by **Mastery** workspaces (multi-step problems; BKT per knowledge component; leave when every skill is mastered or a maximum is reached; on-demand and just-in-time hints) ([Carnegie Learning help](https://support.carnegielearning.com/help-center/math/mathia/article/understanding-mastery-and-concept-builder-workspaces-in-mathia/)) [V].
- **Adaptive fading.** Salden, Aleven, Schwonke and Renkl (2010), ["The expertise reversal effect and worked examples in tutored problem solving"](https://researchportal.hw.ac.uk/en/publications/the-expertise-reversal-effect-and-worked-examples-in-tutored-prob/), *Instructional Science* 38:289–307 [V abstract]. Both a lab and a classroom experiment found **adaptive fading > fixed fading > pure problem solving**. "Adaptive" means a worked step is faded once the student has shown that step's skill, which gave better delayed transfer.
- **How the mode is decided.** The curriculum sequence plus mastery estimates: system-controlled, per skill.
- **For Plato.** The Lecturer → Coach → Examiner path is the same worked example → faded → solo progression. What matters is that the hand-off is **per skill and evidence-driven**, which a model reading the dialogue can do: "you've shown the bias step twice, so this time I'll leave it to you."

### 1.8 AutoTutor and Betty's Brain
- **AutoTutor** runs one face, expectation-and-misconception dialogue: pump → hint → prompt → assert → summary (`tutoring-evidence` §1.6) [V]. The **affect-sensitive** version detects boredom, confusion and frustration and changes its dialogue moves. It helped **low-knowledge students** most, by about three quarters of a letter grade in a one-hour session ([U. Memphis summary](https://www.memphis.edu/research/industry/ott/documents/emotionally.pdf)) [S]. Affect is a legitimate switching signal, mostly for struggling students.
- **AutoTutor trialogues** add a second agent, a peer student, alongside the tutor [K]. D'Mello et al. used two agents disagreeing to induce productive confusion (`interactive-learning.md`).
- **Betty's Brain** (Biswas, Schwartz) is a *teachable agent*: students build a causal map to teach Betty, then quiz her. Chase, Chin, Oppezzo and Schwartz (2009) reported the **protégé effect**: students worked harder to learn *for* their agent than for themselves [K; [Betty's Brain overview](https://en.wikipedia.org/wiki/Betty%27s_Brain)].
- **LLM teachable agents:**
  - **AlgoBo** (Jin et al., CHI 2024, [arXiv 2309.14534](https://arxiv.org/abs/2309.14534)) [V abstract] found that an LLM tutee knows too much, which kills the motivation to teach it. AlgoBo fixes this with a **"Reflect-Respond" knowledge state** and **"mode-shifting"** that steers toward why/how questions, and its conversations were more knowledge-dense (effect size about 0.7, N = 40).
  - **"LLMs Protégés"** ([BEA 2025](https://aclanthology.org/2025.bea-1.19)) [S]: students tutoring a deliberately erring LLM gained, preliminarily.
- **For Plato.** If Theo is built, his misconception must live in state, not in a vibe. AlgoBo shows an LLM drifts back to "knowing" unless its knowledge state is restated each turn, which is the same lesson as Plato's face line.

### 1.9 Pedagogical agent personas: the persona effect and Baylor's roles
- **The persona effect**, the idea that a lifelike agent improves the learning experience, is real but small. Schroeder, Adesope and Gilbert (2013), *J. Educational Computing Research* 49(1), 43 studies and N = 3,088, found a **small but significant** learning effect, larger in K–12 and with on-screen text rather than narration ([WSU record](https://rex.libraries.wsu.edu/esploro/outputs/journalArticle/How-Effective-are-Pedagogical-Agents-for/99900601056901842)) [V abstract]. Affective benefits do not need the agent's image (Schroeder and Adesope 2014) [S].
- **Baylor's three roles.** Baylor and Kim (2005), *IJAIED*: **Expert** → more information acquisition; **Motivator** → more self-efficacy; **Mentor** (both) → better learning *and* motivation overall. Two validation experiments, N = 78 and N = 71 ([amybaylor.com](https://amybaylor.com/pubs/2005ijaied/)) [V abstract]. Motivational messages raised self-regulation and self-efficacy (ITS 2004, N = 229).
- **The split-persona effect.** Baylor (2003, AAMAS workshop) and Baylor and Ebbers (2003, EdMedia/AIED) found that **two agents (Expert + Motivator) beat one Mentor agent** on learning and on the agents' perceived value ([amybaylor.com](https://amybaylor.com/pubs/edmedia2003split/)) [V abstract; the authors call it preliminary].
- **Image and voice.** Appearance and voice did not affect learning (N = 109) [V abstract].
- **For Plato.**
  - Roles carry real weight, which is evidence for faces.
  - The split-persona result is the strongest evidence for *separate characters*, but it is one 2003 study with cartoon agents. The Mentor (combined) role did best of the three in the larger study.
  - Reading: **one Plato with clearly distinct functions** (the faces), not several bots. A separate character only for a separate *task*, such as Theo.
  - Motivational content belongs in every face (the Mentor finding), not in a "motivator mode".

### 1.10 Multi-agent LLM tutors and classrooms (2023–2026)

| System | Agents / modes | Who decides what's next | Result | Lesson for Plato |
|---|---|---|---|---|
| **MAIC**, ["From MOOC to MAIC"](https://arxiv.org/html/2409.03512v1) (Tsinghua; JCST 2026) [V] | AI teacher; teaching assistant (keeps order, stops drift); four classmate archetypes (Class Clown, Deep Thinker, Note Taker, Inquisitive Mind) | A hidden **Manager Agent** maps class state (material covered, dialogue, roles) to (agent, action). It waits a time window τ for the user, then decides | 500+ students. Most preferred "continuous mode" with no input required. Some found interactive mode unhelpful when the agents ignored their input. Feedback-on-weaknesses rated lowest (3.51/5). Manager accuracy "below optimal" against 500 expert-labelled scenarios | Shared state (material covered + dialogue) is what makes switching work. A separate manager model mis-picks and ignores students. Plato's one model already holds the state |
| **SocraticLM / SocraTeach** (Liu et al., [NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/file/9bae399d1f34b8650351c1bd3692aeae-Paper-Conference.pdf)) [V] | Dean–Teacher–Student pipeline: the **Dean** judges and revises each Teacher turn against Socratic criteria (didn't give the answer, pointed out the error, sounds like a teacher); the Student simulates six cognitive profiles | Fixed: a step-by-step question list per problem; the Dean gates every turn | A fine-tuned 6B model beat GPT-4 by 12% on their five teaching dimensions | A supervisor that checks each turn is a *data-generation* tool. At run time it doubles latency. Plato's equivalent is the Critic's verification, used only where a verdict is at stake |
| **TreeInstruct**, ["Instruct, Not Assist"](https://aclanthology.org/2024.findings-emnlp.553/) (EMNLP Findings 2024) [V abstract] | One tutor planning a question tree over the student's misconception state | Re-plans as the student's state changes | State of the art on Socratic debugging | Planning inside a problem, not switching between modes |
| **Ruffle&Riley** ([arXiv 2310.01420](https://arxiv.org/abs/2310.01420); [2404.17460](https://arxiv.org/abs/2404.17460)) [V abstract] | Two agents: the learner teaches **Ruffle** (student), and **Riley** (professor) helps | Scripted from the lesson text, free-form dialogue | N = 200: higher engagement and perceived understanding, took longer, **no learning difference vs reading** | Two-character learning-by-teaching is engaging but not yet shown to beat reading. Theo is optional |
| **IntelliCode** ([arXiv 2512.18669](https://arxiv.org/abs/2512.18669), EACL demo 2026) [V abstract] | Six agents (assessment, profiling, graduated hints, curriculum, spaced repetition, engagement) over one versioned learner state, single-writer | A StateGraph orchestrator | Simulated learners only | The **single shared state** is the reusable idea, not the six agents |
| **GenMentor, GraphMASAL, PersonalPlan, DeepTutor** (2025–26) [S titles and abstracts] | Planner, tutor, assessor splits | An orchestrator or graph | Mostly simulated evaluations | The field converges on planner + state + tutor + verifier; little of it is tested with real students |
| **TutorGym** ([arXiv 2505.01563](https://arxiv.org/abs/2505.01563), AIED 2025) [V] | A testbed: LLMs as tutors inside 223 ITS domains | n/a | LLMs no better than chance at labelling incorrect steps; next-step correct 52–70% | Verification of a student's steps can't be left to the tutoring voice. That supports the Critic's checking line |
| **Meta-analysis of LLM effects on students** ([arXiv 2509.22725](https://arxiv.org/abs/2509.22725)) [S] | — | — | The **pedagogical role given to the LLM** was one of the two strongest moderators; the "active tutor" role gave the largest gains | Roles matter, and an active tutor role beats a passive answerer |

**How the multi-agent systems decide.** Either a fixed script (SocraticLM, Ruffle&Riley), a manager or orchestrator model (MAIC, IntelliCode), or the user (MAIC's agent choice).
- None reports a learning gain over a single strong tutor model from the multi-agent split itself.
- The gains reported come from **state** (what's been covered, the student's misconceptions) and **checking** (Dean, verifiers).

---

## 2. Modes and switching in human tutoring

### 2.1 Expert tutors work in modes
- **Cade, Copeland, Person and D'Mello (2008)**, ["Dialogue modes in expert tutoring"](https://link.springer.com/chapter/10.1007/978-3-540-69132-7_50), ITS 2008 [V abstract]. Expert sessions coded into eight sustained modes: **Introduction, Lecture, Modeling, Scaffolding, Fading, Highlighting, Off-topic, Conclusion**, coded reliably (κ ≥ .8).
  - Lecture and scaffolding dominate in every domain.
  - How often each mode appears and how long it lasts differ by domain, reflecting different goals.
  - Expert tutors produced 77% of the words (`tutoring-evidence` §1.8).
- **Morrison, Nye, Rus et al. (2015)**, ["Tutorial dialogue modes in a large corpus of online tutoring transcripts"](https://digitalcommons.memphis.edu/facpubs/3298), AIED 2015 [V abstract]. 16 modes and 125 dialogue acts over 1,438 Tutor.com transcripts (more than 90k turns). **"Subtle differences in the 'mode architecture'"** separate successful from less successful sessions.
- **Lepper's INSPIRE** (`tutoring-evidence` §1.7). Effective sessions cycle through introduction → problem selection → presentation → solution (mostly the student) → reflection → instruction *only when necessary*. Students are offered choices, and their requests are honoured ("control").
- **For Plato.** The faces map onto the expert modes:

  | Expert mode (Cade) | Plato face |
  |---|---|
  | Lecture + Modeling | Lecturer |
  | Scaffolding + Fading | Coach |
  | Highlighting | a move inside any face |
  | Introduction / Conclusion | Reviewer |

  The Examiner and Critic come from exam prep, not from Cade's corpus. The *order* matters, so the craft notes should name the natural paths. Lecturer → Coach → Examiner → Reviewer is the main one, with Coach → Lecturer when a gap shows.

### 2.2 When human tutors switch, and how
- **Contingency.** Wood and Middleton (1975): more help after a failure, less after a success (`tutoring-evidence` §1.9) [K]. The switch is triggered by *what the student just did*, not by the clock. CoMeT (2026) is the LLM version: escalate at decision points the student fails, fade once they take them up. It caved less often than a question-only tutor.
- **Tell vs ask** depends on prior knowledge and the goal (`tutoring-evidence` §1.9, `personalization.md` §2.1):
  - low knowledge on a new procedure → tell first (Lecturer);
  - moderate knowledge with a conceptual goal → ask first (Questioner, or try-first productive failure);
  - high knowledge → problems (Examiner).

  These are the switching criteria for the faces, and a model can judge them from the dialogue.
- **Error type.** Lepper's triage applies: ignore trivial slips (stay in the face), let productive errors run (stay), intervene on unproductive ones (switch). A *missing concept* is the clearest trigger for "let me step back and explain".
- **Affect.** The affect-sensitive AutoTutor findings (§1.8) and D'Mello's work on confusion: confusion that gets resolved is productive, but confusion that persists turns into frustration and then boredom [K]. Two failed probes is a reasonable point to stop questioning and explain.
- **How the switch sounds.** Discourse markers ("now", "so", "OK", "let's") are how teachers mark topic and mode shifts. Kim, Glass, Freedman and Evens (2000, CogSci) learned rules for them from human tutoring transcripts because, without them, tutoring-system dialogue sounded stilted ([summary](https://www.youscribe.loungeup.com/catalogue/documents/ressources-professionnelles/informatique/learning-the-use-of-discourse-markers-in-tutorial-dialogue-for-an-534412)) [S]. Lecture research separates **macro markers** (moving between topics or moves) from micro markers ([TEFLIN](https://doaj.org/article/965a3830fc38467b9945db5dbb24b438)) [S]. Practical reading: one macro marker plus a reason per switch, never a heading or announcement.
- **Continuity of the example.** Faded worked examples (Renkl; Salden et al. 2010, §1.7) work *because* the solo problem is isomorphic to the example just studied [K]. A switch that keeps the same object, or an isomorph of it, uses that structure; a switch to an unrelated example throws it away.

### 2.3 Who should control the switch: learner-control evidence
- **Full learner control does nothing for learning on average.** Karich, Burns and Maki (2014), *Review of Educational Research*: 18 studies (1996–2012), **g ≈ 0.05** for giving learners control over pace, sequence, practice or review ([EdWeek summary](https://edweek.org/leadership/review-casts-doubt-on-importance-of-learner-control-in-computerized-instruction/2014/05)) [S]. Niemiec et al. (1996) found a small negative effect.
- **Shared control helps.**
  - Corbalan, Kester and van Merriënboer (2006–2010) proposed that the system preselects suitable tasks and the learner makes the final pick, as a way out of the "self-directed learning paradox" ([OU repository](https://research.ou.nl/en/publications/selecting-learning-tasks-effects-of-adaptation-and-shared-control/)) [S].
  - Long and Aleven (2016), ITS: **mastery-oriented shared control over problem selection** produced better learning than full system control, with 200 students in grades 6–8 ([Springer](https://link.springer.com/chapter/10.1007%252F978-3-319-39583-8_9)) [S].
- **Choice and motivation.** Patall, Cooper and Robinson (2008), *Psychological Bulletin*, 41 studies: choice raised intrinsic motivation, effort, task performance and perceived competence ([PubMed](https://pubmed.ncbi.nlm.nih.gov/18298272/)) [V abstract]. The effect was larger for instructionally irrelevant choices, so the face choice should be offered as equally good options, not as a test.
- **Perceived control.** An RCT with an AI instructional agent found higher perceived learner control, which predicted post-test performance ([arXiv 2505.22526](https://arxiv.org/abs/2505.22526)) [V abstract].
- **Students are poor judges of when they need help.** Help abuse and help avoidance are both common: hints were abused on 36% of actions in one Geometry Tutor unit ([LearnLab: help abuse](https://learnlab.org/research/wiki/index.php/Help_abuse); Aleven et al. 2003, *RER* 73(2)) [S]. Students also bypass scaffolds for their own goals ("Rethinking scaffolding").
- **Conclusion.**
  - The model proposes and switches proactively, with a reason.
  - The student can always override.
  - At boundaries, offer two options.
  - "Just tell me" is honoured, but the Lecturer face is not an answer machine: it explains and then hands back with "now you try one". This matches `tutoring-evidence` §2.7's help-abuse persona: escalate in steps, never cave, never stonewall.

---

## 3. Implementation patterns for an LLM tutor

### 3.1 Four ways to build modes

| Pattern | How it works | Seen in | Good for | Costs for Plato |
|---|---|---|---|---|
| **A. One prompt containing every face; the current face as a state line** | Static system prompt with short face notes; a tool sets the face; the face is restated in each turn's input | Study mode (activities inside one prompt); Claude Code plan mode (state message + exit tool) | Blending; continuity; cacheable; the model knows its options | The prompt grows by about 3k characters |
| **B. Swap or append the system prompt per mode** | `system = base + modeBrief` | Plato's lesson mode today; Claude Code output styles (session-level); Khanmigo activities | Strong, focused instructions for one long mode | Cache miss on every switch; the model can't see the other faces, so it can't blend or offer them; the mode is invisible in the dialogue history |
| **C. A sub-agent per mode** | Each face is its own model call with its own prompt; a hand-off passes state | MAIC classmates; Ruffle&Riley; Duolingo's separate features | Genuinely different characters and tasks | Every hand-off loses state; two voices; extra latency; the seam failures `director-actor.md` documented (stale plans, "too many voices") |
| **D. A router or planner model in front** | A classifier or manager picks the mode, then the tutor speaks | MAIC Manager Agent; IntelliCode orchestrator; Anthropic's "routing" workflow | Many distinct input types and cheap models | Another call (latency); mis-routes (MAIC "below optimal"); weaker at reading intent than Opus reading the whole dialogue |

**Recommendation: A, with C used only for checking (verification) and slow builds (anatomy).** Anthropic's agent guidance: route when "there are distinct categories that are better handled separately", and otherwise start with "the simplest solution possible, and only increas[e] complexity when needed" that "demonstrably improves outcomes" ([Building effective agents](https://www.anthropic.com/research/building-effective-agents)) [V]. Plato's faces are not distinct categories of input. They are different stances on the same problem, page and student.

### 3.2 State that must persist across a switch

| State | Where it lives in Plato today | What to add |
|---|---|---|
| The current problem: id, numbers, the student's latest attempt | Dialogue; `@@PLAN` ("starts with the problem they're on, by its numbers") | Nothing |
| What's on the page | Context updates; `collect_page_work` | Nothing |
| The current face, its topic, when it started | `lesson.topic` only (`local-actor.js`) | `{face, topic, note, since}` |
| Why the switch happened, and where to resume | Nowhere | The handoff `note` from the `face` call |
| The lesson's progress (covered, shown) | The dialogue, implicitly | The Lecturer's `note` updated when it hands over ("covered bias and normalization; they did one encode with help") |
| Exam drill progress | Nowhere | `Exam drill 3/8` in the face topic, plus misses noted in `note` |

A single shared state with one writer (IntelliCode) is the pattern. In Plato the writer is the model, through the `face` tool, and the client stores the result.

### 3.3 Prompt caching and latency
- The cache key is an exact prefix of tools → system → messages. Up to 4 breakpoints, a 20-block lookback, a 5-minute TTL (1 hour optional), and a minimum cacheable length per model ([Anthropic docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)) [V]. Changing the tool list invalidates everything after it. Volatile content (timestamps, mode text) belongs after the cached prefix ([DEV: nondeterministic system prompts](https://dev.to/hexisteme/the-silent-10x-tax-how-a-nondeterministic-system-prompt-voids-your-llm-prompt-cache-39j5)) [S].
- **In Plato:**
  - `--tools ''`, so there's no tool block. The system prompt is first.
  - The system prompt changes today whenever lesson mode toggles: a miss on every enter and exit.
  - Each turn's input is a single freshly built user message, with context updates first and the dialogue second, so it never prefix-matches the previous turn beyond the system prompt.
- **What pattern A changes.** The system prompt becomes constant, so it should hit on every turn within 5 minutes; the change itself costs nothing. Check `usage.cache_read_input_tokens` in the `result` event. If later wanted, putting stable context (the study guide) *before* the dialogue and the volatile parts (new context, face line) *after* it would let more of the input cache. That's a separate change, not needed for faces.
- **Latency.** StudentBench and Khan both tie response speed to engagement (`tutoring-evidence` §2.5, §2.9). Router and sub-agent designs add a serial call on every turn; pattern A adds none.

### 3.4 Risks, with evidence
- **Persona drift.** Li et al. (2024), ["Measuring and controlling persona drift in language model dialogs"](https://arxiv.org/abs/2402.10962) [V abstract]: significant drift within **8 rounds** (LLaMA2-70B-chat), attributed to attention decay over a long history. Their fix was to re-attend to the system prompt. ContextEcho ([arXiv 2605.24279](https://arxiv.org/abs/2605.24279), 2026) [S]: drift across 23 frontier models in long agentic sessions, and compaction doesn't reliably reset it. → Restate the face every turn, near the end.
- **Getting lost in multi-turn conversation.** Laban et al. ([arXiv 2505.06120](https://arxiv.org/abs/2505.06120), ICLR 2026) [V abstract]: a 39% average drop from single-turn to multi-turn. Models commit early to assumptions and "do not recover". → The handoff note is a chance to re-state the situation cleanly at each switch.
- **Mode errors.** Raskin: a mode is a state in which the same action gives different results, and users forget the state. Make modes visible, or use quasimodes. Hidden modes in voice assistants are a design failure ([Raskin Center: modes and voice assistants](https://raskincenter.org/ideas/modes-voice-assistants/), [The Humane Interface](https://en.wikipedia.org/wiki/The_Humane_Interface)) [V]. → The chip. In the Examiner, the same message ("idk, hint?") means "no hints, next item" rather than "give a hint", so the student must know which face they're in.
- **A long prompt getting ignored** (Khan, §1.4) → keep each face note short; craft, not rules.
- **Socratic collapse and stonewalling** (CoMeT; MRBench's answer leakage; "Rethinking scaffolding") → the time-boxed Questioner; contingent help in the Coach.
- **Over-explaining** (Herppich et al. 2016, "Expertise amiss": more explaining, less learning) → the Lecturer hands over early.
- **Sycophancy in grading** ("Confirming correct, missing the rest"; "Sycophancy is an educational safety risk"; `tutoring-evidence` §2.8) → the Critic checks before the verdict. Plato's existing "Check before you say it" line already covers numbers.
- **Interrogation feel** (Plato's 12 Oct failed sessions; MAIC students preferring continuous mode) → Examiner and Questioner by request or offer, never imposed for long.

### 3.5 UI affordances

As in section 0.3: a text chip (Raskin's visibility; Claude Code's plan-mode indicator), switching by saying so first and by the chip menu second (the menu also shows the student which faces exist, a light open learner model, `personalization.md` §3.4), progress only where it means something (`Exam drill 3/8`), no entry buttons in the chat, and the `@@PLAN` note carrying the marker and reason on a switch.

---

## 4. Draft face notes for `TEACHING_BRIEF`

These are illustrative and in Plato's existing register: craft to draw on, not rules. About 2.8k characters.

```
Your faces. You're one tutor with several ways of working; put on whichever the moment needs, blend them, and
switch when a face has done its job (call face with a one-line note of where things stand). Whenever they ask for
one, go to it. On a switch, say so in a clause with the reason, and carry on with the same problem or example.

- Lecture (new or lost): why the idea exists, the course's definitions in plain words, an example beside a
  near-miss, a picture, a worked example at exam level, the traps. Slides on the page; as long as it takes, over
  several replies, checking in every slide or two. Hand over with "now you try one" as soon as they can.
- Coach (the default for problems): they try first; every answer gets a clear verdict; help rises one step per miss
  (nudge, hint, the specific prompt, then show it) and falls back once they succeed; after a success, ask what
  cracked it. Short turns, one question at a time; the correct working goes on the page after a miss.
- Question (they can do it but not say why): a few pointed questions, predictions to check, contrast cases. If two
  probes don't land, explain it instead.
- Critic (a proof or written answer to judge): check every line before you say anything; grade it as the course's
  grader would, part by part, with partial credit; a valid but unusual proof is valid; the one most important fix
  first; annotate it on the page.
- Exam (drill, "quiz me", near the exam): exam-style items, mixed across topics; no hints during an item; feedback
  after it; a running tally; misses kept for review. Brisk, few words between items.
- Review (end of a topic or session, "where are we", before the exam): what they can now do (from what they showed),
  what's shaky, the key rules and traps on one page, what's next. One or two replies.
```

The per-turn state line in the input is: `YOU ARE IN: <face> on <topic> (<n> turns). Your note: <note>.`

---

## 5. Open questions for the replay

1. Does Opus switch faces on its own at the right moments, or does it stay in Coach? Measure: switches per ten turns, and the share started by the model versus the student.
2. Does the face line stop drift in long Lecturer runs (more than 15 turns)?
3. Do students use the chip, or only ask in words? (If the chip goes unused, keep it as a display.)
4. Is thrash a real problem, or a theoretical one?
5. Does the Critic need a separate blind verification call, or is Opus's own line-by-line check enough on CS 3410 proofs? Decide from the replay, not in advance.
6. Is Theo worth building? Ruffle&Riley and AlgoBo show engagement, but no clear learning gain over reading yet.

