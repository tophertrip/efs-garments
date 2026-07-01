import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_COLORS, PAYMENT_METHODS, PAYMENT_METHOD_LABEL, peso, fmtDate } from '../constants';
import { Card, Spinner, Button, Modal, Field, Input, Textarea, Select, ConfirmDialog } from '../components';

const manageRoles = ['admin', 'finance'];

// ---- KPI card --------------------------------------------------------------
const TONES = {
  red: 'from-red-500 to-red-600', orange: 'from-orange-400 to-orange-500',
  green: 'from-emerald-500 to-emerald-600', navy: 'from-navy to-navy-light',
};
function Kpi({ label, value, sub, tone = 'navy' }) {
  return (
    <div className={`rounded-2xl p-4 text-white bg-gradient-to-br ${TONES[tone]}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      {sub && <div className="text-xs opacity-80 mt-0.5">{sub}</div>}
    </div>
  );
}

// ---- Category pie (CSS conic-gradient) -------------------------------------
function CategoryPie({ data }) {
  const total = data.reduce((a, d) => a + d.total, 0);
  if (!total) return <p className="text-gray-400 text-sm py-8 text-center">No expenses yet.</p>;
  let acc = 0;
  const stops = data.map((d) => {
    const start = (acc / total) * 100; acc += d.total; const end = (acc / total) * 100;
    return `${EXPENSE_CATEGORY_COLORS[d.category] || '#A3A3A3'} ${start}% ${end}%`;
  }).join(', ');
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="rounded-full shrink-0" style={{ width: 168, height: 168, background: `conic-gradient(${stops})` }} />
      <div className="space-y-1.5 flex-1 min-w-[220px]">
        {data.map((d) => (
          <div key={d.category} className="flex items-center gap-2 text-sm">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: EXPENSE_CATEGORY_COLORS[d.category] || '#A3A3A3' }} />
            <span className="text-gray-700">{d.category}</span>
            <span className="text-gray-500 ml-auto whitespace-nowrap">{peso(d.total)} · {Math.round((d.total / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Monthly trend bars ----------------------------------------------------
function MonthlyBars({ data }) {
  if (!data.length) return <p className="text-gray-400 text-sm py-8 text-center">No monthly data yet.</p>;
  const max = Math.max(...data.map((d) => d.total), 1);
  const fmtM = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
  return (
    <div className="flex items-end justify-between gap-3 h-48 pt-4">
      {data.map((d) => (
        <div key={d.month} className="flex-1 flex flex-col items-center justify-end h-full">
          <div className="text-[11px] font-semibold text-navy mb-1">{peso(d.total).replace('.00', '')}</div>
          <div className="w-full max-w-[54px] rounded-t-lg bg-gradient-to-t from-red-500 to-orange-400" style={{ height: `${(d.total / max) * 100}%`, minHeight: 4 }} />
          <div className="text-[11px] text-gray-500 mt-1">{fmtM(d.month)}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Add / edit expense modal (Expenses Input) -----------------------------
function ExpenseModal({ expense, projects, onClose, onSaved }) {
  const editing = Boolean(expense);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    category: expense?.category || EXPENSE_CATEGORIES[0],
    description: expense?.description || '',
    amount: expense?.amount ?? '',
    vendor: expense?.vendor || '',
    method: expense?.method || 'cash',
    project_id: expense?.project_id ? String(expense.project_id) : '',
    spent_on: expense?.spent_on || today,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.category) { setError('Category is required'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a positive amount'); return; }
    setBusy(true);
    try {
      const body = { ...form, amount: Number(form.amount), project_id: form.project_id ? Number(form.project_id) : null };
      if (editing) await api.put(`/expenses/${expense.id}`, body);
      else await api.post('/expenses', body);
      onSaved(); onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={editing ? 'Edit Expense' : 'Add Expense'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" required>
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Amount (₱)" required>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What was this for?" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vendor / Paid to"><Input value={form.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="Supplier, staff, biller…" /></Field>
          <Field label="Payment method">
            <Select value={form.method} onChange={(e) => set('method', e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={form.spent_on} onChange={(e) => set('spent_on', e.target.value)} /></Field>
          <Field label="For Job Order (optional)">
            <Select value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">— None —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.job_order_number}{p.project_name ? ` · ${p.project_name}` : ''}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button variant="gold" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</Button></div>
      </form>
    </Modal>
  );
}

export default function Finance() {
  const { user } = useAuth();
  const canManage = manageRoles.includes(user.role);
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ from: '', to: '', category: '', method: '' });
  const [modal, setModal] = useState(false);
  const [editExp, setEditExp] = useState(null);
  const [delExp, setDelExp] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  async function loadCore() {
    const [s, pr] = await Promise.all([api.get('/expenses/summary'), api.get('/projects')]);
    setSummary(s); setProjects(pr);
  }
  async function loadRows() {
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v); });
    setRows(await api.get(`/expenses?${params}`));
  }
  async function loadAll() { setLoading(true); await loadCore(); await loadRows(); setLoading(false); }
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadRows(); /* eslint-disable-next-line */ }, [f]);
  function refresh() { loadCore(); loadRows(); }

  async function confirmDelete() {
    setDelBusy(true);
    try { await api.del(`/expenses/${delExp.id}`); setDelExp(null); refresh(); }
    finally { setDelBusy(false); }
  }

  function exportCsv() {
    const headers = ['Date', 'Category', 'Description', 'Vendor', 'Method', 'Job Order', 'Amount', 'Recorded By'];
    const lines = rows.map((r) => [
      r.spent_on || '', r.category, r.description || '', r.vendor || '',
      PAYMENT_METHOD_LABEL[r.method] || r.method, r.job_order_number || '', r.amount, r.recorded_by_name || '',
    ]);
    const csv = [headers, ...lines].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `efs-expenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner />;

  const filteredTotal = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Finance</h1>
          <p className="text-gray-500 text-sm">Expenses, categorized spending, and cash-flow summary</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>⬇ Export CSV</Button>
          <Button variant="outline" onClick={() => window.print()}>🖨️ Print / PDF</Button>
          {canManage && <Button variant="gold" onClick={() => setModal(true)}>+ Add Expense</Button>}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Expenses" value={peso(summary.total)} sub={`${summary.count} transaction${summary.count !== 1 ? 's' : ''}`} tone="red" />
        <Kpi label="Expenses This Month" value={peso(summary.thisMonth)} tone="orange" />
        <Kpi label="Income Collected" value={peso(summary.income)} sub="from payments" tone="green" />
        <Kpi label="Net Cash Flow" value={peso(summary.net)} sub={summary.net >= 0 ? 'profit' : 'loss'} tone={summary.net >= 0 ? 'green' : 'red'} />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-5">
          <h2 className="font-bold text-navy mb-4">Expenses by Category</h2>
          <CategoryPie data={summary.byCategory} />
        </Card>
        <Card className="p-5">
          <h2 className="font-bold text-navy mb-2">Monthly Spending</h2>
          <MonthlyBars data={summary.byMonth} />
        </Card>
      </div>

      {/* Category breakdown table */}
      <Card className="overflow-hidden mb-8">
        <h2 className="font-bold text-navy px-4 py-3 border-b border-gray-100">Category Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cloud text-left">
              <tr>{['Category', 'Transactions', 'Total', 'Share'].map((h) => <th key={h} className="px-4 py-2.5 font-semibold text-navy">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.byCategory.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-8">No expenses recorded yet.</td></tr>}
              {summary.byCategory.map((c) => (
                <tr key={c.category} className="hover:bg-cloud">
                  <td className="px-4 py-2.5"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-2" style={{ background: EXPENSE_CATEGORY_COLORS[c.category] || '#A3A3A3' }} />{c.category}</td>
                  <td className="px-4 py-2.5 text-gray-600">{c.count}</td>
                  <td className="px-4 py-2.5 font-semibold text-navy">{peso(c.total)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{summary.total ? Math.round((c.total / summary.total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
            {summary.byCategory.length > 0 && (
              <tfoot><tr className="border-t-2 border-gray-200 font-bold text-navy"><td className="px-4 py-2.5">Total</td><td className="px-4 py-2.5">{summary.count}</td><td className="px-4 py-2.5">{peso(summary.total)}</td><td className="px-4 py-2.5">100%</td></tr></tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Expense list + filters */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-navy">Expenses</h2>
        <span className="text-sm text-gray-500">Showing {rows.length} · {peso(filteredTotal)}</span>
      </div>
      <Card className="p-4 mb-3 print:hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">From</span><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">To</span><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Category</span>
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Method</span>
            <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select></label>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>{['Date', 'Category', 'Description', 'Vendor', 'Method', 'Job Order', 'Amount'].map((h) => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}{canManage && <th className="print:hidden" />}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-10">No expenses match your filters.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-cloud">
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.spent_on)}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-2" style={{ background: EXPENSE_CATEGORY_COLORS[r.category] || '#A3A3A3' }} />{r.category}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[240px] truncate" title={r.description || ''}>{r.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.vendor || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{PAYMENT_METHOD_LABEL[r.method] || r.method}</td>
                  <td className="px-4 py-3 text-gray-500">{r.job_order_number || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-red-600 whitespace-nowrap">{peso(r.amount)}</td>
                  {canManage && (
                    <td className="px-2 py-3 whitespace-nowrap text-right print:hidden">
                      <button onClick={() => setEditExp(r)} className="text-xs text-navy hover:underline">✏️</button>
                      <button onClick={() => setDelExp(r)} className="text-xs text-red-600 hover:underline ml-2">🗑</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && <ExpenseModal projects={projects} onClose={() => setModal(false)} onSaved={refresh} />}
      {editExp && <ExpenseModal expense={editExp} projects={projects} onClose={() => setEditExp(null)} onSaved={refresh} />}
      {delExp && (
        <ConfirmDialog title="Delete this expense?" message={`${delExp.category} · ${peso(delExp.amount)} on ${fmtDate(delExp.spent_on)}. This cannot be undone.`}
          confirmLabel="Delete expense" busy={delBusy} onConfirm={confirmDelete} onClose={() => setDelExp(null)} />
      )}
    </div>
  );
}
