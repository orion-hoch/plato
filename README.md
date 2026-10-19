# Plato

A study tutor for any course, on your own computer and your own AI subscription. Give it your lecture notes, slides, problem sets and past exams. Plato writes a study guide from them and checks it against your material. Then it teaches you through it in a chat beside a shared whiteboard. It puts worked examples, diagrams and practice problems on the board, along with places for you to write, code and draw.

Plato is a harness, not a service. It runs on your machine, and every model call goes through the command-line tool of a subscription you already have:

- **Claude** (Pro or Max), through Claude Code: `claude`
- **ChatGPT** (Plus or Pro), through Codex: `codex`

There's no API key, no account with us and no server of ours. Your files, chats and progress stay on your machine. They go only to the provider you connected, as part of the requests Plato makes for you.

## Install

You need Node 22.13 or newer, git, and one of the two CLIs, signed in:

```sh
npm install -g @anthropic-ai/claude-code && claude            # log in once
# or
npm install -g @openai/codex && codex login
```

Then:

```sh
git clone <this repo> plato && cd plato
npm run setup        # picks your provider, installs, fetches the optional tools, builds the page
npm start            # then open http://127.0.0.1:5188
```

`npm run setup -- --provider codex` chooses ChatGPT when both CLIs are signed in. Add `--animations` to install Manim for animated explanations. Manim also needs ffmpeg and a LaTeX such as TinyTeX.

## Using it

1. **Make a course.** Open the course panel (bottom left), then choose New course. Give it a name and what you're studying for (for example "Prelim 2 on Nov 12, chapters 9 to 16"), and drop in your files: PDFs, Word, PowerPoint, Markdown or text.
2. **Plato builds it.** Your files become searchable in seconds. In the background, agents on your subscription plan the units, write and check each one against your material, write practice exams and re-solve them, and build any figure kits the subject needs (molecules for chemistry, staff notation for music, and so on). A typical course is ready in about 20 to 40 minutes, and you can start studying before it finishes.
3. **Study.** Type to Plato. Ask to be taught a topic, quizzed, or given an exam-style problem. Write on the board with a mouse or pen, and press Enter to hand your work in. Star any section of the board to keep it in your Notebook. Your board, chat and drafts survive reloads and restarts.
4. **Voice, if you want it.** Press the speaker or microphone button (top right) and paste an ElevenLabs API key. Plato then reads his replies aloud and hears what you say, on your ElevenLabs account. The key is checked with ElevenLabs and kept in your macOS Keychain (elsewhere, in a file only your account can read). It never goes in a project file and is never shown again. Right-click either button to replace or remove it.
5. **Add more files any time.** Choose "What is this?" to tell Plato what a file is. Marking it as closest to your exam rebuilds the practice exams on its model.

## What's optional

`npm run setup` reports what it could set up. Plato says so, and draws another way, when something is missing.

| Extra | For | Needs |
| --- | --- | --- |
| Logic simulator | live circuits you can toggle | fetched by setup |
| Anatomy skill | interactive "how it works" figures; also used to check kits | fetched by setup, Chrome |
| Kit libraries | per-course figure kits | installed by setup, Chrome to check them |
| Manim | short animations | `--animations`, ffmpeg, LaTeX |
| C runner | running C code on the board | macOS (it uses the system sandbox) |
| Voice | replies read aloud, talking to Plato | your ElevenLabs API key, pasted in Plato |

## Safety

Course material is untrusted: a file could contain instructions aimed at the model. So every agent that works with your files runs in the operating system's sandbox, with both providers:

- it reads and writes only its own course folder, plus the read-only tools it needs;
- it can't read the rest of your home folder;
- it has no network.

Student code (C, JavaScript checks) runs under the macOS sandbox, with no network, no file writes and no access to your home folder. The server listens on 127.0.0.1 only, and refuses other host names. Its routes need the local sign-in token the page gets from it.

## Settings

`.env` (copied from `.env.example` by setup) holds the provider, the port (`PORT`), where data lives (`PLATO_DATA_DIR`), and model choices per provider. Run `npm run dev` for the development server with hot reload.

## Status

This is an early beta, tested on macOS only so far. Linux and Windows are untested. See `docs/beta-readiness.md` for what is done and what is next.
