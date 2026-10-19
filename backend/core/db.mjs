import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './errors.mjs';

// SQLite with per-module migrations and scope-checked entity access.
// Every entity row has id, tenant_id, learner_id, exam_id (when exam-scoped), the full record as
// JSON in `data`, and any extra columns its migration declares (for unique keys and lookups).

const MIGRATIONS = fileURLToPath(new URL('../db/migrations/', import.meta.url));
const snake = key => key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);

export function openDb(file = ':memory:', { migrationsDir = MIGRATIONS } = {}) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name));
  for (const name of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    if (applied.has(name)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(path.join(migrationsDir, name), 'utf8'));
      db.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES(?, ?)').run(name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw new Error(`Migration ${name} failed: ${error.message}`); }
  }

  const columns = new Map();
  const columnsOf = table => {
    if (!columns.has(table)) columns.set(table, new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)));
    return columns.get(table);
  };
  const statements = new Map();
  const prepare = sql => { if (!statements.has(sql)) statements.set(sql, db.prepare(sql)); return statements.get(sql); };

  // Re-entrant transaction; BEGIN IMMEDIATE takes the write lock up front.
  let depth = 0;
  function tx(fn) {
    if (depth) { depth++; try { return fn(); } finally { depth--; } }
    db.exec('BEGIN IMMEDIATE'); depth = 1;
    try { const result = fn(); if (result instanceof Promise) throw new Error('tx callbacks must be synchronous'); db.exec('COMMIT'); return result; }
    catch (error) { try { db.exec('ROLLBACK'); } catch { /* already rolled back */ } throw error; }
    finally { depth = 0; }
  }

  function rowFor(table, record) {
    const cols = columnsOf(table), row = {};
    for (const [key, value] of Object.entries(record)) {
      const col = snake(key);
      if (cols.has(col) && col !== 'data' && col !== 'scope') row[col] = value === undefined ? null : typeof value === 'boolean' ? Number(value) : (value !== null && typeof value === 'object') ? JSON.stringify(value) : value;
    }
    if (record.scope) {
      if (cols.has('tenant_id')) row.tenant_id = record.scope.tenantId;
      if (cols.has('learner_id')) row.learner_id = record.scope.learnerId;
      if (cols.has('exam_id') && record.scope.examId !== undefined) row.exam_id = record.scope.examId;
    }
    if (cols.has('data')) row.data = JSON.stringify(record);
    return row;
  }
  const parse = row => row ? JSON.parse(row.data) : null;

  function scopeClause(table, scope) {
    const cols = columnsOf(table), parts = [], params = [];
    if (!scope) return { sql: '', params };
    if (cols.has('tenant_id')) { parts.push('tenant_id = ?'); params.push(scope.tenantId); }
    if (cols.has('learner_id') && scope.learnerId) { parts.push('learner_id = ?'); params.push(scope.learnerId); }
    if (cols.has('exam_id') && scope.examId) { parts.push('exam_id = ?'); params.push(scope.examId); }
    return { sql: parts.join(' AND '), params };
  }

  const api = {
    raw: db, tx, prepare,

    insert(table, record) {
      const row = rowFor(table, record), keys = Object.keys(row);
      prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map(k => row[k]));
      return record;
    },

    /** Insert unless the unique key already exists; returns the existing record in that case. */
    insertOrGet(table, record, uniqueWhere) {
      const existing = api.findOne(table, uniqueWhere);
      if (existing) return { record: existing, created: false };
      api.insert(table, record);
      return { record, created: true };
    },

    /** Compare-and-swap on row_version. Returns the stored record with rowVersion+1. */
    update(table, record, { expectedRowVersion = record.rowVersion } = {}) {
      const next = { ...record, rowVersion: (expectedRowVersion ?? 0) + 1 };
      const row = rowFor(table, next), keys = Object.keys(row).filter(k => k !== 'id');
      const result = prepare(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(',')} WHERE id = ? AND row_version = ?`).run(...keys.map(k => row[k]), record.id, expectedRowVersion);
      if (result.changes !== 1) throw new AppError('version_conflict', `${table} ${record.id} changed concurrently.`);
      return next;
    },

    /** Overwrite without CAS (append-only tables never use this). */
    replace(table, record) {
      const row = rowFor(table, record), keys = Object.keys(row);
      prepare(`INSERT OR REPLACE INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map(k => row[k]));
      return record;
    },

    /** Get by id within scope; another owner's record is indistinguishable from a missing one. */
    get(table, id, scope) {
      const clause = scopeClause(table, scope);
      return parse(prepare(`SELECT data FROM ${table} WHERE id = ?${clause.sql ? ` AND ${clause.sql}` : ''}`).get(id, ...clause.params));
    },
    must(table, id, scope, what = table) {
      const record = api.get(table, id, scope);
      if (!record) throw new AppError('ownership_denied', `${what} not found.`);
      return record;
    },

    find(table, where = {}, { scope, order = 'rowid', limit } = {}) {
      const clause = scopeClause(table, scope), parts = clause.sql ? [clause.sql] : [], params = [...clause.params];
      for (const [key, value] of Object.entries(where)) {
        const col = snake(key);
        if (Array.isArray(value)) { if (!value.length) return []; parts.push(`${col} IN (${value.map(() => '?').join(',')})`); params.push(...value); }
        else if (value === null) parts.push(`${col} IS NULL`);
        else { parts.push(`${col} = ?`); params.push(typeof value === 'boolean' ? Number(value) : value); }
      }
      const sql = `SELECT data FROM ${table}${parts.length ? ` WHERE ${parts.join(' AND ')}` : ''} ORDER BY ${order}${limit ? ` LIMIT ${Number(limit)}` : ''}`;
      return prepare(sql).all(...params).map(parse);
    },
    findOne(table, where, options) { return api.find(table, where, { ...options, limit: 1 })[0] || null; },

    close: () => db.close(),
  };
  return api;
}
