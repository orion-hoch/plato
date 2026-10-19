// A03 — Bounded graph refinement and validation (spec §13).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createTestBackend } from '../harness.mjs';
import { uploadFile, md, scopeOf } from './_knowledge-files.mjs';

const EIGEN = '# Eigenvalues\n\nAn eigenvector v satisfies Av = λv with v ≠ 0.';
const LINKED = '# Projections\n\nThe projection coefficient of a on unit q is qᵀa.\n\n# QR factorization\n\nQR factorization is built from Projections: each rᵢⱼ = qᵢᵀaⱼ.';

async function publish(t, files) {
  for (const [name, text] of files) uploadFile(t.app, t.learner, t.exam, { filename: name, ...md(text) });
  await t.app.drain();
  return t.app.services.knowledge.published(scopeOf(t.app, t.exam));
}

function setup(options) {
  const t = createTestBackend(options);
  t.exam = t.createExam();
  t.scope = () => scopeOf(t.app, t.exam);
  return t;
}

test('A03: refinement revises only affected interpretations, source-checks them, and stops with a recorded reason', async () => {
  const t = setup();
  const view = await publish(t, [['eigen.md', EIGEN], ['linked.md', LINKED]]);
  const build = t.app.services.knowledge.buildStatus(t.scope()).at(-1);
  assert.equal(build.state, 'published');
  assert.equal(build.refinement[0].changedInterpretationIds.length, 1, 'only the interpretation touched by the new edge is revisited');
  const revised = t.app.db.get('base_interpretations', build.refinement[0].changedInterpretationIds[0], t.scope());
  assert.equal(t.app.db.get('source_files', t.app.db.get('source_versions', revised.sourceVersionId).sourceFileId).filename, 'linked.md');
  assert.ok(revised.claims.some(c => c.kind === 'connection'), 'graph context added a connection');
  assert.ok(revised.validationReportIds.length >= 3, 'revised claims were source-checked again');
  assert.match(build.refinement.at(-1).reason, /Converged/);
  const eigen = view.interpretations.find(i => t.app.db.get('source_files', t.app.db.get('source_versions', i.sourceVersionId).sourceFileId).filename === 'eigen.md');
  assert.ok(!eigen.refinementOf, 'unaffected interpretation was not reinterpreted');
});

test('A03: hierarchy cycles are rejected; the previous publication stays', async () => {
  const t = setup();
  const first = await publish(t, [['linked.md', LINKED]]);
  t.controls.graph = { hierarchyCycle: true };
  await publish(t, [['eigen.md', EIGEN]]);
  const build = t.app.services.knowledge.buildStatus(t.scope()).at(-1);
  assert.equal(build.state, 'needs_review');
  assert.ok(build.issues.some(i => i.code === 'hierarchy_cycle' && i.severity === 'blocking'));
  assert.equal(t.app.db.get('exams', t.exam.id).publishedKnowledgeManifestId, first.manifest.id);
});

test('A03: crosslink cycles publish; prerequisite cycles are flagged, never deleted', async () => {
  const t = setup();
  t.controls.graph = { crosslinkCycle: true, prerequisiteCycle: true };
  const view = await publish(t, [['linked.md', LINKED]]);
  const related = view.edges.filter(e => e.type === 'related');
  assert.ok(related.some(a => related.some(b => a.fromTopicId === b.toTopicId && a.toTopicId === b.fromTopicId)), 'related cycle kept');
  const prereq = view.edges.filter(e => e.type === 'prerequisite');
  assert.equal(prereq.length, 2);
  assert.ok(prereq.every(e => e.prerequisiteCycleIssueId), 'both cycle edges carry the issue');
  assert.ok(view.manifest.unresolvedIssues.some(i => i.code === 'prerequisite_cycle'));
});

test('A03: validator agreement never upgrades an unsupported connection', async () => {
  const t = setup();
  t.controls.graph = { unsupportedEdge: true }; // claims "grounded" with no evidence; all validators pass
  const view = await publish(t, [['linked.md', LINKED]]);
  const edge = view.edges.find(e => e.type === 'supports');
  assert.equal(edge.support, 'inferred_provisional');
  assert.ok(view.manifest.unresolvedIssues.some(i => i.code === 'ungrounded_edge'));
  const reports = t.app.db.find('validation_reports', { id: view.manifest.validationReportIds }, { scope: t.scope() });
  assert.ok(reports.some(r => r.responsibility === 'graph_integrity' && r.disposition === 'pass'));
});

test('A03: refinement stops at the configured round limit and says so', async () => {
  const t = setup({ config: { refinementRounds: 1 } });
  await publish(t, [['linked.md', LINKED]]);
  const build = t.app.services.knowledge.buildStatus(t.scope()).at(-1);
  assert.equal(build.state, 'published');
  assert.equal(build.refinement.length, 1);
  assert.match(build.refinement[0].reason, /limit/);
});

test('A03: a fixable source-fidelity defect gets one repair and a second check; an unrepaired one stays needs-review', async () => {
  const t = setup();
  t.controls.interpreter = { unsupportedText: true };
  const view = await publish(t, [['linked.md', LINKED]]);
  assert.ok(view, 'repaired interpretation published');
  assert.ok(view.interpretations.every(i => i.claims.every(c => !/UNSUPPORTED/.test(c.text))));
  const reports = t.app.db.find('validation_reports', {}, { scope: t.scope() }).filter(r => r.responsibility === 'source_fidelity');
  assert.ok(reports.some(r => r.disposition === 'repair_required') && reports.some(r => r.disposition === 'pass'));

  const u = setup();
  u.controls.interpreter = { unsupportedText: true, ignoreRepair: true };
  await publish(u, [['linked.md', LINKED]]);
  assert.equal(u.app.db.get('exams', u.exam.id).publishedKnowledgeManifestId, null);
  assert.equal(u.app.services.knowledge.status(u.learner, u.exam.id).files[0].status, 'needs_review');
});
