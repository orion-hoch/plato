# Cross-subject coverage and acceptance cases

Status: proposed specification, 2026-10-08. This is a semantic walkthrough and a future integration acceptance set. It does **not** report browser, screen-reader, renderer, or learner testing. No production behavior is implied by a case appearing here.

The target is a compact question surface with one current task, enough context to reason, and one clear response action. A subject does not get its own page template. It supplies typed data, domain constraints, a response contract, and an evidence target to the same scene. Some tasks need a sequence of scenes; fitting every step, answer, reference and visualization onto one screen is not an acceptance requirement.

## Vocabulary and case procedure

Every case uses `prompt`, `body`, `response`, and `feedback` slots. The types below are proposed registry capabilities, not names accepted by the current four-kind API. A composition such as `m04-function: plot` means a stable element ID and a typed renderer. An element keeps its ID when its data, selection, viewport or highlighted step changes. A new question gets a new scene identity.

Content families used here are `text`, `math`, `table`, `plot`, `diagram`, `code`, `trace`, `circuit`, `figure` and `scene3d`. Domain adapters supply typed models to those families: for example, a molecule is a chemical graph with bonds and stereochemistry, not a bag of anonymous spheres. Response capabilities include `choice`, `number`, `expression`, `text-entry`, `select`, `match`, `order`, `table-entry`, `construct`, and `code-entry`. These are descriptive case labels, not extra content kinds or fixed wire enum values: one `kind: response` wrapper contains the related fields, mapped to supported types in the response registry. The [agent contract](agent-contract.md) owns exact field and enum names. `construct` means constrained edits to a typed model, with a keyboard form or equivalent controls. It never means model-generated JavaScript.

For each fixture:

1. Freeze the prompt, assumptions, source revision, model, intended response and private expected target. A diagram cannot supply an unstated assumption.
2. Compile the composition, derive all views from the same model, and validate domain invariants before display. Mathematical checks and presentation checks are separate.
3. Display only the current question and useful body content. Keep private expected targets and unrevealed feedback on the server; never serialize them into the scene, hidden DOM, alt text, IDs or future frames. Deliver authorized feedback only after the intended teaching action.
4. Capture an explicit submission containing question identity, scene revision, stable target IDs, typed values and assistance received. Hovering, orbiting, watching or revealing is not a submission and is not evidence of mastery.
5. Evaluate the submitted evidence using exact checks where possible, domain tolerances where declared, and an explicit reasoning rubric where needed. Preserve the attempt during resize, feedback, retries and temporary renderer failure.

Unless a case overrides it, `prompt` is one `text` element and `feedback` is absent initially; authorized feedback is later bound to the submitted revision. Listed compositions describe body elements and child fields of a single response group, not multiple top-level response elements. Field IDs use the case prefix, such as `m04-answer`; object IDs inside a graph, table or model are also stable. A multi-part response still has one explicit submit action.

## What the current implementation establishes

Read for this specification: `shared/elements/{index,figure,trace,circuit,scene3d}.mjs`, `src/elements/Element.jsx`, `src/elements/elements.css`, `docs/design-manifesto.md`, and `docs/teaching-design.md`.

| Existing kind | Useful foundation | Boundary relevant to these cases |
| --- | --- | --- |
| `figure` | Restricted SVG, shared palette, canonicalization, per-figure marker IDs | SVG shape validation does not establish factual correctness, label bounds, collision-free layout or a complete accessible explanation. Fixed authored geometry is not an automatic layout system. |
| `trace` | A bounded RISC-V interpreter can compute state | Authored C snapshots are shape-checked, not execution-verified. New language or machine semantics need an adapter or an explicitly static worked example. |
| `circuit` | Digital gates, latches and flip-flops with a bounded evaluator | This is not an analog-circuit solver. Its current label clipping and grid placement are not adequate generic labeling contracts. |
| `scene3d` | Data-only geometry and a lazy-loaded Three.js renderer | Camera position and animation do not prove physical, chemical or geometric semantics. Projected label overlap, full labels and a nonvisual equivalent need explicit contracts. |

The capability names below therefore specify work to wire in later. They must not be inserted into the current API until registered, validated and rendered.

## Mathematics and quantitative reasoning

### M01 · Fractions and equivalent representations

- **Prompt:** “Shade a fraction equal to 3/4 on an eight-part strip, then give its numerator.” All parts have equal area.
- **Composition:** `m01-strip: diagram` using the fraction-strip recipe; `m01-parts: select` with eight stable cell IDs; `m01-answer: number`.
- **Evidence and target:** Exactly six selected cells and numerator `6`. Accept any six cells unless contiguity is explicitly asked for. A follow-up explanation can establish why multiplying numerator and denominator by two preserves the fraction.
- **Stress / acceptance:** At narrow width, retain eight distinct targets with an ordered checkbox alternative; do not infer equality from unequal-looking SVG partitions. Selection is visible through fill and a check mark. A different valid selection must not be called wrong.

### M02 · Algebra with extraneous solutions

