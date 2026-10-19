// Test-only file builders: real PDF bytes (text and text-less pages) and a minimal PPTX.

/** A valid PDF. Each page is a string (text lines) or null (a page with no text layer, like a scan). */
export function makePdf(pages) {
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pagesId = objects.length + 1; objects.push(null);
  const kids = [];
  for (const page of pages) {
    const lines = page === null ? [] : String(page).split('\n');
    const stream = lines.length ? `BT /F1 11 Tf 14 TL 50 760 Td ${lines.map(l => `(${l.replace(/[()\\]/g, m => `\\${m}`)}) '`).join(' ')} ET` : 'q 0.5 g 50 600 200 100 re f Q';
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A minimal PPTX with one text box per slide; `picture: true` adds an image placeholder. */
export async function makePptx(slides) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="p"/>');
  slides.forEach((slide, i) => {
    const paras = slide.lines.map(l => `<a:p><a:r><a:t>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a:t></a:r></a:p>`).join('');
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody>${paras}</p:txBody></p:sp>${slide.picture ? '<p:pic></p:pic>' : ''}</p:spTree></p:cSld></p:sld>`);
  });
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** Upload + PUT + finalize one file through the real knowledge service. */
export function uploadFile(app, principal, exam, { filename, mime, bytes, replacingSourceFileId }) {
  const K = app.services.knowledge;
  const [u] = K.createUploads(principal, exam.id, [{ filename, size: bytes.length, declaredMime: mime, ...(replacingSourceFileId ? { replacingSourceFileId } : {}) }]);
  if (!u.uploadToken) return { ...u, finalized: null };
  const { checksum, byteLength } = K.putUploadBytes(u.uploadToken, bytes);
  return { ...u, finalized: K.finalizeUpload(principal, exam.id, u.sourceFileId, { uploadToken: u.uploadToken, checksum, uploadedByteLength: byteLength }) };
}

export const md = text => ({ mime: 'text/markdown', bytes: Buffer.from(text) });

/** Run background work one step at a time until `done()` is true (or nothing is left). */
export async function runUntil(app, done, max = 5000) {
  for (let i = 0; i < max; i++) {
    if (done()) return true;
    const delivered = app.events.dispatch();
    const ran = await app.jobs.runOnce();
    if (!delivered && !ran) return done();
  }
  throw new Error('runUntil did not settle');
}

/** Wrap every provider method to record its requests. */
export function spyProviders(app) {
  const calls = [];
  for (const [name, impl] of Object.entries(app.providers)) for (const [method, fn] of Object.entries(impl)) {
    impl[method] = async request => { calls.push({ name, method, request }); return fn(request); };
  }
  return calls;
}

export const scopeOf = (app, exam) => app.auth.examScope(app.db.get('exams', exam.id));
