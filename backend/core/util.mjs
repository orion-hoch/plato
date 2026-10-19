import { createHash, randomBytes } from 'node:crypto';

// Shared primitives: opaque IDs, UTC time, canonical hashing. See implementation-spec §3.

export const CANONICALIZATION = 'c1';

export const newId = prefix => `${prefix}_${randomBytes(12).toString('base64url')}`;

/** A clock that tests can control. */
export function createClock(start = null) {
  let fixed = start === null ? null : Date.parse(start);
  return {
    now: () => fixed === null ? Date.now() : fixed,
    iso: () => new Date(fixed === null ? Date.now() : fixed).toISOString(),
    advance(ms) { if (fixed === null) fixed = Date.now(); fixed += ms; },
    set(iso) { fixed = Date.parse(iso); },
  };
}

/** Deterministic JSON: object keys sorted, no whitespace. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export const sha256Bytes = bytes => `${CANONICALIZATION}:sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const hashOf = value => sha256Bytes(Buffer.from(typeof value === 'string' ? value : canonicalJson(value)));


export const estimateTokens = text => Math.ceil(String(text || '').length / 4);

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function backoff(attempt, baseMs = 500, maxMs = 30_000) {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + Math.random() * ceiling / 2);
}

/** fn(), or `fallback` when it throws or gives null: for best-effort edges only. BACKEND_DEBUG logs what was swallowed. */
export function safe(fn, fallback) {
  try { return fn() ?? fallback; } catch (error) { if (globalThis.process?.env?.BACKEND_DEBUG) console.error('[safe]', error); return fallback; }
}