- **Prompt:** “Solve √(x + 2) = x over the real numbers. Check any candidate in the original equation.”
- **Composition:** `m02-equation: math`; `m02-work: expression` with optional sequential steps; `m02-reason: text-entry`.
- **Evidence and target:** Squaring gives candidates `2` and `−1`; only `2` satisfies the original equation. Accept any valid method that gives `{2}` and rejects `−1` using the nonnegative square root or substitution.
- **Stress / acceptance:** Preserve square-root grouping, negative signs and the declared real domain. A symbolic matcher must not accept both roots because it checks only the squared equation. A narrow display may break at equality relations, never inside the radicand.

### M03 · Geometry and trigonometry

- **Prompt:** “In right triangle ABC, angle C is 90°, AC = 3 cm and BC = 4 cm. Find AB and sin A.”
- **Composition:** `m03-triangle: diagram` with constrained triangle geometry; `m03-length: number` with unit; `m03-ratio: expression`.
- **Evidence and target:** `AB = 5 cm`, `sin A = 4/5`. Vertex identity must survive rotation or reflection of the diagram. A separate explanation distinguishes the side opposite A from the adjacent side.
- **Stress / acceptance:** Rotate the triangle, use a near-vertical side, and enlarge labels. Place the right-angle mark inside its angle without touching the lengths. Supply a structured text description; visual scale must not become a hidden measurement aid.

### M04 · Functions, holes and asymptotes

- **Prompt:** “For f(x) = (x² − 1)/(x − 1), give f(1), the limit as x approaches 1, and whether the graph has a vertical asymptote there.”
- **Composition:** `m04-function: plot` with declared domain exclusion; `m04-formula: math`; `m04-answers: table-entry`.
- **Evidence and target:** `f(1)` is undefined; the limit is `2`; there is no vertical asymptote at `1`. The plot is `y = x + 1` with an open point at `(1,2)`.
- **Stress / acceptance:** The hole remains distinguishable in the supported plot domain/zoom range and does not become a filled sample; an inspectable marker list covers views where the point cannot be resolved visually. Include a sibling fixture `1/(x−1)` whose two branches never connect across the singularity. The accessible view describes the same open/closed marks as the visual plot, without adding a computed limit or asymptote classification. For algebraic derivation without graphical help, omit the plot in every input mode.

### M05 · Derivatives and local behavior

- **Prompt:** “For f(x) = x³ − 3x, locate the stationary points and classify each.”
- **Composition:** `m05-curve: plot`; `m05-derivative: expression`; `m05-points: table-entry` for x, y and classification.
- **Evidence and target:** `f′(x)=3x²−3`; local maximum `(-1,2)` and local minimum `(1,-2)`. Require a sign-change or second-derivative argument when assessing reasoning.
- **Stress / acceptance:** A draggable tangent is optional exploration, not the graded answer; derived slope/critical-point readouts require submission or a recorded hint when they would solve the current task. Distinguish a tangent from a secant by type and label. Do not grade pixel precision; entering the exact coordinates is equivalent to selecting the points.

### M06 · Signed integral versus total area

- **Prompt:** “For f(x) = x on [−1,1], give the signed integral and the total area between the graph and x-axis.”
- **Composition:** `m06-regions: plot` with two signed regions; `m06-results: table-entry`.
- **Evidence and target:** Signed integral `0`; total area `1`. The explanation identifies cancellation of the signed halves, each with magnitude `1/2`.
- **Stress / acceptance:** Region meaning must use boundary, pattern or labels as well as color. A zero crossing splits regions exactly. Axis lines, shading and labels must not obscure the function, and the accessible description must preserve sign rather than simply say “shaded area.”

### M07 · Linear algebra and rank

- **Prompt:** “For A = [[1,2],[2,4]], find its rank and give one nonzero vector in its null space.”
- **Composition:** `m07-matrix: table` in matrix mode; `m07-map: plot` using a linear-map recipe; `m07-rank: number`; `m07-vector: expression`.
- **Evidence and target:** Rank `1`; any nonzero multiple of `(-2,1)` is valid. Check `Av = 0` and `v ≠ 0`, not textual equality with one stored answer.
- **Stress / acceptance:** Clearly distinguish a zero vector from a missing response. Optional visual mapping must preserve the singular collapse instead of inventing an inverse. Matrix row/column labels remain associated in a screen reader; larger matrix variants use a local scroll container.

### M08 · Multivariable calculus and vector fields

- **Prompt:** “For f(x,y)=x²+2y² at (1,1), give the gradient and the unit direction of steepest increase.”
- **Composition:** `m08-contours: plot`; optional `m08-surface: scene3d`; `m08-gradient: expression`; `m08-direction: expression`.
- **Evidence and target:** Gradient `(2,4)`; unit direction `(1/√5,2/√5)`. A longer arrow alone is not a unit vector answer.
- **Stress / acceptance:** Contour labels and vectors must not overlap the marked point. Both 2D and 3D views share x/y axis meaning; a renderer's y-up convention must not silently swap the mathematical y and z. Numeric vector entry provides the same task without orbiting.

### M09 · Differential equations and parameters

- **Prompt:** “A population follows P′=0.5P(1−P/100). Starting at P=20, is it increasing or decreasing, and at which population is growth fastest?”
- **Composition:** `m09-rate: plot`; `m09-model: math`; `m09-trend: choice`; `m09-maximum: number`.
- **Evidence and target:** Increasing at `20` since the rate is `8` population units per unit time; fastest at `P=50`. The domain is `0≤P≤100` for this question.
- **Stress / acceptance:** Units for population, time and rate are separate. Rate-versus-population and population-versus-time are distinct plot recipes, with distinct axis labels. A parameter slider updates the model locally and is reset explicitly for the scored question.

