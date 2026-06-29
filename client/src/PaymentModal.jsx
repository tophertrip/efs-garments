import { useState } from 'react';
import { api } from './api';
import { PAYMENT_METHODS, peso } from './constants';
import { Modal, Field, Input, Select, Button } from './components';

// Record a payment against a project. `project` should include id,
// job_order_number, and (optionally) balance to prefill the amount.
export default function PaymentModal({ project, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const suggested = project?.balance > 0 ? String(project.balance) : '';
  const [form, setForm] = useState({
    amount: suggested,
    method: 'cash',
    reference: '',
    paid_on: today,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setError('Enter a positive amount'); return; }
    setBusy(true);
    try {
      await api.post('/payments', { project_id: project.id, ...form, amount: amt });
      onSaved?.();
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Add Payment — ${project.job_order_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        {project.balance != null && (
          <div className="text-sm text-gray-600 bg-cloud rounded-lg px-3 py-2">
            Remaining balance: <span className="font-bold text-navy">{peso(project.balance)}</span>
          </div>
        )}
        <Field label="Amount (₱)" required>
          <Input type="number" min="0" step="0.01" autoFocus value={form.amount} onChange={(e) => set('amount', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Method" required>
            <Select value={form.method} onChange={(e) => set('method', e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Date" required>
            <Input type="date" value={form.paid_on} onChange={(e) => set('paid_on', e.target.value)} />
          </Field>
        </div>
        <Field label="Reference #">
          <Input value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="GCash ref, OR #, etc." />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gold" disabled={busy}>{busy ? 'Saving…' : 'Record Payment'}</Button>
        </div>
      </form>
    </Modal>
  );
}
