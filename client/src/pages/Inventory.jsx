import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { SIZES, INVENTORY_CATEGORIES, fmtDate } from '../constants';
import { Card, Spinner, Button, Modal, Field, Input, Select, ConfirmDialog } from '../components';

const canManageRoles = ['admin', 'purchasing'];

// ---- Add / edit item modal -------------------------------------------------
function ItemModal({ item, onClose, onSaved }) {
  const editing = Boolean(item);
  const [form, setForm] = useState(() => ({
    name: item?.name || '',
    category: item?.category || INVENTORY_CATEGORIES[0],
    tracks_size: item ? !!item.tracks_size : false,
    unit: item?.unit || 'pcs',
    low_stock_threshold: item?.low_stock_threshold ?? 10,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setBusy(true);
    try {
      if (editing) await api.put(`/inventory/items/${item.id}`, form);
      else await api.post('/inventory/items', form);
      onSaved(); onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={editing ? `Edit ${item.name}` : 'New Item'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <Field label="Item name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Dri-fit fabric (Navy)" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" required>
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Unit"><Input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="pcs, rolls, spools…" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Low-stock alert ≤"><Input type="number" min="0" value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" className="h-4 w-4 accent-navy" checked={form.tracks_size} onChange={(e) => set('tracks_size', e.target.checked)} />
            Track by size (XS–XXXL)
          </label>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button variant="gold" disabled={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

// ---- Log IN / OUT modal ----------------------------------------------------
function TxnModal({ type, items, projects, presetItemId, onClose, onSaved }) {
  const isOut = type === 'out';
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    item_id: presetItemId ? String(presetItemId) : '',
    size: '', qty: '', supplier: '', project_id: '', notes: '', txn_date: today,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const item = items.find((i) => String(i.id) === String(form.item_id));

  async function submit(e) {
    e.preventDefault();
    if (!form.item_id) { setError('Select an item'); return; }
    if (item?.tracks_size && !form.size) { setError('Select a size'); return; }
    if (!form.qty || Number(form.qty) <= 0) { setError('Enter a positive quantity'); return; }
    setBusy(true);
    try {
      await api.post('/inventory/txns', {
        item_id: Number(form.item_id), size: form.size || null, qty: Number(form.qty), type,
        supplier: isOut ? null : form.supplier, project_id: isOut && form.project_id ? Number(form.project_id) : null,
        notes: form.notes, txn_date: form.txn_date,
      });
      onSaved(); onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={isOut ? 'Log OUT — consume stock' : 'Log IN — receive stock'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <Field label="Item" required>
          <Select value={form.item_id} onChange={(e) => set('item_id', e.target.value)}>
            <option value="">— Select item —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.category})</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {item?.tracks_size && (
            <Field label="Size" required>
              <Select value={form.size} onChange={(e) => set('size', e.target.value)}>
                <option value="">— Size —</option>
                {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          )}
          <Field label={`Quantity${item ? ` (${item.unit})` : ''}`} required>
            <Input type="number" min="1" value={form.qty} onChange={(e) => set('qty', e.target.value)} />
          </Field>
        </div>
        {!isOut && <Field label="Supplier"><Input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="Where it came from" /></Field>}
        {isOut && (
          <Field label="For Job Order (optional)">
            <Select value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">— None —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.job_order_number}{p.project_name ? ` · ${p.project_name}` : ''}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={form.txn_date} onChange={(e) => set('txn_date', e.target.value)} /></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button variant="gold" disabled={busy}>{busy ? 'Saving…' : (isOut ? 'Log OUT' : 'Log IN')}</Button></div>
      </form>
    </Modal>
  );
}

const TYPE_BADGE = { in: 'bg-emerald-100 text-emerald-700', out: 'bg-orange-100 text-orange-700' };

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Inventory() {
  const { user } = useAuth();
  const canManage = canManageRoles.includes(user.role);
  const [items, setItems] = useState([]);
  const [txns, setTxns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('');             // summary category filter
  const [modal, setModal] = useState(null);        // 'in' | 'out' | 'item'
  const [editItem, setEditItem] = useState(null);
  const [delItem, setDelItem] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [tf, setTf] = useState({ from: '', to: '', item_id: '', type: '', category: '' });

  async function loadCore() {
    const [s, pr] = await Promise.all([api.get('/inventory/summary'), api.get('/projects')]);
    setItems(s); setProjects(pr);
  }
  async function loadTxns() {
    const params = new URLSearchParams();
    Object.entries(tf).forEach(([k, v]) => { if (v) params.set(k, v); });
    setTxns(await api.get(`/inventory/txns?${params}`));
  }
  async function loadAll() { setLoading(true); await loadCore(); await loadTxns(); setLoading(false); }
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadTxns(); /* eslint-disable-next-line */ }, [tf]);
  function refresh() { loadCore(); loadTxns(); }

  async function confirmDelete() {
    setDelBusy(true);
    try { await api.del(`/inventory/items/${delItem.id}`); setDelItem(null); refresh(); }
    finally { setDelBusy(false); }
  }

  const today = new Date().toISOString().slice(0, 10);
  function exportSummaryCsv() {
    const headers = ['Item', 'Category', 'Unit', ...SIZES, 'Total', 'Low-stock threshold'];
    const rows = items.map((it) => [
      it.name, it.category, it.unit,
      ...SIZES.map((s) => (it.tracks_size ? (it.sizes[s] || 0) : '')),
      it.total, it.low_stock_threshold,
    ]);
    downloadCsv(`efs-inventory-${today}.csv`, [headers, ...rows]);
  }
  function exportTxnsCsv() {
    const headers = ['Date', 'Type', 'Item', 'Category', 'Size', 'Qty', 'Supplier', 'Job Order', 'Notes', 'Recorded By'];
    const rows = txns.map((t) => [
      t.txn_date || '', t.type.toUpperCase(), t.item_name, t.category, t.size || '',
      (t.type === 'in' ? '+' : '-') + t.qty, t.supplier || '', t.job_order_number || '', t.notes || '', t.recorded_by_name || '',
    ]);
    downloadCsv(`efs-inventory-transactions-${today}.csv`, [headers, ...rows]);
  }

  if (loading) return <Spinner />;

  const shown = cat ? items.filter((i) => i.category === cat) : items;
  const cellCls = (stock, threshold) => (stock <= threshold ? 'text-red-600 font-bold' : 'text-gray-800');

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Inventory</h1>
          <p className="text-gray-500 text-sm">Stock on hand · {items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap print:hidden">
          <Button variant="outline" onClick={exportSummaryCsv} disabled={!items.length}>⬇ Export CSV</Button>
          <Button variant="outline" onClick={() => window.print()}>🖨️ Print / PDF</Button>
          <Button variant="outline" onClick={() => setModal('in')}>⬇ Log IN</Button>
          <Button variant="outline" onClick={() => setModal('out')}>⬆ Log OUT</Button>
          {canManage && <Button variant="gold" onClick={() => setModal('item')}>+ New Item</Button>}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-4 print:hidden">
        {['', ...INVENTORY_CATEGORIES].map((c) => (
          <button key={c || 'all'} onClick={() => setCat(c)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${cat === c ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-300 hover:border-navy'}`}>
            {c || 'All'}
          </button>
        ))}
      </div>

      {/* Summary table */}
      <Card className="overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Item</th>
                <th className="px-3 py-3 font-semibold">Category</th>
                {SIZES.map((s) => <th key={s} className="px-2 py-3 font-semibold text-center">{s}</th>)}
                <th className="px-3 py-3 font-semibold text-center">Total</th>
                {canManage && <th className="px-2 py-3 print:hidden" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.length === 0 && <tr><td colSpan={SIZES.length + 4} className="text-center text-gray-400 py-10">No items{cat ? ' in this category' : ''}.</td></tr>}
              {shown.map((it) => (
                <tr key={it.id} className="hover:bg-cloud">
                  <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">{it.name}<span className="text-gray-400 font-normal text-xs"> · {it.unit}</span></td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{it.category}</td>
                  {SIZES.map((s) => (
                    <td key={s} className="px-2 py-3 text-center">
                      {it.tracks_size ? <span className={cellCls(it.sizes[s] || 0, it.low_stock_threshold)}>{it.sizes[s] || 0}</span> : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className={`px-3 py-3 text-center font-bold ${it.total <= it.low_stock_threshold ? 'text-red-600' : 'text-navy'}`}>{it.total}</td>
                  {canManage && (
                    <td className="px-2 py-3 whitespace-nowrap text-right print:hidden">
                      <button onClick={() => setEditItem(it)} className="text-xs text-navy hover:underline">✏️</button>
                      <button onClick={() => setDelItem(it)} className="text-xs text-red-600 hover:underline ml-2">🗑</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">Cells in <span className="text-red-600 font-semibold">red</span> are at/below the item's low-stock threshold.</div>
      </Card>

      {/* Transaction history */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-navy">Transaction History</h2>
        <Button variant="outline" onClick={exportTxnsCsv} disabled={!txns.length} className="print:hidden">⬇ Export CSV</Button>
      </div>
      <Card className="p-4 mb-3 print:hidden">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">From</span><Input type="date" value={tf.from} onChange={(e) => setTf({ ...tf, from: e.target.value })} /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">To</span><Input type="date" value={tf.to} onChange={(e) => setTf({ ...tf, to: e.target.value })} /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Item</span>
            <Select value={tf.item_id} onChange={(e) => setTf({ ...tf, item_id: e.target.value })}>
              <option value="">All items</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Type</span>
            <Select value={tf.type} onChange={(e) => setTf({ ...tf, type: e.target.value })}>
              <option value="">All</option><option value="in">IN</option><option value="out">OUT</option>
            </Select></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Category</span>
            <Select value={tf.category} onChange={(e) => setTf({ ...tf, category: e.target.value })}>
              <option value="">All categories</option>
              {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select></label>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>{['Date', 'Type', 'Item', 'Size', 'Qty', 'Supplier / Job Order', 'Recorded By'].map((h) => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}{canManage && <th className="print:hidden" />}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {txns.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-10">No transactions match your filters.</td></tr>}
              {txns.map((t) => (
                <tr key={t.id} className="hover:bg-cloud">
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(t.txn_date)}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TYPE_BADGE[t.type]}`}>{t.type.toUpperCase()}</span></td>
                  <td className="px-4 py-3">{t.item_name}<span className="text-gray-400 text-xs"> · {t.category}</span></td>
                  <td className="px-4 py-3">{t.size || '—'}</td>
                  <td className={`px-4 py-3 font-semibold ${t.type === 'in' ? 'text-emerald-700' : 'text-orange-700'}`}>{t.type === 'in' ? '+' : '−'}{t.qty}</td>
                  <td className="px-4 py-3 text-gray-600">{t.type === 'in' ? (t.supplier || '—') : (t.job_order_number || '—')}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.recorded_by_name || '—'}</td>
                  {canManage && <td className="px-2 py-3 text-right print:hidden"><button onClick={async () => { await api.del(`/inventory/txns/${t.id}`); refresh(); }} className="text-xs text-red-600 hover:underline">🗑</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {modal === 'in' && <TxnModal type="in" items={items} projects={projects} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === 'out' && <TxnModal type="out" items={items} projects={projects} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === 'item' && <ItemModal onClose={() => setModal(null)} onSaved={refresh} />}
      {editItem && <ItemModal item={editItem} onClose={() => setEditItem(null)} onSaved={refresh} />}
      {delItem && (
        <ConfirmDialog title={`Delete ${delItem.name}?`} message="This removes the item and all its stock transactions. This cannot be undone."
          confirmLabel="Delete item" busy={delBusy} onConfirm={confirmDelete} onClose={() => setDelItem(null)} />
      )}
    </div>
  );
}