### M10 · Discrete mathematics and proof structure

- **Prompt:** “Prove that n(n+1) is even for every integer n. Order the supplied claims and identify the reason each step is valid.”
- **Composition:** `m10-claims: text`; `m10-proof: order`; `m10-reasons: match`.
- **Evidence and target:** Consecutive integers have opposite parity; one factor is even; their product is even. Also accept a valid two-case proof. Do not demand the reference order when dependencies admit more than one topological ordering.
- **Stress / acceptance:** A long mathematical claim wraps as one movable item. Keyboard Move Up/Down is equivalent to drag. One claim can justify several later claims; the model is a dependency graph, not always a strict list. Free-form valid proof takes a rubric path, not a false exact-match rejection.

### M11 · Probability and base rates

- **Prompt:** “In a population of 1,000, 10 have condition C. A test is positive for 9 of those 10 and for 99 of the other 990. Of people with a positive test, what fraction have C?” This is a stipulated probability exercise, not clinical advice.
- **Composition:** `m11-counts: table` or frequency-tree `diagram`; `m11-fraction: expression`; `m11-denominator: select`.
- **Evidence and target:** `9/(9+99) = 1/12 ≈ 0.0833`; the denominator is the 108 positive tests. A confidence slider does not count as probability evidence.
- **Stress / acceptance:** Row/column totals derive from the same four cells. A tree must show conditional branch meaning and distinguish counts from probabilities. Long category labels wrap in headers, with no ellipsis that hides the distinction.

### M12 · Statistics, uncertainty and claims

- **Prompt:** “A reported 95% confidence interval for μA−μB is [−2,6] points. Does it exclude zero, and does it establish that the two means are equal?”
- **Composition:** `m12-interval: plot` with reference zero; `m12-claims: choice`; `m12-explanation: text-entry`.
- **Evidence and target:** It contains zero and does not establish equality. An acceptable explanation distinguishes lack of evidence for a difference from proof of equivalence. The frequentist interpretation concerns the method across repeated samples, not a 95% probability assigned to this fixed parameter after this interval is observed.
- **Stress / acceptance:** Use explicit interval endpoints and a labeled zero reference. Do not use color alone for significance. Missing values are distinct from zero in sibling raw-data fixtures; error bars must declare whether they show SD, SE or an interval.

## Computer science and computing systems

### C01 · A code signature becomes a linked-structure question

- **Prompt:** “Given `Node* insertAfter(Node* p, int value)`, A→B→C and p=B, insert N after B without losing C. N has already been allocated and its value set to 7; p is non-null. Supply the two pointer assignments.”
- **Composition:** `c01-signature: code`; `c01-heap: diagram` using a linked-structure recipe; `c01-assignments: order` or `code-entry`.
- **Evidence and target:** `N->next = p->next; p->next = N;` with N already allocated and its value set. Result A→B→N→C. Reversing those two assignments makes N point to itself in this setup.
- **Stress / acceptance:** Labels include `next`, `p`, N and the value; pointer edges target stable object/field IDs, not coordinates. Code line, heap node and response reference the same entities. Updating two links retains the nodes and viewport. The signature alone cannot establish allocation, null or ownership semantics; those are explicit assumptions.

### C02 · Trees and representation invariants

- **Prompt:** “Insert 6 into the binary search tree with root 5, left child 3, and right child 8 whose left child is 7. Which empty child slot receives 6?” Distinct keys use strict ordering.
- **Composition:** `c02-tree: diagram`; `c02-slot: select`; `c02-path: order`.
- **Evidence and target:** Left child of 7; comparisons visit `5→8→7`. Tree shape is determined by these insertions and the declared policy, not a balancing algorithm.
- **Stress / acceptance:** Empty child slots are actual targets, distinct from null labels. Deep and unbalanced variants collapse optional off-path branches with counts or use a detail view. A node-list form with parent and left/right fields is equivalent. Long labels must widen or reflow nodes before routing edges.

### C03 · Graph traversal and ties

- **Prompt:** “Starting at A, perform BFS on the undirected graph with edges A–B, A–C, B–D, C–D. Visit adjacent vertices alphabetically and mark vertices visited when enqueued.”
- **Composition:** `c03-graph: diagram`; `c03-queue: table`; `c03-visit: order`.
- **Evidence and target:** Discovery order `A,B,C,D`. After processing A, queue is `[B,C]`; after B, `[C,D]`; after C, `[D]`. D is enqueued once.
- **Stress / acceptance:** Neighbor order and discovery-versus-dequeue meaning must be stated. Cycles, self-loops and multi-edges belong to typed graph data; a layout must not remove semantic edges to look cleaner. Offer adjacency lists and explicit queue entry as an equivalent response.

### C04 · Code execution and undefined behavior

