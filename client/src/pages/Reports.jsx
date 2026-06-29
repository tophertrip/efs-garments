import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { STAGE_MAP, peso } from '../constants';
import { useCategories } from '../categories';
import { Card, Spinner, Button, Select } from '../components';

const GROUP_OPTIONS = [
  { key: 'month', label: 'By Month' },
  { key: 'week', label: 'By Week' },
  { key: 'year', label: 'By Year' },
  { key: 'category', label: 'By Product Category' },
  { key: 'customer', label: 'By Company' },
  { key: 'status', label: 'By Stage / Status' },
  { key: 'priority', label: 'By Priority' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Turn a raw group key into a friendly label depending on the grouping.
// `catLabel` resolves dynamic product-category names.
function labelFor(groupBy, key, catLabel) {
  if (key === '—' || key == null) return 'Unspecified';
  switch (groupBy) {
    case 'month': {
      const [y, m] = key.split('-');
      return `${MONTHS[Number(m) - 1] || m} ${y}`;
    }
    case 'week': {
      const [y, w] = key.split('-W');
      return `Week ${Number(w)}, ${y}`;
    }
    case 'category': return catLabel ? catLabel(key) : key;
    case 'status': return STAGE_MAP[key]?.label || key;
    case 'priority': return key.charAt(0).toUpperCase() + key.slice(1);
    default: return key;
  }
}

function Kpi({ label, value, tone = 'navy' }) {
  const tones = {
    navy: 'bg-navy text-white',
    gold: 'bg-gold text-navy',
    light: 'bg-white border border-gray-200 text-navy',
  };
  return (
    <div className={`rounded-xl p-5 ${tones[tone]}`}>
      <div className="text-2xl md:text-3xl font-extrabold">{value}</div>
      <div className="text-sm font-medium opacity-90 mt-1">{label}</div>
    </div>
  );
}

export default function Reports() {
  const { label: catLabel } = useCategories();
  const [opts, setOpts] = useState({ groupBy: 'month', dateField: 'created', from: '', to: '', status: 'all' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('revenue'); // which measure the bars show

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(opts).forEach(([k, v]) => { if (v) params.set(k, v); });
    const d = await api.get(`/reports?${params}`);
    setData(d);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [opts]);

  function set(k, v) { setOpts((o) => ({ ...o, [k]: v })); }

  const rows = data?.rows || [];
  const maxMetric = useMemo(() => Math.max(1, ...rows.map((r) => r[metric] || 0)), [rows, metric]);
  const totalRevenue = data?.summary?.revenue || 0;

  function exportCsv() {
    const headers = ['Group', 'Orders', 'Units', 'Revenue'];
    const lines = rows.map((r) => [labelFor(opts.groupBy, r.key, catLabel), r.orders, r.units, r.revenue]);
    const csv = [headers, ...lines]
      .map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `efs-report-${opts.groupBy}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const groupTitle = GROUP_OPTIONS.find((g) => g.key === opts.groupBy)?.label || '';

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Reports</h1>
          <p className="text-gray-500 text-sm">Sales & production analytics across job orders</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>⬇ Export CSV</Button>
      </div>

      {/* Controls */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Group by</span>
            <Select value={opts.groupBy} onChange={(e) => set('groupBy', e.target.value)}>
              {GROUP_OPTIONS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Date basis</span>
            <Select value={opts.dateField} onChange={(e) => set('dateField', e.target.value)}>
              <option value="created">Order date</option>
              <option value="target">Target date</option>
            </Select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">From</span>
            <input type="date" value={opts.from} onChange={(e) => set('from', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/60" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">To</span>
            <input type="date" value={opts.to} onChange={(e) => set('to', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/60" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Status</span>
            <Select value={opts.status} onChange={(e) => set('status', e.target.value)}>
              <option value="all">All orders</option>
              <option value="active">Active only</option>
              <option value="delivered">Delivered only</option>
              <option value="for_payment">For Payment only</option>
              <option value="paid">Paid only</option>
            </Select>
          </label>
        </div>
        {(opts.from || opts.to || opts.status !== 'all') && (
          <button onClick={() => setOpts((o) => ({ ...o, from: '', to: '', status: 'all' }))}
            className="text-xs text-gray-500 hover:text-navy mt-3">✕ Clear filters</button>
        )}
      </Card>

      {loading ? <Spinner /> : (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Orders" value={data.summary.orders} tone="navy" />
            <Kpi label="Total Units" value={Number(data.summary.units).toLocaleString()} tone="light" />
            <Kpi label="Total Revenue" value={peso(data.summary.revenue)} tone="gold" />
            <Kpi label="Avg Order Value" value={peso(data.summary.avgOrderValue)} tone="light" />
          </div>

          {/* Breakdown */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-bold text-navy">{groupTitle}</h2>
              <div className="flex gap-1 bg-cloud rounded-lg p-1">
                {[['revenue', 'Revenue'], ['orders', 'Orders'], ['units', 'Units']].map(([k, lbl]) => (
                  <button key={k} onClick={() => setMetric(k)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      metric === k ? 'bg-navy text-white' : 'text-gray-500 hover:text-navy'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">No data for the selected filters.</p>
            ) : (
              <>
                {/* Bar chart */}
                <div className="space-y-2 mb-6">
                  {rows.map((r) => {
                    const val = r[metric] || 0;
                    const pct = Math.round((val / maxMetric) * 100);
                    const display = metric === 'revenue' ? peso(val) : Number(val).toLocaleString();
                    return (
                      <div key={r.key} className="flex items-center gap-3">
                        <div className="w-32 shrink-0 text-xs text-gray-600 text-right truncate" title={labelFor(opts.groupBy, r.key, catLabel)}>
                          {labelFor(opts.groupBy, r.key, catLabel)}
                        </div>
                        <div className="flex-1 bg-cloud rounded-md h-7 relative overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-navy to-navy-light rounded-md transition-all"
                            style={{ width: `${Math.max(pct, 2)}%` }} />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-700">
                            {display}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Detail table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="py-2 font-semibold">{groupTitle.replace('By ', '')}</th>
                        <th className="py-2 font-semibold text-right">Orders</th>
                        <th className="py-2 font-semibold text-right">Units</th>
                        <th className="py-2 font-semibold text-right">Revenue</th>
                        <th className="py-2 font-semibold text-right">% Rev</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((r) => (
                        <tr key={r.key} className="hover:bg-cloud">
                          <td className="py-2 font-medium text-gray-800">{labelFor(opts.groupBy, r.key, catLabel)}</td>
                          <td className="py-2 text-right">{r.orders}</td>
                          <td className="py-2 text-right">{Number(r.units).toLocaleString()}</td>
                          <td className="py-2 text-right font-semibold text-navy">{peso(r.revenue)}</td>
                          <td className="py-2 text-right text-gray-500">
                            {totalRevenue ? Math.round((r.revenue / totalRevenue) * 100) : 0}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 font-bold text-navy">
                        <td className="py-2">Total</td>
                        <td className="py-2 text-right">{data.summary.orders}</td>
                        <td className="py-2 text-right">{Number(data.summary.units).toLocaleString()}</td>
                        <td className="py-2 text-right">{peso(data.summary.revenue)}</td>
                        <td className="py-2 text-right">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
