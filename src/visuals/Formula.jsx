import React, { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { formulaSpec, compile, shown, plain } from './formula.mjs';

// A formula the student can play with: the equation, then each variable as a slim slider with its value to edit
// beside it, then the result, live. Once they stop, Plato hears where it stands, only when that changed:
// "[Student's page] formula: m = 0.1 → AMAT = 12 cycles" (the variables they moved, or all of them).
// Data that fails its check shows nothing (show_visual has already told Plato why).
const SETTLE_MS = 800;

export default function Formula({ data, onContext }) {
  const key = JSON.stringify(data), spec = useMemo(() => { try { return formulaSpec(data); } catch { return null; } }, [key]);
  return spec && <Live key={key} spec={spec} onContext={onContext}/>;
}

function Live({ spec, onContext }) {
  const start = useMemo(() => Object.fromEntries(spec.variables.map(v => [v.name, v.value])), [spec]);
  const run = useMemo(() => compile(spec.result.expr, spec.variables.map(v => v.name)), [spec]);
  const tex = useMemo(() => spec.latex && katex.renderToString(spec.latex, { displayMode: true, output: 'html', throwOnError: false, trust: false, strict: 'ignore' }), [spec]);
  // values: what the result is computed from; typing: a value being typed, as typed, until it is left.
  const [values, setValues] = useState(start), [typing, setTyping] = useState({});
  const result = run(values), told = useRef(null), timer = useRef(0), tell = useRef(onContext);
  tell.current = onContext;
  const unit = (text, u) => u ? `${text} ${u}` : text;
  useEffect(() => {
    const moved = spec.variables.filter(v => values[v.name] !== start[v.name]);
    const line = `[Student's page] formula: ${(moved.length ? moved : spec.variables).map(v => `${v.name} = ${unit(plain(values[v.name]), v.unit)}`).join(', ')} → ${spec.result.name} = ${unit(shown(result), spec.result.unit)}`;
    if (told.current === null) { told.current = line; return; } // the starting values are Plato's own
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (line !== told.current) { told.current = line; tell.current?.(line); } }, SETTLE_MS);
  }, [values]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const set = (name, value) => setValues(old => ({ ...old, [name]: value }));
  const type = (name, text) => {
    setTyping(old => ({ ...old, [name]: text }));
    if (text.trim() && Number.isFinite(+text)) set(name, +text);
  };
  const leave = name => setTyping(({ [name]: _, ...rest }) => rest);

  return <figure className="formula-live">
    {tex && <div className="formula-tex" dangerouslySetInnerHTML={{ __html: tex }}/>}
    <div className="formula-vars">{spec.variables.map(v => {
      const name = v.label || v.name, value = values[v.name];
      return <div key={v.name} className="formula-var" role="group" aria-label={name}>
        <span className="formula-name">{name}</span>
        <input type="range" min={v.min} max={v.max} step={v.step} value={Math.min(v.max, Math.max(v.min, value))} aria-label={`${name}, from ${v.min} to ${v.max}`}
          style={{ '--at': `${(Math.min(v.max, Math.max(v.min, value)) - v.min) / (v.max - v.min) * 100}%` }}
          onChange={e => { leave(v.name); set(v.name, +e.target.value); }}/>
        <span className="formula-value">
          <input inputMode="decimal" spellCheck={false} autoComplete="off" value={typing[v.name] ?? plain(value)} aria-label={`${name}${v.unit ? ` in ${v.unit}` : ''}`}
            onChange={e => type(v.name, e.target.value)} onBlur={() => leave(v.name)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { leave(v.name); e.currentTarget.blur(); } }}/>
          {v.unit && <span className="formula-unit">{v.unit}</span>}
        </span>
      </div>;
    })}</div>
    <p className="formula-result" aria-live="polite"><span className="formula-rname">{spec.result.name}</span> = <output>{shown(result)}</output>{spec.result.unit && <span className="formula-unit"> {spec.result.unit}</span>}</p>
  </figure>;
}
