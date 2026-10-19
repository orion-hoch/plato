import { newId, hashOf } from '../core/util.mjs';
import { AppError, structured } from '../core/errors.mjs';
import { problems, jsonSchema, stripNulls, s } from '../core/shape.mjs';

// Provider plumbing shared by every module (spec §3, §5): WorkIdentity, CallResult, ProviderRun,
// and a call wrapper that turns malformed output into a failed attempt, never an empty success.

export const OUTCOMES = ['ok', 'noop', 'needs_review', 'failed', 'stale'];

export function workIdentity({ scope, operationId = newId('op'), idempotencyKey, input, dependencies = [], cancellationGeneration = 0, deadlineAt, budget, clock }) {
  return {
    scope, operationId, idempotencyKey: idempotencyKey || operationId, inputHash: hashOf(input ?? null),
    dependencies, cancellationGeneration,
    deadlineAt: deadlineAt || new Date(clock.now() + (budget?.maxWallTimeMs ?? 600_000)).toISOString(),
    budget: budget || { maxProviderCalls: 10, maxInputTokens: 400_000, maxOutputTokens: 100_000, maxWallTimeMs: 600_000, maxAttempts: 3 },
  };
}

export const ok = (value, extra = {}) => ({ outcome: 'ok', value, reason: null, uncertainties: [], issues: [], providerRuns: [], error: null, ...extra });
export const noop = (value, reason, extra = {}) => ({ outcome: 'noop', value, reason, uncertainties: [], issues: [], providerRuns: [], error: null, ...extra });
export const failed = (error, extra = {}) => ({ outcome: 'failed', value: null, reason: error.message, uncertainties: [], issues: error.issues || [], providerRuns: [], error: structured(error), ...extra });

const CALL_RESULT = s.object({
  outcome: s.enum(OUTCOMES), value: s.json(), reason: s.nullable(s.string()),
  uncertainties: s.array(s.json()), issues: s.array(s.json()), providerRuns: s.array(s.json()), error: s.nullable(s.json()),
});

/**
 * Call an adapter method and validate its CallResult. `valueSchema` checks `value` for ok/noop.
 * Exceptions become a failed CallResult with a structured error (retryable when the cause is).
 */
export async function call(adapterFn, input, { valueSchema, what = 'provider output' } = {}) {
  let result;
  try { result = await adapterFn(input); }
  catch (error) {
    if (process.env.BACKEND_DEBUG) console.error(`provider call failed (${what}):`, error);
    return failed(error instanceof AppError ? error : new AppError('provider_unavailable', 'The provider call failed.'));
  }
  const shapeProblems = problems(CALL_RESULT, result);
  if (shapeProblems.length) return failed(new AppError('quality_gate', `Malformed ${what}: ${shapeProblems.slice(0, 3).join('; ')}`, { retryable: true }));
  if ((result.outcome === 'ok' || result.outcome === 'noop') && valueSchema && result.value !== null) {
    const valueProblems = problems(valueSchema, result.value);
    if (valueProblems.length) return failed(new AppError('quality_gate', `Malformed ${what}: ${valueProblems.slice(0, 3).join('; ')}`, { retryable: true }), { providerRuns: result.providerRuns });
  }
  if (result.outcome === 'ok' && result.value === null) return failed(new AppError('quality_gate', `Empty ${what}.`, { retryable: true }), { providerRuns: result.providerRuns });
  return result;
}

/** Throw when a CallResult failed, so job retry/backoff handles it. */
export function unwrap(result) {
  if (result.outcome === 'failed') {
    const e = result.error || { code: 'internal_error', message: 'Provider failed', retryable: false };
    throw new AppError(e.code, e.message, { retryable: e.retryable, retryAfterMs: e.retryAfterMs, issues: e.issues });
  }
  return result;
}

/**
 * Model gateway over the Codex runtime: structured JSON output validated against a shape schema.
 * Roles name a lane in server/runtime.mjs (astra = the deep model's background lane, plato = the light one).
 */
export function createModelGateway({ runtime, clock }) {
  // onText (v9): the structured reply's text as it streams, for a caller that reads its fields as they complete.
  async function structuredCall({ role, instructions, input, schema, promptTemplateVersion, configVersion = 'cfg_v1', images = [], signal, timeoutMs, effort, onText }) {
    const startedAt = clock.iso();
    const run = settings => ({ adapter: 'codex-app-server', modelId: settings?.model || 'unknown', modelVersion: null, promptTemplateVersion, configVersion, requestId: newId('req'), startedAt, finishedAt: clock.iso() });
    const runtimeRole = { astra: 'heavy', plato: 'light' }[role] || role;
    try {
      const response = await runtime.ask({ role: runtimeRole, instructions, input, schema: jsonSchema(schema), images, signal, timeoutMs, effort, onText });
      const value = stripNulls(schema, response.json);
      const p = problems(schema, value);
      if (p.length) return failed(new AppError('quality_gate', `Model output failed validation: ${p.slice(0, 3).join('; ')}`, { retryable: true }), { providerRuns: [run(runtime.roles[runtimeRole])] });
      return ok(value, { providerRuns: [run(runtime.roles[runtimeRole])] });
    } catch (error) {
      if (process.env.BACKEND_DEBUG) console.error(`model call failed (${promptTemplateVersion}):`, error.message);
      const timeout = /took too long|timed out/i.test(error.message || '');
      return failed(new AppError(timeout ? 'provider_timeout' : 'provider_unavailable', timeout ? 'The model timed out.' : 'The model was unavailable.'), { providerRuns: [run(runtime.roles[runtimeRole])] });
    }
  }

  return { structured: structuredCall };
}

/** ProviderRun for deterministic mock adapters. */
export const mockRun = (adapter, promptTemplateVersion, clock) => ({ adapter, modelId: `mock-${adapter}`, modelVersion: '1', promptTemplateVersion, configVersion: 'cfg_v1', requestId: newId('req'), startedAt: clock.iso(), finishedAt: clock.iso() });