- **Prompt:** “For `int a[3]={2,4,6}; int *p=a+1;`, predict `*p` and `p[-1]`, then decide whether evaluating `p[2]` is defined in C.”
- **Composition:** `c04-code: code`; `c04-memory: diagram` using array/memory recipe; `c04-values: table-entry`.
- **Evidence and target:** `4`, `2`, and undefined behavior for dereferencing `p[2]` (the one-past pointer). Byte addresses require an explicit `sizeof(int)` assumption if shown; array indexing alone does not.
- **Stress / acceptance:** Never invent an execution result for undefined behavior. Show the one-past address as an address, not an allocated cell. A renderer/trace must distinguish address, value, type and lifetime. A long address uses horizontal scrolling or a copied value display without truncating significant digits.

### C05 · Computer architecture and cache mapping

- **Prompt:** “A direct-mapped cache has four sets and 16-byte blocks. For byte address 0x34, give the block offset, set index and tag.” Addresses in this fixture are eight-bit unsigned values.
- **Composition:** `c05-address: diagram` using bit-field recipe; `c05-cache: table`; `c05-fields: table-entry`.
- **Evidence and target:** Offset `4` (`0100`), set `3` (`11`), tag `0` (`00`). The split is tag bits 7–6, index bits 5–4, offset bits 3–0.
- **Stress / acceptance:** Leading zeros are semantically visible. Field width labels never overlap bit labels. Hit testing addresses bit positions, not pixel columns. Sibling 64-bit fixtures use grouped fields with full-copy/inspect support, rather than 64 tiny clickable cells.

### C06 · Concurrency and multiple valid executions

- **Prompt:** “Two threads each implement increment as `read x; add 1 locally; write x`, starting with x=0. Give a legal interleaving ending at x=1.” Each displayed read/write is atomic; no other synchronization exists.
- **Composition:** `c06-threads: code`; `c06-schedule: order`; `c06-state: table-entry`.
- **Evidence and target:** One valid order is read A=0, read B=0, compute A=1, compute B=1, write A=1, write B=1. Accept all interleavings preserving each thread's program order and ending at 1. Sequential execution gives 2 and is not the requested witness.
- **Stress / acceptance:** A trace recipe needs partial-order constraints, not one canonical answer. Each event shows thread identity through text and lane, not color alone. Narrow layouts stack lanes while preserving order and dependencies. Do not claim this simplified model implements all C/C++ memory-model rules.

## Physics, engineering and circuits

### P01 · Free-body diagrams and equilibrium

- **Prompt:** “A 2 kg block rests on a horizontal floor. Use g=9.8 m/s². Draw the forces on the block and give the normal force.” There are no other applied forces.
- **Composition:** `p01-body: diagram` using a free-body recipe; `p01-forces: construct`; `p01-normal: number` with unit.
- **Evidence and target:** Weight `19.6 N` downward and normal `19.6 N` upward. Normal and weight act on the block; their equality here does not make them a Newton's-third-law pair.
- **Stress / acceptance:** Arrows share an anchor but labels occupy reserved lanes. Explicit controls select force type, direction and magnitude. Distinguish vector magnitude from the diagram's visual arrow length if schematic scale is used.

### P02 · Kinematics and model assumptions

- **Prompt:** “A ball is launched horizontally at 10 m/s from height 20 m. Ignore air resistance and use g=10 m/s². Find the time to the ground and horizontal distance.”
- **Composition:** `p02-path: plot`; `p02-setup: diagram`; `p02-answers: table-entry` with units.
- **Evidence and target:** Time `2 s`; range `20 m`. The trajectory is `y=20−x²/20` for `0≤x≤20`, using x right and y up from the ground.
- **Stress / acceptance:** Equal axis scaling is declared if needed for geometric interpretation; otherwise show that scales differ. A displayed animation pauses, resets and offers a discrete time table. Do not use animation timing as the answer clock.

### P03 · Fields and superposition

- **Prompt:** “Equal positive charges lie at x=−a and x=+a. At the midpoint, is the electric field zero, and is the electric potential zero when potential at infinity is zero?”
- **Composition:** `p03-charges: diagram`; `p03-field: plot` in vector-field mode; `p03-answers: choice`; `p03-reason: text-entry`.
- **Evidence and target:** Field is zero by vector cancellation; potential is positive, `2kq/a`. A correct response distinguishes vector superposition from scalar addition.
- **Stress / acceptance:** Field values are not evaluated at point-charge singularities. Dense field arrows use deterministic sampling and a inspectable table. Plus signs and direction are explicit; colors do not encode charge alone. Source charges and sample points have distinct roles.

### P04 · Waves and phase

- **Prompt:** “For y(x,t)=0.02 sin(4πx−8πt), with x in m and t in s, give wavelength, frequency, speed and direction.”
- **Composition:** `p04-wave: plot`; `p04-equation: math`; `p04-quantities: table-entry`.
- **Evidence and target:** Wavelength `0.5 m`; frequency `4 Hz`; speed `2 m/s`; propagation in `+x`. Angular frequency and frequency must not share the same unit field.
- **Stress / acceptance:** Sampling must resolve the waveform at all supported parameter settings; reducing samples must not invent a different frequency. A still frame and selected time table provide a motion-free path. Phase labels do not cover extrema or axes.

### P05 · Thermodynamics and sign conventions

