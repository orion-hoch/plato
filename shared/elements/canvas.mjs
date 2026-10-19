// Draw from memory (docs/system-spec.md §15b; interactive-learning.md §G): a scaffold frame (blank, axes, or labelled
// boxes) the learner draws on with the page's own pen, and a reference shown beside it once revealed. The drawing reader
// scores the drawing against the card's rubric; this element never shows the rubric. Any subject. Pure.
import { checks, str, clip } from './check.mjs';
import { checkDiagram } from '../../src/visuals/diagram.mjs';

const { fail, num, arr, object } = checks('canvas');
const FRAMES = ['blank', 'axes', 'boxes'];

export const purpose = 'a frame to draw on from memory (blank, axes, or labelled boxes as a scaffold), with a reference drawing shown beside it once revealed';

export const example = {
  frame: 'boxes',
  boxes: [{ x: 5, y: 10, w: 40, h: 30, label: 'caller' }, { x: 55, y: 10, w: 40, h: 30, label: 'callee' }, { x: 5, y: 55, w: 90, h: 35, label: 'stack' }],
  reference: { kind: 'diagram', type: 'memory', data: { cells: [{ address: '0x7ff8', value: 'ra', label: 'saved' }, { address: '0x7ff0', value: 's0', label: 'saved' }], pointers: [{ at: 1, label: 'sp' }] } },
};

export const rules = `spec: {"frame", "boxes", "reference"}:
- frame: "blank" (an empty frame), "axes" (two axes to sketch a graph on) or "boxes" (labelled boxes as a partial drawing, for a novice).
- boxes: for "boxes", 1 to 12, each {"x", "y", "w", "h", "label"} in 0-100 units of the frame (x, y the top left; label optional, at most 40 characters).
- reference: optional, what the drawing is compared with once revealed: {"kind": "diagram", "type", "data"} (any course diagram type), or an element spec.
- The rubric goes on the card's task (task.rubric), never here: the learner never sees it. Values: "revealed" (0 until the reference is shown, then 1).
Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["consolidation"], task: "draw: no checkpoints; the task's rubric lists 3-6 short checkable statements the drawing must show; the reference is revealed after it is read.",  adapters: ['A1', 'A2', 'A3', 'A4', 'A5'], modes: ['draw'], translations: [], reveals: ['F7', 'F12'],
  notice: ['what the learner draws before the reference appears', 'the first missing or wrong part'] };

export function validate(input) {
  const raw = object(input), frame = raw.frame == null ? 'blank' : FRAMES.includes(raw.frame) ? raw.frame : fail(`frame must be one of ${FRAMES.join(', ')}`);
  const boxes = frame !== 'boxes' ? [] : arr(raw.boxes, 'boxes', 1, 12).map((b, i) => {
    const at = `boxes[${i}]`, x = num(b?.x, `${at}.x`, 0, 100), y = num(b.y, `${at}.y`, 0, 100), w = num(b.w, `${at}.w`, Number.MIN_VALUE, 100), h = num(b.h, `${at}.h`, Number.MIN_VALUE, 100);
    if (x + w > 100 || y + h > 100) fail(`${at} runs past the frame: x + w and y + h must be at most 100`);
    return { x, y, w, h, label: clip(str(b.label).trim(), 40) };
  });
  let reference = null;
  if (raw.reference != null) {
    const r = object(raw.reference, 'reference');
    if (r.kind === 'diagram') { try { checkDiagram({ type: r.type, data: r.data }); } catch (error) { fail(`reference: ${error.message}`); } reference = { kind: 'diagram', type: r.type, data: r.data }; }
    else if (typeof r.kind === 'string') reference = r; // an element spec: the page shows it as an element of its own
    else fail('reference must be {"kind": "diagram", "type", "data"} or an element spec');
  }
  return { frame, boxes, reference };
}

export const init = spec => ({ spec, revealed: false });
export function step(state, action) {
  const a = String(action ?? '').trim();
  if (a === 'reveal') return { ...state, revealed: true };
  if (a === 'reset') return init(state.spec);
  fail(`unknown action ${JSON.stringify(a)}; use reveal or reset`);
}
export const passes = (state, action) => String(action ?? '').trim() === 'reveal' && !state.revealed ? ['reveal'] : [];
export const gate = (state, at) => String(at ?? '').trim().toLowerCase() === 'reveal' ? 'reveal' : fail(`a checkpoint's "at" is "reveal", not ${JSON.stringify(at)}`);
export const values = state => ({ revealed: state.revealed ? 1 : 0 });
export const brief = state => `a ${state.spec.frame} frame to draw on${state.spec.boxes.length ? ` (${state.spec.boxes.length} boxes${state.spec.boxes.some(b => b.label) ? `: ${state.spec.boxes.map(b => b.label).filter(Boolean).join(', ')}` : ''})` : ''}; the reference is ${state.revealed ? 'shown' : 'hidden'}`;
/** The reference shown (a repair compare starts revealed). */
export const reveal = state => ({ ...state, revealed: true });
export const anchors = state => ['frame', ...state.spec.boxes.map((_, i) => `box-${i + 1}`), ...(state.spec.reference && state.revealed ? ['reference'] : [])]; // the reference only once shown
