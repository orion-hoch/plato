# Guide mode: the build contract (12 Oct 2026)

How the hybrid in `docs/teaching-redesign.md` (option C, as refined by the user) is built. This file is the interface every part builds against; change it here first.

## The idea in one paragraph

For new material, the tutor gets a **guide** per lecture section: what the section is about and where it sits, the ideas in order with explanations and examples, boards it can put on the page, optional questions with verified answers, and the usual confusions. **The guide is a resource, not a script.** The voice (gpt-6.1-sol, low reasoning) decides turn by turn whether to explain, show something, answer, re-explain, ask a question, or move on. Questions are one tool among several, never a required step.

The director works in the background:
- it checks answers to a question the tutor put up;
- it records evidence;
- it sends short advisory notes;
- it prepares the next section's guide.

It never issues moves in guide mode. Practice and exam problems still use the existing arc engine (`backend/director/policy.mjs`), only when the learner asks for practice.

## Guide (backend/lessons/guide.mjs)

```js
buildGuide({
  topic,      // { topicId, title, lecture /* "Lecture 2: Numbers" | null */, parentTitle /* unit title | null */ }
  slice,      // the topic's studies row (LOCAL ids: kcs[].id 'k1', problems[].id 'p1', …) or null (no course model yet)
  passages,   // [{ lecture, section, text, anchorId }] the topic's lecture passages (the notes), in order
  prev, next, // { topicId, title } | null: the sections before and after in the lecture walk
  readingOf,  // readingId => { kind: 'reading', portion, highlight } | null   (director supplies, via understanding.reading)
  crunch,     // within a week of the exam: fewer, more exam-like questions offered; nothing taken away
}) → Guide

Guide = {
  id: `guide:${topicId}`, topicId, title, lecture, source: 'course_model' | 'notes',
  story: { before: string | null, about: string, next: string | null },   // one sentence each, plain words
  ideas: [{ id: 'i1', kc: 'k1' | null, title /* ≤ 60 chars */, plain, mechanism | null, example | null, boardIds: string[] }],
  boards: [{ id: 'b1', label /* ≤ 60 chars: what it is */, use: 'explain' | 'example' | 'reading' | 'visual' | 'question' | 'notes',
             show /* passes shared/cards.mjs checkShow */, ideaId | null, questionId | null }],
  questions: [{ id: 'q1', ideaId, kc, itemId /* local problem id */ | null, spoken /* ≤ 170 chars */, boardId,
                answer /* WITHHELD: director only, never sent to page or voice */, mistakes: [{ wrongModel, belief }],
                kind: 'check' | 'practice' }],
  confusions: [{ wrongModel, kc, belief, fix }],
  takeaway: string,
}

guideText(guide, { shown = [] /* board ids already on the page */, said = [] /* what the learner said about how they learn */ }) → string
// The voice's brief for the section: a compact outline (story; ideas with plain words; board ids + labels; question ids +
// spoken form; confusions). No answers. ≤ ~3,000 characters.
publicGuide(guide) → the guide without `questions[].answer` (what the page receives).
```

Sources, from the course model (`studies` row):
- `explanations[]`: `{ kc, plain, precise, mechanism, analogies, workedExamples? }`
- `readings[]`: `{ id, kcs, purpose, level, ... }`, made into a page show through `readingOf`
- `representations[]`: `{ id, kind, kcs, board }`, where `board` is a ready board
- `problems[]`: `{ id, kc, prompt, answer, rubric, element, verification }`
- `wrongModels[]`: `{ id, kc, belief, errorKind, ... }`
- `route.novice[]`: ordered steps; the order to present ideas, and their asks and expected replies (use as hints, not a script)
- `enduring[]`: the takeaway

Without a course model, the guide comes from `passages`: ideas are the passages' sections, boards are notes quotes, and there are no questions with verified answers (`source: 'notes'`).

## The guide card

The director issues one card per section:
- `move: 'present'`, `act: 'guide'`, `wait: 'recall'`
- `say: ''`, `ask: null`, `show: null`, `expect: []`
- `target: { kc: null, topicId, statement: guide.title }`
- `guide: publicGuide(g)`, `thread: topicId`
- the usual `intention`, `why`, `goalId` and `goalTitle`

The full guide, answers included, stays in director state (`stateOf(s).guide`).

