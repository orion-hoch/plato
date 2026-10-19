import { api } from './backend-client.js';
import { actorCard } from '../backend/session/agent.mjs';
import { hedgesOf } from '../shared/elements/task.mjs';

// Connects Plato's live ElevenLabs conversation to the tutor backend (agent transport):
// - the director's move cards and its answers to think go into the conversation as context (docs/director-actor.md);
// - what the student says becomes finalized responses (evidence, assessment, personalization);
// - what Plato actually says comes back as delivery records (spec §5.4: played vs interrupted);
// - each learner turn carries its latency and hedges (system-spec §15 rule 7), and what they do on an element or a
//   reading goes to /evidence in small batches (§15b; reading.md §8).
// It also owns the exam: creating it on the first document, uploading files, and the topic list.

const MASTERY_LABEL = { Emerging: 'emerging', Developing: 'developing', Secure: 'secure' };
// How the student likes to learn holds for every course unless they say otherwise; what they want help with,
// their goals and their exam belong to this one.
const STYLE = new Set(['explanation_order', 'pace', 'detail', 'practice_style', 'visuals']);
const FAILED = new Set(['failed', 'needs_review']);
/** Words, not noise: speech recognition hears silence as "..." and the like, which is never the student's turn. */
export const isSpeech = text => /[\p{L}\p{N}]/u.test(String(text ?? ''));

/** A reading of the student's writing as words for Plato, or '' when nothing could be made out. */
export function written(reading) {
  const text = String(reading?.transcription || '').trim();
  if (!text || reading.confidence === 'unreadable') return '';
  return reading.mathLatex ? `${text} (as math: ${reading.mathLatex})` : text;
}

/** What a drawing is made of as words for Plato ("drew: …", with what was unclear), or '' when it holds no diagram. */
export function drawn(shapes) {
  const reading = String(shapes?.reading || '').trim();
  if (!reading) return '';
  const unclear = shapes.uncertain?.length ? ` (unclear: ${shapes.uncertain.join('; ')})` : '';
  return `drew: ${reading}${unclear}`.slice(0, 1000);
}

// The course this browser studies (its examId), kept here; choosing one opens the page on it.
const COURSE_KEY = 'plato.course';
/** The course open on this page (its examId), for Plato's brief (local-actor.js). */
export let openCourse = null;
export function chosenCourse() { try { return localStorage.getItem(COURSE_KEY); } catch { return null; } }
// tree: chosen from the course page, which the page opens on again (16 Oct, the user: "it needs to stay on the course tree").
export function chooseCourse(examId, { tree = false } = {}) { try { localStorage.setItem(COURSE_KEY, examId); if (tree) sessionStorage.setItem('plato.tree', '1'); } catch { /* storage off: nothing to keep it in */ } location.reload(); }
/** Whether this page load opens on the course page (chooseCourse's tree), once. */
export function takeTree() { try { const t = sessionStorage.getItem('plato.tree'); sessionStorage.removeItem('plato.tree'); return !!t; } catch { return false; } }

export class TutorBridge {
  constructor({ onTopics, onReady, onContext, onError, onFocus, onNews, onReading, onAgenda, onCard, onThought, onResumed, onChoose, resume = false } = {}) {
    // resume: a page load picks up the session open on this exam (the page; evals start fresh). onResumed({ spoken }).
    Object.assign(this, { onTopics, onReady, onContext, onError, onFocus, onNews, onReading, onAgenda, onCard, onThought, onResumed, onChoose, resume });
    // The current card's text, for a conversation that starts after it came.
    this.cardLine = null;
    this.focus = null;
    this.exam = null; this.session = null; this.topics = []; this.ready = false;
    // question: the one a card put on its board, until the page poses it.
    this.status = null; this.question = null;
    this.state = { epoch: 0, turnId: null, activeQuestionId: null };
    // What the student said about themselves before there was a course to keep it in (see remember()).
    this.setup = [];
    // Topic ids and failed files already seen, and topic titles already announced: news is only what is new.
    this.known = null; this.failed = null; this.told = new Set();
    // Drops this page is still uploading.
    this.uploading = 0;
    // The session's goals ({ goals, currentGoalId, … }), for the strip at the top left.
    this.agenda = null;
  }

