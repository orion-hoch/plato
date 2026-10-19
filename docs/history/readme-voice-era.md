# Plato

A voice study tutor for any course. Drop in your notes, slides, problem sets or past exams. Plato reads them, builds a map of the course and teaches you through it by voice. While it talks, it uses a shared page: code, math, diagrams, things to try, and room for you to write. It runs on your own machine.

## Quick start

1. Install Node 22.13 or newer (Plato uses `node:sqlite`).
2. Install the Codex CLI and sign in with ChatGPT: `codex login`. Every model call goes through that sign-in.
3. Copy `.env.example` to `.env` and set `ELEVENLABS_API_KEY`.
4. Run `node scripts/setup-tutor-agent.mjs`. It creates the private ElevenLabs agent that plays Plato's voice, or updates it if it exists, and writes `ELEVENLABS_AGENT_ID` into `.env`.
5. Run `npm install`, then `npm run dev`, and open http://127.0.0.1:5188.

For everyday use, run `npm run build` once and then `npm start`. That serves the built page with long-lived asset caching, security headers and a `GET /healthz` check. The server listens only on 127.0.0.1. `PORT` and `PLATO_DATA_DIR` change its port and where it keeps its data. `.env.example` lists every setting.

## Using Plato

- **Talk, type or write, at any time.** The microphone is off until you turn it on: the round button at the bottom right, or Space (with nothing typed), toggles it. To type, just start typing: there is no text box, the line shows at the foot of the screen, and Enter sends it. You can write or draw anywhere with a mouse, pen or finger. Cmd/Ctrl+Z undoes a stroke. While there is writing, an eraser and a clear button appear. When you pause, Plato glances at what you wrote, so you can just ask "is this right?". Enter, or telling Plato you're done, hands your writing in. Without a microphone the conversation continues in text.
- **The page.** When Plato shows you something, the stones of the sphere form a frame around a clean page. It can show code (C and RISC-V, highlighted), math, tables, worked steps that appear one at a time, diagrams, quotes from your own notes, and formulas whose variables you can slide. Interactive pieces are built in the background while it keeps talking: circuits you can toggle, step-through traces of code, 3D scenes, sorters, timelines, argument maps, number lines and more. A question goes under the material it's about. You can answer it by tapping, saying, typing or writing.
- **Work zones.** When you should do the work yourself, Plato opens a zone under the material:
  - a **code zone** with an editor and a terminal under it. RISC-V runs and steps on the page. C compiles and runs in a macOS sandbox with no network, no file writes and 2 seconds of run time. Cmd/Ctrl+Enter runs your code.
  - a **LaTeX zone** with your working as steps. Enter starts the next step as a copy of the current one.
- **The conversation.** On a wide screen with the page up, the page is on the left and Plato's lines run down the right. Each line appears once he has finished saying it. On a phone his lines sit under the page. Only Plato's words are shown. The × hides the log and the round button at the top right brings it back.
- **Sessions.** The first session is a greeting and at most two questions: what you're aiming for (an exam and its date) and where you are in the lectures. After that Plato teaches the course in lecture order, starting where you are. It teaches first and tests only once it expects you to know the material. In the week before your exam it moves faster: each idea is taught, then tested, with no long readings. It moves to the next topic once you've shown it, and remembers where you got to, so the next session carries on from there. Ask for something else ("give me a RISC-V problem instead") and it switches. Practice questions and multi-part exam problems arrive on the page, with a place to work each part. Refreshing the page resumes the session where you left it. The top left shows the current topic in a word or two. It doesn't fill silence or check whether you're still there.
- **Your course tree.** The round button at the bottom left opens the course as a scrollable tree of units and topics, each filling as you master it. Beside it is what Plato believes you can do and what it is still working on with you. Press a topic to study it now.
- **Drop anything in.** Drop or paste PDFs, Word, PowerPoint, Markdown, text, CSV or images, several at once. Files for a course that's already set up are split into problems, definitions, examples and notes, and each piece is filed under its topic. Plato tells you where things went. A file the quality check holds back can still be used: `POST /v1/exams/{id}/sources/{fileId}/accept`.

## How it works

Plato is two minds:
- The **actor** is the voice you talk to: an ElevenLabs agent running `gpt-6.1-sol` with a short brief and seven tools.
- The **director** is the teaching brain in the backend. It reads the course and you, and decides every move.

- **Moves arrive as cards.** The director sends the actor one short card at a time (`shared/cards.mjs`). A card holds what to say, one question, what goes on the page, and a prepared reply for each likely answer: the right one, the usual mistakes, and "I'm stuck". The actor matches your answer to a branch and replies at once.
- **What isn't prepared is streamed.** For an answer no branch covers, the director streams a new card on a fast lane. Hard or off-card questions go to `think`, and the actor says a short holding line while the answer comes from your course.
- **Your answers become evidence.** Each answer updates an estimate of what you know per concept: an ability θ with an uncertainty σ (`backend/learner/v2.mjs`). Concepts you haven't been tested on are inferred through the course's links. Goals move on that evidence, never because the actor decided to.
- **The course model.** `backend/understanding` studies a course in checked stages and records:
  - knowledge components, the usual wrong models and how to repair them;
  - probes, readings and how answers are verified.

  Five domain adapters cover computational, formal-quantitative, textual, case-reasoning (law, medicine, business) and language courses. Each picks its own answer checks: running the code, proving algebra equal, checking sources, a panel of expert stances for judgement calls, and a production check for language answers. A check that can't decide asks the student rather than guessing.

  Every course is studied in the background once its files are read, and the topic you're on goes first. A topic is taught from its course model as soon as that is built: the director builds cards and their follow-ups in code, with no model call. Until then, cards quote your notes on the topic and the director writes the next card.

