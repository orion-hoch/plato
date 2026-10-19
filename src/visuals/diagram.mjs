// Course diagrams as SVG: plot, chart, bars, tree, array, number_line, table, graph, bits, memory, waveform,
// pipeline, kmap and truth_table (schemas in backend/CONTRACTS.md, `show_visual`, and above each new one; the
// interactive formula is formula.mjs). Pure: data in, markup out; malformed data throws a message the agent
// can act on. Drawn in the page's language: no panel, hairline warm ink, marks in lapis, terracotta, gold and
// green, Inter for small labels, the serif for words, monospace for what a machine holds.
import { checks, str, clip } from '../../shared/elements/check.mjs';
import { formulaSpec } from './formula.mjs';

const INK = '#1d1b18', MUTED = '#6f6b64', LINE = '#cfc6b6', FAINT = '#ebe5d9', PAPER = '#fffdf8', SHEET = '#fbf9f4', EDGE = '#9a9183';
// A categorical set checked against the sheet (adjacent pairs separable, colour-blind vision included).
// Series take it in order and never cycle; the tints are the same hues as faint fills.
const HUES = ['#2f4f8a', '#b5653e', '#bfa035', '#2f8a5c'];
const TINTS = ['#e3e8f2', '#f5e4d9', '#f3ebcc', '#dcede3'];
const FAMILY = { sans: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', serif: 'Iowan Old Style, Palatino Linotype, Georgia, serif', mono: 'ui-monospace, SF Mono, Menlo, Consolas, monospace' };
const ADVANCE = { sans: .56, serif: .5, mono: .6 }; // average glyph width in em: the estimate where nothing can measure

const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const { fail, num, int, arr } = checks('diagram');
const n = v => Math.round(v * 10) / 10;
const px = v => Math.round(v) + .5; // a 1px line on the pixel grid
// How wide text is drawn: in the page, measured with its real fonts on a canvas (each string once, at its own size,
// since a system font changes its cut with size); in Node (the server's checks, the tests), estimated from ADVANCE.
const pen = globalThis.document?.createElement('canvas').getContext('2d'), measured = new Map();
export function wide(body, size, font = 'sans', weight = 400, italic = false) {
  body = String(body);
  if (!pen) return body.length * size * ADVANCE[font];
  const key = `${font}${weight}${italic ? 'i' : ''}${size} ${body}`;
  if (!measured.has(key)) {
    if (measured.size > 4000) measured.clear();
    pen.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FAMILY[font]}`;
    measured.set(key, pen.measureText(body).width);
  }
  return measured.get(key);
}
const fmt = v => v.toLocaleString('en-US', { maximumFractionDigits: 3 }).replace('-', '\u2212'); // a true minus sign
// Words in lines no wider than `room` (a longer word keeps a line to itself).
const wrap = (body, size, font, room, weight = 400) => body.split(/\s+/).reduce((lines, word) => {
  if (lines.length && wide(`${lines.at(-1)} ${word}`, size, font, weight) <= room) lines[lines.length - 1] += ` ${word}`; else lines.push(word);
  return lines;
}, []);
// halo: a rim in the sheet's colour (or the colour given) that parts the text from lines under it.
const text = (x, y, body, { size = 12, anchor = 'middle', fill = INK, weight = 400, font = 'sans', italic = false, rotate = 0, halo = false } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${FAMILY[font]}" font-size="${size}"${weight === 400 ? '' : ` font-weight="${weight}"`}${italic ? ' font-style="italic"' : ''}${rotate ? ` transform="rotate(${rotate} ${n(x)} ${n(y)})"` : ''}${halo ? ` stroke="${halo === true ? SHEET : halo}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"` : ''} fill="${fill}" text-anchor="${anchor}" dominant-baseline="central">${esc(body)}</text>`;
// A hairline from a label that had to move aside to the point it names.
const leader = (x1, y1, x2, y2) => `<path d="M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}" fill="none" stroke="${EDGE}"/>`;

// Labels for points along a line (markers, pointers), in a lane beside it: each centred on the x it names, or as near
// as it can be without touching the next (labels that would touch move as one run, centred on what they name), within
// lo … hi. Long labels wrap (never below their longest word) until one row holds them all; failing that, they take
// turns across rows. [{ x, label }] → [{ at (its centre), row, lines, w }]; a row is 14px a line plus 4.
function lanes(list, lo, hi, { size = 12, weight = 400, gap = 10 } = {}) {
  const fit = limit => list.map(({ x, label }) => { const lines = wrap(label, size, 'sans', limit, weight); return { x, lines, w: Math.max(...lines.map(l => wide(l, size, 'sans', weight))) }; });
  let limit = Math.max(...list.map(it => wide(it.label, size, 'sans', weight))), items = fit(limit);
  while (items.reduce((s, it) => s + it.w + gap, -gap) > hi - lo && limit > 40) items = fit(limit -= 8);
  const order = [...items.keys()].sort((a, b) => items[a].x - items[b].x), out = [];
  const rows = Math.max(1, Math.ceil(order.reduce((s, i) => s + items[i].w + gap, -gap) / (hi - lo)));
  const left = run => Math.max(lo, Math.min(hi - run.w, run.ids.reduce((s, i, k) => s + items[i].x - run.offs[k], 0) / run.ids.length));
  for (let row = 0; row < rows; row++) {
    const runs = [];
    for (const i of order.filter((_, k) => k % rows === row)) {
      let run = { ids: [i], offs: [items[i].w / 2], w: items[i].w };
      run.at = left(run);
      while (runs.length && runs.at(-1).at + runs.at(-1).w + gap > run.at) {
        const prev = runs.pop(), shift = prev.w + gap;
        run = { ids: [...prev.ids, ...run.ids], offs: [...prev.offs, ...run.offs.map(o => o + shift)], w: shift + run.w };
        run.at = left(run);
      }
      runs.push(run);
    }
    for (const run of runs) run.ids.forEach((i, k) => { out[i] = { ...items[i], at: run.at + run.offs[k], row }; });
  }
  return out;
}
// The height of a lane's row: its tallest label's lines.
const rowOf = tags => 4 + 14 * Math.max(1, ...tags.map(t => t.lines.length));

function compose(width, height, body, label) {
  const w = Math.ceil(width), h = Math.ceil(height);
  return { width: w, height: h, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">${body.join('')}</svg>` };
}

// Round values covering [lo, hi] in about five steps of 1, 2 or 5 times a power of ten.
function ticks(lo, hi) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / 5, power = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map(m => m * power).find(s => s >= raw);
  const first = Math.floor(lo / step), last = Math.ceil(hi / step);
  return Array.from({ length: last - first + 1 }, (_, i) => +((first + i) * step).toPrecision(12));
}

// A chart of numbers against numbers: lines, dots, steps (each value held until the next x) or bars, on a linear or
// a log2 x axis (ticks at powers of two, 1K = 1024), with dashed markers at chosen x values. Bars stand evenly
// spaced at each distinct x, a group per x when there are several series. plot is the line chart. It narrows to the
// page (down to 260 px) rather than shrinking its type.
// { type: 'line'|'scatter'|'step'|'bar', xLabel, yLabel, xScale: 'linear'|'log2', series: [{ name, points: [[x, y]] }] (1-4),
//   annotations: [{ x, label }] (0-6; on bars, x is one of the bars' x values) }
const CHARTS = ['line', 'scatter', 'step', 'bar'];
const pow2 = v => { const k = Math.log2(v); return Number.isInteger(k) && k >= 10 && k < 50 ? `${2 ** (k % 10)}${'KMGT'[Math.floor(k / 10) - 1]}` : fmt(v); };

function chart(d, width = 640) {
  const kind = d.type ?? 'line', log = d.xScale === 'log2';
  if (!CHARTS.includes(kind)) fail(`type must be one of ${CHARTS.join(', ')}`);
  if (d.xScale != null && d.xScale !== 'linear' && !log) fail('xScale must be "linear" or "log2"');
  const series = arr(d.series, 'series', 1, 4).map((s, i) => ({ name: clip(str(s?.name), 24), points: arr(s?.points, `series[${i}].points`, 1, 500).map(p => Array.isArray(p) && p.length === 2 ? [num(p[0], 'x'), num(p[1], 'y')] : fail('points are [x, y] pairs')) }));
  const marks = (d.annotations == null ? [] : arr(d.annotations, 'annotations', 0, 6)).map((a, i) => ({ x: num(a?.x, `annotations[${i}].x`), label: clip(str(a.label), 24) })).sort((a, b) => a.x - b.x);
  const all = series.flatMap(s => s.points), xLabel = clip(str(d.xLabel), 80), yLabel = clip(str(d.yLabel), 60), xs = [...all.map(p => p[0]), ...marks.map(m => m.x)];
  if (log && xs.some(x => x <= 0)) fail('a log2 x axis needs every x above 0');
  const cats = kind === 'bar' ? [...new Set(all.map(p => p[0]))].sort((a, b) => a - b) : null;
  if (cats?.length > 24) fail('a bar chart has at most 24 distinct x values');
  marks.forEach((m, i) => { if (cats && !cats.includes(m.x)) fail(`annotations[${i}].x must be the x of one of the bars`); });
  const ys = ticks(Math.min(0, ...all.map(p => p[1])), Math.max(0, ...all.map(p => p[1])));
  // A lone series' bars carry their values past their ends: a step more of axis where one would leave the plot.
  if (cats && series.length === 1) {
    const top = Math.max(...all.map(p => p[1])), low = Math.min(...all.map(p => p[1])), step = ys[1] - ys[0];
    if (top > 0 && (ys.at(-1) - top) / (ys.at(-1) - ys[0]) * 194 < 18) ys.push(ys.at(-1) + step);
    if (low < 0 && (low - ys[0]) / (ys.at(-1) - ys[0]) * 194 < 18) ys.unshift(ys[0] - step);
  }
  const [y0, y1] = [ys[0], ys.at(-1)];
  // The axis names wrap: the y name (turned up the side) to the plot's height, the x name to its width.
  const yLines = yLabel ? wrap(yLabel, 12, 'sans', 190) : [];
  const W = Math.round(Math.min(440, Math.max(260, width))), R = 20, L = Math.ceil(Math.max(...ys.map(v => wide(fmt(v), 11)))) + 14 + (yLines.length ? 6 + 16 * yLines.length : 0), room = W - L - R;
  const xLines = xLabel ? wrap(xLabel, 12, 'sans', room) : [];
  // The legend wraps onto as many rows as it needs.
  const legend = [];
  let at = L, row = 0;
  for (const [i, s] of series.entries()) {
    if (!s.name) continue;
    const w = 22 + wide(s.name, 12);
    if (at > L && at + w > W - R) { at = L; row++; }
    legend.push({ i, x: at, y: 18 + row * 24, name: s.name });
    at += w + 20;
  }
  const label = log ? pow2 : fmt;
  let X, xticks;
  if (cats) { X = x => L + (cats.indexOf(x) + .5) * room / cats.length; xticks = cats; }
  else if (log) {
    const k0 = Math.floor(Math.log2(Math.min(...xs))), k1 = Math.max(k0 + 1, Math.ceil(Math.log2(Math.max(...xs))));
    X = x => L + (Math.log2(x) - k0) / (k1 - k0) * room; xticks = Array.from({ length: k1 - k0 + 1 }, (_, i) => 2 ** (k0 + i));
  } else {
    xticks = ticks(Math.min(...xs), Math.max(...xs));
    X = x => L + (x - xticks[0]) / (xticks.at(-1) - xticks[0]) * room;
  }
  // Annotation labels sit in a lane above the plot, each over its line or, when crowded, beside it on a leader.
  const tagged = marks.map((m, i) => ({ i, x: X(m.x), label: m.label })).filter(t => t.label), tags = lanes(tagged, 4, W - 4), lane = rowOf(tags);
  const markRows = tags.length ? 1 + Math.max(...tags.map(t => t.row)) : 0;
  const T = 16 + (legend.length ? 28 + row * 24 : 0) + (markRows ? markRows * lane + 10 : 0), B = xLines.length ? 34 + 16 * xLines.length : 30, H = T + 194 + B;
  const Y = y => H - B - (y - y0) / (y1 - y0) * (H - T - B), body = [];
  for (const v of ys) body.push(`<path d="M${L} ${px(Y(v))}H${W - R}" fill="none" stroke="${v === y0 || v === 0 ? LINE : FAINT}"/>`, text(L - 8, Y(v), fmt(v), { anchor: 'end', size: 11, fill: MUTED }));
  // Every tick is labelled when the labels fit; otherwise every second or third.
  const every = Math.ceil(xticks.length / Math.max(2, Math.floor(room / (Math.max(...xticks.map(v => wide(label(v), 11))) + 14))));
  xticks.forEach((v, i) => { if (i % every === 0) body.push(text(X(v), H - B + 15, label(v), { size: 11, fill: MUTED })); });
  xLines.forEach((line, i) => body.push(text((L + W - R) / 2, H - 13 - (xLines.length - 1 - i) * 16, line)));
  yLines.forEach((line, i) => body.push(text(13 + i * 16, (T + H - B) / 2, line, { rotate: -90 })));
  const tops = marks.map(() => T - 4);
  tagged.forEach((t, k) => {
    const { at, row, lines } = tags[k], y = T - 21 - row * lane;
    lines.forEach((line, j) => body.push(text(at, y - (lines.length - 1 - j) * 14, line)));
    if (Math.abs(at - t.x) < 1) tops[t.i] = y + 9; else body.push(leader(at, y + 9, t.x, T - 4));
  });
  marks.forEach((m, i) => body.push(`<path d="M${px(X(m.x))} ${n(tops[i])}V${H - B}" fill="none" stroke="${MUTED}" stroke-dasharray="3 3"/>`));
  const group = cats && Math.min(room / cats.length * .72, 36 * series.length), bw = cats && group / series.length;
  series.forEach((s, i) => {
    if (cats) {
      for (const [x, y] of new Map(s.points)) {
        body.push(bar(X(x) - group / 2 + i * bw + 1, Y(0), Math.max(1, bw - 2), Y(y), HUES[i]));
        if (series.length === 1 && wide(fmt(y), 11) <= room / cats.length - 4) body.push(text(X(x), Y(y) + (y < 0 ? 11 : -11), fmt(y), { size: 11, fill: MUTED, halo: true }));
      }
      return;
    }
    const ps = s.points.map(([x, y]) => [X(x), Y(y)]), line = ' fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
    if (kind === 'line') body.push(`<polyline points="${ps.map(p => `${n(p[0])},${n(p[1])}`).join(' ')}" stroke="${HUES[i]}"${line}/>`);
    if (kind === 'step') body.push(`<path d="M${ps.map((p, k) => k ? `H${n(p[0])}V${n(p[1])}` : `${n(p[0])} ${n(p[1])}`).join('')}" stroke="${HUES[i]}"${line}/>`);
    if (kind === 'scatter' || ps.length <= 24) for (const [x, y] of ps) body.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${ps.length > 60 ? 3 : 4}" fill="${HUES[i]}" stroke="${SHEET}" stroke-width="1.5"/>`);
  });
  if (cats) body.push(`<path d="M${L} ${px(Y(0))}H${W - R}" fill="none" stroke="${INK}"/>`);
  for (const e of legend) {
    const hue = HUES[e.i];
    body.push(kind === 'scatter' ? `<circle cx="${e.x + 8}" cy="${e.y}" r="4" fill="${hue}"/>` : kind === 'bar' ? `<rect x="${e.x + 2}" y="${e.y - 6}" width="12" height="12" rx="2" fill="${hue}"/>`
      : `<path d="M${e.x} ${e.y}H${e.x + 16}" stroke="${hue}" stroke-width="2.5" stroke-linecap="round"/>`, text(e.x + 22, e.y, e.name, { anchor: 'start' }));
  }
  return compose(W, H, body, `${kind === 'bar' ? 'Bar chart' : 'Chart'}: ${[yLabel, xLabel].filter(Boolean).join(' against ') || series.map(s => s.name).filter(Boolean).join(', ') || 'values'}`);
}

// A bar grows from the baseline with a slightly rounded end; its value sits at the end, its name by the baseline.
const bar = (x, base, w, end, fill) => {
  const r = Math.min(3, Math.abs(end - base), w / 2), dy = end < base ? r : -r;
  return `<path d="M${n(x)} ${n(base)}V${n(end + dy)}Q${n(x)} ${n(end)} ${n(x + r)} ${n(end)}H${n(x + w - r)}Q${n(x + w)} ${n(end)} ${n(x + w)} ${n(end + dy)}V${n(base)}Z" fill="${fill}"/>`;
};

function bars(d, width = 640) {
  const names = arr(d.labels, 'labels', 1, 24).map(v => clip(str(v), 32)), values = arr(d.values, 'values', 1, 24).map((v, i) => num(v, `values[${i}]`));
  if (names.length !== values.length) fail('labels and values must be the same length');
  // A slot is as wide as its value and, when the page has room, its name; a longer name wraps onto lines by its bar.
  const unit = d.unit ? ` ${d.unit}` : '', need = Math.max(52, ...values.map(v => wide(fmt(v) + unit, 11) + 10));
  const slot = Math.ceil(Math.max(need, Math.min(Math.max(...names.map(s => wide(s, 12) + 14)), (width - 32) / values.length)));
  const lines = names.map(s => wrap(s, 12, 'sans', slot - 10)), deep = Math.max(...lines.map(l => l.length)) - 1;
  const top = Math.max(0, ...values), bottom = Math.min(0, ...values), span = top - bottom || 1, W = Math.max(220, slot * values.length + 32), H = 240 + 16 * deep, T = 26, B = (bottom < 0 ? 22 : 30) + 16 * deep;
  const Y = v => T + (top - v) / span * (H - T - B), body = [];
  values.forEach((v, i) => {
    const x = 16 + slot * (i + .5), w = Math.min(36, slot * .6), base = Y(0), end = Y(v);
    body.push(bar(x - w / 2, base, w, end, HUES[0]), text(x, end + (v < 0 ? 11 : -11), `${fmt(v)}${unit}`, { size: 11, fill: MUTED }));
    lines[i].forEach((line, k) => body.push(text(x, v < 0 ? base - 14 - (lines[i].length - 1 - k) * 16 : base + 15 + k * 16, line)));
  });
  body.push(`<path d="M16 ${px(Y(0))}H${W - 16}" fill="none" stroke="${INK}"/>`);
  return compose(W, H, body, `Bar chart: ${names.join(', ')}`);
}

function tree(d, width = 640) {
  if (!d.root || typeof d.root !== 'object') fail('tree needs a root');
  const placed = [];
  let leaves = 0, widest = 0, deepest = 0;
  (function walk(node, depth) {
    if (placed.length >= 63) fail('a tree has at most 63 nodes');
    if (depth > 6) fail('a tree is at most 7 levels deep');
    if (typeof node?.label !== 'string' && typeof node?.label !== 'number') fail('every tree node needs a label');
    const kids = Array.isArray(node.children) ? node.children : [], item = { name: clip(String(node.label), 24), depth, kids: [] };
    placed.push(item);
    widest = Math.max(widest, wide(item.name, 14, 'serif')); deepest = Math.max(deepest, depth);
    if (!kids.length) item.x = leaves++;
    else { item.kids = kids.map(k => walk(k, depth + 1)); item.x = (item.kids[0].x + item.kids.at(-1).x) / 2; }
    return item;
  })(d.root, 0);
  // Boxes as wide as the widest name; when the leaves would be wider than the page, the names wrap (never below their
  // longest word) so the boxes narrow, and every box grows to the most lines.
  const fit = (width - 18) / leaves - 38, lines = placed.map(node => widest > fit ? wrap(node.name, 14, 'serif', Math.max(20, fit)) : [node.name]);
  const box = Math.max(44, Math.ceil(Math.max(...lines.flat().map(s => wide(s, 14, 'serif')))) + 24), half = 15 + 9 * (Math.max(...lines.map(l => l.length)) - 1);
  const pitch = box + 14, X = i => 16 + pitch * (i + .5), Y = depth => 7 + half + depth * (36 + 2 * half), body = [];
  for (const node of placed) for (const kid of node.kids) {
    const x1 = n(X(node.x)), y1 = Y(node.depth) + half, x2 = n(X(kid.x)), y2 = Y(kid.depth) - half, ym = (y1 + y2) / 2;
    body.push(`<path d="M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}" fill="none" stroke="${LINE}" stroke-width="1.5"/>`);
  }
  placed.forEach((node, k) => {
    const root = node.depth === 0;
    body.push(`<rect x="${px(X(node.x) - box / 2)}" y="${px(Y(node.depth) - half)}" width="${box - 1}" height="${2 * half - 1}" rx="8" fill="${root ? '#2a2622' : PAPER}" stroke="${root ? '#2a2622' : LINE}"/>`);
    lines[k].forEach((line, j) => body.push(text(X(node.x), Y(node.depth) + (j - (lines[k].length - 1) / 2) * 18, line, { size: 14, font: 'serif', fill: root ? '#fbf8f2' : INK })));
  });
  return compose(pitch * leaves + 18, Y(deepest) + half + 7, body, `Tree of ${placed.length} nodes`);
}

function array(d) {
  const items = arr(d.items, 'items', 1, 32).map(v => clip(str(v), 18));
  const highlight = new Set((d.highlight === undefined ? [] : arr(d.highlight, 'highlight', 0, 32)).map((v, i) => int(v, `highlight[${i}]`)));
  const pointing = new Map();
  (d.pointers === undefined ? [] : arr(d.pointers, 'pointers', 0, 32)).forEach((p, i) => {
    const index = int(p?.index, `pointers[${i}].index`);
    if (index < 0 || index >= items.length) fail(`pointers[${i}].index must be from 0 to ${items.length - 1}`);
    pointing.set(index, [...(pointing.get(index) || []), clip(str(p.label), 12)].filter(Boolean));
  });
  const cell = Math.ceil(Math.max(40, ...items.map(s => wide(s, 15, 'mono') + 18))), top = 28, h = 40, body = [];
  items.forEach((item, i) => {
    const x = 16 + i * cell;
    if (highlight.has(i)) body.push(`<rect x="${x}" y="${top}" width="${cell}" height="${h}" fill="${TINTS[2]}"/>`, `<path d="M${x + 1} ${top + h - 1.5}h${cell - 2}" stroke="${HUES[2]}" stroke-width="3"/>`);
    body.push(text(x + cell / 2, top + h / 2, item, { size: 15, font: 'mono' }), text(x + cell / 2, top - 12, i, { size: 11, fill: MUTED }));
  });
  if (items.length > 1) body.push(`<path d="${items.slice(1).map((_, i) => `M${px(16 + (i + 1) * cell)} ${top}v${h}`).join('')}" fill="none" stroke="${LINE}"/>`);
  body.push(`<rect x="16.5" y="${top + .5}" width="${items.length * cell - 1}" height="${h - 1}" fill="none" stroke="${INK}"/>`);
  // Each pointer's name sits under its cell with an arrow up to it; crowded names spread along their row (the arrow
  // slants to its cell) or take a second row.
  const named = [...pointing].map(([index, names]) => ({ x: 16 + (index + .5) * cell, label: names.join(', ') }));
  const spots = lanes(named, 4, items.length * cell + 28, { weight: 600 }), lane = rowOf(spots), rows = spots.length ? 1 + Math.max(...spots.map(s => s.row)) : 0;
  named.forEach((p, k) => {
    const { at, row, lines } = spots[k], y = top + h + 42 + row * lane, tip = top + h + 7, len = Math.hypot(p.x - at, tip - y + 11), ux = (p.x - at) / len, uy = (tip - y + 11) / len;
    body.push(`<path d="M${n(at)} ${y - 11}L${n(p.x)} ${tip}M${n(p.x - ux * 6.5 - uy * 4.5)} ${n(tip - uy * 6.5 + ux * 4.5)}L${n(p.x)} ${tip}L${n(p.x - ux * 6.5 + uy * 4.5)} ${n(tip - uy * 6.5 - ux * 4.5)}" fill="none" stroke="${HUES[1]}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`);
    lines.forEach((line, j) => body.push(text(at, y + j * 14, line, { weight: 600 })));
  });
  return compose(items.length * cell + 32, top + h + (rows ? 38 + rows * lane : 12), body, `Array of ${items.length}`);
}

function numberLine(d, width = 640) {
  const min = num(d.min, 'min'), max = num(d.max, 'max');
  if (max <= min) fail('max must be greater than min');
  const inside = (v, what) => v >= min && v <= max ? v : fail(`${what} must be between min and max`);
  const marks = (d.marks === undefined ? [] : arr(d.marks, 'marks', 0, 24)).map((m, i) => ({ value: inside(num(m?.value, `marks[${i}].value`), `marks[${i}].value`), label: clip(str(m.label ?? fmt(m.value)).replace(/^-(?=\d)/, '\u2212'), 24) }));
  const ranges = (d.ranges === undefined ? [] : arr(d.ranges, 'ranges', 0, 4)).map((r, i) => ({ from: inside(num(r?.from, `ranges[${i}].from`), `ranges[${i}].from`), to: inside(num(r?.to, `ranges[${i}].to`), `ranges[${i}].to`), label: clip(str(r.label), 32) }));
  const W = Math.round(Math.min(440, Math.max(260, width))), L = 28, R = 28, X = v => L + (v - min) / (max - min) * (W - L - R);
  // Marks' labels in rows over the axis, each over its dot or, when crowded, beside it on a leader; the ranges' names
  // above them, each centred on its range, a name that would touch another a row higher.
  const tagged = marks.map((m, i) => ({ i, x: X(m.value), label: m.label })).filter(t => t.label), tags = lanes(tagged, 4, W - 4, { weight: 600 }), lane = rowOf(tags);
  const markRows = tags.length ? 1 + Math.max(...tags.map(t => t.row)) : 0;
  const named = ranges.map((r, i) => ({ i, x: (X(r.from) + X(r.to)) / 2, w: r.label ? wide(r.label, 12) : 0 })).filter(t => t.w).sort((a, b) => a.x - b.x), ends = [];
  for (const t of named) { t.at = Math.min(Math.max(t.x, 4 + t.w / 2), W - 4 - t.w / 2); t.row = 0; while (t.at - t.w / 2 < (ends[t.row] ?? -Infinity) + 10) t.row++; ends[t.row] = t.at + t.w / 2; }
  const axis = 22 + markRows * lane + 18 * ends.length, round = ticks(min, max).filter(v => v >= min && v <= max), body = [];
  // The ends are labelled too, unless a round value already sits close by.
  const gap = (round[1] - round[0]) * .4 || Infinity, steps = [...new Set([min, ...round, max])].filter(v => round.includes(v) || round.every(t => Math.abs(t - v) >= gap));
  ranges.forEach((r, i) => {
    const a = X(Math.min(r.from, r.to)), b = X(Math.max(r.from, r.to));
    body.push(`<rect x="${n(a)}" y="${axis - 5}" width="${n(Math.max(b - a, 2))}" height="11" rx="5.5" fill="${HUES[(i + 2) % 4]}" fill-opacity=".35"/>`);
  });
  for (const t of named) body.push(text(t.at, axis - 24 - markRows * lane - 18 * t.row, ranges[t.i].label));
  body.push(`<path d="M${L - 12} ${px(axis)}H${W - R + 12}M${W - R + 7} ${axis - 3.5}L${W - R + 12} ${axis + .5}L${W - R + 7} ${axis + 4.5}M${L - 7} ${axis - 3.5}L${L - 12} ${axis + .5}L${L - 7} ${axis + 4.5}" fill="none" stroke="${INK}"/>`);
  if (max - min <= 24 && Number.isInteger(min) && Number.isInteger(max)) for (let v = min; v <= max; v++) if (!steps.includes(v)) body.push(`<path d="M${px(X(v))} ${axis}v4" fill="none" stroke="${LINE}"/>`);
  for (const v of steps) body.push(`<path d="M${px(X(v))} ${axis}v6" fill="none" stroke="${INK}"/>`, text(X(v), axis + 17, fmt(v), { size: 11, fill: MUTED }));
  for (const m of marks) body.push(`<circle cx="${n(X(m.value))}" cy="${axis + .5}" r="5" fill="${HUES[1]}" stroke="${SHEET}" stroke-width="2"/>`);
  tagged.forEach((t, k) => {
    const { at, row, lines } = tags[k], y = axis - 24 - row * lane;
    lines.forEach((line, j) => body.push(text(at, y - (lines.length - 1 - j) * 14, line, { weight: 600 })));
    if (Math.abs(at - t.x) >= 1) body.push(leader(at, y + 9, t.x, axis - 7));
  });
  return compose(W, axis + 34, body, `Number line from ${min} to ${max}`);
}

function table(d, width = 640) {
  const columns = arr(d.columns, 'columns', 1, 12).map(v => clip(str(v), 40)), rows = arr(d.rows, 'rows', 0, 24);
  rows.forEach((r, i) => { if (!Array.isArray(r) || r.length !== columns.length) fail(`row ${i} must have ${columns.length} cells`); });
  // Columns as wide as their longest entry; on a page too narrow for that, the wide ones give way and their entries
  // wrap onto lines (never narrower than their longest word). A row is as tall as its most lines.
  const cells = [columns, ...rows.map(r => r.map(v => clip(str(v), 60)))], weight = k => k ? 400 : 600;
  const span = (i, measure) => Math.max(48, Math.ceil(Math.max(...cells.map((r, k) => measure(r[i], weight(k)))) + 28));
  const natural = columns.map((_, i) => span(i, (s, w) => wide(s, 14, 'serif', w))), least = columns.map((_, i) => span(i, (s, w) => Math.max(...s.split(/\s+/).map(word => wide(word, 14, 'serif', w)))));
  const over = natural.reduce((a, b) => a + b, 0) + 12 - width, give = natural.reduce((s, w, i) => s + w - least[i], 0);
  const widths = natural.map((w, i) => over > 0 ? Math.ceil(w - (w - least[i]) * Math.min(1, over / give)) : w);
  const lines = cells.map((r, k) => r.map((s, i) => wrap(s, 14, 'serif', widths[i] - 28, weight(k))));
  const tops = lines.reduce((at, r) => [...at, at.at(-1) + 12 + 18 * Math.max(...r.map(l => l.length))], [6]), W = widths.reduce((a, b) => a + b, 0) + 12, bottom = tops.at(-1);
  const mid = widths.map((w, i) => 6 + widths.slice(0, i).reduce((a, b) => a + b, 0) + w / 2);
  const body = [`<path d="M6 ${px(tops[0])}H${W - 6}M6 ${px(tops[1])}H${W - 6}M6 ${px(bottom)}H${W - 6}" fill="none" stroke="#3a362f"/>`, '<g style="font-variant-numeric:tabular-nums">'];
  if (rows.length > 1) body.splice(1, 0, `<path d="${tops.slice(2, -1).map(y => `M6 ${px(y)}H${W - 6}`).join('')}" fill="none" stroke="${FAINT}"/>`);
  lines.forEach((r, k) => r.forEach((cell, i) => cell.forEach((line, j) => body.push(text(mid[i], (tops[k] + tops[k + 1]) / 2 + (j - (cell.length - 1) / 2) * 18, line, { size: 14, font: 'serif', weight: weight(k) })))));
  body.push('</g>');
  return compose(W, bottom + 7, body, `Table: ${columns.join(', ')}`);
}

const arrowhead = (x, y, ux, uy, fill = EDGE) => `<path d="M${n(x)} ${n(y)}L${n(x - ux * 9 - uy * 4.5)} ${n(y - uy * 9 + ux * 4.5)}L${n(x - ux * 9 + uy * 4.5)} ${n(y - uy * 9 - ux * 4.5)}Z" fill="${fill}"/>`;

// A graph (a state machine, a call graph): nodes round a ring; an edge is a line (a pair running both ways bows apart,
// each to its own side), a loop sits on its node's outer side. An edge's label sits beside its line, slid along it
// until it clears the nodes and the labels placed before it. The drawing is sized to all it holds.
function graph(d) {
  const nodes = arr(d.nodes, 'nodes', 1, 16), edges = d.edges === undefined ? [] : arr(d.edges, 'edges', 0, 48);
  const ids = new Map(nodes.map((node, i) => { if (node?.id === undefined || node?.id === null) fail(`nodes[${i}] needs an id`); return [String(node.id), i]; }));
  const names = nodes.map(node => clip(String(node.label ?? node.id), 12)), r = Math.ceil(Math.max(19, ...names.map(s => wide(s, 14, 'serif') / 2 + 9)));
  const ring = nodes.length < 2 ? 0 : Math.max(86, nodes.length * (2 * r + 24) / (2 * Math.PI));
  const at = nodes.map((_, i) => [ring * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / nodes.length), ring * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / nodes.length)]);
  const ends = edges.map((e, k) => {
    const a = ids.get(String(e?.from)), b = ids.get(String(e?.to));
    if (a === undefined || b === undefined) fail(`edges[${k}] must join listed node ids`);
    return [a, b];
  });
  const pairs = new Set(ends.map(([a, b]) => `${a}>${b}`)), body = [], labels = [], taken = [], reach = at.map(([x, y]) => [x - r, y - r, x + r, y + r]);
  // A label's box, and how much it would cover the labels placed so far and the nodes (0 when it is clear).
  const boxOf = (x, y, w) => [x - w / 2 - 2, y - 9, x + w / 2 + 2, y + 9];
  const cover = b => taken.reduce((s, o) => s + Math.max(0, Math.min(b[2], o[2]) - Math.max(b[0], o[0])) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[1], o[1])), 0)
    + at.reduce((s, [x, y]) => s + 40 * Math.max(0, r + 6 - Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]))), 0);
  const put = (x, y, label, w) => { taken.push(boxOf(x, y, w)); labels.push(text(x, y, label, { size: 11, fill: MUTED, halo: true })); };
  // Loops first: each has one place for its label.
  for (const k of [...edges.keys()].sort((i, j) => (ends[j][0] === ends[j][1]) - (ends[i][0] === ends[i][1]))) {
    const e = edges[k], [a, b] = ends[k], [x1, y1] = at[a], [x2, y2] = at[b], label = e.label == null ? '' : clip(String(e.label), 20), w = label ? wide(label, 11) : 0;
    if (a === b) { // a loop on the node's outer side, its label beyond it
      const ox = ring ? x1 / ring : 0, oy = ring ? y1 / ring : -1, s = [x1 + r * (.9 * ox - .44 * oy), y1 + r * (.9 * oy + .44 * ox)], t = [x1 + r * (.9 * ox + .44 * oy), y1 + r * (.9 * oy - .44 * ox)];
      const c1 = [x1 + ox * (r + 34) - oy * 22, y1 + oy * (r + 34) + ox * 22], c2 = [x1 + ox * (r + 34) + oy * 22, y1 + oy * (r + 34) - ox * 22];
      body.push(`<path d="M${n(s[0])} ${n(s[1])}C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(t[0])} ${n(t[1])}" fill="none" stroke="${EDGE}" stroke-width="1.5"/>`);
      reach.push([Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1]), Math.max(c1[0], c2[0]), Math.max(c1[1], c2[1])]);
      const len = Math.hypot(t[0] - c2[0], t[1] - c2[1]);
      if (e.directed) body.push(arrowhead(t[0], t[1], (t[0] - c2[0]) / len, (t[1] - c2[1]) / len));
      if (label) { const out = r + 36 + Math.abs(ox) * w / 2 + Math.abs(oy) * 9; put(x1 + ox * out, y1 + oy * out, label, w); }
      continue;
    }
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, bow = pairs.has(`${b}>${a}`) ? 30 : 0;
    const c = [(x1 + x2) / 2 + uy * bow, (y1 + y2) / 2 - ux * bow], toward = ([x, y], gap) => { const l = Math.hypot(c[0] - x, c[1] - y); return [x + (c[0] - x) / l * gap, y + (c[1] - y) / l * gap]; };
    const s = toward(at[a], r), t = toward(at[b], r + 1), vl = Math.hypot(t[0] - c[0], t[1] - c[1]), v = [(t[0] - c[0]) / vl, (t[1] - c[1]) / vl], cut = e.directed ? 7 : 0;
    body.push(`<path d="M${n(s[0])} ${n(s[1])}Q${n(c[0])} ${n(c[1])} ${n(t[0] - v[0] * cut)} ${n(t[1] - v[1] * cut)}" fill="none" stroke="${EDGE}" stroke-width="1.5"/>`);
    if (e.directed) body.push(arrowhead(t[0], t[1], v[0], v[1]));
    if (!label) continue;
    // Beside the line, on the side it bows to (either side of a straight one): the clear spot nearest the middle, or
    // failing one, the spot that covers least.
    const spots = [3, 16].flatMap(gap => [.5, .38, .62, .28, .72].flatMap(f => {
      const p = [(1 - f) ** 2 * s[0] + 2 * f * (1 - f) * c[0] + f * f * t[0], (1 - f) ** 2 * s[1] + 2 * f * (1 - f) * c[1] + f * f * t[1]];
      const dx = (1 - f) * (c[0] - s[0]) + f * (t[0] - c[0]), dy = (1 - f) * (c[1] - s[1]) + f * (t[1] - c[1]), l = Math.hypot(dx, dy), nx = dy / l, ny = -dx / l;
      const off = (w / 2 + 2) * Math.abs(nx) + 9 * Math.abs(ny) + gap;
      return (bow ? [1] : [-1, 1]).map(side => [p[0] + side * nx * off, p[1] + side * ny * off]);
    })).map(([x, y]) => ({ x, y, cost: cover(boxOf(x, y, w)) }));
    const best = spots.reduce((p, q) => q.cost < p.cost ? q : p);
    put(best.x, best.y, label, w);
  }
  nodes.forEach((_, i) => body.push(`<circle cx="${n(at[i][0])}" cy="${n(at[i][1])}" r="${r}" fill="${PAPER}" stroke="${HUES[0]}" stroke-width="1.5"/>`, text(at[i][0], at[i][1], names[i], { size: 14, font: 'serif' })));
  const all = [...reach, ...taken], x0 = Math.min(...all.map(b => b[0])) - 14, y0 = Math.min(...all.map(b => b[1])) - 14;
  return compose(Math.max(...all.map(b => b[2])) + 14 - x0, Math.max(...all.map(b => b[3])) + 14 - y0, [`<g transform="translate(${n(-x0)} ${n(-y0)})">`, ...body, ...labels, '</g>'], `Graph of ${nodes.length} nodes`);
}

