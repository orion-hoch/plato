# Drawing shape detection

Research and a design for recognizing what a student draws on Plato's page: boxes and arrows, state machines, stack frames, gates, tables. With that, Plato can understand and grade drawn answers, and redraw them neatly. Researched and built on 2026-10-07; [What was built](#what-was-built) lists the code.

## Summary

- **The "OpenAI decision API" exists.** It is the **Decisions API**, announced at DevDay on 2026-09-29 and in public beta since 2026-10-06. It is a fast classifier on `gpt-6-luna`: it gives the probability that a statement is true, picks from fixed options, or scores on a scale. It cannot return shapes, labels, connections or coordinates. OpenAI's own guide points structured extraction to Structured Outputs instead. It also needs an OpenAI API key, which Plato doesn't have.
- **Shape detection uses the vision route Plato already has.** That route is `gpt-6-astra` through the Codex runtime, with a JSON schema. Send the ink PNG plus a compact list of the strokes (ids, boxes, simplified points), and have the model group the strokes into items **by stroke id**: shapes, grids and their cells, connectors, and text. Geometry then comes from our own strokes, never from coordinates the model invents, and we can check that every stroke was accounted for.
- **Feasibility: accurate but slow.** The test used two live calls on synthetic hand-drawn ink: a 3-state FSM, and a stack frame with an `sp` arrow. Both readings were perfect: every stroke grouped right, every label read, all 7 transitions and the pointer right. The calls took 39 s and 27 s on Astra at low effort: 9 to 13 s to the first token, then about 20 tokens a second.
- **What was built.** Shape reading is its own background read, next to the text reading, which is unchanged.
  - It runs only when a free local check says the ink is a drawing, so plain handwriting never triggers it.
  - A hand-in never waits for it. Shapes already read for exactly that ink go with the hand-in; otherwise they follow as a context line, `[Student's page] drew: …`.
  - You chose: no Decisions API and no OpenAI key, and glances stay on Astra.

## Which API this researches, and why

