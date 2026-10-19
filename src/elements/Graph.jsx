import React, { useId, useRef } from 'react';
import { sample, ticks, yRange } from '../../shared/elements/graph.mjs';
import { useWidth } from './Sim.jsx';
import './graph.css';

// A function graph (shared/elements/graph.mjs), drawn for the room it has: the curve the engine samples, data points,
// round ticks, and under it a slider for each live parameter (the fixed ones show their value). A slider a checkpoint
// holds is dashed and still until the learner has said what will happen; an x the learner is asked about gets a dashed
// lapis guide.
const INK = '#1d1b18', MUTED = '#6f6b64', LINE = '#cfc6b6', FAINT = '#ebe5d9', LAPIS = '#2f4f8a', TERRACOTTA = '#b5653e', SHEET = '#fbf9f4';
const SANS = 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
const fmt = v => String(+(+v).toPrecision(4)).replace('-', '−');
const tag = (x, y, text, anchor = 'middle') => <text x={x} y={y} fontFamily={SANS} fontSize={11} fill={MUTED} textAnchor={anchor} dominantBaseline="central">{text}</text>;

export default function Graph({ state, act, task, anchor, hidden = new Set() }) {
  const s = state.spec, box = useRef(null), clip = `graph-${useId().replace(/[^\w-]/g, '')}`, W = Math.max(240, Math.min(600, useWidth(box)));
  const H = Math.max(180, Math.min(340, Math.round(W * .6))), L = 44, R = 14, T = 12, B = 28;
  const [x0, x1] = s.x, [y0, y1] = yRange(state), X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => H - B - (y - y0) / (y1 - y0) * (H - T - B);
  // The curve as runs between breaks: where f is undefined, or jumps further than the plot is tall (an asymptote).
  const runs = [];
  let run = [];
  for (const [x, y] of sample(s, state.params)) {
    if (!Number.isFinite(y) || (run.length && Math.abs(y - run.at(-1)[1]) > 2 * (y1 - y0))) { if (run.length > 1) runs.push(run); run = Number.isFinite(y) ? [[x, y]] : []; continue; }
    run.push([x, y]);
  }
  if (run.length > 1) runs.push(run);
  const asked = (task.open()?.predict || []).map(n => /^f\((-?[\d.e]+)\)$/.exec(n)).filter(Boolean).map(m => +m[1]).filter(x => x >= x0 && x <= x1);
  const yt = ticks(y0, y1).filter(v => v >= y0 && v <= y1), xt = ticks(x0, x1), every = Math.ceil(xt.length / Math.max(2, Math.floor((W - L - R) / 44)));
  // A bare gate holds its slider; a valued one ("set h=2") lets it move but stops it at that value until they predict.
  const waiting = task.checkpoints.filter(c => !c.revealed && !c.prediction);
  const params = s.params.map(p => ({ ...p, live: s.live.includes(p.name), held: waiting.some(c => c.at === `set ${p.name}`), stops: waiting.filter(c => c.at.startsWith(`set ${p.name}=`)).map(c => +c.at.split('=')[1]) }));
  const move = (p, to) => { const v = state.params[p.name], hit = p.stops.filter(g => (g - v) * (to - v) > 0 && Math.abs(g - v) <= Math.abs(to - v)).sort((a, b) => Math.abs(a - v) - Math.abs(b - v))[0]; act(`set ${p.name}=${hit ?? to}`); };

  return <figure ref={box} className="element-graph">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Graph of f(x) = ${s.expr}${s.params.length ? ` with ${s.params.map(p => `${p.name} = ${fmt(state.params[p.name])}`).join(', ')}` : ''}`}>
      <defs><clipPath id={clip}><rect x={L} y={T} width={W - L - R} height={H - T - B}/></clipPath></defs>
      {yt.map(v => <g key={v}><path d={`M${L} ${Math.round(Y(v)) + .5}H${W - R}`} stroke={v === 0 ? LINE : FAINT}/>{tag(L - 8, Y(v), fmt(v), 'end')}</g>)}
      {x0 < 0 && x1 > 0 && <path d={`M${Math.round(X(0)) + .5} ${T}V${H - B}`} stroke={LINE}/>}
      <path d={`M${L} ${H - B + .5}H${W - R}`} stroke={INK}/>
      {xt.map((v, i) => <g key={v} data-anchor={anchor(`x-${v}`)}><path d={`M${Math.round(X(v)) + .5} ${H - B}v5`} stroke={INK}/>{i % every === 0 && tag(X(v), H - B + 16, fmt(v))}</g>)}
      {asked.map(x => <path key={x} className="graph-asked" d={`M${X(x)} ${T}V${H - B}`} stroke={LAPIS} strokeDasharray="4 4"/>)}
      {/* The curve shows every value a prediction may ask for (f(x), a root, an extreme): not drawn while one waits. */}
      <g clipPath={`url(#${clip})`} data-anchor={anchor('curve')} visibility={[...hidden].some(n => /^(f\(|root$|max$|min$|argmax$|argmin$)/.test(n)) ? 'hidden' : undefined}>
        {runs.map((r, i) => <polyline key={i} points={r.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')} fill="none" stroke={LAPIS} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round"/>)}
      </g>
      {s.points.map(([x, y], i) => <circle key={i} data-anchor={anchor(`point-${i}`)} cx={X(x)} cy={Y(y)} r={3.5} fill={TERRACOTTA} stroke={SHEET} strokeWidth={1.5}/>)}
    </svg>
    {params.length > 0 && <div className="graph-params">{params.map(p => {
      const name = p.label ? `${p.label} (${p.name})` : p.name, v = state.params[p.name];
      return <div key={p.name} className={`graph-param${p.held ? ' is-held' : ''}`} data-anchor={anchor(`param-${p.name}`)}>
        <span className="graph-name">{name}</span>
        {p.live ? <input type="range" min={p.min} max={p.max} step={p.step} value={v} disabled={p.held} style={{ '--at': `${(v - p.min) / (p.max - p.min) * 100}%` }}
          aria-label={`${name}, from ${fmt(p.min)} to ${fmt(p.max)}${p.held ? ': it waits for your prediction' : ''}`} onChange={e => move(p, +e.target.value)}/> : <span className="graph-fixed"/>}
        <output className="graph-value">{fmt(v)}</output>
      </div>;
    })}</div>}
  </figure>;
}
