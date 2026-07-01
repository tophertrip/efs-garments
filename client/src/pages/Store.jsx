import { useEffect, useState } from 'react';
import { api } from '../api';
import { peso } from '../constants';
import { Card, Spinner, Button, Modal, Field, Input, Textarea, Select, ConfirmDialog } from '../components';

const UOMS = ['pcs', 'box', 'pack', 'dozen', 'set', 'pair', 'kg', 'g', 'liter', 'meter', 'yard', 'roll'];

function StatusBadge({ status }) {
  const active = status !== 'inactive';
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ---- Manage stores modal ---------------------------------------------------
function StoresModal({ stores, onChanged, onClose }) {
  const [draft, setDraft] = useState({ name: '', location: '', is_active: true });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!draft.name.trim()) { setError('Store name is required'); return; }
    setBusy(true); setError('');
    try { await api.post('/stores', draft); setDraft({ name: '', location: '', is_active: true }); await onChanged(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveEdit(id) {
    try { await api.put(`/stores/${id}`, editForm); setEditId(null); await onChanged(); }
    catch (e) { setError(e.message); }
  }
  async function toggleActive(s) {
    await api.put(`/stores/${s.id}`, { ...s, is_active: !s.is_active }); await onChanged();
  }
  async function remove(id) {
    await api.del(`/stores/${id}`); await onChanged();
  }

  return (
    <Modal title="Manage Stores" onClose={onClose}>
      <div className="space-y-4">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <form onSubmit={add} className="flex gap-2 items-end">
          <Field label="New store"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Store name" /></Field>
          <Field label="Location"><Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="e.g. Cebu" /></Field>
          <Button variant="gold" disabled={busy}>Add</Button>
        </form>
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {stores.length === 0 && <div className="text-center text-gray-400 py-6 text-sm">No stores yet — add one above.</div>}
          {stores.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {editId === s.id ? (
                <>
                  <Input className="!py-1" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  <Input className="!py-1" value={editForm.location || ''} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} placeholder="Location" />
                  <button onClick={() => saveEdit(s.id)} className="text-xs font-semibold text-emerald-600 shrink-0">Save</button>
                  <button onClick={() => setEditId(null)} className="text-xs text-gray-400 shrink-0">Cancel</button>
                </>
              ) : (
                <>
                  <span className="font-semibold text-navy">{s.name}</span>
                  <span className="text-gray-400">{s.location || ''}</span>
                  <button onClick={() => toggleActive(s)} className="ml-auto shrink-0"><StatusBadge status={s.is_active ? 'active' : 'inactive'} /></button>
                  <button onClick={() => { setEditId(s.id); setEditForm({ name: s.name, location: s.location, is_active: s.is_active }); }} className="text-xs text-navy hover:underline shrink-0">✏️</button>
                  <button onClick={() => remove(s.id)} className="text-xs text-red-600 hover:underline shrink-0">🗑</button>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400">Click the status badge to toggle Active / Inactive. Deleting a store also removes its prices.</p>
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
}

// ---- Add / edit product modal ----------------------------------------------
function ProductModal({ product, stores, onClose, onSaved }) {
  const editing = Boolean(product);
  const [form, setForm] = useState(() => ({
    sku: product?.sku || '',
    name: product?.name || '',
    category: product?.category || '',
    description: product?.description || '',
    uom: product?.uom || 'pcs',
    status: product?.status || 'active',
    prices: { ...(product?.prices || {}) },
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPrice = (sid, v) => setForm((f) => ({ ...f, prices: { ...f.prices, [sid]: v } }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Item name is required'); return; }
    setBusy(true);
    try {
      if (editing) await api.put(`/store/products/${product.id}`, form);
      else await api.post('/store/products', form);
      onSaved(); onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Edit Item' : 'New Item'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Item Code / SKU"><Input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="e.g. TS-001" /></Field>
          <Field label="Item Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Cotton Round-neck Tee" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Category"><Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. T-Shirts" /></Field>
          <Field label="Unit of Measure">
            <Select value={form.uom} onChange={(e) => set('uom', e.target.value)}>{UOMS.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional notes about the item" /></Field>
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">Price per store</div>
          {stores.length === 0 ? (
            <p className="text-sm text-gray-400">No stores yet — add a store to set prices.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {stores.map((s) => (
                <label key={s.id} className="block">
                  <span className="block text-xs text-gray-600 mb-0.5">{s.name}{!s.is_active && <span className="text-gray-400"> (inactive)</span>}</span>
                  <Input type="number" min="0" step="0.01" value={form.prices[s.id] ?? ''} onChange={(e) => setPrice(s.id, e.target.value)} placeholder="₱0.00" />
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button variant="gold" disabled={busy}>{busy ? 'Saving…' : 'Save item'}</Button></div>
      </form>
    </Modal>
  );
}

export default function Store() {
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [showStores, setShowStores] = useState(false);
  const [addProduct, setAddProduct] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [delProduct, setDelProduct] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  async function load() {
    const [p, s] = await Promise.all([api.get('/store/products'), api.get('/stores')]);
    setProducts(p); setStores(s);
  }
  async function loadAll() { setLoading(true); await load(); setLoading(false); }
  useEffect(() => { loadAll(); }, []);

  async function confirmDelete() {
    setDelBusy(true);
    try { await api.del(`/store/products/${delProduct.id}`); setDelProduct(null); await load(); }
    finally { setDelBusy(false); }
  }

  if (loading) return <Spinner />;

  const activeStores = stores.filter((s) => s.is_active);
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const shown = products.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (status && (p.status || 'active') !== status) return false;
    if (q) {
      const s = `${p.name} ${p.sku || ''} ${p.category || ''}`.toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Store</h1>
          <p className="text-gray-500 text-sm">Products & pricing across {stores.length} store{stores.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowStores(true)}>🏬 Manage Stores</Button>
          <Button variant="gold" onClick={() => setAddProduct(true)}>+ Add Item</Button>
        </div>
      </div>

      {/* Store chips */}
      {stores.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {stores.map((s) => (
            <span key={s.id} className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${s.is_active ? 'bg-white text-navy border-gray-300' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
              🏪 {s.name}{s.location ? ` · ${s.location}` : ''}{!s.is_active && ' (inactive)'}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="p-4 mb-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Search</span><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, SKU, category…" /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Category</span>
            <Select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Status</span>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select></label>
        </div>
      </Card>

      {/* Products table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">SKU</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Item</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Category</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">UOM</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Status</th>
                {activeStores.map((s) => <th key={s.id} className="px-4 py-3 font-semibold whitespace-nowrap text-right">{s.name}</th>)}
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.length === 0 && <tr><td colSpan={6 + activeStores.length} className="text-center text-gray-400 py-10">No items{products.length ? ' match your filters' : ' yet'}.</td></tr>}
              {shown.map((p) => (
                <tr key={p.id} className="hover:bg-cloud">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{p.sku || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-navy">{p.name}{p.description && <div className="text-xs font-normal text-gray-400 max-w-[240px] truncate" title={p.description}>{p.description}</div>}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.category || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.uom}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  {activeStores.map((s) => (
                    <td key={s.id} className="px-4 py-3 text-right whitespace-nowrap">{p.prices[s.id] != null ? <span className="font-semibold text-navy">{peso(p.prices[s.id])}</span> : <span className="text-gray-300">—</span>}</td>
                  ))}
                  <td className="px-2 py-3 whitespace-nowrap text-right">
                    <button onClick={() => setEditProduct(p)} className="text-xs text-navy hover:underline">✏️</button>
                    <button onClick={() => setDelProduct(p)} className="text-xs text-red-600 hover:underline ml-2">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showStores && <StoresModal stores={stores} onChanged={load} onClose={() => setShowStores(false)} />}
      {addProduct && <ProductModal stores={stores} onClose={() => setAddProduct(false)} onSaved={load} />}
      {editProduct && <ProductModal product={editProduct} stores={stores} onClose={() => setEditProduct(null)} onSaved={load} />}
      {delProduct && (
        <ConfirmDialog title={`Delete ${delProduct.name}?`} message="This removes the item and its store prices. This cannot be undone."
          confirmLabel="Delete item" busy={delBusy} onConfirm={confirmDelete} onClose={() => setDelProduct(null)} />
      )}
    </div>
  );
}
