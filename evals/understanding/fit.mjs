// Element fit, offline (the lead, 2026-10-09; a product check, no decision rule): for KCs of each fixture, stage's generator
// (`elements.generate`) makes the predict element the director would ask for (the kind pregen picks: generatable, the
// KC's adapter, predict mode; the KC's first item with a key as the case). Reported: a valid spec, the engine runs it,
// its truth matches the key, stage's leak check (shared/elements/registry.mjs `leaks`) on it and on every prepared
// predict element of the course model, and, for information only (uncalibrated), the narrow judge's "does this element
// show this KC's idea on this case?". Two at a time, capped. Usage: node fit.mjs <out dir> [per-fixture cap]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadFixture, openApp, getRuntime, ask, S, clip, closeRuntime } from './lib.mjs';
import { NARROW } from './prompts.mjs';
import { REGISTRY, checkElementSpec, truthOf, leaks } from '../../shared/elements/registry.mjs';
import { GENERATABLE } from '../../shared/elements/generate.mjs';
import { valuesOf } from '../../backend/director/cards.mjs';
// The engine's kind chooser (backend/director/index.mjs fitKind, mirrored here: it is internal to the director): the
// kinds the topic's other KCs use, most used first; else by the content's shape; none fits: null (no element).
function fitKind(U, scope, cm, kc, sl, mode) {
  const ok = k => GENERATABLE.includes(k) && REGISTRY[k]?.modes.includes(mode), text = `${kc.statement ?? ''} ${sl?.explanation?.plain ?? ''}`, dated = /\b(?:1[0-9]{3}|20[0-9]{2})s?\b|\bcentur(?:y|ies)\b/i.test(text);
  const n = {}; for (const k of cm.kcs.filter(k => k.topicId === kc.topicId && k.id !== kc.id)) for (const r of (() => { try { return U.forKc(scope, k.id); } catch { return null; } })()?.representations || []) if (r.spec && ok(r.kind) && (r.kind !== 'timeline' || dated)) n[r.kind] = (n[r.kind] || 0) + 1;
  const sibling = Object.entries(n).sort((x, y) => y[1] - x[1])[0]?.[0];
  if (sibling) return sibling;
  return [dated && 'timeline', valuesOf(kc.statement ?? '').size && 'numberline', kc.kind === 'epistemic' && 'argmap'].find(k => k && ok(k)) ?? null;
}
const OUT = process.argv[2], CAP = Number(process.argv[3] ?? 3), FIXTURES = ['cs3410', 'bio', 'history', 'linalg'];
const QUESTION = "Does this interactive element show the knowledge component's idea, worked on this case, so that a learner using it would see the idea at work?";
const literal = v => v == null ? null : typeof v === 'object' ? (v.value ?? v.literal ?? null) : v;
const rows = [], prepared = [], noFit = [];
for (const fx of FIXTURES) {
  await loadFixture(fx); const app = await openApp(await getRuntime()), U = app.services.understanding, cm = U.courseModel(app.scope);
  // Prepared predict elements (the course model's representations): stage's leak check.
  for (const kc of cm.kcs) { const sl = (() => { try { return U.forKc(app.scope, kc.id); } catch { return null; } })();
    for (const r of sl?.representations || []) { if (!r.spec || !REGISTRY[r.kind] || r.spec.task?.mode !== 'predict') continue;
      let leak = null, valid = true; try { const spec = checkElementSpec({ kind: r.kind, ...r.spec }); leak = null; } catch (e) { valid = false; leak = /shows|says|already shows/.test(e.message) ? e.message : null; if (!leak) { try { leak = leaks({ kind: r.kind, ...r.spec }); } catch {} } }
      prepared.push({ fx, kc: kc.id, kind: r.kind, valid, leak }); } }
  // KCs with a keyed item, spread over topics, capped.
  const picks = [];
  for (const kc of cm.kcs) { if (picks.length >= CAP) break; const sl = (() => { try { return U.forKc(app.scope, kc.id); } catch { return null; } })(); if (!sl) continue;
    const short = p => { const v = literal(p.key ?? p.answer); return v != null && String(v).length <= 40; }, it = (sl.problems || []).find(short) ?? (sl.problems || [])[0], adapter = (sl.problems || []).find(p => p.adapter)?.adapter ?? cm.adapters?.[0] ?? null;
    const kind = fitKind(U, app.scope, cm, kc, sl, 'predict');
    if (!kind) { if (!picks.some(p => p.kc.topicId === kc.topicId) && !noFit.some(x => x.topicId === kc.topicId)) noFit.push({ fx, kc: kc.id, topicId: kc.topicId }); continue; }
    if (kind && it && !picks.some(p => p.kc.topicId === kc.topicId)) picks.push({ kc, it, kind, adapter }); }
  for (let i = 0; i < picks.length; i += 2) await Promise.all(picks.slice(i, i + 2).map(async ({ kc, it, kind, adapter }) => {
    const request = { kind, mode: 'predict', kc: { id: kc.id, statement: clip(kc.statement, 600) }, case: { id: it.id, prompt: clip(it.prompt, 1200), key: (v => v != null && String(v).length <= 40 ? v : null)(literal(it.key ?? it.answer)) } }, t0 = Date.now();
    const r = await app.services.elements.generate(app.scope, request).catch(e => ({ error: e.message })), ms = Date.now() - t0, why = app.services.elements.problems(app.scope, request);
    const row = { fx, kc: kc.id, statement: clip(kc.statement, 200), adapter, kind, case: clip(it.prompt, 200), key: request.case.key, ms, rejected: why, valid: !!r?.spec };
    if (r?.spec) { const t = truthOf(r.spec.kind, r.spec.state, r.spec.task?.checkpoints || []); row.runs = !t.failed; row.truth = r.answerName ? t.rows.map(x => x[r.answerName]).filter(v => v != null).at(-1) ?? null : null; row.keyMatches = request.case.key == null ? null : row.truth != null && String(row.truth) === String(request.case.key); row.leak = (() => { try { return leaks(r.spec); } catch (e) { return `check failed: ${e.message}`; } })(); row.spec = r.spec; row.title = r.title; row.summary = r.summary;
      const j = await ask({ role: 'heavy', effort: 'medium', instructions: NARROW({ question: QUESTION }), schema: S.obj({ items: S.arr(S.obj({ id: S.str, verdict: S.en(['yes', 'no']), confidence: S.num })) }), input: { items: [{ id: 'e', knowledgeComponent: kc.statement, case: it.prompt, element: { kind: r.spec.kind, title: r.title, summary: r.summary, state: clip(JSON.stringify(r.spec.state), 4000), task: r.spec.task } }] } }).catch(() => null);
      row.judge = j?.items?.[0]?.verdict ?? null; }
    rows.push(row); console.log(`${fx} ${kind} ${kc.id}: ${row.valid ? `valid, runs ${row.runs}, key ${row.keyMatches == null ? 'none (prose answer)' : row.keyMatches ? 'matches' : `no (${row.truth} vs ${row.key})`}, leak ${row.leak ? 'YES' : 'no'}, judge ${row.judge}` : `rejected: ${why.join(' | ').slice(0, 160)}`} · ${Math.round(ms / 1000)} s`);
  }));
  app.close?.();
}
writeFileSync(path.join(OUT, 'fit.json'), JSON.stringify({ at: new Date().toISOString(), leakCheck: 'shared/elements/registry.mjs leaks (stage, sha ' + process.env.REGISTRY_SHA + ')', rows, prepared }, null, 1));
const by = (xs, k) => xs.reduce((o, x) => ({ ...o, [x[k]]: [...(o[x[k]] || []), x] }), {});
console.log(`\nGENERATED ${rows.length}: valid ${rows.filter(r => r.valid).length}, runs ${rows.filter(r => r.runs).length}, key matches ${rows.filter(r => r.keyMatches).length}, leaks ${rows.filter(r => r.leak).length}, judge yes ${rows.filter(r => r.judge === 'yes').length}`);
for (const [k, xs] of Object.entries(by(rows, 'kind'))) console.log(`  ${k}: ${xs.length} · valid ${xs.filter(r => r.valid).length} · leaks ${xs.filter(r => r.leak).length}`);
console.log(`NO KIND FITS (no element; the card falls back): ${noFit.length}${noFit.length ? ': ' + noFit.map(x => `${x.fx} ${x.kc}`).join(', ') : ''}`);
console.log(`PREPARED predict elements ${prepared.length}: leaks ${prepared.filter(p => p.leak).length}`); for (const [k, xs] of Object.entries(by(prepared, 'kind'))) console.log(`  ${k}: ${xs.length} · leaks ${xs.filter(p => p.leak).length}`);
await closeRuntime(); process.exit(0);
