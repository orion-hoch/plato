// Keys the student pastes into Plato (an ElevenLabs API key for voice): kept by the operating system, never in .env, never
// sent back to the page. macOS: the login Keychain (service "plato"), written through `security -i` on stdin so the key is never
// on a command line another process could list. Elsewhere: <data>/secrets.json, readable by this user only (0600).
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SERVICE = 'plato', KEYCHAIN = process.platform === 'darwin' && existsSync('/usr/bin/security');

function security(args, input) {
  return new Promise(resolve => {
    const child = spawn('/usr/bin/security', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.on('error', () => resolve({ ok: false, out: '' }));
    child.on('close', code => resolve({ ok: code === 0, out }));
    child.stdin.end(input || '');
  });
}
// security -i reads commands, one a line; a value is quoted for its parser.
const quoted = value => `"${String(value).replace(/["\\]/g, '\\$&')}"`;

export function createSecrets(dataDir) {
  const file = path.join(dataDir, 'secrets.json'), cache = new Map();
  const readFile = () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };
  const writeFileSecret = all => { mkdirSync(dataDir, { recursive: true, mode: 0o700 }); writeFileSync(file, JSON.stringify(all), { mode: 0o600 }); chmodSync(file, 0o600); };
  return {
    where: KEYCHAIN ? 'your macOS Keychain' : 'a file only your account can read',
    /** The stored value, or '' (cached after the first read). */
    async get(name) {
      if (cache.has(name)) return cache.get(name);
      const value = KEYCHAIN ? ((await security(['find-generic-password', '-s', SERVICE, '-a', name, '-w'])).out.trim()) : String(readFile()[name] || '');
      cache.set(name, value);
      return value;
    },
    async set(name, value) {
      if (KEYCHAIN) {
        const r = await security(['-i'], `add-generic-password -U -s ${SERVICE} -a ${quoted(name)} -w ${quoted(value)}\n`);
        if (!r.ok) throw new Error('The Keychain refused it.');
      } else writeFileSecret({ ...readFile(), [name]: value });
      cache.set(name, value);
    },
    async remove(name) {
      if (KEYCHAIN) await security(['delete-generic-password', '-s', SERVICE, '-a', name]);
      else { const all = readFile(); delete all[name]; writeFileSecret(all); }
      cache.set(name, '');
    },
  };
}