// Bits, most significant first: one row, or rows of 32, 16 or 8 aligned on bit positions (the way a datasheet
// draws a register) when the page is too narrow for one. Groups (indexes counted from the left, inclusive) are
// tinted fields with a bracket and a label below in each row they reach; bit positions sit above field edges.
function bits(d, width) {
  const raw = typeof d.bits === 'string' ? [...d.bits.replace(/[\s_]/g, '')] : Array.isArray(d.bits) ? d.bits.map(String) : fail('bits must be a string of 0s and 1s (most significant first) or a list of 0/1');
  if (raw.length < 1 || raw.length > 64) fail('bits must hold 1 to 64 bits');
  raw.forEach((b, i) => { if (b !== '0' && b !== '1') fail(`bit ${i} is ${JSON.stringify(b)}; every bit must be 0 or 1`); });
  const count = raw.length, caption = clip(str(d.caption).trim(), 160);
  const groups = (d.groups === undefined ? [] : arr(d.groups, 'groups', 0, 32)).map((g, i) => {
    const from = int(g?.from, `groups[${i}].from`), to = int(g?.to, `groups[${i}].to`);
    if (from < 0 || to >= count || from > to) fail(`groups[${i}] needs 0 <= from <= to <= ${count - 1} (bit indexes counted from the left)`);
    return { from, to, label: clip(str(g.label), 24) };
  }).sort((a, b) => a.from - b.from);
  groups.forEach((g, i) => { if (i && g.from <= groups[i - 1].to) fail('groups must not overlap'); });
  // A cell of 16px or more keeps its digit legible, so a row too long for the page wraps rather than shrinks.
  const room = Math.min(width - 16, 576), per = count * 16 <= room ? count : [32, 16, 8].find(p => p < count && p * 16 <= room) || Math.min(count, 8);
  const cell = Math.max(16, Math.min(per < count ? 18 : 34, Math.floor(room / per))), h = Math.max(30, Math.round(cell * 1.2)), size = Math.min(16, Math.round(cell * .66));
  const notes = caption ? wrap(caption, 14, 'serif', Math.min(width, Math.max(per * cell + 16, 420)) - 32) : [];
  const W = Math.ceil(Math.max(per * cell + 16, ...notes.map(s => wide(s, 14, 'serif') + 32))), pad = Math.round((W - per * cell) / 2);
  const X = i => pad + (per - 1 - (count - 1 - i) % per) * cell, field = i => groups.findIndex(g => i >= g.from && i <= g.to), body = [];
  let y = 0;
  for (let from = 0, to; from < count; from = to) {
    to = from + ((count - from) % per || per); // this row holds bits from … to - 1
    const top = y + 24, parts = groups.map((g, k) => ({ label: g.label, k, from: Math.max(g.from, from), to: Math.min(g.to, to - 1) })).filter(p => p.from <= p.to);
    // Up to four fields take the four tints; more alternate two, since the seams already part them.
    for (const p of parts) body.push(`<rect x="${X(p.from)}" y="${top}" width="${(p.to - p.from + 1) * cell}" height="${h}" fill="${TINTS[groups.length > 4 ? p.k % 2 * 2 : p.k]}"/>`);
    // Seams: hairlines between bits, ink between fields (or between nibbles when there are no fields).
    const seams = [[], []];
    for (let i = from + 1; i < to; i++) seams[+(groups.length ? field(i) !== field(i - 1) : (count - i) % 4 === 0)].push(`M${px(X(i))} ${top}v${h}`);
    seams.forEach((path, strong) => { if (path.length) body.push(`<path d="${path.join('')}" fill="none" stroke="${strong ? INK : LINE}"/>`); });
    body.push(`<rect x="${X(from) + .5}" y="${top + .5}" width="${(to - from) * cell - 1}" height="${h - 1}" fill="none" stroke="${INK}"/>`);
    for (let i = from; i < to; i++) {
      body.push(text(X(i) + cell / 2, top + h / 2, raw[i], { size, font: 'mono', fill: raw[i] === '1' ? INK : MUTED, weight: raw[i] === '1' ? 600 : 400 }));
      if (groups.length ? parts.some(p => i === p.from || i === p.to) : to - from <= 16 || (count - i) % 4 === 0 || (count - 1 - i) % 4 === 0) body.push(text(X(i) + cell / 2, y + 11, count - 1 - i, { size: 11, fill: MUTED }));
    }
    // Brackets, each field's label centred under its own. Labels that would touch step down a line each on a leader
    // from their bracket, the text running off to the side with room, as a datasheet labels its flag bits.
    const under = top + h + 5, runs = [];
    let lines = 0;
    for (const p of parts) {
      const a = X(p.from) + 1.5, b = X(p.to) + cell - 1.5, t = { label: p.label, c: (a + b) / 2, w: wide(p.label, 12) }, run = runs.at(-1);
      body.push(`<path d="M${n(a)} ${under}v5H${n(b)}v-5" fill="none" stroke="${MUTED}"/>`);
      if (!p.label) continue;
      // A run reaches as far right as its stairs might run (or its one label's end).
      const reach = run && (run.length > 1 ? Math.max(...run.map(u => u.c + 7 + u.w)) : run[0].c + run[0].w / 2);
      if (run && reach + 8 > t.c - t.w / 2) run.push(t); else runs.push([t]);
    }
    for (const run of runs) {
      if (run.length === 1) { const { label, c, w } = run[0]; body.push(text(Math.min(Math.max(c, w / 2 + 4), W - w / 2 - 4), under + 19, label)); lines = Math.max(lines, 1); continue; }
      const right = run.every(t => t.c + 7 + t.w <= W - 4) || !run.every(t => t.c - 7 - t.w >= 4), side = right ? 1 : -1;
      run.forEach((t, k) => {
        const line = right ? run.length - 1 - k : k, ly = under + 19 + line * 16;
        body.push(`<path d="M${n(t.c)} ${under + 5}V${ly}h${3 * side}" fill="none" stroke="${EDGE}"/>`, text(t.c + 7 * side, ly, t.label, { anchor: right ? 'start' : 'end' }));
        lines = Math.max(lines, line + 1);
      });
    }
    y = (lines ? under + 29 + (lines - 1) * 16 : parts.length ? under + 12 : top + h + 8) + (to < count ? 14 : 0);
  }
  notes.forEach((line, i) => body.push(text(W / 2, y + 14 + i * 18, line, { size: 14, font: 'serif', italic: true, fill: MUTED })));
  return compose(W, y + (notes.length ? 12 + notes.length * 18 : 0), body, `${count} bits ${raw.join('')}${groups.length ? `: ${groups.map(g => g.label).filter(Boolean).join(', ')}` : ''}`);
}

