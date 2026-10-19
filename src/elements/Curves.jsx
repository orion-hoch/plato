import React, { useId, useRef } from 'react';
import { market, controlRange } from '../../shared/elements/curves.mjs';
import { Slider, ticks, fmt, useWidth } from './Sim.jsx';
import './sim.css';
import './curves.css';

// Supply and demand (shared/elements/curves.mjs): Q across, P up, both curves labelled at their ends, the equilibrium
// with dashed guides to the axes; with a tax, the wedge in gold and the surpluses lightly shaded (consumers' lapis,
// producers' green, the deadweight loss terracotta). The live controls are sliders under it, held at a checkpoint.
const H = 300, L = 44, R = 64, T = 14, B = 34;
export default function Curves({ state, act, task, anchor, hidden = new Set() }) {
  const figure = useRef(null), W = Math.max(280, Math.min(520, useWidth(figure))), s = state.spec, m = market(state), clip = useId().replace(/:/g, ''), asked = new Set(task.open()?.predict || []);
  const X = q => L + q / s.q[1] * (W - L - R), Y = p => H - B - p / s.p[1] * (H - B - T);
  // Each curve as P = slope·Q + c, drawn where it lies inside the axes.
  const line = c => { const sh = state.shifts[c.id] ?? 0, slope = c.kind === 'demand' ? -c.b : c.b; return { slope, at: q => slope * q + (c.kind === 'demand' ? c.a + c.b * sh : c.a - c.b * sh) }; };
  const seg = c => {
    const { slope, at } = line(c), qOf = p => (p - at(0)) / slope, [lo, hi] = [qOf(0), qOf(s.p[1])].sort((a, b) => a - b);
    const q0 = Math.max(0, lo), q1 = Math.min(s.q[1], hi);
    return q1 > q0 ? [[q0, at(q0)], [q1, at(q1)]] : null;
  };
  const demand = s.curves.find(c => c.kind === 'demand'), supply = s.curves.find(c => c.kind === 'supply'), dAt = line(demand).at, sAt = line(supply).at;
  const poly = pts => pts.map(([q, p]) => `${X(q).toFixed(1)},${Y(p).toFixed(1)}`).join(' ');
  const taxed = state.tax > 0 && m.Q > 0;
  return <figure ref={figure} className="element-curves">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Supply and demand: equilibrium at Q ${fmt(m.Q)}, P ${fmt(m.P)}${taxed ? `; with the tax sellers keep ${fmt(m.Ps)}` : ''}`}>
      <defs><clipPath id={clip}><rect x={L} y={T} width={W - L - R} height={H - B - T}/></clipPath></defs>
      {taxed && <g clipPath={`url(#${clip})`} className="curves-areas">
        <polygon points={poly([[0, dAt(0)], [m.Q, m.P], [0, m.P]])} className="is-cs"/>
        <polygon points={poly([[0, m.Ps], [m.Q, m.Ps], [0, sAt(0)]])} className="is-ps"/>
        <polygon points={poly([[0, m.Ps], [m.Q, m.Ps], [m.Q, m.P], [0, m.P]])} className="is-tax"/>
        <polygon points={poly([[m.Q, m.P], [m.Q, m.Ps], [m.free.Q, m.free.P]])} className="is-dwl"/>
      </g>}
      {ticks(0, s.q[1]).filter(q => q <= s.q[1]).map(q => <text key={`q${q}`} x={X(q)} y={H - B + 16} className="sim-tick" textAnchor="middle">{fmt(q)}</text>)}
      {ticks(0, s.p[1]).filter(p => p <= s.p[1] && p > 0).map(p => <text key={`p${p}`} x={L - 6} y={Y(p)} className="sim-tick" textAnchor="end" dominantBaseline="central">{fmt(p)}</text>)}
      <g data-anchor={anchor('axis-q')}><path d={`M${L} ${H - B}H${W - R + 10}`} className="sim-axis"/><text x={W - R + 16} y={H - B + 16} className="curves-axis-name">Q</text></g>
      <g data-anchor={anchor('axis-p')}><path d={`M${L} ${H - B}V${T - 4}`} className="sim-axis"/><text x={L} y={T - 8} className="curves-axis-name" textAnchor="middle">P</text></g>
      {s.curves.map(c => { const pts = seg(c); if (!pts) return null; const end = pts[1]; return <g key={c.id} data-anchor={anchor(`curve-${c.id}`)} className={`curves-line is-${c.kind}`}>
        <path d={`M${poly(pts).replace(' ', ' L')}`}/>
        <text x={Math.min(W - 2, X(end[0]) + 6)} y={Math.min(Y(end[1]), H - B - 12)} dominantBaseline="central">{c.label}</text>
      </g>; })}
      {/* The equilibrium is the outcome a prediction asks for: not drawn while one waits. */}
      {!['Q', 'P', 'Ps', 'CS', 'PS', 'DWL'].some(n => hidden.has(n)) && <><g data-anchor={anchor('eq')} className={`curves-eq${asked.has('Q') || asked.has('P') ? ' is-asked' : ''}`}>
        <path d={`M${L} ${Y(m.P)}H${X(m.Q)}V${H - B}`} className="curves-guide"/>
        {taxed && <path d={`M${L} ${Y(m.Ps)}H${X(m.Q)}`} className="curves-guide"/>}
        <circle cx={X(m.Q)} cy={Y(m.P)} r="5"/>
      </g>
      {taxed && <g data-anchor={anchor('tax')} className="curves-wedge"><path d={`M${X(m.Q)} ${Y(m.P)}V${Y(m.Ps)}`}/><circle cx={X(m.Q)} cy={Y(m.Ps)} r="4"/></g>}</>}
    </svg>
    {s.live.length > 0 && <div className="sim-params">{s.live.map(name => {
      const r = controlRange(s, name), curve = s.curves.find(c => c.id === name);
      return name === 'tax'
        ? <Slider key="tax" control="tax" label="tax" value={state.tax} {...r} act={act} task={task} anchor={anchor('tax')}/>
        : <Slider key={name} control={`shift ${name}`} label={`${curve.label} shift`} value={state.shifts[name] ?? 0} {...r} act={act} task={task} anchor={anchor(`curve-${name}`)}/>;
    })}</div>}
  </figure>;
}
