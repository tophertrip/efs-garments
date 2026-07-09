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

  const [form, setForm] = useState(() => ({
    project_name: project?.project_name || '',
    customer_id: String(project?.customer_id || ''),
    category: project?.category || 'sportswear',
    target_date: project?.target_date || '',
    priority: project?.priority || 'normal',
    design_notes: project?.design_notes || '',
    remarks: project?.remarks || '',
    design_file_url: project?.design_file_url || '',
  }));
  const [items, setItems] = useState(() => {
    if (project?.items?.length) return project.items.map((it) => ({ description: it.description || '', quantity: it.quantity ?? '', unit_price: it.unit_price ?? '' }));
    if (project) return [{ description: project.description || '', quantity: project.quantity ?? '', unit_price: project.unit_price ?? '' }];
    return [{ description: '', quantity: '', unit_price: '' }];
  });

  useEffect(() => { api.get('/customers').then(setCustomers).catch(() => {}); }, []);
  // When editing, load the full project so all product line items are present.
  useEffect(() => {
    if (!project?.id) return;
    api.get(`/projects/${project.id}`).then((full) => {
      if (full.items?.length) setItems(full.items.map((it) => ({ description: it.description || '', quantity: it.quantity ?? '', unit_price: it.unit_price ?? '' })));
    }).catch(() => {});
  }, [project?.id]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  const setItem = (i, k, v) => setItems((its) => its.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const addItem = () => setItems((its) => [...its, { description: '', quantity: '', unit_price: '' }]);
  const removeItem = (i) => setItems((its) => (its.length > 1 ? its.filter((_, j) => j !== i) : its));
  const grandTotal = items.reduce((a, it) => a + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);

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
    // Every field must be answered.
    const required = [
      ['customer_id', 'Customer'],
      ['project_name', 'Project Name'],
      ['category', 'Category'],
      ['target_date', 'Target Date'],
      ['design_notes', 'Project Details (Sizes / Design Notes)'],
      ['remarks', 'Remarks'],
      ['design_file_url', 'Design File Link'],
    ];
    for (const [key, label] of required) {
      if (String(form[key] ?? '').trim() === '') { setError(`${label} is required`); return; }
    }
    const validItems = items.filter((it) => String(it.description).trim() && Number(it.quantity) > 0 && it.unit_price !== '' && Number(it.unit_price) >= 0);
    if (!validItems.length) { setError('Add at least one product with a description, quantity and unit price'); return; }
    setBusy(true);
    setError('');
    const payload = {
      ...form,
      customer_id: Number(form.customer_id),
      items: validItems.map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity), unit_price: Number(it.unit_price) })),
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
                {customers.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
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

        <Field label="Project Name" required>
          <Input value={form.project_name} onChange={(e) => set('project_name', e.target.value)} placeholder="e.g. 2026 Team Jerseys — Cebu Sports" />
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

        {/* Products — one job order can hold several products (variety) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">Products <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">— add variety / multiple items</span></span>
            <Button type="button" variant="outline" onClick={addItem} className="!py-1 !px-2 text-xs">+ Add product</Button>
          </div>
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_80px_110px_100px_24px] gap-2 text-[11px] text-gray-400 px-0.5">
              <span>Product / item details</span><span>Qty</span><span>Unit Price</span><span className="text-right">Line total</span><span />
            </div>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_110px_100px_24px] gap-2 items-center">
                <Input value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="e.g. Sublimated jersey set" />
                <Input type="number" min="1" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} placeholder="Qty" />
                <Input type="number" min="0" step="0.01" value={it.unit_price} onChange={(e) => setItem(i, 'unit_price', e.target.value)} placeholder="₱0.00" />
                <div className="text-right text-sm font-semibold text-navy px-1 truncate">{peso((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</div>
                <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1} className="text-red-500 hover:text-red-600 disabled:opacity-30 text-sm">✕</button>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-2 text-sm items-baseline gap-3">
            <span className="text-gray-500">Grand total</span><span className="font-extrabold text-navy text-base">{peso(grandTotal)}</span>
          </div>
        </div>

        <Field label="Target Date" required>
          <Input type="date" value={form.target_date} onChange={(e) => set('target_date', e.target.value)} />
        </Field>

        <Field label="Project Details (Sizes / Design Notes)" required>
          <Textarea rows={3} value={form.design_notes} onChange={(e) => set('design_notes', e.target.value)} placeholder="Sizes & breakdown, colors, placement of logos…" />
        </Field>

        <Field label="Remarks" required>
          <Textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Internal notes, special instructions, payment terms…" />
        </Field>

        <Field label="Design File Link (Google Drive / Canva)" required>
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
