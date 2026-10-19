import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from './core/db.mjs';
import { createClock, newId } from './core/util.mjs';
import { createEvents } from './core/events.mjs';
import { createJobs } from './core/jobs.mjs';
import { createBlobs } from './core/blobs.mjs';
import { createAuth } from './core/scope.mjs';
import { defaultConfig } from './core/config.mjs';
import { installExams } from './exams.mjs';
import { installKnowledge } from './knowledge/index.mjs';
import { installLearner } from './learner/index.mjs';
import { installQuestions } from './questions/index.mjs';
import { installSession } from './session/index.mjs';
import { installDirector } from './director/index.mjs'; // the teaching engine (v12; the service keeps the name `director`)
import { installElements } from './elements/index.mjs';
import { installRun } from './run/index.mjs';
import { installModules } from './modules/index.mjs'; // course modules (v7)
import { installIngest } from './ingest/index.mjs'; // easy new material (v7)
import { installUnderstanding } from './understanding/index.mjs'; // the Studies (v11)

/**
 * Composition root. Modules install job handlers, event consumers and services onto `app`.
 * `providers` holds one adapter per provider interface (mocks in tests, Codex/ElevenLabs live).
 */
export function createBackend({ dbFile = ':memory:', blobDir, clock = createClock(), config: overrides, providers } = {}) {
  const config = defaultConfig(overrides);
  const db = openDb(dbFile);
  const app = {
    db, clock, config, providers,
    blobs: createBlobs({ db, dir: blobDir || mkdtempSync(path.join(tmpdir(), 'luna-blobs-')), clock }),
    events: createEvents({ db, clock }),
    auth: createAuth({ db, clock }),
    services: {},
    id: newId,
  };
  app.jobs = createJobs({ db, clock, config });
  app.reconcilers = [];

  installExams(app);
  installKnowledge(app);
  installLearner(app);
  installQuestions(app);
  installSession(app);
  installDirector(app); // the teaching engine (v12): teaches from the course model
  installElements(app);
  installRun(app);
  installModules(app); // course modules (v7)
  installIngest(app); // easy new material (v7): new files filed under the modules before the full rebuild
  installUnderstanding(app); // the Studies (v11): the director's own understanding of each topic

  /** Run dispatcher and worker until nothing is ready (tests and the background loop). */
  app.drain = async ({ maxSteps = 10_000 } = {}) => {
    for (let step = 0; step < maxSteps; step++) {
      const delivered = app.events.dispatch();
      const ran = await app.jobs.runOnce();
      if (!delivered && !ran) return step;
    }
    throw new Error('drain did not settle');
  };

  /** Background loop for the live server. */
  let running = false;
  // Live loop: one dispatcher plus several workers, so independent model calls run in parallel.
  app.start = ({ idleMs = 250, workers = 8 } = {}) => {
    if (running) return;
    running = true;
    // Two workers always stay free for the reply path, however few there are (with 3, background builds took all of them).
    app.config.backgroundJobs = Math.max(1, Math.min(app.config.backgroundJobs, workers - 2));
    const pause = () => new Promise(r => setTimeout(r, idleMs));
    (async () => {
      let lastReconcile = 0;
      while (running) {
        try {
          const delivered = app.events.dispatch();
          if (clock.now() - lastReconcile > config.reconciliationMs) { lastReconcile = clock.now(); for (const fn of app.reconcilers) { try { fn(); } catch { /* reconcile best-effort */ } } }
          if (!delivered) await pause();
        } catch (error) { if (process.env.BACKEND_DEBUG) console.error('dispatcher', error); await pause(); }
      }
    })();
    for (let i = 0; i < workers; i++) (async () => {
      while (running) {
        try { if (!await app.jobs.runOnce()) await pause(); }
        catch (error) { if (process.env.BACKEND_DEBUG) console.error('worker', error); await pause(); }
      }
    })();
  };
  app.stop = () => { running = false; app.jobs.halt(); };
  app.close = () => { app.stop(); db.close(); };
  return app;
}