// Memory as rows top to bottom: address | value | label, with pointers (sp, fp, …) pointing at rows from the side.
function memory(d, width) {
  const cells = arr(d.cells, 'cells', 1, 32).map((c, i) => {
    if (!c || typeof c !== 'object') fail(`cells[${i}] must be an object like {"address": "0x7ff0", "value": "42", "label": "x"}`);
    if (c.value === undefined || c.value === null) fail(`cells[${i}].value is required ("" for an empty slot)`);
    return { address: clip(str(c.address), 18), value: clip(str(c.value), 20), label: clip(str(c.label), 24) };
  });
  const pointing = new Map();
  (d.pointers === undefined ? [] : arr(d.pointers, 'pointers', 0, 16)).forEach((p, i) => {
    const row = int(p?.at, `pointers[${i}].at`);
    if (row < 0 || row >= cells.length) fail(`pointers[${i}].at must be a row from 0 to ${cells.length - 1}`);
    pointing.set(row, [...(pointing.get(row) || []), clip(str(p.label), 12)].filter(Boolean));
  });
  const caption = clip(str(d.caption).trim(), 160), rh = 30, top = 8;
  const widest = (list, size, font) => Math.ceil(Math.max(0, ...list.map(s => wide(s, size, font))));
  const addressW = widest(cells.map(c => c.address), 12, 'mono'), boxW = Math.max(84, widest(cells.map(c => c.value), 14, 'mono') + 28);
  const labelW = widest(cells.map(c => c.label), 14, 'serif'), pointerW = widest([...pointing.values()].map(names => names.join(', ')), 12);
  const left = 16 + (addressW ? addressW + 12 : 0), labelX = left + boxW + 12, arrowX = labelX + (labelW ? labelW + 14 : 0), pointerX = arrowX + 30;
  const drawn = pointing.size ? pointerX + pointerW + 16 : labelW ? labelX + labelW + 16 : left + boxW + 16;
  const notes = caption ? wrap(caption, 14, 'serif', Math.min(width, Math.max(drawn, 420)) - 32) : [];
  const W = Math.max(drawn, ...notes.map(s => wide(s, 14, 'serif') + 32)), bottom = top + cells.length * rh;
  const body = [`<rect x="${left + .5}" y="${top + .5}" width="${boxW - 1}" height="${cells.length * rh - 1}" fill="${PAPER}" stroke="${INK}"/>`];
  if (cells.length > 1) body.push(`<path d="${cells.slice(1).map((_, r) => `M${left} ${px(top + (r + 1) * rh)}h${boxW}`).join('')}" fill="none" stroke="${LINE}"/>`);
  // A page that points at cells names each row (anchors: one id per cell, for point_to).
  const ids = Array.isArray(d.anchors) ? d.anchors.map(id => clip(str(id), 80)) : [];
  cells.forEach((c, r) => {
    const y = top + (r + .5) * rh;
    if (ids[r]) body.push(`<rect data-anchor="${esc(ids[r])}" x="${left}" y="${top + r * rh}" width="${boxW}" height="${rh}" fill="none"/>`);
    if (c.address) body.push(text(left - 12, y, c.address, { anchor: 'end', font: 'mono', fill: MUTED }));
    body.push(text(left + boxW / 2, y, c.value, { size: 14, font: 'mono' }));
    if (c.label) body.push(text(labelX, y, c.label, { anchor: 'start', size: 14, font: 'serif', italic: true }));
    if (!pointing.has(r)) return;
    const tip = c.label ? arrowX : left + boxW + 6; // up to the row's label, or to the box itself
    body.push(`<path d="M${pointerX - 6} ${px(y)}H${tip + 1}M${tip + 6} ${n(y - 4)}L${tip + 1} ${px(y)}L${tip + 6} ${n(y + 5)}" fill="none" stroke="${HUES[1]}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`, text(pointerX, y, pointing.get(r).join(', '), { anchor: 'start', weight: 600 }));
  });
  notes.forEach((line, i) => body.push(text(W / 2, bottom + 20 + i * 18, line, { size: 14, font: 'serif', italic: true, fill: MUTED })));
  return compose(W, bottom + (notes.length ? 18 + notes.length * 18 : 8), body, `Memory: ${cells.map(c => [c.address, c.value, c.label].filter(Boolean).join(' ')).join('; ')}`);
}