  async init() {
    // A server that can't be reached yet (restarting, the Mac waking) is tried again, more slowly each time, until it is.
    for (let pause = 1000; !this.closed; pause = Math.min(pause * 2, 15_000)) {
      try {
        // The course they chose (15 Oct, the user: "I want to add multiple classes … so the user can study multiple things"),
        // even while it is still being read: Plato opens on it and starts on it when it is published. With one course, that
        // one; with several and none chosen, none: they choose (onChoose), never a default. A drop or a preference meanwhile
        // waits for it (`opening`), so it never makes a second course or waits for one that exists.
        await (this.opening = api.listExams().then(({ exams }) => {
          const chosen = chosenCourse();
          this.exam = exams.find(e => e.examId === chosen) || (exams.length === 1 ? exams[0] : null);
          if (!this.exam && exams.length > 1) this.onChoose?.(exams);
          openCourse = this.exam?.examId || null;
        }));
        if (this.exam) await this.refresh();
        return;
      } catch (error) {
        if (error?.status && error.status < 500) { this.onError?.(error.message); return; }
        await new Promise(resolve => setTimeout(resolve, pause));
      }
    }
  }

  /** Status and topics; starts the tutoring session once material is published, and follows new material as it is read. */
  async refresh() {
    if (!this.exam) return;
    const [status, topics] = await Promise.all([api.status(this.exam.examId), api.topics(this.exam.examId)]);
    this.status = status;
    if (topics) this.learn(topics.topics || []);
    this.failures(status.files || []);
    // A file still 'uploading' counts only while this page sends it: one whose upload broke off is never finalized.
    const reading = Boolean(this.uploading || status.pendingBuild || status.files?.some(f => f.status === 'processing'));
    this.onReading?.(reading);
    if (status.knowledgeVersion && status.knowledgeVersion !== this.version) void this.refreshFocus();
    this.version = status.knowledgeVersion;
    if (status.knowledgeVersion && !this.session) await this.startSession();
    // An unpublished course is watched until it publishes: its build may be retried from elsewhere.
    if (reading || !status.knowledgeVersion) this.poll();
  }

  poll() {
    clearTimeout(this.pollTimer);
    if (!this.closed) this.pollTimer = setTimeout(() => void this.refresh().catch(() => this.poll()), 4000);
  }

  /** The topic list; topics that were not there before are news (the roots of new subtrees, by title). */
  learn(list) {
    const before = this.known;
    this.known = new Set(list.map(t => t.id));
    this.topics = list; this.onTopics?.(list, this.exam.title);
    if (!before) return;
    const fresh = list.filter(t => !before.has(t.id)), ids = new Set(fresh.map(t => t.id));
    this.news(fresh.filter(t => !ids.has(t.parentId)).map(t => t.title));
  }

  news(titles) {
    const fresh = titles.filter(title => title && !this.told.has(title));
    for (const title of fresh) this.told.add(title);
    if (fresh.length) this.onNews?.(`[New material ready] new topics: ${fresh.slice(0, 8).join(', ')}${fresh.length > 8 ? ', …' : ''}.`);
  }

  /** Files that could not be read since this page opened. */
  failures(files) {
    const failed = files.filter(f => FAILED.has(f.status));
    if (!this.failed) { this.failed = new Set(failed.map(f => f.sourceFileId)); return; }
    for (const f of failed) {
      if (this.failed.has(f.sourceFileId)) continue;
      this.failed.add(f.sourceFileId);
      this.onNews?.(`[Couldn't read] ${f.filename}: ${f.error?.message || 'it could not be read.'}`);
    }
  }

