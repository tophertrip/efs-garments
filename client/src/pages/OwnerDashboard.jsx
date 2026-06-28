import { useEffect, useState } from 'react';
import { api } from '../api';
import { peso } from '../constants';
import { Card, Spinner } from '../components';

function Kpi({ label, value, tone = 'light' }) {
  const tones = {
    navy: 'bg-navy text-white',
    gold: 'bg-gold text-navy',
    indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    green: 'bg-green-50 text-green-700 border border-green-200',
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

export default function OwnerDashboard() {
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-navy">Owners Dashboard</h1>
        <p className="text-gray-500 text-sm">Executive overview for {year}</p>
      </div>

      {/* Year / Month totals */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Kpi label={`Total Sales (${year})`} value={peso(summary.salesYear)} tone="navy" />
        <Kpi label="Total Sales (This Month)" value={peso(summary.salesMonth)} tone="gold" />
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
      </div>
    </div>
  );
}
