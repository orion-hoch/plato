import { Conversation } from '@elevenlabs/client';

// Load the browser SDK up front so its iOS audio-unlock listener is armed.
// The UX fork has one fresh ElevenLabs conversation, with no tools. It starts
// with no study data; the only way any enters is sendContext, when the person
// hands Plato a document.
// It is live whenever its page is visible: hiding the page releases the
// microphone, and coming back opens a new conversation without a click.
// The page's own server hands it a short-lived token for a private agent. A
// page with no server (a static host) names a public agent instead, and the
// SDK asks ElevenLabs for the token itself. Neither way puts a key in the browser.
// Without a microphone it is the same agent, text only over a WebSocket, so typed words still get answers.

// Plato's words reach the page as they are heard. A reply's whole text (agent_response) comes at or before
// its audio; each audio chunk's alignment says when its characters are heard, so the line shows the prefix
// heard so far, cut back to a whole word. Characters are counted, never shown (speech may spell "0x2A" out).
// ponytail: LAG_MS is a calibration knob for WebRTC's jitter buffer (by ear, ±150 ms); RATE (characters a
// second) stands in when no alignment arrives at all, as with an agent whose client events leave out audio.
const LAG_MS = 250, RATE = 14;
// The end of the sentence that the character at `at` belongs to (a stop followed by a space or the end).
export const sentenceEnd = (text, at) => { const stop = /[.!?…]+(?=\s|$)/g; stop.lastIndex = Math.min(at, text.length); const found = stop.exec(text); return found ? found.index + found[0].length : text.length; };
// A reply this soon after the last one (text, a tool call, more text) carries on the same line. An interrupted
// line waits this long for the provider's account of what was actually said. Text whose audio never comes (or
// has long gone) is shown whole after SILENT_MS.
const MERGE_MS = 1500, CORRECTION_MS = 800, SILENT_MS = 3000;

export class LiveVoiceSession {
  constructor(hooks = {}, dependencies = {}) {
    this.hooks = hooks;
    this.deps = {
      agentId: '',
      workletPath: '/eleven-raw-audio.js',
      loadConversation: async () => Conversation,
      fetch: globalThis.fetch.bind(globalThis),
      document: globalThis.document,
      window: globalThis.window,
      mediaDevices: globalThis.navigator?.mediaDevices,
      permissions: globalThis.navigator?.permissions,
      now: () => performance.now(),
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      ...dependencies,
    };
    this.closed = false;
    this.paused = false;
    this.ready = false;
    this.retry = true;
    this.heardUser = false;
    this.connectedAt = null;
    this.state = 'idle';
    this.mode = 'listening';
    // Plato's current line { id, text, shown, base, at, told, final, closed, interrupted, endedAt }, and when
    // each character of its audio since `base` will have been heard.
    this.line = null;
    this.ends = [];
    this.lastEnd = 0;
    this.aligned = false;
    this.textOnly = false;
    // The microphone is off until they turn it on (the talk button, or Space): an open mic took background speech as answers.
    this.micOn = false;
    this.generation = 0;
    this.ending = new WeakMap();
    // A text chat stays open while they look at another tab: there is nothing to save by closing it (14 Oct: each return
    // started a new conversation that had forgotten the problem it had just set).
    this._visibility = () => { if (this.deps.textOnly) return; if (this.deps.document?.hidden) void this.pause('page-hidden'); else void this.resume(); };
    this._pagehide = () => { void this.pause('page-hidden'); };
    this._pageshow = () => { if (!this.deps.document?.hidden) void this.resume(); };
    this.deps.document?.addEventListener('visibilitychange', this._visibility);
    this.deps.window?.addEventListener('pagehide', this._pagehide);
    this.deps.window?.addEventListener('pageshow', this._pageshow);
  }

  /** Talking on or off: the microphone is muted unless they turned it on. */
  setListening(on) { this.micOn = Boolean(on); this._mic(); }
  _mic() { try { this.voice?.setMicMuted?.(!this.micOn); } catch { /* not connected yet: applied on connect */ } }

