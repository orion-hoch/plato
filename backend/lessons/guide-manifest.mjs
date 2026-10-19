// A harness course's published topics come from its own folder, not the knowledge build (15 Oct, docs/harness-generalization.md
// item 6: "sessions start from sources"). Its files, then its plan's units, then each unit's topics as they are written: the
// course opens minutes after the upload and grows as the guide does. The study guide is the one source of truth; the course
// tree, the agenda and live sessions read the manifest this publishes like any other.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { newId, hashOf } from '../core/util.mjs';
import { loadStudy } from './study.mjs';

const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const firstSentence = text => (String(text || '').replace(/\s+/g, ' ').match(/^.{1,400}?[.!?](?=\s|$)/)?.[0] || String(text || '').replace(/\s+/g, ' ').slice(0, 400)).trim();

/** The course's outline from its folder: [{ title, description, criteria, children: [...] }], best first: guide, plan, sources. */
export function outlineOf(dir) {
  const plan = readJson(path.join(dir, 'plan.json')), topics = loadStudy(dir) || [];
  const leaf = t => ({ title: t.title, description: firstSentence(t.blocks.Idea) || t.title, criteria: String(t.blocks.Rules || '').split('\n').map(x => x.replace(/^\s*[-*\d.)]+\s*/, '').trim()).filter(Boolean).slice(0, 6) });
  if (plan?.units?.length) {
    return plan.units.map(u => {
      const own = topics.filter(t => t.file === u.file);
      return { title: u.title, description: u.focus || u.covers || u.title, criteria: [], children: own.map(leaf) };
    });
  }
  if (topics.length) return [...new Set(topics.map(t => t.unit))].map(unit => ({ title: unit, description: unit, criteria: [], children: topics.filter(t => t.unit === unit).map(leaf) }));
  let files = []; try { files = readdirSync(path.join(dir, 'sources')).filter(f => f.endsWith('.md')).sort(); } catch { /* none yet */ }
  return files.map(f => ({ title: f.replace(/\.md$/, ''), description: `Their material: ${f.replace(/\.md$/, '')}`, criteria: [], children: [] }));
}

/**
 * Publish the outline of the course in `dir` as the exam's knowledge manifest, when it differs from the one published. Topics
 * keep their ids across versions by title (a session, its agenda and their progress carry over). → the manifest, or null.
 */
export function publishGuide(app, scope, dir) {
  const { db, clock, events } = app;
  const outline = outlineOf(dir);
  if (!outline.length) return null;
  const contentHash = hashOf({ guide: outline });
  const exam = db.get('exams', scope.examId);
  const current = exam.publishedKnowledgeManifestId ? db.get('knowledge_manifests', exam.publishedKnowledgeManifestId, scope) : null;
  if (current?.contentHash === contentHash) return null;
  return db.tx(() => {
    const at = clock.iso(), prior = db.find('topic_versions', {}, { scope }), priorObj = db.find('objective_versions', {}, { scope });
    const topicIds = new Map(prior.map(t => [`${t.parentTopicId ? 'c' : 'u'}:${t.title.toLowerCase()}`, t.topicId]));
    const topicVersionIds = [], objectiveVersionIds = [], topicIdsOut = [];
    const put = (node, parentTopicId) => {
      const topicId = topicIds.get(`${parentTopicId ? 'c' : 'u'}:${node.title.toLowerCase()}`) || newId('top');
      const statement = node.description.slice(0, 1000), meaningHash = hashOf({ statement, criteria: node.criteria });
      const was = priorObj.filter(o => o.topicId === topicId).sort((a, b) => b.version - a.version)[0];
      const objective = was?.meaningHash === meaningHash ? was : {
        id: newId('objv'), scope, createdAt: at, objectiveId: was?.objectiveId || newId('obj'), version: (was?.version || 0) + 1, topicId, statement,
        capabilities: ['recall', 'explanation', 'application'], successCriteria: node.criteria, sourceEvidence: [], scopeBasis: 'explicit_exam', examWeight: null, meaningHash, supersedesId: was?.id || null,
      };
      if (objective !== was) db.insert('objective_versions', objective);
      const wasTopic = prior.filter(t => t.topicId === topicId).sort((a, b) => b.version - a.version)[0];
      const same = wasTopic && wasTopic.title === node.title && wasTopic.description === statement && wasTopic.parentTopicId === parentTopicId && wasTopic.objectiveVersionIds[0] === objective.id;
      const tv = same ? wasTopic : { id: newId('topv'), scope, createdAt: at, topicId, version: (wasTopic?.version || 0) + 1, title: node.title.slice(0, 200), description: statement, parentTopicId, objectiveVersionIds: [objective.id], status: 'active' };
      if (!same) db.insert('topic_versions', tv);
      topicVersionIds.push(tv.id); objectiveVersionIds.push(objective.id); topicIdsOut.push(topicId);
      for (const child of node.children || []) put(child, topicId);
    };
    for (const unit of outline) put(unit, null);
    const fresh = db.get('exams', scope.examId), version = (db.prepare('SELECT MAX(version) AS v FROM knowledge_manifests WHERE exam_id = ?').get(scope.examId)?.v || 0) + 1;
    const manifest = {
      id: newId('km'), scope, createdAt: at, version, parentManifestId: fresh.publishedKnowledgeManifestId, buildId: `guide:${contentHash.slice(-16)}`, status: 'published',
      sourceVersionIds: [], extractionArtifactIds: [], interpretationIds: [], topicVersionIds, objectiveVersionIds, edgeVersionIds: [], topicEvidenceLinkIds: [],
      validationReportIds: [], unresolvedIssues: [], contentHash, coverage: [], coverageStatus: 'partial', synthesisPartitionIds: [],
      eligibleForTutoring: true, publishedAt: at, source: 'guide',
    };
    db.insert('knowledge_manifests', manifest);
    db.update('exams', { ...fresh, publishedKnowledgeManifestId: manifest.id, status: 'ready', updatedAt: at });
    events.emit({ scope, eventType: 'knowledge.published', aggregateType: 'exam', aggregateId: scope.examId, aggregateVersion: version, payload: { examId: scope.examId, oldManifestId: fresh.publishedKnowledgeManifestId, newManifestId: manifest.id, migrationIds: [], changedDependencyRefs: [], topicIds: topicIdsOut, objectiveVersionIds, incompatibleTopicIds: [] }, idempotencyKey: `knowledge.published:${manifest.id}` });
    return manifest;
  });
}
