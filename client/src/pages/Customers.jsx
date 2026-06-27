import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtDate } from '../constants';
import { Card, Spinner, Button, Modal, Field, Input, Select, Empty, ConfirmDialog } from '../components';

function AddCustomerModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ company: '', name: '', contact: '', messenger_name: '', source: 'facebook' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setBusy(true);
    try { await api.post('/customers', form); onSaved(); onClose(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="New Customer" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Organization / business name" /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contact person" /></Field>
        <Field label="Contact number"><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
        <Field label="Messenger name"><Input value={form.messenger_name} onChange={(e) => setForm({ ...form, messenger_name: e.target.value })} /></Field>
        <Field label="Source">
          <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="referral">Referral</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={onClose}>Cancel</Button><Button variant="gold" disabled={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

const sourceBadge = {
  facebook: 'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  referral: 'bg-green-100 text-green-700',
};

export default function Customers() {
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
    } catch (e) {
      setDeleteError(e.message);
    } finally { setDeleting(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Customers</h1>
          <p className="text-gray-500 text-sm">{customers.length} customer{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="gold" onClick={() => setShow(true)}>+ New Customer</Button>
      </div>

      {loading ? <Spinner /> : customers.length === 0 ? (
        <Card className="p-8"><Empty>No customers yet.</Empty></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  {c.company && <div className="font-bold text-navy truncate">🏢 {c.company}</div>}
                  <div className={c.company ? 'text-sm text-gray-700 truncate' : 'font-bold text-navy truncate'}>
                    {c.company ? `👤 ${c.name}` : c.name}
                  </div>
                  {c.messenger_name && <div className="text-xs text-gray-500">💬 {c.messenger_name}</div>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceBadge[c.source] || 'bg-gray-100 text-gray-600'}`}>{c.source}</span>
              </div>
              <div className="mt-3 text-sm text-gray-600">{c.contact || 'No contact info'}</div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-semibold text-navy">{c.project_count} project{c.project_count !== 1 ? 's' : ''}</span>
                <span className="text-xs text-gray-400">since {fmtDate(c.created_at)}</span>
              </div>
              {isAdmin && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={() => { setDeleteError(''); setToDelete(c); }}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    🗑 Delete
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {show && <AddCustomerModal onClose={() => setShow(false)} onSaved={load} />}
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
