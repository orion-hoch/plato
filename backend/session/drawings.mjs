import { hashOf, sha256Bytes, safe } from '../core/util.mjs';
import { fail } from '../core/errors.mjs';
import { validate } from '../core/shape.mjs';
import { call } from '../providers/contracts.mjs';
import { DRAWING, DRAWING_READING, DRAWING_SHAPES, DRAWING_SHAPES_READING } from './schemas.mjs';

// Drawn answers (v10 split): a PNG read by the drawing reader and committed like speech, a glance, and shape reads.

export function installDrawings(K) {
  const { app, db, learner, questions, loadSession, scopeOf, work } = K;

  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  /** A drawing's bytes: a PNG of at most 4 MB. */
  function pngOf(imageBase64) {
    const bytes = Buffer.from(imageBase64, 'base64');
    if (bytes.length > 4 * 1024 * 1024) fail('payload_too_large', 'The drawing is larger than 4 MB.');
    if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG)) fail('invalid_input', 'Send the drawing as a PNG image.');
    return bytes;
  }

  /**
   * A drawn answer: stored, read by the drawing reader, then committed like a spoken answer.
   * commit:false is a glance at the page: read only; nothing is stored, committed or planned.
   */
  async function drawings(principal, sessionId, body) {
    validate(DRAWING, body);
    const s0 = loadSession(principal, sessionId);
    const glance = body.commit === false;
    const bytes = pngOf(body.imageBase64);
    const inputHash = hashOf({ png: sha256Bytes(bytes), replyToQuestionId: body.replyToQuestionId, captureEpoch: body.captureEpoch, turnId: body.turnId, ...(body.text ? { text: body.text } : {}) });
    const resultOf = r => ({ responseId: r.id, attributedQuestionId: r.result.attributedQuestionId, evidenceStatus: r.result.evidenceStatus, transcription: r.drawing.reading.transcription, mathLatex: r.drawing.reading.mathLatex, confidence: r.drawing.reading.confidence, uncertainRegions: r.drawing.reading.uncertainRegions });
    const prior = glance ? null : db.findOne('finalized_responses', { sessionId: s0.id, clientResponseId: body.clientResponseId });
    if (prior) {
      if (prior.drawing?.inputHash !== inputHash) fail('idempotency_conflict', 'That response ID was already used with different content.');
      return resultOf(prior);
    }
    if (s0.status === 'ended') fail('invalid_input', 'This session has ended.'); // before the paid reading, glance or not
    const scope = scopeOf(s0);
    const artifact = glance ? null : app.blobs.put({ scope, bytes, mediaType: 'image/png' });
    const questionId = body.replyToQuestionId || s0.activeQuestionId;
    const question = questionId ? safe(() => questions().speakingForm(scope, questionId), null) : null;
    const learnerContext = safe(() => learner().contextRef(scope, s0.activeTopicId ? [s0.activeTopicId] : []), null);
    const read = await call(input => app.providers.drawingReader.read(input), {
      work: work(scope, `drawing:${s0.id}:${body.clientResponseId}`, { inputHash }), image: { ...artifact, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }, question, learnerContext,
    }, { valueSchema: DRAWING_READING, what: 'drawing reading' });
    // A failed reading is unreadable: the student is asked to clarify, nothing adverse is recorded.
    const reading = read.outcome === 'ok' ? read.value : { transcription: '', mathLatex: null, uncertainRegions: ['The drawing could not be read.'], confidence: 'unreadable' };
    if (glance) return { transcription: reading.transcription, mathLatex: reading.mathLatex, confidence: reading.confidence, uncertainRegions: reading.uncertainRegions };
    // Words typed alongside the writing belong to the same turn: one response carries both.
    const written = [reading.transcription.trim() || '[unreadable drawing]', reading.mathLatex ? `(as LaTeX: ${reading.mathLatex})` : ''].filter(Boolean).join(' ');
    const text = [body.text?.trim(), written].filter(Boolean).join('\n').slice(0, 8000);
    const uncertain = reading.confidence === 'unreadable' || (reading.confidence === 'partial' && reading.uncertainRegions.length > 0);
    await K.commitResponse(s0, {
      clientResponseId: body.clientResponseId, captureEpoch: body.captureEpoch, turnId: body.turnId, replyToQuestionId: body.replyToQuestionId,
      text, finalized: true, transcriptVersion: 1, confidence: uncertain ? 0 : null,
      ambiguousSpans: uncertain ? (reading.uncertainRegions.length ? reading.uncertainRegions : ['unreadable']).slice(0, 20).map(x => x.slice(0, 500)) : [],
      audioArtifactId: null, supersedesResponseId: null,
    }, { drawing: { artifact, inputHash, reading } });
    return resultOf(db.findOne('finalized_responses', { sessionId: s0.id, clientResponseId: body.clientResponseId }));
  }

  /**
   * What a drawing is made of, from its PNG and the same ink as numbered strokes (the page asks only for ink that looks
   * like a drawing, and never makes a hand-in wait for it): read only; nothing is stored, committed or planned. Items
   * name their strokes, and each gets a box spanning them in the PNG's pixels: positions are ours, never the model's.
   * A stroke left out, given twice or made up, or a reference to no item, makes the reading uncertain. A failed reading
   * is no diagram: { kind: null, reading: null, items: [], uncertain: [] }.
   */
  async function drawingShapes(principal, sessionId, body) {
    validate(DRAWING_SHAPES, body);
    const s0 = loadSession(principal, sessionId), bytes = pngOf(body.imageBase64), { strokes } = body.ink;
    if (strokes.some((stroke, i) => stroke.id !== i)) fail('invalid_input', 'Number the strokes 0, 1, 2, … in drawing order.');
    if (s0.status === 'ended') fail('invalid_input', 'This session has ended.');
    const png = sha256Bytes(bytes);
    const read = await call(input => app.providers.drawingReader.shapes(input), {
      work: work(scopeOf(s0), `shapes:${s0.id}:${png}`, { png }), image: { dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }, ink: body.ink,
    }, { valueSchema: DRAWING_SHAPES_READING, what: 'drawing shapes' });
    if (read.outcome !== 'ok' || read.value.diagram === 'none' || !read.value.items.length) return { kind: null, reading: null, items: [], uncertain: [] };
    const { diagram, items, reading, uncertain } = read.value, named = new Set(items.map(item => item.id)), seen = items.flatMap(item => item.strokes), placed = new Set(seen);
    const unmatched = placed.size !== seen.length || seen.some(k => k >= strokes.length) || strokes.some((_, k) => !placed.has(k))
      || items.some(item => [item.from, item.to, item.parent].some(ref => ref !== null && !named.has(ref)));
    const span = boxes => boxes.length ? [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))] : null;
    return {
      kind: diagram, reading,
      items: items.map(item => ({ ...item, box: span(item.strokes.filter(k => k < strokes.length).map(k => strokes[k].box)) })),
      uncertain: [...uncertain, ...(unmatched ? ['part of the drawing may be missing from this reading'] : [])],
    };
  }

  Object.assign(K, { PNG, pngOf, drawings, drawingShapes });
}
