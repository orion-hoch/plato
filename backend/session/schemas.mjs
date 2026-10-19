import { s } from '../core/shape.mjs';

// Request bodies (§10) and provider output schemas for the session module.

export const START = s.object({ topicId: s.nullable(s.string({ max: 200 })), clientSessionRequestId: s.nullable(s.string({ min: 1, max: 200 })), transport: s.enum(['default', 'agent']), mode: s.enum(['classic', 'cards']), resume: s.bool(), sessionId: s.nullable(s.string({ min: 1, max: 200 })) }, { optional: ['topicId', 'clientSessionRequestId', 'transport', 'mode', 'resume', 'sessionId'] }); // v10: transport and mode are ignored (the agent, cards)
// What the realtime agent actually said, reported by the client that plays it (agent transport).
export const AGENT_EVENTS = s.object({ events: s.array(s.object({
  clientEventId: s.string({ min: 1, max: 200 }), type: s.enum(['agent_response', 'board_shown', 'board_content']), text: s.string({ min: 1, max: 8000 }),
  questionId: s.nullable(s.string({ max: 200 })), interrupted: s.bool(), occurredAt: s.string({ max: 40 }),
}, { optional: ['questionId'] }), { min: 1, max: 20 }) });
// A drawn answer: a PNG of what the student wrote on the page (base64, ≤ 4 MB decoded). commit:false only reads it (a glance).
export const DRAWING = s.object({
  clientResponseId: s.string({ min: 1, max: 200 }), imageBase64: s.string({ min: 16, max: 5_600_000 }),
  replyToQuestionId: s.nullable(s.string({ max: 200 })), captureEpoch: s.int({ min: 1 }), turnId: s.string({ min: 1, max: 200 }),
  commit: s.bool(), text: s.string({ max: 2000 }),
}, { optional: ['commit', 'text'] });
export const DRAWING_READING = s.object({
  transcription: s.string({ max: 8000 }), mathLatex: s.nullable(s.string({ max: 4000 })),
  uncertainRegions: s.array(s.string({ max: 500 }), { max: 20 }), confidence: s.enum(['clear', 'partial', 'unreadable']),
});
// A drawing for reading its shapes: its PNG and the same ink as strokes numbered 0, 1, 2, … in drawing order, each with
// a box [x0, y0, x1, y1] and simplified points [x, y, x, y, …] in the PNG's pixels.
const INK_STROKE = s.object({ id: s.int({ min: 0, max: 399 }), box: s.array(s.int({ min: 0, max: 4096 }), { min: 4, max: 4 }), pts: s.array(s.int({ min: 0, max: 4096 }), { min: 2, max: 600 }) });
export const DRAWING_SHAPES = s.object({
  imageBase64: s.string({ min: 16, max: 5_600_000 }),
  ink: s.object({ width: s.int({ min: 1, max: 4096 }), height: s.int({ min: 1, max: 4096 }), strokes: s.array(INK_STROKE, { min: 1, max: 400 }) }),
});
// What a drawing is made of, by stroke id (docs/drawing-shape-detection.md): shapes (with the writing inside them),
// grids and their cells, connectors (from/to item ids, null for empty space) and loose text.
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

export const SUBMIT_RESPONSE = s.object({
  clientResponseId: s.string({ min: 1, max: 200 }), captureEpoch: s.int({ min: 1 }), turnId: s.string({ min: 1, max: 200 }),
  replyToQuestionId: s.nullable(s.string({ max: 200 })), text: s.string({ max: 8000 }), finalized: s.literal(true),
  transcriptVersion: s.int({ min: 1 }), confidence: s.nullable(s.fraction()), ambiguousSpans: s.array(s.string({ max: 500 }), { max: 20 }),
  audioArtifactId: s.nullable(s.string({ max: 200 })), supersedesResponseId: s.nullable(s.string({ max: 200 })),
  // A typed/tapped answer to a question's input (choice id, [ids], order [ids], match [[l,r]], number, text), or an exam
  // problem's answers by part ({ a: '…', b: '…' }).
  structuredAnswer: s.nullable(s.object({ kind: s.enum(['choice', 'multi_select', 'order', 'match', 'number', 'text', 'exam']), value: s.json() })),
  // v12 (spec §15 rule 7): what the page heard besides the words, for the engine and the learner's calibration: the
  // time from the end of Plato's last line to the start of their turn, and their hedges ("i think", "maybe", "um").
  latencyMs: s.int({ min: 0, max: 3_600_000 }), hedges: s.array(s.string({ max: 40 }), { max: 12 }),
}, { optional: ['structuredAnswer', 'latencyMs', 'hedges'] });

const GOALS = ['Developing', 'Secure'];
export const FOCUS_CREATE = s.object({ name: s.string({ min: 1, max: 120 }), topicIds: s.array(s.string({ min: 1, max: 200 }), { min: 1, max: 100 }), goal: s.enum(GOALS), activate: s.bool() }, { optional: ['activate'] });
export const FOCUS_PATCH = s.object({ expectedRowVersion: s.int({ min: 0 }), name: s.string({ min: 1, max: 120 }), topicIds: s.array(s.string({ min: 1, max: 200 }), { min: 1, max: 100 }), goal: s.enum(GOALS), active: s.bool() }, { optional: ['name', 'topicIds', 'goal', 'active'] });

export const RESUME = s.object({ clientResumeId: s.string({ min: 1, max: 200 }), lastAcknowledgedServerSequence: s.int({ min: 0 }) });
// The agent's request_question: a graded question on the topic in play, optionally on one narrow idea; 'exam' is a
// multi-part exam problem on the unit in play ('exam_style', from older clients, is the usual question).
export const QUESTION_REQUEST = s.object({ about: s.string({ max: 300 }), difficulty: s.enum(['easier', 'exam_style', 'harder', 'exam']) }, { optional: ['about', 'difficulty'] });
export const END = s.object({ expectedEpoch: s.int({ min: 1 }) });
export const FEEDBACK = s.object({
  text: s.string({ min: 1, max: 4000 }), type: s.enum(['preference', 'correction', 'difficulty', 'material_feedback', 'other']),
  topicIds: s.array(s.string({ max: 200 }), { max: 50 }), correctionOfResponseId: s.nullable(s.string({ max: 200 })), expectedEpoch: s.int({ min: 1 }),
  applicability: s.enum(['exam', 'learner']),
}, { optional: ['correctionOfResponseId', 'applicability'] });