  start() {
    if (this.closed || this.ready) return Promise.resolve(false);
    if (this.startPromise) return this.startPromise;
    const generation = ++this.generation;
    this.paused = false;
    this.retry = true;
    this.heardUser = false;
    this.connectedAt = null;
    this.mode = 'listening';
    this.line = null;
    this.textOnly = false;
    this._state('connecting');
    const run = this._connect(generation);
    this.startPromise = run;
    void run.finally(() => { if (this.startPromise === run) this.startPromise = null; });
    return run;
  }

  async _connect(generation) {
    const current = () => !this.closed && !this.paused && generation === this.generation;
    const startedAt = this.deps.now();
    const controller = new AbortController();
    this.request = controller;
    let timeout, probe, silent = '';
    try {
      // Ask for the microphone first, inside the click, so the browser prompt appears before anything else.
      // Refused or missing, the person is told how to fix it, and Plato answers what they type meanwhile.
      const microphone = this._microphone(current);
      if (microphone) probe = await microphone.catch(error => { if (!(error instanceof ConnectionError)) throw error; silent = error.message; });
      if (!current()) return false;
      if (silent) { this.textOnly = true; this.hooks.onError?.(silent); }
      if (this.deps.textOnly) this.textOnly = true; // a chat by text by choice (the local actor without a voice): words show as they come
      timeout = this.deps.setTimeout(() => controller.abort(), 20_000);
      const agentId = this.deps.agentId;
      // Text goes over a WebSocket: ElevenLabs closes a text-only WebRTC room about 10 s after it opens (no
      // microphone track ever arrives), and a WebSocket to a private agent needs a signed URL, not a WebRTC token.
      const transport = silent ? 'websocket' : 'webrtc';
      const [Conversation, access] = await Promise.all([
        this.deps.loadConversation(),
        agentId ? { agentId } : this._token(controller.signal, transport),
      ]);
      this.deps.clearTimeout(timeout);
      if (!current()) return false;
      // These are the only values the conversation starts with. No application state is among them.
      const voice = await Conversation.startSession({
        ...access,
        connectionType: transport,
        workletPaths: { rawAudioProcessor: this.deps.workletPath },
        // The agent has to allow this override (platform_settings.overrides.conversation_config_override.conversation.text_only).
        ...(silent ? { textOnly: true, overrides: { conversation: { textOnly: true } } } : {}),
        // Tools the agent can call on this page: Plato's page and what it asks there.
        ...(this.hooks.clientTools ? { clientTools: this.hooks.clientTools } : {}),
        onConversationCreated: conversation => {
          if (current()) { this.voice = conversation; this._mic(); }
          else void this._end(conversation);
        },
        onConnect: ({ conversationId } = {}) => {
          if (!current()) return;
          this.sessionId = conversationId;
          this.ready = true;
          this._mic();
          this.connectedAt = this.deps.now();
          this._state(this.mode);
          this.hooks.onEvent?.({ type: 'voice.started', sessionId: conversationId, provider: 'elevenlabs', transport });
          this.hooks.onMetrics?.({ startupMs: this.deps.now() - startedAt, sessionId: conversationId });
        },
        onDisconnect: details => {
          if (!current()) return;
          if (details?.reason === 'error') this.hooks.onError?.('The voice connection ended. Click the mosaic to reconnect.');
          void this.close(details?.reason || 'provider-closed');
        },
        onError: message => {
          if (!current()) return;
          this.retry = !needsPerson(message);
          this.hooks.onError?.(voiceError(message));
          void this.close('error');
        },
        onModeChange: ({ mode }) => {
          if (!current() || !['speaking', 'listening'].includes(mode)) return;
          this.mode = mode;
          if (this.ready) this._state(mode);
          // Plato stopped: his line shows whole (an interrupted one waits for what was actually said).
          if (mode === 'listening' && !this.line?.interrupted) this._finish();
        },
        onMessage: message => {
          if (!current()) return;
          const role = message.role === 'agent' || message.source === 'ai' ? 'assistant' : 'user';
          const text = String(message.message || '');
          // Noise heard as "..." is nobody speaking: an empty room must still come to rest.
          if (role === 'user' && /[\p{L}\p{N}]/u.test(text)) {
            this.heardUser = true;
            // The student spoke: what Plato says next is a new line.
            if (this.line) { this.line.closed = true; if (!this.line.interrupted) this._finish(); }
          }
          if (role === 'assistant' && text.trim()) this._reply(this.deps.textOnly ? text.replace(/^ +| +$/g, '') : text.trim()); // a streamed chat's pieces keep their line breaks
          this.hooks.onEvent?.({ type: 'voice.transcript', sessionId: this.sessionId, role, text, turnId: message.response_id ?? message.event_id });
        },
        onAudioAlignment: alignment => { if (current()) this._align(alignment); },
        onAgentResponseCorrection: correction => { if (current()) this._corrected(correction); },
        onInterruption: () => {
          if (!current()) return;
          const line = this.line;
          if (line && !line.final) {
            line.interrupted = line.closed = true;
            this.deps.clearTimeout(this.revealing);
            this.correcting = this.deps.setTimeout(() => this._cut(), CORRECTION_MS);
          }
          this.mode = 'listening';
          if (this.ready) this._state('listening');
        },
      });
      if (!current()) { await this._end(voice); return false; }
      this.voice = voice;
      this.ready = true;
      this._state(this.mode);
      this.meter = this.deps.setInterval(() => {
        if (!current() || !this.ready) return;
        try {
          const value = this.mode === 'speaking' ? voice.getOutputVolume() : voice.getInputVolume();
          this.hooks.onLevel?.(Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
        } catch { this.hooks.onLevel?.(0); }
      }, 60);
      return true;
    } catch (error) {
      if (!current()) return false;
      const known = error instanceof ConnectionError ? error : turnedAway(error?.message);
      // With no microphone, the microphone is still what the person has to fix.
      this.retry = !silent && (known ? known.retry : !needsPerson(error?.name || error?.message));
      this.hooks.onError?.(silent || (known ? known.message : voiceError(error?.name || error?.message)));
      await this.close('error');
      return false;
    } finally {
      // The SDK opens its own microphone track; the probe only holds the permission until then.
      probe?.getTracks().forEach(track => track.stop());
      this.deps.clearTimeout(timeout);
      if (this.request === controller) this.request = null;
    }
  }

  // The only thing this page ever asks its server for: an empty request and a WebRTC token back, or, for a
  // conversation in text, { textOnly: true } and a signed WebSocket URL back.
  async _token(signal, transport = 'webrtc') {
    const text = transport === 'websocket';
    const response = await this.deps.fetch('/api/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: text ? '{"textOnly":true}' : '{}', signal,
    });
    const body = await response.json();
    if (!response.ok) {
      const code = body?.error?.code || body?.code;
      throw new ConnectionError(serverError(code), !SETUP_FAILURES.has(code));
    }
    const credential = text ? body.signedUrl : body.conversationToken;
    if (typeof credential !== 'string' || !credential) {
      throw new ConnectionError('The voice connection was unavailable. Click the mosaic to try again.');
    }
    return text ? { signedUrl: credential } : { conversationToken: credential };
  }

