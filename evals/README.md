# Session runs

Two harnesses play a simulated student against Plato. Both run a sandbox backend by default and write the same record
and checks (described below).

- **`stand-in.mjs` (use this for testing):** no ElevenLabs. A local model stands in for the voice agent.
- **`live-session.mjs`:** the real page and the live ElevenLabs agent. It spends the user's ElevenLabs credits, so it
  refuses to run without `--use-elevenlabs`. Pass that only with the user's go-ahead.

`common.mjs` holds what they share: the sandbox, the simulated student, the checks, the judge, and the files a run writes.

## Stand-in runs (no ElevenLabs)

```
node evals/stand-in.mjs wants-real-work --intro             # scenario A, as an intro session
node evals/stand-in.mjs missed-arrays                       # scenario B
```

- **The actor** is the Codex runtime's light role at low effort, the nearest stand-in for the voice model. It gets what
  the voice agent gets: `ACTOR_PROMPT` and `ACTOR_TOOLS`, and the director's cards.
- **The page's bridge** (`src/tutor-bridge.js`) runs in Node against the sandbox. It keeps the session and decides which
  lines reach the actor, as on the page.
- **Turns.** Each turn the actor returns `{ say, tools }`. Each tool call is typed by that tool's own parameter schema,
  as the voice agent's function calls are.
  - Tools run the way `src/app/tools.js` runs them. Those with a backend effect go to the backend (`think`, `change_topic`,
    preferences); page-only tools return the page's result texts.
  - A tool that returns a result gets one more round, up to 3 actor calls a turn.
  - It follows the page's `cardIssued`, `thoughtReady` and `thoughtUpdated`:
    - a card's text goes in as context, and its board goes up on a stand-in board;
    - after `think` the actor only holds (one line);
    - the `[Thought]` (with "From: <lecture>") is Plato's next turn if the student hasn't spoken since, otherwise it
      is context;
    - a streamed thought's board comes as an "[On the page now]" note;
    - after 30 s with no thought, the page's "[Couldn't think it through]" line is his turn instead.
  - It also records, for each answer, the branch the director matched (from `director_state`, read-only from
    the sandbox copy), and its student model at the end.
- **Pacing.** The student hears Plato's reply at 14 characters a second, then types at 6. The director
  works in that time, as it does in a voice session. Without it, every card arrives stale.
- **Options:** `--turns N` (default 10, at most 12), `--intro`, `--no-judge`, `--student <module>`, `--data <dir>`,
  `--topic <topicId>`, `--port N`, and `--keep` (keep the sandbox; without it, the sandbox is deleted once the record is
  written).

How it differs from the real voice agent:
- Text in, text out, so there's no audio: no interruptions, no ElevenLabs text normalisation (it strips `*`), and no
  turn-taking from voice activity.
- The actor is gpt-6-luna, not gpt-6.1-sol, and is called afresh each turn with every context line it has had.
- Replies take model time, about 4–8 s a round; the voice agent answers in about 1–2 s. The first-reply latency measures
  the stand-in, not the product.
- A visual made in the background arrives as a context line, never as the student's turn.
- Typed answers to a posed graded question go in as plain lines.

## Guide-mode replay and the tutor judge

Guide mode (`docs/teaching-guide-spec.md`) in the stand-in:
- `show({board})` resolves against the current guide card's `guide.boards`: id first, then the label sharing the most
  words. The board goes up on the stand-in page, and `POST /v1/sessions/{id}/guide {action:'show', board}` is sent.
- `move_on({why})` and `practice({about})` POST the same route and return its `say`.
- A server `tutor.note` goes to the actor as a context line, not a turn.
- A scenario with `"intro": true` runs as an intro session, as `--intro` does.

The scenarios (`evals/scenarios/`):
- `fresh-know-nothing`: replays real session 2.
- `frustrated-lost`: replays real session 1.
- `wants-practice`: a student who wants exam problems on two's complement.
- `steady-learner`: works through lecture 2 properly.

```
node evals/replay.mjs                                  # all four, 12 turns each, then the judge; --port N, --turns N
node evals/replay.mjs steady-learner --turns 6         # some of them
node evals/tutor-judge.mjs evals/runs/<run-dir>        # judge one run (writes judge.json next to run.json)
```

How the replay runs:
- `replay.mjs` runs each scenario through `stand-in.mjs --no-judge`, one after another. Each run makes its own sandbox and
  deletes it afterwards.