// A timing diagram: one row per signal against numbered clock cycles. A bit signal is a line between its 0 and 1
// levels (a 1 lightly tinted); a bus is a band holding its value, crossed where the value changes; x is unknown (a
// pale band) and z floats midway. A signal named clk with no values is the clock, rising at the start of every
// cycle. A marker is a dashed line at the start of a cycle (3.5 is the middle of cycle 3), its label in a lane
// under the signals.
// { cycles, signals: [{ name, values: "0110x.z" (a character per cycle; "." repeats the one before) or
//   ["0x3", "0x3", "x", "0x4"] (a bus: a value per cycle, "x" or "" unknown) }] (1-12), markers: [{ at, label }] (0-8) }
function waveform(d, width = 640) {
  const signals = arr(d.signals, 'signals', 1, 12).map((s, i) => {
    const name = clip(str(s?.name).trim(), 16) || fail(`signals[${i}] needs a name`), v = s.values;
    if (v == null || v === '') return /^clk$/i.test(name) ? { name, clock: true } : fail(`signals[${i}] (${name}) needs values`);
    if (typeof v === 'string' || (Array.isArray(v) && v.every(b => [0, 1, '0', '1'].includes(b)))) {
      const bits = [];
      for (const c of typeof v === 'string' ? v.replace(/[\s_|]/g, '').toLowerCase() : v.map(String)) {
        if (c === '.') bits.push(bits.length ? bits.at(-1) : fail(`signals[${i}] (${name}) can't start with "."`));
        else bits.push('01xz'.includes(c) ? c : fail(`signals[${i}] (${name}) has ${JSON.stringify(c)}; a bit signal is 0, 1, x, z and "." (repeat), and a bus is a list of values`));
      }
      return { name, bits };
    }
    return { name, bus: arr(v, `signals[${i}].values`, 1, 32).map(b => { const t = clip(str(b).trim(), 12); return t === '' || /^x$/i.test(t) ? null : t; }) };
  });
  const lengths = signals.filter(s => !s.clock).map(s => (s.bits || s.bus).length);
  const cycles = d.cycles == null ? (lengths.length ? Math.max(...lengths) : fail('give cycles when the only signal is the clock')) : int(d.cycles, 'cycles', 1, 32);
  if (cycles > 32) fail('at most 32 cycles');
  signals.forEach((s, i) => { const k = (s.bits || s.bus)?.length; if (k !== undefined && k !== cycles) fail(`signals[${i}] (${s.name}) has ${k} values; give one per cycle (${cycles})`); });
  const marks = (d.markers == null ? [] : arr(d.markers, 'markers', 0, 8)).map((m, i) => ({ at: num(m?.at, `markers[${i}].at`, 1, cycles + 1), label: clip(str(m.label), 24) })).sort((a, b) => a.at - b.at);
  // A cycle is as wide as the page allows (24 to 56 px), and wide enough for a value held for only one cycle.
  const left = 30 + Math.ceil(Math.max(...signals.map(s => wide(s.name, 12, 'mono'))));
  const single = signals.flatMap(s => (s.bus || []).filter((b, c, list) => b !== null && b !== list[c - 1] && b !== list[c + 1]).map(b => wide(b, 11, 'mono') + 14));
  const cw = Math.floor(Math.max(Math.min(56, Math.max(24, (width - left - 16) / cycles)), Math.min(100, Math.max(0, ...single))));
  const X = c => left + c * cw, W = X(cycles) + 16, cuts = marks.map(m => X(m.at - 1)), top = 8, rowsTop = top + 20, bottom = rowsTop + signals.length * 36;
  // Marker labels in a lane under the signals, each under its line or, when crowded, beside it on a leader.
  const tagged = marks.map((m, i) => ({ i, x: cuts[i], label: m.label })).filter(t => t.label), tags = lanes(tagged, 4, W - 4, { weight: 600 }), lane = rowOf(tags);
  const markRows = tags.length ? 1 + Math.max(...tags.map(t => t.row)) : 0, ends = marks.map(() => bottom + 4), values = [];
  const body = [`<path d="${Array.from({ length: cycles + 1 }, (_, c) => `M${px(X(c))} ${rowsTop - 4}V${bottom}`).join('')}" fill="none" stroke="${FAINT}"/>`];
  for (let c = 0; c < cycles; c++) body.push(text(X(c) + cw / 2, top + 7, c + 1, { size: 11, fill: MUTED }));
  signals.forEach((s, k) => {
    const mid = rowsTop + k * 36 + 18, hi = mid - 10, lo = mid + 10, line = `fill="none" stroke="${HUES[0]}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"`;
    body.push(text(left - 14, mid, s.name, { anchor: 'end', font: 'mono' }));
    if (s.clock) {
      let path = `M${X(0)} ${lo}`;
      for (let c = 0; c < cycles; c++) path += `V${hi}H${n(X(c) + cw / 2)}V${lo}H${X(c + 1)}`;
      body.push(`<path d="${path}" fill="none" stroke="${MUTED}" stroke-width="1.5" stroke-linejoin="round"/>`);
      return;
    }
    const runs = [];
    (s.bits || s.bus).forEach((v, c, list) => { if (c && v === list[c - 1]) runs.at(-1).to = c + 1; else runs.push({ v, from: c, to: c + 1 }); });
    if (s.bus) {
      for (const r of runs) {
        const x0 = X(r.from), x1 = X(r.to), e = Math.min(4, (x1 - x0) / 4);
        body.push(`<path d="M${x0} ${mid}L${x0 + e} ${hi}H${x1 - e}L${x1} ${mid}L${x1 - e} ${lo}H${x0 + e}Z" fill="${r.v === null ? FAINT : PAPER}" stroke="${HUES[0]}" stroke-width="1.5" stroke-linejoin="round"/>`);
        const w = r.v === null ? Infinity : wide(r.v, 11, 'mono');
        if (w > x1 - x0 - 2 * e - 2) continue;
        // The value sits in the widest stretch of its band no marker crosses, when it fits there; else it is
        // centred, haloed over the marker.
        const stops = [x0 + e, ...cuts.filter(x => x > x0 + e && x < x1 - e).sort((a, b) => a - b), x1 - e];
        const [a, b] = stops.slice(1).map((s, k) => [stops[k], s]).reduce((p, q) => q[1] - q[0] > p[1] - p[0] ? q : p);
        values.push(text(w + 10 <= b - a ? (a + b) / 2 : (x0 + x1) / 2, mid, r.v, { size: 11, font: 'mono', halo: PAPER }));
      }
      return;
    }
    let path = '';
    runs.forEach((r, j) => {
      const x0 = X(r.from), x1 = X(r.to), y = { 1: hi, 0: lo, z: mid }[r.v];
      if (r.v === 'x' || r.v === '1') body.push(`<rect x="${x0}" y="${hi}" width="${x1 - x0}" height="${lo - hi}" fill="${r.v === 'x' ? FAINT : TINTS[0]}"/>`);
      if (r.v === 'x') { path += `M${x0} ${hi}H${x1}M${x0} ${lo}H${x1}`; return; }
      path += j && runs[j - 1].v !== 'x' ? `V${y}H${x1}` : `M${x0} ${y}H${x1}`;
    });
    body.push(`<path d="${path}" ${line}/>`);
  });
  tagged.forEach((t, k) => {
    const { at, row, lines } = tags[k], y = bottom + 22 + row * lane;
    lines.forEach((line, j) => body.push(text(at, y + j * 14, line, { weight: 600 })));
    if (Math.abs(at - t.x) < 1) ends[t.i] = y - 9; else body.push(leader(t.x, bottom + 4, at, y - 9));
  });
  marks.forEach((m, i) => body.push(`<path d="M${px(cuts[i])} ${rowsTop - 6}V${ends[i]}" fill="none" stroke="${HUES[1]}" stroke-width="1.5" stroke-dasharray="4 3"/>`));
  return compose(W, markRows ? bottom + 14 + markRows * lane : bottom + 8, [...body, ...values], `Timing diagram over ${cycles} cycles: ${signals.map(s => s.name).join(', ')}`);
}