  _microphone(current) {
    const media = this.deps.mediaDevices;
    if (!media?.getUserMedia) return null;
    const permission = async () => {
      try { return (await this.deps.permissions?.query({ name: 'microphone' }))?.state; } catch { return undefined; }
    };
    let waiting = true;
    const request = media.getUserMedia({ audio: true });
    void permission().then(state => {
      if (waiting && state === 'prompt' && current()) this.hooks.onError?.('Allow the microphone in the browser prompt to start.');
    });
    return request.then(stream => {
      waiting = false;
      if (current()) this.hooks.onError?.('');
      return stream;
    }, async error => {
      waiting = false;
      throw new ConnectionError(microphoneError(error?.name, await permission()), false);
    });
  }

  _state(state) {
    if (this.state === state) return;
    this.state = state;
    this.hooks.onState?.(state);
  }

  // A reply's text: a new line, or more of the current one (with nothing of the new part heard yet).
  _reply(text) {
    const now = this.deps.now(), line = this.line;
    if (line && !line.closed && (!line.final || now - line.endedAt < MERGE_MS)) {
      if (line.final) Object.assign(line, { final: false, base: line.text.length + 1, at: now });
      line.text = /^\n/.test(text) ? `${line.text}${text}` : `${line.text} ${text}`; // a piece that starts a new line keeps it (lists, code)
    } else {
      this._cut();
      this.line = { id: crypto.randomUUID(), text: text.replace(/^\n+/, ''), shown: '', base: 0, at: now, told: 0, final: false };
    }
    // A text-only conversation has no voice to follow: its words are all there at once. A streamed text chat (the local actor
    // without a voice) shows the line growing and finishes it once, when the reply ends (13 Oct: each piece was saved as its own line).
    // (this.line: a new line was just made; 14 Oct: the old one here threw on a conversation's first reply and lost the turn.)
    if (this.textOnly && this.deps.textOnly) { const open = this.line; open.shown = open.text; this.hooks.onLine?.({ who: 'plato', id: open.id, text: open.text, final: false }); }
    else if (this.textOnly) this._finish(); else this._reveal();
  }

