// StructuredError (spec §3) as a throwable, plus HTTP status mapping (§10).

const STATUS = {
  invalid_input: 400, ownership_denied: 404, content_not_ready: 409, version_conflict: 409,
  idempotency_conflict: 409, unsupported_format: 415, quality_gate: 422, rate_limited: 429,
  provider_unavailable: 503, provider_timeout: 503, stale_dependency: 409, budget_exhausted: 422,
  cancelled: 409, deleted: 404, internal_error: 500, payload_too_large: 413, unauthenticated: 401, forbidden: 403,
};
const SPEC_CODES = new Set(['unsupported_format', 'quality_gate', 'invalid_input', 'provider_timeout', 'provider_unavailable', 'rate_limited', 'stale_dependency', 'budget_exhausted', 'ownership_denied', 'content_not_ready', 'version_conflict', 'idempotency_conflict', 'cancelled', 'deleted', 'internal_error']);
const RETRYABLE = new Set(['provider_timeout', 'provider_unavailable', 'rate_limited']);

export class AppError extends Error {
  constructor(code, message, { retryable = RETRYABLE.has(code), retryAfterMs = null, issues = [], status, details } = {}) {
    super(message);
    this.code = code; this.retryable = retryable; this.retryAfterMs = retryAfterMs; this.issues = issues;
    this.status = status ?? STATUS[code] ?? 500; this.details = details;
  }
  toStructured() {
    const code = SPEC_CODES.has(this.code) ? this.code : this.code === 'payload_too_large' ? 'invalid_input' : ['unauthenticated', 'forbidden'].includes(this.code) ? 'ownership_denied' : 'internal_error';
    return { code, retryable: this.retryable, message: this.message, retryAfterMs: this.retryAfterMs, issues: this.issues };
  }
}

export const fail = (code, message, options) => { throw new AppError(code, message, options); };

/** Any thrown value as a StructuredError without leaking provider internals. */
export function structured(error) {
  if (error instanceof AppError) return error.toStructured();
  return { code: 'internal_error', retryable: false, message: 'An internal error occurred.', retryAfterMs: null, issues: [] };
}

export const issue = (code, message, { severity = 'warning', affected = [], evidence = [], resolution = 'open' } = {}) => ({ code, severity, message, affected, evidence, resolution });
