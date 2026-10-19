# Plato's documentation

Start with the [project README](../README.md) for what Plato does and how to run it. Read these in order:

1. [`system-spec.md`](system-spec.md) is the design of record: the theory of learning and teaching, and the system built on it. Its status note lists where the code differs.
2. [`../backend/CONTRACTS.md`](../backend/CONTRACTS.md) gives the backend's module boundaries, and records each version's departures from the specs.
3. [`director-actor.md`](director-actor.md) explains why a deep director decides each move and a fast voice performs it.

## Current

| Doc | What it covers |
| --- | --- |
| [`system-spec.md`](system-spec.md) | The design of record: course model, domain adapters, learner model, move policy, stage, evaluation |
| [`implementation-spec.md`](implementation-spec.md) | The original backend spec (storage, jobs, knowledge pipeline, HTTP). Its voice loop and planner were superseded in v10. The code cites it as "spec §n". |
| [`drawing-shape-detection.md`](drawing-shape-detection.md) | How Plato reads what a student draws (shapes, labels, connections) |
| [`design-manifesto.md`](design-manifesto.md) | The product principles: quick natural conversation, an active page, strict mastery rules underneath |
| [`../evals/README.md`](../evals/README.md) | Whole simulated sessions: `stand-in.mjs` and `live-session.mjs` |
| [`../evals/understanding/README.md`](../evals/understanding/README.md) | The understanding suite: does Plato understand a course and teach from it? |

## Rationale and research

These record why things are the way they are. They don't describe the code line by line.

| Doc | What it covers |
| --- | --- |
| [`director-actor.md`](director-actor.md) | The director/actor split (built in v10) |
| [`teaching-design.md`](teaching-design.md) | What understanding a course means, worked on CS 3410; it became the course model |
| [`research/`](research/) | Eight literature briefs, cited in the spec and the code as [Understanding], [Tutoring], [Personalization] and so on: `deep-understanding`, `tutoring-evidence`, `personalization`, `course-decomposition`, `domain-generality`, `interactive-learning`, `reading`, `voice-and-multimedia` |

## History

[`history/`](history/) holds documents that were accurate for their date but no longer describe the app. They are kept for the decisions they record.

| Doc | What it was |
| --- | --- |
| `teacher-architecture.md` | The first teacher design (4 Oct), replaced by `system-spec.md` |
| `architecture-audit.md` | The model-call and dead-code audit of 8 Oct, before the consolidation |
| `engine-experiments.md` | Which engine should write the director's cards (8 Oct). The main path no longer writes cards with a model. |
| `mosaic-stage.md` | The flat tile-mosaic stage, replaced by the sphere |
| `skins-sources.md` | Provenance of the teacher-hat sprites, since removed |
| `element-toolkit/` | A proposed SceneSpec toolkit (8 Oct) that was never wired in. The element registry of `system-spec.md` §15b was built instead (`shared/elements/`). |

Removed code lives in [`../archive/`](../archive/), by version (`v10-removed`, `v11-removed`, `v12-removed`, …).

## Keeping these current

When a change makes a doc wrong, fix the doc in the same change. If the doc's purpose is gone, move it to `history/` and fix the links that point to it. Behaviour changes that depart from a spec go in `backend/CONTRACTS.md`.
