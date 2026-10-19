// Voice settings (19 Oct, the user: "instead of making the user having to input their own api keys through editing an env file
// think of a savier way to store and have the user paste the api key"): the student pastes their ElevenLabs API key here; the server checks
// it with ElevenLabs and keeps it in the macOS Keychain (server/secrets.mjs). The page never gets it back, only its last four.
import React, { useEffect, useState } from 'react';
import { authHeader } from './backend-client.js';

const call = async (method, body) => {
  const r = await fetch('/settings/voice', { method, headers: { 'Content-Type': 'application/json', ...await authHeader() }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || 'Something went wrong.');
  return out;
};

export default function VoiceKey({ open, onClose, onChange }) {
  const [state, setState] = useState(null), [key, setKey] = useState(''), [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  useEffect(() => { if (open) { setKey(''); setProblem(''); call('GET').then(setState, e => setProblem(e.message)); } }, [open]);
  useEffect(() => { if (!open) return undefined; const esc = e => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc); }, [open]);
  if (!open) return null;
  async function save(e) {
    e.preventDefault();
    setBusy(true); setProblem('');
    try { const r = await call('POST', { key }); setState(r); setKey(''); onChange(true); } catch (error) { setProblem(error.message); } finally { setBusy(false); }
  }
  async function forget() {
    setBusy(true); setProblem('');
    try { const r = await call('DELETE'); setState({ set: r.set, hint: '', where: state?.where }); onChange(r.set); } catch (error) { setProblem(error.message); } finally { setBusy(false); }
  }
  return <div className="voice-key-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form className="voice-key" role="dialog" aria-modal="true" aria-labelledby="voice-key-title" onSubmit={save}>
      <h2 id="voice-key-title">Voice</h2>
      <p>Plato can read his replies aloud and hear what you say, through ElevenLabs on your own account. Paste an API key from <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">elevenlabs.io, API keys</a>.</p>
      {state?.set && <p className="voice-key-now">Using the key ending <b>{state.hint.replace('…', '')}</b>, kept in {state.where}.</p>}
      <label className="voice-key-field">{state?.set ? 'Replace it' : 'ElevenLabs API key'}
        <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder="sk_…" autoFocus/></label>
      <p className="voice-key-safe">It’s checked with ElevenLabs, then kept in {state?.where || 'your system’s keychain'}: never in a file in Plato’s folder, and never shown again.</p>
      {problem && <p className="voice-key-problem" role="alert">{problem}</p>}
      <div className="voice-key-actions">
        {state?.set && state.where !== '.env' && <button type="button" className="voice-key-forget" onClick={forget} disabled={busy}>Remove key</button>}
        <button type="button" onClick={onClose}>Close</button>
        <button type="submit" className="voice-key-save" disabled={busy || !key.trim()}>{busy ? 'Checking…' : 'Save'}</button>
      </div>
    </form>
  </div>;
}
