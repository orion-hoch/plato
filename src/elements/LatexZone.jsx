import React, { useEffect, useRef, useState } from 'react';
import { Palette, nextHole, tex } from '../equations/Palette.jsx';
import { useDraft } from '../checkpoint.js';

// Equations worked step by step: each line is its equation, rendered, with its LaTeX small and muted beneath (clearer
// while it has the keys). Enter at the end of a line starts the next step from a copy of it, to change; Backspace on
// an empty step takes it away; the arrow keys move between steps; Tab goes to the next □ left by the symbol palette,
// which shows under the steps while one has the keys. A line that doesn't parse shows its source in muted terracotta.
// After every change, onWork({ label, value, brief }): value is the steps, one per line.
export default function LatexZone({ lines: seed = [], done = false, onWork, draftKey = null }) {
  const [lines, setLines] = useDraft(draftKey, () => seed.length ? seed.map(String) : ['']);
  const [focused, setFocused] = useState(-1);
  const inputs = useRef([]), goTo = useRef(null), report = useRef(onWork);
  report.current = onWork;
  useEffect(() => { const steps = lines.filter(l => l.trim()); report.current?.({ label: 'steps', value: steps.join('\n'), brief: `steps: ${steps.join(' → ')}` }); }, [lines]);
  useEffect(() => () => report.current?.(null), []);
  // A step added or taken away has the keys once it is drawn, at its end.
  useEffect(() => { const el = goTo.current !== null && inputs.current[goTo.current]; goTo.current = null; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  const keys = (e, i) => {
    const el = e.currentTarget, atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (nextHole(e)) return;
    if (e.key === 'Enter') { e.preventDefault(); if (atEnd && !done) { goTo.current = i + 1; setLines(l => l.toSpliced(i + 1, 0, l[i])); } }
    else if (e.key === 'Backspace' && !el.value && lines.length > 1 && !done) { e.preventDefault(); goTo.current = Math.max(0, i - 1); setLines(l => l.toSpliced(i, 1)); }
    else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); goTo.current = i - 1; setFocused(i - 1); }
    else if (e.key === 'ArrowDown' && i < lines.length - 1) { e.preventDefault(); goTo.current = i + 1; setFocused(i + 1); }
  };
  return <div className="zone zone-latex">{lines.map((line, i) => {
    const shown = line.trim() ? tex(line) : '';
    return <div key={i} className={`latex-step${focused === i ? ' is-focused' : ''}`}>
      {shown === null ? <div className="latex-out is-bad" onClick={() => inputs.current[i]?.focus()}>{line}</div>
        : <div className="latex-out" onClick={() => inputs.current[i]?.focus()} dangerouslySetInnerHTML={{ __html: shown }}/>}
      <input ref={el => { inputs.current[i] = el; }} className="latex-src" value={line} readOnly={done} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off"
        aria-label={`Step ${i + 1}, in LaTeX`} onFocus={() => setFocused(i)} onBlur={() => setFocused(f => f === i ? -1 : f)}
        onChange={e => setLines(l => l.with(i, e.target.value))} onKeyDown={e => keys(e, i)}/>
    </div>;
  })}
  {!done && <Palette field={() => inputs.current[focused >= 0 ? focused : lines.length - 1]}/>}
  </div>;
}
