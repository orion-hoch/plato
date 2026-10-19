// The interactive formula (show_visual, diagram_type "formula"; Formula.jsx draws it): its data checked, and its
// result's expression compiled by a small parser into a function of the variables. No eval or Function: numbers,
// + − × / ^ (also * ** · ÷), parentheses, the variables, and log2 ln sqrt min max abs floor ceil pow sin cos tan exp.
// { latex, variables: [{ name, label, value, min, max, step, unit }] (1-6), result: { name, expr, unit } }
import katex from 'katex';
import { checks, str, clip, numeric } from '../../shared/elements/check.mjs';

const { fail, num, arr, object } = checks('formula');
const FUNCTIONS = { log2: [1, Math.log2], ln: [1, Math.log], sqrt: [1, Math.sqrt], abs: [1, Math.abs], floor: [1, Math.floor], ceil: [1, Math.ceil], pow: [2, Math.pow], min: [0, Math.min], max: [0, Math.max], sin: [1, Math.sin], cos: [1, Math.cos], tan: [1, Math.tan], exp: [1, Math.exp] };
const NAME = /^[A-Za-z_]\w{0,15}$/;
const TOKEN = /\s*(?:((?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)|([A-Za-z_]\w*)|(\*\*|[-+*/^(),×·÷−]))/iy;
const SAME = { '**': '^', '×': '*', '·': '*', '÷': '/', '−': '-' };
// A number written as a string ("0.1") is a number.

/** `expr` as a function of { name: value }; throws "Invalid formula: …" naming what it can't read. */
export function compile(expr, names) {
  const source = String(expr), tokens = [];
  for (let at = 0; at < source.length;) {
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(source);
    if (!m) { if (source.slice(at).trim()) fail(`result.expr: can't read "${source.slice(at).trim().slice(0, 12)}"`); break; }
    at = TOKEN.lastIndex;
    tokens.push(m[1] ? { num: +m[1] } : m[2] ? { name: m[2] } : { op: SAME[m[3]] || m[3] });
  }
  let i = 0;
  const eat = op => tokens[i]?.op === op && ++i, need = op => eat(op) || fail(`result.expr: expected "${op}"`);
  const binary = (next, ops) => () => {
    let f = next();
    for (let op; (op = ops.find(eat));) { const a = f, b = next(); f = op === '+' ? v => a(v) + b(v) : op === '-' ? v => a(v) - b(v) : op === '*' ? v => a(v) * b(v) : v => a(v) / b(v); }
    return f;
  };
  const sum = binary(() => product(), ['+', '-']), product = binary(() => unary(), ['*', '/']);
  // -x^2 is -(x^2); 2^-1 and 2^3^2 (= 2^9) read as usual.
  function unary() { if (eat('-')) { const a = unary(); return v => -a(v); } return eat('+') ? unary() : power(); }
  function power() { const a = atom(); if (!eat('^')) return a; const b = unary(); return v => a(v) ** b(v); }
  function atom() {
    const t = tokens[i++];
    if (!t) fail('result.expr ends too soon');
    if (t.num !== undefined) return () => t.num;
    if (t.op === '(') { const f = sum(); need(')'); return f; }
    if (t.name && Object.hasOwn(FUNCTIONS, t.name)) {
      need('(');
      const args = [sum()];
      while (eat(',')) args.push(sum());
      need(')');
      const [arity, fn] = FUNCTIONS[t.name];
      if (arity && args.length !== arity) fail(`result.expr: ${t.name} takes ${arity} argument${arity > 1 ? 's' : ''}`);
      return v => fn(...args.map(a => a(v)));
    }
    if (t.name) return names.includes(t.name) ? v => v[t.name] : fail(`result.expr uses ${t.name}, which is not a variable (${names.join(', ')}) or a function (${Object.keys(FUNCTIONS).join(', ')})`);
    fail(`result.expr: unexpected "${t.op}"`);
  }
  const f = sum();
  if (i < tokens.length) fail(`result.expr: unexpected "${tokens[i].op ?? tokens[i].name ?? tokens[i].num}"${tokens[i].op === undefined || tokens[i].op === '(' ? '; multiply with * (2*x, not 2x)' : ''}`);
  return f;
}

// A slider step of 1, 2 or 5 times a power of ten, about 200 steps across the range.
const niceStep = span => { const raw = span / 200, p = 10 ** Math.floor(Math.log10(raw)); return +([1, 2, 5, 10].map(m => m * p).find(s => s >= raw)).toPrecision(12); };

/** The formula's data, checked and normalized (an object or a JSON string); throws "Invalid formula: …". */
export function formulaSpec(input) {
  const raw = object(input, 'diagram_data');
  const latex = str(raw.latex).trim();
  if (latex.length > 400) fail('latex is over 400 characters');
  if (latex) { try { katex.renderToString(latex, { throwOnError: true, strict: 'ignore', trust: false }); } catch (problem) { fail(`latex doesn't parse (${String(problem.message).replace(/^KaTeX parse error: /, '').slice(0, 120)})`); } }
  const variables = arr(raw.variables, 'variables', 1, 6).map((v, i) => {
    const at = `variables[${i}]`, name = str(v?.name).trim();
    if (!NAME.test(name)) fail(`${at}.name must be a short name of letters, digits and _ (the expr uses it)`);
    if (Object.hasOwn(FUNCTIONS, name)) fail(`${at}.name ${name} is a function's name; pick another`);
    const min = num(numeric(v.min), `${at}.min`), max = num(numeric(v.max), `${at}.max`);
    if (max <= min) fail(`${at}.max must be greater than its min`);
    const value = num(numeric(v.value), `${at}.value`, min, max), step = v.step == null ? niceStep(max - min) : num(numeric(v.step), `${at}.step`, Number.MIN_VALUE, max - min);
    return { name, label: clip(str(v.label).trim(), 48), value, min, max, step, unit: clip(str(v.unit).trim(), 24) };
  });
  const names = variables.map(v => v.name);
  if (new Set(names).size < names.length) fail('variables must have different names');
  const r = raw.result && typeof raw.result === 'object' ? raw.result : fail('result must be {"name", "expr", "unit"}');
  const result = { name: clip(str(r.name).trim(), 24) || fail('result.name is required'), expr: str(r.expr).trim() || fail('result.expr is required'), unit: clip(str(r.unit).trim(), 24) };
  if (result.expr.length > 300) fail('result.expr is over 300 characters');
  const start = compile(result.expr, names)(Object.fromEntries(variables.map(v => [v.name, v.value])));
  if (!Number.isFinite(start)) fail(`result.expr gives ${start} at the starting values; check it`);
  return { latex, variables, result };
}

/** A value to read: up to four significant figures (whole from 1000 up), thousands separated, a true minus; — when undefined. */
export const shown = v => !Number.isFinite(v) ? '—' : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US', { maximumSignificantDigits: 4 })).replace('-', '−');
/** A value to edit: plain digits, up to six significant figures. */
export const plain = v => String(+v.toPrecision(6));