- It then judges each run and writes `evals/runs/replay-<time>/summary.md`. The summary has the scores per principle, the
  total, pass/fail, the latency p50/p95 and each run's worst moments.

How `tutor-judge.mjs` judges a run:
- It makes one heavy-model call at medium effort, with a strict JSON schema. The prompt carries the version string
  `JUDGE_VERSION`.
- It scores the tutor 0–2 on 8 principles. Each score comes with a reason that quotes the run.
  - `*` means the run gave no occasion to test that principle.
- It names the 3 worst moments.
- Pass means no principle scored 0, the total is at least 12/16, and there was no incident. A run with no turns always fails.
- Latency is measured from each student line to Plato's first reply and to the next `card.issued`, both before their next
  line.

# Live session runs (ElevenLabs)

`live-session.mjs` plays a student against the real Plato: the page in headless Chrome, the real backend and the live
ElevenLabs agent. The student types each turn the way a person does (keys anywhere, then Enter). Plato's tool calls are
answered by the page's own code.

```
node evals/live-session.mjs wants-real-work --simulate --intro --use-elevenlabs   # scenario A, as an intro session
node evals/live-session.mjs missed-arrays --simulate --use-elevenlabs             # scenario B
node evals/live-session.mjs missed-arrays --turns 3 --use-elevenlabs              # scripted lines only, first 3
```

- **Sandbox (the default).** A run never writes the real learner's data. It snapshots `data/` into a fresh temp dir:
  - `backend.db` via `VACUUM INTO`, which includes the WAL;
  - `blobs/` and `local-principal.json`.

  It then starts a second server there (`PORT=5199 PLATO_DATA_DIR=<dir> PLATO_WORKERS=3 node server/index.mjs`, in dev
  mode, so `window.__plato` exists) and stops it after the run.
  - The snapshot dir (with its `server.log`) is kept for inspection. Its path is `sandbox.dir` in `run.json`. Delete
    old ones from the OS temp dir (`plato-eval-*`, about 60 MB each).
  - The ElevenLabs agent is shared with the real server.
  - Background jobs run in the sandbox too.
- `--live`: run against the dev server at http://127.0.0.1:5188 instead. Everything the student types becomes real
  evidence, and the real agenda moves.
- `--intro`: reset the intro in the sandbox copy, so the session is an intro session. This clears the exam's
  `introDoneAt` and stops earlier intro sessions' finished goals carrying over. It can't be combined with `--live`.
- `<scenario>`: a name in `evals/scenarios/` or a path to a JSON file: `{ title, examId, persona, lines: [...] }`.
- `--simulate`: the scenario's first line opens, then a simulated student writes each turn. It is the light model through
  `server/runtime.mjs`, reading the transcript and the board. Without it, the scenario's `lines` are typed in order.
- `--turns N`: at most N student turns (never more than 12). A run also stops starting turns near 5 minutes.
- `--no-judge`: skip the one LLM judgment per run (heavy model, medium effort).
- `--no-mic`: deny the microphone, so the page uses its text-only conversation (see Notes).
- `--simulate` and the judge need the Codex CLI signed in (`codex login`), as the server does.

A turn ends when Plato has replied and stopped speaking, no tool call is open, and nothing has happened for 2.5 s.
The hard limit is 60 s. "Stopped speaking" is read from the mosaic's label, but only for as long as his last reply
could take to say (12 characters a second). A stalled LiveKit signal can leave the label on "speaking".

## Output: `evals/runs/<time>-<scenario>/` (gitignored)

- `transcript.md`: the run in time order. Student and Plato lines, tool calls and results, boards as shown, agenda
  changes, every context line Plato was sent (cut to 400 chars), the network's view of the conversation, and the checks.
