import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { peso, fmtDateTime, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '../constants';
import { useAuth } from '../auth';
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

// ===========================================================================
// POS — checkout
// ===========================================================================
function POS({ stores, products, onSold }) {
  const activeStores = stores.filter((s) => s.is_active);
  const [storeId, setStoreId] = useState(activeStores[0]?.id ? String(activeStores[0].id) : '');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // { product_id, name, sku, unit_price, qty, discount }
  const [customer, setCustomer] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  // Changing store resets the cart (prices differ per store).
  function pickStore(v) { setStoreId(v); setCart([]); setDone(''); }

  const sellable = useMemo(() => products.filter((p) => (p.status || 'active') !== 'inactive'), [products]);
  const shown = sellable.filter((p) => {
    if (!search) return true;
    return `${p.name} ${p.sku || ''} ${p.category || ''}`.toLowerCase().includes(search.toLowerCase());
  });

  function priceFor(p) { return p.prices?.[storeId]; }

  function addToCart(p) {
    const price = priceFor(p);
    if (price == null) return;
    setDone('');
    setCart((c) => {
      const i = c.findIndex((l) => l.product_id === p.id);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      return [...c, { product_id: p.id, name: p.name, sku: p.sku, unit_price: price, qty: 1, discount: 0 }];
    });
  }
  function updateLine(idx, k, v) {
    setCart((c) => c.map((l, i) => (i === idx ? { ...l, [k]: v } : l)));
  }
  function removeLine(idx) { setCart((c) => c.filter((_, i) => i !== idx)); }

  const subtotal = cart.reduce((a, l) => a + l.qty * l.unit_price, 0);
  const discTotal = cart.reduce((a, l) => a + (Number(l.discount) || 0), 0);
  const total = Math.max(0, subtotal - discTotal);

  async function checkout() {
    if (!storeId) { setError('Select a store first'); return; }
    if (!cart.length) { setError('Add at least one product'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/store/sales', {
        store_id: Number(storeId), customer_name: customer || null, payment_method: method,
        items: cart.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), unit_price: l.unit_price, discount: Number(l.discount) || 0 })),
      });
      setCart([]); setCustomer('');
      setDone(`Sale #${res.id} completed — ${peso(res.total)}. It's now in the sales report.`);
      onSold?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (activeStores.length === 0) {
    return <Card className="p-8 text-center text-gray-500">No active stores yet. Add one in the <b>Products</b> tab → Manage Stores.</Card>;
  }

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      {/* Product picker */}
      <div className="lg:col-span-3 space-y-3">
        <div className="flex gap-2 flex-wrap items-end">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Store</span>
            <Select value={storeId} onChange={(e) => pickStore(e.target.value)}>
              {activeStores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.location ? ` · ${s.location}` : ''}</option>)}
            </Select>
          </label>
          <label className="block flex-1 min-w-[180px]">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Search products</span>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, SKU, category…" />
          </label>
        </div>
        <Card className="overflow-hidden">
          <div className="max-h-[460px] overflow-y-auto divide-y divide-gray-100">
            {shown.length === 0 && <div className="text-center text-gray-400 py-10 text-sm">No products found.</div>}
            {shown.map((p) => {
              const price = priceFor(p);
              const noPrice = price == null;
              return (
                <button key={p.id} onClick={() => addToCart(p)} disabled={noPrice}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left ${noPrice ? 'opacity-50 cursor-not-allowed' : 'hover:bg-cloud'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-navy truncate">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.sku || '—'}{p.category ? ` · ${p.category}` : ''} · {p.uom}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {noPrice ? <span className="text-xs text-gray-400">no price</span> : <span className="font-bold text-navy">{peso(price)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Cart */}
      <div className="lg:col-span-2">
        <Card className="p-4 sticky top-4">
          <h2 className="font-bold text-navy mb-3">🧾 Current Sale</h2>
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-2">{error}</div>}
          {done && <div className="bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2 mb-2">{done}</div>}
          {cart.length === 0 ? (
            <p className="text-gray-400 text-sm py-6 text-center">Tap products to add them here.</p>
          ) : (
            <div className="space-y-2 mb-3 max-h-[300px] overflow-y-auto">
              {cart.map((l, i) => (
                <div key={l.product_id} className="border border-gray-100 rounded-lg p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-navy text-sm truncate">{l.name}</span>
                    <button onClick={() => removeLine(i)} className="text-xs text-red-500 shrink-0">✕</button>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <span className="text-gray-500">{peso(l.unit_price)}</span>
                    <span className="text-gray-300">×</span>
                    <input type="number" min="1" value={l.qty} onChange={(e) => updateLine(i, 'qty', Math.max(1, Number(e.target.value) || 1))}
                      className="w-14 rounded border border-gray-300 px-1.5 py-1" />
                    <span className="text-gray-400 ml-1">Disc ₱</span>
                    <input type="number" min="0" value={l.discount} onChange={(e) => updateLine(i, 'discount', Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 rounded border border-gray-300 px-1.5 py-1" />
                    <span className="ml-auto font-semibold text-navy">{peso(Math.max(0, l.qty * l.unit_price - (Number(l.discount) || 0)))}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1 text-sm border-t border-gray-100 pt-2">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{peso(subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Discount</span><span>− {peso(discTotal)}</span></div>
            <div className="flex justify-between font-extrabold text-navy text-lg"><span>Total</span><span>{peso(total)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <Field label="Customer"><Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Optional" /></Field>
            <Field label="Payment">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
            </Field>
          </div>
          <Button variant="gold" className="w-full mt-3" disabled={busy || !cart.length} onClick={checkout}>
            {busy ? 'Processing…' : `Complete Sale · ${peso(total)}`}
          </Button>
        </Card>
      </div>
    </div>
  );
}

// ===========================================================================
// SALES — POS sales report
// ===========================================================================
function Receipt({ id, onClose }) {
  const [sale, setSale] = useState(null);
  useEffect(() => { api.get(`/store/sales/${id}`).then(setSale).catch(() => {}); }, [id]);
  return (
    <Modal title={`Sale #${id}`} onClose={onClose}>
      {!sale ? <Spinner /> : (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>{sale.store_name} · {fmtDateTime(sale.sold_at)}</span>
            <span>{PAYMENT_METHOD_LABEL[sale.payment_method] || sale.payment_method}</span>
          </div>
          {sale.customer_name && <div className="text-gray-600">Customer: <b>{sale.customer_name}</b></div>}
          <table className="w-full">
            <thead><tr className="text-left text-gray-400 text-xs border-b border-gray-100"><th className="py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {sale.items.map((it) => (
                <tr key={it.id} className="border-b border-gray-50">
                  <td className="py-1.5">{it.name}{it.discount > 0 && <span className="text-xs text-red-500"> (−{peso(it.discount)})</span>}</td>
                  <td className="text-right">{it.qty}</td>
                  <td className="text-right">{peso(it.unit_price)}</td>
                  <td className="text-right font-semibold">{peso(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1 border-t border-gray-100 pt-2">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{peso(sale.subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Discount</span><span>− {peso(sale.discount)}</span></div>
            <div className="flex justify-between font-extrabold text-navy"><span>Total</span><span>{peso(sale.total)}</span></div>
          </div>
          <div className="text-xs text-gray-400">Sold by {sale.sold_by_name || '—'}</div>
        </div>
      )}
    </Modal>
  );
}

function SalesReport({ stores, refreshKey }) {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ from: '', to: '', store_id: '' });
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v); });
    const [s, list] = await Promise.all([api.get('/store/sales/summary'), api.get(`/store/sales?${params}`)]);
    setSummary(s); setRows(list); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [f, refreshKey]);

  function exportCsv() {
    const headers = ['Date', 'Store', 'Customer', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment', 'Cashier'];
    const lines = rows.map((r) => [fmtDateTime(r.sold_at), r.store_name || '', r.customer_name || '', r.item_count, r.subtotal, r.discount, r.total, PAYMENT_METHOD_LABEL[r.payment_method] || r.payment_method, r.sold_by_name || '']);
    const csv = [headers, ...lines].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `efs-pos-sales-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner />;

  const Kpi = ({ label, value, sub, tone }) => (
    <div className={`rounded-2xl p-4 text-white bg-gradient-to-br ${tone}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      {sub && <div className="text-xs opacity-80 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Sales" value={peso(summary.total)} sub={`${summary.count} transaction${summary.count !== 1 ? 's' : ''}`} tone="from-navy to-navy-light" />
        <Kpi label="Sales Today" value={peso(summary.today)} sub={`${summary.todayCount} today`} tone="from-emerald-500 to-emerald-600" />
        <Kpi label="This Month" value={peso(summary.thisMonth)} tone="from-gold to-gold-dark" />
        <Kpi label="Avg Sale" value={peso(summary.count ? summary.total / summary.count : 0)} tone="from-violet-500 to-violet-600" />
      </div>

      {summary.byStore.length > 0 && (
        <Card className="p-4 mb-6">
          <h3 className="font-bold text-navy mb-2 text-sm">Sales by Store</h3>
          <div className="space-y-1">
            {summary.byStore.map((s) => (
              <div key={s.store || 'none'} className="flex justify-between text-sm border-b border-gray-50 py-1">
                <span className="text-gray-600">{s.store || '—'} <span className="text-gray-400">({s.count})</span></span>
                <span className="font-semibold text-navy">{peso(s.total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-navy">Transactions</h3>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>⬇ Export CSV</Button>
      </div>
      <Card className="p-4 mb-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">From</span><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">To</span><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Store</span>
            <Select value={f.store_id} onChange={(e) => setF({ ...f, store_id: e.target.value })}>
              <option value="">All stores</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select></label>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>{['Date', 'Store', 'Customer', 'Items', 'Discount', 'Total', 'Payment', 'Cashier', ''].map((h) => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-10">No sales yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-cloud">
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(r.sold_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.store_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{r.item_count}</td>
                  <td className="px-4 py-3 text-gray-500">{r.discount > 0 ? `− ${peso(r.discount)}` : '—'}</td>
                  <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">{peso(r.total)}</td>
                  <td className="px-4 py-3 text-gray-500">{PAYMENT_METHOD_LABEL[r.payment_method] || r.payment_method}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.sold_by_name || '—'}</td>
                  <td className="px-2 py-3 text-right"><button onClick={() => setReceipt(r.id)} className="text-xs text-navy hover:underline">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {receipt && <Receipt id={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

// ===========================================================================
// PRODUCT MANAGEMENT (stores + products)
// ===========================================================================
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
  async function toggleActive(s) { await api.put(`/stores/${s.id}`, { ...s, is_active: !s.is_active }); await onChanged(); }
  async function remove(id) { await api.del(`/stores/${id}`); await onChanged(); }

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

function ProductModal({ product, stores, onClose, onSaved }) {
  const editing = Boolean(product);
  const [form, setForm] = useState(() => ({
    sku: product?.sku || '', name: product?.name || '', category: product?.category || '',
    description: product?.description || '', uom: product?.uom || 'pcs', status: product?.status || 'active',
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
          <Field label="Unit of Measure"><Select value={form.uom} onChange={(e) => set('uom', e.target.value)}>{UOMS.map((u) => <option key={u} value={u}>{u}</option>)}</Select></Field>
          <Field label="Status"><Select value={form.status} onChange={(e) => set('status', e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
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

function Products({ products, stores, reload }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [showStores, setShowStores] = useState(false);
  const [addProduct, setAddProduct] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [delProduct, setDelProduct] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  async function confirmDelete() {
    setDelBusy(true);
    try { await api.del(`/store/products/${delProduct.id}`); setDelProduct(null); await reload(); }
    finally { setDelBusy(false); }
  }

  const activeStores = stores.filter((s) => s.is_active);
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const shown = products.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (status && (p.status || 'active') !== status) return false;
    if (q && !`${p.name} ${p.sku || ''} ${p.category || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="flex justify-end gap-2 flex-wrap mb-4">
        <Button variant="outline" onClick={() => setShowStores(true)}>🏬 Manage Stores</Button>
        <Button variant="gold" onClick={() => setAddProduct(true)}>+ Add Item</Button>
      </div>

      <Card className="p-4 mb-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Search</span><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, SKU, category…" /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Category</span>
            <Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Status</span>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></Select></label>
        </div>
      </Card>

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

      {showStores && <StoresModal stores={stores} onChanged={reload} onClose={() => setShowStores(false)} />}
      {addProduct && <ProductModal stores={stores} onClose={() => setAddProduct(false)} onSaved={reload} />}
      {editProduct && <ProductModal product={editProduct} stores={stores} onClose={() => setEditProduct(null)} onSaved={reload} />}
      {delProduct && (
        <ConfirmDialog title={`Delete ${delProduct.name}?`} message="This removes the item and its store prices. This cannot be undone."
          confirmLabel="Delete item" busy={delBusy} onConfirm={confirmDelete} onClose={() => setDelProduct(null)} />
      )}
    </div>
  );
}

// ===========================================================================
export default function Store() {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pos');
  const [salesKey, setSalesKey] = useState(0); // bump to refresh sales after a sale

  async function reload() {
    const [p, s] = await Promise.all([api.get('/store/products'), api.get('/stores')]);
    setProducts(p); setStores(s);
  }
  useEffect(() => { (async () => { setLoading(true); await reload(); setLoading(false); })(); }, []);

  if (loading) return <Spinner />;

  const TABS = [
    { key: 'pos', label: '🛒 POS' },
    { key: 'sales', label: '📊 Sales' },
  ];
  if (isAdmin) TABS.push({ key: 'products', label: '📦 Products' });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Point of Sale</h1>
          <p className="text-gray-500 text-sm">Ring sales, manage products & pricing across {stores.length} store{stores.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-cloud rounded-lg p-1 mb-6 w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition ${tab === t.key ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pos' && <POS stores={stores} products={products} onSold={() => setSalesKey((k) => k + 1)} />}
      {tab === 'sales' && <SalesReport stores={stores} refreshKey={salesKey} />}
      {tab === 'products' && isAdmin && <Products products={products} stores={stores} reload={reload} />}
    </div>
  );
}