`agent.actorCard(card)` renders a guide card through `guideText`, plus these instructions:
- "You choose how to teach this section."
- "Show boards with `show`."
- "A question is optional; use one when it helps."
- "Call `move_on` when the section is covered or they want to go on."

## New voice tools (ACTOR_TOOLS, src/app/tools.js, evals/stand-in.mjs)

| Tool | Args | Effect | Returns (for the voice) |
| --- | --- | --- | --- |
| `show` | `{ board }` (an id like `b3`, or words matching a label) | The page shows that guide board, kept on the page with this section's earlier boards (thread = topicId). A question board makes that question the active one. | "On the page: <label>." or "No such board; available: …" |
| `move_on` | `{ why? }` | The section is done for now. The walk moves on and the next guide card follows. | "Next: <section title>." |
| `practice` | `{ about? }` | Switches to practice/exam problems (the arc engine, session kind `exam_practice`) on this section or `about`. | what comes next |

HTTP: `POST /v1/sessions/{sessionId}/guide` with body `{ action: 'show', board }`, `{ action: 'move_on', why }` or `{ action: 'practice', about }`. The response is `{ say, boardId?, card? }`.

## Background notes to the voice

Server event `tutor.note` with `{ text }`. The page passes it to the voice as context (`toAgent`). It doesn't force a turn; the voice uses it on its next reply. Note texts:
- `[Checked] Their answer to q2 is right (verified): <short reason>.`
- `[Checked] Their answer to q2 is not right: they gave X; the answer is <withheld unless H3>; <fix>.`
- `[Checked] Couldn't verify their answer to q2; ask how they got it.`
- `[Note] They've shown <idea>; fine to go on.`
- `[Note] They may be thinking <belief>; <fix>.`
- `[Note] Next section's guide is ready: <title>.`

## Director in guide mode

1. A learn-mode walk goal (`why: 'it comes next in your lectures'`, or a topic they asked for) → build the guide and issue the guide card. This happens at `opening`, and after `move_on`.
2. A student line while a guide card is current:
   - no new card;
   - if a question is active and the line is an attempt, verify it (the existing verifier and exact matching, as for an item card), record the observation, and emit a `[Checked]` note;
   - no classifier on the critical path.
3. `move_on` → `S().advance(goal)`; `walked()` records the position; the next section's guide card follows.
4. Notes are rules first, with no model call:
   - two right answers on an idea → "shown";
   - a wrong answer matching a known misconception twice → "may be thinking".
5. Practice mode: `practice` sets the session kind to `exam_practice` and opens the arc engine on the section's KCs. `move_on` there returns to guide mode.

## What does not change

- The course model and its builds.
- The learner model (evidence and θ/σ).
- The verifiers.
- The knowledge graph.
- The page's board continuity (`src/app/page.js` thread/past).
- The intro (two questions).
- The arc engine, which is still used for practice and exam problems.

## Show-first teaching (13 Oct 2026)

After the 13 Oct live session ("don't speak it at me; write it down"), teaching shows how things work on the page.

- **`write` tool** `{ title, markdown }` → `POST /guide { action: 'write' }`. The tutor's own board goes up at once with no model call (markdown, tables, math, code; up to 1,390 characters per board, and boards stack). The last six are kept in `guideWritten`.
- **Voice rules:**
  - Anything with numbers, steps or a procedure is written as it is said.
  - Examples are made from the session: their numbers, their mistake, the problem on the page.
  - A request to see something is met in the same reply.
  - A "your turn" problem is a new case without its answer.
- **Practice pool, in order:**
  1. their own problems with official solutions (`module_items` of kind `problem`: the practice prelim, psets): the section's, then its unit's;
  2. the course model's questions;
  3. the generated bank.

  A requested kind must match every word of the request; otherwise their own problems anywhere in the course are tried, then one is made.
- **`make_problem`** gets the last ten lines of dialogue and two of their own exam problems as style exemplars (`director_problem_v3`).
- **`think`** in guide mode sees the active problem in full and the tutor's written boards (`guidePage`).
- **Checks:**
  - A check whose student line was superseded is dropped; the newer line gets its own check.
  - The checker sees the tutor's last line, so a step the tutor set is judged.
  - Multi-part problems are judged part by part (`director_check_v3`).
  - An undecided check hands the verdict to the voice; it never asks "how did you get that?".
