import { useEffect, useState } from 'react';
import { api } from './api';
import { peso } from './constants';
import { useCategories } from './categories';
import { Modal, Field, Input, Textarea, Select, Button } from './components';

// Modal form to create OR edit a project (with inline customer + category creation).
// Pass `project` to edit an existing job order; omit it to create a new one.
export default function ProjectForm({ onClose, onSaved, project }) {
  const editing = Boolean(project);
  const { categories, addCategory } = useCategories();
  const [customers, setCustomers] = useState([]);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ company: '', name: '', contact: '', messenger_name: '', source: 'facebook' });
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState(() => (project ? {
    customer_id: String(project.customer_id || ''),
    category: project.category || 'sportswear',
    description: project.description || '',
    quantity: project.quantity ?? '',
    unit_price: project.unit_price ?? '',
    target_date: project.target_date || '',
    priority: project.priority || 'normal',
    design_notes: project.design_notes || '',
    remarks: project.remarks || '',
    design_file_url: project.design_file_url || '',
  } : {
    customer_id: '',
    category: 'sportswear',
    description: '',
    quantity: '',
    unit_price: '',
    target_date: '',
    priority: 'normal',
    design_notes: '',
    remarks: '',
    design_file_url: '',
  }));

  useEffect(() => { api.get('/customers').then(setCustomers).catch(() => {}); }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const total = (Number(form.unit_price) || 0) * (Number(form.quantity) || 0);

  async function addCustomer() {
    if (!newCustomer.name.trim()) { setError('Customer name is required'); return; }
    setBusy(true);
    try {
      const c = await api.post('/customers', newCustomer);
      setCustomers((list) => [...list, c]);
      set('customer_id', String(c.id));
      setCreatingCustomer(false);
      setNewCustomer({ company: '', name: '', contact: '', messenger_name: '', source: 'facebook' });
      setError('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveCategory() {
    const name = newCategory.trim();
    if (!name) { setError('Category name is required'); return; }
    setBusy(true);
    try {
      const c = await addCategory(name);
      set('category', c.key);
      setCreatingCategory(false);
      setNewCategory('');
      setError('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.customer_id) { setError('Please choose a customer'); return; }
    if (!form.quantity || !form.target_date) { setError('Quantity and target date are required'); return; }
    setBusy(true);
    setError('');
    const payload = {
      ...form,
      customer_id: Number(form.customer_id),
      quantity: Number(form.quantity),
      unit_price: form.unit_price === '' ? null : Number(form.unit_price),
    };
    try {
      const saved = editing
        ? await api.put(`/projects/${project.id}`, payload)
        : await api.post('/projects', payload);
      onSaved?.(saved);
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? `Edit ${project.job_order_number}` : 'New Project / Job Order'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

        {/* Customer */}
        <Field label="Customer" required>
          {!creatingCustomer ? (
            <div className="flex gap-2">
              <Select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)}>
                <option value="">— Select customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Button type="button" variant="outline" onClick={() => setCreatingCustomer(true)} className="whitespace-nowrap">+ New</Button>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-cloud">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Company" value={newCustomer.company} onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })} />
                <Input placeholder="Contact person *" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
                <Input placeholder="Contact number" value={newCustomer.contact} onChange={(e) => setNewCustomer({ ...newCustomer, contact: e.target.value })} />
                <Input placeholder="Messenger name" value={newCustomer.messenger_name} onChange={(e) => setNewCustomer({ ...newCustomer, messenger_name: e.target.value })} />
                <Select value={newCustomer.source} onChange={(e) => setNewCustomer({ ...newCustomer, source: e.target.value })}>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="referral">Referral</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="gold" onClick={addCustomer} disabled={busy}>Save customer</Button>
                <Button type="button" variant="ghost" onClick={() => setCreatingCustomer(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Category" required>
            {!creatingCategory ? (
              <div className="flex gap-2">
                <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </Select>
                <Button type="button" variant="outline" onClick={() => setCreatingCategory(true)} className="whitespace-nowrap">+ New</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="New category name"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveCategory(); } }}
                />
                <Button type="button" variant="gold" onClick={saveCategory} disabled={busy} className="whitespace-nowrap">Add</Button>
                <Button type="button" variant="ghost" onClick={() => { setCreatingCategory(false); setNewCategory(''); }}>Cancel</Button>
              </div>
            )}
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="low">Low</option>
            </Select>
          </Field>
        </div>

        <Field label="Description / Item details">
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Sublimated basketball jersey set" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Quantity" required>
            <Input type="number" min="1" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </Field>
          <Field label="Unit Price (₱)">
            <Input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => set('unit_price', e.target.value)} />
          </Field>
          <Field label="Total">
            <div className="px-3 py-2 rounded-lg bg-cloud border border-gray-200 text-sm font-bold text-navy">{peso(total)}</div>
          </Field>
        </div>

        <Field label="Target Date" required>
          <Input type="date" value={form.target_date} onChange={(e) => set('target_date', e.target.value)} />
        </Field>

        <Field label="Design Notes">
          <Textarea rows={3} value={form.design_notes} onChange={(e) => set('design_notes', e.target.value)} placeholder="Colors, sizes, placement of logos…" />
        </Field>

        <Field label="Remarks">
          <Textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Internal notes, special instructions, payment terms…" />
        </Field>

        <Field label="Design File Link (Google Drive / Canva)">
          <Input type="url" value={form.design_file_url} onChange={(e) => set('design_file_url', e.target.value)} placeholder="https://…" />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gold" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save Changes' : 'Create Job Order'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
