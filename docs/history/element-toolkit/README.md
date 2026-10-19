# Study element toolkit · proposed v1

**Status: implementation specification and isolated design specimens, October 8, 2026. Not wired into the app.** The existing app is changing; this proposal adds no production imports, dependencies, routes, provider calls, or database changes. Requirements below describe the target, not guarantees of today's renderers.

The goal is a single calm question space with many ways to show understanding. An agent chooses a teaching move, a reusable composition, and content. The toolkit handles type, spacing, geometry, controls, accessibility, and failure. Agents should almost never generate CSS, coordinates, SVG, meshes, or interaction code.

Start with [the agent contract](agent-contract.md) for authoring and caching; [subject coverage](subject-coverage.md) for concrete acceptance cases; [the specimen](specimen.html) for inspectable layouts; and [validation](validation.md) for what was actually checked. This file owns visual and behavioral requirements. The contract owns wire field names. The specimen is illustrative, not a second renderer API.

## 1. Product boundaries

- One active question or coherent teaching move. Every visible object supports that move.
- One main learner action, optionally with a short justification. Exploration controls support that action; they do not become a second dashboard.
- One visual focus. Two views can show the same model; they must share state and refer to the same entities.
- Content appears directly on the page. Use whitespace first, a hairline second, and a container only when it conveys grouping or affords input. No nested cards, permanent inspector, decorative toolbar, score confetti, or transcript pasted onto the board.
- A desktop question should usually fit in its available question space. Readability and completeness outrank fitting everything above the fold. On a phone, zoomed page, or long passage, use deliberate vertical continuation. Never silently remove a premise to make it fit.
- The director chooses pedagogy and assessment. The element maker expresses the representation. A renderer does not infer facts, decide correctness, or award mastery.
- A signature describes an interface; it does not reveal an implementation or a runtime trace. Visualize the known structure immediately; request or retrieve the body and input before claiming execution behavior.
- A small set of families covers representations across STEM. Specialized scientific semantics still require validated adapters. A generic drawing is not a molecule verifier, circuit solver, theorem prover, or arbitrary code runtime.

### Existing pieces to retain

| Current location | Reuse / boundary |
|---|---|
| `src/BoardStage.jsx`, `src/board-stage.css` | Existing material → ask → work page and serif styling; map it incrementally to prompt/body/response/feedback slots. Do not replace the outer workspace. |
| `src/talk-screen.css` | Owns room left after conversation and mosaic frame. The toolkit receives the measured content rectangle; it does not use the full browser width. |
| `shared/elements/index.mjs`, `backend/providers/prompts/elements.mjs` | Four existing kinds, validators and per-kind instructions. Extend this registry rather than add a parallel generator service. |
| `src/elements/*` | Figure, digital circuit, trace, 3D, code and LaTeX rendering/work zones. Wrap and repair these incrementally. |
| `src/visuals/diagram.mjs`, `src/visuals/settle.js` | Useful semantic diagrams and measured label handling. Current clipping and approximately 10.5px label floor are below this proposal's requirements. |
| `shared/retained-scene.mjs`, `shared/board-parts.mjs` | Existing identities, bounded retained objects and interaction anchors. Reuse where applicable; semantic scene composition sits above geometry. |
| `src/inputs/AnswerInput.jsx`, `src/inputs/answer.mjs` | Existing choices, ordering and matching. Preserve their behavior while providing a common response contract. |
| `docs/design-manifesto.md`, `docs/director-actor.md` | Calm active board, retained objects, prepared cards and server-owned credit. This toolkit does not alter the grading rules. |

Current hazards observed in source: invalid elements can disappear; diagram labels can be shortened; 3D labels have a length cap; C trace snapshots are not proof of execution; the current circuit kind is digital logic. The new contract must report these conditions rather than make unsupported promises. Existing board ink follows a part's geometry; changing its layout after writing needs explicit preservation, not a fresh render that detaches the ink.

## 2. Composition model

A **scene** is one question-sized composition, not a Three.js scene. Each **element** is a typed, stable content object. A **recipe** is a reusable arrangement of those elements and their semantic bindings. A **response** is the student's committed evidence, separate from incidental exploration.

```
director move + known data + question identity
                 ↓
      select recipe / small element set
                 ↓
    validate meaning, references, capabilities
                 ↓
          resolve shared renderers
                 ↓
        measure → arrange → check fit
                 ↓
      show scene + local interactions
                 ↓
   submit evidence → existing assessment path
```