  // A chunk of Plato's audio: when each of its characters will have been heard.
  _align({ char_start_times_ms: starts = [], char_durations_ms: lengths = [] } = {}) {
    if (!this.aligned && import.meta.env?.DEV) console.info('Plato: audio alignment arrives; his words show as they are heard.');
    this.aligned = true;
    const start = Math.max(this.deps.now() + LAG_MS, this.lastEnd);
    starts.forEach((at, i) => this.ends.push(start + at + (lengths[i] || 0)));
    this.lastEnd = Math.max(this.lastEnd, ...this.ends.slice(-1));
    this._reveal();
  }

  // The line as far as Plato has got, in whole sentences: the one he is saying shows in full as soon as he starts it,
  // so the words are there to read as fast as he speaks them. Looked at again shortly while more may come.
  _reveal() {
    const line = this.line;
    this.deps.clearTimeout(this.revealing);
    if (!line || line.final) return;
    const now = this.deps.now();
    const heard = this.aligned ? this.ends.filter(end => end <= now).length : Math.floor((now - line.at - LAG_MS) * RATE / 1000);
    const count = line.base + Math.max(0, heard);
    // What has really been heard, in whole words: what a line cut off with no account is taken to have said.
    line.heard = count >= line.text.length ? line.text : line.text.slice(0, count + 1).replace(/\S*$/, '').trimEnd();
    const shown = line.text.slice(0, sentenceEnd(line.text, count)).trimEnd();
    if (shown !== line.shown) { line.shown = shown; this.hooks.onLine?.({ who: 'plato', id: line.id, text: shown, final: false }); }
    if (this.mode === 'listening' && now > Math.max(line.at, this.lastEnd) + SILENT_MS) { this._finish(); return; }
    this.revealing = this.deps.setTimeout(() => this._reveal(), 60);
  }

  // The provider's account of what an interrupted reply actually said before it stopped.
  _corrected({ original_agent_response: was = '', corrected_agent_response: said = '' } = {}) {
    // Only for the open line that said it; one that came too late leaves the cut as it was.
    const line = this.line, at = was && line && !line.final ? line.text.lastIndexOf(was) : -1;
    if (at < 0) return;
    line.interrupted = line.closed = true;
    this._finish(`${line.text.slice(0, at)}${said}`.trim());
  }

  // Cut off with no account of what was said: what had been heard is what was said (not the rest of the sentence shown).
  _cut() {
    if (this.line && !this.line.final) { this.line.interrupted = true; this._finish(this.line.heard || ''); }
  }

