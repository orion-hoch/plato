# Specification validation · October 8, 2026

This folder contains a proposed toolkit, an independent HTML specimen, and observed specimen checks. **The Study app was not integrated or modified.** There were no tutor/provider sessions, library installations, schema migrations, or live grading changes. Existing application changes in the working tree were left alone.

## What ran

[`audit-specimen.mjs`](audit-specimen.mjs) loaded only [`specimen.html`](specimen.html) using the already-installed Playwright/Chromium. It does not start or import the app. The browser needed execution outside the macOS process sandbox; the successful run remained local and read only the authored specimen, writing evidence into this folder.

| Observed check | Result and limit |
|---|---|
| Twelve compositions at 320×568, 390×844, 768×640, 1024×768 and 1440×900 | Prompt, body and response remained in flow without page-wide horizontal overflow or unintended overlap between measured blocks. Long code and wide tables used explicitly labeled local scroll regions. |
| Normal text, text-spacing overrides, and doubled computed text sizes at each size | 180 rendered cases completed without detected geometry failures or browser exceptions. Oversized diagram labels used table equivalents. Doubled text is a text-resize stress check, **not real browser-zoom emulation**. |
| SVG text | Visible labels met the 14px floor, stayed within their SVG frame, and did not overlap other measured labels. This audit does not analyze every curved edge against every glyph. |
| Trace, curve and circuit controls | Trace advanced to B and reset to A; keyboard ArrowRight changed the sample from x=1 to x=1.1 with f(x)=1.21; the switch toggled its visual and accessible state. These are illustrative local controls, not verified language/physics runtimes. |
| Draft and submit | Circuit explanation text survived a resize to 320px and was accepted by the specimen's local form handler. It explicitly reported that no grading was connected. Drafts are intentionally discarded when selecting a different specimen; production draft persistence remains a requirement. |
| Wide-table caption repair | After moving the caption outside horizontal overflow and giving row labels enough width, all 15 size/text variants for this case passed. Five representative screenshots were refreshed. |
| Contract examples | Six fenced JSON examples parsed; scene element IDs were unique and response targets/options resolved. All reported UTF-8 byte counts were independently reproduced. These are example checks, not an implemented protocol validator. |
| Subject targets | Reviewed 37 STEM and 2 humanities/language cases. A separate one-off arithmetic/algebra/sequence check covered 19 reference assertions, including unit conversion, null-space vectors, stoichiometry and sequence direction. This is evidence about the written targets, not implemented graders or subject coverage in production. |

The full passing report is [`audit-2026-10-08T18-55-11.846Z.json`](evidence/audit-2026-10-08T18-55-11.846Z.json). The final focused table run and updated JSON checks are in [`audit-2026-10-08T18-57-12.086Z.json`](evidence/audit-2026-10-08T18-57-12.086Z.json).

## What the review changed

- Essential control boundaries were darkened independently of quiet divider lines.
- The linked-list specimen became a worked exploration with explanation as the response, so advancing its trace does not pretend to be an unaided prediction assessment.
- The calculus task distinguishes signed slope from magnitude, and its caption identifies distinct linear axis scales.
- The long code-signature task now explicitly states the unreachable-result contract; return type alone does not determine it.
- Diagram labels are measured; collisions or enlarged labels trigger a readable equivalent. This small specimen keeps that fallback until the example is selected again. It is not the complete proposed production fit algorithm.
- Manual screenshot review found the table caption moved out of view during horizontal scrolling. The caption now stays outside the scroll region and full row labels fit their column.
- Contract review added explicit limits, version metadata, identity-free cache content, grouped responses, and a blocked recovery for tasks without a truthful text equivalent.
- The plan explicitly records the host's narrow-width deficit: current CSS implies 204px content at a 320px viewport. The isolated specimen does not solve or hide this future integration requirement.

The first audit log is preserved as [`audit-2026-10-08T18-54-45.632Z.json`](evidence/audit-2026-10-08T18-54-45.632Z.json). Its failures were caused by two defects in the audit setup: it repeatedly multiplied an inherited scene font size across examples, and read SVG geometry before the resize observer settled. The audit was corrected to reset the root text size and wait two animation frames. The subsequent full run passed. That initial report is not evidence of failures at a true 200% text size, and it has not been erased.

## Visual evidence

All five captures were inspected, including the final table capture after its repair:

- [Linked structure and code, desktop](evidence/scene-1-1440.png)
- [Calculus curve and response](evidence/scene-2-1024.png)
- [Free-body diagram on a phone](evidence/scene-4-390.png)
- [Full scientific labels at 320px](evidence/scene-10-320.png)
- [Wide table with retained caption at 320px](evidence/scene-12-320.png)

These captures demonstrate the specimen's visual language and deliberate vertical continuation. They do not prove that the live app's mosaic frame, conversation, keyboard, ink and renderer will fit identically.

## Reproduce

From the repository root, with its existing dependencies:

```sh
node docs/element-toolkit/audit-specimen.mjs
```

For a change confined to one specimen, pass its one-based number:

```sh
node docs/element-toolkit/audit-specimen.mjs 12
```

Reports receive unique timestamps; screenshot files show the most recent run. The optional focused run keeps the small shared interaction and example checks. A browser-launch sandbox error is an environment failure, not a layout failure. Do not install another browser or run a broad application test suite merely to review these spec-only files.

## Still required when integrated

The specification's acceptance gates remain requirements for future wiring. In particular, the following were **not** exercised here:

- The actual app shell at the proposed minimum content width, 400% browser zoom, mobile soft keyboard, real touch/pen input, or ink anchoring after reflow.
- Screen-reader completion, real MathML/KaTeX output, right-to-left text, late network font loading, forced colors, or full accessibility conformance.
- Production generated scenes, sanitization attacks, layout repair of arbitrary graphs, answer privacy over real delivery, stale/repeated submissions, or backend score updates.
- Real code execution, analog solving, stereochemistry, 3D resource caching/context loss, symbolic equivalence or numerical simulation.
- Actual artifact cache hit rates, model tokens, billing savings, latency targets, GPU memory behavior or measured learning outcomes.

The intended next step is the small adapter sequence in the [overview](README.md#9-acceptance-and-staged-wiring), beginning with actual course questions and the existing rendering modules. No new framework or complete renderer rewrite is required by this specification.
