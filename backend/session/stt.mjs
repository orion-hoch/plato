// Plato's ears, on this Mac (13 Oct, the user: "why doesn't it listen, that's a core component"): Qwen3-ASR through
// mlx-audio (tools/tts/asr_worker.py in .venv-tts), kept running. A WAV in, its words out.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PYTHON = path.join(ROOT, '.venv-tts/bin/python'), WORKER = path.join(ROOT, 'tools/tts/asr_worker.py');
let worker = null, waiting = new Map(), counter = 0;

function ears() {
  if (worker || !existsSync(PYTHON) || !existsSync(WORKER)) return worker;
  worker = spawn(PYTHON, [WORKER], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  createInterface({ input: worker.stdout }).on('line', line => {
    let m; try { m = JSON.parse(line); } catch { return; }
    const w = waiting.get(m.id); if (!w) return;
    waiting.delete(m.id);
    if (typeof m.text === 'string') w.resolve(m.text); else w.reject(new Error(m.error || 'transcription failed'));
  });
  worker.stderr.on('data', () => {});
  worker.on('exit', () => { for (const w of waiting.values()) w.reject(new Error('the ears stopped')); waiting = new Map(); worker = null; });
  return worker;
}
/** Start the ears early (the model takes a few seconds to load), e.g. when the mic opens. */
export const wakeEars = () => { ears(); };
/** The words in a WAV recording ('' for silence). */
export function transcribe(wav) {
  const w = ears();
  if (!w) return Promise.reject(new Error('Speech recognition is not set up (.venv-tts).'));
  const dir = mkdtempSync(path.join(tmpdir(), 'plato-heard-')), file = path.join(dir, 'line.wav');
  writeFileSync(file, wav);
  const id = ++counter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('transcription took too long')); }, 120_000);
    const done = f => v => { clearTimeout(timer); rmSync(dir, { recursive: true, force: true }); f(v); };
    waiting.set(id, { resolve: done(resolve), reject: done(reject) });
    w.stdin.write(`${JSON.stringify({ id, path: file })}\n`);
  });
}
