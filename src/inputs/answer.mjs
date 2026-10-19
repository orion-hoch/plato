// Answers in every input kind, as data. A structured answer ({ kind, value }) goes to the backend for
// exact grading; `readable` is the text sent alongside it and the words Plato hears.

export const KINDS = ['speech', 'choice', 'multi_select', 'text', 'number', 'draw', 'order', 'match'];

const byId = list => new Map((list || []).map(x => [x.id, x.text]));

/** Normalize an inputSpec (backend shape) or an agent ask_input call (plain string lists) to ids + text. */
export function normalizeSpec(kind, spec = {}) {
  const tag = (list, prefix) => (list || []).map((x, i) => typeof x === 'string' ? { id: `${prefix}${i + 1}`, text: x } : { id: String(x.id), text: String(x.text ?? '') });
  if (kind === 'choice' || kind === 'multi_select') return { options: tag(spec.options, '').map((o, i) => (/^\d+$/.test(o.id) ? { ...o, id: String.fromCharCode(65 + i) } : o)) };
  if (kind === 'order') return { items: tag(spec.items, 'i') };
  if (kind === 'match') return { left: tag(spec.left, 'l'), right: tag(spec.right, 'r') };
  if (kind === 'number') return { unit: spec.unit ?? null, tolerance: spec.tolerance ?? null };
  return {};
}

/** True when the value is a complete answer for this kind. */
export function answerReady(kind, value, spec = {}) {
  if (kind === 'choice') return typeof value === 'string' && value.length > 0;
  if (kind === 'multi_select') return Array.isArray(value) && value.length > 0;
  if (kind === 'order') return Array.isArray(value) && value.length === (spec.items || []).length;
  if (kind === 'match') return Array.isArray(value) && value.length === (spec.left || []).length && value.every(p => Array.isArray(p) && p.length === 2);
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (kind === 'text') return typeof value === 'string' && value.trim().length > 0;
  return false;
}

/** Typed words as a text or number answer, or null when they are not one. A number is written in decimal:
 *  "0x2A" must not count as converting 0x2A to decimal (hex and binary answers are text questions). */
export function typedAnswer(kind, text) {
  const value = String(text ?? '').trim();
  if (kind === 'text') return value ? { kind, value } : null;
  if (kind === 'number') return /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(value) ? { kind, value: Number(value) } : null;
  return null;
}

/** The answer in words, e.g. "B) Θ(n log n)" or "first: split, then: sort halves, then: merge". */
export function readable(kind, value, spec = {}) {
  if (kind === 'choice') { const t = byId(spec.options).get(value); return t ? `${value}) ${t}` : String(value); }
  if (kind === 'multi_select') { const m = byId(spec.options); return value.map(id => `${id}) ${m.get(id) ?? ''}`.trim()).join('; '); }
  if (kind === 'order') { const m = byId(spec.items); return value.map((id, i) => `${i + 1}. ${m.get(id) ?? id}`).join('; '); }
  if (kind === 'match') { const l = byId(spec.left), r = byId(spec.right); return value.map(([a, b]) => `${l.get(a) ?? a} → ${r.get(b) ?? b}`).join('; '); }
  if (kind === 'number') return spec.unit ? `${value} ${spec.unit}` : String(value);
  return String(value ?? '').trim();
}

/** Moving an item one place in an ordering (keyboard and tap reordering). */
export function move(list, index, by) {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
