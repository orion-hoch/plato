import React, { useMemo } from 'react';
import { PINS, isSwitch, nameOf } from '../../shared/elements/circuit.mjs';
import { wide } from '../visuals/diagram.mjs';

// A circuit drawn in the page's language (as src/visuals/diagram.mjs draws): warm hairline ink on the sheet, every
// wire carrying 1 in lapis. A switch flips on a press (or Enter) through the engine (shared/elements/circuit.mjs, its
// step settles the circuit); a switch a checkpoint holds is outlined and waits for the learner's prediction. Every part
// is an anchor for point_to (part-<id>).
const INK = '#1d1b18', MUTED = '#6f6b64', ZERO = '#b4ab9b', PAPER = '#fffdf8', LAPIS = '#2f4f8a';
const SANS = 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', MONO = 'ui-monospace, SF Mono, Menlo, Consolas, monospace';
const DX = 96, DY = 80, PAD = 16;
const INVERTED = new Set(['nand', 'nor', 'xnor']), CURVED = new Set(['or', 'nor', 'xor', 'xnor']);
const KIND = { dlatch: 'D latch', dff: 'D flip-flop', srlatch: 'SR latch' };
const label = (x, y, text, { anchor = 'middle', size = 13, fill = INK, font = SANS, weight = 500, halo = false } = {}) =>
  <text x={x} y={y} fill={fill} fontFamily={font} fontSize={size} fontWeight={weight} textAnchor={anchor} dominantBaseline="central"
    {...halo && { stroke: PAPER, strokeWidth: 4, strokeLinejoin: 'round', paintOrder: 'stroke' }}>{text}</text>;

// Where a part's output (q or qn) and its k-th input meet their wires.
function outPin(p, { x, y }, pin) {
  if (PINS[p.type]) return [x + 22, y + (pin === 'qn' ? 13 : -13)];
  if (isSwitch(p)) return [x + 18, y];
  return [x + ({ not: 21, buf: 14 }[p.type] ?? (INVERTED.has(p.type) ? 25 : 18)), y];
}
function inPin(p, { x, y }, k) {
  if (PINS[p.type]) return [x - 22, y + (k ? 13 : -13)];
  if (p.type === 'output') return [x - 9, y];
  if (p.type === 'not' || p.type === 'buf') return [x - 14, y];
  const n = p.in.length, gap = n > 2 ? 9 : 14;
  return [x - (CURVED.has(p.type) ? 15 : 18), y + (k - (n - 1) / 2) * gap];
}
function body(type, x, y) {
  if (type === 'not' || type === 'buf') return `M${x - 14} ${y - 13}L${x + 14} ${y}L${x - 14} ${y + 13}Z`;
  if (CURVED.has(type)) return `M${x - 18} ${y - 16}Q${x - 10} ${y} ${x - 18} ${y + 16}Q${x + 6} ${y + 16} ${x + 18} ${y}Q${x + 6} ${y - 16} ${x - 18} ${y - 16}Z`;
  return `M${x - 18} ${y - 16}H${x + 2}A16 16 0 0 1 ${x + 2} ${y + 16}H${x - 18}Z`;
}

