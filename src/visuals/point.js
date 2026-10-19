// point_to: a soft lapis mark over part of Plato's page for about four seconds, scrolled into view. First an `anchor`:
// an element-level part the page names (data-anchor: a sentence of a reading, a line, a register, a cell, a part of a
// circuit). Else `phrase` (or an older agent's `target`): "line 3" or "lines 3-5" (in the latest code on the page),
// "step 2" (a worked step, once shown), "part b" (an exam problem's part), or a few words of the page's text. Returns
// what the agent hears; when nothing binds it is told to name the thing fully instead (stage direction 7). Each
// pointing is logged ({ at, anchor, phrase, resolved, granularity }) for the stage checks (voice §10 E7, E8).
const SHOWN_MS = 4000;
let pointing = 0;
export const pointLog = [];
// A whole element or block is an item; a part of one (a line, a cell, a sentence: "line-4", "p2.s1") is element-level.
const grain = id => /[-.]/.test(id) ? 'element' : 'item';
function note(entry) { pointLog.push({ at: Date.now(), ...entry }); if (pointLog.length > 500) pointLog.shift(); }

export function pointTo(given) {
  const { anchor = '', phrase = '', target = '' } = typeof given === 'object' && given ? given : { phrase: given };
  const page = document.querySelector('.page'), id = String(anchor).trim();
  if (page && id) {
    const el = page.querySelector(`[data-anchor="${CSS.escape(id)}"]`);
    if (el) { note({ anchor: id, phrase: null, resolved: true, granularity: grain(id) }); place(page, () => [el.getBoundingClientRect()].filter(r => r.width > 0 && r.height > 0), id); return 'Pointed.'; }
  }
  // An id that isn't on the page may still be a phrase ("line 4"); an older agent sends `target`.
  const want = String(phrase || target || id).trim();
  const said = want && pointAt(want);
  note({ anchor: id || null, phrase: want || null, resolved: said === 'Highlighted.', granularity: said === 'Highlighted.' ? 'phrase' : 'none' });
  return said === 'Highlighted.' ? (id ? `No anchor ${id}; pointed at the words instead.` : 'Pointed.') : 'Nothing there to point at: name it fully instead.';
}
const CODE = '.material pre, .zone-stack > pre';
// Text a reader can't see as such: MathML for screen readers, the controls, the marks themselves.
const HIDDEN = '.katex-mathml, .page-close, button, textarea, .sr-only, .page-point';
const SAME = { '’': "'", '‘': "'", '“': '"', '”': '"', '−': '-', '–': '-', '\u00a0': ' ' };

function pointAt(target) {
  const page = document.querySelector('.page'), want = String(target ?? '').trim().replace(/^["'“‘]+|["'”’.]+$/g, '');
  if (!page || !want) return 'Not on the page.';
  let m, measure;
  if ((m = /^lines?\s+(\d+)(?:\s*(?:-|–|to)\s*(\d+))?$/i.exec(want))) measure = () => codeLines(page, +m[1], +(m[2] || m[1]));
  else if ((m = /^step\s+(\d+)$/i.exec(want))) {
    const steps = page.querySelectorAll('.page-steps > li');
    if (!steps[m[1] - 1]) return steps.length ? `Not on the page: only steps 1 to ${steps.length} are shown so far.` : 'Not on the page.';
    measure = () => [steps[m[1] - 1].getBoundingClientRect()];
  } else if ((m = /^part\s*\(?([a-z\d]{1,3})\)?$/i.exec(want))) {
    const part = page.querySelector(`.exam-part[data-part="${CSS.escape(m[1].toLowerCase())}"] .exam-head`);
    measure = () => part && [part.getBoundingClientRect()];
  } else measure = () => words(page, want);
  if (!measure()?.length) return 'Not on the page.';
  place(page, measure);
  return 'Highlighted.';
}

// A part just put on the page slides in for a moment: the mark goes where it comes to rest. The latest pointing wins:
// one still waiting when another comes is dropped.
function place(page, measure) {
  const moving = [page, ...page.querySelectorAll('.page-part, .page-steps > li')].flatMap(el => el.getAnimations?.() || []).filter(a => a.playState === 'running'), mine = ++pointing;
  void Promise.all(moving.map(a => a.finished.catch(() => {}))).then(() => { const boxes = mine === pointing && measure(); if (boxes?.length) mark(page, boxes); });
}

// A band across lines `from` to `to` of the latest code: each line is its own block (it may wrap), so by their boxes.
function codeLines(page, from, to) {
  const code = [...page.querySelectorAll(CODE)].at(-1), rows = code?.querySelectorAll('.trace-line, .zone-line, .code-line') || [];
  if (from < 1 || to < from || to > rows.length) return null;
  const across = (code.closest('.zone-stack') || code).getBoundingClientRect();
  return [{ left: across.left, right: across.right, top: rows[from - 1].getBoundingClientRect().top, bottom: rows[to - 1].getBoundingClientRect().bottom, line: true }];
}

// Where the words first appear in the page's text (any case, spacing and quote marks), as the boxes of their lines.
function words(page, want) {
  const norm = ch => /\s/.test(ch) ? ' ' : (SAME[ch] || ch).toLowerCase(), needle = [...want].map(norm).join('').replace(/ +/g, ' ');
  if (needle.length < 2) return null;
  const walk = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, { acceptNode: t => t.parentElement?.closest(HIDDEN) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let flat = '';
  const at = []; // at[i]: the text node and offset of flat[i]
  for (let t; (t = walk.nextNode());) for (let i = 0; i < t.data.length; i++) {
    const ch = norm(t.data[i]);
    if (ch === ' ' && (!flat || flat.endsWith(' '))) continue;
    flat += ch; at.push([t, i]);
  }
  const found = flat.indexOf(needle);
  if (found < 0) return null;
  const range = document.createRange();
  range.setStart(...at[found]);
  range.setEnd(at[found + needle.length - 1][0], at[found + needle.length - 1][1] + 1);
  return [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1);
}

// The marks go on the page itself (they scroll with it) and go away on their own; a new pointing replaces them.
function mark(page, boxes) {
  for (const old of page.querySelectorAll('.page-point')) old.remove();
  const frame = page.getBoundingClientRect(), made = boxes.map(b => {
    const el = document.createElement('div'), pad = b.line ? 0 : 3;
    el.className = b.line ? 'page-point is-line' : 'page-point';
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, { left: `${b.left - frame.left + page.scrollLeft - pad}px`, top: `${b.top - frame.top + page.scrollTop - pad}px`, width: `${b.right - b.left + 2 * pad}px`, height: `${b.bottom - b.top + 2 * pad}px` });
    page.append(el);
    return el;
  });
  made[0].scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  setTimeout(() => { for (const el of made) el.remove(); }, SHOWN_MS);
}
