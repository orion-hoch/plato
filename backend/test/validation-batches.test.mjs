// A long source cites more anchors than one validator call carries: every claim is still checked
// against its own excerpts, in bounded batches, and the source validates (spec §6: no silent tail drop).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from './harness.mjs';
import { uploadFile, md, spyProviders, scopeOf } from './acceptance/_knowledge-files.mjs';

test('source validation covers every cited anchor in batches of at most 40 excerpts', async () => {
  const { app, learner, createExam } = createTestBackend({ config: { segmentMaxTokens: 400 } });
  const calls = spyProviders(app);
  const exam = createExam({ title: 'Bit packing' });
  const parts = ['# Shifting'];
  for (let i = 1; i <= 90; i++) parts.push(`Shift fact ${i}: i << ${i % 8} multiplies i by two to the ${i % 8} when nothing overflows.`);
  uploadFile(app, learner, exam, { filename: 'bitpack.md', ...md(parts.join('\n\n')) });
  await app.drain();

  const scope = scopeOf(app, exam);
  const source = app.db.find('base_interpretations', { kind: 'source' }, { scope })[0];
  assert.equal(source.status, 'validated');
  const cited = new Set(source.claims.flatMap(c => c.evidence.map(e => e.id)));
  assert.ok(cited.size > 40, `source cites ${cited.size} anchors`);
  const checks = calls.filter(c => c.method === 'validate' && c.request.responsibility === 'source_fidelity' && c.request.candidate.id === source.id);
  assert.ok(checks.length >= 2, `${checks.length} batched calls`);
  assert.ok(checks.every(c => c.request.originalEvidence.length <= 40));
  const supplied = new Set(checks.flatMap(c => c.request.originalEvidence.map(e => e.anchor.id)));
  for (const id of cited) assert.ok(supplied.has(id), `anchor ${id} reached a validator`);
  assert.deepEqual(new Set(checks.map(c => c.request.work.idempotencyKey)).size, checks.length, 'one idempotency key per batch');
});
