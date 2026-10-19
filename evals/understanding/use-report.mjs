// Element and reading use in live course-model sessions (the lead's product check). Usage: node use-report.mjs <run>…
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { processMetrics } from './lib.mjs';
const R = new URL('./runs/', import.meta.url).pathname, ROOT = new URL('../../', import.meta.url).pathname;
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, f = x => x == null ? '–' : (+x).toFixed(2);
const all = { sessions: 0, moves: 0, withEl: 0, kinds: {}, levels: {}, readings: [], wrong: 0, fd: 0, turns: 0, drawMax: 0, over1: 0 };
for (const run of process.argv.slice(2)) for (const id of readdirSync(`${R}${run}/level3`).filter(d => !d.endsWith('.json'))) {
  const file = `${R}${run}/level3/${id}/result.json`; if (!existsSync(file)) { console.log(run, id, 'no result'); continue; }
  const r = JSON.parse(readFileSync(file)), rec = JSON.parse(readFileSync(`${ROOT}${r.runDir}/run.json`)), log = JSON.parse(readFileSync(`${R}${run}/level3/${id}/student.json`)).log;
  const ev = [...rec.events].sort((a, b) => a.at - b.at), cards = ev.filter(e => e.kind === 'server' && e.type === 'card.issued' && e.payload?.card?.move), plato = ev.filter(e => e.kind === 'plato'), students = ev.filter(e => e.kind === 'student');
  all.sessions++;
  for (const c of cards) { all.moves++; const sh = c.payload.card.show; const k = sh?.kind && sh.kind !== 'markdown' ? sh.kind : null; if (k) { all.withEl++; all.kinds[k] = (all.kinds[k] || 0) + 1; } }
  const lv = r.elements?.enactedLevels || []; for (const l of lv) all.levels[l] = (all.levels[l] || 0) + 1; const top = r.elements?.enactedLevel;
  // Readings: framing at the end event, quiet while reading, the questions Plato asked after it before they spoke.
  for (const end of ev.filter(e => e.kind === 'reading' && e.phase === 'end')) { const x = end.event || {}, startAt = ev.filter(e => e.kind === 'reading' && e.phase !== 'end' && e.at <= end.at).at(-1)?.at ?? end.at, next = students.find(s => s.at > end.at)?.at ?? Infinity;
    const during = plato.filter(p => p.at > startAt && p.at < end.at), after = plato.filter(p => p.at >= end.at && p.at < next);
    const said = plato.filter(p => p.at >= startAt - 60000 && p.at <= startAt + 5000).map(p => p.text).join(' ');
    all.readings.push({ id, at: Math.round((end.at - ev[0].at) / 1000), endedBy: x.end ?? x.reason ?? x.endedBy ?? null, prequestionSaid: /before you read, think about this/i.test(said), purposeSaid2: /read (to|it through)/i.test(said), timeSaid2: /takes about \d+ minute/i.test(said), purpose: !!x.framing?.purposeSaid, minutes: !!x.framing?.minutesSaid, prequestions: Array.isArray(x.framing?.prequestions) ? x.framing.prequestions.length : (x.framing?.prequestions ?? 0), tutorWords: x.reading?.tutorWordsDuring ?? during.reduce((n, p) => n + (p.text.match(/\S+/g) || []).length, 0), questionsDuring: during.reduce((n, p) => n + (p.text.match(/\?/g) || []).length, 0), questionsAfter: after.reduce((n, p) => n + (p.text.match(/\?/g) || []).length, 0) }); }
  const pm = processMetrics(rec, log), wrong = pm.verdicts.filter(v => v.wrong).length, fd = log.filter(l => !l.dropped && l.perception?.misattributed).length;
  all.wrong += wrong; all.fd += fd; all.turns += log.filter(l => l.perception).length; const dm = Math.max(0, ...pm.episodes.map(e => e.drawOuts)); all.drawMax = Math.max(all.drawMax, dm); all.over1 += pm.episodes.filter(e => e.drawOuts > 1).length;
  console.log(`${run} ${id}: moves ${cards.length}, with an element ${cards.filter(c => c.payload.card.show?.kind && c.payload.card.show.kind !== 'markdown').length} · enacted ${top ?? '–'} · readings ${ev.filter(e => e.kind === 'reading' && e.phase === 'end').length} · wrong verdicts ${wrong} · false diagnoses ${fd} · draw-outs max ${dm}`);
}
const rd = all.readings;
console.log(`\nALL ${all.sessions} sessions · moves with an element ${all.withEl}/${all.moves} (${f(all.withEl / all.moves)}) · kinds ${JSON.stringify(all.kinds)} · engagement levels reached ${JSON.stringify(all.levels)}`);
console.log(`readings ${rd.length}: purpose said ${rd.filter(x => x.purpose).length}, time said ${rd.filter(x => x.minutes).length}, with prequestions ${rd.filter(x => x.prequestions > 0).length}, tutor words while reading mean ${f(mean(rd.map(x => x.tutorWords)))}, questions while reading ${rd.reduce((n, x) => n + x.questionsDuring, 0)}, questions after: exactly one ${rd.filter(x => x.questionsAfter === 1).length}, none ${rd.filter(x => x.questionsAfter === 0).length}, more than one ${rd.filter(x => x.questionsAfter > 1).length}`);
for (const x of rd) console.log(`   reading ${x.id} @${x.at}s: purpose ${x.purpose || x.purposeSaid2 ? '✓' : '✗'}, prequestion ${x.prequestions > 0 || x.prequestionSaid ? '✓' : '✗'}, time ${x.minutes || x.timeSaid2 ? '✓' : '✗'}, questions after ${x.questionsAfter}${x.questionsAfter === 0 ? ` (NO follow-up; ended by ${x.endedBy ?? 'unknown'})` : ''}`);
console.log(`safety: wrong verdicts ${all.wrong}, false diagnoses ${all.fd}/${all.turns} turns, draw-outs max ${all.drawMax} (episodes over one ${all.over1})`);
