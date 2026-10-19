import React, { useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './equations.css';

// LaTeX as the student writes it in the LaTeX zone: tex() renders it for display (null where it doesn't parse), and the
// symbol palette writes it. A press on a symbol puts its LaTeX at the caret of the field being written in, as if typed
// (so it has its own undo), with its first □ selected to type over; Tab then goes on to the next □ (nextHole). Pressing
// the palette never takes the keys from that field.

const OPTIONS = { output: 'html', throwOnError: true, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 12 };
// Renders by source, kept while the student types (the zone redraws every step on each key).
const shown = new Map();
export function tex(source) {
  if (!shown.has(source)) {
    if (shown.size > 500) shown.clear();
    try { shown.set(source, katex.renderToString(source, { ...OPTIONS, displayMode: true })); } catch { shown.set(source, null); }
  }
  return shown.get(source);
}

// Each symbol: [its LaTeX, its name, what its key shows when that isn't the LaTeX itself].
const GROUPS = [
  ['Structures', [['\\frac{□}{□}', 'fraction', '\\dfrac{a}{b}'], ['□^{□}', 'power', 'x^{n}'], ['□_{□}', 'subscript', 'x_{i}'], ['\\sqrt{□}', 'root', '\\sqrt{x}'],
    ['\\sum_{□}^{□}', 'sum', '\\sum'], ['\\prod_{□}^{□}', 'product', '\\prod'], ['\\int_{□}^{□}', 'integral', '\\int'], ['\\lim_{□ \\to □}', 'limit', '\\lim'],
    ['\\begin{pmatrix} □ & □ \\\\ □ & □ \\end{pmatrix}', '2 by 2 matrix', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
    ['\\begin{cases} □ & □ \\\\ □ & □ \\end{cases}', 'cases', '\\begin{cases} a \\\\ b \\end{cases}'], ['\\overline{□}', 'overline', '\\overline{x}'], ['\\underbrace{□}_{□}', 'underbrace', '\\underbrace{ab}']]],
  ['Greek', 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega'
    .split(' ').map(name => [`\\${name}`, name])],
  ['Relations', [['\\le', 'at most'], ['\\ge', 'at least'], ['\\ne', 'not equal'], ['\\approx', 'approximately'], ['\\equiv', 'equivalent']]],
  ['Arrows', [['\\to', 'to'], ['\\Rightarrow', 'implies'], ['\\Leftrightarrow', 'if and only if']]],
  ['Logic', [['\\land', 'and'], ['\\lor', 'or'], ['\\lnot', 'not'], ['\\oplus', 'exclusive or'], ['\\forall', 'for all'], ['\\exists', 'there exists'], ['\\Leftarrow', 'is implied by'], ['\\therefore', 'therefore']]],
  ['Sets', [['\\in', 'in'], ['\\notin', 'not in'], ['\\subseteq', 'subset of'], ['\\subsetneq', 'proper subset of'], ['\\cup', 'union'], ['\\cap', 'intersection'], ['\\setminus', 'minus'],
    ['\\times', 'Cartesian product'], ['\\emptyset', 'empty set'], ['\\{□ \\mid □\\}', 'set builder', '\\{x \\mid P\\}'], ['\\mathcal{P}(□)', 'power set', '\\mathcal{P}(A)'], ['|□|', 'size', '|A|'],
    ['\\mathbb{N}', 'naturals'], ['\\mathbb{Z}', 'integers'], ['\\mathbb{Q}', 'rationals'], ['\\mathbb{R}', 'reals']]],
  ['Functions', [['□ : □ \\to □', 'function', 'f : A \\to B'], ['\\circ', 'composed with'], ['□^{-1}', 'inverse', 'f^{-1}'], ['\\mapsto', 'maps to'], ['\\mid', 'divides'], ['\\nmid', 'does not divide'],
    ['\\equiv □ \\pmod{□}', 'congruent mod', '\\equiv \\pmod{n}'], ['\\sim', 'related'], ['\\preceq', 'precedes'], ['\\lfloor □ \\rfloor', 'floor', '\\lfloor x \\rfloor'], ['\\lceil □ \\rceil', 'ceiling', '\\lceil x \\rceil'], ['\\binom{□}{□}', 'choose', '\\binom{n}{k}']]],
  ['Text', [['\\texttt{□}', 'code text', '\\texttt{tt}'], ['\\mathrm{□}', 'upright text', '\\mathrm{rm}']]],
];
const keys = new Map();
const key = latex => { if (!keys.has(latex)) keys.set(latex, katex.renderToString(latex, { ...OPTIONS, throwOnError: false })); return keys.get(latex); };

/** Puts `snippet` at the caret of `el` (an input or textarea) as if typed, with its first □ selected. In `prose` (text with
 *  $math$, the proof zone) a snippet outside math goes in its own $…$. */
function insert(el, snippet, prose = false) {
  if (document.activeElement !== el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  const at = el.selectionStart, outside = prose && (el.value.slice(0, at).match(/(?<!\\)\$/g) || []).length % 2 === 0;
  const text = outside ? `$${snippet}$` : snippet.includes('□') ? snippet : `${snippet} `;
  // Typed, React hears it and the browser can undo it; setRangeText where execCommand has gone.
  if (!document.execCommand('insertText', false, text)) { el.setRangeText(text, at, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
  const hole = text.indexOf('□');
  if (hole >= 0) el.setSelectionRange(at + hole, at + hole + 1);
}

/** Tab in a field selects the next □ after the caret, when there is one; true when it did. */
export function nextHole(e) {
  const el = e.currentTarget, at = e.key === 'Tab' && !e.shiftKey ? el.value.indexOf('□', el.selectionEnd) : -1;
  if (at < 0) return false;
  e.preventDefault();
  el.setSelectionRange(at, at + 1);
  return true;
}

/** The symbol palette: group names as small words, the chosen group's symbols as keys. `field()` is the input a press writes into. */
export function Palette({ field, prose = false }) {
  const [group, setGroup] = useState(0);
  return <div className="palette" role="group" aria-label="Symbols" onMouseDown={e => e.preventDefault()}>
    <div className="palette-groups">{GROUPS.map(([name], i) => <button key={name} type="button" aria-pressed={i === group} onClick={() => setGroup(i)}>{name}</button>)}</div>
    <div className="palette-keys">{GROUPS[group][1].map(([latex, name, face = latex]) =>
      <button key={latex} type="button" title={name} aria-label={name} onClick={() => { const el = field(); if (el) insert(el, latex, prose); }} dangerouslySetInnerHTML={{ __html: key(face) }} />)}</div>
  </div>;
}
