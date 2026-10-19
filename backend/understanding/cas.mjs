import { Worker, isMainThread, parentPort } from 'node:worker_threads';

// V3's computer algebra (docs/system-spec.md §9): mathjs in a worker thread, so an expansion that blows up (mathjs's
// rationalize is exponential in the degree: (x+1)^6 runs for minutes) is cut off at a deadline and never blocks the
// server. It only ever proves equality: simplify(a − b) = 0, else the numerator of the rationalized difference is 0.
// A failure to prove is no verdict; verify.mjs's numeric identity tests decide then.

if (!isMainThread && parentPort) {
  const m = await import('mathjs');
  parentPort.on('message', ({ id, a, b }) => {
    let equal = null;
    try { if (m.symbolicEqual(a, b)) equal = true; } catch { /* not provable this way */ }
    if (!equal) try { if (m.simplify(m.rationalize(m.parse(`(${a})-(${b})`), {}, true).numerator).toString() === '0') equal = true; } catch { /* not a rational expression */ }
    parentPort.postMessage({ id, equal });
  });
}

let worker = null, seq = 0;
const waiting = new Map(); // id → resolve
const stop = () => { const w = worker; worker = null; for (const done of waiting.values()) done(null); waiting.clear(); w?.terminate().catch(() => {}); };
function spawn() {
  const w = worker = new Worker(new URL(import.meta.url)), gone = () => { if (worker === w) stop(); }; // a stopped worker's exit never stops its successor
  // A pending call's deadline timer keeps the process alive, never the idle worker (a delivered message refs it again: unref after each).
  w.unref();
  w.on('message', ({ id, equal }) => { w.unref(); waiting.get(id)?.(equal); waiting.delete(id); });
  w.on('error', gone); w.on('exit', gone);
  return w;
}

/** Are two mathjs expressions provably equal? → true, or null (not proven: different, too slow, or unparseable). */
export function casEqual(a, b, ms = 1500) {
  return new Promise(resolve => {
    const id = ++seq, timer = setTimeout(stop, ms); // the deadline: the worker goes (with anything queued behind) and the next call starts a fresh one
    waiting.set(id, equal => { clearTimeout(timer); resolve(equal === true ? true : null); });
    try { (worker ?? spawn()).postMessage({ id, a, b }); } catch { waiting.delete(id); clearTimeout(timer); resolve(null); }
  });
}