- `run.json`: everything: raw events (with full context lines and server events), turns, course facts (`lesson` is always null since v12).
- `checks.json`, also printed as a summary:
  - `repeats`: near-duplicate consecutive Plato replies (word overlap ≥ 0.75), and the same question asked twice
    (overlap ≥ 0.5).
  - `drift`: replies that share no content word with their goal (its title, and its lesson's summary, key points and
    step aims) or with the current card.
  - `stepsPer10Turns`: the lesson steps reached (from plan briefs, `show_lesson_board`, the agenda's step and cards),
    per 10 student turns.
  - `cards` (cards mode): cards issued, the median time from the student's answer to the next card, `think` calls with
    their median time to `thought.ready`, the branch-match rate, misconceptions caught and repaired, and `list`: each
    answer with its match, the card's ask and what Plato actually said before it (to check the labels by hand).
  - `topicChanges` (cards mode): each `change_topic` and what came back.
  - `actorMs` (stand-in): the actor's median model time per call.
  - `agenda`:
    - `flipFlops`: a done or skipped goal active or pending again.
    - Goals finished and added, and the current goal at the start and the end.
    - `completed`, and `moves`/`evidenceMoves`: agenda changes made by Plato's `update_agenda` (a call within 3 s
      before) or by the backend on evidence (planner, director, time).
    - `briefs`: the goal (and lesson step) each plan brief named, in runs.
    - `calls` and `refusals`: Plato's `update_agenda` calls by action. A call counts as refused when the backend held
      it back ("Not yet: …", "The agenda just moved: …", "That's part of …", "… is already …").
    - `lessonSteps`: per goal, the lesson steps the plan briefs named, and the steps shown with `show_lesson_board`.
  - `boards`: each board shown. `taught: false` means no Plato line in its turn or his next reply shares two
    content words with it.
  - `grounding`:
    - The course's lecture titles and topic titles named in Plato's replies. A one-word title counts only as the
      course writes it.
    - Replies citing their notes, lectures or readings, and grounded replies: those that name a lecture or carry a
      `[src:…]` ref.
    - Key points covered, for each lesson the session used: lessons the page fetched, `lesson.ready` events, and
      the current goal's lesson at the end. A point counts as covered when half of its content words appear in one
      reply.
    - Calls to the course tools (`show_lesson_board`, `show_from_notes`, `read_source`, `open_module`).
  - `words`: Plato's replies containing bracketed tags (such as "[focused]"; array indexing like `a[i]` doesn't
    count), replies with a `*` or saying it in words, and pointer code that looks like it lost its `*` (`int p = …`).
  - `centered`: the centered views Plato got: the `CENTERED ON:` titles in the briefs he was sent, and from
    `open_module`.
  - `judge`: "Did the tutor lead a coherent lesson from the course material?", scored 1–5 with reasons.

Some checks still look for things removed in v10–v12. These always come out empty or 0:
- `drift`'s lesson terms and `stepsPer10Turns`;
- `agenda`'s `briefs`, `calls`, `refusals` and `lessonSteps`;
- the course-tool calls under `grounding`;
- `centered`.

The removed things are plan briefs, lessons, `update_agenda`, `show_lesson_board`, `read_source`, `open_module` and `CENTERED ON`.

All of these are heuristics for spotting problems. Read the transcript before trusting a number.

## How it hooks the page (read only)

An init script runs before the page's code:
- It wraps the functions on `window.__plato.tools`, the object the conversation calls, and the bridge's `setAgenda`,
  `receive`, `onContext` and `onNews`.
- It records what the ElevenLabs SDK encodes and decodes over WebRTC: every `contextual_update` and `user_message`
  Plato is sent (after the page coalesces them), and his `agent_response`s.
- A text-only conversation (`--no-mic`) runs over the agent's WebSocket, so the harness also records those JSON frames
  (Playwright `framesent` / `framereceived`).
- It samples the board and the mosaic's speaking state every 400 ms.

Vite's hot-reload socket is held for the run, so an edit elsewhere can't reload the page mid-run. A reload is reported
as an incident.

## Notes

- **Microphone.** By default the browser's microphone is a fake device that hears silence. The page runs as it does for
  a person with a microphone who types. `--no-mic` uses the text-only conversation, which has used a WebSocket signed
  URL since v7.1. Before that, ElevenLabs closed text-only WebRTC conversations about 10 s after they connected.
- **Real data.** Only with `--live`: then runs are real sessions on the course. What the student types becomes evidence
  for mastery, and the agenda's goals move. The page always opens the newest course, and a run whose
  scenario names another exam stops. The session is ended at the end of the run.
- **Focus section.** Sessions start on the learner's active focus section, if there is one, so its first topic leads
  the agenda, even in an intro session.
- **Cost.** Each run is one ElevenLabs conversation (spoken replies), the backend's director on every turn, one
  light-model call per simulated turn, and one judgment.
- `agent-live.mjs` measures latency over the agent's WebSocket against the real server on :5188. It doesn't run the
  page, so it doesn't see its tools or board. It spends ElevenLabs credits and refuses to run without `--use-elevenlabs`.
