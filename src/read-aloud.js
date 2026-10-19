// Reading Plato's replies aloud in the text chat (13 Oct: "I like the pure text style but… some voice component… helps"): an
// ElevenLabs voice on the student's own API key (server /voice/tts), a paragraph at a time as his reply streams in, in
// order; the audio is fetched ahead and played in turn. Off unless turned on (remembered on this computer). Only his words
// are read: never code, tables, his plan note or the slides.
import { authHeader } from './backend-client.js';

const KEY = 'plato-read-aloud';
let on = (() => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } })();
const listeners = new Set();
let queue = Promise.resolve(), run = 0, current = null;

export const speaker = {
  get on() { return on; },
  set(value) {
    on = Boolean(value);
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private window */ }
    if (!on) this.stop();
    listeners.forEach(f => f(on));
  },
  toggle() { this.set(!on); },
  subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
  stop() { run++; try { current?.pause(); } catch { /* gone */ } current = null; queue = Promise.resolve(); },
  say(text) {
    const line = forSpeech(text);
    if (!on || !line) return;
    const mine = run;
    const audio = authHeader().then(auth => fetch('/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ text: line }) }))
      .then(r => (r.ok ? r.blob() : null)).catch(() => null);
    queue = queue.then(async () => {
      const blob = await audio;
      if (!blob || mine !== run) return;
      await new Promise(done => {
        const url = URL.createObjectURL(blob), a = new Audio(url);
        current = a;
        a.onended = a.onerror = () => { URL.revokeObjectURL(url); done(); };
        a.play().catch(done);
      });
    });
  },
};

// What is worth hearing: words, not code, tables, display math or markup ("1.01_2" is "1.01 base 2").
export function forSpeech(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n').filter(l => !/^\s*\|/.test(l)).join('\n')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/(\w)_\{?(\d+)\}?/g, '$1 base $2').replace(/\^\{?(-?\w+)\}?/g, ' to the $1').replace(/\\times/g, ' times ')
    .replace(/\\(?:frac|text|mathrm|texttt)\{([^}]*)\}(?:\{([^}]*)\})?/g, (_, a, b) => (b ? `${a} over ${b}` : a))
    .replace(/[`*_$\\{}#>]/g, '').replace(/\s+/g, ' ').trim();
}

// A streamed reply, read as it comes: whole paragraphs (never inside an open code block), the rest when it ends.
export function readAlong() {
  let buf = '';
  return {
    add(piece) {
      if (!on) return;
      buf += (buf ? ' ' : '') + piece;
      const fenced = (buf.match(/```/g) || []).length % 2 === 1, at = buf.lastIndexOf('\n\n');
      if (!fenced && at > 0) { speaker.say(buf.slice(0, at)); buf = buf.slice(at + 2); }
    },
    end() { if (on && buf.trim()) speaker.say(buf); buf = ''; },
  };
}
