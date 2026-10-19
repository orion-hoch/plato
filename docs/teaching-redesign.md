# Rethinking how Plato teaches

Status: proposal (12 Oct 2026), written after two failed live sessions on CS 3410. Nothing here is built yet.

## What happened

**Session 1 (19:39, 12 Oct)**
- Plato opened with "Have a go at the question on the page" on a circuit of AND/OR gates in the switches lecture, before teaching anything.
- The student's real answers and their "what's going on?" got the same question back five times ("just your best guess").
- A correct answer ("S and P are both 0") got a hint because the check hadn't come back yet.
- Plato apologised and narrated its own mistakes. The student gave up.

**Session 2 (20:07, after a full reset)**
- The student said: "I know nothing. I want to start from the beginning and learn the whole material naturally."
- Within a minute Plato asked for the outputs of the same gate circuit.
- When the answer was wrong, it posed an XNOR truth-table question to "tell apart" a misconception the student couldn't have.
- The student asked for reading from the beginning. Over the next four minutes the page showed, in turn: an arrays excerpt, the syllabus, a transistor passage, a FemtoProc worked example, and two study plans written on the fly.
- Plato kept saying "I'll check the course material" and "I chose the wrong excerpt".
- The student's verdict: Plato doesn't understand the course or them.

Each of these has a local cause (listed at the end). But the same few structural problems produce all of them, and patching each one has not converged. That is the part to fix.

## The structural problems

### 1. The unit of teaching is wrong

The director teaches **one knowledge component (KC) at a time**. A KC is a single claim from the course model; CS 3410 has 523 of them across 126 topics.

Each KC runs an "arc": probe, teach, test, separate, repair, summary. Each move is chosen by a policy over that KC alone. This is the design of a diagnostic tutor for one skill. It is not how a course is taught.

A lecture is a narrative: here's the idea, here's why it matters, here's an example, now you try, here's how it connects to the next idea. Teaching KC by KC chops that narrative into quiz items. That is why:
- every session feels like being interrogated;
- "start from the beginning" can land on a gate circuit (a highly ranked KC from the first unit);
- a learner who knows nothing gets questions before explanations.

### 2. Two brains, one mouth, and a slow handoff

- The **voice** (the actor) is the only thing the student hears. It holds one card at a time.
- The **director** decides every move, but only after each line, by running a classifier and a verifier. It sends a new card 3–8 s later.

In between, the voice has nothing true to say. It improvises: filler, apologies, or the last card's question again. When the card does arrive, it often answers a line the student has already moved past.

The voice can't teach on its own because it knows only the current card. The director can't talk because it's slow. Every rough edge in both sessions is this seam:
- the late hint;
- the repeated questions;
- "let me check the course material";
- the apologies.

### 3. The learner's intent has nowhere to go

"I know nothing", "start from the beginning", "more reading", "just tell me if I'm right", "explain your reasoning": these are instructions about **how to teach**. The system has no place to keep them:
- The intro records an exam and a lecture.
- `remember_preference` writes facts the director mostly ignores.
- Everything else goes through `change_topic`, which turns sentences into goals. That's how "bring me what to read" became a goal that quoted the arrays lecture.

### 4. It acts on evidence it doesn't have

The policy is calibrated for a learner with a history. With one answer on record, it:
- diagnosed a misconception and probed it;
- graded a correct answer as "not yet verified", which became a hint;
- judged "what the learner needs" from priors.

A tutor meeting someone for the first time listens and explains. It doesn't diagnose.

### 5. Improvised material in the reply path

When the plan didn't fit, the `think` path and the writer composed new material live:
- study plans;
- "notes don't cover this";
- syllabus links that came from no file.

They had no course structure to stand on, so they flailed, and they did it while the student watched.

## The proposed model: lessons, not arcs

### The unit is a lesson segment

Each lecture section becomes a **lesson**, prepared ahead in the background from the course model and the lecture text, the same way the course model is built now. A lesson is an ordered script:

1. **Orient:** where this sits ("Last lecture: bits. This one: how we represent negative numbers.").
2. **Teach:** the idea in plain words, the lecture's own passage to read, and a worked example. This is all prepared and checked ahead of time.
3. **Try:** one or two questions with verified answers, the usual wrong answers, and what to say to each.
4. **Connect:** the one-sentence takeaway and the link to the next section.

The KCs, misconceptions and verifiers from the course model are what the lesson is *made of*. They stop being the thing that drives the conversation.

### The voice holds the whole lesson, not one card

