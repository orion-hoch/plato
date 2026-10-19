// A trace table (programs, algorithms, any procedure that updates a few values step by step): a thin view over the
// stepper (trace.mjs), whose interpreter computes every row. Row 0 holds the values before the first step, row N the
// values after step N. The learner fills it a row at a time: a row a checkpoint holds waits for their prediction.
import { checks, str } from './check.mjs';
import { validate as traceSpec, steps as traceSteps, values as traceValues } from './trace.mjs';

const { fail, int, arr, object } = checks('tracetable');

export const purpose = 'a trace table: a few values of a short program (or any stepped procedure) row by row, one row per step, computed by the stepper; the learner predicts each row before it is shown';

export const example = {
  trace: { lang: 'riscv', code: 'li t0, 0\nli t1, 1\nloop:\n  add t0, t0, t1\n  addi t1, t1, 1\n  li t2, 4\n  blt t1, t2, loop', watch: ['t0', 't1'] },
  columns: ['t0', 't1'],
  rows: 8,
};

export const rules = `spec: {"trace", "columns", "rows"}:
- trace: a stepper spec (the stepper's rules: lang, code, watch, init; for riscv the interpreter computes every value, for c write steps).
- columns: 1 to 6 names the trace shows: watched registers or variables, or "mem <address>" for a memory cell.
- rows: how many steps to tabulate, 1 to 40 (default: the whole run, up to 24).
Row 0 is the values before the first step; row N is after step N. A checkpoint "row N" waits for the learner's prediction of that row's columns. Example: ${JSON.stringify(example)}`;

export const info = { bestFor: ["consolidation", "repair"], task: "predict: checkpoints at 'row N' (row N is filled after step N); predict the columns by name.",  adapters: ['A1', 'A2'], modes: ['predict', 'change', 'compare'], translations: ['stepper', 'memory'], reveals: ['F1', 'F6', 'F7'],
  notice: ['which values change on each row', 'the row where the loop condition turns false'] };

export function validate(input) {
  const raw = object(input);
  let trace;
  try { trace = traceSpec(raw.trace); } catch (error) { fail(`trace: ${String(error.message).replace(/^Invalid trace: /, '')}`); }
  const list = traceSteps(trace), shown = Object.keys(traceValues({ spec: trace, steps: list, at: 0 })).filter(name => name !== 'line');
  const columns = arr(raw.columns, 'columns', 1, 6).map(name => str(name).trim());
  for (const name of columns) if (!shown.includes(name)) fail(`columns: the trace does not show ${JSON.stringify(name)}; use names it shows (${shown.join(', ')})`);
  if (new Set(columns).size < columns.length) fail('columns names a value twice');
  const most = list.length - 1;
  if (most < 1) fail('the trace takes no steps');
  return { trace, columns, rows: raw.rows == null ? Math.min(most, 24) : int(raw.rows, 'rows', 1, Math.min(most, 40)) };
}

/** Every row computed once (the stepper's run); `at` is the last row shown. */
export function init(spec) {
  const list = traceSteps(spec.trace), row = n => { const v = traceValues({ spec: spec.trace, steps: list, at: n }); return Object.fromEntries(spec.columns.map(c => [c, v[c] ?? ''])); };
  return { spec, table: Array.from({ length: spec.rows + 1 }, (_, n) => row(n)), at: 0 };
}
export const next = 'next';
export function step(state, action) {
  if (action === 'next') return { ...state, at: Math.min(state.spec.rows, state.at + 1) };
  if (action === 'reset') return { ...state, at: 0 };
  fail(`unknown action ${JSON.stringify(action)}; use next or reset`);
}
export const passes = (state, action) => action === 'next' && state.at < state.spec.rows ? [`row ${state.at + 1}`] : [];
/** The columns at the last row shown. */
export const values = state => ({ ...state.table[state.at] });
export function gate(state, at) {
  const m = /^row\s+(\d+)$/i.exec(str(at).trim());
  if (!m || +m[1] < 1 || +m[1] > state.spec.rows) fail(`a trace table's checkpoint "at" is "row N", N from 1 to ${state.spec.rows}, not ${JSON.stringify(at)}`);
  return `row ${+m[1]}`;
}
export const brief = state => `row ${state.at} of ${state.spec.rows}: ${state.spec.columns.map(c => `${c}=${state.table[state.at][c]}`).join(', ')}`;
export const anchors = state => [...state.spec.columns.map(c => `col-${c}`), ...state.table.flatMap((_, n) => [`row-${n}`, ...state.spec.columns.map(c => `cell-${n}-${c}`)])];
