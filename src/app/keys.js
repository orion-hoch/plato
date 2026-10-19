// Typing: Enter sends what is typed, written and worked as one turn, and the keys work wherever focus is.
import { typedAnswer } from '../inputs/answer.mjs';

export function createKeys({ toggleTalk, now, session, ink, bridge, sending, typer, screen, setTyped, said, toAgent, tell, answerAsk, openDraft, complain, fresh, ownWork, commit, freshWork, markHanded, handWork, handIn }) {
  // Enter: what is typed, what is written and new work in a zone go to Plato together, as one turn (the writing's
  // commit carries the rest); under an open question that is the writing for it, and notes on Plato's material stay.
  // With nothing written or worked, the typed line answers a text or number question on the page, unless it ends in
  // "?" (that is a question back); with nothing typed either, Enter hands in a selection, order or pairs. Under an
  // exam problem the typed line is only a message: the problem is handed in from its last part.
  async function send() {
    const text = now.current.typed.trim(), ask = now.current.page?.ask, open = ask && !ask.answered;
    if (open && ask.parts) { if (text) { setTyped(''); tell(text); } return; }
    const strokes = fresh(open ? ownWork() : ink.current?.strokes() || []), zones = freshWork();
    if (!strokes.length) {
      if (!text && !zones) { const pending = openDraft(); if (pending) answerAsk(ask, pending.structured, pending.text); return; }
      setTyped('');
      if (zones) { if (text) said(text); handWork([zones, text].filter(Boolean).join('\n'), open ? ask : null); return; }
      const answer = open && ['text', 'number'].includes(ask.input?.kind) && !text.endsWith('?') ? typedAnswer(ask.input.kind, text) : null;
      if (answer) answerAsk(ask, answer, text); else tell(text);
      return;
    }
    if (sending.current) return;
    sending.current = true; setTyped('');
    if (text) said(text);
    if (zones) markHanded();
    const words = [text, zones].filter(Boolean).join('\n');
    try {
      const read = await commit(strokes, words);
      toAgent([words, `[Written on the page] ${read || '(unreadable)'}`].filter(Boolean).join('\n'));
    } catch (problem) {
      if (words) { void bridge.current?.userSaid(words.slice(0, 8000)); toAgent(words); }
      complain(problem?.status === 404 ? 'Reading handwriting isn’t available on this server yet.' : problem?.message || 'Couldn’t read that writing.');
    } finally { sending.current = false; }
  }
  // The keys, wherever focus is, and a phone's keyboard: listening until the returned function stops it.
  function listen() {
    // Typing needs no box: keys go to the unseen line the conversation shows (Enter sends it, Escape clears it), and so
    // does a paste. Plato is told the student is busy, so it holds back. Cmd/Ctrl+Z takes back a stroke of writing when
    // nothing is typed (typed words keep their own undo). Enter with writing on the page, new work in a zone, or a
    // selection to hand in, sends it. A work zone keeps its own keys. Under an exam problem, keys go to the part in
    // focus: typing to its own work (else to the line), and Enter on the last part hands the problem in.
    const typeAnywhere = event => {
      const target = event.target, typing = event.key.length === 1 || event.key === 'Backspace';
      if (typing) { session.current?.sendUserActivity(); bridge.current?.typingStarted(); }
      if (target?.closest?.('input, select, [contenteditable="true"], .course-tree, .zone')) return;
      // Space with nothing typed: talking on or off (the talk button), anywhere but a button, a field or a work zone.
      // Not in a text box other than the conversation's own line (19 Oct: it took every space out of the new-course form's "What
      // are you studying for?").
      if (event.key === ' ' && !now.current.typed && !(target?.closest?.('textarea') && target !== typer.current) && !event.metaKey && !event.ctrlKey && !event.altKey && !target?.closest?.('button')) { event.preventDefault(); toggleTalk?.(); return; }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !now.current.typed && ink.current?.strokes().length) { event.preventDefault(); ink.current.undo(); return; }
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || target?.closest?.('textarea')) return;
      // Enter on a selection's own tiles hands it in (Space still presses one).
      const pending = event.key === 'Enter' && target?.closest?.('.page-ask button') ? openDraft() : null;
      if (pending) { event.preventDefault(); answerAsk(now.current.page.ask, pending.structured, pending.text); return; }
      if (target?.closest?.('button') && (event.key === ' ' || event.key === 'Enter')) return;
      const ask = now.current.page?.ask, part = ask?.parts && !ask.answered ? document.querySelector('.exam-part.is-focused') : null;
      if (part && event.key === 'Enter') { event.preventDefault(); if (!part.nextElementSibling) void handIn(ask); return; }
      if (event.key === 'Enter' && (ink.current?.strokes().length || openDraft() || freshWork())) { event.preventDefault(); void send(); return; }
      if (typing) ((part && [...part.querySelectorAll('textarea, input')].at(-1)) || typer.current)?.focus();
    };
    // A phone's keyboard covers the foot of the screen: the conversation's last line rides above it (--kb).
    const view = window.visualViewport;
    const keyboard = () => screen.current?.style.setProperty('--kb', `${Math.max(0, Math.round(innerHeight - view.height - view.offsetTop))}px`);
    view?.addEventListener('resize', keyboard);
    view?.addEventListener('scroll', keyboard);
    document.addEventListener('keydown', typeAnywhere, true);
    return () => {
      view?.removeEventListener('resize', keyboard);
      view?.removeEventListener('scroll', keyboard);
      document.removeEventListener('keydown', typeAnywhere, true);
    };
  }
  return { send, listenKeys: listen };
}
