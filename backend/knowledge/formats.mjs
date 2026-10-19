import { AppError } from '../core/errors.mjs';

// L1 deterministic extraction (spec §4.1): capability lookup, MIME sniffing, and per-format parsers
// that return ordered regions. Each region becomes one immutable SourceAnchor. Regions a parser
// cannot read (scanned pages, images) come back `uncertain` for model-assisted escalation.

const MAX_REGION_CHARS = 6000; // long paragraphs split so one anchor always fits a segment

export function capabilityFor(config, { filename, declaredMime }) {
  const ext = String(filename).toLowerCase().split('.').pop();
  const formats = config.uploads.capabilities.formats;
  return formats.find(f => f.mime === declaredMime && f.extensions.includes(ext)) || null;
}

/** Sniff the real type from bytes; text formats fall back to the declared type when valid UTF-8. */
export function detectMime(bytes, declaredMime) {
  const head = bytes.subarray(0, 8);
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const sample = bytes.subarray(0, Math.min(bytes.length, 4000)).toString('latin1');
    if (sample.includes('word/')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (sample.includes('ppt/')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    return 'application/zip';
  }
  const text = bytes.toString('utf8');
  if (!text.includes('�') && !/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 4000))) return ['text/markdown', 'text/csv', 'text/plain'].includes(declaredMime) ? declaredMime : 'text/plain';
  return 'application/octet-stream';
}

const emptyLocation = () => ({ page: null, slide: null, sheet: null, cells: null, sectionPath: [], paragraph: null, originalByteStart: null, originalByteEnd: null, extractedCharStart: null, extractedCharEnd: null, bbox: null, timeStartMs: null, timeEndMs: null });