  /** Dropped files: create the course on the first drop (once, however many drops race it), upload them all, and follow the build.
   *  `title` (or a promise of it, such as a PDF's own title) names a course this creates; the first file's name stands in. */
  async addDocuments(files, title) {
    this.uploading++; this.onReading?.(true);
    try {
      await this.opening?.catch(() => {});
      if (!this.exam) await (this.creating ??= this.create(files, title).catch(error => { this.creating = null; throw error; }));
      await api.upload(this.exam.examId, files);
    } finally { this.uploading--; if (this.exam) this.poll(); }
  }

  async create(files, title) {
    const named = String(await Promise.resolve(title).catch(() => '') || '').trim() || files[0].name.replace(/\.[^.]+$/, '');
    // What the student already said goes in with the course: the profile starts from it.
    const said = this.setup, day = said.findLast(s => s.day)?.day;
    const created = await api.createExam({
      title: named.slice(0, 200),
      goals: said.filter(s => s.type === 'goal').map(s => s.text).slice(-20),
      preferences: said.filter(s => s.type === 'preference').map((s, i) => ({ key: s.key === 'other' ? `other_${i + 1}` : s.key, value: s.text, applicability: s.applicability })).slice(-20),
      ...(day ? { examDate: day } : {}),
    });
    this.setup = [];
    openCourse = created.examId;
    this.exam = { examId: created.examId, title: named, knowledgeReady: false, rowVersion: created.rowVersion, examDate: day || null };
    this.known = new Set(); this.failed = new Set();
  }

  /** Something the student said about the help they want, how they learn, a goal or their exam (remember_preference).
   *  Their exam date goes on the exam; the rest into their profile. Before there is a course it waits for the first drop. */
  async remember({ statement, about = 'other', appliesTo = null, date = null }) {
    const text = String(statement || '').trim().slice(0, 4000), day = about === 'exam_date' && /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : null;
    if (!text && !day) return;
    const learnerWide = !['goal', 'help_wanted', 'exam_date', 'exam_scope'].includes(about) && (appliesTo ? appliesTo === 'all_courses' : STYLE.has(about));
    const said = { text, key: about, day, type: day ? 'date' : about === 'goal' ? 'goal' : 'preference', applicability: learnerWide ? 'learner' : 'exam' };
    await this.opening?.catch(() => {});
    if (!this.exam) await this.creating?.catch(() => {});
    if (!this.exam) { this.setup.push(said); return; }
    try {
      if (day) {
        const fresh = (await api.listExams()).exams.find(e => e.examId === this.exam.examId);
        const patched = await api.patchExam(this.exam.examId, { examDate: day, expectedRowVersion: fresh?.rowVersion ?? this.exam.rowVersion });
        Object.assign(this.exam, { rowVersion: patched.rowVersion, examDate: patched.examDate });
      // A goal or an "other" keys itself from its words, so a second one never replaces the first.
      } else await api.feedback(this.exam.examId, { text, type: said.type, ...(about !== 'other' && about !== 'goal' ? { key: about } : {}), topicIds: [], applicability: said.applicability });
    } catch { /* best-effort: Plato heard it and follows it in this conversation */ }
  }

  /** A session: on a page load, the one open on this exam (resumed: its card, agenda and Plato's lines come back, and its
   *  events follow from where they were, so nothing replays); a topic pressed starts a new one. */
  async startSession(topicId = null) {
    this.stopEvents?.();
    const resume = this.resume && !topicId && !this.session, key = `plato.session.${this.exam.examId}`;
    if (this.session) void api.end(this.session, { expectedEpoch: this.state.epoch || 1 }).catch(() => {});
    let remembered = null;
    try { remembered = resume ? globalThis.localStorage?.getItem(key) : null; } catch { /* storage blocked: the newest open session */ }
    const started = await api.startSession(this.exam.examId, { transport: 'agent', ...(topicId ? { topicId } : {}), ...(resume ? { resume: true, ...(remembered ? { sessionId: remembered } : {}) } : {}) });
    try { globalThis.localStorage?.setItem(key, started.sessionId); } catch { /* best-effort */ }
    this.session = started.sessionId; this.question = null;
    this.resumed = started.resumed ? { spoken: started.spoken || [] } : null;
    this.setAgenda(started.agenda);
    this.state = { epoch: started.epoch, turnId: started.currentTurnId, activeQuestionId: null };
    // The start result carries card 1.
    this.cardLine = this.cardId = this.card = null;
    if (started.card) this.takeCard(started.card);
    if (this.resumed) this.onResumed?.(this.resumed); // after its card is in, so Plato picks up with it
    this.stopEvents = api.events(this.session, { cursor: started.resumed ? started.sequence ?? 0 : 0, onEvent: event => this.receive(event), onError: error => this.onError?.(error.message) });
    if (!this.ready) { this.ready = true; this.onReady?.(); }
    return started;
  }