### Slots and reading order

| Slot | Responsibility | Rules |
|---|---|---|
| `prompt` | What is given and what the learner should do | Required, concise, selectable DOM text; no detached instruction buried in a caption. |
| `body` | Supporting representations | Optional; one primary and usually at most two supporting views. Local captions identify what is shown. |
| `response` | The student's work and submission | One response group, may contain several tightly related fields. Explicit labels and an unambiguous submit action. |
| `feedback` | Authorized hint or result after an action | Absent initially unless the director intentionally supplies a teaching hint. Feedback is not an answer key shipped hidden in the DOM. |

The prompt can briefly refer to material below. Long source reading belongs in the body, with the actual task still at the top. Logical DOM and keyboard order remain prompt → body → response → feedback across every layout. A repeated short instruction near the response is allowed only when long material separates it from the prompt.

### Four body layouts, chosen by content width

| Preset | Use | Narrow fallback |
|---|---|---|
| `stack` | One figure, table, equation or passage with context | Already stacked. Default. |
| `paired` | Code + memory, equation + graph, source + annotation | Stack in reading order with matching entity labels. |
| `compare` | Two alternatives whose differences matter | Labeled A then B; keep the same scale and units. Never imply scale equality if domains differ. |
| `steps` | Derivation, execution, experiment or worked example | One current state with previous states reachable; preserve question and response. |

No arbitrary scene coordinates, free column counts, negative margins, agent-selected fonts, or breakpoints in author payloads. A body can group related elements; no recursively nested layout language. A complex lab is a sequence of scenes, with a shared model and saved learner work.

Default authoring envelope: 1–3 body elements, 1–2 short prompt paragraphs, 1 response group, 0–1 contextual hint. This is a planning budget, not a text truncation rule. Larger needs choose a multi-step recipe or source excerpt. Size limits in the agent contract are validation limits and return errors; they never cut strings.

## 3. Visual tokens and typography

These proposed tokens inherit the site's current visual language. They are renderer-owned defaults, not a new global stylesheet. The specimen uses a small representative subset.

| Token | Value / rule |
|---|---|
| `paper` | `#ffffff`, same as question surroundings |
| `ink` | `#1d1b18`, primary content |
| `muted` | `#6f6b64`, secondary readable text |
| `accent` | `#2f4f8a`, focus, selection, active state |
| `accent-surface` | `#f3f5fa`, light selected background |
| `line` | `#e6e0d4`, nonessential separators only |
| `control-line` | `#8a857c`, meaningful idle input boundaries on white |
| `warm` | `#b5653e`, optional second series / annotation; never sole error signal |
| `space` | 4, 8, 12, 16, 24, 32px; prefer 24px between slots and 12px between related pieces |
| `prose` | Iowan Old Style → Palatino Linotype → Georgia → serif; 18px/1.6 default, 19px at wide reading widths |
| `interface` | Inter → system sans; 14px/1.45; input text at least 16px |
| `code` | ui-monospace → SFMono-Regular → Menlo → monospace; 14px/1.55, editor input 16px on touch devices |
| `diagram-label` | 14px/1.4 minimum at rendered scale; meaningful values never use decorative microtype |
| `caption` | 15px/1.45, serif or sans consistently within scene |
| `measure` | Prose up to 65ch; center broad visuals inside the body rather than stretch paragraphs |
| `radius` | 6–8px for actual controls/work areas; no radius needed for content |
| `focus` | 2px solid accent with 3px offset; visible without changing layout |
| `motion` | No continuous decorative motion; optional state transitions ≤150ms, reduced-motion removes them |

Use tabular numerals for measurements and table numbers, decimal alignment where useful, and monospace only for code or identifiers. Preserve minus signs, exponents, vectors, units, subscripts, primes, interval endpoints and stereochemical marks. Do not force uppercase scientific symbols. Reserve italic serif for genuine notation or a restrained caption, not every instruction.

