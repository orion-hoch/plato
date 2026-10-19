# Plato beta readiness (19 Oct 2026, updated the same day)

**Goal (the owner, 19 Oct):** "plato is an open source harness that they just connect their claude or openai subscription into and be able to use."

So Plato is an app each student installs and runs on their own machine. They connect their own Claude (Claude Code login) or ChatGPT (Codex login) subscription; there's no shared server and no accounts. A closed beta means about 10 to 20 people installing it from the repo and studying their own courses with it.

This plan comes from a code audit of Plato lab copy on 19 Oct (file:line evidence is in the session notes). It is ordered by what blocks first.

## What already fits the model

- **Credentials stay with the CLIs.** Plato never sees a key. `server/codex.mjs` passes only HOME/PATH-style variables to `codex`, and `claude` runs on its own login.
- **Two model providers already exist for the lightweight text calls:** `server/runtime.mjs` (Codex app-server, ChatGPT login) and `server/claude-runtime.mjs` (`PLATO_MODELS=claude`).
- **Local and contained:**
  - the server binds 127.0.0.1;
  - per-learner scoping in the API;
  - structured errors and upload limits;
  - figure pages served with `CSP: sandbox allow-scripts`;
  - course-build agents sandboxed with no network.

## Blockers for an installable beta

Status as of 19 Oct, in the `plato` repo (a clean copy of the lab code: no personal data, its own git history).

| # | Problem | Status |
|---|---|---|
| P1 | Everything agentic was Claude-only. | **Done.** `backend/agents.mjs` runs every agent and tool-less call on `PLATO_PROVIDER`: `claude -p`, or `codex exec` / `codex app-server`. Plato's turns, course builds, kits, figures, animations and checks all go through it. Tested on both: Plato's streamed turn (about 5 s each), a file agent, and a full course build on ChatGPT. Lesson evals on ChatGPT are still to run. |
| P2 | The tutor only worked in Vite dev mode. | **Done.** `/actor` and `/check` are signed-in routes in every build, and the text chat is the default page. `npm start` serves a working tutor (tested). ElevenLabs is opt-in (`VITE_VOICE=eleven`). |
| P3 | No setup. | **Done.** `npm run setup` finds the signed-in CLI (and asks when both are), writes `.env`, installs, fetches the logic simulator and anatomy skill at pinned commits, builds the kit shelf, checks for Chrome, adds Manim with `--animations`, and builds the page. A fresh clone took 13 s. If the CLI isn't signed in, the page says how to connect (`GET /setup`). |
| P4 | Code on the student's machine, steered by uploads. | **Done for agents and the C runner.** Agents on both providers read and write only their folder plus named read-only folders, can't read the home folder, and have no network. This was tested by trying each escape. Claude uses its sandbox's `denyRead`/`allowRead`, with Read/Glob/Grep left to dontAsk and Edit scoped to the folder. Codex uses a permission profile (`:root` read, `~` deny, workspace write, network off). The C compiler now runs in the sandbox too (an `#include` of a home file is refused), and programs can't read the home folder. Linux: untested (Claude uses bubblewrap there, Codex landlock). |
| P5 | Upload names could write outside the course folder. | **Done** (`path.basename`). |
| P6 | Local routes reachable by other pages. | **Done** for checkpoint, material-note, actor and check (Bearer token). Figures, animations and the shelf are GET-only files that another origin can show but not read. Host-header checking stops DNS rebinding. No change needed. |
| P7 | Hard-coded to the owner. | **Done**: `HARNESS_SINCE` is gone (every guide course is a harness course), the guide is the default knowledge source, and the voice is optional. The "prelim" wording is generic (looksLikeExam), and the circuit tool stays built in. |

## Found in testing (19 Oct), fixed

- Space, the talk key, deleted the spaces typed in the new-course form's "What are you studying for?" box (it skipped inputs, not textareas). **This bug is also live on 5188.**
- A file dropped on the new-course form also made a second course, named after the file (the page-wide drop handler took it too). **Also on 5188.**
- With no course yet, the course panel showed placeholders forever. It now opens the new-course form.
- A board Plato wrote never appeared when no topic guide was loaded yet (a new course still building, the opening): the page threw on `guide.current.id`. **Also on 5188.**
- On a new install no kit could pass: the figures folder didn't exist yet, so drawing the examples failed.
- Claude's command allowlist blocked ordinary agent commands (`python3 x.py | tee out`). Agents now run any command inside the sandbox, which is the real fence.

## Full test on ChatGPT (19 Oct)

This was a new course on a fresh data folder: "MUS 1101 Music Theory", one page of notes, `npm start`, `PLATO_PROVIDER=codex`.
- **Build:** about 26 minutes in all, with 4 units and 28 topics.
  - Planned in about 1.5 minutes.
  - All 4 units audited.
  - 2 practice exams, each re-solved by a second agent.
  - 2 test lessons, judged 10/9/9 and 10/8/9 (accuracy, completeness, teaching).
- **Kit:** the build chose a staff-notation kit (VexFlow) without being told to. After the figures-folder fix it drew its 6 examples and passed its check. I checked the pictures by hand (interval, E♭ major signature in bass clef, vii° triad, deceptive cadence) and they are right.
- **Live:** Plato answered on ChatGPT in a few seconds and wrote boards. Asked for a deceptive cadence, he drew it with the kit, correctly. The chat and board came back after a reload.
- **Not yet run on Claude in this repo:** the course build and kits. The lab's OChem test ran the same prompts on Claude; the runner and fences here are new. I skipped it so it wouldn't compete with live study on the same Claude plan.

## Should fix for beta

- **Personal data at rest:** done. Claude calls run with `--no-session-persistence` (no transcripts in `~/.claude/projects`), and Codex calls are ephemeral.
- **Deletion:** done. Deleting a course removes its study guide folder and checkpoint; figures are shared and stay.
- **Failure messages:** partly done. A usage-limit failure on Plato's turn says so ("Your Claude plan's usage limit is reached…"). Course builds still only log it.
- **Subscription limits:** a course build is many Opus calls (units, audit, practice, kits, checks). Show its progress and let it pause and resume on a rate limit; it already resumes after a crash.
- **Cross-platform:** macOS first; Linux next (sandbox); Windows later.
- **License and contribution:** README done. Still needed: choose a LICENSE (the owner's call) (the shelf libraries are MIT/BSD/ISC; JSXGraph is MIT or LGPL; the anatomy skill and logic-sim are MIT), README with setup, and a privacy note: "your material and chats stay on your machine and go only to the model provider you connected".

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
