import React, { Component, Suspense, lazy, useEffect, useMemo, useReducer, useRef } from 'react';
import { REGISTRY, checkElementSpec } from '../../shared/elements/registry.mjs';
import { createTask } from '../../shared/elements/task.mjs';
import Circuit from './Circuit.jsx';
import Trace from './Trace.jsx';
import Figure from './Figure.jsx';
import { KIND_VIEWS } from './kinds.jsx';
import './elements.css';

// three.js comes only with a scene: its own chunk, fetched the first time one is shown (a chunk that fails to
// load shows nothing, like a spec that fails its check).
const Scene3D = lazy(() => import('./Scene3D.jsx').catch(() => ({ default: () => null })));
// What the student does on an element reaches Plato as one "[Student's page] …" line, once they pause.
const SETTLE_MS = 800;
// A renderer that throws blanks its own visual, never the page and conversation around it. A new `reset` value
// (say, the next page) tries again.
export class Guard extends Component {
  state = { failed: false, reset: this.props.reset };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps({ reset }, state) { return reset !== state.reset ? { failed: false, reset } : null; }
  componentDidCatch(error) { console.error('A view on the page failed:', error); }
  render() { return this.state.failed ? null : this.props.children; }
}
// A figure and a 3D scene draw their own spec (their state is just it).
const VIEWS = { stepper: Trace, circuit: Circuit, figure: ({ state }) => <Figure spec={state.spec}/>, scene3d: ({ state }) => <Suspense fallback={<figure className="element-scene"><div className="scene-view is-loading"/></figure>}><Scene3D spec={state.spec}/></Suspense>, ...KIND_VIEWS };
let drawn = 0;

/** The tasks on the page now: each learner turn is offered to them (a prediction), and "done" collects constructions. */
export const liveTasks = new Set();

/**
 * An element on Plato's page (docs/system-spec.md §15b): `element` is an ElementSpec from a card ({ kind, state, task,
 * … }) or an older { kind, spec }, checked again here (one that fails shows nothing). Its task layer (shared/elements/
 * task.mjs) gates reveals on predictions, diffs them against the engine's truth and sends the evidence (`onEvidence`,
 * for a card's element: `cardId`). `beat` counts Plato's finished lines (a trace with no task steps with them);
 * `onContext(text)` tells Plato what the student did. `branches` are the card's page-state signatures.
 */
export default function Element({ element, cardId = null, beat = 0, onContext, onEvidence, branches = [], persona = null }) {
  const shown = useMemo(() => { try { return { spec: checkElementSpec(element), key: ++drawn }; } catch { return null; } }, [element]);
  const timer = useRef(0), hooks = useRef(null);
  hooks.current = { onContext, onEvidence };
  useEffect(() => () => clearTimeout(timer.current), []);
  // Task lines go at once (context coalesces them); what they move goes once they pause.
  const tell = useRef(text => hooks.current.onContext?.(text)).current;
  const settle = useRef(text => { clearTimeout(timer.current); timer.current = setTimeout(() => hooks.current.onContext?.(text), SETTLE_MS); }).current;
  const emit = useRef(event => hooks.current.onEvidence?.(event)).current;
  if (!shown) return null;
  const { spec, key } = shown, common = { cardId, beat, tell, settle, emit, branches, persona };
  if (spec.kind === 'compare') return <Guard key={key}><Compare spec={spec} id={String(key)} {...common}/></Guard>;
  return <Guard key={key}><Instance spec={spec} id={String(key)} prefix="" {...common}/></Guard>;
}

// A compare is one element with one task (its evidence: shown, what they said about the difference, the level reached);
// its two sides are its parts, stepped together, each acting through the whole.
// ponytail: the sides send no evidence of their own (a checkpoint on one side gates but isn't reported); report them
// through the whole if a compare ever carries per-side checkpoints.
function Compare({ spec, id, cardId, tell, emit, persona, ...common }) {
  const whole = useMemo(() => createTask(spec, { id: `el${id}`, cardId, emit, tell, persona }), [spec]), linked = useRef([]).current;
  useEffect(() => {
    const live = { kind: 'compare', hear: text => whole.hear(text), done: () => whole.done(), drawn: () => {}, brief: whole.brief, task: whole };
    liveTasks.add(live);
    return () => { liveTasks.delete(live); whole.retire(); };
  }, [whole]);
  return <div className="element-compare" role="group" aria-label={`Two cases that differ in ${spec.state.difference || 'one feature'}`}>
    {spec.state.pair.map((side, i) => <div key={i} className="compare-side">
      {side.title && <h3 className="page-label">{side.title}</h3>}
      <Instance spec={side} id={`${id}${'ab'[i]}`} prefix={`${'ab'[i]}.`} linked={linked} side={i} whole={whole} cardId={null} tell={tell} emit={emit} persona={persona} mark={spec.state.at} {...common}/>
    </div>)}
  </div>;
}

