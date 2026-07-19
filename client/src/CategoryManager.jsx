import { useEffect, useState } from 'react';
import { Modal, Button, Input } from './components';

// Reusable admin modal to manage a list of "category" options: add (optional),
// rename, delete. Callers pass adapters for each domain (projects, expenses,
// store products, customer sources). Items are { id, label, count? }.
export default function CategoryManager({ title, subtitle, load, onAdd, onRename, onDelete, onClose, onChanged }) {
  const [items, setItems] = useState(null);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() { try { setItems(await load()); } catch (e) { setError(e.message); } }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  async function doOp(fn) {
    setBusy(true); setError('');
    try { await fn(); await refresh(); onChanged?.(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const add = () => { const n = newName.trim(); if (!n) return; doOp(async () => { await onAdd(n); setNewName(''); }); };
  const saveEdit = (item) => { const n = editVal.trim(); if (!n || n === item.label) { setEditId(null); return; } doOp(async () => { await onRename(item, n); setEditId(null); }); };
  const remove = (item) => doOp(() => onDelete(item));

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        {onAdd && (
          <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" />
            <Button type="submit" variant="gold" disabled={busy || !newName.trim()}>Add</Button>
          </form>
        )}
        <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {items === null && <div className="text-center text-gray-400 py-6 text-sm">Loading…</div>}
          {items && items.length === 0 && <div className="text-center text-gray-400 py-6 text-sm">No categories yet.</div>}
          {items && items.map((it) => (
            <div key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {editId === it.id ? (
                <>
                  <Input className="!py-1" autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(it); } }} />
                  <button onClick={() => saveEdit(it)} disabled={busy} className="text-xs font-semibold text-emerald-600 shrink-0">Save</button>
                  <button onClick={() => setEditId(null)} className="text-xs text-gray-400 shrink-0">Cancel</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-navy font-medium truncate">{it.label}{it.count != null && <span className="text-gray-400 font-normal"> · {it.count}</span>}</span>
                  <button onClick={() => { setEditId(it.id); setEditVal(it.label); }} className="text-xs text-navy hover:underline shrink-0">✏️ Rename</button>
                  <button onClick={() => remove(it)} disabled={busy} className="text-xs text-red-600 hover:underline shrink-0">🗑 Delete</button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
}
