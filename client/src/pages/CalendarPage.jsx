import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { STAGES, STAGE_MAP, fmtDate } from '../constants';
import { Card, Spinner, Button, StageBadge, CategoryBadge, DaysLeft } from '../components';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CLOSED = new Set(['delivered', 'paid']);

export default function CalendarPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [view, setView] = useState('calendar'); // 'calendar' | 'list'
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/projects').then((p) => { setProjects(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Group projects by their target date (YYYY-MM-DD).
  const byDate = useMemo(() => {
    const map = {};
    projects.forEach((p) => {
      if (!p.target_date) return;
      const key = String(p.target_date).slice(0, 10);
      (map[key] = map[key] || []).push(p);
    });
    return map;
  }, [projects]);

  // Build the month grid (leading blanks + days + trailing blanks).
  const cells = useMemo(() => {
    const startDow = new Date(cursor.y, cursor.m, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < startDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  // All projects ordered by target date (for the list view).
  const sorted = useMemo(
    () => [...projects].sort((a, b) => String(a.target_date || '').localeCompare(String(b.target_date || ''))),
    [projects]
  );

  const dateStr = (d) => `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayStr = new Date().toISOString().slice(0, 10);

  const prev = () => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const next = () => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); };

  // Count of projects with target dates in the visible month.
  const monthCount = useMemo(
    () => projects.filter((p) => String(p.target_date || '').slice(0, 7) === `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`).length,
    [projects, cursor]
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy">Calendar</h1>
          <p className="text-gray-500 text-sm">Job orders by target date — {monthCount} due this month</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {view === 'calendar' && (
            <>
              <Button variant="outline" onClick={prev} className="px-3">←</Button>
              <Button variant="outline" onClick={goToday}>Today</Button>
              <Button variant="outline" onClick={next} className="px-3">→</Button>
            </>
          )}
          <div className="flex gap-1 bg-cloud rounded-lg p-1">
            {[['calendar', '📅 Calendar'], ['list', '☰ List']].map(([k, lbl]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                  view === k ? 'bg-navy text-white' : 'text-gray-500 hover:text-navy'}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'list' ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left">
                <tr>
                  {['Target Date', 'Days Left', 'Job Order', 'Customer', 'Category', 'Qty', 'Stage'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-10">No projects.</td></tr>
                )}
                {sorted.map((p) => (
                  <tr key={p.id} className="hover:bg-cloud cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{fmtDate(p.target_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><DaysLeft targetDate={p.target_date} /></td>
                    <td className="px-4 py-3 font-bold text-navy whitespace-nowrap">{p.job_order_number}</td>
                    <td className="px-4 py-3">{p.customer_company || p.customer_name}</td>
                    <td className="px-4 py-3"><CategoryBadge category={p.category} /></td>
                    <td className="px-4 py-3">{p.quantity}</td>
                    <td className="px-4 py-3"><StageBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
      <>
      <h2 className="text-lg font-bold text-navy mb-3">{MONTHS[cursor.m]} {cursor.y}</h2>

      <Card className="p-2 sm:p-3 overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 mb-1">
            {DOW.map((d) => (
              <div key={d} className="text-xs font-bold text-gray-400 uppercase text-center py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="bg-gray-50/60 rounded-md min-h-[96px]" />;
              const key = dateStr(d);
              const items = byDate[key] || [];
              const isToday = key === todayStr;
              return (
                <div key={i} className={`rounded-md min-h-[96px] p-1 border ${isToday ? 'border-gold bg-gold/5' : 'border-gray-100 bg-white'}`}>
                  <div className={`text-xs font-semibold mb-1 px-0.5 ${isToday ? 'text-gold-dark' : 'text-gray-500'}`}>{d}</div>
                  <div className="space-y-0.5">
                    {items.map((p) => {
                      const s = STAGE_MAP[p.status];
                      const overdue = key < todayStr && !CLOSED.has(p.status);
                      return (
                        <button
                          key={p.id}
                          onClick={() => navigate(`/projects/${p.id}`)}
                          title={`${p.job_order_number} · ${p.customer_company || p.customer_name} · ${s?.label || p.status}`}
                          className={`w-full text-left text-[11px] leading-tight px-1 py-0.5 rounded border truncate ${s?.color || 'bg-gray-100 text-gray-600 border-gray-200'} ${overdue ? 'ring-1 ring-red-400' : ''}`}
                        >
                          {s?.emoji} {p.job_order_number.replace(/^EFS-\d{4}-/, '#')} · {p.customer_company || p.customer_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Stage legend */}
      <div className="mt-4 flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <span key={s.key} className={`text-[11px] px-2 py-0.5 rounded-full border ${s.color}`}>{s.emoji} {s.label}</span>
        ))}
      </div>
      </>
      )}
    </div>
  );
}