// A compare's two sides step together (linked): an action on one is tried on the other too, where it applies.
function Instance({ spec, id, prefix, cardId, beat, tell, settle, emit, branches, persona, linked = null, side = 0, whole = null, mark = null }) {
  const task = useMemo(() => createTask(spec, { id: `el${id}`, cardId, emit, tell, signatures: branches, persona }), [spec]);
  const [, redraw] = useReducer(n => n + 1, 0);
  useEffect(() => {
    const live = { kind: spec.kind, hear: text => { const took = task.hear(text); if (took) redraw(); return took; }, done: () => { const said = task.done(); redraw(); return said; },
      drawn: reading => { task.drawn(reading); redraw(); }, brief: task.brief, task };
    liveTasks.add(live);
    return () => { liveTasks.delete(live); task.retire(); };
  }, [task]);
  const act = (action, echo = true) => {
    const done = task.act(action);
    redraw();
    if (done) settle(`[Student's page] On the ${linked ? (side ? 'second ' : 'first ') : ''}${spec.kind} they ${action === 'next' ? 'stepped on' : action}: ${task.brief()}.`.slice(0, 400));
    if (done && echo && linked) linked.forEach((other, i) => { if (i !== side) other?.(action, false); });
    if (done && echo) whole?.act(action); // the compare as a whole reached changing
    return done;
  };
  if (linked) linked[side] = act;
  const View = VIEWS[spec.kind];
  if (!View) return null;
  // What a checkpoint still waits on is hidden until it is revealed: a view never draws the outcome or verdict of a
  // predicted name (a plot, a readout, an equilibrium, a claim struck through), only the element's current inputs.
  const hidden = new Set(task.checkpoints.filter(c => !c.revealed).flatMap(c => c.predict));
  return <div className="element" data-kind={spec.kind}>
    <View state={task.state} spec={spec} act={act} task={task} anchor={name => `${prefix}${name}`} beat={beat} hidden={hidden}/>
    <Predictions task={task} persona={persona} anchor={name => `${prefix}${name}`}/>
    {/* A repair compare starts revealed: the value the two runs differ in, under each (theirs terracotta, the truth lapis). */}
    {mark && spec.revealed && <p className={`compare-value ${side ? 'is-truth' : 'is-theirs'}`} data-anchor={`${prefix}value`}>{mark} = {String(REGISTRY[spec.kind].engine.visible(task.state)[mark] ?? '?')}</p>}
  </div>;
}

/** The learner's committed predictions (or the classmate's attempt), and once revealed, the engine's truth beside them. */
function Predictions({ task, persona, anchor }) {
  const rows = task.checkpoints.filter(c => c.prediction || task.open() === c);
  if (!rows.length) return null;
  return <div className="task-rows">{rows.map(c => <p key={c.i} className="task-row">
    {c.prediction?.by === 'persona' && <span className="task-who">{persona?.name || 'Classmate'}</span>}
    {c.predict.map(name => {
      const said = c.prediction?.values?.[name], r = c.revealed?.diff.find(d => d.name === name);
      return <span key={name} className="task-cell" data-anchor={anchor(`guess-${name.replace(/\s+/g, '-')}`)}>
        <span className="task-name">{name}</span>
        <span className={`task-guess${said == null ? ' is-open' : ''}`}>{said ?? '?'}</span>
        {r && <span className={`task-truth ${r.match ? 'is-right' : 'is-wrong'}`} aria-label={r.match ? `matches: ${r.actual}` : `actually ${r.actual}`}>{r.actual}</span>}
      </span>;
    })}
  </p>)}</div>;
}
