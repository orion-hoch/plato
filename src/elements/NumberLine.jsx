import React, { useLayoutEffect, useRef, useState } from 'react';
import { ticksOf, snap } from '../../shared/elements/numberline.mjs';
import { wide } from '../visuals/diagram.mjs';
import { useWidth } from './Sim.jsx';
import './numberline.css';

// A number line (shared/elements/numberline.mjs), drawn for the room it has: labelled ticks, ranges as bands, the spec's
// marks in terracotta, the learner's in lapis, a hidden mark (gold once shown) waiting below the line as "?" until the
// learner has said where it lands. When the task is to place marks, a tap on the line places the chosen one, and a mark
// with focus moves a step at a time with the arrow keys.
const INK = '#1d1b18', MUTED = '#6f6b64', LINE = '#cfc6b6', SHEET = '#fbf9f4', HUE = { fixed: '#b5653e', learner: '#2f4f8a', shown: '#bfa035' };
const BANDS = ['#bfa035', '#2f8a5c', '#2f4f8a', '#b5653e'];
const fmt = v => String(+(+v).toPrecision(6)).replace('-', '−');
const SANS = 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
const label = (x, y, text, { size = 12, weight = 400, fill = INK, anchor = 'middle' } = {}) =>
  <text x={x} y={y} fontFamily={SANS} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} dominantBaseline="central" stroke={SHEET} strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">{text}</text>;

