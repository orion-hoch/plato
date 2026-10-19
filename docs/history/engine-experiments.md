# Engine experiments: who should write the director's cards and think answers

Measured on 2026-10-08 against the director as it stood that day (prompts `director_card_v2` and `director_think_v2`). The study used 120 model calls: 103 on Codex through the ChatGPT plan and 17 through the Claude Code CLI on the Claude plan. No ElevenLabs, no app code changed, no `data/` touched.

## Summary

**Every engine got the answers right.** All 34 engine outputs passed a machine check. So did all 16 parallel-protocol cards, and 2 of the 3 split think answers; the third gave a correct answer with a wrong board. The engines differ in four ways: speed, whether their boards draw, how well they teach (a blind judge's view), and cost.

**The fastest engine is Claude Sonnet through the CLI.**
- Cards: 10.4 s median, 38 s worst. Think answers: 4.6 s.
- Today's director, `gpt-6-astra` at low effort, takes 20.5 s and 30.9 s for cards and 9.0 s for think.
- The judge rated the two about the same.
- **The best cards come from Astra at high effort** (judge 4.83 board, 4.50 teaching), but they take 46 s median.

**Some setups don't pay off:**
- **The 3-stage Codex pipeline** takes about 80 s, with no gain in quality.
- **Claude's `--agents` sub-agents** were registered but never used (0 spawned).
- **Grounding Claude with read-only tools** made no difference: at low effort it barely used them.

**Splitting a card into parallel parts helps only in specific ways:**
- Streaming the one monolithic call is the biggest win. The actor can start speaking when `ask` arrives (9.9 s median), against 26 s for today's whole card.
- With branches ordered before the board, the correct branch arrives at 12.5 s.
- Two side jobs pay off: a machine verifier (adds at most 1.6 s) and an element started early.
- Two splits do harm. Blind fan-out (P2) produced cards that contradict themselves. Light-model boards were wrong or weak.

**Recommendation:**
- **Reply path:**
  - one streamed `gpt-6-astra` low call per card, in a new field order;
  - the element and a light-model verifier started from the stream, each with a deadline and a fallback;
  - think also streamed, `say` first.
- **Background:** whole cards from `gpt-6-astra` high, with the same verifier.
- **Your call: Sonnet through the CLI.** It is the faster engine for think (4–5 s), behind a switch. It would add a second provider and draw on your Claude plan.

## Setup

- **Situations.** Six card situations from CS 3410 and two think questions, built from a VACUUM copy of `data/backend.db` (with a copy of the blobs) through the app's own services: real lessons, modules, `[src]` refs, the course's question bank, and the notes' passages.
  - **Inputs:** built exactly as the `director_card` and `director_think` jobs build them.
  - **Cards:** two's complement after "13"; setup and hold; a pointer step (`p += 2`); the n-bit range; caller- versus callee-saved; RISC-V `lb` sign extension.
  - **Think:** "Why does the stack grow down?" and "Why does `lb` copy the sign bit?".
  - **Added later for the protocol study:** a pointer loop whose natural board is an element.
- **Engines.**
  - **Codex `ask()`:** `gpt-6-astra` at low effort (today's reply path) and at high effort (today's background).
  - **Claude Code CLI 2.1.293, headless:** Sonnet at low effort and Opus at high, using `--json-schema` with the director's own schema and `--append-system-prompt`.
  - **Grounded Sonnet:** the same, plus Read, Grep and Glob over a scratch copy of the 19 lectures.
  - **A Codex pipeline:** strategist, then board designer, then verifier, running C through `runC` and RISC-V through `shared/elements/trace.mjs`.
  - **Claude with `--agents`:** the same three roles as sub-agents, in one call.
- **CLI isolation.** Checked from the CLI's init message:
  - `--tools ""` (or only `Read,Grep,Glob`);
  - `--strict-mcp-config` with an empty MCP config: no MCP servers, and none of your claude.ai connectors;
  - `--setting-sources local`, run from an empty folder: none of your user plugins or hooks, ponytail included;
  - `--disable-slash-commands`, `--no-session-persistence`, `--permission-mode dontAsk`, `--max-budget-usd 3`;
  - no Bash, Edit, Write or network tools, and never `--dangerously-skip-permissions`.
  
  `--bare` can't be used: it accepts only API-key auth, not your plan.
- **Measures:**
  - **Latency:** wall clock, one call at a time.
  - **Schema validity:** against the director's own schemas.
  - **Correctness:** each card's correct-branch literal is machine-checked. C runs in the `runC` sandbox and RISC-V in `trace.mjs`; two's complement is computed; saved registers are checked against Lecture 19's ABI table.
  - **Boards:** `boardOf()`'s rules, applied offline.
  - **Grounding:** `[src]` refs against the ones given, and lecture names.
  - **Board fit and teaching:** one blind judge pass, by `gpt-6-astra` at high effort. Engines are hidden and shuffled. It may favour its own family's outputs.
  - **Cost:** tokens, and API-equivalent dollars. Both plans are flat-rate, so the dollars are only a yardstick.

## Engine results

| Engine | Cards: median / worst | Think | Boards that draw | Answers correct | Judge, cards (board / teaching) | API-equiv. per card |
|---|---|---|---|---|---|---|
| Codex astra, low (today, reply path) | 20.5 s / 30.9 s | 9.0 s | 8/8 | 8/8 | 4.17 / 4.00 | $0.12 |
| Codex astra, high (today, background) | 46.2 s / 61.6 s | 22.3 s | 8/8 | 8/8 | **4.83 / 4.50** | $0.15 |
| Claude Sonnet, low (CLI) | **10.4 s** / 38.2 s | **4.6 s** | 7/8 | 8/8 | 4.17 / 3.83 | $0.04 |
| Claude Opus, high (CLI; 3 cards, 1 think) | 24.5 s / 24.8 s | 10.7 s | 3/4 | 4/4 | 4.00 / 4.33 | $0.10 |
| Sonnet with read-only notes (2 cards, 1 think) | 12.7 s / 13.8 s | 4.6 s | 3/3 | 3/3 | 3.50 / 3.50 | $0.05 |
| Codex pipeline, 3 stages (2 cards) | 79.9 s / 87.6 s | — | 2/2 | 2/2 | 5.00 / 4.00 | $0.37 |
| Claude `--agents` (1 card) | 10.6 s | — | 0/1 | 1/1 | 4.00 / 5.00 | $0.07 |

- **Correctness is not where they differ.** Every correct-branch literal checked out: −8 and −3; the five-bit logger (6, −10, 16, doesn't fit); 8 or 8.5 ns depending on the clock-to-q the card stated; 2110 and "8 bytes" run in C; `0xFFFFFFFFFFFFFFF0` run on the simulator; t0 caller-saved. Several engines used the course's own question bank: the five-bit position logger, as a question board.
- **Board validity: some Claude boards don't draw.** All Codex boards drew; three Claude boards did not, all for one reason. The renderer requires bits-diagram groups not to overlap (`src/visuals/diagram.mjs`, line 391), but the prompt's description of bits diagrams never says so. In production, `diagramOf()` silently drops such a board. **Fix:** add "groups must not overlap" to that description.
- **The judge's ratings.**
  - Astra high wrote the best cards.
  - Opus and Sonnet tied with Astra low.
  - It caught one give-away my checks can't see: Astra low's twos-13 asks what the top bit contributes while its board labels that bit −8.
  - It marked down Claude's setup-and-hold cards for leaving the clock-to-q assumption unstated.
- **Grounding.**
  - All 49 `[src]` refs were valid, and none was invented.
  - Every think answer named the right lecture: Heap and Allocation for the stack, RISC-V Memory for `lb`.
  - Setup and hold are not in the notes, but no engine said so. All of them cited adjacent Lecture 11 refs (clock period, register capture). **Fix:** extend the card prompt with think's rule, "when the notes don't cover it, say so".
- **The grounded variant did no grounding.** Sonnet barely touched Read, Grep and Glob at low effort: two of its three runs made no tool call, because the given concepts were already enough. It added no quality. Grounding through tools isn't worth its turns here.
- **The pipeline is slow and caught nothing.** It took 80 s median: the strategist at high effort 42–54 s, the designer 6 s, the machine check 1 s, the verifier 23–26 s. Both checks passed, and the verifier only filled in missing literals. It gives no quality gain over one Astra-high call.
- **`--agents` can't be relied on.** The CLI accepts it and registers the roles, but in a headless call with structured output the model wrote the card itself: 0 sub-agents spawned, 2 turns.
- **Operational costs.**
  - Each Codex card call carries about 8k input tokens, including about 4k of app-server overhead.
  - Each Claude CLI call adds about 0.7 s to spawn. Its system prompt is cached after the first call (10–14k tokens).
  - Claude would mean a second provider adapter and calls billed to your Claude plan, whose rate limits for app use are unknown.

### What should run where (engines)

| Where | Today | Recommended |
|---|---|---|
| Reply path: card after an unmatched answer | Astra low, whole card (~20–26 s median, up to 39 s) | Astra low, streamed (see Parallel protocols); Sonnet through the CLI is 2× faster end to end if you accept a second provider |
| Reply path: think | Astra low (7–11 s) | Astra low streamed, `say` first (speaks in about 6–7 s), or Sonnet through the CLI (4–5 s, judged equal) |
| Background: speculation, refinements, misconception cache | Astra high | Astra high (best cards; 46 s is fine ahead of the answer), plus the machine verifier |
| Nowhere | | the 3-stage pipeline, `--agents`, tool grounding at low effort |

## Parallel protocols

Can smaller parallel parts beat the single 24–48 s card call (15–35 s more with an element)? Four cards (twos-13, setup-hold, `lb`, and the pointer loop, which needs an element) and both think questions were run under each protocol, on the Codex runtime with `Promise.all`.

- **Calls and tokens.** Every part is a real `runtime.ask()` call, and elements go through the app's own `elements.build()`.
- **Timing.** Each run is clocked from the student's answer:
  - **card ready:** the text plus the board's stand-in;
  - **first usable:** the moment the actor could start;
  - **element ready:** the element itself.
- **What I watched:** turns in flight, from the app-server's `turn/start` and `turn/completed` messages.

### The protocols

- **P0, monolithic (today):** one `gpt-6-astra` low call on the planner lane, streamed so I could record when `ask` and the first branch were complete. Its element is built after the card.
- **P1, decide then fill:**
  1. One `gpt-6-astra` low skeleton: aim, say, ask, the correct answer, 1–2 misses, the board's kind and plan, and an element request.
  2. In parallel: one fill per miss, one for the correct and stuck branches, and one for the board, all Astra low on the heavy lane. The element build starts at the same moment.
  3. A deterministic merge.
- **P4, P1 plus a verifier:** in the same run as P1, a check writer (Astra low) writes a C or RISC-V check that `runC` or the simulator runs, in parallel with the fills.
- **P3, hybrid models:** P1's skeleton, with every fill (and the check) on `gpt-6-luna` low, on the light lane.
- **P2, full fan-out:** at t = 0, all at once and none seeing the others:
  - a core (Astra low: say, ask, the correct and stuck branches);
  - two blind miss branches;
  - a blind board;
  - for the pointer loop, an element.
  
  A light reconcile then merges them.
- **P0s, streamed and reordered** (one run, on the pointer loop): P0's single call with the fields reordered, branches before the board. The verifier starts the moment the correct branch streams; the element starts the moment its request streams.
- **Think:**
  - **T0:** monolithic Astra low, from the engine runs.
  - **T2:** `say` and board in parallel, both Astra low.
  - **T3:** `say` on Astra low and the board on Luna.
- **P5, Claude CLI as the engine of the best protocol:** not run. The budget was spent, and you asked to keep Claude CLI runs few.

### Results (cards)

| Protocol | Card ready: median / worst | First usable: median / worst | Calls per card | Input tokens per card | API-equiv. per card | Correct | Judge: board / teaching / coherence |
|---|---|---|---|---|---|---|---|
| P0 monolithic | 26.3 s / 38.7 s | **9.9 s / 19.4 s** (`ask` streamed; first branch 18.8 s) | 1 (+element) | 9.7k | $0.15 | 4/4 | **4.00 / 4.75 / 4.75** |
| P1 decide then fill (heavy) | 27.0 s / 31.9 s | 14.9 s / 18.3 s (skeleton) | 5 (+element) | ~26k | ~$0.31 | 4/4 | 3.50 / 4.00 / 4.75 |
| P4 = P1 + verifier | 27.0 s / 31.9 s (at most +1.6 s) | as P1 | 6 (+element) | 31k | $0.37 | 4/4, all machine-verified in flight | as P1 |
| P3 hybrid (light fills) | **18.6 s / 24.1 s** | 14.9 s / 18.3 s | 5.5 | ~29k (8k heavy) | **~$0.10** | 4/4 | 2.75 / 3.75 / 4.25 |
| P2 full fan-out | **16.5 s / 18.5 s** | 13.3 s / 16.1 s (core) | 5 (+element) | 28k | ~$0.30 | 4/4 | 3.00 / 3.00 / **3.50** |
| P0s streamed, reordered (1 run) | 28.0 s | `ask` 11.0 s, correct branch **12.5 s**, verified answer 16.2 s, all branches 19.4 s | 3 | — | — | 1/1 (`runC` agreed) | — |

**The element, on the pointer loop:**

| Protocol | When the element started | How it went |
|---|---|---|
| P0 | after the card (29.3 s) | a 1-step trace in 17.0 s; ready at 46.3 s |
| P1 and P3 | at 18.3 s, from the skeleton's request | a 5-step C trace, still running when the element service's 45 s limit cut it off, so it fell back to the stand-in. Built alone, the same request took 38 s. |
| P2 | at once, with a blind request | also cut off at 45 s |
| P0s | at 26.7 s, when its request streamed | a 7-step trace in 40 s; ready at 66.9 s |

**Think:**

| Protocol | `say` ready | All ready | Board correct | Judge: board / teaching / coherence |
|---|---|---|---|---|
| T0 monolithic | 7.3–10.7 s | 7.3–10.7 s | 2/2 | **5 / 5 / 5** |
| T2: `say` ∥ board, heavy | 6.6–7.3 s | 8.6–19.0 s | 1/2: showed 64 ones, calling the byte 11111111 | 4.5 / 4.5 / 4.5 |
| T3: board on Luna | 6.4 s | 6.4 s | 0/1: a 32-bit board claiming 64-bit extension | 1 / 5 / 2 |

### What parallelism buys, and what it costs

- **Streaming is the cheapest big win.** The monolithic call already puts `say` and `ask` first. Streamed, the actor could start at 9.9 s median, earlier than any skeleton (14.9 s) or fan-out core (13.3 s), with no extra calls and no coherence risk. Moving the branches before the board brought the correct branch from 18.8 s to 12.5 s.
- **Blind fan-out contradicts itself.** P2 is the fastest to a complete card, but 3 of its 4 cards had parts from different moves:
  - a "3330" branch kept on a question about what `*p` reads (3330 answered the previous question, about the total);
  - a miss branch (7 + setup + hold = 10 ns) that gives the same number as the correct answer (1 + 7 + 2 = 10 ns), so the actor can't tell them apart;
  - value answers ("0xF0") on a question asking for one bit.
  
  The light reconcile dropped 2 of 8 blind branches and missed the rest. Parts must see the decisions they fill in.
- **Heavy fills don't pay.** The skeleton alone takes 9–18 s, and the heavy board fill is the slowest part (9–16 s; the other fills take 4–7 s), so P1 ends up as slow as P0 with 5 calls instead of 1.
- **Light fills are fast and fine for branches, but not boards.** Each Luna part takes about 3 s, so P3 is about 30% faster than P0 and the cheapest per card, and its branches are coherent. Its boards were the weakest: a setup-and-hold waveform with its markers off the clock edges, and the 32-bit think board. Boards need the heavy model.
- **The verifier is nearly free.** In P4 it added at most 1.6 s and passed 4 of 4. Luna wrote 3 of 3 correct checks in 4–6 s. A wrong expected answer would be caught by a machine, not trusted.
- **Elements dominate latency, and they grow with their steps.** A C trace is written step by step by the model:
  - 1 step: 17 s;
  - 5 steps: 38 s alone;
  - 7 steps: 40 s.
  
  Run alongside 5 other turns, a 5-step trace passed the 45 s limit. Starting the element early saves the most time, but only for small requests. The simulator computes a RISC-V trace's steps itself, so those cost far less.
- **No lane queueing in my runs.** The runtime's lane caps are planner 4, heavy 8, light 6 and elements 2 (`server/runtime.mjs`). I put parallel parts on the heavy and light lanes, at most 6 turns were in flight, and parallel calls finished together (4–7 s each).
  
  **In the app, they would queue:**
  - the director's reply path uses the planner lane, so a 5th parallel part would wait a full call for a slot;
  - the heavy lane is shared with background Astra work such as knowledge builds;
  - the elements lane runs only 2 builds at once.

### Recommendation for the director

**Use one streamed card call, with side jobs started from the stream.** This is P0s with the element request moved up.

**1. The card call.** One `gpt-6-astra` low call on a lane of its own, streamed, with its fields in this order:
   1. aim, situation, level, say, ask;
   2. `element` (kind and request only);
   3. `expect` (the correct branch first);
   4. concepts, sources;
   5. the board's content (the element's stand-in, or the board itself), `boardWhy`, `point`, `saveEquation`.

**2. The actor gets the card in pieces as it streams.**

| Moment | Expected (median) | What happens | Deadline and fallback |
|---|---|---|---|
| `ask` arrives | 10–11 s | `say` and `ask` go out, with "anything else → think" | Not by 20 s: issue the lesson's own follow-up card, or hold and call think |
| Each branch completes | correct about 12.5 s, all about 19 s | Each branch goes out as it lands | Until then, answers route to think |
| The card ends | 26–28 s | The board, or the element's stand-in, goes on the page | — |

**3. Side jobs start from the stream and never block the actor.**

| Part | Model and lane | Starts | Deadline | Fallback |
|---|---|---|---|---|
| Element | heavy model, low, elements lane; request capped to one paused moment or at most 3 steps, RISC-V or a figure preferred | when its request streams (about 12 s) | 25 s on the reply path; 45 s (today's limit) in the background | the stand-in board; swap the element in if it lands late |
| Verifier | `gpt-6-luna` low writes a C or RISC-V check; `runC` or `trace.mjs` runs it | when the correct branch streams (about 12.5 s) | 10 s (took 4 s here) | **Fails:** withhold that branch's literal (answers go to think) and re-ask the heavy model once in the background. **Times out:** ship it, flagged as unverified. |
| Extra miss branches (optional) | `gpt-6-luna` low, one per miss, each seeing the streamed `ask` and correct answer | after the correct branch | 8 s | drop it; never blind |

**4. Expected latency on the reply path:**

| | Proposed | Today |
|---|---|---|
| Actor speaks | about 10 s median (19 s worst under load) | 26 s median, 39 s worst (nothing until the whole card) |
| Correct branch | about 12.5 s | ⎯ |
| Answer verified | about 16 s | never |
| Whole card | about 27 s | 26 s median, 39 s worst |
| With an element | the element 17–40 s later, behind its stand-in | 46 s |

**5. Background (speculation, refinements, misconception cache):** whole cards from `gpt-6-astra` high (the best judged), plus the same verifier. Light fills can add extra branches cheaply (about $0.10 per card), as long as they see the card. Latency off the reply path doesn't matter.

**6. Think:** one `gpt-6-astra` low call, streamed with `say` first. The actor speaks at about 6–7 s, and the board follows in the same call. Never split `say` and board into blind parallel calls: 2 of 3 such boards were wrong. If you want a second provider, Sonnet through the CLI answered in 4–5 s.

**7. Lanes.**
- Give the director its own lane, cap 4 per session or more: the card, the verifier, and up to 2 light branches.
- Keep elements on their lane (cap 2).
- Never send parallel director parts to the shared heavy lane.

**8. Prompt fixes found along the way:**
- bits groups must not overlap;
- element requests stay small, RISC-V preferred;
- cards say so when the notes don't cover something (setup and hold).

**9. What would change**, for whoever builds this:
- **`backend/director/cards.mjs`:** the field order, and an early `element` field.
- **`backend/director/index.mjs`:** partial-card events, side jobs and deadlines.
- **`backend/providers/contracts.mjs`:** `structured()` doesn't pass `onText` to `runtime.ask()` today, which already streams.
- **`server/runtime.mjs`:** a director lane.
- **The page:** taking a card in pieces.

## Caveats

- **Few samples:** 1 to 6 runs per cell, all on one day.
- **Latency moves with the time and with load.** Astra-low cards took 17–31 s in the engine runs and 23–39 s during the protocol runs. The dev server may have been using the same Codex account at the time.
- **The judge's own family is in the race.** The judge is `gpt-6-astra` high, which rated its own family's high-effort cards best. Its rulings on Claude's setup-and-hold waveforms also partly reflect not knowing the renderer's convention that `clk` with no values is the clock.
- **The student is simulated.** One synthetic turn per situation.
- **Plan usage:** the ChatGPT plan carried 103 calls; the Claude plan carried 17 CLI calls (about $0.95 API-equivalent).

## Files

All in the scratchpad's `engines/` folder (`<scratch>/engines/`):

| File | What it does |
|---|---|
| `tasks.mjs` | builds the situations from the copy |
| `run.mjs` | the engines |
| `protocols.mjs`, `p0s.mjs` | the protocols |
| `element-alone.mjs` | the element diagnostic |
| `answers.mjs` | the machine checks |
| `score.mjs`, `score-protocols.mjs` | the tables |
| `judge.mjs`, `judge-protocols.mjs` | the blind judges |
| `results/` | every raw output |
| `backend-copy.db`, `blobs/`, `notes/` | the VACUUM copy, the copied blobs, the exported lecture notes |
