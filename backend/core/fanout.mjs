// Streaming and deadlines (v10, audit §4 D7): read a model's JSON while it streams, start work the moment the fields it
// needs are in, and cap a wait with a fallback. The director's cards and thoughts run on these.

/**
 * The fields a streaming JSON text has completed so far: the text up to its last complete value (a comma or a closing
 * bracket outside a string), with what is still open closed. Null until the first value completes.
 */
export function partialJson(text) {
  let inString = false, escaped = false;
  const stack = [], cuts = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { stack.pop(); cuts.push([i + 1, stack.slice()]); }
    else if (c === ',') cuts.push([i, stack.slice()]);
  }
  for (let k = cuts.length - 1; k >= 0 && k >= cuts.length - 3; k--) { const [at, open] = cuts[k]; try { return JSON.parse(text.slice(0, at) + open.reverse().join('')); } catch { /* an earlier cut */ } }
  return null;
}

/**
 * onText for a streamed JSON call: each step runs once, the first time its `when(partial)` holds, with the fields so far
 * (a field appears only when complete). Steps are checked in order on every delta; parsing stops once all have run.
 */
export function onFields(steps) {
  let text = '';
  const done = new Set();
  return delta => {
    text += delta;
    if (done.size === steps.length) return;
    const p = partialJson(text);
    if (p) steps.forEach((step, i) => { if (!done.has(i) && step.when(p)) { done.add(i); step.run(p); } });
  };
}

/** `promise`, or `fallback` once `ms` have passed: slow work gives way (it is not stopped); a rejection still rejects. */
export function within(promise, ms, fallback = null) {
  let timer;
  return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(fallback), Math.max(0, ms)); timer.unref?.(); })]).finally(() => clearTimeout(timer));
}