function splitLong(text) {
  if (text.length <= MAX_REGION_CHARS) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > MAX_REGION_CHARS) {
    let cut = rest.lastIndexOf('. ', MAX_REGION_CHARS);
    if (cut < MAX_REGION_CHARS / 2) cut = rest.lastIndexOf(' ', MAX_REGION_CHARS);
    if (cut < MAX_REGION_CHARS / 2) cut = MAX_REGION_CHARS;
    parts.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

const looksLikeFormula = text => text.length < 300 && /[=∑∫√≤≥≠±×÷^_]|\\frac|\\sum/.test(text) && (text.match(/[a-zA-Z]{4,}/g) || []).length < 6;

/** Markdown/plain text → regions per paragraph with heading paths. */
function markdownRegions(text, base = {}) {
  const regions = [];
  const headings = [];
  let paragraph = 0, pendingHeading = '';
  // Blank lines split paragraphs, except inside a fenced code block or a $$ display (a block still open takes the next).
  const blocks = [];
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const last = blocks.at(-1) ?? '';
    if (blocks.length && ((last.match(/^\s*```/gm) || []).length % 2 || (last.match(/\$\$/g) || []).length % 2)) blocks[blocks.length - 1] = `${last}\n\n${block}`;
    else blocks.push(block);
  }
  for (const block of blocks) {
    let trimmed = block.trim();
    if (!trimmed) continue;
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed.split('\n')[0]);
    if (heading) {
      headings.length = heading[1].length - 1;
      headings[heading[1].length - 1] = heading[2].trim();
      // A heading on its own is kept with the paragraph it introduces.
      if (!trimmed.includes('\n')) { pendingHeading = pendingHeading ? `${pendingHeading}\n\n${trimmed}` : trimmed; continue; }
    }
    if (pendingHeading) { trimmed = `${pendingHeading}\n\n${trimmed}`; pendingHeading = ''; }
    const kind = /^\|.*\|/m.test(trimmed) ? 'table' : looksLikeFormula(trimmed) ? 'formula' : 'text';
    for (const piece of splitLong(trimmed)) {
      paragraph++;
      regions.push({ kind, disposition: 'faithful', text: piece, location: { ...emptyLocation(), ...base, sectionPath: headings.filter(Boolean), paragraph } });
    }
  }
  if (pendingHeading) regions.push({ kind: 'text', disposition: 'faithful', text: pendingHeading, location: { ...emptyLocation(), ...base, sectionPath: headings.filter(Boolean), paragraph: paragraph + 1 } });
  return regions;
}

function csvRegions(text, format) {
  const rows = text.replace(/\r\n?/g, '\n').split('\n').filter(r => r.trim());
  if (rows.length > (format.maxRows || 20_000)) throw new AppError('quality_gate', `CSV has ${rows.length} rows; the limit is ${format.maxRows}.`);
  const header = rows[0] || '';
  const regions = [];
  for (let i = 1; i < rows.length || i === 1; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const table = [header, header.split(',').map(() => '---').join(','), ...chunk].map(r => `| ${r.split(',').join(' | ')} |`).join('\n');
    regions.push({ kind: 'table', disposition: 'faithful', text: table, location: { ...emptyLocation(), sheet: 'csv', cells: `A${i + 1}:${String.fromCharCode(64 + Math.min(26, header.split(',').length))}${i + chunk.length}` } });
    if (!chunk.length) break;
  }
  return regions;
}

/** A PDF opened page by page: `text(n)` is page n's text layer (lines joined by y), `png(n)` renders it. */
export async function openPdf(bytes, format) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
  let doc;
  try { doc = await task.promise; }
  catch (error) { throw new AppError(/password/i.test(error.message) ? 'unsupported_format' : 'quality_gate', /password/i.test(error.message) ? 'Password-protected PDFs are not supported.' : 'This PDF could not be parsed.', { retryable: false }); }
  if (doc.numPages > (format.maxPages || 400)) { void task.destroy(); throw new AppError('quality_gate', `PDF has ${doc.numPages} pages; the limit is ${format.maxPages}.`, { retryable: false }); }
  return {
    pages: doc.numPages,
    async text(n) {
      const content = await (await doc.getPage(n)).getTextContent();
      let text = '', lastY;
      for (const item of content.items) {
        if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 2) text += '\n';
        text += item.str; lastY = item.transform[5];
      }
      return text;
    },
    png: async (n, scale) => renderPage(await doc.getPage(n), scale),
    close: () => void task.destroy(),
  };
}

async function pdfRegions(bytes, format) {
  const pdf = await openPdf(bytes, format), regions = [];
  try { for (let n = 1; n <= pdf.pages; n++) regions.push(...await pdfPageRegions(pdf, n)); }
  finally { pdf.close(); }
  return regions;
}

/** Page n's regions from its text layer. A page without one (a scan or a drawing) is kept as an explicit uncertain region. */
export async function pdfPageRegions(pdf, n) {
  const text = await pdf.text(n);
  if (text.trim()) return markdownRegions(text, { page: n });
  let raster = null;
  try { raster = await pdf.png(n); } catch { /* no rasterizer: stays uncertain */ }
  return [{ kind: 'diagram', disposition: 'uncertain', text: null, uncertaintyReason: 'Page has no text layer (scanned image or diagram).', raster, location: { ...emptyLocation(), page: n, paragraph: 1 } }];
}

/** A page's markdown (its transcription) → regions per paragraph, located on that page. */
export const pageRegions = (markdown, page) => markdownRegions(markdown, { page });

async function renderPage(page, scale = 1.5) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toBuffer('image/png');
}

/** DOCX through mammoth HTML so tables and headings survive, then a small HTML→Markdown pass. */
async function docxRegions(bytes, format) {
  await guardZip(bytes, format);
  const mammoth = (await import('mammoth')).default;
  const { value: html } = await mammoth.convertToHtml({ buffer: bytes });
  return markdownRegions(htmlToMarkdown(html));
}

export function htmlToMarkdown(html) {
  const decode = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
  return html
    .replace(/<table[^>]*>([\s\S]*?)<\/table>/g, (_, body) => {
      const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => decode(c[1]).replace(/\|/g, '\\|')));
      if (!rows.length) return '';
      return `\n\n${[rows[0], rows[0].map(() => '---'), ...rows.slice(1)].map(r => `| ${r.join(' | ')} |`).join('\n')}\n\n`;
    })
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g, (_, n, t) => `\n\n${'#'.repeat(Number(n))} ${decode(t)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_, t) => `\n- ${decode(t)}`)
    .replace(/<\/?(ul|ol)[^>]*>/g, '\n\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_, t) => `\n\n${decode(t)}\n\n`)
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
}

async function guardZip(bytes, format) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);
  let expanded = 0;
  for (const file of Object.values(zip.files)) expanded += file._data?.uncompressedSize || 0;
  if (expanded > (format.maxExpandedBytes || 200_000_000)) throw new AppError('quality_gate', 'Archive expands beyond the configured limit.', { retryable: false });
  return zip;
}

async function pptxRegions(bytes, format) {
  const zip = await guardZip(bytes, format);
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/g).pop()) - Number(b.match(/\d+/g).pop()));
  if (slides.length > (format.maxSlides || 400)) throw new AppError('quality_gate', `Deck has ${slides.length} slides; the limit is ${format.maxSlides}.`, { retryable: false });
  const regions = [];
  for (const [i, name] of slides.entries()) {
    const xml = await zip.file(name).async('string');
    const paragraphs = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map(p => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join('')).filter(t => t.trim());
    const text = paragraphs.join('\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const hasPicture = /<p:pic>/.test(xml);
    if (text.trim()) regions.push({ kind: 'text', disposition: 'faithful', text: `Slide ${i + 1}. ${text}`, location: { ...emptyLocation(), slide: i + 1, sectionPath: [paragraphs[0]?.trim() || `Slide ${i + 1}`], paragraph: 1 } });
    if (hasPicture) regions.push({ kind: 'diagram', disposition: 'uncertain', text: null, uncertaintyReason: 'Slide contains an image whose content was not extracted.', location: { ...emptyLocation(), slide: i + 1, sectionPath: [paragraphs[0]?.trim() || `Slide ${i + 1}`], paragraph: 2 } });
  }
  return regions;
}

/** Run the deterministic parser for a capability. Returns regions in source order. */
export async function parseRegions(format, bytes) {
  switch (format.extractor) {
    case 'text': return markdownRegions(bytes.toString('utf8'));
    case 'csv': return csvRegions(bytes.toString('utf8'), format);
    case 'pdf': return pdfRegions(bytes, format);
    case 'docx': return docxRegions(bytes, format);
    case 'pptx': return pptxRegions(bytes, format);
    case 'vision': return [{ kind: 'diagram', disposition: 'uncertain', text: null, uncertaintyReason: 'Image content requires model-assisted reading.', raster: bytes, location: { ...emptyLocation(), page: 1, paragraph: 1 } }];
    default: throw new AppError('unsupported_format', `No extractor for ${format.mime}.`, { retryable: false });
  }
}

/** Bound parser runtime. */
export function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new AppError('quality_gate', 'Parser exceeded its time limit.', { retryable: false })), ms); })]).finally(() => clearTimeout(timer));
}
