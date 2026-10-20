import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { peso, fmtDate, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '../constants';
import { Card, Spinner, Button, Input, Select, Empty, ConfirmDialog } from '../components';
import { useAuth } from '../auth';
import PaymentModal from '../PaymentModal';

const custName = (r) => r.customer_company || r.customer_name || '—';

// --- Client-side column sorting -------------------------------------------
const PAY_STATUS_ORDER = { unpaid: 0, partial: 1, paid: 2 };

// Per-project balances table — label → sort value accessor.
const PROJECT_COLS = [
  { label: 'Job Order #', key: 'job_order_number', val: (p) => (p.job_order_number || '').toLowerCase() },
  { label: 'Customer', key: 'customer', val: (p) => custName(p).toLowerCase() },
  { label: 'Total Amount', key: 'total_amount', num: true, val: (p) => Number(p.total_amount) || 0 },
  { label: 'Total Paid', key: 'total_paid', num: true, val: (p) => Number(p.total_paid) || 0 },
  { label: 'Balance', key: 'balance', num: true, val: (p) => Number(p.balance) || 0 },
  { label: 'Status', key: 'status', val: (p) => PAY_STATUS_ORDER[p.payment_status] ?? 0 },
  { label: '', key: null },
];

// Transaction history table.
const TXN_COLS = [
  { label: 'Date', key: 'paid_on', val: (t) => t.paid_on || '' },
  { label: 'Job Order', key: 'job_order_number', val: (t) => (t.job_order_number || '').toLowerCase() },
  { label: 'Customer', key: 'customer', val: (t) => custName(t).toLowerCase() },
  { label: 'Method', key: 'method', val: (t) => (PAYMENT_METHOD_LABEL[t.method] || t.method || '').toLowerCase() },
  { label: 'Reference #', key: 'reference', val: (t) => (t.reference || '').toLowerCase() },
  { label: 'File', key: 'file', val: (t) => (t.file_url ? 1 : 0) },
  { label: 'Amount', key: 'amount', num: true, val: (t) => Number(t.amount) || 0 },
  { label: 'Recorded By', key: 'recorded_by', val: (t) => (t.recorded_by_name || '').toLowerCase() },
];

function useSort(rows, cols) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key);
    if (!sort.key || !col) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.val(a), bv = col.val(b);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [rows, sort, cols]);
  const toggle = (col) => {
    if (!col.key) return;
    setSort((s) => (s.key === col.key
      ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key: col.key, dir: col.num ? 'desc' : 'asc' }));
  };
  return { sorted, sort, toggle };
}

// A clickable, sortable header cell for the navy table headers.
function SortTh({ col, sort, onSort }) {
  if (!col.key) return <th className="px-4 py-3 font-semibold whitespace-nowrap" />;
  const active = sort.key === col.key;
  return (
    <th onClick={() => onSort(col)} title="Click to sort"
        className="px-4 py-3 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-white/10">
      <span className="inline-flex items-center gap-1">
        {col.label}
        <span className={active ? 'text-gold' : 'text-white/30'}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
    </th>
  );
}

const STATUS_BADGE = {
  unpaid: { label: '🔴 Unpaid', cls: 'bg-red-100 text-red-700' },
  partial: { label: '🟡 Partial', cls: 'bg-yellow-100 text-yellow-800' },
  paid: { label: '🟢 Fully Paid', cls: 'bg-green-100 text-green-700' },
};
function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.unpaid;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

function Stat({ label, value, tone = 'light' }) {
  const tones = {
    navy: 'bg-navy text-white',
    green: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    red: 'bg-red-50 text-red-700 border border-red-200',
    light: 'bg-white border border-gray-200 text-navy',
  };
  return (
    <div className={`rounded-xl p-5 ${tones[tone]}`}>
      <div className="text-2xl md:text-3xl font-extrabold">{value}</div>
      <div className="text-sm font-medium opacity-90 mt-1">{label}</div>
    </div>
  );
}

