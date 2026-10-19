// Checkpoints: where the student is in a course, so a reload, a server restart or a session that could not be resumed
// brings back everything as it was (19 Oct, the user: "really have a good checkpoint system in place that will keep student
// progress and especially keep the whiteboard up after a refresh"; a code reload had ended their session and the page came
// back empty). One record per course:
//   { savedAt, session, view: { page, log }, chat: { context, dialogue, face }, ink: [stroke], drafts: { key: value } }
// kept twice: in this browser (read at once, before anything loads) and on the study server (<data>/checkpoints, server/index.mjs),
// which outlives cleared storage, a full quota and another browser. Whichever is newer wins.
import { useState } from 'react';
import { chosenCourse } from './tutor-bridge.js';
import { authHeader } from './backend-client.js';

const KEY = exam => `plato.checkpoint.${exam}`, SAVE_MS = 800;
const records = new Map(), timers = new Map();

const blank = () => ({ savedAt: 0, session: null, view: null, chat: null, ink: [], drafts: {} });
function local(exam) {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY(exam)) || 'null');
    if (kept) return kept;
    // Before checkpoints (16 to 19 Oct): the page and the conversation under their own keys.
    const view = JSON.parse(localStorage.getItem(`plato.view.${exam}`) || 'null'), chat = JSON.parse(localStorage.getItem(`plato-chat.${exam}`) || 'null');
    if (view || chat) return { ...blank(), savedAt: 1, session: view?.session || chat?.session || null, view: view && { page: view.page, log: view.log }, chat: chat && { context: chat.context, dialogue: chat.dialogue, face: chat.face } };
  } catch { /* storage blocked: the server's copy */ }
  return null;
}

/** The course's checkpoint as this browser has it (sync, for the first render); a blank one when there is none. */
export function checkpoint(exam) {
  if (!exam) return blank();
  if (!records.has(exam)) records.set(exam, local(exam) || blank());
  return records.get(exam);
}

/** The server's copy, taken when newer than this browser's (a cleared browser, another one). Resolves to the record. */
export async function recall(exam) {
  if (!exam) return blank();
  const mine = checkpoint(exam);
  try {
    const theirs = await (await fetch(`/checkpoint/${exam}`, { cache: 'no-store', headers: await authHeader() })).json();
    if (theirs?.savedAt > mine.savedAt) { records.set(exam, { ...blank(), ...theirs }); try { localStorage.setItem(KEY(exam), JSON.stringify(theirs)); } catch { /* full */ } }
    else if (mine.savedAt > (theirs?.savedAt || 0)) save(exam, {}); // the server is behind (it was down): it catches up
  } catch { /* the server is away: this browser's copy */ }
  return checkpoint(exam);
}

/** Merge `parts` into the course's checkpoint and save it (both copies, shortly; at once when the page goes). */
export function save(exam, parts) {
  if (!exam) return;
  const record = Object.assign(checkpoint(exam), parts, { savedAt: Date.now() });
  clearTimeout(timers.get(exam));
  timers.set(exam, setTimeout(() => write(exam, record), SAVE_MS));
}
/** One draft (a work zone's content) in the course's checkpoint. */
export function saveDraft(exam, key, value) {
  if (exam && key) save(exam, { drafts: { ...checkpoint(exam).drafts, [key]: value } });
}

// ponytail: a page closing sends what is waiting with keepalive, which carries at most 64 KB; a bigger record leaving within
// SAVE_MS of its last change keeps this browser's copy, and the server catches up on the next load (recall).
async function write(exam, record) {
  timers.delete(exam);
  const body = JSON.stringify(record);
  try { localStorage.setItem(KEY(exam), body); } catch { /* full or blocked: the server's copy holds it */ }
  void fetch(`/checkpoint/${exam}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeader().catch(() => ({})) }, body, keepalive: body.length < 60_000 }).catch(() => {
    // The server is away (a restart): tried again shortly, unless something newer has been saved meanwhile.
    if (!timers.has(exam)) timers.set(exam, setTimeout(() => write(exam, checkpoint(exam)), 5000));
  });
}
// A reload or a closed tab: what is waiting goes now.
addEventListener('pagehide', () => { for (const [exam, timer] of timers) { clearTimeout(timer); void write(exam, checkpoint(exam)); } });

/** useState for a work zone's content (code, LaTeX lines, a proof, a typed answer), kept in the course's checkpoint under
 *  `key` (the zone's id on Plato's page), so what they had written is there after a reload. No key: not kept. */
export function useDraft(key, init) {
  const exam = chosenCourse(), drafts = checkpoint(exam).drafts || {};
  const [value, set] = useState(() => key && drafts[key] !== undefined ? drafts[key] : typeof init === 'function' ? init() : init);
  return [value, next => set(old => { const v = typeof next === 'function' ? next(old) : next; if (key) saveDraft(exam, key, v); return v; })];
}
