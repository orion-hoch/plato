import { newId, hashOf } from './util.mjs';
import { AppError } from './errors.mjs';

// Domain events written with the state change (transactional outbox), delivered at least once to
// consumers that keep receipts, so each consumer acts on an event logically once. Spec §8.

// Minimum payload fields per event type (§8 table). Payloads may carry more.
export const EVENT_FIELDS = {
  'source.finalized': ['sourceVersionId', 'buildGeneration', 'capabilityProfileVersion'],
  'source.extraction_completed': ['extractionArtifactId', 'anchorIds', 'disposition'],
  'knowledge.candidate_changed': ['buildId', 'changedRefs', 'round'],
  'knowledge.published': ['oldManifestId', 'newManifestId', 'migrationIds', 'changedDependencyRefs'],
  'response.finalized': ['responseId', 'turnId', 'questionId', 'evidenceId'],
  'delivery.confirmed': ['deliveryEventId', 'outputId', 'semanticUnitId', 'extent', 'questionId'],
  'learner.changed': ['changeId', 'priorContext', 'nextContext', 'evidence', 'affectedTopicIds'],
  'personal.decided': ['decisionId', 'changeIds', 'disposition', 'reason'],
  'personal.published': ['oldPersonalManifestId', 'newPersonalManifestId', 'knowledgeManifestId', 'affectedTopicIds'],
  'question.reserved': ['questionId', 'reservationId', 'topicId', 'slot', 'version'],
  'question.asked': ['questionId', 'reservationId', 'topicId', 'slot', 'version'],
  'question.invalidated': ['questionId', 'reservationId', 'topicId', 'slot', 'version'],
  'question.ready': ['questionId', 'topicId', 'slot', 'version'],
  'question.generation_failed': ['generationRequestId', 'topicId'],
  'material.attached': ['sourceFileId', 'line'], // v7: a new file's items are filed under the course's modules (backend/ingest)
  'session.epoch_changed': ['sessionId', 'oldEpoch', 'newEpoch', 'reason', 'cancelledOutputIds'],
  'exam.deleted': ['examId', 'deletionGeneration'],
  'profile.changed': ['learnerId', 'snapshotId', 'version', 'applicability'],
};

export function createEvents({ db, clock }) {
  const consumers = [];
  const listeners = new Set();

  /** Write an event + outbox row. Call inside the transaction that made the state change. */
  function emit({ scope, eventType, aggregateType, aggregateId, aggregateVersion = 0, payload, causationId = null, correlationId = null, idempotencyKey }) {
    const required = EVENT_FIELDS[eventType];
    if (!required) throw new Error(`Unknown event type ${eventType}`);
    const missing = required.filter(k => payload?.[k] === undefined);
    if (missing.length) throw new Error(`${eventType} payload missing ${missing.join(', ')}`);
    const key = idempotencyKey || `${eventType}:${aggregateId}:${hashOf(payload)}`;
    const prior = db.findOne('events', { idempotencyKey: key }, { scope: { tenantId: scope.tenantId, learnerId: scope.learnerId } });
    if (prior) {
      if (hashOf(prior.payload) !== hashOf(payload)) throw new AppError('idempotency_conflict', `Event key ${key} was reused with a different payload.`);
      return prior;
    }
    return db.tx(() => {
      const last = db.prepare('SELECT MAX(sequence) AS s FROM events WHERE aggregate_type = ? AND aggregate_id = ?').get(aggregateType, aggregateId);
      const event = { id: newId('evt'), scope, createdAt: clock.iso(), eventType, aggregateType, aggregateId, aggregateVersion, sequence: (last?.s || 0) + 1, causationId, correlationId: correlationId || aggregateId, idempotencyKey: key, payload };
      db.insert('events', event);
      db.insert('outbox', { id: newId('obx'), eventId: event.id, state: 'pending', attempt: 0, nextAttemptAt: clock.now(), rowVersion: 0, event });
      return event;
    });
  }

  /** Register a consumer. `handle(event, tx)` runs inside the transaction that stores its receipt. */
  function subscribe(name, types, handle) {
    consumers.push({ name, types: new Set([].concat(types)), handle });
  }

  /** Live, in-process notification (session streams). Not durable; durable state is in tables. */
  function listen(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /** Deliver pending outbox rows. Returns how many events made progress. */
  function dispatch({ limit = 200 } = {}) {
    let progressed = 0;
    const pending = db.prepare("SELECT data FROM outbox WHERE state = 'pending' AND next_attempt_at <= ? ORDER BY rowid LIMIT ?").all(clock.now(), limit).map(r => JSON.parse(r.data));
    for (const row of pending) {
      const event = row.event;
      let allDone = true;
      for (const consumer of consumers) {
        if (!consumer.types.has(event.eventType) && !consumer.types.has('*')) continue;
        if (db.prepare('SELECT 1 FROM consumer_receipts WHERE consumer = ? AND event_id = ?').get(consumer.name, event.id)) continue;
        try {
          db.tx(() => {
            consumer.handle(event);
            db.prepare('INSERT INTO consumer_receipts(consumer, event_id, processed_at) VALUES(?, ?, ?)').run(consumer.name, event.id, clock.iso());
          });
        } catch (error) {
          allDone = false;
          if (process.env.BACKEND_DEBUG) console.error(`consumer ${consumer.name} failed on ${event.eventType}:`, error);
        }
      }
      if (allDone) db.replace('outbox', { ...row, state: 'sent', rowVersion: row.rowVersion + 1 });
      else db.replace('outbox', { ...row, attempt: row.attempt + 1, nextAttemptAt: clock.now() + 1000 * Math.min(60, 2 ** row.attempt), rowVersion: row.rowVersion + 1 });
      for (const fn of listeners) { try { fn(event); } catch { /* listeners never block delivery */ } }
      progressed++;
    }
    return progressed;
  }

  return { emit, subscribe, listen, dispatch, consumers };
}
