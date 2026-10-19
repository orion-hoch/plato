// One board shape, checked one way (v10, audit §4 D3): what the director's cards, Plato's thoughts and the lessons put on
// the page, and what the page draws. Pure; the backend and the page import it.
import { checkDiagram } from '../src/visuals/diagram.mjs';

export const BOARD_KINDS = ['markdown', 'diagram', 'element', 'zone', 'question', 'check', 'notes'];
export const ELEMENT_KINDS = ['circuit', 'trace', 'scene3d', 'figure'];
export const CHECK_KINDS = ['choice', 'multi_select', 'order', 'match', 'number', 'text'];
export const MAX_MARKDOWN = 1400; // one idea on the page

const kept = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)));

/** A board as the models write it (flat, for strict output: diagramType, diagramData as JSON text) in the page's shape. */
export const fromDraft = d => d && {
  kind: d.kind, title: d.title, content: d.content ?? null, diagram: d.diagramType ? { type: d.diagramType, data: d.diagramData ?? null } : null,
  zone: d.zone ?? null, check: d.check ?? null, questionId: d.questionId ?? null,
};

/**
 * A board checked for the page: { board, problem }. `board` is the board ready to show, or null; `problem` says what is
 * wrong (a lesson repairs it; a card falls back to its stand-in). Markdown past MAX_MARKDOWN is a problem, and its board is
 * cut to fit. `questions` (ids), when given, are the only questions a question board may name. The shapes:
 *   markdown { title, content } · diagram { title, diagram: { type, data } }, which must draw (data may be JSON text)
 *   zone { zone: { kind: 'code' with language 'c' | 'riscv', 'latex' with lines, or 'proof' with sections (headings); starter?, lines?, task? } }
 *   check { check: { kind, prompt, options (choice, multi_select: 2+), items (order: 2+), left and right (match: 2+, paired) } }
 *   question { questionId, question? } · notes { ref?, query?, quote?, lecture? } · element { element: { kind, spec, title?, summary? } }
 */
export function checkBoard(b, { questions = null } = {}) {
  const no = problem => ({ board: null, problem }), title = b?.title ?? null;
  if (!b || !BOARD_KINDS.includes(b.kind)) return no(`unknown board kind ${JSON.stringify(b?.kind)}`);
  if (b.kind === 'markdown') {
    // A slide: text, points revealed one at a time as Plato talks (steps), and a diagram drawn from data, any of them.
    const content = String(b.content ?? '').trim(), steps = (Array.isArray(b.steps) ? b.steps : []).map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 8).map(x => x.slice(0, 400));
    let diagram = null;
    if (b.diagram?.type) {
      try { const raw = b.diagram.data, d = checkDiagram({ type: b.diagram.type, data: typeof raw === 'string' ? JSON.parse(raw) : raw }); diagram = { type: d.type, data: d.data }; }
      catch (error) { return no(`${b.diagram.type} diagram: ${error.message}`); }
    }
    if (!content && !steps.length && !diagram) return no('markdown with no content');
    const board = kept({ kind: 'markdown', title, content: content.slice(0, MAX_MARKDOWN) || null, steps, diagram });
    return { board: { title, ...board }, problem: content.length > MAX_MARKDOWN ? `${content.length} characters; one idea, under ${MAX_MARKDOWN}` : null };
  }
  if (b.kind === 'diagram') {
    try {
      const raw = b.diagram?.data, d = checkDiagram({ type: b.diagram?.type, data: typeof raw === 'string' ? JSON.parse(raw) : raw });
      return { board: { kind: 'diagram', title, diagram: { type: d.type, data: d.data } }, problem: null };
    } catch (error) { return no(`${b.diagram?.type} diagram: ${error.message}`); }
  }
  if (b.kind === 'zone') {
    const z = b.zone;
    if (!z || !['code', 'latex', 'proof'].includes(z.kind) || (z.kind === 'code' && !['c', 'riscv'].includes(z.language)) || (z.kind === 'latex' && !z.lines?.length)) return no('a zone needs code with its language, LaTeX lines, or a proof');
    const sections = z.kind === 'proof' ? (Array.isArray(z.sections) ? z.sections : []).map(x => String(x ?? '').trim().slice(0, 80)).filter(Boolean).slice(0, 12) : null;
    return { board: { kind: 'zone', zone: kept({ kind: z.kind, language: z.language, starter: z.starter, lines: z.lines, sections, task: z.task }) }, problem: null };
  }
  if (b.kind === 'check') {
    const c = b.check, two = x => Array.isArray(x) && x.length >= 2;
    const ok = c && CHECK_KINDS.includes(c.kind) && String(c.prompt ?? '').trim() && (['choice', 'multi_select'].includes(c.kind) ? two(c.options) : c.kind === 'order' ? two(c.items) : c.kind === 'match' ? two(c.left) && c.right?.length === c.left.length : true);
    return ok ? { board: { kind: 'check', check: kept({ kind: c.kind, prompt: c.prompt, options: c.options, items: c.items, left: c.left, right: c.right, answers: c.answers, explain: c.explain }) }, problem: null } : no('an incomplete check');
  }
  if (b.kind === 'question') {
    if (typeof b.questionId !== 'string' || (questions && !questions.includes(b.questionId))) return no('not a question offered for this card');
    return { board: kept({ kind: 'question', questionId: b.questionId, question: b.question }), problem: null };
  }
  if (b.kind === 'notes') return b.ref || b.query ? { board: kept({ kind: 'notes', ref: b.ref, query: b.query, quote: b.quote, lecture: b.lecture }), problem: null } : no('notes with no ref or query');
  const e = b.element;
  return e && ELEMENT_KINDS.includes(e.kind) && e.spec && typeof e.spec === 'object' ? { board: { kind: 'element', element: kept({ kind: e.kind, spec: e.spec, title: e.title, summary: e.summary }) }, problem: null } : no('an element with no spec');
}

// How many questions a text asks: its question marks outside math, code and quotes, a run of them counting once (16 Oct,
// the user: "stop the multi question behavior … the agent will ask 2-3 quick checkups at the same time").
export const asksIn = text => (String(text || '').replace(/```[\s\S]*?```|`[^`]*`|\$\$[\s\S]*?\$\$|\$[^$\n]*\$|"[^"\n]*"|“[^”\n]*”/g, ' ').match(/\?+/g) || []).length;
const ONE_ASK = 'ask one thing; the next comes after they answer';
/** Why a page question can't go up as asked (it asks several things, or this turn already put one up), or null. */
export const manyAsks = (question, alreadyUp = false) => alreadyUp ? `this turn already put a question on the page: wait for their answer to it (${ONE_ASK})`
  : asksIn(question) > 1 ? `that asks ${asksIn(question)} things at once: ${ONE_ASK}` : null;

/** A board's stand-in, for when it can't go up as itself (an element not built in time, a question not offered): its markdown, else its diagram. */
export const standIn = b => (b && (checkBoard({ ...b, kind: 'markdown' }).board || checkBoard({ ...b, kind: 'diagram' }).board)) || null;
