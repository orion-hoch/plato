// An explanation figure the tutor's background model draws (create_element kind "figure"): a stack frame, a
// datapath, pointers between boxes, the memory hierarchy. The spec is a small SVG in a strict subset: shapes, text and
// arrowheads, geometry attributes and class only; colour and type come from a fixed palette of classes that the page's
// CSS maps (src/elements/elements.css). validate() parses it against the whitelist and writes it back canonical, on
// the server and again in the page; markup() is what the page draws (ids made its own, arrowheads added).
import { checks, str, clip } from './check.mjs';

const { fail, object } = checks('figure');
const MAX_SVG = 40_960, MAX_ELEMENTS = 400;
export const CLASSES = ['ink', 'muted', 'lapis', 'terracotta', 'gold', 'green', 'faint', 'fill-lapis', 'fill-terracotta', 'fill-gold', 'fill-green', 'fill-paper', 'solid', 'mono', 'serif', 'bold', 'small', 'dashed', 'arrow'];
const COLOURS = ['ink', 'muted', 'lapis', 'terracotta', 'gold', 'green', 'faint'];

// Attribute values by kind. A number is plain (no units); path data and points only digits and their letters.
const NUMBER = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?\s*$/i;
const VALUE = {
  number: v => NUMBER.test(v),
  d: v => /^\s*[Mm][MmLlHhVvCcSsQqTtAaZz\d\s,.eE+-]*$/.test(v),
  points: v => /^[\d\s,.eE+-]+$/.test(v),
  transform: v => /^\s*(?:(?:translate|scale|rotate|matrix|skewX|skewY)\s*\([\d\s,.eE+-]*\)[\s,]*)+$/.test(v),
  viewBox: v => { const p = v.trim().split(/[\s,]+/); return p.length === 4 && p.every(x => NUMBER.test(x)) && +p[2] > 0 && +p[3] > 0; },
  anchor: v => ['start', 'middle', 'end'].includes(v),
  baseline: v => ['auto', 'middle', 'central', 'hanging', 'alphabetic', 'mathematical', 'text-top', 'text-bottom'].includes(v),
  shift: v => ['sub', 'super', 'baseline'].includes(v) || NUMBER.test(v),
  orient: v => ['auto', 'auto-start-reverse'].includes(v) || NUMBER.test(v),
  units: v => ['strokeWidth', 'userSpaceOnUse'].includes(v),
  id: v => /^[A-Za-z][\w-]{0,31}$/.test(v),
  marker: v => /^url\(#[A-Za-z][\w-]{0,31}\)$/.test(v), // only a marker of this figure's own
  class: v => v.trim().split(/\s+/).every(c => CLASSES.includes(c) || fail(`class "${c}" is not in the palette (${CLASSES.join(' ')})`)),
};
const SHAPE = { class: 'class', transform: 'transform' }, TEXT = { 'text-anchor': 'anchor', 'dominant-baseline': 'baseline' };
const ENDS = { 'marker-start': 'marker', 'marker-mid': 'marker', 'marker-end': 'marker' }, XY = { x: 'number', y: 'number', dx: 'number', dy: 'number' };
const ATTRIBUTES = {
  svg: { viewBox: 'viewBox', class: 'class', ...TEXT },
  g: { ...SHAPE, ...TEXT },
  defs: {},
  marker: { id: 'id', viewBox: 'viewBox', refX: 'number', refY: 'number', markerWidth: 'number', markerHeight: 'number', orient: 'orient', markerUnits: 'units', class: 'class' },
  path: { ...SHAPE, d: 'd', ...ENDS },
  rect: { ...SHAPE, x: 'number', y: 'number', width: 'number', height: 'number', rx: 'number', ry: 'number' },
  circle: { ...SHAPE, cx: 'number', cy: 'number', r: 'number' },
  ellipse: { ...SHAPE, cx: 'number', cy: 'number', rx: 'number', ry: 'number' },
  line: { ...SHAPE, x1: 'number', y1: 'number', x2: 'number', y2: 'number', ...ENDS },
  polyline: { ...SHAPE, points: 'points', ...ENDS },
  polygon: { ...SHAPE, points: 'points' },
  text: { ...SHAPE, ...XY, ...TEXT },
  tspan: { class: 'class', ...XY, ...TEXT, 'baseline-shift': 'shift' },
};
// Where each element may sit (the rest: in svg, g or marker).
const PARENTS = { svg: ['#document'], defs: ['svg'], marker: ['defs'], tspan: ['text', 'tspan'] };
// Characters by name, besides XML's own five.
const NAMED = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: '\u00a0', times: '×', minus: '−', middot: '·', hellip: '…', ndash: '–', mdash: '—', rarr: '→', larr: '←', harr: '↔', uarr: '↑', darr: '↓', le: '≤', ge: '≥', ne: '≠', deg: '°' };
const decode = s => s.replace(/&(#x[\da-f]{1,6}|#\d{1,7}|[a-z]{2,8});|&/gi, (all, name) => {
  if (!name) return '&'; // a lone & is just itself
  if (Object.hasOwn(NAMED, name)) return NAMED[name];
  const code = name[0] === '#' ? (name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : +name.slice(1)) : NaN;
  return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : fail(`&${name}; is not a character this page knows; write the character itself`);
});
const escape = (s, quote) => s.replace(quote ? /[&<>"]/g : /[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=<>/"']+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATTRIBUTE = /([^\s=<>/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// The attributes an element may keep, in order, each checked; what is forbidden says so in words a model can act on.
function attributes(tag, source) {
  const allowed = ATTRIBUTES[tag], kept = [], seen = new Set();
  for (const [, name, double, single] of source.matchAll(ATTRIBUTE)) {
    const value = decode(double ?? single), lower = name.toLowerCase();
    if (seen.has(name)) fail(`<${tag}> has ${name} twice`);
    seen.add(name);
    if (lower.startsWith('on')) fail(`<${tag}> has ${name}: event handlers are not allowed`);
    if (lower === 'href' || lower.endsWith(':href')) fail(`<${tag}> has ${name}: links are not allowed`);
    if (lower === 'style') fail(`<${tag}> has a style attribute: colours and type come only from class`);
    if (/url\s*\(/i.test(value) && !(ENDS[name] && VALUE.marker(value))) fail(`<${tag}> ${name} uses url(): only marker-start, marker-mid and marker-end may, as url(#id) of a marker in this figure`);
    if (tag === 'svg' && (lower.startsWith('xmlns') || lower === 'width' || lower === 'height' || lower === 'version')) continue; // the page sizes it
    if ((name === 'fill' || name === 'stroke') && value.trim() === 'none') continue; // the default anyway
    if (!Object.hasOwn(allowed, name)) {
      if (/^(fill|stroke|color|opacity|font|text-decoration|letter-spacing|paint-order|filter|mask|clip)/.test(lower)) fail(`<${tag}> has ${name}="${clip(value, 24)}": colour, stroke and type come only from class (${CLASSES.join(' ')})`);
      fail(`<${tag}> can't take ${name}; it takes ${Object.keys(allowed).join(', ') || 'no attributes'}`);
    }
    if (!VALUE[allowed[name]](value)) fail(`<${tag}> ${name}="${clip(value, 40)}" is not a valid value`);
    kept.push([name, allowed[name] === 'class' ? value.trim().split(/\s+/).join(' ') : value.trim()]);
  }
  return kept;
}

/** The figure's markup as a tree: { tag, attrs: [[name, value]], kids: [node | text] }, the root <svg>. Throws "Invalid figure: …". */
export function parse(svg) {
  const source = String(svg).trim();
  if (source.length > MAX_SVG) fail('the svg is over 40 KB; simplify it');
  const document = { tag: '#document', kids: [] }, open = [document];
  let at = 0, count = 0;
  while (at < source.length) {
    const lt = source.indexOf('<', at), end = lt < 0 ? source.length : lt, parent = open.at(-1);
    if (end > at) {
      const body = source.slice(at, end);
      if (parent.tag === 'text' || parent.tag === 'tspan') parent.kids.push(decode(body));
      else if (body.trim()) fail(`text must be inside <text>, not loose in <${parent.tag === '#document' ? 'the document' : parent.tag}> ("${clip(body.trim(), 24)}")`);
    }
    if (lt < 0) break;
    if (source.startsWith('<!--', lt)) { const close = source.indexOf('-->', lt + 4); if (close < 0) fail('a comment is never closed'); at = close + 3; continue; }
    if (source.startsWith('<?xml', lt) && open.length === 1) { const close = source.indexOf('?>', lt); if (close < 0) fail('the <?xml …?> line is never closed'); at = close + 2; continue; }
    TAG.lastIndex = lt;
    const m = TAG.exec(source);
    if (!m) fail(`can't read the markup at "${clip(source.slice(lt, lt + 40), 40)}"`);
    at = TAG.lastIndex;
    const [, closing, tag, list, selfClosing] = m;
    if (closing) {
      if (parent.tag !== tag) fail(open.some(o => o.tag === tag) ? `<${parent.tag}> is never closed` : `</${tag}> closes nothing open here`);
      open.pop();
      continue;
    }
    if (!Object.hasOwn(ATTRIBUTES, tag)) fail(`<${tag}> is not allowed; use only ${Object.keys(ATTRIBUTES).join(', ')}`);
    if (!(PARENTS[tag] || ['svg', 'g', 'marker']).includes(parent.tag)) fail(`<${tag}> can't sit inside <${parent.tag === '#document' ? 'the document' : parent.tag}>`);
    if (++count > MAX_ELEMENTS) fail(`more than ${MAX_ELEMENTS} elements; simplify it`);
    const node = { tag, attrs: attributes(tag, list), kids: [] };
    parent.kids.push(node);
    if (!selfClosing) open.push(node);
  }
  if (open.length > 1) fail(`<${open.at(-1).tag}> is never closed`);
  if (document.kids.length !== 1) fail('the markup must be one <svg> element');
  return document.kids[0];
}

const attr = (node, name) => node.attrs.find(([n]) => n === name)?.[1];
function write(node) {
  if (typeof node === 'string') return escape(node, false);
  const attrs = node.attrs.map(([name, value]) => ` ${name}="${escape(value, true)}"`).join('');
  return node.kids.length ? `<${node.tag}${attrs}>${node.kids.map(write).join('')}</${node.tag}>` : `<${node.tag}${attrs}/>`;
}

export const purpose = 'a static explanation figure drawn as a clean textbook diagram: stack frames, datapaths, pointer diagrams, memory hierarchies, caches, address breakdowns, linked structures';

export const example = {
  svg: "<svg viewBox='0 0 360 168'><g class='small mono muted' text-anchor='end' dominant-baseline='central'><text x='98' y='32'>0x7ffc</text><text x='98' y='64'>0x7ff8</text><text x='98' y='96'>0x7ff4</text><text x='98' y='128'>0x7ff0</text></g>"
    + "<rect x='108' y='80' width='124' height='32' class='fill-lapis'/><rect x='108' y='16' width='124' height='128'/><path d='M108 48H232M108 80H232M108 112H232' class='faint'/>"
    + "<g class='mono' text-anchor='middle' dominant-baseline='central'><text x='170' y='32'>0x10078</text><text x='170' y='64'>0x7ffc</text><text x='170' y='96' class='lapis bold'>42</text><text x='170' y='128'>7</text></g>"
    + "<g class='serif' dominant-baseline='central'><text x='242' y='32'>saved ra</text><text x='242' y='64'>saved s0</text><text x='242' y='96' class='lapis'>x</text><text x='242' y='128'>y</text></g>"
    + "<line x1='318' y1='128' x2='268' y2='128' class='terracotta arrow'/><text x='324' y='128' class='bold terracotta' dominant-baseline='central'>sp</text></svg>",
  caption: 'After the prologue: ra and the old s0 saved at the top of the frame, then the locals; sp points at the lowest word.',
};

export const rules = `spec: {"svg": "<svg viewBox='0 0 W H'>…</svg>", "caption": "…"}: one static figure as a small SVG. Write its attributes in single quotes (it sits inside a JSON string).
Elements: svg (the root, with viewBox), g, rect, circle, ellipse, line, polyline, polygon, path, text, tspan, defs and marker only. No style, script, image, use, foreignObject, title, clipPath, gradients or filters.
Attributes: geometry (x, y, width, height, rx, ry, cx, cy, r, x1, y1, x2, y2, points, d, transform; dx, dy, text-anchor, dominant-baseline on text, tspan and g; baseline-shift on tspan) and class. Never fill, stroke, style, font or opacity attributes (shapes are unfilled by default), never href or event handlers, never url() except marker-end='url(#id)' for a marker you define in defs.
Colour and type come only from class (space-separated, also on a g for everything in it): ink (the default), muted, lapis, terracotta, gold, green, faint colour a shape's outline or a text; fill-lapis, fill-terracotta, fill-gold, fill-green, fill-paper give a shape a pale fill, and solid fills it with its own colour (a dot, a pointer's tail); mono for registers, addresses, values and code, serif for words and names, sans otherwise; bold; small (12 px; text is 14 px otherwise); dashed; arrow puts an arrowhead, in its colour, at the end of a line, polyline or path (it points the way the line is drawn).
Layout: viewBox '0 0 W H' with W 280 to 480 (at most 640 for a wide datapath; a phone shows about 330 px) and H as the content needs (at most 900); one unit is one pixel. Text is never smaller than 12. Give every label its room before drawing around it: it is about 0.6 × size wide per character (mono 0.62: 14 px text 8.7 a character, 12 px 7.4) and size + 4 tall; write dominant-baseline='central' on text (or its g) so y is its middle.
- Inside the viewBox with a margin of 12: text-anchor='start' needs x + width ≤ W − 12, 'end' needs x − width ≥ 12, 'middle' half the width each way.
- In a box: the box at least the text's width + 16 wide and 28 tall, the text centred with text-anchor='middle' at the box's centre; a word that won't fit widens the box or goes beside it, never over its edge.
- Apart: 16 or more between neighbouring labels, measured between their edges, not their anchors; 20 between the lines of a stack.
- Off the lines: no text on a line, wire, arrow or box edge. A wire's label sits beside it, its near edge 4 or more away (over a horizontal wire at y − 12 for 14 px text, or to the side of a vertical one); an arrow's label by its tail. Lines join at box edges; wires run horizontal and vertical.
Look: a calm, flat textbook figure. Thin ink outlines; a pale fill to group or to pick out the part being explained; lapis for what the explanation is about, terracotta for a pointer, a hazard or a second thing; everything else ink or muted. No title inside (the page shows one), no legend unless it is needed, no decoration, shadows, gradients or 3D.
Forms:
- a stack frame: a column of equal rows, high addresses at the top; addresses at the left in small muted mono; values in mono inside; what each slot holds to the right in serif; sp and fp as terracotta arrows pointing at their row from the right; a frame's edge as a bold line with its function's name.
- pointers: each variable a labelled box; a pointer is a solid dot inside its box with an arrow to the box or cell it points at; NULL a diagonal line across the box.
- a datapath: units as rounded rects (register file, memory) or the ALU as a polygon trapezoid; muxes as narrow rounded rects; wires as polylines with arrows; the path in use lapis and bold, the rest muted.
- a memory hierarchy: boxes stacked from registers to disk, wider as they go down; size and latency in small muted text beside each.
- caches and address breakdowns: tag | index | offset as adjacent boxes with their bit widths above; a cache as rows of sets with valid, tag and data columns.
caption: optional, one short sentence under the figure.
Example: ${JSON.stringify(example)}`;

export function validate(input) {
  const raw = object(input, 'spec', 49_152);
  const root = parse(typeof raw.svg === 'string' && raw.svg.trim() ? raw.svg : fail('spec.svg must be the figure as an SVG string'));
  const box = attr(root, 'viewBox')?.split(/[\s,]+/).map(Number) || fail("the <svg> needs a viewBox='0 0 width height'");
  if (box[2] < 200 || box[2] > 720 || box[3] < 40 || box[3] > 1200) fail(`the viewBox is ${box[2]} by ${box[3]}; make it 280 to 640 wide and at most 900 tall`);
  // Every marker a line names is one this figure defines.
  const ids = new Set(), refs = [];
  (function walk(node) {
    if (typeof node === 'string') return;
    for (const [name, value] of node.attrs) if (name === 'id') { if (ids.has(value)) fail(`two markers are named ${value}`); ids.add(value); } else if (ENDS[name]) refs.push(value.slice(5, -1));
    node.kids.forEach(walk);
  })(root);
  for (const ref of refs) if (!ids.has(ref)) fail(`url(#${ref}) names no marker in this figure's defs`);
  return { svg: write(root), caption: clip(str(raw.caption).trim(), 160) };
}

/** The figure as the page draws it, from a validated spec: ids prefixed with `prefix` so two figures never share one,
 *  an arrowhead marker (in its colour) on everything with class arrow; and its viewBox's width and height. */
export function markup(spec, prefix) {
  const root = parse(spec.svg), [, , width, height] = attr(root, 'viewBox').split(/[\s,]+/).map(Number), arrows = new Set();
  (function walk(node, colour) {
    if (typeof node === 'string') return;
    const classes = (attr(node, 'class') || '').split(' ');
    colour = COLOURS.find(c => classes.includes(c)) || colour;
    node.attrs = node.attrs.map(([name, value]) => [name, name === 'id' ? prefix + value : ENDS[name] ? `url(#${prefix}${value.slice(5)}` : value]);
    if (classes.includes('arrow') && ['line', 'polyline', 'path'].includes(node.tag) && !attr(node, 'marker-end')) { arrows.add(colour); node.attrs.push(['marker-end', `url(#${prefix}arrow-${colour})`]); }
    for (const kid of node.kids) walk(kid, colour);
  })(root, 'ink');
  const heads = [...arrows].map(c => ({ tag: 'marker', attrs: [['id', `${prefix}arrow-${c}`], ['viewBox', '0 0 10 10'], ['refX', '8'], ['refY', '5'], ['markerWidth', '9'], ['markerHeight', '9'], ['orient', 'auto-start-reverse'], ['markerUnits', 'userSpaceOnUse'], ['class', c]],
    kids: [{ tag: 'path', attrs: [['d', 'M1 1.2L9 5L1 8.8Z'], ['class', 'solid']], kids: [] }] }));
  if (heads.length) root.kids.unshift({ tag: 'defs', attrs: [], kids: heads });
  root.attrs = [['xmlns', 'http://www.w3.org/2000/svg'], ...root.attrs, ['width', String(width)], ['height', String(height)], ['role', 'img'], ['aria-label', spec.caption || 'Figure']];
  return { svg: write(root), width, height };
}