export default function Circuit({ state, act, task, anchor }) {
  const spec = state.spec, switches = useMemo(() => spec.parts.filter(isSwitch), [spec]);
  const { at, wires, tags, box } = useMemo(() => {
    const byId = new Map(spec.parts.map(p => [p.id, p])), cols = spec.parts.map(p => p.col), rows = spec.parts.map(p => p.row);
    const c0 = Math.min(...cols), r0 = Math.min(...rows);
    const at = new Map(spec.parts.map(p => [p.id, { x: PAD + (p.col - c0 + .5) * DX, y: PAD + (p.row - r0 + .5) * DY }]));
    const clear = (row, a, b) => !spec.parts.some(q => q.row === row && q.col > Math.min(a, b) && q.col < Math.max(a, b));
    // Every input is a wire from its source's pin that never runs along a row through another part: it bends by
    // the pin when the source's row is clear, else by the source when the pin's row is clear, else it takes the
    // gap between rows next to the pin's row; a wire back to the left (feedback) always takes that gap.
    const wires = spec.parts.flatMap(p => p.in.map((ref, k) => {
      const [id, pin] = ref.split('.'), s = byId.get(id), [fx, fy] = outPin(s, at.get(id), pin), [tx, ty] = inPin(p, at.get(p.id), k);
      const near = fx + 8 + 4 * k, key = `${p.id}.${k}`, from = [fx, fy], forward = tx > fx + 12;
      if (forward && clear(s.row, s.col, p.col)) {
        if (fy === ty) return { ref, key, from, reach: tx, d: `M${fx} ${fy}H${tx}` };
        const mx = Math.max(near, tx - 10 - 6 * k - 3 * (p.row % 2));
        return { ref, key, from, reach: mx, d: `M${fx} ${fy}H${mx}V${ty}H${tx}` };
      }
      if (forward && clear(p.row, s.col, p.col)) return { ref, key, from, reach: near, d: `M${fx} ${fy}H${near}V${ty}H${tx}` };
      const yd = at.get(p.id).y, lane = (s.row < p.row ? yd - DY / 2 - 4 - 3 * k : s.row > p.row ? yd + DY / 2 + 4 + 3 * k : yd + DY / 2 - 6 - 3 * k);
      return { ref, key, from, reach: near, d: `M${fx} ${fy}H${near}V${lane}H${tx - 10 - 6 * k - (s.row > p.row ? 5 : 0)}V${ty}H${tx}` };
    }));
    // Where a wire leaves a longer one from the same pin, a dot marks the branch.
    for (const w of wires) w.dot = wires.some(o => o !== w && o.ref === w.ref && o.reach > w.reach) ? [w.reach, w.from[1]] : null;
    // A part's label goes above it, else below, centred or flush with either edge: the first place no wire crosses
    // (failing one, the place fewest cross, haloed).
    const runs = wires.flatMap(w => { const out = []; let x, y; for (const [, c, a, b] of w.d.matchAll(/([MHV])([-\d.]+)(?: ([-\d.]+))?/g)) { const nx = c === 'V' ? x : +a, ny = c === 'M' ? +b : c === 'V' ? +a : y; if (c !== 'M') out.push([Math.min(x, nx), Math.min(y, ny), Math.max(x, nx), Math.max(y, ny)]); x = nx; y = ny; } return out; });
    const tags = new Map(spec.parts.filter(p => p.label && !isSwitch(p) && p.type !== 'output').map(p => {
      const { x, y } = at.get(p.id), size = PINS[p.type] ? 12 : 11, half = PINS[p.type] ? 22 : 18, rise = PINS[p.type] ? 35 : 25, w = wide(p.label, size, 'sans', 500);
      const spots = [-rise, rise + 2].flatMap(dy => [x, x - half + w / 2, x + half - w / 2].map(cx => ({ x: cx, y: y + dy })))
        .map(s => ({ ...s, hits: runs.filter(r => r[0] <= s.x + w / 2 + 2 && r[2] >= s.x - w / 2 - 2 && r[1] <= s.y + 8 && r[3] >= s.y - 8).length }));
      const best = spots.reduce((a, b) => b.hits < a.hits ? b : a);
      return [p.id, { ...best, size, halo: best.hits > 0 }];
    }));
    const xs = spec.parts.map(p => at.get(p.id).x), left = Math.min(PAD, ...switches.map(p => at.get(p.id).x - 24 - wide(nameOf(p), 13, 'sans', 500)));
    const right = Math.max(PAD + (Math.max(...cols) - c0 + 1) * DX, ...spec.parts.filter(p => p.type === 'output').map(p => at.get(p.id).x + 19 + wide(nameOf(p), 13, 'sans', 500)), ...xs.map(x => x + DX / 2));
    const low = Math.max(2 * PAD + (Math.max(...rows) - r0 + 1) * DY, ...[...tags.values()].map(t => t.y + 12));
    return { at, wires, tags, box: { x: Math.floor(left - 2), width: Math.ceil(right - left + 4), height: Math.ceil(low) } };
  }, [spec, switches]);

  const { values } = state.sim, asked = new Set(task.open()?.predict || []);
  const flip = id => act(`flip ${id}`);

  const part = p => {
    const { x, y } = at.get(p.id), v = values[p.id], tag = tags.get(p.id);
    if (isSwitch(p)) {
      const w = wide(nameOf(p), 13, 'sans', 500);
      const held = task.blocked(`flip ${p.id}`);
      return <g key={p.id} data-anchor={anchor(`part-${p.id}`)} className={`circuit-switch${held ? ' is-held' : ''}`} data-toggle={p.id} role="switch" aria-checked={v === 1} aria-label={`${p.type === 'clock' ? `${nameOf(p)}, clock` : nameOf(p)}${held ? ', waits for your prediction' : ''}`} tabIndex={0}
        onClick={() => flip(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(p.id); } }}>
        <rect className="circuit-hit" x={x - 22 - w} y={y - 21} width={w + 44} height={42} rx={8}/>
        {label(x - 16, y, nameOf(p), { anchor: 'end' })}
        {p.type === 'clock' && <path d={`M${x - 8} ${y - 13}h4v-5h5v5h5v-5h4`} fill="none" stroke={MUTED} strokeWidth={1.1}/>}
        <rect x={x - 10} y={y - 9} width={28} height={18} rx={9} fill={v ? LAPIS : PAPER} stroke={v ? LAPIS : INK} strokeWidth={1.2}/>
        <circle cx={v ? x + 9 : x - 1} cy={y} r={5.5} fill={v ? PAPER : INK}/>
        {label(v ? x - 1 : x + 9, y + .5, v, { size: 9, font: MONO, fill: v ? PAPER : MUTED, weight: 600 })}
      </g>;
    }
    if (p.type === 'output') return <g key={p.id} data-anchor={anchor(`part-${p.id}`)} className={asked.has(nameOf(p)) ? 'is-asked' : undefined}>
      <circle cx={x} cy={y} r={9} fill={v ? LAPIS : PAPER} stroke={v ? LAPIS : INK} strokeWidth={1.3}/>
      {label(x, y + .5, v, { size: 10, font: MONO, fill: v ? PAPER : MUTED, weight: 600 })}
      {label(x + 15, y, nameOf(p), { anchor: 'start' })}
    </g>;
    if (PINS[p.type]) return <g key={p.id} data-anchor={anchor(`part-${p.id}`)} role="img" aria-label={`${nameOf(p)}, ${KIND[p.type]}, Q=${v}`}>
      {tag && label(tag.x, tag.y, p.label, { size: 12, fill: MUTED, halo: tag.halo })}
      <rect x={x - 22} y={y - 26} width={44} height={52} rx={3} fill={PAPER} stroke={INK} strokeWidth={1.3}/>
      {label(x - 16, y - 13, PINS[p.type][0], { anchor: 'start', size: 11, font: MONO })}
      {p.type === 'dff' ? <path d={`M${x - 22} ${y + 7}L${x - 15} ${y + 13}L${x - 22} ${y + 19}`} fill="none" stroke={INK} strokeWidth={1.2}/> : label(x - 16, y + 13, PINS[p.type][1], { anchor: 'start', size: 11, font: MONO })}
      {label(x + 16, y - 13, 'Q', { anchor: 'end', size: 11, font: MONO })}
      {label(x + 16, y + 13, 'Q', { anchor: 'end', size: 11, font: MONO })}
      <path d={`M${x + 9.5} ${y + 6.5}h7`} stroke={INK} strokeWidth={1}/>
    </g>;
    return <g key={p.id} data-anchor={anchor(`part-${p.id}`)}>
      {tag && label(tag.x, tag.y, p.label, { size: 11, fill: MUTED, halo: tag.halo })}
      {(p.type === 'xor' || p.type === 'xnor') && <path d={`M${x - 23} ${y - 16}Q${x - 15} ${y} ${x - 23} ${y + 16}`} fill="none" stroke={INK} strokeWidth={1.3}/>}
      <path d={body(p.type, x, y)} fill={PAPER} stroke={INK} strokeWidth={1.3} strokeLinejoin="round"/>
      {(INVERTED.has(p.type) || p.type === 'not') && <circle cx={x + (p.type === 'not' ? 17.5 : 21.5)} cy={y} r={3.5} fill={PAPER} stroke={INK} strokeWidth={1.3}/>}
    </g>;
  };

  // It may shrink to fit the page only as far as its smallest label (a part's, 11px; else a switch's, 13px) stays 11px.
  return <figure className="element-circuit" style={{ '--w': `${box.width}px` }}>
    <svg viewBox={`${box.x} 0 ${box.width} ${box.height}`} width={box.width} height={box.height} role="group" aria-label={`Circuit with ${switches.length} switch${switches.length === 1 ? '' : 'es'}`}>
      {wires.map(w => <path key={w.key} d={w.d} fill="none" stroke={values[w.ref] ? LAPIS : ZERO} strokeWidth={values[w.ref] ? 2.2 : 1.4} strokeLinejoin="round"/>)}
      {wires.filter(w => w.dot).map(w => <circle key={`${w.key}.dot`} cx={w.dot[0]} cy={w.dot[1]} r={2.6} fill={values[w.ref] ? LAPIS : ZERO}/>)}
      {spec.parts.map(part)}
    </svg>
    {spec.caption && <figcaption>{spec.caption}</figcaption>}
  </figure>;
}
