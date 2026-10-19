// Plato's page: his material and what he asks under it, separate parts of the page; and the student's answers on it.

const MAX_PAST = 12;
// What a board shows, without the card it came on: the same board again is the same board.
const shows = v => v && JSON.stringify(v.element ?? v.reading?.portion?.id ?? v.questionId ?? v.frame ?? v.video ?? [v.title, v.content, v.prompt, v.task, v.label, v.input]);

export function createPage({ setPage, bridge, said, toAgent, context, draft, now }) {
  // Plato's material and what it asks are separate parts of the page: new material keeps the question below it. A page
  // has a thread (the problem or idea its cards are on, `value.thread`; a board without one continues the current one):
  // within it, nothing is erased (12 Oct: each part of a multi-part question wiped the one before). The same board again
  // (a hint or re-ask on it) stays as it is, with what they did on it; a new one goes under the earlier ones, which stay
  // above to scroll back to (`past`). A new thread starts a clean page.
  function show(part, value) {
    setPage(p => {
      const cur = p?.[part], thread = value?.thread ?? p?.thread ?? null;
      if (value && cur && shows(cur) === shows(value)) return { ...p, thread, [part]: { ...cur, cardId: value.cardId ?? cur.cardId, branches: value.branches ?? cur.branches, persona: value.persona ?? cur.persona } };
      const same = p?.thread != null && thread === p.thread, next = { ...p, thread };
      if (same) {
        // New material in the thread moves everything on the page above it; a new ask or zone moves only the old one.
        const moved = part === 'material' ? ['material', 'ask', 'work'] : [part];
        next.past = [...(p.past || []), ...moved.filter(k => p[k]).map(k => ({ part: k, value: p[k] }))].slice(-MAX_PAST);
        for (const k of moved) next[k] = null;
      } else next.past = [];
      next[part] = value && { id: crypto.randomUUID(), ...value };
      return next.material || next.ask || next.work || next.past.length ? next : null;
    });
  }
  // A live visual as Plato's material ({ kind, spec, title, summary }, from a card or a thought).
  function showElement(made) {
    show('material', { title: String(made.title || '').slice(0, 120), element: { kind: made.kind, spec: made.spec } });
    void bridge.current?.boardEvent('board_content', [made.title, made.summary].filter(Boolean).join('\n'));
  }
  // Quotes from their notes under Plato's material ([{ text, source, anchorId }]).
  function quote(excerpts) {
    setPage(p => ({ ...p, material: p?.material ? { ...p.material, notes: excerpts } : { id: crypto.randomUUID(), title: '', notes: excerpts } }));
    void bridge.current?.boardEvent('board_content', excerpts.map(e => `From their notes (${e.source}): ${e.text}`).join('\n'));
  }
  // `quiet`: Plato took it himself (a tool's result), so it is recorded but not said to him again.
  function tell(text, structured = null, graded = false, quiet = false) {
    if (!text.startsWith('[')) said(text);
    void (graded ? bridge.current?.answer(text, structured) : bridge.current?.userSaid(text));
    if (!quiet) toAgent(text);
  }
  const answered = ask => setPage(p => p?.ask?.id === ask.id ? { ...p, ask: { ...p.ask, answered: true } } : p);
  // Answering on the page: graded for a posed question (structured, exact), ungraded for a quick check. The
  // conversation shows the answer in words ("B) a0 and a1"), never the tag Plato is sent.
  // A question with an answer key is marked on the page at once, his explain under it, and he hears it as a note, not a turn.
  function answerAsk(ask, structured, text, { quiet = false } = {}) {
    if (ask.key) {
      const picked = [structured].flat().map(String).sort(), right = picked.join() === [...ask.key.ids].sort().join();
      const answer = ask.key.ids.map(id => ask.input?.spec?.options?.find(o => o.id === id)?.text).filter(Boolean).join('; ');
      setPage(p => p?.ask?.id === ask.id ? { ...p, ask: { ...p.ask, answered: true, verdict: { right, answer } } } : p);
      said(text);
      tell(`[Answered on the board] ${text}`, structured, ask.graded, true);
      if (!quiet) context(`[Marked on the page from your key] "${ask.prompt.slice(0, 200)}": they answered ${text}, ${right ? 'right' : `wrong (the answer: ${answer})`}; your explain is shown under it. Don't repeat it; when they write next, go on from it.`);
      return;
    }
    answered(ask);
    said(text);
    tell(`[Answered on the board] ${text}`, structured, ask.graded, quiet);
  }
  // A selection, order or pairs on the page still to hand in, while its question is open.
  function openDraft() {
    const ask = now.current.page?.ask, kept = draft.current;
    return ask && !ask.answered && kept?.ask === ask.id && kept.structured ? kept : null;
  }
  return { show, showElement, quote, tell, answered, answerAsk, openDraft };
}
