// Engineering defaults from spec §12. Every value is configurable; none is a measured guarantee.

export const CONFIG_VERSION = 'cfg_v1';

export function defaultConfig(overrides = {}) {
  return {
    version: CONFIG_VERSION,
    refinementRounds: 2,
    personalRevisionAttempts: 3,
    providerRetriesPerJob: 3,
    retryBaseMs: 500,
    jobLeaseMs: 120_000,
    // The reply path's jobs (these types at this priority or above: the turn, the director's card for an answer, think)
    // never wait for a worker behind jobs that run for minutes: background jobs take at most `backgroundJobs` of the
    // server's workers at once, so the rest stay free for them.
    replyJobs: { types: ['plan_turn', 'director_card', 'director_think'], minPriority: 48 },
    backgroundJobs: 14, // capped at the worker count less two (app.start)
    // Of those, builds that run for many minutes take at most `max`, so short session work always has a worker.
    longJobs: { types: ['study_course', 'study_topic', 'build_graph', 'refine_knowledge', 'interpret_source', 'extract_source', 'build_modules'], max: 12 },
    // Sandbox only: publish a course whose validation reports have warnings only, as provisional (backend/knowledge/build.mjs).
    publishWarningOnlyReviews: globalThis.process?.env?.LUNA_PUBLISH_WARNING_REVIEWS === 'provisional',
    personalCoalesceMs: 2000,
    personalCoalesceMax: 20,
    reservationLeaseMs: 60_000,
    readyPerSlot: 1, // 1 basic + 1 challenging per active subtopic
    inFlightGenerationPerSubtopic: 2,
    queuedGenericJobsPerExam: 100,
    maxGenericItemsPerSubtopic: 4,
    reconciliationMs: 60_000,
    segmentMaxTokens: 6000,
    segmentOverlapAnchors: 1,
    // Interpretations per synthesis partition (and partitions per merge). A partition call writes ~1.1 KB of
    // graph JSON per source concept at ~110 B/s (CS 3410: 8 lectures → 66 KB in ~570 s against the 600 s call
    // limit). 3 lectures (≤ ~30 concepts → ≤ ~35 KB, ~300 s) leave ~2× headroom.
    // ponytail: counts sources, not concepts; a run of very dense sources can still approach the limit,
    // budget partitions by concept count if that shows up.
    synthesisPartitionMaxInterpretations: 3,
    buildBudget: { maxProviderCalls: 400, maxInputTokens: 4_000_000, maxOutputTokens: 1_000_000, maxWallTimeMs: 3_600_000, maxAttempts: 3 },
    uploads: {
      maxFiles: 100,
      // Capability matrix (§4.1): explicit formats and bounds. Formats not listed are unsupported.
      capabilities: {
        version: 'cap_v1',
        formats: [
          { mime: 'text/plain', extensions: ['txt'], maxBytes: 5_000_000, extractor: 'text' },
          { mime: 'text/markdown', extensions: ['md', 'markdown'], maxBytes: 5_000_000, extractor: 'text' },
          { mime: 'text/csv', extensions: ['csv'], maxBytes: 5_000_000, extractor: 'csv', maxRows: 20_000 },
          { mime: 'application/pdf', extensions: ['pdf'], maxBytes: 50_000_000, extractor: 'pdf', maxPages: 400, fallback: 'vision' },
          { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['docx'], maxBytes: 30_000_000, extractor: 'docx', maxExpandedBytes: 200_000_000 },
          { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extensions: ['pptx'], maxBytes: 60_000_000, extractor: 'pptx', maxSlides: 400, maxExpandedBytes: 300_000_000 },
          { mime: 'image/png', extensions: ['png'], maxBytes: 20_000_000, extractor: 'vision' },
          { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], maxBytes: 20_000_000, extractor: 'vision' },
          { mime: 'image/webp', extensions: ['webp'], maxBytes: 20_000_000, extractor: 'vision' },
        ],
        parserTimeoutMs: 60_000,
      },
    },
    ...overrides,
  };
}