  receive(event) {
    const p = event.payload || {};
    if (typeof event.epoch === 'number') this.state.epoch = Math.max(this.state.epoch, event.epoch);
    // The session's goals (session.started, agenda.updated): the strip redraws, and a change Plato didn't make (its note)
    // is his to hear.
    if (p.agenda && (event.type === 'session.started' || event.type === 'agenda.updated')) this.setAgenda(p.agenda);
    if (event.type === 'agenda.updated' && p.note) this.onContext?.(p.note);
    if (event.type === 'session.started' || event.type === 'turn.listening') {
      this.state.turnId = p.turnId ?? this.state.turnId;
      if ('activeQuestionId' in p) this.state.activeQuestionId = p.activeQuestionId;
    }
    else if (event.type === 'response.committed') { this.state.turnId = p.turnId ?? this.state.turnId; void this.refreshTopicsSoon(); }
    else if (event.type === 'epoch.changed') this.state.epoch = p.newEpoch;
    else if (event.type === 'question.withdrawn') {
      if (this.state.activeQuestionId === p.questionId) this.state.activeQuestionId = null;
      if (this.question?.questionId === p.questionId) this.question = null;
    }
    else if (event.type === 'agent.recorded' && p.questionId) this.state.activeQuestionId = p.questionId;
    // A file added to a course already set up, filed into its topics within minutes (backend/ingest): where it went.
    else if (event.type === 'material.attached' && p.line) this.onNews?.(p.line);
    // The director's next move, and its answer to Plato's think.
    else if (event.type === 'card.issued' && p.card) this.takeCard(p.card, p.question, p.text, p.respondsTo ?? null);
    else if (event.type === 'card.updated') this.updateCard(p);
    // The director's background note in guide mode ([Checked] …, [Note] …): context for Plato's next reply, never a turn.
    else if (event.type === 'tutor.note' && p.text) (p.speak && p.responseId && p.responseId === this.lastResponseId && this.onSpeak ? this.onSpeak : this.onContext)?.(String(p.text)); // a verdict on their latest line: said now
    else if (event.type === 'thought.ready') this.onThought?.(p);
    else if (event.type === 'thought.updated') this.onThought?.(p, true); // streamed think: its board, after the words
    else if (event.type === 'thought.progress') this.onThought?.(p, 'progress'); // something being made: its stage or outline
    // New material adopted, or a new topic: a question still to pose belonged to what came before.
    else if (event.type === 'adoption' || event.type === 'topic.changed') {
      this.question = null;
      if (event.type === 'adoption') { this.news(p.newTopicTitles || []); void this.refreshTopicsSoon(0); }
    }
  }

  async refreshTopicsSoon(delay = 8000) {
    clearTimeout(this.topicTimer);
    this.topicTimer = setTimeout(async () => {
      try { const t = await api.topics(this.exam.examId); if (t) this.learn(t.topics || []); } catch { /* next time */ }
    }, delay);
  }

  /** The student's focus sections; the active one steers the tutor (and the stones around the sphere). */
  async refreshFocus() {
    if (!this.exam) return null;
    try {
      const { sections, activeSectionId } = await api.focus(this.exam.examId);
      this.sections = sections; this.focus = sections.find(x => x.id === activeSectionId) || null;
      this.onFocus?.(this.focus, sections);
    } catch { /* focus is optional; the tutor still works without it */ }
    return this.focus;
  }