// A pipeline diagram: instructions (rows, in program order) against clock cycles (columns, numbered from 1). A row
// enters the first stage in its start cycle and moves on a stage each cycle; in a cycle listed in its stalls it holds
// the stage it is in (drawn dashed). A hazard is an arrow from one row's cell to another's (forwarding, or a value
// needed before it exists), with a short label.
// { stages: ['IF', 'ID', 'EX', 'MEM', 'WB'] (the default; 2-8), rows: [{ label, start, stalls: [cycle] }] (1-12),
//   hazards: [{ fromRow, fromCycle, toRow, toCycle, label }] (0-12; rows counted from 0, cycles from 1) }
function pipeline(d, width = 640) {
  const stages = d.stages == null ? ['IF', 'ID', 'EX', 'MEM', 'WB'] : arr(d.stages, 'stages', 2, 8).map((s, i) => clip(str(s).trim(), 5) || fail(`stages[${i}] needs a name`));
  const rows = arr(d.rows, 'rows', 1, 12).map((r, i) => {
    const start = int(r?.start, `rows[${i}].start`, 1, 24), stalls = (r.stalls == null ? [] : arr(r.stalls, `rows[${i}].stalls`, 0, 12)).map((c, k) => int(c, `rows[${i}].stalls[${k}]`, 1, 40)), cells = [];
    for (let c = start, s = 0; s < stages.length; c++) cells.push(stalls.includes(c) ? { c, stage: stages[s - 1] ?? fail(`rows[${i}] stalls in cycle ${c}, its start; a stall holds the stage it is already in`), stall: true } : { c, stage: stages[s++] });
    stalls.forEach(c => { if (!cells.some(x => x.c === c)) fail(`rows[${i}].stalls has cycle ${c}, when it isn't in the pipeline (cycles ${start} to ${cells.at(-1).c})`); });
    return { label: clip(str(r.label).trim(), 28), cells };
  });
  const last = Math.max(...rows.map(r => r.cells.at(-1).c));
  if (last > 30) fail(`the rows run to cycle ${last}; keep the diagram within 30 cycles`);
  const hazards = (d.hazards == null ? [] : arr(d.hazards, 'hazards', 0, 12)).map((h, i) => {
    const at = `hazards[${i}]`, from = [int(h?.fromRow, `${at}.fromRow`, 0, rows.length - 1), int(h.fromCycle, `${at}.fromCycle`, 1, last)], to = [int(h.toRow, `${at}.toRow`, 0, rows.length - 1), int(h.toCycle, `${at}.toCycle`, 1, last)];
    for (const [r, c] of [from, to]) if (!rows[r].cells.some(x => x.c === c)) fail(`${at} points at row ${r} in cycle ${c}, where that row is in no stage`);
    return { from, to, label: clip(str(h.label).trim(), 20) };
  });
  const labelW = Math.ceil(Math.max(0, ...rows.map(r => wide(r.label, 12, 'mono')))), left = 16 + (labelW ? labelW + 14 : 0), rh = 32, top = 24;
  const cw = Math.floor(Math.min(48, Math.max(30, ...stages.map(s => wide(s, 11, 'sans', 600) + 10), (width - left - 16) / last)));
  // A hazard's label has a lane of its own between the row its arrow leaves and the next row the arrow passes
  // (under the row for an arrow down, over it for one up), just right of the arrow, never on a stage. A lane takes
  // another line when its labels would touch, so each stays by its own arrow (laid out again till the lanes settle).
  const laneOf = h => h.to[0] >= h.from[0] ? h.from[0] : h.from[0] - 1, X = c => left + (c - 1) * cw;
  let depth = new Map(hazards.filter(h => h.label).map(h => [laneOf(h), 1])), Y, arrows, tags;
  for (let pass = 0; pass < 4; pass++) {
    Y = r => top + r * rh + [...depth].reduce((s, [k, d]) => s + (k < r ? 4 + 16 * d : 0), 0);
    // A gentle curve from the bottom (or top) edge of one cell to the top (or bottom) edge of the other, bowed aside.
    arrows = hazards.map(h => {
      const { from: [r0, c0], to: [r1, c1] } = h, down = r1 >= r0, x0 = X(c0) + cw / 2, y0 = Y(r0) + (down ? rh - 3 : 3), x1 = X(c1) + cw / 2, y1 = Y(r1) + (down ? 3 : rh - 3);
      const mx = (x0 + x1) / 2 + (y1 - y0) * .2, my = (y0 + y1) / 2 - (x1 - x0) * .2, at = t => [(1 - t) ** 2 * x0 + 2 * t * (1 - t) * mx + t * t * x1, (1 - t) ** 2 * y0 + 2 * t * (1 - t) * my + t * t * y1];
      return { h, x0, y0, x1, y1, mx, my, curve: Array.from({ length: 33 }, (_, k) => at(k / 32)) };
    });
    // Where the curve passes a line of the lane, the label starts 6px right of it.
    const beside = (a, y) => { const near = a.curve.filter(p => Math.abs(p[1] - y) <= 9).map(p => p[0]); return (near.length ? Math.max(...near) : (a.x0 + a.x1) / 2) + 6; };
    const ends = new Map(), next = new Map();
    tags = arrows.filter(a => a.h.label).sort((a, b) => beside(a, Y(laneOf(a.h)) + rh + 10) - beside(b, Y(laneOf(b.h)) + rh + 10)).map(a => {
      const lane = laneOf(a.h), w = wide(a.h.label, 11, 'sans', 600), used = ends.get(lane) || [];
      let line = 0, y, x;
      for (; ; line++) { y = Y(lane) + rh + 10 + line * 16; x = beside(a, y); if (x >= (used[line] ?? -Infinity) + 8) break; }
      used[line] = x + w; ends.set(lane, used); next.set(lane, Math.max(next.get(lane) || 0, line + 1));
      return { x, y, w, label: a.h.label };
    });
    if (pass === 3 || [...next].every(([k, d]) => depth.get(k) === d)) break;
    depth = next;
  }
  const bottom = Y(rows.length - 1) + rh + (depth.has(rows.length - 1) ? 4 + 16 * depth.get(rows.length - 1) : 0), labels = [];
  const body = [`<path d="${Array.from({ length: last + 1 }, (_, c) => `M${px(X(c + 1))} ${top}V${bottom}`).join('')}" fill="none" stroke="${FAINT}"/>`];
  for (let c = 1; c <= last; c++) body.push(text(X(c) + cw / 2, 11, c, { size: 11, fill: MUTED }));
  // Stage names go over the arrows, haloed in their cell's tint, so an arrow passing a stage passes under its name.
  rows.forEach((r, i) => {
    if (r.label) body.push(text(left - 14, Y(i) + rh / 2, r.label, { anchor: 'end', font: 'mono' }));
    for (const x of r.cells) body.push(x.stall ? `<rect x="${X(x.c) + 2.5}" y="${Y(i) + 3.5}" width="${cw - 5}" height="${rh - 7}" rx="5" fill="none" stroke="${EDGE}" stroke-dasharray="3 2"/>`
      : `<rect x="${X(x.c) + 2}" y="${Y(i) + 3}" width="${cw - 4}" height="${rh - 6}" rx="5" fill="${TINTS[0]}"/>`);
    for (const x of r.cells) labels.push(text(X(x.c) + cw / 2, Y(i) + rh / 2, x.stage, { size: 11, weight: 600, fill: x.stall ? MUTED : INK, halo: x.stall ? true : TINTS[0] }));
  });
  for (const { x0, y0, x1, y1, mx, my } of arrows) {
    const len = Math.hypot(x1 - mx, y1 - my) || 1, ux = (x1 - mx) / len, uy = (y1 - my) / len;
    body.push(`<path d="M${n(x0)} ${n(y0)}Q${n(mx)} ${n(my)} ${n(x1 - ux * 7)} ${n(y1 - uy * 7)}" fill="none" stroke="${HUES[1]}" stroke-width="1.75" stroke-linecap="round"/>`, arrowhead(x1, y1, ux, uy, HUES[1]));
  }
  for (const t of tags) labels.push(text(t.x, t.y, t.label, { anchor: 'start', size: 11, weight: 600, halo: true }));
  const right = Math.max(X(last + 1) + 16, ...tags.map(t => t.x + t.w + 8));
  return compose(right, bottom + 8, [...body, ...labels], `Pipeline of ${rows.length} instruction${rows.length > 1 ? 's' : ''} over ${last} cycles`);
}