Required contrast is ≥4.5:1 for normal text and ≥3:1 for meaningful graphical/UI boundaries against their adjacent colors. The pale separator is not a sufficient input outline. Essential strokes must use the darker boundary or ink/accent. Highlight states pair color with a label, shape, line pattern, or text. Verify computed foreground/background combinations; palette membership alone does not prove contrast. These requirements derive from [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## 4. Fitting, overlap and reflow: mandatory behavior

### Available space, not device assumptions

The host passes a measured content box after frame, conversation, padding, safe areas, and visible controls. Use `ResizeObserver`/container queries; a wide browser may contain a narrow question column. The outer page owns vertical scrolling. If the host cannot provide a sensible box at high zoom, the host must relax its frame and fixed heights. The element cannot fix inaccessible workspace chrome.

The inspected narrow-screen CSS would leave only 204px of content at a 320px viewport (`320 − 24 − 2×24 − 2×22`). Meeting the proposed 256px content floor therefore requires a small host frame/padding adjustment during integration. This spec and its independent specimen do not claim to have corrected that live workspace constraint.

- Minimum supported question content width: 256 CSS px; audit the full page at 320 CSS px viewport. Also audit content widths 360, 480, 640 and 800px and heights 320, 480 and 640px.
- A paired body needs each child's declared readable minimum plus a 24px gap. Example: 280px code + 260px structure + 24px = 564px; below that, stack. Do not use a universal desktop breakpoint.
- Ordinary text wraps naturally. `min-width:0` belongs on grid/flex children, with `minmax(0,1fr)` tracks. Long prose identifiers may wrap without altering their copied value. Code source keeps exact whitespace in its own scroll region.
- The page can grow vertically. Never use `transform:scale()` or a shrinking font to make a whole question fit. Never hide page overflow as a substitute for correct sizing.
- Horizontal scrolling is confined to labeled, keyboard-accessible regions for genuinely two-dimensional content: large matrices, tables, code, or spatial diagrams that cannot reflow without changing meaning. Prompt and response remain in normal flow. Provide a compact reading/table alternative where possible. This follows [WCAG reflow's two-dimensional-content distinction](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- At least the task and a meaningful initial view should be visible on ordinary desktop sizes. For long content, put a short task before the body and a reachable response after it. Do not pin a response bar over content or the on-screen keyboard.

### Deterministic fit ladder

Run after fonts and mathematical layout settle and again on container/font changes. Hidden or zero-sized mounts wait until measurable.

1. Resolve actual text/math extents. DOM is preferred for prose and labels; SVG text uses measured glyph bounds transformed to screen coordinates. Reserve ascenders, descenders, markers and focus outlines.
2. Lay out the semantic model. A graph's edges attach to node ports; a plot's points stay at their data coordinates. Agents do not repair positions.
3. Detect unintended overlap and clipping. Rectangles are a coarse pass; distinguish intentional label-in-node containment from label-label collision. Edge tests exclude the correct endpoint/port and intentional intersections but include foreign labels and nodes. A circuit wire crossing is not a junction unless marked in the model.
4. Wrap labels at meaningful boundaries; grow node boxes and layout lanes; expand the visual's vertical extent. Keep complete labels. For long scientific terms, allow an indexed legend that retains each entity ID and full text.
5. Switch paired → stack or horizontal → vertical semantic layout, if orientation is not part of the learning objective. Recompute connectors; never merely move text away from its referent.
6. Reduce only nonessential tick/grid density and decorative whitespace. Keep every task-relevant mark, unit and value. A label halo may improve contrast but does not solve a collision.
7. Use a recipe's compact alternate view, then an explicit local scroll region or equivalent table. If a table would reveal the requested inference, author an equivalent unsolved view; if none exists, use an alternate assessment with the same objective.
8. If essential content still fails, retain the valid prior scene for the same question or show the approved prompt + fallback. Report `needs_reframe`/`fit_failed` with the offending IDs. Never silently show a broken diagram or swap in a misleading simplification.

Bounded work: at most one attempt per available layout variant and one label-relayout pass per variant; do not loop random placements. A resize does not call a model. Fallback output is also measured. If a future renderer cannot guarantee a safe fallback, disable that recipe capability until it can.

### Geometry acceptance rules

- No unrelated text, controls, or slot rectangles overlap. Containment (label inside its own node) and explicitly authored mathematical intersection are allowed; arbitrary geometric overlap is not automatically an error.
- Pad label collision boxes by 4 CSS px and control focus extents by 3px. This is a toolkit target, not a WCAG spacing claim.
- Critical arrows, endpoints, minus signs, exponent glyphs and selection rings stay inside the visible region or an explicitly scrollable content extent.
- Graph labels remain attached to the correct entity when moved. In 3D use leader lines or a numbered legend; hiding an occluded critical label without an alternative is a failure.
- Long labels are never ellipsized in essential content. Tooltips cannot be the only route to full instructions, values or labels.
- Plot axes have explicit units, domain, scale and orientation. Point geometry is not moved to avoid labels. Equal aspect ratio is required where angles, lengths or circles are meaningful.
- Feedback arrives below the response without shifting the student's active input. Reserve a small status line for routine local confirmation; longer explanations enter flow.

### Zoom, text spacing and input

At 200% text size and 400% browser zoom/320px equivalent width, all instructions, fields and actions remain reachable. Also apply 1.5 line height, 2em paragraph spacing, 0.12em letter spacing and 0.16em word spacing without content loss, per [WCAG text-spacing guidance](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html). These overrides must not make fixed-height labels clip.

Use 44×44px comfortable hit areas for primary controls and touch targets, including node selection through an equivalent list where density prevents it. The standards minimum is 24×24px with specified exceptions; the 44px toolkit target is a product choice ([W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). Avoid invisible hit areas that overlap each other. Every drag has a click/tap and keyboard route: select item then destination, up/down reorder buttons, or numeric coordinates. A small drawing handle may have a larger hit region only when it does not capture a neighbor's action.

## 5. Semantic element catalog

The stable envelope and exact request fields are in the agent contract. The following are required capabilities of each family's `data` validator and renderer, not claims that the current kind schemas already accept these fields. Each registry entry supplies its own strict field schema, visible example, measurement policy, supported interactions, accessible view, resource limits, and validation fixtures before it is advertised to agents.

| Family | Semantic payload / capabilities | Required checks and fallback |
|---|---|---|
| `text` | Paragraphs, source excerpt, short list, exact text spans, provenance | Native selectable text; source offsets survive annotation; wrap without dropping words. Source excerpts include only necessary context. |
| `math` | TeX or typed expressions, aligned equation steps, matrices, units, defined symbols | Parse safely; preserve domains and equality/approximation distinctions; accessible math; wrap at authored step boundaries; wide matrix has local scroll. No algebra invented by layout. |
| `table` | Stable row/column IDs, headers, typed cells, optional missing cells, units | Rectangular data or explicit spans; headers remain associated; missing ≠ zero; editable cells identified separately; native table or labeled field groups. |
| `plot` | Data series or approved expression reference, domain, scale, units, discontinuities, uncertainty, selected entities | Finite samples, axis transform validity, no lines across discontinuities/missing values, no log of nonpositive values, no clipped error bars. Data table alternative from the same public model. |
| `diagram` | Nodes, ports, typed directed/undirected edges, containers; spatial variant with points/vectors/constraints | Unique IDs; valid references; explicit edge meaning and junctions; layout reflects topology. Do not use graph connectivity as proof of causality. Fallback adjacency/spatial relation table. |
| `code` | Language, exact signature/source, source revision, named ranges, optional edit regions | Highlighting only by default; no execution from markup; preserve copy semantics and indentation. Long lines scroll locally. Exact source line/range bindings. |
| `trace` | Verified execution/simulation reference, initial model, ordered states/deltas, input and visible step | Step = explicit before/after semantics; validate state transitions against approved engine or curated verification. Unverified snapshots labeled illustrative and never used as hidden grading truth. Accessible state table. |
| `circuit` | Component kinds, pin IDs, nets, logic states, or approved analog model reference | Distinguish digital logic and analog semantics; identify junctions, pin direction, floating/unknown states; allow intentional invalid circuits as clearly scoped student tasks. Generic geometry cannot claim electrical simulation. |
| `scene3d` | Approved asset/primitive references, transforms, labels bound to entity IDs, camera preset, units | Finite bounded transforms; shared materials/geometries; no arbitrary shaders/scripts; keyboard views + reset; label visibility check; 2D views and semantic equivalent when WebGL fails. |
| `figure` | Trusted source image or current allowlisted SVG, intrinsic dimensions, source/provenance, semantic alt/callouts | Escape hatch for irreducible subject artwork. Preserve image resolution and scale bar; no generative redraw of evidence. Sanitize SVG; measure labels. Not the default for a graph or table. |

**Annotations are bindings**, not another rendering engine: highlight entity/range, bracket, label, or callout referencing a stable ID. A selection over code binds to source range; a label over an organ binds to an image region; a vector binds to model coordinates. No guessed screen-pixel anchors in agent payloads. Student ink binds to its scene/element revision and coordinate transform; text-anchored annotation should use source ranges instead of pixel guesses.

### Shared scientific data rules

The renderer consumes structured facts; presentation strings never serve as the only numerical truth. Domain adapters may add these fields inside `data`:

- Scalar: exact decimal/rational form when needed, display precision separately, units and dimensional conventions. Use strings for exact large integers/decimals that JSON numbers cannot preserve. Display rounding must not change the stored answer or grading tolerance.
- Coordinates: explicit axes, orientation, origin, units and reference frame. Distinguish world/data coordinates from layout coordinates.
- Sequence: stable item IDs and an explicit order; time units and event/state semantics. Gaps and unknown states remain visible.
- Dataset: provenance, sample/population distinction, missing-value convention, uncertainty definition and reproducible seed where randomization is used.
- Relations: named source/target ports, edge type, multiplicity, direction and whether crossing/containment has meaning.
- Expressions: declared variables, assumptions and domain. No `eval` of arbitrary model text; approved parser/engine and operation/time limits only.

Units are not converted opportunistically by an LLM or layout code. Use a verified conversion adapter, with explicit handling of affine units such as °C, or present the supplied units unchanged. Degrees/radians, log bases, axis reversal, signed versus unsigned bits, vector handedness and chemical charge are explicit whenever ambiguity affects the answer.

### Subject recipes built from these families

Recipes are registry data with parameter schemas, not one new component per class.

| Recipe | Composition / learner move |
|---|---|
| `read-respond` | text/figure + response; explain, cite a span, identify evidence |
| `equation-steps` | math + editable math/text steps; derive, locate invalid step, justify operation |
| `plot-predict` | math/table + plot; predict shape, place a point, compare intervals, explain trend |
| `matrix-transform` | math/table + spatial diagram or scene3d; transform a vector, identify null space |
| `code-structure` | code + diagram/table + optional verified trace; predict pointer/state, debug, explain invariant |
| `trace-state` | code/diagram + trace + table; next state, variable change, counterexample |
| `graph-reason` | diagram + response; traversal, path, proof, topology, automaton state |
| `force-system` | spatial diagram + math; add force vectors, balance, choose sign/frame |
| `circuit-state` | circuit + truth/state table; toggle, predict output, design or repair |
| `reaction-balance` | math + table/diagram; coefficients, limiting reagent, charge/electron balance |
| `structure-identify` | validated figure/diagram/scene3d + annotation; molecule, tissue, anatomy, crystal |
| `process-model` | diagram + trace/table; feedback loop, pathway, system dynamics, causal prediction |
| `experiment-evidence` | table + plot + text; estimate uncertainty, design control, interpret evidence |
| `compare-models` | paired same-scale visuals or text; discriminate explanations, transfer to new setting |
| `source-annotate` | text/figure + anchored selections; history, literature, language, scientific reading |

Recipes such as stereochemistry, analog circuits and differential-equation simulation require a domain adapter whose correctness can be checked. Until that adapter exists, use verified authored figures/datasets and an accessible unsolved response. Do not market their generic visual approximation as a simulator.

## 6. Ways the learner can demonstrate understanding

Use one response group with a `data.type` from the response registry. Names below are conceptual capabilities; the contract determines supported wire names. Tooltips, slides and animation are not evidence by themselves.

| Learner action | Evidence to persist at submit | Accessible equivalent |
|---|---|---|
| Select one/many | Stable option IDs, explicitly empty vs unanswered | Native radio/checkbox controls |
| Enter number/unit | Original text, parsed value if valid, unit, precision policy | Labeled text/decimal input; no forced spinner for scientific notation |
| Explain/prove | Exact response, named claim/step references | Text or consented speech transcript; typing always available |
| Build math steps | Ordered expressions + reasons, assumptions | Editable source and readable output, not image-only math |
| Order/match/classify | Ordered IDs or explicit pairs/groups | Buttons/selects; duplicate labels still have distinct IDs |
| Fill table/trace | Changed cells/state values and their row/column IDs | Table with labeled inputs and errors at cells |
| Place/select/construct | Semantic entities, graph edges, points/vectors in data coordinates | Entity list, coordinate fields, select-and-place |
| Annotate/draw | Source-anchored ranges or strokes + scene transform/revision | Text explanation or equivalent structured task when drawing isn't essential |
| Edit code/debug | Exact source diff/version, supplied input, approved run result reference | Keyboard editor; run and submit are different actions |
| Predict then explore | Prediction committed before reveal, observations afterward | Step buttons + accessible state records |
| Design an experiment | Parameter choices, control, prediction, observed dataset, explanation | Labeled controls and table; no drag-only apparatus |

Interaction state is local and cheap. Drag frames, keystrokes, pointer hovers and camera movement do not call the director. Commit meaningful events such as selected entity, finished arrangement, final parameter choice, requested hint, or submitted answer. A debounced local draft is useful for recovery, but is not a submitted answer. The director receives bounded semantic summaries, never a continuous event transcript.

Exploration may reveal the answer. A predicted state stays locked until submission or an explicitly requested reveal, and that reveal records assistance. The server alone decides whether a new question identity is needed after changing parameters. Visual highlighting, an animation completing, or repeated submissions cannot award mastery. Preserve the existing independent verification requirements.

## 7. Stability, accessibility and interruption

Every scene includes a concise public description of the givens and available actions, derived from exactly what is displayed. Alternative text describes the same evidence and leaves the same inference for the learner. It must neither withhold a visible premise nor leak the answer. If visual recognition itself is the assessed skill, provide a separately validated accessible task, not an answer-bearing caption.

Controls have visible labels, accessible names, keyboard operation and visible focus. Status announcements are short and polite; do not reread the entire diagram on every step. Reading order survives stacking. Reduced motion removes automatic transitions; animations expose pause, step and reset. Color is never the only cue. These are required behaviors; the current specimen audit is not a complete assistive-technology certification.

While the student types, draws, drags or has a composition input active, the director cannot replace the active response. Queue the visual update or replace only an independent body element with a preserved anchor. Do not auto-scroll for routine highlights. Announce substantial changes without stealing focus. Preserve focus by semantic ID across safe patches.

Source changes, new questions and invalidated answers are explicit transitions. Cancel stale generation, retain an attributable draft, and explain that the question changed. A late element for question A never appears in question B. A failed optional visual leaves the prompt and response usable; a failed essential premise blocks submission with a clear recovery. Offline state keeps local work and distinguishes saved draft from accepted submission.

No generated page HTML/JS, arbitrary remote asset URL, arbitrary LaTeX trust command or runtime import is accepted. Approved source images are resolved by owned asset ID. Escape/sanitize again at the renderer boundary. Privacy scopes apply to stored diagrams, alt text, events and cache keys just as they apply to source documents.

## 8. Reuse, cost and renderer choices

The agent contract owns the cache keys, compact authoring path and budget behavior. The governing rule is **select → parameterize → patch → generate only when necessary**.

1. Ship renderer code, theme, layouts, interaction handlers and basic geometry once.
2. Store reviewed recipes and their parameter schemas in the existing registry. Retrieve only the selected capability's rules for the maker.
3. Reuse a validated course/source visual when its content and scope match. Reuse geometry independent of learner state; do not share private learner answers.
4. Send new data or a small revision-bound operation for a retained scene. Do not serialize the entire rendered DOM/SVG into every tutor turn.
5. Keep rendering, layout repair and local interactions deterministic. A fit error is not an excuse for repeated billable regeneration. At most one targeted semantic repair call within the card budget; otherwise use a prepared fallback.

### Tool inspiration and actual choices

| Tool / technique | Decision and reason |
|---|---|
| Native HTML/CSS + existing React | Default for text, tables, controls and composition; no new UI framework. Container queries fit the question's width, not the browser's ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)). |
| Existing KaTeX | Reuse for math, keep untrusted commands disabled, cap expansion/size and render a legible error fallback ([KaTeX security](https://katex.org/docs/security)). A formula renderer does not verify algebra. |
| Existing semantic SVG + d3-hierarchy | First choice for graph/tree/flow views. Expand the existing semantic model before adding another layout engine. |
| Mermaid | Adopt its concise declarative-diagram idea. An optional import adapter can cover authored flow/state/sequence diagrams if measured coverage warrants a dependency. Pin version, disallow model configuration directives, use strict security, sanitize output, and keep native interactions/semantics. Mermaid's titles/descriptions help, but do not replace a full equivalent task ([syntax](https://mermaid.js.org/intro/syntax-reference.html), [security](https://mermaid.js.org/config/schema-docs/config-properties-securitylevel.html), [accessibility](https://mermaid.js.org/config/accessibility.html)). Not a default numerical plotter or arbitrary interactive question engine. |
| Existing Three.js | Use only when depth/rotation teaches something. Cache immutable geometry/materials by renderer-owned keys; instance repeated objects; share by reference count; dispose on eviction, not while another view uses the asset. Render on demand, pause offscreen, use bounded pixel ratio and a 2D fallback. GPU acceleration belongs here, not in static prose. Three.js requires explicit resource disposal ([cleanup](https://threejs.org/manual/pages/cleanup.html), [on-demand rendering](https://threejs.org/manual/pages/rendering-on-demand.html)). |
| New domain libraries | Add only for an actual missing correctness capability: chemistry topology/stereo, analog solving, symbolic equivalence. First use verified authored data. Expose capability only after integration and verification. |

Token savings must be measured, not expressed as invented price percentages. Record actual maker input/output tokens, repair calls, cache hits, serialized bytes, time to usable question, and warm/cold behavior. Provider prompt caching is distinct from the application's artifact cache and not guaranteed. A warm template render and a local slider change must require zero generation calls. Reusing a visual does not eliminate director reasoning or grading costs.

Suggested initial performance acceptance targets (not measurements): visible control feedback within 100ms on the reference device; no main-thread task over 50ms in routine local input; no animation frame work while hidden; warm ordinary scene ready within 200ms excluding network and fresh font loading. Profile and adjust complexity limits against actual devices. Do not add a worker, cache service, or heavy layout dependency without an observed need.

## 9. Acceptance and staged wiring

For a recipe to be advertised to agents, its owner supplies one complete semantic example, one malformed case, one narrow/long-content case, exact references and a fallback. Run the actual render, interact, inspect the result, and fix observed errors. Do not write hundreds of shallow tests that only restate the schema.

Required acceptance gates:

1. **Content:** an independently checked target/model; values and units agree across every view. A correct picture is distinct from a correct scientific model.
2. **Contract:** strict schema, stable references, deterministic expansion, source/question binding, private answer key excluded from public payload and logs.
3. **Layout:** screen-measured labels/control boundaries, no unintended overlap/clipping at the widths above, long-label/text-spacing/zoom checks, explicit overflow alternatives.
4. **Interaction:** keyboard and pointer reach the same result; resize and patches preserve drafts/focus; submit snapshots one consistent revision; stale events do not grade.
5. **Failure:** missing capability, parse failure, unavailable WebGL, late generation, and unfit content have clear safe fallbacks.
6. **Cost:** warm reuse and local interaction show zero maker calls; only selected rules enter maker context; budgets stop repair loops.

The isolated specimen is an executable visual specification. Its checks establish only the layouts and interactions it actually exercises. Semantic walkthroughs in the coverage file test the breadth of the proposed vocabulary; they do not establish that these renderers, scientific adapters, browser accessibility, or learning outcomes are already implemented.

### Minimal integration sequence, after this spec is accepted

1. Wrap the existing page, figure, diagram and response implementations with the scene envelope, measured slot width, stable IDs and non-silent fallback. Establish `read-respond`, `code-structure`, `plot-predict` from verified data.
2. Move recurrent layouts/label logic into their existing shared owners. Add typed table/plot/math/diagram schemas, the selected-rule manifest and evidence events, reusing current question/session identity. Start with complete small scenes on content changes; introduce closed revision-bound patches only if measured payload costs justify them. Local interaction state stays local either way.
3. Add recipes from measured course demand. Route unknown domains to verified figure/text/table recipes. Introduce a specialist adapter only when a real course case cannot be expressed accurately otherwise.
4. Add persistent artifact reuse using existing storage and ownership rules. Measure repeat-work reduction before increasing speculation or cache complexity.

No universal subject-completeness claim follows from this specification. It provides a compositional representation path for the covered STEM tasks, an honest fallback for unusual material, and a concrete gate for adding deeper domain behavior without generating a new UI for every question.
