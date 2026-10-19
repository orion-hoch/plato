import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from 'node:fs';
import path from 'node:path';
import { newId, sha256Bytes } from './util.mjs';
import { AppError } from './errors.mjs';

// Immutable object storage on disk. Content is addressed by hash; rows record ownership.
// An ArtifactRef is verified (hash + length) every time it is read.

export function createBlobs({ db, dir, clock }) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const fileFor = sha => path.join(dir, sha.split(':').pop());

  function put({ scope, bytes, mediaType }) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const sha256 = sha256Bytes(buffer), file = fileFor(sha256);
    if (!existsSync(file)) { const tmp = `${file}.${newId('tmp')}`; writeFileSync(tmp, buffer, { mode: 0o600 }); renameSync(tmp, file); }
    const record = { id: newId('blob'), scope, createdAt: clock.iso(), sha256, mediaType, byteLength: buffer.length, path: path.basename(file), deleted: false };
    db.insert('blobs', record);
    return { blobId: record.id, sha256, mediaType, byteLength: buffer.length };
  }

  const putText = ({ scope, text, mediaType = 'text/markdown; charset=utf-8' }) => put({ scope, bytes: Buffer.from(text, 'utf8'), mediaType });

  /** Read and verify. Scope must own the blob. */
  function read(ref, scope) {
    const row = db.get('blobs', ref.blobId, scope);
    if (!row || row.deleted) throw new AppError('ownership_denied', 'Artifact not found.');
    if (row.sha256 !== ref.sha256 || row.byteLength !== ref.byteLength) throw new AppError('quality_gate', 'Artifact reference does not match stored checksum.');
    const file = fileFor(row.sha256);
    if (!existsSync(file)) throw new AppError('quality_gate', 'Artifact bytes are missing.');
    const bytes = readFileSync(file);
    if (sha256Bytes(bytes) !== ref.sha256) throw new AppError('quality_gate', 'Artifact bytes failed checksum verification.');
    return bytes;
  }
  const readText = (ref, scope) => read(ref, scope).toString('utf8');

  /** True when the artifact exists, belongs to scope and matches its checksum (publication check). */
  function verify(ref, scope) { try { read(ref, scope); return true; } catch { return false; } }

  /** Mark an exam's blobs deleted and remove bytes no other live row references. */
  function deleteExam(examId) {
    const rows = db.find('blobs', { examId, deleted: false });
    for (const row of rows) db.replace('blobs', { ...row, deleted: true });
    for (const row of rows) {
      const live = db.prepare('SELECT 1 FROM blobs WHERE sha256 = ? AND deleted = 0 LIMIT 1').get(row.sha256);
      if (!live) rmSync(fileFor(row.sha256), { force: true });
    }
  }

  return { put, putText, read, readText, verify, deleteExam };
}