The actor's tools (`backend/session/agent.mjs`, handled in `src/app/tools.js`):

| Tool | What it does |
| --- | --- |
| `think(question)` | Hands a hard or off-card question to the director. The answer arrives as a `[Thought]` line. |
| `change_topic(to)` | Moves the session to the topic the student asked for. |
| `collect_page_work()` | Takes the student's ink, zones, choices or exam parts as their turn. |
| `clear_page_writing()` | Clears the student's ink. It refuses while they are still writing. |
| `point_to(anchor \| phrase)` | Briefly marks part of the page, just before "this" or "here". |
| `read_aloud(from?)` | Reads the next paragraph of a reading word for word, only when asked. |
| `remember_preference(...)` | Records a preference, goal or exam date. |
| `skip_turn` (ElevenLabs built-in) | Stays silent: noise, filler, or while the student works. |

## Models

There are four settings in `.env`, each a model and an effort. All but the voice run through Codex (`server/runtime.mjs`).

| Setting | Default | Used for |
| --- | --- | --- |
| `PLATO_LIGHT` | `gpt-6-luna`, low | Answer classification and checking the correct answer; page transcription and region extraction (medium) |
| `PLATO_DEEP` | `gpt-6-astra`, high | Work prepared ahead: the course build, validators, the learner model, questions, modules, new files, the course model. Exam problems run at high in their own lane. Drawing reads and visuals run at low. |
| `PLATO_DIRECTOR` | the deep model, low | Cards for answers no branch covers, and `think` |
| `PLATO_VOICE` | `gpt-6.1-sol`, low (its fastest) | The realtime actor, hosted by ElevenLabs |

Work the student is waiting on runs on Codex's Fast tier (`priority`: 1.5–2× speed, more usage; `PLATO_REPLY_TIER=default` turns it off) and never queues behind background work. It has its own lanes:
- `director`: 4 at a time;
- `reply` (drawing reads): 4;
- `replyLight`: 4;
- `elements`: 2.

Background work uses `heavy` (16), `exam` (3) and `light` (6), on a Codex process of its own. Of the 16 job workers, 2 are kept for live turns and long builds take at most 12.

## Layout

| Path | What |
| --- | --- |
| `server/` | The local server: the Codex runtime and its lanes, the HTTP backend, voice tokens (`/api/session`), and the web app (Vite in dev, `dist/` in production) |
| `backend/core` | Database, durable jobs (leases, heartbeat, retries), outbox events, blobs, auth and scope, validation, topic matching |
| `backend/db/migrations` | The SQLite schema |
| `backend/http` | Routes, `Idempotency-Key`, SSE events |
| `backend/director` | The teaching brain: cards, answer classification, the intro, `think`, topic switches, the move policy |
| `backend/session` | The live session: turns, responses, goals, progress and focus, the delivery ledger, drawings, and the actor's prompt and tools |
| `backend/learner` | The θ/σ learner model, evidence, rubric grading, profiles |
| `backend/understanding` | The course model: domain adapters, the staged study, verifiers |
| `backend/knowledge`, `backend/ingest` | Uploads, extraction (PDF pages read into markdown), interpretation, the topic graph; filing new files into topics |
| `backend/modules`, `backend/questions` | The knowledge tree (units › topics › subtopics › concepts); the question bank and exam problems |
| `backend/elements`, `backend/run` | Visuals made in the background; the sandboxed C runner |
| `backend/providers` | Codex adapters (live) and mock adapters (tests) |
| `shared/` | Code the page and the backend share: cards, board kinds, the element registry, rich text |
| `src/app/` | The page: voice, cards, ink, work zones, keys, file intake, the actor's tools |
| `src/` | The sphere, the page and its visuals, elements, the course tree, and `tutor-bridge.js` linking the page to the backend |
| `scripts/setup-tutor-agent.mjs` | Creates or updates the ElevenLabs agent |
| `evals/` | Whole simulated sessions and the understanding suite |
| `voice-lab/` | A separate app comparing voice providers (`npm run voice-lab`) |
| `docs/` | Design and research; start at `docs/README.md` |
| `archive/` | Earlier attempts and removed code, by version |

## Tests and evals

`npm test` runs about 200 tests:
- the page's tests (`tests/`);
- the backend's core and HTTP tests;
- the spec's acceptance scenarios (`backend/test/acceptance`), which run against a real database, jobs and storage with deterministic mock providers.

`npm run check` runs the tests and then the build.

These show the software is correct, not that the teaching works. For that:
- `node evals/stand-in.mjs <scenario>` runs a whole session on a sandbox copy of your data (port 5199). A simulated student talks to a local stand-in for the voice, so it never calls ElevenLabs.
- `node evals/understanding/run.mjs --fixture <course> --level <n>` scores whether Plato understands a course and teaches from that understanding. See `evals/understanding/README.md`.
- `evals/live-session.mjs` and `evals/agent-live.mjs` use the real voice agent. They spend ElevenLabs credits, so they refuse to run without `--use-elevenlabs`.
