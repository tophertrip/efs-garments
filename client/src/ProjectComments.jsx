import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { fmtDateTime, ROLE_LABELS } from './constants';
import { Card, Button } from './components';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const initials = (name) => (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// Render a comment body, highlighting @mentions of the given user names.
function Body({ body, names }) {
  if (!names || !names.length) return <span className="whitespace-pre-wrap break-words">{body}</span>;
  const tokens = names.map((n) => '@' + n).sort((a, b) => b.length - a.length);
  const re = new RegExp('(' + tokens.map(escapeRe).join('|') + ')', 'g');
  const set = new Set(tokens);
  return (
    <span className="whitespace-pre-wrap break-words">
      {body.split(re).map((p, i) => (set.has(p)
        ? <span key={i} className="text-navy font-semibold bg-gold/25 rounded px-1">{p}</span>
        : <span key={i}>{p}</span>))}
    </span>
  );
}

// Facebook-style updates feed for a project: post comments and @tag other users.
export default function ProjectComments({ projectId, users = [], currentUser, isAdmin }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(null); // { at, query } while typing an @mention
  const taRef = useRef(null);

  async function load() { setComments(await api.get(`/projects/${projectId}/comments`).catch(() => [])); }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const userById = Object.fromEntries(users.map((u) => [u.id, u]));

  function onType(e) {
    const v = e.target.value; setText(v); setError('');
    const caret = e.target.selectionStart;
    const at = v.slice(0, caret).lastIndexOf('@');
    if (at >= 0) {
      const token = v.slice(at + 1, caret);
      if (!token.includes('\n') && token.length <= 30) { setMenu({ at, query: token.toLowerCase() }); return; }
    }
    setMenu(null);
  }
  function pickUser(u) {
    const caret = taRef.current?.selectionStart ?? text.length;
    const at = menu.at;
    const next = text.slice(0, at) + '@' + u.name + ' ' + text.slice(caret);
    setText(next); setMenu(null);
    setTimeout(() => { const pos = at + u.name.length + 2; taRef.current?.focus(); taRef.current?.setSelectionRange(pos, pos); }, 0);
  }
  const menuUsers = menu ? users.filter((u) => u.id !== currentUser?.id && u.name.toLowerCase().includes(menu.query)).slice(0, 6) : [];
  const mentionsFromText = (t) => users.filter((u) => t.includes('@' + u.name)).map((u) => u.id);

  async function submit(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true); setError('');
    try {
      await api.post(`/projects/${projectId}/comments`, { body, mentions: mentionsFromText(text) });
      setText(''); await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove(cid) { await api.del(`/comments/${cid}`); load(); }

  return (
    <Card className="p-5 mt-6">
      <h2 className="font-bold text-navy mb-3">💬 Updates &amp; Comments <span className="text-xs font-normal text-gray-400">({comments.length})</span></h2>

      <form onSubmit={submit} className="mb-4 print:hidden">
        <div className="relative">
          <textarea
            ref={taRef} rows={2} value={text} onChange={onType}
            placeholder="Write an update…  type @ to tag someone"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/60"
          />
          {menuUsers.length > 0 && (
            <div className="absolute z-20 left-2 right-2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {menuUsers.map((u) => (
                <button type="button" key={u.id} onMouseDown={(ev) => { ev.preventDefault(); pickUser(u); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-cloud flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-navy text-white text-[10px] flex items-center justify-center font-bold shrink-0">{initials(u.name)}</span>
                  <span className="font-medium text-navy">{u.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{ROLE_LABELS[u.role] || u.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-gray-400">Tip: type <b>@</b> then a name to tag & notify them.</span>
          <Button type="submit" variant="gold" disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Post update'}</Button>
        </div>
      </form>

      {comments.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No updates yet — post the first one.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const names = (c.mentions || []).map((mid) => userById[mid]?.name).filter(Boolean);
            const canDelete = isAdmin || c.user_id === currentUser?.id;
            return (
              <li key={c.id} className="flex gap-3">
                <span className="h-8 w-8 shrink-0 rounded-full bg-navy text-white text-xs flex items-center justify-center font-bold">{initials(c.user_name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="bg-cloud rounded-2xl px-3 py-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-navy text-sm">{c.user_name || 'Unknown'}</span>
                      <span className="text-[11px] text-gray-400">{ROLE_LABELS[c.user_role] || c.user_role}</span>
                    </div>
                    <div className="text-sm text-gray-700"><Body body={c.body} names={names} /></div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 ml-1 text-[11px] text-gray-400 flex-wrap">
                    <span>{fmtDateTime(c.created_at)}</span>
                    {names.length > 0 && <span>🔔 tagged {names.join(', ')}</span>}
                    {canDelete && <button onClick={() => remove(c.id)} className="text-red-500 hover:underline print:hidden">Delete</button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
