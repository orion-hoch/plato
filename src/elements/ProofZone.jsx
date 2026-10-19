import React, { useEffect, useRef, useState } from 'react';
import BoardRichText from '../BoardRichText.jsx';
import { Palette, nextHole } from '../equations/Palette.jsx';
import { useDraft } from '../checkpoint.js';

// A proof written in sections (15 Oct, the user: "proof writing sections of the white board where you type into the region
// with LaTeX sections that are user configurable"). Each section is a heading they can rename and a body of prose with
// $math$ (markdown too), drawn as it is typed with its source small beneath, like the LaTeX zone. Sections move up and
// down, go, and come; a proof shape (induction's five parts, contradiction, …) lays the sections out, keeping what is
// written under a heading it shares. The symbol palette writes into the body being typed in, inside $…$.
// After every change, onWork({ label, value, brief }): value is the proof, one "## heading" per section.
export const SHAPES = {
  Direct: ['Claim', 'Let / Assume', 'Proof', 'Conclusion'],
  Cases: ['Claim', 'Case 1', 'Case 2', 'Conclusion'],
  'Two directions': ['Claim', '(⇒) / (⊆)', '(⇐) / (⊇)', 'Conclusion'],
  Contrapositive: ['Claim', 'Contrapositive', 'Assume', 'Proof', 'Conclusion'],
  Contradiction: ['Claim', 'Assume, for contradiction', 'Derive a contradiction', 'Conclusion'],
  Induction: ['Inductive statement P(n)', 'Base case', 'Inductive hypothesis', 'Inductive step', 'Conclusion'],
  'Strong induction': ['Inductive statement P(n)', 'Base cases', 'Inductive hypothesis (all k ≤ n)', 'Inductive step', 'Conclusion'],
  Bijection: ['Claim', 'Well-defined', 'Injective', 'Surjective', 'Conclusion'],
  Counterexample: ['Claim (false)', 'Counterexample', 'Check'],
};
// The same space for writing that isn't a proof (15 Oct, docs/harness-generalization.md: any course): opened with one of these
// layouts' headings, it offers these instead.
export const LAYOUTS = {
  Essay: ['Thesis', 'Evidence', 'Analysis', 'Counterargument', 'Conclusion'],
  'Lab report': ['Question and hypothesis', 'Method', 'Data', 'Analysis', 'Conclusion'],
  Derivation: ['Given', 'Goal', 'Steps', 'Result', 'Check'],
  'Worked problem': ['Given', 'Find', 'Method', 'Answer', 'Check'],
  'Case brief': ['Facts', 'Issue', 'Rule', 'Analysis', 'Conclusion'],
};
const WRITING = new Set(Object.values(LAYOUTS).flat().filter(h => !Object.values(SHAPES).flat().includes(h)).map(h => h.toLowerCase()));
const blank = heading => ({ heading, body: '' });

export default function ProofZone({ sections: seed = [], done = false, onWork, draftKey = null }) {
  const [sections, setSections] = useDraft(draftKey, () => (seed.length ? seed : SHAPES.Direct).map(h => typeof h === 'string' ? blank(h) : { heading: String(h.heading || ''), body: String(h.body || '') }));
  const [focused, setFocused] = useState(-1);
  const [shapes] = useState(() => seed.some(h => WRITING.has(String(h?.heading ?? h).trim().toLowerCase())) ? LAYOUTS : SHAPES);
  const bodies = useRef([]), report = useRef(onWork);
  report.current = onWork;
  useEffect(() => {
    const value = sections.map(s => `## ${s.heading.trim() || 'Section'}\n${s.body.trim()}`).join('\n\n'), filled = sections.filter(s => s.body.trim()).length;
    report.current?.({ label: 'proof', value, brief: `${shapes === LAYOUTS ? 'writing' : 'proof'} (${filled} of ${sections.length} sections written):\n${value.slice(0, 3000)}` });
  }, [sections]);
  useEffect(() => () => report.current?.(null), []);
  const edit = (i, part) => setSections(l => l.with(i, { ...l[i], ...part }));
  const move = (i, by) => setSections(l => { const j = i + by; if (j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  // A shape's sections, each with what was written under the same heading; anything written under another heading stays, after them.
  const shape = headings => setSections(l => {
    const has = h => l.find(s => s.heading.trim().toLowerCase() === h.toLowerCase());
    return [...headings.map(h => has(h) || blank(h)), ...l.filter(s => s.body.trim() && !headings.some(h => h.toLowerCase() === s.heading.trim().toLowerCase()))];
  });
  const grow = el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } };

  return <div className="zone zone-proof">
    {!done && <div className="proof-shapes" role="group" aria-label={shapes === LAYOUTS ? 'Layout' : 'Proof shape'}>
      {Object.entries(shapes).map(([name, headings]) => <button key={name} type="button" onClick={() => shape(headings)}>{name}</button>)}
    </div>}
    {sections.map((s, i) => <section key={i} className={`proof-section${focused === i ? ' is-focused' : ''}`}>
      <div className="proof-head">
        <input className="proof-heading" value={s.heading} readOnly={done} aria-label={`Section ${i + 1} heading`} spellCheck={false} onChange={e => edit(i, { heading: e.target.value })}/>
        {!done && <span className="proof-keys">
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
          <button type="button" aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(i, 1)}>↓</button>
          <button type="button" aria-label="Remove section" disabled={sections.length === 1} onClick={() => setSections(l => l.toSpliced(i, 1))}>×</button>
        </span>}
      </div>
      {s.body.trim() && <div className="proof-out" onClick={() => bodies.current[i]?.focus()}><BoardRichText text={s.body}/></div>}
      <textarea ref={el => { bodies.current[i] = el; grow(el); }} className="proof-src" value={s.body} readOnly={done} rows={2} spellCheck={false}
        placeholder={done ? '' : 'Write here; math in $…$ (or $$…$$ on its own line)'} aria-label={`${s.heading || 'Section'}, in text and LaTeX`}
        onFocus={() => setFocused(i)} onBlur={() => setFocused(f => f === i ? -1 : f)} onKeyDown={e => nextHole(e)}
        onChange={e => { edit(i, { body: e.target.value }); grow(e.target); }}/>
    </section>)}
    {!done && <button type="button" className="proof-add" onClick={() => setSections(l => [...l, blank(`Section ${l.length + 1}`)])}>+ Section</button>}
    {!done && <Palette prose field={() => bodies.current[focused >= 0 ? focused : sections.length - 1]}/>}
  </div>;
}
