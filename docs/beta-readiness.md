# Plato beta readiness (19 Oct 2026)

**Goal (the owner, 19 Oct):** "plato is an open source harness that they just connect their claude or openai subscription into and be able to use."

So Plato is an app each student installs and runs on their own machine. They connect their own Claude (Claude Code login) or ChatGPT (Codex login) subscription; there's no shared server and no accounts. A closed beta means about 10 to 20 people installing it from the repo and studying their own courses with it.

This plan comes from a code audit of Luna-Study-lab on 19 Oct (file:line evidence is in the session notes). It is ordered by what blocks first.

## What already fits the model

- **Credentials stay with the CLIs.** Plato never sees a key. `server/codex.mjs` passes only HOME/PATH-style variables to `codex`, and `claude` runs on its own login.
- **Two model providers already exist for the lightweight text calls:** `server/runtime.mjs` (Codex app-server, ChatGPT login) and `server/claude-runtime.mjs` (`LUNA_MODELS=claude`).
- **Local and contained:**
  - the server binds 127.0.0.1;
  - per-learner scoping in the API;
  - structured errors and upload limits;
  - figure pages served with `CSP: sandbox allow-scripts`;
  - course-build agents sandboxed with no network.

## Blockers for an installable beta

| # | Problem | Fix | Size |
|---|---|---|---|
| P1 | Everything agentic is **Claude-only**: Plato's turns (`claude-actor.mjs`), course builds and kits (`build-course.mjs` `agent`), review, anatomy, animate. Each one spawns `claude` directly. | One agent runner, `backend/agents.mjs`: `run(cwd, brief, { files, stream, model })`, backed by `claude -p` or `codex exec` (sandbox `workspace-write`, network off). Everything goes through it, with the provider chosen at setup. Each has its own prompt quirks; run lesson evals on both. | 2 days |
| P2 | The Claude tutor works **only in Vite dev mode** (`/dev/actor`, `import.meta.env.DEV`); `npm start` has no tutor. | Make the actor a real route (`/v1/sessions/{id}/actor`, token-checked), and drop the DEV gate. | 1 day |
| P3 | **No setup.** The Logic-sim bundle, anatomy clone, Manim venv, TinyTeX/tectonic, Chrome and the shelf are hand-installed on one Mac. | `npm run setup`: installs dependencies, builds the shelf and logic-sim, and finds Chrome; Manim and TeX are optional. A first-run screen: "Connect Claude" or "Connect ChatGPT" (runs `claude` / `codex login` status checks), and shows which extras are on. Every optional tool degrades cleanly (`circuitsReady`, `manimReady` already do). | 1.5 days |
| P4 | **Code that runs on the student's own machine, steered by their uploads and chat:** the C runner can read any file (`backend/run/index.mjs` `(allow default)`, `cc` unsandboxed); anatomy and Manim builders run model-written code unsandboxed; build agents can Read outside the course folder. On someone's own laptop, a poisoned PDF must not read their files. | Sandbox reads too (course folder and system libs only) for the runner and every agent; the same settings for anatomy and animate. macOS seatbelt today, so Linux needs bubblewrap or no C runner. | 1 day |
| P5 | **Upload names** could write outside the course folder. | Done in lab, 19 Oct (`path.basename`). | done |
| P6 | **Unauthenticated local routes** (`/checkpoint`, `/material-note`, `/figures`) can be reached by any page open in the user's browser (localhost CSRF). | Done in lab for checkpoint and material-note (Bearer token + `requireExam`). Figures still to do. | 0.5 day |
| P7 | **Hard-coded to the owner:** `HARNESS_SINCE`, CS 3410 practice-prelim helpers, the absolute ASR path, the circuit line in every course's brief (it should be a kit), `/Users/orionhoch` paths, the ElevenLabs voice. | Remove or make per-course; voice optional. | 0.5 day |

## Should fix for beta

- **Personal data at rest:**
  - Server-spawned CLI calls save transcripts into the user's own `~/.claude/projects` (1,605 folders today) and leave temp folders (1,083).
  - Turn session saving off for Plato's calls, and delete temp folders.
- **Deletion:** deleting a course should remove `study-guides/<id>`, its checkpoint and its figures, not just database rows.
- **Failure messages:** "Plato is busy (your subscription's limit), try again in a minute" instead of "(error)"; no silent fallback to the other provider.
- **Subscription limits:** a course build is many Opus calls (units, audit, practice, kits, checks). Show its progress and let it pause and resume on a rate limit; it already resumes after a crash.
- **Cross-platform:** macOS first; Linux next (sandbox); Windows later.
- **License and contribution:** LICENSE (the shelf libraries are MIT/BSD/ISC; JSXGraph is MIT or LGPL; the anatomy skill and logic-sim are MIT), README with setup, and a privacy note: "your material and chats stay on your machine and go only to the model provider you connected".

## Product work ready (built in lab, not yet merged)

- **Checkpoints:** the whiteboard, chat, Plato's memory, ink and drafts survive reloads, restarts and lost sessions.
- **Notebook:** past boards (automatic, whole) and saved sections (starred), shown in a side panel; adding appends to the board.
- **"What is this?" on upload:** the student's note goes into Plato's brief, and "closest to my exam" rebuilds the practice exams on that model.
- **Latency:**
  - A new file in an existing course is searchable in about 10 s and folded into the guide in about 75 s (settle wait cut from 30 s to 10 s).
  - A new course: planned in about 1 min; units written 3 at a time.
- **Kits:** the course build decides which figures the subject needs, builds each kit from a shelf of libraries (`tools/shelf`), draws its examples in headless Chrome, has a second agent check the pictures, and installs only the kits that pass. Plato gets `kit(name, title, spec)`. First test: a fictional organic chemistry course, for which the build chose a bond-line structure kit and a curved-arrow mechanism kit by itself.

## Beta test plan

1. Fresh install on a clean Mac account from the README, with both a Claude and a ChatGPT login. Time from clone to first lesson.
2. Three subjects from scratch (quantitative, kit-heavy like organic chemistry, essay-heavy), each with lesson evals on both providers.
3. Three testers for a week, reporting failures and limit hits. Then 10 to 20.
