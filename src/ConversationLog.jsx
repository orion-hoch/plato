import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import BoardRichText from './BoardRichText.jsx';
import { codeify, untag } from './conversation-log.mjs';

// What Plato said (the user's decision, 8 Oct): each of his lines appears only once he has finished saying it, so it is
// never a caption running beside his explanation. A minimal panel, newest last: under the sphere at rest, beside the page
// on a wide screen, under the page's frame on a narrow one. It scrolls back through the whole session (held at the
// newest unless the learner scrolled up), closes, and opens again from a quiet round button. The student's own words are
// not shown, only the line they are typing while they type it, with any problem Plato cannot say himself just above it.
// A screen reader hears each finished line once.
// Ways in for a first session (17 Oct: a new course opened on an empty screen with a prelim five days off). Pressed, one is
// their line; nothing is said until they press or type.
const STARTERS = ['What is on my exam, and where should I start?', 'Teach me the first topic from scratch', 'Give me an exam-style problem to try'];

export default function ConversationLog({ entries, chat = false, typed = '', caret = null, typing = false, unit = '', error = '', quiet = false, open = true, onOpen, onClose, onTap }) {
  if (chat) return <ChatLog entries={entries} typed={typed} caret={caret} typing={typing} unit={unit} error={error} onTap={onTap}/>;
  const replies = entries.filter(entry => entry.who === 'plato' && entry.final && entry.text?.trim());
  const list = useRef(null), pinned = useRef(true);
  useLayoutEffect(() => { const el = list.current; if (el && pinned.current) el.scrollTop = el.scrollHeight; }, [replies.length, replies.at(-1)?.text, open]);
  return <div className="conversation">
    {open && replies.length > 0 && <section className={`conversation-log plato${quiet ? ' is-quiet' : ''}`} aria-label="What Plato said">
      <button type="button" className="close log-close" onClick={onClose} aria-label="Close what Plato said">×</button>
      <div ref={list} className="log-replies" role="log" aria-relevant="additions" tabIndex={0} onClick={onTap}
        onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
        {replies.map((reply, i) => {
          const cls = i < replies.length - 1 ? 'log-earlier' : 'log-latest', text = codeify(untag(reply.text));
          // A written reply (a text chat) with paragraphs or a list: as markdown blocks; a spoken line: inline.
          return /\n/.test(text) ? <div key={reply.id} className={`${cls} log-blocks`}><BoardRichText text={text}/></div>
            : <p key={reply.id} className={cls}><BoardRichText text={text} inline/></p>;
        })}
      </div>
    </section>}
    {!open && replies.length > 0 && <button type="button" className="round log-open" onClick={onOpen} aria-label="Show what Plato said">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 7h14M5 12h14M5 17h9"/></svg>
    </button>}
    <div className="conversation-log mine" onClick={onTap}>
      {error && <p key={error} className="log-error" role="alert">{error}</p>}
      {(typed || typing) && <p className="log-typing" aria-hidden="true">{typedLine(typed, caret)}{unit && <span className="log-unit">{unit}</span>}</p>}
    </div>
  </div>;
}

// The line being typed with the cursor where the typer's is (a selection highlighted), not always at the end.
function typedLine(typed, caret) {
  const end = typed.length, [a, b] = (caret || [end, end]).map(x => Math.max(0, Math.min(end, Number.isFinite(x) ? x : end)));
  return a === b
    ? <>{typed.slice(0, a)}<span className="caret"/>{typed.slice(a)}</>
    : <>{typed.slice(0, a)}<mark className="log-selected">{typed.slice(a, b)}</mark>{typed.slice(b)}</>;
}

// A text chat (no voice): both sides in order, nothing fading, held at the newest; Plato's thinking note in a box that says
// how long he has been at it, and a line for each thing he did (looked something up, put a slide up). 13 Oct, the user:
// "a thinking symbol… have what the tutor is thinking on screen".
function ChatLog({ entries, typed, caret, typing, unit, error, onTap }) {
  const items = entries.filter(e => e.who === 'activity' || ((e.who === 'plato' || e.who === 'me') && e.text?.trim()));
  const list = useRef(null), pinned = useRef(true), [, tick] = useState(0), live = items.some(e => e.live);
  useEffect(() => { if (!live) return undefined; const t = setInterval(() => tick(n => n + 1), 500); return () => clearInterval(t); }, [live]);
  useLayoutEffect(() => { const el = list.current; if (el && pinned.current) el.scrollTop = el.scrollHeight; }, [items.length, items.at(-1)?.text, live]);
  return <div className="conversation is-chat">
    <section className="conversation-log plato chat" aria-label="Your conversation with Plato">
      <div ref={list} className="log-replies" role="log" aria-relevant="additions" tabIndex={0} onClick={onTap}
        onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32; }}>
        {items.length === 0 && <div className="chat-empty"><p>Type anything to start, or pick one:</p>
          {STARTERS.map(s => <button key={s} type="button" className="chat-starter" onClick={e => { e.stopPropagation(); dispatchEvent(new CustomEvent('plato:say', { detail: { text: s } })); }}>{s}</button>)}</div>}
        {items.map(e => e.who === 'me' ? <div key={e.id} className="chat-me"><BoardRichText text={untag(e.text)} inline/></div>
          : e.who === 'plato' ? <div key={e.id} className="chat-plato"><BoardRichText text={codeify(untag(e.text))}/></div>
          : e.kind === 'offer' ? <div key={e.id} className="chat-offer"><button type="button" className={`face-${e.face}`} disabled={e.taken}
              onClick={() => dispatchEvent(new CustomEvent('plato:offer-take', { detail: { face: e.face } }))}>{e.text}</button></div>
          : e.kind === 'face' ? <div key={e.id} className={`chat-face face-${e.face}`} role="separator"><span>{e.text}</span></div>
          : e.kind === 'tool' ? <div key={e.id} className="chat-tool">↳ <BoardRichText text={e.text} inline/></div>
          : e.kind === 'mic' ? <div key={e.id} className={`chat-think chat-mic${e.live ? ' is-live' : ''}`}>
              <div className="chat-think-head">{e.live ? <>{e.text === 'Listening' ? <span className="chat-rec" aria-hidden="true"/> : <span className="chat-spinner" aria-hidden="true"/>}{e.text}… {Math.round((Date.now() - e.at) / 1000)}s{e.text === 'Listening' && <span className="chat-hint"> (tap the mic or press Space to send)</span>}</> : e.text}</div>
            </div>
          : <div key={e.id} className={`chat-think${e.live ? ' is-live' : ''}`}>
              <div className="chat-think-head">{e.live ? <><span className="chat-spinner" aria-hidden="true"/>Thinking… {Math.round((Date.now() - e.at) / 1000)}s</> : `Thought for ${e.took ?? 1}s`}</div>
              {e.text.trim() && <div className="chat-think-text">{e.text.trim()}</div>}
            </div>)}
      </div>
    </section>
    <div className="conversation-log mine" onClick={onTap}>
      {error && <p key={error} className="log-error" role="alert">{error}</p>}
      {(typed || typing) && <p className="log-typing" aria-hidden="true">{typedLine(typed, caret)}{unit && <span className="log-unit">{unit}</span>}</p>}
    </div>
  </div>;
}