  // The line is done: it shows whole, and what was said since it was last handed on is handed on (`spoken`).
  _finish(text) {
    const line = this.line;
    this.deps.clearTimeout(this.revealing);
    this.deps.clearTimeout(this.correcting);
    // His audio has stopped (or was cut): what comes next is heard from when it arrives.
    this.ends = [];
    this.lastEnd = 0;
    if (!line || line.final) return;
    if (text !== undefined) line.text = text;
    Object.assign(line, { final: true, shown: line.text, endedAt: this.deps.now() });
    const spoken = line.text.slice(line.told).trim();
    line.told = line.text.length;
    this.hooks.onLine?.({ who: 'plato', id: line.id, text: line.text, final: true, spoken, interrupted: Boolean(line.interrupted) });
  }

  _end(voice) {
    if (!voice) return Promise.resolve();
    if (!this.ending.has(voice)) {
      this.ending.set(voice, Promise.resolve().then(() => voice.endSession()).catch(() => {}));
    }
    return this.ending.get(voice);
  }

  _release(reason) {
    this._cut();
    this.generation++;
    this.ready = false;
    this.request?.abort();
    this.request = null;
    this.deps.clearInterval(this.meter);
    this.meter = null;
    this.hooks.onLevel?.(0);
    const voice = this.voice;
    this.voice = null;
    if (this.sessionId) {
      this.hooks.onEvent?.({ type: 'voice.ended', sessionId: this.sessionId, reason });
      this.sessionId = null;
    }
    this.releasePromise = this._end(voice);
    return this.releasePromise;
  }

  async pause(reason = 'user') {
    if (this.closed || this.paused) return;
    this.paused = true;
    const release = this._release(reason);
    this._state('paused');
    this.hooks.onPause?.(reason);
    await release;
  }

  async resume() {
    if (this.closed || !this.paused || this.resuming) return false;
    this.resuming = true;
    try {
      // Let a cancelled SDK startup clean itself up before requesting another microphone session.
      await this.releasePromise;
      await this.startPromise;
      if (this.closed || !this.paused) return false;
      this.startPromise = null;
      return await this.start();
    } finally { this.resuming = false; }
  }

  // The SDK plays Plato through its own hidden audio element. A browser that
  // held it back until the page was touched lets it through on the next touch.
  enableAudio() {
    for (const element of this.deps.document?.querySelectorAll?.('audio') ?? []) {
      if (element.paused) void element.play?.()?.catch(() => {});
    }
  }

  // Tell Plato something without it counting as the person speaking, and without
  // prompting a reply. False when there is no live conversation to tell.
  sendContext(text) {
    const voice = this.ready ? this.voice : null;
    if (!voice?.sendContextualUpdate || typeof text !== 'string' || !text.trim()) return false;
    try { voice.sendContextualUpdate(text); return true; } catch { return false; }
  }

  // Something the student did on the page (pressed a choice, wrote an answer), told to Plato as their turn.
  sendUserMessage(text) {
    const voice = this.ready ? this.voice : null;
    if (!voice?.sendUserMessage || typeof text !== 'string' || !text.trim()) return false;
    try { voice.sendUserMessage(text); return true; } catch { return false; }
  }

  // The student is typing or writing: Plato holds back rather than cut in. The SDK sends at most one a second.
  sendUserActivity() {
    const voice = this.ready ? this.voice : null;
    if (!voice?.sendUserActivity) return false;
    try { voice.sendUserActivity(); return true; } catch { return false; }
  }

  // Both voices as the SDK's analysers hear them, reduced to a few bands for the
  // mosaic. Returns false, leaving the buffers alone, when nothing is connected.
  readSpectrum(heard, spoken) {
    const voice = this.ready ? this.voice : null;
    if (!voice?.getInputByteFrequencyData || !voice.getOutputByteFrequencyData) return false;
    try {
      voiceBands(voice.getInputByteFrequencyData(), heard);
      voiceBands(voice.getOutputByteFrequencyData(), spoken);
      return true;
    } catch { return false; }
  }

