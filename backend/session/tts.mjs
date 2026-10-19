// Plato's voice, on this Mac (13 Oct: ElevenLabs credits ran out; the user wants text first, with some voice): Kokoro-82M
// through mlx-audio (tools/tts/kokoro_worker.py in .venv-tts) when it is set up, else macOS `say`. Text in, WAV out.
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PYTHON = path.join(ROOT, '.venv-tts/bin/python'), WORKER = path.join(ROOT, 'tools/tts/kokoro_worker.py');
const cache = new Map(); // text → WAV, the last 200 (a replayed line costs nothing)
let worker = null, waiting = new Map(), counter = 0, broken = false;

function kokoro() {
  if (worker || broken || !existsSync(PYTHON) || !existsSync(WORKER)) return worker;
  worker = spawn(PYTHON, [WORKER], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  createInterface({ input: worker.stdout }).on('line', line => {
    let m; try { m = JSON.parse(line); } catch { return; }
    const w = waiting.get(m.id); if (!w) return;
    waiting.delete(m.id);
    if (m.path) { try { w.resolve(readFileSync(m.path)); } catch (e) { w.reject(e); } finally { rmSync(m.path, { force: true }); } }
    else w.reject(new Error(m.error || 'kokoro failed'));
  });
  worker.stderr.on('data', () => {}); // model download and warnings
  worker.on('exit', () => { for (const w of waiting.values()) w.reject(new Error('kokoro stopped')); waiting = new Map(); worker = null; broken = true; setTimeout(() => { broken = false; }, 60_000); });
  return worker;
}
const viaKokoro = (text, voice) => new Promise((resolve, reject) => {
  const w = kokoro(); if (!w) return reject(new Error('kokoro not set up'));
  const id = ++counter, timer = setTimeout(() => { waiting.delete(id); reject(new Error('kokoro took too long')); }, 60_000);
  waiting.set(id, { resolve: b => { clearTimeout(timer); resolve(b); }, reject: e => { clearTimeout(timer); reject(e); } });
  w.stdin.write(`${JSON.stringify({ id, text, voice })}\n`);
});
const viaSay = text => new Promise((resolve, reject) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'plato-say-')), out = path.join(dir, 'line.wav');
  execFile('say', ['-v', 'Samantha', '-r', '190', '-o', out, '--data-format=LEI16@22050', text], { timeout: 30_000 }, error => {
    try { if (error) reject(error); else resolve(readFileSync(out)); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

/** WAV audio of `text` (≤ 600 characters), Kokoro when it is there, else macOS say. */
export async function speakText(text, { voice = process.env.LUNA_TTS_VOICE || 'af_heart' } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!t) throw new Error('nothing to say');
  const key = `${voice}|${t}`;
  if (cache.has(key)) return cache.get(key);
  let wav;
  try { wav = await viaKokoro(t, voice); } catch { wav = await viaSay(t); }
  cache.set(key, wav); if (cache.size > 200) cache.delete(cache.keys().next().value);
  return wav;
}
export const ttsEngine = () => (worker || (!broken && existsSync(PYTHON) && existsSync(WORKER)) ? 'kokoro' : 'say');