  /** A move card: its show (a v2 card) or board to the page the first time it is seen, its text to Plato: a v2 card's is
   *  actorCard(card), an older card's the director's `text` once it comes (card 1 comes first in the start result,
   *  without it). That text also starts a new conversation. A question on its board waits to be posed. */
  takeCard(card, question = null, text = '', respondsTo = null) {
    if (card.wait && card.move) text = actorCard(card); // card v2 (shared/cards.mjs): the actor's reading of it is ours
    const fresh = card.id !== this.cardId;
    if (fresh) {
      Object.assign(this, { cardId: card.id, card, cardLine: null });
      const q = question || card.board?.question || (card.show?.kind === 'question' ? card.show.question : null);
      if (q?.questionId && q.voiceForm) this.question = q;
    }
    const line = text && !this.cardLine ? text : '';
    if (line) this.cardLine = line;
    // respondsTo: the learner's response this card answers (the page voices it now if none came after it).
    if (fresh || line) this.onCard?.(fresh ? card : {}, line, false, respondsTo);
  }

  /** More of the current card (streamed cards, card.updated: branches, a board, cues, an equation, or a branch taken
   *  back). Its added lines go to Plato as they are, and stay with the card's text for a new conversation; the page gets
   *  only what changed (a board already up is not drawn again). An update for a card no longer current is dropped. */
  updateCard({ cardId, card, text = '', question = null }) {
    if (!card || (cardId || card.id) !== this.cardId) return;
    const before = this.card || {}, same = key => JSON.stringify(before[key] ?? null) === JSON.stringify(card[key] ?? null);
    if (card.wait && card.move) { // a v2 card that grew: only its new lines go to Plato
      const had = new Set(actorCard(before).split('\n'));
      text = actorCard(card).split('\n').filter(line => !had.has(line)).join('\n');
      this.card = card;
      if (text) this.cardLine = actorCard(card);
      this.onCard?.(same('show') ? {} : { show: card.show, id: card.id, expect: card.expect, persona: card.persona }, text, true);
      return;
    }
    this.card = card;
    if (text) this.cardLine = [this.cardLine, text].filter(Boolean).join('\n');
    const q = question || card.board?.question;
    if (q?.questionId && q.voiceForm) this.question = q;
    // A new board brings the card's cues with it; new cues alone point at what is up.
    this.onCard?.({ board: same('board') ? null : card.board, point: same('board') && same('point') ? null : card.point }, text, true);
  }

  /** A card's question with id `id`, to pose, once: posed, it is the question being answered from then on. */
  takeQuestion(id) {
    const question = this.question?.questionId === id ? this.question : null;
    if (question) { this.question = null; this.state.activeQuestionId = question.questionId; }
    return question;
  }

  /** A graded answer from the page: the readable text plus the structured value for exact grading. */
  async answer(text, structuredAnswer) {
    return this.userSaid(text, structuredAnswer);
  }

  /** Everything a fresh conversation needs to know: the current card. */
  contextForConversation() { return [this.cardLine].filter(Boolean); }

  /** Plato finished a line (played or cut off): the learner's latency counts from here. */
  platoDone(at = Date.now()) { this.platoEnd = at; this.typingSince = null; }
  /** The learner started typing (their first key since Plato's last line). */
  typingStarted(at = Date.now()) { this.typingSince ??= at; }
  /** A turn's latency (from the end of Plato's line to the start of theirs: their first key, or for speech its end less
   *  its words at about 150 a minute) and its hedges. ponytail: speech start estimated; the provider's VAD start is the upgrade. */
  turnMeta(text, at = Date.now()) {
    const start = this.typingSince ?? at - (String(text).match(/\S+/g) || []).length * 400;
    this.typingSince = null;
    return { hedges: hedgesOf(text), ...(this.platoEnd ? { latencyMs: Math.min(3_600_000, Math.max(0, Math.round(start - this.platoEnd))) } : {}) };
  }