  async close(reason = 'user') {
    if (this.closed) return;
    this.closed = true;
    this.deps.document?.removeEventListener('visibilitychange', this._visibility);
    this.deps.window?.removeEventListener('pagehide', this._pagehide);
    this.deps.window?.removeEventListener('pageshow', this._pageshow);
    const livedMs = this.connectedAt === null ? 0 : this.deps.now() - this.connectedAt;
    const release = this._release(reason);
    this._state('idle');
    // Enough for the page to decide whether to come straight back.
    this.hooks.onClose?.({ reason, retry: this.retry, heardUser: this.heardUser, livedMs });
    await release;
  }
}

class ConnectionError extends Error {
  constructor(message, retry = true) { super(message); this.retry = retry; }
}

// Trying again cannot fix these; a person has to change something first.
const SETUP_FAILURES = new Set(['quota_exceeded', 'not_configured', 'missing_configuration']);
const needsPerson = (message = '') => /NotAllowed|permission|denied|NotFound|device not found/i.test(message);

// A public agent answers the browser itself, so its refusals arrive as the
// SDK's own error text: "Failed to fetch conversation token for agent <id>: <why>".
function turnedAway(message = '') {
  const why = /conversation token for agent \S+\s+(.*)$/is.exec(message)?.[1];
  if (!why) return null;
  if (/\b429\b|limit|quota|capacity/i.test(why)) return new ConnectionError('Plato is busy right now. Click the mosaic to try again in a while.', false);
  if (/\b40[134]\b|authentication enabled/i.test(why)) return new ConnectionError('Plato’s voice is not open to this page.', false);
  return null;
}

// The SDK reports 100-8000 Hz linearly. Voices are heard in octaves, so each
// band here is one step of a logarithmic scale, as a 0-1 share of full level.
export function voiceBands(bytes, bands) {
  const size = bytes?.length || 0, count = bands.length;
  if (!size) { bands.fill(0); return bands; }
  const edge = step => Math.round((80 ** (step / count) - 1) / 79 * size);
  for (let band = 0; band < count; band++) {
    const from = Math.min(size - 1, edge(band)), to = Math.min(size, Math.max(from + 1, edge(band + 1)));
    let sum = 0;
    for (let index = from; index < to; index++) sum += bytes[index];
    bands[band] = sum / (to - from) / 255;
  }
  return bands;
}

function voiceError(message = '') {
  if (/NotAllowed|permission|denied/i.test(message)) return 'Allow microphone access, then click the mosaic to try again.';
  if (/NotFound|device not found/i.test(message)) return 'Connect a microphone, then click the mosaic to try again.';
  if (/AbortError|timeout/i.test(message)) return 'The voice connection timed out. Click the mosaic to try again.';
  return 'The voice connection failed. Click the mosaic to try again.';
}

function microphoneError(name = '', permission) {
  if (/NotFound|Overconstrained/i.test(name)) return 'No microphone was found. Connect one, then click the mosaic to try again.';
  if (/NotReadable|Abort/i.test(name)) return 'The microphone is busy or unavailable. Close other apps using it, then click the mosaic.';
  if (permission === 'denied') return 'The microphone is blocked for this site. Allow it from the address bar, then click the mosaic.';
  return 'The browser could not use the microphone. Allow it in the prompt, or in System Settings > Privacy & Security > Microphone, then click the mosaic.';
}

function serverError(code) {
  if (code === 'rate_limited') return 'ElevenLabs is busy. Wait a moment, then click the mosaic to try again.';
  if (code === 'quota_exceeded') return 'The ElevenLabs account has reached its usage limit.';
  if (code === 'not_configured' || code === 'missing_configuration') return 'The ElevenLabs voice is not configured yet.';
  return 'The voice connection was unavailable. Click the mosaic to try again.';
}
