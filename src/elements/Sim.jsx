import React, { useLayoutEffect, useRef, useState } from 'react';
import { values as simValues } from '../../shared/elements/sim.mjs';
import { ticks } from '../../shared/elements/graph.mjs';
import './sim.css';

// A simulation (shared/elements/sim.mjs): the run drawn against time, the end values beside it, and a native slider for
// each live parameter. Also the pieces the market (Curves.jsx) shares: ticks, a number as the page writes it, and the
// slider a checkpoint holds.
export const HUES = ['#2f4f8a', '#b5653e', '#bfa035', '#2f8a5c'];
export const fmt = v => !Number.isFinite(+v) ? '—' : (+(+v).toPrecision(4)).toLocaleString('en-US', { maximumFractionDigits: 3 }).replace('-', '−');
export { ticks }; // round values in about five steps of 1, 2 or 5 times a power of ten (shared/elements/graph.mjs)

/** The width a chart has on the page, so it is drawn at its real size (its type stays readable on a phone). */
export function useWidth(ref, fallback = 440) {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.clientWidth) || fallback);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return width;
}

/**
 * A live control as a native range slider ("set g", "shift D", "tax"): each move is act(`${control}=${value}`). A
 * checkpoint at a value ("set g=5") holds it there: a move across it lands on it, and waits for the learner's prediction;
 * one on the control itself ("set g") holds every move, and the slider shows it is waiting.
 */
export function Slider({ control, label, value, min, max, step, unit = '', act, task, anchor, asked = false }) {
  const waiting = task.checkpoints.filter(c => !c.revealed), gates = waiting.filter(c => c.at.startsWith(`${control}=`)).map(c => +c.at.slice(control.length + 1));
  const stuck = waiting.some(c => !c.prediction && c.at === control), held = stuck || waiting.some(c => !c.prediction && c.at.startsWith(`${control}=`));
  const move = to => {
    const hit = gates.filter(g => (g - value) * (to - value) > 0 && Math.abs(g - value) <= Math.abs(to - value)).sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
    act(`${control}=${hit ?? to}`);
  };
  return <label className={`sim-slider${held ? ' is-held' : ''}${asked ? ' is-asked' : ''}`} data-anchor={anchor}>
    <span className="sim-slider-name">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} disabled={stuck} onChange={e => move(+e.target.value)}
      aria-label={`${label}${unit ? ` in ${unit}` : ''}${held ? ', waits for your prediction' : ''}`} aria-valuetext={`${fmt(value)}${unit ? ` ${unit}` : ''}`}
      style={{ '--at': `${((value - min) / (max - min)) * 100}%` }}/>
    <output className="sim-slider-value">{fmt(value)}{unit && <span className="sim-unit"> {unit}</span>}</output>
  </label>;
}

const H = 220, L = 44, R = 30, T = 12, B = 30;
export default function Sim({ state, act, task, anchor, hidden = new Set() }) {
  const figure = useRef(null), W = Math.max(280, Math.min(560, useWidth(figure))), s = state.spec, run = state.run, v = simValues(state), asked = new Set((task.open()?.predict || []).map(n => n.split('@')[0]));
  // A var asked for (at the end or at a time) is not drawn until revealed, and the scale comes from what is drawn (else the
  // starting values), so its range gives nothing away either.
  const veiled = name => hidden.has(name) || [...hidden].some(h => h.startsWith(`${name}@`)), shown = name => veiled(name) ? '?' : fmt(v[name]);
  const plotted = s.plot.filter(name => !veiled(name)).map(name => run.ys[name]), all = plotted.length ? plotted.flat() : s.plot.map(name => run.ys[name][0]), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * .06 || 1;
  const yTicks = ticks(lo - pad, hi + pad), y0 = Math.min(lo - pad, yTicks[0]), y1 = Math.max(hi + pad, yTicks.at(-1)), tTicks = ticks(s.t[0], s.t[1]);
  const X = t => L + (t - s.t[0]) / (s.t[1] - s.t[0]) * (W - L - R), Y = y => H - B - (y - y0) / (y1 - y0) * (H - B - T);
  const every = Math.max(1, Math.ceil(run.ts.length / 400)); // at most about 400 points a curve
  const path = ys => run.ts.map((t, i) => i % every && i !== run.ts.length - 1 ? null : `${X(t).toFixed(1)},${Y(ys[i]).toFixed(1)}`).filter(Boolean).join(' L');
  return <figure ref={figure} className="element-sim">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`The run from t = ${fmt(s.t[0])}: ${s.plot.map(n => `${n} ends at ${shown(n)}`).join(', ')}`}>
      {yTicks.filter(y => y >= y0 && y <= y1).map(y => <g key={`y${y}`}><path d={`M${L} ${Y(y)}H${W - R}`} className="sim-grid"/><text x={L - 6} y={Y(y)} className="sim-tick" textAnchor="end" dominantBaseline="central">{fmt(y)}</text></g>)}
      {tTicks.map(t => <text key={`t${t}`} x={X(t)} y={H - B + 16} className="sim-tick" textAnchor="middle">{fmt(t)}</text>)}
      <path d={`M${L} ${T}V${H - B}H${W - R}`} className="sim-axis"/>
      <text x={W - R + 8} y={H - B} className="sim-axis-name" dominantBaseline="central">t</text>
      {y0 < 0 && y1 > 0 && <path d={`M${L} ${Y(0)}H${W - R}`} className="sim-zero"/>}
      {s.plot.map((name, i) => <g key={name} data-anchor={anchor(`curve-${name}`)}>{!veiled(name) && <>
        <path d={`M${path(run.ys[name])}`} fill="none" stroke={HUES[i]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        <text x={Math.min(W - 4, X(run.tEnd) + 5)} y={Y(run.ys[name].at(-1))} fill={HUES[i]} className="sim-label" dominantBaseline="central">{name}</text></>}
      </g>)}
    </svg>
    <p className="sim-values">
      {Object.keys(s.vars).map(name => <span key={name} data-anchor={anchor(`var-${name}`)} className={asked.has(name) ? 'is-asked' : undefined}>{name} = {shown(name)}</span>)}
      <span className={asked.has('t_end') ? 'is-asked' : undefined}>t = {hidden.has('t_end') ? '?' : fmt(run.tEnd)}</span>
    </p>
    {s.params.length > 0 && <div className="sim-params">{s.params.map(p => s.live.includes(p.name)
      ? <Slider key={p.name} control={`set ${p.name}`} label={p.label ? `${p.label} ${p.name}` : p.name} value={state.params[p.name]} min={p.min} max={p.max} step={p.step} unit={p.unit} act={act} task={task} anchor={anchor(`param-${p.name}`)} asked={asked.has(p.name)}/>
      : <span key={p.name} className="sim-fixed" data-anchor={anchor(`param-${p.name}`)}>{p.label ? `${p.label} ` : ''}{p.name} = {fmt(state.params[p.name])}{p.unit ? ` ${p.unit}` : ''}</span>)}</div>}
  </figure>;
}