// A Karnaugh map of 2 to 4 variables: the first half name the rows and the rest the columns, each axis in Gray code
// (00 01 11 10). values reads the map row by row as drawn (0, 1, or x for don't care); each cell shows its minterm
// number in its corner. A group outlines a rectangle of 1, 2, 4, 8 or 16 cells, given by their indexes in values (it
// may wrap around an edge, and is drawn open there), each in the next colour, its label (its term) listed below.
// { vars: ['A', 'B', 'C', 'D'] (2-4), values: '1001 0110 0110 1001', groups: [{ cells: [5, 6, 9, 10], label: 'BD' }] (0-8) }
const GRAY = [[0, 1], [0, 1, 3, 2]];
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
// Where a run of a power of two (wrapping round) starts in 0 … size-1, or -1 when the set is no such run.
const run = (set, size) => set.length & (set.length - 1) ? -1 : [...Array(size).keys()].find(s => set.every(i => (i - s + size) % size < set.length)) ?? -1;
// A run as one or two pieces [from, to, open at its start, open at its end] (a run that wraps is open where it leaves the map).
const pieces = ([start, length], size) => start + length <= size ? [[start, start + length, false, false]] : [[start, size, false, true], [0, start + length - size, true, false]];

function kmap(d) {
  const vars = arr(d.vars, 'vars', 2, 4).map((v, i) => clip(str(v).trim(), 6) || fail(`vars[${i}] needs a name`));
  const rb = vars.length >> 1, nr = 2 ** rb, nc = 2 ** (vars.length - rb), count = nr * nc, size = 46;
  const raw = typeof d.values === 'string' ? [...d.values.replace(/[\s_,|]/g, '')] : Array.isArray(d.values) ? d.values.map(str) : fail('values must be a string of 0, 1 and x, row by row as the map is drawn');
  if (raw.length !== count) fail(`values needs ${count} cells (${nr} rows of ${nc}, row by row as drawn), not ${raw.length}`);
  const cells = raw.map((v, i) => ['0', '1'].includes(v) ? v : /^[x-]$/i.test(v) ? 'x' : fail(`values[${i}] is ${JSON.stringify(v)}; use 0, 1 or x`));
  const groups = (d.groups == null ? [] : arr(d.groups, 'groups', 0, 8)).map((g, k) => {
    const list = [...new Set(arr(g?.cells, `groups[${k}].cells`, 1, count).map((c, j) => int(c, `groups[${k}].cells[${j}]`, 0, count - 1)))];
    list.forEach(c => { if (cells[c] === '0') fail(`groups[${k}] takes cell ${c}, which is 0; a group covers only 1s and xs`); });
    const rs = [...new Set(list.map(c => Math.floor(c / nc)))], cs = [...new Set(list.map(c => c % nc))], r0 = run(rs, nr), c0 = run(cs, nc);
    if (r0 < 0 || c0 < 0 || rs.length * cs.length !== list.length) fail(`groups[${k}] must be a rectangle of 1, 2, 4, 8 or 16 cells (it may wrap around the edges); cells ${list.join(', ')} are not one`);
    return { rows: [r0, rs.length], cols: [c0, cs.length], label: clip(str(g.label).trim(), 24) };
  });
  const join = names => names.join(names.every(v => v.length === 1) ? '' : ','), rowName = join(vars.slice(0, rb)), colName = join(vars.slice(rb));
  // The corner's diagonal parts the columns' name (above it) from the rows' (below): wide enough for both (a long
  // column name widens it, so it needn't grow tall) and tall enough that the line clears both.
  const wr = wide(rowName, 14, 'serif', 400, true), wc = wide(colName, 14, 'serif', 400, true), corner = Math.ceil(Math.max(34, wr + 24, 1.7 * (wc + 2)));
  const rise = Math.ceil(Math.max(34, 17 * corner / (corner - 2 - wc), 16 * corner / (corner - 2 - wr))), mx = 16 + corner, my = 16 + rise;
  const gray = (i, bits) => GRAY[bits - 1][i].toString(2).padStart(bits, '0'), minterm = i => GRAY[rb - 1][Math.floor(i / nc)] << (vars.length - rb) | GRAY[vars.length - rb - 1][i % nc];
  const body = [`<path d="M${mx - corner} ${my - rise}L${mx} ${my}" fill="none" stroke="${LINE}"/>`, text(mx - 2, my - rise + 8, colName, { anchor: 'end', size: 14, font: 'serif', italic: true }), text(mx - corner + 2, my - 7, rowName, { anchor: 'start', size: 14, font: 'serif', italic: true })];
  for (let c = 0; c < nc; c++) body.push(text(mx + (c + .5) * size, my - 11, gray(c, vars.length - rb), { size: 12, font: 'mono', fill: MUTED }));
  for (let r = 0; r < nr; r++) body.push(text(mx - 9, my + (r + .5) * size, gray(r, rb), { anchor: 'end', size: 12, font: 'mono', fill: MUTED }));
  const seams = [...Array(nc - 1).keys()].map(c => `M${px(mx + (c + 1) * size)} ${my}v${nr * size}`).concat([...Array(nr - 1).keys()].map(r => `M${mx} ${px(my + (r + 1) * size)}h${nc * size}`));
  body.push(`<path d="${seams.join('')}" fill="none" stroke="${LINE}"/>`);
  // Groups are clipped to the map, so one that wraps round runs open off its edge. Each is inset a little more than
  // the one before, so two that share cells stay apart; the cells' numbers sit over them, haloed.
  const id = `kmap-${hash(JSON.stringify([vars, cells, groups]))}`, outlines = [];
  groups.forEach((g, k) => {
    const inset = 5 + (k % 3) * 3;
    for (const [r0, r1, openTop, openBottom] of pieces(g.rows, nr)) for (const [c0, c1, openLeft, openRight] of pieces(g.cols, nc)) {
      const x0 = mx + c0 * size + (openLeft ? -14 : inset), x1 = mx + c1 * size - (openRight ? -14 : inset), y0 = my + r0 * size + (openTop ? -14 : inset), y1 = my + r1 * size - (openBottom ? -14 : inset);
      outlines.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="${n(Math.min(12, (x1 - x0) / 2, (y1 - y0) / 2))}" fill="none" stroke="${HUES[k % 4]}" stroke-width="2"/>`);
    }
  });
  if (outlines.length) body.push(`<clipPath id="${id}"><rect x="${mx}" y="${my}" width="${nc * size}" height="${nr * size}"/></clipPath><g clip-path="url(#${id})">${outlines.join('')}</g>`);
  cells.forEach((v, i) => {
    const x = mx + (i % nc) * size, y = my + Math.floor(i / nc) * size;
    body.push(text(x + 5, y + 10, minterm(i), { anchor: 'start', size: 11, fill: EDGE, halo: true }), text(x + size / 2, y + size / 2 + 1, v, { size: 17, font: 'mono', weight: v === '1' ? 600 : 400, fill: v === '1' ? INK : MUTED }));
  });
  body.push(`<rect x="${mx + .5}" y="${my + .5}" width="${nc * size - 1}" height="${nr * size - 1}" fill="none" stroke="${INK}"/>`);
  // The groups' terms below the map, each beside a swatch of its outline, wrapping to the map's width.
  const named = groups.map((g, k) => ({ k, label: g.label, w: 26 + wide(g.label, 15, 'serif', 400, true) })).filter(g => g.label), right = Math.max(mx + nc * size, 220, ...named.map(g => mx - corner + g.w));
  let x = mx - corner, y = my + nr * size + 26;
  for (const g of named) {
    const { w } = g;
    if (x > mx - corner && x + w > right) { x = mx - corner; y += 24; }
    body.push(`<rect x="${x + .5}" y="${y - 5.5}" width="16" height="11" rx="4" fill="none" stroke="${HUES[g.k % 4]}" stroke-width="2"/>`, text(x + 24, y, g.label, { anchor: 'start', size: 15, font: 'serif', italic: true }));
    x += w + 18;
  }
  return compose(Math.max(mx + nc * size + 16, right + 16), named.length ? y + 16 : my + nr * size + 12, body, `Karnaugh map of ${vars.join(', ')}${named.length ? `, grouped as ${named.map(g => g.label).join(' + ')}` : ''}`);
}

// A truth table: every combination of the inputs in binary order (the first input is the most significant bit), then
// the outputs, their 1s in lapis. A rule sets the outputs off from the inputs; a long table is banded in fours.
// { inputs: ['A', 'B', 'Cin'] (1-5), outputs: [{ name: 'S', values: '01101001' }] (1-6; a 0, 1 or x per row) }
function truthTable(d) {
  const inputs = arr(d.inputs, 'inputs', 1, 5).map((v, i) => clip(str(v).trim(), 8) || fail(`inputs[${i}] needs a name`)), count = 2 ** inputs.length;
  const outputs = arr(d.outputs, 'outputs', 1, 6).map((o, i) => {
    const name = clip(str(o?.name).trim(), 10) || fail(`outputs[${i}] needs a name`);
    const raw = typeof o.values === 'string' ? [...o.values.replace(/[\s_,|]/g, '')] : Array.isArray(o.values) ? o.values.map(str) : fail(`outputs[${i}].values must be a string of 0, 1 and x, one per row`);
    if (raw.length !== count) fail(`outputs[${i}] (${name}) needs ${count} values, one per row of ${inputs.length} input${inputs.length > 1 ? 's' : ''}, not ${raw.length}`);
    return { name, values: raw.map((v, k) => ['0', '1'].includes(v) ? v : /^[x-]$/i.test(v) ? 'x' : fail(`outputs[${i}] (${name}) row ${k} is ${JSON.stringify(v)}; use 0, 1 or x`)) };
  });
  const names = [...inputs, ...outputs.map(o => o.name)], widths = names.map(s => Math.ceil(Math.max(36, wide(s, 15, 'serif') + 22)));
  const rh = 24, head = 32, top = 6, W = widths.reduce((a, b) => a + b, 0) + 12, bottom = top + head + count * rh;
  const mid = widths.map((w, i) => 6 + widths.slice(0, i).reduce((a, b) => a + b, 0) + w / 2), split = 6 + widths.slice(0, inputs.length).reduce((a, b) => a + b, 0);
  const body = [`<path d="M6 ${px(top)}H${W - 6}M6 ${px(top + head)}H${W - 6}M6 ${px(bottom)}H${W - 6}" fill="none" stroke="#3a362f"/>`, `<path d="M${px(split)} ${top}V${bottom}" fill="none" stroke="${LINE}"/>`];
  const step = count > 8 ? 4 : 1, bands = [];
  for (let r = step; r < count; r += step) bands.push(`M6 ${px(top + head + r * rh)}H${W - 6}`);
  if (bands.length) body.push(`<path d="${bands.join('')}" fill="none" stroke="${FAINT}"/>`);
  names.forEach((s, i) => body.push(text(mid[i], top + head / 2, s, { size: 15, font: 'serif', italic: true, weight: i < inputs.length ? 400 : 600 })));
  for (let r = 0; r < count; r++) {
    const y = top + head + (r + .5) * rh;
    inputs.forEach((_, i) => { const b = r >> (inputs.length - 1 - i) & 1; body.push(text(mid[i], y, b, { size: 14, font: 'mono', fill: b ? INK : MUTED })); });
    outputs.forEach((o, k) => body.push(text(mid[inputs.length + k], y, o.values[r], { size: 14, font: 'mono', weight: o.values[r] === '1' ? 600 : 400, fill: o.values[r] === '1' ? HUES[0] : MUTED })));
  }
  return compose(W, bottom + 7, body, `Truth table of ${outputs.map(o => o.name).join(', ')} over ${inputs.join(', ')}`);
}

const RENDER = { plot: (d, width) => chart({ ...d, type: 'line' }, width), chart, bars, tree, array, number_line: numberLine, table, graph, bits, memory, waveform, pipeline, kmap, truth_table: truthTable };
export const DIAGRAM_TYPES = Object.keys(RENDER);

/**
 * `diagram` is { type, data } (data an object or a JSON string); also accepts { diagram_type, diagram_data }.
 * `width` is the room on the page in px: long rows of bits wrap and captions break to fit it. Returns { svg, width, height }.
 */
export function renderDiagram(diagram, { width = 640 } = {}) {
  const type = diagram?.type ?? diagram?.diagram_type;
  let data = diagram?.data ?? diagram?.diagram_data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { fail('data is not valid JSON'); } }
  if (!Object.hasOwn(RENDER, type)) fail(`unknown type ${JSON.stringify(type)}; use one of ${DIAGRAM_TYPES.join(', ')}, formula`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('data must be an object');
  return RENDER[type](data, width);
}

/** A diagram for show_visual, checked: any type but formula must render; a formula's data comes back normalized
 *  (Diagram.jsx draws it live). Throws as renderDiagram does. */
export function checkDiagram(diagram) {
  if ((diagram?.type ?? diagram?.diagram_type) !== 'formula') { renderDiagram(diagram); return diagram; }
  return { type: 'formula', data: formulaSpec(diagram.data ?? diagram.diagram_data) };
}
