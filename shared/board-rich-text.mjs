import katex from 'katex';

// Plato's material as a small markdown subset: paragraphs and line breaks, headings, bold/italic, inline
// code, fenced code, lists, pipe tables, quotes, rules and math. It yields plain data for React to render;
// nothing here becomes HTML except KaTeX's own output, so text from models and course files (any HTML in
// it included) stays literal text.

// Inline atoms, leftmost first and, at one position, in this order: code spans, display math ($$…$$, \[…\]),
// inline math (\(…\), $…$), backslash escapes and links (shown as their text; the page never navigates away).
// Inline $…$ follows Pandoc: it opens before a non-space and closes after one, never before a digit, so
// "$5 and $10" stays currency; a blank to fill ("$f(k) = $ the remainder") may close after "= ". Nothing
// inside code is math.
const ATOMS = /(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?![\s$])([^$\n]*?(?:[^\s$\\]|= ))\$(?![\d$])|\\([!-\/:-@[-`{-~])|!?\[([^\]\n]+)\]\([^)\s]*\)/g;
// The same math, uncaptured, for readers that must keep a formula whole (table cells, conversation-log codeify).
export const MATH_SPANS = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?![\s$])[^$\n]*?(?:[^\s$\\]|= )\$(?![\d$])/g;
const WORD = /[\p{L}\p{N}]/u;
// Private-use marks stand in for atoms while emphasis is matched; any in the source are dropped first.
const clean = value => (value == null ? '' : String(value)).replace(/\r\n?/g, '\n').replace(/[\uE000\uE001]/g, '');

export function parseInline(value) {
  const atoms = [];
  const marked = clean(value).replace(ATOMS, (whole, ticks, code, display, bracket, paren, dollar, escaped, link) => {
    const math = display ?? bracket ?? paren ?? dollar;
    if (math !== undefined && !math.trim()) return whole;
    atoms.push(ticks ? { type: 'code', text: codeSpan(code) } : (escaped ?? link) !== undefined ? { type: 'text', text: escaped ?? link } : { type: 'math', text: math, display: display !== undefined || bracket !== undefined });
    return `\uE000${atoms.length - 1}\uE001`;
  });
  return emphasis(marked, atoms);
}

function codeSpan(text) {
  const flat = text.replace(/\n/g, ' ');
  return flat.length > 2 && flat[0] === ' ' && flat.at(-1) === ' ' && flat.trim() ? flat.slice(1, -1) : flat;
}

// *em*, **strong**, ***both*** (and with _): a run opens before a non-space and not after a letter or digit,
// and closes on a run of the same length after a non-space and not before one. So snake_case, 2*3*4 and
// "*p and *q" stay as written.
function emphasis(s, atoms) {
  const out = [], hopeless = new Set();
  let at = 0, plain = 0;
  while (at < s.length) {
    const c = s[at];
    if (c !== '*' && c !== '_') { at++; continue; }
    let run = 1; while (s[at + run] === c) run++;
    let end = -1;
    if (run <= 3 && !/\s/.test(s[at + run] || ' ') && !WORD.test(s[at - 1] || ' ') && !hopeless.has(c + run)) {
      end = closer(s, at + run, c, run);
      if (end < 0) hopeless.add(c + run); // no closer from here means none from any later opener either
    }
    if (end < 0) { at += run; continue; }
    if (at > plain) text(out, s.slice(plain, at), atoms);
    const inner = emphasis(s.slice(at + run, end), atoms);
    out.push(run === 1 ? { type: 'em', children: inner } : { type: 'strong', children: run === 2 ? inner : [{ type: 'em', children: inner }] });
    at = plain = end + run;
  }
  if (plain < s.length) text(out, s.slice(plain), atoms);
  return out;
}

function closer(s, from, c, length) {
  for (let at = from; at < s.length; at++) {
    if (s[at] !== c) continue;
    let run = 1; while (s[at + run] === c) run++;
    if (run === length && at > from && !/\s/.test(s[at - 1]) && !WORD.test(s[at + run] || ' ')) return at;
    at += run - 1;
  }
  return -1;
}

// Plain text back from the marked string: atoms restored, line breaks as their own nodes.
function text(out, s, atoms) {
  for (const part of s.split(/(\uE000\d+\uE001|\n)/)) {
    if (!part) continue;
    const atom = part[0] === '\uE000' ? atoms[Number(part.slice(1, -1))] : null;
    if (part === '\n') out.push({ type: 'br' });
    else if (atom && atom.type !== 'text') out.push(atom);
    else if (out.at(-1)?.type === 'text') out.at(-1).text += atom ? atom.text : part;
    else out.push({ type: 'text', text: atom ? atom.text : part });
  }
}

const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
const FENCE_END = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/;
const DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const MATH_OPEN = /^ {0,3}(\$\$|\\\[)/;
const LANGUAGES = { c: 'c', h: 'c', cpp: 'c', 'c++': 'c', asm: 'asm', s: 'asm', riscv: 'asm', 'risc-v': 'asm', rv32i: 'asm', rv64i: 'asm', assembly: 'asm', gas: 'asm' };

/** Block markdown → [{ type: p|h|code|math|list|table|quote|rule, … }], inline content as parseInline gives it. */
export function parseMaterial(value) {
  return blocks(clean(value).split('\n').map(line => line.includes('\t') ? [...line].reduce((done, ch) => done + (ch === '\t' ? ' '.repeat(4 - done.length % 4) : ch), '') : line));
}

function blocks(lines) {
  const out = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    let m, found;
    if (!line.trim()) i++;
    else if ((m = FENCE.exec(line))) {
      const body = [], strip = new RegExp(`^ {0,${m[1].length}}`);
      for (i++; i < lines.length; i++) {
        const end = FENCE_END.exec(lines[i]);
        if (end && end[1][0] === m[2][0] && end[1].length >= m[2].length) { i++; break; }
        body.push(lines[i].replace(strip, ''));
      }
      const code = body.join('\n'), name = m[3].toLowerCase();
      out.push({ type: 'code', lang: name ? LANGUAGES[name] || name : guessLanguage(code), text: code });
    } else if ((found = mathBlock(lines, i))) { out.push(found.block); i = found.next; }
    else if ((m = HEADING.exec(line))) { out.push({ type: 'h', level: Math.min(m[1].length, 4), children: parseInline(m[2]) }); i++; }
    else if (RULE.test(line)) { out.push({ type: 'rule' }); i++; }
    else if (QUOTE.test(line)) {
      const body = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) body.push(lines[i].replace(QUOTE, ''));
      out.push({ type: 'quote', blocks: blocks(body) });
    } else if (ITEM.test(line)) { found = list(lines, i); out.push(found.block); i = found.next; }
    else if ((found = table(lines, i))) { out.push(found.block); i = found.next; }
    else {
      const body = [line.trim()];
      for (i++; i < lines.length && lines[i].trim() && !interrupts(lines, i); i++) body.push(lines[i].trim());
      out.push({ type: 'p', children: parseInline(body.join('\n')) });
    }
  }
  return out;
}

const interrupts = (lines, i) => FENCE.test(lines[i]) || HEADING.test(lines[i]) || RULE.test(lines[i]) || QUOTE.test(lines[i]) || ITEM.test(lines[i]) || Boolean(mathBlock(lines, i) || table(lines, i));

// $$ or \[ opening a line, closed with nothing after it: a display formula of its own (lines inside it are
// math, never list items or tables). Anything else is left to the paragraph.
function mathBlock(lines, i) {
  const m = MATH_OPEN.exec(lines[i]);
  if (!m) return null;
  const close = m[1] === '$$' ? '$$' : '\\]';
  let body = lines[i].slice(m[0].length);
  for (let j = i; j < lines.length; j++) {
    if (j > i) { if (!lines[j].trim()) return null; body += `\n${lines[j]}`; }
    const end = body.indexOf(close);
    if (end < 0) continue;
    return body.slice(end + close.length).trim() || !body.slice(0, end).trim() ? null : { block: { type: 'math', text: body.slice(0, end).trim() }, next: j + 1 };
  }
  return null;
}

// An item runs on through lines indented past its marker (its own paragraphs, code, a nested list) and
// through unindented lines that carry on its text.
function list(lines, i) {
  const first = ITEM.exec(lines[i]), ordered = /\d/.test(first[2]), base = first[1].length, items = [];
  while (i < lines.length) {
    const m = ITEM.exec(lines[i]);
    if (!m || /\d/.test(m[2]) !== ordered || m[1].length >= base + 2) break;
    const column = m[1].length + m[2].length + Math.min(m[3]?.length || 1, 4), body = [m[4] || ''];
    for (i++; i < lines.length; i++) {
      const lead = lines[i].search(/\S/);
      if (lead < 0) {
        let k = i; while (k < lines.length && !lines[k].trim()) k++;
        if (k < lines.length && lines[k].search(/\S/) >= base + 2) { body.push(...lines.slice(i, k).map(() => '')); i = k - 1; continue; }
        break;
      }
      if (lead >= base + 2) body.push(lines[i].slice(Math.min(lead, column)));
      else if (interrupts(lines, i)) break;
      else body.push(lines[i].trim());
    }
    items.push(blocks(body));
    let k = i; while (k < lines.length && !lines[k].trim()) k++;
    const next = ITEM.exec(lines[k] || '');
    if (!next || /\d/.test(next[2]) !== ordered || next[1].length >= base + 2) break;
    i = k;
  }
  return { block: { type: 'list', ordered, start: ordered ? parseInt(first[2], 10) : 1, items }, next: i };
}

// GFM pipe tables. \| is a literal pipe, inside code too, and so is any | inside math ($|X|$, $\{x \mid …\}$).
// Columns of short non-word cells (0/1, x, 10) centre unless the delimiter row says otherwise.
const cells = line => {
  let s = line.trim().replace(MATH_SPANS, math => math.replace(/(?<!\\)\|/g, '\\|'));
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, '|').trim());
};

function table(lines, i) {
  if (!lines[i].includes('|') || !DELIMITER.test(lines[i + 1] || '')) return null;
  const head = cells(lines[i]), rule = cells(lines[i + 1]);
  if (head.length !== rule.length) return null;
  const rows = [];
  let k = i + 2;
  for (; k < lines.length && lines[k].includes('|') && lines[k].trim(); k++) { const row = cells(lines[k]); rows.push(head.map((_, c) => row[c] ?? '')); }
  const align = rule.map((r, c) => r.startsWith(':') && r.endsWith(':') ? 'center' : r.endsWith(':') ? 'right' : r.startsWith(':') ? 'left' : rows.length && rows.every(row => row[c].length <= 3 && !/\p{L}{2}/u.test(row[c])) ? 'center' : null);
  return { block: { type: 'table', align, head: head.map(parseInline), rows: rows.map(row => row.map(parseInline)) }, next: k };
}

// Unlabelled fences: C if lines end in ; { or }, RISC-V if an instruction takes a register, else plain.
const ASM_LINE = /^[ \t]*(?:[.\w]+:[ \t]*)?[a-z][a-z.]{0,7}[ \t]+(?:x(?:[12]?\d|3[01])|zero|ra|sp|gp|tp|fp|[ast]\d{1,2})\b/m;
const guessLanguage = code => /[;{}][ \t]*(?:\/\/.*)?$/m.test(code) ? 'c' : ASM_LINE.test(code) ? 'asm' : '';

const C_WORDS = new Set('auto bool break case char const continue default do double else enum extern false float for goto if inline int long NULL register restrict return short signed sizeof static struct switch true typedef union unsigned void volatile while'.split(' '));
const C_TOKENS = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$(?![\s\S])))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(^[ \t]*#[ \t]*[a-z]+)|\b(0[xX][\da-fA-F]+[uUlL]*|0[bB][01]+[uUlL]*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?[uUlLfF]*)\b|([A-Za-z_]\w*)/gm;
// Comments, strings, labels (plain), the first word of a line (mnemonic or directive), registers, numbers, names.
const ASM_TOKENS = /(#[^\n]*|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"?)|(^[ \t]*[.\w$]+:)|((?<=^[ \t]*(?:[.\w$]+:[ \t]*)?)[.A-Za-z_][\w.]*)|\b(x(?:[12]?\d|3[01])|zero|ra|sp|gp|tp|fp|t[0-6]|s(?:1[01]|\d)|a[0-7])\b|(-?\b(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+)\b)|([A-Za-z_$][\w.$]*)/gm;

/** Code → [{ text, type? }]; type is com, str, kw (keyword, mnemonic, directive), reg or num. */
export function highlightCode(code, lang) {
  const rule = lang === 'c' ? C_TOKENS : lang === 'asm' ? ASM_TOKENS : null, out = [];
  if (!rule) return [{ text: code }];
  let at = 0;
  for (const m of code.matchAll(rule)) {
    const type = m[1] !== undefined ? 'com' : m[2] !== undefined ? 'str' : lang === 'c'
      ? (m[3] !== undefined ? 'kw' : m[4] !== undefined ? 'num' : C_WORDS.has(m[5]) || /^[a-z]\w*_t$/.test(m[5]) ? 'kw' : '')
      : (m[4] !== undefined ? 'kw' : m[5] !== undefined ? 'reg' : m[6] !== undefined ? 'num' : '');
    if (!type) continue;
    if (m.index > at) out.push({ text: code.slice(at, m.index) });
    out.push({ type, text: m[0] });
    at = m.index + m[0].length;
  }
  if (at < code.length) out.push({ text: code.slice(at) });
  return out;
}

/** Highlighted code as lines of tokens (a token can span lines, as a block comment does): each line its own block on
 *  the page, so a long one wraps under itself and point_to finds a line by its box. */
export function highlightLines(code, lang) {
  const out = [[]];
  for (const token of highlightCode(code, lang)) token.text.split('\n').forEach((text, i) => { if (i) out.push([]); if (text) out.at(-1).push({ ...token, text }); });
  return out;
}

/** Text and explicitly delimited math, by the same rules as parseInline (code spans and escapes stay text). */
export function boardTextParts(value) {
  const parts = [];
  const flat = nodes => nodes.forEach(node => {
    if (node.children) return flat(node.children);
    const part = node.type === 'math' ? { type: 'math', text: node.text, display: node.display } : { type: 'text', text: node.type === 'br' ? '\n' : node.type === 'code' ? `\`${node.text}\`` : node.text };
    if (part.type === 'text' && parts.at(-1)?.type === 'text') parts.at(-1).text += part.text; else parts.push(part);
  });
  flat(parseInline(value));
  return parts;
}

// KaTeX with no trusted commands, bounded so a hostile formula can't stall the page.
export function renderBoardInlineMath(content,{display=false}={}) {
  return katex.renderToString(String(content).slice(0,4000),{output:'html',displayMode:display,throwOnError:false,trust:false,strict:'ignore',maxExpand:500,maxSize:12,errorColor:'#666666'})
    .replace('class="katex-html" aria-hidden="true"','class="katex-html"');
}
