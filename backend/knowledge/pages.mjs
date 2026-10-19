import { AppError } from '../core/errors.mjs';
import { call, workIdentity } from '../providers/contracts.mjs';
import { openPdf, pdfPageRegions, pageRegions, withTimeout } from './formats.mjs';
import { PAGE_TRANSCRIPT } from './schemas.mjs';

// PDFs as clean markdown (v8). Each page is rendered (a PNG blob, linked from the page's regions and anchors) and
// transcribed from the image by the model-assisted extraction reader (extractor.transcribe: Luna), with the page's text
// layer as a hint against misreads: code fenced with its language, tables as tables, math as LaTeX, figures as
// "[Figure: …]". Pages run in parallel, at most LUNA_PAGE_CONCURRENCY (default 4) at a time, inside extract_source; a
// finished page is checkpointed, so a retry redoes only the rest. A page that cannot be transcribed keeps its text layer,
// or, without one, stays an uncertain raster for the region escalation.

const SCALE = 2; // ~1224×1584 px for a letter page: small code and exponents stay legible

export async function transcribePdf(app, { scope, sv, file, bytes, format, ctx }) {
  const pdf = await withTimeout(openPdf(bytes, format), app.config.uploads.capabilities.parserTimeoutMs);
  const done = { ...(ctx.current.checkpoint?.pages || {}) }, runs = [], issues = [], retry = [], pages = [];
  const limit = Math.max(1, Number(process.env.LUNA_PAGE_CONCURRENCY) || 4);

  async function page(n) {
    const text = await pdf.text(n);
    let png = null;
    try { png = await pdf.png(n, SCALE); } catch { /* no rasterizer here: the text layer stands */ }
    if (!png) return pdfPageRegions(pdf, n);
    const image = app.blobs.put({ scope, bytes: png, mediaType: 'image/png' });
    if (!done[n]) {
      const result = await call(input => app.providers.extractor.transcribe(input), {
        work: workIdentity({ scope, idempotencyKey: `transcribe:${sv.id}:${n}`, input: { sourceVersionId: sv.id, page: n }, clock: app.clock }),
        filename: file.filename, page: n, pageCount: pdf.pages, textLayer: text, image: `data:image/png;base64,${png.toString('base64')}`,
      }, { valueSchema: PAGE_TRANSCRIPT, what: 'page transcription' });
      runs.push(...(result.providerRuns || []));
      if (result.outcome === 'ok' && result.value.legible && result.value.markdown.trim()) {
        done[n] = { markdown: result.value.markdown.trim(), confidence: result.value.confidence };
        ctx.checkpoint({ ...ctx.current.checkpoint, pages: done });
      } else {
        if (result.error?.retryable) retry.push(n);
        issues.push(`Page ${n} was not transcribed (${result.outcome === 'ok' ? 'the reader found it illegible' : result.error?.message || 'reader failed'}); its text layer is used.`);
      }
    }
    const regions = done[n] ? pageRegions(done[n].markdown, n).map(r => ({ ...r, origin: 'model', confidence: done[n].confidence })) : await pdfPageRegions(pdf, n);
    return regions.map(r => ({ ...r, pageImage: image }));
  }

  try {
    let next = 1;
    await Promise.all(Array.from({ length: Math.min(limit, pdf.pages) }, async () => { for (let n; (n = next++) <= pdf.pages;) pages[n - 1] = await page(n); }));
  } finally { pdf.close(); }
  if (retry.length && ctx.job.attempt < ctx.job.maxAttempts) throw new AppError('provider_unavailable', `${retry.length} page(s) could not be transcribed yet; retrying.`, { retryable: true });
  return { regions: pages.flat(), runs, issues };
}