The request named the "open ai decision api". I first checked whether that is a real product, and it is: the [Decisions API](https://developers.openai.com/api/docs/guides/decisions) ([changelog, 2026-10-06](https://developers.openai.com/api/docs/changelog); [public beta announcement](https://community.openai.com/t/decisions-api-is-now-available-in-public-beta/1403877)). So I researched it first. Because it can't return structure, I also researched the route that can: image input with structured outputs ([Images and vision](https://developers.openai.com/api/docs/guides/images-vision), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)). Plato already uses that route through the Codex app-server.

## The Decisions API

What it is, from the official guide:

- `POST https://api.openai.com/v1/decisions`. The only model is `model: "gpt-6-luna"`.
- `input` is a text string, or user messages with `input_text` and `input_image` parts. Images must be inline base64 data URLs: "Hosted HTTP or HTTPS image URLs and `file_id` inputs aren't supported by this endpoint." The guide documents no `detail` setting.
- `questions` come in three kinds:
  - `predicate`: returns a `probability`.
  - `choice`: picks from `choices: [{ value, description }]` and returns `choice`, `probabilities` and `confidence`.
  - `score`: rates against ordered `levels` and returns a probability-weighted `score`.
  - The model can also return a `refusal`.
- Independent questions share one input in one request. "For decisions that depend on an earlier answer, send separate requests."
- **Speed:** it "returns typed answers about 10x faster than the Responses API". One developer measured [about 0.8 s with an image](https://community.openai.com/t/decisions-api-is-now-available-in-public-beta/1403877).
- **Price:** $0.10 per 1M input tokens, with no output charge.
- **Status:** public beta, with GA expected "in the coming weeks". The same thread reports that `choice` "seems to put too much probability mass on the most likely outcome". Treat its confidences as uncalibrated.

What that means for shapes:

- It can answer questions about a drawing: "is there a diagram?", "which kind is it?", "is the sp arrow pointing at the bottom cell?".
- It cannot say what is drawn where. There is no item list, no labels, no from/to, no coordinates and no free text. The guide says so directly: "Use Structured Outputs with the Responses API when you need to generate an object that follows your own JSON schema, such as extracted fields…".
- **Access:** it needs `Authorization: Bearer $OPENAI_API_KEY`. Plato has no such key:
  - `.env` and `.env.example` define no OpenAI variable. I checked variable names only; they are `LUNA_*`, `PORT` and `ELEVENLABS_*`.
  - `server/codex.mjs` never forwards API keys to the CLI.
  - The Codex app-server protocol (codex-cli 0.157.0, from its generated bindings) has no Decisions method.
  
  Using it would mean a new key, a new billing path and a direct `fetch` from the backend.

## What OpenAI's vision models can and can't do for shapes

- **Detail and resolution** ([Images and vision](https://developers.openai.com/api/docs/guides/images-vision)): the `detail` setting is `low`, `high`, `original` or `auto`. For `gpt-6-astra`:
  - `low` fits the image within 512×512.
  - `high` allows up to 2,500 patches.
  - `original` keeps the size, up to 30,000 patches.
  - `auto` behaves like `original`.
- **Token cost:** the image is cut into 32×32 px patches, and each patch costs 1.2 tokens on Astra. A 1024×1024 image costs 1,229 tokens ([calculator](https://developers.openai.com/api/docs/guides/image-cost-calculator)).
- **Plato's PNGs:** `inkPng()` in `src/BoardStage.jsx` crops to the ink, pads it by 16 px, scales it up to 2× and caps the long side at 2,400 px. The test FSM was 967×984, about 1,154 image tokens. A full-width page at 2400×1600 costs about 4,500 tokens on `auto`, or at most 3,000 on `high`.
- **The `detail` knob is unused.** The Codex app-server accepts `detail` on image inputs (`UserInput`: `{ type: "image", url, detail?: "auto" | "low" | "high" | "original" }`). `server/runtime.mjs` doesn't send it, so Astra reads every image at `original`. Setting it is a one-line change if image tokens ever matter.
- **Structured outputs:** these use a strict JSON schema. Every field is required, an optional field is a union with null, and objects use `additionalProperties: false`. The first request with a new schema has extra latency ([guide](https://developers.openai.com/api/docs/guides/structured-outputs)). Plato already does this: `jsonSchema()` in `backend/core/shape.mjs` builds the strict schema, and `runtime.ask()` passes it as `outputSchema`.
- **Known limits (OpenAI's list):**
  - "The model struggles with tasks requiring precise spatial localization, such as identifying chess positions."
  - It "may struggle to understand graphs or text where colors or styles—like solid, dashed, or dotted lines—vary."
  - It may misread rotated text, and it gives approximate counts.
  
  For coordinate work, the docs advise `original` detail and mapping coordinates back to the original image. They give no accuracy figures for bounding boxes.
- **The [VLMs are blind](https://arxiv.org/abs/2407.06581) benchmark** (ACCV 2024; v6 in 2025) found the same weaknesses. Models fail at telling whether circles overlap, counting line intersections, counting nested shapes and following paths, and they "consistently struggle with those tasks that require precise spatial information when geometric primitives overlap or are close". The image encoder holds the information; the language model fails to put it into words. Touching shapes and crossing arrows are exactly these cases.
- **Prompting advice for diagrams and handwriting:** OpenAI's guide has none beyond enlarging small text and using `original` detail. The research below points one way: give the model structure it can refer to, rather than asking it for coordinates.

## Prior art

- **tldraw**
  - [Make Real](https://tldraw.substack.com/p/make-real-the-story-so-far) ([starter](https://github.com/tldraw/make-real-starter)) sends a PNG of the selection to a vision model and gets HTML back. It sends the PNG only; iterations add the previous HTML.
  - The [agent starter kit](https://tldraw.dev/starter-kits/agent) sends "a screenshot of the agent's current view" plus "a simplified format of all shapes within the agent's viewport": each shape's id, type, bounds and text. Positions are offset and rounded, and the model's actions refer to shapes by id. This is the closest precedent for sending the PNG plus a stroke list with ids.
- **Excalidraw**
  - "Wireframe to code" sends an image to OpenAI; it [moved from gpt-4-vision-preview to gpt-4o](https://github.com/excalidraw/excalidraw/pull/8148).
  - Its local [draw-to-shape](https://github.com/excalidraw/excalidraw/pull/9313) feature was merged on 2026-07-23. It simplifies a freehand stroke with Ramer–Douglas–Peucker, applies PCA and angle tests, and snaps that one stroke to a rectangle, ellipse, diamond, arrow or line.
- **Microsoft [Ink Recognizer](https://learn.microsoft.com/en-us/previous-versions/azure/cognitive-services/Ink-Recognizer/overview)** took strokes rather than pixels (up to 1,500 per request). It returned recognized shapes, handwriting and layout, and could tell which strokes were shapes and which were text. It was retired on 2021-01-31.
- **Google [ML Kit Digital Ink](https://developers.google.com/ml-kit/vision/digital-ink-recognition)** runs on the device, on Android and iOS only. Its [shapes model](https://developers.google.com/ml-kit/vision/digital-ink-recognition/base-models) (`zxx-Zsym-x-shapes`) returns RECTANGLE, TRIANGLE, ARROW or ELLIPSE with scores. It ["interpret[s] the whole Ink as a single shape"](https://developers.google.com/ml-kit/vision/digital-ink-recognition/android), so the strokes must be split into shapes first. There is no web SDK, so Plato's page can't use it.
- **Classic recognizers**
  - The [$1, $N, $P and $Q recognizers](https://depts.washington.edu/acelab/proj/dollar/index.html) match one gesture at a time against templates. $Q is 142× faster than $P.
  - [Ramer–Douglas–Peucker](https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm) simplification plus primitive fitting, as in [PaleoSketch](https://doi.org/10.1145/1378773.1378775), recognizes 8 primitives at 98.56%.
  - Full diagram recognizers ([Bresler et al. 2016](https://link.springer.com/article/10.1007/s10032-016-0269-z), for flowcharts and finite automata) separate text from non-text, segment the symbols, then detect arrows. That pipeline is a research project.
- **Evidence for combining strokes with the image**
  - [Fadeeva et al. 2024](https://arxiv.org/abs/2402.15307) gave off-the-shelf vision models the ink both as time-ordered strokes in text and as an image. They matched or beat dedicated online handwriting recognizers.
  - [Arrow-guided VLM 2025](https://arxiv.org/abs/2505.07864) put explicit arrow and node detections in the prompt, which raised flowchart question accuracy from 80% to 89%.
  - [Set-of-Mark 2023](https://arxiv.org/abs/2310.11441) showed that labelled marks let a model refer to regions precisely.

**Takeaway:** local recognizers give exact geometry, but only for single primitives, and they need the strokes split into shapes first. The model gives meaning, labels and connections, but its coordinates are weak. Stroke ids join the two: the model groups and names our strokes, and we keep the geometry.

## Feasibility check

**Setup.** The script is `/private/tmp/claude-501/-Users-orionhoch-Desktop-study/f99c890b-e324-4c8a-b230-00cb01019671/scratchpad/shapes/shapes.mjs`. It is a scratch file; moving it into `evals/` is the first item under "Next" in [What was built](#what-was-built).

- It builds strokes in the same `{x, y, p}` shape as `src/inputs/ink.mjs`.
- Lines wobble, pressure varies, and letters and digits are drawn as strokes. Each shape or arrow is followed by its label, in drawing order.
- It renders them with a copy of `inkPng()` and simplifies each stroke with Ramer–Douglas–Peucker at 1.5 CSS px.
- It sends `{ image: { width, height }, question: null, strokes: [{ id, box, pts }] }` through the repo's unchanged `createRuntime().ask()`: role `heavy` (`gpt-6-astra`), effort `low` (the drawing reader's setting), and the schema below.
- The app-server's stdout was only read for token counts.
- There were two live calls, one per scene.

| | FSM | Stack frame |
|---|---|---|
| Ink | 30 strokes: 3 states, a start arrow, 6 labelled transitions including 2 self-loops | 21 strokes: a column with 3 dividers, cells `ra fp x y`, `sp` and an arrow |
| PNG | 967×984, 73 KB, ~1,154 image tokens | 591×717, 42 KB, ~525 image tokens |
| Stroke list | 1,193 points cut to 179; 2,733 chars (~1,260 tokens) | 964 points cut to 92; 1,645 chars (~760 tokens) |
| Items with exactly the right strokes | 10/10 | 7/7 |
| Labels read | 9/9 | 5/5 |
| Connections right (from, to, label) | 7/7, including the start arrow, both self-loops and both A⇄B arcs | 1/1 (`sp` → bottom cell); cells in the right rows |
| Missing, duplicated or invented stroke ids | 0, 0, 0 | 0, 0, 0 |
| Diagram kind | `state_machine` | `memory` |
| Time to first token / total | 12.5 s / 38.8 s | 8.8 s / 26.6 s |
| Tokens in / out | 6,648 / 530 | 5,518 / 364 |

The model's readings, verbatim:

- "A state machine with initial state A; A goes to A on 0 and B on 1, B goes to A on 0 and C on 1, and C goes to A on 0 and C on 1."
- "A vertical memory stack contains ra, fp, x, and y from top to bottom, with sp pointing to y."

**What the test shows.** With stroke ids, Astra at low effort grouped multi-stroke shapes correctly, kept separately drawn arrowheads with their shafts, attached each label to the right arrow and inferred cells from divider lines. The output passed the schema with no problems.

**What it doesn't show.**

- How it does on messy ink. The synthetic ink is neat: each label was drawn right after its arrow, which helps; nothing crosses; nothing was erased.
- Variance: there was one sample per scene.
- How sending the PNG alone compares. The two-call budget left no room for that A/B test.
- How `gpt-6-luna` does. It wasn't tried.

## Architecture (as built)

My first design folded shapes into the text reading as one call. That would have made every hand-in wait about 20 s longer, which your rule rules out. So shapes are a separate read, and the text reading is untouched.

```
page (src/main.jsx, src/BoardStage.jsx)            backend                                      Plato
pause ─▶ look(): text glance, as before      ─▶ POST /drawings (commit: false)      ─▶ "[Student's page] <words>"
      └▶ glanceShapes(): trace, diagramish?     no: nothing
                                                yes: POST /shapes (PNG + strokes)
                                                     Astra, low effort: items by stroke id
                                                     id checks, boxes from our strokes ─▶ "[Student's page] drew: …"
hand-in ─▶ commit(): text reading, the same wait as before
           + "drew: …" now, only if a read of exactly this ink is done
           otherwise the running (or a new) shape read follows as  ───────────────────▶ "[Student's page] drew: …"
```

**What runs locally** (exact, and free):

- **One frame.** `crop()` in `src/BoardStage.jsx` feeds both `inkPng()` and `inkTrace()`, so stroke ids and points match the PNG's pixels. An id is the stroke's index in the list sent; strokes with no points are skipped.
- **Simplify.** `simplify()` in `src/inputs/ink.mjs` runs RDP at 3 PNG px (about 1.5 CSS px), and keeps at most 251 points per stroke.
- **Gate.** `diagramish()` in `src/inputs/ink.mjs` decides whether ink is a drawing. A stroke counts as drawn when it is at least 3 times the size of the middle-sized stroke and is not a flat line (a fraction bar, an underline). Ink with one closed drawn stroke (a circle, a box), or two drawn strokes, is a drawing. On the test ink, both diagrams pass, and their letters alone don't; two fraction bars under writing don't either.

  ```js
  // ponytail: a size-and-shape test, free and instant; tune DRAWN on real pages, or learn it if it misjudges them.
  const DRAWN = 3;
  export function diagramish(ink) {
    const strokes = ink?.strokes ?? [], size = ({ box }) => Math.max(box[2] - box[0], box[3] - box[1]);
    if (strokes.length < 2 || strokes.length > 400) return false;
    const middle = Math.max(8, strokes.map(size).sort((a, b) => a - b)[strokes.length >> 1]);
    const drawn = strokes.filter(st => size(st) >= DRAWN * middle && st.box[3] - st.box[1] >= .15 * (st.box[2] - st.box[0]));
    return drawn.length >= 2 || drawn.some(({ pts, ...st }) => Math.hypot(pts[0] - pts.at(-2), pts[1] - pts.at(-1)) <= .25 * size(st));
  }
  ```

  It can miss a number line (one flat line) or a timing diagram without vertical cycle lines. It can also fire on two crossed-out words; then the model answers `none`, and Plato hears nothing.
- **Checks and positions,** in `drawingShapes()` in `backend/session/index.mjs`:
  - Every stroke id must appear in exactly one item, with none made up.
  - Every `from`, `to` and `parent` must name an item.
  - A failed check adds "part of the drawing may be missing from this reading" to `uncertain`.
  - Each item gets a `box` spanning its own strokes.
  - Later: check that a connector's ends lie near the items it joins. This catches wrong links that pass the id checks.

**What the model does:** it groups strokes into items, names each item's shape, reads the writing, says what each connector joins, names the diagram's kind, and writes a one-sentence reading.

**Request:** `POST /v1/sessions/{id}/shapes`, a read-only route.

```json
{ "imageBase64": "…", "ink": { "width": 591, "height": 717, "strokes": [
  { "id": 0, "box": [267, 32, 559, 684], "pts": [287, 36, 557, 41, 558, 172, 554, 217, "…"] },
  { "id": 1, "box": [269, 193, 558, 197], "pts": [269, 194, 346, 193, 380, 197, 476, 193, 558, 197] } ] } }
```

- **Caps** (`DRAWING_SHAPES` in `backend/session/schemas.mjs`): at most 400 strokes and 300 points per stroke, integer pixels, and ids that must be 0, 1, 2, … in order.
- **Model input:** `{ image: { width, height }, strokes }`. There is no question in it, so there is nothing to "correct" towards.

**Response:** `{ kind, reading, items: [{ …, box }], uncertain }`. A failed or `none` reading is `{ kind: null, reading: null, items: [], uncertain: [] }`. The model's schema is `DRAWING_SHAPES_READING`, the tested one:

```js
const SHAPE_ITEM = s.object({
  id: s.string({ max: 24 }), kind: s.enum(['shape', 'grid', 'cell', 'connector', 'text']),
  shape: s.nullable(s.enum(['circle', 'double_circle', 'ellipse', 'rectangle', 'rounded_rectangle', 'diamond', 'triangle', 'and_gate', 'or_gate', 'not_gate', 'xor_gate', 'nand_gate', 'nor_gate', 'arrow', 'double_arrow', 'line', 'other'])),
  strokes: s.array(s.int({ min: 0 }), { max: 500 }), text: s.nullable(s.string({ max: 300 })),
  from: s.nullable(s.string({ max: 24 })), to: s.nullable(s.string({ max: 24 })),
  parent: s.nullable(s.string({ max: 24 })), row: s.nullable(s.int({ min: 0 })), col: s.nullable(s.int({ min: 0 })),
});
export const DRAWING_SHAPES_READING = s.object({
  diagram: s.enum(['state_machine', 'graph', 'tree', 'linked_structure', 'memory', 'array', 'table', 'truth_table', 'kmap', 'circuit', 'waveform', 'number_line', 'plot', 'other', 'none']),
  items: s.array(SHAPE_ITEM, { max: 200 }), reading: s.string({ max: 1200 }), uncertain: s.array(s.string({ max: 300 }), { max: 20 }),
});
```

Returned items from the stack test, with their null fields left out:

```json
{ "id": "stack", "kind": "grid", "strokes": [0, 1, 2, 3] }
{ "id": "y", "kind": "cell", "strokes": [14, 15], "text": "y", "parent": "stack", "row": 3, "col": 0 }
{ "id": "sp", "kind": "text", "strokes": [16, 17, 18], "text": "sp" }
{ "id": "pointer", "kind": "connector", "shape": "arrow", "strokes": [19, 20], "from": "sp", "to": "y" }
```

**The prompt** is `drawing_shapes_v1` in `backend/providers/codex/drawing.mjs`, on Astra at low effort with a 120 s timeout. It is the tested prompt word for word, plus one clause: `"none", with no items, when it is only writing`. The text-reading prompt, `drawing_read_v1`, is unchanged.

**When it runs.**

| Moment | What happens |
|---|---|
| **Glance** (`look()`, 1.5 s after the last stroke) | The text glance runs as before. Beside it, `glanceShapes()` reads the whole page's shapes, if the ink is a drawing, once per ink version and one read at a time. When the read ends, Plato gets the result if the page is unchanged. If it changed, the result is dropped, and the newest version is read once the student pauses. |
| **Hand-in:** Enter (`send()`), `collect_page_work`, speaking under a question | The text reading and its wait are exactly as before. **Shapes ready:** if a read of exactly this ink is done (same version, all of the ink), the `drew: …` line goes with the reading at once, in the turn and in the committed text. **Shapes running:** if a read of this ink is running, it is marked handed in, and Plato gets it as context when it ends, even if the page changes meanwhile. **Neither:** a new read starts, if the ink is a drawing, and is told the same way. |
| **Exam parts** (`handIn()`) | The same rule for each part. A late line says `part b, drew: …`. |

**How results reach Plato.**

- **Glance, or a hand-in whose shapes come later:**
  `[Student's page] drew: A state machine with initial state A; A goes to A on 0 and B on 1, B goes to A on 0 and C on 1, and C goes to A on 0 and C on 1.`
- **Hand-in with shapes ready:** a second line under the reading:
  ```
  [Written on the page] <transcription>
  drew: A vertical memory stack contains ra, fp, x, and y from top to bottom, with sp pointing to y.
  ```
- **Doubt:** ` (unclear: …)` follows the sentence when the model or the checks were unsure.
- **Telling Plato:** `AGENT_PROMPT` now mentions `drew: …` lines. That takes effect when `scripts/setup-tutor-agent.mjs` is run again.

**The page: the student's ink is never replaced or moved.** That is your standing rule. Nothing is drawn yet. A neat version would be Plato's own visual, shown with `show_visual`, and two renderer types in `src/visuals/diagram.mjs` would take the items directly:
  - **`graph`:** nodes are the `shape` items (`{ id, label: text }`). Edges are connectors whose ends are both shapes (`{ from, to, label: text, directed: shape !== 'line' }`). Self-loops already render. A start arrow from nowhere has no equivalent.
  - **`memory`:** cells are the grid's cells, sorted by row (`{ value: text ?? '' }`). Pointers are connectors from a text item to a cell (`{ at: row, label }`).
  
  Tables, truth tables and K-maps need the header row read; that comes later. Highlighting "this arrow" uses the union of its strokes' boxes.

**The Decisions API: not built.** You chose no Decisions API and no OpenAI key. This sketch is kept for reference. It would sit before the Astra call as a gate or a router; it wouldn't replace that call:

```js
// backend/providers/openai/decisions.mjs: only with OPENAI_API_KEY set
const res = await fetch('https://api.openai.com/v1/decisions', {
  method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-6-luna',
    input: [{ role: 'user', content: [{ type: 'input_text', text: "A student's ink from a CS 3410 whiteboard." }, { type: 'input_image', image_url: `data:image/png;base64,${png}` }] }],
    questions: [
      { type: 'predicate', name: 'has_diagram', instructions: 'Is there a drawn diagram (shapes joined by arrows or lines, boxes, a grid or table), not only writing or math?' },
      { type: 'choice', name: 'kind', instructions: 'What is the main drawing?', choices: [
        { value: 'state_machine', description: 'Circles joined by labelled arrows.' }, { value: 'memory', description: 'A stack frame or memory column, maybe with pointers.' },
        { value: 'linked_structure', description: 'Boxes joined by pointer arrows.' }, { value: 'circuit', description: 'Logic gates joined by wires.' },
        { value: 'table', description: 'A truth table, K-map or other grid.' }, { value: 'waveform', description: 'Signals over clock cycles.' },
        { value: 'writing', description: 'Only writing or math.' }, { value: 'other', description: 'Anything else.' }] }] }),
});
const { answers } = await res.json(); // [{ type: 'predicate', probability }, { type: 'choice', choice, probabilities, confidence }]
```

It isn't worth adding now:

- The local gate is free and instant.
- The Astra call already returns the diagram's kind.
- It would add a second vendor path, with its own key and billing, which is your decision, not mine.

It would earn its place if Plato needs to know within a second that a diagram is being drawn, or for cheap rubric checks at scale.

## Costs and latency

Plato's models run on your ChatGPT sign-in, so reads count against plan limits rather than a per-token bill. API prices ([Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) $10 in / $50 out per 1M tokens; [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) $0.10 / $0.50) are a yardstick:

| Per read | Tokens in / out | At Astra prices | At Luna prices |
|---|---|---|---|
| FSM (measured) | 6,648 / 530 | $0.093 | $0.0009 |
| Stack frame (measured) | 5,518 / 364 | $0.073 | $0.0007 |
| Decisions gate (estimate) | ~1.5k / none | n/a | ~$0.00015 |

**Where the input tokens go.**

- About 4.2k input tokens per call are fixed. The prompt and schema are under 1k of that; the rest appears to be what the Codex app-server adds to every thread.
- The image adds 0.5 to 1.2k, and the stroke list adds 0.8 to 1.3k.
- The second call got no prompt-cache hit (0 cached tokens).

**Latency** was 9 to 13 s to the first token, then about 20 output tokens a second: 27 to 39 s in all. The output dominates, because the strict schema writes out every null field (1,049 to 1,540 chars).

Hand-ins don't pay this. The text reading is unchanged, and the shapes ride on a glance or arrive about 30 s later as context.

These levers are untested:

- **Fewer output tokens:** separate arrays per kind, so no item carries null fields.
- **`gpt-6-luna` for glances:** declined, because it is a model downgrade.
- **Astra's `ultrafast` service tier:** see the [changelog](https://developers.openai.com/api/docs/changelog), 2026-09-29. The runtime pins `serviceTier: 'default'`, and it's unknown whether the ChatGPT sign-in honours `ultrafast`.
- **`detail: 'high'`:** caps a big page at 3,000 image tokens.

## What was built

The design above, built on 2026-10-07. There are no new tests, by your instruction, and the existing ones are unchanged.

- **`src/inputs/ink.mjs`:** `simplify()` (RDP) and `diagramish()`, the free gate.
- **`src/BoardStage.jsx`:** `crop()` is shared by `inkPng()` and the new `inkTrace()`, and the Ink API gains `trace(list)`.
- **`src/main.jsx`:**
  - The `shapes` ref, and `readShapes()`, `glanceShapes()`, `readyShapes()` and `handShapes()`.
  - `look()` starts `glanceShapes()` beside the text glance.
  - `commit()` adds ready shapes to the reading and to the committed text. That covers Enter, `collect_page_work` and speaking under a question.
  - `collect_page_work` adds ready shapes to the glance words it returns at once.
  - `handIn()` does the same for each exam part.
- **`src/tutor-bridge.js`:** `drawn()`, which gives the `drew: …` words, and `readShapes()`.
- **`src/backend-client.js`:** `readShapes`.
- **`backend/http/index.mjs`:** `POST /v1/sessions/{id}/shapes`, with `mutation: false`.
- **`backend/session/index.mjs`:** `drawingShapes()`, which does the id checks and the boxes. `pngOf()` is now shared with `drawings()`, whose behaviour is unchanged.
- **`backend/session/schemas.mjs`:** `DRAWING_SHAPES` (the request) and `DRAWING_SHAPES_READING` (the model's answer).
- **`backend/providers/codex/drawing.mjs`:** `drawingReader.shapes`, with the `drawing_shapes_v1` prompt.
- **`backend/providers/mock/session.mjs`:** `drawingReader.shapes`. `controls.drawingShapes` sets its answer; by default it reads no diagram.
- **`backend/session/agent.mjs`:** `AGENT_PROMPT` mentions `drew: …` lines. Run `scripts/setup-tutor-agent.mjs` for the live agent to get it.
- **`backend/CONTRACTS.md`:** the route, the page's behaviour and the two message forms.

**Next:**

1. **`evals/drawing-shapes.mjs`:** move in the scratch script, which renders scenes, calls `runtime.ask()` and scores against ground truth. Add messier scenes before trusting shapes for grading:
   - labels written after all the arrows;
   - crossing arrows;
   - strokes cut by the eraser;
   - finger ink;
   - a deliberately wrong FSM, to check the model doesn't "fix" it.
2. **Tune the gate on real pages.** Watch for number lines, timing diagrams and crossed-out writing.
3. **Neat redraws:** Plato may redraw a student's diagram with `show_visual` (`graph` or `memory`), without touching their ink.
4. **Check that connectors' ends lie near the items they join.**

## Risks

- **Lag.** A drawing's structure reaches Plato about 30 s after a pause. A hand-in carries it at once only when a glance already read exactly that ink. If the student keeps drawing, reads are dropped as stale, and the next one starts when they pause.
- **Evidence.** The committed answer includes `drew: …` only when the shapes were ready at hand-in. Shapes that arrive later reach Plato as context, but not the stored answer that grading uses.
- **An optimistic test.** Real ink is messier than the synthetic scenes:
  - labels are added later;
  - lines cross;
  - Plato's eraser splits strokes into pieces, so there are more ids;
  - phones mean finger drawing.
- **Known weak spots.** Vision models struggle with touching or overlapping shapes, crossing lines, small arrowheads (which decide direction), dashed versus solid lines, and counting.
- **"Helpful" corrections.** With the question in the input, the model may repair a wrong diagram. The prompt forbids this. Test it with wrong drawings before grading on it.
- **Wrong groupings that pass the checks.** The checks catch missing, duplicated and invented ids, but a stroke put in the wrong item passes them. The endpoint check (a connector's ends near its items) catches most wrong links.
- **Growth on dense pages.** The stroke list grows with the ink. The gate and the caps (400 strokes, plus RDP) bound it.
- **Drift between ids and pixels.** The stroke list must use the PNG's exact crop and scale, and the on-screen positions from `onScreen()`. Otherwise ids point at the wrong ink. `crop()` now feeds both, and each read builds both in the same tick.
- **Renderer gaps.** `graph` takes at most 16 nodes and has no start arrow. `memory` is one column. Grids need their headers read.
## Sources

- OpenAI: [Decisions guide](https://developers.openai.com/api/docs/guides/decisions) · [Decisions public beta](https://community.openai.com/t/decisions-api-is-now-available-in-public-beta/1403877) · [Changelog](https://developers.openai.com/api/docs/changelog) · [Images and vision](https://developers.openai.com/api/docs/guides/images-vision) · [Image cost calculator](https://developers.openai.com/api/docs/guides/image-cost-calculator) · [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) · [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- Products: [tldraw Make Real](https://tldraw.substack.com/p/make-real-the-story-so-far) · [make-real-starter](https://github.com/tldraw/make-real-starter) · [tldraw agent starter kit](https://tldraw.dev/starter-kits/agent) · [Excalidraw wireframe to code (model update)](https://github.com/excalidraw/excalidraw/pull/8148) · [Excalidraw draw to shape](https://github.com/excalidraw/excalidraw/pull/9313) · [Microsoft Ink Recognizer (retired)](https://learn.microsoft.com/en-us/previous-versions/azure/cognitive-services/Ink-Recognizer/overview) · [ML Kit Digital Ink](https://developers.google.com/ml-kit/vision/digital-ink-recognition) · [ML Kit base models](https://developers.google.com/ml-kit/vision/digital-ink-recognition/base-models) · [ML Kit on Android](https://developers.google.com/ml-kit/vision/digital-ink-recognition/android)
- Research: [$-family recognizers](https://depts.washington.edu/acelab/proj/dollar/index.html) · [Ramer–Douglas–Peucker](https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm) · [PaleoSketch (IUI 2008)](https://doi.org/10.1145/1378773.1378775) · [Bresler et al. 2016](https://link.springer.com/article/10.1007/s10032-016-0269-z) · [VLMs are blind](https://arxiv.org/abs/2407.06581) · [Fadeeva et al. 2024](https://arxiv.org/abs/2402.15307) · [Arrow-guided VLM 2025](https://arxiv.org/abs/2505.07864) · [Set-of-Mark 2023](https://arxiv.org/abs/2310.11441)
- Local: Codex app-server protocol bindings (`codex app-server generate-ts`, codex-cli 0.157.0): `UserInput` images accept `detail`, and there is no Decisions method.