At the start of each lesson the voice receives the whole script. It can then:
- explain;
- answer "what's going on?" ("we're on two's complement; here's the question");
- repeat itself more simply;
- say whether a prepared answer is right, instantly, with no round trip.

The director stops being in the reply path. It works one step ahead, in the background:
- It checks free-form answers and sends a verdict as an update.
- It prepares the next lesson.
- It notices when to change course (repeated wrong answers, a request, a learner who already knows this) and sends a revised plan.

Effect on latency: most replies need no backend call at all. The voice answers from the script it already has. Only unprepared questions go to `think`.

### A session contract the learner can steer

A small record per learner and course, set in the intro and changeable by voice at any time:

| Field | Values | Default |
| --- | --- | --- |
| Start | where to start ("from the beginning", "lecture 6") | |
| Mode | read first / explain first / practise first | explain first |
| Pace | how many questions per lesson | 1–2 |
| Depth | standard, or exam-week (fewer, more exam-like questions; readings kept) | standard |
| Wants | "just tell me if I'm right", "more examples" | |

- Requests like "start from the beginning" or "give me the reading" change the contract. They never create goals.
- `change_topic` only ever moves to a real section of the course tree. Anything else is refused and handled through the contract.

### Diagnosis only with evidence

- Until a learner has answered a few questions on an idea, a wrong answer gets the right way shown: a worked step or the lecture's own explanation.
- Misconception probes and repairs are used once the evidence supports them: two or more answers, or a misconception they stated themselves.
- A correct answer that is still being checked is never followed by a hint. The voice asks how they got it, and the verdict lands when the check returns.

### No live authoring

- Readings, examples and questions come from what was prepared and checked ahead.
- `think` answers questions from the course; it never writes study plans or invents sources.
- If something isn't in the course material, Plato says so in one sentence and moves on.

## Latency plan

- **Voice model:** go back to a no-reasoning voice. Either gpt-6-sol with no reasoning, or gpt-6.1-sol if ElevenLabs allows a lower setting. The voice now only performs a script, so it doesn't need to reason. This is the largest single cut. (Changing back undoes my 11 Oct choice of gpt-6.1-sol, which can't run without reasoning.)
- **Prepared verdicts:** an answer that matches a prepared right or wrong answer is confirmed by the voice instantly. Anything else is checked in the background and the verdict sent as an update.
- **Off the critical path:** the classifier no longer gates the voice's reply. It runs alongside, for the learner model.
- **Measure on every turn:** time to Plato's first word and time to verdict, logged per turn, so the latency claims can be checked.

## How we'd get there

1. **Lessons and the contract (backend).**
   - Build lesson scripts per section from the existing course model.
   - Add the contract and a lesson-ordered walk that starts from the contract.
   - Already built course models are reused.
2. **Voice holds the lesson.**
   - New voice brief and card format: a lesson script plus updates.
   - The director moves off the reply path.
   - Faster voice model.
3. **Verdicts and change of course.**
   - Background checking with verdict updates.
   - Evidence-gated diagnosis.
   - Revised plans on repeated errors or requests.
4. **Replay both failed sessions as scripted scenarios** in the stand-in harness (no ElevenLabs) until they read like a good tutor. Then you test live.

Phase 1 is a day or so of work. Each phase is testable on its own.

## Decisions for you

1. **Lessons over arcs.** OK to make the lecture-section lesson the unit of teaching, with KCs and misconceptions as ingredients rather than the driver?
2. **Default teaching mode** for a new learner: explain first (recommended), or read first?
3. **Voice model:** go back to a no-reasoning voice for speed (recommended), accepting a slightly less capable voice? The teaching intelligence moves to the prepared lesson and the background director.

## Appendix: local causes found in the two sessions

Some of these are already fixed in code; none of the fixes change the conclusion above.
- The intro was carried over from an older session that never asked about lectures. *Fixed.*
- The walk started on a whole unit, so the "most needed" KC (transistors as AND/OR gates) won over lecture order.
- Exam-week pacing removed readings, which reversed the "reading is teaching" rule. My regression.
- The re-ask guard fired on "what's going on?" and on frustration. *Fixed.*
- A pending verdict produced a hint. *Changed to asking for their reasoning.*
- A separating question was asked on one answer. *Now gated on two or more answers.*
- `change_topic` turned sentences into goals.
- `think` and the writer authored plans and wrongly claimed lecture 1 wasn't available.
- The lecture walk took 12 s per call. *Fixed: 0.1 s.*
- The voice runs gpt-6.1-sol, which can't run without reasoning.