  /** The student's finished turn. */
  async userSaid(text, structuredAnswer = null) {
    if (!this.session || !isSpeech(text)) return;
    try {
      const result = await api.respond(this.session, {
        clientResponseId: crypto.randomUUID(), captureEpoch: this.state.epoch, turnId: this.state.turnId, replyToQuestionId: this.state.activeQuestionId,
        text: text.trim(), finalized: true, transcriptVersion: 1, confidence: null, ambiguousSpans: [], audioArtifactId: null, supersedesResponseId: null,
        ...(structuredAnswer ? { structuredAnswer } : {}), ...this.turnMeta(text),
      });
      this.state.turnId = result.turnId ?? this.state.turnId;
      this.lastResponseId = result.responseId ?? this.lastResponseId; // the newest learner line committed
    } catch (error) { if (error.code !== 'version_conflict') this.onError?.(error.message); }
  }

  /** Something shown on the page, reported like speech: a posed question marks it asked. */
  async boardEvent(type, text, questionId = null) {
    if (!this.session || !text?.trim()) return;
    try { await api.agentEvents(this.session, { events: [{ clientEventId: crypto.randomUUID(), type, text: text.trim().slice(0, 8000), ...(questionId ? { questionId } : {}), interrupted: false, occurredAt: new Date().toISOString() }] }); }
    catch { /* best-effort, as for speech */ }
  }

  /** Writing from the page: the backend reads it and records it, with any words typed alongside, as the
   *  student's response; or with `commit: false` only reads it (a glance at the page, no turn, no evidence). */
  async submitDrawing(imageBase64, { commit = true, text = '' } = {}) {
    if (!this.session) throw Error('Plato isn’t ready to read writing yet.');
    return api.submitDrawing(this.session, { clientResponseId: crypto.randomUUID(), imageBase64, replyToQuestionId: this.state.activeQuestionId, captureEpoch: this.state.epoch, turnId: this.state.turnId, ...(commit ? (text ? { text: text.slice(0, 2000) } : {}) : { commit: false }) });
  }

  /** What a drawing is made of: its PNG and `ink`, the same strokes numbered (Ink's trace). Read only: no turn, no evidence. */
  async readShapes(imageBase64, ink) {
    if (!this.session) throw Error('Plato isn’t ready to read drawings yet.');
    return api.readShapes(this.session, { imageBase64, ink });
  }

  get sessionId() { return this.session; }

  setAgenda(agenda) { this.agenda = agenda || null; this.onAgenda?.(this.agenda); }

  /** What the learner did on an element or a reading: sent in batches a second apart, retried until it lands. */
  evidence(event) {
    (this.events ??= []).push(event);
    clearTimeout(this.eventTimer);
    this.eventTimer = setTimeout(() => {
      while (this.events.length) { const batch = this.events.splice(0, 50); if (this.session) void api.evidence(this.session, batch).catch(() => {}); }
    }, 1000);
  }

  /** The open learner model (can-do statements, beliefs being worked on, calibration, what's due), or null. */
  async map() { return this.exam ? api.map(this.exam.examId).catch(() => null) : null; }

  /** What Plato said, once it finished playing or was interrupted. */
  async agentSaid(text, { interrupted = false } = {}) {
    this.platoDone();
    if (!this.session || !text?.trim()) return;
    try {
      await api.agentEvents(this.session, { events: [{ clientEventId: crypto.randomUUID(), type: 'agent_response', text: text.trim().slice(0, 8000), interrupted, occurredAt: new Date().toISOString() }] });
    } catch { /* delivery records are best-effort from the client; the session continues */ }
  }

  async studyTopic(topic) {
    if (!this.exam || !topic) return;
    await this.startSession(topic.id);
  }

  topicLabel(topic) {
    const m = topic?.mastery;
    return m?.status === 'estimated' && MASTERY_LABEL[m.label] ? `${topic.title}, ${MASTERY_LABEL[m.label]}` : topic?.title;
  }

  // The session stays open: an unmount is a hot reload as often as a goodbye, and the next page load resumes it
  // (19 Oct: a code reload ended the user's session mid-lesson). A new session on this exam ends it (start).
  close() { this.closed = true; clearTimeout(this.pollTimer); clearTimeout(this.topicTimer); this.stopEvents?.(); }
}
