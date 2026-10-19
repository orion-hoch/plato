# A deep mind behind a fast voice: the director and the actor

> **Status (11 Oct 2026): rationale, built.** The split described here shipped in v10. Some of it reads as "today" but describes the system before v10. Now cards are built from the course model with no model call, and a model writer is only the fallback (`backend/director/index.mjs`). Prepared lessons and question ladders are gone; only the help ladder H0–H4 remains. The card format is v2 (`shared/cards.mjs`). For the current design read `system-spec.md`.

What it takes for Plato to reason deeply about each student while staying instant and easy to talk to. Written 2026-10-07, after live evals of v7–v8.

## Why force-feeding the lesson plan doesn't work

Today the fast voice model (gpt-6-sol, no reasoning, ~1 s) gets three things:
- ~16k characters of rules and 18 tools;
- a ~14k-character brief (goals, the whole lesson with steps and ladders, the centred tree view, the course map);
- a "plan update" from the deep model 5–10 s after each turn.

It is then expected to follow the lesson, track steps, climb ladders, manage the agenda with tool calls, pick board tools, and ground everything in the notes.

That design has five structural problems:

1. **The wrong mind holds the plan.** Keeping to a long plan while reading a student needs reasoning. The fast model has no reasoning budget, and its adherence decays as the lesson sinks further back in a growing context. Evals showed it: steps advanced slowly, goals were closed early, and the agenda churned when Plato managed it with tools.
2. **Plans are stale on arrival.** A lesson written before the session can't know how this student just answered. The right next move depends on that answer, and the deep model sees it only after the reply has already been spoken.
3. **The deep mind only advises.** Plan updates are suggestions dropped into a crowded context, and nothing makes the fast model act on them.
4. **Too many voices.** Prompt, brief, lesson, tree view and plan update overlap. The fast model blends them, which reads as "lost" and "static".
5. **Thinking happens in the wrong place.** About 30k tokens go to the fast model every turn, while the deep model sits idle between turns.

## The principle: the deep mind decides, the fast mind performs

Every teaching decision is made by the deep backend, the **director**: what comes next, how hard, which misconception this answer reveals, when a goal is met. The fast voice model is the **actor**: it performs the current move well, handles conversation (interruptions, "repeat that", chit-chat, silence), and recognises which prepared branch the student's answer falls into.

### The move card (the interface between them)
The actor never sees the whole lesson. It sees one short card at a time:

```
MOVE 7 · Two's Complement · aim: decode with the −8 weight
Board: the 4-bit place-value table (prepared, board 3)
Ask: "What is 1101 in 4-bit two's complement?"
Expect −3      → "Right: minus 8, plus 4, plus 1." Then MOVE 8 (ready): why +8 doesn't fit.
If 13          → reads it as unsigned: "That's 1101 unsigned. Here the top bit weighs −8…" Then ask 1110.
If −5          → sign-magnitude: "That's sign-magnitude. In two's complement…" Then ask 1110.
Stuck          → hint: "Start from −8 for the top bit and add the rest."
Anything else  → acknowledge in a line, then call think(…).
```

The card is short, local and explicit, so a fast model can carry it out reliably. Branch selection is a quick match, not reasoning. Grounding is enforced when the director writes the card from the knowledge tree (concepts with `[src]` refs, mistakes, exam goals), not by asking the actor to remember sources.

### Speculation hides the deep model's latency
- **Branches are ready before the answer.** When a card goes out, the director starts on the follow-up cards for its branches while the student is still thinking. When they answer, the actor picks a branch and speaks at once, and the next card for that branch is often already prepared.
- **Unprepared answers are refined in the background.** If the answer fits no prepared card, the director refines while the actor is speaking its branch reply, which takes 5–10 s of speech and covers most of the deep model's time.
- **Branches are reused.** Misconception branches are cached per concept, so common wrong answers ("reads it as unsigned") are prepared once and reused across students and sessions.

### Escalation instead of improvisation
For anything off-script (a hard question, an answer it can't place, "why does the stack grow down?"):
1. The actor says one natural holding line ("Good question, let me think about that properly") and calls `think(question)`.
2. The director answers from the course in 3–10 s, often with a board item, and the actor delivers it.

This is how the deep mind lifts the fast one: hard reasoning goes up to it on demand, and the actor never bluffs. A human tutor's "hm, let me think" works the same way.

### Evidence drives everything
- **Assessment and difficulty.** Each answer is assessed by the director against the card's expected answers and the rubric. That updates the student model: misconceptions, mastery, confidence. The student model sets the next move and its difficulty: exam level by default, scaffolds only after a miss.
- **Goals move only on evidence.** Goal and step transitions happen in the backend when evidence says so. The actor has no agenda tools to misuse.

### One source of truth
- **The backend owns the session state:** goal, step, rung and student model.
- **The actor gets only deltas:** a new card, plus at most a one-line situation. It doesn't re-read the course every turn.
- **Its prompt shrinks to about 3–4k characters:** persona, speaking style, how to use cards, silence, escalation.

## What this asks of the pieces we already have
- **Lessons, ladders, the knowledge tree and the question bank** stay. They become the director's material for writing cards, not text for the actor to read.
- **The per-turn planner becomes the director.** It still runs on every turn, but instead of advice it produces cards: the current one plus branches.
- **Assessment** gets one more input: the branch the actor chose, as a fast first signal.
- **The page** shows the card's prepared board items, reports which branch was taken, and offers `think`.
- **The actor's prompt and tools get smaller:** about 8 tools instead of 18. Work zones and exam problems are opened by cards.

## Costs and risks
- **More deep calls:** a card plus 2–4 branches per turn. Bounded by preparing only the most likely branches, caching misconception branches per concept, and stopping speculation while the student is silent or writing.
- **Uncovered answers:** they fall back to `think`, which means a 3–8 s natural pause. Measure how often it happens and widen branches where it's common.
- **The actor may still deviate,** but with a short context it deviates far less. That is measurable.
- **The director becomes the core.** If a card is late, the actor uses the last card's generic continuation, so it is never silent or stuck.

## How we'd test it without ElevenLabs
- **Stand-in actor:** a local stand-in plays the actor with the same short prompt on a fast model through the existing Codex runtime, against the real backend in a sandbox copy, with a simulated student. No ElevenLabs credits are used.
- **Same check for today's design:** the same stand-in runs the current design, so the two can be compared fairly.
- **Metrics:**
  - lesson steps reached per 10 turns;
  - misconceptions caught and repaired;
  - how often an answer matches a prepared branch;
  - time from the student's answer to the next card;
  - lectures named and grounding;
  - a judge's rating.
- **Voice check:** only the final check uses voice, and only with the user's go-ahead.

## Rollout
1. Build the director and cards behind a switch, with the old path kept as a fallback, plus the stand-in harness. Compare both on two or three scenarios.
2. If cards win, make them the default and slim the actor's prompt and tools. Then deploy once.