export default function NumberLine({ state, spec, act, task, anchor }) {
  const s = state.spec, box = useRef(null), W = Math.max(240, Math.min(620, useWidth(box))), focus = useRef(null);
  const placing = ['construct', 'change'].includes(spec.task?.mode), mine = s.marks.filter(m => m.learner);
  const [pick, setPick] = useState(mine[0]?.label ?? null), asked = new Set(task.open()?.predict || []);
  useLayoutEffect(() => { if (focus.current) { box.current.querySelector(`[data-mark="${CSS.escape(focus.current)}"]`)?.focus(); focus.current = null; } });

  const L = 24, R = 24, X = v => L + (v - s.min) / (s.max - s.min) * (W - L - R);
  const valueAt = m => m.learner ? state.placed[m.label] : m.value;
  const drawn = s.marks.filter(m => m.learner ? state.placed[m.label] != null : !m.hidden || state.shown[m.label]);
  const waiting = s.marks.filter(m => m.learner ? placing && state.placed[m.label] == null : m.hidden && !state.shown[m.label]);
  // Mark labels in rows over the line, each centred on its mark; one that would touch the last in a row goes up a row.
  const ends = [], rows = new Map();
  for (const m of [...drawn].sort((a, b) => valueAt(a) - valueAt(b))) {
    const x = X(valueAt(m)), half = wide(m.label, 12, 'sans', 600) / 2 + 5;
    let row = 0;
    while (row < 2 && x - half < (ends[row] ?? -Infinity)) row++;
    ends[row] = x + half;
    rows.set(m.label, row);
  }
  const axis = 18 + 18 * ends.length + (ends.length ? 6 : 0), ticks = ticksOf(s), height = axis + (s.ranges.some(r => r.label) ? 52 : 34);
  const minor = (s.max - s.min) / s.step <= 60 ? Array.from({ length: Math.round((s.max - s.min) / s.step) + 1 }, (_, i) => +(s.min + i * s.step).toPrecision(12)) : [];

  const place = (m, v, keys = false) => { if (act(`place ${m.label}=${snap(s, v)}`)) { setPick(m.label); if (keys) focus.current = m.label; } };
  const moveKeys = (e, m, v) => {
    const by = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
    const to = by ? v + by * s.step : e.key === 'Home' ? s.min : e.key === 'End' ? s.max : null;
    if (to === null || !placing) return;
    e.preventDefault();
    place(m, to, true);
  };
  const tap = e => {
    const m = mine.find(x => x.label === pick), r = e.currentTarget.getBoundingClientRect();
    if (placing && m) place(m, s.min + (e.clientX - r.left) / r.width * (s.max - s.min));
  };

  return <div ref={box} className="element-numberline">
    <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="group" aria-label={`Number line from ${fmt(s.min)} to ${fmt(s.max)}`}>
      {s.ranges.map((r, i) => <g key={i} data-anchor={anchor(`range-${i}`)}>
        <rect x={X(r.from)} y={axis - 5} width={Math.max(2, X(r.to) - X(r.from))} height={10} rx={5} fill={BANDS[i % 4]} fillOpacity={.35}/>
        {r.label && label((X(r.from) + X(r.to)) / 2, axis + 38, r.label, { fill: MUTED })}
      </g>)}
      <path d={`M${L - 12} ${axis + .5}H${W - R + 12}M${W - R + 7} ${axis - 3.5}L${W - R + 12} ${axis + .5}L${W - R + 7} ${axis + 4.5}M${L - 7} ${axis - 3.5}L${L - 12} ${axis + .5}L${L - 7} ${axis + 4.5}`} fill="none" stroke={INK}/>
      {minor.filter(v => !ticks.includes(v)).map(v => <path key={v} d={`M${X(v)} ${axis}v4`} stroke={LINE}/>)}
      {ticks.map(v => <g key={v} data-anchor={anchor(`tick-${v}`)}><path d={`M${X(v)} ${axis}v6`} stroke={INK}/>{label(X(v), axis + 18, fmt(v), { size: 11, fill: MUTED })}</g>)}
      {placing && pick && <rect className="numberline-hit" data-toggle="numberline" x={L - 6} y={axis - 16} width={W - L - R + 12} height={32} onClick={tap}/>}
      {drawn.map(m => {
        const v = valueAt(m), x = X(v), y = axis - 18 - 18 * rows.get(m.label), hue = m.learner ? HUE.learner : m.hidden ? HUE.shown : HUE.fixed, chosen = placing && m.learner && pick === m.label;
        return <g key={m.label} data-anchor={anchor(`mark-${m.label}`)} data-mark={m.label} data-toggle="numberline" className={`numberline-mark${asked.has(m.label) ? ' is-asked' : ''}`}
          {...(m.learner && placing ? { tabIndex: 0, role: 'slider', 'aria-label': m.label, 'aria-valuemin': s.min, 'aria-valuemax': s.max, 'aria-valuenow': v, 'aria-valuetext': fmt(v), onClick: () => setPick(m.label), onKeyDown: e => moveKeys(e, m, v) } : { role: 'img', 'aria-label': `${m.label} at ${fmt(v)}` })}>
          {Math.abs(y - axis) > 26 && <path d={`M${x} ${y + 8}V${axis - 8}`} stroke={LINE}/>}
          <circle cx={x} cy={axis + .5} r={chosen ? 7 : 5.5} fill={hue} stroke={chosen ? '#fff' : SHEET} strokeWidth={2}/>
          {label(x, y, m.label, { weight: 600, fill: m.learner ? HUE.learner : INK })}
        </g>;
      })}
    </svg>
    {waiting.length > 0 && <div className="numberline-tray">{waiting.map(m => {
      if (m.learner) return <button key={m.label} type="button" data-anchor={anchor(`mark-${m.label}`)} className={`numberline-chip${pick === m.label ? ' is-picked' : ''}${asked.has(m.label) ? ' is-asked' : ''}`}
        aria-pressed={pick === m.label} aria-label={`${m.label}, not placed yet`} onClick={() => setPick(m.label)}
        onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); place(m, (s.min + s.max) / 2, true); } }}>{m.label}</button>;
      const held = task.blocked(`show ${m.label}`);
      return <button key={m.label} type="button" data-anchor={anchor(`mark-${m.label}`)} className={`numberline-chip is-hidden${held ? ' is-held' : ''}${asked.has(m.label) ? ' is-asked' : ''}`}
        aria-label={`${m.label}: hidden${held ? ', it waits for your prediction' : ', show it'}`} onClick={() => act(`show ${m.label}`)}>{m.label} <span className="numberline-q">?</span></button>;
    })}</div>}
  </div>;
}
