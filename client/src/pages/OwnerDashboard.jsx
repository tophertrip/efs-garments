import { useEffect, useState } from 'react';
import { api } from '../api';
import { peso } from '../constants';
import { useCategories } from '../categories';
import { Card, Spinner } from '../components';

const PIE_COLORS = ['#1B2A4A', '#F5A623', '#6366f1', '#10b981', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#a855f7', '#ef4444'];

function Kpi({ label, value, tone = 'light' }) {
  const tones = {
    navy: 'bg-navy text-white',
    gold: 'bg-gold text-navy',
    indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    green: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    yellow: 'bg-yellow-50 text-yellow-800 border border-yellow-200',
    light: 'bg-white border border-gray-200 text-navy',
  };
  return (
    <div className={`rounded-xl p-5 ${tones[tone]}`}>
      <div className="text-2xl md:text-3xl font-extrabold">{value}</div>
      <div className="text-sm font-medium opacity-90 mt-1">{label}</div>
    </div>
  );
}

// A simple 12-column monthly bar chart (no chart library).
function MonthlyBars({ data, valueKey, format, barClass, currentMonth }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  return (
    <div>
      <div className="flex items-end gap-1 sm:gap-2 h-44">
        {data.map((d) => {
          const v = d[valueKey] || 0;
          const h = Math.round((v / max) * 100);
          const isCur = d.month === currentMonth;
          return (
            <div key={d.month} className="flex-1 min-w-0 h-full flex items-end">
              <div
                className={`w-full rounded-t ${barClass} ${isCur ? 'ring-2 ring-gold ring-offset-1' : ''}`}
                style={{ height: `${v ? Math.max(h, 2) : 0}%` }}
                title={`${d.label}: ${format(v)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 sm:gap-2 mt-1">
        {data.map((d) => (
          <div key={d.month} className="flex-1 min-w-0 text-center text-[10px] text-gray-400">{d.label}</div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <Card className="p-5">
      <h2 className="font-bold text-navy mb-4">{title}</h2>
      {children}
    </Card>
  );
}

// Pie chart via CSS conic-gradient (no chart library).
function CategoryPie({ data, format }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <p className="text-gray-400 text-sm">No data yet.</p>;
  let acc = 0;
  const stops = data.map((d) => {
    const start = (acc / total) * 100;
    acc += d.value;
    const end = (acc / total) * 100;
    return `${d.color} ${start}% ${end}%`;
  }).join(', ');
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="rounded-full shrink-0" style={{ width: 176, height: 176, background: `conic-gradient(${stops})` }} />
      <div className="space-y-1.5 flex-1 min-w-[200px]">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="text-gray-700">{d.label}</span>
            <span className="text-gray-500 ml-auto whitespace-nowrap">{format(d.value)} · {Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const { label: catLabel } = useCategories();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/owner-dashboard').then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data) return <div className="text-gray-400 py-12 text-center">Could not load owner dashboard.</div>;

  const { summary, monthly, year } = data;
  const currentMonth = new Date().getMonth() + 1;
  const num = (n) => Number(n || 0).toLocaleString();
  const pieData = (data.byCategory || []).map((c, i) => ({
    label: catLabel(c.category), value: c.sales, color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-navy">Owners Dashboard</h1>
        <p className="text-gray-500 text-sm">Executive overview for {year}</p>
      </div>

      {/* Year / Month totals */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Kpi label="Total Collected (Paid)" value={peso(summary.totalCollected)} tone="green" />
        <Kpi label="Outstanding Balance" value={peso(summary.outstanding)} tone="yellow" />
        <Kpi label={`Total Projects (${year})`} value={num(summary.projectsYear)} tone="light" />
        <Kpi label="Total Projects (This Month)" value={num(summary.projectsMonth)} tone="light" />
        <Kpi label={`Total Pieces (${year})`} value={num(summary.piecesYear)} tone="indigo" />
        <Kpi label="Total Pieces (This Month)" value={num(summary.piecesMonth)} tone="indigo" />
      </div>

      {/* Monthly graphs */}
      <div className="grid grid-cols-1 gap-6">
        <ChartCard title={`Monthly Sales — ${year}`}>
          <MonthlyBars data={monthly} valueKey="sales" format={peso} barClass="bg-gradient-to-t from-navy to-navy-light" currentMonth={currentMonth} />
        </ChartCard>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title={`Monthly Projects — ${year}`}>
            <MonthlyBars data={monthly} valueKey="projects" format={num} barClass="bg-gold" currentMonth={currentMonth} />
          </ChartCard>
          <ChartCard title={`Monthly Pieces — ${year}`}>
            <MonthlyBars data={monthly} valueKey="pieces" format={num} barClass="bg-indigo-400" currentMonth={currentMonth} />
          </ChartCard>
        </div>
        <ChartCard title={`Sales by Product Category — ${year}`}>
          <CategoryPie data={pieData} format={peso} />
        </ChartCard>
      </div>
    </div>
  );
}
