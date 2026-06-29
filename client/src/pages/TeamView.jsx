import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { STAGE_MAP, nextStageKey, fmtDate } from '../constants';
import { Card, Spinner, Button, CategoryBadge, PriorityBadge, DaysLeft, Empty } from '../components';

// Stages each role is responsible for, in pipeline order.
const ROLE_STAGES = {
  marketing: ['inquiry', 'quotation', 'confirmed', 'ready', 'delivered'],
  graphic_artist: ['layout_pattern'],
  purchasing: ['purchasing'],
  printing: ['printing'],
  cutting_sewing: ['cutting_sewing'],
  qa: ['qa'],
  finance: ['delivered', 'paid'], // Finance handles Delivered → For Payment
};

export default function TeamView() {
  const { user } = useAuth();
  const stageKeys = ROLE_STAGES[user.role] || [];
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);

  async function load() {
    setLoading(true);
    const [p, t] = await Promise.all([
      api.get('/projects'),
      api.get(`/tasks?assigned_to=${user.id}&done=0`),
    ]);
    setProjects(p);
    setTasks(t);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function advance(p) {
    setWorking(p.id);
    try {
      await api.put(`/projects/${p.id}/status`, {});
      await load();
    } finally { setWorking(null); }
  }

  async function markTaskDone(t) {
    await api.put(`/tasks/${t.id}/done`, { is_done: 1 });
    load();
  }

  if (loading) return <Spinner />;

  const stageLabels = stageKeys.map((k) => `${STAGE_MAP[k]?.emoji} ${STAGE_MAP[k]?.label}`).join(' & ');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-navy">Hi {user.name.split(' ')[0]} 👋</h1>
        <p className="text-gray-500 text-sm">
          You handle <b>{stageLabels}</b>. Here's what needs your attention.
        </p>
      </div>

      {/* One section per stage this role owns */}
      {stageKeys.map((sk) => {
        const stage = STAGE_MAP[sk];
        const next = nextStageKey(sk);
        const items = projects.filter((p) => p.status === sk);
        return (
          <div key={sk} className="mb-8">
            <h2 className="text-lg font-bold text-navy mb-3">
              {stage?.emoji} In {stage?.label} <span className="text-gray-400 font-normal">({items.length})</span>
            </h2>
            {items.length === 0 ? (
              <Card className="p-8"><Empty>Nothing here right now. 🎉</Empty></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((p) => (
                  <Card key={p.id} className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <Link to={`/projects/${p.id}`} className="font-bold text-navy hover:underline">{p.job_order_number}</Link>
                      <PriorityBadge priority={p.priority} />
                    </div>
                    <div className="text-sm font-semibold text-gray-800">{p.customer_company || p.customer_name}</div>
                    <div className="text-sm text-gray-600 mt-1">{p.description}</div>
                    <div className="flex items-center gap-3 mt-3 text-sm">
                      <CategoryBadge category={p.category} />
                      <span className="text-gray-500">Qty {p.quantity}</span>
                    </div>
                    <div className="flex items-center justify-between mt-3 text-sm">
                      <span className="text-gray-500">🎯 {fmtDate(p.target_date)}</span>
                      <DaysLeft targetDate={p.target_date} />
                    </div>
                    <Button
                      variant="gold"
                      className="w-full mt-4"
                      onClick={() => advance(p)}
                      disabled={working === p.id}
                    >
                      {working === p.id ? 'Updating…' : next ? `✓ Done → ${STAGE_MAP[next].label}` : '✓ Mark complete'}
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* My tasks */}
      <h2 className="text-lg font-bold text-navy mb-3">
        🔔 My Tasks <span className="text-gray-400 font-normal">({tasks.length})</span>
      </h2>
      {tasks.length === 0 ? (
        <Card className="p-8"><Empty>No open tasks assigned to you.</Empty></Card>
      ) : (
        <Card className="divide-y divide-gray-100">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-3 p-4">
              <input type="checkbox" onChange={() => markTaskDone(t)} className="mt-1 h-5 w-5 accent-navy" />
              <div className="flex-1">
                <div className="font-medium text-gray-800">{t.title}</div>
                {t.description && <div className="text-sm text-gray-500">{t.description}</div>}
                <div className="text-xs text-gray-400 mt-1">
                  {t.job_order_number && <Link to={`/projects/${t.project_id}`} className="text-navy hover:underline">{t.job_order_number}</Link>}
                  {t.due_date ? ` · due ${fmtDate(t.due_date)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