- **Prompt:** “A gas absorbs 500 J of heat and does 200 J of work on its surroundings. Using ΔU=Q−W with W positive for work done by the gas, find ΔU.”
- **Composition:** `p05-energy: diagram` using an energy-flow recipe; `p05-balance: math`; `p05-answer: number` with unit.
- **Evidence and target:** `+300 J`. The system boundary, incoming heat and outgoing work are explicit.
- **Stress / acceptance:** Direction arrows cannot stand in for an unstated sign convention. Longer labels such as “work done by the surroundings on the system” must wrap outside arrow paths; the arrow label can use an ID keyed to full text. Alternate convention fixtures change both prompt and checker together.

### P06 · Analog circuits and quantities

- **Prompt:** “An ideal 12 V source feeds 2 kΩ and 4 kΩ resistors in series. Find the current and the voltage drop across the 4 kΩ resistor.”
- **Composition:** `p06-network: diagram` with an analog-circuit model; `p06-current: number`; `p06-voltage: number`.
- **Evidence and target:** `2 mA` and `8 V`. Units `0.002 A` and `8 V` are equivalent. Polarity marks identify the direction used for the voltage drop.
- **Stress / acceptance:** Wires have explicit junctions; crossing lines do not create accidental connections. The existing digital `circuit` evaluator cannot check this task. Resistor values, metric prefixes and polarities remain readable after stacking. Keyboard netlist/table editing is a valid alternative to drawing wires.

### P07 · Digital state and edges

- **Prompt:** “A D flip-flop starts with Q=0. D changes to 1 while the clock stays low, then the clock rises. Give Q before and after the rising edge.”
- **Composition:** `p07-logic: diagram` or supported digital `circuit`; `p07-timing: plot` in step/timing mode; `p07-values: table-entry`.
- **Evidence and target:** Q remains `0` before the edge and becomes `1` after it, under the ideal flip-flop model. This differs from a transparent latch.
- **Stress / acceptance:** Step traces use transitions at exact times and are not smoothed. Declare initial state, edge sense and setup assumptions. Pause/replay must not accidentally clock the model. Full signal names use a fixed label column, not clipped in-canvas text.

### P08 · Engineering stress and units

- **Prompt:** “A uniform rod carries an axial tensile force of 10 kN over cross-sectional area 200 mm². Find the average normal stress, assuming uniform stress.”
- **Composition:** `p08-rod: diagram`; `p08-relation: math`; `p08-stress: number` with unit.
- **Evidence and target:** `50 N/mm² = 50 MPa = 5×10⁷ Pa`. Accept equivalent units and notation; reject a dimensionally wrong number with an explanatory diagnostic.
- **Stress / acceptance:** Squared metric-unit conversion is checked, not string-replaced. A schematic section is labeled “not to scale” when dimensions are not geometric. Force arrows and section boundaries remain distinct. Significant-figure rules come from the question, not a global decimal tolerance.

### P09 · Fluids and conservation

- **Prompt:** “Steady incompressible flow passes from a pipe section of area 6 cm² at 2 m/s to a section of area 3 cm². What is the second speed?”
- **Composition:** `p09-pipe: diagram`; `p09-continuity: math`; `p09-speed: number`.
- **Evidence and target:** `4 m/s` from equal volumetric flow `A₁v₁=A₂v₂`. This setup alone does not establish the pressure difference without additional assumptions.
- **Stress / acceptance:** Particle animation is optional and must not imply a changing particle count or density. Area and radius are different typed parameters. Give a two-row section table as an equivalent body; a narrow pipe illustration need not carry every quantity inline.

## Chemistry, life science and earth science

### B01 · Stoichiometry and limiting reagent

- **Prompt:** “For 2H₂ + O₂ → 2H₂O, start with 3 mol H₂ and 2 mol O₂. Give the maximum water produced and the oxygen remaining.” Assume completion and no side reactions.
- **Composition:** `b01-reaction: math` with chemical notation; `b01-amounts: table`; `b01-answers: table-entry`.
- **Evidence and target:** H₂ limits production; `3 mol H₂O`, `0.5 mol O₂` remaining. Atom counts and units are conserved.
- **Stress / acceptance:** Subscripts are not coefficients. Molecule-count icons are explanatory and derive from an explicit scaled example; they do not round fractional moles into whole icons. Formula labels require baseline-aware typography and full accessible names.

### B02 · Acid–base calculations and assumptions

- **Prompt:** “At 25°C, an ideal dilute strong-acid solution has [H⁺]=1.0×10⁻³ mol/L. Compute its pH using pH=−log₁₀([H⁺]/(1 mol/L)).”
- **Composition:** `b02-scale: plot`; `b02-definition: math`; `b02-ph: number`.
- **Evidence and target:** `pH = 3.00` if the requested convention preserves two decimal places for two significant concentration digits; accept `3` when only value is assessed. The prompt explicitly uses concentration as the ideal approximation to activity.
- **Stress / acceptance:** Scientific notation remains parseable with superscript or keyboard entry. pH is dimensionless and the concentration axis is logarithmic if used. A log plot rejects nonpositive values; it must not put zero a finite distance from positive values on that scale.

### B03 · Resonance and chemical graph semantics

