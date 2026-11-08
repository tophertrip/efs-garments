import { useState } from 'react';
import { api } from './api';
import { PAYMENT_METHODS, peso } from './constants';
import { Modal, Field, Input, Select, Button } from './components';

// The payment file link must point to Google Drive (drive.google.com / docs.google.com).
function isGoogleDriveLink(url) {
  try {
    const h = new URL(url.trim()).hostname.toLowerCase();
    return h === 'drive.google.com' || h === 'docs.google.com';
  } catch {
    return false;
  }
}

// Record OR edit a payment against a project. `project` should include id,
// job_order_number, and (optionally) balance to prefill the amount. Pass
// `payment` to edit an existing payment instead of creating a new one.
export default function PaymentModal({ project, payment, onClose, onSaved }) {
  const editing = Boolean(payment);
  const today = new Date().toISOString().slice(0, 10);
  const suggested = project?.balance > 0 ? String(project.balance) : '';
  const [form, setForm] = useState({
    amount: editing ? String(payment.amount ?? '') : suggested,
    method: payment?.method || 'cash',
    reference: payment?.reference || '',
    file_url: payment?.file_url || '',
    paid_on: payment?.paid_on || today,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const linkInvalid = form.file_url.trim() !== '' && !isGoogleDriveLink(form.file_url);

  async function submit(e) {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { setError('Enter a positive amount'); return; }
    if (linkInvalid) { setError('The payment file link must be a Google Drive link (drive.google.com or docs.google.com).'); return; }
    setBusy(true);
    try {
      if (editing) await api.put(`/payments/${payment.id}`, { ...form, amount: amt });
      else await api.post('/payments', { project_id: project.id, ...form, amount: amt });
      onSaved?.();
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={`${editing ? 'Edit' : 'Add'} Payment — ${project.job_order_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        {!editing && project.balance != null && (
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
        <Field label="Payment file link — Google Drive only (optional)">
          <Input
            type="url"
            value={form.file_url}
            onChange={(e) => set('file_url', e.target.value)}
            placeholder="https://drive.google.com/… (receipt / proof of payment)"
            className={linkInvalid ? 'border-red-400 focus:ring-red-300' : ''}
          />
          {linkInvalid
            ? <p className="text-xs text-red-600 mt-1">Please paste a Google Drive link (drive.google.com or docs.google.com).</p>
            : <p className="text-xs text-gray-400 mt-1">Paste a Google Drive share link to the receipt / proof of payment.</p>}
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gold" disabled={busy || linkInvalid}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Record Payment'}</Button>
        </div>
      </form>
    </Modal>
  );
}