export default function Payments() {
  const { user } = useAuth();
  const canManage = ['admin', 'finance'].includes(user.role);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payProject, setPayProject] = useState(null);
  const [editPayment, setEditPayment] = useState(null);
  const [delPayment, setDelPayment] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [filters, setFilters] = useState({ from: '', to: '', method: '', project_id: '', status: '' });

  async function confirmDelete() {
    setDelBusy(true);
    try { await api.del(`/payments/${delPayment.id}`); setDelPayment(null); refresh(); }
    finally { setDelBusy(false); }
  }

  async function loadCore() {
    const [s, pr] = await Promise.all([api.get('/payments/summary'), api.get('/payments/projects')]);
    setSummary(s); setProjects(pr);
  }
  async function loadTxns() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    setTxns(await api.get(`/payments?${params}`));
  }
  async function loadAll() { setLoading(true); await loadCore(); await loadTxns(); setLoading(false); }
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadTxns(); /* eslint-disable-next-line */ }, [filters]);

  function refresh() { loadCore(); loadTxns(); }
  function setF(k, v) { setFilters((f) => ({ ...f, [k]: v })); }

  const txnTotal = txns.reduce((a, t) => a + (t.amount || 0), 0);

  const projSort = useSort(projects, PROJECT_COLS);
  const txnSort = useSort(txns, TXN_COLS);

  function exportCsv() {
    const headers = ['Date', 'Job Order', 'Customer', 'Method', 'Reference', 'File Link', 'Amount', 'Recorded By'];
    const lines = txns.map((t) => [
      t.paid_on || '', t.job_order_number || '', custName(t),
      PAYMENT_METHOD_LABEL[t.method] || t.method, t.reference || '', t.file_url || '', t.amount, t.recorded_by_name || '',
    ]);
    const csv = [headers, ...lines].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `efs-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-navy">Payments</h1>
        <p className="text-gray-500 text-sm">Collections across confirmed job orders</p>
      </div>

      {/* 1. Sales overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Stat label="Total Sales (confirmed)" value={peso(summary.totalSales)} tone="navy" />
        <Stat label="Total Collected" value={peso(summary.totalCollected)} tone="green" />
        <Stat label="Total Outstanding" value={peso(summary.totalOutstanding)} tone="red" />
        <Stat label="🟢 Fully Paid" value={summary.fullyPaid} tone="light" />
        <Stat label="🟡 Partially Paid" value={summary.partiallyPaid} tone="light" />
        <Stat label="🔴 Unpaid" value={summary.unpaid} tone="light" />
      </div>

      {/* 2. Per-project payment status */}
      <h2 className="text-lg font-bold text-navy mb-3">Per-Project Balances</h2>
      <Card className="overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                {PROJECT_COLS.map((c, i) => (
                  <SortTh key={c.key || `col${i}`} col={c} sort={projSort.sort} onSort={projSort.toggle} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-10">No confirmed projects yet.</td></tr>}
              {projSort.sorted.map((p) => (
                <tr key={p.id} className="hover:bg-cloud">
                  <td className="px-4 py-3 font-bold text-navy whitespace-nowrap">
                    <Link to={`/projects/${p.id}`} className="hover:underline">{p.job_order_number}</Link>
                  </td>
                  <td className="px-4 py-3">{custName(p)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{peso(p.total_amount)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-emerald-700">{peso(p.total_paid)}</td>
                  <td className={`px-4 py-3 whitespace-nowrap font-semibold ${p.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>{peso(p.balance)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.payment_status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {p.payment_status !== 'paid' && (
                      <button onClick={() => setPayProject(p)} className="text-xs font-semibold text-navy hover:underline">+ Add Payment</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 3. Transaction history */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-navy">Transaction History</h2>
        <Button variant="outline" onClick={exportCsv} disabled={!txns.length}>⬇ Export CSV</Button>
      </div>
      <Card className="p-4 mb-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">From</span>
            <Input type="date" value={filters.from} onChange={(e) => setF('from', e.target.value)} /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">To</span>
            <Input type="date" value={filters.to} onChange={(e) => setF('to', e.target.value)} /></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Method</span>
            <Select value={filters.method} onChange={(e) => setF('method', e.target.value)}>
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Project</span>
            <Select value={filters.project_id} onChange={(e) => setF('project_id', e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.job_order_number}</option>)}
            </Select></label>
          <label className="block"><span className="block text-xs font-semibold text-gray-500 mb-1">Status</span>
            <Select value={filters.status} onChange={(e) => setF('status', e.target.value)}>
              <option value="">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Fully Paid</option>
            </Select></label>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                {TXN_COLS.map((c) => (
                  <SortTh key={c.key} col={c} sort={txnSort.sort} onSort={txnSort.toggle} />
                ))}
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {txns.length === 0 && <tr><td colSpan={canManage ? 9 : 8} className="text-center text-gray-400 py-10">No payments match your filters.</td></tr>}
              {txnSort.sorted.map((t) => (
                <tr key={t.id} className="hover:bg-cloud">
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(t.paid_on)}</td>
                  <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">
                    <Link to={`/projects/${t.project_id}`} className="hover:underline">{t.job_order_number}</Link>
                  </td>
                  <td className="px-4 py-3">{custName(t)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{PAYMENT_METHOD_LABEL[t.method] || t.method}</td>
                  <td className="px-4 py-3 text-gray-500">{t.reference || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{t.file_url ? <a href={t.file_url} target="_blank" rel="noopener noreferrer" className="text-navy hover:underline">📎 View</a> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-semibold text-emerald-700">{peso(t.amount)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.recorded_by_name || '—'}</td>
                  {canManage && (
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button onClick={() => setEditPayment(t)} className="text-xs text-navy hover:underline">Edit</button>
                      <button onClick={() => setDelPayment(t)} className="text-xs text-red-600 hover:underline ml-2">Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {txns.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-bold text-navy">
                  <td className="px-4 py-3" colSpan={6}>Total ({txns.length} payment{txns.length !== 1 ? 's' : ''})</td>
                  <td className="px-4 py-3 whitespace-nowrap">{peso(txnTotal)}</td>
                  <td />
                  {canManage && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {payProject && (
        <PaymentModal project={payProject} onClose={() => setPayProject(null)} onSaved={refresh} />
      )}
      {editPayment && (
        <PaymentModal
          project={{ id: editPayment.project_id, job_order_number: editPayment.job_order_number }}
          payment={editPayment}
          onClose={() => setEditPayment(null)}
          onSaved={refresh}
        />
      )}
      {delPayment && (
        <ConfirmDialog
          title="Delete this payment?"
          message={`${peso(delPayment.amount)} · ${delPayment.job_order_number} · ${fmtDate(delPayment.paid_on)}. This cannot be undone.`}
          confirmLabel="Delete payment" busy={delBusy}
          onConfirm={confirmDelete} onClose={() => setDelPayment(null)}
        />
      )}
    </div>
  );
}