- **Prompt:** “For a carboxylate ion R–CO₂⁻, compare the two standard resonance contributors. Are the two C–O bonds represented as one permanently single and one permanently double bond?”
- **Composition:** `b03-contributors: diagram` with a chemical-graph adapter; `b03-claim: choice`; `b03-explanation: text-entry`.
- **Evidence and target:** No; the contributors describe delocalization in the resonance hybrid. The two equivalent C–O bonds are not two structures physically switching back and forth. Each contributor preserves atom identity, connectivity and total charge `−1`.
- **Stress / acceptance:** Resonance arrows, equilibrium arrows and reaction arrows have different typed semantics. Lone pairs, charge and bond multiplicity cannot vanish when space is tight. An atom/bond/charge table and textual description supply a meaningful alternative; a generic graph renderer alone is insufficient.

### B04 · Stereochemistry and reflection

- **Prompt:** “Models A and B show a tetrahedral carbon bonded to H, F, Cl and Br. B is the mirror image of A. Can rotation alone superimpose them? Explain what information a flat connectivity drawing leaves out.”
- **Composition:** `b04-moleculeA: scene3d`; `b04-moleculeB: scene3d` using the same atom-indexed chemical model; optional wedge/dash `diagram`; `b04-answer: choice`; `b04-reason: text-entry`.
- **Evidence and target:** No; four different substituents make these mirror forms non-superimposable enantiomers. Connectivity is the same; spatial configuration differs. Proper rotations preserve the signed tetrahedral orientation, while reflection reverses it. Do not grade R/S unless a tested CIP adapter computes it from the same atom/bond data.
- **Stress / acceptance:** Keep atom IDs through rotation; never mirror a camera or geometry as a harmless fit transform. Show element symbols in addition to colors. Provide explicit bond directions or signed 3D coordinates and controlled orientation choices for a non-orbiting response. Stereodescriptors have domain rules beyond a generic 3D renderer; see the [IUPAC R/S definition](https://goldbook.iupac.org/terms/view/R05423) and [CIP system](https://goldbook.iupac.org/terms/view/C01083).

### B05 · Genetics and independent assortment

- **Prompt:** “For Aa × Aa with complete dominance, give the probability of genotype aa and of the dominant phenotype.” This is a single autosomal locus, with equal allele segregation and no viability effects.
- **Composition:** `b05-cross: table` in Punnett mode; `b05-genotypes: table-entry`; `b05-probabilities: table-entry`.
- **Evidence and target:** Genotype aa probability `1/4`; dominant phenotype probability `3/4`. `AA`, `Aa`, `aA`, `aa` are the four equally likely combinations; Aa and aA represent the same unordered genotype here.
- **Stress / acceptance:** Case-sensitive allele notation is preserved. A more complex cross should be decomposed or represented probabilistically rather than shrinking a 16×16 grid onto a phone. The checker distinguishes genotype from phenotype and does not infer real-world penetrance from this classroom model.

### B06 · Molecular biology and directionality

- **Prompt:** “A DNA template strand is 3′–TAC GGA–5′. Write the complementary RNA transcript, labeled 5′ to 3′.”
- **Composition:** `b06-strands: diagram` using a sequence-alignment recipe; `b06-transcript: expression` or constrained text entry.
- **Evidence and target:** `5′–AUG CCU–3′`. Pairing, RNA alphabet and antiparallel orientation are checked separately. Translation is not asked for and no complete-gene interpretation is implied.
- **Stress / acceptance:** Directional labels remain attached to their strand ends when the view reflows. Prime marks, arrows and nucleotide letters are not decorative. Long sequences use chunked rows with positions, not tiny type; an accessible sequence string preserves spaces only as grouping, not as bases.

### B07 · Biology mechanisms and causal evidence

- **Prompt:** “A membrane is permeable to water but not sucrose. Side A has 0.1 mol/L sucrose and side B 0.3 mol/L; initial pressures are equal. Predict the initial net water movement and explain.” Use the ideal dilute model at equal temperature.
- **Composition:** `b07-membrane: diagram`; `b07-direction: choice`; `b07-reason: text-entry`.
- **Evidence and target:** Initial net movement A→B. Explain the difference in water chemical potential/osmotic tendency; do not claim sucrose crosses the membrane or that water moves only in one direction microscopically.
- **Stress / acceptance:** Particle counts must correspond to concentration and compartment volume. Animation cannot silently turn a semipermeable barrier into a fully permeable one. A controls-based permeability table is the nonvisual counterpart. Avoid the false universal rule that water always goes toward a named side independent of pressure.

### B08 · Experimental design and uncertainty

- **Prompt:** “Two plant groups receive different light levels, but also different fertilizer doses. Group A grows more. Can this result isolate the effect of light? Propose one change to the experiment.”
- **Composition:** `b08-design: table`; `b08-confounds: select`; `b08-repair: text-entry`.
- **Evidence and target:** No; fertilizer is confounded with light. Accept equal fertilizer with randomized assignment and suitable replication, or a randomized factorial design that varies both factors independently. No single wording is required.
- **Stress / acceptance:** Distinguish observation, causal interpretation and design proposal. Long treatment descriptions wrap in cells. A rubric should reward valid alternatives and flag missing controls without inventing precision from two unreplicated group means.

### B09 · Earth science, maps and direction

- **Prompt:** “Contour lines cross a stream in V shapes pointing north, toward higher elevation. In which direction does the stream flow in this simplified map?”
- **Composition:** `b09-contours: diagram` with a map adapter; `b09-direction: choice`; `b09-evidence: select`.
- **Evidence and target:** South, toward lower elevation. The learner identifies the contour-elevation relation rather than memorizing screen-up as north.
- **Stress / acceptance:** Rotate the map while preserving a north arrow and elevation labels. Contour lines cannot cross except where explicitly modeled; units and contour interval are declared. Supply a small elevation/position table or descriptive transect for a non-map equivalent. Map pan must not move answer controls.

### B10 · Geology and relative chronology

- **Prompt:** “Horizontal sedimentary layers A, B and C lie bottom to top. An intrusion D cuts all three, and an erosion surface E truncates D. Order these events from oldest to youngest.” Assume no overturning and the stated cross-cutting relationships.
- **Composition:** `b10-section: diagram`; `b10-events: order`; `b10-reason: match`.
- **Evidence and target:** `A, B, C, D, E`. The learner links superposition and cross-cutting relations to the corresponding order constraints.
- **Stress / acceptance:** Geological age and position are different fields. Pattern fills distinguish strata without requiring color. If a later fixture leaves two events incomparable, accept every valid partial-order sequence rather than manufacturing a unique chronology.

## Reuse outside STEM, without false precision

### H01 · History and source-grounded inference

- **Prompt:** “Given two short supplied accounts of the same event, mark one statement of observation and one interpretation, then explain a disagreement using the stated author/context metadata.”
- **Composition:** `h01-sources: text` with source IDs and exact character-span anchors; `h01-spans: select`; `h01-argument: text-entry`.
- **Evidence and target:** The fixture author supplies an explicit acceptable span set and rubric tied to these excerpts. The target is a supported distinction and explanation, not agreement with one political or historical conclusion. No factual source excerpts are invented by the renderer.
- **Stress / acceptance:** Highlights survive line wrapping and enlarged text because they target spans, not coordinates. Preserve original wording and citation provenance. Right-to-left and mixed-direction excerpts require a fixture before support is claimed.

### H02 · Language and syntax

- **Prompt:** “In ‘The student who solved the problems is here,’ identify the subject of ‘is’ and explain why ‘is’ is singular.”
- **Composition:** `h02-sentence: text`; optional `h02-syntax: diagram`; `h02-subject: select`; `h02-reason: text-entry`.
- **Evidence and target:** The main-clause subject is “The student who solved the problems,” headed by singular “student.” “Problems” is inside the relative clause and does not control agreement with “is.” Accept selection of “student” when the task is explicitly changed to ask for the head.
- **Stress / acceptance:** Distinguish selecting a word from selecting a syntactic constituent. Nested spans must not overlap ambiguously; labels can appear below a selected phrase or in a detail row. A parse is an analysis supplied by a domain adapter, not something generic line layout can establish.

## Adversarial presentation fixtures applied across subjects

The following are reusable acceptance transformations, not a new content bank. Apply only transformations that preserve the question's intended mathematical or domain meaning. A mirror is safe for some graph layouts and invalid for stereochemistry.

| Transformation | Required outcome | Representative cases |
| --- | --- | --- |
| Available content widths 320, 375, 768 and 1024 CSS px; a short landscape viewport; on-screen keyboard visible | Actual available area is measured. Prompt and response remain reachable; body may move below prompt or use a declared local detail view. No fixed-height card clips a question. | M03, C01, P06, B06 |
| Browser zoom to 200%; enlarged text; fallback font followed by late intended-font load | Recompute label bounds after fonts/measurement settle. Reflow or scroll locally without shrinking text to hide collisions. Inputs retain value and focus. | M10, C02, B08, H01 |
| Replace a label with “Nicotinamide adenine dinucleotide phosphate (reduced form)” or a long code identifier | Reserve measured label space, wrap at safe boundaries, or use short marks linked to a full adjacent label list. The semantic full label remains available. Do not silently clip the source name. | C02, P07, B03 |
| Negative signs, subscripts, prime marks, Greek letters, scientific notation and `μ`, `m`, `M` prefixes | Preserve semantic distinctions and expose a parseable input alternative. Unit conversion is dimensional, with case-sensitive prefixes. | M02, P04, P08, B02, B06 |
| Many nearby labels, edges crossing and a hovered/focused tooltip | Route connectors after node measurements; reserve annotation regions; tooltip neither hides the active target nor escapes the viewport. A compact label legend has stable IDs. | C03, P01, P06, B09 |
| Focused control followed by resize, patch or feedback | Focus remains on the logical target when it persists. No jump to the start, lost selection, discarded work or speech-triggered submit. A removed target gets an explicit focus destination. | C01, C06, P07 |
| Incorrect/missing dataset, invalid unit, dangling reference or failed domain validation | Reject the new scene atomically; retain the last valid scene and learner work. Give the director a compact typed repair diagnostic. A renderer failure yields a readable fallback with retry, not a silent blank. | M04, C03, P06, B04 |
| Reduced motion, keyboard only, grayscale, screen reader and unavailable WebGL | Equivalent task is possible without motion, dragging, hover or color discrimination. Graph/molecule alternatives carry the relationships needed to reason; a generic caption is insufficient. | M06, C02, P04, B04 |
| Stale event arrives after question change; rapid parameter updates | Reject evidence for the wrong identity/revision. Coalesce local exploration updates; submit only the intended attempt. Do not spend an agent call per drag frame or slider tick. | M09, C01, P07 |
| Correct alternate response, equivalent notation or unit, extra precision, boundary value | Compare normalized mathematical meaning under the declared assumptions. Enforce answer constraints without falsely requiring one surface form. | M02, M07, M10, C06, P08 |
| Very wide matrix, long proof, dense graph, full gene sequence or many signal lanes | Use focused subproblems, pagination or a body detail view with position/context. Keep the primary response outside pan/zoom surfaces. No “fit” strategy may remove facts needed to answer. | M07, M10, C03, B06 |

## Semantic walkthrough results

These results are a design review of the written cases, not renderer execution logs. A one-off standard-library Python run checked 19 reference arithmetic/algebra/sequence assertions across the cases; all passed. It exercised no browser, grading implementation, accessibility tree or layout. The checks cover the written numeric targets, not the full scientific validity of a future renderer.

| Review question | Result from this pass | Consequence |
| --- | --- | --- |
| Can every listed task use the same four scene slots? | Yes: all 37 STEM cases and 2 reuse cases have a stated composition and response. | Subject-specific page layouts are unnecessary for this set. This does not prove visual fit. |
| Is a single response style sufficient? | No. Cases require numeric/expression entry, selection, ordering, construction, code, explanation and combinations. | Prefer a small composable response registry; avoid reducing the system to multiple choice or freehand drawing. |
| Can current `figure`, `trace`, `circuit`, `scene3d` validate all the subject meaning? | No. Gaps include plots with domains, units, chemical graphs, analog circuits, structured proof constraints, sequences and assessment contracts. | Reuse the renderer foundations, but add typed adapters and verifiers before making support claims. |
| Are complete scenes safe to regenerate after each action? | No. C01, M09 and P07 need stable entities, local state and selective updates. | Cache recipes and shared model data; send event and state deltas. No agent round trip is needed for each local exploration action. |
| Are screenshots or correct-looking pictures enough to grade? | No. M07, C06 and B04 expose valid alternate answers or semantics a picture cannot establish. | Store typed evidence and compare the domain model/rubric; presentation quality is a separate check. |
| Does compactness justify clipped labels or smaller-than-readable type? | No. C02, P07 and the long-label transformations break that shortcut. | Fit by reflow, short-reference labels, bounded detail and task decomposition. |
| Can one generic accessible description replace every diagram? | No. Connectivity, direction, topology, chirality, sequence and coordinates need structured equivalents. | Each adapter declares an equivalent representation and input method, preserving assessment difficulty as far as possible. |
| Does this establish coverage of “any STEM class”? | No finite fixture set can. The set covers major representation and response demands from school through undergraduate STEM. | Add adapters only for demonstrated gaps; test their semantics and representative rendering before declaring support. |

## Integration acceptance and evidence to record later

Use this set to find missing capabilities early. Do not build 39 separate bespoke widgets or an exhaustive automated test suite before trying the real renderer. Start with the most discriminating cases: C01 linked insertion, M04 discontinuity, M07 equivalent vectors, P06 analog units/networks, B04 stereochemistry, B06 sequence direction and M10 alternate proofs. Then add cases that exercise capabilities not yet represented. Once a fix is verified, rerun the affected cases and one shared layout case; broaden only for a changed shared contract or observed regression.

For each integrated case, record:

- The exact fixture/source, recipe and renderer versions; viewport, font readiness and input mode; declared model/verifier limits.
- A rendered capture plus measured text/shape bounds and overlap diagnostics. A collision check can allow an explicitly intentional intersection such as a plotted curve crossing an axis; it cannot broadly waive labels or answer controls.
- One correct and one diagnostic incorrect submission, checking typed values, target IDs, revision, assistance and retained work. Include a valid alternate response for any case with multiple solutions.
- Keyboard completion and the adapter's accessible representation; manual review for semantics that automated accessibility checks cannot establish.
- Behavior under the relevant stress transformation, including local overflow/fallback rather than unexplained disappearance.
- Actual serialized request/response bytes, token usage when measured, cache hit/miss, generation latency, patch size and renderer load. Do not substitute string length for measured model tokens or promise a dollar saving from caching alone.

A case is **accepted** only when semantic checks, actual layout/interaction checks and the requested evidence path all pass in the supported environment. A static diagram may be accepted as an explanation while its interactive assessment remains unsupported. Report those states separately. Before wiring any of this into mastery, preserve the existing manifesto's separation: display and interaction do not award credit; verified assessment and the backend's credit rules do.

## Extension rule

When a course needs a new representation, first attempt a composition of existing typed elements. Add a recipe if the model and interaction already exist. Add a domain adapter when meaning or verification is missing. Add a renderer primitive only when neither can represent the task. Examples that genuinely need more work include orbital/surface fields, large molecular systems, formal proof assistants, CAD constraints, numerical PDE solvers, signal transforms and specialized language execution. Their existence is a reason to define an extension boundary, not to advertise unsupported simulations behind generic shapes.

Every new adapter must contribute one ordinary case, one semantic boundary case, one fitting stress case and one equivalent accessible task. Repeated use should add new data or parameters to an existing recipe, not another styling prompt or fresh implementation.
