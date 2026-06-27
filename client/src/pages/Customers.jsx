import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtDate } from '../constants';
import { Card, Spinner, Button, Modal, Field, Input, Select, Empty, ConfirmDialog } from '../components';

const DEFAULT_SOURCES = ['facebook', 'instagram', 'referral'];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const sourceBadge = {
  facebook: 'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  referral: 'bg-green-100 text-green-700',
};
const badgeClass = (s) => sourceBadge[s] || 'bg-gray-100 text-gray-600';

function CustomerModal({ customer, sources, onClose, onSaved }) {
  const editing = Boolean(customer);
  const [form, setForm] = useState(() => ({
    company: customer?.company || '',
    name: customer?.name || '',
    contact: customer?.contact || '',
    messenger_name: customer?.messenger_name || '',
    source: customer?.source || 'facebook',
  }));
  const [creatingSource, setCreatingSource] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Make sure the current value is always selectable, plus all known sources.
  const sourceOptions = [...new Set([...(sources || DEFAULT_SOURCES), form.source].filter(Boolean))];

  function addSource() {
    const s = newSource.trim().toLowerCase();
    if (!s) return;
    setForm({ ...form, source: s });
    setCreatingSource(false);
    setNewSource('');
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setBusy(true);
    try {
      if (editing) await api.put(`/customers/${customer.id}`, form);
      else await api.post('/customers', form);
      onSaved(); onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Edit Customer' : 'New Customer'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Organization / business name" /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contact person" /></Field>
        <Field label="Contact number"><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
        <Field label="Messenger name"><Input value={form.messenger_name} onChange={(e) => setForm({ ...form, messenger_name: e.target.value })} /></Field>
        <Field label="Source">
          {!creatingSource ? (
            <div className="flex gap-2">
              <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {sourceOptions.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
              </Select>
              <Button type="button" variant="outline" onClick={() => setCreatingSource(true)} className="whitespace-nowrap">+ New</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input autoFocus placeholder="New source" value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSource(); } }} />
              <Button type="button" variant="gold" onClick={addSource} className="whitespace-nowrap">Add</Button>
              <Button type="button" variant="ghost" onClick={() => { setCreatingSource(false); setNewSource(''); }}>Cancel</Button>
            </div>
          )}
        </Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button variant="gold" disabled={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

export default function Customers() {
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [view, setView] = useState('card'); // 'card' | 'list'

  async function load() {
    setLoading(true);
    setCustomers(await api.get('/customers'));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.del(`/customers/${toDelete.id}`);
      setToDelete(null);
      load();
    } catch (e) { setDeleteError(e.message); } finally { setDeleting(false); }
  }

  const allSources = useMemo(
    () => [...new Set([...DEFAULT_SOURCES, ...customers.map((c) => c.source).filter(Boolean)])],
    [customers]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (sourceFilter && c.source !== sourceFilter) return false;
      if (!q) return true;
      return [c.company, c.name, c.contact, c.messenger_name].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [customers, search, sourceFilter]);

  function exportCsv() {
    const headers = ['Company', 'Contact Person', 'Contact', 'Messenger', 'Source', 'Projects', 'Since'];
    const rows = filtered.map((c) => [
      c.company || '', c.name, c.contact || '', c.messenger_name || '', c.source || '', c.project_count, c.created_at,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `efs-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Customers</h1>
          <p className="text-gray-500 text-sm">
            {filtered.length} of {customers.length} customer{customers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>⬇ Export CSV</Button>
          <Button variant="gold" onClick={() => setShow(true)}>+ New Customer</Button>
        </div>
      </div>

      {/* Controls: search, source filter, view toggle */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            className="flex-1 min-w-[180px]"
            placeholder="🔍 Search company, name, contact…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select className="max-w-[200px]" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">All sources</option>
            {allSources.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
          </Select>
          <div className="flex gap-1 bg-cloud rounded-lg p-1 ml-auto">
            {[['card', '▦ Cards'], ['list', '☰ List']].map(([k, lbl]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                  view === k ? 'bg-navy text-white' : 'text-gray-500 hover:text-navy'}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Card className="p-8"><Empty>No customers match your filters.</Empty></Card>
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  {c.company && <div className="font-bold text-navy truncate">🏢 {c.company}</div>}
                  <div className={c.company ? 'text-sm text-gray-700 truncate' : 'font-bold text-navy truncate'}>
                    {c.company ? `👤 ${c.name}` : c.name}
                  </div>
                  {c.messenger_name && <div className="text-xs text-gray-500">💬 {c.messenger_name}</div>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass(c.source)}`}>{cap(c.source)}</span>
              </div>
              <div className="mt-3 text-sm text-gray-600">{c.contact || 'No contact info'}</div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-semibold text-navy">{c.project_count} project{c.project_count !== 1 ? 's' : ''}</span>
                <span className="text-xs text-gray-400">since {fmtDate(c.created_at)}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end gap-4">
                <button onClick={() => setEditCustomer(c)} className="text-xs font-medium text-navy hover:underline">✏️ Edit</button>
                {isAdmin && (
                  <button onClick={() => { setDeleteError(''); setToDelete(c); }} className="text-xs font-medium text-red-600 hover:text-red-700">🗑 Delete</button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left">
                <tr>
                  {['Company', 'Contact Person', 'Contact #', 'Source', 'Projects', ''].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-cloud">
                    <td className="px-4 py-3 font-semibold text-navy">{c.company || <span className="text-gray-400 font-normal">—</span>}</td>
                    <td className="px-4 py-3">{c.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{c.contact || '—'}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass(c.source)}`}>{cap(c.source)}</span></td>
                    <td className="px-4 py-3">{c.project_count}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button onClick={() => setEditCustomer(c)} className="text-xs font-medium text-navy hover:underline">✏️ Edit</button>
                      {isAdmin && (
                        <button onClick={() => { setDeleteError(''); setToDelete(c); }} className="text-xs font-medium text-red-600 hover:text-red-700 ml-3">🗑 Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {show && <CustomerModal sources={allSources} onClose={() => setShow(false)} onSaved={load} />}
      {editCustomer && <CustomerModal customer={editCustomer} sources={allSources} onClose={() => setEditCustomer(null)} onSaved={load} />}
      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.company || toDelete.name}?`}
          message={`This permanently removes the customer record${toDelete.company ? ` (${toDelete.name})` : ''}. This cannot be undone.`}
          confirmLabel="Delete customer"
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
